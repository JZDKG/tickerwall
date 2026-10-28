/* ================================================================== *
 * 今天重点三件（产品 §3 的服务层）
 *
 * 只拼数据：事件取当天、日历取最近一件。排序规则在 domain，这里不重排。
 * 日历取不到时 focus 照常给，next 为 null —— 事件与发布是两条独立数据线。
 * ================================================================== */

import { getEvents } from './events.service.js';
import { getCalendar } from './calendar.service.js';
import { buildTodayFocus } from '../domain/today-focus.js';

/** 北京时间的「今天」（YYYY-MM-DD） */
export function beijingDay(nowMs = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowMs));
}

export async function getTodayFocus({ nowMs = Date.now(), deps = {} } = {}) {
  const day = beijingDay(nowMs);
  const loadEvents = deps.getEvents ?? getEvents;
  const loadCalendar = deps.getCalendar ?? getCalendar;

  let items = [];
  let eventsError = null;
  try {
    const payload = await loadEvents({ force: false, limit: 160 });
    items = payload?.items ?? [];
  } catch (err) {
    eventsError = String(err?.message ?? err);
  }

  let calendar = null;
  let calendarError = null;
  try {
    calendar = await loadCalendar({ force: false });
  } catch (err) {
    calendarError = String(err?.message ?? err);
  }

  return {
    ...buildTodayFocus({ items, calendar, day, nowMs }),
    day,
    checkedAt: new Date(nowMs).toISOString(),
    eventsError,
    calendarError,
  };
}
