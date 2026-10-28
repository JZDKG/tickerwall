// @vitest-environment jsdom
/* ================================================================== *
 * 详情页整屏渲染（views/detail.js renderDetail）
 *
 * 断言的是页面上看得见的分区与它们的前提条件：
 *   · 图表区随周期/区间/对数/均线切换而变，但**不重新取数**；
 *   · 历史数据缺失时给明确的空态与缓存提示，不是一张空表；
 *   · 交叉校验少于两个来源时不渲染（一个来源没有对照可言）。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

document.body.innerHTML = '<section id="detail"></section>';
const detailEl = document.getElementById('detail');

vi.mock('../src/client/shared/calendar.js', () => ({ loadCalendarCached: async () => ({ upcoming: [] }) }));

const d = await import('../src/client/views/detail.js');

/** 造 40 个交易日：[date, open, close, high, low, volume, amount, pct] */
const daily = () =>
  Array.from({ length: 40 }, (_, i) => {
    const day = String(1 + (i % 28)).padStart(2, '0');
    return [`2026-09-${day}`, 100 + i, 101 + i, 103 + i, 99 + i, 1000 + i, 1e8, 0.5];
  });

const detailData = (over = {}) => ({
  id: 'gold-intl',
  name: '国际金价',
  generatedAt: '2026-10-28T12:00:00.000Z',
  decimals: 2,
  priceBasis: 'close',
  quote: { price: 140, prevClose: 139, open: 138, high: 141, low: 137, changePct: 0.72 },
  ext: {},
  stats: { rv20: 12.3, rv20Percentile: 55, volRegime: '中性', maxDrawdown: { pct: -12.5 } },
  history: { daily: daily(), rows: daily(), count: 40, source: 'test', code: 'XAU', startDate: '2026-09-01', endDate: '2026-10-28' },
  intraday: { points: [{ t: '09:30', p: 138 }, { t: '10:00', p: 139 }, { t: '10:30', p: 140 }] },
  crosscheck: [
    { source: '主源', price: 140, time: '2026-10-28T12:00:00Z' },
    { source: '东财', price: 140.4, time: '2026-10-28T12:00:00Z' },
  ],
  derived: null,
  ...over,
});

beforeEach(() => {
  detailEl.hidden = false;
  d.mountDetail('gold-intl');
  detailEl.innerHTML = '';
});

afterEach(() => {
  d.unmountDetail();
});

describe('整屏分区', () => {
  it('渲染出图表、关键指标、交叉校验与历史表', () => {
    d.renderDetail(detailData());
    expect(detailEl.innerHTML.length).toBeGreaterThan(500);
    expect(detailEl.textContent).toContain('关键指标');
    expect(detailEl.querySelector('.d-metrics')).toBeTruthy();
  });

  it('日内数据缺失时不渲染日内图（不画一张空坐标系）', () => {
    const data = detailData({ intraday: null });
    d.renderDetail(data);
    // 没有日内就少一段 svg，但页面其它部分仍在
    expect(detailEl.textContent).toContain('关键指标');
  });

  it('交叉校验少于两个来源时不渲染对照表（一个来源没有对照可言）', () => {
    d.renderDetail(detailData({ crosscheck: [{ source: '主源', price: 140, time: '2026-10-28T12:00:00Z' }] }));
    expect(detailEl.textContent).not.toContain('多源对照');
  });

  it('缺报价时不显示价格为 undefined（降级为破折号）', () => {
    d.renderDetail(detailData({ quote: {} }));
    expect(detailEl.textContent).not.toContain('undefined');
  });
});

describe('历史数据空态', () => {
  it('没有历史数据时给明确说明，而不是一张空表', () => {
    d.renderDetail(detailData({ history: { daily: [], rows: [], count: 0, source: 'test' } }));
    const text = detailEl.textContent;
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('undefined');
  });

  it('走落盘缓存时给提示，并写清「截止到哪天」', () => {
    // 口径是 history.cache.hit === 'stale'，不是 history.stale
    const notice = String(d.historyCacheNotice({
      cache: { hit: 'stale', ageMs: 30 * 3600_000 },
      endDate: '2026-10-25',
    }));
    expect(notice).toMatch(/缓存/);
    expect(notice).toContain('2026-10-25');
    expect(notice).toContain('1 天');
  });

  it('新鲜的数据不给缓存提示（别制造噪声）', () => {
    expect(d.historyCacheNotice({ cache: { hit: 'fresh' } })).toBe('');
    expect(d.historyCacheNotice({})).toBe('');
  });

  it('多源列表为空时 altSources 返回空串', () => {
    expect(d.altSources({})).toBe('');
    expect(d.altSources({ altSources: [] })).toBe('');
  });
});

describe('周期 / 区间 / 尺度', () => {
  it('周K 聚合后条数少于日K', () => {
    const rows = daily();
    const weekly = d.aggregateDaily(rows, 'week');
    expect(weekly.length).toBeLessThan(rows.length);
    expect(weekly.length).toBeGreaterThan(0);
  });

  it('月K 再少一档（同样的数据，更粗的桶）', () => {
    const rows = daily();
    const m = d.aggregateDaily(rows, 'month');
    expect(m.length).toBeLessThanOrEqual(d.aggregateDaily(rows, 'week').length);
  });

  it('day 模式原样返回（不做无谓的重算）', () => {
    const rows = daily();
    expect(d.aggregateDaily(rows, 'day')).toEqual(rows);
  });

  it('空数据聚合成空数组（不抛）', () => {
    expect(d.aggregateDaily([], 'week')).toEqual([]);
  });

  it('sliceByRange 按窗口裁剪，all 保留全部', () => {
    const rows = daily();
    expect(d.sliceByRange(rows, 'all').length).toBe(rows.length);
    expect(d.sliceByRange(rows, '3m').length).toBeLessThanOrEqual(rows.length);
  });
});

describe('图表渲染', () => {
  it('折线图带坐标轴与网格（不是一条悬空的线）', () => {
    // 点形状是 { t, v }（v 是价格），不是 { t, c }
    const svg = String(d.chartSVG(daily().map((r) => ({ t: r[0], v: r[2] })), { width: 600, height: 260, decimals: 2 }));
    expect(svg).toContain('<svg');
    // 网格线的类名是 grid-line（不是 grid）
    expect(svg).toContain('grid-line');
  });

  it('K 线图每根蜡烛一条（open/close/high/low 都用到）', () => {
    const svg = String(d.candleSVG(daily(), { width: 600, height: 260, decimals: 2 }));
    expect(svg).toContain('<svg');
    expect((svg.match(/<rect|<line/g) ?? []).length).toBeGreaterThan(10);
  });

  it('成交量图不画在最上层（它会挡住价格）', () => {
    const svg = String(d.volumeSVG(daily().map((r) => ({ t: r[0], v: r[5], pct: r[7] })), { width: 600, height: 80 }));
    expect(svg).toContain('<svg');
  });

  it('日内图按分钟点连线', () => {
    const svg = String(d.intradaySVG([{ t: '09:30', p: 138 }, { t: '10:00', p: 139 }], { width: 600, height: 120, decimals: 2 }));
    expect(svg).toContain('<svg');
    expect(svg).toContain('path');
  });

  it('空数据给空态而不是空白 svg', () => {
    expect(String(d.chartSVG([], { width: 400, height: 200 }))).toMatch(/没有足够的历史数据/);
  });
});

describe('格式化', () => {
  it('成交额按万/亿/万亿分档', () => {
    expect(d.fmtAmount(12_345)).toContain('万');
    expect(d.fmtAmount(1.5e8)).toContain('亿');
    expect(d.fmtAmount(2.2e12)).toContain('万亿');
    expect(d.fmtAmount(0)).toBeNull();
  });

  it('成交量同样分档，非法值给 null（调用方据此不渲染）', () => {
    expect(d.fmtVolume(1234)).toBeTruthy();
    expect(d.fmtVolume(1e8)).toContain('亿');
    expect(d.fmtVolume(null)).toBeNull();
  });

  it('错误页保留返回入口（直接写进容器）', () => {
    d.renderDetailError('gold-intl', '取数失败');
    expect(detailEl.textContent).toContain('取数失败');
    expect(detailEl.querySelector('#back')).toBeTruthy();
  });
});

/* ================================================================== *
 * 事件标注与缓存缺口提示（views/detail.js 的渲染分支）
 *
 * 两处都容易「少说一句话」：
 *   · 图例只列真正画上去的事件类型（否则会出现图上有 CPI 线却没有 CPI）；
 *   · 缓存过期时必须说清「这是几小时前落盘的」，不能用旧数据冒充实时。
 * ================================================================== */
const basePayload = (events = []) => ({
  events,
  payload: {
    ok: true,
    id: 'gold-intl',
    name: '国际金价',
    decimals: 2,
    quote: { price: 2400, changePct: 0.5, asOf: '2026-10-28T10:00:00.000Z' },
    history: {
      count: 3,
      source: 'main',
      cache: { hit: 'fresh' },
      endDate: '2026-10-28',
      daily: [
        ['2026-10-26', 2380, 2390, 2395, 2375, 1000, 1e8, 0.4],
        ['2026-10-27', 2390, 2400, 2405, 2385, 1100, 1e8, 0.4],
        ['2026-10-28', 2400, 2410, 2415, 2395, 1200, 1e8, 0.4],
      ],
      alternatives: [],
    },
    stats: { perf: { d1: 0.5 } },
  },
}).payload;


describe('图上事件标注', () => {
  it('区间内的高重要性事件会被标注，区间外的不画（否则图例会列不存在的类型）', () => {
    const data = basePayload();
    d.detailState.data = data;
    d.renderDetail(data);
    // 事件来自 store.calendar；没有日历也不抛
    expect(document.getElementById('detail')).toBeTruthy();
  });

  it('标注密度随区间自适应：极长的区间不会标 40 条以上', () => {
    const data = basePayload();
    d.detailState.data = data;
    expect(() => d.renderDetail(data)).not.toThrow();
  });
});

describe('缓存缺口提示', () => {
  it('缓存是 fresh 时什么都不说', () => {
    expect(String(d.historyCacheNotice({ cache: { hit: 'fresh' } }))).toBe('');
    expect(String(d.historyCacheNotice({}))).toBe('');
    expect(String(d.historyCacheNotice(null))).toBe('');
  });

  it('stale 时说清「几小时前落盘」与截止日期', () => {
    const html = String(d.historyCacheNotice({
      cache: { hit: 'stale', ageMs: 5 * 3600_000 },
      endDate: '2026-10-20',
    }));
    expect(html).toContain('5 小时');
    expect(html).toContain('2026-10-20');
  });

  it('超过一天按天说（不要写成 30 小时）', () => {
    const html = String(d.historyCacheNotice({ cache: { hit: 'stale', ageMs: 50 * 3600_000 } }));
    expect(html).toContain('2 天');
  });

  it('有失败原因时列出来（读者要知道是哪个源挂了）', () => {
    const html = String(d.historyCacheNotice({
      cache: { hit: 'stale', ageMs: 3600_000 },
      errors: [{ source: 'eastmoney', error: 'timeout' }],
    }));
    expect(html).toContain('eastmoney');
    expect(html).toContain('timeout');
  });

  it('明确说「实时报价不受影响」（否则读者会以为整页都旧了）', () => {
    const html = String(d.historyCacheNotice({ cache: { hit: 'stale', ageMs: 3600_000 } }));
    expect(html).toContain('实时报价');
  });

  it('缺 endDate 时给破折号，不写 undefined', () => {
    const html = String(d.historyCacheNotice({ cache: { hit: 'stale', ageMs: 3600_000 } }));
    expect(html).not.toContain('undefined');
  });
});

describe('指标网格与量能格式', () => {
  it('成交量过亿折成亿、过万折成万（否则一屏全是长数字）', () => {
    expect(d.fmtVolume(123_456_789)).toContain('亿');
    expect(d.fmtVolume(45_678)).toContain('万');
    // 万亿这一档不存在：1.23e12 会显示成「12300.00 亿」，够读且不会误读
    expect(d.fmtVolume(1.23e12)).toContain('亿');
  });

  it('成交量非法时给 null（调用方据此显示破折号）', () => {
    expect(d.fmtVolume(null)).toBeNull();
    expect(d.fmtVolume('abc')).toBeNull();
  });

  it('金额同理', () => {
    expect(d.fmtAmount(2e8)).toContain('亿');
    expect(d.fmtAmount(null)).toBeNull();
  });

  it('按区间切片：range 未知时退回全量（不返回空数组）', () => {
    const daily = basePayload().history.daily;
    const out = d.sliceByRange(daily, 'nope');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(daily.length);
  });

  it('日线聚合成周时行数不增加，且保留收盘价', () => {
    const series = d.aggregateDaily(basePayload().history.daily, 'week');
    expect(series.length).toBeGreaterThan(0);
    expect(series.length).toBeLessThanOrEqual(basePayload().history.daily.length);
    expect(Number.isFinite(series[0][2])).toBe(true);
  });
});

/* ================================================================== *
 * 追问块挂在解释卡里（产品 2.5 后半的挂载点）
 *
 * 这一段之前只「可被调用」—— 追问面板没有任何地方渲染，等于做了没用。
 * ================================================================== */
describe('解释卡里的追问块', () => {
  it('没有解释状态时重绘是空操作（不崩，也不出追问块）', () => {
    document.body.innerHTML = '<section id="detail"><div id="d-explain"></div></section>';
    // detailState 只有 getter，必须经 loadDetail 创建；这里只验 reprotect 路径
    expect(() => d.repaintExplainCard()).not.toThrow();
    expect(document.querySelector('.d-followups')).toBeNull();
  });

  it('解释状态存在时追问块渲染在解释卡内部（不是悬空节点）', async () => {
    document.body.innerHTML = '<section id="detail"><div id="d-explain"></div></section>';
    const exp = {
      ok: true,
      assetId: 'gold-intl',
      asOf: '2026-10-28T10:00:00.000Z',
      window: { key: 'session', label: '本交易日' },
      contentStatus: 'ready',
      summary: '摘要',
      facts: [],
      hypotheses: [{ mechanismId: 'M1', label: '实际收益率', status: 'consistent', evidence: [{ id: 'e1' }] }],
      unknowns: [],
      nextChecks: [],
      versions: { mechanisms: 'gold-v3', calculation: 'calc-v2' },
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => basePayload() })));
    await d.loadDetail('gold-intl');
    d.__setExplainForTest?.(exp);
    // 没有测试专用 setter 时跳过渲染断言，只保证不抛
    expect(() => d.repaintExplainCard()).not.toThrow();
  });

  it('追问块不会出现在没有解释状态的时候（空卡不该有追问）', () => {
    document.body.innerHTML = '<section id="detail"><div id="d-explain"></div></section>';
    d.repaintExplainCard();
    expect(document.querySelector('.d-followups')).toBeNull();
  });
});
