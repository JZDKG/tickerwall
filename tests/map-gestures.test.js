// @vitest-environment jsdom
/* ================================================================== *
 * 地图手势与浮层（views/map.js 后半段）
 *
 * 这一段全是「点一下/滚一下之后发生什么」。jsdom 没有真 SVG 矩阵
 * （getScreenCTM 不存在），所以给 svg 打一个 2× 的仿射矩阵 —— 换算本身
 * 在 matrix.test.js 里验过，这里验的是**接线与边界**：
 *   · 缩放钳在 1~8；以鼠标点为中心（不是以画布中心）；
 *   · 平移应用到 #map-viewport 的 transform，并同步 --map-k；
 *   · LOD 只切一个 class，不重建 DOM；
 *   · 视口外的锚点 visibility: hidden（放大到 8× 时大多数城市都在外面）；
 *   · 节点卡点第二下关闭；气泡最多 3 个。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

document.body.innerHTML = `
  <section id="map"></section>
`;

const mapEl = document.getElementById('map');
const { store } = await import('../src/client/shared/store.js');
const map = await import('../src/client/views/map.js');

/** 造 canvas + svg 骨架；给 svg 一个 2× 矩阵（viewBox → 屏幕） */
function skeleton() {
  mapEl.innerHTML = `
    <div class="map-body">
      <div class="map-canvas" id="map-canvas" style="width:800px;height:400px">
        <svg class="world-svg" viewBox="0 0 1200 560">
          <g id="map-viewport"></g>
        </svg>
        <div class="map-anchors" id="map-anchors"></div>
        <div id="map-bubbles"></div>
      </div>
    </div>`;
  const svg = mapEl.querySelector('.world-svg');
  // getScreenCTM：2× 缩放 + (10, 20) 平移
  svg.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 });
  // getBoundingClientRect：jsdom 全是 0，这里给一个可计算的盒子
  for (const el of [mapEl.querySelector('.map-canvas'), mapEl.querySelector('#map-bubbles')]) {
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
  }
}

beforeEach(() => {
  skeleton();
  store.quotes = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('应用视口变换', () => {
  it('写 transform 与 --map-k，并同步缩放标签', () => {
    map.mapView.k = 2.5;
    map.mapView.tx = 30;
    map.mapView.ty = -12;
    map.applyMapView();
    const vp = document.getElementById('map-viewport');
    expect(vp.getAttribute('transform')).toBe('translate(30.00,-12.00) scale(2.500)');
    expect(vp.style.getPropertyValue('--map-k')).toBe('2.5000');
  });

  it('没有 viewport 时安全返回（结构不完整不该抛）', () => {
    mapEl.innerHTML = '';
    expect(() => map.applyMapView()).not.toThrow();
  });

  it('LOD 只切 class，不重建锚点 DOM', () => {
    const host = document.getElementById('map-anchors');
    host.innerHTML = '<div class="map-anchor" data-lx="10" data-ly="10"></div>';
    const node = host.firstElementChild;
    map.mapView.k = 8;
    map.applyMapView();
    expect(host.classList.contains('lod-0') || host.classList.contains('lod-1') || host.classList.contains('lod-2')).toBe(true);
    // 同一个节点还在（没被重建）
    expect(host.firstElementChild).toBe(node);
  });
});

describe('锚点定位', () => {
  it('把逻辑坐标经矩阵换算成屏幕坐标，并写 translate3d', () => {
    const host = document.getElementById('map-anchors');
    host.innerHTML = '<div class="map-anchor" data-lx="100" data-ly="50"></div>';
    map.mapView.k = 1;
    map.mapView.tx = 0;
    map.mapView.ty = 0;
    map.updateAnchors();
    const el = host.firstElementChild;
    // (100,50) → svg(100,50) → 屏幕(2*100+10, 2*50+20) = (210,120)
    expect(el.style.transform).toBe('translate3d(210.0px, 120.0px, 0)');
    expect(el.dataset.off).toBe('0');
  });

  it('视口外的锚点隐藏（放大后大多数城市都在画布外）', () => {
    const host = document.getElementById('map-anchors');
    host.innerHTML = '<div class="map-anchor" data-lx="2000" data-ly="50"></div>';
    map.updateAnchors();
    const el = host.firstElementChild;
    expect(el.dataset.off).toBe('1');
    expect(el.style.visibility).toBe('hidden');
  });

  it('缺 lx/ly 的锚点跳过（不写 NaN 坐标）', () => {
    const host = document.getElementById('map-anchors');
    host.innerHTML = '<div class="map-anchor"></div>';
    map.updateAnchors();
    expect(host.firstElementChild.style.transform).toBe('');
  });

  it('没有 svg / canvas / host 时安全返回', () => {
    mapEl.innerHTML = '<div></div>';
    expect(() => map.updateAnchors()).not.toThrow();
  });

  it('拿不到 CTM 时不动（不猜一个换算）', () => {
    const svg = mapEl.querySelector('.world-svg');
    svg.getScreenCTM = () => null;
    const host = document.getElementById('map-anchors');
    host.innerHTML = '<div class="map-anchor" data-lx="10" data-ly="10"></div>';
    map.updateAnchors();
    expect(host.firstElementChild.style.transform).toBe('');
  });
});

describe('以鼠标点为中心缩放', () => {
  it('缩放钳在 1~8 之间', () => {
    map.mapView.k = 1;
    map.zoomAt(400, 200, 100);
    expect(map.mapView.k).toBeLessThanOrEqual(8);
    map.mapView.k = 1;
    map.zoomAt(400, 200, 0.0001);
    expect(map.mapView.k).toBe(1);
  });

  it('缩放前后「鼠标下的那一点」不动（以光标为中心，不是以画布中心）', () => {
    map.mapView.k = 1;
    map.mapView.tx = 0;
    map.mapView.ty = 0;
    // 屏幕 (410,220) → viewBox ((410-10)/2, (220-20)/2) = (200,100)
    map.zoomAt(410, 220, 2);
    const scale = map.mapView.k / 1;
    // 变换后同一点仍在同一 viewBox 位置：sx = k*tx' + sx*scale 的关系
    const sx = 200;
    expect(map.mapView.tx + sx * scale * 0 + map.mapView.tx * 0).toBeDefined();
    // 直接验公式：tx' = sx - scale*(sx - tx_old)
    expect(map.mapView.tx).toBeCloseTo(sx - scale * (sx - 0), 6);
  });

  it('没有 svg 时安全返回（首帧尚未挂载）', () => {
    mapEl.innerHTML = '';
    expect(() => map.zoomAt(10, 10, 2)).not.toThrow();
  });
});

describe('复位', () => {
  it('回到 1× 与原点，并关掉节点卡', () => {
    const card = document.createElement('div');
    card.id = 'map-node-card';
    document.body.appendChild(card);
    map.mapView.k = 3;
    map.resetMapView();
    expect(map.mapView.k).toBe(1);
    expect(map.mapView.tx).toBe(0);
    expect(map.mapView.ty).toBe(0);
    expect(document.getElementById('map-node-card')).toBeNull();
  });
});

describe('节点卡', () => {
  it('点开一张卡，再点同一城市就关掉（切换语义）', () => {
    store.quotes = [{ id: 'sp500', ok: true, name: '标普500', price: 5000, changePct: 1, decimals: 0 }];
    map.openNodeCard('ny');
    expect(document.getElementById('map-node-card')).toBeTruthy();
    map.openNodeCard('ny');
    expect(document.getElementById('map-node-card')).toBeNull();
  });

  it('该城市没有任何报价时不建卡（不显示一张空壳）', () => {
    store.quotes = [];
    map.openNodeCard('ny');
    expect(document.getElementById('map-node-card')).toBeNull();
  });

  it('未知城市 key 直接返回', () => {
    expect(() => map.openNodeCard('nowhere')).not.toThrow();
    expect(document.getElementById('map-node-card')).toBeNull();
  });

  it('closeNodeCard 可以重复调用', () => {
    expect(() => {
      map.closeNodeCard();
      map.closeNodeCard();
    }).not.toThrow();
  });
});

describe('事件气泡', () => {
  const ev = (id) => ({ id, region: 'us', level: 2, time: '2026-10-28 10:30:00', title: `事件 ${id}` });

  it('按赛区锚点定位并挂进气泡层', () => {
    map.spawnBubble(ev('a'));
    const layer = document.getElementById('map-bubbles');
    expect(layer.querySelectorAll('.map-bubble').length).toBe(1);
    expect(layer.textContent).toContain('事件 a');
  });

  it('最多同时 3 个：超出的被标记 out 并淡出移除', () => {
    for (const id of ['a', 'b', 'c', 'd']) map.spawnBubble(ev(id));
    const layer = document.getElementById('map-bubbles');
    // 第 4 个进来时第 1 个被打上 out（还在 DOM 里等淡出动画）
    expect(layer.querySelectorAll('.map-bubble.out').length).toBeGreaterThanOrEqual(1);
    expect(layer.querySelectorAll('.map-bubble:not(.out)').length).toBeLessThanOrEqual(3);
    vi.advanceTimersByTime(500);
    expect(layer.querySelectorAll('.map-bubble').length).toBeLessThanOrEqual(3);
  });

  it('6 秒后自动淡出并移除', () => {
    map.spawnBubble(ev('x'));
    const layer = document.getElementById('map-bubbles');
    expect(layer.querySelectorAll('.map-bubble').length).toBe(1);
    vi.advanceTimersByTime(6500);
    vi.advanceTimersByTime(500);
    expect(layer.querySelectorAll('.map-bubble').length).toBe(0);
  });

  it('长标题被截断（不撑破气泡）', () => {
    map.spawnBubble({ ...ev('long'), title: '一'.repeat(200) });
    const title = document.querySelector('.bb-title').textContent;
    expect(title.length).toBe(60);
  });

  it('没有气泡层时安全返回', () => {
    document.getElementById('map-bubbles').remove();
    expect(() => map.spawnBubble(ev('z'))).not.toThrow();
  });
});

describe('未知赛区', () => {
  it('退回 global 锚点（不丢事件、也不抛）', () => {
    map.spawnBubble({ id: 'g', region: 'nowhere', level: 1, time: '2026-10-28 10:00:00', title: 'X' });
    expect(document.querySelector('.bb-region').textContent).toBeTruthy();
  });
});
