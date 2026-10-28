/* ================================================================== *
 * 相机：d3-zoom 封装
 *
 * 为什么换掉手写的那套 wheel / pointer / dblclick：
 *
 *   1. **双指缩放、触控板惯性、键盘无障碍**这些 d3 都已经处理好了，手写版
 *      一样都没有（触屏上根本没法缩放）。
 *   2. 平移边界原来靠 clampMapView() 事后截断，被截断时相机状态和实际渲染
 *      会短暂不一致；d3 的 translateExtent 在变换过程中就约束，单一真相源。
 *   3. flyTo 能用 interpolateZoom —— 它按「缩放级别差」插值，跨越多个量级时
 *      比线性插值自然得多（线性会在中途突然加速）。
 *
 * 坐标单位：node 传进来的是 <svg>，d3-selection 的 pointer() 对 SVG 元素会
 * 走 getScreenCTM().inverse()，所以 extent 与 transform 都是 **viewBox 坐标**
 * （0..1200 × 0..600），和 #map-viewport 的 transform 完全一致，不需要换算。
 * ================================================================== */

import { select, zoom, zoomIdentity, zoomTransform } from 'geo-kit';

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

/** 拖拽位移超过这个距离（viewBox 单位）才算拖，用来区分「点击」 */
const DRAG_SLOP = 2;

/**
 * 在 svg 上装一台相机。
 *
 * @param {SVGSVGElement} node
 * @param {object} opts
 * @param {(t: {k:number,x:number,y:number}) => void} opts.onChange 每次变换
 * @param {(dragged: boolean) => void} [opts.onDragEnd] 手势结束，带「是否拖动过」
 * @param {(dragging: boolean) => void} [opts.onDragState] 拖拽开始/结束（切光标）
 * @param {[number, number, number, number]} opts.bounds [width, height] 逻辑画布
 */
export function createCamera(node, { onChange, onDragEnd, onDragState, width, height }) {
  /**
   * onChange 是相机的唯一出口：没有它，相机照常变换而画面不会更新 ——
   * 表现是「能拖能缩放，但地图不动」，而且不报错。
   *
   * 放在这里立刻抛，而不是等第一次手势在 d3 的回调里抛：
   * 那时变换已经落到 d3 状态上，画面与状态会不一致，排查成本高得多。
   */
  if (typeof onChange !== 'function') {
    throw new TypeError('createCamera 需要 onChange 回调（相机事务的唯一出口）');
  }
  let start = null;

  const behavior = zoom()
    // extent / translateExtent 都是 viewBox 坐标，见文件头
    .extent([[0, 0], [width, height]])
    .translateExtent([[0, 0], [width, height]])
    .scaleExtent([MIN_SCALE, MAX_SCALE])
    .on('start', (event) => {
      start = { k: event.transform.k, x: event.transform.x, y: event.transform.y };
      onDragState?.(true);
    })
    .on('zoom', (event) => {
      onChange({ k: event.transform.k, x: event.transform.x, y: event.transform.y });
    })
    .on('end', (event) => {
      onDragState?.(false);
      const t = event.transform;
      const moved = Boolean(start) && (
        Math.abs(t.k - start.k) > 1e-3
        || Math.abs(t.x - start.x) > DRAG_SLOP
        || Math.abs(t.y - start.y) > DRAG_SLOP
      );
      start = null;
      onDragEnd?.(moved);
    });

  select(node).call(behavior);
  return behavior;
}

/** 拆掉相机（unmount 时必须调，否则 d3 的事件监听会挂在已移除的节点上） */
export function destroyCamera(node) {
  if (node) select(node).on('.zoom', null);
}

/** 当前变换（读 d3 自己的状态，不是我们缓存的那份） */
export function currentTransform(node) {
  return zoomTransform(node);
}

/**
 * 应用一个变换。duration > 0 时走 transition，并且用 interpolateZoom 的
 * 缩放感知插值（d3-zoom 的 transition 内部就是这么做的）。
 */
export function applyTransform(node, behavior, target, duration = 0) {
  const sel = select(node);
  const next = zoomIdentity.translate(target.tx, target.ty).scale(target.k);
  if (!duration) {
    sel.call(behavior.transform, next);
    return;
  }
  sel.transition().duration(duration).call(behavior.transform, next);
}

/**
 * 把相机状态同步给 d3。
 *
 * 只在我们绕过 d3 直接改了 mapView 时才需要（例如旧代码里的复位）。
 * 正常路径应该一律走 applyTransform，让 d3 持有唯一真相。
 */
export function syncCamera(node, t) {
  node.__zoom = zoomIdentity.translate(t.tx, t.ty).scale(t.k);
}
