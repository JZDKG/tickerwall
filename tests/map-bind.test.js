// @vitest-environment jsdom
/* ================================================================== *
 * 地图事件绑定（views/map.js bindMapEvents）
 *
 * 绑定的每一条都对应一个用户动作。这里断言的是**动作之后发生什么**：
 *   · 点城市（SVG 点或 HTML 城市名）就地开卡；
 *   · 刚拖完地图的那一次 click 不误触聚焦（这是 d3 的 drag 位移标志）；
 *   · 刷新按钮走 resetMapView；
 *   · 事件行悬停 → 预览该条冲击链。
 *
 * 相机换成假实现：d3-zoom 的真实手势在 map-camera.test.js 里验。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

document.body.innerHTML = '<section id="map"></section>';
const mapEl = document.getElementById('map');

const cameras = [];
vi.mock('../src/client/views/map/camera.js', () => ({
  createCamera: (node, opts) => {
    const cam = { node, opts, calls: [] };
    cameras.push(cam);
    return cam;
  },
  destroyCamera: () => {},
  /**
   * 真实 d3 的路径是：applyTransform → d3 应用变换 → 触发 zoom 事件 → onChange。
   * 假实现要照着走一遍，否则 mapView 永远不更新（测试会误判「复位没生效」）。
   */
  applyTransform: (node, cam, target) => {
    cam.calls.push(['apply', target]);
    cam.opts.onChange?.({ k: target.k, x: target.tx, y: target.ty });
  },
  syncCamera: () => {},
  currentTransform: () => ({ k: 1, x: 0, y: 0 }),
}));

const { LOGICAL_HEIGHT, LOGICAL_WIDTH } = await import('../src/client/views/map/geo/projection.js');
const { store } = await import('../src/client/shared/store.js');
const map = await import('../src/client/views/map.js');

function skeleton() {
  mapEl.innerHTML = `
    <div class="map-body" style="width:800px;height:400px">
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560">
          <g id="map-viewport"></g>
          <g class="map-city" data-city="ny" data-open="1"><circle r="3"/></g>
          <g class="map-city" data-city="sh" data-open="0"><circle r="3"/></g>
        </svg>
        <div class="map-anchors" id="map-anchors">
          <div class="map-anchor" data-lx="100" data-ly="50"><button class="ma-head" data-city="ny">纽约</button></div>
        </div>
        <div id="map-bubbles"></div>
        <button id="map-reset">复位</button>
        <button id="map-zoom-in">＋</button>
        <button id="map-zoom-out">−</button>
      </div>
      <div id="map-feed">
        <div class="mf-item" data-id="ev_1"><span class="mf-text">事件一</span></div>
      </div>
    </div>`;
  const svg = mapEl.querySelector('.world-svg');
  svg.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
  for (const el of [mapEl.querySelector('.map-canvas'), mapEl.querySelector('#map-bubbles')]) {
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
  }
}

beforeEach(() => {
  skeleton();
  cameras.length = 0;
  // 节点卡的开合是模块级状态：不清掉的话下一个用例第一次点击会变成「关掉」
  map.closeNodeCard();
  store.quotes = [{ id: 'sp500', ok: true, name: '标普500', price: 5000, changePct: 1, decimals: 0 }];
});

describe('相机装配', () => {
  it('把逻辑画布尺寸与四个回调交给相机', () => {
    map.bindMapEvents();
    const cam = cameras.at(-1);
    expect(cam.opts.width).toBe(LOGICAL_WIDTH);
    expect(cam.opts.height).toBe(LOGICAL_HEIGHT);
    expect(cam.opts.onChange).toBeTypeOf('function');
    expect(cam.opts.onDragState).toBeTypeOf('function');
    expect(cam.opts.onDragEnd).toBeTypeOf('function');
  });

  it('相机变化写回 mapView 并立即应用（不是等下一帧）', () => {
    map.bindMapEvents();
    const cam = cameras.at(-1);
    cam.opts.onChange({ k: 2, x: 10, y: 20 });
    expect(map.mapView.k).toBe(2);
    const vp = document.getElementById('map-viewport');
    expect(vp.getAttribute('transform')).toContain('scale(2.000)');
  });

  it('拖拽状态切 canvas 的 dragging 类（换光标用）', () => {
    map.bindMapEvents();
    const canvas = document.getElementById('map-canvas');
    const cam = cameras.at(-1);
    cam.opts.onDragState(true);
    expect(canvas.classList.contains('dragging')).toBe(true);
    cam.opts.onDragState(false);
    expect(canvas.classList.contains('dragging')).toBe(false);
  });

  it('没有 svg 或 canvas 时安全返回（首帧或已卸载）', () => {
    mapEl.innerHTML = '';
    expect(() => map.bindMapEvents()).not.toThrow();
    expect(cameras.length).toBe(0);
  });
});

describe('点城市开卡', () => {
  it('点 SVG 上的城市点就地开卡', () => {
    map.bindMapEvents();
    mapEl.querySelector('.map-city[data-city="ny"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('map-node-card')).toBeTruthy();
  });

  it('点 HTML 城市名也能开卡（更好按的命中区）', () => {
    map.bindMapEvents();
    mapEl.querySelector('.ma-head[data-city="ny"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('map-node-card')).toBeTruthy();
  });

  it('刚拖完地图的那一次点击不误触聚焦', () => {
    map.bindMapEvents();
    const cam = cameras.at(-1);
    cam.opts.onDragEnd(true); // 标记「这一轮是拖拽」
    mapEl.querySelector('.map-city[data-city="ny"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('map-node-card')).toBeNull();
  });

  it('拖拽标志只存活到本轮事件循环（不影响下一次点击）', async () => {
    map.bindMapEvents();
    const cam = cameras.at(-1);
    cam.opts.onDragEnd(true);
    await new Promise((r) => setTimeout(r, 5));
    mapEl.querySelector('.map-city[data-city="ny"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('map-node-card')).toBeTruthy();
  });
});

describe('工具按钮', () => {
  it('复位按钮回到 1× 并关掉节点卡', () => {
    map.bindMapEvents();
    map.openNodeCard('ny');
    expect(document.getElementById('map-node-card')).toBeTruthy();
    document.getElementById('map-reset').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(map.mapView.k).toBe(1);
    expect(document.getElementById('map-node-card')).toBeNull();
  });
});

describe('事件行悬停', () => {
  it('悬停会触发播报台预览（进入心跳/聚焦态）', () => {
    map.bindMapEvents();
    const row = mapEl.querySelector('.mf-item[data-id="ev_1"]');
    expect(row.onpointerenter).toBeTypeOf('function');
    expect(() => row.onpointerenter()).not.toThrow();
  });

  it('移开会恢复巡航（有 onpointerleave）', () => {
    map.bindMapEvents();
    const row = mapEl.querySelector('.mf-item[data-id="ev_1"]');
    expect(row.onpointerleave).toBeTypeOf('function');
    expect(() => row.onpointerleave()).not.toThrow();
  });
});
