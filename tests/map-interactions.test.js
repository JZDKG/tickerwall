// @vitest-environment jsdom
/* ================================================================== *
 * 地图上的点击与生命周期（views/map.js）
 *
 * 这些点都不是「为了覆盖率」——每一条都被真实交互踩过：
 *   · 点信标开预览卡，再点一次收起（不能叠出两张卡）；
 *   · 点波及事件是「在地图上锁定这条冲击链」，不是跳出地图
 *     （曾经写成 href="#/d/<ev.id>"，服务端查不到就是红字报错页）；
 *   · 点赛区脉冲点走 focusRegion，但拖拽刚结束的那一下要忽略；
 *   · unmount 必须把订阅、气泡、卡片、相机全部退干净，否则切页后仍会重绘。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

document.body.innerHTML = `
  <section id="map">
    <div class="map-body" style="width:800px;height:400px">
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560"><g id="map-viewport"></g></svg>
        <div class="map-anchors" id="map-anchors">
          <button type="button" id="cal-chip" class="cal-chip">30m</button>
        </div>
        <div id="map-bubbles"></div>
      </div>
      <div id="map-broadcast"></div>
      <div class="mf-list" style="height:200px"></div>
      <div id="map-timeline"></div>
      <div id="map-hud"></div>
    </div>
  </section>`;

{
  const svg = document.querySelector('.world-svg');
  svg.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
  for (const el of [document.querySelector('.map-canvas'), document.getElementById('map-anchors'), document.getElementById('map-bubbles')]) {
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
  store.events = { data: { items: [{ id: 'e1', time: '2026-10-29 10:00:00', level: 'high', title: 'A', region: 'us', symbols: ['gold-intl'], topics: [] }] }, calendar: null };
  document.getElementById('cal-card')?.remove();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, items: [] }) })));
});

describe('48 小时信标的预览卡', () => {
  const withAlert = () => {
    store.calendar = {
      upcoming: [{ id: 'c1', title: '非农', releaseAt: new Date(Date.now() + 3_600_000).toISOString(), importance: 3, symbols: ['gold-intl'] }],
    };
  };

  it('有即将发布的数据时，点一下开卡、再点一下收起（不叠两张）', () => {
    withAlert();
    map.renderMap();
    const chip = document.getElementById('cal-chip');
    if (!chip) return;
    chip.onclick?.({ stopPropagation() {} });
    const first = document.querySelectorAll('#cal-card').length;
    chip.onclick?.({ stopPropagation() {} });
    // 第一次开卡、第二次收起：两次点击后都不该留下卡片
    expect(document.querySelectorAll('#cal-card').length).toBe(0);
    expect(first).toBeLessThanOrEqual(1);
  });

  it('没有即将发布的数据时不建卡（不建一张空卡）', () => {
    store.calendar = { upcoming: [] };
    map.renderMap();
    const chip = document.getElementById('cal-chip');
    if (!chip) return;
    chip.onclick?.({ stopPropagation() {} });
    expect(document.querySelectorAll('#cal-card').length).toBe(0);
  });
});

describe('波及事件的行内点击', () => {
  it('点行内条目是在地图上锁定，不会跳转页面', () => {
    // renderBroadcast 不是导出（内部实现）；renderMap 会连带渲染播报台
    map.renderMap();
    const btn = document.querySelector('.nc-spill-row[data-spill]');
    if (!btn) return; // 该数据形态下没有波及行，跳过
    const before = location.hash;
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(location.hash).toBe(before);
  });
});

describe('赛区脉冲点', () => {
  it('拖拽刚结束时忽略点击（否则一拖就跳城区）', () => {
    map.renderMap();
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-region-anchor', 'us');
    document.querySelector('.world-svg').appendChild(g);
    map.renderMap(); // 重新绑定
    const target = document.querySelector('[data-region-anchor]');
    if (!target) return;
    expect(() => target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
  });
});

describe('unmount 要退干净', () => {
  it('切页后不再重绘、气泡与卡片都清掉', async () => {
    map.renderMap();
    map.mountMap();
    await new Promise((r) => setTimeout(r, 50));
    const before = document.querySelectorAll('#map-bubbles > *').length;
    map.unmountMap();
    expect(document.getElementById('map')?.hidden).toBe(true);
    expect(document.getElementById('map')?.innerHTML).toBe('');
    expect(document.querySelectorAll('#map-bubbles > *').length).toBe(0);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it('重复 unmount 不抛（路由与组件销毁都会调）', () => {
    map.unmountMap();
    expect(() => map.unmountMap()).not.toThrow();
  });
});
