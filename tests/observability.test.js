/* ================================================================== *
 * 结构化日志与优雅退出（方案 E08 / §9.3）
 *
 * 日志这层的验收标准不是「有输出」，而是：
 *   · 一行一条 JSON，六个关键字段齐全（requestId/jobId/provider/durationMs/result/errorCode）；
 *   · 凭据永不落地（header、查询串里的 token 都要抹掉）；
 *   · 一次请求恰好一条，404 / 500 也不能静默。
 * 退出这层：SIGTERM 时停调度、限时排空、flush、closeDb，且有上限不会卡死。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  REDACTED,
  createLogger,
  newRequestId,
  redactFields,
  redactUrl,
  withRequestLog,
} from '../src/server/observability/log.js';
import { DEFAULT_DRAIN_MS, installShutdown } from '../src/server/lifecycle.js';

const collecting = () => {
  const lines = [];
  return { lines, logger: createLogger({ emit: (l) => lines.push(JSON.parse(l)) }) };
};

describe('脱敏', () => {
  it('URL 里的 token / api_key 被替换，其余参数保留', () => {
    const out = redactUrl('/api/x?a=1&token=SECRET&api_key=K');
    expect(out).toContain('a=1');
    expect(out).not.toContain('SECRET');
    expect(out).not.toContain('K');
    expect(out).toContain(REDACTED);
  });

  it('没有敏感参数时原样返回（不重写 URL 形态）', () => {
    expect(redactUrl('/api/detail/gold-intl?force=1')).toBe('/api/detail/gold-intl?force=1');
  });

  it('字段级脱敏覆盖 header 类键名', () => {
    const out = redactFields({
      authorization: 'Bearer SECRET',
      cookie: 'sid=abc',
      'x-api-key': 'k',
      provider: 'sina',
      durationMs: 12,
    });
    expect(out.authorization).toBe(REDACTED);
    expect(out.cookie).toBe(REDACTED);
    expect(out['x-api-key']).toBe(REDACTED);
    expect(out.provider).toBe('sina');
    expect(out.durationMs).toBe(12);
  });

  it('非法 URL 不会让 logger 抛错', () => {
    expect(() => redactUrl('not a url %%')).not.toThrow();
    expect(typeof redactUrl('not a url %%')).toBe('string');
  });
});

describe('日志输出', () => {
  it('一条日志是一行 JSON，带 ts / level / event 与自定义字段', () => {
    const { lines, logger } = collecting();
    logger.info('http.request', { requestId: 'abc12345', status: 200, durationMs: 7, result: 'ok' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'info', event: 'http.request', requestId: 'abc12345', status: 200, durationMs: 7, result: 'ok' });
    expect(Number.isFinite(Date.parse(lines[0].ts))).toBe(true);
  });

  it('undefined 字段不写入（避免日志里满是 "x": null 的噪声）', () => {
    const { lines, logger } = collecting();
    logger.info('e', { a: 1, b: undefined, c: null });
    expect(lines[0]).not.toHaveProperty('b');
    expect(lines[0].c).toBeNull();
  });

  it('child logger 继承 base 并追加字段', () => {
    const { lines, logger } = collecting();
    logger.child({ jobId: 'quotes' }).warn('jobs.failed', { errorCode: 'ETIMEDOUT' });
    expect(lines[0]).toMatchObject({ level: 'warn', jobId: 'quotes', errorCode: 'ETIMEDOUT' });
  });

  it('写日志时字段里的凭据同样被抹掉（不只靠调用方自觉）', () => {
    const { lines, logger } = collecting();
    logger.error('provider.failed', { provider: 'sina', authorization: 'Bearer SECRET', url: '/api/x?token=T' });
    expect(lines[0].authorization).toBe(REDACTED);
    expect(lines[0].url).not.toContain('T');
  });

  it('requestId 短且不重复', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRequestId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.length).toBeGreaterThanOrEqual(6);
  });
});

describe('请求日志：一次请求恰好一条', () => {
  const fakeRes = (status) => {
    const handlers = {};
    return {
      statusCode: status,
      headersSent: false,
      on(event, fn) {
        (handlers[event] ??= []).push(fn);
        return this;
      },
      emitFinish() {
        for (const fn of handlers.finish ?? []) fn();
      },
    };
  };

  it('200 → result=ok，带 durationMs', async () => {
    const { lines, logger } = collecting();
    let t = 1000;
    const run = withRequestLog({ run: async (req, res) => { t = 1050; res.statusCode = 200; }, log: logger, now: () => t });
    const res = fakeRes(200);
    await run({ method: 'GET', url: '/api/quotes' }, res);
    res.emitFinish();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: 'http.request', method: 'GET', url: '/api/quotes', result: 'ok', durationMs: 50 });
  });

  it('404 → client_error；500 → error + errorCode', async () => {
    const { lines, logger } = collecting();
    const run404 = withRequestLog({ run: async (req, res) => { res.statusCode = 404; }, log: logger });
    const r1 = fakeRes(404);
    await run404({ method: 'GET', url: '/api/nope' }, r1);
    r1.emitFinish();

    const run500 = withRequestLog({ run: async (req, res) => { res.statusCode = 500; }, log: logger });
    const r2 = fakeRes(500);
    await run500({ method: 'GET', url: '/api/boom' }, r2);
    r2.emitFinish();

    expect(lines[0].result).toBe('client_error');
    expect(lines[1].result).toBe('error');
    expect(lines[1].errorCode).toBe('INTERNAL');
  });

  it('处理过程抛错时，请求自己那条日志仍然会写（异常不吞日志）', async () => {
    const { lines, logger } = collecting();
    const run = withRequestLog({
      run: async () => {
        throw new Error('boom');
      },
      log: logger,
    });
    const res = fakeRes(200);
    await expect(run({ method: 'GET', url: '/api/x' }, res)).rejects.toThrow('boom');
    // 业务异常由外层接住并回 500，finish 事件随后到达
    res.statusCode = 500;
    res.emitFinish();
    expect(lines).toHaveLength(1);
    // 抛错时先记 UNHANDLED（比 INTERNAL 更具体：说明是未捕获异常而非主动 500）
    expect(lines[0].errorCode).toBe('UNHANDLED');
    expect(lines[0].result).toBe('error');
  });

  it('日志里的 URL 会脱敏（不会把 token 写进日志）', async () => {
    const { lines, logger } = collecting();
    const run = withRequestLog({ run: async (req, res) => { res.statusCode = 200; }, log: logger });
    const res = fakeRes(200);
    await run({ method: 'GET', url: '/api/x?token=SECRET' }, res);
    res.emitFinish();
    expect(lines[0].url).not.toContain('SECRET');
  });
});

describe('退出流程', () => {
  const fakeServer = (listening = true) => ({
    listening,
    close(cb) {
      setTimeout(cb, 1);
      return this;
    },
  });

  it('SIGTERM：停调度 → 关连接 → 排空 → 关库 → exit(0)', async () => {
    const { lines, logger } = collecting();
    const stop = vi.fn();
    const exits = [];
    const h = installShutdown({ server: fakeServer(), stopBackground: stop, log: logger, exit: (c) => exits.push(c) });
    const out = await h.shutdown('SIGTERM');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(out.closeResult).toBe('closed');
    expect(exits).toEqual([0]);
    expect(lines.map((l) => l.event)).toEqual(['process.shutdown.start', 'process.shutdown.done']);
    expect(lines[1]).toMatchObject({ reason: 'SIGTERM', closeResult: 'closed' });
    h.remove();
  });

  it('重复触发只执行一次（SIGINT 紧跟 SIGTERM 不会双关）', async () => {
    const { logger } = collecting();
    const exits = [];
    const h = installShutdown({ server: fakeServer(), stopBackground: vi.fn(), log: logger, exit: (c) => exits.push(c) });
    await h.shutdown('SIGTERM');
    const second = await h.shutdown('SIGINT');
    expect(second).toEqual({ alreadyRunning: true });
    expect(exits).toHaveLength(1);
    h.remove();
  });

  it('排空有上限：close 不回调时到点仍然退出', async () => {
    const { lines, logger } = collecting();
    const exits = [];
    const server = {
      listening: true,
      close() {
        return this; // 永不回调（模拟有人开了长连接）
      },
    };
    const h = installShutdown({ server, stopBackground: vi.fn(), drainMs: 20, log: logger, exit: (c) => exits.push(c) });
    await h.shutdown('SIGTERM');
    expect(exits).toEqual([0]);
    expect(lines.at(-1).closeResult).toBe('timeout');
    h.remove();
  });

  it('没在监听时直接跳过关连接（不等待）', async () => {
    const { logger } = collecting();
    const h = installShutdown({ server: fakeServer(false), log: logger, exit: () => {} });
    const out = await h.shutdown('test');
    expect(out.closeResult).toBe('not-listening');
    h.remove();
  });

  it('调度器停止失败也不能阻断退出（记 warn 后继续）', async () => {
    const { lines, logger } = collecting();
    const exits = [];
    const h = installShutdown({
      server: fakeServer(),
      stopBackground: () => {
        throw new Error('stop-failed');
      },
      log: logger,
      exit: (c) => exits.push(c),
    });
    await h.shutdown('SIGTERM');
    expect(exits).toEqual([0]);
    expect(lines.some((l) => l.event === 'process.shutdown.stopBackgroundFailed')).toBe(true);
    h.remove();
  });

  it('默认排空上限是 5 秒（不会无限等）', () => {
    expect(DEFAULT_DRAIN_MS).toBe(5_000);
  });
});

/* ================================================================== *
 * 发布形态（方案 E08 / §5.3）
 *
 * 这里不跑 docker（CI 里没有守护进程），而是把「镜像/文档承诺的形态」
 * 钉成可断言的事实：端口、数据卷、非 root、健康检查看 readiness。
 * ================================================================== */
describe('单容器发布形态', () => {
  const dockerfile = () => readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');

  it('固定 Node 版本、非 root、暴露 8787、数据卷是 /app/data', () => {
    const d = dockerfile();
    expect(d).toMatch(/FROM node:24\.\d+\.\d+-alpine/);
    expect(d).toContain('USER node');
    expect(d).toContain('EXPOSE 8787');
    expect(d).toContain('VOLUME ["/app/data"]');
    expect(d).toContain('KANBAN_DATA_DIR=/app/data');
  });

  it('容器内监听 0.0.0.0（宿主端口发布到 127.0.0.1 才安全）', () => {
    expect(dockerfile()).toContain('HOST=0.0.0.0');
  });

  it('健康检查读 readiness，不是只看进程活着', () => {
    const d = dockerfile();
    expect(d).toContain('HEALTHCHECK');
    expect(d).toContain('/api/health');
    expect(d).toContain('readiness');
  });

  it('运行时依赖为空时不需要构建步骤（public/vendor 已入库）', () => {
    const d = dockerfile();
    expect(d).toContain('npm ci --omit=dev');
    expect(d).not.toContain('npm run build');
    expect(d).toContain('COPY public ./public');
  });
});
