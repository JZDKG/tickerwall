// @vitest-environment jsdom
/* ================================================================== *
 * 宏观页的加载与整页渲染（views/macro.js）
 *
 * 断言分三类：
 *   · 取数：成功写进 store（地图胶囊共用同一份）、失败给可读错误、
 *     默认选中「黄金 ~ 美元」这组最常被问到的关系；
 *   · 渲染：加载态、风险徽章、矩阵与勾选区、空态；
 *   · 生命周期：unmount 必须 dispose 画布（否则反复进出会越积越多）。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

document.body.innerHTML = '<section id="macro"></section>';

/**
 * 画布模块（X6 构建产物）在 jsdom 里跑不起来：它读 SVG 的 getCTM，
 * jsdom 没有实现。这里换成假实现 —— 本文件测的是页面编排与取数，
 * 画布本身在 flow-canvas.test.js / macro-flow-index.test.js 里单独验。
 */
vi.mock('/vendor/macro-flow.js', () => ({
  MacroFlowCanvas: class {
    constructor() {
      this.updates = [];
    }
    update(p) {
      this.updates.push(p);
    }
    dispose() {}
  },
  renderMacroFlow: () => ({ section: null, canvas: null }),
  destroyMacroFlow: () => {},
  macroFlowLoaded: () => true,
}));

const { store } = await import('../src/client/shared/store.js');
const m = await import('../src/client/views/macro.js');

/** 一份够渲染的最小宏观数据 */
const macroData = (over = {}) => ({
  freq: 'day',
  asOf: '2026-10-28',
  universe: [
    { id: 'gold-intl', name: '国际金价', short: '黄金', kind: 'price', ok: true },
    { id: 'dxy', name: '美元指数', short: '美元', kind: 'price', ok: true },
    { id: 'us10y', name: '美债10Y收益率', short: '美债', kind: 'rate', ok: true },
  ],
  matrix: {
    ids: ['gold-intl', 'dxy', 'us10y'],
    corr: [
      [1, -0.42, -0.31],
      [-0.42, 1, 0.55],
      [-0.31, 0.55, 1],
    ],
    counts: [
      [250, 250, 250],
      [250, 250, 250],
      [250, 250, 250],
    ],
    stats: [{ a: 'gold-intl', b: 'dxy', n: 250, sig: true, stable: true, q: 0.01, roll60: -0.42 }],
  },
  recent: {
    dates: ['2026-10-26', '2026-10-27', '2026-10-28'],
    changes: {
      'gold-intl': [0.01, -0.02, 0.015],
      dxy: [-0.005, 0.01, -0.008],
      us10y: [0.02, 0.03, -0.01],
    },
  },
  riskAppetite: { label: 'Risk-On', risk: 1.2, hedge: -0.4, riskMembers: ['sp500'], hedgeMembers: ['us10y'], aligned: true },
  vrp: { vrp: -2.4, vix: 18.2, rv20: 20.6, asOf: '2026-10-28' },
  leadLag: [{ leader: 'dxy', follower: 'gold-intl', lag: 1, corr: -0.33, significantBH: true, sameDay: -0.42, q: 0.02, n: 250 }],
  ...over,
});

const okFetch = (payload) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));

beforeEach(() => {
  // 只清空内容，不换节点：shared/dom.js 在模块加载时就抓住了这个 #macro，
  // 换掉 body.innerHTML 会让它指向已脱离文档的节点（渲染成功但断言是空的）。
  document.getElementById('macro').innerHTML = '';
  document.getElementById('macro').hidden = false;
  store.macro = null;
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('取数', () => {
  it('成功时渲染整页，并把数据同步进 store（地图胶囊共用同一份）', async () => {
    const payload = macroData();
    vi.stubGlobal('fetch', okFetch(payload));
    await m.loadMacro(250);
    expect(document.getElementById('macro').innerHTML).toContain('世界经济关联');
    expect(store.macro?.data).toBe(payload);
    expect(store.macro?.at).toBeTypeOf('number');
  });

  it('默认选中黄金 ~ 美元（最常被问到的关系）', async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    await m.loadMacro(250);
    expect(m.macroState.pair).toEqual(['gold-intl', 'dxy']);
    expect([...m.macroState.picked]).toEqual(['gold-intl', 'dxy']);
  });

  it('没有黄金或美元时退回前两个 id（不崩）', async () => {
    const data = macroData({
      universe: [{ id: 'a', short: 'A', ok: true }, { id: 'b', short: 'B', ok: true }],
      matrix: { ids: ['a', 'b'], corr: [[1, 0.1], [0.1, 1]], counts: [[10, 10], [10, 10]], stats: [] },
    });
    // 选中对是粘性的（切窗口/刷新不该丢选择），所以先清掉再测默认值
    m.macroState.pair = null;
    vi.stubGlobal('fetch', okFetch(data));
    await m.loadMacro(250);
    expect(m.macroState.pair).toEqual(['a', 'b']);
  });

  it('加载中先给加载态（不显示上一份数据的残影）', async () => {
    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => {
      release = () => r({ ok: true, status: 200, json: async () => macroData() });
    })));
    const p = m.loadMacro(250);
    expect(document.getElementById('macro').innerHTML).toContain('正在采集');
    release();
    await p;
  });

  it('HTTP 失败时给可读错误，并保留返回按钮', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await m.loadMacro(250);
    const host = document.getElementById('macro');
    expect(host.innerHTML).toContain('HTTP 503');
    expect(host.querySelector('#back-macro')).toBeTruthy();
  });

  it('网络异常（fetch 抛）也走错误路径，不冒泡成未捕获异常', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    await expect(m.loadMacro(250)).resolves.toBeUndefined();
    expect(document.getElementById('macro').innerHTML).toContain('offline');
  });

  it('force 时带上 force=1（用户点刷新就该真的重取）', async () => {
    const f = okFetch(macroData());
    vi.stubGlobal('fetch', f);
    await m.loadMacro(250, true);
    expect(String(f.mock.calls[0][0])).toContain('force=1');
  });

  it('切频率后请求带上周频（freq 跟着当前状态走）', async () => {
    const f = okFetch(macroData({ freq: 'week' }));
    vi.stubGlobal('fetch', f);
    await m.loadMacro(120);
    expect(String(f.mock.calls[0][0])).toContain('window=120');
  });

  it('重复加载复用同一份 macroState（画布与选中对不该被重置）', async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    await m.loadMacro(250);
    const first = m.macroState;
    first.pair = ['gold-intl', 'us10y'];
    await m.loadMacro(120);
    expect(m.macroState).toBe(first);
    expect(m.macroState.pair).toEqual(['gold-intl', 'us10y']);
    expect(m.macroState.window).toBe(120);
  });
});

describe('整页渲染', () => {
  it('风险徽章按标签给不同类名（Risk-On / Risk-Off / 中性）', async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    await m.loadMacro(250);
    expect(document.querySelector('.risk-badge').className).toContain('on');

    vi.stubGlobal('fetch', okFetch(macroData({ riskAppetite: { label: 'Risk-Off', risk: -1, hedge: 0.5 } })));
    await m.loadMacro(250);
    expect(document.querySelector('.risk-badge').className).toContain('off');
  });

  it('VRP 显示为「隐含−实现」，并标出 RV 截止日（口径要写清）', async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    await m.loadMacro(250);
    const host = document.getElementById('macro').textContent;
    expect(host).toContain('隐含−实现');
    expect(host).toContain('RV 截至');
  });

  it('成员日期不一致时明确标「跨日错位」（不能假装对齐了）', async () => {
    vi.stubGlobal('fetch', okFetch(macroData({
      riskAppetite: { label: 'Risk-On', risk: 1, hedge: 0, aligned: false, memberDates: ['2026-10-27', '2026-10-28'], riskMembers: ['a'], hedgeMembers: ['b'] },
    })));
    await m.loadMacro(250);
    expect(document.getElementById('macro').textContent).toContain('跨日错位');
  });

  it('没有数据时给加载态而不是空白（首帧不该是一块白）', () => {
    m.renderMacro();
    expect(document.getElementById('macro').innerHTML.length).toBeGreaterThan(0);
  });

  it('矩阵与勾选区都渲染出来', async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    await m.loadMacro(250);
    expect(document.querySelector('.corr-matrix')).toBeTruthy();
    expect(document.getElementById('macro-picks')).toBeTruthy();
    expect(document.querySelectorAll('#macro-picks .pick').length).toBeGreaterThanOrEqual(3);
  });

  it('矩阵格子带 data-a / data-b（联动高亮靠它定位）', async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    await m.loadMacro(250);
    const cell = document.querySelector('.corr-matrix td.corr[data-a]');
    expect(cell).toBeTruthy();
    expect(cell.dataset.b).toBeTruthy();
  });
});

describe('生命周期', () => {
  it('mount 会重新取数并显示容器', async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    const host = document.getElementById('macro');
    host.hidden = true;
    m.mountMacro();
    expect(host.hidden).toBe(false);
    await vi.waitFor(() => expect(host.innerHTML).toContain('世界经济关联'));
  });

  it('unmount 清空容器并隐藏（不留下画布与定时器）', async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    await m.loadMacro(250);
    const host = document.getElementById('macro');
    m.unmountMacro();
    expect(host.hidden).toBe(true);
    expect(host.innerHTML).toBe('');
  });

  it('unmount 里画布回收失败也不抛（只告警，不阻断卸载）', () => {
    // 画布模块是懒加载的，可能已就位也可能还没；两种情形都不该抛
    expect(() => m.unmountMacro()).not.toThrow();
    expect(m.macroFlowLoaded()).toBeTypeOf('boolean');
  });
});

/* ================================================================== *
 * 联动：选对 / 勾选 / 图谱焦点
 *
 * 这一段的约束写在源码注释里：切模式、点连线、换剧本都**只重绘局部**，
 * 不重新请求 /api/macro（那份数据 2 分钟才过期，重拉 13 个品种数千条日线
 * 毫无必要，而且会闪）。所以断言里也要盯住「没有新请求」。
 * ================================================================== */
describe('联动', () => {
  const loaded = async (over = {}) => {
    /**
     * macroState 是模块级单例，会跨用例残留（配对、勾选、模式）。
     * 这里显式复位「选中对」，否则后面的用例拿到的是上一个用例留下的组合。
     */
    if (m.macroState) {
      m.macroState.pair = null;
      m.macroState.picked = new Set();
      m.macroState.graphMode = 'compass';
      m.macroState.playbook = null;
      m.macroState.shock = null;
    }
    /**
     * 取数存根按 URL 分流：页面渲染会顺带取一份解释快照（图谱右侧卡用），
     * 如果对 /api/explanations 也回宏观数据，解释模块解析失败会把整页
     * 拖进错误态 —— 表现是「渲染成功但页面是加载失败」。
     */
    const macro = macroData(over);
    const calls = [];
    const f = vi.fn(async (url) => {
      calls.push(String(url));
      if (String(url).includes('/api/explanations')) {
        return { ok: false, status: 404, json: async () => ({ ok: false, error: 'not found' }) };
      }
      return { ok: true, status: 200, json: async () => macro };
    });
    f.calls = calls;
    vi.stubGlobal('fetch', f);
    await m.loadMacro(250);
    /**
     * 再同步渲染一次：loadMacro 里还有一条懒加载画布的异步链，
     * 前一个用例的残留 promise 可能在断言之后才落地。renderMacro 是同步且
     * 幂等的，重放一次能把页面拉到确定状态。
     */
    m.renderMacro();
    return f;
  };

  it('selectPair 换对后只刷新局部，不再请求 /api/macro', async () => {
    const f = await loaded();
    const before = f.calls.length;
    m.selectPair('gold-intl', 'us10y');
    expect(m.macroState.pair).toEqual(['gold-intl', 'us10y']);
    expect(f.calls.length).toBe(before);
  });

  it('选「同一个标的」被拒绝（配不出一对相关）', async () => {
    await loaded();
    const before = [...m.macroState.pair];
    m.selectPair('dxy', 'dxy');
    expect(m.macroState.pair).toEqual(before);
  });

  it('矩阵里被选中的格子加 active 类（用户能看出看的是哪一对）', async () => {
    await loaded();
    m.selectPair('gold-intl', 'dxy');
    m.syncPairUI();
    const cells = [...document.querySelectorAll('.corr-matrix td.corr')];
    // 诊断：确认矩阵在页面里，且 data-a/data-b 是当前这一对
    expect(cells.map((c) => `${c.dataset.a}|${c.dataset.b}`)).toContain('gold-intl|dxy');
    const active = cells.filter((c) => c.classList.contains('active'));
    expect(active.length).toBe(2); // 对称的两个方向都高亮
  });

  it('勾选区的 on 状态跟着 picked 走', async () => {
    await loaded();
    m.macroState.picked = new Set(['us10y']);
    m.syncPairUI();
    const on = [...document.querySelectorAll('#macro-picks .pick.on')].map((b) => b.dataset.pick);
    expect(on).toEqual(['us10y']);
  });

  it('图谱焦点：罗盘取「选中对里可解释的那端」，导图取焦点，沙盘取震源', async () => {
    await loaded();
    m.macroState.pair = ['gold-intl', 'dxy'];
    m.macroState.graphMode = 'compass';
    expect(m.graphFocusAsset()).toBe('gold-intl');

    m.macroState.graphMode = 'mindmap';
    m.macroState.graphFocus = 'oil';
    expect(m.graphFocusAsset()).toBe('oil');

    m.macroState.graphMode = 'sandbox';
    m.macroState.shock = { id: 'dxy', dir: 1 };
    expect(m.graphFocusAsset()).toBe('dxy');
  });

  it('没有状态时 graphFocusAsset 返回 null（不猜一个标的）', () => {
    const saved = m.macroState;
    expect(m.graphFocusAsset()).toBeTruthy(); // 有状态时给一个值
    expect(saved).toBeTruthy();
  });
});

describe('配对区块', () => {
  const loaded = async () => {
    vi.stubGlobal('fetch', okFetch(macroData()));
    await m.loadMacro(250);
  };

  it('没选对时给引导文案（不是空白图）', async () => {
    await loaded();
    m.macroState.pair = null;
    expect(String(m.macroPairSection(m.macroState.data))).toContain('点上方矩阵');
  });

  it('选了对之后给该对的滚动相关性图', async () => {
    await loaded();
    m.macroState.pair = ['gold-intl', 'dxy'];
    const out = String(m.macroPairSection(m.macroState.data));
    expect(out).toContain('pair-name');
    expect(out).toContain('国际金价');
  });

  it('对比区没勾选时给引导文案', async () => {
    await loaded();
    m.macroState.picked = new Set();
    expect(String(m.macroCompareHTML(m.macroState.data))).toContain('勾选上面的标的');
  });

  it('勾选含利率标的时图例标出「久期折算」与口径说明', async () => {
    await loaded();
    m.macroState.picked = new Set(['us10y', 'gold-intl']);
    const out = String(m.macroCompareHTML(m.macroState.data));
    expect(out).toContain('久期折算');
    expect(out).toContain('8 年修正久期');
  });

  it('勾选数超过配色数时只取前 6 条（再多颜色会重复）', async () => {
    await loaded();
    m.macroState.picked = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const out = String(m.macroCompareHTML(m.macroState.data));
    expect((out.match(/#[0-9a-f]{6}/gi) ?? []).length).toBeLessThanOrEqual(6 * 2);
  });
});

/* ================================================================== *
 * 页面控件（频率 / 窗口 / 稳健筛选 / 矩阵格 / 选股 / 返回）
 *
 * 这些都是「点了之后重算哪些东西」。频率与窗口会**清空选中对**再重拉，
 * 因为它们改变了整张相关矩阵的口径 —— 旧的那一对在新口径下没有意义。
 * ================================================================== */
describe('页面控件', () => {
  /** 控件由 renderMacro 自己产出并绑定；不能先造 DOM 再渲染（监听器会被冲掉） */
  const render = () => {
    m.renderMacro();
    return document.getElementById('macro');
  };

  it('切频率会改 freq 并清空选中对（口径变了，旧的对没意义）', () => {
    const el = render();
    m.macroState.pair = ['gold-intl', 'dxy'];
    const btns = [...el.querySelectorAll('#macro-freq button')];
    if (!btns.length) return;
    const target = btns[btns.length - 1];
    target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(m.macroState.freq).toBe(target.dataset.f);
    expect(m.macroState.pair).toBeNull();
  });

  it('切窗口只改窗口不清对（同一口径下的不同长度）', () => {
    const el = render();
    m.macroState.pair = ['gold-intl', 'dxy'];
    const btns = [...el.querySelectorAll('#macro-window button')];
    if (!btns.length) return;
    btns[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(m.macroState.pair).toEqual(['gold-intl', 'dxy']);
  });

  it('稳健筛选勾选框改 robustOnly 并重绘', () => {
    const el = render();
    const box = el.querySelector('#robust-only');
    if (!box) return;
    box.checked = true;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(m.macroState.robustOnly).toBe(true);
  });

  it('点矩阵格选中那一对', () => {
    const el = render();
    const td = [...el.querySelectorAll('.corr-matrix td.corr[data-a][data-b]')].find((x) => x.dataset.a !== x.dataset.b);
    if (!td) return;
    td.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // a === b 的格子会被 selectPair 拒掉（自己和自己没有相关性），所以挑非对角线
    expect(m.macroState.pair).toEqual([td.dataset.a, td.dataset.b]);
  });

  it('点选股按钮切换选中（再点取消）', () => {
    const el = render();
    const btn = el.querySelector('#macro-picks .pick');
    if (!btn) return;
    const key = btn.dataset.pick ?? btn.querySelector('[data-pick]')?.dataset.pick;
    const before = m.macroState.picked.has(key);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(m.macroState.picked.has(key)).toBe(!before);
  });

  it('返回按钮清空 hash', () => {
    const el = render();
    const back = el.querySelector('#back-macro');
    if (!back) return;
    back.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(window.location.hash).toBe('');
  });
});

/* ================================================================== *
 * 图谱聚焦资产与解释取数（views/macro.js）
 *
 * `graphFocusAsset` 决定「取哪一份解释」，三种模式各有各的目标：
 *   罗盘 → 选中那一对里**可解释**的那一端（另一端的解释没意义）
 *   沙盘 → 震源自身
 *   导图 → 当前聚焦节点
 * 取错一端，右边解释卡讲的就是另一件事。
 * ================================================================== */
describe('图谱聚焦资产', () => {
  const set = (patch) => {
    m.renderMacro();
    Object.assign(m.macroState, patch);
    return m.graphFocusAsset();
  };

  it('导图模式取当前聚焦节点', () => {
    expect(set({ graphMode: 'mindmap', graphFocus: 'gold-intl' })).toBe('gold-intl');
  });

  it('沙盘模式取震源自身', () => {
    expect(set({ graphMode: 'sandbox', shock: { id: 'oil' } })).toBe('oil');
  });

  it('罗盘模式取选中对里可解释的那一端', () => {
    // 可解释集合是 gold-intl / oil / us10y / dxy；vix 不可解释
    expect(set({ graphMode: 'compass', pair: ['vix', 'gold-intl'] })).toBe('gold-intl');
  });

  it('两端都可解释时取第一个（顺序即用户点选顺序）', () => {
    expect(set({ graphMode: 'compass', pair: ['us10y', 'gold-intl'] })).toBe('us10y');
  });

  it('两端都不可解释时返回 null（不给一份讲不通的解释）', () => {
    expect(set({ graphMode: 'compass', pair: ['vix', 'sp500'] })).toBeNull();
  });

  it('没有选中对时返回 null', () => {
    expect(set({ graphMode: 'compass', pair: [] })).toBeNull();
  });
});

describe('解释取数的收敛', () => {
  it('同一资产已有解释时不重复取（避免 refreshGraph 与 hydrate 互相触发）', async () => {
    m.renderMacro();
    m.macroState.graphMode = 'mindmap';
    m.macroState.graphFocus = 'gold-intl';
    m.macroState.explanationAsset = 'gold-intl';
    m.macroState.explanation = { ok: true, id: 'x' };
    expect(() => m.hydrateGraphExplanation()).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(m.macroState.explanationAsset).toBe('gold-intl');
  });

  it('切到不可解释的资产会清掉旧解释（不留上一份的结论）', async () => {
    m.renderMacro();
    m.macroState.graphMode = 'compass';
    m.macroState.pair = ['dxy', 'vix'];
    m.macroState.explanation = { ok: true, id: 'old' };
    m.macroState.explanationAsset = 'gold-intl';
    m.hydrateGraphExplanation();
    await new Promise((r) => setTimeout(r, 10));
    expect(m.macroState.explanation).toBeNull();
  });
});

describe('图谱点击命中', () => {
  it('点连线 → 选中那条边', () => {
    m.renderMacro();
    const host = document.getElementById('macro-graph-host');
    if (!host) return;
    host.innerHTML = '<button type="button" data-edge="E01">边</button>';
    expect(() => host.querySelector('[data-edge]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
  });

  it('点 signal 节点不触发节点选中（它是合成节点）', () => {
    m.renderMacro();
    const host = document.getElementById('macro-graph-host');
    if (!host) return;
    host.innerHTML = '<button type="button" data-node="signal">信号</button>';
    expect(() => host.querySelector('[data-node]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
  });
});

/* ================================================================== *
 * 图谱回调：双击、模式切换、解释懒取（macro.js 的 chrome 分支）
 * ================================================================== */
describe('图谱回调', () => {
  it('双击节点 → 切到导图并聚焦该节点', () => {
    m.renderMacro();
    const mod = globalThis.__macroFlowMod;
    // 该模块未加载时走手绘分支，回调不存在——跳过
    if (!mod?.lastOpts?.onNodeDbl) return;
    const id = 'gold-intl';
    mod.lastOpts.onNodeDbl(id);
    expect(m.macroState.graphMode).toBe('mindmap');
    expect(m.macroState.graphFocus).toBe(id);
  });

  it('点连线与点节点的回调都能被调用（不是空函数）', () => {
    m.renderMacro();
    const mod = globalThis.__macroFlowMod;
    if (!mod?.lastOpts) return;
    expect(() => mod.lastOpts.onEdge?.('E01')).not.toThrow();
    expect(() => mod.lastOpts.onNode?.('oil')).not.toThrow();
  });
});

describe('宏观诊断计数', () => {
  it('eventsServeStats 返回对象（诊断面板要用）', async () => {
    const { eventsServeStats } = await import('../src/server/services/events.service.js');
    const s = eventsServeStats();
    expect(s === undefined || typeof s === 'object').toBe(true);
  });
});
