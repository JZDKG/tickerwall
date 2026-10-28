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
import { enqueue, runOne, sweepExpiredLeases, queueStats } from './queue.js';

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
      /**
       * 不在 tick 里直接重建，而是入队（方案 E06 / §7.2）。
       *
       * 解释重建要读十几个序列、算完再落库，属于「值得重启后接着做」的长任务。
       * 入队之后：进程在重建中途被杀，下次启动 sweep 会把任务放回 pending 重做；
       * 同一资产在同一个窗口被触发三次，也只排一个任务。
       */
      run: async () => {
        for (const asset of EXPLAIN_ASSETS) {
          enqueue({ taskKey: 'explanation-rebuild', dedupeKey: `explain:${asset}:${EXPLAIN_WINDOW}`, payload: { asset, windowKey: EXPLAIN_WINDOW } });
        }
        // 保留 explain() 直调路径给「必须要结果」的调用方（例如测试与手动刷新）
        if (overrides.explain) await explain();
      },
    },
    {
      key: 'job-queue',
      // 队列紧跟调度器：每个 tick 消化一批可恢复任务
      intervalMs: 15_000,
      backoffBaseMs: 30_000,
      maxBackoffMs: 5 * 60_000,
      run: () => drainQueue(),
    },
  ];
}

/** 一次 tick 最多消化多少个可恢复任务（避免一个 tick 被长任务拖住） */
export const QUEUE_BATCH = 3;

/** 任务处理器：taskKey → run(job) */
export const QUEUE_HANDLERS = {
  'explanation-rebuild': async (job) => {
    const asset = job.payload?.asset ?? EXPLAIN_ASSETS[0];
    const windowKey = job.payload?.windowKey ?? EXPLAIN_WINDOW;
    const res = await getExplanationResponse({ asset, windowKey });
    if (res?.status && res.status >= 400) throw new Error(`解释重建失败：HTTP ${res.status}`);
    return { asset, windowKey, status: res?.status ?? 200, snapshotId: res?.body?.explanation?.id ?? null };
  },
};

/**
 * 消化队列。没有可执行任务时返回 {processed:0}。
 * @param {{handlers?:object, batch?:number}} [opts]
 */
export async function drainQueue({ handlers = QUEUE_HANDLERS, batch = QUEUE_BATCH } = {}) {
  let processed = 0;
  for (let i = 0; i < batch; i += 1) {
    const out = await runOne({
      run: (job) => {
        const handler = handlers[job.taskKey];
        if (!handler) throw new Error(`没有 taskKey=${job.taskKey} 的处理器`);
        return handler(job);
      },
    });
    if (!out) break;
    processed += 1;
  }
  return { processed, stats: queueStats() };
}

/**
 * 启动时恢复：把上次因进程退出而卡在 running 的任务放回 pending。
 * 忘了调用它的后果很具体：那些任务永远是 running，日志一片安静。
 */
export function recoverPendingJobs() {
  return sweepExpiredLeases();
}
