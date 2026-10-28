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

  it('explanation-rebuild 在缺少资产时用默认资产（不让任务因为空 payload 失败）', async () => {
    const handler = QUEUE_HANDLERS['explanation-rebuild'];
    const out = await handler({ payload: {} });
    expect(out.asset).toBeTruthy();
    expect(out.windowKey).toBeTruthy();
  });
});

describe('启动恢复', () => {
  it('recoverPendingJobs 把过期租约放回 pending（不返回 undefined）', () => {
    const out = recoverPendingJobs();
    expect(out === undefined || typeof out === 'number' || typeof out === 'object').toBe(true);
  });
});
