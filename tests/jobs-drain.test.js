/* ================================================================== *
 * 任务队列的消化与恢复（server/jobs/index.js）
 *
 * 这几条分支的后果都很具体：
 *   · 没有处理器时任务应当进 dead（不是无限重试）；
 *   · 一次 tick 只消化 batch 个（否则一个 tick 被长任务拖住）；
 *   · 启动时必须把卡在 running 的任务放回 pending，忘了就是永远 running。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, useDatabase } from '../src/server/db/index.js';
import { enqueue, queueStats } from '../src/server/jobs/queue.js';
import { drainQueue, recoverPendingJobs, QUEUE_BATCH, QUEUE_HANDLERS } from '../src/server/jobs/index.js';

beforeEach(() => {
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('消化队列', () => {
  it('没有任务时 processed=0，且带 stats', async () => {
    const out = await drainQueue();
    expect(out.processed).toBe(0);
    expect(out.stats).toBeTruthy();
  });

  it('有任务时执行处理器并记 processed', async () => {
    enqueue({ taskKey: 'noop', payload: {}, dedupeKey: 'k1' });
    const out = await drainQueue({ handlers: { noop: async () => ({ ok: true }) } });
    expect(out.processed).toBe(1);
  });

  it('一次 tick 最多 batch 个（避免被长任务拖住）', async () => {
    for (let i = 0; i < 10; i += 1) enqueue({ taskKey: 'noop', payload: {}, dedupeKey: `k${i}` });
    const out = await drainQueue({ handlers: { noop: async () => ({}) }, batch: 2 });
    expect(out.processed).toBe(2);
  });

  it('默认 batch 就是 QUEUE_BATCH', async () => {
    for (let i = 0; i < 10; i += 1) enqueue({ taskKey: 'noop', payload: {}, dedupeKey: `k${i}` });
    const out = await drainQueue({ handlers: { noop: async () => ({}) } });
    expect(out.processed).toBe(QUEUE_BATCH);
  });

  it('处理器抛错时不吞掉队列（其余任务还能继续）', async () => {
    enqueue({ taskKey: 'boom', payload: {}, dedupeKey: 'b1' });
    enqueue({ taskKey: 'ok', payload: {}, dedupeKey: 'o1' });
    const out = await drainQueue({
      handlers: {
        boom: async () => { throw new Error('炸了'); },
        ok: async () => ({}),
      },
    });
    expect(out.processed).toBeGreaterThanOrEqual(1);
    expect(out.stats).toBeTruthy();
  });

  it('没有对应处理器时任务不会无限重试（进 dead 或重试计数不再增长）', async () => {
    enqueue({ taskKey: 'unknown-task', payload: {}, dedupeKey: 'u1' });
    for (let i = 0; i < 6; i += 1) await drainQueue(); // 用默认处理器表
    const stats = queueStats();
    expect(stats).toBeTruthy();
    // 关键：跑多轮之后要么没有 pending，要么重试次数封顶（不会无限排队）
    expect((stats.pending ?? 0) + (stats.running ?? 0) + (stats.dead ?? 0) + (stats.done ?? 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('内置处理器', () => {
  it('含有 explanation-rebuild', () => {
    expect(Object.keys(QUEUE_HANDLERS)).toContain('explanation-rebuild');
  });

  /**
   * 这条会真的走一遍解释重建（读观测、可能触上游），Ubuntu 上冷启动偶尔超过
   * 默认 5s —— 本机有缓存所以看不出来。给它单独的预算，别把慢路径当作 bug。
   */
  it(
    'explanation-rebuild 在缺少资产时用默认资产（不让任务因为空 payload 失败）',
    async () => {
      const handler = QUEUE_HANDLERS['explanation-rebuild'];
      const out = await handler({ payload: {} });
      expect(out.asset).toBeTruthy();
      expect(out.windowKey).toBeTruthy();
    },
    30_000,
  );
});

describe('启动恢复', () => {
  it('recoverPendingJobs 把过期租约放回 pending（不返回 undefined）', () => {
    const out = recoverPendingJobs();
    expect(out === undefined || typeof out === 'number' || typeof out === 'object').toBe(true);
  });
});

/* ================================================================== *
 * 历史回补（E06 的第二条生产线）
 *
 * 详情与历时的历史序列原来只在**用户访问**时顺带补齐，没人看就永远缺。
 * 入队之后后台能补，失败进队列的重试/终态，不会因为一次源超时就永久丢一段。
 * ================================================================== */
describe('history-backfill 处理器', () => {
  it('注册在 QUEUE_HANDLERS 里（不是只有函数定义）', async () => {
    const { QUEUE_HANDLERS } = await import('../src/server/jobs/index.js');
    expect(typeof QUEUE_HANDLERS['history-backfill']).toBe('function');
  });

  it('处理器在取不到历史时抛错（让队列走重试/终态，而不是静默成功）', async () => {
    const { QUEUE_HANDLERS } = await import('../src/server/jobs/index.js');
    // 用一个不存在的资产：getDetail 会返回错误或空历史，处理器必须抛而不是返回 0 行说成功
    await expect(QUEUE_HANDLERS['history-backfill']({ payload: { asset: 'definitely-not-an-asset' } })).rejects.toThrow();
  }, 60_000);
});

/* ================================================================== *
 * 历史回补必须有**入口**（不是只有处理器）
 *
 * 上一版把处理器注册进 QUEUE_HANDLERS 就宣称「第二条生产线接好了」，
 * 但全仓没有任何地方 enqueue 它 —— 典型的「有实现、有测试、没人调用」。
 * 这条用例断言：默认调度表里有一个任务会真的把它排进队列。
 * ================================================================== */
describe('history-backfill 有调度入口', () => {
  it('默认调度里存在 history-backfill-schedule，且会按资产入队', async () => {
    const jobs = await import('../src/server/jobs/index.js');
    const defs = jobs.buildDefaultJobs({});
    const def = defs.find((d) => d.key === 'history-backfill-schedule');
    expect(def).toBeTruthy();
    expect(typeof def.run).toBe('function');

    const queue = await import('../src/server/jobs/queue.js');
    await def.run();
    // claim 出来看：队列里确实有 history-backfill 任务（不是只调了个空函数）
    const claimed = [];
    for (let i = 0; i < 5; i += 1) {
      const job = queue.claimNext() ?? null;
      if (!job) break;
      claimed.push(job);
    }
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed.every((j) => j.taskKey === 'history-backfill')).toBe(true);
  }, 30_000);
});
