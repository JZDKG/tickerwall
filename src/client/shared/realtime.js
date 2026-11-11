/* ================================================================== *
 * Phase 1 / P1-T3：客户端 SSE 订阅 + 轮询节奏控制
 *
 * 只做两件事：
 *   1. 浏览器支持 EventSource 时连 /api/stream，收到 quotes 帧直接写
 *      store 并通过 bus 通知视图局部刷新；
 *   2. 告诉轮询层该用多快的节奏：SSE OPEN → 60s 低频兜底，断开 → 15s。
 *
 * 刻意不在这里自己发 fetch：首屏/刷新/错误文案仍是 main.js 的职责，
 * 这里只提供「现在该多久拉一次」这个答案，避免两条取数路径互相覆盖。
 * ================================================================== */

/** 原来的高频轮询间隔 */
export const POLL_FAST_MS = 15_000;
/** SSE 在线时的低频兜底（保活 + SSE 断线但 error 事件丢失的最后防线） */
export const POLL_SLOW_MS = 60_000;

/**
 * @param {{
 *   store:object,
 *   EventSourceImpl?:Function|null,
 *   bus?:{emit?:Function},
 *   url?:string,
 *   fetchQuotes?:Function,
 *   logger?:Function,
 * }} opts
 */
export function createRealtime(opts = {}) {
  const store = opts.store ?? {};
  const bus = opts.bus ?? null;
  const url = opts.url ?? '/api/stream';
  const EventSourceImpl = opts.EventSourceImpl === null ? null : (opts.EventSourceImpl ?? (typeof EventSource !== 'undefined' ? EventSource : null));
  const log = opts.logger ?? (() => {});
  let source = null;
  let open = false;

  function isOpen() {
    return open && source?.readyState === 1;
  }

  /** 轮询层每轮问一次：SSE 在线就降频，否则保持 15s */
  function pollIntervalMs() {
    return isOpen() ? POLL_SLOW_MS : POLL_FAST_MS;
  }

  function onQuotes(raw) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return; // 坏帧忽略，不打断连接
    }
    if (!payload || !Array.isArray(payload.quotes)) return;
    store.quotes = payload.quotes;
    if (Number.isFinite(payload.ttlMs)) store.ttl = payload.ttlMs;
    if (payload.updatedAt) store.updatedAt = payload.updatedAt;
    try {
      bus?.emit?.('quotes', payload);
    } catch (err) {
      log('[realtime] bus 广播失败', err);
    }
  }

  function connect() {
    if (!EventSourceImpl || source) return source;
    try {
      source = new EventSourceImpl(url);
    } catch (err) {
      log('[realtime] EventSource 建立失败，保持轮询', err);
      source = null;
      return null;
    }
    source.addEventListener('open', () => {
      open = true;
    });
    source.addEventListener('quotes', (ev) => onQuotes(ev?.data));
    source.addEventListener('error', () => {
      open = false;
      // 浏览器会自动重连；重连成功后 open 事件再次把节奏降下来
    });
    return source;
  }

  function disconnect() {
    open = false;
    try {
      source?.close?.();
    } catch {
      /* 已关闭 */
    }
    source = null;
  }

  return { connect, disconnect, isOpen, pollIntervalMs, onQuotes };
}
