/* ================================================================== *
 * 预期与实际（产品 2.4）的判定
 *
 * 这一层的价值全在「不肯乱说」：两侧缺一侧就不判、方向对了但幅度不够
 * 不说「符合」、汇总不给合成分数。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { compareExpectation, summarizeExpectations, VERDICT } from '../src/server/domain/expectations.js';

describe('两侧缺一侧就不判', () => {
  it('没有预期方向 → 无法判定，且带上原因', () => {
    const r = compareExpectation({ actual: { changePct: 1.2 } });
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toBe('NO_EXPECTATION');
  });

  it('预期方向是 0 → 也算没有预期（0 不是方向）', () => {
    expect(compareExpectation({ expectation: { direction: 0 }, actual: { changePct: 1 } }).verdict).toBe('undetermined');
  });

  it('没有实际变化 → 无法判定', () => {
    const r = compareExpectation({ expectation: { direction: 1 } });
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toBe('NO_ACTUAL');
  });

  it('实际变化是 null / 空串 → 按缺失处理，不按 0', () => {
    expect(compareExpectation({ expectation: { direction: 1 }, actual: { changePct: null } }).verdict).toBe('undetermined');
    expect(compareExpectation({ expectation: { direction: 1 }, actual: { changePct: '' } }).verdict).toBe('undetermined');
  });

  it('两侧都没有时也不抛', () => {
    expect(() => compareExpectation({})).not.toThrow();
    expect(compareExpectation().verdict).toBe('undetermined');
  });
});

describe('方向判定', () => {
  it('同向且没给量级 → 方向符合（不判幅度，因为没有标准）', () => {
    const r = compareExpectation({ expectation: { direction: 1 }, actual: { changePct: 0.3 } });
    expect(r.verdict).toBe('matched');
    expect(r.reason).toBeNull();
  });

  it('反向 → 方向相反', () => {
    const r = compareExpectation({ expectation: { direction: -1 }, actual: { changePct: 0.8 } });
    expect(r.verdict).toBe('opposite');
    expect(r.reason).toBe('OPPOSITE_SIGN');
  });

  it('几乎没动 → 单独一档，不算符合也不算相反', () => {
    const r = compareExpectation({ expectation: { direction: 1 }, actual: { changePct: 0 } });
    expect(r.verdict).toBe('flat');
  });

  it('方向允许写 up/down（上游两种写法都有）', () => {
    expect(compareExpectation({ expectation: { direction: 'up' }, actual: { changePct: 1 } }).verdict).toBe('matched');
    expect(compareExpectation({ expectation: { direction: 'down' }, actual: { changePct: -1 } }).verdict).toBe('matched');
  });
});

describe('量级判定', () => {
  it('给了预期量级但实际不足一半 → 幅度不足，不说符合', () => {
    const r = compareExpectation({
      expectation: { direction: 1, magnitudePct: 2 },
      actual: { changePct: 0.5 },
    });
    expect(r.verdict).toBe('weaker');
    expect(r.reason).toBe('MAGNITUDE_SHORT');
  });

  it('达到门限 → 方向符合', () => {
    const r = compareExpectation({
      expectation: { direction: 1, magnitudePct: 2 },
      actual: { changePct: 1.2 },
    });
    expect(r.verdict).toBe('matched');
  });

  it('门限可调（不同标的的「够不够」标准不同）', () => {
    const base = { expectation: { direction: 1, magnitudePct: 2 }, actual: { changePct: 1.2 } };
    expect(compareExpectation(base).verdict).toBe('matched');
    expect(compareExpectation({ ...base, weakerRatio: 0.8 }).verdict).toBe('weaker');
  });
});

describe('判定必须可核对', () => {
  it('每条判定都带 basis，写明拿什么和什么比', () => {
    const r = compareExpectation({ expectation: { direction: 1 }, actual: { changePct: 1.23 } });
    expect(r.basis).toContain('+1.23%');
    expect(r.basis).toContain('上行');
  });

  it('词汇表里没有「因果」字样的暗示（符合方向 ≠ 因为 X 所以 Y）', () => {
    const text = Object.values(VERDICT).join('');
    expect(text).not.toContain('导致');
    expect(text).not.toContain('因为');
  });
});

describe('汇总只数条数，不给合成分数', () => {
  const list = [
    { expectation: { direction: 1 }, actual: { changePct: 1 } },
    { expectation: { direction: 1 }, actual: { changePct: -1 } },
    { expectation: { direction: 1 }, actual: { changePct: 0 } },
  ];

  it('分类计数正确', () => {
    const s = summarizeExpectations(list);
    expect(s.counts.matched).toBe(1);
    expect(s.counts.opposite).toBe(1);
    expect(s.counts.flat).toBe(1);
    expect(s.total).toBe(3);
  });

  it('没有合成分数（一个总分会把相反证据藏起来）', () => {
    const s = summarizeExpectations(list);
    expect(s.score).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain('rate');
  });

  it('notable 只挑方向相反与幅度不足的', () => {
    const s = summarizeExpectations([
      ...list,
      { expectation: { direction: 1, magnitudePct: 2 }, actual: { changePct: 0.2 } },
    ]);
    expect(s.notable.map((x) => x.result.verdict)).toEqual(['opposite', 'weaker']);
  });

  it('空列表给出空汇总（不抛）', () => {
    const s = summarizeExpectations([]);
    expect(s.total).toBe(0);
    expect(s.notable).toEqual([]);
  });
});
