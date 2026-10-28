/* ================================================================== *
 * 采集调度（B6 验收）
 *
 * 方案 §10.1 最后几行与 §7.3：
 *   · 无浏览器访问也采集（调度器独立于请求）；
 *   · 并发不重复触发同一轮任务（同键合并）；
 *   · 一个源失败时其他源继续（逐任务退避，不是全局熔断）；
 *   · 成功采集后按受影响资产触发解释重算。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { createCollector, backoffFor, startCollector } from '../src/server/jobs/collector.js';
import { buildDefaultJobs } from '../src/server/jobs/index.js';
import { useDatabase, closeDb, listCollectionStates } from '../src/server/db/index.js';

/** 内存状态存储：单测不需要真库，语义与 SQLite 版一致 */
function memoryStore() {
  const rows = new Map();
  return {
    rows,
    success(key, at) {
      rows.set(key, { jobKey: key, lastSuccessAt: at, fails: 0, lastError: null, backoffUntil: null });
    },
    failure(key, error, { atMs, backoffUntil } = {}) {
      const prev = rows.get(key) ?? { jobKey: key, fails: 0, lastSuccessAt: null };
      rows.set(key, {
        ...prev,
        lastError: String(error),
        lastErrorAt: atMs,
        fails: (prev.fails ?? 0) + 1,
        backoffUntil,
      });
    },
    read(key) {
      return rows.get(key) ?? null;
    },
    list() {
      return [...rows.values()];
    },
  };
}

describe('退避策略', () => {
  it('指数退避有上限', () => {
    expect(backoffFor(1, { baseMs: 1000, maxMs: 10_000 })).toBe(1000);
    expect(backoffFor(2, { baseMs: 1000, maxMs: 10_000 })).toBe(2000);
    expect(backoffFor(4, { baseMs: 1000, maxMs: 10_000 })).toBe(8000);
    expect(backoffFor(9, { baseMs: 1000, maxMs: 10_000 })).toBe(10_000);
  });
});

describe('同键合并：并发不重复打上游', () => {
  it('同一任务同时触发两次，只执行一次 run', async () => {
    let calls = 0;
    const store = memoryStore();
    const collector = createCollector({
      store,
      jobs: [
        {
          key: 'quotes',
          intervalMs: 1000,
          run: async () => {
            calls += 1;
            await new Promise((r) => setTimeout(r, 10));
          },
        },
      ],
    });
    const [a, b] = await Promise.all([collector.runJob('quotes'), collector.runJob('quotes')]);
    expect(calls).toBe(1);
    expect(a.status).toBe('ok');
    expect(b.merged).toBe(true);
  });

  it('上一轮结束后可以再跑（合并不等于永久单次）', async () => {
    let calls = 0;
    const store = memoryStore();
    let t = 0;
    const collector = createCollector({
      store,
      now: () => t,
      jobs: [{ key: 'events', intervalMs: 100, run: async () => { calls += 1; } }],
    });
    await collector.runJob('events');
    t = 50;
    const skipped = await collector.runJob('events');
    expect(skipped.status).toBe('skipped');
    expect(skipped.error).toBe('BACKOFF');
    t = 200;
    await collector.runJob('events');
    expect(calls).toBe(2);
  });
});

describe('失败隔离：一个源挂了其他源继续', () => {
  it('失败任务进入退避，成功任务正常推进', async () => {
    const store = memoryStore();
    let t = 1_000;
    const collector = createCollector({
      store,
      now: () => t,
      jobs: [
        { key: 'bad', intervalMs: 1000, backoffBaseMs: 5000, run: async () => { throw new Error('boom'); } },
        { key: 'good', intervalMs: 1000, run: async () => {} },
      ],
    });
    const results = await collector.tick();
    const bad = results.find((r) => r.key === 'bad');
    const good = results.find((r) => r.key === 'good');
    expect(bad.status).toBe('failed');
    expect(bad.error).toBe('boom');
    expect(bad.backoffMs).toBe(5000);
    expect(good.status).toBe('ok');
    // 失败被记录，且带着退避时间
    expect(store.read('bad').fails).toBe(1);
    expect(store.read('bad').backoffUntil).toBe(t + 5000);
  });

  it('连续失败会累加并延长退避', async () => {
    const store = memoryStore();
    let t = 0;
    const collector = createCollector({
      store,
      now: () => t,
      jobs: [{ key: 'x', intervalMs: 10, backoffBaseMs: 100, maxBackoffMs: 1000, run: async () => { throw new Error('e'); } }],
    });
    await collector.runJob('x');
    t = 200;
    await collector.runJob('x');
    t = 900;
    const third = await collector.runJob('x');
    expect(store.read('x').fails).toBe(3);
    expect(third.backoffMs).toBe(400);
  });

  it('未到期不执行（不会因为 tick 频繁而重复打上游）', async () => {
    const store = memoryStore();
    let t = 0;
    let calls = 0;
    const collector = createCollector({
      store,
      now: () => t,
      jobs: [{ key: 'cal', intervalMs: 10_000, run: async () => { calls += 1; } }],
    });
    await collector.tick();
    t = 5000;
    await collector.tick();
    expect(calls).toBe(1);
    t = 10_001;
    await collector.tick();
    expect(calls).toBe(2);
  });

  it('未知任务与禁用任务都被跳过，不抛错', async () => {
    const collector = createCollector({
      store: memoryStore(),
      jobs: [{ key: 'off', enabled: false, run: async () => {} }],
    });
    expect((await collector.runJob('nope')).error).toBe('UNKNOWN_JOB');
    expect((await collector.runJob('off')).error).toBe('DISABLED');
  });
});

describe('触发链：采集成功后再重建解释', () => {
  it('quotes 成功后 explanations 立刻可跑', async () => {
    const store = memoryStore();
    let t = 0;
    const order = [];
    const collector = createCollector({
      store,
      now: () => t,
      jobs: [
        {
          key: 'quotes',
          intervalMs: 60_000,
          triggers: ['explanations'],
          run: async () => {
            order.push('quotes');
          },
        },
        {
          key: 'explanations',
          intervalMs: 600_000,
          run: async () => {
            order.push('explanations');
          },
        },
      ],
    });
    // 先让 explanations 跑一次，把它推到未来
    await collector.runJob('explanations');
    t = 1000;
    // quotes 成功 → 触发 explanations 解除等待
    await collector.runJob('quotes');
    const after = await collector.runJob('explanations');
    expect(after.status).toBe('ok');
    expect(order).toEqual(['explanations', 'quotes', 'explanations']);
  });
});

describe('可观测性', () => {
  it('status() 报出下次到期时间、失败次数与错误', async () => {
    const store = memoryStore();
    let t = 0;
    const collector = createCollector({
      store,
      now: () => t,
      jobs: [{ key: 'j', intervalMs: 100, run: async () => { throw new Error('bad'); } }],
    });
    await collector.runJob('j');
    const [row] = collector.status();
    expect(row.key).toBe('j');
    expect(row.fails).toBe(1);
    expect(row.lastError).toBe('bad');
    // 失败后下次到期时间被推到退避窗口之后（t=0，默认 base 60s）
    expect(row.nextDueAt).toBe(60_000);
    expect(row.lastResult.status).toBe('failed');
  });

  it('startCollector 启动即跑一轮，并能 stop', async () => {
    const store = memoryStore();
    let calls = 0;
    const started = startCollector({
      store,
      jobs: [{ key: 'boot', intervalMs: 10, run: async () => { calls += 1; } }],
      everyMs: 5,
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toBeGreaterThan(0);
    started.stop();
    const after = calls;
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toBe(after);
  });
});

describe('默认任务表', () => {
  it('覆盖报价 / 新闻 / 日历 / 日频指标 / 解释，且日频不跟秒级轮询', () => {
    const jobs = buildDefaultJobs({
      quotes: async () => {},
      events: async () => {},
      calendar: async () => {},
      observations: async () => {},
      explain: async () => {},
    });
    const byKey = new Map(jobs.map((j) => [j.key, j]));
    for (const key of ['quotes', 'events', 'calendar', 'daily-series', 'explanations']) {
      expect(byKey.has(key), key).toBe(true);
    }
    // 日频指标的周期必须远大于报价周期
    expect(byKey.get('daily-series').intervalMs).toBeGreaterThanOrEqual(30 * 60_000);
    expect(byKey.get('quotes').intervalMs).toBeLessThan(byKey.get('daily-series').intervalMs);
    // 报价与日频指标都会触发解释重建
    expect(byKey.get('quotes').triggers).toContain('explanations');
    expect(byKey.get('daily-series').triggers).toContain('explanations');
  });

  it('默认任务能真的跑通（假实现替换掉上游）', async () => {
    const calls = [];
    const jobs = buildDefaultJobs({
      quotes: async () => calls.push('quotes'),
      events: async () => calls.push('events'),
      calendar: async () => calls.push('calendar'),
      observations: async () => calls.push('obs'),
      explain: async () => calls.push('explain'),
    });
    const collector = createCollector({ store: memoryStore(), jobs });
    const results = await collector.tick();
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(calls.sort()).toEqual(['calendar', 'events', 'explain', 'obs', 'quotes']);
  });
});

describe('与 SQLite collection_state 的对接', () => {
  it('默认 store 会把失败写进 collection_state', async () => {
    useDatabase(':memory:');
    try {
      const collector = createCollector({
        jobs: [{ key: 'db-job', intervalMs: 10, run: async () => { throw new Error('db boom'); } }],
      });
      await collector.runJob('db-job');
      const rows = listCollectionStates();
      expect(rows[0]).toMatchObject({ jobKey: 'db-job', fails: 1 });
    } finally {
      closeDb();
    }
  });
});
