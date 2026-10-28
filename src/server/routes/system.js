/* ================================================================== *
 * 系统自检路由：健康状态与市场时段探针
 *
 * 从 server.mjs 抽出来（方案 E08 + 入口薄壳）：这两条都是「只读、无副作用、
 * 不依赖业务服务」的端点，放在入口里只会让薄壳越来越厚。
 * ================================================================== */

import { sendJson } from '../http.js';
import { DEBUG_API, MAINTENANCE_API } from '../config.js';
import { MARKET_PROFILES, localClock, isMarketOpen } from '../domain/market-hours.js';
import { buildHealth } from '../observability/health.js';

/**
 * 进程内备份：只有在这里跑，`flush()` 才能排空**正在跑的这个进程**的缓冲
 * （分时环形缓冲、注脚）。CLI 版 `tools/backup.mjs` 拿不到另一个进程的内存，
 * 所以要么先停服务，要么走这个端点。
 *
 * @param {URL} url
 * @param {import('node:http').ServerResponse} res
 * @param {{ outDir?:string, keep?:number, appVersion?:string }} opts
 */
async function handleMaintenanceBackup(url, res, opts) {
  const { createBackup } = await import('../db/maintenance.js');
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outRoot = opts.outDir ?? 'backups';
    const { dir, manifest } = await createBackup(`${outRoot}/${stamp}`, {
      keep: opts.keep ?? 5,
      appVersion: opts.appVersion ?? null,
    });
    sendJson(res, 200, { ok: true, dir, manifest: { ...manifest, files: `${manifest.files.length} 个文件` } });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err?.message ?? err) });
  }
}

/**
 * @param {URL} url
 * @param {import('node:http').ServerResponse} res
 * @param {{ ttlMs:number, jobs:() => object[], debug?:boolean }} deps
 *        debug 默认取配置；测试里可以直接传，避免为了改一个开关重新 import 整个模块链
 * @returns {boolean} 是否已处理
 */
export function handleSystemRoutes(
  url,
  res,
  { ttlMs, jobs, debug = DEBUG_API, maintenance = MAINTENANCE_API, method = 'GET' },
) {
  // 调度状态也在这里暴露：没有它，只能靠「页面像不像在动」判断后台还活着
  if (url.pathname === '/api/health') {
    sendJson(res, 200, buildHealth({ uptime: Math.round(process.uptime()), ttlMs, jobs: jobs() }));
    return true;
  }

  // 只读自检：给时区/交易时段判断留一个可断言的入口。
  // isMarketOpen 是模块内函数，外部调不到，改时段逻辑时没法验证对错。
  if (url.pathname === '/api/_market') {
    // 调试端点默认关闭（见 config.js）：它会把内部市场配置整份吐出来
    if (!debug) {
      sendJson(res, 404, { ok: false, error: 'not found' });
      return true;
    }
    const m = url.searchParams.get('m') || 'us-index';
    const t = new Date(url.searchParams.get('t') ?? Date.now());
    const p = MARKET_PROFILES[m];
    sendJson(res, 200, {
      m,
      t: t.toISOString(),
      tz: p?.tz ?? null,
      local: p ? localClock(p.tz ?? 'Asia/Shanghai', t) : null,
      open: isMarketOpen(p, t),
    });
    return true;
  }

  if (url.pathname === '/api/maintenance/backup') {
    // 维护端点默认关闭：它会停写并生成整份数据副本，不该是公网可点的按钮
    if (!maintenance) {
      sendJson(res, 404, { ok: false, error: 'not found' });
      return true;
    }
    // 只认 POST：GET 触发整份备份会被浏览器预取、被爬虫误触
    // 方法从调用方传进来（URL 对象本身不带 method）
    if (method !== 'POST') {
      sendJson(res, 405, { ok: false, error: '请用 POST 触发备份' });
      return true;
    }
    void handleMaintenanceBackup(url, res, {
      outDir: url.searchParams.get('out') ?? undefined,
      keep: Number(url.searchParams.get('keep')) || undefined,
      appVersion: url.searchParams.get('v') ?? undefined,
    });
    return true;
  }

  return false;
}
