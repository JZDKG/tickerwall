/* ================================================================== *
 * HTTP 响应工具与启动期错误策略
 *
 * 这些函数决定「每个响应都带 nosniff / no-store」「静态文件 404 vs 403」
 * 以及「端口占用必须以退出码 1 结束」。都是行为级约定，静态断言（代码里
 * 有那几行）证明不了，所以直接喂假 res / 真文件。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sendText, sendJson, serveStatic, guardServerErrors } from '../src/server/http.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 记录 writeHead / end 的最小响应对象 */
function fakeRes() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(buf) {
      this.body = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf ?? ''));
    },
  };
}

const text = (res) => res.body?.toString('utf8');

describe('sendText：所有纯文本响应都带 nosniff', () => {
  it('默认 text/plain + 正确 Content-Length', () => {
    const res = fakeRes();
    sendText(res, 404, 'not found');
    expect(res.status).toBe(404);
    expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Content-Length']).toBe(Buffer.byteLength('not found'));
    expect(text(res)).toBe('not found');
  });

  it('调用方可以覆盖 Content-Type，但 nosniff 不会被一起覆盖掉', () => {
    const res = fakeRes();
    sendText(res, 400, '<b>x</b>', { 'Content-Type': 'text/html; charset=utf-8' });
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('多字节字符按字节数算 Content-Length', () => {
    const res = fakeRes();
    sendText(res, 200, '中文');
    expect(res.headers['Content-Length']).toBe(6);
  });
});

describe('sendJson：JSON + 不缓存 + 不发 CORS', () => {
  it('序列化对象，带 no-store 与 nosniff', () => {
    const res = fakeRes();
    sendJson(res, 200, { ok: true, n: 1 });
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(JSON.parse(text(res))).toEqual({ ok: true, n: 1 });
  });

  it('不主动加 Access-Control-Allow-Origin（同源部署，跨域应走反代）', () => {
    const res = fakeRes();
    sendJson(res, 200, []);
    expect(Object.keys(res.headers).some((k) => /access-control/i.test(k))).toBe(false);
  });

  it('字符串/数组等非对象也能序列化', () => {
    const res = fakeRes();
    sendJson(res, 200, null);
    expect(text(res)).toBe('null');
  });
});

describe('serveStatic：真文件读取与错误码', () => {
  it('读 public/index.html，返回 200 + text/html + no-cache', async () => {
    const res = fakeRes();
    await serveStatic(res, '/index.html');
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe('no-cache');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(text(res)).toBe(readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'));
  });

  it('js / css / svg 的 MIME 各自正确', async () => {
    const cases = [
      ['/app.js', 'text/javascript; charset=utf-8'],
      ['/vendor/macro-flow.js', 'text/javascript; charset=utf-8'],
    ];
    for (const [p, mime] of cases) {
      const res = fakeRes();
      await serveStatic(res, p);
      expect(res.status, p).toBe(200);
      expect(res.headers['Content-Type'], p).toBe(mime);
    }
  });

  it('/src/client/** 走源码目录而不是 public', async () => {
    const res = fakeRes();
    await serveStatic(res, '/src/client/shared/format.js');
    expect(res.status).toBe(200);
    expect(text(res)).toContain('export function fmtPrice');
  });

  it('不存在的文件返回 404 纯文本', async () => {
    const res = fakeRes();
    await serveStatic(res, '/definitely-missing-12345.txt');
    expect(res.status).toBe(404);
    expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(text(res)).toBe('not found');
  });

  it('目录会递归找 index.html；找不到就是 404 而不是 500', async () => {
    const res = fakeRes();
    await serveStatic(res, '/src/client');
    expect(res.status).toBe(404);
  });

  it('越界/畸形路径返回 403，不读盘', async () => {
    for (const p of ['/%E0%A4%A', '/foo\u0000.png']) {
      const res = fakeRes();
      await serveStatic(res, p);
      expect(res.status, p).toBe(403);
      expect(text(res)).toBe('forbidden');
    }
  });
});

describe('guardServerErrors：启动期该崩就崩', () => {
  let errors;
  let warnings;
  const realError = console.error;
  let exitSpy;

  beforeEach(() => {
    errors = [];
    warnings = [];
    console.error = (...a) => errors.push(a.join(' '));
    console.warn = (...a) => warnings.push(a.join(' '));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    console.error = realError;
    exitSpy.mockRestore();
  });

  it('未监听时的 EADDRINUSE 以退出码 1 结束，并说明是端口占用', () => {
    const server = new EventEmitter();
    guardServerErrors(server, { host: '127.0.0.1', port: 8787 }, () => false);
    expect(() => server.emit('error', Object.assign(new Error('in use'), { code: 'EADDRINUSE' }))).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errors.join('\n')).toMatch(/端口已被占用/);
    expect(errors.join('\n')).toMatch(/127\.0\.0\.1:8787/);
  });

  it('EACCES 也按启动失败处理（权限不足）', () => {
    const server = new EventEmitter();
    guardServerErrors(server, { host: '0.0.0.0', port: 80 }, () => false);
    expect(() => server.emit('error', Object.assign(new Error('denied'), { code: 'EACCES' }))).toThrow('process.exit');
    expect(errors.join('\n')).toMatch(/没有权限/);
  });

  it('其他监听错误同样退出，但不误报成端口占用', () => {
    const server = new EventEmitter();
    guardServerErrors(server, { host: 'x', port: 1 }, () => false);
    expect(() => server.emit('error', new Error('boom'))).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errors.join('\n')).toMatch(/监听失败/);
    expect(errors.join('\n')).not.toMatch(/端口已被占用/);
  });

  it('已经在监听时只记日志，不退出（运行期错误不该带崩进程）', () => {
    const server = new EventEmitter();
    guardServerErrors(server, { host: 'h', port: 1 }, () => true);
    server.emit('error', new Error('runtime'));
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errors.join('\n')).toMatch(/\[http\] server error/);
  });
});
