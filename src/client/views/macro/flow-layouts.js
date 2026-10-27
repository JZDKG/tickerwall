/* ================================================================== *
 * 传导图谱自动布局
 *
 * 两种视图、两套算法：
 *
 *   1. layoutTiered —— 全局罗盘 / 沙盘推演
 *      行号来自知识库里的 tier 声明（① 定价之锚 → ② 通胀实体 → ③ 终极避险 → ④ 权益高Beta），
 *      行内左右顺序由「相邻交换 + 交叉计数」局部搜索决定（dagre 的 ordering 阶段用的就是这套）。
 *
 *   2. layoutMindmap —— 单点聚焦
 *      这张图天然是棵两层树（上游 → 焦点 → 下游），交给 @dagrejs/dagre 的 LR 分层，
 *      它会把左列、焦点、右列排得比手算更稳。
 *
 * 为什么全局图不用 dagre / elkjs 自动分层？
 *   实测过，不行（见 docs/engineering-and-flowchart-plan.md 附录「引擎实测记录」）：
 *   · dagre 的 node.rank 属性被 network-simplex ranker 忽略，16 条边跑出 6 层，
 *     dxy 与 us10y 这两个同为「定价之锚」的节点被分到 y=188 / y=36 两行；
 *   · elkjs 的 layered + partitioning 也不保证同 partition 同行，
 *     四个 partition 同样裂成 8 行。
 *   这张图有 3 个因果闭环（油→10Y→美元→油 等），拓扑层级本来就不唯一，
 *   业务上要的是「四层生态位」，不是「最长路径层数」。所以层级由知识库声明，
 *   算法只负责行内顺序与间距 —— 既不手调坐标，也不假装让引擎猜语义。
 * ================================================================== */

import dagre from '@dagrejs/dagre';
import { MACRO_GRAPH_NODES, NODE_BY_ID, CORE_EDGES, MACRO_TRANSMISSION_EDGES, SUB_HOST } from './knowledge-base.js';

/** 行内水平间距：要放得下 4 字机理胶囊 + 正交折线的两个 90° 转角 */
export const CARD_GAP_X = 40;
/** 行间垂直间距：要放得下胶囊（17px 高）与 manhattan 路由的横移段 */
export const ROW_GAP_Y = 96;
export const CANVAS_PAD = 24;

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* ------------------------------------------------------------------ *
 * 交叉计数：两行之间有多少条边互相穿过
 * ------------------------------------------------------------------ */
export function countCrossings(pairs) {
  let n = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      const a = pairs[i];
      const b = pairs[j];
      if ((a[0] - b[0]) * (a[1] - b[1]) < 0) n += 1;
    }
  }
  return n;
}

/**
 * 把一条边折算成「行内索引对」，用于交叉计数。
 * 跨行的边（例如 copper 直接到 sp500、跳过中间行）按两端所在行的索引算，
 * 与同层相邻行的边混在一起计数即可 —— 局部搜索只需要相对优劣。
 */
export function edgeIndexPairs(edges, rowOf, indexOf) {
  const out = [];
  for (const e of edges) {
    const ra = rowOf.get(e.from);
    const rb = rowOf.get(e.to);
    if (ra == null || rb == null || ra === rb) continue;
    out.push({ ra, rb, ia: indexOf.get(e.from), ib: indexOf.get(e.to) });
  }
  return out;
}

export function totalCrossings(indexPairs, lo, hi) {
  const between = (r) => r >= lo && r <= hi;
  const list = indexPairs.filter((p) => between(p.ra) && between(p.rb)).map((p) => [p.ia, p.ib]);
  return countCrossings(list);
}

/* ------------------------------------------------------------------ *
 * layoutTiered
 *
 * 返回：
 *   nodes: [{ id, x, y, w, h }]   x/y 是左上角（X6 的 position 口径）
 *   bands: [{ tier, zone, y, height, label, tone }]  四个生态位分组带
 *   width / height
 * ------------------------------------------------------------------ */
export function layoutTiered({
  nodes = MACRO_GRAPH_NODES,
  edges = CORE_EDGES,
  gapX = CARD_GAP_X,
  gapY = ROW_GAP_Y,
  pad = CANVAS_PAD,
} = {}) {
  // 1. 按 tier 分桶，桶内顺序 = 知识库声明顺序（声明顺序本身是「因果阅读顺序」，是好的初始解）
  const tiers = [...new Set(nodes.map((n) => n.tier))].sort((a, b) => a - b);
  const rows = tiers.map((t) => nodes.filter((n) => n.tier === t).map((n) => n.id));
  const rowOf = new Map();
  rows.forEach((ids, i) => ids.forEach((id) => rowOf.set(id, i)));

  const indexOf = () => {
    const m = new Map();
    rows.forEach((ids) => ids.forEach((id, i) => m.set(id, i)));
    return m;
  };

  const ordEdges = edges.filter((e) => NODE_BY_ID.has(e.from) && NODE_BY_ID.has(e.to));

  // 2. 局部搜索：反复尝试相邻交换，只接受能减少交叉数的交换。
  //    这是 dagre ordering 阶段同款的 transpose 步，比单纯重心排序稳 —— 好顺序不会被搅乱。
  for (let pass = 0; pass < 6; pass += 1) {
    let improved = false;
    for (let r = 0; r < rows.length; r += 1) {
      for (let i = 0; i + 1 < rows[r].length; i += 1) {
        const lo = Math.max(0, r - 1);
        const hi = Math.min(rows.length - 1, r + 1);
        const before = totalCrossings(edgeIndexPairs(ordEdges, rowOf, indexOf()), lo, hi);
        // 交换
        const a = rows[r][i];
        rows[r][i] = rows[r][i + 1];
        rows[r][i + 1] = a;
        const after = totalCrossings(edgeIndexPairs(ordEdges, rowOf, indexOf()), lo, hi);
        if (after < before) {
          improved = true;
        } else {
          const b = rows[r][i];
          rows[r][i] = rows[r][i + 1];
          rows[r][i + 1] = b;
        }
      }
    }
    if (!improved) break;
  }

  // 3. 行高 = 该行最高卡片；行宽 = 该行卡片宽之和 + 间距
  const rowH = rows.map((ids) => (ids.length ? Math.max(...ids.map((id) => NODE_BY_ID.get(id).h)) : 0));
  const rowW = rows.map((ids) => {
    if (!ids.length) return 0;
    const sum = ids.reduce((s, id) => s + NODE_BY_ID.get(id).w, 0);
    return sum + (ids.length - 1) * gapX;
  });

  const width = Math.max(...rowW, 1) + pad * 2;
  const height = rowH.reduce((s, h) => s + h, 0) + (rows.length - 1) * gapY + pad * 2;

  // 4. 落位：每行水平居中（视觉重心对齐），卡片在自己的行高里垂直居中
  const out = [];
  const bands = [];
  let y = pad;
  rows.forEach((ids, r) => {
    let x = (width - rowW[r]) / 2;
    for (const id of ids) {
      const n = NODE_BY_ID.get(id);
      out.push({ id, x: Math.round(x), y: Math.round(y + (rowH[r] - n.h) / 2), w: n.w, h: n.h });
      x += n.w + gapX;
    }
    const zone = NODE_BY_ID.get(ids[0])?.zone ?? 'risk';
    bands.push({
      tier: tiers[r],
      zone,
      // 分组带比卡片本身外扩一点，把胶囊与折线也圈进去
      y: Math.round(y - gapY * 0.34),
      height: Math.round(rowH[r] + gapY * 0.68),
      label: zone,
    });
    y += rowH[r] + gapY;
  });

  return { nodes: out, bands, width, height, rows };
}

/* ------------------------------------------------------------------ *
 * layoutMindmap
 *
 * 上游驱动 → 焦点 → 下游传导，dagre LR 三层。
 * focus 可以是同源子标的（gold-cn / brent / vxn）：此时把宿主卡的上下游也拉进来，
 * 否则点「沪金」会看到一张只有一个上游的秃图。
 * ------------------------------------------------------------------ */
export function layoutMindmap({ focusId = 'gold-intl', edges = MACRO_TRANSMISSION_EDGES } = {}) {
  const hostId = SUB_HOST.get(focusId) ?? focusId;
  const centerId = focusId;
  const selfIds = new Set([focusId, hostId]);

  // 子标的（沪金/布伦特/VXN）没有自己的上下游，它的上下游就是宿主卡的上下游 ——
  // 所以聚焦子标的时，把宿主卡作为中间节点插进来：上游 → 宿主 → 子标的。
  const upIds = new Set();
  const downIds = new Set();
  const links = [];

  for (const e of edges) {
    const touchesCenter = e.to === centerId || e.from === centerId;
    const touchesHost = hostId !== centerId && (e.to === hostId || e.from === hostId);
    if (touchesCenter) {
      links.push({ edge: e, from: e.from, to: e.to });
      if (e.to === centerId) upIds.add(e.from);
      else downIds.add(e.to);
    } else if (touchesHost) {
      links.push({ edge: e, from: e.from, to: e.to });
      if (e.to === hostId) upIds.add(e.from);
      else downIds.add(e.to);
    }
  }
  if (hostId !== centerId) links.push({ edge: null, from: hostId, to: centerId, cluster: true });
  for (const id of selfIds) {
    upIds.delete(id);
    downIds.delete(id);
  }

  const CENTER = { w: 188, h: 84 };
  const LEAF = { w: 168, h: 62 };
  const sizeOf = (id) => (id === centerId ? CENTER : LEAF);

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 16,
    ranksep: 152,
    marginx: 20,
    marginy: 20,
    edgesep: 18,
    ranker: 'tight-tree',
  });
  g.setDefaultEdgeLabel(() => ({}));

  g.setNode(centerId, { width: CENTER.w, height: CENTER.h });
  for (const e of links) {
    for (const id of [e.from, e.to]) {
      if (g.hasNode(id)) continue;
      const s = sizeOf(id);
      g.setNode(id, { width: s.w, height: s.h });
    }
    g.setEdge(e.from, e.to, {});
  }

  dagre.layout(g);

  const nodes = [...g.nodes()].map((id) => {
    const p = g.node(id);
    const size = sizeOf(id);
    return { id, x: Math.round(p.x - size.w / 2), y: Math.round(p.y - size.h / 2), w: size.w, h: size.h };
  });

  const width = Math.round(g.graph().width ?? 0);
  const height = Math.round(g.graph().height ?? 0);
  return { nodes, bands: [], width, height, links, preds: [...upIds], succs: [...downIds] };
}

/* ------------------------------------------------------------------ *
 * 端口分配
 *
 * 每条边两端各自挑一个端口槽位：
 *   · 垂直向的边（跨行）从源卡 bottom/top 出、汇入目标卡 top/bottom
 *   · 同行的边从 right/left 出
 * 同一条边在一张卡上占一个槽，同一侧多个槽沿该侧等距铺开 ——
 * 这样 4 条边进黄金卡不会全挤在中心一点，蜘蛛网感从根上没了。
 * ------------------------------------------------------------------ */
export function assignPorts(nodes, edges) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const cx = (n) => n.x + n.w / 2;
  const cy = (n) => n.y + n.h / 2;

  const plan = []; // { edge, fromSide, toSide, fromSlot, toSlot }
  const slots = new Map(); // `${nodeId}:${side}` -> [edgeId]

  const push = (key, id) => {
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push(id);
  };

  for (const e of edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    const dx = cx(b) - cx(a);
    const dy = cy(b) - cy(a);
    const vertical = Math.abs(dy) > Math.abs(dx) * 0.55;

    let fromSide;
    let toSide;
    if (vertical) {
      fromSide = dy > 0 ? 'bottom' : 'top';
      toSide = dy > 0 ? 'top' : 'bottom';
    } else {
      fromSide = dx > 0 ? 'right' : 'left';
      toSide = dx > 0 ? 'left' : 'right';
    }
    push(`${e.from}:${fromSide}`, e.id);
    push(`${e.to}:${toSide}`, e.id);
    plan.push({ edge: e, fromSide, toSide });
  }

  /**
   * 槽位 → 该侧的中线偏移（相对卡片中心，左负右正 / 上负下正）。
   * 两端留 26px 让位给圆角与箭头，中间等距。
   */
  const slotOffset = (side, i, count, w, h) => {
    const span = (side === 'top' || side === 'bottom' ? w : h) - 52;
    if (count <= 1) return 0;
    const usable = Math.max(span, 0);
    const step = usable / (count - 1);
    return -usable / 2 + step * i;
  };

  return { plan, slots, slotOffset };
}
