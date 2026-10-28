/* ================================================================== *
 * 日历服务：抓取降级、月度日程解析、事件研究统计
 *
 * 现有 calendar-release 测试钉住了「发布时刻」和「今天」的口径；这里补
 * 网络编排与统计部分：FOMC/ICS 失败后的月度页回退、事件日的 lag 对照、
 * Welch t 与中位数口径。全部离线（fetchRaw / fetchMacroSeries / 缓存都受控）。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/server/providers/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchRaw: vi.fn() };
});

vi.mock('../src/server/services/macro.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    MACRO_UNIVERSE: [
      { id: 'sp500', name: '标普500', short: '标普', group: 'equity', cat: '风险' },
      { id: 'btc', name: '比特币', short: 'BTC', group: 'crypto', cat: '风险' },
      { id: 'flaky', name: '坏源', short: '坏', group: 'x', cat: 'x' },
    ],
    fetchMacroSeries: vi.fn(),
    toChanges: actual.toChanges,
  };
});

const { fetchRaw } = await import('../src/server/providers/index.js');
const { fetchMacroSeries, MACRO_UNIVERSE } = await import('../src/server/services/macro.service.js');
const cal = await import('../src/server/services/calendar.service.js');

const {
  CAL_CACHE_TTL_MS,
  STUDY_CACHE_TTL_MS,
  calCache,
  studyCache,
  fetchBlsMonth,
  getCalendar,
  statOf,
  welchT,
  shiftDate,
  buildEventStudy,
  getEventStudy,
} = cal;

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

/* ------------------------------ 上游文本 ------------------------------ */

const FOMC_MD = [
  '# 2026 FOMC Meetings',
  '**January**',
  '27-28',
  '**March**',
  '17-18*',
].join('\n');

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'SUMMARY:Consumer Price Index',
  'DTSTART;TZID=America/New_York:20260113T083000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Employment Situation',
  'DTSTART;TZID=America/New_York:20260109T083000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Some Other Release',
  'DTSTART;TZID=America/New_York:20260110T083000',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// 文本代理把日历渲染成「每个日期格子自带发布内容」的表格
const BLS_TABLE = [
  '| 1 Consumer Price Index (January 2026) |',
  '| 9 Employment Situation (December 2025) |',
  '| 30 | 1 Consumer Price Index (February 2026) | 2 |',
].join('\n');

beforeEach(() => {
  calCache.clear();
  studyCache.clear();
  fetchRaw.mockReset();
  fetchMacroSeries.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------ getCalendar 编排 ------------------------------ */

describe('getCalendar：FOMC + ICS 都成功', () => {
  it('合并两类事件、按日期排序、给出覆盖月份与 upcoming', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('fomccalendars')) return FOMC_MD;
      if (url.includes('bls.ics')) return ICS;
      throw new Error(`unexpected ${url}`);
    });

    const out = await getCalendar({ force: true });
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    const kinds = out.events.map((e) => e.kind).sort();
    expect(kinds).toEqual(['cpi', 'fomc', 'fomc', 'nfp']);
    expect(out.events.map((e) => e.date)).toEqual([...out.events.map((e) => e.date)].sort());
    expect(out.coverage.monthsFetched).toHaveLength(5);
    expect(out.upcoming.length).toBeLessThanOrEqual(30);
    // 缓存只存原始事件，视图字段（today/generatedAt）每次现算
    expect(calCache.get('cal').events).toBeDefined();
    expect(calCache.get('cal').today).toBeUndefined();
  });

  it('第二次调用命中缓存，不再打上游', async () => {
    fetchRaw.mockResolvedValue(FOMC_MD);
    fetchRaw.mockImplementation(async (url) => (url.includes('bls.ics') ? ICS : FOMC_MD));
    await getCalendar({ force: true });
    const calls = fetchRaw.mock.calls.length;
    await getCalendar();
    expect(fetchRaw.mock.calls.length).toBe(calls);
  });
});

describe('getCalendar：ICS 失败 → 回退月度日程页', () => {
  it('五个页面各自成功/失败都记进 errors，事件仍然可用', async () => {
    let monthCalls = 0;
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('fomccalendars')) return FOMC_MD;
      if (url.includes('bls.ics')) throw new Error('403 forbidden');
      if (url.includes('_sched.htm')) {
        monthCalls += 1;
        if (monthCalls === 2) throw new Error('page down');
        return BLS_TABLE;
      }
      throw new Error(`unexpected ${url}`);
    });

    const out = await getCalendar({ force: true });
    expect(monthCalls).toBe(5);
    expect(out.errors.some((e) => e.includes('BLS ICS: 403 forbidden'))).toBe(true);
    expect(out.errors.some((e) => /BLS \d{4}-\d+：? page down|BLS \d{4}-\d+: page down/.test(e))).toBe(true);
    expect(out.events.some((e) => e.kind === 'cpi')).toBe(true);
    expect(out.events.some((e) => e.kind === 'fomc')).toBe(true);
  });

  it('FOMC 也失败时只保留还能拿到的数据', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('fomccalendars')) throw new Error('blocked');
      if (url.includes('bls.ics')) throw new Error('blocked');
      return BLS_TABLE;
    });
    const out = await getCalendar({ force: true });
    expect(out.errors.some((e) => e.startsWith('FOMC:'))).toBe(true);
    expect(out.events.length).toBeGreaterThan(0);
    expect(out.ok).toBe(true);
  });

  it('所有源全挂：ok=false，但结构完整（前端显示降级）', async () => {
    fetchRaw.mockRejectedValue(new Error('offline'));
    const out = await getCalendar({ force: true });
    expect(out.ok).toBe(false);
    expect(out.events).toEqual([]);
    expect(out.errors.length).toBeGreaterThanOrEqual(2);
    expect(out.coverage.monthsFetched).toHaveLength(5);
  });
});

/* ------------------------------ BLS 月度页 ------------------------------ */

describe('fetchBlsMonth：表格解析与跨月翻页', () => {
  it('跨月日期按翻页处理，不把 1 月 2 日算成 12 月 2 日', async () => {
    fetchRaw.mockResolvedValue(
      [
        '| 8 Consumer Price Index (November 2025) |',
        '| 17 Employment Situation (November 2025) |',
        '| 30 | 1 Consumer Price Index (December 2025) | 2 |',
      ].join('\n'),
    );
    const out = await fetchBlsMonth(2025, 12);
    expect(out.map((e) => `${e.date}:${e.kind}`)).toEqual([
      '2025-12-08:cpi',
      '2025-12-17:nfp',
      '2026-01-01:cpi',
    ]);
  });

  it('标题带「数据所属月份」，同月补发不会看起来像重复条目', async () => {
    fetchRaw.mockResolvedValue('| 8 Consumer Price Index (November 2025) |');
    const out = await fetchBlsMonth(2025, 12);
    expect(out[0].title).toContain('2025 年 11 月数据');
  });

  it('同一指标同一天只保留第一条；不关心的发布被忽略', async () => {
    fetchRaw.mockResolvedValue(
      [
        '| 8 Consumer Price Index (November 2025) |',
        '| 8 Consumer Price Index revised (November 2025) |',
        '| 9 Retail Trade (November 2025) |',
        '| 10 Something Else (November 2025) |',
        'not a table row',
      ].join('\n'),
    );
    const out = await fetchBlsMonth(2025, 12);
    expect(out.filter((e) => e.kind === 'cpi')).toHaveLength(1);
    expect(out.some((e) => e.kind === 'retail')).toBe(true);
    expect(out.some((e) => /Something/.test(e.title))).toBe(false);
  });

  it('月份参数补零并拼进 URL', async () => {
    fetchRaw.mockResolvedValue('');
    await fetchBlsMonth(2026, 3);
    expect(fetchRaw.mock.calls[0][0]).toContain('2026/03_sched.htm');
  });
});

/* ------------------------------ 统计工具 ------------------------------ */

describe('statOf / welchT / shiftDate', () => {
  it('statOf：空样本、奇数/偶数中位数、样本方差', () => {
    expect(statOf([])).toEqual({ n: 0, mean: null, median: null, var: null });
    expect(statOf([3])).toEqual({ n: 1, mean: 3, median: 3, var: 0 });
    const odd = statOf([1, 3, 5]);
    expect(odd.median).toBe(3);
    expect(odd.var).toBe(4);
    expect(statOf([1, 2, 3, 4]).median).toBe(2.5);
  });

  it('welchT：空样本 / 零方差返回 null，正常样本给有限 t', () => {
    expect(welchT([], [1, 2])).toBeNull();
    // a 方差为 0、b 有方差：分母仍非 0，均值相同 → t=0
    expect(welchT([2, 2, 2], [1, 2, 3])).toBe(0);
    const t = welchT([1, 2, 3, 4], [2, 3, 4, 5]);
    expect(Number.isFinite(t)).toBe(true);
    expect(welchT([1, 1, 1], [1, 1, 1])).toBeNull(); // 都没方差 → denom 0
  });

  it('shiftDate：越界返回 null', () => {
    const dates = ['a', 'b', 'c'];
    expect(shiftDate(dates, 1, 1)).toBe('c');
    expect(shiftDate(dates, 1, -1)).toBe('a');
    expect(shiftDate(dates, 0, -1)).toBeNull();
    expect(shiftDate(dates, 2, 1)).toBeNull();
  });
});

/* ------------------------------ 事件研究 ------------------------------ */

function seedCalendar(events) {
  calCache.set('cal', { at: Date.now(), events, errors: [], coverage: { monthsFetched: [] } });
}

/** 300 个交易日的日线，收盘价按正弦波动（收益有正有负） */
function seriesRows(n = 300, start = '2023-01-02') {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(t0 + i * DAY).toISOString().slice(0, 10),
    close: 100 + Math.sin(i / 4) * 5 + i * 0.01,
  }));
}

describe('buildEventStudy：事件日 vs 非事件日', () => {
  const rows = seriesRows();
  const dates = rows.map((r) => r.date);

  function primeEvents(count = 8) {
    const events = [];
    for (let i = 0; i < count; i += 1) {
      const idx = 40 + i * 20; // 落在序列中段的不同日期
      events.push({
        date: dates[idx],
        time: '21:30',
        releaseAt: iso(Date.parse(`${dates[idx]}T12:00:00Z`)), // 美东 08:00，未收盘
        kind: 'cpi',
        title: `CPI #${i}`,
        importance: 3,
      });
    }
    seedCalendar(events);
    return events;
  }

  beforeEach(() => {
    fetchMacroSeries.mockImplementation(async (def) => {
      if (def.id === 'flaky') throw new Error('source down');
      return { rows, meta: { source: 'test' } };
    });
  });

  it('两类市场各出 lag 0/1 对照，坏源被跳过而不影响整体', async () => {
    primeEvents();
    const out = await buildEventStudy();
    expect(out.ok).toBe(true);
    expect(out.kinds).toEqual([{ kind: 'cpi', count: 8 }]);
    expect(out.coverage.map((c) => c.id)).toEqual(['sp500', 'btc']);
    expect(out.rows).toHaveLength(4); // 2 symbols × 2 lags
    for (const row of out.rows) {
      expect(row.eventDays).toBeGreaterThanOrEqual(5);
      expect(row.isAuto).toBe(row.lag === 0);
      expect(row.eventMeanPct).toBeGreaterThanOrEqual(0);
      expect(row.baseMeanPct).toBeGreaterThanOrEqual(0);
      expect(typeof row.significant).toBe('boolean');
      expect(row.ratio).not.toBeNull();
      expect(row.medianRatio).not.toBeNull();
    }
    // 拉美/坏源没有被写进覆盖清单
    expect(out.coverage.some((c) => c.id === 'flaky')).toBe(false);
  });

  it('事件数不足 5 个时不出行（避免拿 2 个样本下结论）', async () => {
    primeEvents(3);
    const out = await buildEventStudy();
    expect(out.ok).toBe(false);
    expect(out.rows).toEqual([]);
    expect(out.kinds).toEqual([{ kind: 'cpi', count: 3 }]);
  });

  it('没有历史事件时直接给出提示', async () => {
    seedCalendar([]);
    const out = await buildEventStudy();
    expect(out).toEqual({ ok: false, kinds: [], rows: [], error: '没有历史事件可供统计' });
  });

  it('未来事件不参与统计', async () => {
    const future = [];
    for (let i = 0; i < 8; i += 1) {
      future.push({
        date: '2099-01-01',
        time: '21:30',
        releaseAt: '2099-01-01T12:00:00Z',
        kind: 'cpi',
        title: `f${i}`,
      });
    }
    seedCalendar(future);
    const out = await buildEventStudy();
    expect(out.ok).toBe(false);
    expect(out.error).toBe('没有历史事件可供统计');
  });

  it('序列太短（<100 个变动）的品种被跳过', async () => {
    primeEvents();
    fetchMacroSeries.mockResolvedValue({ rows: seriesRows(60), meta: { source: 't' } });
    const out = await buildEventStudy();
    expect(out.coverage).toEqual([]);
    expect(out.rows).toEqual([]);
    expect(out.ok).toBe(false);
  });

  it('自动口径 lag=0，另外保留 lag=1 观察余波', async () => {
    primeEvents();
    const out = await buildEventStudy();
    const lags = out.rows.filter((r) => r.symbol === 'sp500').map((r) => r.lag);
    expect(lags).toEqual([0, 1]);
  });
});

describe('getEventStudy：6 小时缓存', () => {
  it('命中不重建，force 重建，过期重建', async () => {
    seedCalendar([]);
    const a = await getEventStudy();
    const b = await getEventStudy();
    expect(b).toBe(a);
    const c = await getEventStudy({ force: true });
    expect(c).not.toBe(a);
    studyCache.set('study', { at: Date.now() - STUDY_CACHE_TTL_MS - 1, data: a });
    expect(await getEventStudy()).not.toBe(a);
  });

  it('TTL 是 6 小时', () => {
    expect(STUDY_CACHE_TTL_MS).toBe(6 * 3600_000);
    expect(CAL_CACHE_TTL_MS).toBe(6 * 3600_000);
    expect(MACRO_UNIVERSE).toHaveLength(3);
  });
});
