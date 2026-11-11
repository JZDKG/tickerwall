/* ================================================================== *
 * 详情页图表工具（P2-T5）：区间收益测算尺 + 定基 100 叠加对比
 *
 * 全部是纯函数：区间测算只吃 OHLC 原始行，叠加只吃日期/收盘，坐标由主图
 * 的 geom（chartAxisOf 的结果）提供。渲染层负责把它们挂到 chartSVG 的
 * <path> 和 #measure-info 上，这样这两个功能都能独立单测。
 * ================================================================== */

export const OVERLAY_ASSETS = ['gold-intl', 'dxy', 'us10y', 'oil', 'sp500', 'btc'];

export const TRADING_DAYS = 252;

const num = (v) => (Number.isFinite(v) ? v : null);

/**
 * 区间收益：start / end 是索引，允许反着点（先点终点再点起点）。
 * 年化波动率 = 区间内对数收益的样本标准差 × √252；不足两个收益时给 null。
 */
export function measureRange(series, startIdx, endIdx) {
  const rows = Array.isArray(series) ? series : [];
  const a = Number(startIdx);
  const b = Number(endIdx);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, startIdx: 0, endIdx: 0, days: null, change: null, changePct: null, annualizedVol: null };
  const lo = Math.min(Math.round(a), Math.round(b));
  const hi = Math.max(Math.round(a), Math.round(b));
  const invalid = { ok: false, startIdx: lo, endIdx: hi, days: null, change: null, changePct: null, annualizedVol: null };
  if (!rows.length || a < 0 || b < 0 || a > rows.length - 1 || b > rows.length - 1 || lo >= hi) return invalid;
  const first = num(rows[lo]?.[2]);
  const last = num(rows[hi]?.[2]);
  if (!(first > 0) || !(last > 0)) return invalid;

  const change = last - first;
  const changePct = (change / first) * 100;

  const d0 = new Date(String(rows[lo][0])).getTime();
  const d1 = new Date(String(rows[hi][0])).getTime();
  const days = Number.isFinite(d0) && Number.isFinite(d1) && d1 >= d0
    ? Math.round((d1 - d0) / 86400000)
    : null;

  const lr = [];
  for (let i = lo + 1; i <= hi; i += 1) {
    const prev = num(rows[i - 1]?.[2]);
    const cur = num(rows[i]?.[2]);
    if (prev > 0 && cur > 0) lr.push(Math.log(cur / prev));
    else lr.push(0);
  }
  let annualizedVol = null;
  if (lr.length >= 2) {
    const mean = lr.reduce((s, v) => s + v, 0) / lr.length;
    const varr = lr.reduce((s, v) => s + (v - mean) ** 2, 0) / (lr.length - 1);
    annualizedVol = Math.sqrt(Math.max(0, varr)) * Math.sqrt(TRADING_DAYS);
  }
  return {
    ok: true, startIdx: lo, endIdx: hi,
    days, change, changePct, annualizedVol,
    startDate: String(rows[lo][0]), endDate: String(rows[hi][0]),
  };
}

/** 定基 100：以第一根收盘为基准，之后按比例；坏点跳过 */
export function toBase100(series) {
  const rows = Array.isArray(series) ? series : [];
  if (!rows.length) return [];
  const base = num(rows[0]?.[2]);
  if (!(base > 0)) return [];
  const out = [];
  for (const r of rows) {
    const v = num(r?.[2]);
    if (!(v > 0)) continue;
    out.push({ date: String(r[0]), value: (v / base) * 100 });
  }
  return out;
}

/**
 * 按日期对齐到基准序列：返回 { idx, date, base, other }[]。
 * other 缺该日期时为 null —— 不插值、不编造对比值。
 */
export function alignOverlay(base, other) {
  const rows = Array.isArray(base) ? base : [];
  const byDate = new Map((Array.isArray(other) ? other : []).map((o) => [o.date, o.value]));
  return rows.map((b, idx) => ({
    idx, date: b.date, base: b.value,
    other: byDate.has(b.date) ? num(byDate.get(b.date)) : null,
  }));
}

/**
 * 生成第二条曲线的 <path>。缺口处断开重起一段；geom 提供 x(i)/y(v)。
 * 输出是纯几何字符串，调用方用 raw() 放进 chartSVG。
 */
export function overlayPathHTML(aligned, geom, opts = {}) {
  const rows = Array.isArray(aligned) ? aligned : [];
  const segments = [];
  let current = null;
  for (const r of rows) {
    const v = num(r.other);
    if (v == null) { current = null; continue; }
    const x = geom.x(r.idx);
    const y = geom.y(v);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { current = null; continue; }
    if (!current) { current = []; segments.push(current); }
    current.push(`${current.length ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  const d = segments.map((s) => s.join(' ')).join(' ');
  if (!d) return '';
  const color = opts.color ?? '#5b9cf8';
  const label = opts.label ?? '对比';
  return `<path class="overlay-line" d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 3" stroke-linejoin="round" data-overlay="${label}" />`;
}
