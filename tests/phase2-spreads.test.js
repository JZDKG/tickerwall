/* ================================================================== *
 * Phase 2 / P2-T3：通用合成比价与利差引擎
 *
 * 金银比、金油比、铜金比、中美利差全部由同批次报价现算，零额外 HTTP。
 * 任一腿缺失 / 无效时给 ok:false + reason，绝不让 NaN 流到界面。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { SYNTHETIC_DEFS, computeSynthetics } from '../src/server/domain/spreads.js';

const item = (id, price, ok = true) => ({ id, ok, price });

const full = () => [
  item('gold-intl', 2650),
  item('silver', 31.25),
  item('oil', 70),
  item('copper', 4.5),
  item('us10y', 4.25),
  item('cn10y', 1.8),
  item('usdcny', 7.1),
];

describe('SYNTHETIC_DEFS：四大宏观合成指标', () => {
  it('恰好四个，且都有 id / 名称 / 公式 / 单位', () => {
    expect(SYNTHETIC_DEFS).toHaveLength(4);
    expect(SYNTHETIC_DEFS.map((s) => s.id)).toEqual([
      'gold-silver-ratio', 'gold-oil-ratio', 'copper-gold-ratio', 'us-cn-10y-spread',
    ]);
    for (const s of SYNTHETIC_DEFS) {
      expect(s.name.length).toBeGreaterThan(1);
      expect(s.formula.length).toBeGreaterThan(1);
      expect(s.unit.length).toBeGreaterThan(0);
    }
  });
});

describe('computeSynthetics：数值口径', () => {
  it('金银比 = 国际金价 / 银价', () => {
    const r = computeSynthetics(full()).find((s) => s.id === 'gold-silver-ratio');
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo(2650 / 31.25, 8);
  });

  it('金油比 = 国际金价 / 油价（桶/盎司）', () => {
    const r = computeSynthetics(full()).find((s) => s.id === 'gold-oil-ratio');
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo(2650 / 70, 8);
  });

  it('铜金比 = 铜价 / 国际金价 × 1000', () => {
    const r = computeSynthetics(full()).find((s) => s.id === 'copper-gold-ratio');
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo((4.5 / 2650) * 1000, 8);
  });

  it('中美利差 = 美债10Y − 中债10Y（百分点）', () => {
    const r = computeSynthetics(full()).find((s) => s.id === 'us-cn-10y-spread');
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo(2.45, 8);
    expect(r.unit).toContain('百分');
  });

  it('每个结果都带 id/name/formula/unit，且 ok 的可直接 fmt', () => {
    for (const s of computeSynthetics(full())) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.formula).toBe('string');
      expect(typeof s.unit).toBe('string');
      if (s.ok) expect(Number.isFinite(s.value)).toBe(true);
    }
  });
});

describe('computeSynthetics：缺腿 / 坏数据不产 NaN', () => {
  it('缺白银、铜、中债时对应指标 ok:false 且带 reason，其余照算', () => {
    const out = computeSynthetics([item('gold-intl', 2650), item('oil', 70), item('us10y', 4.25)]);
    const by = Object.fromEntries(out.map((s) => [s.id, s]));
    expect(by['gold-silver-ratio'].ok).toBe(false);
    expect(by['gold-silver-ratio'].reason).toBeTruthy();
    expect(by['copper-gold-ratio'].ok).toBe(false);
    expect(by['us-cn-10y-spread'].ok).toBe(false);
    expect(by['gold-oil-ratio'].ok).toBe(true);
    for (const s of out) {
      expect(s.value === null || Number.isFinite(s.value)).toBe(true);
    }
  });

  it('ok:false / 零分母 / 负数 / 非数一律拒绝', () => {
    const bad = [
      item('gold-intl', 2650),
      item('silver', 0),
      item('oil', -70),
      item('copper', 4.5),
      item('us10y', 4.25),
      item('cn10y', null),
    ];
    const out = computeSynthetics(bad);
    expect(out.find((s) => s.id === 'gold-silver-ratio').ok).toBe(false);
    expect(out.find((s) => s.id === 'gold-oil-ratio').ok).toBe(false);
    expect(out.find((s) => s.id === 'us-cn-10y-spread').ok).toBe(false);
    expect(out.find((s) => s.id === 'copper-gold-ratio').ok).toBe(true);
  });

  it('空数组 / null 返回四个 ok:false，不抛', () => {
    expect(() => computeSynthetics([])).not.toThrow();
    expect(computeSynthetics([])).toHaveLength(4);
    expect(computeSynthetics(null).every((s) => !s.ok)).toBe(true);
  });

  it('额外报价（extras）里的银/铜也能作为腿', () => {
    const items = [
      item('gold-intl', 2650),
      item('oil', 70),
      { id: 'gold-cn', ok: true, price: 560, extras: [
        { id: 'silver', ok: true, price: 31.25 }, { id: 'copper', ok: true, price: 4.5 },
      ] },
    ];
    const by = Object.fromEntries(computeSynthetics(items).map((s) => [s.id, s]));
    expect(by['gold-silver-ratio'].ok).toBe(true);
    expect(by['copper-gold-ratio'].ok).toBe(true);
  });
});

describe('/api/quotes 响应挂载 synthetics', () => {
  it('quotes.service.refresh 暴露 synthetics 字段', async () => {
    const svc = await import('../src/server/services/quotes.service.js');
    const { INSTRUMENTS } = await import('../src/server/providers/instruments.js');
    const saved = INSTRUMENTS.splice(0, INSTRUMENTS.length, ...[
      { ...full()[0], sources: [{ name: 't', load: async () => ({ price: 2650, prevClose: 2600 }) }], decimals: 2 },
      { ...full()[1], sources: [{ name: 't', load: async () => ({ price: 31.25, prevClose: 31 }) }], decimals: 2 },
    ]);
    try {
      const out = await svc.refresh();
      expect(Array.isArray(out.synthetics)).toBe(true);
      expect(out.synthetics).toHaveLength(4);
      expect(out.synthetics.find((s) => s.id === 'gold-silver-ratio').ok).toBe(true);
    } finally {
      INSTRUMENTS.splice(0, INSTRUMENTS.length, ...saved);
    }
  });
});
