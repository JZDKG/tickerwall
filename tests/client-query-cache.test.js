/* ================================================================== *
 * 请求状态与数据缓存（方案 E07 / §8）
 *
 * 五个字段（data / fetchedAt / error / refreshStatus / inflight）拆开的意义：
 * 「有数据但这次刷新失败」必须有地方表达，否则界面只能在「空白」和「装作
 * 正常」之间二选一。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { ApiError, ApiErrorKind, createApi } from '../src/client/shared/api.js';
import { createQueryCache, describeRefresh, formatAge } from '../src/client/shared/query-cache.js';

// api 与 cache 共用同一个时钟：fetchedAt 由 api 记录，缓存按它判断新鲜度
const okApi = (payload, { delay = 0, now } = {}) =>
  createApi({
    ...(now ? { now } : {}),
    fetchImpl: async () => {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { ok: true, status: 200, json: async () => payload };
    },
  });

describe('取数与状态', () => {
  it('成功后 data / fetchedAt 就位，refreshStatus=idle', async () => {
    const cache = createQueryCache({ api: okApi({ ok: true, v: 1 }, { now: () => 1000 }), now: () => 1000 });
    const snap = await cache.fetchKey('quotes', { path: 'api/quotes' });
    expect(snap.data).toEqual({ ok: true, v: 1 });
    expect(snap.fetchedAt).toBe(1000);
    expect(snap.refreshStatus).toBe('idle');
    expect(snap.error).toBeNull();
  });

  it('maxAgeMs 内复用缓存，不重复请求', async () => {
    let calls = 0;
    let t = 0;
    const api = createApi({
      now: () => t,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => ({ ok: true, n: calls }) };
      },
    });
    const cache = createQueryCache({ api, now: () => t });
    await cache.fetchKey('q', { path: 'api/q', maxAgeMs: 100 });
    t = 50;
    await cache.fetchKey('q', { path: 'api/q', maxAgeMs: 100 });
    expect(calls).toBe(1);
    t = 200;
    await cache.fetchKey('q', { path: 'api/q', maxAgeMs: 100 });
    expect(calls).toBe(2);
  });

  it('同键并发只发一次请求', async () => {
    let calls = 0;
    const api = createApi({
      fetchImpl: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });
    const cache = createQueryCache({ api });
    await Promise.all([cache.fetchKey('k', { path: 'api/k' }), cache.fetchKey('k', { path: 'api/k' })]);
    expect(calls).toBe(1);
  });
});

describe('失败不覆盖数据', () => {
  it('刷新失败：data 保留，refreshStatus=failed，error 带原因', async () => {
    let fail = false;
    const api = createApi({
      fetchImpl: async () => {
        if (fail) throw new Error('offline');
        return { ok: true, status: 200, json: async () => ({ ok: true, v: 'good' }) };
      },
    });
    const cache = createQueryCache({ api });
    await cache.fetchKey('k', { path: 'api/k' });
    fail = true;
    const snap = await cache.fetchKey('k', { path: 'api/k', force: true });
    expect(snap.data).toEqual({ ok: true, v: 'good' });
    expect(snap.refreshStatus).toBe('failed');
    expect(snap.error.kind).toBe(ApiErrorKind.network);
  });

  it('主动取消不算刷新失败（视图自己的决定）', async () => {
    const api = createApi({
      fetchImpl: (url, { signal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    });
    const cache = createQueryCache({ api });
    const p = cache.fetchKey('k', { path: 'api/k' });
    api.cancel();
    const snap = await p;
    expect(snap.refreshStatus).toBe('idle');
    expect(snap.error).toBeNull();
  });

  it('第一次就失败：data 为 null，仍能读出 failed', async () => {
    const api = createApi({
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    const cache = createQueryCache({ api });
    const snap = await cache.fetchKey('k', { path: 'api/k' });
    expect(snap.data).toBeNull();
    expect(snap.refreshStatus).toBe('failed');
    expect(snap.error.status).toBe(503);
  });
});

describe('订阅', () => {
  it('订阅立即收到当前快照，之后状态变化会再通知', async () => {
    const cache = createQueryCache({ api: okApi({ ok: true }) });
    const seen = [];
    const off = cache.subscribe('k', (s) => seen.push(s.refreshStatus));
    expect(seen).toEqual(['idle']);
    await cache.fetchKey('k', { path: 'api/k' });
    expect(seen).toContain('pending');
    expect(seen[seen.length - 1]).toBe('idle');
    off();
    const before = seen.length;
    await cache.fetchKey('k', { path: 'api/k', force: true });
    expect(seen.length).toBe(before);
  });

  it('快照是拷贝：后续刷新不会改掉视图手里的对象', async () => {
    let n = 0;
    const api = createApi({
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, n: ++n }) }),
    });
    const cache = createQueryCache({ api });
    const first = await cache.fetchKey('k', { path: 'api/k' });
    await cache.fetchKey('k', { path: 'api/k', force: true });
    expect(first.data.n).toBe(1);
    expect(cache.peek('k').data.n).toBe(2);
  });
});

describe('seed / invalidate', () => {
  it('seed 可以直接塞入已有数据（首屏内联）', () => {
    const cache = createQueryCache({ api: okApi({ ok: true }) });
    const snap = cache.seed('k', { ok: true, v: 9 }, 1234);
    expect(snap.data.v).toBe(9);
    expect(snap.fetchedAt).toBe(1234);
    expect(cache.peek('k').refreshStatus).toBe('idle');
  });

  it('invalidate 清掉数据但保留键（下次会重新拉）', async () => {
    const cache = createQueryCache({ api: okApi({ ok: true }) });
    await cache.fetchKey('k', { path: 'api/k' });
    cache.invalidate('k');
    expect(cache.peek('k').data).toBeNull();
    expect(cache.keys()).toEqual(['k']);
  });

  it('invalidate() 不带参数清空全部', async () => {
    const cache = createQueryCache({ api: okApi({ ok: true }) });
    await cache.fetchKey('a', { path: 'api/a' });
    await cache.fetchKey('b', { path: 'api/b' });
    cache.invalidate();
    expect(cache.peek('a').data).toBeNull();
    expect(cache.peek('b').data).toBeNull();
  });

  it('没有 api 时直接拒绝（不给出一个永远返回空的对象）', () => {
    expect(() => createQueryCache({})).toThrow(/api/);
  });
});

describe('界面文案', () => {
  it('四种状态给出不同说法，不会把「刷新失败」说成「已更新」', () => {
    expect(describeRefresh({ refreshStatus: 'pending' })).toMatchObject({ tone: 'progress' });
    expect(describeRefresh({ refreshStatus: 'idle', fetchedAt: null })).toMatchObject({ tone: 'muted' });
    expect(describeRefresh({ refreshStatus: 'idle', fetchedAt: Date.now() - 5000 })).toMatchObject({ tone: 'ok' });

    const failed = describeRefresh({
      refreshStatus: 'failed',
      error: new ApiError(ApiErrorKind.timeout, 'timeout'),
      fetchedAt: Date.now() - 120_000,
      now: Date.now(),
    });
    expect(failed.tone).toBe('error');
    expect(failed.text).toContain('请求超时');
    expect(failed.text).toContain('2 分钟');
  });

  it('业务错误显示接口自己的文案（不覆盖成通用错误）', () => {
    const d = describeRefresh({
      refreshStatus: 'failed',
      error: new ApiError(ApiErrorKind.business, '证据不足', { code: 'INSUFFICIENT' }),
      fetchedAt: null,
    });
    expect(d.text).toContain('证据不足');
    expect(d.text).toContain('暂无可用数据');
  });

  it('formatAge 粗粒度足够（秒 / 分钟 / 小时）', () => {
    expect(formatAge(3_000)).toBe('3 秒');
    expect(formatAge(120_000)).toBe('2 分钟');
    expect(formatAge(3 * 3600_000)).toBe('3 小时');
    expect(formatAge(-5)).toBe('0 秒');
  });
});

describe('边角分支', () => {
  it('api 抛的不是 ApiError 也能归一成 network 类（不让视图拿到随机错误形状）', async () => {
    const api = {
      get: async () => {
        throw new Error('weird');
      },
    };
    const cache = createQueryCache({ api });
    const snap = await cache.fetchKey('k', { path: 'api/k' });
    expect(snap.refreshStatus).toBe('failed');
    expect(snap.error).toBeInstanceOf(ApiError);
    expect(snap.error.kind).toBe(ApiErrorKind.network);
  });

  it('api 没给 fetchedAt 时用本地时钟兜底', async () => {
    const api = { get: async () => ({ data: { ok: true } }) };
    const cache = createQueryCache({ api, now: () => 777 });
    const snap = await cache.fetchKey('k', { path: 'api/k' });
    expect(snap.fetchedAt).toBe(777);
  });

  it('业务错误也算刷新失败（不是「有数据就算成功」）', async () => {
    const api = createApi({
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: '证据不足' }) }),
    });
    const cache = createQueryCache({ api });
    const snap = await cache.fetchKey('k', { path: 'api/k' });
    expect(snap.refreshStatus).toBe('failed');
    expect(snap.error.kind).toBe(ApiErrorKind.business);
  });

  it('describeRefresh 对 http / parse 也给可读原因', () => {
    expect(describeRefresh({ refreshStatus: 'failed', error: new ApiError(ApiErrorKind.http, 'x', { status: 502 }), fetchedAt: null }).text).toContain('502');
    expect(describeRefresh({ refreshStatus: 'failed', error: new ApiError(ApiErrorKind.parse, 'x'), fetchedAt: null }).text).toContain('请求失败');
  });
});
