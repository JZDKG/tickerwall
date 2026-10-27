/* ================================================================== *
 * 指标快照（SQLite）
 *
 * 每 5 分钟把当轮报价落一行，供「隔夜复盘」做差与事后回溯。
 * 节流在调用方（server.mjs 的 SNAPSHOT_MIN_GAP_MS），这里只负责读写。
 * ================================================================== */

import { getDb, kvGetJson, kvSetJson } from './sqlite.js';

/** 单次快照最多取多少个时间刻度（足够覆盖数日） */
export const SNAPSHOT_READ_LIMIT = 4000;

/** 相邻刻度的锚点窗口：取最近 N 个刻度的中位数当参照，单条脏数据掰不动它 */
export const SNAPSHOT_ANCHOR_WINDOW = 6;

/**
 * 跳变两次确认的待定价位
 *
 * 为什么需要它：库里现有的最新刻度可能本身就是脏值（例如 sina:int_nikkei
 * 停更后写进去的僵尸价）。如果只做「相对上一刻度跳变超阈值就拒写」，等真实
 * 行情回来时反而会被当成 +40% 的脏数据永远拒之门外 —— 脏锚点死锁。
 * 这里改成「连续两次都指向同一新价位才算真换挡」：跳变第一次挂起、第二次确认。
 *
 * 状态必须持久化（落 kv 表），不能只放内存：getQuotes 每个进程只落一条刻度，
 * 纯内存状态会在重启后清零，导致每次都算「第一次」而永不确认 —— 护栏上线后
 * 首次遇到换挡就永久少几个标的。落 kv 后跨进程一致。
 */
const PENDING_KEY = (id) => `snapshot:pending:${id}`;

/** 仅供测试：清空待定状态 */
export function resetSnapshotGuard() {
  try {
    const db = getDb();
    db.exec("DELETE FROM kv WHERE k LIKE 'snapshot:pending:%'");
  } catch {
    /* 无库时忽略 */
  }
}

/** 取中位数（空数组返回 null） */
function median(nums) {
  const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = arr.length >> 1;
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/** 每个标的最近 N 个刻度的中位价（锚点） */
function anchors(window = SNAPSHOT_ANCHOR_WINDOW, excludeAt = null) {
  try {
    const db = getDb();
    const ats = db
      .prepare('SELECT DISTINCT at FROM snapshots WHERE at <> ? ORDER BY at DESC LIMIT ?')
      .all(excludeAt ?? '', window)
      .map((r) => r.at);
    if (!ats.length) return new Map();
    const marks = ats.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, price FROM snapshots WHERE at IN (${marks})`).all(...ats);
    const byId = new Map();
    for (const r of rows) {
      if (!byId.has(r.id)) byId.set(r.id, []);
      byId.get(r.id).push(r.price);
    }
    const out = new Map();
    for (const [id, prices] of byId) out.set(id, median(prices));
    return out;
  } catch {
    return new Map();
  }
}

/**
 * 落一份快照。同一次调用共用同一个 at（主键是 at + id），
 * 所以整批要么一起进、要么一起回滚。
 * @param {Array<{ id, name, price, changePct, ok }>} quotes
 * @returns {Promise<number>} 写入行数
 */
export async function takeSnapshot(
  quotes,
  { at = new Date().toISOString(), maxJumpPct = 10, maxJumpPctById = null, onSkip = null } = {},
) {
  try {
    const candidates = (quotes ?? [])
      .filter((q) => q && q.ok && q.price > 0)
      .map((q) => ({ id: q.id, name: q.name, price: Number(q.price), changePct: q.changePct ?? null }));
    if (!candidates.length) return 0;

    // 跳变护栏：与「最近 N 刻度中位数」比较，超阈值先挂起、连续两次才认。
    // 阈值可由调用方按品种传入（db/ 不认识业务标的，策略交给上层）。
    const anchor = anchors(SNAPSHOT_ANCHOR_WINDOW, at);
    const rows = [];
    for (const c of candidates) {
      const base = anchor.get(c.id);
      const limit = Number(maxJumpPctById?.[c.id] ?? maxJumpPct);
      const jumped = base != null && base > 0 && Math.abs(c.price - base) / base > limit / 100;

      if (jumped) {
        const pend = kvGetJson(PENDING_KEY(c.id));
        const sameRegime = pend?.price > 0 && Math.abs(c.price - pend.price) / pend.price <= limit / 100;
        if (!sameRegime) {
          // 第一次看到这个突变：挂起，不写库（避免把僵尸价/跨源错位写进去）
          kvSetJson(PENDING_KEY(c.id), { price: c.price, at });
          onSkip?.({ id: c.id, price: c.price, anchor: base, reason: 'jump-pending' });
          continue;
        }
        // 连续第二次都停在新价位 → 认定真的换挡，放行
        kvSetJson(PENDING_KEY(c.id), null);
        onSkip?.({ id: c.id, price: c.price, anchor: base, reason: 'regime-confirmed' });
      } else {
        kvSetJson(PENDING_KEY(c.id), null);
      }
      rows.push(c);
    }
    if (!rows.length) return 0;
    const db = getDb();
    const ins = db.prepare(
      'INSERT OR REPLACE INTO snapshots (at, id, name, price, change_pct) VALUES (?, ?, ?, ?, ?)',
    );
    db.exec('BEGIN');
    try {
      for (const r of rows) ins.run(at, r.id, r.name ?? null, r.price, r.changePct);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return rows.length;
  } catch (err) {
    console.error('快照写入失败:', err?.message ?? err);
    return 0;
  }
}

/**
 * 按时间刻度把快照读回来。
 * @returns {Promise<Array<{ at: string, quotes: Array<{id,name,price,changePct}> }>>} 按 at 升序
 */
export async function readSnapshots({ limit = SNAPSHOT_READ_LIMIT } = {}) {
  try {
    const db = getDb();
    // 只取最近 limit 个时间刻度
    const ats = db.prepare('SELECT DISTINCT at FROM snapshots ORDER BY at DESC LIMIT ?').all(limit).map((r) => r.at);
    if (!ats.length) return [];
    const marks = ats.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT at, id, name, price, change_pct FROM snapshots WHERE at IN (${marks}) ORDER BY at ASC`)
      .all(...ats);
    const byAt = new Map();
    for (const r of rows) {
      if (!byAt.has(r.at)) byAt.set(r.at, []);
      byAt.get(r.at).push({ id: r.id, name: r.name, price: r.price, changePct: r.change_pct });
    }
    return [...byAt.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([at, quotes]) => ({ at, quotes }));
  } catch (err) {
    console.warn(`[sqlite] 读取快照失败：${err?.message ?? err}`);
    return [];
  }
}

/** 快照总行数（调试/测试用） */
export function snapshotCount() {
  try {
    return getDb().prepare('SELECT COUNT(*) AS n FROM snapshots').get().n;
  } catch {
    return 0;
  }
}
