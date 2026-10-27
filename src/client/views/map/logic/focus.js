/* ================================================================== *
 * 赛区聚焦：包围盒 → 视口变换
 *
 * 纯函数，不碰 DOM。map.js 只负责把结果交给动画函数，所以这里能直接单测
 * 「给定的包围盒算出什么 k 和位移」，不用起浏览器。
 * ================================================================== */

import { pathOf, worldFeatures, LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../geo/projection.js';
import { COUNTRY_META, REGION_ANCHORS, normalizeIso } from '../geo/regions.js';

/**
 * 俄罗斯的包围盒横跨 170 度经度，一进包围盒就会把「欧元区」聚焦拉成全球视图。
 * 它属于 eu 是后端词表的口径（Russia 在 eu 词表里，见 geo/regions.js 的说明），
 * 但地理上不能用它的 bbox 代表欧元区，所以算包围盒时排除。
 */
export const BBOX_EXCLUDE = new Set(['643']);

/** 某赛区所有国家在逻辑坐标里的包围盒；无命中返回 null */
export function regionBounds(region) {
  if (!region) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  let hit = 0;
  for (const f of worldFeatures) {
    const iso = normalizeIso(f.id);
    if (!iso || BBOX_EXCLUDE.has(iso)) continue;
    if (COUNTRY_META[iso]?.region !== region) continue;
    const b = pathOf.bounds(f);
    if (!b || !Number.isFinite(b[0][0]) || !Number.isFinite(b[1][0])) continue;
    hit += 1;
    x0 = Math.min(x0, b[0][0]); y0 = Math.min(y0, b[0][1]);
    x1 = Math.max(x1, b[1][0]); y1 = Math.max(y1, b[1][1]);
  }
  return hit ? [[x0, y0], [x1, y1]] : null;
}

/**
 * 把包围盒拟合成一个 zoom transform。
 * 缩放范围与滚轮一致（1–8），所以在聚焦状态下继续滚轮不会跳变。
 */
export function viewForBounds(bounds, pad = 56) {
  if (!bounds) return { k: 1, tx: 0, ty: 0 };
  const [[x0, y0], [x1, y1]] = bounds;
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const k = Math.max(1, Math.min(8, Math.min(
    (LOGICAL_WIDTH - pad * 2) / bw,
    (LOGICAL_HEIGHT - pad * 2) / bh,
  )));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { k, tx: LOGICAL_WIDTH / 2 - cx * k, ty: LOGICAL_HEIGHT / 2 - cy * k };
}

/**
 * 点击语义：再点同一个赛区即退出（返回 null）。
 * `global` 没有地理起点，不接受聚焦。
 */
export function toggleRegion(current, next) {
  if (!next) return null;
  const anchor = REGION_ANCHORS[next];
  if (!anchor || anchor.noAnchor) return null;
  return current === next ? null : next;
}
