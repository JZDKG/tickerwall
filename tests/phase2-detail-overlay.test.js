/* ================================================================== *
 * Phase 2 / P2-T5：定基 100 跨品种叠加对比
 *
 * 两条序列按日期对齐、各自定基 100，缺口留 null 而不是硬插值。
 * overlayPathHTML 交给主图 SVG 的是纯几何片段，坐标必须全是有限数。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  OVERLAY_ASSETS,
  toBase100,
  alignOverlay,
  overlayPathHTML,
} from '../src/client/views/detail-chart-tools.js';

const daily = (rows) => rows.map(([date, close]) => [date, close - 1, close, close + 1, close - 2, 0, 0, null]);

const geom = {
  x: (i) => 10 + i * 20,
  y: (v) => 200 - v,
  innerH: 180,
};

describe('OVERLAY_ASSETS', () => {
  it('与规格一致：六个驱动因子', () => {
    expect(OVERLAY_ASSETS).toEqual(['gold-intl', 'dxy', 'us10y', 'oil', 'sp500', 'btc']);
  });
});

describe('toBase100：定基', () => {
  it('首个有效价为 100，之后按比例换算', () => {
    const out = toBase100(daily([['2026-01-02', 50], ['2026-01-03', 55], ['2026-01-06', 45]]));
    expect(out.map((r) => r.date)).toEqual(['2026-01-02', '2026-01-03', '2026-01-06']);
    expect(out[0].value).toBeCloseTo(100, 8);
    expect(out[1].value).toBeCloseTo(110, 8);
    expect(out[2].value).toBeCloseTo(90, 8);
  });

  it('零 / 无效起点返回空数组，不产 Infinity', () => {
    expect(toBase100(daily([['2026-01-02', 0], ['2026-01-03', 5]]))).toEqual([]);
    expect(toBase100([])).toEqual([]);
    expect(toBase100(null)).toEqual([]);
  });

  it('中途的坏价格跳过该点，不打断后续', () => {
    const rows = daily([['2026-01-02', 100], ['2026-01-03', 110]]);
    rows[1][2] = null;
    const out = toBase100(rows);
    expect(out).toEqual([{ date: '2026-01-02', value: 100 }]);
  });
});

describe('alignOverlay：按日期对齐', () => {
  const base = toBase100(daily([['2026-01-02', 100], ['2026-01-03', 110], ['2026-01-06', 121]]));
  const other = toBase100(daily([['2026-01-03', 50], ['2026-01-06', 55], ['2026-01-07', 60]]));

  it('只保留基准序列的日期，并按 idx 定位', () => {
    const rows = alignOverlay(base, other);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.date)).toEqual(['2026-01-02', '2026-01-03', '2026-01-06']);
    expect(rows[0].other).toBeNull();
    expect(rows[1].other).toBeCloseTo(100, 8);
    expect(rows[2].other).toBeCloseTo(110, 8);
  });

  it('缺口留 null，不编造对比值', () => {
    const rows = alignOverlay(base, toBase100(daily([['2026-01-06', 55]])));
    expect(rows[0].other).toBeNull();
    expect(rows[1].other).toBeNull();
    expect(rows[2].other).toBeCloseTo(100, 8);
  });

  it('无对比数据 / 空序列返回带 null 占位或空数组，不抛', () => {
    expect(() => alignOverlay(base, [])).not.toThrow();
    expect(alignOverlay(base, []).every((r) => r.other === null)).toBe(true);
    expect(alignOverlay([], other)).toEqual([]);
  });
});

describe('overlayPathHTML：SVG 片段', () => {
  const base = toBase100(daily([['2026-01-02', 100], ['2026-01-03', 110], ['2026-01-06', 121]]));
  const other = toBase100(daily([['2026-01-02', 50], ['2026-01-03', 55], ['2026-01-06', 60]]));

  it('输出 .overlay-line 路径，坐标都是有限数', () => {
    const out = String(overlayPathHTML(alignOverlay(base, other), geom));
    expect(out).toContain('overlay-line');
    expect(out).toContain('<path');
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('Infinity');
    expect(out).toContain('M10.00,100.00');  // idx=0 → x=10, y(100)=100
  });

  it('缺口断开后重起一段（不是一条直线跨过空档）', () => {
    const sparse = toBase100(daily([['2026-01-02', 50], ['2026-01-03', 55], ['2026-01-06', 60]]));
    // 中间 1/3 缺失：1/2 与 1/6 各自成段，中间不会连成直线
    sparse.splice(1, 1);
    const out = String(overlayPathHTML(alignOverlay(base, sparse), geom));
    expect(out.split('M').length - 1).toBe(2);
  });

  it('全空时输出空串', () => {
    expect(String(overlayPathHTML([], geom))).toBe('');
    expect(String(overlayPathHTML(alignOverlay(base, []), geom))).toBe('');
  });
});
