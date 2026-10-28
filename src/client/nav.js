/* ================================================================== *
 * 导航收敛（产品 §3.2）
 *
 * 把五个平级入口收敛成三个**任务**：
 *   今日理解  —— 首页（问题优先 + 行情列表）与事件中心顶部
 *   探索关系  —— 地图、关联分析（沙盘 / 导图）
 *   我的关注  —— 关注问题简报与预期台账
 *
 * 三件事必须守住，否则收敛就是「多一层点击」：
 *   1. **深链接全部保留**：#/map、#/events、#/macro、#/d/<id> 都还能直接打开；
 *   2. 任务只是「入口分组」，不是新的路由层 —— 点任务不会先到一个中间页；
 *   3. 当前任务由 hash 反推（activeTaskOf），而不是另存一份状态 ——
 *      两份状态一定会不一致。
 *
 * 方案里还有一句提醒：如果常用入口反而需要更多操作，就调整入口位置。
 * 所以这里把「行情」保留在第一组的第一项，它与首页同组，点一次就到。
 * ================================================================== */

export const TASKS = [
  {
    id: 'today',
    label: '今日理解',
    hint: '今天发生了什么、和预期差多少',
    links: [
      { hash: '', label: '行情与问题' },
      { hash: '#/events', label: '事件中心' },
    ],
  },
  {
    id: 'explore',
    label: '探索关系',
    hint: '传导怎么走、冲击会到哪里',
    links: [
      { hash: '#/map', label: '全球地图' },
      { hash: '#/macro', label: '关联分析' },
    ],
  },
  {
    id: 'watch',
    label: '我的关注',
    hint: '只看你关心的问题',
    links: [
      { hash: '#/events', label: '今天重点' },
    ],
  },
];

/** hash → 任务 id。详情页归到「今日理解」：它回答的也是「这是什么」。 */
export function activeTaskOf(hash = '') {
  const h = String(hash ?? '');
  if (h.startsWith('#/map') || h.startsWith('#/macro')) return 'explore';
  if (h.startsWith('#/d/')) return 'today';
  if (h === '' || h === '#') return 'today';
  if (h.startsWith('#/events')) return 'today';
  return 'today';
}

/** 当前 hash 是否落在某个链接上（用于高亮子项） */
export function isLinkActive(hash, linkHash) {
  const h = String(hash ?? '');
  if (linkHash === '') return h === '' || h === '#';
  return h === linkHash || h.startsWith(`${linkHash}/`);
}

/**
 * 渲染后写高亮。任务与子项各有一处 `is-active`，让读者知道自己站在哪。
 */
export function applyNavActive(root, hash) {
  if (!root) return null;
  const taskId = activeTaskOf(hash);
  root.querySelectorAll('[data-task]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.task === taskId);
  });
  root.querySelectorAll('[data-nav-hash]').forEach((el) => {
    el.classList.toggle('is-active', isLinkActive(hash, el.getAttribute('data-nav-hash')));
  });
  root.dataset.task = taskId;
  return taskId;
}
