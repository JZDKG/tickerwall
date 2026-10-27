/* ================================================================== *
 * FRED（CSV）解析
 *
 * 格式：
 *   observation_date,US10Y
 *   2026-10-24,4.23
 *   2026-10-25,.
 * 缺失值用 "." 表示，必须跳过；日期不是 YYYY-MM-DD 的行也跳过。
 *
 * stale 约定：FRED 拿到的是「上一交易日收盘」，不是实时价，
 * 所以报价必须显式标 stale: true，让前端亮「数据过期」角标，
 * 绝不能静默伪装成实时绿灯。
 * ================================================================== */

import { toNum } from './http.js';

/** 历史短于这个条数视为失败（FRED 正常都是几千条） */
export const FRED_MIN_ROWS = 30;

/**
 * @param {string} csv
 * @returns {Array<{date, close}>} 按文件顺序（FRED 本身即升序）
 */
export function parseFredCsv(csv) {
  const rows = [];
  for (const line of String(csv ?? '').split('\n')) {
    const [date, val] = line.trim().split(',');
    if (!date || !val || date === 'observation_date' || val === '.') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const close = toNum(val);
    if (!(close > 0)) continue;
    rows.push({ date, close });
  }
  return rows;
}

/** 解析并校验长度 */
export function parseFredCsvOrThrow(csv, seriesId = '') {
  const rows = parseFredCsv(csv);
  if (rows.length < FRED_MIN_ROWS) throw new Error('历史过短');
  return { rows, meta: { source: `fred:${seriesId}`, name: seriesId, code: seriesId } };
}

/**
 * 用日线最后两条造一个「收盘价」报价，并**始终**标 stale。
 */
export function fredQuoteFromRows(rows) {
  if (!rows || rows.length < 2) throw new Error('无可用历史');
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const price = Number(last.close);
  if (!(price > 0)) throw new Error('价格无效');
  return {
    price,
    prevClose: Number(prev.close) > 0 ? Number(prev.close) : null,
    sessionTime: last.date,
    stale: true,
  };
}
