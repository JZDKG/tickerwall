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
import { publishExplanation } from '../../shared/explanation-store.js';
import { loadExplanationHistory, loadExplanationVersion, historyListHTML, replayBannerHTML } from './history.js';
import { diffPanelHTML, diffToggleHTML } from './diff-panel.js';

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

/**
 * 有解释能力的资产。
 *
 * C1 已完成黄金与原油；美元与美债的机制库还没写，所以这里不放开 ——
 * 界面上未开放的资产会显示「解释能力还没开放」，而不是给一个空壳。
 */
export const EXPLAINABLE = new Set(['gold-intl', 'oil', 'us10y', 'dxy']);

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
    // 历史回放（C3）：非 null 时卡片显示的是「当时那份」，不是当前状态
    history: [],
    historyStatus: 'idle',
    replay: null,
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
    /**
     * 发布到共享注册表（方案 E07 / §8）：首页、详情、图谱、地图读同一个
     * explanationId。旧快照晚到会被注册表按 generatedAt 丢掉 —— 界面不会
     * 因为一次慢响应退回上一版。
     */
    publishExplanation({ assetId: state.assetId, windowKey: state.windowKey, envelope: body });
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
  const replay = state.replay ?? null;
  /**
   * 回放时用**当时那份快照**渲染，但把新鲜度判定摘掉：
   * 用今天的时钟去说一份历史解释「已过期」没有意义，横幅已经说明它不是当前状态。
   */
  const card = explanationCardHTML({
    phase: replay ? 'ready' : state.phase,
    assetId: state.assetId,
    assetName: assetName ?? state.assetName,
    windowKey: state.windowKey,
    explanation: replay ? replay.explanation : state.explanation,
    meta: replay ? { ...(state.meta ?? {}), freshness: null, freshnessReasons: [], backgroundStale: [] } : state.meta,
    error: state.error,
    retryAfterMs: state.retryAfterMs,
    openFactors: state.openFactors,
    openChecks: state.openChecks,
  });
  const banner = replay ? replayBannerHTML(replay) : '';
  // 只有拿到过至少两版才显示「此前的解释」，否则是一行空壳
  const history = historyListHTML({ items: state.history, currentId: state.explanation?.id ?? null });
  /**
   * 变化记录入口（产品 2.2）：只有拿过至少两版才显示 —— 第一版没有可比对象，
   * 给一个点了只会说「这是第一版」的按钮是浪费用户一次点击。
   */
  const canDiff = (state.history?.length ?? 0) > 1 && Boolean(state.explanation?.id);
  const diffEntry = canDiff
    ? `${diffToggleHTML(state.explanation.id)}<div class="explain-diff-slot" data-explain-diff-slot="1"></div>`
    : '';
  return `${banner}${card}${history}${diffEntry}`;
}

/**
 * 取历史版本列表（回放入口用）。
 *
 * 失败不影响当前卡片：列表拿不到就什么都不显示，不显示一个「加载中」空壳。
 */
/**
 * 取某一版相对上一版的变化记录（产品 2.2）。
 *
 * 失败不抛：返回 { status, body }，界面用 diffPanelHTML 决定显示什么。
 */
export async function fetchExplanationDiff(id, { withId = null, fetchImpl } = {}) {
  if (!id) return { status: 400, body: { ok: false, error: '缺少解释版本号' } };
  const f = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!f) return { status: 503, body: { ok: false, error: '当前环境没有 fetch' } };
  const qs = withId ? `?with=${encodeURIComponent(withId)}` : '';
  try {
    const res = await f(`./api/explanations/${encodeURIComponent(id)}/diff${qs}`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body: body ?? {} };
  } catch (err) {
    return { status: 503, body: { ok: false, error: String(err?.message ?? err) } };
  }
}

export async function refreshHistory(state, { fetchImpl } = {}) {
  if (!isExplainable(state.assetId)) return state;
  const { status, items } = await loadExplanationHistory({
    assetId: state.assetId,
    windowKey: state.windowKey,
    fetchImpl,
  });
  return { ...state, history: status === 200 ? items : [], historyStatus: status === 200 ? 'ok' : 'failed' };
}

/**
 * 切换到某一版历史快照。
 *
 * 回放**不走缓存**：读的就是这一条 id，避免被「最新快照」顶掉。
 */
export async function viewVersion(state, id, { fetchImpl } = {}) {
  if (!id) return state;
  const { status, body } = await loadExplanationVersion(id, { fetchImpl });
  if (status !== 200 || !body?.explanation) return { ...state, error: body?.error ?? '这个版本取不到' };
  return {
    ...state,
    replay: {
      id,
      explanation: body.explanation,
      asOf: body.explanation.asOf,
      generatedAt: body.explanation.generatedAt,
      versions: body.explanation.versions,
    },
  };
}

/** 回到当前解释 */
export function backToCurrent(state) {
  return { ...state, replay: null };
}

/**
 * 给一段容器绑定交互（只绑一次）。
 *
 * @param {HTMLElement} root 稳定的容器（不会被整段替换）
 * @param {() => object} getState
 * @param {{ onChange:(next:object, action:string, payload?:object)=>void }} handlers
 *        action: window | toggle | refresh | version | current
 */
export function bindExplainInteractions(root, getState, handlers = {}) {
  if (!root || root.dataset.explainBound === '1') return;
  root.dataset.explainBound = '1';
  root.addEventListener('click', (ev) => {
    const target =
      ev.target instanceof Element
        ? ev.target.closest(
            '[data-explain-window], [data-explain-toggle], [data-explain-retry], [data-explain-refresh], [data-explain-version], [data-explain-current], [data-explain-diff]',
          )
        : null;
    if (!target) return;
    const state = getState();
    // 历史回放（C3）：切到某一版 / 回到当前。两者都不触发新的生成
    if (target.dataset.explainVersion) {
      handlers.onChange?.(state, 'version', { versionId: target.dataset.explainVersion });
      return;
    }
    if (target.dataset.explainCurrent) {
      handlers.onChange?.(backToCurrent(state), 'current');
      return;
    }
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
      return;
    }
    /**
     * 变化记录（产品 2.2）。之前只有按钮和空插槽，**没有任何人填它** ——
     * 用户点了「和上一版差在哪？」什么都不会发生。这里补上真正的取数 + 渲染：
     * 再点一次收起（不重复请求）。
     */
    if (target.dataset.explainDiff) {
      const slot = root.querySelector('[data-explain-diff-slot]');
      if (!slot) return;
      const wasOpen = slot.dataset.open === '1';
      if (wasOpen) {
        slot.dataset.open = '0';
        slot.innerHTML = '';
        target.setAttribute('aria-expanded', 'false');
        return;
      }
      slot.dataset.open = '1';
      target.setAttribute('aria-expanded', 'true');
      slot.innerHTML = '<p class="explain-diff-loading">正在对比上一版…</p>';
      void fetchExplanationDiff(target.dataset.explainDiff, { fetchImpl: handlers.fetchImpl }).then(({ status, body }) => {
        // 失败也给可读内容：diffPanelHTML 自己决定说「没有上一版」还是「取不到」
        slot.innerHTML = diffPanelHTML({ status, body });
      });
    }
  });
}
