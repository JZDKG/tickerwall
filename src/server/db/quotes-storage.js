/* ================================================================== *
 * 分时走势的存储层
 *
 * 从 services/quotes.service.js 拆出来（那边 1503 行混了六种职责）。
 * 这里只管「走势点怎么存、怎么落盘、怎么恢复」，不管报价从哪个源来。
 *
 * 为什么独立成层：`ring` 是被四处共享的单例状态 ——
 *   resolveInstrument   写（pushHistory）
 *   scheduleHistorySave 读（ring.entries → 落盘）
 *   seedPoints/seedHistory 填（补日内缺口）
 *   loadPersistedHistory 恢复（启动时回灌）
 * 把它们收在一个模块里，这份状态才有明确的归属；散在服务层里时，
 * 「谁在什么时候改它」要靠翻 700 行才知道。
 *
 * 结构与两条写入护栏都在 domain/history-ring.js，这里只持唯一实例。
 * ================================================================== */

import { createHistoryRing } from '../domain/history-ring.js';

/** 每个标的保留的分时点数上限（240 点 × 5 分钟 ≈ 一个交易日） */
export const HISTORY_LIMIT = 240;

export const ring = createHistoryRing({ limit: HISTORY_LIMIT });

/** 兼容层：保留原函数名与签名，调用点一行未改 */
export function pushHistory(id, price, t = Date.now(), decimals = 2, meta = {}) {
  return ring.push(id, price, t, decimals, meta);
}
