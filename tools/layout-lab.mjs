/**
 * 布局引擎实验台（离线，只跑 Node，不进浏览器包）
 *
 * 用途：把「为什么全局传导图没有直接用 dagre / elkjs 自动分层」这个判断做成可复现的实验，
 * 而不是一句拍脑袋的结论。改布局策略之前先跑这个看看引擎到底给出什么。
 *
 *   node tools/layout-lab.mjs
 *
 * 结论（2026-10 实测）：
 *   · dagre 的 node.rank 属性被 network-simplex ranker 忽略 → 16 条边排出 6 层，
 *     同为「定价之锚」的 dxy / us10y 落在 y=188 与 y=36 两行。
 *   · dagre compound（setParent 到 4 个生态位）能算出 cluster 框，但 1,035×1,237 的画布
 *     且 cluster 互相嵌套错位，视觉上远不如四层下行流。
 *   · elkjs layered + partitioning（elk.partitioning.partition）也不保证同 partition 同行，
 *     4 个 partition 同样裂成 8 行。
 * 所以真实实现走「知识库声明 tier + 交叉数局部搜索排行内顺序」（src/client/views/macro/flow-layouts.js），
 * elkjs 留作后续试验的 devDependency，不进产物。
 */

import dagre from '@dagrejs/dagre';
import ELK from 'elkjs/lib/elk.bundled.js';

const W = 168;
const H = 78;

// 与 knowledge-base.js 的 tier / 边保持一致的快照（故意写死，避免实验台依赖业务模块）
const TIER = { dxy: 0, us10y: 0, oil: 1, copper: 1, 'gold-intl': 2, sh000001: 3, sp500: 3, ndx100: 3, btc: 3, vix: 3 };
const ZONE = {
  z1: ['dxy', 'us10y'],
  z2: ['oil', 'copper'],
  z3: ['gold-intl'],
  z4: ['sh000001', 'sp500', 'ndx100', 'btc', 'vix'],
};
const EDGES = [
  ['dxy', 'gold-intl'], ['dxy', 'oil'], ['dxy', 'copper'], ['dxy', 'btc'],
  ['us10y', 'gold-intl'], ['us10y', 'ndx100'], ['us10y', 'dxy'],
  ['oil', 'gold-intl'], ['oil', 'us10y'], ['oil', 'sp500'],
  ['copper', 'sp500'], ['copper', 'sh000001'],
  ['sp500', 'vix'], ['sp500', 'ndx100'], ['ndx100', 'btc'], ['vix', 'gold-intl'],
];

const rows = (pairs) => {
  const out = {};
  for (const [id, y] of pairs) out[y] = [...(out[y] ?? []), id];
  return Object.entries(out).sort((a, b) => a[0] - b[0]).map(([y, ids]) => `y=${y}: ${ids.join(', ')}`);
};

/* ---------------- 1. dagre + 显式 rank ---------------- */
function dagreRank() {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: 'TB', nodesep: 48, ranksep: 80, ranker: 'network-simplex', acyclicer: 'greedy' });
  g.setDefaultEdgeLabel(() => ({}));
  for (const [id, rank] of Object.entries(TIER)) g.setNode(id, { width: W, height: H, rank });
  for (const [a, b] of EDGES) g.setEdge(a, b, {});
  dagre.layout(g);
  return rows(Object.keys(TIER).map((id) => [id, Math.round(g.node(id).y)]));
}

/* ---------------- 2. dagre compound（生态位当 cluster） ---------------- */
function dagreCompound() {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90, ranker: 'network-simplex', acyclicer: 'greedy', marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const [z, ids] of Object.entries(ZONE)) {
    g.setNode(z, { paddingX: 18, paddingY: 34 });
    for (const id of ids) {
      g.setNode(id, { width: W, height: H });
      g.setParent(id, z);
    }
  }
  for (const [a, b] of EDGES) g.setEdge(a, b, {});
  dagre.layout(g);
  const clusters = Object.keys(ZONE).map((z) => {
    const p = g.node(z);
    return `${z}=${Math.round(p.width)}x${Math.round(p.height)}`;
  });
  return { size: `${Math.round(g.graph().width)}x${Math.round(g.graph().height)}`, clusters, rows: rows(Object.keys(TIER).map((id) => [id, Math.round(g.node(id).y)])) };
}

/* ---------------- 3. elkjs layered + partitioning ---------------- */
async function elkPartitioned() {
  const elk = new ELK();
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.partitioning.activate': 'true',
      'elk.layered.partitioning.order': 'TRUE',
      'elk.layered.spacing.nodeNodeBetweenLayers': '86',
      'elk.spacing.nodeNode': '44',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: Object.entries(TIER).map(([id, tier]) => ({
      id,
      width: W,
      height: H,
      layoutOptions: { 'elk.partitioning.partition': String(tier) },
    })),
    edges: EDGES.map(([a, b], i) => ({ id: `e${i}`, sources: [a], targets: [b] })),
  };
  const t0 = Date.now();
  const r = await elk.layout(graph);
  return { ms: Date.now() - t0, size: `${Math.round(r.width)}x${Math.round(r.height)}`, rows: rows(r.children.map((c) => [c.id, Math.round(c.y)])) };
}

/* ---------------- 4. 本仓库真实实现 ---------------- */
async function actual() {
  const { layoutTiered } = await import('../src/client/views/macro/flow-layouts.js');
  const lay = layoutTiered();
  return {
    size: `${lay.width}x${lay.height}`,
    rows: rows(lay.nodes.map((n) => [n.id, n.y])),
  };
}

const show = (title, data) => {
  console.log(`\n=== ${title} ===`);
  if (typeof data === 'string') return console.log(data);
  if (data.size) console.log('画布', data.size, data.clusters ? `簇 ${data.clusters.join(' ')}` : '', data.ms ? `${data.ms}ms` : '');
  for (const r of data.rows) console.log('  ' + r);
};

show('dagre + node.rank（rank 被忽略）', { rows: dagreRank() });
show('dagre compound（生态位簇）', dagreCompound());
show('elkjs layered + partitioning', await elkPartitioned());
show('本项目 layoutTiered（声明层级 + 交叉数局部搜索）', await actual());
