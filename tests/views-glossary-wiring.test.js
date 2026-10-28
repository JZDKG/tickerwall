// @vitest-environment jsdom
/* ================================================================== *
 * 术语接入真实界面（产品 2.5）
 *
 * 术语表本身在 glossary.test.js 里验过。这里验接入：
 *   · 详情页指标里有术语按钮，且**没有被转义成文字**（否则点了没反应）；
 *   · 值那一列保持纯文本（不塞 HTML）；
 *   · 解释卡的渠道说明里也带术语。
 * ================================================================== */

import { describe, it, expect, afterEach } from 'vitest';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('详情页指标', () => {
  it('波动率与回撤的标签是术语按钮，且是真标签不是转义文字', async () => {
    const { metricCards } = await import('../src/client/views/detail.js');
    const el = document.createElement('div');
    el.innerHTML = String(
      metricCards({
        decimals: 2,
        quote: {},
        ext: {},
        stats: { rv20: 12.3, rv20Percentile: 55, volRegime: '中性', maxDrawdown: { pct: -12.5 } },
      }).value ?? '',
    );

    const buttons = el.querySelectorAll('.gl-term');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const ids = [...buttons].map((b) => b.dataset.glTerm);
    expect(ids).toContain('realizedVol');
    expect(ids).toContain('maxDrawdown');
    // 关键：没有被当成字面量输出
    expect(el.innerHTML).not.toContain('&lt;button');
    // 每个按钮都有对应的提示元素
    for (const btn of buttons) {
      expect(el.querySelector(`#${btn.getAttribute('aria-describedby')}`)).toBeTruthy();
    }
  });

  it('值那一列仍是纯文本（不出现内嵌标签）', async () => {
    const { metricCards } = await import('../src/client/views/detail.js');
    const el = document.createElement('div');
    el.innerHTML = String(
      metricCards({ decimals: 2, quote: {}, ext: {}, stats: { rv20: 12.3, rv20Percentile: 55, volRegime: '中性' } }).value ?? '',
    );
    for (const v of el.querySelectorAll('.m-value')) {
      expect(v.querySelector('button')).toBeNull();
    }
  });

  it('没有数据时不渲染指标（不产生空按钮）', async () => {
    const { metricCards } = await import('../src/client/views/detail.js');
    const el = document.createElement('div');
    el.innerHTML = String(metricCards({ decimals: 2, quote: {}, ext: {}, stats: {} }).value ?? '');
    expect(el.querySelectorAll('.gl-term').length).toBe(0);
  });
});

describe('解释卡的渠道说明', () => {
  it('渠道里的「实际收益率」可术语化（提供 termHTML 入口）', async () => {
    const { termHTML } = await import('../src/client/shared/glossary.js');
    const html = termHTML('实际收益率');
    expect(html).toContain('data-gl-term="realYield"');
    expect(html).toContain('tooltip');
  });
});
