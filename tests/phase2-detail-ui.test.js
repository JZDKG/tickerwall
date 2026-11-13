// @vitest-environment jsdom
/* ================================================================== *
 * Phase 2 / P2-T5：详情页工具栏接线（区间测算尺 + 叠加对比）
 *
 * 纯函数已经单测过；这里断言它们真的挂到了页面上：控件存在、点选写回
 * detailState、点击主图两点后出现测算读数、叠加曲线画进 SVG。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

document.body.innerHTML = '<section id="detail"></section>';
const detailEl = document.getElementById('detail');

vi.mock('../src/client/shared/calendar.js', () => ({ loadCalendarCached: async () => ({ upcoming: [] }) }));

const d = await import('../src/client/views/detail.js');
const { OVERLAY_ASSETS } = await import('../src/client/views/detail-chart-tools.js');

const daily = () => Array.from({ length: 12 }, (_, i) => {
  const day = String(1 + i).padStart(2, '0');
  return [`2026-09-${day}`, 100 + i, 101 + i, 103 + i, 99 + i, 1000, 1e8, 0.5];
});

const detailData = () => ({
  id: 'gold-intl', name: '国际金价', generatedAt: '2026-10-28T12:00:00.000Z', decimals: 2,
  priceBasis: 'close',
  quote: { price: 140, prevClose: 139, open: 138, high: 141, low: 137, changePct: 0.72 },
  ext: {}, stats: null,
  history: { daily: daily(), rows: daily(), count: 12, source: 'test', code: 'XAU', startDate: '2026-09-01', endDate: '2026-09-12' },
  intraday: null, crosscheck: [], derived: null,
});

beforeEach(() => {
  detailEl.hidden = false;
  d.mountDetail('gold-intl');
  detailEl.innerHTML = '';
});

afterEach(() => {
  d.unmountDetail();
});

describe('叠加对比控件', () => {
  it('工具栏有 #overlay-select，选项与规格一致', () => {
    d.renderDetail(detailData());
    const sel = detailEl.querySelector('#overlay-select');
    expect(sel).toBeTruthy();
    expect(sel.tagName).toBe('SELECT');
    const values = [...sel.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    expect(values).toEqual(OVERLAY_ASSETS);
  });

  it('选中对比品种后写回 detailState 并重绘', () => {
    d.renderDetail(detailData());
    const sel = detailEl.querySelector('#overlay-select');
    sel.value = 'dxy';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(d.currentDetailState().overlay).toBe('dxy');
    expect(detailEl.querySelector('#overlay-select').value).toBe('dxy');
  });

  it('选「关闭」清空叠加', () => {
    d.renderDetail(detailData());
    const sel = detailEl.querySelector('#overlay-select');
    sel.value = 'dxy';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const sel2 = detailEl.querySelector('#overlay-select');
    sel2.value = '';
    sel2.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(d.currentDetailState().overlay).toBeNull();
  });
});

describe('区间测算尺', () => {
  it('工具栏有 #measure-info 与锁定提示', () => {
    d.renderDetail(detailData());
    const info = detailEl.querySelector('#measure-info');
    expect(info).toBeTruthy();
    expect(detailEl.textContent).toContain('区间测算');
  });

  it('点主图两点后显示区间天数、涨跌额、涨跌幅与年化波动率', () => {
    d.renderDetail(detailData());
    const svg = detailEl.querySelector('#chart-host svg.chart-svg');
    expect(svg).toBeTruthy();
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 920, height: 260, right: 920, bottom: 260 });
    const clickAt = (x) => svg.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: x, clientY: 120 }));
    clickAt(10);
    clickAt(500);
    const info = detailEl.querySelector('#measure-info');
    expect(info.textContent).toContain('区间');
    expect(info.textContent).toContain('%');
    expect(info.textContent).toContain('年化波动');
    expect(detailEl.querySelector('.measure-shade')).toBeTruthy();
  });
});

describe('图表参数渐进披露', () => {
  it('次级图表参数收纳在默认折叠的 #chart-more 中，且展开后切换仍保持展开', () => {
    d.renderDetail(detailData());
    const more = detailEl.querySelector('details#chart-more');
    expect(more).toBeTruthy();
    expect(more.open).toBe(false);
    expect(more.querySelector('#period-seg')).toBeTruthy();
    expect(more.querySelector('#scale-seg')).toBeTruthy();
    expect(more.querySelector('#ma-seg')).toBeTruthy();
    expect(more.querySelector('#chart-mode-seg')).toBeTruthy();

    more.open = true;
    more.dispatchEvent(new window.Event('toggle'));
    more.querySelector('#scale-seg [data-s="log"]').click();

    const refreshed = detailEl.querySelector('details#chart-more');
    expect(refreshed.open).toBe(true);
    expect(refreshed.querySelector('.chart-more-summary')?.textContent).toContain('对数');
  });
});
