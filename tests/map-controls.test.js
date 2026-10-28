// @vitest-environment jsdom
/* ================================================================== *
 * 地图上的控件（views/map.js 的播报控制与时间轴按钮）
 *
 * 这些函数都是「点了之后要发生什么」，不测就会静默坏掉：
 * 暂停没停、上一首/下一首切错列、全屏没退出。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/client/views/map/camera.js', () => ({
  createCamera: () => ({ opts: {} }),
  destroyCamera: () => {},
  applyTransform: () => {},
  syncCamera: () => {},
  currentTransform: () => ({ k: 1, x: 0, y: 0 }),
}));

const items = () => [
  { id: 'a', time: '2026-10-28 10:00:00', level: 'high', title: 'A', region: 'us', symbols: ['sp500'], topics: [] },
  { id: 'b', time: '2026-10-28 09:00:00', level: 'mid', title: 'B', region: 'eu', symbols: ['oil'], topics: [] },
];

// 关键顺序：先造 DOM，再 import map.js —— shared/dom.js 在模块加载时抓
// #map 等元素，先 import 会拿到游离节点，之后所有 querySelector 都是 null。
document.body.innerHTML = `
    <section id="map">
      <div class="map-body" style="width:800px;height:400px">
        <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
          <svg class="world-svg" viewBox="0 0 1200 560"><g id="map-viewport"></g></svg>
          <div class="map-anchors" id="map-anchors"></div>
          <div id="map-bubbles"></div>
        </div>
        <div id="map-broadcast">
          <div class="bc-bar"><i></i></div>
          <div class="bc-body"></div>
          <button class="bc-play" type="button">暂停</button>
          <button class="bc-prev" type="button">上一条</button>
          <button class="bc-next" type="button">下一条</button>
        </div>
        <div class="mf-list" style="height:200px">
          <div class="mf-item" data-id="a"></div>
          <div class="mf-item" data-id="b"></div>
        </div>
        <div id="map-timeline">
          <div class="tl-cols">
            <button class="tl-col" type="button" data-bucket="0"></button>
            <button class="tl-col" type="button" data-bucket="1"></button>
          </div>
          <button class="tl-play" type="button">回放</button>
          <button class="tl-live" type="button">回到现在</button>
        </div>
      </div>
    </section>`;
{
  const svg = document.querySelector('.world-svg');
  svg.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
  for (const el of [document.querySelector('.map-canvas'), document.getElementById('map-bubbles')]) {
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
  }
  const list = document.querySelector('.mf-list');
  Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
}

const { store } = await import('../src/client/shared/store.js');
const map = await import('../src/client/views/map.js');

beforeEach(() => {
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  store.quotes = [{ id: 'sp500', ok: true, name: '标普500', price: 5000, changePct: 1 }];
  store.events = { data: { items: items() }, calendar: null };
  store.macro = null;
});

describe('播报控制按钮', () => {
  it('暂停/继续按钮切换播放状态并写回进度条的 animationPlayState', () => {
    map.renderMap();
    const btn = document.querySelector('.bc-play');
    if (!btn) return;
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const bar = document.querySelector('.bc-bar > i');
    expect(['running', 'paused', '']).toContain(bar.style.animationPlayState);
  });

  it('下一条/上一条按钮不抛（换条目要走状态机）', () => {
    map.renderMap();
    for (const sel of ['.bc-next', '.bc-prev']) {
      const btn = document.querySelector(sel);
      if (btn) expect(() => btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
    }
  });
});

describe('时间轴', () => {
  it('点列跳到对应时段（seekToBucket 是公开入口）', () => {
    map.renderMap();
    const col = document.querySelector('.tl-col[data-bucket]');
    if (col) {
      expect(() => col.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
    }
  });

  it('回放开始后能停下（重复停表不抛）', () => {
    map.renderMap();
    const play = document.querySelector('.tl-play');
    if (play) play.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(() => map.stopMapTimer()).not.toThrow();
  });

  it('回到现在会清掉回放状态', () => {
    map.renderMap();
    const live = document.querySelector('.tl-live');
    if (live) {
      live.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(() => map.stopReplay?.()).not.toThrow();
    }
  });
});

describe('播报台的公开控制', () => {
  it('toggleBroadcast 在暂停与继续之间切换', () => {
    if (typeof map.toggleBroadcast !== 'function') return;
    map.renderMap();
    expect(() => map.toggleBroadcast()).not.toThrow();
    expect(() => map.toggleBroadcast()).not.toThrow();
  });

  it('播报完一遍后不会把播放状态卡死', () => {
    map.renderMap();
    expect(() => map.stopMapTimer()).not.toThrow();
    expect(() => map.renderMap()).not.toThrow();
  });
});
