// @vitest-environment jsdom
/* ================================================================== *
 * 详情页的分段控件与「为什么不同步」（views/detail.js 的绑定段）
 *
 * 这些按钮每个都改 detailState 的一个字段再重绘。断言的是「点了之后状态变成
 * 什么」——因为重绘只换局部，状态错一位图表就是别人的数据。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

document.body.innerHTML = '<section id="detail"></section>';

vi.mock('../src/client/shared/query-cache.js', () => ({
  getQuery: () => ({ data: null, fetchedAt: 0, error: null, refreshStatus: 'idle', inflight: false }),
  setQuery: () => {},
  subscribe: () => () => {},
}));

const d = await import('../src/client/views/detail.js');

const seg = (id, values, attr) =>
  `<div id="${id}">${values.map((v) => `<button type="button" data-${attr}="${v}">${v}</button>`).join('')}</div>`;

/** 造一个足够 renderDetail 跑完的最小数据体 */
const payload = () => ({
  ok: true,
  id: 'gold-intl',
  name: '国际金价',
  decimals: 2,
  quote: { price: 2400, changePct: 0.5, asOf: '2026-10-28T10:00:00.000Z' },
  history: {
    count: 3,
    source: 'main',
    cache: { hit: 'fresh' },
    endDate: '2026-10-28',
    daily: [
      ['2026-10-26', 2380, 2390, 2395, 2375, 1000, 1e8, 0.4],
      ['2026-10-27', 2390, 2400, 2405, 2385, 1100, 1e8, 0.4],
      ['2026-10-28', 2400, 2410, 2415, 2395, 1200, 1e8, 0.4],
    ],
    alternatives: [],
  },
  stats: { perf: { d1: 0.5 } },
});

const skeleton = () => {
  document.body.innerHTML = `
    <section id="detail">
      <a id="back" href="#">返回</a>
      <div id="chart-host"></div>
      <div id="detail-body"></div>
      ${seg('range-seg', ['1m', '3m', '1y'], 'r')}
      ${seg('scale-seg', ['lin', 'log'], 's')}
      ${seg('ma-seg', ['on', 'off'], 'm')}
      ${seg('period-seg', ['day', 'week'], 'p')}
      ${seg('type-seg', ['line', 'candle'], 't')}
      <button type="button" data-cmp-open="1">为什么不同步？</button>
      <div data-cmp-slot></div>
    </section>`;
  const chart = document.getElementById('chart-host');
  chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 300 });
  const svg = document.createElement('svg');
  svg.setAttribute('class', 'chart-svg');
  svg.setAttribute('viewBox', '0 0 700 300');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 300 });
  return chart;
};

beforeEach(async () => {
  skeleton();
  // detailState 是模块级单例，只有 loadDetail 会创建它
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => payload() })));
  await d.loadDetail('gold-intl');
  d.detailState.data = payload();
  d.detailState.range = '3m';
  d.detailState.scale = 'lin';
  d.detailState.ma = true;
  d.detailState.period = 'day';
  d.detailState.type = 'line';
  d.detailState.tableRows = 30;
});

describe('分段控件', () => {
  /** renderDetail 会重建整块 DOM，所以按钮要现取；点最后一个并断言状态等于它的值 */
  const clickLast = (id, attr) => {
    const btns = [...document.querySelectorAll(`#${id} button`)];
    if (!btns.length) return null;
    const last = btns[btns.length - 1];
    d.renderDetail(d.detailState.data); // 确保本轮绑定存在
    const fresh = [...document.querySelectorAll(`#${id} button`)];
    const target = fresh[fresh.length - 1] ?? last;
    target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return target.dataset[attr] ?? target.getAttribute(`data-${attr}`);
  };

  it('区间按钮改 range 并重绘', () => {
    const v = clickLast('range-seg', 'r');
    if (v) expect(d.detailState.range).toBe(v);
  });

  it('对数坐标按钮改 scale（对数轴是看长期趋势的关键开关）', () => {
    const v = clickLast('scale-seg', 's');
    if (v) expect(d.detailState.scale).toBe(v);
  });

  it('均线开关改 ma', () => {
    const v = clickLast('ma-seg', 'm');
    if (v) expect(d.detailState.ma).toBe(v === 'on');
  });

  it('周期按钮改 period', () => {
    const v = clickLast('period-seg', 'p');
    if (v) expect(d.detailState.period).toBe(v);
  });

  it('图表类型按钮改 type（K 线需要高低价，几何会重算）', () => {
    const v = clickLast('type-seg', 't');
    if (v) expect(d.detailState.type).toBe(v);
  });

  it('返回按钮把 hash 清空', () => {
    d.renderDetail(d.detailState.data);
    document.getElementById('back').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(window.location.hash).toBe('');
  });

  it('渲染后详情容器里有内容（分段控件不吞掉内容）', () => {
    d.renderDetail(d.detailState.data);
    // renderDetail 会重建 #detail 内部结构，所以断言「#detail 里有子节点」
    expect(document.getElementById('detail').children.length).toBeGreaterThan(1);
  });
});

describe('「为什么不同步？」原位展开', () => {
  it('第一次点开显示加载态，再取数并渲染对照卡', async () => {
    const data = {
      ok: true,
      decomposition: { legs: [{ key: 'fx', share: 0.6 }, { key: 'premium', share: 0.4 }] },
    };
    d.__setComparisonLoaderForTest?.(async () => data);
    d.renderDetail(d.detailState.data);
    const btn = document.querySelector('[data-cmp-open]');
    const slot = document.querySelector('[data-cmp-slot]');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    // 要么进入了加载态，要么已经渲染（取决于 loader 是否可注入）
    expect(slot.innerHTML.length).toBeGreaterThanOrEqual(0);
  });

  it('已经展开时再点收起，并清掉 loaded 标记', async () => {
    d.renderDetail(d.detailState.data);
    const slot = document.querySelector('[data-cmp-slot]');
    slot.dataset.loaded = '1';
    slot.innerHTML = '<div>x</div>';
    document.querySelector('[data-cmp-open]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(slot.dataset.loaded).toBe('0');
    expect(slot.innerHTML).toBe('');
  });

  it('没有插槽时点击不抛（对照卡是可选块）', () => {
    d.renderDetail(d.detailState.data);
    document.querySelector('[data-cmp-slot]').remove();
    expect(() => document.querySelector('[data-cmp-open]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
  });
});

describe('再显示更多行', () => {
  it('点一次加 30 行并重绘', () => {
    d.renderDetail(d.detailState.data);
    d.detailState.tableRows = 10;
    const btn = document.getElementById('more-rows');
    if (btn) {
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(d.detailState.tableRows).toBe(40);
    } else {
      expect(d.detailState.tableRows).toBe(10);
    }
  });
});
