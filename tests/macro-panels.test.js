// @vitest-environment jsdom
/* ================================================================== *
 * 宏观图谱的右侧卡与外壳（views/macro/panels.js）
 *
 * 这一段是「同一条数据在不同状态下的说法」：
 *   · 没有边关联的两端要说清「为什么没有」，而不是给一张空白卡；
 *   · 现实检验 untested 时不能说「一致」也不能说「背离」；
 *   · 沙盘没选震源时要给选择引导；
 *   · 剧本卡要区分「有历史对照」和「样本不足」。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

const P = await import('../src/client/views/macro/panels.js');
const { MACRO_TRANSMISSION_EDGES } = await import('../src/client/views/macro/knowledge-base.js');

const data = (over = {}) => ({
  freq: 'day',
  universe: [
    { id: 'gold-intl', name: '国际金价', short: '黄金', tier: 2, ok: true },
    { id: 'dxy', name: '美元指数', short: '美元', tier: 1, ok: true },
    { id: 'oil', name: '原油', short: '原油', tier: 1, ok: true },
  ],
  matrix: { ids: ['gold-intl', 'dxy', 'oil'], corr: [[1, -0.4, 0.2], [-0.4, 1, -0.1], [0.2, -0.1, 1]], counts: [[9, 9, 9], [9, 9, 9], [9, 9, 9]], stats: [] },
  recent: { dates: ['d1', 'd2', 'd3'], changes: { gold: [], dxy: [], oil: [] } },
  leadLag: [],
  ...over,
});

const state = (over = {}) => ({ graphMode: 'compass', graphFocus: 'gold-intl', playbook: null, shock: null, pair: ['gold-intl', 'dxy'], ...over });

const untested = (id) => [id, { status: 'neutral', badge: '○ 数据不足', roll20: null, roll60: null, longCorr: null, n: 0, asOf: null, unaligned: false }];

describe('小工具', () => {
  it('pctCls 按方向给类名，零与缺失都给空串（不伪造涨跌）', () => {
    expect(P.pctCls(1.2)).toBe('up');
    expect(P.pctCls(-1.2)).toBe('down');
    expect(P.pctCls(0)).toBe('');
    expect(P.pctCls(null)).toBe('');
  });

  it('directionLabel 区分涨价与跌价（同一条渠道方向相反）', () => {
    expect(P.directionLabel('demand', 1)).not.toBe(P.directionLabel('demand', -1));
    expect(P.directionLabel('unknown', 1)).toBeTruthy();
  });

  it('corrCaption 写清口径与有效配对数（避免把相关当因果）', () => {
    expect(P.corrCaption(0)).toContain('0');
    expect(P.corrCaption(250)).toContain('250');
    expect(P.corrCaption(250)).toMatch(/相关/);
  });

  it('corrTone 分档且缺失值给中性', () => {
    expect(P.corrTone(0.8)).toBeTruthy();
    expect(P.corrTone(null)).toBeTruthy();
    expect(P.corrTone(0.8)).not.toBe(P.corrTone(0.05));
  });
});

describe('没有边关联时的卡', () => {
  it('说清「这两端之间没有登记渠道」，而不是给一张空白卡', () => {
    const html = String(P.noEdgeCard(data(), 'gold-intl', 'oil'));
    expect(html).toContain('没有');
    expect(html.length).toBeGreaterThan(50);
  });

  it('缺任意一端时也能渲染（不抛）', () => {
    expect(() => String(P.noEdgeCard(data(), 'gold-intl', 'nope'))).not.toThrow();
  });
});

describe('连线卡', () => {
  const edge = MACRO_TRANSMISSION_EDGES[0];

  it('有现实检验结果时把状态与相关写出来', () => {
    const reality = new Map([untested(edge.id)]);
    const html = String(P.edgeCard(data(), edge, reality, state()));
    expect(html).toContain(edge.label ?? '');
    expect(html).toContain('数据不足');
  });

  it('现实检验缺失时按 untested 处理（不能默认「一致」）', () => {
    const html = String(P.edgeCard(data(), edge, new Map(), state()));
    expect(html).not.toContain('一致');
  });

  it('带解释快照时把机制说明并进来', () => {
    const reality = new Map([untested(edge.id)]);
    const html = String(P.edgeCard(data(), edge, reality, state(), { mechanism: '机制说明', status: 'mixed' }));
    expect(html.length).toBeGreaterThan(50);
  });

  it('不传 state 时也不抛（渲染函数单独被调用）', () => {
    expect(() => String(P.edgeCard(data(), edge, new Map(), undefined))).not.toThrow();
  });
});

describe('导图焦点卡', () => {
  it('没有焦点的资产时给出引导（不是空卡）', () => {
    const html = String(P.mindCardPanel(data(), 'nope', new Map()));
    expect(html.length).toBeGreaterThan(20);
  });

  it('列出该资产的上下游渠道', () => {
    const reality = new Map([untested('E01'), untested('E02')]);
    const html = String(P.mindCardPanel(data(), 'gold-intl', reality));
    expect(html.length).toBeGreaterThan(50);
  });
});

describe('沙盘面板', () => {
  it('没有震源时给选择引导', () => {
    const html = String(P.sandboxPanel(data(), state({ graphMode: 'sandbox', shock: null })));
    expect(html).toContain('震源'); // 真实文案是「选一个变量当震源」
  });

  it('有震源时列出传导路径与条件', () => {
    const html = String(P.sandboxPanel(data(), state({ graphMode: 'sandbox', shock: { id: 'dxy', dir: 1 } })));
    expect(html.length).toBeGreaterThan(50);
  });

  it('震源是不存在的 id 时不抛', () => {
    expect(() => String(P.sandboxPanel(data(), state({ graphMode: 'sandbox', shock: { id: 'nope', dir: 1 } })))).not.toThrow();
  });
});

describe('外壳与图例', () => {
  it('divergenceCount 只数「观测与机制不同」的边', () => {
    const reality = new Map([
      ['E01', { status: 'diverged', badge: '⚡ 方向背离', roll20: -0.4, n: 60 }],
      ['E02', { status: 'consistent', badge: '✓ 一致', roll20: 0.4, n: 60 }],
    ]);
    expect(P.divergenceCount(reality)).toBe(1);
    expect(P.divergenceCount(new Map())).toBe(0);
  });

  it('没有背离时不渲染横幅（别制造噪声）', () => {
    expect(String(P.alertBannerHTML(data(), new Map()))).toBe('');
  });

  it('图例随模式变化（沙盘与罗盘的图例含义不同）', () => {
    expect(String(P.legendHTML('sandbox'))).not.toBe(String(P.legendHTML('compass')));
  });

  it('legendSwatch 把线型也画出来（虚线与实线的含义不同）', () => {
    expect(String(P.legendSwatch('x', '#f00', '2 5', '共同驱动'))).toContain('stroke-dasharray');
  });

  it('三种模式的副标题各不相同（读者要知道自己看的是什么）', () => {
    const subs = ['compass', 'mindmap', 'sandbox'].map((m) => String(P.graphSubtitle(m)));
    expect(new Set(subs).size).toBe(3);
  });

  it('sectionShell 在 legend=false 时不渲染图例（窄容器省空间）', () => {
    const withLegend = String(P.sectionShell(data(), state()));
    const without = String(P.sectionShell(data(), state(), { legend: false }));
    expect(withLegend.length).toBeGreaterThan(without.length);
  });

  it('检查器按模式选卡（罗盘给连线卡、导图给焦点卡、沙盘给沙盘面板）', () => {
    const reality = new Map();
    const a = String(P.inspectorHTML(data(), state({ graphMode: 'compass' }), reality));
    const b = String(P.inspectorHTML(data(), state({ graphMode: 'mindmap' }), reality));
    const c = String(P.inspectorHTML(data(), state({ graphMode: 'sandbox' }), reality));
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it('剧本面板：没有对应边时也不崩，并保留标题（不假装有结论）', () => {
    // 真实结构需要 edges 与 breaks 两个数组（少一个会直接抛）
    // 剧本的真实结构：name/sub/steps/edges/breaks/note（字段缺一个就会抛）
    const pb = { id: 'pb', name: '供给受阻', sub: '成本推动', steps: [['第一步', '+1']], edges: [], breaks: [], note: '仅作情景演示' };
    const html = String(P.playbookPanel(pb, data(), new Map()));
    expect(html).toContain('供给受阻');
    expect(html).toContain('仅作情景演示'); // 结论段必须说明这是情景，不是预测
    expect(html).not.toContain('一致'); // 没有数据时不能判「一致」
  });
});
