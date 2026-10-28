// @vitest-environment jsdom
/* ================================================================== *
 * 四层分离的**可见性**（产品 §3.1）
 *
 * 结构上分开还不够 —— 读者必须能看见「哪句是事实、哪句是候选解释、
 * 哪句是一般机制」。否则一段通顺的机制说明会被当成结论。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { explanationCardHTML, factorHTML } from '../src/client/views/explanations/card.js';

const mount = (s) => {
  const el = document.createElement('div');
  el.innerHTML = s;
  return el;
};

const factor = () => factorHTML({
  mechanismId: 'M1',
  label: '实际收益率',
  status: 'consistent',
  statusLabel: '与观测一致',
  plain: '利率上行会抬高持有黄金的机会成本。',
  mechanism: '实际收益率是无风险回报扣掉通胀后的那部分。',
  conditionCodes: [],
  exclusions: [],
}, { open: true, index: 0 });

describe('候选解释与一般机制分开标', () => {
  it('「本次候选解释」这一层有标签', () => {
    expect(mount(factor()).textContent).toContain('本次候选解释');
  });

  it('「一般机制」这一层也有标签，且写明它与本次是否成立无关', () => {
    const el = mount(factor());
    expect(el.textContent).toContain('一般机制');
    expect(el.textContent).toContain('与本次是否成立无关');
  });

  it('候选解释排在一般机制**之前**（先读结论再读机制）', () => {
    const text = mount(factor()).textContent;
    expect(text.indexOf('本次候选解释')).toBeLessThan(text.indexOf('一般机制'));
  });
});

describe('事实层', () => {
  const ready = () => explanationCardHTML({
    phase: 'ready',
    assetId: 'gold-intl',
    assetName: '国际金价',
    windowKey: 'session',
    explanation: {
      id: 'exp_1',
      asOf: '2026-10-28T10:00:00.000Z',
      contentStatus: 'ok',
      summary: '摘要',
      facts: [
        { code: 'TARGET_CHANGE', label: '金价', change: { pct: -0.8 }, window: { start: '2026-10-28', end: '2026-10-28' } },
        { code: 'DRIVER_CHANGE', label: '实际收益率', change: { pct: 0.4 }, window: {} },
      ],
      hypotheses: [],
      unknowns: [],
      nextChecks: [],
    },
    meta: { freshness: 'fresh' },
  });

  it('事实块标出「只有数字与日期，不含原因」', () => {
    const el = mount(ready());
    expect(el.textContent).toContain('事实');
    expect(el.textContent).toContain('不含原因');
  });

  it('支持与反向证据并存时明确说方向未定（不是「一定会怎样」）', () => {
    const el = mount(explanationCardHTML({
      phase: 'ready',
      assetId: 'gold-intl',
      explanation: {
        id: 'exp_2', asOf: '2026-10-28T10:00:00.000Z', contentStatus: 'ok', summary: 's',
        facts: [], unknowns: [], nextChecks: [],
        hypotheses: [{ mechanismId: 'M', label: 'x', status: 'mixed', statusLabel: '有支持也有反向', plain: '', mechanism: '' }],
      },
      meta: { freshness: 'fresh' },
    }));
    expect(el.textContent).toContain('方向未定');
  });

  it('数据过期时明说「不代表当前状态」', () => {
    const el = mount(explanationCardHTML({
      phase: 'ready',
      assetId: 'gold-intl',
      explanation: { id: 'exp_3', asOf: '2026-10-20T10:00:00.000Z', contentStatus: 'ok', summary: 's', facts: [], hypotheses: [], unknowns: [], nextChecks: [] },
      meta: { freshness: 'stale', freshnessReasons: ['BEYOND_UPDATE_CYCLE'] },
    }));
    expect(el.textContent).toContain('不代表当前状态');
  });
});
