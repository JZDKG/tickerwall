/* ================================================================== *
 * router.js —— 路由表 + 视图生命周期
 *
 * 由来：原来 route() 是一个 88 行的 if-else 阶梯，每加一个视图就要在**每个**分支里
 * 补一句「把别的视图 hidden + innerHTML 清空 + 停表」。五个视图 = 四份重复清理代码，
 * 漏一句就是一个泄漏点（`llmRetry` 就是这么漏掉的）。
 *
 * 现在改成表驱动：
 *   · 每个视图自己实现 mount() / unmount()，定时器与画布实例由视图自己回收；
 *   · router 只做两件事——「除了目标，全部 unmount」「目标 mount」。
 *
 * 行为等价性：原 route() 每次 hashchange 都会无条件重跑 loadXxx(true)，
 * 这里保持（不做「同路由跳过」优化），否则返回列表再点同一标的不会刷新。
 * ================================================================== */

import { detailEl, eventsEl, listEl, macroEl, mapEl } from './shared/dom.js';
import { mountDetail, unmountDetail } from './views/detail.js';
import { mountEvents, unmountEvents } from './views/events.js';
import { mountMacro, unmountMacro } from './views/macro.js';
import { mountMap, unmountMap } from './views/map.js';
import { applyNavActive } from './nav.js';

/**
 * 列表页：它是默认视图，DOM 由 main 的轮询持续维护。
 * 离场只隐藏、不清空 —— 清空的话返回列表要重新拉一次报价才有内容。
 * 但**必须隐藏**：原 route() 每个非列表分支都写了 listEl.hidden = true，
 * 漏掉就会出现「详情页下面还压着整个列表」。
 */
const listView = {
  el: listEl,
  mount() {
    listEl.hidden = false;
    window.scrollTo({ top: 0 });
  },
  unmount() {
    listEl.hidden = true;
  },
};

const detailView = { el: detailEl, mount: mountDetail, unmount: unmountDetail };
const mapView = { el: mapEl, mount: mountMap, unmount: unmountMap };
const eventsView = { el: eventsEl, mount: mountEvents, unmount: unmountEvents };
const macroView = { el: macroEl, mount: mountMacro, unmount: unmountMacro };

/** 当前挂载的视图名，只用于避免「同一视图重复 unmount」 */
let mounted = null;

function resolve(hash) {
  if (hash.startsWith('#/map')) return { name: 'map', view: mapView };
  if (hash.startsWith('#/events')) return { name: 'events', view: eventsView };
  if (hash.startsWith('#/macro')) return { name: 'macro', view: macroView };
  const m = /^#\/d\/(.+)$/.exec(hash);
  if (m) return { name: 'detail', view: detailView, arg: decodeURIComponent(m[1]) };
  return { name: 'list', view: listView };
}

const ALL = { list: listView, detail: detailView, map: mapView, events: eventsView, macro: macroView };

export function route() {
  // 导航收敛（产品 §3.2）：当前任务由 hash 反推，不另存状态
  applyNavActive(document.getElementById('tasks'), location.hash);

  const { name, view, arg } = resolve(location.hash);

  // 1) 其余视图全部退场（含上一次的 detail/map/events/macro）
  for (const [key, v] of Object.entries(ALL)) {
    if (key === name) continue;
    v.unmount();
  }

  // 2) 目标视图进场
  mounted = name;
  view.mount(arg);
}

window.addEventListener('hashchange', route);

document.addEventListener('keydown', (e) => {
  const overlayOpen = !detailEl.hidden || !macroEl.hidden || !eventsEl.hidden || !mapEl.hidden;
  if (e.key === 'Escape' && overlayOpen) location.hash = '';
});

/** 供测试观察：当前挂载的视图名 */
export function currentView() {
  return mounted;
}
