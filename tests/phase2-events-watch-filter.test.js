// @vitest-environment jsdom
/* ================================================================== *
 * Phase 2 / P2-T3：事件中心「只看自选相关」过滤 + 首屏星标 / 合成指标条
 *
 * 过滤口径必须和列表星标用的是同一份本地数据，否则「星标了却筛不出来」。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
};

const sharedStorage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: sharedStorage, configurable: true, writable: true });

document.body.innerHTML = `
  <div id="updated"></div><div id="countdown"></div><button id="refresh"></button>
  <div id="synthetics-strip"></div>
  <main id="rows"></main><section id="detail"></section><section id="macro"></section>
  <section id="events"></section><section id="map"></section><button id="briefing-btn"></button>
  <div id="ws-bar"></div>
`;

const events = await import('../src/client/views/events.js');
const list = await import('../src/client/views/list.js');
const { store, refs } = await import('../src/client/shared/store.js');
const { togglePinnedAsset, readPinnedAssets } = await import('../src/client/shared/watchlist.js');
const eventsEl = document.getElementById('events');
const rowsEl = document.getElementById('rows');

const DATA = {
  total: 3,
  generatedAt: '2026-10-26T02:05:00Z',
  items: [
    { id: 'a', time: '2026-10-26 10:00:00', level: 'high', title: '黄金', topics: [{ key: 'fed', label: '货币政策' }], symbols: ['gold-intl'], publisher: 'P', source: 'S' },
    { id: 'b', time: '2026-10-26 09:00:00', level: 'mid', title: '原油', topics: [{ key: 'energy', label: '能源' }], symbols: ['oil'], publisher: 'P2', source: 'S2' },
    { id: 'c', time: '2026-10-26 08:00:00', level: 'low', title: '无标的', topics: [], symbols: [], publisher: '金十', source: '金十' },
  ],
  topics: [], sources: [], coverage: null, counts: { high: 1, mid: 1, low: 0 },
};

const paint = (over = {}) => {
  store.events = { data: DATA, calendar: null, level: 'all', topic: null, origin: 'all', newIds: null, newCount: 0, ...over };
  events.renderEvents();
};

describe('事件中心：只看自选相关', () => {
  beforeEach(() => {
    localStorage.clear?.();
    // memoryStorage 没有 clear，直接写空数组
    localStorage.setItem('kanban.pinnedAssets.v1', '[]');
    eventsEl.innerHTML = '';
  });

  it('渲染出开关按钮', () => {
    paint();
    expect(eventsEl.querySelector('[data-watch-only]')).toBeTruthy();
  });

  it('默认关闭：全部条目都在', () => {
    paint();
    expect(eventsEl.querySelectorAll('.event')).toHaveLength(3);
  });

  it('只看自选：只留 symbols 与置顶标的相交的条目', () => {
    togglePinnedAsset(localStorage, 'gold-intl');
    togglePinnedAsset(localStorage, 'oil');
    expect(readPinnedAssets(localStorage)).toEqual(['gold-intl', 'oil']);
    store.events = { data: DATA, calendar: null, level: 'all', topic: null, origin: 'all', newIds: null, newCount: 0 };
    events.renderEvents({ watchOnly: true });
    const titles = [...eventsEl.querySelectorAll('.event')].map((e) => e.textContent);
    expect(eventsEl.querySelectorAll('.event')).toHaveLength(2);
    expect(titles.join(' ')).toContain('黄金');
    expect(titles.join(' ')).toContain('原油');
    expect(titles.join(' ')).not.toContain('无标的');
  });

  it('没有置顶标的时给空状态文案，而不是整页空白', () => {
    store.events = { data: DATA, calendar: null, level: 'all', topic: null, origin: 'all', newIds: null, newCount: 0 };
    events.renderEvents({ watchOnly: true });
    expect(eventsEl.textContent).toContain('自选');
  });

  it('点开关写回 store.events.watchOnly 并重绘', () => {
    togglePinnedAsset(localStorage, 'gold-intl');
    paint();
    const btn = eventsEl.querySelector('[data-watch-only]');
    btn.click();
    expect(store.events.watchOnly).toBe(true);
    expect(eventsEl.querySelectorAll('.event')).toHaveLength(1);
    const btn2 = eventsEl.querySelector('[data-watch-only]');
    btn2.click();
    expect(store.events.watchOnly).toBe(false);
  });
});

describe('首屏：星标与合成指标条', () => {
  beforeEach(() => {
    sharedStorage.clear();
    rowsEl.innerHTML = '';
    refs.clear();
    store.quotes = null;
  });

  it('每行有星标按钮，点击写回本地并切换 pressed 状态', () => {
    list.renderSkeleton();
    const btn = refs.get('gold-intl').el.querySelector('[data-pin]');
    expect(btn).toBeTruthy();
    btn.click();
    expect(sharedStorage.getItem('kanban.pinnedAssets.v1')).toContain('gold-intl');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    btn.click();
    expect(sharedStorage.getItem('kanban.pinnedAssets.v1')).not.toContain('gold-intl');
  });

  it('apply 收到 synthetics 时渲染指标条，并缓存到 store.synthetics', () => {
    list.apply({
      items: [],
      synthetics: [
        { id: 'gold-oil-ratio', name: '金油比', ok: true, value: 37.85, unit: '桶/盎司' },
        { id: 'gold-silver-ratio', name: '金银比', ok: false, value: null, unit: '倍', reason: '缺白银' },
      ],
    });
    expect(store.synthetics).toHaveLength(2);
    const strip = document.getElementById('synthetics-strip');
    expect(strip).toBeTruthy();
    expect(strip.textContent).toContain('金油比');
    expect(strip.querySelector('.synthetic-chip.is-dead')).toBeTruthy();
  });
});
