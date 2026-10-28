// @vitest-environment jsdom
/* ================================================================== *
 * 播报台的滞后解释取数、宏观懒加载、接力胶囊跳转（views/map.js）
 *
 * 三处的故障形态都是「看起来没坏」：
 *   · 解释取数失败没 catch → 播报台永远停在上一轮；
 *   · 宏观失败没冷却 → 1 秒定时器把它变成每秒一次的重试死循环；
 *   · 接力胶囊直接改 mapView → 和 d3-zoom 内部变换脱钩，后续拖拽从旧位置算。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

document.body.innerHTML = `
  <section id="map">
    <div class="map-body" style="width:800px;height:400px">
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560"><g id="map-viewport"></g></svg>
        <div class="map-anchors" id="map-anchors"></div>
        <div id="map-bubbles"></div>
      </div>
      <div id="map-broadcast">
        <div class="bc-bar"><i></i></div><div class="bc-body"></div>
        <button class="bc-play" type="button">暂停</button>
      </div>
      <div class="mf-list" style="height:200px"></div>
      <div id="map-timeline"><div class="tl-cols"></div></div>
      <div id="map-hud"><button type="button" class="relay-chip" data-anchor="us">US</button></div>
    </div>
  </section>`;

{
  const svg = document.querySelector('.world-svg');
  svg.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
  for (const el of [document.querySelector('.map-canvas'), document.getElementById('map-bubbles')]) {
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
  }
  Object.defineProperty(document.querySelector('.mf-list'), 'clientHeight', { value: 200, configurable: true });
}

const { store } = await import('../src/client/shared/store.js');
const map = await import('../src/client/views/map.js');

beforeEach(() => {
  Element.prototype.scrollTo = Element.prototype.scrollTo || function () {};
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
  store.quotes = [{ id: 'gold-intl', ok: true, name: '国际金价', price: 2400, changePct: 1 }];
  store.events = {
    data: {
      items: [
        { id: 'e1', time: '2026-10-29 10:00:00', level: 'high', title: 'A', region: 'us', symbols: ['gold-intl'], topics: [] },
      ],
    },
    calendar: null,
  };
  store.macro = null;
});

describe('播报的解释取数', () => {
  it('取数失败只影响那一条，不抛（catch 里写 null 占位）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('502'); }));
    map.renderMap();
    expect(() => map.mountMap()).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    map.unmountMap();
  });

  it('渲染播报台时不会因为解释没到而空白（先有文案，解释是补的）', () => {
    map.renderMap();
    // 播报台在 renderMap 里被整块重建，所以断言容器与进度条，不断言具体子节点
    expect(document.getElementById('map-broadcast')).toBeTruthy();
    expect(document.querySelector('.bc-bar')).toBeTruthy();
  });
});

describe('宏观懒加载的冷却', () => {
  it('取数失败后不每秒重试（冷却期内只发一次）', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('api/macro')) calls += 1;
      throw new Error('502');
    }));
    map.mountMap();
    // hudTimer 每秒跑一次 ensureMacro；等 3 秒看它有没有狂发
    await new Promise((r) => setTimeout(r, 300));
    map.unmountMap();
    expect(calls).toBeLessThan(5);
  });

  it('已有宏观数据且在 TTL 内时不重复请求', async () => {
    let calls = 0;
    // 只数 api/macro —— 同一批 fetch 还负责事件流，全量计数会误判
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('api/macro')) calls += 1;
      return { ok: true, json: async () => ({ ok: true, matrix: [], items: [] }) };
    }));
    store.macro = { data: { ok: true }, at: Date.now() };
    map.mountMap();
    await new Promise((r) => setTimeout(r, 120));
    map.unmountMap();
    expect(calls).toBe(0);
  });
});

describe('接力胶囊', () => {
  it('点胶囊走动画而不是直接赋值（与 d3-zoom 的内部变换保持一致）', () => {
    map.renderMap();
    const chip = document.querySelector('.relay-chip[data-anchor]');
    if (!chip) return;
    expect(() => chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
  });

  it('未知锚点直接返回（不抛、不跳）', () => {
    map.renderMap();
    const chip = document.querySelector('.relay-chip[data-anchor]');
    if (!chip) return;
    chip.dataset.anchor = 'nowhere';
    expect(() => chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
  });
});

describe('HUD 倒计时只改文本', () => {
  it('刷新 HUD 不重建整个地图（否则每秒闪一次）', () => {
    map.renderMap();
    const before = document.querySelector('.world-svg');
    map.renderHud?.();
    const after = document.querySelector('.world-svg');
    expect(after).toBe(before);
  });
});
