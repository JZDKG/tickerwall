/* ================================================================== *
 * detail.js —— 详情页：K 线 / 分时 / 成交额 / 十字光标 / 多源对照 / 历史表。
 *
 * 来源：public/app.js（原 3655 行单体）L373-1504，整段搬运，逻辑未改写。
 * ================================================================== */

/* ================================================================== *
 * 详情页
 * ================================================================== */
import { detailEl } from '../shared/dom.js';
import {
  createExplainState,
  isExplainable,
  explainEnabled,
  refreshExplain,
  renderExplainCard,
  bindExplainInteractions,
  refreshHistory,
  viewVersion,
} from './explanations/state.js';
import { clockText, dirOf, esc, fmtPct, fmtPrice, fmtSigned, html, prettySource, raw } from '../shared/format.js';
import { store } from '../shared/store.js';
import { createApi } from '../shared/api.js';
import { createQueryCache, describeRefresh } from '../shared/query-cache.js';
import { comparisonCardHTML } from './comparison.js';
import { attachGlossary, termHTML } from '../shared/glossary.js';
import { followupsHTML, scopedFollowups } from '../shared/followups.js';

/**
 * 术语化的标签片段（产品 2.5）。
 *
 * 返回**未转义**的 HTML：metricCards 内部会把标签当字符串拼接，
 * 术语按钮必须保持标签形态才有交互。词条内容都来自本地术语表，
 * 不来自外部输入，所以这里按可信片段处理。
 */
export function termText(name) {
  return termHTML(name);
}
import { loadCalendarCached } from '../shared/calendar.js';


export let detailTimer = null;
export let detailState = null; // { id, data, period, tableRows }

export const WEEK_MS = 7 * 86400000;

/** 按区间截取日线：默认展示全部历史 */
export function sliceByRange(daily, range) {
  if (!daily.length || !range || range === 'all') return daily;
  const days = range === '1y' ? 365 : range === '3y' ? 1095 : range === '5y' ? 1825 : 0;
  if (!days) return daily;
  const lastTs = Date.parse(daily[daily.length - 1][0]);
  const cut = lastTs - days * 86400000;
  const kept = daily.filter((r) => Date.parse(r[0]) >= cut);
  return kept.length >= 2 ? kept : daily;
}

/** 对照数据的取数（同键缓存 30 秒：反复点开不该反复算） */
let cmpCache = null;
export async function loadGoldComparison({ windowKey = '5d', force = false } = {}) {
  if (!cmpCache) {
    cmpCache = createQueryCache({ api: createApi({ base: './', timeoutMs: 20_000 }) });
  }
  const snap = await cmpCache.fetchKey(`gold:${windowKey}`, {
    path: 'api/comparison/gold',
    params: { window: windowKey },
    maxAgeMs: 30_000,
    force,
  });
  if (snap.data) return snap.data;
  return { ok: false, error: describeRefresh(snap).text };
}

/** 内外盘对照（国内金价专有） */
export function goldSpreadBlock(derived, decimals) {
  if (!derived || !(derived.convertedPerGram > 0)) return '';
  const diff = derived.premiumPct;
  const items = [
    ['国际金价 XAU/USD', `${fmtPrice(derived.xauUsd, decimals)} 美元/盎司`],
    ['在岸美元人民币', derived.usdCny?.toFixed(4) ?? null],
    ['折合人民币', `${fmtPrice(derived.convertedPerGram, decimals)} 元/克`],
    ['上金所 Au99.99', `${fmtPrice(derived.domesticPrice, decimals)} 元/克`],
  ].filter(([, v]) => v);
  return html`<section class="d-block">
    <h3>内外盘对照 <span class="h3-note">国际金价 ÷ ${derived.gramsPerOunce} 克/盎司 × 汇率，再与上金所现货比较</span>
      <button type="button" class="cmp-open" data-cmp-open="1" title="把这段变化拆成国际金、汇率、溢价三项">为什么不同步？</button>
    </h3>
    <div class="d-metrics">
      ${items.map(
        ([label, value]) =>
          html`<div class="metric"><span class="m-label">${label}</span><span class="m-value">${value}</span></div>`,
      )}
      ${
        diff != null
          ? html`<div class="metric ${dirOf(diff)}"><span class="m-label">内外价差</span><span class="m-value">${diff > 0 ? '+' : ''}${diff.toFixed(2)}%</span></div>`
          : ''
      }
    </div>
    <div class="cmp-slot" data-cmp-slot="1"></div>
  </section>`;
}

/** 把日K聚合成周K / 月K：输入 [[date,o,c,h,l,vol,amt,pct],...] */
export function aggregateDaily(daily, mode) {
  if (mode === 'day') return daily;
  const groups = new Map();
  for (const row of daily) {
    const [date, open, close, high, low, volume, amount] = row;
    let key;
    if (mode === 'week') {
      const ts = Date.parse(date);
      // 以周一为分界（1970-01-01 是周四，+4 天对齐）
      key = String(Math.floor((ts / 86400000 + 4) / 7));
    } else {
      key = date.slice(0, 7);
    }
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { date, open, close, high, low, volume, amount });
    } else {
      g.close = close;
      if (high != null) g.high = g.high == null ? high : Math.max(g.high, high);
      if (low != null) g.low = g.low == null ? low : Math.min(g.low, low);
      if (volume != null) g.volume = (g.volume ?? 0) + volume;
      if (amount != null) g.amount = (g.amount ?? 0) + amount;
    }
  }
  const out = [...groups.values()];
  for (let i = 1; i < out.length; i += 1) {
    const prev = out[i - 1].close;
    out[i].pct = prev ? ((out[i].close - prev) / prev) * 100 : null;
  }
  return out.map((g) => [g.date, g.open, g.close, g.high, g.low, g.volume, g.amount, g.pct ?? null]);
}

/** 对数坐标的刻度：只取 1/2/5 × 10^n，保证标签是 200/500/1000 这种整值 */
export function logTicks(min, max) {
  const out = [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  for (let e = lo; e <= hi; e += 1) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= min * 0.94 && v <= max * 1.06) out.push(v);
    }
  }
  return out;
}

/** 简单移动平均，前 n-1 个位置留空（图上从第 n 个点才开始画） */
export function sma(series, n) {
  const out = new Array(series.length).fill(null);
  let sum = 0;
  for (let i = 0; i < series.length; i += 1) {
    sum += series[i][2];
    if (i >= n) sum -= series[i - n][2];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** 把区间扩到「好看」的刻度档位（1/2/2.5/5 × 10^n），避免轴顶正好压在数据极值上 */
export function niceAxis(min, max, ticks = 4) {
  if (!(max > min)) {
    const pad = Math.abs(max || 1) * 0.001;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / ticks;
  const mag = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { axisMin: Math.floor(min / step) * step, axisMax: Math.ceil(max / step) * step, step };
}

/** 大图：折线 + 面积 + 网格 + 右侧价格轴 + 底部日期轴 + 最高/最低标注 */
/**
 * 统一坐标轴计算：折线图 / 蜡烛图 / 十字光标三处必须用同一套映射，
 * 否则叠在一起会错位（尤其对数坐标下）。
 */
export function chartAxisOf(points, opts = {}) {
  const { width = 920, height = 260, useLog = false } = opts;
  const padL = 6;
  const padR = 62;
  const padT = 16;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = points.map((p) => p.v);
  let dataMin = Math.min(...values);
  let dataMax = Math.max(...values);
  // 蜡烛图必须覆盖全天最高/最低，否则上下影线会被裁掉
  if (Array.isArray(opts.hiLo)) {
    for (const [lo, hi] of opts.hiLo) {
      if (Number.isFinite(lo) && lo < dataMin) dataMin = lo;
      if (Number.isFinite(hi) && hi > dataMax) dataMax = hi;
    }
  }

  // 对数坐标：长期走势用线性会把早期波动压扁，专业看图默认更认 log
  const logMode = useLog && dataMin > 0 && dataMax > dataMin;
  const tf = logMode ? (v) => Math.log10(v) : (v) => v;
  const inv = logMode ? (v) => 10 ** v : (v) => v;

  let axisMin;
  let axisMax;
  let tickValues;
  if (logMode) {
    axisMin = tf(dataMin);
    axisMax = tf(dataMax);
    tickValues = logTicks(dataMin, dataMax);
    if (tickValues.length < 2) tickValues = [dataMin, dataMax];
  } else {
    const nice = niceAxis(dataMin, dataMax, 4);
    axisMin = nice.axisMin;
    axisMax = nice.axisMax;
    const steps = Math.round((nice.axisMax - nice.axisMin) / nice.step);
    tickValues = Array.from({ length: steps + 1 }, (_, i) => nice.axisMin + nice.step * i);
  }
  const axisSpan = axisMax - axisMin || 1;

  const x = (i) => padL + (i / Math.max(1, points.length - 1)) * innerW;
  const y = (v) => padT + innerH - ((tf(v) - axisMin) / axisSpan) * innerH;

  return {
    width, height, padL, padR, padT, padB, innerW, innerH,
    values, dataMin, dataMax, logMode, tf, inv,
    axisMin, axisMax, axisSpan, tickValues, x, y,
  };
}

export function chartSVG(points, opts = {}) {
  const {
    decimals = 2,
    dir = 'flat',
    overlays = [],
    events = [],
    monthMode = false,
  } = opts;
  if (!points || points.length < 2) {
    return '<div class="chart-empty">没有足够的历史数据</div>';
  }
  const { width, height, padL, padT, innerW, innerH, values, dataMin, dataMax, tickValues, x, y } =
    chartAxisOf(points, opts);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${(padL + innerW).toFixed(2)},${padT + innerH} L${padL},${padT + innerH} Z`;
  const stroke = dir === 'up' ? 'var(--up)' : dir === 'down' ? 'var(--down)' : 'var(--flat)';
  const gid = `cg${Math.random().toString(36).slice(2, 9)}`;

  // 网格与右侧价格刻度
  let grid = '';
  for (const v of tickValues) {
    const gy = y(v).toFixed(2);
    grid += `<line x1="${padL}" y1="${gy}" x2="${padL + innerW}" y2="${gy}" class="grid-line" />`;
    grid += `<text x="${width - 6}" y="${gy}" class="axis-text" text-anchor="end" dominant-baseline="middle">${fmtPrice(v, decimals)}</text>`;
  }

  // 均线叠加
  let maLines = '';
  for (const ov of overlays) {
    let d = '';
    let started = false;
    ov.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) return;
      d += `${started ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
      started = true;
    });
    if (started) {
      maLines += `<path d="${d}" fill="none" stroke="${ov.color}" stroke-width="1.3" stroke-linejoin="round" opacity="0.85" />`;
    }
  }

  // 底部日期刻度：窄屏只显示年份，否则完整日期会互相压住
  let xlabels = '';
  const labelCount = width < 520 ? 3 : Math.min(4, points.length);
  const compact = width < 520;
  for (let i = 0; i < labelCount; i += 1) {
    const idx = Math.round((i / (labelCount - 1 || 1)) * (points.length - 1));
    const anchor = i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle';
    const raw = String(points[idx].label ?? '');
    const text = compact && raw.length >= 10 ? raw.slice(0, 4) : raw;
    xlabels += `<text x="${x(idx).toFixed(2)}" y="${height - 8}" class="axis-text" text-anchor="${anchor}">${esc(text)}</text>`;
  }

  // 最高/最低标注
  let marks = '';
  const maxIdx = values.indexOf(dataMax);
  const minIdx = values.indexOf(dataMin);
  const mark = (idx, v, above) => {
    const px = x(idx);
    const nearRight = px > padL + innerW * 0.72;
    const anchor = nearRight ? 'end' : px < padL + innerW * 0.12 ? 'start' : 'middle';
    const dx = nearRight ? 7 : anchor === 'start' ? -7 : 0;
    // 贴近底部的点把标注翻到上方，否则会和横轴日期文字叠在一起
    const flip = y(v) > padT + innerH - 28;
    const py = above || flip ? y(v) - 8 : y(v) + 16;
    return (
      `<circle cx="${px.toFixed(2)}" cy="${y(v).toFixed(2)}" r="2.6" fill="${stroke}" />` +
      `<text x="${(px - dx).toFixed(2)}" y="${py.toFixed(2)}" class="mark-text" text-anchor="${anchor}">${fmtPrice(v, decimals)}</text>`
    );
  };
  if (maxIdx >= 0) marks += mark(maxIdx, dataMax, true);
  if (minIdx >= 0 && minIdx !== maxIdx) marks += mark(minIdx, dataMin, false);

  // 宏观事件标注：FOMC / CPI / 非农 打竖虚线，用来解释走势的突变点
  let eventLines = '';
  let drawn = 0;
  for (const ev of events) {
    if (drawn >= 40) break;
    const key = monthMode ? String(ev.date).slice(0, 7) : String(ev.date);
    const idx = points.findIndex((pt) => String(pt.label) >= key);
    if (idx <= 0) continue;
    const px = x(idx).toFixed(2);
    eventLines += `<line x1="${px}" y1="${padT}" x2="${px}" y2="${padT + innerH}" class="evt-line k-${esc(ev.kind)}" />`;
    eventLines += `<circle cx="${px}" cy="${padT + innerH}" r="1.8" class="evt-dot k-${esc(ev.kind)}" />`;
    drawn += 1;
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="历史走势">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.26" />
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${grid}
    ${eventLines}
    <path d="${area}" fill="url(#${gid})" stroke="none" />
    ${maLines}
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
    ${marks}
    ${xlabels}
    <g class="xhair" style="display:none">
      <line class="xh-v" y1="${padT}" y2="${padT + innerH}" />
      <line class="xh-h" x1="${padL}" x2="${padL + innerW}" />
      <circle class="xh-dot" r="3" />
    </g>
  </svg>`;
}

/**
 * 蜡烛图。series 是后端 packDaily 的原始行：[日期, 开, 收, 高, 低, 量, 额, 涨跌幅]
 * 网格、刻度、事件线的画法和 chartSVG 保持一致（改一处记得同步另一处）。
 */
export function candleSVG(series, opts = {}) {
  const { decimals = 2, events = [], monthMode = false, overlays = [] } = opts;
  if (!series || series.length < 2) {
    return '<div class="chart-empty">没有足够的历史数据</div>';
  }
  const pts = series.map((r) => ({
    v: r[2],
    label: monthMode ? String(r[0]).slice(0, 7) : String(r[0]),
  }));
  const g = chartAxisOf(pts, { ...opts, hiLo: series.map((r) => [r[4], r[3]]) });
  const { width, height, padL, padT, innerW, innerH, tickValues, x, y } = g;

  // 每根蜡烛占的横向槽位；K 线过密时实体压到 1px，影线跳过（否则满屏竖线噪声）
  const slot = innerW / Math.max(1, series.length - 1);
  const bodyW = Math.max(1, Math.min(11, slot * 0.62));
  const drawWicks = slot >= 1.5;

  let candles = '';
  for (let i = 0; i < series.length; i += 1) {
    const [, o, c, h, l] = series[i];
    if (!(c > 0)) continue;
    const up = c > o;
    const flat = c === o;
    const col = flat ? 'var(--flat)' : up ? 'var(--up)' : 'var(--down)';
    const xc = x(i);
    if (drawWicks && Number.isFinite(h) && Number.isFinite(l)) {
      candles += `<line x1="${xc.toFixed(2)}" y1="${y(h).toFixed(2)}" x2="${xc.toFixed(2)}" y2="${y(l).toFixed(2)}" stroke="${col}" stroke-width="1" />`;
    }
    const yO = y(Number.isFinite(o) ? o : c);
    const yC = y(c);
    const top = Math.min(yO, yC);
    const hgt = Math.max(1, Math.abs(yC - yO));
    candles += `<rect x="${(xc - bodyW / 2).toFixed(2)}" y="${top.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${hgt.toFixed(2)}" fill="${col}" />`;
  }

  let grid = '';
  for (const v of tickValues) {
    const gy = y(v).toFixed(2);
    grid += `<line x1="${padL}" y1="${gy}" x2="${padL + innerW}" y2="${gy}" class="grid-line" />`;
    grid += `<text x="${width - 6}" y="${gy}" class="axis-text" text-anchor="end" dominant-baseline="middle">${fmtPrice(v, decimals)}</text>`;
  }

  let maLines = '';
  for (const ov of overlays) {
    let d = '';
    let started = false;
    ov.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) return;
      d += `${started ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
      started = true;
    });
    if (started) {
      maLines += `<path d="${d}" fill="none" stroke="${ov.color}" stroke-width="1.3" stroke-linejoin="round" opacity="0.85" />`;
    }
  }

  let xlabels = '';
  const labelCount = width < 520 ? 3 : Math.min(4, pts.length);
  const compact = width < 520;
  for (let i = 0; i < labelCount; i += 1) {
    const idx = Math.round((i / (labelCount - 1 || 1)) * (pts.length - 1));
    const anchor = i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle';
    const raw = String(pts[idx].label ?? '');
    const text = compact && raw.length >= 10 ? raw.slice(0, 4) : raw;
    xlabels += `<text x="${x(idx).toFixed(2)}" y="${height - 8}" class="axis-text" text-anchor="${anchor}">${esc(text)}</text>`;
  }

  let eventLines = '';
  let drawn = 0;
  for (const ev of events) {
    if (drawn >= 40) break;
    const key = monthMode ? String(ev.date).slice(0, 7) : String(ev.date);
    const idx = pts.findIndex((pt) => String(pt.label) >= key);
    if (idx <= 0) continue;
    const px = x(idx).toFixed(2);
    eventLines += `<line x1="${px}" y1="${padT}" x2="${px}" y2="${padT + innerH}" class="evt-line k-${esc(ev.kind)}" />`;
    eventLines += `<circle cx="${px}" cy="${padT + innerH}" r="1.8" class="evt-dot k-${esc(ev.kind)}" />`;
    drawn += 1;
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg chart-candle" role="img" aria-label="蜡烛图">
    ${grid}
    ${eventLines}
    ${candles}
    ${maLines}
    ${xlabels}
    <g class="xhair" style="display:none">
      <line class="xh-v" y1="${padT}" y2="${padT + innerH}" />
      <line class="xh-h" x1="${padL}" x2="${padL + innerW}" />
      <circle class="xh-dot" r="3" />
    </g>
  </svg>`;
}

/**
 * 十字光标：鼠标 / 触摸在图上移动时，竖横虚线跟随，右上浮层给当根 K 的完整读数。
 * 挂载点是一个 position:relative 的容器，SVG 和 tooltip 都在里面。
 *
 * payload.series 是 OHLC 原始行；payload.points 只带收盘价，用于折线模式定位。
 */
export function bindChartCrosshair(host, payload) {
  const svg = host.querySelector('svg.chart-svg');
  if (!svg) return;
  const g = payload.geom;
  const gx = svg.querySelector('.xhair');
  if (!gx) return;
  const vLine = gx.querySelector('.xh-v');
  const hLine = gx.querySelector('.xh-h');
  const dot = gx.querySelector('.xh-dot');

  // 容器内定位用的浮层
  let tip = host.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    host.appendChild(tip);
  }

  const n = payload.series.length;
  let active = false;

  const locate = (clientX) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return null;
    // svg 用 viewBox + width:100%，实际渲染有缩放，要换算回 viewBox 坐标
    const scale = rect.width / g.width;
    const svgX = (clientX - rect.left) / scale;
    const ratio = (svgX - g.padL) / Math.max(1, g.innerW);
    const idx = Math.round(ratio * (n - 1));
    if (!Number.isFinite(idx)) return null;
    return { idx: Math.max(0, Math.min(n - 1, idx)), scale, rect };
  };

  const show = (clientX, clientY) => {
    const loc = locate(clientX);
    if (!loc) return;
    const { idx, scale, rect } = loc;
    const row = payload.series[idx];
    if (!row) return;

    const [date, o, c, h, l, vol, amt, pct] = row;
    const px = g.x(idx);
    const py = g.y(c);
    const up = c > o;
    const flat = c === o;
    const col = flat ? 'var(--flat)' : up ? 'var(--up)' : 'var(--down)';

    gx.style.display = '';
    vLine.setAttribute('x1', px);
    vLine.setAttribute('x2', px);
    hLine.setAttribute('y1', py);
    hLine.setAttribute('y2', py);
    dot.setAttribute('cx', px);
    dot.setAttribute('cy', py);
    dot.setAttribute('fill', col);

    const d = payload.decimals ?? 2;
    const maCell = (name) => {
      const arr = payload.overlays?.find((ov) => ov.name === name)?.values;
      const v = arr?.[idx];
      return v == null || !Number.isFinite(v) ? '—' : fmtPrice(v, d);
    };
    // 后端 pct 字段已经是百分数（东财 f59，1.23 表示 1.23%）。
    // CBOE / Binance 源不带 pct，就用前一根收盘自己算，保证每个标的都有涨跌幅。
    let pctVal = pct;
    if (pctVal == null || !Number.isFinite(pctVal)) {
      const prevClose = idx > 0 ? payload.series[idx - 1][2] : null;
      pctVal =
        Number.isFinite(prevClose) && prevClose > 0 && Number.isFinite(c)
          ? ((c - prevClose) / prevClose) * 100
          : null;
    }
    const pctTxt =
      pctVal == null
        ? ''
        : html`<span class="${pctVal >= 0 ? 'up' : 'down'}">${pctVal >= 0 ? '+' : ''}${pctVal.toFixed(2)}%</span>`;
    const chg = Number.isFinite(c) && Number.isFinite(o) ? c - o : null;
    const chgTxt =
      chg == null ? '' : html`<span class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : ''}${fmtPrice(chg, d)}</span>`;

    // 当天撞上的宏观事件
    const key = payload.monthMode ? String(date).slice(0, 7) : String(date);
    const dayEvents = (payload.events ?? []).filter((e) => {
      const ek = payload.monthMode ? String(e.date).slice(0, 7) : String(e.date);
      return ek === key;
    });

    tip.innerHTML = html`
      <div class="tip-date">${String(date)}</div>
      <div class="tip-grid">
        <span>开</span><b>${fmtPrice(o, d)}</b>
        <span>高</span><b>${fmtPrice(h, d)}</b>
        <span>低</span><b>${fmtPrice(l, d)}</b>
        <span>收</span><b>${fmtPrice(c, d)}</b>
      </div>
      <div class="tip-line">${pctTxt}${
        chgTxt ? html`<span class="tip-dim">　实体 ${chgTxt}</span>` : ''
      }</div>
      ${
        vol > 0
          ? html`<div class="tip-line tip-dim">量 ${fmtVolume(vol)}${amt > 0 ? ` · 额 ${fmtAmount(amt)}` : ''}</div>`
          : ''
      }
      ${
        payload.overlays?.length
          ? html`<div class="tip-line tip-dim">${payload.overlays.map((ov) => `${ov.name} ${maCell(ov.name)}`).join(' · ')}</div>`
          : ''
      }
      ${
        dayEvents.length
          ? html`<div class="tip-line tip-evt">${dayEvents.map((e) => payload.eventLabel?.(e.kind) ?? e.kind).join(' · ')}</div>`
          : ''
      }`.toString();

    // 定位：默认在光标右侧，靠近右边界时翻到左侧；垂直方向夹在容器内。
    // 必须先显示再测量 —— 隐藏状态下 offsetHeight 为 0，clamp 会失效导致浮层溢出图表。
    tip.classList.add('on');
    const hostRect = host.getBoundingClientRect();
    const tipW = tip.offsetWidth || 168;
    const tipH = tip.offsetHeight || 92;
    const cursorX = px * scale;
    const cursorY = py * scale;
    let left = cursorX + 14;
    if (left + tipW > hostRect.width - 4) left = Math.max(4, cursorX - tipW - 14);
    let top = cursorY - tipH / 2;
    top = Math.max(4, Math.min(hostRect.height - tipH - 4, top));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    active = true;
  };

  const hide = () => {
    if (!active) return;
    gx.style.display = 'none';
    tip.classList.remove('on');
    active = false;
  };

  svg.addEventListener('mousemove', (e) => show(e.clientX, e.clientY));
  svg.addEventListener('mouseleave', hide);
  svg.addEventListener('touchstart', (e) => {
    const t0 = e.touches?.[0];
    if (t0) show(t0.clientX, t0.clientY);
  }, { passive: true });
  svg.addEventListener('touchmove', (e) => {
    const t0 = e.touches?.[0];
    if (!t0) return;
    // 只在图表区域内响应，避免挡住页面滚动
    const rect = svg.getBoundingClientRect();
    if (t0.clientX < rect.left || t0.clientX > rect.right) return;
    show(t0.clientX, t0.clientY);
  }, { passive: true });
  svg.addEventListener('touchend', hide);
}

/** 成交量副图：与主图共用 x 轴刻度，柱子按当日涨跌着色 */
export function volumeSVG(bars, opts = {}) {
  const { width = 920, height = 64, decimals = 2 } = opts;
  const valid = bars.filter((b) => b.v > 0);
  if (!valid.length) return '';
  const padL = 6;
  const padR = 62;
  const padT = 8;
  const padB = 4;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxV = Math.max(...valid.map((b) => b.v));
  const slot = innerW / bars.length;
  const barW = Math.max(0.6, Math.min(6, slot * 0.72));

  let rects = '';
  bars.forEach((b, i) => {
    if (!(b.v > 0)) return;
    const h = Math.max(0.8, (b.v / maxV) * innerH);
    const px = padL + i * slot + (slot - barW) / 2;
    const py = padT + innerH - h;
    const cls = b.pct == null ? 'flat' : b.pct > 0 ? 'up' : b.pct < 0 ? 'down' : 'flat';
    rects += `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" class="vol-bar ${cls}" />`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg vol-svg" role="img" aria-label="成交量">
    <text x="${padL}" y="${padT + 8}" class="axis-text">成交量</text>
    <text x="${width - 6}" y="${padT + 8}" class="axis-text" text-anchor="end">${fmtVolume(maxV) ?? ''}</text>
    ${rects}
  </svg>`;
}

/** 当日分时图：横轴按时间，带上昨收基准线 */
export function intradaySVG(points, opts = {}) {
  const { width = 920, height = 180, decimals = 2, prevClose = null } = opts;
  if (!points || points.length < 2) return '<div class="chart-empty">暂无分时数据</div>';
  const padL = 6;
  const padR = 62;
  const padT = 12;
  const padB = 20;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = points.map((p) => p.p);
  let min = Math.min(...values, prevClose ?? Infinity);
  let max = Math.max(...values, prevClose ?? -Infinity);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    min = Math.min(...values);
    max = Math.max(...values);
  }
  if (max === min) {
    const pad = Math.abs(max) * 0.001 || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const x = (i) => padL + (i / (points.length - 1)) * innerW;
  const y = (v) => padT + innerH - ((v - min) / span) * innerH;

  const up = prevClose != null ? values[values.length - 1] >= prevClose : true;
  const stroke = up ? 'var(--up)' : 'var(--down)';
  const gid = `ig${Math.random().toString(36).slice(2, 9)}`;
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${(padL + innerW).toFixed(2)},${padT + innerH} L${padL},${padT + innerH} Z`;

  let base = '';
  if (prevClose != null) {
    const by = y(prevClose).toFixed(2);
    base = `<line x1="${padL}" y1="${by}" x2="${padL + innerW}" y2="${by}" class="base-line" />
      <text x="${width - 6}" y="${by}" class="axis-text" text-anchor="end" dominant-baseline="middle">${fmtPrice(prevClose, decimals)}</text>`;
  }

  let labels = '';
  const n = Math.min(4, points.length);
  for (let i = 0; i < n; i += 1) {
    const idx = Math.round((i / (n - 1 || 1)) * (points.length - 1));
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    labels += `<text x="${x(idx).toFixed(2)}" y="${height - 4}" class="axis-text" text-anchor="${anchor}">${esc(points[idx].label ?? '')}</text>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="当日分时">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.22" />
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${base}
    <path d="${area}" fill="url(#${gid})" stroke="none" />
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    ${labels}
  </svg>`;
}

export function fmtVolume(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万`;
  return String(Math.round(v));
}

export function fmtAmount(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} 万亿`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万`;
  return String(Math.round(v));
}

/** 指标网格 */
export function metricCards(data) {
  const d = data.decimals;
  const q = data.quote ?? {};
  const x = data.ext ?? {};
  const s = data.stats ?? {};
  const cards = [];
  /**
   * @param {string|object} label 文本，或 `raw()` 包好的可信片段（术语按钮）
   * @param {*} value
   * @param {string} cls 方向类名
   * @param {boolean} asRaw label 是可信片段吗（默认按外部输入转义）
   */
  const add = (label, value, cls = '', asRaw = false) => {
    if (value == null || value === '') return;
    // label / value 可能带外部数据（如备注、波动率分位），默认交给模板转义；
    // 术语按钮是我们自己拼的可信片段，用 raw() 包一层才不会被转义成文字
    cards.push(
      html`<div class="metric ${cls}"><span class="m-label">${asRaw ? raw(String(label)) : label}</span><span class="m-value">${value}</span></div>`,
    );
  };

  const basisLabel = data.priceBasis === 'settle' ? '昨结算' : '昨收';
  add('今开', fmtPrice(q.open ?? x.open, d));
  add(basisLabel, fmtPrice(q.prevClose ?? x.prevClose, d));
  add('最高', fmtPrice(q.high ?? x.high, d));
  add('最低', fmtPrice(q.low ?? x.low, d));

  const amplitude =
    q.high != null && q.low != null && q.prevClose ? ((q.high - q.low) / q.prevClose) * 100 : null;
  add('振幅', amplitude != null ? `${amplitude.toFixed(2)}%` : null);

  add('成交量', fmtVolume(x.volume));
  add('成交额', fmtAmount(x.amount));
  add('换手率', x.turnoverRate != null && x.turnoverRate !== 0 ? `${x.turnoverRate.toFixed(2)}%` : null);

  if (s.high52 != null) add('52周最高', fmtPrice(s.high52, d));
  if (s.low52 != null) add('52周最低', fmtPrice(s.low52, d));
  if (s.fromHigh52 != null) add('距52周高', `${s.fromHigh52.toFixed(2)}%`, dirOf(s.fromHigh52));
  if (s.fromLow52 != null) add('距52周低', `${s.fromLow52.toFixed(2)}%`, dirOf(s.fromLow52));

  // 波动率：交易员看的不是「20 年全样本均值为多少」，而是「现在处在什么波动率环境」
  if (s.rv20 != null) {
    const pct = s.rv20Percentile;
    add(
      // 术语化（产品 2.5）：「实现波动」与「分位」是详情页最常被问的两个词
      `${termText('实现波动率')} RV20`,
      // 值里的「分位」保持纯文本：值这一列整体走转义，塞 HTML 会被当字面量显示
      `${s.rv20.toFixed(1)}%${pct != null ? ` · ${s.volRegime ?? ''} ${pct.toFixed(0)} 分位` : ''}`,
      null,
      true,
    );
  }
  if (s.rv60 != null) add('RV60 实现波动', `${s.rv60.toFixed(1)}%`);
  add('全样本波动', s.volatility != null ? `${s.volatility.toFixed(1)}%` : null);
  if (s.histHigh?.value != null) add('历史最高', `${fmtPrice(s.histHigh.value, d)}`, '');
  if (s.histLow?.value != null) add('历史最低', `${fmtPrice(s.histLow.value, d)}`);

  add('MA20', fmtPrice(s.ma20, d));
  add('MA60', fmtPrice(s.ma60, d));
  add('MA120', fmtPrice(s.ma120, d));
  add('MA250', fmtPrice(s.ma250, d));

  if (s.maxDrawdown?.pct != null && s.maxDrawdown.pct < 0) {
    add(termText('最大回撤'), `${s.maxDrawdown.pct.toFixed(1)}%`, 'down', true);
  }
  if (s.bestDay) add('单日最大涨', `${s.bestDay.pct.toFixed(2)}%`, 'up');
  if (s.worstDay) add('单日最大跌', `${s.worstDay.pct.toFixed(2)}%`, 'down');
  if (s.streak) add('连续涨跌', s.streak > 0 ? `连涨 ${s.streak} 日` : `连跌 ${Math.abs(s.streak)} 日`, s.streak > 0 ? 'up' : 'down');

  return html`<div class="d-metrics">${cards}</div>`;
}

export function perfChips(stats) {
  if (!stats?.perf) return '';
  const items = [
    ['近1日', stats.perf.d1],
    ['近1周', stats.perf.w1],
    ['近1月', stats.perf.m1],
    ['近3月', stats.perf.m3],
    ['近6月', stats.perf.m6],
    ['近1年', stats.perf.y1],
    ['近3年', stats.perf.y3],
    ['年初至今', stats.perf.ytd],
  ].filter(([, v]) => v != null);
  return html`<div class="d-perf">${items.map(
    ([label, v]) => html`<span class="perf-chip ${dirOf(v)}"><em>${label}</em><b>${fmtPct(v)}</b></span>`,
  )}</div>`;
}

export function crossCheckTable(list, decimals) {
  if (!list || list.length < 2) return '';
  const base = list[0].price;
  const rows = list.map((c) => {
    const diff = base && c.price ? ((c.price - base) / base) * 100 : null;
    return html`<tr>
        <td class="mono">${prettySource(c.source)}</td>
        <td class="mono num">${fmtPrice(c.price, decimals)}</td>
        <td class="mono num ${diff != null ? dirOf(diff) : ''}">${diff != null ? fmtPct(diff) : '—'}</td>
        <td class="dim">${c.note ?? ''}</td>
      </tr>`;
  });
  return html`<section class="d-block">
    <h3>多源对照 <span class="h3-note">同一标的不同数据源的取价一致性</span></h3>
    <table class="d-table"><thead><tr><th>数据源</th><th class="num">取价</th><th class="num">与主源偏差</th><th>说明</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

export function historyTable(daily, decimals, tableRows) {
  if (!daily.length) return '';
  const rows = daily.slice(-tableRows).reverse();
  const body = rows.map((r) => {
    const [date, open, close, high, low, volume, , pct] = r;
    return html`<tr>
        <td class="mono">${date}</td>
        <td class="mono num">${fmtPrice(open, decimals)}</td>
        <td class="mono num">${fmtPrice(high, decimals)}</td>
        <td class="mono num">${fmtPrice(low, decimals)}</td>
        <td class="mono num">${fmtPrice(close, decimals)}</td>
        <td class="mono num ${pct != null ? dirOf(pct) : ''}">${pct != null ? fmtPct(pct) : '—'}</td>
        <td class="mono num dim">${fmtVolume(volume) ?? '—'}</td>
      </tr>`;
  });
  const more = tableRows < daily.length;
  return html`<section class="d-block">
    <h3>历史日线 <span class="h3-note">共 ${daily.length} 个交易日，按时间倒序</span></h3>
    <div class="table-wrap">
      <table class="d-table hist-table">
        <thead><tr><th>日期</th><th class="num">开盘</th><th class="num">最高</th><th class="num">最低</th><th class="num">收盘</th><th class="num">涨跌幅</th><th class="num">成交量</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${more ? html`<button type="button" class="more-btn" id="more-rows">再显示 30 行</button>` : ''}
  </section>`;
}

/** 同时采集到的其他历史源（用于说明「全网采集」的广度） */
export function altSources(history) {
  const alts = (history.alternatives ?? []).filter(
    (a) => a.source && a.source !== history.source && a.count > 0,
  );
  if (!alts.length) return '';
  const text = alts.map((a) => `${prettySource(a.source)} ${a.count} 条`).join('、');
  return html`<span>同时采集：${text}</span>`;
}

/** 历史全空时把每个源的失败原因摊开，否则页面只有一句「0 条」，分不清是源挂了还是没数据 */
export function historyEmptyNotice(history) {
  if ((history.count ?? 0) > 0) return '';
  const errs = history.errors ?? [];
  return html`<div class="chart-empty chart-empty-err">
    历史数据暂时取不到${errs.length ? `：${errs.map((e) => `${e.source} — ${e.error}`).join('；')}` : ''}
    <br>行情报价与关键指标仍然可用；等数据源恢复后会自动重试。
  </div>`;
}

/**
 * 走的是本机落盘缓存时给一条提示。
 * 关键是把「数据截止到哪天」说清楚 —— 图照常能看，但不能让人误以为是实时历史。
 */
export function historyCacheNotice(history) {
  const c = history?.cache;
  if (!c || c.hit !== 'stale') return '';
  const hours = Math.round((c.ageMs ?? 0) / 3600_000);
  const age = hours >= 24 ? `${Math.floor(hours / 24)} 天` : `${hours} 小时`;
  const errs = history.errors ?? [];
  return html`<div class="chart-empty chart-empty-err">
    数据源暂时不可用，当前显示的是 <b>${age}前</b> 落盘的日线缓存（截止 ${history.endDate ?? '—'}）。
    ${errs.length ? html`<br>失败原因：${errs.map((e) => `${e.source} — ${e.error}`).join('；')}` : ''}
    <br>实时报价与当日分时不受影响；刷新到新数据后会自动覆盖。
  </div>`;
}

export function renderDetail(data) {
  const d = data.decimals;
  const q = data.quote ?? {};
  const dir = dirOf(q.changePct);
  const period = detailState.period;
  const range = detailState.range ?? 'all';
  const daily = data.history.daily;
  const ranged = sliceByRange(daily, range);
  const series = aggregateDaily(ranged, period);
  const showLog = detailState.scale === 'log';
  const showMA = detailState.ma !== false;
  const chartType = detailState.type ?? 'line';
  const overlays = showMA
    ? [
        { name: 'MA20', color: '#5b9cf8', values: sma(series, 20) },
        { name: 'MA60', color: '#e0a83c', values: sma(series, 60) },
      ]
    : [];
  const points = series.map((r) => ({
    v: r[2],
    label: period === 'month' ? String(r[0]).slice(0, 7) : String(r[0]),
  }));
  // 图的方向按整段区间涨跌判断，比只看当天更符合直觉
  const first = points[0]?.v;
  const lastP = points[points.length - 1]?.v;
  const chartDir = dirOf(first && lastP != null ? lastP - first : q.changePct);

  // 与该标的相关的宏观事件（FOMC/CPI/非农），用于在走势图上标注
  const relatedEvents = (store.calendar?.events ?? []).filter(
    (e) => e.importance >= 3 && (!e.symbols || e.symbols.includes(data.id)),
  );
  // 只把「落在当前图表时间范围内」的事件计入图例，否则会列出图上并不存在的类型
  const firstLabel = String(points[0]?.label ?? '');
  const lastLabel = String(points[points.length - 1]?.label ?? '');
  const inRangeEvents = relatedEvents.filter((e) => {
    const k = period === 'month' ? String(e.date).slice(0, 7) : String(e.date);
    return k >= firstLabel && k <= lastLabel;
  });
  // 标注密度随区间自适应：20 年区间标 40 条会挤成一团，所以保证最小间距。
  // 图例只列「真正画上去的」类型，避免出现图上有 CPI 线却没有的情况。
  const monthMode = period === 'month';
  const maxMarks = Math.min(40, Math.max(8, Math.floor(points.length / 25)));
  const minGap = Math.ceil(points.length / maxMarks);
  const drawnEvents = [];
  let lastMarkIdx = -Infinity;
  for (const ev of inRangeEvents) {
    if (drawnEvents.length >= maxMarks) break;
    const key = monthMode ? String(ev.date).slice(0, 7) : String(ev.date);
    const idx = points.findIndex((pt) => String(pt.label) >= key);
    if (idx <= 0 || idx - lastMarkIdx < minGap) continue;
    lastMarkIdx = idx;
    drawnEvents.push(ev);
  }
  const eventKinds = [...new Set(drawnEvents.map((e) => e.kind))];
  const EVENT_KIND_LABEL = { fomc: 'FOMC', cpi: 'CPI', nfp: '非农', ppi: 'PPI', pce: 'PCE', gdp: 'GDP' };

  // 按容器实际宽度 1:1 渲染，否则 viewBox 被整体缩放会让轴文字小到看不清
  const hostW = detailEl.clientWidth || 920;
  const blockPad = window.innerWidth <= 880 ? 28 : 36;
  const chartW = Math.max(300, Math.round(hostW - blockPad));
  const chartH = Math.round(Math.min(320, Math.max(180, chartW * 0.29)));
  const intraH = Math.round(Math.min(210, Math.max(132, chartW * 0.185)));

  detailEl.innerHTML = html`
    <div class="d-top">
      <button type="button" class="back-btn" id="back">← 返回列表</button>
      <div class="d-id">
        <h2>${data.name}</h2>
        <p>${data.sub} · ${data.unit}</p>
      </div>
    </div>

    <div class="d-hero">
      <div class="d-price ${dir}">${fmtPrice(q.price, d)}</div>
      <div class="d-delta ${dir}">
        <b>${fmtSigned(q.change, d)}</b>
        <span>${fmtPct(q.changePct)}</span>
      </div>
      <div class="d-hero-meta">
        ${
          data.marketStatus
            ? html`<span class="mkt-badge ${data.marketStatus.open ? 'open' : 'closed'}">${data.marketStatus.label}</span><span class="sep">·</span>`
            : ''
        }
        ${q.sessionTime ? html`<span>行情 ${q.sessionTime}</span><span class="sep">·</span>` : ''}
        <span>${prettySource(q.source)}</span>
        ${q.stale ? '<span class="stale-tag">数据过期</span>' : ''}
      </div>
    </div>

    ${perfChips(data.stats)}

    ${
      explainEnabled() && isExplainable(data.id)
        ? // 卡片内部已经逐字段 esc()，所以这里整体标成已转义；
          // 直接用普通字符串会被 html 标签再转义一次（页面上会看到源码）
          raw(`<div id="d-explain">${renderExplainCard(ensureExplainState(data.id), { assetName: data.name })}</div>`)
        : ''
    }

    <section class="d-block">
      <div class="chart-head">
        <h3>历史走势 <span class="h3-note">${ranged[0]?.[0] ?? ''} ~ ${data.history.endDate ?? ''} · ${ranged.length} 条</span></h3>
        <div class="chart-controls">
          <div class="seg" id="range-seg">
            ${[
              ['1y', '1年'],
              ['3y', '3年'],
              ['5y', '5年'],
              ['all', '全部'],
            ]
              .map(([k, label]) => html`<button type="button" data-r="${k}" class="${range === k ? 'on' : ''}">${label}</button>`)}
          </div>
          <div class="seg" id="period-seg">
            <button type="button" data-p="day" class="${period === 'day' ? 'on' : ''}">日K</button>
            <button type="button" data-p="week" class="${period === 'week' ? 'on' : ''}">周K</button>
            <button type="button" data-p="month" class="${period === 'month' ? 'on' : ''}">月K</button>
          </div>
          <div class="seg" id="scale-seg">
            <button type="button" data-s="lin" class="${!showLog ? 'on' : ''}">线性</button>
            <button type="button" data-s="log" class="${showLog ? 'on' : ''}">对数</button>
          </div>
          <div class="seg" id="ma-seg">
            <button type="button" data-m="on" class="${showMA ? 'on' : ''}">均线</button>
            <button type="button" data-m="off" class="${!showMA ? 'on' : ''}">关</button>
          </div>
          <div class="seg" id="type-seg">
            <button type="button" data-t="candle" class="${chartType === 'candle' ? 'on' : ''}">蜡烛</button>
            <button type="button" data-t="line" class="${chartType === 'line' ? 'on' : ''}">折线</button>
          </div>
        </div>
      </div>
      <div class="chart-legend">
        ${
          chartType === 'candle'
            ? html`<span><i class="candle-swatch up"></i>阳线</span><span><i class="candle-swatch down"></i>阴线</span>`
            : html`<span><i style="background:${chartDir === 'up' ? 'var(--up)' : chartDir === 'down' ? 'var(--down)' : 'var(--flat)'}"></i>收盘</span>`
        }
        ${
          showMA
            ? html`<span><i style="background:#5b9cf8"></i>MA20</span><span><i style="background:#e0a83c"></i>MA60</span>`
            : ''
        }
        ${
          eventKinds.length
            ? html`<span class="legend-events">${eventKinds
                .map((k) => html`<i class="evt-swatch k-${k}"></i>${EVENT_KIND_LABEL[k] ?? k}`)}</span>`
            : ''
        }
        ${showLog ? '<span class="legend-note">对数坐标</span>' : ''}
        <span class="legend-note">悬停看当根读数</span>
      </div>
      <div class="chart-host" id="chart-host">${
        chartType === 'candle'
          ? raw(candleSVG(series, {
              width: chartW,
              height: chartH,
              decimals: d,
              useLog: showLog,
              overlays,
              events: drawnEvents,
              monthMode,
            }))
          : raw(chartSVG(points, {
              width: chartW,
              height: chartH,
              decimals: d,
              dir: chartDir,
              useLog: showLog,
              overlays,
              events: drawnEvents,
              monthMode,
            }))
      }</div>
      ${historyEmptyNotice(data.history)}
      ${historyCacheNotice(data.history)}
      ${
        chartType === 'candle' && (series.length > 320 || (chartW < 520 && series.length > 140))
          ? html`<p class="macro-hint">当前 ${series.length} 根 K 线过密，实体已压到 1px、影线已省略。看形态建议缩短区间或切周K / 月K。</p>`
          : ''
      }
      ${raw(volumeSVG(
        series.map((r) => ({ v: r[5], pct: r[7] })),
        { width: chartW, height: Math.round(chartH * 0.26), decimals: d },
      ))}
    </section>

    ${
      data.intraday?.points?.length
        ? html`<section class="d-block">
            <h3>当日分时 <span class="h3-note">${data.intraday.date ?? ''} · ${data.intraday.points.length} 个点</span></h3>
            ${raw(intradaySVG(data.intraday.points, { width: chartW, height: intraH, decimals: d, prevClose: q.prevClose }))}
          </section>`
        : ''
    }

    <section class="d-block">
      <h3>关键指标</h3>
      ${metricCards(data)}
    </section>

    ${goldSpreadBlock(data.derived, d)}

    ${crossCheckTable(data.crosscheck, d)}

    ${historyTable(daily, d, detailState.tableRows)}

    <footer class="d-foot">
      <span>历史数据：${prettySource(data.history.source ?? '')}${data.history.code ? ` · ${data.history.code}` : ''} · ${data.history.count} 个交易日（${data.history.startDate ?? ''} ~ ${data.history.endDate ?? ''}）</span>
      ${altSources(data.history)}
      <span>生成于 ${clockText(new Date(data.generatedAt))}</span>
    </footer>
  `.toString();

  document.getElementById('back')?.addEventListener('click', () => {
    location.hash = '';
  });

  document.querySelectorAll('#range-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      detailState.range = btn.dataset.r;
      renderDetail(detailState.data);
    });
  });

  document.querySelectorAll('#scale-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      detailState.scale = btn.dataset.s;
      renderDetail(detailState.data);
    });
  });

  /**
   * 「为什么不同步？」（产品 2.1）：点开在原位展开，不跳页。
   *
   * 数据按需取：多数用户不会点，没必要每次打开详情都算三个序列的分解。
   */
  document.querySelectorAll('[data-cmp-open]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slot = document.querySelector('[data-cmp-slot]');
      if (!slot) return;
      if (slot.dataset.loaded === '1') {
        slot.innerHTML = '';
        slot.dataset.loaded = '0';
        return;
      }
      slot.innerHTML = '<p class="cmp-loading">正在对照三组数据…</p>';
      /**
       * 取数失败必须收尾：否则插槽会永远停在「正在对照三组数据…」，
       * 读者以为一直在加载。失败时给可重试的说明并把 loaded 置 0。
       */
      try {
        const data = await loadGoldComparison({ windowKey: '5d' });
        slot.innerHTML = comparisonCardHTML(data);
        slot.dataset.loaded = data?.decomposition ? '1' : '0';
      } catch (err) {
        slot.innerHTML = html`<p class="chart-empty chart-empty-err">对照数据暂时取不到${
          err?.message ? `：${String(err.message)}` : ''
        }。再点一次可以重试。</p>`.toString();
        slot.dataset.loaded = '0';
      }
    });
  });

  document.querySelectorAll('#ma-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      detailState.ma = btn.dataset.m === 'on';
      renderDetail(detailState.data);
    });
  });

  document.querySelectorAll('#period-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      detailState.period = btn.dataset.p;
      renderDetail(detailState.data);
    });
  });

  document.querySelectorAll('#type-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      detailState.type = btn.dataset.t;
      renderDetail(detailState.data);
    });
  });

  // 十字光标：几何要和图表用完全同一套，所以在这里重算一次（成本可以忽略）
  const chartHost = document.getElementById('chart-host');
  if (chartHost) {
    const geom = chartAxisOf(
      points,
      chartType === 'candle'
        ? { width: chartW, height: chartH, useLog: showLog, hiLo: series.map((r) => [r[4], r[3]]) }
        : { width: chartW, height: chartH, useLog: showLog },
    );
    bindChartCrosshair(chartHost, {
      geom,
      series,
      overlays,
      events: drawnEvents,
      decimals: d,
      monthMode,
      eventLabel: (k) => EVENT_KIND_LABEL[k] ?? k,
    });
  }

  document.getElementById('more-rows')?.addEventListener('click', () => {
    detailState.tableRows += 30;
    renderDetail(detailState.data);
  });
}

export function renderDetailError(id, message) {
  detailEl.innerHTML = html`
    <div class="d-top">
      <button type="button" class="back-btn" id="back">← 返回列表</button>
      <div class="d-id"><h2>${id}</h2><p>详情加载失败</p></div>
    </div>
    <div class="d-error">${message}</div>
  `.toString();
  document.getElementById('back')?.addEventListener('click', () => {
    location.hash = '';
  });
}

/* ------------------------------------------------------------------ *
 * 解释卡：状态在模块里，重渲染不会丢展开状态
 * ------------------------------------------------------------------ */

let explainState = null;

/**
 * 取历史版本列表（C3）。
 *
 * 与解释本身分开：列表失败不影响阅读当前解释，所以在拿到之后单独补绘一次。
 */
export async function hydrateHistory() {
  if (!explainState || !isExplainable(explainState.assetId)) return null;
  const assetAtStart = explainState.assetId;
  const next = await refreshHistory(explainState);
  if (!explainState || explainState.assetId !== assetAtStart) return null;
  explainState = { ...next, openFactors: explainState.openFactors, replay: explainState.replay, assetName: explainState.assetName };
  repaintExplainCard();
  return explainState;
}

/** 切到某一版历史快照；取不到就保持当前视图并给出错误 */
export async function replayVersion(versionId) {
  if (!explainState || !versionId) return null;
  const assetAtStart = explainState.assetId;
  const next = await viewVersion(explainState, versionId);
  if (!explainState || explainState.assetId !== assetAtStart) return null;
  explainState = { ...next, openFactors: explainState.openFactors, assetName: explainState.assetName };
  repaintExplainCard();
  return explainState;
}

/** 取（或初始化）某个资产的解释状态 */
export function ensureExplainState(assetId) {
  if (!explainState || explainState.assetId !== assetId) {
    explainState = createExplainState(assetId);
    explainState.assetName = null;
  }
  return explainState;
}

/** 对外只读：便于测试与调试 */
export function currentExplainState() {
  return explainState;
}

/**
 * 重新渲染解释卡（只换这一块，不动图表与其它区域）。
 * 保留展开状态：openFactors 在状态里，不随 DOM 重建丢失。
 */
export function repaintExplainCard() {
  const host = typeof document !== 'undefined' ? document.getElementById('d-explain') : null;
  if (!host || !explainState) return;
  const data = detailState?.data;
  host.innerHTML = html`${renderExplainCard(explainState, { assetName: data?.name })}
      <div class="d-followups" id="d-followups">${rawFollowups(explainState)}</div>`.toString();
  bindExplain();
}

/**
 * 有范围的追问（产品 2.5 后半）：先给可点的问题，不做自由输入。
 * 回答继承当前解释的资产·窗口·截至时刻·机制版本；证据不足时先说证据不足。
 */
function rawFollowups(state) {
  return html`${followupsHTML(scopedFollowups({ explanation: state }))}`;
}

function bindExplain() {
  const host = typeof document !== 'undefined' ? document.getElementById('d-explain') : null;
  if (!host || !explainState) return;
  bindExplainInteractions(host, () => explainState, {
    onChange: (next, action, payload) => {
      // 历史回放（C3）：切版本是只读动作，不触发新的生成
      if (action === 'version') {
        void replayVersion(payload?.versionId);
        return;
      }
      explainState = next;
      repaintExplainCard();
      if (action === 'window' || action === 'refresh') void hydrateExplanation({ force: action === 'refresh' });
      if (action === 'window') void hydrateHistory();
    },
  });
}

/**
 * 取解释并写回状态。
 *
 * 序号保护：慢响应回来时如果用户已经切了窗口/资产，就直接丢弃。
 */
export async function hydrateExplanation({ force = false } = {}) {
  if (!explainState || !isExplainable(explainState.assetId)) return null;
  const seqAtStart = explainState.seq + 1;
  const next = await refreshExplain(explainState, { force });
  if (!explainState || next.seq !== seqAtStart) return null; // 旧响应，丢弃
  // 保留用户已经展开的条目：refreshExplain 的 base 已带上 openFactors
  explainState = { ...next, openFactors: explainState.openFactors, assetName: explainState.assetName };
  repaintExplainCard();
  return explainState;
}

export async function loadDetail(id, { force = false } = {}) {
  try {
    // 日历与详情并行取，失败也不影响详情渲染
    const calPromise = loadCalendarCached();
    const res = await fetch(`./api/detail/${encodeURIComponent(id)}${force ? '?force=1' : ''}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await calPromise;
    if (!detailState || detailState.id !== id) {
      detailState = { id, data, period: 'day', range: 'all', scale: 'lin', ma: true, type: 'line', tableRows: 30 };
    } else {
      detailState.data = data;
    }
    if (location.hash.startsWith('#/d/')) {
      renderDetail(detailState.data);
      // 图表先渲染，解释异步补上：取数慢不该让整页等
      void hydrateExplanation();
      void hydrateHistory();
    }
  } catch (err) {
    renderDetailError(id, err?.message ?? String(err));
  }
}

export function stopDetailTimer() {
  if (detailTimer) {
    clearInterval(detailTimer);
    detailTimer = null;
  }
}

/* ------------------------------------------------------------------ *
 * 生命周期（由 router 调用）
 *
 * 原来这段逻辑内联在 route() 里：先手动 stopDetailTimer()、再判断 id 是否变化、
 * 再 setInterval。收敛到这里之后 router 只管「谁上谁下」，视图自己管自己的表。
 * ------------------------------------------------------------------ */

/** 进入详情页。id 变化才重置状态（同一标的来回切时保留周期/区间选择） */
export function mountDetail(id) {
  detailEl.hidden = false;
  window.scrollTo({ top: 0 });
  if (!detailState || detailState.id !== id) {
    detailState = { id, data: null, period: 'day', range: 'all', scale: 'lin', ma: true, type: 'line', tableRows: 30 };
    // 换标的就换解释状态：旧资产的解释不能留在新页面上
    explainState = null;
    detailEl.innerHTML = html`<div class="d-loading">正在加载历史数据…</div>`.toString();
  }
  loadDetail(id, { force: true });
  stopDetailTimer();
  detailTimer = setInterval(() => loadDetail(id, { force: false }), 30000);
}

/** 离开详情页：停表 + 清空容器（清空是为了下次进来重新渲染，也放掉旧 DOM） */
export function unmountDetail() {
  stopDetailTimer();
  detailEl.hidden = true;
  detailEl.innerHTML = '';
  detailState = null;
  // 丢掉解释状态：在飞的请求回来时 explainState 已是 null，写回会被直接丢弃
  explainState = null;
}
