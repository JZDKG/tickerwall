/* ================================================================== *
 * 可恢复任务队列（方案 E06 / §7.2）
 *
 * 三个必须做对的点：去重、租约回收、终态。这三件事错了不会抛异常，
 * 只会表现为「任务莫名其妙不再跑」。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, useDatabase } from '../src/server/db/index.js';
import {
  claimNext,
  complete,
  enqueue,
  fail,
  listJobs,
  queueStats,
  runOne,
  sweepExpiredLeases,
} from '../src/server/jobs/queue.js';

beforeEach(() => useDatabase(':memory:'));
afterEach(() => closeDb());

describe('入队与去重', () => {
  it('同 dedupeKey 只排一个任务', () => {
    const a = enqueue({ taskKey: 'explain', dedupeKey: 'explain:gold-intl' });
    const b = enqueue({ taskKey: 'explain', dedupeKey: 'explain:gold-intl' });
    expect(a.enqueued).toBe(true);
    expect(b.enqueued).toBe(false);
    expect(b.job.id).toBe(a.job.id);
    expect(listJobs()).toHaveLength(1);
  });

  it('已完成的任务可以再次入队（复用同一行，不新增）', () => {
    const a = enqueue({ taskKey: 'explain', dedupeKey: 'k' });
    const claimed = claimNext();
    complete(claimed.id);
    const again = enqueue({ taskKey: 'explain', dedupeKey: 'k' });
    expect(again.enqueued).toBe(true);
    expect(again.job.id).toBe(a.job.id);
    expect(again.job.status).toBe('pending');
    expect(again.job.attempts).toBe(0);
  });

  it('缺 taskKey / dedupeKey 直接拒绝（不排一个无法回收的任务）', () => {
    expect(() => enqueue({ dedupeKey: 'x' })).toThrow(/taskKey/);
    expect(() => enqueue({ taskKey: 'x' })).toThrow(/dedupeKey/);
  });

  it('payload 原样带回', () => {
    enqueue({ taskKey: 't', dedupeKey: 'k1', payload: { asset: 'gold-intl', window: 'session' } });
    expect(claimNext().payload).toEqual({ asset: 'gold-intl', window: 'session' });
  });
});

describe('领取', () => {
  it('按 next_attempt_at 先到先得，且同一行不会被领两次', () => {
    enqueue({ taskKey: 't', dedupeKey: 'late', nextAttemptAt: 5000 });
    enqueue({ taskKey: 't', dedupeKey: 'early', nextAttemptAt: 1000 });
    const first = claimNext({ now: () => 6000 });
    expect(first.dedupeKey).toBe('early');
    expect(first.status).toBe('running');
    expect(first.attempts).toBe(1);
    const second = claimNext({ now: () => 6000 });
    expect(second.dedupeKey).toBe('late');
    expect(claimNext({ now: () => 6000 })).toBeNull();
  });

  it('未到 next_attempt_at 的不会被领走', () => {
    enqueue({ taskKey: 't', dedupeKey: 'k', nextAttemptAt: 10_000 });
    expect(claimNext({ now: () => 1 })).toBeNull();
    expect(claimNext({ now: () => 10_001 }).dedupeKey).toBe('k');
  });

  it('领取带租约；租约未过期时 sweep 不动它', () => {
    enqueue({ taskKey: 't', dedupeKey: 'k' });
    const job = claimNext({ leaseMs: 1000, now: () => 0 });
    expect(job.leaseUntil).toBe(1000);
    expect(sweepExpiredLeases({ now: () => 500 })).toBe(0);
    expect(queueStats().running).toBe(1);
  });
});

describe('租约回收（重启恢复）', () => {
  it('过期租约被放回 pending，可以再次领取', () => {
    enqueue({ taskKey: 't', dedupeKey: 'k' });
    claimNext({ leaseMs: 1000, now: () => 0 });
    // 进程在这里被杀：下次启动 sweep
    expect(sweepExpiredLeases({ now: () => 2000 })).toBe(1);
    const again = claimNext({ now: () => 2000 });
    expect(again.dedupeKey).toBe('k');
    // 重试会累加 attempts：这行被尝试了两次
    expect(again.attempts).toBe(2);
  });

  it('sweep 不碰已完成的任务', () => {
    enqueue({ taskKey: 't', dedupeKey: 'k' });
    const job = claimNext({ leaseMs: 1, now: () => 0 });
    complete(job.id, { ok: true });
    expect(sweepExpiredLeases({ now: () => 9999 })).toBe(0);
    expect(queueStats().done).toBe(1);
  });
});

describe('失败与终态', () => {
  it('未达上限 → 退避后重回 pending，并记下错误', () => {
    enqueue({ taskKey: 't', dedupeKey: 'k', maxAttempts: 3 });
    const job = claimNext({ now: () => 0 });
    const out = fail(job.id, new Error('boom'), { backoffMs: 500, now: () => 0 });
    expect(out.requeued).toBe(true);
    expect(out.dead).toBe(false);
    const pending = listJobs().find((j) => j.dedupeKey === 'k');
    expect(pending.status).toBe('pending');
    expect(pending.lastError).toContain('boom');
    expect(pending.nextAttemptAt).toBe(500);
  });

  it('达到上限 → dead，不再重试但保留行与错误', () => {
    enqueue({ taskKey: 't', dedupeKey: 'k', maxAttempts: 1 });
    const job = claimNext({ now: () => 0 });
    const out = fail(job.id, 'always fails', { now: () => 0 });
    expect(out.dead).toBe(true);
    expect(claimNext({ now: () => 1e9 })).toBeNull();
    expect(queueStats().dead).toBe(1);
    // dead 的行不挡新的入队：人工修好后可以再来一次
    expect(enqueue({ taskKey: 't', dedupeKey: 'k' }).enqueued).toBe(true);
  });

  it('fail 只对 running 生效（不能把已完成的任务改成失败）', () => {
    enqueue({ taskKey: 't', dedupeKey: 'k' });
    const job = claimNext();
    complete(job.id);
    expect(fail(job.id, 'late error')).toEqual({ requeued: false, dead: false });
    expect(queueStats().done).toBe(1);
  });
});

describe('runOne：执行一轮', () => {
  it('成功回调 → done，结果落库', async () => {
    enqueue({ taskKey: 't', dedupeKey: 'k' });
    const out = await runOne({ run: async () => ({ snapshot: 'exp_1' }) });
    expect(out.status).toBe('done');
    expect(out.result).toEqual({ snapshot: 'exp_1' });
    expect(queueStats().done).toBe(1);
  });

  it('回调抛错 → 回到 pending 并记错误', async () => {
    enqueue({ taskKey: 't', dedupeKey: 'k', maxAttempts: 5 });
    const out = await runOne({
      run: async () => {
        throw new Error('upstream 503');
      },
      backoffMs: 1000,
    });
    expect(out.status).toBe('pending');
    expect(out.error).toContain('upstream 503');
    expect(queueStats().pending).toBe(1);
  });

  it('没有任务时返回 null（不阻塞、不抛）', async () => {
    expect(await runOne({ run: async () => 1 })).toBeNull();
  });
});

describe('概览', () => {
  it('queueStats 分组计数 + 最老待办时间', () => {
    enqueue({ taskKey: 't', dedupeKey: 'a', now: () => 1000 });
    enqueue({ taskKey: 't', dedupeKey: 'b', now: () => 2000 });
    const claimed = claimNext({ now: () => 3000 });
    complete(claimed.id);
    const stats = queueStats();
    expect(stats.pending).toBe(1);
    expect(stats.done).toBe(1);
    expect(stats.dead).toBe(0);
    expect(stats.oldestPendingAt).toBeTruthy();
  });
});
