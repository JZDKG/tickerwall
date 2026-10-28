/* ================================================================== *
 * 应用路由（src/server/app.js）
 *
 * 这些路由以前长在 server.mjs 里，只能靠 spawn 子进程测。抽出来之后可以
 * 直接注入假依赖，逐条断言「参数归一、默认值、404、405、异常」。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { createApp, WRITE_PATHS } from '../src/server/app.js';

/** 极简 res 桩：记录状态码、头与 body */
function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    writeHead(code, headers = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(text) {
      this.body = text;
      this.headersSent = true;
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
  };
  return res;
}

const ok = (payload) => vi.fn(async () => payload);

function makeApp(overrides = {}) {
  const deps = {
    getQuotes: ok({ ok: true, items: [], ttlMs: 15000 }),
    buildBriefing: ok({ ok: true, status: 'collecting', items: [] }),
    getDetail: ok({ ok: true, stats: {} }),
    getMacro: ok({ ok: true, matrix: { ids: [] } }),
    getEvents: ok({ ok: true, items: [] }),
    getEventHistory: ok({ ok: true, items: [] }),
    getEventStudy: ok({ ok: true, rows: [] }),
    getCalendar: ok({ ok: true, events: [] }),
    ttlMs: 15000,
    jobs: () => [{ key: 'quotes' }],
    ...overrides,
  };
  return { app: createApp(deps), deps };
}

const call = async (app, url, { method = 'GET' } = {}) => {
  const res = fakeRes();
  await app({ method, url, headers: { host: 'localhost' } }, res);
  return res;
};

const jsonOf = (res) => {
  try {
    return JSON.parse(res.body);
  } catch {
    return res.body;
  }
};

describe('业务路由', () => {
  it('/api/quotes 透传 force', async () => {
    const { app, deps } = makeApp();
    const res = await call(app, '/api/quotes?force=1');
    expect(res.statusCode).toBe(200);
    expect(deps.getQuotes).toHaveBeenCalledWith({ force: true });
  });

  it('/api/detail/<id> 解出 id；未知标的 404', async () => {
    const { app, deps } = makeApp();
    await call(app, '/api/detail/gold-intl');
    expect(deps.getDetail).toHaveBeenCalledWith('gold-intl', { force: false });

    const missing = makeApp({ getDetail: ok(null) });
    const res = await call(missing.app, '/api/detail/nope');
    expect(res.statusCode).toBe(404);
    expect(jsonOf(res).error).toContain('nope');
  });

  it('/api/macro 的 window / freq 有边界与默认值', async () => {
    const { app, deps } = makeApp();
    await call(app, '/api/macro');
    expect(deps.getMacro).toHaveBeenLastCalledWith(250, 'day', { force: false });

    await call(app, '/api/macro?window=all&freq=week');
    expect(deps.getMacro).toHaveBeenLastCalledWith(0, 'week', { force: false });

    await call(app, '/api/macro?window=1');
    expect(deps.getMacro).toHaveBeenLastCalledWith(20, 'day', { force: false });

    await call(app, '/api/macro?window=99999');
    expect(deps.getMacro).toHaveBeenLastCalledWith(5000, 'day', { force: false });
  });

  it('/api/events 的 limit 有上下限（默认 200，不静默截断）', async () => {
    const { app, deps } = makeApp();
    await call(app, '/api/events');
    expect(deps.getEvents).toHaveBeenLastCalledWith({ force: false, limit: 200 });
    await call(app, '/api/events?limit=5');
    expect(deps.getEvents).toHaveBeenLastCalledWith({ force: false, limit: 10 });
    await call(app, '/api/events?limit=9999');
    expect(deps.getEvents).toHaveBeenLastCalledWith({ force: false, limit: 300 });
  });

  it('/api/events/history 的 hours 夹在 1..48', async () => {
    const { app, deps } = makeApp();
    await call(app, '/api/events/history');
    expect(deps.getEventHistory).toHaveBeenLastCalledWith({ hours: 24 });
    await call(app, '/api/events/history?hours=0');
    expect(deps.getEventHistory).toHaveBeenLastCalledWith({ hours: 1 });
    await call(app, '/api/events/history?hours=999');
    expect(deps.getEventHistory).toHaveBeenLastCalledWith({ hours: 48 });
  });

  it('/api/briefing / /api/eventstudy / /api/calendar 都走对应服务', async () => {
    const { app, deps } = makeApp();
    await call(app, '/api/briefing');
    await call(app, '/api/eventstudy');
    await call(app, '/api/calendar');
    expect(deps.buildBriefing).toHaveBeenCalled();
    expect(deps.getEventStudy).toHaveBeenCalled();
    expect(deps.getCalendar).toHaveBeenCalled();
  });

  it('/api/health 走 system 路由并带队列信息以外的旧字段', async () => {
    const { app } = makeApp();
    const res = await call(app, '/api/health');
    expect(res.statusCode).toBe(200);
    const body = jsonOf(res);
    expect(body.ttlMs).toBe(15000);
    expect(body.jobs).toEqual([{ key: 'quotes' }]);
  });
});

describe('方法与异常', () => {
  it('POST 非维护端点 → 405 且带 Allow 头', async () => {
    const { app, deps } = makeApp();
    const res = await call(app, '/api/quotes', { method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, HEAD');
    expect(deps.getQuotes).not.toHaveBeenCalled();
  });

  it('POST 维护端点被放行（WRITE_PATHS 只到这一个前缀）', async () => {
    const { app } = makeApp();
    const res = await call(app, `${WRITE_PATHS}backup`, { method: 'POST' });
    // 默认关闭（没有 ENABLE_MAINTENANCE_API）→ 404，但**不是** 405
    expect(res.statusCode).toBe(404);
  });

  it('畸形 URL → 400（不是 500，也不能把进程带崩）', async () => {
    const { app } = makeApp();
    const res = fakeRes();
    await app({ method: 'GET', url: '//%', headers: { host: 'localhost' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('业务抛错 → 500 且对外只说通用文案，服务端留日志', async () => {
    const logError = vi.fn();
    const { app } = makeApp({
      getQuotes: async () => {
        throw new Error('内部细节：/Users/someone/secret.db');
      },
      logError,
    });
    const res = await call(app, '/api/quotes');
    expect(res.statusCode).toBe(500);
    expect(jsonOf(res).error).toBe('服务器内部错误');
    expect(res.body).not.toContain('secret.db');
    expect(logError).toHaveBeenCalled();
  });

  it('静态资源回退：非 API 路径交给 serveStatic（404 但不抛）', async () => {
    const { app } = makeApp();
    const res = await call(app, '/definitely-not-here.js');
    expect(res.statusCode).toBe(404);
  });
});
