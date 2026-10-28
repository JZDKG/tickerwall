/* ================================================================== *
 * 预期台账（产品 2.4 服务层）
 *
 * 这一层不重新判定，只整理。所以测试的重点是：
 *   · 判定口径只有一处（不能在这里出现第二套判断）；
 *   · 日历挂了要说清是「取不到」还是「确实没有」；
 *   · 已公布 / 待公布分开（读者看这一屏的两个问题不同）。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { getExpectationLedger } from '../src/server/services/expectations.service.js';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');

const fakeCalendar = (upcoming) => async () => ({
  ok: true,
  fetchedAt: '2026-10-28T11:00:00.000Z',
  coverage: { months: 5 },
  upcoming,
});

const entry = (over = {}) => ({
  id: 'x',
  title: 'CPI 同比',
  releaseAt: '2026-10-27T12:00:00.000Z',
  expected: 2.3,
  actual: 2.6,
  unit: '%',
  ...over,
});

describe('正常台账', () => {
  it('把已公布与待公布分开', async () => {
    const ledger = await getExpectationLedger({
      nowMs: NOW,
      deps: {
        getCalendar: fakeCalendar([
          entry({ id: 'a' }),
          entry({ id: 'b', releaseAt: '2026-10-30T12:00:00.000Z', actual: null }),
        ]),
      },
    });
    expect(ledger.ok).toBe(true);
    expect(ledger.released).toHaveLength(1);
    expect(ledger.pending).toHaveLength(1);
    expect(ledger.released[0].verdict).toBe('above');
  });

  it('带给读者看的元信息：检查时刻与日历抓取时刻分开', async () => {
    const ledger = await getExpectationLedger({ nowMs: NOW, deps: { getCalendar: fakeCalendar([entry()]) } });
    expect(ledger.checkedAt).toBe(new Date(NOW).toISOString());
    expect(ledger.calendarFetchedAt).toBe('2026-10-28T11:00:00.000Z');
    expect(ledger.checkedAt).not.toBe(ledger.calendarFetchedAt);
  });

  it('有偏差的那几条在 summary.deviated 里', async () => {
    const ledger = await getExpectationLedger({ nowMs: NOW, deps: { getCalendar: fakeCalendar([entry()]) } });
    expect(ledger.deviated).toHaveLength(1);
    expect(ledger.deviated[0].title).toBe('CPI 同比');
  });

  it('空日历给 empty 而不是 unavailable（两件事不能混）', async () => {
    const ledger = await getExpectationLedger({ nowMs: NOW, deps: { getCalendar: fakeCalendar([]) } });
    expect(ledger.status).toBe('empty');
    expect(ledger.ok).toBe(true);
    expect(ledger.total).toBe(0);
  });
});

describe('日历取不到', () => {
  it('给 unavailable 并带上原因，不抛', async () => {
    const ledger = await getExpectationLedger({
      nowMs: NOW,
      deps: {
        getCalendar: async () => {
          throw new Error('upstream 502');
        },
      },
    });
    expect(ledger.ok).toBe(false);
    expect(ledger.status).toBe('unavailable');
    expect(ledger.reason).toContain('502');
    expect(ledger.released).toEqual([]);
  });

  it('取不到时也不给合成分数', async () => {
    const ledger = await getExpectationLedger({
      nowMs: NOW,
      deps: { getCalendar: async () => { throw new Error('x'); } },
    });
    expect(JSON.stringify(ledger)).not.toContain('rate');
  });
});

describe('口径只在 domain 一处', () => {
  it('服务层不改判 domain 的结论（同样的输入给出同样的 verdict）', async () => {
    const cal = [entry({ expected: 2, actual: 2.005 })];
    const ledger = await getExpectationLedger({ nowMs: NOW, deps: { getCalendar: fakeCalendar(cal) } });
    // domain 的容差判定结果是 inLine，服务层不该把「小幅超出」升格成 above
    expect(ledger.released[0].verdict).toBe('inLine');
  });

  it('limit 透传', async () => {
    const many = Array.from({ length: 20 }, (_, i) => entry({ id: `e${i}` }));
    const ledger = await getExpectationLedger({ nowMs: NOW, limit: 3, deps: { getCalendar: fakeCalendar(many) } });
    expect(ledger.total).toBe(3);
  });
});
