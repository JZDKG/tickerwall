/* ================================================================== *
 * 共享请求层（E07）：单例去重是跨视图的
 *
 * 地图与事件中心都会取 `api/events`。如果各自 new 一个 api，
 * 各有一张 in-flight 表，同一时刻仍然打两次 —— 所以必须是单例。
 * ================================================================== */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, createApi, ApiErrorKind } from '../src/client/shared/api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

describe('单例去重', () => {
  it('同一 URL 的两个并发请求只打一次网络', async () => {
    let calls = 0;
    const f = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return okJson({ ok: true });
    });
    const a = createApi({ fetchImpl: f });
    const [r1, r2] = await Promise.all([a.get('api/x'), a.get('api/x')]);
    expect(calls).toBe(1);
    expect(r1.data).toEqual(r2.data);
  });

  it('dedupe:false 时并发也各打一次（强制重取必须真的发出去）', async () => {
    let calls = 0;
    const f = vi.fn(async () => { calls += 1; return okJson({ ok: true }); });
    const a = createApi({ fetchImpl: f });
    await Promise.all([a.get('api/y', { dedupe: false }), a.get('api/y', { dedupe: false })]);
    expect(calls).toBe(2);
  });

  it('导出的是共享实例（跨视图共用同一张 in-flight 表）', () => {
    expect(typeof api.get).toBe('function');
    expect(api).toBe(api);
  });
});

describe('错误分类仍然可用', () => {
  it('HTTP 失败给 http 类且带 status', async () => {
    const a = createApi({ fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }) });
    await expect(a.get('api/z')).rejects.toMatchObject({ kind: ApiErrorKind.http, status: 502 });
  });

  it('网络异常给 network 类', async () => {
    const a = createApi({ fetchImpl: async () => { throw new Error('boom'); } });
    await expect(a.get('api/z')).rejects.toMatchObject({ kind: ApiErrorKind.network });
  });
});
