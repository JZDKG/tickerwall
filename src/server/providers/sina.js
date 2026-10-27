/* ================================================================== *
 * 新浪行情解析（纯函数）
 *
 * 新浪有四种完全不同的字段排布，全靠位置下标，写错一个不会报错、只会把
 * 昨收当成现价。所以每个解析器都单独导出，测试喂固定串、断言具体字段。
 *
 * 抓取（含 gb18030 解码）留在调用方，这里只吃文本。
 * ================================================================== */

import { toNum, splitSina } from './http.js';

/**
 * 现货 / 场内品种：`gds_AU9999`、`hf_XAU`、`fx_susdcny` 这类。
 * 0 现价 · 4 最高 · 5 最低 · 6 时间 · 7 昨收 · 8 今开 · 13 备注
 */
export function parseSinaSpot(text) {
  const f = splitSina(text);
  if (!f) throw new Error('空响应');
  const price = toNum(f[0]);
  if (!(price > 0)) throw new Error('价格无效');
  return {
    price,
    prevClose: toNum(f[7]),
    open: toNum(f[8]),
    high: toNum(f[4]),
    low: toNum(f[5]),
    sessionTime: f[6] || null,
    note: f[13] || null,
  };
}

/**
 * 美股指数：`gb_$inx` / `gb_$ndx`。
 * 1 最新价 · 2 涨跌幅% · 3 时间 · 4 涨跌额 · 5 开盘 · 6 最高 · 7 最低 · 26 昨收
 */
export function parseSinaGlobal(text) {
  const f = splitSina(text);
  if (!f) throw new Error('空响应');
  const price = toNum(f[1]);
  if (!(price > 0)) throw new Error('价格无效');
  const change = toNum(f[4]);
  let prevClose = toNum(f[26]);
  // 没给昨收就用「现价 − 涨跌额」反推
  if (prevClose == null && change != null) prevClose = price - change;
  return {
    price,
    prevClose,
    change,
    changePct: toNum(f[2]),
    open: toNum(f[5]),
    high: toNum(f[6]),
    low: toNum(f[7]),
    sessionTime: f[3] ? f[3].slice(-8) : null,
  };
}

/**
 * A 股指数简版：`s_sh000001`。
 * 1 现价 · 2 涨跌额 · 3 涨跌幅% · 4 成交量(手) · 5 成交额(万)
 */
export function parseSinaSimpleIndex(text) {
  const f = splitSina(text);
  if (!f) throw new Error('空响应');
  const price = toNum(f[1]);
  if (!(price > 0)) throw new Error('价格无效');
  return {
    price,
    change: toNum(f[2]),
    changePct: toNum(f[3]),
    volume: toNum(f[4]),
    amount: toNum(f[5]),
  };
}

/**
 * 国际期货：`hf_CL` 等。
 * 0 现价 · 1 涨跌额 · 2 涨跌幅% · 3 买价 · 4 卖价 · 5 最高 · 6 最低 · 7 时间 · 8 昨收
 */
export function parseSinaFutures(text) {
  const f = splitSina(text);
  if (!f) throw new Error('空响应');
  const price = toNum(f[0]);
  if (!(price > 0)) throw new Error('价格无效');
  return {
    price,
    change: toNum(f[1]),
    changePct: toNum(f[2]),
    high: toNum(f[5]),
    low: toNum(f[6]),
    sessionTime: f[7] || null,
    prevClose: toNum(f[8]),
  };
}
