/* ================================================================== *
 * 同键合并与两级时间（方案 E06 / §7.1）
 *
 * 这一层的价值全在边界上：并发同键只能打一次上游、刷新失败不能丢旧值、
 * 超龄数据要降级而不是装作没有。三种情形都必须能复现。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { createCoalescer, coalescedEntry } from '../src/server/jobs/coalesce.js';

describe('同键合并', () => {
  it('并发同键只加载一次，后来者复用同一结果', async () => {
    const c = createCoalescer();
    let calls = 0;
    const load = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { v: calls };
    };
    const [a, b, d] = await Promise.all([
      c.get('k', { load, ttlMs: 1000 }),
      c.get('k', { load, ttlMs: 1000 }),
      c.get('k', { load, ttlMs: 1000 }),
    ]);
    expect(calls).toBe(1);
    expect(a.value).toEqual(b.value);
    expect(d.value).toEqual(a.value);
    expect([a, b, d].filter((r) => r.merged).length).toBe(2);
    expect(c.statsFor('k').merged).toBe(2);
  });

  it('不同键互不影响', async () => {
    const c = createCoalescer();
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };
    await Promise.all([c.get('a', { load, ttlMs: 1000 }), c.get('b', { load, ttlMs: 1000 })]);
    expect(calls).toBe(2);
  });

  it('force 仍然合并：刷新风暴不会变成上游风暴', async () => {
    const c = createCoalescer();
    let calls = 0;
    const load = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return calls;
    };
    await Promise.all([
      c.get('k', { load, ttlMs: 1000, force: true }),
      c.get('k', { load, ttlMs: 1000, force: true }),
    ]);
    expect(calls).toBe(1);
  });
});

describe('两级时间', () => {
  it('TTL 内命中缓存，不加载', async () => {
    let t = 0;
    const c = createCoalescer({ now: () => t });
    const load = vi.fn(async () => 'v1');
    await c.get('k', { load, ttlMs: 100 });
    t = 50;
    const second = await c.get('k', { load, ttlMs: 100 });
    expect(second.value).toBe('v1');
    expect(second.state).toBe('ok');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('超过 TTL 会重新加载并替换值', async () => {
    let t = 0;
    const c = createCoalescer({ now: () => t });
    const load = vi.fn(async () => `v${load.mock.calls.length}`);
    await c.get('k', { load, ttlMs: 100 });
    t = 150;
    const second = await c.get('k', { load, ttlMs: 100 });
    expect(second.value).toBe('v2');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('刷新失败但数据未超龄 → stale（旧值照常返回）', async () => {
    let t = 0;
    const c = createCoalescer({ now: () => t });
    let fail = false;
    const load = async () => {
      if (fail) throw new Error('upstream down');
      return 'good';
    };
    await c.get('k', { load, ttlMs: 100, maxServeAgeMs: 1000 });
    t = 200;
    fail = true;
    const r = await c.get('k', { load, ttlMs: 100, maxServeAgeMs: 1000 });
    expect(r.value).toBe('good');
    expect(r.state).toBe('stale');
    expect(r.error).toContain('upstream down');
  });

  it('刷新失败且已超龄 → unavailable（保留数据但不声称可用）', async () => {
    let t = 0;
    const c = createCoalescer({ now: () => t });
    let fail = false;
    const load = async () => {
      if (fail) throw new Error('down');
      return 'old';
    };
    await c.get('k', { load, ttlMs: 100, maxServeAgeMs: 500 });
    t = 900;
    fail = true;
    const r = await c.get('k', { load, ttlMs: 100, maxServeAgeMs: 500 });
    expect(r.value).toBe('old');
    expect(r.state).toBe('unavailable');
    expect(c.statsFor('k').servedStale).toBe(1);
  });

  it('从来没有成功过就失败 → unavailable 且没有值（不编一个默认值）', async () => {
    const c = createCoalescer();
    const r = await c.get('k', {
      load: async () => {
        throw new Error('boom');
      },
      ttlMs: 100,
    });
    expect(r.value).toBeNull();
    expect(r.state).toBe('unavailable');
    expect(r.at).toBeNull();
  });
});

describe('装载给服务用的薄封装', () => {
  it('coalescedEntry 用同一套语义，并暴露统计', async () => {
    const entry = coalescedEntry({ ttlMs: 50, name: 'detail' });
    const load = vi.fn(async () => ({ ok: true }));
    const r = await entry.get('gold-intl', load);
    expect(r.value).toEqual({ ok: true });
    expect(entry.name).toBe('detail');
    expect(entry.statsFor('gold-intl').misses).toBe(1);
  });

  it('clear 之后重新加载', async () => {
    const entry = coalescedEntry({ ttlMs: 10_000 });
    const load = vi.fn(async () => 'v');
    await entry.get('k', load);
    entry.clear('k');
    await entry.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('inflightSize 能反映「有没有正在跑」，不会泄漏', async () => {
    const c = createCoalescer();
    let release;
    const p = c.get('k', {
      load: () => new Promise((r) => { release = () => r('v'); }),
      ttlMs: 1,
    });
    expect(c.inflightSize()).toBe(1);
    release();
    await p;
    expect(c.inflightSize()).toBe(0);
  });
});
