// @vitest-environment jsdom
/* ================================================================== *
 * 宏观图谱画布（views/macro/flow-canvas.js）
 *
 * 这块以前 0 覆盖，但它做的判断很具体：谁被压暗、连线用哪种路由、
 * 孤儿视图怎么清、什么情况下重新适应画布。
 *
 * 做法：把 @antv/x6 换成记录型假实现。我们测的是**我们自己的接线逻辑**
 * （建了哪些 cell、设了什么透明度、调了哪次 zoom），不是 X6 本身。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** 记录型假 X6 */
const created = { nodes: [], edges: 0, graphs: [] };

vi.mock('@antv/x6', () => {
  class FakeCell {
    constructor(kind, cfg) {
      this.kind = kind;
      this.id = cfg.id;
      this.cfg = cfg;
      this.attrs = {};
      this.router = null;
      this.connector = null;
    }
    getData() {
      return this.cfg.data ?? {};
    }
    setData(d) {
      this.cfg.data = d;
      return this;
    }
    attr(path, value) {
      this.attrs[path] = value;
      return this;
    }
    setRouter(r) {
      this.router = r;
      return this;
    }
    setConnector(c) {
      this.connector = c;
      return this;
    }
    setZIndex() {
      return this;
    }
    findView() {
      return null; // 不做真实 DOM 挂载：这类断言由各视图自己的测试负责
    }
  }

  class FakeGraph {
    constructor(opts) {
      this.opts = opts;
      this.cells = [];
      this.handlers = new Map();
      this._zoom = 1;
      this.calls = [];
      created.graphs.push(this);
    }
    on(evt, fn) {
      this.handlers.set(evt, fn);
      return this;
    }
    emit(evt, payload) {
      this.handlers.get(evt)?.(payload);
    }
    addNode(cfg) {
      const n = new FakeCell('node', cfg);
      this.cells.push(n);
      created.nodes.push(cfg);
      return n;
    }
    addEdge(cfg) {
      this.cells.push(new FakeCell('edge', cfg));
      created.edges += 1;
      return this.cells[this.cells.length - 1];
    }
    getCells() {
      return this.cells;
    }
    getNodes() {
      return this.cells.filter((c) => c.kind === 'node');
    }
    getEdges() {
      return this.cells.filter((c) => c.kind === 'edge');
    }
    clearCells() {
      this.cells = [];
      return this;
    }
    getCellById(id) {
      return this.cells.find((c) => c.id === id) ?? null;
    }
    removeCell() {}
    zoom() {
      return this._zoom;
    }
    zoomTo(z) {
      this._zoom = z;
      this.calls.push(['zoomTo', z]);
      return this;
    }
    zoomToFit() {
      this.calls.push(['zoomToFit']);
      return this;
    }
    centerContent() {
      this.calls.push(['centerContent']);
      return this;
    }
    resize(w, h) {
      this.calls.push(['resize', w, h]);
      return this;
    }
  }

  return {
    Graph: FakeGraph,
    Shape: { HTML: { register: () => {} } },
    __created: created,
  };
});

const { CJK, EDGE_STYLE_LABEL, EDGE_STYLE_ORDER, EDGE_STYLES, MacroFlowCanvas, lockDirections, registerShapes, textWidth } =
  await import('../src/client/views/macro/flow-canvas.js');

const makeContainer = () => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(c, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(c);
  return c;
};

afterEach(() => {
  document.body.innerHTML = '';
  created.nodes.length = 0;
  created.edges = 0;
  created.graphs.length = 0;
});

describe('文本宽度估算', () => {
  it('中文按字号全额，拉丁字母按 0.58 折算', () => {
    expect(textWidth('中文', 10)).toBe(20);
    expect(textWidth('abcd', 10)).toBeCloseTo(23.2, 5);
  });

  it('CJK 正则覆盖中英文标点与全角字符', () => {
    expect(CJK.test('中')).toBe(true);
    expect(CJK.test('，')).toBe(true);
    expect(CJK.test('a')).toBe(false);
  });

  it('空串与 null 不抛', () => {
    expect(textWidth('', 10)).toBe(0);
    expect(textWidth(null, 10)).toBe(0);
  });
});

describe('形状注册', () => {
  it('可重复调用（内部有 registered 守卫）', () => {
    expect(() => {
      registerShapes();
      registerShapes();
    }).not.toThrow();
  });
});

describe('连线风格', () => {
  it('两种风格都有 router 与 connector，顺序与标签一致', () => {
    for (const key of EDGE_STYLE_ORDER) {
      expect(EDGE_STYLES[key].router).toBeTruthy();
      expect(EDGE_STYLES[key].connector).toBeTruthy();
      expect(EDGE_STYLE_LABEL[key]).toBeTruthy();
    }
  });

  it('lockDirections 只在 manhattan 上收窄方向', () => {
    const narrowed = lockDirections(EDGE_STYLES.orth.router, { from: 'left', to: 'right' });
    expect(narrowed.args.startDirections).toEqual(['left']);
    expect(narrowed.args.endDirections).toEqual(['right']);
    // 其他参数保留（丢了 step/padding 会让路径变形）
    expect(narrowed.args.step).toBe(10);
  });

  it('非 manhattan 路由原样返回（不能把 normal 改成折线）', () => {
    const r = { name: 'normal', args: {} };
    expect(lockDirections(r, { from: 'left', to: 'right' })).toBe(r);
  });
});

describe('画布构造', () => {
  it('建工具条与内层舞台；初始缩放 100%', () => {
    const c = makeContainer();
    const canvas = new MacroFlowCanvas(c);
    // 内层舞台的类名是 mg-x6-graph（外层容器由 CSS 掌管尺寸）
    expect(c.querySelector('.mg-x6-graph')).toBeTruthy();
    expect(c.querySelector('.mgx-tools')).toBeTruthy();
    expect(c.querySelector('.mgx-zoom').textContent).toBe('100%');
    expect(created.graphs).toHaveLength(1);
  });

  it('默认正交风格，可传 smooth', () => {
    expect(new MacroFlowCanvas(makeContainer()).style).toBe('orth');
    expect(new MacroFlowCanvas(makeContainer(), { style: 'smooth' }).style).toBe('smooth');
  });

  it('容器尺寸为 0 时不 resize（避免 0×0 画布）', () => {
    const c = document.createElement('div');
    document.body.appendChild(c); // jsdom 里 clientWidth 是 0
    const canvas = new MacroFlowCanvas(c);
    expect(canvas.graph.calls.some((x) => x[0] === 'resize')).toBe(false);
  });

  it('缩放有上下限（0.45 ~ 1.8）', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.zoomBy(10);
    expect(canvas.graph.zoom()).toBe(1.8);
    canvas.zoomBy(0.001);
    expect(canvas.graph.zoom()).toBe(0.45);
    expect(canvas.tools.querySelector('.mgx-zoom').textContent).toBe('45%');
  });

  it('切换风格会改动已有连线的 router（不是只改状态）', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.graph.addEdge({ id: 'e1', data: { from: 'a', to: 'b' } });
    canvas.toggleStyle();
    const edge = canvas.graph.getEdges()[0];
    expect(canvas.style).toBe('smooth');
    expect(edge.router.name).toBe(EDGE_STYLES.smooth.router.name);
    expect(canvas.tools.querySelector('.mgx-style').textContent).toBe(EDGE_STYLE_LABEL.smooth);
  });

  it('overlay 连线不被风格切换改动（标注线有固定形状）', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.graph.addEdge({ id: 'ov', data: { overlay: true } });
    canvas.toggleStyle();
    expect(canvas.graph.getEdges()[0].router).toBeNull();
  });

  it('工具条按钮：放大 / 缩小 / 复位都作用到 graph', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    const btn = (ctl) => canvas.tools.querySelector(`[data-ctl="${ctl}"]`);
    btn('in').click();
    expect(canvas.graph.zoom()).toBeGreaterThan(1);
    btn('out').click();
    btn('out').click();
    expect(canvas.graph.zoom()).toBeLessThan(1);
  });
});

describe('聚光灯与透明度', () => {
  const build = () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.edgeList = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    canvas.graph.addEdge({ id: 'e-ab', data: { from: 'a', to: 'b', weight: 2 } });
    canvas.graph.addEdge({ id: 'e-bc', data: { from: 'b', to: 'c', dim: true } });
    // 模拟卡片 DOM（X6 真渲染时才会有，这里手造以验证压暗逻辑）
    for (const id of ['a', 'b', 'c', 'z']) {
      const el = document.createElement('div');
      el.className = 'mgx-card';
      el.dataset.node = id;
      canvas.container.appendChild(el);
    }
    return canvas;
  };

  it('neighborsOf 只算一层邻居，包含自己', () => {
    const canvas = build();
    expect([...canvas.neighborsOf('b')].sort()).toEqual(['a', 'b', 'c']);
  });

  it('聚焦 b：a/b/c 亮、z 压暗；连线按是否触及亮点决定透明度', () => {
    const canvas = build();
    canvas.setSpotlight('b');
    const dim = (id) => canvas.container.querySelector(`.mgx-card[data-node="${id}"]`).classList.contains('is-dim');
    expect(dim('a')).toBe(false);
    expect(dim('b')).toBe(false);
    expect(dim('z')).toBe(true);
    expect(canvas.container.querySelector('.mgx-card[data-node="b"]').classList.contains('is-spot')).toBe(true);

    const edges = canvas.graph.getEdges();
    expect(edges[0].attrs['line/opacity']).toBeGreaterThan(0.1);
  });

  it('重复设置同一焦点直接返回（不做无谓重排）', () => {
    const canvas = build();
    canvas.setSpotlight('b');
    const before = canvas.graph.getEdges()[0].attrs['line/opacity'];
    canvas.graph.getEdges()[0].attr('line/opacity', 99);
    canvas.setSpotlight('b');
    expect(canvas.graph.getEdges()[0].attrs['line/opacity']).toBe(99);
    expect(before).toBeDefined();
  });

  it('清空焦点时全部恢复（不留在压暗状态）', () => {
    const canvas = build();
    canvas.setSpotlight('b');
    canvas.setSpotlight(null);
    expect(canvas.container.classList.contains('mgx-spot')).toBe(false);
    for (const el of canvas.container.querySelectorAll('.mgx-card')) {
      expect(el.classList.contains('is-dim')).toBe(false);
    }
  });

  it('baseOpacity：dim 项更淡，权重越高越实，但有上限', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    expect(canvas.baseOpacity({ dim: true })).toBe(0.14);
    expect(canvas.baseOpacity({ weight: 1 })).toBeCloseTo(0.58, 5);
    expect(canvas.baseOpacity({ weight: 3 })).toBeGreaterThan(canvas.baseOpacity({ weight: 1 }));
  });
});

describe('孤儿视图清理', () => {
  it('DOM 里模型中没有的 cell 元素被摘掉，模型里有但 view 不存在的也摘掉', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    const stage = canvas.stageEl;
    // 造两个 DOM 残留：一个 id 不在模型里，一个 id 在模型里但 findView 返回 null
    const ghost = document.createElement('div');
    ghost.setAttribute('data-cell-id', 'ghost');
    stage.appendChild(ghost);
    const duplicated = document.createElement('div');
    duplicated.setAttribute('data-cell-id', 'n1');
    stage.appendChild(duplicated);
    canvas.graph.addNode({ id: 'n1', data: {} });

    canvas.pruneOrphanViews();
    expect(stage.querySelector('[data-cell-id="ghost"]')).toBeNull();
    // findView 返回 null → 该 id 没有合法的 view，残留元素也摘掉
    expect(stage.querySelector('[data-cell-id="n1"]')).toBeNull();
  });

  it('没有 stage 时安全返回', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.stageEl = null;
    expect(() => canvas.pruneOrphanViews()).not.toThrow();
  });
});

/* ================================================================== *
 * 完整绘制路径：update() 走一遍
 *
 * 这里不追求「画得好看」，只钉住几条会被用户直接感知的结果：
 *   · 罗盘模式画排布带 + 卡片 + 连线；导图模式只画中心与邻居；
 *   · 数据刷新但布局没变时**不重置缩放**（否则用户刚放大的视角被打回 100%）；
 *   · 模式切换时一定重新适应画布。
 * ================================================================== */
describe('绘制流程', () => {
  /** 最小可用的宏观数据（只放画布会读到的字段） */
  const macroData = {
    matrix: { ids: ['gold-intl', 'dxy', 'us10y', 'vix'], labels: {} },
    quotes: {},
  };
  const baseArgs = (over = {}) => ({
    data: macroData,
    state: { graphMode: 'compass', graphFocus: 'gold-intl' },
    reality: null,
    prop: null,
    pairEdge: null,
    activeEdges: null,
    hotEdgeIds: new Set(),
    ...over,
  });

  it('罗盘模式：建卡片与连线，并把节点记进 this.nodes', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.update(baseArgs());
    expect(canvas.nodes.length).toBeGreaterThan(3);
    expect(canvas.graph.getEdges().length).toBeGreaterThan(0);
    // 连线两端都锁定了进出方向（否则 manhattan 会绕大圈）
    expect(canvas.portSides.size).toBeGreaterThan(0);
  });

  it('重复 update 不残留旧 cell（clearCells 先执行）', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.update(baseArgs());
    const first = canvas.nodes.length;
    canvas.update(baseArgs());
    expect(canvas.nodes.length).toBe(first);
    // cell 数不应翻倍
    expect(canvas.graph.getCells().length).toBeLessThan(first * 8);
  });

  it('布局签名不变时不重新适应画布（保住用户的缩放）', async () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.update(baseArgs());
    await new Promise((r) => requestAnimationFrame(r));
    canvas.graph.calls.length = 0;
    canvas.graph._zoom = 1.5;
    canvas.update(baseArgs());
    await new Promise((r) => requestAnimationFrame(r));
    expect(canvas.graph.calls.some((c) => c[0] === 'zoomToFit')).toBe(false);
    expect(canvas.graph.zoom()).toBe(1.5);
  });

  it('切到导图模式：重新适应画布，且只连中心与邻居', async () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.update(baseArgs());
    // fit 走 requestAnimationFrame：等一帧再断言，别用「没调用」当结论
    await new Promise((r) => requestAnimationFrame(r));
    canvas.graph.calls.length = 0;
    canvas.update(baseArgs({ state: { graphMode: 'mindmap', graphFocus: 'gold-intl' } }));
    expect(canvas.layout.mode).toBe('mindmap');
    expect(canvas.layout.centerId).toBe('gold-intl');
    expect(canvas.layout.nodes.length).toBeGreaterThan(0);
    await new Promise((r) => requestAnimationFrame(r));
    expect(canvas.graph.calls.some((c) => c[0] === 'zoomToFit')).toBe(true);
  });

  it('完全没有登记边的焦点：给一张说明卡而不是空白画布', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    // 子标的（vxn/沪金/布伦特）会借宿主卡的边，所以「孤儿」只出现在完全未知的焦点上
    canvas.update(baseArgs({ state: { graphMode: 'mindmap', graphFocus: 'unknown-asset' } }));
    expect(canvas.layout.orphan, '未知焦点应当没有登记边').toBe(true);
    // 中心卡 + 说明卡
    expect(canvas.graph.getNodes().some((n) => n.id === '__orphan')).toBe(true);
  });

  it('reflow 只重画不重算数据（manual 位置保留）', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.update(baseArgs());
    const someId = canvas.nodes[0].id;
    canvas.manual.set(someId, { x: 999, y: 888 });
    canvas.reflow();
    const moved = canvas.graph.getNodes().find((n) => n.id === someId);
    expect(moved.cfg.x).toBe(999);
    expect(moved.cfg.y).toBe(888);
  });

  it('没有 layout 时 reflow 安全返回', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    expect(() => canvas.reflow()).not.toThrow();
  });

  it('沙盘模式下把路径上的边记为「被触及」', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    // propagateShock 的结果每项需要 dirs(Set) / paths / hop / conflict
    const prop = new Map([
      ['gold-intl', { dirs: new Set([1]), paths: [{ edges: ['e1', 'e2'] }, { edges: ['e3'] }], hop: 1, conflict: false }],
    ]);
    canvas.update(
      baseArgs({
        state: { graphMode: 'sandbox', shock: { id: 'shock', dir: 1 }, graphFocus: 'gold-intl' },
        prop,
      }),
    );
    expect([...canvas.touchedEdges].sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('非沙盘模式不记触及边（避免把普通浏览画成冲击路径）', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.update(baseArgs({ prop: new Map([['x', { paths: [{ edges: ['e1'] }] }]]) }));
    expect(canvas.touchedEdges.size).toBe(0);
  });

  it('没有节点的空数据：fit 直接返回，不调用 X6', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.nodes = [];
    canvas.graph.calls.length = 0;
    canvas.fit();
    expect(canvas.graph.calls.some((c) => c[0] === 'zoomToFit')).toBe(false);
  });
});
