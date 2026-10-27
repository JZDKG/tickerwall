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
 * 只对这几个固定端点计预算。
 *
 * 不能拿 url.pathname 直接当 key：/api/detail/<任意 id> 的 pathname 有无限
 * 多种，Map 会一直长（而且是在校验 id 之前就写进去）。按端点归类，长度有界。
 */
const FORCE_KEYS = ['/api/quotes', '/api/briefing', '/api/macro', '/api/events', '/api/eventstudy', '/api/calendar'];
const lastForceAt = new Map();

/** 归到白名单里的某个端点；归不上返回 null（不计预算，也不放行） */
function forceKey(pathname) {
  return FORCE_KEYS.find((k) => pathname === k || pathname.startsWith(`${k}/`)) ?? null;
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
