/* ================================================================== *
 * 日线缓存（SQLite）
 *
 * 起因：2026-10-26 实测东财整段返回空、Yahoo 返回 429，四个标的的详情页
 * 变成「0 条」。多源能缓解，但所有源同时不可用时就只剩缓存这一条路。
 *
 * 策略：新鲜（8h 内）直接用、不打源；过期则请求源，源全失败时回退到旧缓存
 * 并标注陈旧时长。这样图表永远有东西可画，只是明确告诉用户数据截止到哪天。
 * ================================================================== */

import { getDb } from './sqlite.js';

export const DAILY_FRESH_MS = 8 * 3600_000;

export function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 读某个标的的日线缓存。
 * @returns {Promise<null | { id, source, savedAt, count, startDate, endDate, rows }>}
 *          行数不足 2 条视为无缓存（画不出图）
 */
export async function readDailyCache(id) {
  try {
    const db = getDb();
    const meta = db.prepare('SELECT * FROM daily_meta WHERE id = ?').get(id);
    if (!meta) return null;
    const rows = db
      .prepare('SELECT date, open, close, high, low, volume FROM daily_bars WHERE id = ? ORDER BY date ASC')
      .all(id)
      .map((r) => ({
        date: r.date,
        open: r.open,
        close: r.close,
        high: r.high,
        low: r.low,
        volume: r.volume,
      }));
    if (rows.length < 2) return null;
    return {
      id,
      source: meta.source,
      savedAt: meta.saved_at,
      count: rows.length,
      startDate: meta.start_date,
      endDate: meta.end_date,
      rows,
    };
  } catch (err) {
    console.warn(`[sqlite] 读取 ${id} 失败：${err?.message ?? err}`);
    return null;
  }
}

/**
 * 整段替换某个标的的日线。
 * 源可能回补历史，所以先 DELETE 再插 —— 留着旧行会和新的重复。
 */
export async function writeDailyCache(id, source, rows) {
  if (!Array.isArray(rows) || rows.length < 2) return;
  try {
    const db = getDb();
    const insBar = db.prepare(
      'INSERT OR REPLACE INTO daily_bars (id, date, open, close, high, low, volume) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const upsertMeta = db.prepare(
      `INSERT INTO daily_meta (id, source, saved_at, count, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source = excluded.source, saved_at = excluded.saved_at, count = excluded.count,
         start_date = excluded.start_date, end_date = excluded.end_date`,
    );
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM daily_bars WHERE id = ?').run(id);
      let written = 0;
      for (const r of rows) {
        const c = Number(r.close);
        if (!r.date || !(c > 0)) continue; // 缺日期或收盘非正的行直接丢
        insBar.run(id, String(r.date), numOrNull(r.open), c, numOrNull(r.high), numOrNull(r.low), numOrNull(r.volume));
        written += 1;
      }
      upsertMeta.run(
        id,
        source ?? null,
        Date.now(),
        rows.length,
        rows[0]?.date ?? null,
        rows[rows.length - 1]?.date ?? null,
      );
      db.exec('COMMIT');
      return written;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.warn(`[sqlite] 写入 ${id} 失败：${err?.message ?? err}`);
    return 0;
  }
}

/** 缓存是否还新鲜（8 小时内）—— 决定要不要打源 */
export function isDailyCacheFresh(cache, now = Date.now()) {
  return cache != null && now - cache.savedAt < DAILY_FRESH_MS;
}
