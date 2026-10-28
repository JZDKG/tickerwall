/* ================================================================== *
 * 应用组装（方案 §4.2 的 src/server/app.js）
 *
 * 从 server.mjs 搬出来：入口只该负责「把东西装起来、开始监听、能干净退出」，
 * 路由表、405 守卫、静态映射、异常兜底都属于应用本身。
 *
 * 为什么现在搬：E08 要在请求上挂 requestId 与耗时日志，如果再往入口塞，
 * server.mjs 会重新长回「什么都放这里」的样子（它已经贴着 200 行上限）。
 *
 * 依赖显式传入（`deps`），所以测试可以直接 `createApp({ deps })` 起一个
 * 不监听端口的实例，不需要 spawn 子进程。
 * ================================================================== */

import { serveStatic, sendJson, takeForce } from './http.js';
import { handleExplanationRoutes } from './routes.js';
import { handleSystemRoutes } from './routes/system.js';

/** 允许 POST 的路径前缀：只有维护端点会写 */
export const WRITE_PATHS = '/api/maintenance/';

/**
 * 造一个 handle(req, res)。
 *
 * @param {object} deps 依赖（全部由入口注入，便于测试替换）
 * @param {Function} deps.getQuotes
 * @param {Function} deps.buildBriefing
 * @param {Function} deps.getDetail
 * @param {Function} deps.getMacro
 * @param {Function} deps.getEvents
 * @param {Function} deps.getEventHistory
 * @param {Function} deps.getEventStudy
 * @param {Function} deps.getCalendar
 * @param {number} deps.ttlMs
 * @param {() => object[]} [deps.jobs]
 * @param {Function} [deps.logError] 兜底日志（默认 console.error）
 */
export function createApp(deps) {
  const logError = deps.logError ?? ((...args) => console.error('[http] 未处理异常', ...args));

  /**
   * `async` 回调里抛出的异常会变成未处理的 Promise 拒绝，Node 20+ 直接让
   * 进程退出。所以这里是唯一的接住点：同步与异步异常都落到外层 .catch。
   */
  return async function handle(req, res) {
    // 必须在 try 里：`GET //% HTTP/1.1` 会让 new URL 抛 ERR_INVALID_URL，
    // 而它在外面会穿过 handler 把整个进程带崩（客户端错误 → 400，不是 500）
    let url;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('bad request');
    }

    // 405 必须在任何分发之前判：原来它只挡静态资源，于是 POST /api/quotes
    // 会一路落到 /api/quotes 的 GET 分支被当成正常请求处理。
    // 例外只到维护端点前缀，别的路径仍然只读。
    const methodAllowed =
      req.method === 'GET' || req.method === 'HEAD' || (req.method === 'POST' && url.pathname.startsWith(WRITE_PATHS));
    if (!methodAllowed) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }

    try {
      if (url.pathname === '/api/quotes') {
        return sendJson(res, 200, await deps.getQuotes({ force: takeForce(url) }));
      }
      if (url.pathname === '/api/briefing') {
        return sendJson(res, 200, await deps.buildBriefing());
      }
      if (url.pathname.startsWith('/api/detail/')) {
        const id = url.pathname.slice('/api/detail/'.length);
        const detail = await deps.getDetail(id, { force: takeForce(url) });
        if (!detail) return sendJson(res, 404, { ok: false, error: `未知标的: ${id}` });
        return sendJson(res, 200, detail);
      }
      if (url.pathname === '/api/macro') {
        const winRaw = url.searchParams.get('window');
        const win = winRaw === 'all' ? 0 : Math.max(20, Math.min(5000, Number(winRaw) || 250));
        const freq = url.searchParams.get('freq') === 'week' ? 'week' : 'day';
        return sendJson(res, 200, await deps.getMacro(win, freq, { force: takeForce(url) }));
      }
      if (url.pathname === '/api/events/history') {
        /**
         * 归档只有「今天 + 昨天」两份，超过 48 小时没有数据可给。
         * 显式写 hours=0 时夹到 1，而不是被 `|| 24` 当成「没传」——
         * 否则「我要 0 小时」与「我不传」会得到同一个结果，用户以为参数没生效。
         */
        const raw = Number(url.searchParams.get('hours'));
        const hours = Number.isFinite(raw) && url.searchParams.has('hours') ? Math.max(1, Math.min(48, raw)) : 24;
        return sendJson(res, 200, await deps.getEventHistory({ hours }));
      }
      if (url.pathname === '/api/events') {
        // 默认 200：接入全球源后事件量从 ~14 条涨到 ~130 条，
        // 120 会把尾部条目静默截掉，而 total 仍报全量，看起来像丢了新闻
        const limit = Math.max(10, Math.min(300, Number(url.searchParams.get('limit')) || 200));
        return sendJson(res, 200, await deps.getEvents({ force: takeForce(url), limit }));
      }
      if (url.pathname === '/api/eventstudy') {
        return sendJson(res, 200, await deps.getEventStudy({ force: takeForce(url) }));
      }
      // 解释读取与事件版本（方案 §8.1）：实现在 routes.js，这里只委派一次
      if (await handleExplanationRoutes(url, res, { takeForce })) return;
      if (url.pathname === '/api/calendar') {
        return sendJson(res, 200, await deps.getCalendar({ force: takeForce(url) }));
      }
      // 健康状态与市场时段探针：实现在 routes/system.js
      if (
        handleSystemRoutes(url, res, {
          ttlMs: deps.ttlMs,
          jobs: () => deps.jobs?.() ?? [],
          method: req.method,
        })
      )
        return;
      return serveStatic(res, url.pathname);
    } catch (err) {
      // 对外只给通用文案：err.message 常带路径 / 内部 URL，等于把实现细节发给浏览器
      logError(url.pathname, err);
      return sendJson(res, 500, { ok: false, error: '服务器内部错误' });
    }
  };
}
