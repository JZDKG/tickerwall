/* ================================================================== *
 * 预期台账接口（产品 2.4）
 *
 * 路由只做 limit 的参数归一：0 或非数字退回默认，不让 ?limit=0 把屏刷空。
 * 判定口径在 domain，这里验「接口不改变结论」。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/server/app.js';

let app;

const ledger = (limit) => ({
  ok: true,
  status: 'ok',
  checkedAt: '2026-10-28T12:00:00.000Z',
  total: limit,
  counts: { above: 0, below: 0, inLine: 0, pending: 0, undetermined: 0 },
  released: [],
  pending: [],
  deviated: [],
});

const fakeRes = () => {
  const out = { status: null, body: null };
  return {
    out,
    writeHead(status) {
      out.status = status;
    },
    end(payload) {
      out.body = payload ? JSON.parse(payload) : null;
    },
    get headersSent() {
      return out.status != null;
    },
    setHeader() {},
    destroy() {},
  };
};

const call = async (url) => {
  const res = fakeRes();
  await app({ method: 'GET', url, headers: { host: 'localhost' } }, res);
  return { status: res.out.status, json: async () => res.out.body };
};

beforeEach(() => {
  app = createApp({
    getExpectationLedger: async ({ limit }) => ledger(limit),
    getGoldComparison: async () => ({ ok: true }),
    getCalendar: async () => ({ ok: true }),
  });
});

afterEach(() => {
  app = null;
});

describe('GET /api/expectations', () => {
  it('默认 limit 是 12', async () => {
    const res = await call('/api/expectations');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(12);
  });

  it('合法 limit 透传', async () => {
    const body = await (await call('/api/expectations?limit=5')).json();
    expect(body.total).toBe(5);
  });

  it('limit=0 退回默认（不让它把屏刷空）', async () => {
    const body = await (await call('/api/expectations?limit=0')).json();
    expect(body.total).toBe(12);
  });

  it('limit 不是数字也退回默认', async () => {
    const body = await (await call('/api/expectations?limit=abc')).json();
    expect(body.total).toBe(12);
  });

  it('limit 过大时封顶 30（防止一次要一整年的日历）', async () => {
    const body = await (await call('/api/expectations?limit=999')).json();
    expect(body.total).toBe(30);
  });
});
