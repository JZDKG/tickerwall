/* ================================================================== *
 * 宏观日历：发布时刻与「今天」的口径
 *
 * 三条曾经踩过的：
 *   1. FOMC 决议在会议最后一天美东 14:00 发布，换成北京时间已经跨到次日，
 *      而旧代码把 date 直接写成会议结束日、time 写死 02:00 —— 整整差一天。
 *   2. BLS 发布时刻按月粗判夏令时，3 月上旬与 11 月初各差 1 小时。
 *   3. getCalendar 用 UTC 日期当「今天」并连缓存一起存 6 小时，
 *      北京凌晨那段窗口里日历会整夜把已发布事件标成「即将发布」。
 *
 * 这里用合成样本（与官网/ICS 同构）钉住解析结果，不依赖网络。
 * ================================================================== */

import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  CAL_CACHE_TTL_MS,
  blsReleaseBeijing,
  calCache,
  eventTradingDate,
  getCalendar,
  parseBlsIcs,
  parseFomcCalendar,
} from '../src/server/services/calendar.service.js';

afterEach(() => {
  vi.useRealTimers();
  calCache.clear();
});

/* ------------------------------------------------------------------ *
 * FOMC
 * ------------------------------------------------------------------ */

describe('FOMC：会议结束日 → 北京发布日', () => {
  // 美联储官网经文本代理后的形状：`**January**` 后紧跟 `27-28` / `17-18*`
  const SAMPLE = [
    '# 2026 FOMC Meetings',
    '**January**',
    '27-28',
    '**March**',
    '17-18*',
    '**July**',
    '28-29',
    '**December**',
    '8-9',
  ].join('\n');

  const events = parseFomcCalendar(SAMPLE);

  it('四条会议全部解析出来', () => {
    expect(events.map((e) => e.startDate)).toEqual([
      '2026-01-27',
      '2026-03-17',
      '2026-07-28',
      '2026-12-08',
    ]);
  });

  it('日期是北京的次日，不是会议结束日', () => {
    // 1 月 27-28 日会议 → 决议 28 日美东 14:00 = 北京 29 日 03:00
    expect(events[0]).toMatchObject({
      date: '2026-01-29',
      time: '03:00',
      meetingEnd: '2026-01-28',
      releaseAt: '2026-01-28T19:00:00.000Z',
    });
    // 旧代码会给 date=2026-01-28 / time=02:00：差一天又差一小时
    expect(events[0].date).not.toBe(events[0].meetingEnd);
  });

  it('时刻随夏令时切换：冬令时 03:00、夏令时 02:00', () => {
    const byStart = Object.fromEntries(events.map((e) => [e.startDate, e]));
    expect(byStart['2026-01-27'].time).toBe('03:00'); // EST
    expect(byStart['2026-03-17'].time).toBe('02:00'); // 3/17 已在 EDT
    expect(byStart['2026-07-28'].time).toBe('02:00'); // EDT
    expect(byStart['2026-12-08'].time).toBe('03:00'); // EST
  });

  it('每次会议的 releaseAt 都落在美东 14:00 —— 即 UTC 18 点（EDT）或 19 点（EST）', () => {
    for (const e of events) {
      const utcHour = new Date(e.releaseAt).getUTCHours();
      expect([18, 19], `${e.startDate} 的 UTC 小时应为 18（EDT）或 19（EST）`).toContain(utcHour);
    }
  });

  it('带 * 的会议标注 SEP，不带的为 null', () => {
    expect(events[1].note).toBe('含经济预测摘要 SEP 与点阵图');
    expect(events[0].note).toBeNull();
  });

  it('跨月会议按结束日落到下个月', () => {
    const out = parseFomcCalendar(['# 2026 FOMC Meetings', '**October**', '31-1'].join('\n'));
    expect(out).toHaveLength(1);
    expect(out[0].startDate).toBe('2026-10-31');
    expect(out[0].meetingEnd).toBe('2026-11-01');
    // 2026-11-01 正是 DST 终点日：美东 02:00 就切回 EST 了，
    // 所以当天 14:00 已经是 UTC-5 → 19:00Z → 北京 11/2 03:00。
    // （写过 02:00 是口算错的，测试当场抓出来了。）
    expect(out[0]).toMatchObject({ date: '2026-11-02', time: '03:00' });
  });

  it('空输入与无年份文本不抛异常', () => {
    expect(parseFomcCalendar('')).toEqual([]);
    expect(parseFomcCalendar(null)).toEqual([]);
    expect(parseFomcCalendar('**January**\n27-28')).toEqual([]); // 没有年份不做猜测
  });
});

/* ------------------------------------------------------------------ *
 * BLS ICS
 * ------------------------------------------------------------------ */

describe('BLS ICS：发布时刻不按月粗判夏令时', () => {
  const ics = (summary, dateStr) =>
    ['BEGIN:VEVENT', `SUMMARY:${summary}`, `DTSTART;TZID=America/New_York:${dateStr}T083000`, 'END:VEVENT'].join('\r\n');

  const wrap = (...blocks) => ['BEGIN:VCALENDAR', ...blocks, 'END:VCALENDAR'].join('\r\n');

  it('3 月上旬的非农仍是冬令时 21:30（旧代码给 20:30）', () => {
    const out = parseBlsIcs(wrap(ics('Employment Situation', '20260306')));
    expect(out[0]).toMatchObject({ date: '2026-03-06', time: '21:30', kind: 'nfp' });
    expect(out[0].releaseAt).toBe('2026-03-06T13:30:00.000Z');
  });

  it('3 月中旬（DST 已开始）的 CPI 是 20:30', () => {
    const out = parseBlsIcs(wrap(ics('Consumer Price Index', '20260311')));
    expect(out[0]).toMatchObject({ date: '2026-03-11', time: '20:30', kind: 'cpi' });
  });

  it('11 月初（DST 尚未结束）仍是 20:30（旧代码给 21:30）', () => {
    // 2027 年 DST 终点是 11/7，所以 11/5 还在夏令时
    const out = parseBlsIcs(wrap(ics('Employment Situation', '20271105')));
    expect(out[0]).toMatchObject({ date: '2027-11-05', time: '20:30' });
  });

  it('同一天同一指标只保留一条', () => {
    const out = parseBlsIcs(wrap(ics('Consumer Price Index', '20260311'), ics('Consumer Price Index', '20260311')));
    expect(out).toHaveLength(1);
  });

  it('不关心的发布会被过滤', () => {
    const out = parseBlsIcs(wrap(ics('Employment Cost Index', '20260306')));
    expect(out).toEqual([]);
  });

  it('缺 DTSTART 或 SUMMARY 的块被跳过而不抛', () => {
    const out = parseBlsIcs('BEGIN:VEVENT\r\nSUMMARY:Consumer Price Index\r\nEND:VEVENT');
    expect(out).toEqual([]);
  });

  it('结果按日期升序', () => {
    const out = parseBlsIcs(wrap(
      ics('Consumer Price Index', '20260311'),
      ics('Employment Situation', '20260306'),
    ));
    expect(out.map((e) => e.date)).toEqual(['2026-03-06', '2026-03-11']);
  });
});

describe('BLS 月度日程页的发布时刻', () => {
  it('同一月份内，冬令时日与夏令时日的时刻不同', () => {
    expect(blsReleaseBeijing(2026, 3, 6)).toMatchObject({ date: '2026-03-06', time: '21:30' });
    expect(blsReleaseBeijing(2026, 3, 11)).toMatchObject({ date: '2026-03-11', time: '20:30' });
  });

  it('12 月与 7 月分别是 21:30 / 20:30', () => {
    expect(blsReleaseBeijing(2026, 12, 10).time).toBe('21:30');
    expect(blsReleaseBeijing(2026, 7, 15).time).toBe('20:30');
  });

  it('releaseAt 与 date/time 自洽', () => {
    const r = blsReleaseBeijing(2026, 3, 6);
    expect(r.releaseAt).toBe('2026-03-06T13:30:00.000Z');
    expect(new Date(r.releaseAt).toISOString().slice(0, 10)).toBe('2026-03-06');
  });
});

/* ------------------------------------------------------------------ *
 * getCalendar：today / upcoming 不跟着缓存变旧
 * ------------------------------------------------------------------ */

describe('getCalendar：today 按北京时间，缓存只存原始事件', () => {
  /** 塞一份合成事件进缓存，避免联网 */
  function seed(events) {
    calCache.set('cal', {
      at: Date.now(),
      events,
      errors: [],
      coverage: { monthsFetched: [] },
    });
  }

  const EVENTS = [
    { date: '2025-12-31', time: '21:30', kind: 'cpi', title: '昨天已发布', importance: 3 },
    { date: '2026-01-01', time: '21:30', kind: 'nfp', title: '今天', importance: 3 },
    { date: '2026-01-02', time: '21:30', kind: 'ppi', title: '明天', importance: 2 },
  ];

  it('北京凌晨 02:00 时 today 是当天，已发布的不再算「即将发布」', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T02:00:00+08:00'));
    seed(EVENTS);

    const cal = await getCalendar();
    // 这个瞬间的 UTC 日期还是 2025-12-31，旧口径会把 12-31 也算进 upcoming
    expect(new Date().toISOString().slice(0, 10)).toBe('2025-12-31');
    expect(cal.today).toBe('2026-01-01');
    expect(cal.upcoming.map((e) => e.date)).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('缓存命中时 today 与 upcoming 仍按请求当刻重算', async () => {
    vi.useFakeTimers();
    seed(EVENTS);
    calCache.get('cal').at = Date.now(); // 视为刚抓到的

    vi.setSystemTime(new Date('2026-01-01T02:00:00+08:00'));
    const early = await getCalendar();
    expect(early.today).toBe('2026-01-01');
    const fetchedAt = early.fetchedAt;

    // 同一条缓存，时间推到三天后
    vi.setSystemTime(new Date('2026-01-04T02:00:00+08:00'));
    const later = await getCalendar();
    expect(later.today).toBe('2026-01-04');
    expect(later.upcoming).toEqual([]); // 全部已过去
    expect(later.fetchedAt).toBe(fetchedAt); // 数据确实是旧的，别假装新
    expect(later.generatedAt).not.toBe(early.generatedAt);
  });

  it('缓存过期才重新抓（此处用超时判断，不触网）', () => {
    vi.useFakeTimers();
    seed(EVENTS);
    const at = calCache.get('cal').at;
    expect(Date.now() - at).toBeLessThan(CAL_CACHE_TTL_MS);
    expect(CAL_CACHE_TTL_MS).toBe(6 * 3600_000);
  });
});

/* ------------------------------------------------------------------ *
 * 事件研究：把发布瞬间投影成各市场的交易日
 *
 * 日线用的是「交易所本地日期」，而日历里的 date 是北京日期。
 * FOMC 在北京是次日凌晨，若直接拿北京日期去匹配美股日线就会整体错位一天——
 * 这比「显示错一天」更隐蔽：统计量照样算得出来，只是算的不是那回事。
 * ------------------------------------------------------------------ */

describe('事件研究：发布瞬间 → 市场交易日', () => {
  const DATES = [
    '2026-01-26', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30',
    '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12',
  ];
  const US = { tz: 'America/New_York', closeHour: 16 };
  const CN = { tz: 'Asia/Shanghai', closeHour: 15 };
  const UTC = { tz: 'UTC', closeHour: 24 };

  const FOMC_EV = { releaseAt: '2026-01-28T19:00:00.000Z', date: '2026-01-29' };
  const CPI_EV = { releaseAt: '2026-11-10T13:30:00.000Z', date: '2026-11-10' };

  it('FOMC：美股当天，A 股次日（而不是两边都用北京日期）', () => {
    // 美东 01-28 14:00（收盘前）→ 美股 01-28
    expect(eventTradingDate(FOMC_EV, US, DATES)).toBe('2026-01-28');
    // 北京 01-29 03:00（开盘前）→ A 股 01-29
    expect(eventTradingDate(FOMC_EV, CN, DATES)).toBe('2026-01-29');
  });

  it('CPI：美股当天，A 股要等到次日（北京 20:30 已收盘）', () => {
    expect(eventTradingDate(CPI_EV, US, DATES)).toBe('2026-11-10');
    expect(eventTradingDate(CPI_EV, CN, DATES)).toBe('2026-11-11');
  });

  it('加密按 UTC 日界，发布当天即当日', () => {
    expect(eventTradingDate(FOMC_EV, UTC, DATES)).toBe('2026-01-28');
    expect(eventTradingDate(CPI_EV, UTC, DATES)).toBe('2026-11-10');
  });

  it('发布日落在非交易日时，取之后第一个交易日', () => {
    const noJan29 = DATES.filter((d) => d !== '2026-01-29');
    // A 股视角的目标日是 01-29，日线里没有 → 顺延到 01-30
    expect(eventTradingDate(FOMC_EV, CN, noJan29)).toBe('2026-01-30');
  });

  it('缺 releaseAt 时退回北京日期，缺日线时退回 null', () => {
    expect(eventTradingDate({ date: '2026-01-29' }, US, DATES)).toBe('2026-01-29');
    expect(eventTradingDate({ releaseAt: '2027-06-01T00:00:00Z' }, US, DATES)).toBeNull();
    expect(eventTradingDate(FOMC_EV, US, [])).toBe('2026-01-29');
    expect(eventTradingDate(null, US, DATES)).toBeNull();
  });
});
