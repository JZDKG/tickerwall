/* ================================================================== *
 * 金融口径回归：值域（利率可为负）、单位换算（bp）、共同观测配对
 *
 * 这些用例对应方案 §10.1 的前三行与 §4.3 的链路要求：
 *   1. 实际收益率为负 / 跨零时，经采集、写库、读回、报价到差值计算仍保留；
 *   2. 缺失（"." / 空串 / "ND"）不能被转换成 0；
 *   3. 利率变化用百分点差，再换算成 bp（1bp = 0.01 个百分点）；
 *   4. 两个指标最新观测不在同一天时，不能标成「当期同涨同跌」。
 *
 * 复现预期由**独立计算**给出（手算差值），不是把实现输出抄成期望值。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  parseFredCsv,
  parseFredCsvOrThrow,
  fredQuoteFromRows,
  fredValueDomain,
  FRED_SIGNED_SERIES,
} from '../src/server/providers/index.js';
import { toChanges } from '../src/server/services/macro.service.js';
import {
  WINDOW_SPECS,
  alignCommon,
  computeChange,
  presentChange,
  pairedChange,
  cleanSeries,
} from '../src/server/domain/explanations/alignment.js';
import { formatChange } from '../src/server/domain/explanations/compose.js';

const CSV = `observation_date,DFII10
2026-10-22,-0.42
2026-10-23,.
2026-10-26,-0.10
2026-10-27,0.00
2026-10-28,ND
2026-10-29,
2026-10-30,0.35
`;

describe('FRED 值域：利率允许零与负，缺失不变成零', () => {
  it('signed 序列保留负值与零，跳过 "." / "ND" / 空串', () => {
    const rows = parseFredCsv(CSV, { valueDomain: 'signed' });
    expect(rows).toEqual([
      { date: '2026-10-22', close: -0.42 },
      { date: '2026-10-26', close: -0.1 },
      { date: '2026-10-27', close: 0 },
      { date: '2026-10-30', close: 0.35 },
    ]);
    // 缺失行没有被补成 0：0 的那一行来自真实 "0.00"
    expect(rows.filter((r) => r.close === 0)).toHaveLength(1);
  });

  it('positive 序列仍然丢弃零与负值（价格口径不变）', () => {
    const rows = parseFredCsv(CSV);
    expect(rows).toEqual([{ date: '2026-10-30', close: 0.35 }]);
  });

  it('序列 → 值域映射：利率类 signed，指数类 positive', () => {
    expect(fredValueDomain('DFII10')).toBe('signed');
    expect(fredValueDomain('T10YIE')).toBe('signed');
    expect(fredValueDomain('DGS10')).toBe('signed');
    expect(fredValueDomain('SP500')).toBe('positive');
    expect(fredValueDomain('dfii10')).toBe('signed');
    expect(FRED_SIGNED_SERIES.has('DFII10')).toBe(true);
  });

  it('parseFredCsvOrThrow 按序列自动选值域，并在 meta 里标明', () => {
    const csv = `observation_date,DFII10\n${Array.from({ length: 32 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
      return `${d},${(i % 7) - 3}.00`;
    }).join('\n')}\n`;
    const out = parseFredCsvOrThrow(csv, 'DFII10');
    expect(out.rows.length).toBe(32);
    expect(out.rows.some((r) => r.close < 0)).toBe(true);
    expect(out.meta.valueDomain).toBe('signed');
    expect(out.meta.frequency).toBe('daily');
  });

  it('fredQuoteFromRows：signed 允许负利率，前值为负也不当缺失', () => {
    const q = fredQuoteFromRows(
      [
        { date: '2026-10-26', close: -0.42 },
        { date: '2026-10-27', close: -0.1 },
      ],
      { valueDomain: 'signed' },
    );
    expect(q.price).toBe(-0.1);
    expect(q.prevClose).toBe(-0.42);
    expect(q.stale).toBe(true);
  });

  it('fredQuoteFromRows：价格口径下负值仍然无效', () => {
    // 最后一条是负值 → 当前价非法（前值为负只影响 prevClose，不代表当前价有效）
    expect(() => fredQuoteFromRows([{ date: 'a', close: 2 }, { date: 'b', close: -1 }])).toThrow('价格无效');
  });
});

describe('toChanges：利率用它自己的口径', () => {
  it('负 → 更接近零：百分点差为正（不是对数收益率）', () => {
    const rows = [
      { date: '2026-10-22', close: -0.42 },
      { date: '2026-10-23', close: -0.1 },
    ];
    expect(toChanges(rows, 'rate').values).toEqual([expect.closeTo(0.32, 10)]);
    // 同一组数字按价格口径会被当成负值丢掉
    expect(toChanges(rows, 'price').values).toEqual([]);
  });

  it('跨零与零值都保留（缺失才丢）', () => {
    const rows = [
      { date: '2026-10-26', close: -0.05 },
      { date: '2026-10-27', close: 0 },
      { date: '2026-10-28', close: 0.07 },
    ];
    const out = toChanges(rows, 'rate');
    expect(out.dates).toEqual(['2026-10-27', '2026-10-28']);
    expect(out.values[0]).toBeCloseTo(0.05, 10);
    expect(out.values[1]).toBeCloseTo(0.07, 10);
  });

  it('非有限值被跳过，日期与数值仍一一对应', () => {
    const rows = [
      { date: '2026-10-26', close: 1 },
      { date: '2026-10-27', close: 2 },
      { date: '2026-10-28', close: Number.POSITIVE_INFINITY },
    ];
    const out = toChanges(rows, 'rate');
    // 只有 (1 → 2) 这一段两端都是有限数；涉及 Infinity 的那一段被丢掉
    expect(out.dates).toEqual(['2026-10-27']);
    expect(out.values).toEqual([1]);
    expect(out.dates.length).toBe(out.values.length);
  });
});

describe('变化换算与展示单位', () => {
  const rateSeries = {
    dates: ['2026-10-26', '2026-10-27'],
    values: [1.85, 1.92],
  };

  it('利率：百分点差 ×100 = 基点，1bp = 0.01 个百分点', () => {
    const ch = computeChange(rateSeries, { comparisonPolicy: 'pp-difference', observations: 1 });
    expect(ch.change).toBeCloseTo(0.07, 10);
    const shown = presentChange(ch);
    expect(shown.unit).toBe('bp');
    expect(shown.value).toBeCloseTo(7, 6);
    expect(formatChange(shown)).toBe('+7.0bp');
  });

  it('价格：对数收益率换算成百分比', () => {
    const ch = computeChange(
      { dates: ['2026-10-26', '2026-10-27'], values: [4000, 3960] },
      { comparisonPolicy: 'log-return', observations: 1 },
    );
    const shown = presentChange(ch);
    expect(shown.unit).toBe('pct');
    // 手算：-40/4000 = -1.0%
    expect(shown.value).toBeCloseTo(-1.0, 2);
    expect(formatChange(shown)).toBe('−1.00%');
  });

  it('价格口径下非正端点返回 null（不产出 -Infinity / NaN）', () => {
    expect(
      computeChange({ dates: ['a', 'b'], values: [0, 10] }, { comparisonPolicy: 'log-return', observations: 1 }),
    ).toBeNull();
    expect(
      computeChange({ dates: ['a', 'b'], values: [10, -1] }, { comparisonPolicy: 'log-return', observations: 1 }),
    ).toBeNull();
  });

  it('窗口按「变化次数」截取：5d 取最后 5 次变化', () => {
    const dates = Array.from({ length: 8 }, (_, i) => `2026-10-${String(20 + i).padStart(2, '0')}`);
    const values = dates.map((_, i) => 100 + i);
    const ch = computeChange({ dates, values }, { comparisonPolicy: 'log-return', observations: WINDOW_SPECS['5d'].observations });
    expect(ch.start).toBe(dates[dates.length - 6]);
    expect(ch.end).toBe(dates[dates.length - 1]);
    expect(ch.observations).toBe(5);
  });
});

describe('共同观测：错位日期不能被当成当期同涨同跌', () => {
  const gold = { dates: ['2026-10-24', '2026-10-27', '2026-10-28'], values: [4000, 3960, 3950] };
  const dxy = { dates: ['2026-10-24', '2026-10-27'], values: [104.0, 104.6] };

  it('alignCommon 只保留双方都有的日期，并报出各自缺失的尾日期', () => {
    const out = alignCommon(gold, dxy);
    expect(out.dates).toEqual(['2026-10-24', '2026-10-27']);
    expect(out.n).toBe(2);
    expect(out.lastDate).toBe('2026-10-27');
    expect(out.onlyA).toEqual(['2026-10-28']);
    expect(out.onlyB).toEqual([]);
    expect(out.reasons).toContain('PARTIAL_OVERLAP');
  });

  it('pairedChange 在共同日期上算两端变化（不是各取最新值）', () => {
    const out = pairedChange(gold, dxy, {
      comparisonPolicyA: 'log-return',
      comparisonPolicyB: 'log-return',
      observations: 1,
    });
    expect(out.comparable).toBe(true);
    expect(out.sameWindow).toBe(true);
    // 共同窗口 10-24 → 10-27：黄金 4000→3960 = -1%，美元 104→104.6 ≈ +0.575%
    expect(presentChange(out.a).value).toBeCloseTo(-1.0, 2);
    expect(presentChange(out.b).value).toBeCloseTo(0.575, 2);
  });

  it('完全无交集 → comparable=false 且给出原因，绝不用各自最新值凑一对', () => {
    const out = pairedChange(
      { dates: ['2026-10-01'], values: [10] },
      { dates: ['2026-10-02'], values: [20] },
      { comparisonPolicyA: 'log-return', comparisonPolicyB: 'log-return' },
    );
    expect(out.comparable).toBe(false);
    expect(out.reasons).toContain('NO_COMMON_DATES');
  });

  it('只有 1 个共同日期时不足以上算变化', () => {
    const out = pairedChange(
      { dates: ['2026-10-01', '2026-10-02'], values: [10, 11] },
      { dates: ['2026-10-02'], values: [20] },
      { comparisonPolicyA: 'log-return', comparisonPolicyB: 'log-return' },
    );
    expect(out.comparable).toBe(false);
    expect(out.reasons).toContain('INSUFFICIENT_COMMON_DATES');
  });
});

describe('cleanSeries：缺失不是零', () => {
  it('剔除不可解析日期、非有限数与价格口径下的非正值', () => {
    const out = cleanSeries({ dates: ['2026-10-01', 'bad', '2026-10-03', '2026-10-04'], values: [1, 2, null, 0] });
    expect(out).toEqual({ dates: ['2026-10-01'], values: [1] });
  });

  it('signed 口径下零与负值保留', () => {
    const out = cleanSeries({ dates: ['2026-10-01', '2026-10-02'], values: [-1, 0] }, { valueDomain: 'signed' });
    expect(out.values).toEqual([-1, 0]);
  });
});
