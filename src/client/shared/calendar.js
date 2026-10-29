/* ================================================================== *
 * 财经日历缓存
 *
 * 这份数据有三个消费者：#/events（日历块）、#/map（节点开市状态）、
 * #/d/:id（历史走势图上叠 FOMC/CPI/非农 竖线）。原来它和事件中心写在同一个
 * 模块里，拆分后如果留在 events.js，detail 和 map 就得反向依赖事件页 ——
 * 所以下沉到 shared，缓存仍然只有一份（store.calendar）。
 * ================================================================== */

import { store } from './store.js';
import { api } from './api.js';

export async function loadCalendarCached(force = false) {
  if (!force && store.calendar) return store.calendar;
  try {
    // 走共享请求层：拿超时/取消/错误分类与跨视图去重，失败仍然静默
    const { data } = await api.get('api/calendar');
    store.calendar = data;
  } catch {
    /* 日历失败不影响事件流 */
  }
  return store.calendar;
}
