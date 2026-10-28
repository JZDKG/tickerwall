/* ================================================================== *
 * 关注简报接口（产品 2.3）
 *
 * 关注项存在前端本地，所以 assets / keys / since 都由查询参数带上来。
 * 这一层只做参数解析：逗号分隔、空项丢弃、since 非正数按「没给」处理。
 * ================================================================== */

import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/server/app.js';

const fakeRes = () => {
  const out = { status: null, body: null };
  return {
    out,
    writeHead(s) { out.status = s; },
    end(p) { out.body = p ? JSON.parse(p) : null; },
    get headersSent() { return out.status != null; },
    setHeader() {},
    destroy() {},
  };
};

let app;
let seen;
const call = async (url) => {
  const res = fakeRes();
  await app({ method: 'GET', url, headers: { host: 'localhost' } }, res);
  return { status: res.out.status, body: res.out.body };
};

beforeEach(() => {
  seen = null;
  app = createApp({
    getWatchBrief: async (args) => {
      seen = args;
      return { ok: true, status: 'ok', reason: 'NO_CHANGES', items: [], count: 0 };
    },
    getGoldComparison: async () => ({ ok: true }),
    getCalendar: async () => ({ ok: true }),
  });
});

describe('GET /api/brief', () => {
  it('逗号分隔的 assets 与 keys 被拆开', async () => {
    await call('/api/brief?assets=gold-intl,usdcny&keys=gold-gap,fx-cost');
    expect(seen.assets).toEqual(['gold-intl', 'usdcny']);
    expect(seen.watchedKeys).toEqual(['gold-gap', 'fx-cost']);
  });

  it('空项被丢掉（不会出现空字符串资产）', async () => {
    await call('/api/brief?assets=gold-intl,,&keys=,gold-gap');
    expect(seen.assets).toEqual(['gold-intl']);
    expect(seen.watchedKeys).toEqual(['gold-gap']);
  });

  it('since 合法时透传为数字', async () => {
    await call('/api/brief?assets=gold-intl&keys=gold-gap&since=1761600000000');
    expect(seen.sinceMs).toBe(1761600000000);
  });

  it('since 缺失 / 非数字 / 非正数都按「没给」处理（服务端用自己的默认窗口）', async () => {
    for (const q of ['', '?since=abc', '?since=-1', '?since=0']) {
      await call(`/api/brief?assets=gold-intl&keys=gold-gap${q.replace('?', '&')}`);
      expect(seen.sinceMs).toBeNull();
    }
  });

  it('什么都不带也返回 200（未选关注是正常状态）', async () => {
    const r = await call('/api/brief');
    expect(r.status).toBe(200);
    expect(seen.assets).toEqual([]);
    expect(seen.watchedKeys).toEqual([]);
  });
});
