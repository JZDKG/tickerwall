/* ================================================================== *
 * AI 路由（src/server/routes/ai.js + app.js 装配）
 *
 * 用假 aiService 验证 HTTP 契约：只放行三个 POST 路径、模型动作分发、
 * 会话 CRUD、ask 的 SSE 帧格式与异常收尾。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../src/server/app.js';

const AS_OF = '2026-11-16T04:00:00.000Z';

function fakeRes() {
  const handlers = new Map();
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    chunks: [],
    writableEnded: false,
    destroyed: false,
    on(event, cb) {
      handlers.set(event, cb);
      return this;
    },
    off(event) {
      handlers.delete(event);
      return this;
    },
    emit(event) {
      handlers.get(event)?.();
    },
    writeHead(code, headers = {}) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(headers)) this.headers[k.toLowerCase()] = v;
      this.headersSent = true;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    write(chunk) {
      this.chunks.push(String(chunk));
      return true;
    },
    end(text) {
      if (text != null) this.chunks.push(String(text));
      this.body = this.chunks.join('');
      this.writableEnded = true;
      this.headersSent = true;
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function fakeReq({ method = 'GET', body = undefined, url = '/', complete = true } = {}) {
  const handlers = new Map();
  return {
    method,
    url,
    headers: { host: 'localhost' },
    body,
    complete,
    on(event, cb) {
      handlers.set(event, cb);
      return this;
    },
    off(event) {
      handlers.delete(event);
      return this;
    },
    emit(event) {
      handlers.get(event)?.();
    },
  };
}

function makeService(overrides = {}) {
  const session = { id: 's1', title: '黄金', modelId: 'm1', createdAt: AS_OF, updatedAt: AS_OF, messages: [] };
  return {
    listModels: vi.fn(() => ({ models: [{ id: 'm1', name: '本地' }], envPreset: null })),
    saveModel: vi.fn((input) => ({ id: 'm1', name: input.name ?? '模型' })),
    removeModel: vi.fn((id) => id === 'm1'),
    setDefaultModel: vi.fn((id) => id === 'm1'),
    testModel: vi.fn(async () => ({ ok: true, latencyMs: 3, model: 'qwen3', reply: 'pong' })),
    listSessions: vi.fn(() => [session]),
    getSession: vi.fn((id) => (id === 's1' ? session : null)),
    createSession: vi.fn(() => session),
    removeSession: vi.fn((id) => id === 's1'),
    ask: vi.fn(async (input, emit) => {
      emit({ type: 'session', session });
      emit({ type: 'delta', text: '答案' });
      const message = { id: 'msg1', sessionId: 's1', role: 'assistant', content: '答案' };
      emit({ type: 'done', sessionId: 's1', message, usage: { totalTokens: 3 } });
      return { sessionId: 's1', message, usage: { totalTokens: 3 } };
    }),
    ...overrides,
  };
}

function makeApp(service = makeService()) {
  return createApp({
    getQuotes: vi.fn(async () => ({ ok: true, items: [] })),
    buildBriefing: vi.fn(async () => ({ ok: true, items: [] })),
    getDetail: vi.fn(async () => null),
    getMacro: vi.fn(async () => ({ ok: true })),
    getEvents: vi.fn(async () => ({ ok: true, items: [] })),
    getEventHistory: vi.fn(async () => ({ ok: true, items: [] })),
    getEventStudy: vi.fn(async () => ({ ok: true, rows: [] })),
    getCalendar: vi.fn(async () => ({ ok: true, events: [] })),
    aiService: service,
  });
}

const call = async (app, url, { method = 'GET', body } = {}) => {
  const res = fakeRes();
  const req = fakeReq({ method, body, url });
  await app(req, res);
  return { res, req, json: () => JSON.parse(res.body) };
};

const postJson = async (app, url, payload) => call(app, url, { method: 'POST', body: payload });

describe('AI 路由：方法与模型', () => {
  it('GET /api/ai/models 返回模型与 env 预设', async () => {
    const service = makeService();
    const app = makeApp(service);
    const { res, json } = await call(app, '/api/ai/models');
    expect(res.statusCode).toBe(200);
    expect(json()).toMatchObject({ ok: true, models: [{ id: 'm1' }], envPreset: null });
    expect(service.listModels).toHaveBeenCalled();
  });

  it('POST /api/ai/models 保存模型（不再是 405）', async () => {
    const service = makeService();
    const app = makeApp(service);
    const { res, json } = await postJson(app, '/api/ai/models', { name: '本地', protocol: 'openai', baseUrl: 'http://x/v1', model: 'qwen3' });
    expect(res.statusCode).toBe(200);
    expect(service.saveModel).toHaveBeenCalledWith(expect.objectContaining({ name: '本地' }));
    expect(json()).toMatchObject({ ok: true, model: { id: 'm1' } });
  });

  it('POST /api/ai/models 支持 delete / set_default / test', async () => {
    const service = makeService();
    const app = makeApp(service);

    const del = await postJson(app, '/api/ai/models', { action: 'delete', id: 'm1' });
    expect(del.res.statusCode).toBe(200);
    expect(service.removeModel).toHaveBeenCalledWith('m1');

    const setDefault = await postJson(app, '/api/ai/models', { action: 'set_default', id: 'm1' });
    expect(setDefault.res.statusCode).toBe(200);
    expect(service.setDefaultModel).toHaveBeenCalledWith('m1');

    const tested = await postJson(app, '/api/ai/models', { action: 'test', id: 'm1' });
    expect(tested.res.statusCode).toBe(200);
    expect(service.testModel).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    expect(tested.json().result.ok).toBe(true);
  });

  it('POST /api/ai/models 校验失败转 400，缺少 id 也 400', async () => {
    const service = makeService({
      saveModel: vi.fn(() => {
        throw new Error('模型名称不能为空');
      }),
    });
    const app = makeApp(service);
    const invalid = await postJson(app, '/api/ai/models', { protocol: 'bad' });
    expect(invalid.res.statusCode).toBe(400);
    const missingId = await postJson(app, '/api/ai/models', { action: 'delete' });
    expect(missingId.res.statusCode).toBe(400);
    const arrayBody = await postJson(app, '/api/ai/models', []);
    expect(arrayBody.res.statusCode).toBe(400);
  });

  it('POST /api/ai/models action=test 时上游测试失败仍返回 200 + ok:false', async () => {
    const service = makeService({ testModel: vi.fn(async () => ({ ok: false, error: '连接超时' })) });
    const { res, json } = await postJson(makeApp(service), '/api/ai/models', { action: 'test', id: 'm1' });
    expect(res.statusCode).toBe(200);
    expect(json().result).toMatchObject({ ok: false, error: '连接超时' });
  });
});

describe('AI 路由：会话', () => {
  it('GET /api/ai/sessions 与 GET /api/ai/sessions/:id', async () => {
    const app = makeApp();
    const list = await call(app, '/api/ai/sessions');
    expect(list.res.statusCode).toBe(200);
    expect(list.json().sessions).toHaveLength(1);

    const detail = await call(app, '/api/ai/sessions/s1');
    expect(detail.res.statusCode).toBe(200);
    expect(detail.json().session.id).toBe('s1');

    const missing = await call(app, '/api/ai/sessions/nope');
    expect(missing.res.statusCode).toBe(404);
  });

  it('POST /api/ai/sessions 新建或删除', async () => {
    const service = makeService();
    const app = makeApp(service);
    const created = await postJson(app, '/api/ai/sessions', { title: '黄金', modelId: 'm1' });
    expect(created.res.statusCode).toBe(200);
    expect(service.createSession).toHaveBeenCalledWith({ title: '黄金', modelId: 'm1' });

    const deleted = await postJson(app, '/api/ai/sessions', { action: 'delete', id: 's1' });
    expect(deleted.res.statusCode).toBe(200);
    expect(service.removeSession).toHaveBeenCalledWith('s1');
  });
});

describe('AI 路由：ask SSE', () => {
  it('按 event/data 帧输出，并带正确响应头', async () => {
    const service = makeService();
    const app = makeApp(service);
    const { res, json } = await call(app, '/api/ai/ask', {
      method: 'POST',
      body: { question: '黄金怎么看', sessionId: 's1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers.connection).toBe('keep-alive');
    expect(res.writableEnded).toBe(true);

    expect(service.ask).toHaveBeenCalledWith(
      expect.objectContaining({ question: '黄金怎么看', sessionId: 's1', signal: expect.any(AbortSignal) }),
      expect.any(Function),
    );
    const text = res.body;
    expect(text).toContain('event: session\ndata: {"type":"session"');
    expect(text).toContain('event: delta\ndata: {"type":"delta","text":"答案"}');
    expect(text).toContain('event: done\ndata: {"type":"done"');
    expect(text.endsWith('\n\n')).toBe(true);
    expect(() => json()).toThrow();
  });

  it('ask 抛错时发送 event: error 后结束流', async () => {
    const service = makeService({
      ask: vi.fn(async () => {
        throw Object.assign(new Error('模型未配置'), { code: 'MODEL_NOT_CONFIGURED' });
      }),
    });
    const { res } = await call(makeApp(service), '/api/ai/ask', { method: 'POST', body: { question: '黄金' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('event: error');
    expect(res.body).toContain('模型未配置');
    expect(res.body).toContain('MODEL_NOT_CONFIGURED');
    expect(res.writableEnded).toBe(true);
  });

  it('缺少问题时转 400，不打开 SSE', async () => {
    const service = makeService();
    const { res, json } = await call(makeApp(service), '/api/ai/ask', { method: 'POST', body: {} });
    expect(res.statusCode).toBe(400);
    expect(json().error).toContain('问题');
    expect(service.ask).not.toHaveBeenCalled();
  });

  it('请求体不是对象时 400，且不打开 SSE', async () => {
    const service = makeService();
    const { res, json } = await postJson(makeApp(service), '/api/ai/ask', []);
    expect(res.statusCode).toBe(400);
    expect(json().error).toContain('JSON 对象');
    expect(service.ask).not.toHaveBeenCalled();
  });

  it('响应流 close 时 abort 正在进行的 ask', async () => {
    let captured = null;
    const service = makeService({
      ask: vi.fn(
        (input) =>
          new Promise((resolve, reject) => {
            captured = input.signal;
            input.signal.addEventListener(
              'abort',
              () => reject(Object.assign(new Error('已取消'), { code: 'ABORTED' })),
              { once: true },
            );
          }),
      ),
    });
    const res = fakeRes();
    const req = fakeReq({ method: 'POST', body: { question: '黄金' }, url: '/api/ai/ask' });
    const pending = makeApp(service)(req, res);
    await new Promise((resolve) => setImmediate(resolve));
    expect(captured.aborted).toBe(false);

    res.emit('close');
    await pending;

    expect(captured.aborted).toBe(true);
    expect(res.body).toContain('event: error');
    expect(res.writableEnded).toBe(true);
  });

  it('请求体未读完时 req close 会 abort', async () => {
    let captured = null;
    const service = makeService({
      ask: vi.fn(
        (input) =>
          new Promise((resolve, reject) => {
            captured = input.signal;
            input.signal.addEventListener(
              'abort',
              () => reject(Object.assign(new Error('已取消'), { code: 'ABORTED' })),
              { once: true },
            );
          }),
      ),
    });
    const res = fakeRes();
    const req = fakeReq({ method: 'POST', body: { question: '黄金' }, url: '/api/ai/ask', complete: false });
    const pending = makeApp(service)(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    req.emit('close');
    await pending;
    expect(captured.aborted).toBe(true);
    expect(res.body).toContain('event: error');
  });

  it('请求体读完触发的 req close 不会 abort', async () => {
    let captured = null;
    let finish = null;
    const service = makeService({
      ask: vi.fn(
        (input) =>
          new Promise((resolve) => {
            captured = input.signal;
            finish = resolve;
          }),
      ),
    });
    const res = fakeRes();
    const req = fakeReq({ method: 'POST', body: { question: '黄金' }, url: '/api/ai/ask' });
    const pending = makeApp(service)(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    req.emit('close');
    expect(captured.aborted).toBe(false);

    finish({ sessionId: 's1' });
    await pending;
    expect(res.writableEnded).toBe(true);
  });

  it('客户端已销毁时不再写帧', async () => {
    const res = fakeRes();
    res.destroyed = true;
    const req = fakeReq({ method: 'POST', body: { question: '黄金' }, url: '/api/ai/ask' });
    await makeApp()(req, res);
    expect(res.chunks).toEqual([]);
    expect(res.body).toBeNull();
  });

  it('已发 SSE 头后写帧失败时安全结束，不再写 JSON', async () => {
    const res = fakeRes();
    res.write = () => {
      throw new Error('socket gone');
    };
    const service = makeService({
      ask: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const req = fakeReq({ method: 'POST', body: { question: '黄金' }, url: '/api/ai/ask' });
    await expect(makeApp(service)(req, res)).resolves.toBeUndefined();
    expect(res.headersSent).toBe(true);
    expect(res.writableEnded).toBe(true);
    expect(res.body).toBe('');
  });
});

describe('AI 路由：方法与降级', () => {
  it('只放行三个 AI POST 路径，其它 POST 仍 405', async () => {
    const app = makeApp();
    for (const path of ['/api/ai/models', '/api/ai/sessions', '/api/ai/ask']) {
      const { res } = await postJson(app, path, {});
      expect(res.statusCode).not.toBe(405);
    }
    const other = await postJson(app, '/api/ai/unknown', {});
    expect(other.res.statusCode).toBe(405);
    const quotes = await postJson(app, '/api/quotes', {});
    expect(quotes.res.statusCode).toBe(405);
    expect(quotes.res.headers.allow).toBe('GET, HEAD');
  });

  it('未装配 aiService 时返回 503', async () => {
    const { res, json } = await call(makeApp(null), '/api/ai/models');
    expect(res.statusCode).toBe(503);
    expect(json().error).toContain('AI 服务未启用');
  });

  it('未知 AI 子路径返回 404', async () => {
    const { res, json } = await call(makeApp(), '/api/ai/unknown');
    expect(res.statusCode).toBe(404);
    expect(json().error).toContain('未知的 AI 接口');
  });
});
