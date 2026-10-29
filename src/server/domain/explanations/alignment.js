/* ================================================================== *
 * 时间对齐与共同观测
 *
 * 每个数字出现在解释里之前，都要先能回答三个问题：
 *   1. 这个变化对应哪两个观测日期？
 *   2. 两个指标是不是落在**同一个**可比窗口里？
 *   3. 样本数是多少、有哪些日期不可比？
 *
 * 之前 divergence-engine 的 evaluateEdgeReality() 分别取双方「最后一条非空值」，
 * 于是「黄金最新是周二、美元最新还是周一」这种常见错位会被当成当期同涨 / 同跌。
 * 这里的共同日期逻辑就是修那个问题的服务端版本：先取交集，再截窗口，
 * 找不到共同日期就明确返回不可比，而不是各取各的最新值。
 *
 * 纯函数，不依赖时钟 —— 所有「现在」由调用方以 asOf 传入。
 * ================================================================== */

/**
 * 支持的解释窗口。
 *
 * observations 是「变化次数」而不是日期跨度：session = 最近 1 次变化，
 * 5d = 最近 5 次变化，1m ≈ 最近 21 次变化。用观测次数而不用自然日，
 * 是因为跨时区标的的「5 天」根本不等于「5 个共同交易日」。
 */
export const WINDOW_SPECS = {
  session: { key: 'session', observations: 1, label: '最近一个交易时段' },
  '5d': { key: '5d', observations: 5, label: '最近 5 个交易时段' },
  '1m': { key: '1m', observations: 21, label: '最近约 1 个月' },
};

export const WINDOW_KEYS = Object.keys(WINDOW_SPECS);

export function windowSpec(key) {
  return WINDOW_SPECS[key] ?? null;
}

/** 序列形状守卫：{ dates: string[], values: number[] }，长度必须一致 */
export function isValidSeries(s) {
  return (
    !!s &&
    Array.isArray(s.dates) &&
    Array.isArray(s.values) &&
    s.dates.length === s.values.length &&
    s.dates.length > 0
  );
}

/** 只保留「日期可解析、数值有限」的观测，避免把缺失伪装成 0 */
export function cleanSeries(series, { valueDomain = 'positive' } = {}) {
  if (!series || !Array.isArray(series.dates) || !Array.isArray(series.values)) {
    return { dates: [], values: [] };
  }
  const dates = [];
  const values = [];
  for (let i = 0; i < series.dates.length; i += 1) {
    const d = series.dates[i];
    const v = series.values[i];
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(d ?? ''))) continue;
    if (!Number.isFinite(v)) continue;
    if (valueDomain !== 'signed' && !(v > 0)) continue;
    dates.push(String(d));
    values.push(v);
  }
  return { dates, values };
}

/**
 * 两序列按共同日期配对。
 *
 * 返回的 dates 升序、只含双方都有观测的日期；values 与之一一对应。
 * `droppedA` / `droppedB` 记录各自有但对方没有的最后一个日期 —— 那是
 * 「最新值还没同步」的直接证据，界面要显示出来而不是藏起来。
 */
export function alignCommon(a, b) {
  const empty = {
    dates: [],
    a: [],
    b: [],
    n: 0,
    lastDate: null,
    firstDate: null,
    onlyA: [],
    onlyB: [],
    reasons: [],
  };
  if (!isValidSeries(a) || !isValidSeries(b)) {
    return { ...empty, reasons: ['SERIES_MISSING'] };
  }
  const mapB = new Map();
  for (let i = 0; i < b.dates.length; i += 1) mapB.set(b.dates[i], b.values[i]);
  const setA = new Set(a.dates);

  const dates = [];
  const av = [];
  const bv = [];
  for (let i = 0; i < a.dates.length; i += 1) {
    const d = a.dates[i];
    if (!mapB.has(d)) continue;
    dates.push(d);
    av.push(a.values[i]);
    bv.push(mapB.get(d));
  }

  const onlyA = a.dates.filter((d) => !mapB.has(d)).slice(-3);
  const onlyB = b.dates.filter((d) => !setA.has(d)).slice(-3);
  const reasons = [];
  if (!dates.length) reasons.push('NO_COMMON_DATES');
  if (onlyA.length || onlyB.length) reasons.push('PARTIAL_OVERLAP');

  return {
    dates,
    a: av,
    b: bv,
    n: dates.length,
    lastDate: dates[dates.length - 1] ?? null,
    firstDate: dates[0] ?? null,
    onlyA,
    onlyB,
    reasons,
  };
}

/**
 * 计算一个序列在窗口内的变化。
 *
 * @param {{dates: string[], values: number[]}} series 已清洗的**水平值**序列
 * @param {{ comparisonPolicy: 'log-return'|'pp-difference'|'level', observations: number }} opts
 * @returns {{ start, end, from, to, change, changeUnit, observations } | null}
 */
/**
 * 按**指定日期**算变化（不做「取最后 N 个」）。
 *
 * 为什么需要它：`computeChange` 永远取序列最新的一段，而不同指标的更新节奏
 * 不同 —— 于是「黄金 10-28→10-29 下跌」的解释可能配着「实际收益率
 * 10-26→10-27 下降」的证据。解释必须固定在被解释的那个窗口上。
 *
 * @returns {object|null} 与 computeChange 同形状；任一端点不存在时返回 null
 */
export function changeBetween(series, startDate, endDate, { comparisonPolicy = 'log-return' } = {}) {
  if (!isValidSeries(series) || !startDate || !endDate) return null;
  const startIdx = series.dates.indexOf(startDate);
  const endIdx = series.dates.indexOf(endDate);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return null;
  const from = series.values[startIdx];
  const to = series.values[endIdx];
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const observations = endIdx - startIdx;
  if (comparisonPolicy === 'pp-difference') {
    return { start: startDate, end: endDate, from, to, change: to - from, changeUnit: 'pp', observations };
  }
  if (comparisonPolicy === 'level') {
    return { start: startDate, end: endDate, from, to, change: to - from, changeUnit: 'level', observations };
  }
  // 价格：要求两端为正，否则对数收益率没有意义
  if (!(from > 0) || !(to > 0)) return null;
  return { start: startDate, end: endDate, from, to, change: Math.log(to / from), changeUnit: 'log-return', observations };
}

export function computeChange(series, { comparisonPolicy = 'log-return', observations = 1 } = {}) {
  if (!isValidSeries(series)) return null;
  const n = Math.max(1, Math.min(Number(observations) || 1, series.values.length - 1));
  if (series.values.length < 2) return null;
  const fromIdx = series.values.length - (n + 1);
  const from = series.values[fromIdx];
  const to = series.values[series.values.length - 1];
  const start = series.dates[fromIdx];
  const end = series.dates[series.dates.length - 1];
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  if (comparisonPolicy === 'pp-difference') {
    // 百分点差；展示时由调用方 ×100 换成 bp（1bp = 0.01 个百分点）
    return { start, end, from, to, change: to - from, changeUnit: 'pp', observations: n };
  }
  if (comparisonPolicy === 'level') {
    return { start, end, from, to, change: to - from, changeUnit: 'level', observations: n };
  }
  // 价格：要求两端为正，否则对数收益率没有意义
  if (!(from > 0) || !(to > 0)) return null;
  return { start, end, from, to, change: Math.log(to / from), changeUnit: 'log-return', observations: n };
}

/** 把变化换算成展示值：{ value, unit }，单位 pct / bp / level */
export function presentChange(change) {
  if (!change) return null;
  if (change.changeUnit === 'pp') return { value: change.change * 100, unit: 'bp' };
  if (change.changeUnit === 'log-return') return { value: (Math.exp(change.change) - 1) * 100, unit: 'pct' };
  return { value: change.change, unit: 'level' };
}

/**
 * 配对后的窗口变化：**同一组共同日期**上的两端变化。
 *
 * 这是「当期同涨同跌」唯一合法的算法入口。没有共同日期就返回
 * comparable=false 及原因，绝不退回各自最新值。
 */
export function pairedChange(a, b, { comparisonPolicyA, comparisonPolicyB, observations = 1 } = {}) {
  const aligned = alignCommon(a, b);
  if (aligned.n < 2) {
    return { comparable: false, reasons: aligned.reasons.includes('NO_COMMON_DATES') ? ['NO_COMMON_DATES'] : ['INSUFFICIENT_COMMON_DATES'], n: aligned.n, aligned };
  }
  const sa = { dates: aligned.dates, values: aligned.a };
  const sb = { dates: aligned.dates, values: aligned.b };
  const ca = computeChange(sa, { comparisonPolicy: comparisonPolicyA, observations });
  const cb = computeChange(sb, { comparisonPolicy: comparisonPolicyB, observations });
  if (!ca || !cb) {
    return { comparable: false, reasons: ['CHANGE_UNAVAILABLE'], n: aligned.n, aligned };
  }
  return {
    comparable: true,
    n: aligned.n,
    aligned,
    a: ca,
    b: cb,
    sameWindow: ca.start === cb.start && ca.end === cb.end,
    reasons: aligned.reasons,
  };
}
