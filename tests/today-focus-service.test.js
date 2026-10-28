/* ================================================================== *
 * 今天重点三件的服务层（产品 §3）
 *
 * 事件与发布是两条独立数据线：一条挂了另一条照常给。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { beijingDay, getTodayFocus } from '../src/server/services/today-focus.service.js';

const NOW = Date.parse('2026-10-28T04:00:00.000Z'); // 北京 12:00 → 2026-10-28

const ev = (over = {}) => ({ id: 'e1', time: '2026-10-28 10:00:00', title: 'A', level: 'high', symbols: ['oil'], ...over });

describe('今天怎么算', () => {
  it('按北京时间算日期（不是 UTC）', () => {
    expect(beijingDay(NOW)).toBe('2026-10-28');
  });

  it('UTC 与北京跨日时以北京为准', () => {
    // UTC 2026-10-27 17:00 = 北京 2026-10-28 01:00
    expect(beijingDay(Date.parse('2026-10-27T17:00:00.000Z'))).toBe('2026-10-28');
  });
});

describe('两条数据线独立', () => {
  it('都正常时给出 focus 与 next', async () => {
    const out = await getTodayFocus({
      nowMs: NOW,
      deps: {
        getEvents: async () => ({ items: [ev()] }),
        getCalendar: async () => ({ upcoming: [{ id: 'c', title: 'CPI', releaseAt: '2026-10-29T12:00:00.000Z', importance: 'high' }] }),
      },
    });
    expect(out.count).toBe(1);
    expect(out.next.title).toBe('CPI');
    expect(out.eventsError).toBeNull();
    expect(out.calendarError).toBeNull();
  });

  it('日历挂了 focus 照常（next 为 null）', async () => {
    const out = await getTodayFocus({
      nowMs: NOW,
      deps: {
        getEvents: async () => ({ items: [ev()] }),
        getCalendar: async () => { throw new Error('cal 502'); },
      },
    });
    expect(out.count).toBe(1);
    expect(out.next).toBeNull();
    expect(out.calendarError).toContain('502');
  });

  it('事件挂了 next 照常', async () => {
    const out = await getTodayFocus({
      nowMs: NOW,
      deps: {
        getEvents: async () => { throw new Error('ev 502'); },
        getCalendar: async () => ({ upcoming: [{ id: 'c', title: 'CPI', releaseAt: '2026-10-29T12:00:00.000Z', importance: 'high' }] }),
      },
    });
    expect(out.count).toBe(0);
    expect(out.next.title).toBe('CPI');
    expect(out.eventsError).toContain('502');
  });

  it('回传当天日期与检查时刻', async () => {
    const out = await getTodayFocus({ nowMs: NOW, deps: { getEvents: async () => ({ items: [] }), getCalendar: async () => null } });
    expect(out.day).toBe('2026-10-28');
    expect(out.checkedAt).toBe(new Date(NOW).toISOString());
  });

  it('payload 没有 items 时按空处理（不抛）', async () => {
    const out = await getTodayFocus({ nowMs: NOW, deps: { getEvents: async () => ({}), getCalendar: async () => null } });
    expect(out.count).toBe(0);
  });
});
