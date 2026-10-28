/* ================================================================== *
 * 事件归档与实时快照的合并（services/events.service.js 的纯函数部分）
 *
 * 这里的每条分支都在守一个「时间」上的判断，而时间错一天用户是看不出来的：
 *   · 时间窗**两头都卡**：上界不是多余的 —— 源里混着「2027-03-22」这种
 *     提前发布的会议公告，把未来事件算进 24h 回放，柱状图最后一根会凭空多出来；
 *   · 去重方向是「实时覆盖归档」：归档里的 level/topics 是写入那刻算的，
 *     实时那份可能被 LLM 复核改过，应以它为准；
 *   · 归档不满 24h 时 coverageFrom 要如实给出，不能让时间轴假装有 24 小时。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { eventTimeMs, mergeHistoryRows } from '../src/server/services/events.service.js';

// 北京时间 12:00 = UTC 04:00
const bj = (iso) => iso; // 形如 '2026-10-28 12:00:00'

describe('时间解析', () => {
  it('按北京时间解析（不是 UTC，也不是本地时区）', () => {
    expect(eventTimeMs('2026-10-28 12:00:00')).toBe(Date.parse('2026-10-28T04:00:00.000Z'));
  });

  it('解析不了时给 null（不是 NaN 也不是 0）', () => {
    expect(eventTimeMs('')).toBeNull();
    expect(eventTimeMs(null)).toBeNull();
    expect(eventTimeMs('不是时间')).toBeNull();
  });
});

describe('合并与去重', () => {
  const nowMs = Date.parse('2026-10-28T04:00:00.000Z'); // 北京 12:00
  const sinceMs = nowMs - 24 * 3600_000;

  const row = (over = {}) => ({ id: 'e1', time: bj('2026-10-28 10:00:00'), level: 'mid', ...over });

  it('实时覆盖归档（LLM 复核过的分类以实时为准）', () => {
    const out = mergeHistoryRows({
      archiveRows: [row({ level: 'low', topics: ['旧'] })],
      liveItems: [row({ level: 'high', topics: ['新'] })],
      sinceMs,
      nowMs,
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].level).toBe('high');
  });

  it('未来事件被上界挡住（提前发布的公告不该进 24h 回放）', () => {
    const out = mergeHistoryRows({
      archiveRows: [row({ id: 'future', time: bj('2027-03-22 09:00:00') })],
      liveItems: [],
      sinceMs,
      nowMs,
    });
    expect(out.items).toHaveLength(0);
  });

  it('太早的事件被下界挡住', () => {
    const out = mergeHistoryRows({
      archiveRows: [row({ id: 'old', time: bj('2026-10-20 09:00:00') })],
      liveItems: [],
      sinceMs,
      nowMs,
    });
    expect(out.items).toHaveLength(0);
  });

  it('没有 id 的条目被丢掉（无法去重就无法合并）', () => {
    const out = mergeHistoryRows({
      archiveRows: [{ time: bj('2026-10-28 10:00:00'), level: 'mid' }],
      liveItems: [],
      sinceMs,
      nowMs,
    });
    expect(out.items).toHaveLength(0);
  });

  it('时间解析不了的条目被丢掉（不猜一个时间）', () => {
    const out = mergeHistoryRows({
      archiveRows: [row({ id: 'bad', time: '不是时间' })],
      liveItems: [],
      sinceMs,
      nowMs,
    });
    expect(out.items).toHaveLength(0);
  });

  it('按时间倒序，并受 limit 限制', () => {
    const rows = [
      row({ id: 'a', time: bj('2026-10-28 09:00:00') }),
      row({ id: 'b', time: bj('2026-10-28 11:00:00') }),
      row({ id: 'c', time: bj('2026-10-28 10:00:00') }),
    ];
    const out = mergeHistoryRows({ archiveRows: rows, liveItems: [], sinceMs, nowMs, limit: 2 });
    expect(out.items).toHaveLength(2);
    expect(out.items[0].id).toBe('b');
  });

  it('coverageFrom 是最早一条的时刻（归档不满 24h 要如实说）', () => {
    const out = mergeHistoryRows({
      archiveRows: [row({ id: 'a', time: bj('2026-10-28 10:00:00') }), row({ id: 'b', time: bj('2026-10-28 08:00:00') })],
      liveItems: [],
      sinceMs,
      nowMs,
    });
    expect(out.coverageFrom).toBe(new Date(eventTimeMs(bj('2026-10-28 08:00:00'))).toISOString());
  });

  it('一条都没有时 coverageFrom 为 null（不是 0 也不是今天）', () => {
    const out = mergeHistoryRows({ archiveRows: [], liveItems: [], sinceMs, nowMs });
    expect(out.items).toEqual([]);
    expect(out.coverageFrom).toBeNull();
  });

  it('空参数也能调用（默认值兜底）', () => {
    expect(() => mergeHistoryRows({ sinceMs, nowMs })).not.toThrow();
  });
});
