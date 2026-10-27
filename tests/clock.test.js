/* ================================================================== *
 * 时区换算契约
 *
 * 这里钉的是三件曾经写错、而且错了不报错只看得出「差一天」的事：
 *
 *   1. 美国夏令时不是「3 月到 10 月」，而是 3 月第二个周日 2:00 到
 *      11 月第一个周日 2:00 —— 边界上最多 13 天差 1 小时。
 *   2. 美东 14:00 / 08:30 换到北京时间会跨日，日期要跟着动。
 *   3. 「今天」必须按北京时间算，UTC 日期在北京凌晨会落后一天。
 *
 * 期望值全部写成字面量，并且用 nthSunday 独立复算 DST 边界，
 * 不复用 clock.js 的任何逻辑 —— 否则测的只是「实现等于自己」。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  BEIJING_TZ,
  EASTERN_TZ,
  beijingClock,
  beijingDate,
  beijingToday,
  isValidTimeZone,
  normalizeTimeZone,
  toBeijingRelease,
  zonedParts,
  zonedTimeToUtc,
} from '../src/server/domain/clock.js';

/** 某年某月的第 n 个周日（美国 DST 边界就是这么定义的） */
function nthSunday(year, month, n) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
}

describe('时区读数：zonedParts', () => {
  it('同一 UTC 瞬间在不同时区给出各自的墙钟', () => {
    const t = Date.UTC(2026, 0, 15, 17, 0); // 2026-01-15T17:00Z
    expect(zonedParts(t, EASTERN_TZ)).toMatchObject({ year: 2026, month: 1, day: 15, hour: 12, minute: 0 });
    expect(zonedParts(t, BEIJING_TZ)).toMatchObject({ year: 2026, month: 1, day: 16, hour: 1, minute: 0 });
    expect(zonedParts(t, 'UTC')).toMatchObject({ hour: 17, minute: 0 });
  });

  it('午夜归一到 0 点，不出现 24', () => {
    const t = Date.UTC(2026, 0, 15, 0, 0);
    expect(zonedParts(t, 'UTC').hour).toBe(0);
    expect(zonedParts(t, BEIJING_TZ).hour).toBe(8);
  });

  it('非法时区返回 null，不抛', () => {
    expect(zonedParts(Date.now(), 'Mars/Olympus')).toBeNull();
    expect(zonedParts(NaN, 'UTC')).toBeNull();
  });
});

describe('墙钟 → UTC：zonedTimeToUtc', () => {
  it('冬令时按 UTC-5（EST）换算', () => {
    const t = zonedTimeToUtc(2026, 1, 15, 12, 0, EASTERN_TZ);
    expect(new Date(t).toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('夏令时按 UTC-4（EDT）换算', () => {
    const t = zonedTimeToUtc(2026, 7, 15, 12, 0, EASTERN_TZ);
    expect(new Date(t).toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });

  it('3 月：DST 起点前一秒仍是冬令时，起点后一秒是夏令时', () => {
    const start = nthSunday(2026, 3, 2); // 2026-03-08
    expect(start).toBe(8);

    // 3 月 7 日（起点之前）：EST，UTC-5
    expect(new Date(zonedTimeToUtc(2026, 3, 7, 12, 0, EASTERN_TZ)).toISOString())
      .toBe('2026-03-07T17:00:00.000Z');
    // 3 月 9 日（起点之后）：EDT，UTC-4
    expect(new Date(zonedTimeToUtc(2026, 3, 9, 12, 0, EASTERN_TZ)).toISOString())
      .toBe('2026-03-09T16:00:00.000Z');
  });

  it('11 月：DST 终点前一秒仍是夏令时，终点后恢复冬令时', () => {
    const end = nthSunday(2026, 11, 1);
    expect(end).toBe(1);

    // 2026-11-01 恰好是终点日，所以取 2027 年（终点 11/7）才有前后可比
    expect(nthSunday(2027, 11, 1)).toBe(7);
    expect(new Date(zonedTimeToUtc(2027, 11, 6, 12, 0, EASTERN_TZ)).toISOString())
      .toBe('2027-11-06T16:00:00.000Z'); // 仍是 EDT
    expect(new Date(zonedTimeToUtc(2027, 11, 8, 12, 0, EASTERN_TZ)).toISOString())
      .toBe('2027-11-08T17:00:00.000Z'); // 已切回 EST
  });

  it('多年 DST 边界都与 nthSunday 复算一致', () => {
    for (let y = 2024; y <= 2030; y += 1) {
      const start = nthSunday(y, 3, 2);
      const end = nthSunday(y, 11, 1);
      const beforeStart = zonedTimeToUtc(y, 3, start - 1, 12, 0, EASTERN_TZ);
      const afterStart = zonedTimeToUtc(y, 3, start + 1, 12, 0, EASTERN_TZ);
      const beforeEnd = zonedTimeToUtc(y, 11, end - 1, 12, 0, EASTERN_TZ);
      const afterEnd = zonedTimeToUtc(y, 11, end + 1, 12, 0, EASTERN_TZ);
      // 起点前/终点后 = 17:00Z（EST）；起点后/终点前 = 16:00Z（EDT）
      expect(new Date(beforeStart).getUTCHours(), `${y} 3/${start - 1} 应为 EST`).toBe(17);
      expect(new Date(afterStart).getUTCHours(), `${y} 3/${start + 1} 应为 EDT`).toBe(16);
      expect(new Date(beforeEnd).getUTCHours(), `${y} 11/${end - 1} 应为 EDT`).toBe(16);
      expect(new Date(afterEnd).getUTCHours(), `${y} 11/${end + 1} 应为 EST`).toBe(17);
    }
  });

  it('round-trip：UTC → 墙钟 → UTC 回到原值', () => {
    const cases = [
      Date.UTC(2026, 0, 1, 0, 0),
      Date.UTC(2026, 2, 8, 6, 59),
      Date.UTC(2026, 10, 1, 5, 59),
      Date.UTC(2027, 6, 4, 23, 45),
    ];
    for (const t of cases) {
      for (const tz of [EASTERN_TZ, BEIJING_TZ, 'UTC', 'Asia/Tokyo', 'Europe/London']) {
        const p = zonedParts(t, tz);
        const back = zonedTimeToUtc(p.year, p.month, p.day, p.hour, p.minute, tz);
        expect(back, `${tz} @ ${new Date(t).toISOString()}`).toBe(t);
      }
    }
  });

  it('非法时区或非数字入参返回 null', () => {
    expect(zonedTimeToUtc(2026, 1, 15, 12, 0, 'Mars/Olympus')).toBeNull();
    expect(zonedTimeToUtc(NaN, 1, 15, 12, 0, 'UTC')).toBeNull();
  });
});

describe('投影到北京：toBeijingRelease', () => {
  it('美东 14:00 的 FOMC 决议跨到北京次日凌晨', () => {
    // 冬令时：14:00 EST = 19:00Z = 北京次日 03:00
    expect(toBeijingRelease(zonedTimeToUtc(2026, 1, 28, 14, 0, EASTERN_TZ)))
      .toEqual({ date: '2026-01-29', time: '03:00', releaseAt: '2026-01-28T19:00:00.000Z' });
    // 夏令时：14:00 EDT = 18:00Z = 北京次日 02:00
    expect(toBeijingRelease(zonedTimeToUtc(2026, 7, 29, 14, 0, EASTERN_TZ)))
      .toEqual({ date: '2026-07-30', time: '02:00', releaseAt: '2026-07-29T18:00:00.000Z' });
  });

  it('美东 08:30 的 BLS 数据不跨日，但时刻随夏令时变', () => {
    expect(toBeijingRelease(zonedTimeToUtc(2026, 3, 6, 8, 30, EASTERN_TZ)))
      .toMatchObject({ date: '2026-03-06', time: '21:30' }); // 3/6 仍是 EST
    expect(toBeijingRelease(zonedTimeToUtc(2026, 3, 11, 8, 30, EASTERN_TZ)))
      .toMatchObject({ date: '2026-03-11', time: '20:30' }); // 3/8 之后是 EDT
    expect(toBeijingRelease(zonedTimeToUtc(2027, 11, 5, 8, 30, EASTERN_TZ)))
      .toMatchObject({ date: '2027-11-05', time: '20:30' }); // 11/7 终点之前，仍是 EDT
  });

  it('beijingDate / beijingClock 与 toBeijingRelease 一致', () => {
    const t = Date.UTC(2026, 0, 28, 19, 0);
    expect(beijingDate(t)).toBe('2026-01-29');
    expect(beijingClock(t)).toBe('03:00');
  });

  it('非有限值返回 null', () => {
    expect(toBeijingRelease(null)).toBeNull();
    expect(toBeijingRelease(NaN)).toBeNull();
    expect(beijingDate(undefined)).toBeNull();
  });
});

describe('北京时间「今天」：beijingToday', () => {
  it('北京凌晨 00:00–08:00 不退回昨天（UTC 日期此刻还是昨天）', () => {
    // 北京 2026-01-01 02:00 = UTC 2025-12-31 18:00
    const t = Date.parse('2026-01-01T02:00:00+08:00');
    expect(new Date(t).toISOString().slice(0, 10)).toBe('2025-12-31'); // 旧口径确实差一天
    expect(beijingToday(t)).toBe('2026-01-01');
  });

  it('跨过北京午夜就换日', () => {
    expect(beijingToday(Date.parse('2026-01-01T23:59:00+08:00'))).toBe('2026-01-01');
    expect(beijingToday(Date.parse('2026-01-02T00:01:00+08:00'))).toBe('2026-01-02');
  });

  it('整个北京日内的任意时刻都返回同一天', () => {
    for (const h of [0, 3, 7, 8, 9, 12, 18, 23]) {
      const iso = `2026-03-08T${String(h).padStart(2, '0')}:30:00+08:00`;
      expect(beijingToday(Date.parse(iso)), iso).toBe('2026-03-08');
    }
  });
});

describe('时区标识规整：normalizeTimeZone', () => {
  it('IANA 名原样返回', () => {
    expect(normalizeTimeZone('America/New_York')).toBe('America/New_York');
    expect(normalizeTimeZone('Asia/Shanghai')).toBe('Asia/Shanghai');
    expect(normalizeTimeZone('UTC')).toBe('UTC');
  });

  it('Windows 时区名映射成 IANA（ICS 里很常见）', () => {
    expect(normalizeTimeZone('Eastern Standard Time')).toBe('America/New_York');
    expect(normalizeTimeZone('pacific standard time')).toBe('America/Los_Angeles');
    expect(normalizeTimeZone('Coordinated Universal Time')).toBe('UTC');
  });

  it('空值与乱写退回 fallback，绝不抛', () => {
    expect(normalizeTimeZone('', 'America/New_York')).toBe('America/New_York');
    expect(normalizeTimeZone(null, 'America/New_York')).toBe('America/New_York');
    expect(normalizeTimeZone('Nonsense/Zone', 'America/New_York')).toBe('America/New_York');
    expect(normalizeTimeZone('   ')).toBe('UTC');
  });

  it('isValidTimeZone 与 Intl 判定一致', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(123)).toBe(false);
  });
});
