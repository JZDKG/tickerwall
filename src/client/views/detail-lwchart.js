/* ================================================================== *
 * TradingView lightweight-charts 双模图表（Phase 4 / P4-T2）
 *
 * 两层职责：
 *   1. 纯数据层：toLightweightSeriesData 把后端 packDaily 的
 *      [date, open, close, high, low, volume, amount, pct] 转成图表库要求的
 *      升序、去重、全有限的 { time, open, high, low, close, value }；
 *      computeMovingAverage 产出 MA20 / MA60 的 { time, value }。
 *   2. 挂载层：mountLightweightChart 只在「用户开启 Canvas 模式」且
 *      「运行环境有真实 Canvas 2D 上下文」时才 import('ui-kit') 调 createChart；
 *      否则（JSDOM / Canvas 不可用 / 库加载失败）自动回退到原生 SVG 图表。
 *
 * 为什么 ui-kit 走动态 import：detail.js 在首屏就会加载，静态 import 会让
 * 每个页面都为 React + ReactQuery + charts 付 ~500KB。只有用户真的在详情页
 * 切到 Canvas 模式时才按需拉，且失败也不影响既有的 SVG 渲染。
 * ================================================================== */

import { esc } from '../shared/format.js';

const MA_COLORS = { ma20: '#5b9cf8', ma60: '#e0a83c' };

/** 数值归一：null / 空串一律当无效（Number(null) 会悄悄变成 0，不能要） */
function num(v) {
  if (typeof v === 'number') return v;
  if (v == null || String(v).trim() === '') return NaN;
  return Number(v);
}

/** 统一成 YYYY-MM-DD：既认日期字符串，也认时间戳；解析不了就丢弃这一行 */
function toTime(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * 把日K行转成 lightweight-charts 标准升序数据。
 *
 * 接受两种行形态：packDaily 的数组，或 { date/time, open, close, high, low }。
 * 过滤非有限值、同一日期去重（后出现者覆盖，便于增量更新）、按日期升序；
 * high/low 会被夹到至少包住 open/close，否则图表库会拒绝这根 K 线。
 *
 * @param {Array} dailyRows
 * @returns {{time:string, open:number, high:number, low:number, close:number, value:number}[]}
 */
export function toLightweightSeriesData(dailyRows) {
  const byTime = new Map();
  for (const row of Array.isArray(dailyRows) ? dailyRows : []) {
    const r = Array.isArray(row)
      ? { date: row[0], open: row[1], close: row[2], high: row[3], low: row[4], volume: row[5] }
      : row && typeof row === 'object'
        ? { date: row.date ?? row.time, open: row.open, close: row.close, high: row.high, low: row.low, volume: row.volume }
        : null;
    if (!r) continue;
    const time = toTime(r.date);
    if (!time) continue;
    const open = num(r.open);
    const close = num(r.close);
    const high = num(r.high);
    const low = num(r.low);
    if (![open, close, high, low].every(Number.isFinite)) continue;
    byTime.set(time, {
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      value: close,
    });
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * 简单移动平均。前 period-1 根不产出（图表库不接受 value:null 的数据点），
 * 遇到非法值就重置窗口，不把坏数据带进后面的均值。
 */
export function computeMovingAverage(seriesData, period = 20) {
  const n = Math.max(1, Math.floor(Number(period) || 20));
  const out = [];
  const window = [];
  let sum = 0;
  for (const row of Array.isArray(seriesData) ? seriesData : []) {
    const v = Number(row?.value ?? row?.close);
    if (!Number.isFinite(v)) { window.length = 0; sum = 0; continue; }
    window.push(v);
    sum += v;
    if (window.length > n) sum -= window.shift();
    if (window.length === n) out.push({ time: row.time, value: sum / n });
  }
  return out;
}

/**
 * 是否具备真实 Canvas 2D 上下文。
 *
 * JSDOM 没有实现 getContext（会返回 null 并往控制台打 "Not implemented"），
 * 先用 UA 短路，免得每次 fallback 都刷一条噪声；真实浏览器再做一次能力探测，
 * 只要返回的对象带绘图方法就认为可用。
 */
export function hasRealCanvas2D(doc) {
  if (!doc || typeof doc.createElement !== 'function') return false;
  const ua = String(doc.defaultView?.navigator?.userAgent ?? '');
  if (/jsdom/i.test(ua)) return false;
  try {
    const ctx = doc.createElement('canvas').getContext?.('2d');
    return Boolean(ctx && typeof ctx.fillRect === 'function' && typeof ctx.measureText === 'function');
  } catch {
    return false;
  }
}

/** 原生 SVG 回退图：折线 / 蜡烛 + MA20 / MA60，零依赖、JSDOM 里也能渲染 */
export function fallbackSVG(seriesData, opts = {}) {
  const width = Math.max(240, Number(opts.width) || 800);
  const height = Math.max(120, Number(opts.height) || 260);
  const rows = Array.isArray(seriesData) ? seriesData : [];
  if (!rows.length) return '<div class="chart-empty">没有足够的历史数据</div>';

  const pad = 8;
  const hi = Math.max(...rows.map((r) => r.high));
  const lo = Math.min(...rows.map((r) => r.low));
  const span = hi - lo || 1;
  const x = (i) => pad + (i / Math.max(1, rows.length - 1)) * (width - pad * 2);
  const y = (v) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const lineOf = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${x(rows.length - points.length + i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');

  let candles = '';
  if (opts.type === 'candle') {
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const color = r.close >= r.open ? 'var(--up, #f5455c)' : 'var(--down, #16b979)';
      const top = y(Math.max(r.open, r.close));
      const h = Math.max(1, Math.abs(y(r.open) - y(r.close)));
      candles += `<line x1="${x(i).toFixed(2)}" y1="${y(r.high).toFixed(2)}" x2="${x(i).toFixed(2)}" y2="${y(r.low).toFixed(2)}" stroke="${color}" stroke-width="1" />`
        + `<rect x="${(x(i) - 1.5).toFixed(2)}" y="${top.toFixed(2)}" width="3" height="${h.toFixed(2)}" fill="${color}" />`;
    }
  }
  const closePath = lineOf(rows.map((r) => ({ value: r.close })));
  const showMA = opts.showMA !== false;
  const ma20 = showMA ? computeMovingAverage(rows, 20) : [];
  const ma60 = showMA ? computeMovingAverage(rows, 60) : [];
  const maPath = (data, color) => data.length
    ? `<path d="${lineOf(data)}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.85" />`
    : '';

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg lw-fallback" role="img" aria-label="${esc(opts.label ?? '历史走势（SVG 回退）')}">
    ${candles}
    <path d="${closePath}" fill="none" stroke="var(--accent, #5b9cf8)" stroke-width="1.6" stroke-linejoin="round" />
    ${maPath(ma20, MA_COLORS.ma20)}
    ${maPath(ma60, MA_COLORS.ma60)}
  </svg>`;
}

/**
 * 挂载图表。返回 { mode, chart?, series, svg?, remove }。
 *
 * 双模判据（两个都必须满足，否则走 SVG 回退）：
 *   · opts.enabled === true —— 用户显式开启交互式 Canvas 模式；
 *   · hasRealCanvas2D(doc) —— 环境真的能画 Canvas（JSDOM 直接短路）。
 *
 * opts.charts 可注入（测试 / 已有 ui-kit 实例）；不注入时按需 import('ui-kit')，
 * 因此本函数是 async。任何一步抛错都会回收已建实例并回退，不把详情页带崩。
 *
 * @param {HTMLElement} container
 * @param {object[]} seriesData toLightweightSeriesData 的产物
 * @param {object} opts
 */
export async function mountLightweightChart(container, seriesData, opts = {}) {
  const doc = opts.document ?? container?.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  const rows = Array.isArray(seriesData) ? seriesData : [];

  const fallback = () => {
    const svg = typeof opts.fallback === 'function' ? opts.fallback(rows, opts) : fallbackSVG(rows, opts);
    if (container) container.innerHTML = svg;
    return { mode: 'svg', svg, series: [], remove: () => { if (container) container.innerHTML = ''; } };
  };

  if (!container || opts.enabled !== true || !hasRealCanvas2D(doc)) return fallback();

  let kit = opts.charts ?? null;
  if (!kit) {
    try {
      // 用变量拼出裸模块名：静态分析不会把它当成浏览器侧的裸依赖，
      // 真实运行时仍能命中 index.html 的 import map（ui-kit → /vendor/ui-kit.js）。
      const spec = ['ui', 'kit'].join('-');
      kit = await import(/* @vite-ignore */ spec);
    } catch {
      return fallback();
    }
  }
  const { createChart, CandlestickSeries, LineSeries } = kit ?? {};
  if (typeof createChart !== 'function') return fallback();

  let chart = null;
  try {
    chart = createChart(container, {
      width: Math.max(240, Number(opts.width) || 800),
      height: Math.max(120, Number(opts.height) || 260),
      layout: { textColor: '#9aa7b5', fontSize: 11 },
      timeScale: { borderColor: '#26364c' },
      rightPriceScale: { borderColor: '#26364c' },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    const series = [];
    const candleMode = opts.type === 'candle';
    if (candleMode && CandlestickSeries) {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: '#f5455c', downColor: '#16b979', borderVisible: false,
        wickUpColor: '#f5455c', wickDownColor: '#16b979',
      });
      s.setData(rows.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      series.push(s);
    } else if (LineSeries) {
      const s = chart.addSeries(LineSeries, { color: '#5b9cf8', lineWidth: 2 });
      s.setData(rows.map(({ time, value }) => ({ time, value })));
      series.push(s);
    } else {
      // 缺少 series 定义（旧版产物）：回收 chart，回退 SVG
      chart.remove?.();
      return fallback();
    }

    if (opts.showMA !== false && LineSeries) {
      for (const [period, color] of [[20, MA_COLORS.ma20], [60, MA_COLORS.ma60]]) {
        const data = computeMovingAverage(rows, period);
        if (!data.length) continue;
        const ma = chart.addSeries(LineSeries, { color, lineWidth: 1 });
        ma.setData(data);
        series.push(ma);
      }
    }
    chart.timeScale().fitContent?.();
    return {
      mode: 'canvas',
      chart,
      series,
      remove: () => { try { chart.remove?.(); } catch { /* 已销毁 */ } },
    };
  } catch {
    try { chart?.remove?.(); } catch { /* 已销毁 */ }
    return fallback();
  }
}
