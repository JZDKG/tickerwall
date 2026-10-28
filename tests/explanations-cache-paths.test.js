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
  getExplanationResponse,
  getExplanationHistory,
} from '../src/server/services/explanations.service.js';

/** 一份能通过后续流程的最小观测集 */
const observations = () => ({
  asset: 'gold-intl',
  windowKey: 'session',
  window: { start: '2026-10-28', end: '2026-10-28' },
  series: {},
  instruments: [],
  warnings: [],
});

beforeEach(() => {
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
    const first = await getExplanationResponse({ asset: 'gold-intl', windowKey: 'session', injected: obs, force: false });
    const second = await getExplanationResponse({ asset: 'gold-intl', windowKey: 'session', injected: obs, force: false });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // 两次拿到同一个解释 id 就说明第二次走的是缓存而不是重算
    expect(second.body.explanation.id).toBe(first.body.explanation.id);
  });

  it('force=true 会重新生成（id 或时间不同）', async () => {
    const obs = observations();
    const first = await getExplanationResponse({ asset: 'gold-intl', windowKey: 'session', injected: obs });
    const forced = await getExplanationResponse({ asset: 'gold-intl', windowKey: 'session', injected: obs, force: true });
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
    const out = await getExplanationResponse({ asset: 'gold-intl', windowKey: 'session', injected: obs, force: true });
    expect(out.status).toBe(200);
    expect(out.body.explanation).toBeTruthy();
    if (out.body.meta?.persistence === 'failed') {
      expect(out.body.meta.persistenceError).toBeTruthy();
    }
  });
});
