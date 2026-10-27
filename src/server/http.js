/* ================================================================== *
 * HTTP 层小工具（不进 services / domain：与业务无关，纯传输策略）
 * ================================================================== */

/* force=1 跳过缓存直打上游，多个端点都支持 —— 不设限就成了对上游的放大器。
   同一端点 5 秒一次；超预算静默退回缓存，对点「刷新」的人透明。 */
const FORCE_MIN_INTERVAL_MS = 5000;
const lastForceAt = new Map();

/**
 * 取本次请求是否允许强制刷新。超预算返回 false（调用方自然走缓存），
 * 不抛错 —— 「刷新得太快」不该让用户看到红色报错。
 */
export function takeForce(url) {
  if (url.searchParams.get('force') !== '1') return false;
  const now = Date.now();
  const key = url.pathname;
  if (now - (lastForceAt.get(key) ?? 0) < FORCE_MIN_INTERVAL_MS) return false;
  lastForceAt.set(key, now);
  return true;
}
