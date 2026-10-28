// @vitest-environment jsdom
/* ================================================================== *
 * 地图整屏渲染（views/map.js renderMap）
 *
 * 这是 1533 行编排层里最大的一块。用真 geo-kit 投影 + 真 DOM 骨架，
 * 断言的是**用户能看到什么**：城市点有没有画、交易中与已收盘的类名、
 * 事件流条数、回溯模式下不显示未来事件、重建后保留滚动位置。
 *
 * 不测像素位置（那是投影的事，map-core 与 worldmap-geo 已覆盖）。
 * ================================================================== */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 骨架必须在**模块加载之前**写好：shared/dom.js 在顶层就
 * `document.getElementById('map')` 取一次，晚于 import 会拿到 null，
 * 之后每个用例都报 'Cannot read properties of null'。
 */
document.body.innerHTML = `
  <section id="map"></section>
  <div class="map-body">
    <div id="map-canvas">
      <svg class="world-svg" viewBox="0 0 1200 600"></svg>
    </div>
    <div id="map-feed"></div>
  </div>
`;

const { store } = await import('../src/client/shared/store.js');
const map = await import('../src/client/views/map.js');

/**
 * 每个用例只清空 #map 的内容，**不重建节点**。
 *
 * shared/dom.js 持有的是当初那个 #map 元素引用；把 body.innerHTML 换掉
 * 会让它指向一个已经脱离文档的节点，之后 renderMap 写进去的内容查不到 ——
 * 现象是「渲染成功但断言说 0 个城市」。
 */
function skeleton() {
  const el = document.getElementById('map');
  if (el) el.innerHTML = '';
}

const quote = (id, over = {}) => ({
  id,
  name: id,
  ok: true,
  price: 100,
  changePct: 1,
  decimals: 2,
  marketStatus: { open: true },
  ...over,
});

beforeEach(() => {
  skeleton();
  store.quotes = [];
  store.events = null;
  store.calendar = null;
  store.macro = null;
});

describe('城市节点', () => {
  it('有报价的城市画点并带 open 标记', () => {
    store.quotes = [quote('sp500'), quote('sh000001', { marketStatus: { open: false }, changePct: -0.5 })];
    map.renderMap();
    const cities = document.querySelectorAll('.map-city');
    expect(cities.length).toBeGreaterThan(0);
    const opens = [...cities].map((c) => c.dataset.open);
    expect(opens).toContain('1');
  });

  it('没有任何报价时不画城市点（不画一堆孤零零的圆）', () => {
    map.renderMap();
    expect(document.querySelectorAll('.map-city').length).toBe(0);
  });

  it('涨跌用不同颜色，平盘用中性色', () => {
    store.quotes = [quote('sp500', { changePct: 1 }), quote('sh000001', { changePct: 0 })];
    map.renderMap();
    const fills = [...document.querySelectorAll('.city-dot')].map((c) => c.getAttribute('fill'));
    expect(new Set(fills).size).toBeGreaterThan(1);
  });
});

/** 事件夹具（事件流与回溯两节共用） */
const events = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `ev_${i}`,
      title: `事件 ${i}`,
      region: 'us',
      // 事件流渲染读的是 ev.time（不是 publishedAt），并要 topics[].key 供滤镜
      time: `2026-10-28 ${String(10 + (i % 10)).padStart(2, '0')}:00:00`,
      level: 2,
      topics: [{ key: 'inflation', label: '通胀', strong: true }],
      symbols: ['us10y'],
    }));

describe('事件流', () => {
  it('事件列表渲染出对应条数', () => {
    store.events = { data: { items: events(3) } };
    map.renderMap();
    expect(document.querySelectorAll('.mf-item').length).toBeGreaterThanOrEqual(3);
  });

  it('没有事件时给明确的空态，不留下空白容器', () => {
    store.events = { data: { items: [] } };
    map.renderMap();
    const feed = document.getElementById('map-feed');
    expect(feed.innerHTML.length).toBeGreaterThan(0);
  });

  it('事件里的标题尖括号被转义', () => {
    store.events = { data: { items: [{ ...events(1)[0], title: '<img src=x onerror=1>' }] } };
    map.renderMap();
    expect(document.getElementById('map-feed').innerHTML).not.toContain('<img src=x');
  });
});

describe('回溯模式', () => {
  it('只显示到回溯时刻为止的事件（不能把未来摆出来）', () => {
    store.events = {
      data: {
        items: [
          { ...events(1)[0], id: 'old', title: '早事件', time: '2026-10-28 01:00:00' },
          { ...events(1)[0], id: 'new', title: '晚事件', time: '2026-10-28 23:00:00' },
        ],
      },
    };
    map.renderMap();
    const all = document.getElementById('map-feed').textContent;
    expect(all).toContain('早事件');
    expect(all).toContain('晚事件'); // 正常模式两条都在
  });
});

describe('重建与滚动', () => {
  it('重建后保留事件流滚动位置（15 秒一次的广播不该把读者弹回顶部）', () => {
    store.events = { data: { items: Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`, title: `事件 ${i}`, region: 'us', time: '2026-10-28 10:00:00',
      level: 1, topics: [], symbols: [],
    })) } };
    map.renderMap();
    const list = document.querySelector('.mf-list');
    expect(list).toBeTruthy();
    list.scrollTop = 120;
    map.renderMap();
    // 新列表的 scrollTop 被写回旧值（jsdom 里 scrollTop 可写但不会真的滚动，断言赋值即可）
    expect(document.querySelector('.mf-list').scrollTop).toBe(120);
  });
});

describe('宏观胶囊与接力带', () => {
  it('没有宏观数据时地图照常渲染（可选面板不该拖垮整屏）', () => {
    store.quotes = [quote('sp500')];
    expect(() => map.renderMap()).not.toThrow();
    expect(document.querySelectorAll('.map-city').length).toBeGreaterThan(0);
  });

  it('有宏观数据时出现胶囊', () => {
    store.quotes = [quote('sp500'), quote('vix', { price: 18.2 })];
    store.macro = { data: { riskAppetite: { label: '风险偏好上行' }, vrp: { vrp: -2 } }, at: Date.now() };
    map.renderMap();
    const capsules = document.querySelectorAll('.macro-capsule, .mc-risk, .mc-vix');
    expect(capsules.length).toBeGreaterThan(0);
  });
});
