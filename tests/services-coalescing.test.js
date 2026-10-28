/* ================================================================== *
 * 服务入口的同键合并（方案 E06 / §7.1）
 *
 * 断言的是**服务行为**，不是 helper：两个页面同时打开同一个标的 / 时间窗 /
 * 事件列表时，上游只能被命中一次。这一层以前只有报价做了，其余三个入口
 * 都是「缓存未命中 → 各自抓一遍」。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/server/services/quotes.service.js', () => ({
  getQuotes: vi.fn(async () => ({ ok: true, items: [], generatedAt: '2026-10-28T00:00:00.000Z' })),
  findInstrument: vi.fn((id) => (id === 'gold-intl' ? { id, name: '国际金价', sources: [] } : null)),
  resolveInstrument: vi.fn((id) => ({ id })),
  trimToLastSession: vi.fn((pts) => pts),
  INSTRUMENTS: [],
  DETAIL_ONLY_INSTRUMENTS: [],
}));

vi.mock('../src/server/db/index.js', () => ({
  DAILY_FRESH_MS: 8 * 3600 * 1000,
  readDailyCache: vi.fn(async () => null),
  writeDailyCache: vi.fn(async () => {}),
  isDailyCacheFresh: vi.fn(() => false),
  takeSnapshot: vi.fn(),
  readSnapshots: vi.fn(async () => []),
}));

vi.mock('../src/server/providers/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchRaw: vi.fn(async () => {
      // 每次都慢一点，保证并发窗口真实存在
      await new Promise((r) => setTimeout(r, 25));
      return JSON.stringify({ data: { klines: [] } });
    }),
    historySourcesFor: vi.fn(() => []),
  };
});

const { getDetail, detailServeStats } = await import('../src/server/services/detail.service.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('详情入口', () => {
  it('并发同标的只构建一次，后到的复用结果', async () => {
    const [a, b, c] = await Promise.all([getDetail('gold-intl'), getDetail('gold-intl'), getDetail('gold-intl')]);
    // 三次调用拿到同一份对象（说明是复用，不是各自构建后恰好相等）
    expect(a).toBe(b);
    expect(b).toBe(c);

    const stats = detailServeStats('gold-intl');
    expect(stats.misses).toBe(1);
    expect(stats.merged).toBe(2);
  });

  it('未知标的直接返回 null，不进入合并层', async () => {
    expect(await getDetail('nope')).toBeNull();
  });

  it('第二次调用命中缓存（不再构建）', async () => {
    await getDetail('gold-intl');
    const statsAfterFirst = detailServeStats('gold-intl').misses;
    await getDetail('gold-intl');
    expect(detailServeStats('gold-intl').misses).toBe(statsAfterFirst);
    expect(detailServeStats('gold-intl').hits).toBeGreaterThanOrEqual(1);
  });
});
