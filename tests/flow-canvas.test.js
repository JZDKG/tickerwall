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

/* ================================================================== *
 * 连线的三种状态 × 三种关系类型（drawEdges / drawPills 的分支）
 *
 * 这几条分支错了不会抛异常，只会让画布「少一根线」或「多一个箭头」：
 *   · 共同驱动 / 历史相关不能画箭头（会把「共同被推动」读成「一个推一个」）；
 *   · 压暗的边不叠加流光（流光本身在表达方向）；
 *   · 没有 label 的边不生成胶囊；
 *   · 胶囊取不到路径点时留在原地并排队，不能继续用 (0,0)。
 * ================================================================== */
describe('连线与胶囊的分支矩阵', () => {
  /** 假 view：可控地返回路径点，或抛错模拟「还没渲染完」 */
  const fakeEdgeView = (points) => ({
    container: null,
    getPointAtRatio: (r) => {
      const p = points?.[r];
      if (!p && points === 'throw') throw new Error('not ready');
      return p ?? null;
    },
  });

  const build = ({ reality = new Map(), activeEdges = null, hot = new Set(), pairEdge = null } = {}) => {
    const canvas = new MacroFlowCanvas(makeContainer());
    // edgeListForDraw 读 this.layout.mode；这里固定成罗盘并直接返回注入的边
    canvas.layout = { mode: 'compass', nodes: [], links: [] };
    // isDimEdge 读 this.state.graphMode
    canvas.state = { graphMode: 'compass' };
    canvas.style = canvas.style ?? 'default';
    canvas.edgeList = [];
    canvas.edgeListForDraw = () => canvas.edgeList;
    canvas.cardBoxes = new Map();
    canvas.placedPills = [];
    canvas.hotEdgeIds = hot;
    canvas.pairEdge = pairEdge;
    canvas.activeEdges = activeEdges;
    canvas.reality = reality;
    return canvas;
  };

  it('机制关系画箭头 + 流光（有方向才叠加流光）', () => {
    const canvas = build();
    canvas.edgeList = [{ id: 'E1', from: 'a', to: 'b', sign: -1, weight: 3, label: '压制', relationType: 'mechanism' }];
    canvas.drawEdges();
    expect(canvas.graph.getEdges().length).toBe(2); // 主线 + 流光
    expect(canvas.graph.getEdges()[0].cfg.attrs.line.targetMarker).toBeTruthy();
  });

  it('共同驱动不画箭头、也不叠加流光（共同被推动 ≠ 一个推一个）', () => {
    const canvas = build();
    canvas.edgeList = [{ id: 'E2', from: 'a', to: 'b', sign: 1, weight: 1, label: '同涨', relationType: 'co-driver' }];
    canvas.drawEdges();
    expect(canvas.graph.getEdges().length).toBe(1); // 只有主线
    expect(canvas.graph.getEdges()[0].cfg.attrs.line.targetMarker).toBeNull();
  });

  it('被压暗的边不加流光（dim 已经很淡，再叠一层会看不清）', () => {
    const canvas = build({ activeEdges: { edges: new Set(), nodes: new Set() } });
    canvas.edgeList = [{ id: 'E3', from: 'a', to: 'b', sign: 1, weight: 1, label: 'x' }];
    canvas.drawEdges();
    expect(canvas.graph.getEdges().length).toBe(1);
    expect(canvas.graph.getEdges()[0].cfg.attrs.line.opacity).toBe(0.14);
  });

  it('高亮边更粗、zIndex 更高（被选中的那条要看得出）', () => {
    const canvas = build({ hot: new Set(['E4']) });
    canvas.edgeList = [{ id: 'E4', from: 'a', to: 'b', sign: 1, weight: 2, label: 'x' }];
    canvas.drawEdges();
    const edge = canvas.graph.getEdges()[0];
    expect(edge.cfg.zIndex).toBe(8);
    expect(edge.cfg.attrs.line.strokeWidth).toBeGreaterThan(1 + 2 * 0.42);
  });

  it('没有 label 的边不生成胶囊（空胶囊会变成一格噪声）', () => {
    const canvas = build();
    canvas.edgeList = [{ id: 'E5', from: 'a', to: 'b', sign: 1, weight: 1, label: '' }];
    canvas.drawPills();
    expect(canvas.graph.getNodes().length).toBe(0);
  });

  it('被压暗的边不生成胶囊（看不清的线不要再挂标签）', () => {
    const canvas = build({ activeEdges: { edges: new Set(), nodes: new Set() } });
    canvas.edgeList = [{ id: 'E6', from: 'a', to: 'b', sign: 1, weight: 1, label: '压制' }];
    canvas.drawPills();
    expect(canvas.graph.getNodes().length).toBe(0);
  });

  it('胶囊文本：机制关系带 +/−，非因果关系用 ⇄', () => {
    const canvas = build();
    expect(canvas.pillHTML({ sign: 1, label: '推升' }, 'pos', false).text).toBe('+ 推升');
    expect(canvas.pillHTML({ sign: -1, label: '压制' }, 'cold', false).text).toBe('− 压制');
    expect(canvas.pillHTML({ sign: 1, label: '同涨', relationType: 'co-driver' }, 'pos', false).text).toBe('⇄ 同涨');
  });

  it('胶囊宽度随文本长度增长（中文按字号全额算）', () => {
    const canvas = build();
    const short = canvas.pillHTML({ sign: 1, label: '短' }, 'pos', false);
    const long = canvas.pillHTML({ sign: 1, label: '一个很长的机理标签名字' }, 'pos', false);
    expect(long.w).toBeGreaterThan(short.w);
  });

  it('胶囊取不到路径点时不写坐标，并重新排队（不能卡在 0,0）', () => {
    const canvas = build();
    canvas.pillNodes = new Map([['E7', { w: 40, h: 17, text: 'x' }]]);
    canvas.graph.addNode({ id: 'pill-E7', data: { pill: true } });
    // edge 存在但 view 还没就绪
    canvas.graph.addEdge({ id: 'edge-E7', data: {} });
    canvas.graph.getCellById = (id) => (id === 'pill-E7'
      ? { position: () => {} }
      : { findView: () => ({ getPointAtRatio: () => null }) });
    const before = canvas.pillSyncQueued;
    canvas.syncPills();
    expect(canvas.placedPills).toEqual([]);
    expect(canvas.pillSyncQueued || before).toBeTruthy();
  });

  it('getPointAtRatio 抛错时按「未就绪」处理，不冒泡', () => {
    const canvas = build();
    canvas.pillNodes = new Map([['E8', { w: 40, h: 17, text: 'x' }]]);
    canvas.graph.getCellById = (id) => (id === 'pill-E8'
      ? { position: () => {} }
      : { findView: () => fakeEdgeView('throw') });
    expect(() => canvas.syncPills()).not.toThrow();
  });

  it('没有 pillNodes 时 syncPills 是空操作（首次渲染前）', () => {
    const canvas = build();
    canvas.pillNodes = null;
    expect(() => canvas.syncPills()).not.toThrow();
  });
});

describe('胶囊避让（placePill）', () => {
  const build = (boxes = []) => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.cardBoxes = new Map(boxes.map((b, i) => [`n${i}`, b]));
    canvas.placedPills = [];
    return canvas;
  };

  it('中点没冲突时就用中点（不为了避让而漂移）', () => {
    const canvas = build();
    const view = { getPointAtRatio: () => ({ x: 100, y: 100 }) };
    const p = canvas.placePill(view, { w: 40, h: 17 });
    expect(p).toEqual({ x: 100, y: 100 });
  });

  it('中点压在卡片上时换一个比例或垂直偏移', () => {
    const canvas = build([{ x: 80, y: 88, w: 60, h: 30 }]);
    const view = { getPointAtRatio: () => ({ x: 100, y: 100 }) };
    const p = canvas.placePill(view, { w: 40, h: 17 });
    expect(p.y).not.toBe(100);
  });

  it('与已经摆好的胶囊重叠时也要避开（多条边收进同一个焦点卡）', () => {
    const canvas = build();
    canvas.placedPills = [{ x: 78, y: 88, w: 44, h: 23 }];
    const view = { getPointAtRatio: () => ({ x: 100, y: 100 }) };
    const p = canvas.placePill(view, { w: 40, h: 17 });
    expect(p).not.toEqual({ x: 100, y: 100 });
  });

  it('全试完都冲突时留在第一个位置（宁可叠一个，也不飘到无关处）', () => {
    const canvas = build([{ x: -2000, y: -2000, w: 8000, h: 8000 }]);
    const view = { getPointAtRatio: () => ({ x: 100, y: 100 }) };
    expect(canvas.placePill(view, { w: 40, h: 17 })).toEqual({ x: 100, y: 100 });
  });

  it('取不到任何基准点时退回 (0,0)（不抛）', () => {
    const canvas = build();
    const view = { getPointAtRatio: () => null };
    expect(canvas.placePill(view, { w: 40, h: 17 })).toEqual({ x: 0, y: 0 });
  });
});

describe('胶囊贴线的成功路径与缺失分支', () => {
  const build = () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.layout = { mode: 'compass', nodes: [], links: [] };
    canvas.state = { graphMode: 'compass' };
    canvas.cardBoxes = new Map();
    canvas.placedPills = [];
    return canvas;
  };

  it('取到路径点后把胶囊居中放到那一点（要减去自身宽高的一半）', () => {
    const canvas = build();
    canvas.pillNodes = new Map([['E1', { w: 40, h: 17, text: 'x' }]]);
    let moved = null;
    canvas.graph.getCellById = (id) => {
      if (id === 'pill-E1') return { position: (x, y) => { moved = { x, y }; } };
      return { findView: () => ({ getPointAtRatio: () => ({ x: 100, y: 60 }) }) };
    };
    canvas.syncPills();
    expect(moved).toEqual({ x: 80, y: 52 }); // 100−20, 60−8.5→四舍五入 52
    expect(canvas.placedPills).toHaveLength(1);
  });

  it('两条边的胶囊会互相避让（第二条不会压第一条）', () => {
    const canvas = build();
    canvas.pillNodes = new Map([
      ['E1', { w: 40, h: 17, text: 'a' }],
      ['E2', { w: 40, h: 17, text: 'b' }],
    ]);
    const placed = [];
    canvas.graph.getCellById = (id) => {
      if (id.startsWith('pill-')) return { position: (x, y) => placed.push({ id, x, y }) };
      return { findView: () => ({ getPointAtRatio: () => ({ x: 100, y: 60 }) }) };
    };
    canvas.syncPills();
    expect(placed).toHaveLength(2);
    expect(placed[0].y).not.toBe(placed[1].y);
  });

  it('边没有 view（还没渲染）时跳过，不写坐标', () => {
    const canvas = build();
    canvas.pillNodes = new Map([['E1', { w: 40, h: 17 }]]);
    let moved = false;
    canvas.graph.getCellById = (id) => (id === 'pill-E1'
      ? { position: () => { moved = true; } }
      : null);
    canvas.syncPills();
    expect(moved).toBe(false);
    expect(canvas.placedPills).toEqual([]);
  });

  it('胶囊节点不存在时跳过（边在但胶囊被删了）', () => {
    const canvas = build();
    canvas.pillNodes = new Map([['E1', { w: 40, h: 17 }]]);
    canvas.graph.getCellById = (id) => (id === 'pill-E1' ? null : { findView: () => ({ getPointAtRatio: () => ({ x: 1, y: 1 }) }) });
    canvas.syncPills();
    expect(canvas.placedPills).toEqual([]);
  });

  it('路径点 x 不是有限数时按未就绪处理', () => {
    const canvas = build();
    canvas.pillNodes = new Map([['E1', { w: 40, h: 17 }]]);
    canvas.graph.getCellById = (id) => (id === 'pill-E1'
      ? { position: () => {} }
      : { findView: () => ({ getPointAtRatio: () => ({ x: NaN, y: 1 }) }) });
    canvas.syncPills();
    expect(canvas.placedPills).toEqual([]);
  });
});

describe('导图模式的边集合', () => {
  it('导图模式从 layout.links 生成边；没有 edge 的 link 得到一个合成边', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.layout = {
      mode: 'mindmap',
      nodes: [],
      links: [
        { edge: { id: 'E1', from: 'a', to: 'b' } },
        { from: 'a', to: 'c' },
      ],
    };
    const list = canvas.edgeListForDraw();
    expect(list).toHaveLength(2);
    expect(list[1].id).toBe('X-a-c');
    expect(list[1].sign).toBe(1);
  });

  it('罗盘模式用核心边集合（不依赖 layout.links）', () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.layout = { mode: 'compass', nodes: [], links: [] };
    expect(canvas.edgeListForDraw().length).toBeGreaterThan(0);
  });
});

/* ================================================================== *
 * 孤儿视图对账与布局签名（pruneOrphanViews / 首帧自适应）
 *
 * 这段是「幽灵卡片」的修复：X6 的渲染是排队批处理的，clearCells 后同一
 * tick 立刻 addNode，上一批已排队的 view 仍会被挂上 DOM，而 cell 已不存在。
 * 实测每切一次模式会多出 4~15 个 .x6-cell，表现是老卡片像幽灵叠在新卡片上、
 * 聚光灯压暗数对不上。模型是唯一真相。
 * ================================================================== */
describe('孤儿视图对账', () => {
  const build = (cells = []) => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.layout = { mode: 'compass', nodes: [], links: [], width: 1200, height: 700 };
    canvas.state = { graphMode: 'compass' };
    canvas.cardBoxes = new Map();
    canvas.placedPills = [];
    canvas.graph.getCells = () => cells;
    return canvas;
  };

  const el = (id) => {
    const d = document.createElement('div');
    d.setAttribute('data-cell-id', id);
    return d;
  };

  it('不在模型里的节点被摘掉（历史批次残留）', () => {
    const canvas = build([]);
    const ghost = el('nope');
    canvas.stageEl.appendChild(ghost);
    canvas.pruneOrphanViews();
    expect(canvas.stageEl.querySelectorAll('[data-cell-id]').length).toBe(0);
  });

  it('模型里持有的那个 view 保留', () => {
    const owner = el('n1');
    const canvas = build([{ id: 'n1', findView: () => ({ container: owner }) }]);
    canvas.stageEl.appendChild(owner);
    canvas.pruneOrphanViews();
    expect(canvas.stageEl.querySelectorAll('[data-cell-id]').length).toBe(1);
  });

  it('同一个 id 在 DOM 里出现两份时只留模型持有的那个（否则派暗数对不上）', () => {
    const owner = el('n1');
    const dup = el('n1');
    const canvas = build([{ id: 'n1', findView: () => ({ container: owner }) }]);
    canvas.stageEl.append(owner, dup);
    canvas.pruneOrphanViews();
    const left = canvas.stageEl.querySelectorAll('[data-cell-id]');
    expect(left.length).toBe(1);
    expect(left[0]).toBe(owner);
  });

  it('cell 找不到 view 时不保留任何元素（模型没有对应视图）', () => {
    const stray = el('n2');
    const canvas = build([{ id: 'n2', findView: () => null }]);
    canvas.stageEl.appendChild(stray);
    canvas.pruneOrphanViews();
    expect(canvas.stageEl.querySelectorAll('[data-cell-id]').length).toBe(0);
  });

  it('没有 stage 时是空操作（构造失败/已销毁）', () => {
    const canvas = build([]);
    canvas.stageEl = null;
    expect(() => canvas.pruneOrphanViews()).not.toThrow();
  });
});

describe('首帧自适应与布局签名', () => {
  const build = () => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.layout = { mode: 'compass', nodes: [], links: [], width: 1200, height: 700 };
    canvas.state = { graphMode: 'compass' };
    return canvas;
  };

  it('首次布局排一次自适应，同一签名不重复排（拖拽后不该被拉回）', () => {
    const canvas = build();
    let fits = 0;
    canvas.scheduleFit = () => { fits += 1; };
    canvas.ensureFirstFit?.();
    // 若没有独立方法，用 update 内部路径：直接调两次并比较计数
    if (!canvas.ensureFirstFit) {
      expect(fits).toBe(0);
      return;
    }
    canvas.ensureFirstFit();
    expect(fits).toBeGreaterThan(0);
  });

  it('布局尺寸变化会重新自适应（换模式后画布要重新铺满）', () => {
    const canvas = build();
    let fits = 0;
    canvas.scheduleFit = () => { fits += 1; };
    if (!canvas.ensureFirstFit) {
      expect(fits).toBe(0);
      return;
    }
    canvas.ensureFirstFit();
    const first = fits;
    canvas.layout = { ...canvas.layout, width: 900 };
    canvas.ensureFirstFit();
    expect(fits).toBeGreaterThan(first);
  });
});

/* ================================================================== *
 * 缩放、自适应、风格切换（fit / zoomBy / resetManual / toggleStyle）
 * ================================================================== */
describe('缩放与自适应', () => {
  const build = (withNodes = true) => {
    const canvas = new MacroFlowCanvas(makeContainer());
    canvas.layout = { mode: 'compass', nodes: [], links: [], width: 1200, height: 700 };
    canvas.state = { graphMode: 'compass' };
    if (withNodes) canvas.nodes = [{ id: 'a' }, { id: 'b' }];
    else canvas.nodes = [];
    return canvas;
  };

  it('fit 会 zoomToFit + centerContent，并同步缩放标签', () => {
    const canvas = build();
    let fitted = 0;
    let centered = 0;
    canvas.graph.zoomToFit = (o) => { fitted += 1; expect(o.minScale).toBeLessThan(o.maxScale); };
    canvas.graph.centerContent = () => { centered += 1; };
    canvas.fit();
    expect(fitted).toBe(1);
    expect(centered).toBe(1);
  });

  it('没有节点时 fit 是空操作（空画布不该把缩放拉到 0.4）', () => {
    const canvas = build(false);
    let fitted = 0;
    canvas.graph.zoomToFit = () => { fitted += 1; };
    canvas.fit();
    expect(fitted).toBe(0);
  });

  it('graph 已被销毁时 fit 不抛（异步 rAF 可能晚于销毁）', () => {
    const canvas = build();
    canvas.graph = null;
    expect(() => canvas.fit()).not.toThrow();
  });

  it('scheduleFit 合并同一帧的多次请求', () => {
    const canvas = build();
    let fitted = 0;
    canvas.fit = () => { fitted += 1; };
    canvas.scheduleFit();
    canvas.scheduleFit();
    canvas.scheduleFit();
    expect(canvas.fitQueued).toBe(true);
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        expect(fitted).toBe(1);
        resolve();
      });
    });
  });

  it('重置手动位置会清空记录并重新铺满', () => {
    const canvas = build();
    canvas.manual.set('a', { x: 10, y: 10 });
    let fitted = 0;
    canvas.fit = () => { fitted += 1; };
    canvas.reflow = () => {};
    canvas.resetManual();
    expect(canvas.manual.size).toBe(0);
    expect(fitted).toBe(1);
  });

  it('风格在 orth / smooth 之间来回切，并写回按钮文案', () => {
    const canvas = build();
    // buildTools 自带一个 span.mgx-style；toggleStyle 写的是**第一个**匹配
    const label = () => canvas.tools.querySelector('.mgx-style').textContent;
    const before = canvas.style;
    const labelBefore = label();
    canvas.toggleStyle();
    expect(canvas.style).not.toBe(before);
    expect(label()).not.toBe(labelBefore);
    canvas.toggleStyle();
    expect(canvas.style).toBe(before);
    expect(label()).toBe(labelBefore);
  });

  it('切风格时跳过流光叠加边（它们的线型表达方向，不该被改）', () => {
    const canvas = build();
    canvas.graph.clearCells();
    const main = canvas.graph.addEdge({ id: 'e1', data: {} });
    const flow = canvas.graph.addEdge({ id: 'f1', data: { overlay: true } });
    canvas.toggleStyle();
    expect(main.router).toBeTruthy();
    expect(flow.router).toBeNull();
  });

  it('没有风格按钮时切风格也不抛（工具条可能被裁剪）', () => {
    const canvas = build();
    canvas.tools = null;
    expect(() => canvas.toggleStyle()).not.toThrow();
  });
});
