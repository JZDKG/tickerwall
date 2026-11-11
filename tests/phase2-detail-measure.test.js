/* ================================================================== *
 * Phase 2 / P2-T5：区间收益测算尺（纯计算）
 *
 * 交易员点两点要看到：区间天数、绝对涨跌额、涨跌幅、年化波动率。
 * 反向选择、单点、零起点这些输入不能算出 NaN 或 Infinity。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { measureRange } from '../src/client/views/detail-chart-tools.js';

/** [日期, 开, 收, 高, 低, 量, 额, 涨跌幅] */
const day = (date, close) => [date, close - 1, close, close + 1, close - 2, 1000, 1e6, null];

const series = () => [
  day('2026-01-02', 100),
  day('2026-01-05', 110),
  day('2026-01-06', 99),
  day('2026-01-07', 121),
];

describe('measureRange：区间收益', () => {
  it('正序选择给出天数、涨跌额、涨跌幅与年化波动率', () => {
    const m = measureRange(series(), 0, 3);
    expect(m.ok).toBe(true);
    expect(m.startIdx).toBe(0);
    expect(m.endIdx).toBe(3);
    expect(m.change).toBeCloseTo(21, 8);
    expect(m.changePct).toBeCloseTo(21, 8);
    expect(m.days).toBe(5); // 1/2 → 1/7 的自然日
    expect(m.annualizedVol).toBeGreaterThan(0);
    expect(Number.isFinite(m.annualizedVol)).toBe(true);
  });

  it('反向选择（先点终点再点起点）归一化后结果相同', () => {
    expect(measureRange(series(), 3, 0)).toEqual(measureRange(series(), 0, 3));
  });

  it('年化波动率用对数收益样本标准差 × √252，且 >= 0', () => {
    const m = measureRange(series(), 0, 3);
    const closes = [100, 110, 99, 121];
    const lr = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
    const mean = lr.reduce((a, b) => a + b, 0) / lr.length;
    const varr = lr.reduce((a, b) => a + (b - mean) ** 2, 0) / (lr.length - 1);
    expect(m.annualizedVol).toBeCloseTo(Math.sqrt(varr) * Math.sqrt(252), 8);
  });

  it('null 序列也安全返回 ok:false', () => {
    const m = measureRange(null, 0, 1);
    expect(m.ok).toBe(false);
    expect(Number.isNaN(m.change)).toBe(false);
  });

  it('单点 / 空序列 / 越界 / 零起点都给 ok:false，不产生 NaN', () => {
    for (const m of [
      measureRange(series(), 2, 2),
      measureRange([], 0, 1),
      measureRange(series(), -5, 99),
      measureRange([day('2026-01-02', 0), day('2026-01-05', 10)], 0, 1),
    ]) {
      expect(m.ok).toBe(false);
      for (const v of [m.days, m.change, m.changePct, m.annualizedVol]) {
        expect(v === null || (Number.isFinite(v) && v >= 0) || Number.isFinite(v)).toBe(true);
        expect(Number.isNaN(v)).toBe(false);
      }
    }
  });

  it('日期不可解析时 days 为 null，其余数值照算', () => {
    const m = measureRange([day('bad', 100), day('also-bad', 110)], 0, 1);
    expect(m.ok).toBe(true);
    expect(m.days).toBeNull();
    expect(m.changePct).toBeCloseTo(10, 8);
  });
});
