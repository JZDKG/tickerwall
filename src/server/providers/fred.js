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
 *
 * 值域（2026-10-28 修正，见 docs/economic-explainer-product-and-architecture-plan.md §4.3）：
 * 原来这里对**所有**序列要求 `close > 0`，于是 10 年期 TIPS 实际收益率
 * （DFII10，2020 年曾为负）、盈亏平衡通胀率（T10YIE，极端时轻微为负）
 * 和可能跨零的短端利率在解析这一步就被静默丢弃 —— 表现为「库里有一条
 * 断掉的序列」，而不是任何可见错误。
 *
 * 现在按序列类型区分：
 *   signed  —— 利率、利差、收益率差：保留零与负值，只校验「是有限数」；
 *   positive—— 价格、指数、成交量：仍要求 > 0（0 是缺失的常见伪装）。
 * 缺失标记（`.`、空串、`null`、`ND`）在任何值域下都不是数字，绝不能补成 0。
 * ================================================================== */

import { toNum } from './http.js';

/** 历史短于这个条数视为失败（FRED 正常都是几千条） */
export const FRED_MIN_ROWS = 30;

/**
 * 允许零 / 负值的 FRED 序列。
 *
 * 只列「语义上可以为零或负」的利率与利差序列；没有列出的序列按价格口径
 * 处理（要求 > 0），这样不会因为放宽校验把价格序列的脏数据放进来。
 */
export const FRED_SIGNED_SERIES = new Set([
  'DGS10', // 10 年期名义收益率
  'DGS2', // 2 年期名义收益率
  'DGS30', // 30 年期名义收益率
  'DFII5', // 5 年期实际收益率
  'DFII10', // 10 年期实际收益率（黄金机会成本渠道的候选代理）
  'DFII30', // 30 年期实际收益率
  'T5YIE', // 5 年期盈亏平衡通胀率
  'T10YIE', // 10 年期盈亏平衡通胀率
  'T5YIFR', // 5y5y 远期通胀补偿
]);

/** 该序列的值域：'signed' | 'positive' */
export function fredValueDomain(seriesId) {
  return FRED_SIGNED_SERIES.has(String(seriesId ?? '').trim().toUpperCase()) ? 'signed' : 'positive';
}

/** 缺失标记：这些字符串不是数字，任何值域下都必须跳过（而不是转成 0） */
const MISSING_TOKENS = new Set(['', '.', '..', '-', '--', 'null', 'na', 'n/a', 'nd', 'nan']);

function parseFredCell(raw) {
  const s = String(raw ?? '').trim();
  if (MISSING_TOKENS.has(s.toLowerCase())) return null;
  const n = toNum(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} csv
 * @param {{ valueDomain?: 'positive'|'signed' }} [opts]
 * @returns {Array<{date, close}>} 按文件顺序（FRED 本身即升序）
 */
export function parseFredCsv(csv, opts = {}) {
  const valueDomain = opts.valueDomain === 'signed' ? 'signed' : 'positive';
  const rows = [];
  for (const line of String(csv ?? '').split('\n')) {
    const [date, val] = line.trim().split(',');
    if (!date || date === 'observation_date') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const close = parseFredCell(val);
    if (close == null) continue;
    // 价格类：0 会以「免费数据源的占位值」形式出现，保留它等于给对数收益率埋雷
    if (valueDomain === 'positive' && !(close > 0)) continue;
    rows.push({ date, close });
  }
  return rows;
}

/** 解析并校验长度；meta 带上值域与频率，供解释层判断可比性 */
export function parseFredCsvOrThrow(csv, seriesId = '', opts = {}) {
  const valueDomain = opts.valueDomain ?? fredValueDomain(seriesId);
  const rows = parseFredCsv(csv, { valueDomain });
  if (rows.length < FRED_MIN_ROWS) throw new Error('历史过短');
  return {
    rows,
    meta: {
      source: `fred:${seriesId}`,
      name: seriesId,
      code: seriesId,
      valueDomain,
      frequency: 'daily',
      startDate: rows[0]?.date ?? null,
      endDate: rows[rows.length - 1]?.date ?? null,
    },
  };
}

/**
 * 用日线最后两条造一个「收盘价」报价，并**始终**标 stale。
 *
 * signed 值域（利率）下当前值可以是 0 或负数，所以校验改成「有限数」；
 * 价格口径保持不变。前值非法时 prevClose 仍给 null —— 不能拿 0 冒充前值，
 * 否则利率差会凭空多出整整一个百分点的变动。
 */
export function fredQuoteFromRows(rows, opts = {}) {
  const valueDomain = opts.valueDomain === 'signed' ? 'signed' : 'positive';
  if (!rows || rows.length < 2) throw new Error('无可用历史');
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const price = Number(last.close);
  const validPrice = valueDomain === 'signed' ? Number.isFinite(price) : price > 0;
  if (!validPrice) throw new Error('价格无效');
  const prevNum = Number(prev.close);
  const prevValid = valueDomain === 'signed' ? Number.isFinite(prevNum) : prevNum > 0;
  return {
    price,
    prevClose: prevValid ? prevNum : null,
    sessionTime: last.date,
    stale: true,
  };
}
