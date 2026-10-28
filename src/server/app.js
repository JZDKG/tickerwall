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
import { COMPARISON_WINDOWS } from './services/comparison.service.js';
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
      /**
       * 内外金对照（产品 2.1）：回答「国际跌、国内为什么涨」。
       * 纯分解在 domain/explanations/comparison.js，这里只做参数归一。
       */
      if (url.pathname === '/api/comparison/gold') {
        const windowKey = url.searchParams.get('window') ?? 'session';
        if (!COMPARISON_WINDOWS[windowKey]) {
          return sendJson(res, 400, {
            ok: false,
            error: `未知窗口: ${windowKey}`,
            allowed: Object.keys(COMPARISON_WINDOWS),
          });
        }
        return sendJson(res, 200, await deps.getGoldComparison({ windowKey, force: takeForce(url) }));
      }
      /**
       * 预期台账（产品 2.4）：刚公布的与预期差多少、接下来要看什么。
       * 判定在 domain/expectation-sources.js，服务层只整理 —— 这里只做
       * limit 的参数归一（0 或非数字退回默认值，不让 ?limit=0 把屏刷空）。
       */
      if (url.pathname === '/api/expectations') {
        const rawLimit = Number(url.searchParams.get('limit'));
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(30, Math.floor(rawLimit)) : 12;
        return sendJson(res, 200, await deps.getExpectationLedger({ limit, force: takeForce(url) }));
      }
      /**
       * 关注简报（产品 2.3）：只看你关心的问题有没有新变化。
       * 关注项存在前端本地，所以 assets / since 都由查询参数带上来 ——
       * 服务端不猜「最近 24 小时」，猜了会让三天没来的用户漏看。
       */
      if (url.pathname === '/api/brief') {
        const assets = (url.searchParams.get('assets') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        const keys = (url.searchParams.get('keys') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        const rawSince = Number(url.searchParams.get('since'));
        const sinceMs = url.searchParams.get('since') && Number.isFinite(rawSince) && rawSince > 0 ? rawSince : null;
        return sendJson(res, 200, await deps.getWatchBrief({ assets, watchedKeys: keys, sinceMs }));
      }
      /**
       * 生活场景（产品 2.6）：一条有资料支持的传导路径 + 已知缺口。
       * 上游取不到也照样返回机制，所以这里不做 5xx。
       */
      if (url.pathname === '/api/life-path') {
        const scenario = url.searchParams.get('scenario') || 'fuel-cost';
        return sendJson(res, 200, await deps.getLifePath({ scenario }));
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
