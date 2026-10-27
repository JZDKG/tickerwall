/* ================================================================== *
 * HTTP 层集成测试（真起进程 + 真发请求）
 *
 * 这一层之前完全没有覆盖：路由、方法校验、静态路径防护、500 文案都只靠
 * 静态断言「代码里有那几行」。静态断言证明不了行为 —— 405 曾经就写在
 * 分发之后，代码里明明有 `405`，行为却是把 POST 当 GET 处理。
 *
 * 做法：spawn 一个独立的 node server.mjs，PORT=0 拿随机端口，
 * KANBAN_DATA_DIR 指向临时目录（不污染真实 data/，也不依赖已有历史文件）。
 *
 * 必须设 DISABLE_BACKGROUND=1：否则 listen 回调会立刻请求新浪/东方财富，
 * 后台定时器也会一直跑 —— 测试就变成依赖外网的东西，断网还会在 stderr
 * 刷错误。这个开关同时也给「断网环境想先起个页面」用。
 * ================================================================== */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let child;
let base;
let dataDir;

/** 从子进程 stdout / stderr 里等「已启动 → http://host:port」这一行 */
function waitForListen(proc, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`启动超时：\n${buf}`)), timeoutMs);
    const onData = (d) => {
      buf += d.toString();
      // 抓机器可读的 LISTENING 行，而不是中文日志 —— 后者改文案就会挂
      const m = /^LISTENING (\d+)$/m.exec(buf);
      if (m) {
        clearTimeout(timer);
        proc.stdout.off('data', onData);
        proc.stderr.off('data', onData);
        proc.off('exit', onExit);
        resolve({ host: '127.0.0.1', port: Number(m[1]) });
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    const onExit = (code) => {
      clearTimeout(timer);
      reject(new Error(`子进程提前退出 ${code}：\n${buf}`));
    };
    proc.on('exit', onExit);
  });
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'kanban-http-'));
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      KANBAN_DATA_DIR: dataDir,
      // 关掉 LLM 与外部凭据读取，避免测试碰到网络或别人的密钥
      LLM_CONFIG_SOURCE: 'env',
      // 关键：不起后台抓取，否则测试依赖外网
      DISABLE_BACKGROUND: '1',
      // 不设 ENABLE_DEBUG_API，验证调试端点默认关闭
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { host, port } = await waitForListen(child);
  base = `http://${host}:${port}`;
}, 30000);

afterAll(async () => {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    // 等它真的退出，避免测试进程被句柄拖住
    await new Promise((r) => {
      const t = setTimeout(r, 3000);
      child.on('exit', () => { clearTimeout(t); r(); });
    });
  }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('路由与方法校验', () => {
  it('GET / 返回首页', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('POST /api/quotes 得 405（不能当成 GET 处理）', async () => {
    const res = await fetch(`${base}/api/quotes`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('GET');
  });

  it('PUT /api/events 得 405', async () => {
    const res = await fetch(`${base}/api/events`, { method: 'PUT' });
    expect(res.status).toBe(405);
  });

  it('未知 API 路径不会被静态服务吞掉', async () => {
    const res = await fetch(`${base}/api/no-such-endpoint`);
    // 会落到静态服务，但 /api/... 在 public 下不存在 → 404
    expect(res.status).toBe(404);
  });

  it('/api/_market 默认 404（调试端点默认关闭）', async () => {
    const res = await fetch(`${base}/api/_market`);
    expect(res.status).toBe(404);
  });
});

describe('静态文件与路径防护', () => {
  it('/index.html 直接可取', async () => {
    const res = await fetch(`${base}/index.html`);
    expect(res.status).toBe(200);
  });

  it('/src/client/ 下的 ES 模块被伺服', async () => {
    const res = await fetch(`${base}/src/client/views/map.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
  });

  /**
   * 原始请求行直发。不能用 fetch —— 它在发出之前就按 WHATWG 规则把 `..`
   * 和 `%2e%2e` 折叠掉了，服务器根本收不到穿越路径，用例会「通过」但什么
   * 都没验证（假阳性）。走 net 手写请求行，才能真的把 `GET /../package.json`
   * 送到服务器面前。
   */
  function rawGet(pathLine) {
    return new Promise((resolve, reject) => {
      const { hostname, port } = new URL(base);
      const sock = net.connect(Number(port), hostname, () => {
        sock.write(`GET ${pathLine} HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`);
      });
      let buf = '';
      sock.setEncoding('utf8');
      sock.on('data', (d) => { buf += d; });
      sock.on('end', () => {
        const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(buf)?.[1] ?? 0);
        const body = buf.slice(buf.indexOf('\r\n\r\n') + 4);
        resolve({ status, body });
      });
      sock.on('error', reject);
      sock.setTimeout(5000, () => { sock.destroy(); reject(new Error('rawGet 超时')); });
    });
  }

  const TRAVERSALS = [
    '/../package.json',
    '/../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/%2e%2e%2fpackage.json',
    '/src/client/../../server.mjs',
    '/..%2f..%2fpackage.json',
    '/%2e%2e%5c%2e%2e%5cpackage.json',
  ];

  it('原始请求行的穿越路径拿不到仓库文件', async () => {
    for (const p of TRAVERSALS) {
      const { status, body } = await rawGet(p);
      // 403（被 resolveStaticPath 拦）或 404（规范化后落在 root 内但不存在）
      // 都可以；绝不能 200 吐出仓库文件
      expect([403, 404], `${p} 得 ${status}`).toContain(status);
      expect(body, `${p} 吐出了仓库文件`).not.toContain('"dependencies"');
      expect(body).not.toContain('migrateLegacyStorage');
    }
  });

  it('直接点名的仓库文件也取不到', async () => {
    for (const p of ['/server.mjs', '/package.json', '/src/server/config.js']) {
      const { status } = await rawGet(p);
      expect(status, p).not.toBe(200);
    }
  });

  it('畸形请求行不会打崩进程（400 且随后仍可用）', async () => {
    // 这条是真 bug 的回归测试：`GET //% HTTP/1.1` 会让 new URL 抛
    // ERR_INVALID_URL，而它原本写在 try 外面 —— 异常穿过 handler 把整个
    // 进程带崩，任何人一个畸形请求就能打掉看板。
    const { status } = await rawGet('//%');
    expect(status).toBe(400);
    // 关键：进程还活着
    const health = await fetch(`${base}/api/health`);
    expect(health.status).toBe(200);
  });

  it('多个畸形请求连续发，进程依然存活', async () => {
    for (const p of ['//%', '//%zz', '/%', '///%']) {
      const { status } = await rawGet(p);
      expect([400, 403], `${p} 得 ${status}`).toContain(status);
    }
    const health = await fetch(`${base}/api/health`);
    expect(health.status).toBe(200);
  });
});

describe('响应头与错误文案', () => {
  // 打 /api/health 而不是 /api/quotes：前者同样走 sendJson，但不会触发
  // 上游抓取。之前这两条用 quotes，单条耗时 1709ms —— 那 1.7 秒就是它在
  // 连新浪/东财，断网时会直接失败。头这一层跟端点无关，不必付这个代价。
  it('不发 Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('JSON 响应带 nosniff', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  // 这条只测业务 404 的文案（真正的 500 在上一组用畸形请求行覆盖）。
  // 名字不改的话，读的人会以为 500 在这里测过了。
  it('未知标的返回业务 404，且文案不含路径痕迹', async () => {
    const res = await fetch(`${base}/api/detail/__nope__`);
    expect(res.status).toBe(404);
    const text = await res.text();
    // 业务提示可以有，但不能出现绝对路径或堆栈痕迹
    expect(text).not.toMatch(/\/Users\//);
    expect(text).not.toMatch(/at\s+\w+\s+\(/);
  });
});
