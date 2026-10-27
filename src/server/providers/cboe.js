/* ================================================================== *
 * CBOE 官方指数历史（CSV）解析
 *
 * 文件形如：
 *   DATE,OPEN,HIGH,LOW,CLOSE
 *   01/02/1990,17.24,17.24,17.24,17.24
 * 日期是 MM/DD/YYYY，要转 ISO；缺列或收盘非正的行直接丢。
 * ================================================================== */

import { fetchRaw, toNum } from './http.js';

/** CSV 最少多少行才算解析成功（不足视为抓到了错误页） */
export const CBOE_MIN_ROWS = 50;

/**
 * @param {string} csv
 * @returns {Array<{date, open, high, low, close}>} 按日期升序
 */
export function parseCboeCsv(csv) {
  const rows = [];
  for (const line of String(csv ?? '').split('\n')) {
    const p = line.trim().split(',');
    if (p.length < 5 || p[0] === 'DATE') continue;
    const [mm, dd, yy] = p[0].split('/');
    const close = toNum(p[4]);
    if (!yy || !(close > 0)) continue;
    rows.push({
      date: `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
      open: toNum(p[1]),
      high: toNum(p[2]),
      low: toNum(p[3]),
      close,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}

/** 解析并校验行数，不足则抛（避免把错误页当历史） */
export function parseCboeCsvOrThrow(csv, symbol = '') {
  const rows = parseCboeCsv(csv);
  if (rows.length < CBOE_MIN_ROWS) throw new Error(`${symbol} CSV 解析失败`);
  return rows;
}

/** 取最后两行算涨跌（CBOE 每日更新一次） */
export function cboeQuoteFromRows(rows, symbol = '') {
  const last = rows?.[rows.length - 1];
  const prev = rows?.[rows.length - 2];
  if (!last || !prev) throw new Error('数据不足');
  return {
    price: last.close,
    prevClose: prev.close,
    open: last.open,
    high: last.high,
    low: last.low,
    sessionTime: last.date,
    note: `${symbol} 日收盘`,
  };
}


/* ------------------------------------------------------------------ *
 * 运行时适配（10 分钟缓存 + 报价映射）
 *
 * 放在 providers/ 而不是详情服务里：INSTRUMENTS 在模块加载时就会调用
 * cboeIndex('VIX'/'VXN')，若留在详情服务，报价服务就得反向 import —— 直接成环。
 * ------------------------------------------------------------------ */

export const cboeCache = new Map();

export async function cboeIndexRows(symbol) {
  const hit = cboeCache.get(symbol);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.rows;
  const csv = await fetchRaw(
    `https://cdn.cboe.com/api/global/us_indices/daily_prices/${symbol}_History.csv`,
    { headers: { Accept: 'text/csv' } },
  );
  const rows = parseCboeCsvOrThrow(csv, symbol);
  cboeCache.set(symbol, { at: Date.now(), rows });
  return rows;
}


export function cboeIndex(symbol) {
  return {
    name: `cboe:${symbol}`,
    async load() {
      return cboeQuoteFromRows(await cboeIndexRows(symbol), symbol);
    },
  };
}


export async function fetchCboeIndexDetail(symbol) {
  const rows = await cboeIndexRows(symbol);
  return { rows, meta: { source: `cboe:${symbol}`, name: symbol, code: symbol } };
}


export async function fetchCboeVix() {
  return fetchCboeIndexDetail('VIX');
}

