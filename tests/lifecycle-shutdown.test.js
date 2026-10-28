/* ================================================================== *
 * 优雅停机（server/lifecycle.js）
 *
 * 这条路径的每一条分支都关于「进程能不能干净退出」：
 *   · 重复触发不能跑两遍（第二次要直接返回 alreadyRunning）；
 *   · 先关服务再落盘（否则最后一个请求的写入会丢）；
 *   · 落盘失败也要退出（卡住不退出比丢两秒数据更糟）；
 *   · exit 是注入的，测试里不能真的杀进程。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { installShutdown } from '../src/server/lifecycle.js';

const makeDeps = (over = {}) => {
  const order = [];
  const server = {
    close: (cb) => { order.push('close'); cb?.(); },
  };
  return {
    order,
    server,
    stopBackground: () => { order.push('stopBackground'); },
    exit: vi.fn((code) => { order.push(`exit:${code}`); }),
    log: { info: () => {}, warn: () => {}, error: () => {} },
    ...over,
  };
};

describe('停机顺序', () => {
  it('先停后台任务、再关服务、最后退出（顺序错了会丢最后一个请求）', async () => {
    // 真实现的第 2 步要求 server.listening 为真才会 close()；假对象要声明它在监听
    const d = makeDeps({ server: { listening: true, close: (cb) => { d.order.push('close'); cb?.(); } } });
    const h = installShutdown({ server: d.server, stopBackground: d.stopBackground, exit: d.exit, log: d.log, drainMs: 0 });
    await h.shutdown('SIGTERM');
    expect(d.order.indexOf('stopBackground')).toBeLessThan(d.order.indexOf('close'));
    expect(d.order[d.order.length - 1]).toBe('exit:0');
    h.remove();
  });

  it('服务本来就没在监听时跳过 close（不假装关过一次）', async () => {
    const d = makeDeps({ server: { listening: false, close: (cb) => { d.order.push('close'); cb?.(); } } });
    const h = installShutdown({ server: d.server, stopBackground: d.stopBackground, exit: d.exit, log: d.log, drainMs: 0 });
    const out = await h.shutdown('SIGTERM');
    expect(d.order).not.toContain('close');
    expect(out.closeResult).toBe('not-listening');
    h.remove();
  });

  it('重复触发直接返回 alreadyRunning（不会跑两遍）', async () => {
    const d = makeDeps();
    const h = installShutdown({ server: d.server, stopBackground: d.stopBackground, exit: d.exit, log: d.log, drainMs: 0 });
    const first = h.shutdown('SIGTERM');
    const second = await h.shutdown('SIGINT');
    await first;
    expect(second.alreadyRunning).toBe(true);
    h.remove();
  });

  it('shuttingDown 标记在开始时就置真（防止重入期间的请求又被接收）', async () => {
    const d = makeDeps();
    const h = installShutdown({ server: d.server, stopBackground: d.stopBackground, exit: d.exit, log: d.log, drainMs: 0 });
    expect(h.shuttingDown).toBe(false);
    const p = h.shutdown('SIGTERM');
    expect(h.shuttingDown).toBe(true);
    await p;
    h.remove();
  });

  it('返回关停与落盘的结果（调用方据此记录日志）', async () => {
    const d = makeDeps();
    const h = installShutdown({ server: d.server, stopBackground: d.stopBackground, exit: d.exit, log: d.log, drainMs: 0 });
    const out = await h.shutdown('SIGTERM');
    expect(out).toHaveProperty('closeResult');
    expect(out).toHaveProperty('flushResult');
    h.remove();
  });

  it('落盘抛错也要退出（卡住不退出比丢两秒数据更糟）', async () => {
    const d = spawnWithFlushError();
    const h = installShutdown({ server: d.server, stopBackground: d.stopBackground, exit: d.exit, log: d.log, drainMs: 0 });
    await expect(h.shutdown('SIGTERM')).resolves.toBeTruthy();
    expect(d.exit).toHaveBeenCalled();
    h.remove();
  });

  it('remove 之后信号监听器被摘掉（测试之间不互相污染）', () => {
    const before = process.listenerCount('SIGTERM');
    const d = makeDeps();
    const h = installShutdown({ server: d.server, stopBackground: d.stopBackground, exit: d.exit, log: d.log });
    expect(process.listenerCount('SIGTERM')).toBeGreaterThan(before);
    h.remove();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });

  it('服务关闭回调没被调用也不无限等待（有 drainMs 上限）', async () => {
    const d = makeDeps({
      server: { close: () => { /* 永不回调 */ } },
    });
    const h = installShutdown({ server: d.server, stopBackground: d.stopBackground, exit: d.exit, log: d.log, drainMs: 20 });
    const out = await Promise.race([
      h.shutdown('SIGTERM'),
      new Promise((r) => setTimeout(() => r('timeout'), 500)),
    ]);
    expect(out).not.toBe('timeout');
    h.remove();
  });
});

function spawnWithFlushError() {
  const order = [];
  return {
    order,
    server: { close: (cb) => { order.push('close'); cb?.(); } },
    stopBackground: () => {
      order.push('stopBackground');
      throw new Error('flush failed');
    },
    exit: vi.fn((code) => { order.push(`exit:${code}`); }),
    log: { info: () => {}, warn: () => {}, error: () => {} },
  };
}
