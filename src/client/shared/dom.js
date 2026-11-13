/* ================================================================== *
 * 页面骨架上的固定元素引用
 *
 * 这些 id 都写死在 public/index.html 里，取一次即可。集中在一个模块，
 * 避免每个视图各写一遍 getElementById（原来散落在 app.js 的五个位置）。
 * ================================================================== */

export const rowsEl = document.getElementById('rows');
export const updatedEl = document.getElementById('updated');
export const countdownEl = document.getElementById('countdown');
export const refreshBtn = document.getElementById('refresh');

export const listEl = rowsEl;
export const detailEl = document.getElementById('detail');
export const macroEl = document.getElementById('macro');
export const eventsEl = document.getElementById('events');
export const mapEl = document.getElementById('map');
export const watchEl = document.getElementById('watch');
/** 首页异动解读容器（收起态置于行情下方，不遮挡行情首屏） */
export const questionsEl = document.getElementById('questions');
