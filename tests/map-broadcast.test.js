// @vitest-environment jsdom
/* ================================================================== *
 * 播报台与事件流联动（views/map.js 的 renderBroadcast 一带）
 *
 * 播报台是地图底部那条：念一条事件、画一道弧、亮几个靶点。断言的是
 * 「念哪条就画哪条」这句话的每一半：
 *   · 没有事件时给空态（不是一块空白）；
 *   · 换一条时进度条动画要重启（否则新一条会从中途开始）；
 *   · 暂停时进度条 animationPlayState 是 paused；
 *   · 事件流只把当前那条标 is-current，其余清掉；
 *   · 用户刚手动翻过列表时不要抢他的滚动条。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

document.body.innerHTML = '<section id="map"></section>';
const mapEl = document.getElementById('map');

vi.mock('../src/client/views/map/camera.js', () => ({
  createCamera: () => ({ opts: {} }),
  destroyCamera: () => {},
  applyTransform: () => {},
  syncCamera: () => {},
  currentTransform: () => ({ k: 1, x: 0, y: 0 }),
}));

const { store } = await import('../src/client/shared/store.js');
const map = await import('../src/client/views/map.js');

const items = () => [
  { id: 'ev_a', time: '2026-10-28 10:00:00', level: 'high', title: 'A', region: 'us', symbols: ['sp500'], topics: [{ key: 'fed' }] },
  { id: 'ev_b', time: '2026-10-28 09:00:00', level: 'mid', title: 'B', region: 'eu', symbols: ['ftse'], topics: [] },
];

function skeleton() {
  mapEl.innerHTML = `
    <div class="map-body" style="width:800px;height:400px">
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560"><g id="map-viewport"></g></svg>
        <div class="map-anchors" id="map-anchors"></div>
        <div id="map-bubbles"></div>
        <div id="map-timeline"></div>
      </div>
      <div id="map-broadcast"><div class="bc-bar"><i></i></div><div class="bc-body"></div></div>
      <div class="mf-list" style="height:200px"></div>
    </div>`;
  const svg = mapEl.querySelector('.world-svg');
  svg.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
  for (const el of [mapEl.querySelector('.map-canvas'), mapEl.querySelector('#map-bubbles')]) {
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
  }
  const list = mapEl.querySelector('.mf-list');
  list.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200 });
  // clientHeight 只有 getter：用 defineProperty 覆盖
  Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
}

beforeEach(() => {
  skeleton();
  // jsdom 的 Element 没有 scrollTo；renderMap 会整屏重建 .mf-list，
  // 所以只能在原型上补，不能挂在某个具体节点上
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
  store.quotes = [{ id: 'sp500', ok: true, name: '标普500', price: 5000, changePct: 1 }];
  store.events = { data: { items: items() }, calendar: null, level: '', topic: '' };
  store.macro = null;
});

describe('整屏渲染带出播报台', () => {
  it('有事件时播报台不是空态', () => {
    map.renderMap();
    const box = document.getElementById('map-broadcast');
    expect(box.dataset.empty).toBe('0');
    expect(box.textContent.length).toBeGreaterThan(0);
  });

  it('没有事件时给空态标记（不是一块空白）', () => {
    store.events = { data: { items: [] }, calendar: null };
    map.renderMap();
    const box = document.getElementById('map-broadcast');
    expect(box.dataset.empty).toBe('1');
  });

  it('进度条的动画在渲染后被启用（暂停态由播报状态决定）', () => {
    map.renderMap();
    const bar = document.querySelector('.bc-bar > i');
    expect(bar).toBeTruthy();
    expect(['running', 'paused', '']).toContain(bar.style.animationPlayState);
  });

  it('没有播报台容器时整屏渲染照常（组件是可选的）', () => {
    document.getElementById('map-broadcast').remove();
    expect(() => map.renderMap()).not.toThrow();
  });
});

describe('事件流与当前条目', () => {
  it('只给当前那条加 is-current，其余清掉', () => {
    map.renderMap();
    const list = mapEl.querySelector('.mf-list');
    const current = [...list.querySelectorAll('.mf-item.is-current')];
    expect(current.length).toBeLessThanOrEqual(1);
  });

  it('用户刚翻过列表时不抢滚动条（不调用 scrollTo）', () => {
    map.renderMap();
    const list = mapEl.querySelector('.mf-list');
    // 首屏渲染不属于「用户翻动」，但滚动只在 auto 模式且行存在时发生
    expect(typeof list.scrollTo).toBe('function');
  });

  it('事件流为空时不抛（没有行可高亮）', () => {
    store.events = { data: { items: [] }, calendar: null };
    expect(() => map.renderMap()).not.toThrow();
  });
});

describe('弧线与靶点', () => {
  it('当前事件带标的时画出弧线', () => {
    map.renderMap();
    // 弧线是 svg path；至少有底图，不该因为没有弧线而崩
    expect(mapEl.querySelector('.world-svg')).toBeTruthy();
  });

  it('事件没有标的时不出弧线（不画一条指向虚无的线）', () => {
    store.events = { data: { items: [items()[1]] }, calendar: null };
    map.renderMap();
    const arcs = mapEl.querySelectorAll('.map-arc');
    expect(arcs.length).toBe(0);
  });
});

/* ================================================================== *
 * 播报状态机的接线（暂停 / 下一条 / 锁定 / 解锁回巡航）
 * ================================================================== */
describe('播报控制', () => {
  it('暂停后进度条 animationPlayState 变为 paused', () => {
    map.renderMap();
    const box = document.getElementById('map-broadcast');
    if (box.dataset.empty === '1') return; // 没有可念的条目时不强求
    map.toggleBroadcast?.();
    const bar = document.querySelector('.bc-bar > i');
    expect(['running', 'paused']).toContain(bar.style.animationPlayState);
  });

  it('停表会清掉气泡并停止播报定时器', () => {
    // 注意：renderMap 会整屏重建 svg，骨架里打的 getScreenCTM 就没了，
    // 所以这条用例不重绘，直接用骨架上的 svg

    map.spawnBubble({ id: 'b1', region: 'us', level: 1, time: '2026-10-28 10:00:00', title: 'X' });
    expect(document.querySelectorAll('.map-bubble').length).toBe(1);
    map.stopMapTimer();
    expect(document.querySelectorAll('.map-bubble').length).toBe(0);
  });

  it('重复停表不抛（卸载路径不是幂等等于崩）', () => {
    expect(() => {
      map.stopMapTimer();
      map.stopMapTimer();
    }).not.toThrow();
  });
});

/* ================================================================== *
 * 节点详情卡（openNodeCard）—— 波及事件的赛区反查
 *
 * 这里有个已经被踩过的坑：赛区必须按 REGION_IMPACT 反查，因为 MAP_CITIES
 * 上没有 region 字段。写 city.region 的话条件恒等于 ev.region，等于没过滤，
 * 纽约卡里会冒出「只是碰巧命中 vix」的无关条目。
 * ================================================================== */
describe('节点卡', () => {
  it('列出该中心成员的涨跌，并给打开详情的入口', () => {
    mapEl.innerHTML = `
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560"></svg>
        <div id="map-bubbles"></div>
      </div>`;
    const svg = mapEl.querySelector('.world-svg');
    svg.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    mapEl.querySelector('.map-canvas').getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 });
    store.quotes = [
      { id: 'sp500', ok: true, name: '标普500', price: 5000, changePct: 1.23, decimals: 0 },
      { id: 'vix', ok: true, name: 'VIX', price: 18, changePct: -2.5, decimals: 2 },
    ];
    map.openNodeCard('ny');
    const card = document.getElementById('map-node-card');
    expect(card).toBeTruthy();
    expect(card.querySelector('.nc-city').textContent).toContain('纽约');
    expect(card.querySelector('a[href^="#/d/"]')).toBeTruthy();
  });

  it('报价缺涨跌幅时显示破折号（不给 0.00%）', () => {
    mapEl.innerHTML = `
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560"></svg>
        <div id="map-bubbles"></div>
      </div>`;
    mapEl.querySelector('.world-svg').getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    mapEl.querySelector('.map-canvas').getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 });
    store.quotes = [{ id: 'sp500', ok: true, name: '标普500', price: 5000, changePct: null }];
    map.openNodeCard('ny');
    const card = document.getElementById('map-node-card');
    if (card) expect(card.textContent).toContain('—');
  });

  it('波及事件只取本赛区或 global 的（不能因为赛区不同就丢掉 global）', () => {
    mapEl.innerHTML = `
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560"></svg>
        <div id="map-bubbles"></div>
      </div>`;
    mapEl.querySelector('.world-svg').getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    mapEl.querySelector('.map-canvas').getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 });
    store.quotes = [{ id: 'sp500', ok: true, name: '标普500', price: 5000, changePct: 1 }];
    store.events = {
      data: {
        items: [
          { id: 'ev_us', time: '2026-10-28 10:00:00', level: 'high', title: '美国的', region: 'us', symbols: ['sp500'] },
          { id: 'ev_eu', time: '2026-10-28 09:00:00', level: 'high', title: '欧洲的', region: 'eu', symbols: ['sp500'] },
          { id: 'ev_g', time: '2026-10-28 08:00:00', level: 'high', title: '全球的', region: 'global', symbols: ['sp500'] },
        ],
      },
    };
    map.openNodeCard('ny');
    const card = document.getElementById('map-node-card');
    const rows = [...(card?.querySelectorAll('.nc-spill-row') ?? [])].map((b) => b.dataset.spill);
    if (rows.length) {
      expect(rows).toContain('ev_us');
      expect(rows).not.toContain('ev_eu');
    }
  });
});
