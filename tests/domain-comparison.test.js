/* ================================================================== *
 * 内外金对照的分解（产品 2.1）
 *
 * 这层的数学是可验证的会计恒等式：
 *   国内金价 = 国际金价 ÷ 31.1035 × 汇率 × (1 + 溢价)
 * 所以测试可以直接断言「三项贡献之和 = 国内金价变化」（对数可加），
 * 以及「时间窗不可比时不给分解」。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  buildGoldComparison,
  checkComparability,
  convertUsdPerOunceToCnyPerGram,
  decomposeSpread,
  describeReason,
  TROY_OUNCE_GRAMS,
} from '../src/server/domain/explanations/comparison.js';

describe('换算', () => {
  it('美元/盎司 → 元/克', () => {
    // 2000 美元/盎司、汇率 7.2 → 2000/31.1035*7.2
    const v = convertUsdPerOunceToCnyPerGram(2000, 7.2);
    expect(v).toBeCloseTo((2000 / TROY_OUNCE_GRAMS) * 7.2, 10);
  });

  it('非法输入返回 null（不返回 0，避免「零价格」被当真）', () => {
    expect(convertUsdPerOunceToCnyPerGram(0, 7.2)).toBeNull();
    expect(convertUsdPerOunceToCnyPerGram(2000, 0)).toBeNull();
    expect(convertUsdPerOunceToCnyPerGram(-1, 7.2)).toBeNull();
  });
});

describe('可比性', () => {
  it('两边同一天 → 可比，无原因', () => {
    const r = checkComparability({
      intl: { at: '2026-10-27T20:00:00Z' },
      domestic: { at: '2026-10-27T20:00:00Z' },
    });
    expect(r.comparable).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('差超过一天 → 不可比，原因是日期不一致', () => {
    const r = checkComparability({
      intl: { at: '2026-10-27T20:00:00Z' },
      domestic: { at: '2026-10-25T02:00:00Z' },
    });
    expect(r.comparable).toBe(false);
    expect(r.reasons).toContain('OBSERVATION_DATE_MISMATCH');
  });

  it('同一天但盘中差 10 小时 → 可比但标注时点错位', () => {
    const r = checkComparability({
      intl: { at: '2026-10-27T22:00:00Z' },
      domestic: { at: '2026-10-27T12:00:00Z' },
    });
    expect(r.comparable).toBe(true);
    expect(r.reasons).toContain('INTRADAY_TIME_OFFSET');
    expect(r.dayGap).toBeCloseTo(10 / 24, 2);
  });

  it('缺时间 → 不可比，且不猜', () => {
    expect(checkComparability({ intl: { at: null }, domestic: { at: 'x' } })).toMatchObject({
      comparable: false,
      reasons: ['MISSING_OBSERVATION_TIME'],
    });
    expect(checkComparability({})).toMatchObject({ comparable: false, dayGap: null });
  });
});

describe('三项分解：对数可加', () => {
  /** 造一组自洽数据：给定国际金、汇率、溢价，倒推出国内金 */
  const inputs = ({ intlStart = 2000, intlEnd = 1980, fxStart = 7.2, fxEnd = 7.26, premStart = 0.01, premEnd = 0.018 }) => {
    const cStart = (intlStart / TROY_OUNCE_GRAMS) * fxStart;
    const cEnd = (intlEnd / TROY_OUNCE_GRAMS) * fxEnd;
    return {
      intlStart,
      intlEnd,
      fxStart,
      fxEnd,
      domesticStart: cStart * (1 + premStart),
      domesticEnd: cEnd * (1 + premEnd),
    };
  };

  it('三项贡献之和等于国内金价变化（残差为浮点误差级）', () => {
    const d = decomposeSpread(inputs({}));
    expect(d.status).toBe('ok');
    const sum = d.terms.reduce((n, t) => n + t.contributionPct, 0);
    // 对数空间可加：sum + residual = ln(1+r_domestic)
    expect(Math.abs(d.residualPct)).toBeLessThan(1e-9);
    expect(sum + d.residualPct).toBeCloseTo(Math.log(1 + d.domesticChangePct / 100) * 100, 6);
  });

  it('国际金跌、汇率涨、溢价走阔 → 国内可能是涨的（正是用户那个问题的情形）', () => {
    const d = decomposeSpread(inputs({ intlStart: 2000, intlEnd: 1960, fxStart: 7.1, fxEnd: 7.35, premStart: 0.005, premEnd: 0.02 }));
    const byKey = Object.fromEntries(d.terms.map((t) => [t.key, t]));
    expect(byKey.intl.changePct).toBeLessThan(0);
    expect(byKey.fx.changePct).toBeGreaterThan(0);
    expect(byKey.premium.changePct).toBeGreaterThan(0);
    expect(d.domesticChangePct).toBeGreaterThan(0);
  });

  it('溢价按定义是残差：把溢价起点换成 0，分解结果仍然自洽', () => {
    const d = decomposeSpread(inputs({ premStart: 0, premEnd: 0.03 }));
    expect(d.status).toBe('ok');
    expect(d.terms.find((t) => t.key === 'premium').changePct).toBeCloseTo(3, 6);
    expect(d.premiumPct.start).toBeCloseTo(0, 10);
  });

  it('三组不同场景下都满足恒等（不是碰巧对上）', () => {
    const cases = [
      inputs({ intlStart: 1800, intlEnd: 1800, fxStart: 7.0, fxEnd: 7.0, premStart: 0, premEnd: 0 }),
      inputs({ intlStart: 2500, intlEnd: 2100, fxStart: 6.9, fxEnd: 7.4, premStart: 0.04, premEnd: 0.01 }),
      inputs({ intlStart: 1200, intlEnd: 1300, fxStart: 7.2, fxEnd: 7.15, premStart: -0.01, premEnd: 0.005 }),
    ];
    for (const c of cases) {
      const d = decomposeSpread(c);
      expect(Math.abs(d.residualPct)).toBeLessThan(1e-9);
    }
  });

  it('输入不全 → unavailable + 原因（不给半个结果）', () => {
    expect(decomposeSpread({ intlStart: 2000 })).toEqual({ status: 'unavailable', reason: 'INSUFFICIENT_INPUTS' });
    expect(decomposeSpread(inputs({ intlEnd: 0 }))).toEqual({ status: 'unavailable', reason: 'INSUFFICIENT_INPUTS' });
  });
});

describe('对外结果', () => {
  const okInputs = () => {
    const intl = { start: 2000, end: 1960, at: '2026-10-27T20:00:00Z' };
    const domestic = { start: 455, end: 458, at: '2026-10-27T20:00:00Z' };
    const fx = { start: 7.1, end: 7.35, at: '2026-10-27T20:00:00Z' };
    return { intl, domestic, fx };
  };

  it('可比时给出三项 + 口径说明 + 溢价是残差', () => {
    const out = buildGoldComparison(okInputs());
    expect(out.comparable).toBe(true);
    expect(out.decomposition.terms.map((t) => t.key)).toEqual(['intl', 'fx', 'premium']);
    expect(out.notes.join(' ')).toContain('残差');
    expect(out.premiumIsResidual).toBe(true);
  });

  it('时间窗不可比时 decomposition 为 null —— 不鼓励误读', () => {
    const bad = okInputs();
    bad.domestic = { ...bad.domestic, at: '2026-10-20T02:00:00Z' };
    const out = buildGoldComparison(bad);
    expect(out.comparable).toBe(false);
    expect(out.decomposition).toBeNull();
    expect(out.reasonText.join(' ')).toContain('不是同一天');
  });

  it('缺汇率时明确说缺汇率，而不是算出一个「汇率为 0」的结果', () => {
    const out = buildGoldComparison({ ...okInputs(), fx: null });
    expect(out.decomposition).toBeNull();
    expect(out.reasons).toContain('MISSING_FX');
  });

  it('起止价缺失 → 不给分解，reason 说「输入不完整」', () => {
    const bad = okInputs();
    bad.intl = { start: null, end: 1960, at: '2026-10-27T20:00:00Z' };
    const out = buildGoldComparison(bad);
    expect(out.decomposition).toBeNull();
    expect(out.reasonText.join(' ')).toContain('输入不完整');
  });

  it('盘中时点错位：仍给分解，但 comparable=false 并说明原因', () => {
    const shifted = okInputs();
    shifted.domestic = { ...shifted.domestic, at: '2026-10-27T09:00:00Z' };
    const out = buildGoldComparison(shifted);
    expect(out.decomposition).not.toBeNull();
    expect(out.comparable).toBe(false);
    expect(out.reasonText.join(' ')).toContain('盘中时点不同');
  });

  it('describeReason 对未知原因不返回 undefined', () => {
    expect(describeReason(['SOMETHING_NEW'])).toEqual(['SOMETHING_NEW']);
  });
});
