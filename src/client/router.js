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

import { detailEl, eventsEl, listEl, macroEl, mapEl, watchEl } from './shared/dom.js';
import { mountDetail, unmountDetail } from './views/detail.js';
import { mountEvents, unmountEvents } from './views/events.js';
import { mountMacro, unmountMacro } from './views/macro.js';
import { mountMap, unmountMap } from './views/map.js';
import { mountWatch, unmountWatch } from './views/watch.js';
import { applyNavActive } from './nav.js';
import { isEmbedMode, stripEmbedParam, applyEmbedMode } from './shared/share-card.js';

/** 仅在首页列表路由保留首页控制条、合成条与底部异动解读；离开首页立即同步隐藏。 */
function syncHomeChrome(visible) {
  for (const id of ['ws-bar', 'synthetics-strip']) {
    const el = document.getElementById(id);
    if (el) el.hidden = !visible;
  }
  const qEl = document.getElementById('questions');
  if (qEl) {
    if (!visible) qEl.hidden = true;
    else if (qEl.innerHTML.trim().length > 0) qEl.hidden = false;
  }
}

const listView = {
  el: listEl,
  mount() {
    listEl.hidden = false;
    syncHomeChrome(true);
    window.scrollTo({ top: 0 });
  },
  unmount() {
    listEl.hidden = true;
    syncHomeChrome(false);
  },
};

/**
 * 「今天重点」的独立视图（#/watch）：
 * 我的自选标的、今日宏观重点与关注简报/预期台账/生活连接集中展示在此。
 */
const watchView = {
  el: watchEl,
  mount() {
    if (watchEl) watchEl.hidden = false;
    mountWatch();
  },
  unmount() {
    unmountWatch();
    if (watchEl) watchEl.hidden = true;
  },
};

const detailView = { el: detailEl, mount: mountDetail, unmount: unmountDetail };
const mapView = { el: mapEl, mount: mountMap, unmount: unmountMap };
const eventsView = { el: eventsEl, mount: mountEvents, unmount: unmountEvents };
const macroView = { el: macroEl, mount: mountMacro, unmount: unmountMacro };

/**
 * 当前挂载的视图（名字 + 参数）。
 *
 * 它不只是一个观察用的变量 —— 它是**幂等键**：
 * 同一个 name+arg 的 `route()` 重复触发时直接返回，不重挂。
 *
 * 为什么必须这样：`route()` 每轮都会把其余视图 unmount、目标视图 mount，
 * 而 `unmountDetail()` 会 `explainState = null`。于是「同一次渲染里多跑一遍
 * route()」就会把刚取到的解释状态扔掉，卡片被画回骨架并永远停在
 * 「正在整理解释…」—— 真实浏览器里就是这样，jsdom 里因为 route 只跑一次
 * 一直没暴露。
 */
let mounted = null;

function resolve(hash) {
  // hash 内可能带 ?embed=1 / ?foo=1：视图名只看 '?' 之前的部分，
  // 否则 #/d/gold-intl?embed=1 会被当成 id="gold-intl?embed=1" 的未知标的。
  const h = String(hash ?? '').split('?')[0];
  if (h.startsWith('#/map')) return { name: 'map', view: mapView };
  if (h.startsWith('#/events')) return { name: 'events', view: eventsView };
  // 「我的关注」是独立任务：参与幂等键（watch ≠ list），切回首页会重新挂载
  if (h.startsWith('#/watch')) return { name: 'watch', view: watchView };
  if (h.startsWith('#/macro')) return { name: 'macro', view: macroView };
  const m = /^#\/d\/(.+)$/.exec(h);
  if (m) return { name: 'detail', view: detailView, arg: decodeURIComponent(m[1]) };
  return { name: 'list', view: listView };
}

const ALL = { list: listView, watch: watchView, detail: detailView, map: mapView, events: eventsView, macro: macroView };

/**
 * P3-T3：嵌入挂件模式。
 *
 * embed=1 可能落在 query（?embed=1#/d/x）或 hash 内（#/d/x?embed=1）。
 * 激活时设 dataset.embed='1'（CSS 隐藏顶栏/脚注），并把参数从地址栏剥掉：
 * 否则用户复制地址栏的链接会把嵌入模式一起粘走，在别处又开一个无边框页。
 * 只在真的带参数时才动 history，避免每次 route() 都写一条历史记录。
 */
export function applyEmbedFromLocation() {
  const href = `${location.pathname ?? ''}${location.search ?? ''}${location.hash ?? ''}`;
  const on = applyEmbedMode(document.documentElement, href);
  if (on && isEmbedMode(href)) {
    const clean = stripEmbedParam(href);
    try {
      history.replaceState(null, '', clean);
    } catch {
      /* file:// 下 replaceState 可能抛：dataset 已经生效，不影响显示 */
    }
  }
  return on;
}

export function route() {
  // 导航收敛（产品 §3.2）：当前任务由 hash 反推，不另存状态
  applyNavActive(document.getElementById('tasks'), location.hash);
  applyEmbedFromLocation();

  const { name, view, arg } = resolve(location.hash);
  document.documentElement.dataset.view = name;

  // 0) 幂等：同一视图同一参数不再重挂（重挂会清掉视图内部状态）
  if (mounted && mounted.name === name && mounted.arg === (arg ?? null)) return;

  // 1) 其余视图全部退场（含上一次的 detail/map/events/macro）
  for (const [key, v] of Object.entries(ALL)) {
    if (key === name) continue;
    v.unmount();
  }

  // 2) 目标视图进场
  mounted = { name, arg: arg ?? null };
  view.mount(arg);
}

window.addEventListener('hashchange', route);
// 首屏直接进入 ?embed=1 时也要生效：hashchange 不会因「地址栏本来就带参数」而触发
applyEmbedFromLocation();

document.addEventListener('keydown', (e) => {
  const overlayOpen =
    !detailEl.hidden
    || !macroEl.hidden
    || !eventsEl.hidden
    || !mapEl.hidden
    || Boolean(watchEl && !watchEl.hidden);
  if (e.key === 'Escape' && overlayOpen) location.hash = '';
});

/** 供测试观察：当前挂载的视图名 */
export function currentView() {
  return mounted?.name ?? null;
}

/** 供测试与调试：重置挂载记录（等价于「已离开所有视图」） */
export function resetMountedForTests() {
  mounted = null;
}
