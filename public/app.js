/**
 * 市场看板前端 —— 负责取数、渲染 7 个纵向卡片、画走势、自动刷新
 */

const rowsEl = document.getElementById('rows');
const updatedEl = document.getElementById('updated');
const countdownEl = document.getElementById('countdown');
const refreshBtn = document.getElementById('refresh');

/** 首屏骨架用的占位信息（顺序与后端一致） */
const PLACEHOLDER = [
  { id: 'gold-cn', name: '国内金价', sub: '上海黄金交易所 Au99.99 现货', unit: '元/克', decimals: 2 },
  { id: 'gold-intl', name: '国际金价', sub: '伦敦金 XAU/USD 现货', unit: '美元/盎司', decimals: 2 },
  { id: 'btc', name: '比特币', sub: 'BTC/USDT · 24 小时', unit: '美元', decimals: 2 },
  { id: 'oil', name: '国际原油', sub: 'WTI 纽约原油', unit: '美元/桶', decimals: 2 },
  { id: 'sp500', name: '标普500', sub: 'S&P 500 指数', unit: '点', decimals: 2 },
  { id: 'ndx100', name: '纳斯达克100', sub: 'NASDAQ 100 指数', unit: '点', decimals: 2 },
  { id: 'sh000001', name: '上证指数', sub: '上海证券交易所 000001', unit: '点', decimals: 2 },
];

const refs = new Map();
let ttl = 15000;
let nextAt = 0;
let loading = false;

/* ------------------------------ 工具 ------------------------------ */

const nfCache = new Map();
function numFmt(decimals) {
  const key = String(decimals);
  if (!nfCache.has(key)) {
    nfCache.set(
      key,
      new Intl.NumberFormat('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    );
  }
  return nfCache.get(key);
}

function fmtPrice(v, decimals) {
  if (v == null || !Number.isFinite(v)) return '—';
  return numFmt(decimals).format(v);
}

function fmtSigned(v, decimals) {
  if (v == null || !Number.isFinite(v)) return '—';
  const body = numFmt(decimals).format(Math.abs(v));
  if (v > 0) return `+${body}`;
  if (v < 0) return `-${body}`;
  return body;
}

function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  // 幅度极小时多给一位，避免 -0.004% 被显示成 -0.00%
  const body = abs.toFixed(abs > 0 && abs < 0.01 ? 3 : 2);
  if (v > 0) return `+${body}%`;
  if (v < 0) return `-${body}%`;
  return `${body}%`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function dirOf(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

function clockText(d = new Date()) {
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

/** 走势迷你图：非等比拉伸，用 non-scaling-stroke 保证线宽不变 */
function sparklineSVG(points, dir, width = 240, height = 56) {
  const pts = Array.isArray(points) ? points.filter((p) => p && Number.isFinite(p.p)) : [];
  if (pts.length < 2) {
    return '<div class="spark-empty">走势积累中…</div>';
  }

  const values = pts.map((p) => p.p);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    const pad = Math.abs(max) * 0.0005 || 0.5;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const x = (i) => 1.5 + (i / (pts.length - 1)) * (width - 3);
  const y = (v) => height - 5 - ((v - min) / span) * (height - 10);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  const stroke = dir === 'up' ? 'var(--up)' : dir === 'down' ? 'var(--down)' : 'var(--flat)';
  const gid = `g${Math.random().toString(36).slice(2, 9)}`;
  const lastX = x(values.length - 1).toFixed(2);
  const lastY = y(values[values.length - 1]).toFixed(2);

  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="走势">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.30" />
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${gid})" stroke="none" />
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linejoin="round"
          stroke-linecap="round" vector-effect="non-scaling-stroke" />
    <circle cx="${lastX}" cy="${lastY}" r="2.4" fill="${stroke}" vector-effect="non-scaling-stroke" />
  </svg>`;
}

function metaRange(item) {
  const d = item.decimals ?? 2;
  const parts = [];
  if (Number.isFinite(item.high)) parts.push(`高 ${fmtPrice(item.high, d)}`);
  if (Number.isFinite(item.low)) parts.push(`低 ${fmtPrice(item.low, d)}`);
  if (!parts.length && Number.isFinite(item.prevClose)) {
    parts.push(`${item.priceBasis === 'settle' ? '昨结算' : '昨收'} ${fmtPrice(item.prevClose, d)}`);
  }
  return parts.join(' / ');
}

function prettySource(src) {
  if (!src) return '—';
  return src
    .replace(/^sina:/, '新浪 ')
    .replace(/^eastmoney:/, '东财 ')
    .replace(/^binance:/, 'Binance ')
    .replace(/^coinbase:/, 'Coinbase ')
    .replace(/^gold-api:/, 'gold-api ');
}

/* ------------------------------ 渲染 ------------------------------ */

function buildRow(item) {
  const el = document.createElement('article');
  el.className = 'row skeleton';
  el.dataset.id = item.id;
  el.innerHTML = `
    <div class="id">
      <div class="name">${esc(item.name)}</div>
      <div class="sub">${esc(item.sub)}</div>
      <div class="extras" data-f="extras"></div>
    </div>
    <div class="price">
      <div class="value" data-f="price">—</div>
      <div class="unit">${esc(item.unit)}</div>
    </div>
    <div class="delta">
      <span class="pct" data-f="pct">—</span>
      <span class="abs" data-f="abs"></span>
    </div>
    <div class="spark" data-f="spark"></div>
    <div class="meta">
      <span class="fresh" data-f="fresh" title=""></span>
      <span data-f="metaline"></span>
      <span class="stale-tag" data-f="stale">数据过期</span>
      <span class="err" data-f="err"></span>
    </div>
  `;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${item.name} 详情`);
  el.addEventListener('click', (e) => {
    const hit = e.target.closest('[data-detail-id]');
    const id = hit ? hit.dataset.detailId : item.id;
    location.hash = `#/d/${encodeURIComponent(id)}`;
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      location.hash = `#/d/${encodeURIComponent(item.id)}`;
    }
  });

  const q = (f) => el.querySelector(`[data-f="${f}"]`);
  const ref = {
    el,
    price: q('price'),
    pct: q('pct'),
    abs: q('abs'),
    spark: q('spark'),
    metaline: q('metaline'),
    extras: q('extras'),
    stale: q('stale'),
    fresh: q('fresh'),
    err: q('err'),
    unitEl: el.querySelector('.unit'),
    nameEl: el.querySelector('.name'),
    subEl: el.querySelector('.sub'),
    lastPrice: null,
  };
  refs.set(item.id, ref);
  return el;
}

/** 渲染卡片内的附加报价（如原油行里的布伦特） */
function renderExtras(host, item, decimals) {
  const list = Array.isArray(item.extras) ? item.extras : [];
  if (!list.length) {
    host.textContent = '';
    host.style.display = 'none';
    return;
  }
  host.style.display = '';
  host.innerHTML = list
    .map((ex) => {
      const has = ex.price != null && Number.isFinite(ex.price);
      const d = decimals ?? 2;
      const ed = dirOf(ex.changePct);
      const cls = ex.ok === false ? ' extra-dead' : '';
      const tip = ex.source
        ? `${prettySource(ex.source)}${ex.sessionTime ? ` · 行情 ${ex.sessionTime}` : ''}`
        : (ex.error ?? '');
      const price = has ? fmtPrice(ex.price, d) : '—';
      const pct = has ? fmtPct(ex.changePct) : '—';
      return `<span class="extra${cls}" data-detail-id="${esc(ex.id)}" title="${esc(tip)}　点击查看详情">
        <em>${esc(ex.name)}</em>
        <b>${price}</b>
        <i class="${has ? ed : 'flat'}">${pct}</i>
      </span>`;
    })
    .join('');
}

function updateRow(item) {
  const ref = refs.get(item.id);
  if (!ref) return;

  const d = item.decimals ?? 2;
  const dir = dirOf(item.changePct);
  const ok = item.ok !== false;

  ref.el.dataset.dir = dir;
  ref.el.classList.remove('skeleton');
  ref.el.classList.toggle('is-error', !ok && !item.stale);
  ref.el.classList.toggle('is-stale', !!item.stale);

  if (item.name && ref.nameEl.textContent !== item.name) ref.nameEl.textContent = item.name;
  if (item.sub && ref.subEl.textContent !== item.sub) ref.subEl.textContent = item.sub;
  if (item.unit && ref.unitEl.textContent !== item.unit) ref.unitEl.textContent = item.unit;

  ref.price.textContent = fmtPrice(item.price, d);
  ref.pct.textContent = fmtPct(item.changePct);
  ref.abs.textContent = fmtSigned(item.change, d);

  // 价格变化时闪一下
  if (ref.lastPrice != null && Number.isFinite(item.price) && item.price !== ref.lastPrice) {
    const cls = item.price > ref.lastPrice ? 'tick-up' : 'tick-down';
    ref.el.classList.remove('tick-up', 'tick-down');
    void ref.el.offsetWidth;
    ref.el.classList.add(cls);
    setTimeout(() => ref.el.classList.remove(cls), 750);
  }
  if (Number.isFinite(item.price)) ref.lastPrice = item.price;

  ref.spark.innerHTML = sparklineSVG(item.history, dir);

  renderExtras(ref.extras, item, d);

  const parts = [];
  const range = metaRange(item);
  if (range) parts.push(range);
  const src = prettySource(item.source);
  if (src && src !== '—') parts.push(src);
  if (item.sessionTime) parts.push(`行情 ${item.sessionTime}`);
  if (item.historyNote) parts.push(item.historyNote);
  ref.metaline.textContent = parts.join(' · ');

  const f = item.freshness;
  if (ref.fresh) {
    if (!ok || !f) {
      ref.fresh.textContent = '';
      ref.fresh.className = 'fresh';
    } else {
      ref.fresh.textContent = freshShort(f);
      ref.fresh.className = `fresh lv-${f.level}${f.suspect ? ' suspect' : ''}`;
      ref.fresh.title = [
        f.dataTime ? `源数据时点 ${new Date(f.dataTime).toLocaleString('zh-CN', { hour12: false })}` : '源未提供时间戳',
        f.ageMs != null ? `距今 ${f.label}` : '',
        f.suspectNote ?? '',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
  if (f?.suspect) ref.el.classList.add('suspect');
  else ref.el.classList.remove('suspect');

  ref.err.textContent = !ok && item.error ? `取数失败：${item.error}` : '';
}

let quotesCache = null; // 最近一次报价，供地图等模块复用

/** 新鲜度短标签：秒/分/时/天，一眼能看出数据有多旧 */
function freshShort(f) {
  if (!f) return '—';
  if (f.label === '实时推送') return '实时';
  if (f.ageMs == null) return '—';
  const s = Math.max(0, Math.round(f.ageMs / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function apply(data) {
  ttl = Number(data.ttlMs) || 15000;
  quotesCache = data.items ?? [];

  const order = [];
  for (const item of data.items ?? []) {
    order.push(item.id);
    if (!refs.has(item.id)) rowsEl.appendChild(buildRow(item));
    updateRow(item);
  }

  // 后端若改变标的集合，清掉多余的卡片
  for (const [id, ref] of refs) {
    if (!order.includes(id)) {
      ref.el.remove();
      refs.delete(id);
    }
  }

  if (mapEl && !mapEl.hidden) renderMap(); // 报价更新后同步刷新地图节点

  const failed = (data.items ?? []).filter((i) => i.ok === false).length;
  const stamp = data.generatedAt ? clockText(new Date(data.generatedAt)) : clockText();
  updatedEl.textContent = failed ? `更新于 ${stamp} · ${failed} 项异常` : `更新于 ${stamp}`;

  rowsEl.setAttribute('aria-busy', 'false');
}

function renderSkeleton() {
  rowsEl.innerHTML = '';
  refs.clear();
  for (const item of PLACEHOLDER) rowsEl.appendChild(buildRow(item));
  rowsEl.setAttribute('aria-busy', 'true');
}


/* ================================================================== *
 * 详情页
 * ================================================================== */

const detailEl = document.getElementById('detail');
const listEl = rowsEl;
let detailTimer = null;
let detailState = null; // { id, data, period, tableRows }

const WEEK_MS = 7 * 86400000;

/** 按区间截取日线：默认展示全部历史 */
function sliceByRange(daily, range) {
  if (!daily.length || !range || range === 'all') return daily;
  const days = range === '1y' ? 365 : range === '3y' ? 1095 : range === '5y' ? 1825 : 0;
  if (!days) return daily;
  const lastTs = Date.parse(daily[daily.length - 1][0]);
  const cut = lastTs - days * 86400000;
  const kept = daily.filter((r) => Date.parse(r[0]) >= cut);
  return kept.length >= 2 ? kept : daily;
}

/** 内外盘对照（国内金价专有） */
function goldSpreadBlock(derived, decimals) {
  if (!derived || !(derived.convertedPerGram > 0)) return '';
  const diff = derived.premiumPct;
  const items = [
    ['国际金价 XAU/USD', `${fmtPrice(derived.xauUsd, decimals)} 美元/盎司`],
    ['在岸美元人民币', derived.usdCny?.toFixed(4) ?? null],
    ['折合人民币', `${fmtPrice(derived.convertedPerGram, decimals)} 元/克`],
    ['上金所 Au99.99', `${fmtPrice(derived.domesticPrice, decimals)} 元/克`],
  ].filter(([, v]) => v);
  return `<section class="d-block">
    <h3>内外盘对照 <span class="h3-note">国际金价 ÷ ${derived.gramsPerOunce} 克/盎司 × 汇率，再与上金所现货比较</span></h3>
    <div class="d-metrics">
      ${items
        .map(([label, value]) => `<div class="metric"><span class="m-label">${esc(label)}</span><span class="m-value">${esc(value)}</span></div>`)
        .join('')}
      ${
        diff != null
          ? `<div class="metric ${dirOf(diff)}"><span class="m-label">内外价差</span><span class="m-value">${diff > 0 ? '+' : ''}${diff.toFixed(2)}%</span></div>`
          : ''
      }
    </div>
  </section>`;
}

/** 把日K聚合成周K / 月K：输入 [[date,o,c,h,l,vol,amt,pct],...] */
function aggregateDaily(daily, mode) {
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
function logTicks(min, max) {
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
function sma(series, n) {
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
function niceAxis(min, max, ticks = 4) {
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
function chartSVG(points, opts = {}) {
  const {
    width = 920,
    height = 260,
    decimals = 2,
    dir = 'flat',
    useLog = false,
    overlays = [],
    events = [],
    monthMode = false,
  } = opts;
  if (!points || points.length < 2) {
    return '<div class="chart-empty">没有足够的历史数据</div>';
  }
  const padL = 6;
  const padR = 62;
  const padT = 16;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = points.map((p) => p.v);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

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

  const x = (i) => padL + (i / (points.length - 1)) * innerW;
  const y = (v) => padT + innerH - ((tf(v) - axisMin) / axisSpan) * innerH;

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
  </svg>`;
}

/** 成交量副图：与主图共用 x 轴刻度，柱子按当日涨跌着色 */
function volumeSVG(bars, opts = {}) {
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
function intradaySVG(points, opts = {}) {
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

function fmtVolume(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万`;
  return String(Math.round(v));
}

function fmtAmount(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} 万亿`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万`;
  return String(Math.round(v));
}

/** 指标网格 */
function metricCards(data) {
  const d = data.decimals;
  const q = data.quote ?? {};
  const x = data.ext ?? {};
  const s = data.stats ?? {};
  const cards = [];
  const add = (label, value, cls = '') => {
    if (value == null || value === '') return;
    cards.push(`<div class="metric ${cls}"><span class="m-label">${label}</span><span class="m-value">${value}</span></div>`);
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
      'RV20 实现波动',
      `${s.rv20.toFixed(1)}%${pct != null ? ` · ${s.volRegime ?? ''} ${pct.toFixed(0)} 分位` : ''}`,
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
    add('最大回撤', `${s.maxDrawdown.pct.toFixed(1)}%`, 'down');
  }
  if (s.bestDay) add('单日最大涨', `${s.bestDay.pct.toFixed(2)}%`, 'up');
  if (s.worstDay) add('单日最大跌', `${s.worstDay.pct.toFixed(2)}%`, 'down');
  if (s.streak) add('连续涨跌', s.streak > 0 ? `连涨 ${s.streak} 日` : `连跌 ${Math.abs(s.streak)} 日`, s.streak > 0 ? 'up' : 'down');

  return `<div class="d-metrics">${cards.join('')}</div>`;
}

function perfChips(stats) {
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
  return `<div class="d-perf">${items
    .map(([label, v]) => `<span class="perf-chip ${dirOf(v)}"><em>${label}</em><b>${fmtPct(v)}</b></span>`)
    .join('')}</div>`;
}

function crossCheckTable(list, decimals) {
  if (!list || list.length < 2) return '';
  const base = list[0].price;
  const rows = list
    .map((c) => {
      const diff = base && c.price ? ((c.price - base) / base) * 100 : null;
      return `<tr>
        <td class="mono">${esc(prettySource(c.source))}</td>
        <td class="mono num">${fmtPrice(c.price, decimals)}</td>
        <td class="mono num ${diff != null ? dirOf(diff) : ''}">${diff != null ? fmtPct(diff) : '—'}</td>
        <td class="dim">${esc(c.note ?? '')}</td>
      </tr>`;
    })
    .join('');
  return `<section class="d-block">
    <h3>多源对照 <span class="h3-note">同一标的不同数据源的取价一致性</span></h3>
    <table class="d-table"><thead><tr><th>数据源</th><th class="num">取价</th><th class="num">与主源偏差</th><th>说明</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function historyTable(daily, decimals, tableRows) {
  if (!daily.length) return '';
  const rows = daily.slice(-tableRows).reverse();
  const body = rows
    .map((r) => {
      const [date, open, close, high, low, volume, , pct] = r;
      return `<tr>
        <td class="mono">${esc(date)}</td>
        <td class="mono num">${fmtPrice(open, decimals)}</td>
        <td class="mono num">${fmtPrice(high, decimals)}</td>
        <td class="mono num">${fmtPrice(low, decimals)}</td>
        <td class="mono num">${fmtPrice(close, decimals)}</td>
        <td class="mono num ${pct != null ? dirOf(pct) : ''}">${pct != null ? fmtPct(pct) : '—'}</td>
        <td class="mono num dim">${fmtVolume(volume) ?? '—'}</td>
      </tr>`;
    })
    .join('');
  const more = tableRows < daily.length;
  return `<section class="d-block">
    <h3>历史日线 <span class="h3-note">共 ${daily.length} 个交易日，按时间倒序</span></h3>
    <div class="table-wrap">
      <table class="d-table hist-table">
        <thead><tr><th>日期</th><th class="num">开盘</th><th class="num">最高</th><th class="num">最低</th><th class="num">收盘</th><th class="num">涨跌幅</th><th class="num">成交量</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${more ? `<button type="button" class="more-btn" id="more-rows">再显示 30 行</button>` : ''}
  </section>`;
}

/** 同时采集到的其他历史源（用于说明「全网采集」的广度） */
function altSources(history) {
  const alts = (history.alternatives ?? []).filter(
    (a) => a.source && a.source !== history.source && a.count > 0,
  );
  if (!alts.length) return '';
  const text = alts.map((a) => `${prettySource(a.source)} ${a.count} 条`).join('、');
  return `<span>同时采集：${esc(text)}</span>`;
}

function renderDetail(data) {
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
  const relatedEvents = (calendarCache?.events ?? []).filter(
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

  detailEl.innerHTML = `
    <div class="d-top">
      <button type="button" class="back-btn" id="back">← 返回列表</button>
      <div class="d-id">
        <h2>${esc(data.name)}</h2>
        <p>${esc(data.sub)} · ${esc(data.unit)}</p>
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
            ? `<span class="mkt-badge ${data.marketStatus.open ? 'open' : 'closed'}">${esc(data.marketStatus.label)}</span><span class="sep">·</span>`
            : ''
        }
        ${q.sessionTime ? `<span>行情 ${esc(q.sessionTime)}</span><span class="sep">·</span>` : ''}
        <span>${esc(prettySource(q.source))}</span>
        ${q.stale ? '<span class="stale-tag">数据过期</span>' : ''}
      </div>
    </div>

    ${perfChips(data.stats)}

    <section class="d-block">
      <div class="chart-head">
        <h3>历史走势 <span class="h3-note">${esc(ranged[0]?.[0] ?? '')} ~ ${esc(data.history.endDate ?? '')} · ${ranged.length} 条</span></h3>
        <div class="chart-controls">
          <div class="seg" id="range-seg">
            ${[
              ['1y', '1年'],
              ['3y', '3年'],
              ['5y', '5年'],
              ['all', '全部'],
            ]
              .map(([k, label]) => `<button type="button" data-r="${k}" class="${range === k ? 'on' : ''}">${label}</button>`)
              .join('')}
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
        </div>
      </div>
      <div class="chart-legend">
        <span><i style="background:${chartDir === 'up' ? 'var(--up)' : chartDir === 'down' ? 'var(--down)' : 'var(--flat)'}"></i>收盘</span>
        ${
          showMA
            ? `<span><i style="background:#5b9cf8"></i>MA20</span><span><i style="background:#e0a83c"></i>MA60</span>`
            : ''
        }
        ${
          eventKinds.length
            ? `<span class="legend-events">${eventKinds
                .map((k) => `<i class="evt-swatch k-${k}"></i>${esc(EVENT_KIND_LABEL[k] ?? k)}`)
                .join('')}</span>`
            : ''
        }
        ${showLog ? '<span class="legend-note">对数坐标</span>' : ''}
      </div>
      ${chartSVG(points, {
        width: chartW,
        height: chartH,
        decimals: d,
        dir: chartDir,
        useLog: showLog,
        overlays,
        events: drawnEvents,
        monthMode,
      })}
      ${volumeSVG(
        series.map((r) => ({ v: r[5], pct: r[7] })),
        { width: chartW, height: Math.round(chartH * 0.26), decimals: d },
      )}
    </section>

    ${
      data.intraday?.points?.length
        ? `<section class="d-block">
            <h3>当日分时 <span class="h3-note">${esc(data.intraday.date ?? '')} · ${data.intraday.points.length} 个点</span></h3>
            ${intradaySVG(data.intraday.points, { width: chartW, height: intraH, decimals: d, prevClose: q.prevClose })}
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
      <span>历史数据：${esc(prettySource(data.history.source ?? ''))}${data.history.code ? ` · ${esc(data.history.code)}` : ''} · ${data.history.count} 个交易日（${esc(data.history.startDate ?? '')} ~ ${esc(data.history.endDate ?? '')}）</span>
      ${altSources(data.history)}
      <span>生成于 ${clockText(new Date(data.generatedAt))}</span>
    </footer>
  `;

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

  document.getElementById('more-rows')?.addEventListener('click', () => {
    detailState.tableRows += 30;
    renderDetail(detailState.data);
  });
}

function renderDetailError(id, message) {
  detailEl.innerHTML = `
    <div class="d-top">
      <button type="button" class="back-btn" id="back">← 返回列表</button>
      <div class="d-id"><h2>${esc(id)}</h2><p>详情加载失败</p></div>
    </div>
    <div class="d-error">${esc(message)}</div>
  `;
  document.getElementById('back')?.addEventListener('click', () => {
    location.hash = '';
  });
}

async function loadDetail(id, { force = false } = {}) {
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
      detailState = { id, data, period: 'day', range: 'all', scale: 'lin', ma: true, tableRows: 30 };
    } else {
      detailState.data = data;
    }
    if (location.hash.startsWith('#/d/')) renderDetail(detailState.data);
  } catch (err) {
    renderDetailError(id, err?.message ?? String(err));
  }
}

function stopDetailTimer() {
  if (detailTimer) {
    clearInterval(detailTimer);
    detailTimer = null;
  }
}

function route() {
  const isMap = location.hash.startsWith('#/map');
  if (isMap) {
    listEl.hidden = true;
    detailEl.hidden = true;
    detailEl.innerHTML = '';
    macroEl.hidden = true;
    macroEl.innerHTML = '';
    eventsEl.hidden = true;
    eventsEl.innerHTML = '';
    stopDetailTimer();
    stopEventsTimer();
    stopMapTimer();
    mapEl.hidden = false;
    window.scrollTo({ top: 0 });
    loadMap();
    mapTimer = setInterval(() => loadMap(), 30000);
    return;
  }
  stopMapTimer();
  if (mapEl) {
    mapEl.hidden = true;
    mapEl.innerHTML = '';
  }

  const isEvents = location.hash.startsWith('#/events');
  if (isEvents) {
    listEl.hidden = true;
    detailEl.hidden = true;
    detailEl.innerHTML = '';
    macroEl.hidden = true;
    macroEl.innerHTML = '';
    stopDetailTimer();
    stopEventsTimer();
    eventsEl.hidden = false;
    window.scrollTo({ top: 0 });
    loadEvents(true);
    eventsTimer = setInterval(() => loadEvents(false), 30000);
    return;
  }
  stopEventsTimer();
  eventsEl.hidden = true;
  eventsEl.innerHTML = '';

  const isMacro = location.hash.startsWith('#/macro');
  if (isMacro) {
    listEl.hidden = true;
    detailEl.hidden = true;
    detailEl.innerHTML = '';
    stopDetailTimer();
    macroEl.hidden = false;
    window.scrollTo({ top: 0 });
    loadMacro(macroState?.window ?? 250, true);
    return;
  }
  macroEl.hidden = true;
  macroEl.innerHTML = '';
  const m = /^#\/d\/(.+)$/.exec(location.hash);
  if (m) {
    const id = decodeURIComponent(m[1]);
    listEl.hidden = true;
    detailEl.hidden = false;
    window.scrollTo({ top: 0 });
    if (!detailState || detailState.id !== id) {
      detailState = { id, data: null, period: 'day', range: 'all', scale: 'lin', ma: true, tableRows: 30 };
      detailEl.innerHTML = '<div class="d-loading">正在加载历史数据…</div>';
    }
    loadDetail(id, true);
    stopDetailTimer();
    detailTimer = setInterval(() => loadDetail(id, false), 30000);
  } else {
    stopDetailTimer();
    detailEl.hidden = true;
    detailEl.innerHTML = '';
    listEl.hidden = false;
    detailState = null;
  }
}

window.addEventListener('hashchange', route);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (!detailEl.hidden || !macroEl.hidden || !eventsEl.hidden || (mapEl && !mapEl.hidden))) {
    location.hash = '';
  }
});


/* ================================================================== *
 * 宏观关联看板：相关性矩阵 / 领先滞后 / 滚动相关性 / 归一化对比
 * ================================================================== */

import { WORLD_COUNTRIES, MAP_SIZE } from './worldmap.js';

const macroEl = document.getElementById('macro');
let macroState = null; // { data, window, pair: [a, b], picked: Set, robustOnly }

/** 前端用的 Pearson（与后端同口径） */
function pearsonJS(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** 相关系数 → 背景色（正值暖色 / 负值冷色，与涨跌红绿区分开） */
function corrBg(c) {
  if (c == null || !Number.isFinite(c)) return 'rgba(255,255,255,0.035)';
  const a = Math.min(1, Math.abs(c));
  const alpha = (a * 0.7 + 0.05).toFixed(3);
  return c >= 0 ? `rgba(245,69,92,${alpha})` : `rgba(91,156,248,${alpha})`;
}

function corrCellClass(c) {
  if (c == null) return 'na';
  return Math.abs(c) >= 0.6 ? 'strong' : Math.abs(c) >= 0.3 ? 'mid' : 'weak';
}

function rollingCorrJS(a, b, win = 40) {
  const out = [];
  for (let i = 0; i < a.length; i += 1) {
    if (i < win - 1) {
      out.push(null);
      continue;
    }
    const xs = [];
    const ys = [];
    for (let k = i - win + 1; k <= i; k += 1) {
      if (a[k] != null && b[k] != null) {
        xs.push(a[k]);
        ys.push(b[k]);
      }
    }
    out.push(xs.length >= Math.max(12, Math.floor(win * 0.6)) ? pearsonJS(xs, ys) : null);
  }
  return out;
}

/** 收益率累乘 → 归一化到 100 的走势 */
/** 10Y 美债修正久期：把收益率基点变动折算成债券价格的近似百分比变动 */
const BOND_DURATION_10Y = 8;

/**
 * 收益率变动 → 可与其他资产同轴比较的「价格收益率」。
 * 利率类标的给的是百分点差（0.05 = 5bps），不能直接 exp()：
 * 一是量纲差 100 倍（累计上行 100bps 会变成 +171.8%，把其他曲线全压扁），
 * 二是方向反了（收益率上行 = 债券价格下跌）。
 * 按久期近似 ΔP/P ≈ −D·Δy 折算，利率上行就画成下跌。
 */
function changeToReturn(c, kind) {
  if (kind === 'rate') return (-BOND_DURATION_10Y * c) / 100;
  return c;
}

/** 收益率累乘 → 归一化到 100 的走势 */
function normalizeTo100(changes, kind = 'price') {
  let v = 100;
  let started = false;
  return changes.map((c) => {
    // 序列开头还没有有效值时才留 null（那条线确实还没开始）
    if (!started) {
      if (c == null || !Number.isFinite(c)) return null;
      started = true;
      v *= Math.exp(changeToReturn(c, kind));
      return v;
    }
    // 中途的 null 来自各市场交易日历不一致（A 股休市、美股开市）。
    // 直接返回 null 会让 multiLineSVG 把线切成几十段，所以休市日保持前值，
    // 这也是归一化对比的标准做法：没有新收益 = 曲线不动。
    if (c == null || !Number.isFinite(c)) return v;
    v *= Math.exp(changeToReturn(c, kind));
    return v;
  });
}

/** 多线图：共用 y 轴（已归一化），支持 null 断点 */
function multiLineSVG(series, opts = {}) {
  const { width = 920, height = 240, labels = [] } = opts;
  const valid = series.filter((s) => s.values.some((v) => v != null));
  if (!valid.length) return '<div class="chart-empty">暂无数据</div>';

  const padL = 6;
  const padR = 56;
  const padT = 14;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const all = valid.flatMap((s) => s.values.filter((v) => v != null));
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (max === min) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.06;
  min -= pad;
  max += pad;
  const span = max - min || 1;

  const n = Math.max(...valid.map((s) => s.values.length));
  const x = (i) => padL + (i / Math.max(1, n - 1)) * innerW;
  const y = (v) => padT + innerH - ((v - min) / span) * innerH;

  let grid = '';
  for (let i = 0; i <= 4; i += 1) {
    const v = min + (span * i) / 4;
    const gy = y(v).toFixed(2);
    grid += `<line x1="${padL}" y1="${gy}" x2="${padL + innerW}" y2="${gy}" class="grid-line" />`;
    grid += `<text x="${width - 6}" y="${gy}" class="axis-text" text-anchor="end" dominant-baseline="middle">${v.toFixed(0)}</text>`;
  }

  let paths = '';
  for (const s of valid) {
    let d = '';
    let started = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        started = false;
        return;
      }
      d += `${started ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
      started = true;
    });
    if (d) paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-linejoin="round" />`;
  }

  let xlabels = '';
  const count = Math.min(4, labels.length);
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round((i / Math.max(1, count - 1)) * (labels.length - 1));
    const anchor = i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle';
    xlabels += `<text x="${x(idx).toFixed(2)}" y="${height - 7}" class="axis-text" text-anchor="${anchor}">${esc(labels[idx] ?? '')}</text>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="归一化走势对比">
    ${grid}${paths}${xlabels}
  </svg>`;
}

const LINE_COLORS = ['#f5455c', '#5b9cf8', '#e0a83c', '#0ecb81', '#a78bfa', '#22d3ee'];

function macroMatrixHTML(data) {
  const { ids, corr, counts, stats } = data.matrix;
  const meta = new Map(data.universe.map((u) => [u.id, u]));
  const pair = macroState.pair;
  const robustOnly = Boolean(macroState.robustOnly);

  // 统计索引：a|b → 该对的完整检验结果
  const stMap = new Map();
  for (const r of stats ?? []) {
    stMap.set(`${r.a}|${r.b}`, r);
    stMap.set(`${r.b}|${r.a}`, r);
  }

  let head = '<tr><th class="corner">标的</th>';
  for (const id of ids) {
    const m = meta.get(id);
    head += `<th title="${esc(m?.name ?? id)}"><span>${esc(m?.short ?? id)}</span></th>`;
  }
  head += '</tr>';

  let body = '';
  ids.forEach((rid, i) => {
    const rm = meta.get(rid);
    body += `<tr><th class="row-head" title="${esc(rm?.name ?? rid)}">${esc(rm?.short ?? rid)}</th>`;
    ids.forEach((cid, j) => {
      const c = corr[i][j];
      const n = counts[i][j];
      const st = stMap.get(`${rid}|${cid}`);
      const isSelf = rid === cid;
      const active = pair && ((pair[0] === rid && pair[1] === cid) || (pair[0] === cid && pair[1] === rid));

      // 「仅稳健」模式下，把通不过 BH 校正或样本内外翻转的格子压暗
      const dim = robustOnly && !isSelf && st && !(st.significantBH && st.stable);

      const text = c == null ? '—' : c.toFixed(2);
      const star = !isSelf && st?.significantBH ? '<i class="sig">*</i>' : '';
      const ci = st?.ci ? `95%CI [${st.ci.lo.toFixed(2)}, ${st.ci.hi.toFixed(2)}]` : '';
      const tip = isSelf
        ? `${rm?.short ?? rid}（n=${n ?? '—'}）`
        : [
            `${rm?.short ?? rid} ~ ${meta.get(cid)?.short ?? cid}：${text}`,
            `n=${n ?? '—'}`,
            ci,
            st ? `朴素 p=${(st.p ?? 1).toFixed(4)}` : '',
            st ? `NW p=${(st.pNW ?? 1).toFixed(4)}` : '',
            st ? `BH q=${(st.q ?? 1).toFixed(4)}${st.significantBH ? ' ✓' : ' ✗'}` : '',
            st && st.inR != null ? `样本内 ${st.inR.toFixed(2)} / 外 ${st.outR.toFixed(2)}${st.stable ? ' 同号' : ' 翻转'}` : '',
          ]
            .filter(Boolean)
            .join('\n');

      body += `<td class="corr ${corrCellClass(c)}${active ? ' active' : ''}${dim ? ' dim' : ''}"
        style="background:${corrBg(c)}"
        data-a="${esc(rid)}" data-b="${esc(cid)}"
        title="${esc(tip)}">${text}${star}</td>`;
    });
    body += '</tr>';
  });

  const sig = (stats ?? []).filter((r) => r.significantBH).length;
  const stable = (stats ?? []).filter((r) => r.significantBH && r.stable).length;
  const total = (stats ?? []).length;

  return `<div class="matrix-wrap">
    <table class="corr-matrix"><thead>${head}</thead><tbody>${body}</tbody></table>
  </div>
  <div class="stat-bar">
    <span class="stat-note">
      <b>*</b> 通过 Benjamini-Hochberg 多重比较校正（q&lt;0.05）：<b>${sig}/${total}</b> 对，
      其中样本内外同号 <b>${stable}</b> 对
    </span>
    <label class="stat-toggle">
      <input type="checkbox" id="robust-only" ${robustOnly ? 'checked' : ''} />
      <span>只看统计稳健</span>
    </label>
  </div>`;
}

function macroLeadLagHTML(data) {
  const meta = new Map(data.universe.map((u) => [u.id, u]));
  const unit = data.freq === 'week' ? '周' : '日';
  const rows = (data.leadLag ?? []).slice(0, 12);
  if (!rows.length) return '<div class="chart-empty">当前窗口没有明显的领先滞后关系</div>';
  return `<table class="d-table">
    <thead><tr><th>领先方</th><th>跟随方</th><th class="num">滞后</th><th class="num">滞后相关</th><th class="num">同期相关</th><th class="num" title="Benjamini-Hochberg 校正后的 q 值">BH q</th><th class="num">样本</th></tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr>
      <td>${esc(meta.get(r.leader)?.short ?? r.leader)}</td>
      <td>${esc(meta.get(r.follower)?.short ?? r.follower)}</td>
      <td class="mono num">${r.lag} ${unit}</td>
      <td class="mono num ${r.corr >= 0 ? 'corr-pos' : 'corr-neg'}">${r.corr.toFixed(3)}${r.significantBH ? '<i class="sig">*</i>' : ''}</td>
      <td class="mono num dim">${r.sameDay?.toFixed(3) ?? '—'}</td>
      <td class="mono num dim">${r.q != null ? r.q.toFixed(3) : '—'}</td>
      <td class="mono num dim">${r.n}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function macroPairSection(data) {
  const changes = data.recent?.changes ?? {};
  const dates = data.recent?.dates ?? [];
  const pair = macroState.pair;
  if (!pair || !changes[pair[0]] || !changes[pair[1]]) {
    return '<div class="chart-empty">点上方矩阵里的任意格子，查看这两个标的的滚动相关性</div>';
  }
  const meta = new Map(data.universe.map((u) => [u.id, u]));
  const a = changes[pair[0]];
  const b = changes[pair[1]];
  const roll = rollingCorrJS(a, b, 40);
  const points = roll.map((v, i) => ({ v, label: dates[i] })).filter((p) => p.v != null);
  const current = points[points.length - 1]?.v;

  const chartW = Math.max(300, Math.round(macroEl.clientWidth - 40));
  const chartH = Math.round(Math.min(260, Math.max(150, chartW * 0.22)));

  return `<div class="pair-head">
      <span class="pair-name">${esc(meta.get(pair[0])?.name ?? pair[0])} ~ ${esc(meta.get(pair[1])?.name ?? pair[1])}</span>
      ${current != null ? `<span class="pair-now ${dirOf(current)}">当前 40 ${data.freq === 'week' ? '周' : '日'}滚动相关性 ${current.toFixed(3)}</span>` : ''}
    </div>
    <div class="chart-legend"><span><i style="background:${current != null && current > 0 ? 'var(--up)' : '#5b9cf8'}"></i>40 ${data.freq === 'week' ? '周' : '日'}滚动相关性（-1 ~ +1）</span></div>
    ${richRollingSVG(points, { width: chartW, height: chartH })}`;
}

/** 滚动相关性折线：以 0 为中线，正负分色 */
function richRollingSVG(points, opts = {}) {
  const { width = 900, height = 200 } = opts;
  if (points.length < 2) return '<div class="chart-empty">样本不足</div>';
  const padL = 6;
  const padR = 52;
  const padT = 12;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const x = (i) => padL + (i / (points.length - 1)) * innerW;
  const y = (v) => padT + innerH / 2 - (v / 1) * (innerH / 2);

  let grid = '';
  for (const v of [1, 0.5, 0, -0.5, -1]) {
    const gy = y(v).toFixed(2);
    grid += `<line x1="${padL}" y1="${gy}" x2="${padL + innerW}" y2="${gy}" class="${v === 0 ? 'base-line' : 'grid-line'}" />`;
    grid += `<text x="${width - 6}" y="${gy}" class="axis-text" text-anchor="end" dominant-baseline="middle">${v > 0 ? '+' : ''}${v.toFixed(1)}</text>`;
  }

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  const last = points[points.length - 1];
  const stroke = last.v >= 0 ? 'var(--up)' : '#5b9cf8';

  let labels = '';
  const cnt = Math.min(4, points.length);
  for (let i = 0; i < cnt; i += 1) {
    const idx = Math.round((i / Math.max(1, cnt - 1)) * (points.length - 1));
    const anchor = i === 0 ? 'start' : i === cnt - 1 ? 'end' : 'middle';
    labels += `<text x="${x(idx).toFixed(2)}" y="${height - 6}" class="axis-text" text-anchor="${anchor}">${esc(points[idx].label ?? '')}</text>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="滚动相关性">
    ${grid}
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" />
    <circle cx="${x(points.length - 1).toFixed(2)}" cy="${y(last.v).toFixed(2)}" r="2.6" fill="${stroke}" />
    ${labels}
  </svg>`;
}

function macroCompareHTML(data) {
  const changes = data.recent?.changes ?? {};
  const dates = data.recent?.dates ?? [];
  const picked = [...(macroState.picked ?? [])];
  if (!picked.length) return '<div class="chart-empty">勾选上面的标的后看归一化对比</div>';
  const meta = new Map(data.universe.map((u) => [u.id, u]));
  const series = picked.slice(0, LINE_COLORS.length).map((id, i) => {
    const u = meta.get(id);
    return {
      id,
      name: u?.short ?? id,
      color: LINE_COLORS[i],
      kind: u?.kind ?? 'price',
      values: normalizeTo100(changes[id] ?? [], u?.kind ?? 'price'),
    };
  });
  const hasRate = series.some((s) => s.kind === 'rate');
  const chartW = Math.max(300, Math.round(macroEl.clientWidth - 40));
  const chartH = Math.round(Math.min(300, Math.max(170, chartW * 0.26)));
  return `<div class="chart-legend">${series
    .map(
      (s) =>
        `<span><i style="background:${s.color}"></i>${esc(s.name)}${
          s.kind === 'rate' ? '<em class="legend-badge">久期折算</em>' : ''
        }</span>`,
    )
    .join('')}<span class="legend-note">起点归一化为 100${
    hasRate ? `　·　利率按 ${BOND_DURATION_10Y} 年修正久期折算成债券价格（收益率上行＝曲线下跌）` : ''
  }</span></div>
    ${multiLineSVG(series, { width: chartW, height: chartH, labels: dates })}`;
}

function renderMacro() {
  const data = macroState.data;
  if (!data) {
    macroEl.innerHTML = '<div class="d-loading">正在采集 12 个市场的历史数据…</div>';
    return;
  }
  const ra = data.riskAppetite ?? {};
  const windows = [
    [20, '20日'],
    [60, '60日'],
    [120, '120日'],
    [250, '250日'],
    [0, '全部'],
  ];

  macroEl.innerHTML = `
    <div class="d-top">
      <button type="button" class="back-btn" id="back-macro">← 返回列表</button>
      <div class="d-id">
        <h2>世界经济关联</h2>
        <p>股 / 债 / 汇 / 商品 / 加密 / 波动率 · ${data.matrix.ids.length} 个市场 · ${data.freq === 'week' ? '周' : '日'}收益率相关性</p>
      </div>
      <div class="macro-status">
        ${
          ra.label
            ? `<span class="risk-badge ${ra.label === 'Risk-On' ? 'on' : ra.label === 'Risk-Off' ? 'off' : 'neutral'}">${esc(ra.label)}</span>
               <span class="risk-note" title="${esc(
                 `风险篮子（${(ra.riskMembers ?? []).join(' / ')}）与避险篮子（${(ra.hedgeMembers ?? []).join(' / ')}，美债按债券价格口径）各自按 60 期波动率标准化后的 Z 值均值之差。单位是标准差，不是百分比；${
                   ra.aligned ? '成员已对齐到同一交易日' : `成员日期不一致（${(ra.memberDates ?? []).join(' / ')}），存在跨日错位`
                 }`,
               )}">风险端 ${ra.risk == null ? '—' : `${ra.risk >= 0 ? '+' : ''}${ra.risk.toFixed(2)}σ`} · 避险端 ${
                 ra.hedge == null ? '—' : `${ra.hedge >= 0 ? '+' : ''}${ra.hedge.toFixed(2)}σ`
               }${ra.aligned === false ? ' · 跨日错位' : ''}</span>
               <span class="risk-note" title="VRP = VIX − 标普 500 的 20 日实现年化波动率。溢价被压缩说明保护性期权便宜、市场自满；溢价飙升说明在抢买保护。">${
                 data.vrp
                   ? `VRP ${data.vrp.vrp >= 0 ? '+' : ''}${data.vrp.vrp.toFixed(2)} · VIX ${data.vrp.vix.toFixed(2)} − RV20 ${data.vrp.rv20.toFixed(2)}`
                   : ''
               }</span>`
            : ''
        }
      </div>
    </div>

    <section class="d-block">
      <div class="chart-head">
        <h3>相关性矩阵 <span class="h3-note">红色=正相关，蓝色=负相关；越深越强</span></h3>
        <div class="seg" id="macro-freq">
          <button type="button" data-f="day" class="${(data.freq ?? 'day') === 'day' ? 'on' : ''}">日频</button>
          <button type="button" data-f="week" class="${data.freq === 'week' ? 'on' : ''}">周频</button>
        </div>
        <div class="seg" id="macro-window">
          ${windows
            .map(
              ([w, label]) =>
                `<button type="button" data-w="${w}" class="${data.windowSize === w ? 'on' : ''}">${label}</button>`,
            )
            .join('')}
        </div>
      </div>
      ${macroMatrixHTML(data)}
      <p class="macro-hint">
        点任意格子 → 下方看这两个标的的滚动相关性与走势对比。样本量按两两共同${data.freq === 'week' ? '周' : '交易日'}计算（pairwise）。
        ${
          data.freq === 'week'
            ? '周频能消除跨时区交易日切分的影响（例如国际金 ~ 沪金 日频仅 0.48，周频 0.79）。'
            : '注意：国际金 / 沪金这类跨时区标的，日频会因交易日切分点不同而低估相关性，可切「周频」对照。'
        }
      </p>
    </section>

    <section class="d-block">
      <h3>谁在影响谁 <span class="h3-note">滞后相关明显强于同期相关才计入 · <b>*</b> 表示通过 BH 校正（约 1700 个滞后组合一起校正）· 单位=${data.freq === 'week' ? '周' : '交易日'}</span></h3>
      ${macroLeadLagHTML(data)}
    </section>

    <section class="d-block">
      <h3>滚动相关性 <span class="h3-note">40 ${data.freq === 'week' ? '周' : '交易日'}窗口</span></h3>
      ${macroPairSection(data)}
    </section>

    <section class="d-block">
      <h3>归一化走势对比 <span class="h3-note">近 ${data.recent?.dates?.length ?? 0} ${data.freq === 'week' ? '周' : '交易日'}</span></h3>
      <div class="pick-row" id="macro-picks">
        ${data.universe
          .filter((u) => u.ok)
          .map(
            (u) =>
              `<button type="button" class="pick ${macroState.picked.has(u.id) ? 'on' : ''}" data-pick="${esc(u.id)}">${esc(u.short)}</button>`,
          )
          .join('')}
      </div>
      ${macroCompareHTML(data)}
    </section>

    <footer class="d-foot">
      <span>收益率口径：对数收益率（美债10年期用百分点差）· 相关性按两两共同${data.freq === 'week' ? '周' : '交易日'}计算</span>
      <span>生成于 ${clockText(new Date(data.generatedAt))}</span>
    </footer>
  `;

  document.getElementById('back-macro')?.addEventListener('click', () => {
    location.hash = '';
  });

  document.querySelectorAll('#macro-freq button').forEach((btn) => {
    btn.addEventListener('click', () => {
      macroState.freq = btn.dataset.f;
      macroState.pair = null;
      loadMacro(macroState.window ?? 250, true);
    });
  });

  document.querySelectorAll('#macro-window button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const w = Number(btn.dataset.w);
      loadMacro(w, true);
    });
  });

  document.getElementById('robust-only')?.addEventListener('change', (e) => {
    macroState.robustOnly = e.target.checked;
    renderMacro();
  });

  document.querySelectorAll('.corr-matrix td.corr').forEach((td) => {
    td.addEventListener('click', () => {
      const a = td.dataset.a;
      const b = td.dataset.b;
      if (!a || !b || a === b) return;
      macroState.pair = [a, b];
      macroState.picked = new Set([a, b]);
      renderMacro();
    });
  });

  document.querySelectorAll('#macro-picks .pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.pick;
      if (macroState.picked.has(id)) macroState.picked.delete(id);
      else if (macroState.picked.size < LINE_COLORS.length) macroState.picked.add(id);
      renderMacro();
    });
  });
}

async function loadMacro(windowSize = 250, force = false) {
  macroEl.innerHTML = '<div class="d-loading">正在采集 12 个市场的历史数据…</div>';
  try {
    const freq = macroState?.freq ?? 'day';
    const res = await fetch(
      `./api/macro?window=${windowSize}&freq=${freq}${force ? '&force=1' : ''}`,
      { cache: 'no-store' },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!macroState) macroState = { data, window: windowSize, freq: 'day', pair: null, picked: new Set() };
    macroState.data = data;
    macroState.window = windowSize;
    macroState.freq = data.freq ?? 'day';
    if (!macroState.pair && data.matrix.ids.length >= 2) {
      // 默认选中「黄金 ~ 美元」这组最常被问到的关系
      const has = (x) => data.matrix.ids.includes(x);
      macroState.pair = has('gold-intl') && has('dxy') ? ['gold-intl', 'dxy'] : [data.matrix.ids[0], data.matrix.ids[1]];
      macroState.picked = new Set(macroState.pair);
    }
    renderMacro();
  } catch (err) {
    macroEl.innerHTML = `<div class="d-top"><button type="button" class="back-btn" id="back-macro">← 返回列表</button><div class="d-id"><h2>世界经济关联</h2><p>加载失败</p></div></div><div class="d-error">${esc(err?.message ?? String(err))}</div>`;
    document.getElementById('back-macro')?.addEventListener('click', () => {
      location.hash = '';
    });
  }
}


/* ================================================================== *
 * 全球事件中心 + 宏观日历
 * ================================================================== */

const eventsEl = document.getElementById('events');
const mapEl = document.getElementById('map');
let eventsState = null; // { data, calendar, level, topic }
let eventsTimer = null;
let calendarCache = null;

const KIND_LABEL = { fomc: 'FOMC', cpi: 'CPI', nfp: '非农', ppi: 'PPI', pce: 'PCE', gdp: 'GDP', retail: '零售' };

function weekdayCN(dateStr) {
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return '';
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

async function loadCalendarCached(force = false) {
  if (!force && calendarCache) return calendarCache;
  try {
    const res = await fetch('./api/calendar', { cache: 'no-store' });
    if (res.ok) calendarCache = await res.json();
  } catch {
    /* 日历失败不影响事件流 */
  }
  return calendarCache;
}

function calendarBlockHTML(cal) {
  const upcoming = (cal?.upcoming ?? []).slice(0, 8);
  if (!upcoming.length) {
    return '<div class="chart-empty">暂无日历数据</div>';
  }
  const today = cal.today;
  return `<div class="cal-list">${upcoming
    .map((e) => {
      const isToday = e.date === today;
      const days = Math.round((new Date(`${e.date}T00:00:00+08:00`) - new Date(`${today}T00:00:00+08:00`)) / 86400000);
      const when = isToday ? '今天' : days === 1 ? '明天' : `${days} 天后`;
      return `<div class="cal-item${isToday ? ' today' : ''}">
        <span class="cal-date"><b>${e.date.slice(5)}</b><em>${weekdayCN(e.date)}</em></span>
        <span class="cal-kind k-${e.kind}">${esc(KIND_LABEL[e.kind] ?? e.kind)}</span>
        <span class="cal-title">${esc(e.title)}</span>
        <span class="cal-time">${esc(e.time)}<em>${esc(when)}</em></span>
      </div>`;
    })
    .join('')}</div>`;
}

function eventItemHTML(ev) {
  const topicChips = ev.topics
    .map((t) => `<span class="ev-topic${t.strong ? ' strong' : ''}">${esc(t.label)}</span>`)
    .join('');
  const symChips = ev.symbols
    .slice(0, 5)
    .map((s) => {
      const meta = PLACEHOLDER.find((p) => p.id === s);
      return meta ? `<span class="ev-sym">${esc(meta.short ?? meta.name)}</span>` : '';
    })
    .join('');
  const link = ev.url
    ? `<a class="ev-link" href="${esc(ev.url)}" target="_blank" rel="noreferrer noopener">原文 ↗</a>`
    : '';
  const isNew = eventsState?.newIds?.has(ev.id);
  return `<article class="event lv-${ev.level}${isNew ? ' is-new' : ''}" data-id="${esc(ev.id)}">
    <div class="ev-time">${esc(ev.time.slice(11, 16))}<em>${esc(ev.time.slice(5, 10))}</em></div>
    <div class="ev-main">
      <div class="ev-tags">
        ${ev.level === 'high' ? '<span class="ev-badge high">重要</span>' : ev.level === 'mid' ? '<span class="ev-badge mid">关注</span>' : ''}
        ${ev.llm ? '<span class="ev-ai" title="已由 LLM 做语义判定">AI</span>' : ''}
        ${isNew ? '<span class="ev-new">NEW</span>' : ''}
        ${topicChips}
      </div>
      <h4 class="ev-title">${esc(ev.title)}</h4>
      ${ev.body && ev.body !== ev.title ? `<p class="ev-body">${esc(ev.body)}</p>` : ''}
      <div class="ev-meta"><span>${esc(ev.source)}</span>${symChips ? `<span class="ev-sep">·</span>${symChips}` : ''}${link}</div>
    </div>
  </article>`;
}

function renderEvents(opts = {}) {
  const keepScroll = opts.keepScroll ? window.scrollY : null;
  const st = eventsState;
  if (!st?.data) {
    eventsEl.innerHTML = '<div class="d-loading">正在聚合全球实时快讯…</div>';
    return;
  }
  const data = st.data;
  const cal = st.calendar;
  const topics = data.topics ?? [];

  let items = data.items ?? [];
  if (st.level === 'high') items = items.filter((i) => i.level === 'high');
  if (st.topic) items = items.filter((i) => i.topics.some((t) => t.key === st.topic));

  const srcLine = (data.sources ?? [])
    .map((s) => (s.ok ? `${s.source} ${s.count}` : `${s.source} 失败`))
    .join(' · ');

  eventsEl.innerHTML = `
    <div class="d-top">
      <button type="button" class="back-btn" id="back-events">← 返回列表</button>
      <div class="d-id">
        <h2>全球事件中心</h2>
        <p>${esc(srcLine)} · 只保留对市场有影响的条目</p>
      </div>
      <div class="macro-status">
        ${
          data.llm?.enabled
            ? `<span class="llm-pill" title="关键词打底 + LLM 语义复核；${data.llm.pending ? '正在分类新的条目' : '已完成当前批次'}">AI 复核 ${data.llm.applied}/${data.total}${data.llm.pending ? ' …' : ''}</span>`
            : ''
        }
        <span class="risk-note">${data.generatedAt ? clockText(new Date(data.generatedAt)) : ''} 更新</span>
        <button type="button" class="back-btn" id="refresh-events">刷新</button>
      </div>
    </div>
    ${
      st.newCount
        ? `<button type="button" class="new-banner" id="jump-new">↑ ${st.newCount} 条新事件</button>`
        : ''
    }

    <section class="d-block">
      <h3>即将公布 <span class="h3-note">FOMC 取美联储官网，CPI/非农等取美国劳工统计局发布日程</span></h3>
      ${calendarBlockHTML(cal)}
    </section>

    <section class="d-block">
      <div class="chart-head">
        <h3>实时事件流 <span class="h3-note">共 ${data.total} 条 · 高影响 ${data.counts?.high ?? 0} 条 · 按时间倒序</span></h3>
        <div class="seg" id="level-filter">
          <button type="button" data-l="" class="${!st.level ? 'on' : ''}">全部</button>
          <button type="button" data-l="high" class="${st.level === 'high' ? 'on' : ''}">只看重要</button>
        </div>
      </div>
      <div class="pick-row" id="topic-filter">
        <button type="button" class="pick ${!st.topic ? 'on' : ''}" data-t="">全部主题</button>
        ${topics
          .map((t) => `<button type="button" class="pick ${st.topic === t.key ? 'on' : ''}" data-t="${esc(t.key)}">${esc(t.label)}</button>`)
          .join('')}
      </div>
      <div class="event-list">
        ${items.length ? items.map(eventItemHTML).join('') : '<div class="chart-empty">当前筛选下没有条目</div>'}
      </div>
    </section>

    <section class="d-block">
      <h3>事件研究 <span class="h3-note">这些日子真的更动荡吗 · 事件日 vs 普通日波动对照</span></h3>
      ${eventStudyHTML(st.study, st.studyMode ?? 'auto')}
    </section>

    <footer class="d-foot">
      <span>标签与影响等级由关键词、源重要度与 LLM 语义复核共同判定，仅供筛选参考</span>
      <span>聚合源：金十数据 / 新浪财经 / 华尔街见闻</span>
    </footer>
  `;

  document.getElementById('back-events')?.addEventListener('click', () => {
    location.hash = '';
  });
  document.getElementById('refresh-events')?.addEventListener('click', () => {
    loadEvents(true);
  });
  document.getElementById('jump-new')?.addEventListener('click', () => {
    eventsState.newIds = null;
    eventsState.newCount = 0;
    renderEvents();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.querySelectorAll('#level-filter button').forEach((btn) => {
    btn.addEventListener('click', () => {
      eventsState.level = btn.dataset.l;
      renderEvents();
    });
  });
  document.querySelectorAll('#topic-filter .pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      eventsState.topic = btn.dataset.t;
      renderEvents();
    });
  });
  // 事件研究的 T+0 / T+1 / 智能对齐 口径切换（纯前端切行，不重新请求）
  document.querySelectorAll('#study-lag button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.lag;
      eventsState.studyMode = v === 'auto' ? 'auto' : Number(v);
      renderEvents();
    });
  });

  if (keepScroll != null) window.scrollTo(0, keepScroll);
}

function stopEventsTimer() {
  if (eventsTimer) {
    clearInterval(eventsTimer);
    eventsTimer = null;
  }
}

async function loadEvents(force = false) {
  try {
    const [evRes, cal, study] = await Promise.all([
      fetch(`./api/events${force ? '?force=1' : ''}`, { cache: 'no-store' }),
      loadCalendarCached(force),
      loadEventStudy(false),
    ]);
    if (!evRes.ok) throw new Error(`HTTP ${evRes.status}`);
    const data = await evRes.json();
    if (!eventsState) eventsState = { data, calendar: cal, study, level: '', topic: '', studyMode: 'auto', newIds: null, newCount: 0 };
    eventsState.study = study;

    // 增量：只有真正「没见过」的条目才标记为 NEW，避免整页闪
    const prevIds = new Set((eventsState.data?.items ?? []).map((i) => i.id));
    const fresh = (data.items ?? []).filter((i) => !prevIds.has(i.id));

    eventsState.data = data;
    eventsState.calendar = cal;
    if (!force && prevIds.size && fresh.length) {
      eventsState.newIds = new Set(fresh.map((i) => i.id));
      eventsState.newCount = fresh.length;
    }
    if (location.hash.startsWith('#/events')) renderEvents({ keepScroll: !force });

    // LLM 是异步复核的：还在跑就稍后再拉一次，让 AI 徽章尽快出现
    if (data.llm?.pending && location.hash.startsWith('#/events')) {
      eventsState.llmRetryCount = eventsState.llmRetryCount ?? 0;
      if (eventsState.llmRetryCount < 4 && !eventsState.llmRetry) {
        eventsState.llmRetry = setTimeout(() => {
          eventsState.llmRetry = null;
          eventsState.llmRetryCount += 1;
          loadEvents(false);
        }, 7000);
      }
    } else {
      eventsState.llmRetryCount = 0;
    }
  } catch (err) {
    eventsEl.innerHTML = `<div class="d-top"><button type="button" class="back-btn" id="back-events">← 返回列表</button><div class="d-id"><h2>全球事件中心</h2><p>加载失败</p></div></div><div class="d-error">${esc(err?.message ?? String(err))}</div>`;
    document.getElementById('back-events')?.addEventListener('click', () => {
      location.hash = '';
    });
  }
}


/* ================================================================== *
 * 事件研究：日历事件日 vs 普通日的波动对照
 * ================================================================== */

const STUDY_KIND_LABEL = { fomc: 'FOMC', cpi: 'CPI', nfp: '非农', ppi: 'PPI', pce: 'PCE', gdp: 'GDP', retail: '零售' };
let studyCacheClient = null;

function ratioBg(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return 'rgba(255,255,255,0.035)';
  // 1.0 以下偏冷、以上偏暖，0.9~1.8 之间铺满色阶
  const t = Math.max(-1, Math.min(1, (ratio - 1.25) / 0.5));
  return t >= 0
    ? `rgba(245,69,92,${(t * 0.62 + 0.05).toFixed(3)})`
    : `rgba(91,156,248,${(-t * 0.62 + 0.05).toFixed(3)})`;
}

function eventStudyHTML(study, mode = 'auto') {
  if (!study?.ok) {
    return `<div class="chart-empty">${esc(study?.error ?? '暂无足够历史事件')}</div>`;
  }
  const kinds = study.kinds.map((k) => k.kind);

  /**
   * 选行口径：
   * auto —— 用后端算好的时区智能对齐（美国晚间发布的 FOMC/CPI/非农，对上证、沪金
   *          取 T+1 交易日；中国白盘数据对所有标的都是 T+0）
   * 0/1  —— 强制全市场统一口径，用于对照「忽略时区错配会看到什么」
   */
  const pickRow = (symbol, kind) => {
    const pool = study.rows.filter((r) => r.symbol === symbol && r.kind === kind);
    if (!pool.length) return null;
    if (mode === 'auto') return pool.find((r) => r.isAuto) ?? pool.find((r) => r.lag === 0) ?? null;
    return pool.find((r) => r.lag === mode) ?? null;
  };

  const symbols = [];
  const seen = new Set();
  for (const r of study.rows) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    symbols.push({ id: r.symbol, name: r.name });
  }
  const cell = new Map();
  for (const s of symbols) {
    for (const k of kinds) {
      const r = pickRow(s.id, k);
      if (r) cell.set(`${s.id}|${k}`, r);
    }
  }

  let head = '<tr><th class="corner">标的</th>';
  for (const k of kinds) {
    const info = study.kinds.find((x) => x.kind === k);
    head += `<th>${esc(STUDY_KIND_LABEL[k] ?? k)}<em>n=${info?.count ?? 0}</em></th>`;
  }
  head += '</tr>';

  let body = '';
  for (const s of symbols) {
    body += `<tr><th class="row-head">${esc(s.name)}</th>`;
    for (const k of kinds) {
      const r = cell.get(`${s.id}|${k}`);
      if (!r) {
        body += '<td class="corr na">—</td>';
        continue;
      }
      const sig = r.significant ? '*' : '';
      const lagTag = mode === 'auto' ? `T+${r.lag}` : '';
      const medRatio = r.medianRatio ?? r.ratio;
      const title =
        `${s.name} · ${STUDY_KIND_LABEL[k]}：${r.lag ? '事件后第 1 个交易日' : '事件当日'}` +
        `平均波动 ${r.eventMeanPct.toFixed(2)}%，普通日 ${r.baseMeanPct.toFixed(2)}%，` +
        `倍数 ${r.ratio.toFixed(2)}x（中位数口径 ${medRatio.toFixed(2)}x），` +
        `t=${r.t == null ? '—' : r.t.toFixed(2)}，样本 ${r.eventDays}`;
      body += `<td class="corr ${Math.abs(r.ratio - 1) > 0.3 ? 'strong' : 'mid'}"
        style="background:${ratioBg(r.ratio)}" title="${esc(title)}">${r.ratio.toFixed(2)}x${sig}${
          lagTag ? `<i class="lag-tag">${lagTag}</i>` : ''
        }</td>`;
    }
    body += '</tr>';
  }

  const top = [...cell.values()]
    .filter((r) => r.significant && r.ratio > 1)
    .sort((a, b) => Math.abs(b.t) - Math.abs(a.t))
    .slice(0, 6);

  const modeBtn = (val, label, hint) =>
    `<button type="button" data-lag="${val}" class="${String(mode) === String(val) ? 'on' : ''}" title="${esc(hint)}">${label}</button>`;

  return `<div class="chart-head study-head">
    <h3>事件研究 <span class="h3-note">这些日子真的更动荡吗 · 事件日 vs 普通日波动对照</span></h3>
    <div class="seg" id="study-lag">
      ${modeBtn('auto', '智能对齐', '美国晚间发布的宏观数据对亚太日盘资产自动取 T+1 交易日')}
      ${modeBtn('0', 'T+0', '全部按事件当日口径')}
      ${modeBtn('1', 'T+1', '全部按事件后一个交易日口径')}
    </div>
  </div>
  <div class="matrix-wrap">
    <table class="corr-matrix study-matrix"><thead>${head}</thead><tbody>${body}</tbody></table>
  </div>
  <p class="macro-hint">
    数字 = 事件日平均绝对波动 ÷ 普通日平均绝对波动（&gt;1 说明这天更动荡），带 <b>*</b> 表示 Welch t 检验 |t|&gt;1.96。
    悬停看具体数值与中位数口径。<br>
    ${
      mode === 'auto'
        ? '智能对齐：FOMC / CPI / 非农在北京时间凌晨或晚间公布时，上证与沪金当日已收盘，真实反应落在次一交易日，所以自动取 T+1（格内标注）。中国 PMI / 社融等白盘数据对所有标的都是 T+0。'
        : `当前强制统一为 <b>T+${mode}</b> 口径。跨时区资产在此口径下会混入「消息发布时该市场尚未开盘」的错配，仅作对照参考。`
    }
  </p>
  ${
    top.length
      ? `<div class="study-top"><span class="study-top-label">统计上最显著：</span>${top
          .map(
            (r) =>
              `<span class="study-chip">${esc(r.name)} × ${esc(STUDY_KIND_LABEL[r.kind] ?? r.kind)} <b>${r.ratio.toFixed(2)}x</b> <em>t=${r.t.toFixed(1)}</em></span>`,
          )
          .join('')}</div>`
      : ''
  }`;
}

async function loadEventStudy(force = false) {
  if (!force && studyCacheClient) return studyCacheClient;
  try {
    const res = await fetch(`./api/eventstudy${force ? '?force=1' : ''}`, { cache: 'no-store' });
    if (res.ok) studyCacheClient = await res.json();
  } catch {
    /* 忽略 */
  }
  return studyCacheClient;
}


/* ================================================================== *
 * 全球市场地图 v2
 * 全屏 / 缩放平移 / 各地指数直接标注 / 新事件气泡 / 右侧滚动事件流
 * ================================================================== */

// 交易所坐标：同城多标的聚合到一个节点，纵向堆叠显示
// dx/dy 是标签相对城市点的偏移 —— 欧洲三国、北美三城在地图上只隔十几像素，
// 不手动错开标签会叠成一团
const MAP_CITIES = [
  { key: 'ny', name: '纽约', lon: -74.0, lat: 40.7, ids: ['sp500', 'ndx100', 'dji', 'vix', 'vxn'], side: 'right', dx: 16, dy: -46 },
  { key: 'tor', name: '多伦多', lon: -79.4, lat: 43.7, ids: ['tsx'], side: 'left', dx: -18, dy: -16 },
  { key: 'chi', name: '芝加哥', lon: -87.6, lat: 41.9, ids: ['oil'], side: 'left', dx: -18, dy: 28 },
  { key: 'sh', name: '上海', lon: 121.5, lat: 31.2, ids: ['sh000001', 'gold-cn'], side: 'left', dx: -14, dy: 16 },
  { key: 'hkg', name: '香港', lon: 114.2, lat: 22.3, ids: ['hsi'], side: 'left', dx: -12, dy: 34 },
  { key: 'ldn', name: '伦敦', lon: -0.1, lat: 51.5, ids: ['gold-intl', 'ftse'], side: 'left', dx: -14, dy: -28 },
  { key: 'par', name: '巴黎', lon: 2.3, lat: 48.9, ids: ['cac'], side: 'left', dx: -16, dy: 20 },
  { key: 'fra', name: '法兰克福', lon: 8.7, lat: 50.1, ids: ['dax'], side: 'right', dx: 16, dy: -10 },
  { key: 'tyo', name: '东京', lon: 139.7, lat: 35.7, ids: ['n225'], side: 'left', dx: -16, dy: -10 },
  { key: 'sel', name: '首尔', lon: 127.0, lat: 37.6, ids: ['kospi'], side: 'left', dx: -14, dy: 26 },
  { key: 'tpe', name: '台北', lon: 121.6, lat: 25.0, ids: ['twii'], side: 'left', dx: -12, dy: 18 },
  { key: 'sao', name: '圣保罗', lon: -46.6, lat: -23.5, ids: ['bvsp'], side: 'right', dx: 14, dy: 2 },
  { key: 'bom', name: '孟买', lon: 72.9, lat: 19.1, ids: ['nifty'], side: 'right', dx: 14, dy: 48 },
  { key: 'syd', name: '悉尼', lon: 151.2, lat: -33.9, ids: ['asx'], side: 'left', dx: -14, dy: 6 },
];

// 指数简称（地图标签用）
const MAP_TAG = {
  sp500: '标普', ndx100: '纳指', dji: '道指', vix: 'VIX', vxn: 'VXN',
  sh000001: '上证', 'gold-cn': '沪金', 'gold-intl': '黄金', ftse: '富时',
  oil: 'WTI', n225: '日经', hsi: '恒生', dax: 'DAX', cac: 'CAC',
  bvsp: '巴西', nifty: '印度', kospi: '韩国', asx: '澳洲', tsx: '加拿大',
  twii: '台湾', btc: 'BTC',
};

const REGION_ANCHORS = {
  us: { lon: -98, lat: 39, label: '北美' },
  cn: { lon: 105, lat: 34, label: '中国' },
  eu: { lon: 10, lat: 50, label: '欧元区' },
  uk: { lon: -3, lat: 55, label: '英国' },
  jp: { lon: 138, lat: 36.5, label: '日本' },
  me: { lon: 45, lat: 29, label: '中东' },
  asia: { lon: 106, lat: 14, label: '东南亚' },
  latam: { lon: -60, lat: -15, label: '拉美' },
  africa: { lon: 20, lat: 5, label: '非洲' },
  global: { lon: -30, lat: 62, label: '全球' },
};

// 视图状态：缩放 + 平移
// 初始左移 200px：右侧事件面板会盖住亚洲，先把地图推过去，东京/上海/香港才露得出来
let mapView = { k: 1, tx: -200, ty: 0 };
let mapTimer = null;
let mapBubbles = []; // 当前显示的气泡
let mapSeenIds = null; // 上一轮事件 id，用于判断「新事件」
let mapDrag = null;

function mapProject(lon, lat) {
  return [
    ((lon + 180) / 360) * MAP_SIZE.width,
    ((MAP_SIZE.latMax - lat) / (MAP_SIZE.latMax - MAP_SIZE.latMin)) * MAP_SIZE.height,
  ];
}

/* ---------- 天文：晨昏线 ---------- */

/** 太阳直射点（赤纬 + 经度）。低精度公式，误差 < 0.01°，够画昼夜分界 */
function sunPosition(now) {
  const jd = now.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360) * Math.PI) / 180;
  const lambda = ((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const eps = ((23.439 - 0.0000004 * n) * Math.PI) / 180;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  let lon = (ra * 180) / Math.PI - gmst * 15;
  lon = ((lon + 540) % 360) - 180;
  return { decl: (decl * 180) / Math.PI, lon };
}

/**
 * 晨昏线路径
 * 对每个纬度解 cos(天顶角)=0：cosH = -tan(lat)·tan(decl)，得到昼夜分界的经度。
 * |cosH|>1 表示极昼/极夜，整条纬线都在同一侧。
 */
/** 经纬网格（每 30° / 20°），密度感全靠它 */
function graticulePaths() {
  const segs = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x1, y1] = mapProject(lon, MAP_SIZE.latMax);
    const [x2, y2] = mapProject(lon, MAP_SIZE.latMin);
    segs.push(`M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`);
  }
  for (let lat = -40; lat <= 80; lat += 20) {
    const [x1, y1] = mapProject(-180, lat);
    const [x2, y2] = mapProject(180, lat);
    segs.push(`M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`);
  }
  return segs.map((d) => `<path d="${d}" />`).join('');
}

function terminatorPath(sun) {
  const d = Math.PI / 180;

  // 晨昏圈在地图上表现为一对对称弧（+H 与 −H 两支），只画一支会看着像被切了一半
  const build = (sign) => {
    const segs = [];
    let cur = [];
    let prevX = null;

    for (let lat = -88; lat <= 88; lat += 1.5) {
      const cosH = -Math.tan(lat * d) * Math.tan(sun.decl * d);
      let lon;
      if (cosH >= 1) lon = sun.lon;             // 极夜
      else if (cosH <= -1) lon = sun.lon + 180; // 极昼
      else lon = sun.lon + (sign * Math.acos(cosH)) / d;

      const [x, y] = mapProject(lon, lat);
      // 跨日界线断开，避免横穿整图
      if (prevX !== null && Math.abs(x - prevX) > MAP_SIZE.width / 2) {
        if (cur.length > 1) segs.push(cur);
        cur = [];
      }
      cur.push([x, y]);
      prevX = x;
    }
    if (cur.length > 1) segs.push(cur);

    return segs
      .map((sg) => `M${sg.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}`)
      .join('');
  };

  return build(1) + build(-1);
}

/* ---------- 事件影响弧线 ---------- */

/** 区域 → 受影响的交易中心（仅供参考，真正的连线走下面的标的口径） */
const REGION_IMPACT = {
  us: ['ny'],
  cn: ['sh', 'hkg'],
  eu: ['fra', 'ldn'],
  uk: ['ldn'],
  jp: ['tyo'],
  me: ['ldn', 'bom'],
  asia: ['hkg', 'syd'],
  latam: ['sao'],
  africa: ['ldn'],
  global: ['ny', 'ldn', 'sh'],
};

/**
 * 标的 → 定价中心城市。
 * 每条事件后端 classify 已经给出 symbols（如 ['oil','gold-intl','vix']），
 * 按定价所在交易所连线比按「事件发生在哪个区域」硬编码准确得多：
 * 中东地缘冲突该打到芝加哥（WTI）和伦敦（Brent），而不是凭空连孟买。
 */
const SYMBOL_CITY = {
  // 美债与美元：定价在纽约
  us10y: ['ny'],
  dxy: ['ny', 'ldn'],
  usdcny: ['sh', 'hkg'],
  // 美股与波动率：纽约 / 芝加哥 CBOE
  sp500: ['ny'],
  ndx100: ['ny'],
  dji: ['ny'],
  vix: ['chi', 'ny'],
  // 商品：WTI 在芝加哥，Brent 与伦敦金在伦敦，沪金在上金所，铜在 LME
  oil: ['chi', 'ldn'],
  brent: ['ldn'],
  copper: ['ldn', 'chi'],
  'gold-intl': ['ldn', 'ny'],
  'gold-cn': ['sh'],
  // 加密：现货无实体中心，取 CME 期货所在的纽约
  btc: ['ny'],
  // A 股与亚太
  sh000001: ['sh', 'hkg'],
  hsi: ['hkg'],
  n225: ['tyo'],
  kospi: ['sel'],
  twii: ['tpe'],
  asx: ['syd'],
  nifty: ['bom'],
  // 欧洲
  dax: ['fra'],
  cac: ['par'],
  ftse: ['ldn'],
  // 美洲
  tsx: ['tor'],
  bvsp: ['sao'],
};

/** 由事件的 symbols 推出该连线到哪些定价中心；拿不到才退回区域兜底 */
function targetCitiesFor(ev) {
  const keys = new Set();
  for (const sym of ev.symbols ?? []) {
    for (const city of SYMBOL_CITY[sym] ?? []) keys.add(city);
  }
  const list = [...keys];
  if (list.length) return list.slice(0, 5);
  return REGION_IMPACT[ev.region] ?? [];
}

/** 两点之间的拱形贝塞尔 */
function arcBetween([x1, y1], [x2, y2]) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(90, dist * 0.32);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${(my - lift).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

function impactArcs(items) {
  const cityById = new Map(MAP_CITIES.map((c) => [c.key, c]));
  let svg = '';
  // 只给最新 3 条高影响事件画弧，否则满屏都是线
  const hot = items.filter((e) => e.level === 'high').slice(0, 3);

  hot.forEach((ev, idx) => {
    const anchor = REGION_ANCHORS[ev.region];
    if (!anchor) return;
    const from = mapProject(anchor.lon, anchor.lat);
    const targets = targetCitiesFor(ev)
      .map((k) => cityById.get(k))
      .filter(Boolean)
      // 连到事件自身所在的交易中心没有意义（零长度弧）
      .filter((c) => Math.hypot(c.lon - anchor.lon, c.lat - anchor.lat) > 4);

    targets.forEach((city, ti) => {
      const to = mapProject(city.lon, city.lat);
      const d = arcBetween(from, to);
      const delay = (idx * 0.35 + ti * 0.2).toFixed(2);
      svg += `<path class="impact-arc" d="${d}" style="animation-delay:${delay}s" />`;
    });
  });

  return svg;
}

/* ---------- 平滑视图动画 ---------- */

let mapAnim = null;

/** ease-out cubic：起手快、收尾稳，比线性自然得多 */
function animateMapView(target, dur = 420) {
  if (mapAnim) cancelAnimationFrame(mapAnim);
  const from = { ...mapView };
  const t0 = performance.now();

  const step = (t) => {
    const p = Math.min(1, (t - t0) / Math.max(1, dur));
    const e = 1 - (1 - p) ** 3;
    mapView.k = from.k + (target.k - from.k) * e;
    mapView.tx = from.tx + (target.tx - from.tx) * e;
    mapView.ty = from.ty + (target.ty - from.ty) * e;
    clampMapView();
    applyMapView();
    if (p < 1) mapAnim = requestAnimationFrame(step);
    else mapAnim = null;
  };
  mapAnim = requestAnimationFrame(step);
}

/* ---------- LOD：同城标的按缩放级别展开 ---------- */

/** 低缩放时每个城市只留前两个标的，放大后全展开；否则纽约 5 行永远挤成一坨 */
function tagLimitFor(k) {
  if (k >= 2.2) return 99;
  if (k >= 1.5) return 4;
  return 2;
}

function freshnessOf(isoTime) {
  if (!isoTime) return 0;
  const t = new Date(`${isoTime.replace(' ', 'T')}+08:00`).getTime();
  if (!Number.isFinite(t)) return 0;
  const age = (Date.now() - t) / 60000;
  if (age < 5) return 1;
  if (age < 30) return 0.72;
  if (age < 120) return 0.42;
  return 0.18;
}

/** 把当前缩放/平移应用到 viewport */
// 上一次渲染用的 LOD 档位，缩放跨档时才需要重建标签
let renderedTagLimit = null;
let lodTimer = null;

function applyMapView() {
  const vp = document.getElementById('map-viewport');
  if (!vp) return;
  vp.setAttribute('transform', `translate(${mapView.tx.toFixed(2)},${mapView.ty.toFixed(2)}) scale(${mapView.k.toFixed(3)})`);
  const label = document.getElementById('zoom-label');
  if (label) label.textContent = `${mapView.k.toFixed(1)}×`;

  // 缩放跨越 LOD 阈值时重建标签；等动画停下再重建，否则每帧重绘会卡
  clearTimeout(lodTimer);
  lodTimer = setTimeout(() => {
    if (renderedTagLimit !== null && tagLimitFor(mapView.k) !== renderedTagLimit) renderMap();
  }, 240);
}

/** 以某点为中心缩放（屏幕坐标 → svg 坐标） */
function zoomAt(clientX, clientY, factor, dur = 240) {
  const svg = document.querySelector('.world-svg');
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const sx = ((clientX - rect.left) / rect.width) * MAP_SIZE.width;
  const sy = ((clientY - rect.top) / rect.height) * MAP_SIZE.height;
  const k2 = Math.min(8, Math.max(1, mapView.k * factor));
  const scale = k2 / mapView.k;
  animateMapView(
    {
      k: k2,
      tx: sx - scale * (sx - mapView.tx),
      ty: sy - scale * (sy - mapView.ty),
    },
    dur,
  );
}

// 允许额外左移 260px（面板宽度量级），否则 k=1 时 tx 只能是 0，亚洲永远压在面板下
const MAP_PANEL_GUTTER = 260;

function clampMapView() {
  const overX = MAP_SIZE.width * (mapView.k - 1) + MAP_PANEL_GUTTER;
  const overY = MAP_SIZE.height * (mapView.k - 1);
  mapView.tx = Math.min(0, Math.max(-overX, mapView.tx));
  mapView.ty = Math.min(0, Math.max(-overY, mapView.ty));
}

function resetMapView() {
  closeNodeCard();
  animateMapView({ k: 1, tx: -200, ty: 0 }, 460);
}

/** 事件气泡：按 region 定位，超出视口就钳制进来 */
function spawnBubble(ev) {
  const anchor = REGION_ANCHORS[ev.region] ?? REGION_ANCHORS.global;
  const [x, y] = mapProject(anchor.lon, anchor.lat);
  const layer = document.getElementById('map-bubbles');
  if (!layer) return;

  // svg 坐标 → 屏幕坐标
  const svg = document.querySelector('.world-svg');
  const rect = svg.getBoundingClientRect();
  const px = rect.left + ((x * mapView.k + mapView.tx) / MAP_SIZE.width) * rect.width;
  const py = rect.top + ((y * mapView.k + mapView.ty) / MAP_SIZE.height) * rect.height;

  const host = layer.getBoundingClientRect();
  let left = px - host.left - 150;
  let top = py - host.top - 76;
  left = Math.max(12, Math.min(host.width - 320, left));
  top = Math.max(12, Math.min(host.height - 90, top));

  const el = document.createElement('div');
  el.className = `map-bubble lv-${ev.level}`;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.innerHTML = `
    <div class="bb-head"><span class="bb-region">${esc(anchor.label)}</span><span class="bb-time">${esc(ev.time.slice(11, 16))}</span></div>
    <div class="bb-title">${esc(ev.title.slice(0, 60))}</div>
  `;
  el.addEventListener('click', () => { location.hash = '#/events'; });
  layer.appendChild(el);

  mapBubbles.push(el);
  // 最多同时 3 个，超出移除最旧
  while (mapBubbles.length > 3) {
    const old = mapBubbles.shift();
    old.classList.add('out');
    setTimeout(() => old.remove(), 400);
  }
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
    mapBubbles = mapBubbles.filter((b) => b !== el);
  }, 6000);
}

function renderMap() {
  // 正在显示的气泡要在重建后接回来，否则每 30 秒轮询会打断它
  const bubbleLayer = document.getElementById('map-bubbles');
  const liveBubbles = bubbleLayer ? [...bubbleLayer.children] : [];

  const quotes = quotesCache ?? [];
  const items = eventsState?.data?.items ?? [];
  const quoteOf = (id) => quotes.find((q) => q.id === id);

  // ---- 城市节点（按缩放级别决定展开多少个标的）----
  const limit = tagLimitFor(mapView.k);
  renderedTagLimit = limit;
  let citySvg = '';
  for (const city of MAP_CITIES) {
    const [x, y] = mapProject(city.lon, city.lat);
    const all = city.ids.map(quoteOf).filter((q) => q && q.ok);
    if (!all.length) continue;

    const members = all.slice(0, limit);
    const hidden = all.length - members.length;
    const lead = members[0];

    // 交易中的市场光环亮，已收盘的压暗 —— 配合晨昏线读「谁在开着」
    const openNow = Boolean(lead.marketStatus?.open);
    const ldir = dirOf(lead.changePct);
    const color = ldir === 'up' ? '#f5455c' : ldir === 'down' ? '#0ecb81' : '#7e8899';

    const lineH = 15;
    const isRight = city.side !== 'left';
    const anchorX = isRight ? 9 : -9;
    const textAnchor = isRight ? 'start' : 'end';

    let rows = members
      .map((m, i) => {
        const d = dirOf(m.changePct);
        const c = d === 'up' ? '#f5455c' : d === 'down' ? '#0ecb81' : '#7e8899';
        const pct = m.changePct == null ? '—' : `${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`;
        const yy = i * lineH;
        return `<text class="tag-name" x="${anchorX}" y="${yy}" text-anchor="${textAnchor}">${esc(MAP_TAG[m.id] ?? m.name)}</text>
          <text class="tag-pct" x="${anchorX + (isRight ? 1 : -1) * 46}" y="${yy}" text-anchor="${textAnchor}" fill="${c}">${pct}</text>`;
      })
      .join('');
    // 折叠提示：还有 N 个标的没展开
    if (hidden > 0) {
      rows += `<text class="tag-more" x="${anchorX}" y="${members.length * lineH}" text-anchor="${textAnchor}">+${hidden} 放大可见</text>`;
    }

    const dx = city.dx ?? 12;
    const dy = city.dy ?? 0;
    const rowsShift = (-(members.length - 1) * lineH) / 2;
    citySvg += `<g class="map-city${openNow ? ' is-open' : ' is-closed'}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"
        data-city="${esc(city.key)}" data-open="${openNow ? 1 : 0}">
      <circle class="city-halo" r="8" fill="${color}" />
      <circle class="city-dot" r="2.8" fill="${color}" />
      <line class="city-link" x1="0" y1="0" x2="${dx}" y2="${(dy + rowsShift).toFixed(1)}" />
      <g transform="translate(${dx},${(dy + rowsShift).toFixed(1)})">${rows}</g>
    </g>`;
  }

  // ---- 事件区域 ----
  const byRegion = new Map();
  for (const ev of items) {
    const r = ev.region || 'global';
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r).push(ev);
  }
  let regionSvg = '';
  for (const [region, evs] of byRegion) {
    const a = REGION_ANCHORS[region];
    if (!a) continue;
    const [x, y] = mapProject(a.lon, a.lat);
    const high = evs.filter((e) => e.level === 'high').length;
    const fresh = Math.max(...evs.slice(0, 5).map((e) => freshnessOf(e.time)));
    const r = 2.5 + Math.min(7, evs.length * 0.9);
    const color = high > 0 ? '#f5455c' : '#e0a83c';
    regionSvg += `<g class="map-region${fresh > 0.7 ? ' hot' : ''}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
      <circle class="rg-pulse" r="${(r + 5).toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.9" opacity="${(fresh * 0.55).toFixed(2)}" />
      <circle class="rg-core" r="${r.toFixed(1)}" fill="${color}" opacity="${(0.2 + fresh * 0.6).toFixed(2)}" />
      <title>${esc(a.label)} · ${evs.length} 条 · 最新 ${esc(evs[0]?.title?.slice(0, 40) ?? '')}</title>
    </g>`;
  }

  // ---- BTC 卫星位 ----
  const btc = quoteOf('btc');
  let btcSvg = '';
  if (btc?.ok) {
    const d = dirOf(btc.changePct);
    const c = d === 'up' ? '#f5455c' : d === 'down' ? '#0ecb81' : '#7e8899';
    btcSvg = `<g class="map-sat" transform="translate(196,296)" data-goto="btc">
      <circle class="sat-ring" r="15" fill="none" stroke="${c}" stroke-width="0.9" opacity="0.5" />
      <circle r="5" fill="${c}" />
      <text x="22" y="-2" class="tag-name">BTC</text>
      <text x="22" y="9" class="tag-pct" fill="${c}">${fmtPrice(btc.price, 0)} ${btc.changePct >= 0 ? '+' : ''}${btc.changePct.toFixed(2)}%</text>
    </g>`;
  }

  // ---- 右侧事件流 ----
  const feedRows = items
    .slice(0, 40)
    .map((ev) => {
      const a = REGION_ANCHORS[ev.region] ?? REGION_ANCHORS.global;
      const hot = mapSeenIds && !mapSeenIds.has(ev.id) ? ' is-new' : '';
      return `<div class="mf-item lv-${ev.level}${hot}" data-id="${esc(ev.id)}">
        <span class="mf-meta"><i>${esc(ev.time.slice(11, 16))}</i>${esc(a.label)}</span>
        <span class="mf-text">${esc(ev.title)}</span>
      </div>`;
    })
    .join('');

  mapEl.innerHTML = `
    <div class="map-top">
      <div class="map-title">
        <h2>全球市场地图</h2>
        <p>${quotes.length} 个标的 · ${items.length} 条实时事件 · 滚轮缩放 / 拖拽平移</p>
      </div>
      <div class="map-tools">
        <button type="button" class="map-btn" id="map-zoom-out" title="缩小">−</button>
        <span class="map-zoom" id="zoom-label">1.0×</span>
        <button type="button" class="map-btn" id="map-zoom-in" title="放大">+</button>
        <button type="button" class="map-btn" id="map-reset" title="复位">复位</button>
        <button type="button" class="map-btn" id="map-full" title="全屏">⛶ 全屏</button>
      </div>
    </div>
    <div class="map-body">
      <div class="map-canvas" id="map-canvas">
        <svg class="world-svg" viewBox="0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="全球市场地图">
          <defs>
            <radialGradient id="oceanGlow" cx="50%" cy="42%" r="62%">
              <stop offset="0%" stop-color="#0d1a2c" />
              <stop offset="58%" stop-color="#080d16" />
              <stop offset="100%" stop-color="#05070b" />
            </radialGradient>
            <linearGradient id="terminatorStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#4a7fd4" stop-opacity="0.15" />
              <stop offset="45%" stop-color="#7fb4ff" stop-opacity="0.55" />
              <stop offset="100%" stop-color="#4a7fd4" stop-opacity="0.15" />
            </linearGradient>
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect class="map-ocean" width="${MAP_SIZE.width}" height="${MAP_SIZE.height}" fill="url(#oceanGlow)" />
          <g id="map-viewport">
            <g class="map-graticule">${graticulePaths()}</g>
            <g class="world-land">${WORLD_COUNTRIES.map((c) => `<path d="${c.d}" />`).join('')}</g>
            <path class="terminator" d="${terminatorPath(sunPosition(new Date()))}" fill="none" stroke="url(#terminatorStroke)" filter="url(#softGlow)" />
            <g class="impact-layer">${impactArcs(items)}</g>
            <g class="map-regions">${regionSvg}</g>
            <g class="map-cities">${citySvg}</g>
            ${btcSvg}
          </g>
        </svg>
        <div class="map-bubbles" id="map-bubbles"></div>
      </div>
      <aside class="map-feed" id="map-feed">
        <div class="mf-head">
          <span>实时事件</span>
          <em>${items.filter((i) => i.level === 'high').length} 条高影响</em>
          <button type="button" class="mf-fold" id="mf-fold" title="收起面板">⟩</button>
        </div>
        <div class="mf-list">${feedRows}</div>
      </aside>
    </div>
  `;

  const layerNow = document.getElementById('map-bubbles');
  if (layerNow && liveBubbles.length) {
    liveBubbles.forEach((b) => layerNow.appendChild(b));
  }

  applyMapView();
  bindMapEvents();
}

/* ---------- 节点详情卡（就地展开，不跳页） ---------- */

let nodeCardKey = null;

function closeNodeCard() {
  document.getElementById('map-node-card')?.remove();
  nodeCardKey = null;
}

function openNodeCard(cityKey) {
  const city = MAP_CITIES.find((c) => c.key === cityKey);
  if (!city) return;
  if (nodeCardKey === cityKey) {
    closeNodeCard();
    return;
  }
  closeNodeCard();
  nodeCardKey = cityKey;

  const quotes = quotesCache ?? [];
  const members = city.ids.map((id) => quotes.find((q) => q.id === id)).filter((q) => q && q.ok);
  if (!members.length) return;

  const canvas = document.getElementById('map-canvas');
  const svg = document.querySelector('.world-svg');
  if (!canvas || !svg) return;

  // 把城市坐标换算成屏幕位置
  const [mx, my] = mapProject(city.lon, city.lat);
  const rect = svg.getBoundingClientRect();
  const hostRect = canvas.getBoundingClientRect();
  let px = rect.left - hostRect.left + ((mx * mapView.k + mapView.tx) / MAP_SIZE.width) * rect.width;
  let py = rect.top - hostRect.top + ((my * mapView.k + mapView.ty) / MAP_SIZE.height) * rect.height;

  const W = 246;
  const H = 74 + members.length * 30;
  px = Math.max(10, Math.min(hostRect.width - W - 10, px - W / 2));
  py = Math.max(10, Math.min(hostRect.height - H - 10, py + 22));

  const openNow = Boolean(members[0].marketStatus?.open);
  const rows = members
    .map((m) => {
      const d = dirOf(m.changePct);
      const c = d === 'up' ? '#f5455c' : d === 'down' ? '#0ecb81' : '#8a8f99';
      const pct = m.changePct == null ? '—' : `${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`;
      const f = m.freshness?.label ?? '';
      return `<div class="nc-row">
        <span class="nc-name">${esc(MAP_TAG[m.id] ?? m.name)}</span>
        <span class="nc-price">${fmtPrice(m.price, m.decimals ?? 2)}</span>
        <span class="nc-pct" style="color:${c}">${pct}</span>
        <span class="nc-fresh">${esc(f)}</span>
      </div>`;
    })
    .join('');

  const el = document.createElement('div');
  el.className = 'map-node-card';
  el.id = 'map-node-card';
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
  el.innerHTML = `
    <div class="nc-head">
      <span class="nc-city">${esc(city.name)}</span>
      <span class="nc-status ${openNow ? 'on' : 'off'}">${openNow ? '交易中' : '已收盘'}</span>
    </div>
    ${rows}
    <div class="nc-foot">
      <a href="#/d/${encodeURIComponent(members[0].id)}">打开详情 →</a>
    </div>
  `;
  el.addEventListener('click', (e) => e.stopPropagation());
  canvas.appendChild(el);
}

function bindMapEvents() {
  const svg = document.querySelector('.world-svg');
  const canvas = document.getElementById('map-canvas');
  if (!svg || !canvas) return;

  // 滚轮缩放
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    },
    { passive: false },
  );

  // 拖拽平移
  svg.addEventListener('pointerdown', (e) => {
    mapDrag = { x: e.clientX, y: e.clientY, tx: mapView.tx, ty: mapView.ty, moved: false };
    svg.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!mapDrag) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - mapDrag.x) / rect.width) * MAP_SIZE.width;
    const dy = ((e.clientY - mapDrag.y) / rect.height) * MAP_SIZE.height;
    if (Math.abs(e.clientX - mapDrag.x) + Math.abs(e.clientY - mapDrag.y) > 3) mapDrag.moved = true;
    mapView.tx = mapDrag.tx + dx;
    mapView.ty = mapDrag.ty + dy;
    clampMapView();
    applyMapView();
  });
  const endDrag = () => {
    mapDrag = null;
    canvas.classList.remove('dragging');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // 点城市节点 → 就地浮出卡片（不跳页，保住心流）
  svg.querySelectorAll('[data-city]').forEach((g) => {
    g.addEventListener('click', (e) => {
      if (mapDrag?.moved) return;
      e.stopPropagation();
      openNodeCard(g.dataset.city);
    });
  });

  // 点空白处收起卡片
  svg.addEventListener('click', () => closeNodeCard());

  // 双击放大（GIS 的标准手势）
  svg.addEventListener('dblclick', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, 1.8, 320);
  });

  // 工具按钮
  document.getElementById('map-zoom-in')?.addEventListener('click', () => {
    const r = svg.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.35);
  });
  document.getElementById('map-zoom-out')?.addEventListener('click', () => {
    const r = svg.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.35);
  });
  document.getElementById('map-reset')?.addEventListener('click', resetMapView);
  document.getElementById('mf-fold')?.addEventListener('click', () => {
    const host = document.querySelector('.map');
    const folded = host?.classList.toggle('feed-folded');
    const btn = document.getElementById('mf-fold');
    if (btn) btn.textContent = folded ? '\u27e8' : '\u27e9';
  });
  document.getElementById('map-full')?.addEventListener('click', () => {
    const host = document.querySelector('.map');
    if (!document.fullscreenElement) host?.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
}

function stopMapTimer() {
  if (mapTimer) {
    clearInterval(mapTimer);
    mapTimer = null;
  }
  mapBubbles.forEach((b) => b.remove());
  mapBubbles = [];
}

async function loadMap() {
  try {
    const [evRes, cal] = await Promise.all([
      fetch('./api/events', { cache: 'no-store' }),
      loadCalendarCached(false),
    ]);
    const data = evRes.ok ? await evRes.json() : null;
    if (!eventsState) eventsState = { data, calendar: cal, level: '', topic: '', studyMode: 'auto', newIds: null, newCount: 0 };
    if (data) {
      eventsState.data = data;
      eventsState.calendar = cal;
    }
    if (!location.hash.startsWith('#/map')) return;

    // 新事件 → 弹气泡
    const items = data?.items ?? [];
    const first = mapSeenIds === null;
    const fresh = first ? [] : items.filter((ev) => !mapSeenIds.has(ev.id));
    mapSeenIds = new Set(items.map((ev) => ev.id));

    // 必须先渲染再弹：renderMap 会重写 innerHTML，先弹的气泡会被一起清掉
    renderMap();
    fresh.reverse().slice(-2).forEach((ev) => spawnBubble(ev));
  } catch (err) {
    mapEl.innerHTML = `<div class="d-error">地图加载失败：${esc(err?.message ?? String(err))}</div>`;
  }
}

/* ------------------------------ 取数 / 循环 ------------------------------ */

let timer = null;

function scheduleNext(delay) {
  clearTimeout(timer);
  const wait = delay ?? ttl + 1000;
  nextAt = Date.now() + wait;
  timer = setTimeout(() => loadQuotes(false), wait);
}

function paintCountdown() {
  if (loading) {
    countdownEl.textContent = '刷新中…';
    return;
  }
  const left = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
  countdownEl.textContent = `${left}s 后刷新`;
}

async function loadQuotes(force = false) {
  if (loading) return;
  loading = true;
  refreshBtn.disabled = true;
  paintCountdown();
  try {
    const res = await fetch(`./api/quotes${force ? '?force=1' : ''}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    apply(await res.json());
  } catch (err) {
    updatedEl.textContent = `连接失败：${err?.message ?? err}`;
  } finally {
    loading = false;
    refreshBtn.disabled = false;
    scheduleNext();
    paintCountdown();
  }
}

refreshBtn.addEventListener('click', () => loadQuotes(true));

document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    loadQuotes(true);
  }
});

// 标签页隐藏时停止轮询，回来立即拉一次
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(timer);
  } else {
    loadQuotes(false);
  }
});

setInterval(paintCountdown, 250);

renderSkeleton();
// 每次打开页面都强制向数据源拉一次最新值，而不是命中服务端缓存
loadQuotes(true);
route();
