/* ================================================================== *
 * 默认采集任务表
 *
 * 依赖方向：jobs/ → services/ → providers/ + domain/，不反向。
 *
 * 为什么任务定义单独放一个文件：server.mjs 只负责启动，任务表需要能
 * 在测试里被单独引用与替换（例如把 run 换成假函数验证「同键合并」）。
 *
 * 周期原则（方案 §7.3）：
 *   · 报价跟随现有缓存策略（15s 级），日频指标**不**跟着秒级轮询；
 *   · 新闻与其缓存走 1 分钟级，日历 30 分钟级；
 *   · 解释重建由「输入变化」触发（日频指标成功后），也保留一个兜底周期。
 * ================================================================== */

import { CACHE_TTL_MS, getQuotes } from '../services/quotes.service.js';
import { getEvents } from '../services/events.service.js';
import { getCalendar } from '../services/calendar.service.js';
import { loadAssetObservations, getExplanationResponse } from '../services/explanations.service.js';

/** 解释首版只覆盖黄金 */
const EXPLAIN_ASSETS = ['gold-intl'];
const EXPLAIN_WINDOW = 'session';

/**
 * @param {{ quotes?:Function, events?:Function, calendar?:Function, observations?:Function, explain?:Function }} overrides
 *        测试用：把这些函数换成假实现，验证调度行为本身。
 */
export function buildDefaultJobs(overrides = {}) {
  const quotes = overrides.quotes ?? (() => getQuotes({ force: false }));
  const events = overrides.events ?? (() => getEvents({ force: false }));
  const calendar = overrides.calendar ?? (() => getCalendar({ force: false }));
  const observations = overrides.observations ?? (() => loadAssetObservations('gold-intl', { force: true }));
  const explain =
    overrides.explain ??
    (() => Promise.all(EXPLAIN_ASSETS.map((asset) => getExplanationResponse({ asset, windowKey: EXPLAIN_WINDOW }))));

  return [
    {
      key: 'quotes',
      intervalMs: Math.max(CACHE_TTL_MS, 5000),
      backoffBaseMs: 30_000,
      maxBackoffMs: 5 * 60_000,
      // 报价变化会影响解释里的目标资产，成功后立即重建解释
      triggers: ['explanations'],
      run: quotes,
    },
    {
      key: 'events',
      intervalMs: 60_000,
      backoffBaseMs: 60_000,
      maxBackoffMs: 15 * 60_000,
      run: events,
    },
    {
      key: 'calendar',
      intervalMs: 30 * 60_000,
      backoffBaseMs: 5 * 60_000,
      maxBackoffMs: 60 * 60_000,
      run: calendar,
    },
    {
      key: 'daily-series',
      // 日频指标按发布周期走，不跟行情轮询
      intervalMs: 60 * 60_000,
      backoffBaseMs: 10 * 60_000,
      maxBackoffMs: 6 * 60 * 60_000,
      triggers: ['explanations'],
      run: observations,
    },
    {
      key: 'explanations',
      // 兜底周期：即使没有新输入，也定期确认快照仍在（读取时会重算新鲜度）
      intervalMs: 10 * 60_000,
      backoffBaseMs: 60_000,
      maxBackoffMs: 30 * 60_000,
      run: explain,
    },
  ];
}
