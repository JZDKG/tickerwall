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
 *
 * 值域（2026-10-28）：默认 'positive'，只接受收盘 > 0；利率 / 利差序列传
 * `{ valueDomain: 'signed' }` 以保留合法的零与负值。之前一律 `close > 0`，
 * 导致 DFII10（实际收益率，2020 年曾为负）在**写库这一步**被丢光 ——
 * 只改解析器不够，缺口就在这里补。
 *
 * 元数据 count / start_date / end_date 取自**实际写入**的行，不是过滤前的数组：
 * 否则 count 报了 5000、库里有 4200，页面上「样本数」与实际图表长度对不上。
 *
 * @param {string} id
 * @param {string|null} source
 * @param {Array<{date, close, open?, high?, low?, volume?}>} rows
 * @param {{ valueDomain?: 'positive'|'signed' }} [opts]
 * @returns {Promise<number>} 实际写入行数（0 表示没写）
 */
export async function writeDailyCache(id, source, rows, opts = {}) {
  if (!Array.isArray(rows) || rows.length < 2) return;
  const signed = opts.valueDomain === 'signed';
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
      let firstDate = null;
      let lastDate = null;
      for (const r of rows) {
        const c = Number(r.close);
        if (!r.date || !Number.isFinite(c)) continue; // 缺日期或收盘非数字的行直接丢
        if (!signed && !(c > 0)) continue; // 价格口径：0 / 负数当作缺失
        insBar.run(id, String(r.date), numOrNull(r.open), c, numOrNull(r.high), numOrNull(r.low), numOrNull(r.volume));
        written += 1;
        if (firstDate == null || String(r.date) < firstDate) firstDate = String(r.date);
        if (lastDate == null || String(r.date) > lastDate) lastDate = String(r.date);
      }
      if (written === 0) {
        // 一行都没写进去就别留下「有缓存、0 行」的假象
        db.prepare('DELETE FROM daily_meta WHERE id = ?').run(id);
        db.exec('COMMIT');
        return 0;
      }
      upsertMeta.run(id, source ?? null, Date.now(), written, firstDate, lastDate);
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
