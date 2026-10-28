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
/** 首页问题卡容器（解释功能启用时才显示，见 views/explanations/questions.js） */
export const questionsEl = document.getElementById('questions');
