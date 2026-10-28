/* ================================================================== *
 * 今天重点三件 + 下一件关键发布（产品 §3）
 *
 * 排序必须可解释，而且**不足三件不凑数**。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { buildTodayFocus, nextKeyRelease, pickTodayFocus, titleKey } from '../src/server/domain/today-focus.js';

const DAY = '2026-10-28';
const NOW = Date.parse('2026-10-28T04:00:00.000Z'); // 北京 12:00

const ev = (over = {}) => ({
  id: 'e1',
  time: `${DAY} 10:00:00`,
  title: '美联储官员讲话',
  level: 'mid',
  symbols: [],
  ...over,
});

describe('指纹', () => {
  it('去掉转载前缀与标点', () => {
    expect(titleKey('【快讯】美联储官员讲话')).toBe(titleKey('快讯: 美联储官员讲话。'));
  });
});

describe('排序规则可解释', () => {
  it('高等级优先于中等级', () => {
    const rows = pickTodayFocus({
      day: DAY,
      items: [ev({ id: 'a', level: 'mid', title: 'A' }), ev({ id: 'b', level: 'high', title: 'B' })],
    });
    expect(rows[0].id).toBe('b');
  });

  it('同等级下「关联可解释标的」优先（值得知道 ≠ 热闹）', () => {
    const rows = pickTodayFocus({
      day: DAY,
      items: [
        ev({ id: 'a', level: 'mid', title: 'A', symbols: [] }),
        ev({ id: 'b', level: 'mid', title: 'B', symbols: ['gold-intl'] }),
      ],
    });
    expect(rows[0].id).toBe('b');
  });

  it('每条都写清为什么在前面', () => {
    const rows = pickTodayFocus({ day: DAY, items: [ev({ level: 'high', symbols: ['oil'] })] });
    expect(rows[0].why).toContain('高等级');
    expect(rows[0].why).toContain('oil');
  });

  it('什么都不是时也给一句可读的依据（不空着）', () => {
    const rows = pickTodayFocus({ day: DAY, items: [ev({ level: null, symbols: [] })] });
    expect(rows[0].why).toBe('当天事件');
  });
});

describe('只取今天', () => {
  it('昨天的不算', () => {
    expect(pickTodayFocus({ day: DAY, items: [ev({ time: '2026-10-27 10:00:00' })] })).toEqual([]);
  });

  it('没有标题的不算（无法展示也无法去重）', () => {
    expect(pickTodayFocus({ day: DAY, items: [ev({ title: '' })] })).toEqual([]);
  });

  it('转载合并成一个位置并记条数', () => {
    const rows = pickTodayFocus({
      day: DAY,
      items: [ev({ id: 'a' }), ev({ id: 'b', title: '【转载】美联储官员讲话' })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toBe(2);
  });
});

describe('不足三件不凑数', () => {
  it('只有一件时 short=true', () => {
    const out = buildTodayFocus({ day: DAY, items: [ev()], nowMs: NOW });
    expect(out.count).toBe(1);
    expect(out.short).toBe(true);
  });

  it('三件时 short=false', () => {
    const out = buildTodayFocus({
      day: DAY,
      nowMs: NOW,
      items: [ev({ id: 'a', title: 'A' }), ev({ id: 'b', title: 'B' }), ev({ id: 'c', title: 'C' })],
    });
    expect(out.count).toBe(3);
    expect(out.short).toBe(false);
  });

  it('超过三件只取三件', () => {
    const many = Array.from({ length: 8 }, (_, i) => ev({ id: `e${i}`, title: `标题 ${i}` }));
    expect(buildTodayFocus({ day: DAY, items: many, nowMs: NOW }).count).toBe(3);
  });

  it('一件都没有时 count=0，但仍给出排序规则说明', () => {
    const out = buildTodayFocus({ day: DAY, items: [], nowMs: NOW });
    expect(out.count).toBe(0);
    expect(out.rule).toContain('转载只占一位');
  });
});

describe('下一件关键发布', () => {
  const calendar = {
    upcoming: [
      { id: 'x', title: 'CPI', releaseAt: '2026-10-29T12:00:00.000Z', importance: 'high' },
      { id: 'y', title: '低保等级数据', releaseAt: '2026-10-28T06:00:00.000Z', importance: 'low' },
      { id: 'z', title: '已过去的', releaseAt: '2026-10-27T06:00:00.000Z', importance: 'high' },
      { id: 'w', title: '中等级', releaseAt: '2026-10-28T08:00:00.000Z', importance: 'medium' },
    ],
  };

  it('取最近的、达到重要性门槛的那一件', () => {
    const next = nextKeyRelease({ calendar, nowMs: NOW });
    expect(next.id).toBe('w');
    expect(next.inMs).toBeGreaterThan(0);
  });

  it('门槛可调（只要 high 时给 high 那件）', () => {
    expect(nextKeyRelease({ calendar, nowMs: NOW, minImportance: 'high' }).id).toBe('x');
  });

  it('过去的不算未来发布', () => {
    const next = nextKeyRelease({
      calendar: { upcoming: [{ id: 'z', title: '过去', releaseAt: '2026-10-27T06:00:00.000Z', importance: 'high' }] },
      nowMs: NOW,
    });
    expect(next).toBeNull();
  });

  it('没有日历或没有条目时给 null（不是空对象）', () => {
    expect(nextKeyRelease({ calendar: null, nowMs: NOW })).toBeNull();
    expect(nextKeyRelease({ calendar: { upcoming: [] }, nowMs: NOW })).toBeNull();
  });

  it('只报事实，不带预测词汇', () => {
    const next = nextKeyRelease({ calendar, nowMs: NOW });
    const text = JSON.stringify(next);
    for (const word of ['预期', '预计', '将会', '可能']) expect(text).not.toContain(word);
  });
});
