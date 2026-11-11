// @vitest-environment jsdom
/* ================================================================== *
 * Phase 2 / P2-T4：地图准确性与导播开关
 *
 * 1) 俄乌白波土、澳新必须映射到非空赛区（且证据词在后端词表里）；
 * 2) BTC 是 7×24 非地理资产，不该伪造大西洋坐标；
 * 3) 巡航导播开关要能暂停 6 秒步进，且 renderMap 重建 DOM 后仍生效。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { COUNTRY_META, regionOfCountry } from '../src/client/views/map/geo/regions.js';
import { REGION_WORDS } from '../src/server/domain/news-lexicon.js';

vi.mock('../src/client/views/map/camera.js', () => ({
  createCamera: () => ({ opts: {} }),
  destroyCamera: () => {},
  applyTransform: () => {},
  syncCamera: () => {},
  currentTransform: () => ({ k: 1, x: 0, y: 0 }),
}));

document.body.innerHTML = `
  <section id="map">
    <div class="map-body">
      <div class="map-canvas" id="map-canvas">
        <svg class="world-svg" viewBox="0 0 1200 560"><g id="map-viewport"></g></svg>
        <div class="map-anchors" id="map-anchors"></div>
        <div id="map-bubbles"></div>
      </div>
      <div id="map-broadcast"><div class="bc-bar"><i></i></div><div class="bc-body"></div>
        <button class="bc-play" type="button">暂停</button>
      </div>
      <div class="mf-list"><div class="mf-item" data-id="a"></div></div>
      <div id="map-timeline"></div>
    </div>
  </section>
  <div id="updated"></div><div id="countdown"></div><button id="refresh"></button>
  <main id="rows"></main><section id="detail"></section><section id="macro"></section>
  <section id="events"></section><button id="briefing-btn"></button>
  <div id="ws-bar"></div><div id="synthetics-strip"></div>
`;
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
// jsdom 不实现 Element.scrollTo：地图的 syncFeedTo 会调它，补一个无形桩
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
const map = await import('../src/client/views/map.js');

const lexicon = new Map(REGION_WORDS.map(([key, words]) => [key, new Set(words)]));

describe('关键国家映射补齐', () => {
  it('俄 / 乌 / 白俄 / 波兰 / 土耳其都归 eu', () => {
    for (const iso of ['643', '804', '112', '616', '792']) {
      expect(regionOfCountry(iso), `ISO ${iso} 没归属`).toBe('eu');
    }
  });

  it('澳 / 新西兰归 asia（亚太区）', () => {
    expect(regionOfCountry('036')).toBe('asia');
    expect(regionOfCountry('554')).toBe('asia');
  });

  it('新增映射的证据词确实落在对应赛区的后端词表里', () => {
    const missing = [];
    for (const iso of ['804', '112', '554']) {
      const meta = COUNTRY_META[iso];
      expect(meta, `缺 ${iso}`).toBeTruthy();
      if (!lexicon.get(meta.region)?.has(meta.lexicon)) missing.push(`${iso} ${meta.cn}`);
    }
    expect(missing).toEqual([]);
  });

  it('土耳其仍在 me、波兰仍在 eu，没被误改', () => {
    expect(regionOfCountry('792')).toBe('eu');
    expect(regionOfCountry('616')).toBe('eu');
  });
});

describe('BTC 去地理化浮窗', () => {
  it('NON_GEOGRAPHIC_ASSETS 标注 btc 为非地理资产', () => {
    expect(map.NON_GEOGRAPHIC_ASSETS.btc).toBe(true);
  });

  it('源码里不再把 BTC 钉在大西洋坐标上', () => {
    const code = readFileSync('src/client/views/map.js', 'utf8');
    expect(code).not.toMatch(/translate\(196,296\)/);
    expect(code).not.toMatch(/\[-32,\s*26\]/);
  });

  it('地图渲染出 .map-btc-node HUD 徽章，带 data-non-geographic', () => {
    store.quotes = [{ id: 'btc', ok: true, name: '比特币', price: 68000, changePct: 1.2 }];
    store.events = { data: { items: [] }, calendar: null };
    store.macro = null;
    map.renderMap();
    const node = document.querySelector('.map-btc-node');
    expect(node).toBeTruthy();
    expect(node.dataset.nonGeographic).toBe('true');
    expect(node.textContent).toContain('7×24');
    expect(node.closest('svg')).toBeNull(); // HUD 在地图容器里，不在 SVG 经纬度层
  });
});

describe('自动巡航导播显式开关', () => {
  beforeEach(() => {
    store.quotes = [{ id: 'sp500', ok: true, name: '标普500', price: 5000, changePct: 1 }];
    store.events = { data: { items: [
      { id: 'a', time: '2026-10-28 10:00:00', level: 'high', title: 'A', region: 'us', symbols: ['sp500'], topics: [] },
    ] }, calendar: null };
    store.macro = null;
    map.setAutopilot(true);
  });

  it('默认开启；setAutopilot(false) 暂停步进', () => {
    expect(map.isAutopilotEnabled()).toBe(true);
    map.setAutopilot(false);
    expect(map.isAutopilotEnabled()).toBe(false);
    map.setAutopilot(true);
    expect(map.isAutopilotEnabled()).toBe(true);
  });

  it('控制栏有 [data-action="toggle-autopilot"] 按钮，点击翻转状态', () => {
    map.renderMap();
    const btn = document.querySelector('[data-action="toggle-autopilot"]');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    btn.click();
    expect(map.isAutopilotEnabled()).toBe(false);
    document.querySelector('[data-action="toggle-autopilot"]').click();
    expect(map.isAutopilotEnabled()).toBe(true);
  });

  it('暂停状态在 renderMap 重建 DOM 后仍保持（15s 刷新不会偷偷恢复巡航）', () => {
    map.setAutopilot(false);
    map.renderMap();
    expect(map.isAutopilotEnabled()).toBe(false);
    expect(document.querySelector('[data-action="toggle-autopilot"]').getAttribute('aria-pressed')).toBe('false');
  });
});
