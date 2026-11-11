/* ================================================================== *
 * B10 回归：系统维护路由必须被 await
 *
 * 故障形态：handleSystemRoutes 里 `void handleMaintenanceBackup(...)` 发完就走，
 * handleSystemRoutes 同步返回 true，createApp 也没 await —— 备份还在写，
 * 请求就结束了；异常会变成未处理的 Promise 拒绝。
 * ================================================================== */

import { describe, it, expect, vi, afterEach } from 'vitest';

const state = vi.hoisted(() => ({ resolver: null, calls: [] }));

vi.mock('../src/server/db/maintenance.js', () => ({
  createBackup: vi.fn(async (dir) => {
    state.calls.push(dir);
    await new Promise((resolve) => { state.resolver = resolve; });
    return { dir, manifest: { files: [] } };
  }),
}));

import { handleSystemRoutes } from '../src/server/routes/system.js';

const fakeRes = () => ({
  status: null,
  body: null,
  writeHead(code) { this.status = code; return this; },
  end(text) { this.body = text; return this; },
  setHeader() {},
});

const deps = { ttlMs: 1, jobs: () => [], maintenance: true, method: 'POST' };

afterEach(() => {
  state.calls.length = 0;
  state.resolver = null;
});

describe('B10：handleSystemRoutes 是异步且等待备份完成', () => {
  it('所有分支都返回 Promise（await 才有意义）', async () => {
    const handled = handleSystemRoutes(new URL('http://x/api/health'), fakeRes(), deps);
    expect(handled).toBeInstanceOf(Promise);
    expect(await handled).toBe(true);
  });

  it('维护备份：await 之后响应体已经写完（不是发出去就返回）', async () => {
    const res = fakeRes();
    const url = new URL('http://x/api/maintenance/backup?out=/tmp/tickerwall-b10-test');
    const pending = handleSystemRoutes(url, res, deps);
    // 备份还没结束：此时不该已经写出 200
    expect(res.status).toBeNull();
    // createBackup 是动态 import 进来的，等它被真正调用、把 resolver 挂上再放行
    for (let i = 0; i < 20 && !state.resolver; i += 1) await new Promise((r) => setTimeout(r, 0));
    expect(typeof state.resolver).toBe('function');
    state.resolver();
    const handled = await pending;
    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(state.calls).toHaveLength(1);
  });

  it('createApp 里 await handleSystemRoutes（源码契约）', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/server/app.js', import.meta.url)), 'utf8');
    expect(src).toContain('await handleSystemRoutes(');
  });
});
