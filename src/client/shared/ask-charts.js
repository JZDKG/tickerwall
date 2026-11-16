/* ================================================================== *
 * ask-charts —— AI 回答内嵌金融图表（纯 SVG / HTML，零原始HTML 零依赖）
 *
 * 将模型输出的 ```chart / ```kline / ```graph / ```mermaid 代码块
 * 解析并渲染成与 Tickerwall 终端风格一致的矢量图表：
 *   · kline   —— OHLC 蜡烛图 + MA5 + 区间高低/最新价摘要
 *   · graph   —— 因果/资金传导有向图（支持 JSON 与简化 Mermaid）
 *   · bar     —— 多空对比 / 资金流向水平条形图
 *   · line    —— 趋势与多序列对比折线图
 *
 * 所有节点一律经 html`` 标签模板构造，绝不拼接原始 HTML 字符串。
 * ================================================================== */

import { html } from './format.js';

export const CHART_LANGS = Object.freeze(new Set([
  'chart',
  'tw-chart',
  'json-chart',
  'kline',
  'graph',
  'mermaid',
]));

const TONES = new Set(['up', 'down', 'warn', 'accent', 'neutral']);

const KNOWN_ASSET_IDS = new Set([
  'gold-cn',
  'gold-intl',
  'oil',
  'brent',
  'sp500',
  'ndx100',
  'sh000001',
  'vix',
  'vxn',
  'dxy',
  'us10y',
  'usdcny',
  'btc',
  'hsi',
  'n225',
  'kospi',
  'twii',
  'asx',
  'nifty',
  'dax',
  'ftse',
  'cac',
  'dji',
  'tsx',
  'bvsp',
]);

const GRAPH_ASSET_ALIASES = [
  ['纳指波动率', 'vxn'],
  ['vxn', 'vxn'],
  ['市场波动率', 'vix'],
  ['恐慌指数', 'vix'],
  ['vix', 'vix'],
  ['国内金价', 'gold-cn'],
  ['沪金', 'gold-cn'],
  ['au9999', 'gold-cn'],
  ['国际金价', 'gold-intl'],
  ['伦敦金', 'gold-intl'],
  ['现货黄金', 'gold-intl'],
  ['comex黄金', 'gold-intl'],
  ['xau', 'gold-intl'],
  ['布伦特原油', 'brent'],
  ['布伦特', 'brent'],
  ['布油', 'brent'],
  ['国际原油', 'oil'],
  ['wti原油', 'oil'],
  ['美油', 'oil'],
  ['wti', 'oil'],
  ['原油', 'oil'],
  ['美债10年期', 'us10y'],
  ['10年期美债', 'us10y'],
  ['美债收益率', 'us10y'],
  ['10y美债', 'us10y'],
  ['美债10y', 'us10y'],
  ['美元指数', 'dxy'],
  ['dxy', 'dxy'],
  ['离岸人民币', 'usdcny'],
  ['人民币汇率', 'usdcny'],
  ['usdcnh', 'usdcny'],
  ['usdcny', 'usdcny'],
  ['标普500', 'sp500'],
  ['纳斯达克100', 'ndx100'],
  ['纳斯达克', 'ndx100'],
  ['纳指100', 'ndx100'],
  ['纳指', 'ndx100'],
  ['道琼斯', 'dji'],
  ['道指', 'dji'],
  ['上证指数', 'sh000001'],
  ['沪指', 'sh000001'],
  ['恒生指数', 'hsi'],
  ['恒指', 'hsi'],
  ['日经225', 'n225'],
  ['日经', 'n225'],
  ['韩国kospi', 'kospi'],
  ['台湾加权', 'twii'],
  ['澳洲asx200', 'asx'],
  ['印度nifty', 'nifty'],
  ['德国dax', 'dax'],
  ['英国富时100', 'ftse'],
  ['法国cac40', 'cac'],
  ['加拿大tsx', 'tsx'],
  ['巴西bovespa', 'bvsp'],
  ['比特币', 'btc'],
  ['btc', 'btc'],
];

export function resolveGraphAssetId(label, nodeId = '') {
  const idNorm = String(nodeId).trim().toLowerCase();
  if (KNOWN_ASSET_IDS.has(idNorm)) return idNorm;
  const text = String(label).trim().toLowerCase();
  if (!text) return '';
  if (KNOWN_ASSET_IDS.has(text)) return text;
  for (const [alias, assetId] of GRAPH_ASSET_ALIASES) {
    if (text.includes(alias)) return assetId;
  }
  return '';
}

export function isChartFence(lang) {
  return CHART_LANGS.has(String(lang ?? '').trim().toLowerCase());
}

function formatNum(n) {
  const abs = Math.abs(n);
  if (abs === 0) return '0';
  const digits = abs >= 10 ? 2 : abs >= 1 ? 3 : 4;
  return Number(n.toFixed(digits)).toString();
}

function formatSignedPct(pct) {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function strHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function visualLen(text) {
  let len = 0;
  for (const ch of text) len += ch.charCodeAt(0) > 127 ? 2 : 1;
  return len;
}

function clipText(text, maxCols) {
  if (visualLen(text) <= maxCols) return text;
  let used = 0;
  let out = '';
  for (const ch of text) {
    const w = ch.charCodeAt(0) > 127 ? 2 : 1;
    if (used + w > maxCols - 1) break;
    out += ch;
    used += w;
  }
  return `${out}…`;
}

function safeTone(tone, fallback) {
  const t = typeof tone === 'string' ? tone.trim().toLowerCase() : '';
  return TONES.has(t) ? t : fallback;
}

/** 共享直角坐标系（3 档水平参考线 + 右侧数值刻度 + X 轴首/中/末日期标签） */
function buildChartFrame(rawMin, rawMax, width, height) {
  const padL = 12;
  const padR = 72;
  const padT = 14;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const baseSpan = rawMax - rawMin;
  const pad = baseSpan > 0 ? baseSpan * 0.08 : Math.max(1e-4, Math.abs(rawMax) * 0.02);
  const minVal = rawMin - pad;
  const maxVal = rawMax + pad;
  const span = maxVal - minVal;
  const yOf = (v) => Number((padT + ((maxVal - v) / span) * plotH).toFixed(1));

  const grid = [rawMax, (rawMax + rawMin) / 2, rawMin].map((val) => {
    const y = yOf(val);
    return html`<g>
      <line class="md-chart-grid" x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}"></line>
      <text class="md-chart-axis" x="${padL + plotW + 6}" y="${Number((y + 3.5).toFixed(1))}">${formatNum(val)}</text>
    </g>`;
  });

  return { padL, padT, plotW, plotH, yOf, grid };
}

function renderXLabels(labels, xFor, padL, plotW, height) {
  const n = labels.length;
  const indices = n >= 6 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];
  return indices.map((idx) => {
    const anchor = idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'middle';
    const tx = idx === 0 ? padL : idx === n - 1 ? padL + plotW : xFor(idx);
    return html`<text class="md-chart-axis" x="${tx}" y="${height - 6}" text-anchor="${anchor}">${labels[idx]}</text>`;
  });
}

/* ------------------------------------------------------------------ *
 * K 线图（OHLC 蜡烛图 + MA5）
 * ------------------------------------------------------------------ */

function normalizeBar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  const open = Number(raw.open);
  const high = Number(raw.high);
  const low = Number(raw.low);
  const close = Number(raw.close);
  if (!date || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || high < low) {
    return null;
  }
  return { date, open, high, low, close };
}

function renderKline(spec) {
  const rawBars = Array.isArray(spec.data) ? spec.data : [];
  const bars = rawBars.map(normalizeBar).filter(Boolean).slice(-60);
  if (bars.length < 2) return null;

  const title = (typeof spec.title === 'string' && spec.title.trim()) || 'K 线走势';
  const unit = typeof spec.unit === 'string' ? spec.unit.trim() : '';
  const unitSuffix = unit ? ` ${unit}` : '';
  const rawMin = Math.min(...bars.map((b) => b.low));
  const rawMax = Math.max(...bars.map((b) => b.high));
  const width = 640;
  const height = 220;
  const { padL, padT, plotW, plotH, yOf, grid } = buildChartFrame(rawMin, rawMax, width, height);
  const slotW = plotW / bars.length;
  const slotWidth = Number(slotW.toFixed(1));
  const bodyW = Number(Math.max(2, Math.min(18, slotW * 0.62)).toFixed(1));
  const cxOf = (idx) => Number((padL + (idx + 0.5) * slotW).toFixed(1));

  const candles = bars.map((b, idx) => {
    const cx = cxOf(idx);
    const slotX = Number((padL + idx * slotW).toFixed(1));
    const yOpen = yOf(b.open);
    const yClose = yOf(b.close);
    const dir = b.close >= b.open ? 'is-up' : 'is-down';
    const top = Number(Math.min(yOpen, yClose).toFixed(1));
    const boxH = Number(Math.max(1.5, Math.abs(yClose - yOpen)).toFixed(1));
    const x = Number((cx - bodyW / 2).toFixed(1));
    const base = idx > 0 ? bars[idx - 1].close : b.open;
    const barPct = base !== 0 ? ((b.close - base) / Math.abs(base)) * 100 : 0;
    const chgText = formatSignedPct(barPct);
    const rowsText = `开 ${formatNum(b.open)}${unitSuffix}|高 ${formatNum(b.high)}${unitSuffix}|低 ${formatNum(b.low)}${unitSuffix}|收 ${formatNum(b.close)}${unitSuffix}|涨幅 ${chgText}`;
    return html`<g class="md-kline-hit" tabindex="0" aria-label="${`${b.date} ${rowsText.replace(/\|/g, ' ')}`}" data-chart-tip="kline" data-tip-x="${cx}" data-tip-title="${b.date}" data-tip-rows="${rowsText}">
      <title>${`${b.date} 开 ${formatNum(b.open)} 高 ${formatNum(b.high)} 低 ${formatNum(b.low)} 收 ${formatNum(b.close)}`}</title>
      <rect class="md-kline-slot" x="${slotX}" y="${padT}" width="${slotWidth}" height="${plotH}" fill="transparent"></rect>
      <line class="md-kline-wick ${dir}" x1="${cx}" y1="${yOf(b.high)}" x2="${cx}" y2="${yOf(b.low)}"></line>
      <rect class="md-kline-body ${dir}" x="${x}" y="${top}" width="${bodyW}" height="${boxH}" rx="1"></rect>
    </g>`;
  });

  let ma5Line = '';
  if (bars.length >= 5) {
    const pts = [];
    for (let i = 4; i < bars.length; i += 1) {
      let sum = 0;
      for (let j = i - 4; j <= i; j += 1) sum += bars[j].close;
      pts.push(`${cxOf(i)},${yOf(sum / 5)}`);
    }
    ma5Line = html`<polyline class="md-kline-ma" points="${pts.join(' ')}"></polyline>`;
  }

  const first = bars[0];
  const last = bars[bars.length - 1];
  const pct = first.open !== 0 ? ((last.close - first.open) / Math.abs(first.open)) * 100 : 0;
  const xLabels = renderXLabels(bars.map((b) => b.date), cxOf, padL, plotW, height);

  return html`<figure class="md-chart md-chart-kline">
    <figcaption class="md-chart-head">
      <span class="md-chart-title">${title}</span>
      <span class="md-chart-meta">
        <span>最新 ${formatNum(last.close)}${unit ? ` ${unit}` : ''}</span>
        <span class="md-chart-chg ${pct >= 0 ? 'is-up' : 'is-down'}">${formatSignedPct(pct)}</span>
        <span>区间 ${formatNum(rawMin)}–${formatNum(rawMax)}</span>
        ${bars.length >= 5 ? html`<span class="md-chart-ma-tag">MA5</span>` : ''}
      </span>
    </figcaption>
    <svg class="md-chart-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${title}">
      ${grid}
      <line class="md-chart-crosshair" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" hidden></line>
      ${candles}
      ${ma5Line}
      ${xLabels}
    </svg>
    <div class="md-chart-tip" hidden></div>
  </figure>`;
}

/* ------------------------------------------------------------------ *
 * 关系图 / 传导链路图（JSON + 简化 Mermaid flowchart 解析）
 * ------------------------------------------------------------------ */

function parseMermaidToken(token) {
  const m = /^([A-Za-z0-9_.\-]+)\s*(?:\[(.+?)\]|\((.+?)\)|\{(.+?)\})?\s*$/.exec(token.trim());
  if (!m) return null;
  const id = m[1];
  const label = (m[2] ?? m[3] ?? m[4] ?? '').trim().replace(/^["']|["']$/g, '');
  return { id, label: label || id };
}

function splitMermaidArrow(segment) {
  const labeled = /^(.*?)\s*(?:--\s*([^-\n>]+?)\s*-->|(?:-->|-.->|==>)\s*\|\s*([^|\n]+?)\s*\|)\s*(.+)$/.exec(segment);
  if (labeled) return { left: labeled[1], label: (labeled[2] ?? labeled[3]).trim(), right: labeled[4] };
  const plain = /^(.*?)\s*(?:-->|-.->|==>|---)\s*(.+)$/.exec(segment);
  return plain ? { left: plain[1], label: '', right: plain[2] } : null;
}

export function parseMermaidGraph(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  let reverseDir = false;
  const nodeMap = new Map();
  const edges = [];

  const ensureNode = (id, label) => {
    const prev = nodeMap.get(id);
    if (prev) {
      if (label !== id && prev.label === id) prev.label = label;
      return;
    }
    nodeMap.set(id, { id, label, detail: '', tone: 'neutral' });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;
    const header = /^(?:graph|flowchart)\s+([A-Za-z]+)/i.exec(line);
    if (header) {
      reverseDir = header[1].toUpperCase() === 'RL';
      continue;
    }
    if (/^(?:subgraph\b|end\b|classDef\b|style\b)/i.test(line)) continue;

    for (const stmt of line.split(';')) {
      const part = stmt.trim();
      if (!part) continue;
      if (!splitMermaidArrow(part)) {
        const single = parseMermaidToken(part);
        if (single) ensureNode(single.id, single.label);
        continue;
      }

      let leftRaw = part;
      const chain = [];
      let step;
      while (chain.length < 12 && (step = splitMermaidArrow(leftRaw))) {
        chain.unshift({ label: step.label, rightRaw: step.right });
        leftRaw = step.left;
      }
      const head = parseMermaidToken(leftRaw);
      if (!head) continue;
      ensureNode(head.id, head.label);
      let prevId = head.id;
      for (const hop of chain) {
        const rhs = parseMermaidToken(hop.rightRaw);
        if (!rhs) break;
        ensureNode(rhs.id, rhs.label);
        edges.push(reverseDir
          ? { from: rhs.id, to: prevId, label: hop.label }
          : { from: prevId, to: rhs.id, label: hop.label });
        prevId = rhs.id;
      }
    }
  }

  const nodes = [...nodeMap.values()];
  return nodes.length >= 2 && edges.length >= 1 ? { type: 'graph', title: '', nodes, edges } : null;
}

function normalizeGraph(spec) {
  const rawNodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const rawEdges = Array.isArray(spec.edges) ? spec.edges : [];
  const nodeMap = new Map();

  for (const n of rawNodes) {
    if (!n || typeof n !== 'object') continue;
    const id = typeof n.id === 'string' ? n.id.trim() : '';
    if (!id || nodeMap.size >= 16) continue;
    nodeMap.set(id, {
      id,
      label: (typeof n.label === 'string' && n.label.trim()) || id,
      detail: typeof n.detail === 'string' ? n.detail.trim() : '',
      tone: safeTone(n.tone, 'neutral'),
    });
  }

  const edges = [];
  for (const e of rawEdges) {
    if (!e || typeof e !== 'object' || edges.length >= 24) continue;
    const from = typeof e.from === 'string' ? e.from.trim() : '';
    const to = typeof e.to === 'string' ? e.to.trim() : '';
    const label = typeof e.label === 'string' ? e.label.trim() : '';
    if (!from || !to) continue;
    if (!nodeMap.has(from) && nodeMap.size < 16) {
      nodeMap.set(from, { id: from, label: from, detail: '', tone: 'neutral' });
    }
    if (!nodeMap.has(to) && nodeMap.size < 16) {
      nodeMap.set(to, { id: to, label: to, detail: '', tone: 'neutral' });
    }
    edges.push({ from, to, label });
  }

  const nodes = [...nodeMap.values()];
  return nodes.length >= 2 && edges.length >= 1 ? { nodes, edges } : null;
}

function rankNodes(nodes, edges) {
  const rank = new Map();
  const indeg = new Map();
  const adj = new Map();
  for (const n of nodes) {
    rank.set(n.id, 0);
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (e.from === e.to) continue;
    adj.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }

  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const visited = new Set();
  while (queue.length) {
    const u = queue.shift();
    visited.add(u);
    const nextRank = rank.get(u) + 1;
    for (const v of adj.get(u)) {
      if (rank.get(v) < nextRank) rank.set(v, nextRank);
      const deg = indeg.get(v) - 1;
      indeg.set(v, deg);
      if (deg <= 0) queue.push(v);
    }
  }

  // 成环残留节点按原序松弛一次，保证节点不全堆在第一列
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    for (const v of adj.get(n.id)) {
      if (!visited.has(v)) rank.set(v, Math.max(rank.get(v), rank.get(n.id) + 1));
    }
  }
  return rank;
}

function renderGraph(spec) {
  const norm = normalizeGraph(spec);
  if (!norm) return null;
  const { nodes, edges } = norm;
  const title = typeof spec.title === 'string' ? spec.title.trim() : '';
  const ranks = rankNodes(nodes, edges);

  const columns = new Map();
  for (const n of nodes) {
    const r = ranks.get(n.id);
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r).push(n);
  }

  const colKeys = [...columns.keys()].sort((a, b) => a - b);
  const numCols = colKeys.length;
  const hasDetail = nodes.some((n) => Boolean(n.detail));
  const nodeH = hasDetail ? 46 : 34;
  const rowGap = 16;
  const gapX = numCols <= 3 ? 52 : 32;
  const width = 640;
  const nodeW = Math.max(84, Math.min(168, Math.floor((width - 32 - (numCols - 1) * gapX) / numCols)));
  const totalW = numCols * nodeW + (numCols - 1) * gapX;
  const startX = Math.max(12, Math.round((width - totalW) / 2));

  const maxRows = Math.max(...colKeys.map((k) => columns.get(k).length));
  const height = Math.max(110, maxRows * nodeH + Math.max(0, maxRows - 1) * rowGap + 36);

  const pos = new Map();
  colKeys.forEach((colKey, colIdx) => {
    const list = columns.get(colKey);
    const colH = list.length * nodeH + Math.max(0, list.length - 1) * rowGap;
    const colTop = Math.round((height - colH) / 2);
    const x = startX + colIdx * (nodeW + gapX);
    list.forEach((node, rowIdx) => {
      const y = colTop + rowIdx * (nodeH + rowGap);
      pos.set(node.id, { x, y, w: nodeW, h: nodeH, cx: x + nodeW / 2, cy: y + nodeH / 2 });
    });
  });

  const sig = `${title}|${nodes.map((n) => n.id).join(',')}|${edges.map((e) => `${e.from}->${e.to}`).join(',')}`;
  const markerId = `md-arrow-${strHash(sig)}`;
  const maxLabelCols = Math.max(8, Math.floor((nodeW - 18) / 7));

  const edgeEls = edges.map((e) => {
    const from = pos.get(e.from);
    const to = pos.get(e.to);
    let d;
    let mx;
    let my;
    if (to.x >= from.x + from.w - 4) {
      const x1 = Number((from.x + from.w).toFixed(1));
      const y1 = Number(from.cy.toFixed(1));
      const x2 = Number((to.x - 2).toFixed(1));
      const y2 = Number(to.cy.toFixed(1));
      const dx = Math.max(16, (x2 - x1) * 0.45);
      d = `M ${x1} ${y1} C ${Number((x1 + dx).toFixed(1))} ${y1}, ${Number((x2 - dx).toFixed(1))} ${y2}, ${x2} ${y2}`;
      mx = Number(((x1 + x2) / 2).toFixed(1));
      my = Number(((y1 + y2) / 2 - 5).toFixed(1));
    } else {
      const x1 = Number(from.cx.toFixed(1));
      const y1 = Number(from.y.toFixed(1));
      const x2 = Number(to.cx.toFixed(1));
      const y2 = Number((to.y - 2).toFixed(1));
      const arch = Math.max(14, Math.min(y1, y2) - 22);
      d = `M ${x1} ${y1} C ${x1} ${arch}, ${x2} ${arch}, ${x2} ${y2}`;
      mx = Number(((x1 + x2) / 2).toFixed(1));
      my = Number((arch + 4).toFixed(1));
    }

    const edgeLabel = e.label ? clipText(e.label, 12) : '';
    const bgW = edgeLabel ? Math.max(24, visualLen(edgeLabel) * 6 + 8) : 0;
    return html`<g>
      <path class="md-graph-edge" d="${d}" marker-end="url(#${markerId})"></path>
      ${edgeLabel ? html`<rect class="md-graph-edge-bg" x="${Number((mx - bgW / 2).toFixed(1))}" y="${my - 10}" width="${bgW}" height="14" rx="3"></rect>
        <text class="md-graph-edge-label" x="${mx}" y="${my}" text-anchor="middle">${edgeLabel}</text>` : ''}
    </g>`;
  });

  const nodeEls = nodes.map((n) => {
    const p = pos.get(n.id);
    const labelText = clipText(n.label, maxLabelCols);
    const detailText = n.detail ? clipText(n.detail, maxLabelCols) : '';
    const titleTip = n.detail ? `${n.label} — ${n.detail}` : n.label;
    const assetId = resolveGraphAssetId(n.label, n.id);
    return html`<g class="md-graph-node tone-${n.tone}" role="button" tabindex="0" aria-label="${titleTip}" data-graph-node="${n.id}" data-graph-label="${n.label}" data-graph-detail="${n.detail}" data-asset-id="${assetId}">
      <title>${titleTip}</title>
      <rect class="md-graph-box" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="6"></rect>
      <rect class="md-graph-accent" x="${p.x}" y="${p.y + 4}" width="2" height="${p.h - 8}" rx="1"></rect>
      <text class="md-graph-label" x="${p.x + 10}" y="${detailText ? p.y + 19 : p.y + 21}">${labelText}</text>
      ${detailText ? html`<text class="md-graph-detail" x="${p.x + 10}" y="${p.y + 35}">${detailText}</text>` : ''}
    </g>`;
  });

  const head = title
    ? html`<figcaption class="md-chart-head"><span class="md-chart-title">${title}</span><span class="md-chart-meta">${nodes.length} 节点 · ${edges.length} 条传导</span></figcaption>`
    : '';

  return html`<figure class="md-chart md-chart-graph">
    ${head}
    <svg class="md-chart-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${title || '传导关系图'}">
      <defs>
        <marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path class="md-graph-arrow" d="M 0 1.5 L 8.5 5 L 0 8.5 z"></path>
        </marker>
      </defs>
      ${edgeEls}
      ${nodeEls}
    </svg>
  </figure>`;
}

/* ------------------------------------------------------------------ *
 * 条形图（多空 / 资金流 / 涨跌对比）
 * ------------------------------------------------------------------ */

function renderBar(spec) {
  const raw = Array.isArray(spec.data) ? spec.data : [];
  const items = raw
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const label = typeof d.label === 'string' ? d.label.trim() : '';
      const value = Number(d.value);
      if (!label || !Number.isFinite(value)) return null;
      const tone = safeTone(d.tone, value >= 0 ? 'up' : 'down');
      return { label, value, tone };
    })
    .filter(Boolean)
    .slice(0, 16);
  if (!items.length) return null;

  const title = (typeof spec.title === 'string' && spec.title.trim()) || '数值对比';
  const unit = typeof spec.unit === 'string' ? spec.unit.trim() : '';
  const maxAbs = Math.max(...items.map((item) => Math.abs(item.value)), 1e-9);

  return html`<figure class="md-chart md-chart-bar">
    <figcaption class="md-chart-head">
      <span class="md-chart-title">${title}</span>
      ${unit ? html`<span class="md-chart-meta">单位：${unit}</span>` : ''}
    </figcaption>
    <div class="md-bar-list">
      ${items.map((item) => {
        const pct = Math.max(2, Math.round((Math.abs(item.value) / maxAbs) * 100));
        const dirClass = item.tone === 'up' || item.tone === 'down' ? `is-${item.tone}` : 'is-accent';
        const sign = item.value > 0 && dirClass !== 'is-accent' ? '+' : '';
        return html`<div class="md-bar-row">
          <span class="md-bar-label" title="${item.label}">${item.label}</span>
          <div class="md-bar-track"><div class="md-bar-fill ${dirClass}" style="width:${pct}%"></div></div>
          <span class="md-bar-val ${dirClass}">${sign}${formatNum(item.value)}${unit ? ` ${unit}` : ''}</span>
        </div>`;
      })}
    </div>
  </figure>`;
}

/* ------------------------------------------------------------------ *
 * 折线图（趋势 / 多序列）
 * ------------------------------------------------------------------ */

function normalizeSeries(spec) {
  const list = Array.isArray(spec.series)
    ? spec.series.slice(0, 3)
    : Array.isArray(spec.data)
      ? [{ name: '序列', data: spec.data }]
      : [];

  return list
    .map((s) => {
      if (!s || typeof s !== 'object' || !Array.isArray(s.data)) return null;
      const pts = s.data
        .map((p) => {
          if (!p || typeof p !== 'object') return null;
          const label = typeof p.label === 'string' ? p.label.trim() : typeof p.date === 'string' ? p.date.trim() : '';
          const value = Number(p.value);
          return label && Number.isFinite(value) ? { label, value } : null;
        })
        .filter(Boolean)
        .slice(-120);
      if (pts.length < 2) return null;
      return { name: (typeof s.name === 'string' && s.name.trim()) || '序列', pts };
    })
    .filter(Boolean);
}

function renderLine(spec) {
  const series = normalizeSeries(spec);
  if (!series.length) return null;

  const title = (typeof spec.title === 'string' && spec.title.trim()) || '走势对比';
  const unit = typeof spec.unit === 'string' ? spec.unit.trim() : '';
  const unitSuffix = unit ? ` ${unit}` : '';
  const allVals = series.flatMap((s) => s.pts.map((p) => p.value));
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const width = 640;
  const height = 196;
  const { padL, padT, plotW, plotH, yOf, grid } = buildChartFrame(rawMin, rawMax, width, height);

  const paths = series.map((s, sIdx) => {
    const denom = s.pts.length - 1;
    const coords = s.pts.map((p, idx) => ({
      x: Number((padL + (idx / denom) * plotW).toFixed(1)),
      y: yOf(p.value),
    }));
    const last = coords[coords.length - 1];
    return html`<g>
      <polyline class="md-line-path series-${sIdx}" points="${coords.map((c) => `${c.x},${c.y}`).join(' ')}"></polyline>
      <circle class="md-line-dot series-${sIdx}" cx="${last.x}" cy="${last.y}" r="3"></circle>
    </g>`;
  });

  const refPts = series[0].pts;
  const xFor = (idx) => Number((padL + (idx / (refPts.length - 1)) * plotW).toFixed(1));
  const xLabels = renderXLabels(refPts.map((p) => p.label), xFor, padL, plotW, height);
  const slices = refPts.map((pt, idx) => {
    const cx = xFor(idx);
    const left = idx === 0 ? padL : (xFor(idx - 1) + cx) / 2;
    const right = idx === refPts.length - 1 ? padL + plotW : (cx + xFor(idx + 1)) / 2;
    const sliceX = Number(left.toFixed(1));
    const sliceW = Number((right - left).toFixed(1));
    const rows = series.map((s) => {
      const p = s.pts[Math.min(idx, s.pts.length - 1)];
      return `${s.name} ${formatNum(p.value)}${unitSuffix}`;
    });
    const rowsText = rows.join('|');
    return html`<rect class="md-line-hit" x="${sliceX}" y="${padT}" width="${sliceW}" height="${plotH}" tabindex="0" aria-label="${`${pt.label} ${rows.join(' ')}`}" data-chart-tip="line" data-tip-x="${cx}" data-tip-title="${pt.label}" data-tip-rows="${rowsText}"></rect>`;
  });

  const legend = series.length > 1
    ? html`${series.map((s, idx) => html`<span class="md-line-legend series-${idx}">${s.name}</span>`)}`
    : unit
      ? html`<span>单位：${unit}</span>`
      : '';

  return html`<figure class="md-chart md-chart-line">
    <figcaption class="md-chart-head">
      <span class="md-chart-title">${title}</span>
      ${legend ? html`<span class="md-chart-meta">${legend}</span>` : ''}
    </figcaption>
    <svg class="md-chart-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${title}">
      ${grid}
      <line class="md-chart-crosshair" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" hidden></line>
      ${paths}
      ${xLabels}
      ${slices}
    </svg>
    <div class="md-chart-tip" hidden></div>
  </figure>`;
}

/* ------------------------------------------------------------------ *
 * 统一分发入口
 * ------------------------------------------------------------------ */

function inferType(lang, spec) {
  if (typeof spec.type === 'string' && spec.type.trim()) return spec.type.trim().toLowerCase();
  if (lang === 'kline') return 'kline';
  if (lang === 'graph' || Array.isArray(spec.nodes) || Array.isArray(spec.edges)) return 'graph';
  const firstBar = Array.isArray(spec.data) ? spec.data[0] : null;
  if (firstBar && typeof firstBar === 'object' && firstBar.open !== undefined) return 'kline';
  if (Array.isArray(spec.series)) return 'line';
  if (Array.isArray(spec.data)) return 'bar';
  return '';
}

export function renderChartBlock(lang, rawCode, { closed = true } = {}) {
  if (!closed) {
    return html`<div class="md-chart md-chart-pending" role="status">正在绘制图表…</div>`;
  }

  const trimmed = String(rawCode).trim();
  if (!trimmed) return null;

  const fence = String(lang).trim().toLowerCase();
  if (fence === 'mermaid' || /^(?:graph|flowchart)\s+(?:LR|TB|TD|RL|BT)\b/i.test(trimmed)) {
    const spec = parseMermaidGraph(trimmed);
    return spec ? renderGraph(spec) : null;
  }

  let spec;
  try {
    spec = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;

  const kind = inferType(fence, spec);
  if (kind === 'kline' || kind === 'candlestick') return renderKline(spec);
  if (kind === 'graph' || kind === 'relation' || kind === 'dag' || kind === 'flow') return renderGraph(spec);
  if (kind === 'bar' || kind === 'column') return renderBar(spec);
  if (kind === 'line' || kind === 'trend') return renderLine(spec);
  return null;
}
