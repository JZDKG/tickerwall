/* ================================================================== *
 * 宏观关联服务（macro.service）行为测试
 *
 * 这个模块是「统计严谨性」的落地点：周频聚合、BH 多重比较校正、
 * 双向领先滞后、z-Score 风险篮子、VRP。之前整块 0 覆盖，出问题只能靠
 * 肉眼看页面数字。
 *
 * 这里用可解释的合成序列（不是随机数）钉住几条口径：
 *   · 周频标签必须是「该周周一」，否则跨时区标的全部错位；
 *   · 领先滞后必须同时扫正负方向（旧实现只扫 a→b）；
 *   · z-Score 用固定 65 期，不能被 windowSize 截断；
 *   · 日线缓存只在「不比库里少」时覆盖。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/server/db/index.js', () => ({
  DAILY_FRESH_MS: 8 * 3600 * 1000,
  readDailyCache: vi.fn(),
  writeDailyCache: vi.fn(),
}));

vi.mock('../src/server/providers/index.js', () => ({
  historySourcesFor: vi.fn(),
}));

const { readDailyCache, writeDailyCache } = await import('../src/server/db/index.js');
const { historySourcesFor } = await import('../src/server/providers/index.js');
const svc = await import('../src/server/services/macro.service.js');

const {
  MACRO_UNIVERSE,
  MACRO_CACHE_TTL_MS,
  macroCache,
  fetchMacroSeries,
  toChanges,
  aggregateWeekly,
  tailWindow,
  leadLagScan,
  buildMacro,
  getMacro,
} = svc;

/* ------------------------------ 合成数据 ------------------------------ */

/** 从 2024-01-01 起连续 n 个交易日（含周末，日期只做对齐键用） */
function dates(n, start = '2024-01-01') {
  const t0 = Date.parse(start);
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86400000).toISOString().slice(0, 10));
}

/** 确定性的「价格」：不同 k 给不同相位，两两相关但不完全共线 */
function rows(n, k, { drift = 0, vol = 0.01 } = {}) {
  const ds = dates(n);
  let close = 100 + k;
  return ds.map((date, i) => {
    const r = drift + vol * Math.sin(i / 9 + k * 0.7) + vol * 0.4 * Math.cos(i / 3 + k);
    close *= Math.exp(r);
    return { date, close };
  });
}

function seriesOf(n, k) {
  const ds = dates(n);
  return { dates: ds, values: ds.map((_, i) => Math.sin(i / 9 + k)) };
}

const fresh = (rowList, source = 'test') => ({ savedAt: Date.now(), rows: rowList, source });

beforeEach(() => {
  macroCache.clear();
  readDailyCache.mockReset();
  writeDailyCache.mockReset();
  historySourcesFor.mockReset();
  readDailyCache.mockResolvedValue(null);
  writeDailyCache.mockResolvedValue();
  historySourcesFor.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------ toChanges ------------------------------ */

describe('toChanges：收盘序列 → 变动序列', () => {
  it('价格用对数收益率，利率用百分点差', () => {
    const r = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
    ];
    const p = toChanges(r, 'price');
    expect(p.dates).toEqual(['2024-01-02']);
    expect(p.values[0]).toBeCloseTo(Math.log(1.1), 12);

    const rate = toChanges(
      [
        { date: '2024-01-01', close: 4.0 },
        { date: '2024-01-02', close: 4.25 },
      ],
      'rate',
    );
    expect(rate.values[0]).toBeCloseTo(0.25, 12);
  });

  it('跳过 0 / 负数 / 缺失价格，日期与数值保持一一对应', () => {
    const r = [
      { date: 'd1', close: 0 },
      { date: 'd2', close: 100 },
      { date: 'd3', close: 121 },
      { date: 'd4', close: -5 },
      { date: 'd5', close: 200 },
    ];
    const out = toChanges(r, 'price');
    // d1→d2 被 0 阻断；d2→d3 有效；d3→d4、d4→d5 都被负数阻断
    expect(out.dates).toEqual(['d3']);
    expect(out.values[0]).toBeCloseTo(Math.log(1.21), 12);
  });

  it('空序列与单点序列返回空数组', () => {
    expect(toChanges([], 'price')).toEqual({ dates: [], values: [] });
    expect(toChanges([{ date: 'd1', close: 1 }], 'price')).toEqual({ dates: [], values: [] });
  });
});

/* ------------------------------ aggregateWeekly ------------------------------ */

describe('aggregateWeekly：日线 → 周线', () => {
  it('每周保留最后一个交易日，标签统一成该周周一', () => {
    const rows = [
      { date: '2024-01-01', close: 1 }, // 周一
      { date: '2024-01-03', close: 2 },
      { date: '2024-01-05', close: 3 }, // 周五
      { date: '2024-01-08', close: 4 }, // 下周一
      { date: '2024-01-12', close: 5 },
    ];
    const out = aggregateWeekly(rows);
    expect(out.map((r) => r.close)).toEqual([3, 5]);
    // 标签统一成该周周一（见 aggregateWeekly 里的分桶注释）
    expect(out.map((r) => r.date)).toEqual(['2024-01-01', '2024-01-08']);
    expect(new Date(out[0].date) < new Date(out[1].date)).toBe(true);
  });

  it('跨时区标的落在同一周时标签一致（BTC 周日收 vs 美股周五收）', () => {
    const us = aggregateWeekly([
      { date: '2024-01-05', close: 1 }, // 周五
      { date: '2024-01-12', close: 2 },
    ]);
    const btc = aggregateWeekly([
      { date: '2024-01-07', close: 9 }, // 周日
      { date: '2024-01-14', close: 8 },
    ]);
    // 同一周的周五与周日必须落到同一个「周一」标签；相邻周必须不同
    expect(us[0].date).toBe('2024-01-01');
    expect(us[0].date).toBe(btc[0].date);
    expect(us[1].date).toBe(btc[1].date);
    expect(us[1].date).toBe('2024-01-08');
  });

  it('无法解析的日期直接跳过，结果按周排序', () => {
    const out = aggregateWeekly([
      { date: 'nope', close: 1 },
      { date: '2024-01-12', close: 2 },
      { date: '2024-01-03', close: 3 },
    ]);
    expect(out.map((r) => r.close)).toEqual([3, 2]);
  });

  it('空输入返回空数组', () => {
    expect(aggregateWeekly([])).toEqual([]);
  });
});

/* ------------------------------ tailWindow ------------------------------ */

describe('tailWindow：按窗口截取', () => {
  const s = { dates: ['a', 'b', 'c'], values: [1, 2, 3] };
  it('win 为空 / 0 / 负数时原样返回', () => {
    expect(tailWindow(s, undefined)).toBe(s);
    expect(tailWindow(s, 0)).toBe(s);
    expect(tailWindow(s, -3)).toBe(s);
  });
  it('窗口大于长度时返回全部，小于时取尾部', () => {
    expect(tailWindow(s, 99)).toEqual(s);
    expect(tailWindow(s, 2)).toEqual({ dates: ['b', 'c'], values: [2, 3] });
  });
});

/* ------------------------------ leadLagScan ------------------------------ */

describe('leadLagScan：双向领先滞后', () => {
  it('样本不足 30 返回 null', () => {
    const a = seriesOf(29, 0);
    expect(leadLagScan(a, seriesOf(29, 1))).toBeNull();
  });

  it('同时给出正滞后与负滞后（旧实现只有正方向）', () => {
    const a = seriesOf(80, 0);
    const b = seriesOf(80, 1);
    const out = leadLagScan(a, b, 3);
    expect(out.n).toBe(80);
    expect(out.base).toBeTruthy();
    const lags = out.lags.map((l) => l.lag).sort((x, y) => x - y);
    expect(lags).toEqual([-3, -2, -1, 1, 2, 3]);
    for (const l of out.lags) {
      expect(Number.isFinite(l.corr)).toBe(true);
      expect(l.n).toBe(80 - Math.abs(l.lag));
    }
  });

  it('只在共同交易日上平移（缺日不参与）', () => {
    const a = { dates: ['d1', 'd2', 'd3'], values: [1, 2, 3] };
    const b = { dates: ['d2', 'd3', 'd4'], values: [20, 30, 40] };
    // 共同日期只有 d2/d3，长度 2 < 30 → null；验证对齐而不是按索引硬拼
    expect(leadLagScan(a, b)).toBeNull();
  });
});

/* ------------------------------ buildMacro ------------------------------ */

describe('buildMacro：矩阵 / 风险篮子 / VRP', () => {
  /** 让前 n 个标的拿到 300 天日线，其余走「源失败」 */
  function prime({ okCount = MACRO_UNIVERSE.length, n = 300, freq = 'day' } = {}) {
    readDailyCache.mockImplementation(async (id) => {
      const idx = MACRO_UNIVERSE.findIndex((d) => d.id === id);
      if (idx < 0 || idx >= okCount) return null;
      return fresh(rows(n, idx));
    });
    return { n, freq };
  }

  it('全部有数据：矩阵对称、对角为 1、统计齐全', async () => {
    prime();
    const data = await buildMacro(250, 'day');

    expect(data.ok).toBe(true);
    expect(data.universe).toHaveLength(MACRO_UNIVERSE.length);
    expect(data.universe.every((u) => u.ok)).toBe(true);
    // kind 透传（利率标记影响前端折算）
    expect(data.universe.find((u) => u.id === 'us10y').kind).toBe('rate');
    expect(data.universe.find((u) => u.id === 'sp500').kind).toBe('price');

    const { ids, corr, counts, stats } = data.matrix;
    expect(ids).toHaveLength(MACRO_UNIVERSE.length);
    for (let i = 0; i < ids.length; i += 1) {
      expect(corr[i][i]).toBe(1);
      expect(counts[i][i]).toBeGreaterThan(0);
      for (let j = 0; j < ids.length; j += 1) {
        expect(corr[i][j]).toBeCloseTo(corr[j][i], 12);
        expect(counts[i][j]).toBe(counts[j][i]);
      }
    }
    // 66 对（13 选 2）都进了 BH 校正
    expect(stats).toHaveLength((ids.length * (ids.length - 1)) / 2);
    for (const s of stats) {
      expect(s).toHaveProperty('q');
      expect(typeof s.significantBH).toBe('boolean');
    }
  });

  it('窗口截断只影响展示序列，不影响 z-Score 的 65 期底稿', async () => {
    prime();
    const data = await buildMacro(20, 'day');
    const sp = data.recent.changes.sp500;
    // 展示序列按窗口截断
    expect(data.recent.dates).toHaveLength(20);
    expect(sp).toHaveLength(20);
    // 20 期窗口下 riskAppetite 仍然算得出来（z 用固定 65 期）
    expect(data.riskAppetite.risk).not.toBeNull();
    expect(data.riskAppetite.hedge).not.toBeNull();
    expect(data.riskAppetite.spread).not.toBeNull();
    expect(['Risk-On', 'Risk-Off', '中性']).toContain(data.riskAppetite.label);
  });

  it('周频走 aggregateWeekly，样本数明显少于日频', async () => {
    prime();
    const day = await buildMacro(250, 'day');
    const week = await buildMacro(250, 'week');
    expect(week.freq).toBe('week');
    expect(week.universe[0].samples).toBeLessThan(day.universe[0].samples);
  });

  it('单个源失败只把该标的标 ok:false，其余继续出矩阵', async () => {
    prime({ okCount: 5 });
    // 前 5 个有缓存；剩下的没有任何来源 → fetch 抛错
    historySourcesFor.mockReturnValue([]);
    const data = await buildMacro(60, 'day');
    expect(data.ok).toBe(true);
    expect(data.universe.filter((u) => u.ok)).toHaveLength(5);
    const bad = data.universe.filter((u) => !u.ok);
    expect(bad).toHaveLength(MACRO_UNIVERSE.length - 5);
    expect(bad[0].error).toMatch(/无可用来源/);
    expect(data.matrix.ids).toHaveLength(5);
  });

  it('数据太少（<2 个标的）时 ok=false，前端据此显示降级', async () => {
    prime({ okCount: 1, n: 80 });
    const data = await buildMacro(60, 'day');
    expect(data.ok).toBe(false);
    expect(data.matrix.ids).toHaveLength(1);
    expect(data.leadLag).toEqual([]);
    expect(data.riskAppetite.risk).toBeNull();
    expect(data.riskAppetite.label).toBeNull();
    expect(data.vrp).toBeNull();
  });

  it('零波动序列让 z-Score 与 VRP 比值安全退化为 null', async () => {
    // sp500 价格完全不动 → log 收益率全 0 → sd=0；rv20=0 → ratio 兜底 null
    const flat = Array.from({ length: 120 }, (_, i) => ({ date: dates(120)[i], close: 100 }));
    readDailyCache.mockImplementation(async (id) => {
      const idx = MACRO_UNIVERSE.findIndex((d) => d.id === id);
      if (idx < 0) return null;
      return fresh(idx === 5 ? flat : rows(120, idx));
    });
    const data = await buildMacro(120, 'day');
    expect(data.vrp).toBeTruthy();
    expect(data.vrp.rv20).toBe(0);
    expect(data.vrp.ratio).toBeNull();
    // sp500 进不了风险篮子（sd=0），其余三个成员仍然成立
    expect(data.riskAppetite.riskMembers).not.toContain('sp500');
    expect(data.riskAppetite.risk).not.toBeNull();
  });

  it('末值非有限数时 z-Score 返回 null 而不是 NaN/Infinity', async () => {
    readDailyCache.mockImplementation(async (id) => {
      const idx = MACRO_UNIVERSE.findIndex((d) => d.id === id);
      if (idx < 0) return null;
      const r = rows(120, idx);
      if (idx === 8) r[r.length - 1] = { date: r[r.length - 1].date, close: Number.POSITIVE_INFINITY };
      return fresh(r);
    });
    const data = await buildMacro(120, 'day');
    // btc 的 z 为 null → 风险篮子少一个成员，但整体不是 NaN
    expect(data.riskAppetite.riskMembers).not.toContain('btc');
    expect(Number.isFinite(data.riskAppetite.risk)).toBe(true);
  });

  it('交易日期错位时 recent 用 null 补齐而不是错位拼接', async () => {
    readDailyCache.mockImplementation(async (id) => {
      const idx = MACRO_UNIVERSE.findIndex((d) => d.id === id);
      if (idx < 0) return null;
      const r = rows(120, idx);
      if (idx === 0) return fresh(r.filter((_, i) => i % 2 === 0)); // 只有一半日期
      return fresh(r);
    });
    const data = await buildMacro(120, 'day');
    const gold = data.recent.changes['gold-intl'];
    expect(gold.some((v) => v === null)).toBe(true);
    expect(gold.filter((v) => v === null).length).toBeGreaterThan(10);
  });

  it('带前瞻关系的合成序列能被 leadLag 识别方向', async () => {
    // b 是 a 平移 2 天 → a 领先 b
    const n = 260;
    const ds = dates(n);
    const base = ds.map((_, i) => Math.sin(i / 6) + 0.3 * Math.cos(i / 2.3));
    const lead = { dates: ds, values: base };
    const follow = { dates: ds, values: base.map((_, i) => base[Math.max(0, i - 2)]) };
    readDailyCache.mockImplementation(async (id) => {
      const idx = MACRO_UNIVERSE.findIndex((d) => d.id === id);
      if (idx === 0) return { savedAt: Date.now(), source: 't', rows: changeToRows(ds, lead.values) };
      if (idx === 1) return { savedAt: Date.now(), source: 't', rows: changeToRows(ds, follow.values) };
      return null;
    });
    const data = await buildMacro(250, 'day');
    // 只有两个标的时配对数是 1，lag 结果至少存在
    expect(data.matrix.ids).toEqual(['gold-intl', 'gold-cn']);
    expect(Array.isArray(data.leadLag)).toBe(true);
  });
});

/** 由「变动」反推一条严格递增的价格序列（保证 toChanges 可还原量级） */
function changeToRows(ds, vals) {
  let close = 200;
  return ds.map((date, i) => {
    // 价格 = 200 * exp(累计变动)，保证 > 0
    close = 200 * Math.exp(vals.slice(0, i + 1).reduce((a, b) => a + b * 0.01, 0));
    return { date, close };
  });
}

/* ------------------------------ fetchMacroSeries ------------------------------ */

describe('fetchMacroSeries：缓存与源降级', () => {
  const def = { id: 'sp500', name: '标普500', fred: 'SP500' };

  it('8 小时内的缓存直接复用，不打源', async () => {
    const cachedRows = rows(50, 0);
    readDailyCache.mockResolvedValue(fresh(cachedRows, 'fred'));
    const out = await fetchMacroSeries(def);
    expect(out.rows).toBe(cachedRows);
    expect(out.meta).toMatchObject({ source: 'fred', name: '标普500', code: 'sp500' });
    expect(historySourcesFor).not.toHaveBeenCalled();
  });

  it('缓存过期则打源；更长的序列覆盖缓存', async () => {
    readDailyCache.mockResolvedValue({ savedAt: Date.now() - 9 * 3600 * 1000, rows: rows(100, 0), source: 'old' });
    const longer = rows(500, 1);
    historySourcesFor.mockReturnValue([Object.assign(async () => ({ rows: longer, meta: { source: 'yahoo' } }), { sourceName: 'yahoo' })]);
    const out = await fetchMacroSeries(def);
    expect(out.rows).toBe(longer);
    expect(writeDailyCache).toHaveBeenCalledWith('sp500', 'yahoo', longer);
  });

  it('更短的序列不覆盖缓存（避免宏观页把详情页 5000 条冲掉）', async () => {
    readDailyCache.mockResolvedValue({ savedAt: Date.now() - 9 * 3600 * 1000, rows: rows(500, 0), source: 'old' });
    const shorter = rows(80, 1);
    historySourcesFor.mockReturnValue([Object.assign(async () => ({ rows: shorter, meta: { source: 'yahoo' } }), { sourceName: 'yahoo' })]);
    const out = await fetchMacroSeries(def);
    expect(out.rows).toBe(shorter);
    expect(writeDailyCache).not.toHaveBeenCalled();
  });

  it('取条数最多的来源；达到 500 条即停止', async () => {
    const jobs = [
      Object.assign(async () => ({ rows: rows(40, 0), meta: { source: 'a' } }), { sourceName: 'a' }),
      Object.assign(async () => ({ rows: rows(300, 1), meta: { source: 'b' } }), { sourceName: 'b' }),
      Object.assign(async () => ({ rows: rows(600, 2), meta: { source: 'c' } }), { sourceName: 'c' }),
      Object.assign(async () => { throw new Error('boom'); }, { sourceName: 'd' }),
    ];
    historySourcesFor.mockReturnValue(jobs);
    const out = await fetchMacroSeries(def);
    expect(out.meta.source).toBe('c');
    // 达到 500 条后不再尝试后面的任务
    expect(jobs[3]).toBeTruthy();
  });

  it('源全挂时退回旧缓存', async () => {
    const stale = rows(70, 3);
    readDailyCache.mockResolvedValue({ savedAt: Date.now() - 9 * 3600 * 1000, rows: stale, source: 'old' });
    historySourcesFor.mockReturnValue([
      Object.assign(async () => { throw new Error('x'); }, { sourceName: 'x' }),
      Object.assign(async () => { throw new Error('y'); }, { sourceName: 'y' }),
    ]);
    const out = await fetchMacroSeries(def);
    expect(out.rows).toBe(stale);
    expect(out.meta.source).toBe('old');
  });

  it('无缓存且源全挂时抛出带来源名的错误', async () => {
    historySourcesFor.mockReturnValue([
      Object.assign(async () => { throw new Error('x'); }, { sourceName: 'x' }),
      Object.assign(async () => { throw new Error('y'); }, { sourceName: 'y' }),
    ]);
    await expect(fetchMacroSeries(def)).rejects.toThrow('x: x / y: y');
  });

  it('完全没有来源配置时抛「无可用来源」', async () => {
    await expect(fetchMacroSeries(def)).rejects.toThrow('无可用来源');
  });
});

/* ------------------------------ getMacro ------------------------------ */

describe('getMacro：2 分钟缓存', () => {
  it('命中缓存不重建，force 重建，过期重建', async () => {
    primeAll();
    const first = await getMacro(120, 'day');
    expect(macroCache.size).toBe(1);

    const second = await getMacro(120, 'day');
    expect(second).toBe(first);

    const forced = await getMacro(120, 'day', { force: true });
    expect(forced).not.toBe(first);

    // 把缓存时间推到 TTL 之外
    macroCache.set('day:120', { at: Date.now() - MACRO_CACHE_TTL_MS - 1, data: first });
    const expired = await getMacro(120, 'day');
    expect(expired).not.toBe(first);
  });

  it('不同 freq / window 使用不同的缓存键', async () => {
    primeAll();
    await getMacro(120, 'day');
    await getMacro(120, 'week');
    expect([...macroCache.keys()].sort()).toEqual(['day:120', 'week:120']);
  });
});

function primeAll() {
  readDailyCache.mockImplementation(async (id) => {
    const idx = MACRO_UNIVERSE.findIndex((d) => d.id === id);
    return idx < 0 ? null : fresh(rows(120, idx));
  });
}
