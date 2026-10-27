/* ================================================================== *
 * 底部播报台
 *
 * 一条事件停留 6 秒，然后自行走到下一条。它要同时回答三个问题：
 * 谁说的 / 说了什么 / 动了哪些标的。
 *
 * 为什么不做成「列表第 N 条高亮」：事件流是一列竖排文字，读者要用眼睛去
 * 找「现在讲到哪」；播报台把当前这条单独拎到地图正下方，和地图上的弧线、
 * 赛区高亮共用同一条事件 —— 眼睛不用移开画面。
 * ================================================================== */

import { esc, dirOf } from '../../../shared/format.js';
import { sparklinePath } from '../logic/sparkline.js';
import { MAP_TAG } from '../geo/cities.js';

const pctText = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);

/** 'YYYY-MM-DD HH:mm:ss'（北京）→ 'HH:mm' */
function hmOf(time) {
  const m = /(\d{2}):(\d{2})/.exec(String(time ?? ''));
  return m ? `${m[1]}:${m[2]}` : '';
}

/**
 * 播报台内容。`marks` 是该事件 symbols 对应的报价，最多取两个 ——
 * 三个以上就挤成一排数字，反而读不出主次。
 */
export function broadcastHtml(ev, quotesById) {
  if (!ev) {
    return '<div class="bc-empty">实时播报待命中</div>';
  }

  const src = [ev.publisher || ev.source, hmOf(ev.time)].filter(Boolean).join(' · ');
  const strong = ev.topics?.find((t) => t.strong);
  const level = ev.level === 'high' || ev.important ? 'high' : 'normal';

  const marks = (ev.symbols ?? [])
    .map((id) => quotesById?.get(id))
    .filter((q) => q && q.ok)
    .slice(0, 2)
    .map((q) => {
      const d = dirOf(q.changePct);
      return `<span class="bc-mark ${d}">${esc(MAP_TAG[q.id] ?? q.name)} ${pctText(q.changePct)}</span>`;
    })
    .join('');

  // 火花线取第一个有历史的标的；没有就留空位，避免标题左右跳
  const lead = (ev.symbols ?? []).map((id) => quotesById?.get(id)).find((q) => q && q.ok && q.history?.length >= 2);
  const spark = lead ? sparklinePath(lead.history, 60, 16, 1) : null;
  const sparkDir = lead ? dirOf(lead.changePct) : 'flat';
  const sparkHtml = spark
    ? `<svg class="bc-spark" viewBox="0 0 60 16" aria-hidden="true">`
      + `<path class="bc-spark-area ${sparkDir}" d="${spark.area}" />`
      + `<path class="bc-spark-line ${sparkDir}" d="${spark.line}" />`
      + '</svg>'
    : '<span class="bc-spark"></span>';

  return `<div class="bc-src ${level}">`
    + `<i class="bc-dot" aria-hidden="true"></i>`
    + `<span>${esc(src)}</span>`
    + (strong ? `<span class="bc-topic">${esc(strong.label)}</span>` : '')
    + '</div>'
    + `<div class="bc-title" title="${esc(ev.title)}">${esc(ev.title)}</div>`
    + `<div class="bc-marks">${marks}</div>`
    + sparkHtml
    + `<div class="bc-bar" aria-hidden="true"><i></i></div>`;
}
