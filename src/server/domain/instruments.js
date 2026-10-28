/* ================================================================== *
 * 标的与资产定义 · 波动阈值约束
 *
 * 为什么放在 domain 层独立维护：
 * MOVE_SUSPECT_PCT 是全系统对「各品种常规单日最大合理波动幅度」的统一认知，
 * 被三处不同职责的模块共同引用：
 *   1. 报价新鲜度评级（quotes.service: buildFreshness）—— 盘中超幅打 suspect 标记；
 *   2. 快照持久化（quotes.service: getQuotes -> takeSnapshot）—— 传作 maxJumpPctById 挡脏数据入库；
 *   3. 隔夜复盘计算（domain/briefing-calc: buildBriefing）—— 剔除跨源口径错位的假异动。
 *
 * 统一置于 domain，避免复盘与快照反向依赖上层的 quotes.service。
 * 后续全量标的注册表（INSTRUMENTS 等）也将逐步收拢到此。
 * ================================================================== */

/** 单日变动超过这个幅度基本可以确定是脏数据或极端行情，需要人工看一眼 */
export const MOVE_SUSPECT_PCT = {
  'gold-cn': 8,
  'gold-intl': 10,
  btc: 30,
  oil: 15,
  sp500: 10,
  ndx100: 12,
  sh000001: 10,
  vix: 60,
  vxn: 60,
  // 新增标的：美元/人民币单日 3-4% 已是百年一遇或脏数据，用 20% 默认值会漏判
  dxy: 4,
  usdcny: 3,
  us10y: 15,
};
