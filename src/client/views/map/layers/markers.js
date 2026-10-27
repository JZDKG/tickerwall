/* ================================================================== *
 * L3 城市锚点：Screen-Space HTML 层
 *
 * 为什么把城市标签从 SVG <text> 搬到 HTML：
 *
 *   1. **字号天然恒定**。SVG 里的 font-size 处于用户坐标系，会跟着 <g> 的
 *      scale 一起放大 —— 3.4× 时「日经」两个字能糊满半屏。之前用
 *      scale(calc(1 / var(--map-k))) 反向缩放压住了字号，但那是补偿，不是
 *      根治：Padding、行距、圆角、边框宽度全都要各自补偿一遍。
 *   2. **能放富内容**。Sparkline、开市呼吸灯、悬停态、子项独立点击，用 HTML
 *      一个元素就够，在 SVG 里要手搓一堆 <text> + <path> 还得对齐基线。
 *   3. **LOD 只切 class**。所有行都渲染出来、用 CSS 隐藏超出的，跨档位时
 *      不重建 DOM —— 之前是「只渲染前 N 行 + 跨档 renderMap()」，节点数会变，
 *      布局会抖一下。
 *
 * 坐标：每个锚点在 DOM 里是 (0,0)，由 map.js 的 updateAnchors() 把逻辑坐标
 * 投影成屏幕坐标后写 translate3d。**不在 SVG 里**，所以不受 viewBox 缩放影响。
 * ================================================================== */

import { esc, dirOf } from '../../../shared/format.js';
import { sparklinePath } from '../logic/sparkline.js';
import { MAP_TAG } from '../geo/cities.js';
import { lonLatToLogical } from '../geo/projection.js';

/** LOD 档位阈值，与 map.js 的 applyLod 保持一致 */
export const LOD_THRESHOLDS = { compact: 1.5, wide: 2.2 };

/** k → CSS class 名 */
export function lodClassFor(k) {
  if (k >= LOD_THRESHOLDS.wide) return 'lod-2';
  if (k >= LOD_THRESHOLDS.compact) return 'lod-1';
  return 'lod-0';
}

const pctText = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);

/**
 * 1× 全览时只挂这些城市。
 *
 * 一个标签 116px 宽，而上海、香港、台北、首尔、东京在 1× 底图上彼此只隔
 * 10–20px —— 全挂出来必然横压 100px。挑七个跨五大洲的定价中心（加芝加哥
 * 是因为原油），全览时先读格局；放大到 1.5× 后其余城市自然出现，数据一个不少。
 */
export const TIER1_CITIES = new Set(['ny', 'ldn', 'chi', 'sh', 'tyo', 'syd', 'sao']);

/**
 * 一个城市的锚点。没有可用报价时返回空串（不占位、不参与 LOD）。
 *
 * @param {object} city MAP_CITIES 的条目
 * @param {Map<string, object>} quotesById
 */
export function cityAnchorHtml(city, quotesById) {
  const all = city.ids.map((id) => quotesById.get(id)).filter((q) => q && q.ok);
  if (!all.length) return '';

  const ll = lonLatToLogical(city.lon, city.lat);
  if (!ll) return '';

  const lead = all[0];
  const openNow = Boolean(lead.marketStatus?.open);
  const leadDir = dirOf(lead.changePct);

  const rows = all.map((q, i) => {
    const d = dirOf(q.changePct);
    // 火花线放在行内，宽 40 高 12 —— 再窄就看不出形状了
    const spark = sparklinePath(q.history, 30, 9, 1);
    const sparkHtml = spark
      ? `<svg class="ma-spark" viewBox="0 0 30 9" aria-hidden="true">`
        + `<path class="ma-area ${d}" d="${spark.area}" />`
        + `<path class="ma-line ${d}" d="${spark.line}" />`
        + '</svg>'
      : '<span class="ma-spark"></span>';
    return `<div class="ma-row" data-rank="${i}">`
      + `<span class="ma-tag">${esc(MAP_TAG[q.id] ?? q.name)}</span>`
      + sparkHtml
      + `<span class="ma-pct ${d}">${pctText(q.changePct)}</span>`
      + '</div>';
  }).join('');

  const side = city.side === 'left' ? 'left' : 'right';
  // 超过 4 行才提示「放大可见更多」——4 行正好是 lod-1 的上限
  const more = all.length > 4 ? '<div class="ma-more">放大可见更多</div>' : '';
  // dx / dy 是每个城市手工标定的错位量：伦敦、巴黎、法兰克福在地球尺度上
  // 几乎同点，上海/台北/首尔/东京也挤成一竖排。统一 -50% 居中会把这些
  // 错位全丢掉，一叠标签糊成一片 —— 所以逐城沿用标定值。
  const dx = city.dx ?? (side === 'left' ? -16 : 16);
  const dy = city.dy ?? 0;

  const tier = TIER1_CITIES.has(city.key) ? 'tier-1' : 'tier-2';
  return `<div class="map-anchor ${tier} side-${side}${openNow ? ' is-open' : ' is-closed'}"`
    + ` style="--dx:${dx}px;--dy:${dy}px"`
    + ` data-city="${esc(city.key)}"`
    + ` data-lx="${ll[0].toFixed(2)}" data-ly="${ll[1].toFixed(2)}">`
    + '<div class="ma-inner">'
    // 城市名做成按钮：它是唯一可点区域（容器 pointer-events: none，
    // 否则会挡住 d3 的拖拽）
    + `<button type="button" class="ma-head" data-city="${esc(city.key)}" title="点击查看 ${esc(city.name)} 全部标的">`
    + `<span class="ma-city">${esc(city.name)}</span>`
    + `<i class="ma-dot ${leadDir}" aria-hidden="true"></i>`
    + '</button>'
    + `<div class="ma-rows">${rows}</div>`
    + more
    + '</div></div>';
}

/** 整层 HTML */
export function cityAnchorsHtml(cities, quotesById) {
  return cities.map((c) => cityAnchorHtml(c, quotesById)).join('');
}
