/* ================================================================== *
 * 传导图谱区块的编排层（#/macro 顶部）
 *
 * 职责边界：
 *   knowledge-base.js   金融常识（谁影响谁、机理、失效条件）
 *   divergence-engine.js 实盘检验（0.35 + 60 期 / 0.45 强背离）
 *   flow-layouts.js     坐标（四层分层 + dagre 思维导图）
 *   flow-nodes.js       卡片与端口
 *   flow-canvas.js      X6 画布（拖拽 / 缩放 / 聚光灯 / 正交避障）
 *   panels.js           右侧机理卡与区块骨架（纯 HTML 字符串）
 *   本文件              把上面几层拼起来，并保持「画布实例跨重绘存活」
 *
 * 为什么画布要存活：
 *   app.js 每次点模式、点剧本、点连线都会调 refreshGraph()。如果每次都重建
 *   <section>，画布的缩放倍数、拖过的节点位置、连线风格选择全被清空，而且会闪。
 *   所以这里只更换 chrome（模式条 / 工具条 / 横幅 / 焦点条 / 右侧卡）的 outerHTML，
 *   #mg-x6 容器与 MacroFlowCanvas 实例原地保留。
 * ================================================================== */

import {
  CORE_EDGES,
  EDGE_BY_ID,
  MODES,
  PLAYBOOK_BY_ID,
} from './knowledge-base.js';
import { evaluateAll, findEdge, propagateShock } from './divergence-engine.js';
import { shockConditionSet } from './knowledge-base.js';
import { MacroFlowCanvas } from './flow-canvas.js';
import { headHTML, toolsHTML, barsHTML, legendHTML, alertBannerHTML, inspectorHTML, sectionShell } from './panels.js';
import css from '../../styles/macro-flow.css?inline';

export const SECTION = '.macro-graph-section';
export const CANVAS = '.mg-x6';

export let styleInjected = false;
export function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.id = 'macro-flow-css';
  el.textContent = css;
  document.head.appendChild(el);
  styleInjected = true;
}

/** 一个 host 对应一个画布实例 */
export const canvases = new WeakMap();

export function ensureSection(host, data, state) {
  let section = host.querySelector(SECTION);
  // 老版本手绘 SVG 也会渲染出一个 .macro-graph-section，但它里面没有 #mg-x6；
  // 首次从 SVG 升级到 X6 时必须整体重建，否则画布永远挂不上去。
  if (!section || !section.querySelector(CANVAS)) {
    destroyMacroFlow(host);
    host.innerHTML = sectionShell(data, state, { legend: true });
    section = host.querySelector(SECTION);
  }
  return section;
}

/** 用新 HTML 顶掉旧节点（outerHTML 替换，保持 DOM 顺序） */
export function swap(section, selector, html) {
  const old = section.querySelector(selector);
  if (!html) {
    old?.remove();
    return;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = html.trim();
  const fresh = tmp.firstElementChild;
  if (!fresh) return;
  if (old) {
    old.replaceWith(fresh);
    return;
  }
  /**
   * 结构不完整时（升级过程里旧 section 可能缺 .graph-stage）不能让整段渲染崩掉：
   * 原来这里直接 `.before(fresh)`，null 会抛 TypeError，整个图谱区跟着白掉。
   * 退化成「插到 section 末尾」，chrome 至少还在。
   */
  const stage = section.querySelector('.graph-stage');
  if (stage) stage.before(fresh);
  else section.appendChild(fresh);
}

export function syncChrome(section, data, state, reality) {
  swap(section, '.mg-head', headHTML(state));
  swap(section, '.mg-tools', toolsHTML(data, state, reality));

  // 横幅：先清掉旧的，再按当前现实插一条（没有背离就一条都没有）
  for (const el of section.querySelectorAll('.mg-alert')) el.remove();
  const banner = alertBannerHTML(data, reality);
  if (banner) {
    const tmp = document.createElement('div');
    tmp.innerHTML = banner.trim();
    const fresh = tmp.firstElementChild;
    if (fresh) section.querySelector('.graph-stage').before(fresh);
  }

  swap(section, '.mg-focusbar', state.graphMode === 'mindmap' ? barsHTML(data, state) : '');
  swap(section, '.mg-shockbar', state.graphMode === 'sandbox' ? barsHTML(data, state) : '');
  swap(section, '.mg-legend', legendHTML(state.graphMode ?? 'compass'));
  swap(section, '.graph-card', `<aside class="graph-card">${inspectorHTML(data, state, reality)}</aside>`);
}

/** 剧本 / 沙盘只点亮一部分边，画布据此压暗其余 */
export function activeEdgeSets(state) {
  if (state.graphMode === 'sandbox' && state.shock) {
    // 冲击条件只在 sandbox 里生效；null 表示全部边参与（原因未分类时也一样）
    const condSet = shockConditionSet(state.shock.id, state.shockCondition ?? 'unknown');
    const prop = propagateShock(state.shock.id, state.shock.dir, 2, {
      activeEdges: condSet.enabled ? new Set(condSet.enabled) : null,
    });
    const edges = new Set();
    const nodes = new Set([state.shock.id]);
    for (const [id, p] of prop) {
      nodes.add(id);
      for (const q of p.paths) edges.add(q.edges);
    }
    return { prop, active: { edges, nodes } };
  }
  if (state.graphMode === 'compass' && state.playbook) {
    const pb = PLAYBOOK_BY_ID.get(state.playbook) ?? null;
    if (pb) {
      const edges = new Set([...pb.edges, ...pb.breaks]);
      const nodes = new Set();
      for (const id of edges) {
        const e = EDGE_BY_ID.get(id);
        if (e) {
          nodes.add(e.from);
          nodes.add(e.to);
        }
      }
      return { prop: null, active: { edges, nodes } };
    }
  }
  return { prop: null, active: null };
}

/* ------------------------------------------------------------------ *
 * 对外：渲染
 * ------------------------------------------------------------------ */
export function renderMacroFlow(host, data, state, handlers = {}) {
  if (!host || !data) return;
  injectStyle();
  const reality = evaluateAll(data);
  const section = ensureSection(host, data, state);
  const { prop, active } = activeEdgeSets(state);

  const pairEdge = findEdge(state.pair?.[0], state.pair?.[1]);
  const hotIds = new Set();
  if (pairEdge) hotIds.add(pairEdge.id);

  let canvas = canvases.get(host);
  const mount = section.querySelector(CANVAS);
  if (!canvas && mount) {
    mount.innerHTML = '';
    canvas = new MacroFlowCanvas(mount, {
      onEdge: (id) => handlers.onEdge?.(id),
      onNode: (id) => handlers.onNode?.(id),
      onNodeDbl: (id) => handlers.onNodeDbl?.(id),
    });
    canvases.set(host, canvas);
    // 调试入口：控制台里能拿到画布实例（排查连线/布局时不用再改源码重打包）
    if (typeof window !== 'undefined') window.__mgxCanvas = canvas;
  }

  syncChrome(section, data, state, reality);
  canvas?.update({ data, state, reality, prop, pairEdge, activeEdges: active, hotEdgeIds: hotIds });
  return { reality, section, canvas };
}

export function destroyMacroFlow(host) {
  const canvas = canvases.get(host);
  canvas?.dispose();
  canvases.delete(host);
}

export { MODES, CORE_EDGES };
