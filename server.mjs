#!/usr/bin/env node
/**
 * 市场看板 —— 零依赖后端
 *
 * 作用：把多个公开行情接口聚合成一个 JSON，供前端纵向列表渲染。
 * 为什么要后端：新浪 / 东方财富接口不带 CORS 头，且新浪要求 Referer，浏览器直连会被拦。
 *
 * 启动：node server.mjs   （默认 http://127.0.0.1:8787）
 */
import { MARKET_PROFILES, localClock, isMarketOpen } from './src/server/domain/market-hours.js';
import { takeForce, sendJson, sendText, serveStatic } from './src/server/http.js';
import { PORT, HOST, DEBUG_API, DISABLE_BACKGROUND } from './src/server/config.js';
import { getEvents, getEventHistory, loadLlmStore } from './src/server/services/events.service.js';
import {
  CACHE_TTL_MS,
  HISTORY_LIMIT,
  getQuotes,
  migrateLegacyStorage,
  loadPersistedHistory,
  seedHistory,
  buildBriefing,
} from './src/server/services/quotes.service.js';
import { getDetail } from './src/server/services/detail.service.js';
import { getMacro } from './src/server/services/macro.service.js';
import { getCalendar, getEventStudy } from './src/server/services/calendar.service.js';
import http from 'node:http';
import path from 'node:path';




/* 不发 Access-Control-Allow-Origin：前端同源，不需要 CORS；一旦为 `*`，
   任何网页都能跨域读本机 API（HOST=0.0.0.0 时更糟）。跨域需求走反向代理。 */

const server = http.createServer(async (req, res) => {
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
  // 会一路落到 /api/quotes 的 GET 分支被当成正常请求处理
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  try {
    if (url.pathname === '/api/quotes') {
      const force = takeForce(url);
      const data = await getQuotes({ force });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/briefing') {
      return sendJson(res, 200, await buildBriefing());
    }
    if (url.pathname.startsWith('/api/detail/')) {
      const id = url.pathname.slice('/api/detail/'.length);
      const force = takeForce(url);
      const detail = await getDetail(id, { force });
      if (!detail) return sendJson(res, 404, { ok: false, error: `未知标的: ${id}` });
      return sendJson(res, 200, detail);
    }
    if (url.pathname === '/api/macro') {
      const winRaw = url.searchParams.get('window');
      const win = winRaw === 'all' ? 0 : Math.max(20, Math.min(5000, Number(winRaw) || 250));
      const freq = url.searchParams.get('freq') === 'week' ? 'week' : 'day';
      const force = takeForce(url);
      const data = await getMacro(win, freq, { force });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/events/history') {
      // 归档只有「今天 + 昨天」两份，超过 48 小时没有数据可给；
      // 下限 1 小时，避免 hours=0 走进空窗口
      const hours = Math.max(1, Math.min(48, Number(url.searchParams.get('hours')) || 24));
      sendJson(res, 200, await getEventHistory({ hours }));
      return;
    }
    if (url.pathname === '/api/events') {
      const force = takeForce(url);
      // 默认 200：接入全球源后事件量从 ~14 条涨到 ~130 条，
      // 120 会把尾部条目静默截掉，而 total 仍报全量，看起来像丢了新闻。
      const limit = Math.max(10, Math.min(300, Number(url.searchParams.get('limit')) || 200));
      const data = await getEvents({ force, limit });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/eventstudy') {
      const force = takeForce(url);
      const data = await getEventStudy({ force });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/calendar') {
      const force = takeForce(url);
      const data = await getCalendar({ force });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()), ttlMs: CACHE_TTL_MS });
    }
    // 只读自检：给时区/交易时段判断留一个可断言的入口。
    // isMarketOpen 是模块内函数，外部调不到，改时段逻辑时没法验证对错。
    if (url.pathname === '/api/_market') {
      // 调试端点默认关闭（见 config.js）：它会把内部市场配置整份吐出来
      if (!DEBUG_API) return sendJson(res, 404, { ok: false, error: 'not found' });
      const m = url.searchParams.get('m') || 'us-index';
      const raw = url.searchParams.get('t');
      const t = raw ? new Date(raw) : new Date();
      const p = MARKET_PROFILES[m];
      return sendJson(res, 200, {
        m,
        t: t.toISOString(),
        tz: p?.tz ?? null,
        local: p ? localClock(p.tz ?? 'Asia/Shanghai', t) : null,
        open: isMarketOpen(p, t),
      });
    }
    return serveStatic(res, url.pathname);
  } catch (err) {
    // 对外只给通用文案：err.message 常带路径 / 内部 URL，等于把实现细节发给浏览器
    console.error('[http] 未处理异常', url.pathname, err);
    return sendJson(res, 500, { ok: false, error: '服务器内部错误' });
  }
});

/* 后台定时刷新，保证走势连续（即使没有浏览器打开） */
function startBackground() {
  setInterval(() => {
    // 不能完全静默：上游长期失败时，没有任何日志就只剩「走势断了」这个现象
    getQuotes().catch((err) => {
      console.error('[bg] 后台报价刷新失败', err?.message ?? err);
    });
  }, Math.max(CACHE_TTL_MS, 5000)).unref?.();
}

await migrateLegacyStorage();
await loadPersistedHistory();
await seedHistory();
await loadLlmStore();

server.listen(PORT, HOST, () => {
  // 用实际监听地址：PORT=0 时打印配置值「:0」是错的。LISTENING 那行给程序
  // 消费（集成测试据此拿端口），改中文文案不该让测试挂。
  const a = server.address();
  const port = a && typeof a === 'object' ? a.port : PORT;
  console.log(`市场看板已启动 → http://${HOST}:${port}`);
  console.log(`LISTENING ${port}`);
  if (DISABLE_BACKGROUND) return console.log('后台抓取已禁用');
  console.log(`刷新间隔 ${CACHE_TTL_MS}ms，历史点上限 ${HISTORY_LIMIT}`);
  getQuotes().catch((err) => console.error('[boot] 首轮报价刷新失败', err?.message ?? err));
  startBackground();
});
