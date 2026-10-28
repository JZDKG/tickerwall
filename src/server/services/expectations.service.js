/* ================================================================== *
 * 预期台账（产品 2.4 的服务层）
 *
 * 职责只有一件：把日历里「已公布 / 待公布 / 有偏差」的条目整理成一屏能读的
 * 台账。判定全部交给 domain（`expectation-sources.js`），这一层不重新判。
 *
 * 为什么不在服务层做判定：判定口径一旦分散，界面与接口就会给出不一致的
 * 结论；而口径是这一屏唯一有风险的东西。
 *
 * 依赖注入（calendar / nowMs 可传）是为了测试不碰真实网络与当前时间。
 * ================================================================== */

import { getCalendar } from './calendar.service.js';
import { judgeCalendarReleases, summarizeReleases } from '../domain/expectation-sources.js';

/**
 * 台账。
 *
 * @param {{ nowMs?: number, limit?: number, deps?: { getCalendar?: Function } }} opts
 */
export async function getExpectationLedger({ nowMs = Date.now(), limit = 12, force = false, deps = {} } = {}) {
  const loadCalendar = deps.getCalendar ?? getCalendar;
  let calendar = null;
  try {
    // force 只影响日历缓存是否重取，判定与整理与它无关
    calendar = await loadCalendar({ force });
  } catch (err) {
    /**
     * 日历挂了不该让这一屏变成红字：台账可以为空，但要说清是「取不到」
     * 还是「确实没有条目」—— 这两件事对读者完全不同。
     */
    return {
      ok: false,
      status: 'unavailable',
      reason: String(err?.message ?? err),
      checkedAt: new Date(nowMs).toISOString(),
      ...summarizeReleases([]),
      released: [],
      pending: [],
    };
  }

  const items = judgeCalendarReleases(calendar, { nowMs, limit });
  const summary = summarizeReleases(items);
  return {
    ok: true,
    status: items.length ? 'ok' : 'empty',
    checkedAt: new Date(nowMs).toISOString(),
    calendarFetchedAt: calendar?.fetchedAt ?? null,
    calendarCoverage: calendar?.coverage ?? null,
    ...summary,
    /**
     * 按「已公布」与「待公布」分开：读者看这一屏时的两个问题不同 ——
     * 「刚公布的那些准不准」与「接下来要看什么」。
     */
    released: items.filter((x) => x.verdict !== 'pending'),
    pending: items.filter((x) => x.verdict === 'pending'),
  };
}
