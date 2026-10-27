/* ================================================================== *
 * 地图坐标：letterbox 补偿
 *
 * 世界地图的 <svg> 是 viewBox="0 0 1200 560" + preserveAspectRatio="xMidYMid meet"，
 * 容器宽高由窗口决定。宽高比不匹配时浏览器会在两侧（或上下）留白，
 * 而旧代码按 `(x / 1200) * rect.width` 换算 —— 等于假设 viewBox 铺满容器。
 *
 * 关键事实：留白对称，所以地图正中心永远不偏，越靠边偏得越多。
 * 1920 视口下左边缘差 290px、平板竖屏顶部差 210px；拖拽时手移 100px
 * 地图却走 117px。这就是「卡片贴错点、缩放中心漂走」的根因。
 *
 * 这里两层验证：
 *   1. 数学：用真实 letterbox 参数构造矩阵，验正逆与位移；
 *   2. 静态：map.js 里不许再出现按 rect 比例的手算，且换算必须走 getScreenCTM。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  applyInverseDelta,
  applyInverseMatrix,
  applyMatrix,
  invertMatrix,
  isUsableMatrix,
} from '../src/client/shared/matrix.js';

const MAP_W = 1200;
const MAP_H = 560;

/** 浏览器在 xMidYMid meet 下实际给出的 CTM */
function letterboxCTM(cw, ch, vw = MAP_W, vh = MAP_H) {
  const s = Math.min(cw / vw, ch / vh);
  return { a: s, b: 0, c: 0, d: s, e: (cw - vw * s) / 2, f: (ch - vh * s) / 2 };
}

/** 旧代码的口径：直接把 viewBox 铺满 rect */
function stretchMatrix(cw, ch, vw = MAP_W, vh = MAP_H) {
  return { a: cw / vw, b: 0, c: 0, d: ch / vh, e: 0, f: 0 };
}

/** 真实容器需求： .map-canvas 宽 100%、高 clamp(420px, 100vh-322px, 900px) */
function canvasOf(viewportW, viewportH) {
  return {
    w: viewportW - 40,
    h: Math.min(900, Math.max(420, viewportH - 322)),
  };
}

describe('矩阵数学', () => {
  it('正向映射符合仿射定义', () => {
    const m = { a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 };
    expect(applyMatrix(m, 1, 1)).toEqual([12, 23]);
  });

  it('求逆后 round-trip 回到原点', () => {
    const m = { a: 1.75, b: 0.2, c: -0.3, d: 0.8, e: 137, f: -44 };
    for (const [x, y] of [[0, 0], [1200, 560], [613.7, 279.1], [-500, 900]]) {
      const s = applyMatrix(m, x, y);
      const back = applyInverseMatrix(m, s[0], s[1]);
      expect(back[0]).toBeCloseTo(x, 10);
      expect(back[1]).toBeCloseTo(y, 10);
    }
  });

  it('退化为 0 缩放的矩阵返回 null，不产生 NaN 坐标', () => {
    expect(invertMatrix({ a: 0, b: 0, c: 0, d: 0, e: 5, f: 5 })).toBeNull();
    expect(applyInverseMatrix({ a: 0, b: 0, c: 0, d: 1, e: 0, f: 0 }, 1, 1)).toBeNull();
    expect(isUsableMatrix(null)).toBe(false);
    expect(applyMatrix(null, 1, 1)).toBeNull();
  });

  it('位移换算抵消平移项', () => {
    // 平移 (500, -300) 对「位移」不该有任何贡献，否则拖拽会瞬间跳开
    const m = { a: 2, b: 0, c: 0, d: 2, e: 500, f: -300 };
    expect(applyInverseDelta(m, 100, 0)).toEqual([50, 0]);
    expect(applyInverseDelta(m, 0, 100)).toEqual([0, 50]);
    // 直接对位移用逆矩阵会多带一份平移，是这里最容易踩的坑
    const wrong = applyInverseMatrix(m, 100, 0);
    expect(wrong[0] - 50).toBe(-250);
  });
});

describe('letterbox：留白对换算的影响', () => {
  const VIEWPORTS = [
    [1920, 929],
    [1440, 900],
    [1280, 800],
    [834, 1112],
  ];

  it('地图正中心无论如何都不偏（所以这个 bug 长期没被发现）', () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { w, h } = canvasOf(vw, vh);
      const truth = applyMatrix(letterboxCTM(w, h), MAP_W / 2, MAP_H / 2);
      const wrong = applyMatrix(stretchMatrix(w, h), MAP_W / 2, MAP_H / 2);
      expect(Math.hypot(truth[0] - wrong[0], truth[1] - wrong[1]), `${vw}×${vh} 中心`).toBeLessThan(1e-9);
    }
  });

  it('角落偏差等于留白量，且各视口都可观', () => {
    const errs = VIEWPORTS.map(([vw, vh]) => {
      const { w, h } = canvasOf(vw, vh);
      const truth = applyMatrix(letterboxCTM(w, h), 0, 0);
      const wrong = applyMatrix(stretchMatrix(w, h), 0, 0);
      return Math.hypot(truth[0] - wrong[0], truth[1] - wrong[1]);
    });
    // 1920 视口下约 290px，最紧的 1440 视口也有 80px 量级
    expect(errs[0]).toBeGreaterThan(250);
    expect(Math.min(...errs)).toBeGreaterThan(50);
  });

  it('用 CTM 换算后，屏幕点能精确还原回地图坐标', () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { w, h } = canvasOf(vw, vh);
      const m = letterboxCTM(w, h);
      for (const [ux, uy] of [[0, 0], [MAP_W, MAP_H], [MAP_W / 2, MAP_H / 2], [121.5, 200]]) {
        const screen = applyMatrix(m, ux, uy);
        const back = applyInverseMatrix(m, screen[0], screen[1]);
        expect(back[0]).toBeCloseTo(ux, 8);
        expect(back[1]).toBeCloseTo(uy, 8);
      }
    }
  });

  it('拖拽速度与鼠标一致：手移 100px 走 100/s 个地图单位', () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { w, h } = canvasOf(vw, vh);
      const m = letterboxCTM(w, h);
      expect(applyInverseDelta(m, 100, 0)[0]).toBeCloseTo(100 / m.a, 8);
      expect(applyInverseDelta(m, 0, 100)[1]).toBeCloseTo(100 / m.d, 8);

      // 旧口径用的是「铺满」比例：留白的那一个轴必然快慢不对。
      // 注意留白只在单一轴上（xMidYMid meet），另一轴恰好与真实比例相同，
      // 所以这里判「至少一个轴错了」，不能两个轴都断言。
      const stretch = stretchMatrix(w, h);
      const dx = Math.abs(applyInverseDelta(m, 100, 0)[0] - 100 / stretch.a);
      const dy = Math.abs(applyInverseDelta(m, 0, 100)[1] - 100 / stretch.d);
      expect(Math.max(dx, dy), `${vw}×${vh} 拖拽速度应当与旧口径不同`).toBeGreaterThan(1);
    }
  });
});

describe('map.js：换算必须走 CTM', () => {
  const MAP_JS = readFileSync(
    fileURLToPath(new URL('../src/client/views/map.js', import.meta.url)),
    'utf8',
  );

  it('不再按 rect 宽高的比例做坐标换算', () => {
    // 这类写法只有在「viewBox 铺满 rect」时才成立，是本次要根除的口径
    const bad = [
      /\/\s*rect\.width\s*\)\s*\*\s*MAP_SIZE/,
      /\/\s*rect\.height\s*\)\s*\*\s*MAP_SIZE/,
      /\*\s*rect\.width/,
      /\*\s*rect\.height/,
      /\*\s*r\.width/,
      /\*\s*r\.height/,
    ];
    const hits = bad
      .map((re) => MAP_JS.match(re)?.[0])
      .filter(Boolean);
    expect(hits, `仍有按 rect 比例换算：${hits.join(' / ')}`).toEqual([]);
  });

  it('屏幕 ↔ 地图坐标一律经由 getScreenCTM', () => {
    expect(MAP_JS).toMatch(/getScreenCTM/);
    // 两个薄封装：屏幕点 → viewBox、viewBox → 屏幕
    expect(MAP_JS).toMatch(/function toViewBox\(/);
    expect(MAP_JS).toMatch(/function toClient\(/);
  });

  it('缩放、气泡、节点卡三处都用了封装，而不是各自手算', () => {
    for (const re of [
      /const p = toViewBox\(svg, clientX, clientY\)/,
      /const p = toClient\(svg, x \* mapView\.k \+ mapView\.tx/,
      /const p = toClient\(svg, mx \* mapView\.k \+ mapView\.tx/,
    ]) {
      expect(MAP_JS, `缺少 ${re}`).toMatch(re);
    }
  });

  it('相机交给 d3-zoom，不再有手写的 wheel / pointermove 平移', () => {
    // 手写版只有鼠标滚轮和指针拖拽，触屏没法缩放；边界靠事后 clamp 截断，
    // 还会让相机状态与渲染短暂不一致。现在统一走 camera.js。
    expect(MAP_JS).toMatch(/createCamera\(svg, \{/);
    expect(MAP_JS).not.toMatch(/addEventListener\(\s*'wheel'/);
    expect(MAP_JS).not.toMatch(/addEventListener\('pointermove'/);
    // 平移边界由 d3 的 translateExtent 在变换过程中约束
    expect(MAP_JS).not.toMatch(/function clampMapView\(/);
    // 相机内部状态必须与当前视图对齐，否则聚焦状态下重建会被拉回 1×
    expect(MAP_JS).toMatch(/syncCamera\(svg, mapView\)/);
  });

  it('deltaToViewBox 已随手写拖拽一起删除（位移缩放交给 d3）', () => {
    expect(MAP_JS).not.toMatch(/function deltaToViewBox\(/);
  });
});
