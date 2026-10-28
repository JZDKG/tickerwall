/* ================================================================== *
 * 客户端请求层（方案 E07 / §8）
 *
 * 十个视图各自写 fetch 时，四种失败（断网 / 超时 / 非 2xx / body.ok=false）
 * 的处理方式各不相同。这里把「错误怎么分类、并发怎么合并、取消怎么生效」
 * 钉死，视图才能只写一种分支。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { ApiError, ApiErrorKind, buildUrl, createApi } from '../src/client/shared/api.js';

const jsonResponse = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('URL 拼装', () => {
  it('跳过 null / undefined / 空串，其余转成字符串', () => {
    expect(buildUrl('api/x', { a: 1, b: null, c: undefined, d: '', e: false })).toBe('api/x?a=1&e=false');
  });

  it('值会被编码（中文与特殊字符）', () => {
    expect(buildUrl('api/x', { q: '国际 金价&x' })).toBe(`api/x?q=${encodeURIComponent('国际 金价&x')}`);
  });

  it('没有参数时不加问号；绝对 URL 保留 origin', () => {
    expect(buildUrl('api/x')).toBe('api/x');
    expect(buildUrl('https://a.test/api/x', { a: 1 })).toBe('https://a.test/api/x?a=1');
  });
});

describe('错误分类', () => {
  const api = (fetchImpl) => createApi({ base: './', fetchImpl });

  it('网络错误 → kind=network，且可重试', async () => {
    const err = await api(async () => {
      throw new TypeError('Failed to fetch');
    })
      .get('api/x')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe(ApiErrorKind.network);
    expect(err.retryable).toBe(true);
  });

  it('超时 → kind=timeout（而不是笼统的网络错误）', async () => {
    const err = await api((url, { signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    })
      .get('api/slow', { timeoutMs: 10 })
      .catch((e) => e);
    expect(err.kind).toBe(ApiErrorKind.timeout);
    expect(err.message).toContain('超时');
    expect(err.retryable).toBe(true);
  });

  it('非 2xx → kind=http，带状态码；5xx 可重试、4xx 不可', async () => {
    const e500 = await api(async () => jsonResponse({ error: 'boom' }, { status: 500 })).get('api/x').catch((e) => e);
    expect(e500.kind).toBe(ApiErrorKind.http);
    expect(e500.status).toBe(500);
    expect(e500.retryable).toBe(true);

    const e400 = await api(async () => jsonResponse({ error: 'bad' }, { status: 400 })).get('api/x').catch((e) => e);
    expect(e400.retryable).toBe(false);
  });

  it('响应不是 JSON → kind=parse（不抛一个看不懂的 SyntaxError）', async () => {
    const err = await api(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }))
      .get('api/x')
      .catch((e) => e);
    expect(err.kind).toBe(ApiErrorKind.parse);
  });

  it('200 但 body.ok=false → kind=business，带业务码且不自动重试', async () => {
    const err = await api(async () => jsonResponse({ ok: false, error: '证据不足', code: 'INSUFFICIENT' }))
      .get('api/x')
      .catch((e) => e);
    expect(err.kind).toBe(ApiErrorKind.business);
    expect(err.code).toBe('INSUFFICIENT');
    expect(err.message).toBe('证据不足');
    expect(err.retryable).toBe(false);
  });
});

describe('并发与取消', () => {
  it('同 URL 并发只发一次请求', async () => {
    let calls = 0;
    const api = createApi({
      fetchImpl: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse({ ok: true, n: calls });
      },
    });
    const [a, b] = await Promise.all([api.get('api/x'), api.get('api/x')]);
    expect(calls).toBe(1);
    expect(a.data.n).toBe(1);
    expect(b.data.n).toBe(1);
  });

  it('不同参数视为不同请求', async () => {
    let calls = 0;
    const api = createApi({
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ ok: true });
      },
    });
    await Promise.all([api.get('api/x', { params: { a: 1 } }), api.get('api/x', { params: { a: 2 } })]);
    expect(calls).toBe(2);
  });

  it('cancel() 让挂起请求以 aborted 结束（切资产时旧响应不该覆盖新选择）', async () => {
    const api = createApi({
      fetchImpl: (url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    const pending = api.get('api/detail/gold-intl').catch((e) => e);
    expect(api.inflightSize()).toBe(1);
    api.cancel('api/detail/gold-intl');
    const err = await pending;
    expect(err.kind).toBe(ApiErrorKind.aborted);
    expect(api.inflightSize()).toBe(0);
  });

  it('cancel() 不带参数取消全部（卸载视图时用）', async () => {
    const api = createApi({
      fetchImpl: (url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    const p1 = api.get('api/a').catch((e) => e);
    const p2 = api.get('api/b').catch((e) => e);
    api.cancel();
    expect((await p1).kind).toBe(ApiErrorKind.aborted);
    expect((await p2).kind).toBe(ApiErrorKind.aborted);
    expect(api.inflightSize()).toBe(0);
  });

  it('请求失败后不会把 inflight 卡住（下一次还能发）', async () => {
    let calls = 0;
    const api = createApi({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new Error('down');
        return jsonResponse({ ok: true });
      },
    });
    await api.get('api/x').catch(() => {});
    expect(api.inflightSize()).toBe(0);
    const ok = await api.get('api/x');
    expect(ok.data.ok).toBe(true);
    expect(calls).toBe(2);
  });
});

describe('返回值', () => {
  it('带上 status 与 fetchedAt（供视图判断新鲜度）', async () => {
    const api = createApi({ fetchImpl: async () => jsonResponse({ ok: true, v: 1 }), now: () => 1234 });
    const r = await api.get('api/x');
    expect(r.status).toBe(200);
    expect(r.fetchedAt).toBe(1234);
    expect(r.data.v).toBe(1);
  });

  it('json:false 时返回文本（给非 JSON 端点）', async () => {
    const api = createApi({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'plain' }) });
    const r = await api.get('api/x', { json: false });
    expect(r.data).toBe('plain');
  });
});

/* ================================================================== *
 * 边角分支：这些地方错了不会抛异常，只会让「取消/业务错误」悄悄失效
 * ================================================================== */
describe('边角分支', () => {
  it('body.ok=false 但没写 error 字段 → 用默认文案（不显示 undefined）', async () => {
    const api = createApi({ fetchImpl: async () => jsonResponse({ ok: false }) });
    const err = await api.get('api/x').catch((e) => e);
    expect(err.kind).toBe(ApiErrorKind.business);
    expect(err.message).toBe('接口返回失败');
    expect(err.code).toBeNull();
  });

  it('cancel 传入绝对 URL 也能命中（内部按同一套规则建键）', async () => {
    const api = createApi({
      base: 'https://a.test/',
      fetchImpl: (url, { signal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    });
    const p = api.get('api/x').catch((e) => e);
    api.cancel('https://a.test/api/x');
    expect((await p).kind).toBe(ApiErrorKind.aborted);
  });

  it('取消一个不存在的请求是空操作（卸载钩子不该因为没请求而报错）', () => {
    const api = createApi({ fetchImpl: async () => jsonResponse({ ok: true }) });
    expect(() => api.cancel('api/nothing')).not.toThrow();
  });

  it('超时不会误判成网络错误：signal.reason 是 timeout', async () => {
    const api = createApi({
      fetchImpl: (url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('x')));
        }),
      timeoutMs: 5,
    });
    const err = await api.get('api/x').catch((e) => e);
    expect(err.kind).toBe(ApiErrorKind.timeout);
    expect(err.retryable).toBe(true);
  });
});

describe('默认参数与兜底', () => {
  it('默认用全局 fetch（不注入 fetchImpl 时也能工作）', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => jsonResponse({ ok: true, via: 'global' });
    try {
      const api = createApi();
      const r = await api.get('api/x');
      expect(r.data.via).toBe('global');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('timeoutMs=0 表示不设超时（长轮询场景）', async () => {
    const api = createApi({
      timeoutMs: 0,
      fetchImpl: async () => jsonResponse({ ok: true }),
    });
    const r = await api.get('api/x');
    expect(r.status).toBe(200);
  });

  it('base 带路径时前缀会被保留（绝对 base）', () => {
    expect(buildUrl('/srv/api/x', { a: 1 })).toBe('/srv/api/x?a=1');
  });

  it('已经带查询串的 base 与 params 合并（不丢原参数）', () => {
    expect(buildUrl('api/x?keep=1', { a: 2 })).toBe('api/x?keep=1&a=2');
  });
});
