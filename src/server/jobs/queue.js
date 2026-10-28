/* ================================================================== *
 * 可恢复任务队列（方案 E06 / §7.2）
 *
 * 定位很清楚：**只收「值得重启后接着做」的任务**。
 *
 *   进队列：历史回补、批量解释重算 —— 一次几十秒到几分钟，进程被杀就白做。
 *   不进队列：15 秒一次的报价轮询 —— 重启后抓最新一轮即可，补跑过期轮询
 *             只会用旧数据覆盖新数据。
 *
 * 三个必须做对的细节（都是踩过的坑）：
 *   1. **去重键**：同一个解释重建请求触发三次，只该排一个任务。
 *   2. **租约**：任务被某次运行领走后带 lease_until；进程在那之前被杀，
 *      下次启动 `sweepExpiredLeases()` 把它放回 pending —— 否则任务会卡在
 *      running 永远不动，而日志上什么都看不出来。
 *   3. **终态**：超过 max_attempts 进 dead，不再重试，但保留行与最后错误，
 *      便于人看「这东西放弃了」。
 *
 * 这里**不声明**「只执行一次」：任何带重试的队列都只能做到「至少一次 +
 * 幂等」。执行结果用 dedupe_key 与 result 落库，靠调用方幂等。
 * ================================================================== */

import { getDb } from '../db/sqlite.js';

/** @typedef {'pending'|'running'|'done'|'dead'} JobStatus */

const nowMs = (now) => (typeof now === 'function' ? now() : Number(now ?? Date.now()));

function rowToJob(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    taskKey: row.task_key,
    dedupeKey: row.dedupe_key,
    payload: row.payload ? safeParse(row.payload) : null,
    status: row.status,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    leaseUntil: row.lease_until == null ? null : Number(row.lease_until),
    nextAttemptAt: Number(row.next_attempt_at),
    lastError: row.last_error,
    result: row.result ? safeParse(row.result) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
  };
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * 入队。
 *
 * 去重语义：同一个 dedupeKey 已经存在 pending / running 的行时**不新增**，
 * 返回 {enqueued:false, job}。已经 done 的行不挡新的入队 —— 「再算一遍」是
 * 合法需求，只是同一时刻只排一个。
 *
 * @param {{taskKey:string, dedupeKey:string, payload?:any, maxAttempts?:number, nextAttemptAt?:number, now?:Function}} input
 */
export function enqueue({ taskKey, dedupeKey, payload = null, maxAttempts = 5, nextAttemptAt = 0, now } = {}) {
  if (!taskKey || !dedupeKey) throw new Error('enqueue 需要 taskKey 与 dedupeKey');
  const db = getDb();
  const t = nowMs(now);
  const existing = db.prepare('SELECT * FROM collection_jobs WHERE dedupe_key = ?').get(dedupeKey);
  if (existing && (existing.status === 'pending' || existing.status === 'running')) {
    return { enqueued: false, job: rowToJob(existing) };
  }
  if (existing) {
    // done / dead 的行：复用同一行，重置为可执行（不新增行，避免表无限增长）
    db.prepare(
      `UPDATE collection_jobs
       SET task_key = ?, payload = ?, status = 'pending', attempts = 0, max_attempts = ?,
           lease_until = NULL, next_attempt_at = ?, last_error = NULL, result = NULL,
           updated_at = ?, finished_at = NULL
       WHERE id = ?`,
    ).run(taskKey, payload == null ? null : JSON.stringify(payload), Number(maxAttempts), Number(nextAttemptAt), t, existing.id);
    return { enqueued: true, job: rowToJob(db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(existing.id)) };
  }
  const info = db
    .prepare(
      `INSERT INTO collection_jobs
        (task_key, dedupe_key, payload, status, attempts, max_attempts, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
    )
    .run(taskKey, dedupeKey, payload == null ? null : JSON.stringify(payload), Number(maxAttempts), Number(nextAttemptAt), t, t);
  return { enqueued: true, job: rowToJob(db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(Number(info.lastInsertRowid))) };
}

/**
 * 领取下一个可执行的任务（原子）。
 *
 * 用 `UPDATE ... WHERE status='pending'` + `changes` 判抢占，避免两个并发
 * 领取拿到同一行。
 *
 * @param {{leaseMs?:number, now?:Function}} [opts]
 */
export function claimNext({ leaseMs = 60_000, now } = {}) {
  const db = getDb();
  const t = nowMs(now);
  const candidate = db
    .prepare(
      `SELECT * FROM collection_jobs
       WHERE status = 'pending' AND next_attempt_at <= ?
       ORDER BY next_attempt_at ASC, id ASC
       LIMIT 1`,
    )
    .get(t);
  if (!candidate) return null;

  const info = db
    .prepare(
      `UPDATE collection_jobs
       SET status = 'running', attempts = attempts + 1, lease_until = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .run(t + Number(leaseMs), t, candidate.id);
  if (Number(info.changes) !== 1) return null; // 被别人抢走
  return rowToJob(db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(candidate.id));
}

/** 标记成功 */
export function complete(id, result = null, { now } = {}) {
  const db = getDb();
  const t = nowMs(now);
  const info = db
    .prepare(
      `UPDATE collection_jobs
       SET status = 'done', result = ?, last_error = NULL, lease_until = NULL, updated_at = ?, finished_at = ?
       WHERE id = ? AND status = 'running'`,
    )
    .run(result == null ? null : JSON.stringify(result), t, t, Number(id));
  return Number(info.changes) === 1;
}

/**
 * 标记失败：未达上限则退避重试，达到上限进 dead。
 * @param {{backoffMs?:number, now?:Function}} [opts]
 */
export function fail(id, error, { backoffMs = 30_000, now } = {}) {
  const db = getDb();
  const t = nowMs(now);
  const row = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(Number(id));
  if (!row || row.status !== 'running') return { requeued: false, dead: false };
  const attempts = Number(row.attempts);
  const maxAttempts = Number(row.max_attempts);
  const message = String(error?.message ?? error ?? 'unknown');

  if (attempts >= maxAttempts) {
    db.prepare(
      `UPDATE collection_jobs
       SET status = 'dead', last_error = ?, lease_until = NULL, updated_at = ?, finished_at = ?
       WHERE id = ?`,
    ).run(message, t, t, Number(id));
    return { requeued: false, dead: true, attempts };
  }

  db.prepare(
    `UPDATE collection_jobs
     SET status = 'pending', last_error = ?, lease_until = NULL, next_attempt_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(message, t + Number(backoffMs), t, Number(id));
  return { requeued: true, dead: false, attempts, nextAttemptAt: t + Number(backoffMs) };
}

/**
 * 回收过期租约（进程被杀后重启时调用）。
 *
 * 返回被放回 pending 的行数。**必须在启动时调用一次**：不调用的话，上次
 * 崩在 running 的任务会永远停在那里。
 */
export function sweepExpiredLeases({ now } = {}) {
  const db = getDb();
  const t = nowMs(now);
  const info = db
    .prepare(
      `UPDATE collection_jobs
       SET status = 'pending', lease_until = NULL, next_attempt_at = 0, updated_at = ?
       WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until <= ?`,
    )
    .run(t, t);
  return Number(info.changes ?? 0);
}

/** 队列概览（/api/health 用） */
export function queueStats() {
  const db = getDb();
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM collection_jobs GROUP BY status').all();
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  const oldestPending = db
    .prepare("SELECT MIN(created_at) AS at FROM collection_jobs WHERE status = 'pending'")
    .get();
  return {
    pending: byStatus.pending ?? 0,
    running: byStatus.running ?? 0,
    done: byStatus.done ?? 0,
    dead: byStatus.dead ?? 0,
    oldestPendingAt: oldestPending?.at == null ? null : Number(oldestPending.at),
  };
}

/** 列出任务（诊断：默认只看未完成） */
export function listJobs({ status = null, limit = 50 } = {}) {
  const db = getDb();
  const rows = status
    ? db.prepare('SELECT * FROM collection_jobs WHERE status = ? ORDER BY id ASC LIMIT ?').all(status, Number(limit))
    : db.prepare("SELECT * FROM collection_jobs WHERE status IN ('pending','running') ORDER BY id ASC LIMIT ?").all(Number(limit));
  return rows.map(rowToJob);
}

/**
 * 跑一轮：领取并执行一个任务。
 *
 * @param {{run:(job:object)=>Promise<any>, leaseMs?:number, backoffMs?:number, now?:Function}} opts
 */
export async function runOne({ run, leaseMs, backoffMs, now } = {}) {
  const job = claimNext({ leaseMs, now });
  if (!job) return null;
  try {
    const result = await run(job);
    complete(job.id, result ?? null, { now });
    return { ...job, status: 'done', result: result ?? null };
  } catch (err) {
    const outcome = fail(job.id, err, { backoffMs, now });
    return { ...job, status: outcome.dead ? 'dead' : 'pending', error: String(err?.message ?? err) };
  }
}
