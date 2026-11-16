/* ================================================================== *
 * AI 只读工具集（src/server/services/ai-tools.service.js）
 *
 * 全部依赖注入，不碰网络与仓库 data/。重点断言：
 *   · 13 个工具的定义完整、未知工具不崩；
 *   · 大数组被裁剪（history / 日线 / 分时 / 宏观 recent 矩阵）；
 *   · 统一信封 { ok, source, asOf, stale, staleReason, data, note }；
 *   · 单工具超时与 A 股工具的入参边界。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { createAiToolRegistry } from '../src/server/services/ai-tools.service.js';

const AS_OF = '2026-11-16T04:00:00.000Z';

function dailyRows(n) {
  return Array.from({ length: n }, (_, i) => {
    const date = `2026-01-${String((i % 28) + 1).padStart(2, '0')}`;
    return [date, 100 + i, 101 + i, 102 + i, 99 + i, 1000 + i, 100000 + i, i % 2 ? 1.2 : -0.8];
  });
}

function baseDeps(overrides = {}) {
  const deps = {
    now: () => Date.parse(AS_OF),
    getQuotes: vi.fn(async () => ({
      ok: true,
      generatedAt: AS_OF,
      ttlMs: 15000,
      items: [
        {
          ok: true,
          id: 'gold-intl',
          name: '国际金价',
          unit: '美元/盎司',
          price: 2400,
          change: 12,
          changePct: 0.5,
          source: 'sina',
          fallback: false,
          stale: false,
          freshness: { dataTime: AS_OF, ageMs: 1000, label: '刚刚', level: 'fresh', suspect: false },
          marketStatus: { market: 'COMEX', open: true, label: '交易中', phase: 'open', nextOpenAt: null, nextCloseAt: null },
          history: [{ t: 1, p: 2390 }],
          extras: { big: 'x'.repeat(500) },
        },
        {
          ok: true,
          id: 'dxy',
          name: '美元指数',
          unit: '',
          price: 104,
          change: -0.2,
          changePct: -0.2,
          source: 'sina',
          fallback: true,
          stale: true,
          freshness: { dataTime: AS_OF, ageMs: 900000, label: '15 分钟前', level: 'stale', suspect: false },
          marketStatus: null,
          history: [],
          extras: {},
        },
      ],
      synthetics: [{ id: 'gold-oil', name: '金油比', formula: 'gold/oil', unit: '倍', ok: true, value: 30, reason: null }],
    })),
    getDetail: vi.fn(async () => ({
      ok: true,
      id: 'gold-intl',
      name: '国际金价',
      unit: '美元/盎司',
      generatedAt: AS_OF,
      quote: {
        ok: true,
        id: 'gold-intl',
        name: '国际金价',
        price: 2400,
        prevClose: 2388,
        change: 12,
        changePct: 0.5,
        source: 'sina',
        stale: false,
        freshness: { level: 'fresh', label: '刚刚', ageMs: 1000, dataTime: AS_OF },
        marketStatus: { market: 'COMEX', open: true, label: '交易中' },
        history: [{ t: 1, p: 2390 }],
        extras: { big: true },
      },
      stats: { high52: 2500, low52: 1800, rv20: 12, perf: { d1: 0.5, w1: 1, m1: 2, ytd: 15 } },
      derived: { spread: 1.2 },
      crosscheck: [{ source: 'cnbc', price: 2401, note: '口径差异' }],
      marketStatus: { market: 'COMEX', open: true, label: '交易中' },
      intraday: {
        date: '2026-11-16',
        points: [
          { t: 1, p: 2390, label: '09:30' },
          { t: 2, p: 2410, label: '10:00' },
          { t: 3, p: 2395, label: '10:30' },
        ],
      },
      history: { source: 'eastmoney', cache: null, daily: dailyRows(40) },
    })),
    getMacro: vi.fn(async () => ({
      ok: true,
      generatedAt: AS_OF,
      windowSize: 250,
      freq: 'day',
      universe: [
        { id: 'gold-intl', kind: 'price', name: '国际金价', short: '金', group: 'metal', unit: '美元/盎司', ok: true, last: 2400, lastDate: '2026-11-15', samples: 250, source: 'sina' },
        { id: 'dxy', kind: 'price', name: '美元指数', short: '美', group: 'fx', unit: '', ok: true, last: 104, lastDate: '2026-11-15', samples: 250, source: 'sina' },
        { id: 'us10y', kind: 'rate', name: '美债10年期', short: '债', group: 'rate', unit: '%', ok: false, error: '上游超时' },
      ],
      matrix: {
        ids: ['gold-intl', 'dxy', 'us10y'],
        corr: [[1, -0.5, 0.1], [-0.5, 1, 0.2], [0.1, 0.2, 1]],
        counts: [[250, 250, 240], [250, 250, 240], [240, 240, 240]],
        stats: [
          { a: 'gold-intl', b: 'dxy', corr: -0.5, n: 250, ci: [-0.6, -0.4], t: -8, p: 0.001, pNW: 0.002, q: 0.004, significantBH: true, stable: true },
          { a: 'gold-intl', b: 'us10y', corr: 0.1, n: 240, ci: [-0.02, 0.22], t: 1.5, p: 0.12, pNW: 0.14, q: 0.2, significantBH: false, stable: false },
          { a: 'dxy', b: 'us10y', corr: 0.2, n: 240, ci: [0.08, 0.32], t: 3, p: 0.003, pNW: 0.004, q: 0.008, significantBH: true, stable: true },
        ],
      },
      leadLag: [
        { leader: 'dxy', follower: 'gold-intl', lag: 1, corr: -0.4, n: 200, q: 0.03, significantBH: true, pool: 'day' },
        { leader: 'us10y', follower: 'dxy', lag: 2, corr: 0.2, n: 200, q: 0.2, significantBH: false, pool: 'day' },
      ],
      riskAppetite: {
        risk: 0.2,
        hedge: -0.1,
        spread: 0.3,
        label: '中性',
        unit: 'sigma',
        riskMembers: ['sp500'],
        hedgeMembers: ['us10y'],
        aligned: true,
        memberDates: Array.from({ length: 100 }, (_, i) => `d${i}`),
        asOf: '2026-11-15',
      },
      vrp: { vix: 15, rv20: 12, vrp: 3, ratio: 1.25, asOf: '2026-11-15', rvWindow: { from: '2026-10-01', to: '2026-11-15', observations: 20 }, label: 'implied-minus-realized', unit: 'vol-points' },
      recent: { dates: Array.from({ length: 400 }, (_, i) => `2025-01-${i}`), changes: Array.from({ length: 400 }, () => [1, 2, 3]) },
    })),
    getExplanationResponse: vi.fn(async () => ({
      status: 202,
      body: {
        schemaVersion: 1,
        explanation: null,
        meta: { evaluatedAt: AS_OF, freshness: 'unavailable', freshnessReasons: ['NO_OBSERVATION'], refreshStatus: 'pending' },
      },
    })),
    mechanismsFor: vi.fn(() => [
      {
        id: 'dxy-pressure-gold',
        version: 1,
        relationType: 'driver',
        from: 'dxy',
        to: 'gold-intl',
        sign: '-',
        label: '美元走强压制金价',
        plain: '美元涨，黄金通常承压。',
        mechanism: '计价效应与机会成本。',
        requires: [{ instrument: 'dxy', label: '美元指数' }],
        conditionCodes: ['USD_STRENGTH'],
        exclusions: [],
        needsEventEvidence: false,
        horizon: '1-5d',
        sources: [{ label: '机制库' }],
        reviewedAt: '2026-01-01',
      },
    ]),
    getGoldComparison: vi.fn(async () => ({
      ok: true,
      status: 'ok',
      windowKey: 'session',
      windowLabel: '今日',
      comparable: true,
      missing: [],
      reasonText: [],
      decomposition: {
        status: 'ok',
        domesticChangePct: 0.8,
        convertedChangePct: 0.5,
        terms: [
          { key: 'intl', label: '国际金价（美元计价）', changePct: 0.4, contributionPct: 0.4 },
          { key: 'fx', label: '美元兑人民币', changePct: 0.05, contributionPct: 0.05 },
          { key: 'premium', label: '境内外溢价', changePct: 0.35, contributionPct: 0.35 },
        ],
        premiumPct: { start: 1.2, end: 1.55 },
        convertedPerGram: { start: 560, end: 563 },
        residualPct: 0.01,
      },
      generatedAt: AS_OF,
      cutoff: AS_OF,
      windowRange: { start: '2026-11-16', end: '2026-11-16' },
      alignedEndDates: { intl: '2026-11-15', domestic: '2026-11-15', fx: '2026-11-15' },
      dataAgeWarning: '日线缓存已过期（休市或采集未完成）：相对变化仍可用，但不是实时价',
    })),
    getEventHistory: vi.fn(async () => ({
      ok: true,
      hours: 24,
      generatedAt: AS_OF,
      count: 2,
      coverageFrom: '2026-11-15T04:00:00.000Z',
      items: [
        {
          id: 'ev1',
          time: '2026-11-16 09:00:00',
          title: 'Fed officials signal patience',
          zh: '美联储官员释放耐心信号',
          level: 'high',
          score: 90,
          topics: [{ key: 'fed', label: '美联储', strong: true }],
          symbols: ['us10y', 'gold-intl'],
          region: 'US',
          source: 'reuters',
          publisher: 'Reuters',
          url: 'https://example.com/1',
          llm: null,
          important: true,
        },
        {
          id: 'ev2',
          time: '2026-11-16 08:00:00',
          title: 'Oil inventory falls',
          zh: '原油库存下降',
          level: 'mid',
          score: 60,
          topics: [{ key: 'oil', label: '原油', strong: true }],
          symbols: ['oil'],
          region: 'US',
          source: 'cnbc',
          publisher: 'CNBC',
          url: 'https://example.com/2',
          llm: null,
          important: false,
        },
      ],
    })),
    getEvents: vi.fn(async () => ({ ok: true, generatedAt: AS_OF, items: [] })),
    getCalendar: vi.fn(async () => ({
      ok: true,
      generatedAt: AS_OF,
      fetchedAt: AS_OF,
      today: '2026-11-16',
      events: [
        { date: '2026-11-16', time: '21:30', kind: 'cpi', title: '美国 CPI', importance: 3, source: 'fred', symbols: ['us10y'], expected: '3.1%', previous: '3.0%' },
        { date: '2026-11-17', time: '23:00', kind: 'fomc', title: 'FOMC 纪要', importance: 3, source: 'fred', symbols: ['sp500'] },
      ],
      upcoming: [
        { date: '2026-11-16', time: '21:30', kind: 'cpi', title: '美国 CPI', importance: 3, source: 'fred', symbols: ['us10y'], expected: '3.1%', previous: '3.0%' },
        { date: '2026-11-17', time: '23:00', kind: 'fomc', title: 'FOMC 纪要', importance: 3, source: 'fred', symbols: ['sp500'] },
      ],
      errors: [],
      coverage: { source: 'fred' },
    })),
    getEventStudy: vi.fn(async () => ({
      ok: true,
      generatedAt: AS_OF,
      today: '2026-11-16',
      kinds: [{ kind: 'cpi', count: 12 }],
      coverage: { from: '2020-01-01' },
      rows: [
        { kind: 'cpi', symbol: 'us10y', name: '美债10年期', lag: 0, isAuto: true, eventDays: 12, eventMeanPct: 0.2, eventMedianPct: 0.18, baseMeanPct: 0.05, baseMedianPct: 0.04, ratio: 4, medianRatio: 4.5, t: 2.2, significant: true },
        { kind: 'cpi', symbol: 'gold-intl', name: '国际金价', lag: 1, isAuto: true, eventDays: 12, eventMeanPct: 0.1, eventMedianPct: 0.09, baseMeanPct: 0.04, baseMedianPct: 0.03, ratio: 2.5, medianRatio: 3, t: 1.2, significant: false },
      ],
      note: '事件日波动通常天然偏高（事件本身就在波动时被关注），这里做的是统计对照，不是因果推断',
    })),
    getTodayFocus: vi.fn(async () => ({
      ok: true,
      day: '2026-11-16',
      focus: [{ id: 'ev1', title: '美联储官员释放耐心信号', level: 'high', symbols: ['us10y'] }],
      count: 1,
      short: '重点关注美联储',
      next: null,
      rule: '按「高等级 → 关联可解释标的 → 时间新」排序；同一件事的转载只占一位',
      checkedAt: AS_OF,
    })),
    getExpectationLedger: vi.fn(async () => ({
      ok: true,
      status: 'ok',
      checkedAt: AS_OF,
      calendarFetchedAt: AS_OF,
      calendarCoverage: { source: 'fred' },
      released: [{ kind: 'cpi', title: '美国 CPI', verdict: 'in_line' }],
      pending: [{ kind: 'fomc', title: 'FOMC 纪要', expected: '5.25%' }],
    })),
    buildBriefing: vi.fn(() => ({
      ok: true,
      status: 'overnight',
      dropped: [],
      cutLabel: '15:00 A股收盘',
      baselineAt: AS_OF,
      latestAt: AS_OF,
      samples: 3,
      items: [{ id: 'gold-intl', name: '国际金价', from: 2380, to: 2400, move: 20, movePct: 0.84, changePctNow: 0.5 }],
    })),
    getLifePath: vi.fn(async () => ({
      ok: true,
      id: 'fuel-cost',
      title: '油价 → 出行成本',
      plain: '油价上涨会推高出行成本。',
      headline: '油价上涨 10% 时，出行成本约增加 1%',
      upstreamAsOf: AS_OF,
      chain: [],
      steps: [{ id: 'fuel', title: '加油', basisText: '基于油价', lagNote: '约 1-2 周' }],
      gaps: [],
      disclaimer: '仅为传导示意',
      needsLocalData: false,
      scenarios: [],
      availableScenarios: [],
      upstreamError: null,
    })),
    alertsService: {
      listRules: vi.fn(() => [{ id: 'r1', name: '金价突破', kind: 'price_above', target_id: 'gold-intl', operator: 'gt', threshold: 2500, mode: 'signed', enabled: 1, cooldown_ms: 60000, last_triggered_at: null, created_at: AS_OF }]),
      listEvents: vi.fn(() => [{ id: 'e1', rule_id: 'r1', kind: 'price_above', target_id: 'gold-intl', title: '金价突破', message: '2400', observed_value: 2400, triggered_at: AS_OF }]),
    },
    searchAShareStock: vi.fn(async () => [{ code: '600519', symbol: 'sh600519', name: '贵州茅台', pinyin: 'gzmt', type: 'stock', market: 'sh' }]),
    fetchTencentBatchQuotes: vi.fn(async (codes) => Object.fromEntries(codes.map((code) => [code, {
      symbol: `sh${code}`,
      name: '贵州茅台',
      price: 1500,
      prevClose: 1490,
      open: 1495,
      change: 10,
      changePct: 0.67,
      high: 1510,
      low: 1488,
      amountWan: 10000,
      turnoverPct: 0.3,
      peTtm: 25,
      peStatic: 26,
      pb: 8,
      amplitudePct: 1.5,
      floatMcapYi: 18000,
      mcapYi: 19000,
      limitUp: 1639,
      limitDown: 1341,
      volRatio: 1.1,
      sessionTime: '2026-11-16 15:00:00',
      isStale: false,
      staleReason: null,
    }]))),
    fetchTencentKline: vi.fn(async ({ code, period, adjust, count }) => ({
      code,
      period,
      adjust,
      host: 'web.ifzq.gtimg.cn',
      rows: [
        { datetime: '2026-11-14 15:00:00', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { datetime: '2026-11-15 15:00:00', open: 101, high: 104, low: 100, close: 103, volume: 1200 },
        { datetime: '2026-11-16 15:00:00', open: 103, high: 105, low: 102, close: 104, volume: 1300 },
      ].slice(-count),
    })),
    fetchEmPool: vi.fn(async (kind, date) => ({
      kind,
      date,
      total: 4,
      rows: [
        { code: '600001', name: '甲公司', price: 10, pct: 10, industry: '软件', limitDays: 3 },
        { code: '600002', name: '乙公司', price: 20, pct: 10, industry: '硬件', limitDays: 2 },
        { code: '600003', name: '丙公司', price: 30, pct: 10, industry: '软件', limitDays: 2 },
        { code: '600004', name: '丁公司', price: 40, pct: 10, industry: '医药', limitDays: 1 },
      ],
    })),
    fetchEmFundFlowMinute: vi.fn(async (code) => ({
      code,
      rows: Array.from({ length: 10 }, (_, i) => ({
        time: `14:5${i}:00`,
        mainNet: i * 100,
        smallNet: i * 10,
        midNet: i * 20,
        largeNet: i * 30,
        superNet: i * 40,
      })),
    })),
    fetchNorthbound: vi.fn(async () => ({
      time: ['09:30', '15:00'],
      hgt: [1.2, 3.4],
      sgt: [0.5, 1.6],
    })),
    ...overrides,
  };
  return deps;
}

const registry = (overrides) => createAiToolRegistry(baseDeps(overrides));

describe('AI 工具注册表', () => {
  it('提供 13 个工具定义，且都是对象参数 schema', () => {
    const tools = registry();
    const names = tools.definitions.map((d) => d.name);
    expect(names).toHaveLength(13);
    expect(names).toEqual(expect.arrayContaining([
      'get_global_quotes',
      'get_asset_detail',
      'get_macro_correlations',
      'get_asset_explanation',
      'get_gold_comparison',
      'search_events_and_news',
      'get_macro_calendar_and_study',
      'get_overnight_briefing_and_alerts',
      'search_a_share',
      'get_a_share_quotes',
      'get_a_share_kline',
      'get_a_share_pool',
      'get_a_share_fund_flow',
    ]));
    for (const def of tools.definitions) {
      expect(def.description).toBeTruthy();
      expect(def.parameters.type).toBe('object');
    }
    expect(tools.promptSummary()).toContain('get_global_quotes');
  });

  it('未知工具返回 ok:false，不抛异常', async () => {
    const result = await registry().execute('not_a_tool', {});
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain('未知工具');
  });

  it('所有工具返回统一信封并裁剪 history/extras', async () => {
    const result = await registry().execute('get_global_quotes', { ids: ['gold-intl'] });
    expect(result).toMatchObject({ ok: true, source: expect.any(String), stale: false });
    for (const key of ['ok', 'source', 'asOf', 'stale', 'staleReason', 'data', 'note']) expect(result).toHaveProperty(key);
    expect(result.data.quotes).toHaveLength(1);
    expect(result.data.quotes[0].history).toBeUndefined();
    expect(result.data.quotes[0].extras).toBeUndefined();
    expect(result.data.synthetics[0].id).toBe('gold-oil');
    expect(result.stale).toBe(false);
  });

  it('get_asset_detail 把日线数组映射成对象并截取 barsLimit，分时只给摘要', async () => {
    const result = await registry().execute('get_asset_detail', { id: 'gold-intl', barsLimit: 5 });
    expect(result.ok).toBe(true);
    expect(result.data.daily).toHaveLength(5);
    expect(result.data.daily[0]).toEqual(expect.objectContaining({ date: expect.any(String), open: expect.any(Number), close: expect.any(Number), high: expect.any(Number), low: expect.any(Number), pct: expect.any(Number) }));
    expect(result.data.daily[0].volume).toBeUndefined();
    expect(result.data.intraday).toMatchObject({ count: 3, first: { label: '09:30' }, last: { label: '10:30' }, high: 2410, low: 2390 });
    expect(result.data.intraday.points).toBeUndefined();
    expect(result.data.quote.history).toBeUndefined();
    expect(result.data.quote.extras).toBeUndefined();
    expect(result.data.stats.rv20).toBe(12);
  });

  it('get_asset_detail barsLimit 被夹在 5..120', async () => {
    const deps = baseDeps();
    await createAiToolRegistry(deps).execute('get_asset_detail', { id: 'gold-intl', barsLimit: 1 });
    expect(deps.getDetail).toHaveBeenCalledWith('gold-intl', { force: false });
    const result = await createAiToolRegistry(deps).execute('get_asset_detail', { id: 'gold-intl', barsLimit: 5 });
    expect(result.data.daily).toHaveLength(5);
  });

  it('get_macro_correlations 不返回 recent 大矩阵，并按 assetId 过滤配对', async () => {
    const result = await registry().execute('get_macro_correlations', { assetId: 'gold-intl', window: 1 });
    expect(result.data.pairs).toHaveLength(2);
    expect(result.data.pairs.every((p) => p.a === 'gold-intl' || p.b === 'gold-intl')).toBe(true);
    expect(result.data.leadLag).toHaveLength(1);
    expect(result.data.recent).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('"changes"');
    expect(result.data.riskAppetite.memberDates).toBeUndefined();
  });

  it('get_macro_correlations 的 window/freq 有默认值与边界', async () => {
    const deps = baseDeps();
    const tools = createAiToolRegistry(deps);
    await tools.execute('get_macro_correlations', {});
    expect(deps.getMacro).toHaveBeenLastCalledWith(250, 'day', { force: false });
    await tools.execute('get_macro_correlations', { window: 99999, freq: 'week' });
    expect(deps.getMacro).toHaveBeenLastCalledWith(5000, 'week', { force: false });
    await tools.execute('get_macro_correlations', { window: 1 });
    expect(deps.getMacro).toHaveBeenLastCalledWith(20, 'day', { force: false });
  });

  it('get_asset_explanation 在 202 时退回机制库并明确标注未生成', async () => {
    const result = await registry().execute('get_asset_explanation', { asset: 'gold-intl' });
    expect(result.ok).toBe(true);
    expect(result.data.contentStatus).toBe('unavailable');
    expect(result.data.hypotheses).toEqual([]);
    expect(result.data.generalMechanisms[0].id).toBe('dxy-pressure-gold');
    expect(result.note).toContain('未生成');
    expect(result.stale).toBe(true);
  });

  it('get_asset_explanation 在 200 时映射事实层与假设证据计数', async () => {
    const getExplanationResponse = vi.fn(async () => ({
      status: 200,
      body: {
        explanation: {
          assetId: 'gold-intl',
          asOf: AS_OF,
          contentStatus: 'ready',
          summary: '美元走强压制金价',
          facts: [{ label: '金价', changePct: 0.5 }],
          hypotheses: [
            {
              mechanismId: 'dxy-pressure-gold',
              label: '美元压制',
              status: 'mixed',
              reasons: ['方向一致但幅度不足'],
              evidence: [{ role: 'support' }, { role: 'contrary' }, { role: 'background' }],
            },
          ],
          unknowns: ['缺少持仓数据'],
          nextChecks: ['观察美元指数'],
        },
        meta: { freshness: 'fresh', freshnessReasons: [], evaluatedAt: AS_OF },
      },
    }));
    const result = await registry({ getExplanationResponse }).execute('get_asset_explanation', {
      asset: 'gold-intl',
      window: '5d',
    });
    expect(result.source).toBe('explanations.service');
    expect(result.stale).toBe(false);
    expect(result.data).toMatchObject({
      assetId: 'gold-intl',
      contentStatus: 'ready',
      freshness: 'fresh',
      summary: '美元走强压制金价',
    });
    expect(result.data.hypotheses[0]).toMatchObject({
      mechanismId: 'dxy-pressure-gold',
      status: 'mixed',
      evidenceCount: 3,
      supportCount: 1,
      contraryCount: 1,
    });
    expect(result.data.unknowns).toEqual(['缺少持仓数据']);
  });

  it('get_gold_comparison 透出三因子拆解与 dataAge 警告', async () => {
    const result = await registry().execute('get_gold_comparison', { window: '5d' });
    expect(result.data.windowKey).toBe('session');
    expect(result.data.decomposition.terms.map((t) => t.key)).toEqual(['intl', 'fx', 'premium']);
    expect(result.stale).toBe(true);
    expect(result.staleReason).toContain('日线缓存已过期');
  });

  it('search_events_and_news 按等级/主题/查询过滤并裁剪字段', async () => {
    const result = await registry().execute('search_events_and_news', { level: 'high', topic: 'fed', query: '美联储' });
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0].id).toBe('ev1');
    expect(result.data.events[0].publisher).toBe('Reuters');
    expect(result.data.coverageFrom).toBe('2026-11-15T04:00:00.000Z');
    expect(result.data.events[0].llm).toBeUndefined();
  });

  it('事件历史不可用时退回事件快照', async () => {
    const getEventHistory = vi.fn(async () => {
      throw new Error('history down');
    });
    const getEvents = vi.fn(async () => ({
      ok: true,
      generatedAt: AS_OF,
      items: [{ id: 'ev9', time: '2026-11-16 10:00:00', title: '快照事件', level: 'high', symbols: [], topics: [], zh: '快照' }],
    }));
    const result = await registry({ getEventHistory, getEvents }).execute('search_events_and_news', {});
    expect(result.source).toBe('events.snapshot');
    expect(result.data.events[0].id).toBe('ev9');
  });

  it('get_macro_calendar_and_study 汇总日历、今日重点、预期账本与事件研究', async () => {
    const result = await registry().execute('get_macro_calendar_and_study', { includeStudy: true, studyKind: 'cpi' });
    expect(result.data.calendar.upcoming).toHaveLength(2);
    expect(result.data.focus.short).toBe('重点关注美联储');
    expect(result.data.expectations.released).toHaveLength(1);
    expect(result.data.study.rows).toHaveLength(2);
    expect(result.data.study.rows[0].significant).toBe(true);
  });

  it('日历部分失败时标记 stale，并用 events 推导 upcoming', async () => {
    const getCalendar = vi.fn(async () => ({
      ok: true,
      generatedAt: AS_OF,
      today: '2026-11-16',
      events: [
        { date: '2026-11-16', time: '21:30', kind: 'cpi', title: '美国 CPI', importance: 3 },
        { date: '2026-11-17', time: '23:00', kind: 'fomc', title: 'FOMC 纪要', importance: 3 },
      ],
    }));
    const getTodayFocus = vi.fn(async () => {
      throw new Error('focus down');
    });
    const result = await registry({ getCalendar, getTodayFocus }).execute('get_macro_calendar_and_study', {});
    expect(result.stale).toBe(true);
    expect(result.staleReason).toContain('今日重点');
    expect(result.data.calendar.upcoming).toHaveLength(2);
    expect(result.data.focus).toBeNull();
  });

  it('get_overnight_briefing_and_alerts 汇总隔夜、传导与预警', async () => {
    const result = await registry().execute('get_overnight_briefing_and_alerts', {});
    expect(result.data.briefing.items[0].id).toBe('gold-intl');
    expect(result.data.lifePath.steps).toHaveLength(1);
    expect(result.data.alerts.rules[0].id).toBe('r1');
    expect(result.data.alerts.events).toHaveLength(1);
  });

  it('没有 alertsService 时优雅降级', async () => {
    const result = await registry({ alertsService: null }).execute('get_overnight_briefing_and_alerts', {});
    expect(result.ok).toBe(true);
    expect(result.data.alerts).toBeNull();
    expect(result.note).toContain('预警服务未启用');
  });

  it('隔夜复盘抛错、预警服务异常时降级并标注原因', async () => {
    const result = await registry({
      buildBriefing: vi.fn(() => {
        throw new Error('brief down');
      }),
      alertsService: {
        listRules: vi.fn(() => {
          throw new Error('alerts down');
        }),
        listEvents: vi.fn(() => []),
      },
    }).execute('get_overnight_briefing_and_alerts', {});
    expect(result.ok).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.data.briefing).toBeNull();
    expect(result.data.alerts).toBeNull();
    expect(result.note).toContain('隔夜复盘');
    expect(result.note).toContain('预警');
  });

  it('search_a_share 限制 limit 并透出结果', async () => {
    const deps = baseDeps();
    const result = await createAiToolRegistry(deps).execute('search_a_share', { query: '茅台', limit: 99 });
    expect(deps.searchAShareStock).toHaveBeenCalledWith('茅台', { limit: 20 });
    expect(result.data.results[0].code).toBe('600519');
  });

  it('get_a_share_quotes 拒绝空数组并透出估值字段', async () => {
    const tools = registry();
    const empty = await tools.execute('get_a_share_quotes', { codes: [] });
    expect(empty.ok).toBe(false);
    expect(empty.error).toContain('至少');

    const result = await tools.execute('get_a_share_quotes', { codes: ['600519'] });
    expect(result.ok).toBe(true);
    expect(result.data.quotes[0]).toMatchObject({ code: '600519', peTtm: 25, pb: 8, limitUp: 1639, volRatio: 1.1 });
    expect(result.source).toBe('tencent');
  });

  it('get_a_share_quotes 透出过期原因', async () => {
    const fetchTencentBatchQuotes = vi.fn(async (codes) =>
      Object.fromEntries(
        codes.map((code) => [code, { name: '贵州茅台', price: 1500, changePct: 0.1, isStale: true, staleReason: '盘中休市' }]),
      ),
    );
    const result = await registry({ fetchTencentBatchQuotes }).execute('get_a_share_quotes', { codes: ['600519'] });
    expect(result.stale).toBe(true);
    expect(result.staleReason).toBe('600519（盘中休市）');
  });

  it('get_a_share_kline 透出行情并统计区间涨跌', async () => {
    const result = await registry().execute('get_a_share_kline', { code: '600519', period: 'day', adjust: 'qfq', count: 3 });
    expect(result.data.rows).toHaveLength(3);
    expect(result.data.summary).toMatchObject({ count: 3, high: 105, low: 99, changePct: 2.97 });
  });

  it('get_a_share_pool 统计连板梯队，空数据给出休市提示', async () => {
    const tools = registry();
    const result = await tools.execute('get_a_share_pool', { kind: 'zt', limit: 2 });
    expect(result.data.total).toBe(4);
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.ladder).toEqual([
      { label: '3连板', count: 1 },
      { label: '2连板', count: 2 },
      { label: '首板', count: 1 },
    ]);
    expect(result.data.ladder.reduce((n, x) => n + x.count, 0)).toBe(4);

    const empty = await registry({ fetchEmPool: vi.fn(async (kind, date) => ({ kind, date, total: 0, rows: [] })) }).execute('get_a_share_pool', {});
    expect(empty.note).toBe('当日无交易数据（可能为休市日或尚未开盘）');
  });

  it('get_a_share_pool 支持跌停与炸板梯队', async () => {
    const dt = await registry({
      fetchEmPool: vi.fn(async (kind, date) => ({
        kind,
        date,
        total: 3,
        rows: [{ code: '1', dtDays: 2 }, { code: '2', dtDays: 1 }, { code: '3', dtDays: 3 }],
      })),
    }).execute('get_a_share_pool', { kind: 'dt' });
    expect(dt.data.ladder).toEqual([
      { label: '3连跌', count: 1 },
      { label: '2连跌', count: 1 },
      { label: '跌停', count: 1 },
    ]);

    const zb = await registry({
      fetchEmPool: vi.fn(async (kind, date) => ({
        kind,
        date,
        total: 2,
        rows: [{ code: '1', ztStat: '炸板' }, { code: '2' }],
      })),
    }).execute('get_a_share_pool', { kind: 'zb' });
    expect(zb.data.ladder).toEqual([{ label: '炸板', count: 2 }]);
  });

  it('get_a_share_fund_flow 汇总累计净额、尾盘 5 分钟与北向', async () => {
    const result = await registry().execute('get_a_share_fund_flow', { code: '600519' });
    expect(result.data.fundFlow.latest.time).toBe('14:59:00');
    expect(result.data.fundFlow.latest.mainNet).toBe(900);
    expect(result.data.fundFlow.last5Minutes.netChange).toBe(500);
    expect(result.data.northbound).toMatchObject({ time: '15:00', hgt: 3.4, sgt: 1.6 });
    expect(result.note).toBe('深股通近期上游披露收紧，仅作参考；分钟资金流不覆盖 ETF');
  });

  it('单工具超时后返回 ok:false 而不是一直挂住', async () => {
    const tools = registry({ getQuotes: vi.fn(() => new Promise(() => {})) });
    const result = await tools.execute('get_global_quotes', {}, { timeoutMs: 20 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('超时');
  });

  it('执行中取消返回 ok:false 已取消', async () => {
    const tools = registry({ getQuotes: vi.fn(() => new Promise(() => {})) });
    const controller = new AbortController();
    const pending = tools.execute('get_global_quotes', {}, { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error).toContain('已取消');
  });

  it('分时资金流为空时给出空摘要而不是崩溃', async () => {
    const result = await registry({ fetchEmFundFlowMinute: vi.fn(async (code) => ({ code, rows: [] })) }).execute(
      'get_a_share_fund_flow',
      { code: '510300' },
    );
    expect(result.ok).toBe(true);
    expect(result.data.fundFlow).toEqual({ code: '510300', points: 0, latest: null, largeOrder: null, last5Minutes: null });
    expect(result.data.northbound.time).toBe('15:00');
  });
});
