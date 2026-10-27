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
import { takeForce } from './src/server/http.js';
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
import { ROOT, PUBLIC_DIR } from './src/server/paths.js';
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

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

/** 客户端源码目录：Phase 2 起 app.js 拆成 ES 模块，由浏览器原生加载，不需要构建 */
const CLIENT_SRC_DIR = path.join(ROOT, 'src', 'client');

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '' || rel === '/') rel = '/index.html';

  // /src/client/** → 仓库里的客户端源码（只开放这一个子树，不暴露 server.mjs 等）
  let root = PUBLIC_DIR;
  if (rel.startsWith('/src/client/')) {
    root = CLIENT_SRC_DIR;
    rel = rel.slice('/src/client'.length);
  }

  const full = path.join(root, path.normalize(rel));
  if (full !== root && !full.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  try {
    const st = await fsp.stat(full);
    if (st.isDirectory()) return serveStatic(res, path.posix.join(rel, 'index.html'));
    const buf = await fsp.readFile(full);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

/* 不发 Access-Control-Allow-Origin：前端同源，不需要 CORS；一旦为 `*`，
   任何网页都能跨域读本机 API（HOST=0.0.0.0 时更糟）。跨域需求走反向代理。 */
function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
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
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    return serveStatic(res, url.pathname);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err?.message ?? String(err) });
  }
});

/* 后台定时刷新，保证走势连续（即使没有浏览器打开） */
function startBackground() {
  setInterval(() => {
    getQuotes().catch(() => {});
  }, Math.max(CACHE_TTL_MS, 5000)).unref?.();
}

await migrateLegacyStorage();
await loadPersistedHistory();
await seedHistory();
await loadLlmStore();

server.listen(PORT, HOST, () => {
  console.log(`市场看板已启动 → http://${HOST}:${PORT}`);
  console.log(`刷新间隔 ${CACHE_TTL_MS}ms，历史点上限 ${HISTORY_LIMIT}`);
  getQuotes().catch(() => {});
  startBackground();
});
