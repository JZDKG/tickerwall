/* ================================================================== *
 * 超预期判定（产品 2.4 第二块）
 *
 * 与「方向判定」是两个判定族，不能混用：
 *   方向判定 = 我以为会涨，实际涨了没有；
 *   超预期   = 我以为会是多少，实际是多少。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { judgeRelease, judgeCalendarReleases, summarizeReleases, SURPRISE } from '../src/server/domain/expectation-sources.js';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');

describe('未公布与无法判定是三件事', () => {
  it('还没到公布时间 → pending，不是无法判定', () => {
    const r = judgeRelease({ expected: 2, releaseAt: '2026-10-29T12:00:00.000Z', nowMs: NOW });
    expect(r.verdict).toBe('pending');
    expect(r.reason).toBe('NOT_RELEASED');
  });

  it('已公布但没有实际值 → undetermined + NO_ACTUAL', () => {
    const r = judgeRelease({ expected: 2, releaseAt: '2026-10-27T12:00:00.000Z', nowMs: NOW });
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toBe('NO_ACTUAL');
  });

  it('没有预期值 → undetermined + NO_EXPECTATION（没有标准就没有超预期）', () => {
    const r = judgeRelease({ actual: 2, nowMs: NOW });
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toBe('NO_EXPECTATION');
  });

  it('实际值是 0 时按「有值」处理，不按缺失', () => {
    const r = judgeRelease({ expected: 1, actual: 0, nowMs: NOW });
    expect(r.verdict).toBe('below');
  });
});

describe('超预期判定', () => {
  it('实际高于预期 → 高于预期，并给出差额', () => {
    const r = judgeRelease({ expected: 2, actual: 2.5, nowMs: NOW });
    expect(r.verdict).toBe('above');
    expect(r.gap).toBeCloseTo(0.5, 10);
  });

  it('实际低于预期 → 低于预期', () => {
    expect(judgeRelease({ expected: 2, actual: 1.5, nowMs: NOW }).verdict).toBe('below');
  });

  it('容差内 → 基本符合预期（不给一个方向上纲）', () => {
    expect(judgeRelease({ expected: 2, actual: 2.005, nowMs: NOW }).verdict).toBe('inLine');
  });

  it('容差随量级缩放：预期 0.05 时 0.1 的差是翻倍，不算符合', () => {
    expect(judgeRelease({ expected: 0.05, actual: 0.15, nowMs: NOW }).verdict).toBe('above');
  });

  it('同一个绝对差在大量级上算符合、小量级上不算（这是容差不写成绝对值的原因）', () => {
    const big = judgeRelease({ expected: 100, actual: 100.1, nowMs: NOW });
    const small = judgeRelease({ expected: 0.1, actual: 0.2, nowMs: NOW });
    expect(big.verdict).toBe('inLine');
    expect(small.verdict).toBe('above');
  });

  it('容差可调（不同指标精度不同）', () => {
    // 默认容差 = |预期| × 0.005 → 预期 2 时门限是 0.01
    expect(judgeRelease({ expected: 2, actual: 2.005, nowMs: NOW }).verdict).toBe('inLine');
    expect(judgeRelease({ expected: 2, actual: 2.005, nowMs: NOW, tolerance: 0.001 }).verdict).toBe('above');
  });
});

describe('可核对', () => {
  it('basis 写明标题、预期、实际与单位', () => {
    const r = judgeRelease({ title: 'CPI 同比', expected: 2.3, actual: 2.5, unit: '%', nowMs: NOW });
    expect(r.basis).toContain('CPI 同比');
    expect(r.basis).toContain('2.3');
    expect(r.basis).toContain('2.5');
    expect(r.basis).toContain('%');
  });

  it('缺预期时不写一个假的预期值', () => {
    const r = judgeRelease({ title: 'X', actual: 1, nowMs: NOW });
    expect(r.basis).toContain('无预期值');
  });
});

describe('从日历取条目', () => {
  const cal = {
    upcoming: [
      { id: 'a', title: 'CPI', releaseAt: '2026-10-27T12:00:00.000Z', expected: 2.3, actual: 2.6, unit: '%' },
      { id: 'b', title: '未来数据', releaseAt: '2026-10-30T12:00:00.000Z', expected: 1 },
      { id: 'c', title: '没实际值', releaseAt: '2026-10-28T00:00:00.000Z', expected: 1 },
      { id: 'd', releaseAt: '2026-10-27T12:00:00.000Z', expected: 1 },
      { id: 'e', title: '没时间', expected: 1 },
    ],
  };

  it('只留有标题且时间可解析的条目', () => {
    const items = judgeCalendarReleases(cal, { nowMs: NOW });
    const titles = items.map((x) => x.title);
    expect(titles).toContain('CPI');
    expect(titles).not.toContain(undefined);
    expect(items.every((x) => x.releaseAt)).toBe(true);
  });

  it('与预期有偏差的排在最前（那是读者要看的）', () => {
    const items = judgeCalendarReleases(cal, { nowMs: NOW });
    expect(['above', 'below']).toContain(items[0].verdict);
  });

  it('limit 生效', () => {
    expect(judgeCalendarReleases(cal, { nowMs: NOW, limit: 1 })).toHaveLength(1);
  });

  it('空日历 / 非数组都不抛', () => {
    expect(judgeCalendarReleases(null, { nowMs: NOW })).toEqual([]);
    expect(judgeCalendarReleases({ upcoming: 'x' }, { nowMs: NOW })).toEqual([]);
  });
});

describe('汇总不给命中率', () => {
  const items = judgeCalendarReleases({
    upcoming: [
      { id: 'a', title: 'A', releaseAt: '2026-10-27T12:00:00.000Z', expected: 1, actual: 2 },
      { id: 'b', title: 'B', releaseAt: '2026-10-27T12:00:00.000Z', expected: 1, actual: 1 },
      { id: 'c', title: 'C', releaseAt: '2026-10-30T12:00:00.000Z', expected: 1 },
    ],
  }, { nowMs: NOW });

  it('分类计数正确', () => {
    const s = summarizeReleases(items);
    expect(s.counts.above).toBe(1);
    expect(s.counts.inLine).toBe(1);
    expect(s.counts.pending).toBe(1);
    expect(s.total).toBe(3);
  });

  it('deviated 只挑与预期有偏差的', () => {
    const s = summarizeReleases(items);
    expect(s.deviated).toHaveLength(1);
    expect(s.deviated[0].title).toBe('A');
  });

  it('没有合成分数', () => {
    const s = summarizeReleases(items);
    expect(s.score).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain('rate');
  });

  it('词汇表里不出现因果暗示', () => {
    expect(Object.values(SURPRISE).join('')).not.toContain('导致');
  });
});
