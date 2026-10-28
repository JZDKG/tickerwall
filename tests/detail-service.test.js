/* ================================================================== *
 * 详情服务（detail.service）
 *
 * 详情页的 22 项统计指标全在这里算：52 周高低、历史高低、年化/实现波动率、
 * 分位、最大回撤、均线、连续涨跌、区间收益。这些数字错一位用户就会得出
 * 相反结论，而之前整块 0 覆盖。
 *
 * 依赖全部显式 mock：日线缓存、历史源、上游 fetch、报价服务。断言的是
 * 「给定一组日线，算出来的指标是什么」，不是实现细节。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/server/services/quotes.service.js', () => ({
  getQuotes: vi.fn(),
  findInstrument: vi.fn(),
  resolveInstrument: vi.fn(),
  trimToLastSession: vi.fn((pts) => pts),
  INSTRUMENTS: [],
  DETAIL_ONLY_INSTRUMENTS: [],
}));

vi.mock('../src/server/db/index.js', () => ({
  DAILY_FRESH_MS: 8 * 3600 * 1000,
  readDailyCache: vi.fn(),
  writeDailyCache: vi.fn(),
  isDailyCacheFresh: vi.fn(),
  takeSnapshot: vi.fn(),
  readSnapshots: vi.fn(),
}));

vi.mock('../src/server/providers/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchRaw: vi.fn(), historySourcesFor: vi.fn() };
});

const { getQuotes, findInstrument, resolveInstrument } = await import(
  '../src/server/services/quotes.service.js'
);
const { readDailyCache, writeDailyCache } = await import('../src/server/db/index.js');
const { fetchRaw, historySourcesFor } = await import('../src/server/providers/index.js');
const detail = await import('../src/server/services/detail.service.js');

const {
  DETAIL_HISTORY_LIMIT,
  DETAIL_CACHE_TTL_MS,
  detailCache,
  DAY_MS,
  TROY_OUNCE_GRAMS,
  fetchIntradayByEm,
  fetchIntradayByBinance,
  fetchExtraMetrics,
  fetchUsdCny,
  buildGoldSpread,
  buildDayStats,
  packDaily,
  buildDetail,
  fetchBinanceSnapshot,
  getDetail,
} = detail;

const DAY = 86_400_000;

/* ------------------------------ 夹具 ------------------------------ */

/** 连续 n 天、带 high/low/volume/pct 的确定性日线 */
function mkRows(n = 500, { start = '2025-06-01', onlyClose = false } = {}) {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const rows = [];
  let close = 100;
  for (let i = 0; i < n; i += 1) {
    const date = new Date(t0 + i * DAY).toISOString().slice(0, 10);
    const prev = close;
    const pct = 0.15 + Math.sin(i / 5) * 0.9;
    close = prev * (1 + pct / 100);
    const row = {
      date,
      open: Number(prev.toFixed(4)),
      close: Number(close.toFixed(4)),
      high: Number((Math.max(prev, close) * 1.01).toFixed(4)),
      low: Number((Math.min(prev, close) * 0.99).toFixed(4)),
      volume: 1000 + i,
      amount: 1e6,
      pct: Number(pct.toFixed(4)),
    };
    rows.push(onlyClose ? { date, close: row.close } : row);
  }
  return rows;
}

const INST = {
  id: 'sp500',
  name: '标普500',
  sub: 'S&P 500 指数',
  unit: '点',
  decimals: 2,
  market: 'us-index',
  em: '100.SPX',
};

beforeEach(() => {
  detailCache.clear();
  fetchRaw.mockReset();
  historySourcesFor.mockReset();
  readDailyCache.mockReset();
  writeDailyCache.mockReset();
  getQuotes.mockReset();
  findInstrument.mockReset();
  resolveInstrument.mockReset();

  getQuotes.mockResolvedValue({ items: [] });
  historySourcesFor.mockReturnValue([]);
  readDailyCache.mockResolvedValue(null);
  writeDailyCache.mockResolvedValue();
  findInstrument.mockReturnValue(INST);
});

/* ------------------------------ buildDayStats ------------------------------ */

describe('buildDayStats：区间与历史极值', () => {
  it('空数组返回 null', () => {
    expect(buildDayStats([])).toBeNull();
  });

  it('52 周高低只看最近 365 天，历史高低看全样本', () => {
    const rows = mkRows(500); // 约 1.37 年
    const s = buildDayStats(rows);
    const lastTs = Date.parse(rows[rows.length - 1].date);
    const yearRows = rows.filter((r) => Date.parse(r.date) >= lastTs - 365 * DAY);
    expect(s.high52).toBe(Math.max(...yearRows.map((r) => r.high)));
    expect(s.low52).toBe(Math.min(...yearRows.map((r) => r.low)));
    const allHigh = Math.max(...rows.map((r) => r.high));
    const allLow = Math.min(...rows.map((r) => r.low));
    expect(s.histHigh.value).toBe(allHigh);
    expect(s.histHigh.date).toBe(rows.find((r) => r.high === allHigh).date);
    expect(s.histLow.value).toBe(allLow);
    expect(s.histLow.date).toBe(rows.find((r) => r.low === allLow).date);
    expect(s.fromHigh52).toBeLessThanOrEqual(0);
    expect(s.fromLow52).toBeGreaterThanOrEqual(0);
  });

  it('只有收盘价的数据源（FRED）退回收盘口径算高低，而不是整块显示 —', () => {
    const rows = mkRows(400, { onlyClose: true });
    const s = buildDayStats(rows);
    const lastTs = Date.parse(rows[rows.length - 1].date);
    const year = rows.filter((r) => Date.parse(r.date) >= lastTs - 365 * DAY);
    expect(s.high52).toBe(Math.max(...year.map((r) => r.close)));
    expect(s.low52).toBe(Math.min(...year.map((r) => r.close)));
    expect(s.histHigh.value).toBe(Math.max(...rows.map((r) => r.close)));
    expect(s.avgVolume20).toBeNull();
  });

  it('单日最佳/最差取 pct 极值', () => {
    const rows = mkRows(120);
    const s = buildDayStats(rows);
    const maxPct = Math.max(...rows.map((r) => r.pct));
    const minPct = Math.min(...rows.map((r) => r.pct));
    expect(s.bestDay.pct).toBe(maxPct);
    expect(s.worstDay.pct).toBe(minPct);
  });
});

describe('buildDayStats：波动率与分位', () => {
  it('年化波动率 = 日收益标准差 × √252', () => {
    const rows = mkRows(300);
    const rets = [];
    for (let i = 1; i < rows.length; i += 1) rets.push((rows[i].close - rows[i - 1].close) / rows[i - 1].close);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
    const s = buildDayStats(rows);
    expect(s.volatility).toBeCloseTo(sd * Math.sqrt(252) * 100, 8);
    expect(s.rv20).toBeGreaterThan(0);
    expect(s.rv60).toBeGreaterThan(0);
  });

  it('RV20 分位与状态是配套的：分位越高状态越热', () => {
    const s = buildDayStats(mkRows(500));
    expect(s.rv20Percentile).toBeGreaterThanOrEqual(0);
    expect(s.rv20Percentile).toBeLessThanOrEqual(100);
    expect(['极高', '偏高', '中性', '偏低', '极低']).toContain(s.volRegime);
    expect(s.volWindowYears).toBe(2); // 499/252 ≈ 1.98 → 保留一位得 2.0
  });

  it('样本不足时各指标安全为 null，而不是 NaN', () => {
    const s = buildDayStats(mkRows(8));
    expect(s.rv20).toBeNull();
    expect(s.rv60).toBeNull();
    expect(s.rv20Percentile).toBeNull();
    expect(s.volRegime).toBeNull();
    expect(s.volatility).toBeNull();
    expect(s.ma20).toBeNull();
    expect(Number.isNaN(s.rv20)).toBe(false);
  });

  it('加密按 365 天年化（daysPerYear 随市场配置）', () => {
    const rows = mkRows(200);
    const a = buildDayStats(rows, { daysPerYear: 252 });
    const b = buildDayStats(rows, { daysPerYear: 365 });
    expect(b.volatility / a.volatility).toBeCloseTo(Math.sqrt(365 / 252), 8);
  });
});

describe('buildDayStats：均线 / 回撤 / 连续涨跌 / 区间收益', () => {
  it('均线是最近 n 个收盘的算术平均', () => {
    const rows = mkRows(300);
    const s = buildDayStats(rows);
    const avg = (n) => rows.slice(-n).reduce((a, r) => a + r.close, 0) / n;
    expect(s.ma20).toBeCloseTo(avg(20), 10);
    expect(s.ma60).toBeCloseTo(avg(60), 10);
    expect(s.ma120).toBeCloseTo(avg(120), 10);
    expect(s.ma250).toBeCloseTo(avg(250), 10);
  });

  it('最大回撤为负，且峰/谷日期成对出现', () => {
    const rows = mkRows(400);
    const s = buildDayStats(rows);
    expect(s.maxDrawdown.pct).toBeLessThanOrEqual(0);
    expect(s.maxDrawdown.peakDate).toBeTruthy();
    if (s.maxDrawdown.pct < 0) {
      expect(Date.parse(s.maxDrawdown.troughDate)).toBeGreaterThanOrEqual(Date.parse(s.maxDrawdown.peakDate));
    }
  });

  it('连续上涨天数为正、连续下跌为负', () => {
    const rowsFrom = (pcts) =>
      pcts.map((pct, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        close: 100 + i,
        high: 101 + i,
        low: 99 + i,
        volume: 1,
        pct,
      }));
    // 从旧到新：+1 打断后连续三天上涨
    expect(buildDayStats(rowsFrom([1, -1, 1, 1, 1])).streak).toBe(3);
    // +1 打断后连续两天下跌
    expect(buildDayStats(rowsFrom([1, -1, -1])).streak).toBe(-2);
    // 只有一天上涨
    expect(buildDayStats(rowsFrom([-1, 1])).streak).toBe(1);
  });

  it('区间收益按自然日回看，年初至今以最后一个交易日的年份为基准', () => {
    const rows = mkRows(500);
    const s = buildDayStats(rows);
    for (const k of ['d1', 'w1', 'm1', 'm3', 'm6', 'y1', 'y3', 'ytd']) {
      expect(s.perf, k).toHaveProperty(k);
      expect(Number.isFinite(s.perf[k]), k).toBe(true);
    }
    expect(s.lastClose).toBe(rows[rows.length - 1].close);
    expect(s.lastDate).toBe(rows[rows.length - 1].date);
  });

  it('不足一年时 y3 用最早一条做基准，不返回 NaN', () => {
    const s = buildDayStats(mkRows(100));
    expect(Number.isFinite(s.perf.y1)).toBe(true);
    expect(Number.isFinite(s.perf.y3)).toBe(true);
  });
});

describe('buildDayStats：实时报价融入口径', () => {
  const rows = mkRows(300);
  const last = rows[rows.length - 1];

  it('近1日优先用报价自带 changePct（日线 pct 可能是空的）', () => {
    const s = buildDayStats(rows, { quote: { price: last.close * 1.02, changePct: 2.5 } });
    expect(s.perf.d1).toBe(2.5);
    expect(s.lastClose).toBe(last.close * 1.02);
  });

  it('实时极值并入 52 周与历史高低，距高点不为负', () => {
    const quote = { price: last.close, high: last.high * 5, low: last.low / 5 };
    const s = buildDayStats(rows, { quote });
    expect(s.high52).toBe(quote.high);
    expect(s.low52).toBe(quote.low);
    expect(s.histHigh.value).toBe(quote.high);
    expect(s.histLow.value).toBe(quote.low);
    expect(s.fromHigh52).toBeLessThanOrEqual(0);
  });

  it('报价缺 high/low 时用 price 兜底', () => {
    const s = buildDayStats(rows, { quote: { price: last.close * 2 } });
    expect(s.high52).toBe(Math.max(...rows.slice(-365).map((r) => r.high), last.close * 2));
  });

  it('价格为 0 / 负数的报价视为无实时数据', () => {
    const a = buildDayStats(rows, { quote: { price: 0, changePct: 99 } });
    const b = buildDayStats(rows);
    expect(a.lastClose).toBe(b.lastClose);
    expect(a.perf.d1).toBe(b.perf.d1);
  });

  it('盘中时间基准用 now，区间回看不会错位到上周', () => {
    const stale = mkRows(300, { start: '2025-01-01' }); // 最后一条远在过去
    const s = buildDayStats(stale, { quote: { price: 200, changePct: 1 } });
    // refTs = now → 近1周是相对今天回看，基准落在最后一条附近
    expect(Number.isFinite(s.perf.w1)).toBe(true);
    expect(s.perf.d1).toBe(1);
  });
});

/* ------------------------------ 打包与补充指标 ------------------------------ */

describe('packDaily / 补充指标 / 汇率', () => {
  it('packDaily 固定列序：[日期, 开, 收, 高, 低, 量, 额, 涨跌幅]', () => {
    const out = packDaily([{ date: '2026-10-26', open: 1, close: 2, high: 3, low: 0.5, volume: 4, amount: 5, pct: 6 }]);
    expect(out).toEqual([['2026-10-26', 1, 2, 3, 0.5, 4, 5, 6]]);
  });

  it('fetchExtraMetrics：按 f59 的小数位还原价格', async () => {
    fetchRaw.mockResolvedValue(
      JSON.stringify({
        data: { f43: 12345, f44: 13000, f45: 11000, f46: 12000, f47: 100, f48: 2e5, f57: '000001', f58: '上证', f59: 2, f60: 12200, f86: 1700000000, f168: 1.5, f169: 100, f170: 50 },
      }),
    );
    const m = await fetchExtraMetrics('1.000001');
    expect(m.price).toBe(123.45);
    expect(m.high).toBe(130);
    expect(m.low).toBe(110);
    expect(m.open).toBe(120);
    expect(m.prevClose).toBe(122);
    expect(m.change).toBe(1);
    expect(m.changePct).toBe(0.5);
    expect(m.quoteTime).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('fetchExtraMetrics：无 secid / 无 data 返回 null，0 值不当成有效价', async () => {
    expect(await fetchExtraMetrics(null)).toBeNull();
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { f43: 0, f46: 0, f59: 3 } }));
    const m = await fetchExtraMetrics('1.1');
    expect(m.price).toBeNull();
    expect(m.open).toBeNull();
    expect(m.change).toBeNull();
  });

  it('fetchUsdCny：优先第 8 字段现价，缺失回落第 1 字段', async () => {
    fetchRaw.mockResolvedValue('var hq_str_fx_susdcny="2026-10-26 10:00:00,7.10,7.11,7.12,7.13,7.14,7.15,7.16,7.17,美元人民币";');
    const fx = await fetchUsdCny();
    expect(fx.rate).toBe(7.17);
    expect(fx.time).toBe('2026-10-26 10:00:00');
    expect(fx.name).toBe('美元人民币');

    fetchRaw.mockResolvedValue('var hq_str_fx_susdcny="t,7.10,0,0,0,0,0,0,,x";');
    expect((await fetchUsdCny()).rate).toBe(7.1);
  });

  it('fetchUsdCny：空响应与无效汇率抛错', async () => {
    fetchRaw.mockResolvedValue('nothing');
    await expect(fetchUsdCny()).rejects.toThrow('空响应');
    fetchRaw.mockResolvedValue('var hq_str_fx_susdcny="t,0,0,0,0,0,0,0,0,x";');
    await expect(fetchUsdCny()).rejects.toThrow('汇率无效');
  });

  it('fetchBinanceSnapshot：24h 快照字段映射', async () => {
    fetchRaw.mockResolvedValue(
      JSON.stringify({
        lastPrice: '68000.5', openPrice: '67000', highPrice: '69000', lowPrice: '66000',
        prevClosePrice: '66900', volume: '1234', quoteVolume: '8.4e7', priceChange: '1000.5',
        priceChangePercent: '1.49', count: 999,
      }),
    );
    const s = await fetchBinanceSnapshot('BTCUSDT');
    expect(s.price).toBe(68000.5);
    expect(s.prevClose).toBe(66900);
    expect(s.changePct).toBe(1.49);
    expect(s.turnoverRate).toBeNull();
    expect(s.trades).toBe(999);
  });
});

describe('分时：东财 / Binance', () => {
  it('东财 trends2 过滤无效价，保留 HH:MM 标签', async () => {
    fetchRaw.mockResolvedValue(
      JSON.stringify({
        data: {
          trends: [
            '2026-10-26 09:30,3200.1',
            '2026-10-26 09:31,0',
            '2026-10-26 09:32,--',
            '2026-10-26 09:33,3201.2',
          ],
        },
      }),
    );
    const out = await fetchIntradayByEm('1.000001');
    expect(out.date).toBe('2026-10-26');
    expect(out.points.map((p) => p.p)).toEqual([3200.1, 3201.2]);
    expect(out.points[0].label).toBe('09:30');
    expect(Number.isFinite(out.points[0].t)).toBe(true);
  });

  it('东财空数据返回 null', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { trends: [] } }));
    expect(await fetchIntradayByEm('1.1')).toBeNull();
    fetchRaw.mockResolvedValue(JSON.stringify({}));
    expect(await fetchIntradayByEm('1.1')).toBeNull();
  });

  it('Binance 1m K 线过滤无效点，标签用北京时间', async () => {
    const t = Date.UTC(2026, 9, 26, 1, 0); // 北京 09:00
    fetchRaw.mockResolvedValue(
      JSON.stringify([
        [t, '1', '2', '0.5', '68000'],
        [t + 60000, '1', '2', '0.5', '0'],
        [t + 120000, '1', '2', '0.5', '68100'],
      ]),
    );
    const out = await fetchIntradayByBinance('BTCUSDT');
    expect(out.points.map((p) => p.p)).toEqual([68000, 68100]);
    expect(out.points[0].label).toBe('09:00');
    expect(out.date).toBe('2026-10-26');
  });

  it('Binance 空数组返回 null', async () => {
    fetchRaw.mockResolvedValue('[]');
    expect(await fetchIntradayByBinance('BTCUSDT')).toBeNull();
  });
});

describe('buildGoldSpread：内外盘对照', () => {
  it('按金衡盎司与汇率折算，并给出溢价百分比', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('stock/get')) return JSON.stringify({ data: { f43: 200000, f59: 2 } }); // 2000 美元/盎司
      return 'var hq_str_fx_susdcny="t,7.10,0,0,0,0,0,0,7.10,美元人民币";';
    });
    const out = await buildGoldSpread(560);
    expect(out.usdCny).toBe(7.1);
    expect(out.gramsPerOunce).toBe(TROY_OUNCE_GRAMS);
    expect(out.convertedPerGram).toBeCloseTo((2000 / TROY_OUNCE_GRAMS) * 7.1, 10);
    expect(out.premiumPct).toBeCloseTo(((560 - out.convertedPerGram) / out.convertedPerGram) * 100, 10);
    expect(out.domesticPrice).toBe(560);
  });

  it('国内价缺失时溢价为 null，但折算价仍然给', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('stock/get')) return JSON.stringify({ data: { f43: 200000, f59: 2 } });
      return 'var hq_str_fx_susdcny="t,7.10,0,0,0,0,0,0,7.10,美元人民币";';
    });
    const out = await buildGoldSpread(null);
    expect(out.premiumPct).toBeNull();
    expect(out.domesticPrice).toBeNull();
  });

  it('国际金价拿不到时整块返回 null', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('stock/get')) return JSON.stringify({ data: { f43: 0, f59: 2 } });
      return 'var hq_str_fx_susdcny="t,7.10,0,0,0,0,0,0,7.10,美元人民币";';
    });
    expect(await buildGoldSpread(560)).toBeNull();
  });
});

/* ------------------------------ buildDetail ------------------------------ */

const freshCache = (rows = mkRows(120, { start: '2026-05-01' })) => ({
  savedAt: Date.now(),
  rows,
  source: 'eastmoney:100.SPX',
});

describe('buildDetail：历史、缓存与降级', () => {
  it('8 小时内的盘上缓存直接命中，不调用任何历史源', async () => {
    readDailyCache.mockResolvedValue(freshCache());
    const job = vi.fn();
    historySourcesFor.mockReturnValue([job]);
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { trends: [] } }));

    const out = await buildDetail(INST);
    expect(job).not.toHaveBeenCalled();
    expect(out.history.cache.hit).toBe('fresh');
    expect(out.history.cache.ageMs).toBeGreaterThanOrEqual(0);
    expect(out.history.count).toBeGreaterThan(0);
    expect(out.history.daily.length).toBe(out.history.count);
    expect(out.stats).toBeTruthy();
    expect(writeDailyCache).not.toHaveBeenCalled();
  });

  it('取条数最多的来源，失败源记进 errors，并写盘', async () => {
    readDailyCache.mockResolvedValue(null);
    const short = { rows: mkRows(80, { start: '2026-07-01' }), meta: { source: 'a' } };
    const long = { rows: mkRows(200, { start: '2026-02-01' }), meta: { source: 'b' } };
    const okShort = Object.assign(async () => short, { sourceName: 'a' });
    const okLong = Object.assign(async () => long, { sourceName: 'b' });
    const bad = Object.assign(async () => {
      throw new Error('限流');
    }, { sourceName: 'c' });
    historySourcesFor.mockReturnValue([okShort, bad, okLong]);
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { trends: [] } }));

    const out = await buildDetail(INST);
    expect(out.history.source).toBe('b');
    expect(out.history.count).toBe(200);
    expect(out.history.errors).toEqual([{ source: 'c', error: '限流' }]);
    expect(out.history.alternatives.map((a) => a.source)).toEqual(['b', 'a']);
    expect(out.history.alternatives[0].count).toBe(200);
    expect(writeDailyCache).toHaveBeenCalledWith('sp500', 'b', long.rows);
  });

  it('源全挂时退回旧缓存，并标注陈旧时长', async () => {
    const stale = freshCache(mkRows(60, { start: '2026-08-01' }));
    stale.savedAt = Date.now() - 2 * DAY;
    readDailyCache.mockResolvedValue(stale);
    historySourcesFor.mockReturnValue([
      Object.assign(async () => { throw new Error('x'); }, { sourceName: 'x' }),
    ]);
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { trends: [] } }));

    const out = await buildDetail(INST);
    expect(out.history.cache.hit).toBe('stale');
    expect(out.history.cache.ageMs).toBeGreaterThanOrEqual(2 * DAY - 1000);
    expect(out.history.count).toBe(60);
    expect(out.history.errors[0].source).toBe('x');
  });

  it('没有任何历史也没有报价时 ok=false（前端显示降级而不是空白页）', async () => {
    readDailyCache.mockResolvedValue(null);
    historySourcesFor.mockReturnValue([]);
    fetchRaw.mockResolvedValue(JSON.stringify({}));
    resolveInstrument.mockResolvedValue(null);

    const out = await buildDetail(INST);
    expect(out.ok).toBe(false);
    expect(out.history.count).toBe(0);
    expect(out.stats).toBeNull();
    expect(out.quote).toBeNull();
  });

  it('列表里有报价就直接用，多源对照同时列入主源与补充源', async () => {
    readDailyCache.mockResolvedValue(freshCache());
    getQuotes.mockResolvedValue({ items: [{ id: 'sp500', price: 5000, source: 'sina:gb_$inx', ok: true }] });
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('stock/trends2')) return JSON.stringify({ data: { trends: [] } });
      if (url.includes('stock/get')) return JSON.stringify({ data: { f43: 500100, f59: 2 } });
      return '{}';
    });

    const out = await buildDetail(INST);
    expect(out.quote.price).toBe(5000);
    expect(out.crosscheck).toEqual([
      { source: 'sina:gb_$inx', price: 5000, note: '列表主源' },
      { source: 'eastmoney:100.SPX', price: 5001, note: '详情补充源' },
    ]);
    expect(out.marketStatus.market).toBe('美股');
    expect(out.priceBasis).toBe('close');
  });

  it('列表里没有该标的时回落到单标的解析', async () => {
    readDailyCache.mockResolvedValue(freshCache());
    resolveInstrument.mockResolvedValue({ id: 'sp500', price: 4999, source: 'yahoo', ok: true });
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { trends: [] } }));

    const out = await buildDetail(INST);
    expect(resolveInstrument).toHaveBeenCalledWith(INST);
    expect(out.quote.price).toBe(4999);
  });

  it('加密标的走 Binance 分时与 24h 快照', async () => {
    const btc = { ...INST, id: 'btc', name: '比特币', market: 'crypto', binanceSymbol: 'BTCUSDT', em: null };
    findInstrument.mockReturnValue(btc);
    readDailyCache.mockResolvedValue(freshCache());
    getQuotes.mockResolvedValue({ items: [{ id: 'btc', price: 68000, source: 'binance', ok: true }] });
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('klines')) return JSON.stringify([[Date.UTC(2026, 9, 26, 1), '1', '2', '0.5', '68000']]);
      if (url.includes('ticker/24hr')) return JSON.stringify({ lastPrice: '68000', priceChangePercent: '1.2' });
      return '{}';
    });

    const out = await buildDetail(btc);
    expect(out.intraday.points).toHaveLength(1);
    expect(out.ext.price).toBe(68000);
    expect(out.crosscheck.map((c) => c.note)).toEqual(['列表主源', '详情补充源']);
    expect(out.crosscheck[1].source).toBe('binance:24h快照');
  });

  it('沪金额外算内外盘对照；失败不影响主数据', async () => {
    const gold = { ...INST, id: 'gold-cn', name: '国内金价', market: 'cn-spot', em: '118.AU9999' };
    findInstrument.mockReturnValue(gold);
    readDailyCache.mockResolvedValue(freshCache());
    getQuotes.mockResolvedValue({ items: [{ id: 'gold-cn', price: 560, source: 'sina', ok: true }] });
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('stock/trends2')) return JSON.stringify({ data: { trends: [] } });
      if (url.includes('122.XAU')) return JSON.stringify({ data: { f43: 200000, f59: 2 } });
      return 'var hq_str_fx_susdcny="t,7.10,0,0,0,0,0,0,7.10,美元人民币";';
    });

    const out = await buildDetail(gold);
    expect(out.derived.convertedPerGram).toBeGreaterThan(0);
    expect(out.derived.domesticPrice).toBe(560);

    // 对照失败 → derived 为 null，但主数据还在
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('stock/trends2')) return JSON.stringify({ data: { trends: [] } });
      if (url.includes('122.XAU')) throw new Error('boom');
      return 'var hq_str_fx_susdcny="t,7.10,0,0,0,0,0,0,7.10,x";';
    });
    const out2 = await buildDetail(gold);
    expect(out2.derived).toBeNull();
    expect(out2.history.count).toBeGreaterThan(0);
  });

  it('元数据字段原样透传（unit/decimals/sub/name/id）', async () => {
    readDailyCache.mockResolvedValue(freshCache());
    const out = await buildDetail(INST);
    expect(out).toMatchObject({
      id: 'sp500',
      name: '标普500',
      sub: 'S&P 500 指数',
      unit: '点',
      decimals: 2,
      priceBasis: 'close',
    });
    expect(typeof out.generatedAt).toBe('string');
    expect(DETAIL_HISTORY_LIMIT).toBe(5000);
  });
});

describe('getDetail：60 秒缓存', () => {
  it('未知 id 返回 null', async () => {
    findInstrument.mockReturnValue(null);
    expect(await getDetail('nope')).toBeNull();
  });

  it('命中缓存不重建，force 重建，过期重建', async () => {
    readDailyCache.mockResolvedValue(freshCache());
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { trends: [] } }));

    const a = await getDetail('sp500');
    const b = await getDetail('sp500');
    expect(b).toBe(a);
    const c = await getDetail('sp500', { force: true });
    expect(c).not.toBe(a);

    detailCache.set('sp500', { at: Date.now() - DETAIL_CACHE_TTL_MS - 1, data: a });
    const d = await getDetail('sp500');
    expect(d).not.toBe(a);
  });
});
