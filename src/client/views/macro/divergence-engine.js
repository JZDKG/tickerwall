/* ================================================================== *
 * 实盘背离检测引擎
 *
 * 输入：/api/macro 的原始载荷 + 一条理论边；输出：这条边的实盘状态。
 * 全部纯函数，不碰 DOM、不发请求 —— 所以 Node 里能直接单测（tests/divergence.test.js）。
 *
 * 口径（与 docs/macro-transmission-design.md 第四节一致，经用户拍板收紧）：
 *   TREND_DIVERGE_ABS    = 0.35  |ρ20| ≥ 0.35 且与理论反号，并要求 ρ60 也同向反号（持续性确认）
 *   TREND_DIVERGE_STRONG = 0.45  |ρ20| ≥ 0.45（|t| > 2.13, p < 0.05）单窗即可判强背离
 *   TREND_ALIGN_ABS      = 0.25  与理论同号且 |ρ| ≥ 0.25 → 走势与该机制一致
 * 0.28 的旧阈值被证伪：E08（油→金）实测 ρ20 = −0.34、ρ60 = −0.11，纯属单月随机游走，
 * 抬到 0.35 + 60 期二次确认后正好滤掉。
 *
 * 2026-10-28 两处修正（docs/economic-explainer-product-and-architecture-plan.md §2 / §4.4）：
 *   1. 「当期」比较改成**共同日期配对**：原来 lastA / lastB 各自取最后一条非空值，
 *      于是「黄金最新周二、美元最新周一」会被判成当期同涨同跌。现在取最后一个
 *      双方都有观测的位置，并把该日期一起返回；错位时标记 unaligned，界面必须显示日期。
 *   2. 文案去掉因果与频率暗示：逻辑兑现 → 走势与机制一致；罕见同涨 → 同窗口同涨
 *      （未计算历史频率就不说「罕见」）；短期/中期 → 直接渠道/间接渠道。
 * ================================================================== */

import { MACRO_TRANSMISSION_EDGES, CORE_EDGES } from './knowledge-base.js';

export const SIG_MOVE_K = 0.5; // 单期波动超过 0.5σ 才算「剧烈异动」
export const TREND_DIVERGE_ABS = 0.35;
export const TREND_DIVERGE_STRONG = 0.45;
export const TREND_ALIGN_ABS = 0.25;
export const MIN_SAMPLES = 20;

/* ------------------------------------------------------------------ *
 * 序列小工具
 * ------------------------------------------------------------------ */

export function findLastValid(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] != null && Number.isFinite(arr[i])) return arr[i];
  return null;
}

export function calcStd(arr) {
  const v = (arr ?? []).filter((x) => x != null && Number.isFinite(x));
  if (v.length < 3) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const ss = v.reduce((a, b) => a + (b - m) ** 2, 0);
  const s = Math.sqrt(ss / (v.length - 1));
  return s > 0 ? s : null;
}

export function pearson(xs, ys) {
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

/**
 * 最近 win 期滚动相关。
 *
 * 口径是「最近 win 个**共同**交易日」，不是「最近 win 条日对齐记录」——
 * /api/macro 的 recent.dates 是各市场交易日的并集，单看 oil 与 brent 这种同日历的
 * 组合，最后 20 条里也只有 10 条两边都有值（跨时区休市造成的空洞），
 * 按位置截窗口会直接把样本数打到阈值以下、整条边的 20 期相关恒为 null。
 * 先取成对非空、再截尾 win 个，才是与后端 pairwise 一致的做法。
 */
export function lastRollingCorr(a, b, win = 20) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const xs = [];
  const ys = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  const tail = Math.max(0, xs.length - win);
  const px = xs.slice(tail);
  const py = ys.slice(tail);
  return px.length >= Math.max(6, Math.floor(win * 0.6)) ? pearson(px, py) : null;
}

export function getMatrixCorr(matrix, a, b) {
  if (!matrix?.ids) return null;
  const i = matrix.ids.indexOf(a);
  const j = matrix.ids.indexOf(b);
  if (i < 0 || j < 0) return null;
  const v = matrix.corr?.[i]?.[j];
  return Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ *
 * 变动值格式化
 * ------------------------------------------------------------------ */

/** 变动值 → 可读文本。价格类是对数收益率（转成 %），利率类是百分点差（转成 bp）。 */
export function fmtChg(v, kind) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kind === 'rate') {
    const bp = v * 100;
    return `${bp >= 0 ? '+' : '−'}${Math.abs(bp).toFixed(1)}bp`;
  }
  const p = (Math.exp(v) - 1) * 100;
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}%`;
}

/* ------------------------------------------------------------------ *
 * 背离检测
 * ------------------------------------------------------------------ */

/**
 * 最后一个「双方都有观测」的位置。
 *
 * 这是「当期」比较的唯一合法入口：单边取最新值会把不同日期当成同一天。
 * 返回 -1 表示没有任何共同观测。
 */
export function lastCommonIndex(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return -1;
  const n = Math.min(a.length, b.length);
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = a[i];
    const y = b[i];
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) return i;
  }
  return -1;
}

/** 最后一个非空值的下标（用于判断「谁更新」） */
function lastValidIndex(arr) {
  if (!Array.isArray(arr)) return -1;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (arr[i] != null && Number.isFinite(arr[i])) return i;
  }
  return -1;
}

export function evaluateEdgeReality(edge, macroData) {
  const changes = macroData?.recent?.changes ?? {};
  const dates = macroData?.recent?.dates ?? [];
  const a = changes[edge.from];
  const b = changes[edge.to];
  const empty = {
    status: 'neutral',
    badge: '○ 数据不足',
    lastA: null,
    lastB: null,
    roll20: null,
    roll60: null,
    longCorr: null,
    n: 0,
    asOf: null,
    unaligned: false,
  };
  if (!Array.isArray(a) || !Array.isArray(b)) return empty;
  if (a.length < MIN_SAMPLES || b.length < MIN_SAMPLES) return empty;

  // 共同日期配对：只用「双方同一天都有观测」的那一对做当期比较
  const idx = lastCommonIndex(a, b);
  if (idx < 0) {
    // 一条共同观测都没有：连「当期」都不存在，直接报数据不足
    return {
      ...empty,
      roll20: lastRollingCorr(a, b, 20),
      roll60: lastRollingCorr(a, b, 60),
      longCorr: getMatrixCorr(macroData.matrix, edge.from, edge.to),
      reason: 'NO_COMMON_DATES',
    };
  }
  const lastA = idx >= 0 ? a[idx] : null;
  const lastB = idx >= 0 ? b[idx] : null;
  const asOf = idx >= 0 ? (dates[idx] ?? null) : null;
  const idxA = lastValidIndex(a);
  const idxB = lastValidIndex(b);
  // 任意一端的观测比共同日期更新 → 当期比较发生在更早的日期，界面必须标出来
  const unaligned = idx >= 0 && (idxA > idx || idxB > idx);

  const stdA = calcStd(a.slice(-60));
  const stdB = calcStd(b.slice(-60));
  const roll20 = lastRollingCorr(a, b, 20);
  const roll60 = lastRollingCorr(a, b, 60);
  const longCorr = getMatrixCorr(macroData.matrix, edge.from, edge.to);
  // 有效配对数：真正参与相关计算的样本，不是数组长度
  const n = (() => {
    const m = Math.min(a.length, b.length);
    let k = 0;
    for (let i = 0; i < m; i += 1) {
      if (a[i] != null && b[i] != null && Number.isFinite(a[i]) && Number.isFinite(b[i])) k += 1;
    }
    return k;
  })();

  const bigMove =
    lastA != null && lastB != null && stdA != null && stdB != null &&
    Math.abs(lastA) > SIG_MOVE_K * stdA && Math.abs(lastB) > SIG_MOVE_K * stdB;
  const prodSign = lastA != null && lastB != null ? Math.sign(lastA * lastB) : 0;
  const dayDiverged = bigMove && prodSign !== 0 && prodSign !== edge.sign;

  // 20 样本 Pearson 标准误约 0.24：门槛 0.35 并要求 60 期滚动也同向反号（持续性确认），
  // 或 20 期单窗达到 0.45（|t|>2.13, p<0.05 显著反转），滤掉单月随机游走噪声。
  const opp20 = roll20 != null && Math.sign(roll20) !== edge.sign;
  const opp60 = roll60 != null && Math.sign(roll60) !== edge.sign;
  const trendDiverged =
    opp20 &&
    (Math.abs(roll20) >= TREND_DIVERGE_STRONG || (Math.abs(roll20) >= TREND_DIVERGE_ABS && opp60));

  if (dayDiverged || trendDiverged) {
    // 文案只描述观测：不说「罕见」（没有算历史频率），也不说「因果被打破」
    let badge = '⚡ 观测方向不同';
    if (edge.sign === -1 && lastA > 0 && lastB > 0) badge = '⚡ 同窗口同涨';
    else if (edge.sign === -1 && lastA < 0 && lastB < 0) badge = '⚡ 同窗口同跌';
    return {
      status: 'diverged', badge, lastA, lastB, roll20, roll60, longCorr, n,
      dayDiverged, trendDiverged, bigMove, asOf, unaligned,
    };
  }

  const aligned =
    (bigMove && prodSign === edge.sign) ||
    (roll20 != null && Math.sign(roll20) === edge.sign && Math.abs(roll20) >= TREND_ALIGN_ABS);

  return {
    status: aligned ? 'aligned' : 'neutral',
    badge: aligned ? '✓ 走势与机制一致' : '○ 未见明显偏离',
    lastA, lastB, roll20, roll60, longCorr, n, dayDiverged, trendDiverged, bigMove, asOf, unaligned,
  };
}

/** 全部边的实盘状态；同一次渲染只算一遍，避免每个节点各算一次 */
export function evaluateAll(macroData, edges = MACRO_TRANSMISSION_EDGES) {
  return new Map(edges.map((e) => [e.id, evaluateEdgeReality(e, macroData)]));
}

export function findEdge(a, b) {
  if (!a || !b) return null;
  return (
    MACRO_TRANSMISSION_EDGES.find((e) => e.from === a && e.to === b) ??
    MACRO_TRANSMISSION_EDGES.find((e) => e.from === b && e.to === a) ??
    null
  );
}

/** 挑一条最值得提醒的背离边（权重高优先，其次 |ρ20| 大） */
export function pickAlert(edges, reality) {
  const div = edges
    .map((e) => ({ e, r: reality.get(e.id) }))
    .filter((x) => x.r?.status === 'diverged')
    .sort((x, y) => y.e.weight - x.e.weight || Math.abs(y.r.roll20 ?? 0) - Math.abs(x.r.roll20 ?? 0));
  return div[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * 沙盘：两跳冲击传播
 *
 * 方向 = 冲击方向 × 沿路边符号连乘。同一个标的通过两条方向相反的路径被击中时
 * 标 conflict（多空交织）—— 这比单一路径的「利多/利空」信息量高得多。
 *
 * 两跳遍历只说明**路径结构**，不产生幅度、概率或先后时间。所以这里输出的
 * hop 数不能再被翻译成「短期/中期」：那需要时间模型，而本项目没有。
 * ------------------------------------------------------------------ */
export function propagateShock(sourceId, dir, maxHop = 2, opts = {}) {
  // activeEdges：冲击条件下「有资格参与」的边；null / 未给表示全部参与
  const active = opts.activeEdges ?? null;
  const paths = [];
  const walk = (nodeId, d, hop, trail) => {
    for (const e of CORE_EDGES) {
      if (e.from !== nodeId) continue;
      if (active && !active.has(e.id)) continue;
      if (trail.includes(e.to)) continue;
      const nd = d * e.sign;
      paths.push({ target: e.to, dir: nd, hop: hop + 1, trail: [...trail, e.to], edges: e.id, chain: trail.map((x) => ({ id: x })) });
      if (hop + 1 < maxHop) walk(e.to, nd, hop + 1, [...trail, e.to]);
    }
  };
  walk(sourceId, dir, 0, [sourceId]);

  const byNode = new Map();
  for (const p of paths) {
    if (!byNode.has(p.target)) byNode.set(p.target, []);
    byNode.get(p.target).push(p);
  }
  const state = new Map();
  for (const [id, list] of byNode) {
    const dirs = new Set(list.map((p) => p.dir));
    state.set(id, {
      dirs,
      conflict: dirs.size > 1,
      hop: Math.min(...list.map((p) => p.hop)),
      paths: list,
    });
  }
  return state;
}
