/* ================================================================== *
 * 解释卡的取数与交互状态
 *
 * 三个必须守住的点（方案 §8.3）：
 *   1. 资产或窗口变化时取消旧请求 / 用请求序号防止乱序覆盖；
 *   2. 新快照到达时**保留**正在展开的证据，并提示可更新，不重建整个页面；
 *   3. 只用一只委托监听器，避免每次重渲染都叠加一份事件处理。
 *
 * 状态与渲染分离：这里只管「当前该显示什么」，字符串由 card.js 生成。
 * 不 import 任何视图，因此可以在 Node 里单测。
 * ================================================================== */

import { explanationCardHTML } from './card.js';

/** 解释能力开关（方案 §10.3：先置于可关闭的功能开关后） */
export const EXPLAIN_FLAG_KEY = 'explain-card-enabled';

export function explainEnabled() {
  try {
    const v = localStorage.getItem(EXPLAIN_FLAG_KEY);
    return v == null ? true : v !== '0';
  } catch {
    return true;
  }
}

export function setExplainEnabled(on) {
  try {
    localStorage.setItem(EXPLAIN_FLAG_KEY, on ? '1' : '0');
  } catch {
    /* 隐私模式下忽略 */
  }
}

/** 有解释能力的资产（首版黄金；原油/美元/美债属于阶段三） */
export const EXPLAINABLE = new Set(['gold-intl']);

export function isExplainable(assetId) {
  return EXPLAINABLE.has(assetId);
}

/**
 * 一个资产 × 窗口的界面状态。
 * `seq` 是请求序号：只有最新一次请求的结果才能写回，避免慢响应覆盖新选择。
 */
export function createExplainState(assetId) {
  return {
    assetId,
    windowKey: 'session',
    phase: isExplainable(assetId) ? 'loading' : 'unsupported',
    explanation: null,
    meta: null,
    error: null,
    retryAfterMs: null,
    openFactors: new Set(),
    openChecks: false,
    seq: 0,
    staleHint: false,
    unsupported: !isExplainable(assetId),
  };
}

/** 把 HTTP 结果映射成界面状态（200 / 202 / 400 / 404 / 503） */
export function applyResponse(state, { status, body }) {
  if (status === 202) {
    return {
      ...state,
      phase: 'pending',
      explanation: null,
      meta: body?.meta ?? null,
      retryAfterMs: body?.meta?.retryAfterMs ?? 3000,
      error: null,
    };
  }
  if (status === 200 && body?.explanation) {
    return {
      ...state,
      phase: 'ready',
      explanation: body.explanation,
      meta: body.meta ?? null,
      error: null,
      retryAfterMs: null,
    };
  }
  if (status === 404) {
    return { ...state, phase: 'error', error: '这个解释版本已不存在', explanation: null };
  }
  if (status === 503) {
    return {
      ...state,
      phase: 'error',
      error: '解释服务暂时不可用（行情不受影响）',
      meta: body?.meta ?? null,
      explanation: null,
    };
  }
  return { ...state, phase: 'error', error: body?.error ?? `请求失败（HTTP ${status}）`, explanation: null };
}

/**
 * 取一次解释。
 *
 * @param {{assetId:string, windowKey:string, fetchImpl?:Function}} opts
 * @returns {Promise<{status:number, body:object}>}
 */
export async function fetchExplanation({ assetId, windowKey, force = false, fetchImpl } = {}) {
  const f = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!f) return { status: 503, body: { ok: false, error: '当前环境没有 fetch' } };
  const qs = `asset=${encodeURIComponent(assetId)}&window=${encodeURIComponent(windowKey)}${force ? '&force=1' : ''}`;
  try {
    const res = await f(`./api/explanations?${qs}`, { cache: 'no-store' });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body: body ?? {} };
  } catch (err) {
    return { status: 503, body: { ok: false, error: String(err?.message ?? err) } };
  }
}

/**
 * 刷新状态（带序号保护）。
 *
 * 返回新的 state 对象；调用方只有在 `state.seq === 返回值.seq` 时才写回 ——
 * 这就是「旧响应不能覆盖新选择」的实现方式。
 */
export async function refreshExplain(state, { force = false, fetchImpl } = {}) {
  if (!isExplainable(state.assetId)) return { ...state, phase: 'unsupported' };
  const seq = state.seq + 1;
  const base = { ...state, seq, phase: state.explanation ? state.phase : 'loading' };
  const { status, body } = await fetchExplanation({
    assetId: state.assetId,
    windowKey: state.windowKey,
    force,
    fetchImpl,
  });
  return { ...applyResponse(base, { status, body }), seq };
}

/**
 * 窗口切换：保留展开集合（用户读的是同一批机制），但**递增 seq**。
 *
 * 递增的原因：切换是一次用户动作，它让所有在飞请求失效。若不递增，
 * 「慢的 session 请求」和「新的 5d 请求」会拿到同一个序号，
 * 序号保护就形同虚设 —— 旧响应会覆盖新选择。
 */
export function switchWindow(state, windowKey) {
  return {
    ...state,
    windowKey,
    phase: 'loading',
    seq: state.seq + 1,
    explanation: state.explanation,
    meta: state.meta,
  };
}

/** 展开 / 收起单条因素 */
export function toggleFactor(state, mechanismId) {
  const next = new Set(state.openFactors);
  if (next.has(mechanismId)) next.delete(mechanismId);
  else next.add(mechanismId);
  return { ...state, openFactors: next };
}

/** 渲染入口：把状态交给纯字符串渲染器 */
export function renderExplainCard(state, { assetName } = {}) {
  return explanationCardHTML({
    phase: state.phase,
    assetId: state.assetId,
    assetName: assetName ?? state.assetName,
    windowKey: state.windowKey,
    explanation: state.explanation,
    meta: state.meta,
    error: state.error,
    retryAfterMs: state.retryAfterMs,
    openFactors: state.openFactors,
    openChecks: state.openChecks,
  });
}

/**
 * 给一段容器绑定交互（只绑一次）。
 *
 * @param {HTMLElement} root 稳定的容器（不会被整段替换）
 * @param {() => object} getState
 * @param {{ onChange:(next:object, action:string)=>void }} handlers
 */
export function bindExplainInteractions(root, getState, handlers = {}) {
  if (!root || root.dataset.explainBound === '1') return;
  root.dataset.explainBound = '1';
  root.addEventListener('click', (ev) => {
    const target = ev.target instanceof Element ? ev.target.closest('[data-explain-window], [data-explain-toggle], [data-explain-retry], [data-explain-refresh]') : null;
    if (!target) return;
    const state = getState();
    if (target.dataset.explainWindow) {
      handlers.onChange?.(switchWindow(state, target.dataset.explainWindow), 'window');
      return;
    }
    if (target.dataset.explainToggle) {
      handlers.onChange?.(toggleFactor(state, target.dataset.explainToggle), 'toggle');
      return;
    }
    if (target.dataset.explainRetry || target.dataset.explainRefresh) {
      handlers.onChange?.({ ...state, phase: state.explanation ? state.phase : 'loading' }, 'refresh');
    }
  });
}
