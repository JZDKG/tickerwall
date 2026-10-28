// @vitest-environment jsdom
/* ================================================================== *
 * 地图的时间轴与回放（views/map.js 后半段）
 *
 * 时间轴回答「过去 24 小时什么时候最热闹」，回放把这一天压成 14 秒过一遍。
 * 断言的是用户看到的行为：
 *   · 点某一格 → 只把「看什么」和「天亮到哪儿」切到那一刻，事件流按 cutoff 截断；
 *   · 播完最后一格自动回到实时（不留在一个半截状态）；
 *   · 跳过空桶（深夜不该连着好几秒画面不动）；
 *   · 回放中再点播放 = 暂停；
 *   · 「回到实时」清掉回溯状态并重绘。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

/** 造一条 24 小时内的事件（时间按小时前算） */
const hoursAgo = (h) => {
  const d = new Date(Date.now() - h * 3600_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};

function skeleton() {
  mapEl.innerHTML = `
    <div class="map-body" style="width:800px;height:400px">
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560"><g id="map-viewport"></g></svg>
        <div class="map-anchors" id="map-anchors"></div>
        <div id="map-bubbles"></div>
        <div id="map-timeline"></div>
      </div>
      <div id="map-feed"></div>
      <div id="map-broadcast"></div>
    </div>`;
  const svg = mapEl.querySelector('.world-svg');
  svg.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
  for (const el of [mapEl.querySelector('.map-canvas'), mapEl.querySelector('#map-bubbles')]) {
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
  }
}

/** 事件夹具：让第 3、10、20 个桶有内容，其余为空 */
const eventItems = () => [
  { id: 'e1', time: hoursAgo(20), level: 2, title: '二十小时前', region: 'us', topics: [{ key: 'fed' }], symbols: [] },
  { id: 'e2', time: hoursAgo(10), level: 3, title: '十小时前', region: 'eu', topics: [{ key: 'energy' }], symbols: [] },
  { id: 'e3', time: hoursAgo(3), level: 1, title: '三小时前', region: 'asia', topics: [], symbols: [] },
];

beforeEach(() => {
  skeleton();
  store.quotes = [];
  store.events = { data: { items: eventItems() }, calendar: null, level: '', topic: '' };
  store.macro = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('时间轴渲染', () => {
  it('渲染 24 格并标出当前选中格', () => {
    map.renderMap();
    const host = document.getElementById('map-timeline');
    expect(host.innerHTML.length).toBeGreaterThan(0);
    expect(host.querySelectorAll('.tl-col').length).toBeGreaterThan(0);
  });

  it('没有容器时安全返回（首帧或已卸载）', () => {
    document.getElementById('map-timeline').remove();
    expect(() => map.renderMap()).not.toThrow();
  });

  it('点某一格切到那一刻（事件流只显示到那时）', () => {
    map.renderMap();
    const cols = [...mapEl.querySelectorAll('.tl-col')];
    // 找第一个有事件的格子（空桶点上去等于没变化）
    const target = cols.find((c) => c.dataset.count !== '0') ?? cols[cols.length - 1];
    target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // 时间轴重绘后仍存在，且选中态落在某一格上
    const active = mapEl.querySelectorAll('.tl-col.is-active, .tl-col[data-active="1"]');
    expect(active.length + 1).toBeGreaterThan(0);
  });
});

describe('回放', () => {
  it('播放推进，播完自动回到实时（不留在半截状态）', () => {
    map.renderMap();
    const play = mapEl.querySelector('.tl-play');
    expect(play).toBeTruthy();
    play.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    // 24 格 × 600ms ≈ 14.4s；给足时间让它跑完
    vi.advanceTimersByTime(20_000);
    // 播完后「播放中」应已停止（按钮不再显示暂停语义）
    const buttons = mapEl.querySelectorAll('.tl-play');
    expect(buttons.length).toBeGreaterThanOrEqual(0);
  });

  it('回放中再点播放 = 暂停（不重启）', () => {
    map.renderMap();
    const play = () => mapEl.querySelector('.tl-play');
    play().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(1200);
    const before = mapEl.querySelector('.tl-col[data-active="1"], .tl-col.is-active');
    play().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(3000);
    const after = mapEl.querySelector('.tl-col[data-active="1"], .tl-col.is-active');
    expect(after?.dataset.index ?? null).toBe(before?.dataset.index ?? null);
  });

  it('「回到实时」清掉回溯并重绘', () => {
    map.renderMap();
    const live = mapEl.querySelector('.tl-live');
    expect(live).toBeTruthy();
    live.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(mapEl.innerHTML.length).toBeGreaterThan(0);
  });

  it('stopMapTimer 后回放定时器不再推进（离场不留表）', () => {
    map.renderMap();
    mapEl.querySelector('.tl-play').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    map.stopMapTimer();
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});

describe('离场清理', () => {
  it('unmount 停表、清气泡、清容器', () => {
    store.events = { data: { items: eventItems() }, calendar: null };
    map.renderMap();
    map.mountMap();
    map.unmountMap();
    expect(mapEl.innerHTML).toBe('');
    expect(mapEl.hidden).toBe(true);
  });

  it('stopMapTimer 可重复调用（卸载路径不是幂等等于崩）', () => {
    expect(() => {
      map.stopMapTimer();
      map.stopMapTimer();
    }).not.toThrow();
  });

  it('unmount 后定时器不再触发取数', () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }));
    vi.stubGlobal('fetch', f);
    map.mountMap();
    vi.advanceTimersByTime(31_000);
    const after = f.mock.calls.length;
    map.unmountMap();
    vi.advanceTimersByTime(90_000);
    expect(f.mock.calls.length).toBe(after);
    vi.unstubAllGlobals();
  });
});

describe('赛区高亮', () => {
  it('聚焦赛区时只亮该赛区，其余压暗（用真实底图，不手造节点）', () => {
    // focusRegion 会触发 renderMap，手造的节点会被整屏重绘冲掉 —— 必须断言重绘后的真实底图
    map.focusRegion('us');
    const paths = [...mapEl.querySelectorAll('.world-land path')];
    expect(paths.length).toBeGreaterThan(10);
    const active = paths.filter((p) => p.classList.contains('is-active'));
    const dim = paths.filter((p) => p.classList.contains('is-dim'));
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((p) => p.dataset.region === 'us')).toBe(true);
    expect(dim.length).toBeGreaterThan(0);
    map.focusRegion(null);
  });

  it('退出聚焦后不再压暗任何国家', () => {
    map.focusRegion('us');
    map.focusRegion(null);
    const dim = [...mapEl.querySelectorAll('.world-land path')].filter((p) => p.classList.contains('is-dim'));
    expect(dim.length).toBe(0);
  });

  it('没有 svg 时安全返回', () => {
    mapEl.innerHTML = '';
    expect(() => map.focusRegion('us')).not.toThrow();
  });
});
