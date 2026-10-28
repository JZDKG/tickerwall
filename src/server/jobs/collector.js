/* ================================================================== *
 * 采集调度器（B6）
 *
 * 单体内为报价、新闻、日历、日频指标与解释重建各建一个独立任务：
 *
 *   · **同一任务键只允许一个进行中请求** —— 并发轮询不该重复打上游；
 *   · 失败按来源**退避**，其他来源继续运行（一个源挂掉不等于全部停摆）；
 *   · 成功采集后按 `triggers` 触发受影响资产重算（例如日频指标到位后重建解释）；
 *   · 每个任务都记录最后成功时间、错误与退避，供 /api/health 与解释卡读取；
 *   · 没有浏览器访问时也照常运行（不依赖前端轮询）。
 *
 * 状态读写通过可注入的 store 完成，默认落到 SQLite 的 collection_state 表：
 * 这样单测不需要起数据库，生产也不会因为内存重启丢掉退避信息。
 * ================================================================== */

import {
  recordCollectionSuccess,
  recordCollectionFailure,
  readCollectionState,
  listCollectionStates,
} from '../db/index.js';

/** 默认状态存储：SQLite collection_state */
export const dbStateStore = {
  success: (key, at) => recordCollectionSuccess(key, at),
  failure: (key, error, opts) => recordCollectionFailure(key, error, opts),
  read: (key) => readCollectionState(key),
  list: () => listCollectionStates(),
};

/** 指数退避：base × 2^(fails-1)，上限 max */
export function backoffFor(fails, { baseMs = 60_000, maxMs = 30 * 60_000 } = {}) {
  const n = Math.max(1, Number(fails) || 1);
  return Math.min(maxMs, baseMs * 2 ** (n - 1));
}

/**
 * @param {{jobs:Array<object>, store?:object, now?:()=>number, onError?:Function, log?:Function}} opts
 */
export function createCollector(opts = {}) {
  const jobs = new Map((opts.jobs ?? []).map((j) => [j.key, j]));
  const store = opts.store ?? dbStateStore;
  const now = opts.now ?? (() => Date.now());
  const onError = opts.onError ?? (() => {});
  const log = opts.log ?? (() => {});

  /** 进行中的任务：key → Promise。这是「同键合并」的实现位置 */
  const inflight = new Map();
  /** 每个任务的下次可执行时间（内存层，配合数据库里的退避） */
  const nextDueAt = new Map();
  const lastResult = new Map();

  function setNextDue(key, at) {
    nextDueAt.set(key, at);
  }

  function dueAt(jobKey) {
    const inMemory = nextDueAt.get(jobKey) ?? 0;
    const persisted = store.read?.(jobKey) ?? null;
    const backoffUntil = Number(persisted?.backoffUntil ?? 0) || 0;
    return Math.max(inMemory, backoffUntil);
  }

  /**
   * 跑一个任务。
   * 返回 { key, status: 'ok' | 'failed' | 'skipped' | 'inflight', error? }
   */
  async function runJob(key, { force = false } = {}) {
    const job = jobs.get(key);
    if (!job) return { key, status: 'skipped', error: 'UNKNOWN_JOB' };
    if (job.enabled === false) return { key, status: 'skipped', error: 'DISABLED' };

    if (inflight.has(key)) {
      // 同键已在跑：直接复用进行中的那次，绝不重复打上游
      const result = await inflight.get(key);
      return { ...result, status: result.status === 'ok' ? 'ok' : result.status, merged: true };
    }

    const t = now();
    if (!force && t < dueAt(key)) {
      return { key, status: 'skipped', error: 'BACKOFF' };
    }

    const promise = (async () => {
      try {
        await job.run({ now: now() });
        store.success?.(key, now());
        const interval = Number(job.intervalMs ?? 60_000);
        setNextDue(key, now() + interval);
        const result = { key, status: 'ok', at: now() };
        lastResult.set(key, result);
        log(`[collector] ${key} 成功`);
        // 成功之后把依赖它的任务提前到「现在可跑」
        for (const dep of job.triggers ?? []) setNextDue(dep, 0);
        return result;
      } catch (err) {
        const message = String(err?.message ?? err);
        const prev = store.read?.(key) ?? null;
        const fails = (Number(prev?.fails) ?? 0) + 1;
        const wait = backoffFor(fails, {
          baseMs: job.backoffBaseMs ?? 60_000,
          maxMs: job.maxBackoffMs ?? 30 * 60_000,
        });
        store.failure?.(key, message, { atMs: now(), backoffUntil: now() + wait });
        setNextDue(key, now() + wait);
        const result = { key, status: 'failed', error: message, backoffMs: wait, at: now() };
        lastResult.set(key, result);
        onError(key, err);
        return result;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  /** 跑一轮：所有到期的任务并发执行，单个失败不影响其他 */
  async function tick({ force = false } = {}) {
    const keys = [...jobs.keys()];
    const results = await Promise.all(keys.map((k) => runJob(k, { force })));
    return results;
  }

  function status() {
    const rows = [];
    for (const [key, job] of jobs) {
      const persisted = store.read?.(key) ?? null;
      rows.push({
        key,
        enabled: job.enabled !== false,
        intervalMs: job.intervalMs ?? null,
        nextDueAt: dueAt(key) || null,
        inflight: inflight.has(key),
        lastSuccessAt: persisted?.lastSuccessAt ?? null,
        fails: persisted?.fails ?? 0,
        lastError: persisted?.lastError ?? null,
        backoffUntil: persisted?.backoffUntil ?? null,
        lastResult: lastResult.get(key) ?? null,
      });
    }
    return rows;
  }

  return { runJob, tick, status, jobs };
}

/**
 * 启动周期性采集。返回 stop()。
 *
 * 用单一 setInterval 逐任务判断是否到期，而不是每个任务各起一个定时器：
 * 后者在「任务变多 + 退避」时很难统一观察，也不方便在测试里推进。
 */
export function startCollector({ jobs, store, now, onError, log, everyMs = 15_000 } = {}) {
  const collector = createCollector({ jobs, store, now, onError, log });
  // 启动即跑一轮：进程刚起来时不该等一个周期才有数据
  void collector.tick();
  const timer = setInterval(() => {
    void collector.tick();
  }, Math.max(1000, everyMs));
  timer.unref?.();
  return { collector, stop: () => clearInterval(timer) };
}
