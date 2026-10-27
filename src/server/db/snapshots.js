/* ================================================================== *
 * 指标快照（SQLite）
 *
 * 每 5 分钟把当轮报价落一行，供「隔夜复盘」做差与事后回溯。
 * 节流在调用方（server.mjs 的 SNAPSHOT_MIN_GAP_MS），这里只负责读写。
 * ================================================================== */

import { getDb } from './sqlite.js';

/** 单次快照最多取多少个时间刻度（足够覆盖数日） */
export const SNAPSHOT_READ_LIMIT = 4000;

/**
 * 落一份快照。同一次调用共用同一个 at（主键是 at + id），
 * 所以整批要么一起进、要么一起回滚。
 * @param {Array<{ id, name, price, changePct, ok }>} quotes
 * @returns {Promise<number>} 写入行数
 */
export async function takeSnapshot(quotes, { at = new Date().toISOString() } = {}) {
  try {
    const rows = (quotes ?? [])
      .filter((q) => q && q.ok && q.price > 0)
      .map((q) => ({ id: q.id, name: q.name, price: q.price, changePct: q.changePct ?? null }));
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
