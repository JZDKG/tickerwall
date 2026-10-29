/* ================================================================== *
 * 统一取数出口（shared/fetch-json.js）
 *
 * 它存在的理由：5 处 `fetchImpl ?? fetch` 的「伪消除」写法让生产路径
 * 绕过了 shared/api.js —— grep 'fetch(' 搜不到，但超时/取消/去重全失效。
 * 这里把两条路径都钉住：注入走 fetchImpl（测试），否则走 api.get（生产）。
 * ================================================================== */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getJson, getJsonWithStatus } from '../src/client/shared/fetch-json.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const okJson = (data, status = 200) => ({ ok: true, status, json: async () => data });

describe('getJson：注入路径', () => {
  it('拼出 ./api/... 的旧 URL 形状（与迁移前逐字节一致）', async () => {
    const seen = [];
    const out = await getJson('api/x', { query: 'a=1&b=2', fetchImpl: async (u) => { seen.push(u); return okJson({ v: 1 }); } });
    expect(seen[0]).toBe('./api/x?a=1&b=2');
    expect(out).toEqual({ v: 1 });
  });

  it('params 会被编码进 query', async () => {
    const seen = [];
    await getJson('api/y', { params: { force: 1 }, fetchImpl: async (u) => { seen.push(u); return okJson({}); } });
    expect(seen[0]).toBe('./api/y?force=1');
  });

  it('没有 query 时不留问号', async () => {
    const seen = [];
    await getJson('api/z', { fetchImpl: async (u) => { seen.push(u); return okJson({}); } });
    expect(seen[0]).toBe('./api/z');
  });
});

describe('getJson：失败一律返回 null（不抛）', () => {
  it('HTTP 非 2xx → null', async () => {
    expect(await getJson('api/x', { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) })).toBeNull();
  });

  it('fetch 抛错 → null', async () => {
    expect(await getJson('api/x', { fetchImpl: async () => { throw new Error('boom'); } })).toBeNull();
  });

  it('json 解析失败 → null', async () => {
    expect(await getJson('api/x', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }) })).toBeNull();
  });

  it('返回 null 的响应对象 → null', async () => {
    expect(await getJson('api/x', { fetchImpl: async () => null })).toBeNull();
  });
});

describe('getJson：生产路径走共享 api', () => {
  it('没传 fetchImpl 时用全局 fetch（经 api.get），并返回 data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ v: 2 })));
    expect(await getJson('api/prod')).toEqual({ v: 2 });
  });

  it('生产路径失败也返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    expect(await getJson('api/prod-fail')).toBeNull();
  });
});

describe('getJsonWithStatus', () => {
  it('注入路径带回 status 与 body', async () => {
    const out = await getJsonWithStatus('api/e', { query: 'a=1', fetchImpl: async () => okJson({ ok: true }, 201) });
    expect(out).toEqual({ status: 201, body: { ok: true } });
  });

  it('body 不是 JSON 时给空对象（不抛）', async () => {
    const out = await getJsonWithStatus('api/e', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }) });
    expect(out).toEqual({ status: 200, body: {} });
  });

  it('注入路径抛错 → 503 + 错误文案', async () => {
    const out = await getJsonWithStatus('api/e', { fetchImpl: async () => { throw new Error('down'); } });
    expect(out.status).toBe(503);
    expect(out.body.error).toContain('down');
  });

  it('生产路径带回 status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: true }, 200)));
    const out = await getJsonWithStatus('api/e-prod');
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true });
  });

  it('生产路径 4xx → 带 http 状态', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const out = await getJsonWithStatus('api/e-404');
    expect(out.status).toBe(404);
    expect(out.body.ok).toBe(false);
  });
});

/* ================================================================== *
 * 剩余分支：默认值与「有 params 但没 query」的组合
 *
 * 这些不是畸形输入 —— 全是正常调用形态：
 *   · 只传 params 的注入调用（要按 params 拼 query）；
 *   · body 为 null 时给 {}；
 *   · api 抛的是没有 status 的错误（网络层错误）。
 * ================================================================== */
describe('默认值与组合形态', () => {
  it('getJsonWithStatus 只传 params 时按 params 拼 query', async () => {
    const seen = [];
    const out = await getJsonWithStatus('api/p', {
      params: { with: 'abc' },
      fetchImpl: async (u) => { seen.push(u); return okJson({ ok: true }, 200); },
    });
    expect(seen[0]).toBe('./api/p?with=abc');
    expect(out.status).toBe(200);
  });

  it('getJsonWithStatus 注入路径 body 为 null → 空对象', async () => {
    const out = await getJsonWithStatus('api/p', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => null }) });
    expect(out.body).toEqual({});
  });

  it('getJson 生产路径 data 为 null → 返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => null })));
    expect(await getJson('api/null-data')).toBeNull();
  });

  it('getJsonWithStatus 生产路径 data 为 null → body 是空对象', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => null })));
    const out = await getJsonWithStatus('api/null-data2');
    expect(out.body).toEqual({});
  });

  it('api 抛出的错误没有 status 时按 503', async () => {
    // 网络层错误（ApiError(kind=network)）没有 status 字段
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const out = await getJsonWithStatus('api/offline');
    expect(out.status).toBe(503);
  });

  it('错误对象没有 message 时也能给出字符串（不出现 undefined）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw { code: 'X' }; }));
    const out = await getJsonWithStatus('api/weird');
    expect(typeof out.body.error).toBe('string');
  });
});
