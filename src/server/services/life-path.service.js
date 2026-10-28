/* ================================================================== *
 * 生活场景的服务层（产品 2.6）
 *
 * 只做一件事：把「上游此刻的变化」接到 domain 的路径上。
 * 上游取不到时**照样返回路径**，只是头条说「没有明显方向」——
 * 机制说明不依赖实时数据，藏起整页反而更糟。
 * ================================================================== */

import { getQuotes } from './quotes.service.js';
import { buildLifePath, listScenarios, scenarioOf } from '../domain/life-path.js';

/** 从报价里找上游资产的窗口变化 */
function upstreamOf(quotes, assetId) {
  const row = (quotes ?? []).find((q) => q?.id === assetId && q.ok !== false);
  if (!row) return null;
  return { changePct: row.changePct ?? null, asOf: row.asOf ?? null };
}

/**
 * @param {{ scenario?: string, deps?: { getQuotes?: Function } }} opts
 */
export async function getLifePath({ scenario = 'fuel-cost', deps = {} } = {}) {
  const spec = scenarioOf(scenario);
  if (!spec) {
    return { ok: false, reason: 'UNKNOWN_SCENARIO', scenarios: listScenarios(), steps: [], gaps: [] };
  }

  const load = deps.getQuotes ?? getQuotes;
  let quotes = [];
  let upstreamError = null;
  try {
    const payload = await load({ force: false });
    quotes = payload?.items ?? payload ?? [];
  } catch (err) {
    // 上游取不到不是致命：机制那一半仍然可读
    upstreamError = String(err?.message ?? err);
  }

  const path = buildLifePath({ id: scenario, upstream: upstreamOf(quotes, spec.upstream) });
  return { ...path, scenarios: listScenarios(), upstreamError };
}
