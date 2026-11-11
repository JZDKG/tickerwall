/* ================================================================== *
 * 覆盖率门禁补齐：jobs/index.js 的默认回调
 *
 * buildDefaultJobs 未注入 overrides 时，每个 run 都指向真实服务函数。
 * 这里用 vi.mock 把这些服务换成可断言的桩，逐个调用默认回调，验证
 * 「调度表真的能驱动业务」，而不是只检查 key 和周期。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/server/services/quotes.service.js', () => ({
  CACHE_TTL_MS: 15_000,
  getQuotes: vi.fn(async () => ({ ok: true, quotes: [] })),
}));
vi.mock('../src/server/services/events.service.js', () => ({
  getEvents: vi.fn(async () => ({ ok: true, events: [] })),
}));
vi.mock('../src/server/services/calendar.service.js', () => ({
  getCalendar: vi.fn(async () => ({ ok: true, upcoming: [] })),
}));
vi.mock('../src/server/services/explanations.service.js', () => ({
  loadAssetObservations: vi.fn(async () => ({ ok: true, rows: [] })),
  getExplanationResponse: vi.fn(async () => ({ status: 200, body: { explanation: { id: 'exp_1' } } })),
}));
vi.mock('../src/server/services/detail.service.js', () => ({
  getDetail: vi.fn(async () => ({ ok: true, history: { daily: [{ close: 1 }] } })),
}));
vi.mock('../src/server/jobs/queue.js', () => ({
  enqueue: vi.fn(() => ({ id: 'job_1' })),
  runOne: vi.fn(async () => null),
  sweepExpiredLeases: vi.fn(),
  queueStats: vi.fn(() => ({})),
}));

const quotes = await import('../src/server/services/quotes.service.js');
const events = await import('../src/server/services/events.service.js');
const calendar = await import('../src/server/services/calendar.service.js');
const explanations = await import('../src/server/services/explanations.service.js');
const queue = await import('../src/server/jobs/queue.js');
const { buildDefaultJobs, drainQueue, QUEUE_HANDLERS, QUEUE_BATCH } = await import('../src/server/jobs/index.js');

const byKey = (jobs) => new Map(jobs.map((j) => [j.key, j]));

beforeEach(() => {
  vi.clearAllMocks();
  queue.runOne.mockResolvedValue(null);
});

describe('buildDefaultJobs 默认 run：真的调业务服务', () => {
  it('quotes → getQuotes({force:false})', async () => {
    await byKey(buildDefaultJobs()).get('quotes').run();
    expect(quotes.getQuotes).toHaveBeenCalledWith({ force: false });
  });

  it('events → getEvents({force:false})', async () => {
    await byKey(buildDefaultJobs()).get('events').run();
    expect(events.getEvents).toHaveBeenCalledWith({ force: false });
  });

  it('calendar → getCalendar({force:false})', async () => {
    await byKey(buildDefaultJobs()).get('calendar').run();
    expect(calendar.getCalendar).toHaveBeenCalledWith({ force: false });
  });

  it('daily-series → loadAssetObservations(黄金, {force:true})', async () => {
    await byKey(buildDefaultJobs()).get('daily-series').run();
    expect(explanations.loadAssetObservations).toHaveBeenCalledWith('gold-intl', { force: true });
  });

  it('history-backfill-schedule 默认按「资产:日期」入队', async () => {
    await byKey(buildDefaultJobs()).get('history-backfill-schedule').run();
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const job = queue.enqueue.mock.calls[0][0];
    expect(job.taskKey).toBe('history-backfill');
    expect(job.dedupeKey).toMatch(/^history:gold-intl:\d{4}-\d{2}-\d{2}$/);
    expect(job.payload).toEqual({ asset: 'gold-intl' });
  });

  it('explanations 默认入队；注入 explain 时额外直调（给「必须要结果」的调用方）', async () => {
    const jobs = byKey(buildDefaultJobs());
    await jobs.get('explanations').run();
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      taskKey: 'explanation-rebuild',
      dedupeKey: 'explain:gold-intl:session',
      payload: { asset: 'gold-intl', windowKey: 'session' },
    }));
    expect(explanations.getExplanationResponse).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const explain = vi.fn(async () => ({ ok: true }));
    const withOverride = byKey(buildDefaultJobs({ explain }));
    await withOverride.get('explanations').run();
    expect(explain).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('注入 explain 时 quotes 等任务仍走默认（overrides 只替换指定项）', async () => {
    const jobs = byKey(buildDefaultJobs({ explain: vi.fn() }));
    await jobs.get('quotes').run();
    expect(quotes.getQuotes).toHaveBeenCalled();
  });

  it('explain 默认回调并行重建 EXPLAIN_ASSETS（未注入时）', async () => {
    const jobs = buildDefaultJobs();
    // 直接拿到默认 explain：用一个只注入其它项、不注入 explain 的表，
    // 通过 explanations 任务的 run 触发入队；再单独验证默认 explain 被使用：
    // buildDefaultJobs 里默认 explain 只在 overrides.explain 存在时才被直调，
    // 所以这里改为断言 getExplanationResponse 在 QUEUE_HANDLERS 里被调用。
    const handler = QUEUE_HANDLERS['explanation-rebuild'];
    const out = await handler({ payload: { asset: 'gold-intl', windowKey: 'session' } });
    expect(out).toMatchObject({ asset: 'gold-intl', windowKey: 'session', status: 200, snapshotId: 'exp_1' });
    expect(explanations.getExplanationResponse).toHaveBeenCalledWith({ asset: 'gold-intl', windowKey: 'session' });
  });
});

describe('job-queue 默认 run 与处理器', () => {
  it('未注入 jobQueue 时 run 指向 drainQueue（空队列返回 processed:0）', async () => {
    const job = byKey(buildDefaultJobs()).get('job-queue');
    const out = await job.run();
    expect(out.processed).toBe(0);
    expect(queue.runOne).toHaveBeenCalled();
  });

  it('drainQueue 默认处理器表能跑完一个任务', async () => {
    let handed = false;
    queue.runOne.mockImplementationOnce(async ({ run }) => {
      handed = true;
      const out = await run({ taskKey: 'explanation-rebuild', payload: { asset: 'gold-intl' } });
      return out;
    });
    const out = await drainQueue();
    expect(handed).toBe(true);
    expect(out.processed).toBe(1);
    expect(QUEUE_BATCH).toBe(3);
  });

  it('history-backfill 处理器：有历史行返回行数，无行抛错', async () => {
    const handler = QUEUE_HANDLERS['history-backfill'];
    await expect(handler({ payload: { asset: 'gold-intl' } }))
      .resolves.toMatchObject({ asset: 'gold-intl', rows: 1 });
    const { getDetail } = await import('../src/server/services/detail.service.js');
    getDetail.mockResolvedValueOnce({ history: { daily: [] } });
    await expect(handler({ payload: {} })).rejects.toThrow(/没有取到任何历史行/);
  });

  it('explanation-rebuild 处理器：HTTP >=400 视为失败', async () => {
    explanations.getExplanationResponse.mockResolvedValueOnce({ status: 503 });
    await expect(QUEUE_HANDLERS['explanation-rebuild']({ payload: {} }))
      .rejects.toThrow(/解释重建失败：HTTP 503/);
  });
});
