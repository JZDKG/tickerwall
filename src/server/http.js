/* ================================================================== *
 * HTTP 层小工具（不进 services / domain：与业务无关，纯传输策略）
 * ================================================================== */

import path from 'node:path';
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
const lastForceAt = new Map();

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

/** Map 有界：超上限时丢掉最早插入的一半（Map 保持插入顺序，天然是 FIFO） */
function trimForceKeys() {
  if (lastForceAt.size <= MAX_FORCE_KEYS) return;
  const drop = [...lastForceAt.keys()].slice(0, Math.ceil(MAX_FORCE_KEYS / 2));
  for (const k of drop) lastForceAt.delete(k);
}

/**
 * 取本次请求是否允许强制刷新。超预算返回 false（调用方自然走缓存），
 * 不抛错 —— 「刷新得太快」不该让用户看到红色报错。
 */
export function takeForce(url) {
  if (url.searchParams.get('force') !== '1') return false;
  const key = forceKey(url.pathname);
  if (!key) return false;
  const now = Date.now();
  if (now - (lastForceAt.get(key) ?? 0) < FORCE_MIN_INTERVAL_MS) return false;
  lastForceAt.set(key, now);
  trimForceKeys();
  return true;
}

/**
 * 把 URL pathname 映射成磁盘路径，越界就返回 null。
 *
 * 抽成纯函数是为了能测：路径穿越是少数「错了就是安全事故」的逻辑，而它
 * 原本埋在 server.mjs 里没法单测。判据是 `full` 必须以 `root + sep` 开头 ——
 * 只比 `startsWith(root)` 的话，`/publicX/foo` 会因为前缀相同而通过。
 *
 * 拒绝的三类：解码失败（恶意 % 序列）、含 NUL、normalize 之后越界。
 */
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

/** 仅供测试观测 Map 规模，不参与生产逻辑 */
export function __forceKeyCount() {
  return lastForceAt.size;
}
