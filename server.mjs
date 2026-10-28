#!/usr/bin/env node
/**
 * 市场看板 —— 入口（只负责装配与生命周期）
 *
 * 职责边界（方案 §4.2 / E08）：
 *   · 这里：读配置、装依赖、开始监听、处理信号、干净退出；
 *   · 不在这里：路由表（src/server/app.js）、请求日志（observability/log.js）、
 *     业务（services/）、存储（db/）。
 *
 * 启动：node server.mjs   （默认 http://127.0.0.1:8787）
 */
import http from 'node:http';
import { sendText, guardServerErrors } from './src/server/http.js';
import { PORT, HOST, DISABLE_BACKGROUND } from './src/server/config.js';
import { createApp } from './src/server/app.js';
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
import { startCollector } from './src/server/jobs/collector.js';
import { buildDefaultJobs, recoverPendingJobs } from './src/server/jobs/index.js';
import { installShutdown } from './src/server/lifecycle.js';
import { createLogger, withRequestLog } from './src/server/observability/log.js';

const logger = createLogger();

/* 不发 Access-Control-Allow-Origin：前端同源，不需要 CORS；一旦为 `*`，
   任何网页都能跨域读本机 API（HOST=0.0.0.0 时更糟）。跨域需求走反向代理。 */

/** 采集调度器实例（启动后才有值；/api/health 读它的状态） */
let collector = null;

const handle = createApp({
  getQuotes,
  buildBriefing,
  getDetail,
  getMacro,
  getEvents,
  getEventHistory,
  getEventStudy,
  getCalendar,
  ttlMs: CACHE_TTL_MS,
  jobs: () => collector?.status?.() ?? [],
});

/**
 * 请求日志在外层包一层：一次请求恰好一条（含 404 / 500 / 维护端点）。
 * 放这里而不是路由里：路由有十几个分支，逐个加必漏。
 */
const logged = withRequestLog({ run: handle, log: logger });

const server = http.createServer((req, res) => {
  logged(req, res).catch((err) => {
    logger.error('http.unhandled', { method: req.method, url: req.url, error: String(err?.message ?? err) });
    // 头已经发出去就没法再改状态码了，只能断开，别让半截响应吊着
    if (res.headersSent) return res.destroy();
    sendText(res, 500, '服务器内部错误');
  });
});

/* 后台采集：报价 / 新闻 / 日历 / 日频指标 / 解释重建，各自独立退避。
   即使没有浏览器打开也照常运行（§7.3）；同键任务由调度器合并。 */
function startBackground() {
  // 上次进程退出时卡在 running 的可恢复任务，先放回 pending 再开始调度
  const recovered = recoverPendingJobs();
  if (recovered) logger.info('jobs.recovered', { count: recovered });
  const started = startCollector({
    jobs: buildDefaultJobs(),
    everyMs: 15_000,
    onError: (jobKey, err) => logger.warn('jobs.failed', { jobId: jobKey, error: String(err?.message ?? err) }),
  });
  collector = started.collector;
  return started;
}

/* 进程级兜底：这是本地看板，宁可带着错误继续服务，也不要因为一次未处理
   的拒绝就整站消失。日志必须留，否则只剩「页面打不开」这一个现象。
   启动期错误（端口被占等）该崩就崩，吞掉会让启动脚本以为成功。 */
let listening = false;
guardServerErrors(server, { host: HOST, port: PORT }, () => listening);

process.on('unhandledRejection', (err) => logger.error('process.unhandledRejection', { error: String(err?.stack ?? err) }));
process.on('uncaughtException', (err) => {
  logger.error('process.uncaughtException', { error: String(err?.stack ?? err) });
  if (!listening) process.exit(1);
});

await migrateLegacyStorage();
await loadPersistedHistory();
await seedHistory();
await loadLlmStore();

const shutdown = installShutdown({ server, stopBackground: () => collector?.stop?.(), log: logger });

server.listen(PORT, HOST, () => {
  // 用实际监听地址：PORT=0 时打印配置值「:0」是错的。LISTENING 那行给程序
  // 消费（集成测试据此拿端口），改中文文案不该让测试挂。
  const a = server.address();
  const port = a && typeof a === 'object' ? a.port : PORT;
  listening = true;
  logger.info('server.listening', { host: HOST, port, background: !DISABLE_BACKGROUND });
  console.log(`市场看板已启动 → http://${HOST}:${port}`);
  console.log(`LISTENING ${port}`);
  if (DISABLE_BACKGROUND) return console.log('后台抓取已禁用');
  console.log(`刷新间隔 ${CACHE_TTL_MS}ms，历史点上限 ${HISTORY_LIMIT}`);
  startBackground();
});

export { server, shutdown };
