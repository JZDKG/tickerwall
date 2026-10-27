/* ================================================================== *
 * 投影与坐标换算 —— 项目里唯一的经纬度出入口
 *
 * 三件事：
 *   1. 投影只配一次。国家 path、经纬网、黑夜面片都在逻辑坐标里生成；
 *      缩放平移交给 d3-zoom 的矩阵作用到 <g>，**不重新投影**。
 *   2. 换算只有一条链：screen = CTM · zoomTransform · projection([lon, lat])。
 *      CTM 由浏览器算，自动吸收 viewBox 缩放与 preserveAspectRatio 的留白，
 *      所以卡片、气泡、弧线不会再因为画布宽高比而偏。
 *   3. 全部是可传入矩阵的纯函数。getScreenCTM() 在调用方取，这里不碰 DOM，
 *      于是 Node 里也能测「给定一个 letterbox 矩阵，两个方向是否互逆」。
 *
 * 为什么要换掉老的 mapProject：(lon+180)/360*1200 这种等距圆柱近似既不能换
 * 投影，也没法做球面裁剪，昼夜面片只能用「解方程画曲线」的方式硬凑。
 * ================================================================== */

import { geoNaturalEarth1, geoPath, feature, WORLD_TOPO } from 'geo-kit';
import { applyInverseMatrix, applyMatrix, isUsableMatrix } from '../../../shared/matrix.js';

/** 逻辑画布尺寸。与真实像素无关，最终由 CTM 映射到屏幕 */
export const LOGICAL_WIDTH = 1200;
export const LOGICAL_HEIGHT = 600;

/** 拟合时排除南极洲：它会把整幅图向北挤，赤道跑到中线下 */
const ANTARCTICA_ID = '010';

export const worldFeatures = feature(WORLD_TOPO, WORLD_TOPO.objects.countries).features;

/** 默认投影。换投影只改这一处 */
export const projection = geoNaturalEarth1().rotate([-10, 0]);

/**
 * 把投影拟合进逻辑画布。
 * 返回传入的 projection，便于测试里换一个实例再拟合。
 */
export function fitWorldProjection(proj = projection, features = worldFeatures) {
  const target = {
    type: 'FeatureCollection',
    features: features.filter((f) => f.id !== ANTARCTICA_ID),
  };
  proj.fitExtent(
    [[16, 16], [LOGICAL_WIDTH - 16, LOGICAL_HEIGHT - 16]],
    target,
  );
  return proj;
}

// 模块加载时拟合一次；后续所有 path 生成都基于这个已拟合的实例
fitWorldProjection();

/** 复用同一个 path 生成器，避免每次渲染重建 */
export const pathOf = geoPath(projection);

/** 经纬度 → 逻辑画布坐标 */
export function lonLatToLogical(lon, lat) {
  const p = projection([lon, lat]);
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  return [p[0], p[1]];
}

/** 逻辑坐标 → 经纬度（拖动定位、点击取点用） */
export function logicalToLonLat(x, y) {
  const p = projection.invert?.([x, y]);
  return p && Number.isFinite(p[0]) ? p : null;
}

/* ------------------------------------------------------------------ *
 * 相机变换：d3-zoom 的 transform 是 { k, x, y }
 * 作用在逻辑坐标上 —— 这是「投影只做一次」的关键。
 * ------------------------------------------------------------------ */

export function applyZoom(t, [x, y]) {
  return [x * t.k + t.x, y * t.k + t.y];
}

export function unapplyZoom(t, [sx, sy]) {
  if (!t?.k) return null;
  return [(sx - t.x) / t.k, (sy - t.y) / t.k];
}

/**
 * 逻辑坐标 → 屏幕坐标。
 * ctm 是 svg.getScreenCTM()（逻辑 viewBox → 屏幕），留白与 CSS 缩放都在里面。
 */
export function logicalToScreen(ctm, t, point) {
  if (!isUsableMatrix(ctm) || !point) return null;
  return applyMatrix(ctm, ...applyZoom(t, point));
}

/** 屏幕坐标 → 逻辑坐标 */
export function screenToLogical(ctm, t, clientX, clientY) {
  if (!isUsableMatrix(ctm)) return null;
  const inv = applyInverseMatrix(ctm, clientX, clientY);
  return inv ? unapplyZoom(t, inv) : null;
}

/** 经纬度 → 屏幕坐标：正换算的唯一入口 */
export function projectToScreen(ctm, t, lon, lat) {
  return logicalToScreen(ctm, t, lonLatToLogical(lon, lat));
}

/** 屏幕坐标 → 逻辑坐标（不在缩放里，用于命中测试） */
export function clientToLogical(ctm, clientX, clientY) {
  return screenToLogical(ctm, { k: 1, x: 0, y: 0 }, clientX, clientY);
}

/** 屏幕位移 → 逻辑位移。拖拽用它，平移项在差值里抵消 */
export function screenDeltaToLogical(ctm, t, dx, dy) {
  const a = screenToLogical(ctm, t, 0, 0);
  const b = screenToLogical(ctm, t, dx, dy);
  return a && b ? [b[0] - a[0], b[1] - a[1]] : null;
}

/** 一个赛区/bbox 的四角，用于 fitRegion 求包围盒 */
export function logicalBoundsOf(points) {
  if (!points?.length) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of points) {
    if (!p) continue;
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return Number.isFinite(x0) ? [[x0, y0], [x1, y1]] : null;
}
