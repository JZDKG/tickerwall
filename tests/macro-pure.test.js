// @vitest-environment jsdom
/* ================================================================== *
 * 宏观页的定量部分（views/macro.js）
 *
 * 这里是最容易被「看起来对」蒙过去的一段：相关系数、久期折算、
 * 归一化走势、滚动窗口。断言用的是**能算的**:已知序列的通式解。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';

// macro.js 顶部会取 DOM 引用；先给骨架
document.body.innerHTML = '<section id="macro"></section>';

const m = await import('../src/client/views/macro.js');

describe('皮尔逊相关（前端复算）', () => {
  it('完全正相关 = 1，完全负相关 = −1', () => {
    expect(m.pearsonJS([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(m.pearsonJS([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
  });

  it('样本不足 3 个返回 null（不是猜一个数出来）', () => {
    expect(m.pearsonJS([1, 2], [2, 4])).toBeNull();
    expect(m.pearsonJS([], [])).toBeNull();
  });

  it('常量序列没有相关可言 → null（避免 0/0）', () => {
    expect(m.pearsonJS([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(m.pearsonJS([1, 2, 3, 4], [5, 5, 5, 5])).toBeNull();
  });

  it('结果与手算一致（一组已知数据）', () => {
    // 手算：num=18，dx=10，dy=32.8 → r = 18/√328 = 0.993884
    expect(m.pearsonJS([1, 2, 3, 4, 5], [2, 3, 5, 7, 9])).toBeCloseTo(0.993884, 5);
  });
});

describe('相关系数染色', () => {
  it('正值暖色、负值冷色（与涨跌红绿区分开）', () => {
    expect(m.corrBg(0.5)).toContain('245,69,92');
    expect(m.corrBg(-0.5)).toContain('91,156,248');
  });

  it('绝对值越大颜色越浓', () => {
    const alphaOf = (s) => Number(s.match(/,([\d.]+)\)$/)[1]);
    expect(alphaOf(m.corrBg(0.9))).toBeGreaterThan(alphaOf(m.corrBg(0.1)));
  });

  it('缺失值给中性底色（不染成红或蓝）', () => {
    expect(m.corrBg(null)).toBe('rgba(255,255,255,0.035)');
    expect(m.corrBg(NaN)).toBe('rgba(255,255,255,0.035)');
  });

  it('强度分档：0.6 以上 strong、0.3 以上 mid、其余 weak、缺失 na', () => {
    expect(m.corrCellClass(0.75)).toBe('strong');
    expect(m.corrCellClass(-0.61)).toBe('strong');
    expect(m.corrCellClass(0.4)).toBe('mid');
    expect(m.corrCellClass(0.1)).toBe('weak');
    expect(m.corrCellClass(null)).toBe('na');
  });
});

describe('滚动相关', () => {
  it('前 win−1 个点是 null（没有足够历史就没有结论）', () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    const b = a.map((v) => v * 2);
    const out = m.rollingCorrJS(a, b, 20);
    expect(out.length).toBe(50);
    expect(out.slice(0, 19).every((v) => v === null)).toBe(true);
    expect(out[19]).toBeCloseTo(1, 10);
  });

  it('窗口内有效点太少时给 null（不是用 2 个点算相关）', () => {
    const a = [1, 2, 3, null, null, null, null, null, null, null, null, null];
    const b = [1, 2, 3, null, null, null, null, null, null, null, null, null];
    const out = m.rollingCorrJS(a, b, 10);
    expect(out.at(-1)).toBeNull();
  });

  it('空数组返回空数组（不抛）', () => {
    expect(m.rollingCorrJS([], [], 20)).toEqual([]);
  });
});

describe('久期折算（利率 → 债券价格）', () => {
  it('收益率上行 = 债券价格下跌（方向必须反过来）', () => {
    expect(m.changeToReturn(0.01, 'rate')).toBeLessThan(0);
    expect(m.changeToReturn(-0.01, 'rate')).toBeGreaterThan(0);
  });

  it('按 8 年修正久期折算：+10bps → 约 −0.8%', () => {
    expect(m.changeToReturn(0.1, 'rate')).toBeCloseTo(-0.008, 10);
  });

  it('非利率标的原样返回', () => {
    expect(m.changeToReturn(0.02, 'price')).toBe(0.02);
    expect(m.changeToReturn(0.02)).toBe(0.02);
  });

  it('久期常量是 8（写死在界面上做口径说明，改了两处必须一起改）', () => {
    expect(m.BOND_DURATION_10Y).toBe(8);
  });
});

describe('归一化到 100', () => {
  it('第一个有效值就是起点 100 附近的走势（复利累乘）', () => {
    const out = m.normalizeTo100([0.01, 0.01, 0.01]);
    expect(out[0]).toBeCloseTo(100 * Math.exp(0.01), 10);
    expect(out[2]).toBeCloseTo(100 * Math.exp(0.03), 8);
  });

  it('开头的 null 保持 null（那条线确实还没开始）', () => {
    const out = m.normalizeTo100([null, null, 0.01]);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeGreaterThan(100);
  });

  it('中途 null 保持前值（各市场休市日不同，断线会让曲线碎成一堆）', () => {
    const out = m.normalizeTo100([0.01, null, 0.01]);
    expect(out[1]).toBe(out[0]);
    expect(out[2]).toBeGreaterThan(out[1]);
  });

  it('空数组返回空数组', () => {
    expect(m.normalizeTo100([])).toEqual([]);
  });

  it('利率序列用久期折算后方向与债券价格一致', () => {
    const up = m.normalizeTo100([0.1, 0.1], 'rate');
    expect(up[1]).toBeLessThan(100);
  });
});

describe('多线图', () => {
  const series = [
    { id: 'a', color: '#f00', values: [100, 105, 110] },
    { id: 'b', color: '#0f0', values: [100, 98, 96] },
  ];

  it('生成 svg 且每条线一条 path', () => {
    const svg = m.multiLineSVG(series, { width: 400, height: 200, labels: ['d1', 'd2', 'd3'] });
    expect(svg).toContain('<svg');
    expect((svg.match(/<path /g) ?? []).length).toBe(2);
    expect(svg).toContain('aria-label');
  });

  it('没有有效数据时给空态（不是一张空坐标系）', () => {
    expect(m.multiLineSVG([{ values: [null, null] }])).toContain('暂无数据');
    expect(m.multiLineSVG([])).toContain('暂无数据');
  });

  it('全平的序列也不会除零（上下各留 1）', () => {
    const flat = [{ color: '#f00', values: [100, 100, 100] }];
    expect(() => m.multiLineSVG(flat, { width: 300, height: 120 })).not.toThrow();
  });

  it('null 断点是断线不是连过去（一个 M 变两个 M）', () => {
    const gapped = [{ color: '#f00', values: [100, null, 110] }];
    const svg = m.multiLineSVG(gapped, { width: 300, height: 120 });
    expect((svg.match(/M/g) ?? []).length).toBe(2);
  });

  it('横轴标签数量不超过 4 个（再多就挤成一团）', () => {
    const labels = ['a', 'b', 'c', 'd', 'e', 'f'];
    const svg = m.multiLineSVG(series, { width: 400, height: 200, labels });
    // 纵轴刻度也带 text-anchor，所以按 y 坐标筛出「底部那一行」
    const bottom = [...svg.matchAll(/<text x="[\d.]+" y="(\d+)"[^>]*class="axis-text"/g)].map((mm) => mm[1]);
    expect(bottom.length).toBeLessThanOrEqual(4);
    expect(bottom.length).toBeGreaterThan(0);
  });
});

describe('滚动相关折线', () => {
  it('点不足 2 个时给样本不足（画不出一条线）', () => {
    expect(m.richRollingSVG([])).toContain('样本不足');
    expect(m.richRollingSVG([{ v: 0.5, label: 'd1' }])).toContain('样本不足');
  });

  it('以 0 为中线，正负都画在画布里', () => {
    const svg = m.richRollingSVG([
      { v: 0.8, label: 'd1' },
      { v: -0.8, label: 'd2' },
    ], { width: 400, height: 160 });
    expect(svg).toContain('base-line');
    // y 坐标都应为有限的数字
    const ys = [...svg.matchAll(/L?([\d.]+),([\d.]+)/g)].map((mm) => Number(mm[2]));
    expect(ys.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('领先滞后表', () => {
  const data = {
    universe: [{ id: 'a', short: 'A' }, { id: 'b', short: 'B' }],
    freq: 'day',
    leadLag: [
      { leader: 'a', follower: 'b', lag: 1, corr: 0.42, significantBH: true, sameDay: 0.31, q: 0.01, n: 250 },
    ],
  };

  it('渲染一行并带 BH 显著性标记', () => {
    const out = String(m.macroLeadLagHTML(data));
    expect(out).toContain('<table');
    expect(out).toContain('A');
    expect(out).toContain('0.420');
    expect(out).toContain('sig');
  });

  it('没有领先滞后关系时给明确空态', () => {
    expect(String(m.macroLeadLagHTML({ ...data, leadLag: [] }))).toContain('没有明显的领先滞后关系');
  });

  it('缺 q / sameDay 时显示破折号而不是 undefined', () => {
    const out = String(m.macroLeadLagHTML({
      ...data,
      leadLag: [{ leader: 'a', follower: 'b', lag: 2, corr: -0.2, significantBH: false, n: 100 }],
    }));
    expect(out).not.toContain('undefined');
    expect(out).toContain('—');
  });

  it('周频时滞后单位是「周」', () => {
    expect(String(m.macroLeadLagHTML({ ...data, freq: 'week' }))).toContain('周');
  });
});
