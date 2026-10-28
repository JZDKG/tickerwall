/* ================================================================== *
 * 健康状态（方案 E08 / §9.3）
 *
 * 三种状态分开，别混成一个 `ok: true`：
 *   · 存活   —— 进程能响应（这个函数被调用就说明还活着）
 *   · 就绪   —— 迁移完成、存储可读写、静态入口在；不就绪时不该接流量
 *   · 数据健康 —— 各来源最后成功时间与降级原因（由调度器状态提供）
 *
 * 还多报一项「契约」：schema 能否编译、注册表是否自洽。这一项挂了不会让
 * 进程起不来，但意味着边界校验可能没生效 —— 属于必须能被看见的问题。
 * ================================================================== */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contractInfo } from '../contracts/index.js';
import { queueStats } from '../jobs/queue.js';
import { SOURCES, sourceAvailability, validateRegistry } from '../providers/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** 就绪检查：只查「不查就不能服务」的东西，不碰网络 */
export function checkReadiness({ dataDir = process.env.KANBAN_DATA_DIR || path.join(ROOT, 'data') } = {}) {
  const reasons = [];
  const staticFiles = ['public/index.html', 'public/app.js', 'src/client/main.js'];
  for (const f of staticFiles) if (!existsSync(path.join(ROOT, f))) reasons.push(`缺少静态文件 ${f}`);
  try {
    // 数据目录要能建（已存在则什么都不做）
    mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    reasons.push(`数据目录不可写：${dataDir}（${err?.code ?? err}）`);
  }

  let contracts = { ok: true, errors: [] };
  try {
    const info = contractInfo();
    if (!info.contracts.length) contracts = { ok: false, errors: ['没有编译任何契约'] };
  } catch (err) {
    contracts = { ok: false, errors: [String(err?.message ?? err)] };
  }
  if (!contracts.ok) reasons.push(`契约校验不可用：${contracts.errors.join('; ')}`);

  const registryErrors = validateRegistry();
  if (registryErrors.length) reasons.push(`来源注册表不自洽：${registryErrors.slice(0, 3).join('; ')}`);

  return { ready: reasons.length === 0, reasons };
}

/**
 * 组装 /api/health 的响应体。
 *
 * 保持旧字段（ok / uptime / ttlMs / jobs）不变，只新增：
 *   readiness —— 就绪与否 + 具体原因
 *   contracts —— 已编译契约数量
 *   sources   —— 已注册来源数 + 当前不可用的（缺凭据的会在这里点名）
 *
 * @param {{uptime:number, ttlMs:number, jobs:object[], env?:object}} input
 */
export function buildHealth({ uptime, ttlMs, jobs = [], env = process.env }) {
  const readiness = checkReadiness();
  const unavailable = Object.keys(SOURCES)
    .map((id) => ({ id, ...sourceAvailability(id, env) }))
    .filter((s) => !s.available)
    .map((s) => ({ id: s.id, reason: s.reason }));

  let contracts = null;
  try {
    const info = contractInfo();
    contracts = { compiled: info.contracts.length, names: info.contracts };
  } catch {
    contracts = { compiled: 0, names: [] };
  }

  /**
   * 队列积压也要能看见（§9.3「数据健康」）。
   * 只看 HTTP 200 是看不出「重建任务全卡在 dead」的。
   */
  let jobsQueue = null;
  try {
    jobsQueue = queueStats();
  } catch {
    jobsQueue = null; // 库还没就绪时不该让健康接口整体失败
  }

  return {
    ok: readiness.ready,
    uptime,
    ttlMs,
    jobs,
    readiness,
    contracts,
    sources: { registered: Object.keys(SOURCES).length, unavailable },
    queue: jobsQueue,
  };
}
