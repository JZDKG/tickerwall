/* ================================================================== *
 * 节点：真 HTML 行情卡片 + 四向连接桩
 *
 * 上一代是 <rect> + <text> 拼 SVG，文本宽度只能靠正则估算（textWidth），
 * 也吃不到毛玻璃 / flex 自适应 / 徽章层次。这里每个节点是一段真 DOM，
 * X6 用 foreignObject 把它塞进画布，样式全交给 macro-flow.css。
 *
 * 端口：同一条边在一张卡上占一个「槽」，同侧多槽由 X6 的 line 端口布局
 * 沿边线等距铺开（1 个槽就是正中）—— 这样 4 条边汇入黄金卡不会全挤在
 * 中心一点，斜线蜘蛛网从根上消掉。
 * ================================================================== */

import {
  NODE_BY_ID,
  ZONE_META,
  esc,
  signChar,
} from './knowledge-base.js';
import { fmtChg, findLastValid } from './divergence-engine.js';
import { assignPorts } from './flow-layouts.js';

/* ------------------------------------------------------------------ *
 * 端口 id 规则
 * ------------------------------------------------------------------ */
export const outPortId = (edgeId) => `po-${edgeId}`;
export const inPortId = (edgeId) => `pi-${edgeId}`;

export const PORT_MARKUP = [{ tagName: 'circle', selector: 'portBody' }];

/**
 * 依据布局坐标算出每张卡的 ports 配置。
 * 返回 Map<nodeId, portsConfig>
 */
export function buildPorts(nodes, edges) {
  const { plan } = assignPorts(nodes, edges);
  const byNode = new Map();

  const groupsFor = () => ({
    top: { position: 'top', attrs: portAttrs() },
    bottom: { position: 'bottom', attrs: portAttrs() },
    left: { position: 'left', attrs: portAttrs() },
    right: { position: 'right', attrs: portAttrs() },
  });

  const ensure = (id) => {
    if (!byNode.has(id)) byNode.set(id, { groups: groupsFor(), items: [] });
    return byNode.get(id);
  };

  for (const p of plan) {
    const src = ensure(p.edge.from);
    const dst = ensure(p.edge.to);
    src.items.push({ id: outPortId(p.edge.id), group: p.fromSide, attrs: { portBody: { magnet: true } } });
    dst.items.push({ id: inPortId(p.edge.id), group: p.toSide, attrs: { portBody: { magnet: true } } });
  }
  return byNode;
}

export function portAttrs() {
  return {
    portBody: {
      r: 3,
      magnet: true,
      stroke: 'rgba(122,140,168,.55)',
      strokeWidth: 1.2,
      fill: '#0b1017',
    },
  };
}

/* ------------------------------------------------------------------ *
 * 卡片状态 → 头顶徽章
 *
 * 优先级：沙盘冲击 > 簇内锚点。剧本压暗时不挂锚点（锚点只在「全部关系」下有意义）。
 * ------------------------------------------------------------------ */
export function chipFor(nodeId, ctx) {
  const { state, reality, prop } = ctx;
  if (state.graphMode === 'sandbox' && state.shock) {
    const p = prop?.get(nodeId);
    if (nodeId === state.shock.id) {
      return { text: state.shock.dir > 0 ? '假设大涨 ↑' : '假设大跌 ↓', tone: 'src' };
    }
    if (p) {
      if (p.conflict) return { text: '多空交织', tone: 'mix' };
      const up = p.dirs.has(1);
      return { text: `${p.hop === 1 ? '一阶' : '二阶'}${up ? '利多 ↑' : '利空 ↓'}`, tone: up ? 'src' : 'cold' };
    }
    return null;
  }
  const pairEdge = ctx.pairEdge;
  if (pairEdge?.cluster && !state.playbook && (pairEdge.from === nodeId || pairEdge.to === nodeId)) {
    const r = reality.get(pairEdge.id);
    const tone = r?.status === 'diverged' ? 'mix' : pairEdge.sign > 0 ? 'pos' : 'cold';
    return { text: `${signChar(pairEdge.sign)} ${pairEdge.label}`, tone };
  }
  return null;
}

/** 沙盘里非冲击路径、剧本里非点亮链路的节点 → 压暗 */
export function dimClass(nodeId, ctx) {
  const { state, prop } = ctx;
  if (state.graphMode === 'sandbox' && state.shock) {
    // 震源自身不在 propagateShock 的结果里（它只记「被传导到的节点」），
    // 漏掉这一条会把震源卡一起压暗，看起来像「点了没反应」。
    if (nodeId === state.shock.id) return '';
    return prop?.has(nodeId) ? '' : ' is-dim';
  }
  if (ctx.activeEdges) {
    const on = ctx.activeEdges.nodes.has(nodeId);
    return on ? '' : ' is-dim';
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * 卡片 HTML
 * ------------------------------------------------------------------ */
export function cardHTML(nodeId, ctx, size) {
  const n = NODE_BY_ID.get(nodeId) ?? { id: nodeId, zone: 'risk' };
  const u = ctx.data.universe?.find((x) => x.id === nodeId);
  const zone = ZONE_META[n.zone] ?? ZONE_META.risk;
  const isSub = !NODE_BY_ID.has(nodeId);

  // 子标的（沪金 / 布伦特 / VXN）作为导图焦点时，自己也是一张卡
  const short = u?.short ?? nodeId;
  const name = u?.name ?? short;
  const chg = findLastValid(ctx.data.recent?.changes?.[nodeId]);
  const dir = chg == null ? '' : chg > 0 ? 'up' : chg < 0 ? 'down' : '';
  const price = u?.last == null ? '—' : fmtPrice(u);

  const subId = isSub ? null : n.sub;
  const subU = subId ? ctx.data.universe?.find((x) => x.id === subId) : null;
  const subChg = subU ? findLastValid(ctx.data.recent?.changes?.[subU.id]) : null;
  const subDir = subChg == null ? '' : subChg > 0 ? 'up' : subChg < 0 ? 'down' : '';

  const chip = chipFor(nodeId, ctx);
  const isFocus = ctx.state.graphFocus === nodeId;
  const isPair = ctx.pairEdge && (ctx.pairEdge.from === nodeId || ctx.pairEdge.to === nodeId);
  const isHot = ctx.hotEdge === nodeId || ctx.spotlight === nodeId;

  const cls = [
    'mgx-card',
    `zone-${n.zone}`,
    subU ? 'has-sub' : '',
    ctx.centerId === nodeId ? 'mgx-card--lg' : '',
    isFocus ? 'is-focus' : '',
    isPair ? 'is-pair' : '',
    isHot ? 'is-hot' : '',
    dimClass(nodeId, ctx),
  ].filter(Boolean).join(' ');

  // 尺寸写成内联像素：X6 的 foreignObject 里浏览器会额外塞一层 <body> 包装，
  // 百分比高度在那一层没有确定的参照，实测会把卡片撑到 1100px。
  const box = size ? ` style="width:${size.w}px;height:${size.h}px"` : '';
  return `<div class="${cls}" data-node="${esc(nodeId)}" role="button" tabindex="0"${box}
      aria-label="${esc(name)} ${esc(price)} ${esc(fmtChg(chg, u?.kind))}">
    <div class="mgx-head">
      <span class="mgx-name" title="${esc(name)}">${esc(short)}</span>
      ${chip
        ? `<span class="mgx-chip ${chip.tone}">${esc(chip.text)}</span>`
        : `<span class="mgx-zone">${esc(zone.short)}</span>`}
    </div>
    <div class="mgx-mid">
      <b class="mgx-price ${dir}">${esc(price)}</b>
      <i class="mgx-chg ${dir}">${esc(fmtChg(chg, u?.kind))}</i>
    </div>
    ${subU
      ? `<div class="mgx-sub"><span>${esc(subU.short)}</span><b>${esc(fmtPrice(subU))}</b><i class="${subDir}">${esc(fmtChg(subChg, subU.kind))}</i></div>`
      : ''}
  </div>`;
}

export function fmtPrice(u) {
  const v = u?.last;
  if (v == null || !Number.isFinite(v)) return '—';
  const d = Number.isFinite(u?.decimals) ? u.decimals : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ------------------------------------------------------------------ *
 * 生态位分组带（X6 里的背景矩形）
 * ------------------------------------------------------------------ */
export function bandSVGAttrs(band, index) {
  const meta = ZONE_META[band.label] ?? ZONE_META.risk;
  return { meta, key: `band-${index}` };
}
