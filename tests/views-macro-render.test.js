// @vitest-environment jsdom
/* ================================================================== *
 * 宏观页：统计helpers、矩阵/领先滞后/对比、右侧机理卡、节点卡片
 *
 * 这些都是「入参 → 字符串/数值」的纯层。错一个符号、一条 CI 文案，
 * 页面照样渲染，但结论会反。这里对着具体数字断言。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

document.body.innerHTML = '<section id="macro" style="width:1000px"></section><main id="rows"></main>';

const macro = await import('../src/client/views/macro.js');
const panels = await import('../src/client/views/macro/panels.js');
const nodes = await import('../src/client/views/macro/flow-nodes.js');
const kb = await import('../src/client/views/macro/knowledge-base.js');

/* ------------------------------ 夹具 ------------------------------ */

const UNIVERSE = [
  { id: 'sp500', name: '标普500', short: '标普', kind: 'price', last: 5738.2, decimals: 2 },
  { id: 'us10y', name: '美债10年期', short: '10Y', kind: 'rate', last: 4.245, decimals: 3 },
  { id: 'oil', name: '国际原油', short: '原油', kind: 'price', last: 70.1, decimals: 2 },
  { id: 'gold-intl', name: '国际金价', short: '黄金', kind: 'price', last: 2650, decimals: 2 },
  { id: 'dxy', name: '美元指数', short: '美元', kind: 'price', last: 101.8, decimals: 2 },
];

const dates = Array.from({ length: 60 }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`);

const DATA = {
  ok: true,
  freq: 'day',
  window: 250,
  universe: UNIVERSE,
  matrix: {
    ids: ['sp500', 'us10y', 'oil'],
    corr: [
      [1, -0.42, 0.18],
      [-0.42, 1, 0.31],
      [0.18, 0.31, 1],
    ],
    counts: [
      [250, 250, 245],
      [250, 250, 245],
      [245, 245, 250],
    ],
    stats: [
      {
        a: 'sp500',
        b: 'us10y',
        p: 0.0001,
        pNW: 0.0002,
        q: 0.001,
        significantBH: true,
        stable: true,
        ci: { lo: -0.55, hi: -0.29 },
        inR: -0.44,
        outR: -0.4,
      },
    ],
  },
  recent: {
    dates,
    changes: {
      sp500: dates.map((_, i) => (i % 7 === 0 ? null : Math.sin(i / 5) / 100)),
      us10y: dates.map((_, i) => Math.cos(i / 6) / 100),
      oil: dates.map((_, i) => (i % 11 === 0 ? null : Math.sin(i / 9) / 80)),
      'gold-intl': dates.map((_, i) => (i % 5 === 0 ? null : Math.cos(i / 7) / 90)),
      dxy: dates.map(() => 0.0001),
    },
  },
  leadLag: [
    { leader: 'dxy', follower: 'gold-intl', lag: 2, corr: -0.42, sameDay: -0.3, q: 0.01, n: 240, significantBH: true },
    { leader: 'oil', follower: 'sp500', lag: 1, corr: 0.21, sameDay: null, q: null, n: 180, significantBH: false },
  ],
};

const REALITY = new Map();

/* ------------------------------ 统计 helpers ------------------------------ */

describe('macro 统计 helpers', () => {
  it('pearsonJS：样本不足 / 零方差返回 null，完全相关返回 1', () => {
    expect(macro.pearsonJS([1, 2], [1, 2])).toBeNull();
    expect(macro.pearsonJS([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(macro.pearsonJS([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(macro.pearsonJS([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it('corrBg / corrCellClass：色相只由正负决定，强弱分档', () => {
    expect(macro.corrBg(null)).toBe('rgba(255,255,255,0.035)');
    expect(macro.corrBg(0.2)).toContain('rgba(245,69,92');
    expect(macro.corrBg(-0.2)).toContain('rgba(91,156,248');
    expect(macro.corrBg(2)).toBe(macro.corrBg(1));

    expect(macro.corrCellClass(null)).toBe('na');
    expect(macro.corrCellClass(0.7)).toBe('strong');
    expect(macro.corrCellClass(-0.35)).toBe('mid');
    expect(macro.corrCellClass(0.1)).toBe('weak');
  });

  it('rollingCorrJS：前 win-1 位为 null，休市缺口不足 60% 时给 null', () => {
    const a = Array.from({ length: 50 }, (_, i) => Math.sin(i));
    const b = Array.from({ length: 50 }, (_, i) => Math.sin(i + 1));
    const out = macro.rollingCorrJS(a, b, 20);
    expect(out.slice(0, 19).every((v) => v === null)).toBe(true);
    expect(typeof out[49]).toBe('number');

    const sparse = a.map((v, i) => (i > 30 ? null : v));
    const out2 = macro.rollingCorrJS(sparse, b, 20);
    expect(out2[49]).toBeNull();
  });

  it('changeToReturn：利率按久期折算并反向，价格原样', () => {
    expect(macro.BOND_DURATION_10Y).toBe(8);
    expect(macro.changeToReturn(0.01, 'rate')).toBeCloseTo(-0.0008, 12);
    expect(macro.changeToReturn(0.01, 'price')).toBe(0.01);
  });

  it('normalizeTo100：起点前 null，休市日保持前值，利率路径向下', () => {
    const price = macro.normalizeTo100([null, null, 0.01, -0.02, null, 0.03]);
    expect(price[0]).toBeNull();
    expect(price[2]).toBeCloseTo(100 * Math.exp(0.01), 10);
    expect(price[4]).toBe(price[3]); // 中途 null 保持前值
    expect(price[5]).toBeGreaterThan(price[4]);

    const rate = macro.normalizeTo100([0.01], 'rate');
    expect(rate[0]).toBeLessThan(100); // 收益率上行 → 债券价格下跌
  });
});

/* ------------------------------ 多线图 ------------------------------ */

describe('macro SVG：多线与滚动相关', () => {
  it('没有有效序列时给占位', () => {
    expect(String(macro.multiLineSVG([]))).toContain('暂无数据');
    expect(String(macro.multiLineSVG([{ name: 'a', values: [null, null], color: '#f00' }]))).toContain('暂无数据');
  });

  it('多序列共用 y 轴，图例带名称，null 断点不连成假线', () => {
    const svg = String(
      macro.multiLineSVG(
        [
          { id: 'a', name: 'A', color: '#f00', values: [100, null, 102, 103] },
          { id: 'b', name: 'B', color: '#0f0', values: [100, 101, 102, 103] },
        ],
        { labels: ['d1', 'd2', 'd3', 'd4'] },
      ),
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('#f00');
    expect(svg).toContain('#0f0');
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('richRollingSVG：0 为中轴，正负两色，空数据占位', () => {
    expect(String(macro.richRollingSVG([]))).toContain('chart-empty');
    const svg = String(
      macro.richRollingSVG(
        [
          { v: 0.4, label: 'd1' },
          { v: -0.3, label: 'd2' },
          { v: 0.1, label: 'd3' },
        ],
        { width: 400, height: 160 },
      ),
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('0');
  });
});

/* ------------------------------ 矩阵 / 领先滞后 / 对比 ------------------------------ */

describe('macro 表格 HTML', () => {
  it('macroMatrixHTML：对角线不给星，BH 显著给星与 CI 提示，计数与稳健数一致', () => {
    const html = String(macro.macroMatrixHTML(DATA));
    expect(html).toContain('corr-matrix');
    expect(html).toContain('-0.42');
    expect(html).toContain('class="sig"');
    expect(html).toContain('95%CI [-0.55, -0.29]');
    expect(html).toContain('1/1');
    expect(html).toContain('样本内外同号 <b>1</b>');
    // 对角线提示只给 n
    expect(html).toContain('标普（n=250）');
  });

  it('macroLeadLagHTML：空数据显示占位；有数据按周/日单位与显著性渲染', () => {
    expect(String(macro.macroLeadLagHTML({ ...DATA, leadLag: [] }))).toContain('没有明显的领先滞后关系');
    const html = String(macro.macroLeadLagHTML(DATA));
    expect(html).toContain('美元');
    expect(html).toContain('黄金');
    expect(html).toContain('2 日');
    expect(html).toContain('corr-neg');
    expect(html).toContain('class="sig"');
    expect(html).toContain('—'); // sameDay/q 缺失

    const weekly = String(macro.macroLeadLagHTML({ ...DATA, freq: 'week' }));
    expect(weekly).toContain('周');
  });

  it('macroPairSection / macroCompareHTML：未选对/未勾选时给引导文案', () => {
    expect(String(macro.macroPairSection(DATA))).toContain('点上方矩阵里的任意格子');
    expect(String(macro.macroCompareHTML(DATA))).toContain('勾选上面的标的');
  });

  it('syncPairUI 在没有状态时是 no-op', () => {
    expect(() => macro.syncPairUI()).not.toThrow();
  });
});

/* ------------------------------ 机理卡与骨架 ------------------------------ */

describe('panels：机理卡 / 焦点卡 / 沙盘卡 / 骨架', () => {
  const edge = kb.EDGE_BY_ID.get('E01');

  it('pctCls / corrTone：方向与色相', () => {
    expect(panels.pctCls(null)).toBe('');
    expect(panels.pctCls(1)).toBe('up');
    expect(panels.pctCls(-1)).toBe('down');
    expect(panels.pctCls(0)).toBe('');
    expect(panels.corrTone(null)).toBe('dim');
    expect(panels.corrTone(0.5)).toBe('up');
    expect(panels.corrTone(-0.5)).toBe('cold');
    expect(panels.corrTone(0.1)).toBe('up faint');
  });

  it('noEdgeCard：给出实测数字与「无理论直连」徽章', () => {
    const html = panels.noEdgeCard(DATA, 'sp500', 'gold-intl');
    expect(html).toContain('无理论直连');
    expect(html).toContain('标普');
    expect(html).toContain('250 期相关系数');
    expect(html).toContain('20 期滚动');
  });

  it('edgeCard：无边也没选对时给引导；有边时按符号与背离状态着色', () => {
    expect(panels.edgeCard(DATA, null, REALITY, { pair: [] })).toContain('mg-card-empty');
    expect(panels.edgeCard(DATA, null, REALITY, { pair: ['sp500', 'gold-intl'] })).toContain('无理论直连');

    const reality = new Map([
      ['E01', { status: 'diverged', roll20: 0.12, roll60: -0.2, longCorr: -0.35, badge: '⚡ 背离' }],
    ]);
    const html = panels.edgeCard(DATA, edge, reality, {});
    expect(html).toContain('mg-badge');
    expect(html).toContain('div'); // 背离色调
    expect(html).toContain('+0.12');
    expect(html).toContain('计价压制');
  });

  it('mindCardPanel / sandboxPanel：焦点与空态', () => {
    const mind = panels.mindCardPanel(DATA, 'oil', REALITY);
    expect(mind).toContain('焦点');
    expect(mind).toContain('原油');
    expect(mind).toContain('mg-mini');

    expect(panels.sandboxPanel(DATA, {})).toContain('mg-card-empty');
    const sandbox = panels.sandboxPanel(DATA, { shock: { id: 'dxy', dir: 1 } });
    expect(sandbox).toContain('冲击结果');
    // 2026-10-28 文案迁移：沙盘不再输出「利多/利空」这种单向断言
    expect(sandbox).toContain('正向渠道');
    expect(sandbox).toContain('反向渠道');
  });

  it('playbookPanel：剧本步骤与失效条件', () => {
    const pb = kb.MACRO_PLAYBOOKS[0];
    const html = panels.playbookPanel(pb, DATA, REALITY);
    expect(html).toContain(pb.name);
    expect(html).toContain('mg-sect');
    expect(html).toContain('10Y');
  });

  it('副标题 / 背离计数 / 图例 / 头部工具条', () => {
    expect(panels.graphSubtitle('compass')).toContain('四象限');
    expect(panels.graphSubtitle('mindmap')).toContain('零交叉');
    expect(panels.graphSubtitle('sandbox')).toContain('直接 / 间接');
    expect(panels.divergenceCount(new Map([['a', { status: 'diverged' }], ['b', { status: 'ok' }]]))).toBe(1);

    const legend = panels.legendHTML('compass');
    expect(legend).toContain('lg-a-');
    expect(legend).toContain('正向推升');
    expect(panels.legendSwatch('x', '#fff', '6 4', 'L')).toContain('stroke-dasharray="6 4"');

    const head = panels.headHTML({ graphMode: 'mindmap' });
    expect(head).toContain('mg-mode on');
    expect(head).toContain('单点思维导图');

    const tools = panels.toolsHTML(DATA, { graphMode: 'compass' }, REALITY);
    expect(tools).toContain('全部关系');
    expect(tools).toContain(`背离 0/${kb.MACRO_TRANSMISSION_EDGES.length}`);
    const toolsMind = panels.toolsHTML(DATA, { graphMode: 'mindmap' }, null);
    expect(toolsMind).toContain('剧本压暗只在');
  });

  it('barsHTML：三种模式分别给空/焦点条/震源条', () => {
    expect(panels.barsHTML(DATA, { graphMode: 'compass' })).toBe('');
    const mind = panels.barsHTML(DATA, { graphMode: 'mindmap', graphFocus: 'oil' });
    expect(mind).toContain('mg-fpill on');
    const sandbox = panels.barsHTML(DATA, { graphMode: 'sandbox', shock: { id: 'dxy', dir: -1 } });
    expect(sandbox).toContain('mg-spick on');
    expect(sandbox).toContain('模拟大跌 ↓');
  });

  it('alertBannerHTML / inspectorHTML：无背离时无横幅，三种模式各自分发', () => {
    expect(panels.alertBannerHTML(DATA, REALITY)).toBe('');

    const reality = new Map([
      ['E01', { status: 'diverged', badge: '⚡ 极端', roll20: -0.4 }],
    ]);
    const banner = panels.alertBannerHTML(DATA, reality);
    expect(banner).toContain('mg-alert');
    expect(banner).toContain('观测与机制不同');
    // 横幅不得把观测差异说成因果已被打破
    expect(banner).not.toContain('压过了');

    expect(panels.inspectorHTML(DATA, { graphMode: 'compass' }, REALITY)).toContain('mg-card');
    expect(panels.inspectorHTML(DATA, { graphMode: 'mindmap', graphFocus: 'oil' }, REALITY)).toContain('焦点');
    expect(panels.inspectorHTML(DATA, { graphMode: 'sandbox' }, REALITY)).toContain('mg-card-empty');
  });

  it('sectionShell：挂载点与 legend 开关', () => {
    const html = panels.sectionShell(DATA, { graphMode: 'compass' });
    expect(html).toContain('macro-graph-section');
    expect(html).toContain('id="mg-x6"');
    expect(html).toContain('mg-legend');
    expect(panels.sectionShell(DATA, { graphMode: 'compass' }, { legend: false })).not.toContain('mg-legend');
  });
});

/* ------------------------------ 节点卡片 ------------------------------ */

describe('flow-nodes：端口、徽章、卡片', () => {
  const layoutNodes = [
    { id: 'dxy', x: 0, y: 0, w: 152, h: 78 },
    { id: 'oil', x: 200, y: 100, w: 152, h: 98 },
  ];
  const edges = [kb.EDGE_BY_ID.get('E02')];

  it('buildPorts 给两端各一个端口，方向来自布局', () => {
    const ports = nodes.buildPorts(layoutNodes, edges);
    expect(ports.get('dxy').items[0].id).toBe('po-E02');
    expect(ports.get('oil').items[0].id).toBe('pi-E02');
    expect(ports.get('dxy').groups.top.attrs.portBody.magnet).toBe(true);
    expect(nodes.portAttrs().portBody.r).toBe(3);
  });

  it('chipFor：沙盘冲击 > 簇锚点；无关节点无徽章', () => {
    const prop = new Map([
      ['oil', { conflict: true, dirs: new Set([1, -1]), hop: 1 }],
      ['sp500', { conflict: false, dirs: new Set([1]), hop: 2 }],
    ]);
    const sandbox = { graphMode: 'sandbox', shock: { id: 'dxy', dir: 1 } };
    expect(nodes.chipFor('dxy', { state: sandbox, prop, reality: REALITY })).toMatchObject({ text: '假设大涨 ↑', tone: 'src' });
    expect(nodes.chipFor('oil', { state: sandbox, prop, reality: REALITY })).toMatchObject({ text: '方向未定', tone: 'mix' });
    // 文案迁移：二阶利多 → 间接渠道 + 方向措辞（不再暗示时间顺序）
    expect(nodes.chipFor('sp500', { state: sandbox, prop, reality: REALITY }).text).toContain('间接');
    expect(nodes.chipFor('sp500', { state: sandbox, prop, reality: REALITY }).text).not.toContain('利多');
    expect(nodes.chipFor('gold-intl', { state: sandbox, prop, reality: REALITY })).toBeNull();

    // 只有簇内锚点（E16/E18）才在「全部关系」下挂徽章
    const compass = { graphMode: 'compass' };
    const clusterEdge = kb.EDGE_BY_ID.get('E16');
    expect(nodes.chipFor('gold-intl', { state: compass, reality: REALITY, pairEdge: clusterEdge })).toMatchObject({ tone: 'pos' });
    expect(nodes.chipFor('gold-cn', { state: compass, reality: REALITY, pairEdge: clusterEdge })).toMatchObject({ tone: 'pos' });
    expect(nodes.chipFor('oil', { state: compass, reality: REALITY, pairEdge: clusterEdge })).toBeNull();
    // 非簇边即使两端匹配也不挂
    expect(nodes.chipFor('dxy', { state: compass, reality: REALITY, pairEdge: kb.EDGE_BY_ID.get('E01') })).toBeNull();
  });

  it('dimClass：沙盘只点亮被传导节点，震源自身不压暗；剧本按 activeEdges', () => {
    const state = { graphMode: 'sandbox', shock: { id: 'dxy' } };
    const prop = new Map([['oil', {}]]);
    expect(nodes.dimClass('dxy', { state, prop })).toBe('');
    expect(nodes.dimClass('oil', { state, prop })).toBe('');
    expect(nodes.dimClass('sp500', { state, prop })).toBe(' is-dim');
    expect(nodes.dimClass('oil', { state: { graphMode: 'compass' }, activeEdges: { nodes: new Set(['oil']) } })).toBe('');
    expect(nodes.dimClass('sp500', { state: { graphMode: 'compass' }, activeEdges: { nodes: new Set(['oil']) } })).toBe(' is-dim');
  });

  it('cardHTML：价格/涨跌/副标的/焦点与尺寸', () => {
    const ctx = {
      data: {
        ...DATA,
        universe: [
          ...UNIVERSE,
          { id: 'brent', name: '布伦特', short: '布伦特', kind: 'price', last: 74.2, decimals: 2 },
        ],
      },
      state: { graphMode: 'compass', graphFocus: 'oil' },
      reality: REALITY,
      centerId: 'oil',
    };
    const html = nodes.cardHTML('oil', ctx, { w: 152, h: 98 });
    expect(html).toContain('mgx-card');
    expect(html).toContain('mgx-card--lg');
    expect(html).toContain('is-focus');
    expect(html).toContain('width:152px;height:98px');
    expect(html).toContain('原油');
    expect(html).toContain('布伦特'); // 副标的行
    expect(html).toContain('mgx-sub');

    // 没有 universe 条目时也不崩，价格给破折号
    const bare = nodes.cardHTML('oil', { data: { universe: [] }, state: {}, reality: REALITY });
    expect(bare).toContain('—');
  });

  it('fmtPrice 千分位与小数位；bandSVGAttrs 带 zone 元数据', () => {
    expect(nodes.fmtPrice({ last: 5738.2, decimals: 2 })).toBe('5,738.20');
    expect(nodes.fmtPrice({ last: 4.245, decimals: 3 })).toBe('4.245');
    expect(nodes.fmtPrice({ last: null })).toBe('—');
    expect(nodes.fmtPrice({ last: 1, decimals: null })).toBe('1.00');

    const band = nodes.bandSVGAttrs({ label: 'anchor' }, 2);
    expect(band.key).toBe('band-2');
    expect(band.meta.short).toBeTruthy();
    expect(nodes.bandSVGAttrs({ label: 'nope' }, 0).meta).toBe(kb.ZONE_META.risk);
  });
});
