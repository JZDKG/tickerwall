/* ================================================================== *
 * 24h 局势时间轴
 *
 * 一条 24 格的柱状带：柱高是那一小时的事件数，颜色是桶内最高等级。
 * 点某一格 → 地图回溯到那一刻（事件流、弧线只留截至那时，昼夜面片
 * 切到那个时刻的真实位置）。▶ 浓缩回放 → 从 24h 前开始每 0.6s 推进一格。
 *
 * 为什么不是「一条连续曲线」：离散的桶能让人直接读出「哪个整点最热闹」，
 * 也能一眼看出空档（凌晨没人说话）。连续曲线会把空档抹平。
 * ================================================================== */

import { esc } from '../../../shared/format.js';
import { bucketEvents24h, normalizedHeights, LEVEL_COLOR } from '../logic/timeline.js';

/** 'HH:MM'（北京） */
export function hhmmOf(ms) {
  const d = new Date(ms + 8 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * 时间轴条。`state` 里 active 是当前回溯到的桶（null = 看实时），
 * playing 是回放中。柱高用百分比，容器高度由 CSS 定。
 */
export function timelineBarHtml(data, state = {}) {
  const { buckets, total, coveredFrom, from } = data;
  const heights = normalizedHeights(buckets);
  const active = state.activeIndex ?? null;
  const playing = Boolean(state.playing);

  const cols = buckets.map((b, i) => {
    // 空桶也留 2px 底座，否则带子会是断的
    const h = Math.max(2, Math.round(heights[i] * 100));
    const isActive = active === i;
    const label = `${hhmmOf(b.start)} · ${b.count} 条`;
    return `<button type="button" class="tl-col${isActive ? ' on' : ''}"`
      + ` data-index="${i}" data-count="${b.count}"`
      + ` style="--h:${h}%;--c:${b.color}" title="${esc(label)}" aria-label="${esc(label)}">`
      + '<i></i></button>';
  }).join('');

  // 覆盖不足 24h 时如实标注，不假装整条带子都有数据
  const coverNote = coveredFrom != null
    ? `覆盖 ${hhmmOf(coveredFrom)} 起 · ${total} 条`
    : '暂无归档数据';

  return `<div class="tl-head">`
    + `<span class="tl-title">24 小时</span>`
    + `<span class="tl-note">${esc(coverNote)}</span>`
    + `<button type="button" class="tl-play${playing ? ' on' : ''}" data-play="1">`
    + (playing ? '■ 停止' : '▶ 浓缩回放')
    + '</button>'
    + (active != null ? '<button type="button" class="tl-live" data-live="1">回到实时</button>' : '')
    + '</div>'
    + `<div class="tl-cols" data-from="${from}">${cols}</div>`;
}

/** 一个桶的时间范围文本，鼠标悬停时补在头上 */
export function bucketRangeText(bucket) {
  if (!bucket) return '';
  return `${hhmmOf(bucket.start)}–${hhmmOf(bucket.end)} · ${bucket.count} 条`;
}

export { bucketEvents24h };
