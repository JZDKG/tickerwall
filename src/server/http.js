/* ================================================================== *
 * HTTP 层小工具（不进 services / domain：与业务无关，纯传输策略）
 * ================================================================== */

import path from 'node:path';
import fsp from 'node:fs/promises';
import { ROOT, PUBLIC_DIR } from './paths.js';

const CLIENT_SRC_DIR = path.join(ROOT, 'src', 'client');

/* force=1 跳过缓存直打上游，多个端点都支持 —— 不设限就成了对上游的放大器。
   同一端点 5 秒一次；超预算静默退回缓存，对点「刷新」的人透明。 */
const FORCE_MIN_INTERVAL_MS = 5000;

/**
 * 只对白名单端点计预算。
 *
 * 不能无脑拿 url.pathname 当 key 且不设上限：`/api/detail/<任意 id>` 的
 * pathname 由外部输入决定，Map 会一直长（而且是在校验 id 之前就写入）。
 * 所以两层防护：先按端点白名单过滤，再给 Map 设硬顶。
 */
const FORCE_ENDPOINTS = [
  '/api/quotes',
  '/api/briefing',
  '/api/macro',
  '/api/events',
  '/api/eventstudy',
  '/api/calendar',
  // detail 带 id 维度：5 秒内连刷两个不同标的，第二个不该被前一个的预算连累
  '/api/detail',
];
/** key 数量上限。detail 的 id 集合有限，但仍是外部输入，兜一层硬顶 */
const MAX_FORCE_KEYS = 128;
/**
 * 归到某个端点（带 id 的端点连同 id 一起计）。
 * 归不上返回 null —— 不在白名单的路径不计预算，也不放行。
 *
 * 注意这里**不能**只写固定端点而不含 `/api/detail`：客户端详情页的手动刷新
 * 会发 `?force=1`，漏掉它会让刷新静默退回缓存，而且一声不响。
 */
function forceKey(pathname) {
  const ep = FORCE_ENDPOINTS.find((k) => pathname === k || pathname.startsWith(`${k}/`));
  if (!ep) return null;
  return pathname.length > ep.length ? pathname : ep;
}

/**
 * 造一个限流器。
 *
 * 做成工厂而不是模块级单例，是为了让测试拿独立实例断言状态 ——
 * 原来模块里导出了一个 `__forceKeyCount()` 专供测试读内部 Map，
 * 那是生产模块给测试留的后门：读得到就能被误用，而且测试之间共享状态。
 *
 * @param {{ maxKeys?: number, minIntervalMs?: number, now?: () => number }} opts
 */
export function createForceLimiter(opts = {}) {
  const maxKeys = opts.maxKeys ?? MAX_FORCE_KEYS;
  const minIntervalMs = opts.minIntervalMs ?? FORCE_MIN_INTERVAL_MS;
  const now = opts.now ?? (() => Date.now());
  const lastAt = new Map();

  /** Map 有界：超上限时丢掉最早插入的一半（Map 保持插入顺序，天然是 FIFO） */
  function trim() {
    if (lastAt.size <= maxKeys) return;
    const drop = [...lastAt.keys()].slice(0, Math.ceil(maxKeys / 2));
    for (const k of drop) lastAt.delete(k);
  }

  return {
    /**
     * 取本次请求是否允许强制刷新。超预算返回 false（调用方自然走缓存），
     * 不抛错 —— 「刷新得太快」不该让用户看到红色报错。
     */
    take(url) {
      if (url.searchParams.get('force') !== '1') return false;
      const key = forceKey(url.pathname);
      if (!key) return false;
      const t = now();
      const prev = lastAt.get(key);
      if (prev != null && t - prev < minIntervalMs) return false;
      lastAt.set(key, t);
      trim();
      return true;
    },
    /** 当前记账的 key 数（断言用，不是生产接口） */
    size: () => lastAt.size,
  };
}

export function resolveStaticPath(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    // %E0%A4%A 这种残缺序列会让 decodeURIComponent 抛错，直接拒
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel === '' || rel === '/') rel = '/index.html';

  let root = PUBLIC_DIR;
  if (rel.startsWith('/src/client/')) {
    root = CLIENT_SRC_DIR;
    rel = rel.slice('/src/client'.length);
  }

  const full = path.join(root, path.normalize(rel));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return { root, rel, full };
}

/** 生产用的单例：全进程一份预算 */
const defaultLimiter = createForceLimiter();

export const takeForce = (url) => defaultLimiter.take(url);

/* ------------------------------------------------------------------ *
 * 响应工具（从 server.mjs 搬进来）
 *
 * 搬家的理由不是「入口好看」：这层是纯传输细节，和路由分发无关，
 * 而且它决定了「所有响应都带 nosniff」这类一致性 —— 分散在入口里时，
 * 每加一个响应点都要记得补头，漏一个就不一致（之前 400 就漏了）。
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/**
 * 纯文本响应。所有非 JSON 的响应都走这里，保证 nosniff 不漏。
 * （之前 400 是手写 writeHead，就没带上这个头。）
 */
export function sendText(res, status, body, headers = {}) {
  const buf = Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': headers['Content-Type'] ?? 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(buf);
}

/**
 * JSON 响应。
 *
 * 不发 Access-Control-Allow-Origin：前端同源，不需要 CORS；一旦为 `*`，
 * 任何网页都能跨域读本机 API（HOST=0.0.0.0 时更糟）。需要跨域请走反向代理。
 */
export function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

/** 静态文件。路径解析与越界判断见 resolveStaticPath。 */
export async function serveStatic(res, pathname) {
  const resolved = resolveStaticPath(pathname);
  if (!resolved) return sendText(res, 403, 'forbidden');

  const { full } = resolved;
  try {
    const st = await fsp.stat(full);
    // 递归要传**原始 pathname**：传已被截断的 rel 会让 /src/client/views/
    // 被再解析成 public/views/ → 404
    if (st.isDirectory()) return serveStatic(res, path.posix.join(pathname, '/index.html'));
    const buf = await fsp.readFile(full);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  } catch {
    // charset 回到 utf-8：删掉它属于顺手改行为，不是修 bug
    sendText(res, 404, 'not found');
  }
}

/**
 * 给 server 装上「启动期该崩就崩 / 运行期只记日志」的错误处理。
 *
 * 为什么不能全靠进程级兜底：吞掉 uncaughtException 之后，端口被占用也会
 * 被当成「未捕获异常」记一笔然后以**退出码 0** 结束 —— `启动看板.command`
 * 会认为启动成功，用户看不到失败，进程管理器也不会重启。这是该崩的情况。
 *
 * @param {import('node:http').Server} server
 * @param {{ host: string, port: number }} addr 日志里要显示的目标地址
 * @param {() => boolean} isListening 启动完成后返回 true
 */
export function guardServerErrors(server, { host, port }, isListening) {
  server.on('error', (err) => {
    if (isListening()) return console.error('[http] server error', err);
    const fatal = err?.code === 'EADDRINUSE' || err?.code === 'EACCES';
    if (fatal) {
      const why = err.code === 'EADDRINUSE' ? '端口已被占用' : '没有权限';
      console.error(`[boot] 无法监听 ${host}:${port} —— ${why}`, err.message);
    } else {
      console.error('[boot] 监听失败', err?.message ?? err);
    }
    process.exit(1);
  });
}
