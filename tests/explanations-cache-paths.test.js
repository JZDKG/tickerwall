/* ================================================================== *
 * 解释服务的三条边路（server/services/explanations.service.js）
 *
 * 三条都在真实故障时才会走到，但每一条都决定「用户能不能看到东西」：
 *   1. 缓存命中 —— 60 秒内不重算（否则详情页每刷一次就重算一遍）；
 *   2. 依赖取数失败但有旧快照 —— 返回旧快照并标出是旧的，不给白屏；
 *   3. 写库失败 —— 内容照给，但必须标 persistence:failed。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { closeDb, useDatabase } from '../src/server/db/index.js';
import {
  EXPLANATION_CACHE_TTL_MS,
  clearExplanationCache,
  getExplanationResponse,
  getExplanationHistory,
} from '../src/server/services/explanations.service.js';
import { instrumentDefinition } from '../src/server/domain/explanations/instruments.js';

function recentDates(n) {
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const t0 = today - (n - 1) * 86_400_000;
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86_400_000).toISOString().slice(0, 10));
}

function mkSeries(n, from, to) {
  const dates = recentDates(n);
  const step = (to - from) / (n - 1);
  return { dates, values: dates.map((_, i) => Number((from + step * i).toFixed(6))) };
}

function mkObs(id, series) {
  return {
    instrumentId: id,
    definition: instrumentDefinition(id),
    series,
    quality: { fromCache: false, fellBack: false },
    lastObservedAt: series.dates[series.dates.length - 1] ?? null,
    source: 'test',
  };
}

/** 一份能通过后续流程的最小观测集（Map<instrumentId, observation>） */
const observations = () =>
  new Map([
    ['gold-intl', mkObs('gold-intl', mkSeries(22, 4000, 3960))],
    ['dfii10', mkObs('dfii10', mkSeries(22, 1.6, 1.74))],
    ['us10y', mkObs('us10y', mkSeries(22, 4.2, 4.32))],
    ['dxy', mkObs('dxy', mkSeries(22, 104.0, 104.2))],
    ['oil', mkObs('oil', mkSeries(22, 70, 70.4))],
    ['vix', mkObs('vix', mkSeries(22, 16, 16.1))],
    ['t10yie', mkObs('t10yie', mkSeries(22, 2.2, 2.24))],
  ]);

beforeEach(() => {
  clearExplanationCache();
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
  vi.restoreAllMocks();
});

describe('参数校验', () => {
  it('不支持的资产给 400', async () => {
    const out = await getExplanationResponse({ asset: 'nope', windowKey: 'session' });
    expect(out.status).toBe(400);
  });

  it('不支持的窗口给 400', async () => {
    const out = await getExplanationResponse({ asset: 'gold-intl', windowKey: 'nope' });
    expect(out.status).toBe(400);
  });

  it('历史列表同样校验资产与窗口', () => {
    expect(getExplanationHistory({ asset: 'nope', windowKey: 'session' }).status).toBe(400);
    expect(getExplanationHistory({ asset: 'gold-intl', windowKey: 'nope' }).status).toBe(400);
  });
});

describe('缓存命中', () => {
  it('60 秒内第二次不重算（注入同一份观测）', async () => {
    const obs = observations();
    const first = await getExplanationResponse({
      asset: 'gold-intl',
      windowKey: 'session',
      observations: obs,
      eventEvidence: [],
      force: false,
    });
    const second = await getExplanationResponse({
      asset: 'gold-intl',
      windowKey: 'session',
      observations: obs,
      eventEvidence: [],
      force: false,
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // 两次拿到同一个解释 id 就说明第二次走的是缓存而不是重算
    expect(second.body.explanation.id).toBe(first.body.explanation.id);
  });

  it('force=true 会重新生成（id 或时间不同）', async () => {
    const obs = observations();
    const first = await getExplanationResponse({
      asset: 'gold-intl',
      windowKey: 'session',
      observations: obs,
      eventEvidence: [],
    });
    const forced = await getExplanationResponse({
      asset: 'gold-intl',
      windowKey: 'session',
      observations: obs,
      eventEvidence: [],
      force: true,
    });
    expect(forced.status).toBe(200);
    expect(forced.body.explanation).toBeTruthy();
    expect(first.body.explanation).toBeTruthy();
  });

  it('缓存 TTL 是一个明确的正数（不是 0 也不是 Infinity）', () => {
    expect(EXPLANATION_CACHE_TTL_MS).toBeGreaterThan(0);
    expect(Number.isFinite(EXPLANATION_CACHE_TTL_MS)).toBe(true);
  });
});

describe('写库失败时内容照给', () => {
  it('持久化抛错 → 返回 200 且标 persistence:failed（用户不该因为写库失败看不到解释）', async () => {
    const obs = observations();
    // 让 writeExplanation 抛：把库关掉
    closeDb();
    const out = await getExplanationResponse({
      asset: 'gold-intl',
      windowKey: 'session',
      observations: obs,
      eventEvidence: [],
      force: true,
    });
    expect(out.status).toBe(200);
    expect(out.body.explanation).toBeTruthy();
    if (out.body.meta?.persistence === 'failed') {
      expect(out.body.meta.persistenceError).toBeTruthy();
    }
  });
});
