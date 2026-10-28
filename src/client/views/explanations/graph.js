/* ================================================================== *
 * 图谱与解释卡的桥：让图消费**同一份**解释快照
 *
 * 放在 views/explanations/ 而不是 views/macro/：macro/ 子树是构建期源码
 * （打包进 public/vendor/macro-flow.js），不允许被浏览器主入口直接加载；
 * 这个模块同时被主入口侧（详情页）与画布侧使用，所以必须留在可达侧。
 *
 * 方案 §3.3 与 B5 完成标准：「首页结论、详情和图谱的窗口、版本与因素一致」。
 *
 * 三条规则：
 *   1. 图不自己判「为什么」，只按 `mechanismId` 去取同一份 explanation 里
 *      已经算好的渠道状态；
 *   2. 相关状态（ρ20 是否反号）与解释状态是两件事，必须分别显示；
 *      两者不一致时说明原因，不能用一个盖住另一个；
 *   3. 取不到解释时（未开放 / 请求失败）显示「尚未生成」，不退化成一个猜测。
 *
 * 纯函数 + 一个带缓存的取数函数，可单测。
 * ================================================================== */

import { fetchExplanation, isExplainable } from './state.js';

/**
 * 传导边 → 解释渠道。
 *
 * 只有确实对应某条已登记机制时才映射：相关边（E17 权重重叠）与
 * 计价换算边（E16 / E18）故意不映射 —— 它们不是方向性机制。
 */
export const EDGE_MECHANISM = {
  E01: 'M-GOLD-USD',
  E05: 'M-GOLD-NOMINAL-RATE',
  E08: 'M-GOLD-OIL-POLICY',
  E15: 'M-GOLD-RISK',
  E02: 'M-OIL-USD',
  E09: 'M-GOLD-OIL-POLICY',
};

const STATUS_TEXT = {
  consistent: '观测与机制一致',
  mixed: '支持与反向证据并存',
  not_supported: '当前证据不支持',
  untested: '尚未确认',
};

/** mechanismId → 渠道状态，便于 O(1) 取用 */
export function factorIndex(explanation) {
  const map = new Map();
  for (const h of explanation?.hypotheses ?? []) {
    map.set(h.mechanismId, {
      mechanismId: h.mechanismId,
      label: h.label,
      status: h.status,
      statusText: STATUS_TEXT[h.status] ?? h.status,
      reasons: h.reasons ?? [],
      plain: h.plain ?? null,
      evidenceCount: (h.evidence ?? []).length,
    });
  }
  return map;
}

/**
 * 某条边在图上的解释状态。
 *
 * @param {string} edgeId
 * @param {object|null} explanation 同一份解释快照
 * @param {object} [realityRow] 相关性判定结果（reality.get(edgeId)）
 */
export function edgeExplanationOf(edgeId, explanation, realityRow = null) {
  const mechanismId = EDGE_MECHANISM[edgeId];
  if (!mechanismId) {
    return { available: false, note: '这条边不是方向性机制（计价换算 / 共同驱动），不做解释判定' };
  }
  const idx = factorIndex(explanation);
  const hit = idx.get(mechanismId);
  if (!hit) {
    return { available: false, mechanismId, note: '这份解释里没有这条渠道（可能窗口不同或尚未生成）' };
  }
  // 相关状态：ρ20 与理论反号 = 相关层面「不同向」
  const corrDiverged = realityRow?.status === 'diverged';
  const corrAligned = realityRow?.status === 'aligned';
  let coincide = null;
  if (corrDiverged) coincide = hit.status === 'not_supported' || hit.status === 'mixed';
  else if (corrAligned) coincide = hit.status === 'consistent';
  let note = null;
  if (coincide === false) {
    note =
      hit.status === 'untested'
        ? '相关在动，但机制缺必要条件：这不矛盾，一个说的是统计同向，一个说的是机制能否检验'
        : '统计相关与机制判定不一致：以机制判定为准，相关只说明过去同向的程度';
  }
  return { available: true, mechanismId, ...hit, coincide, note };
}

/**
 * 取一份解释给图用（按资产缓存，60 秒内复用）。
 *
 * 与详情页共用同一个接口与同一份快照：只要窗口相同、数据没更新，
 * explanationId 就相同。
 */
const cache = new Map();
const TTL_MS = 60_000;

export async function loadGraphExplanation(assetId, { windowKey = 'session', force = false, fetchImpl } = {}) {
  if (!isExplainable(assetId)) return null;
  const key = `${assetId}|${windowKey}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.explanation;
  const { status, body } = await fetchExplanation({ assetId, windowKey, fetchImpl });
  if (status !== 200 || !body?.explanation) {
    cache.set(key, { at: Date.now(), explanation: null });
    return null;
  }
  cache.set(key, { at: Date.now(), explanation: body.explanation });
  return body.explanation;
}

export function clearGraphExplanationCache() {
  cache.clear();
}

/** 图谱里展示「同一份解释」的摘要块（焦点卡用） */
export function graphExplanationBlock(explanation, { assetId, windowKey = 'session' } = {}) {
  if (!explanation) {
    return `<div class="mg-sect"><i class="dot"></i><h4>这次为什么动</h4>
      <p class="mg-foot-note">这份资产的解释还没生成（或本次取数失败）。图上只显示统计相关，不替代解释。</p></div>`;
  }
  const top = (explanation.hypotheses ?? []).filter((h) => h.relationType === 'mechanism').slice(0, 3);
  return `<div class="mg-sect"><i class="dot"></i><h4>这次为什么动（与详情页同一份解释）</h4>
    <p class="mg-sect-note">${escText(explanation.summary ?? '')}</p>
    <ul class="mg-mini-list">${top
      .map((h) => {
        const tone = h.status === 'consistent' ? 'pos' : h.status === 'mixed' ? 'warn' : 'cold';
        return `<li class="mg-mini"><span class="mg-mini-name">${escText(h.label ?? h.mechanismId)}</span>
          <span class="mg-ex-status ${tone}">${escText(STATUS_TEXT[h.status] ?? h.status)}</span></li>`;
      })
      .join('')}</ul>
    <p class="mg-foot-note">窗口 ${escText(windowKey)} · 版本 ${escText(explanation.id ?? '—')} ·
      <a href="./#/d/${encodeURIComponent(assetId)}">在详情页看依据</a></p></div>`;
}

/** 最小转义：图模块不 import 视图层的 format（避免把视图依赖带进画布包） */
function escText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
