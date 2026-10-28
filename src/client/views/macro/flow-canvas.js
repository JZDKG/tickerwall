/* ================================================================== *
 * X6 流程图画布
 *
 * 上一代：字符串拼 <svg>，16 条边全是手调 bend 的二次贝塞尔，节点坐标写死在知识库里，
 *         没法拖、没法缩、没有悬停聚焦。
 * 这一代：@antv/x6 画布 + manhattan 正交避障路由 + 四向连接桩 + 真 HTML 卡片。
 *         节点坐标由 flow-layouts.js 算，边怎么绕由路由器算，用户还能自己拖。
 *
 * 关键实现取舍（都是踩过的坑，别改回去）：
 *  1. 流光用「叠加边」而不是第二条 path。X6 只把算出来的 d 写给 selector=line
 *     的那一个 path，同一条边里再写一个 path 是静态的，不会跟着走。
 *  2. 边标签（机理胶囊）用 SVG rect+text 而不是 foreignObject：foreignObject 标签
 *     在缩放时字体渲染会抖，而且拿不到 dominant-baseline 的稳定表现。
 *  3. 滚轮默认不缩放（guard 拦掉），只有按住 ⌘/Ctrl 才缩 —— 画布高度固定，
 *     裸滚轮如果被吞掉，页面就滚不动了。缩放另有左下角工具条。
 *  4. 节点用 data.html 缓存渲染好的字符串，effect: ['data'] 才会重渲染；
 *     直接改 attrs 对 HTML 节点无效。
 * ================================================================== */

import { Graph, Shape } from '@antv/x6';
import {
  CORE_EDGES,
  MACRO_TRANSMISSION_EDGES,
  NODE_BY_ID,
  ZONE_META,
  TONE_COLOR,
  TONE_DASH,
  esc,
  edgeTone,
  relationTypeOf,
} from './knowledge-base.js';
import { cardHTML, buildPorts, outPortId, inPortId, PORT_MARKUP } from './flow-nodes.js';
import { html } from '../../shared/format.js';
import { layoutTiered, layoutMindmap, assignPorts } from './flow-layouts.js';

export const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** 估算文本宽度：胶囊宽度不能再依赖浏览器测量（服务端渲染/首帧都要一致） */
export function textWidth(s, size) {
  // null / undefined 当作「没有文本」：String(null) 是 'null'，会算出 23px 的假宽度
  if (s == null) return 0;
  let w = 0;
  for (const ch of String(s)) w += CJK.test(ch) ? size : size * 0.58;
  return w;
}

/* ------------------------------------------------------------------ *
 * 形状注册
 * ------------------------------------------------------------------ */
export let registered = false;
export function registerShapes() {
  if (registered) return;
  Shape.HTML.register({
    shape: 'mgx-card',
    width: 152,
    height: 78,
    effect: ['data'],
    html: (cell) => cell.getData()?.html ?? '',
  });
  registered = true;
}

/* ------------------------------------------------------------------ *
 * 三种连线风格
 * ------------------------------------------------------------------ */
export const EDGE_STYLES = {
  orth: {
    router: {
      name: 'manhattan',
      args: {
        step: 10,
        padding: { top: 14, right: 14, bottom: 14, left: 14 },
        startDirections: ['top', 'right', 'bottom', 'left'],
        endDirections: ['top', 'right', 'bottom', 'left'],
        maxLoopCount: 2000,
      },
    },
    connector: { name: 'rounded', args: { radius: 12 } },
  },
  smooth: {
    router: { name: 'normal', args: {} },
    connector: { name: 'smooth', args: {} },
  },
};
export const EDGE_STYLE_ORDER = ['orth', 'smooth'];
export const EDGE_STYLE_LABEL = { orth: '正交折线', smooth: '平滑曲线' };

/** 把「任意方向都能走」收窄成「只按端口朝向进出」，路径立刻规矩 */
export function lockDirections(router, sides) {
  if (router.name !== 'manhattan') return router;
  return {
    ...router,
    args: {
      ...router.args,
      startDirections: [sides.from],
      endDirections: [sides.to],
    },
  };
}

/* ------------------------------------------------------------------ *
 * 主类
 * ------------------------------------------------------------------ */
export class MacroFlowCanvas {
  constructor(container, opts = {}) {
    registerShapes();
    this.container = container;
    this.style = opts.style === 'smooth' ? 'smooth' : 'orth';
    this.manual = new Map(); // id -> {x,y} 用户拖过的位置，跨重绘保留
    this.spotlight = null;
    this.onEdge = opts.onEdge ?? (() => {});
    this.onNode = opts.onNode ?? (() => {});
    this.onNodeDbl = opts.onNodeDbl ?? (() => {});

    // X6 的 resize() 会把 width/height 写成 inline style。如果直接拿 .mg-x6 当容器，
    // autoResize 观测到的滚动高度又会被写回去，一旦内容超界就雪崩（实测涨到 6000px+）。
    // 所以内层单独给一个绝对定位的 div 给 X6，外层尺寸完全由 CSS 掌管。
    this.stageEl = document.createElement('div');
    this.stageEl.className = 'mg-x6-graph';
    container.appendChild(this.stageEl);

    this.graph = new Graph({
      container: this.stageEl,
      autoResize: false,
      background: { color: 'transparent' },
      grid: false,
      panning: { enabled: true, eventTypes: ['leftMouseDown'] },
      mousewheel: {
        enabled: true,
        modifiers: null,
        factor: 1.12,
        minScale: 0.45,
        maxScale: 1.8,
        zoomAtMousePosition: true,
        // 裸滚轮交给页面滚动，只有 ⌘/Ctrl 才缩放画布
        guard: (e) => e.metaKey || e.ctrlKey,
      },
      interacting: { edgeLabelMovable: false, arrowheadMovable: false, vertexMovable: false, edgeMovable: false },
      connecting: { allowBlank: false, allowLoop: false, allowNode: false, allowEdge: false, allowPort: false, allowMulti: false, highlight: false },
    });

    this.tools = this.buildTools();
    this.bindEvents();
    this.fitQueued = false;
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.onResize()) : null;
    this.ro?.observe(container);
    this.onResize();
  }

  /* ---------------- 工具条 ---------------- */
  buildTools() {
    const bar = document.createElement('div');
    bar.className = 'mgx-tools';
    bar.innerHTML = html`
      <button type="button" class="mgx-tbtn" data-ctl="in" title="放大">+</button>
      <button type="button" class="mgx-tbtn" data-ctl="out" title="缩小">−</button>
      <button type="button" class="mgx-tbtn wide" data-ctl="fit" title="适应画布">⊡ 适应</button>
      <button type="button" class="mgx-tbtn wide" data-ctl="reset" title="清除手动拖拽，回到自动布局">↺ 复位</button>
      <button type="button" class="mgx-tbtn wide" data-ctl="style" title="切换连线风格">⇄ <span class="mgx-style">${EDGE_STYLE_LABEL[this.style]}</span></button>
      <span class="mgx-zoom">100%</span>`.toString();
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ctl]');
      if (!btn) return;
      const ctl = btn.dataset.ctl;
      if (ctl === 'in') this.zoomBy(1.2);
      else if (ctl === 'out') this.zoomBy(1 / 1.2);
      else if (ctl === 'fit') this.fit();
      else if (ctl === 'reset') this.resetManual();
      else if (ctl === 'style') this.toggleStyle();
    });
    this.container.appendChild(bar);
    return bar;
  }

  syncZoomLabel() {
    const el = this.tools?.querySelector('.mgx-zoom');
    if (el) el.textContent = `${Math.round((this.graph.zoom() ?? 1) * 100)}%`;
  }

  zoomBy(f) {
    const z = Math.min(1.8, Math.max(0.45, (this.graph.zoom() ?? 1) * f));
    this.graph.zoomTo(z, { center: { x: this.container.clientWidth / 2, y: this.container.clientHeight / 2 } });
    this.syncZoomLabel();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.graph.resize(w, h);
    this.scheduleFit();
  }

  scheduleFit() {
    if (this.fitQueued) return;
    this.fitQueued = true;
    requestAnimationFrame(() => {
      this.fitQueued = false;
      this.fit();
    });
  }

  fit() {
    if (!this.graph || !this.nodes?.length) return;
    this.graph.zoomToFit({ padding: 14, minScale: 0.4, maxScale: 1 });
    this.graph.centerContent();
    this.syncZoomLabel();
  }

  resetManual() {
    this.manual.clear();
    this.reflow();
    this.fit();
  }

  toggleStyle() {
    this.style = this.style === 'orth' ? 'smooth' : 'orth';
    const el = this.tools?.querySelector('.mgx-style');
    if (el) el.textContent = EDGE_STYLE_LABEL[this.style];
    this.applyEdgeStyle();
  }

  applyEdgeStyle() {
    const conf = EDGE_STYLES[this.style];
    for (const cell of this.graph.getEdges()) {
      if (cell.getData()?.overlay) continue;
      cell.setRouter(conf.router);
      cell.setConnector(conf.connector);
    }
  }

  /* ---------------- 事件 ---------------- */
  bindEvents() {
    const g = this.graph;

    g.on('node:click', ({ node }) => {
      const d = node.getData() ?? {};
      if (d.band) return;
      if (d.pill) {
        this.onEdge(d.edgeId);
        return;
      }
      this.onNode(node.id);
    });
    g.on('node:dblclick', ({ node }) => {
      if (node.getData()?.band) return;
      this.onNodeDbl(node.id);
    });
    g.on('edge:click', ({ edge }) => {
      const data = edge.getData();
      if (data?.overlay || !data?.edgeId) return;
      this.onEdge(data.edgeId);
    });
    g.on('blank:click', () => {});
    g.on('render:done', () => {
      this.pruneOrphanViews();
      this.syncPills();
    });
    g.on('node:moving', ({ node }) => {
      if (node.getData()?.band) return;
      this.syncPills();
    });
    g.on('node:moved', ({ node }) => {
      if (node.getData()?.band) return;
      this.manual.set(node.id, node.getPosition());
      this.syncPills();
    });

    // 悬停聚光灯：一阶上下游点亮，其余压暗
    g.on('node:mouseenter', ({ node }) => {
      if (node.getData()?.band) return;
      this.setSpotlight(node.id);
    });
    g.on('node:mouseleave', () => this.setSpotlight(null));
    g.on('scale', () => this.syncZoomLabel());
  }

  neighborsOf(id) {
    const out = new Set([id]);
    for (const e of this.edgeList ?? []) {
      if (e.from === id) out.add(e.to);
      if (e.to === id) out.add(e.from);
    }
    return out;
  }

  setSpotlight(id) {
    if (this.spotlight === id) return;
    this.spotlight = id;
    const lit = id ? this.neighborsOf(id) : null;
    const root = this.container;
    if (!root) return;
    root.classList.toggle('mgx-spot', Boolean(id));
    for (const el of root.querySelectorAll('.mgx-card')) {
      const nid = el.dataset.node;
      const on = !lit || lit.has(nid);
      el.classList.toggle('is-dim', !on);
      el.classList.toggle('is-spot', Boolean(lit) && nid === id);
    }
    for (const cell of this.graph.getEdges()) {
      const data = cell.getData() ?? {};
      const on = !lit || lit.has(data.from) || lit.has(data.to);
      cell.attr('line/opacity', on ? this.baseOpacity(data) : 0.1);
      cell.attr('flow/opacity', on ? 1 : 0);
    }
  }

  baseOpacity(data) {
    if (data.dim) return 0.14;
    return 0.42 + (data.weight ?? 1) * 0.16;
  }

  /* ---------------- 渲染 ---------------- */
  update({ data, state, reality, prop, pairEdge, activeEdges, hotEdgeIds }) {
    this.data = data;
    this.state = state;
    this.reality = reality;
    this.prop = prop;
    this.pairEdge = pairEdge;
    this.activeEdges = activeEdges;
    this.hotEdgeIds = hotEdgeIds ?? new Set();

    this.touchedEdges = this.computeTouchedEdges();
    this.layout = this.computeLayout();
    this.graph.clearCells();
    this.drawBands();
    this.drawNodes();
    this.drawEdges();
    this.drawPills();
    this.pruneOrphanViews();
    this.syncZoomLabel();

    // 模式切换 / 焦点切换会让内容尺寸大幅变化，这时候必须重新适应画布；
    // 只是数据刷新（同一布局）则保留用户的缩放，别把人刚放大的视角打回 100%。
    const sig = `${this.layout.mode}:${Math.round(this.layout.width)}x${Math.round(this.layout.height)}`;
    if (!this.didFirstFit || sig !== this.lastLayoutSig) {
      this.didFirstFit = true;
      this.lastLayoutSig = sig;
      this.scheduleFit();
    }
  }

  /**
   * 孤儿视图对账。
   *
   * X6 的渲染是排队批处理的：clearCells() 之后同一 tick 里立刻 addNode，
   * 上一批里「已排队创建」的 view 仍会被挂到 DOM 上，而对应的 cell 已经不存在 ——
   * 实测每切一次模式会多出 4~15 个 .x6-cell（模型里 21 个、DOM 里 45 个），
   * 表现就是老卡片像幽灵一样叠在新卡片上、聚光灯压暗数对不上。
   * 模型是唯一真相：把 DOM 里 data-cell-id 不在模型中的节点全部摘掉。
   */
  pruneOrphanViews() {
    const stage = this.stageEl;
    if (!stage) return;
    // 每张 cell 只保留 X6 当前真正持有的那个 view 元素，其余（历史批次残留）一律摘掉。
    // 之前只删「模型里不存在的 id」是不够的：同一个 id 会在 DOM 里出现两份
    // （模型 21 个 cell / DOM 38 个元素），聚光灯压暗数、卡片数全部对不上。
    const keep = new Map();
    for (const cell of this.graph.getCells()) {
      const view = cell.findView?.(this.graph);
      if (view?.container) keep.set(cell.id, view.container);
    }
    const seen = new Set();
    for (const el of stage.querySelectorAll('[data-cell-id]')) {
      const id = el.getAttribute('data-cell-id');
      const owner = keep.get(id);
      if (!owner) {
        el.remove();
        continue;
      }
      if (el === owner && !seen.has(id)) {
        seen.add(id);
        continue;
      }
      el.remove();
    }
  }

  /** 只重新落位（拖动复位 / 焦点变化），不碰数据 */
  reflow() {
    if (!this.layout) return;
    this.graph.clearCells();
    this.drawBands();
    this.drawNodes();
    this.drawEdges();
    this.drawPills();
    this.pruneOrphanViews();
  }

  computeLayout() {
    const mode = this.state?.graphMode ?? 'compass';
    if (mode === 'mindmap') {
      const focus = this.state.graphFocus ?? 'gold-intl';
      const lay = layoutMindmap({ focusId: focus, edges: MACRO_TRANSMISSION_EDGES });
      // VXN 这类标的只作为子标的出现、没有登记任何边 —— 画布上只有一张孤零零的中心卡。
      // 不假装它有上游，直接给一张说明卡，比空白画布诚实。
      const orphan = (lay.links ?? []).length === 0;
      return { mode, ...lay, centerId: focus, orphan };
    }
    const lay = layoutTiered({ edges: CORE_EDGES });
    return { mode, ...lay, centerId: null };
  }

  /**
   * 沙盘冲击「被触及」的边集合。
   *
   * 注意 `q.edges` 是**数组**（一条路径上的多段）：早先这里 `set.add(q.edges)`
   * 把整个数组当元素塞进去，于是 `touchedEdges.has(edgeId)` 永远 false ——
   * 沙盘里所有边都被判成 dim，冲击路径根本看不出亮起来。必须逐个 edge id 加。
   */
  computeTouchedEdges() {
    const set = new Set();
    if (this.state?.graphMode !== 'sandbox' || !this.state.shock || !this.prop) return set;
    for (const p of this.prop.values()) {
      for (const q of p.paths ?? []) {
        for (const edgeId of q.edges ?? []) set.add(edgeId);
      }
    }
    return set;
  }

  ctx() {
    return {
      data: this.data,
      state: this.state,
      reality: this.reality,
      prop: this.prop,
      pairEdge: this.pairEdge,
      activeEdges: this.activeEdges,
      centerId: this.layout?.centerId,
      hotEdge: null,
      spotlight: this.spotlight,
    };
  }

  /** 生态位分组带：半透明虚线底框 + 左上角标签 */
  drawBands() {
    for (const band of this.layout.bands ?? []) {
      const meta = ZONE_META[band.label] ?? ZONE_META.risk;
      const w = this.layout.width - 20;
      this.graph.addNode({
        id: `band-${band.tier}`,
        shape: 'rect',
        x: 10,
        y: band.y,
        width: w,
        height: band.height,
        zIndex: 1,
        data: { band: true },
        attrs: {
          body: {
            rx: 16,
            ry: 16,
            fill: 'rgba(255,255,255,.012)',
            stroke: 'rgba(120,140,170,.10)',
            strokeDasharray: '7 6',
            strokeWidth: 1,
            pointerEvents: 'none',
          },
        },
        markup: [
          { tagName: 'rect', selector: 'body' },
          { tagName: 'text', selector: 'label' },
        ],
      });
      // 标签单独用 HTML 节点做，SVG text 拿不到 letter-spacing / 抗锯齿的一致表现
      this.graph.addNode({
        id: `bandlabel-${band.tier}`,
        shape: 'mgx-card',
        x: 22,
        y: band.y - 11,
        width: Math.round(textWidth(meta.label, 11)) + 18,
        height: 22,
        zIndex: 2,
        data: {
          band: true,
          html: `<div class="mgx-bandlabel ${meta.tone}" style="width:${Math.round(textWidth(meta.label, 11)) + 18}px;height:22px">${esc(meta.label)}</div>`,
        },
      });
    }
  }

  drawNodes() {
    const ctx = this.ctx();
    const edges = this.layoutEdgesForPorts();
    const plan = assignPorts(this.layout.nodes, edges);
    // 每条边两端各自的进出方向，drawEdges 用它锁定 manhattan 的出入口，
    // 否则路由器会在「任意方向都能走」的解空间里挑出贴着画布边缘绕一大圈的路径。
    this.portSides = new Map(plan.plan.map((p) => [p.edge.id, { from: p.fromSide, to: p.toSide }]));
    const portsByNode = buildPorts(this.layout.nodes, edges);
    this.nodes = [];
    this.cardBoxes = new Map();

    for (const n of this.layout.nodes) {
      const manual = this.manual.get(n.id);
      const x = manual ? manual.x : n.x;
      const y = manual ? manual.y : n.y;
      const html = cardHTML(n.id, ctx, { w: n.w, h: n.h });
      const node = this.graph.addNode({
        id: n.id,
        shape: 'mgx-card',
        x,
        y,
        width: n.w,
        height: n.h,
        zIndex: 10,
        data: { html },
        ports: portsByNode.get(n.id) ?? { groups: {} },
        // portMarkup 是 Node 的根属性，写进 ports 里 X6 会静默忽略，
        // 结果用上默认的 r=10 白圆点，视觉上是满屏大圆斑。必须放这一层。
        portMarkup: PORT_MARKUP,
      });
      this.nodes.push(node);
      this.cardBoxes.set(n.id, { x, y, w: n.w, h: n.h });
    }

    if (this.layout.orphan) {
      const center = this.layout.nodes[0];
      this.graph.addNode({
        id: '__orphan',
        shape: 'mgx-card',
        x: center.x + center.w + 150,
        y: center.y - 12,
        width: 232,
        height: center.h + 24,
        zIndex: 10,
        data: {
          html: `<div class="mgx-orphan" style="width:232px;height:${center.h + 24}px"><b>没有登记因果边</b><span>这个标的只作为同源子标的挂在宿主卡里（VXN 挂在 VIX 卡、沪金挂在黄金卡、布伦特挂在原油卡），没有独立的上下游链。</span><span>想看它的传导关系，点下面「VIX」或直接切回全局罗盘。</span></div>`,
        },
      });
    }
  }

  /** 端口分配用「视觉上真正连的边」，导图模式下就是导图里的那几条 */
  layoutEdgesForPorts() {
    if (this.layout.mode === 'mindmap') return this.mindEdges();
    return CORE_EDGES;
  }

  mindEdges() {
    const list = [];
    for (const l of this.layout.links ?? []) {
      if (l.edge) list.push(l.edge);
      else list.push({ id: `X-${l.from}-${l.to}`, from: l.from, to: l.to, sign: 1, weight: 3, label: '' });
    }
    return list;
  }

  edgeListForDraw() {
    if (this.layout.mode === 'mindmap') return this.mindEdges();
    return CORE_EDGES;
  }

  drawEdges() {
    this.edgeList = this.edgeListForDraw();
    const style = EDGE_STYLES[this.style];

    for (const e of this.edgeList) {
      const r = this.reality?.get(e.id);
      const tone = edgeTone(e, r);
      const color = TONE_COLOR[tone] ?? TONE_COLOR.pos;
      // 线型同时表达两件事：关系类型（机制 / 共同驱动 / 历史相关）与实盘状态。
      // 共同驱动与历史相关**不画箭头** —— 它们不是单向因果，箭头会把用户带偏。
      const rel = relationTypeOf(e);
      const dash = rel.dash ?? TONE_DASH[tone];
      const dim = this.isDimEdge(e);
      const hot = this.hotEdgeIds.has(e.id) || this.pairEdge?.id === e.id;
      const sw = 1 + (e.weight ?? 1) * 0.42;

      const sides = this.portSides?.get(e.id);
      const router = sides ? lockDirections(style.router, sides) : style.router;

      const base = this.graph.addEdge({
        id: `edge-${e.id}`,
        source: { cell: e.from, port: outPortId(e.id) },
        target: { cell: e.to, port: inPortId(e.id) },
        zIndex: hot ? 8 : 4,
        router,
        connector: style.connector,
        data: { edgeId: e.id, from: e.from, to: e.to, weight: e.weight, dim, tone, relationType: e.relationType ?? 'mechanism' },
        markup: [
          { tagName: 'path', selector: 'hit' },
          { tagName: 'path', selector: 'line' },
        ],
        attrs: {
          hit: { connection: true, fill: 'none', stroke: 'transparent', strokeWidth: 15, cursor: 'pointer' },
          line: {
            // X6 的 d 不是 view 直接写上去的，而是靠 attrs.<selector>.connection 这个
            // 特殊属性在 attr 管线里算出来回填。漏了它 → 所有连线 path 的 d 都是空，
            // 画布上一根线都没有（端口、胶囊、节点全都正常，极易误判成路由问题）。
            connection: true,
            fill: 'none',
            stroke: color,
            strokeWidth: hot ? sw + 0.7 : sw,
            strokeDasharray: dash,
            strokeLinecap: 'round',
            opacity: dim ? 0.14 : this.baseOpacity({ weight: e.weight }),
            targetMarker: rel.arrow
              ? { name: 'block', args: { size: 6.5, offset: 1, fill: color, stroke: color } }
              : null,
          },
        },
      });
      void base;

      // 流光叠加边：见文件头注释（X6 只给 selector=line 的那个 path 写 d）。
      // 共同驱动 / 历史相关没有方向，流光会把「共同被推动」误读成「一个推一个」。
      if (!dim && rel.arrow) {
        this.graph.addEdge({
          id: `flow-${e.id}`,
          source: { cell: e.from, port: outPortId(e.id) },
          target: { cell: e.to, port: inPortId(e.id) },
          zIndex: 6,
          router,
          connector: style.connector,
          data: { overlay: true, from: e.from, to: e.to, tone },
          markup: [{ tagName: 'path', selector: 'flow' }],
          attrs: {
            flow: {
              connection: true,
              fill: 'none',
              stroke: color,
              strokeWidth: Math.max(1, sw * 0.9),
              strokeDasharray: tone === 'pos' ? '3 14' : '2 12',
              strokeLinecap: 'round',
              opacity: 0.95,
              pointerEvents: 'none',
              targetMarker: null,
            },
          },
        });
      }
    }
  }

  isDimEdge(e) {
    if (this.state.graphMode === 'sandbox' && this.state.shock) {
      return !this.touchedEdges?.has(e.id);
    }
    if (this.activeEdges) return !this.activeEdges.edges.has(e.id);
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 机理胶囊：独立的 HTML 节点，不是 X6 的 edge label
   *
   * 用 edge label 会撞上 X6 的 defaultLabel.attrs 合并（它按 text/rect 两个
   * 选择器给默认样式，和自定义选择器对不上，胶囊会被 refWidth:1 压成文字宽度），
   * 而且 label 只能钉在弧长比例上，绕路时经常正好压住卡片。
   * 做成节点后：字号不随画布缩放抖、可以垂直于路径微调、也能跟着拖拽重新贴线。
   * ------------------------------------------------------------------ */
  pillHTML(e, tone, hot) {
    const rel = relationTypeOf(e);
    // 非因果关系不写 +/−：符号会暗示「同向推升 / 反向压制」
    const mark = rel.arrow ? (e.sign > 0 ? '+' : '−') : '⇄';
    const text = `${mark} ${e.label}`;
    return {
      text,
      w: Math.round(textWidth(text, 9.5) + 16),
      h: 17,
      html: `<div class="mgx-pill ${tone}${hot ? ' is-hot' : ''}">${esc(text)}</div>`,
    };
  }

  drawPills() {
    this.pillNodes = new Map();
    for (const e of this.edgeList) {
      if (!e.label) continue;
      if (this.isDimEdge(e)) continue;
      const r = this.reality?.get(e.id);
      const tone = edgeTone(e, r);
      const hot = this.hotEdgeIds.has(e.id) || this.pairEdge?.id === e.id;
      const conf = this.pillHTML(e, tone, hot);
      this.graph.addNode({
        id: `pill-${e.id}`,
        shape: 'mgx-card',
        x: 0,
        y: 0,
        width: conf.w,
        height: conf.h,
        zIndex: 9,
        data: { pill: true, edgeId: e.id, html: `<div class="mgx-pill-wrap" style="width:${conf.w}px;height:${conf.h}px">${conf.html}</div>` },
      });
      this.pillNodes.set(e.id, conf);
    }
    this.queuePillSync();
  }

  /**
   * 延后贴线：刚 addEdge 时 X6 还没把 view 渲染出来（渲染是异步排队的），
   * 此刻 getPointAtRatio 取不到 path，胶囊会全部留在 (0,0) 叠在画布左上角。
   * 用 rAF + 一次定时兜底，并在 render:done 后补一次。
   */
  queuePillSync() {
    if (this.pillSyncQueued) return;
    this.pillSyncQueued = true;
    const run = () => {
      this.pillSyncQueued = false;
      this.syncPills();
    };
    requestAnimationFrame(run);
    setTimeout(run, 60);
  }

  /** 把胶囊贴到对应边的路径中点 */
  syncPills() {
    if (!this.pillNodes) return;
    this.placedPills = [];
    for (const [edgeId, conf] of this.pillNodes) {
      const edge = this.graph.getCellById(`edge-${edgeId}`);
      const view = edge?.findView(this.graph);
      const node = this.graph.getCellById(`pill-${edgeId}`);
      if (!view || !node) continue;
      let pt = null;
      try {
        pt = view.getPointAtRatio(0.5);
      } catch {
        pt = null;
      }
      // 取不到点 = view 还没渲染完，留到下一轮；直接 continue 会让胶囊卡在 (0,0)
      if (!pt || !Number.isFinite(pt.x)) {
        this.queuePillSync();
        continue;
      }
      const spot = this.placePill(view, conf);
      node.position(Math.round(spot.x - conf.w / 2), Math.round(spot.y - conf.h / 2));
      this.placedPills.push({ x: spot.x - conf.w / 2, y: spot.y - conf.h / 2, w: conf.w, h: conf.h });
    }
  }

  setShockTouched(set) {
    this.touchedEdges = set;
  }

  /**
   * 胶囊避让：路径中点经常正好落在某张卡上（尤其底排 5 张卡的横边），
   * 导图模式下多条边还都收进同一个焦点卡，胶囊会互相叠成一坨。
   * 沿垂直方向逐档试偏移，要求既不压卡片、也不压已经摆好的胶囊。
   * 全试完还冲突就留在原地 —— 宁可叠一个，也不要飘到无关的地方去。
   */
  placePill(view, conf) {
    // 沿弧长多试几个比例 + 垂直微偏移：导图里 4 条边同时收进焦点卡，
    // 只靠垂直偏移的话胶囊会全部挤在同一个 60px 宽的夹缝里互相压住。
    const ratios = [0.5, 0.42, 0.58, 0.34, 0.66, 0.28, 0.72];
    // 优先往上挪：行间留白在上方，往下会跑出分组带。
    const dys = [0, -13, 13, -26, 26, -40, 40, -54, 54, -68, 68];
    const halfW = conf.w / 2 + 4;
    const halfH = conf.h / 2 + 3;
    const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const hits = (p) => {
      const box = { x: p.x - halfW, y: p.y - halfH, w: halfW * 2, h: halfH * 2 };
      for (const b of this.cardBoxes.values()) if (overlap(box, b)) return true;
      for (const b of this.placedPills ?? []) if (overlap(box, b)) return true;
      return false;
    };

    // 外层遍历位移、内层遍历比例：宁可沿同一条线挪一小段，也不要在 0.5 处
    // 直接垂直甩出去 —— 后者会把底排的胶囊甩到分组带外面。
    const bases = [];
    for (const r of ratios) {
      try {
        const base = view.getPointAtRatio(r);
        if (base && Number.isFinite(base.x)) bases.push(base);
      } catch {
        /* 忽略：view 未就绪 */
      }
    }
    for (const dy of dys) {
      for (const base of bases) {
        const p = { x: base.x, y: base.y + dy };
        if (!hits(p)) return p;
      }
    }
    return bases[0] ?? { x: 0, y: 0 };
  }

  dispose() {
    this.ro?.disconnect();
    this.ro = null;
    this.tools?.remove();
    this.graph?.dispose();
    this.graph = null;
  }
}
