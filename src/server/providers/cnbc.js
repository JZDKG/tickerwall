/* ================================================================== *
 * CNBC 行情（JSON）解析
 *
 * CNBC 对债券收益率返回 "4.245%" 这种带百分号的串，只去逗号会算出 NaN，
 * 于是 US10Y 明明 200 返回了却被判「价格无效」—— 所以清洗必须同时去 % 和逗号。
 * ================================================================== */

/**
 * CNBC 数值清洗：去千分位逗号与百分号；"UNCH" / 空串表示无变化 → null
 */
export function cnbcNum(v) {
  if (v == null || v === 'UNCH' || v === '') return null;
  const n = Number(String(v).replace(/[,%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * 解析批量报价响应，返回 symbol → quote 的 Map。
 * ITVQuote 只有一条时是对象而不是数组，两种都要吃。
 * @returns {Map<string, object>}
 */
export function parseCnbcQuotes(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const arr = parsed?.ITVQuoteResult?.ITVQuote;
  const list = Array.isArray(arr) ? arr : arr ? [arr] : [];
  const map = new Map();
  for (const q of list) {
    if (!q?.symbol) continue;
    map.set(q.symbol, q);
  }
  return map;
}

/**
 * 把一条 CNBC 报价映射成统一的 quote 形状。
 * 价格非法时抛错，让上层的多源降级接管。
 */
export function cnbcQuoteOf(q) {
  if (!q) throw new Error('无该标的');
  const price = cnbcNum(q.last);
  if (!(price > 0)) throw new Error('价格无效');
  return {
    price,
    prevClose: cnbcNum(q.previous_day_closing),
    change: cnbcNum(q.change),
    changePct: cnbcNum(q.change_pct),
    sessionTime: null,
    note: q.name ?? null,
  };
}
