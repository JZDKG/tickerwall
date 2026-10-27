/* ================================================================== *
 * 全球热点巡航（Auto-Pilot Spotlight）
 *
 * 两个纯函数：
 *   buildSpotlightQueue  —— 从事件流里挑出一条播放顺序
 *   spotlightReducer     —— 状态机（Auto / Preview / Locked / Replay）
 *
 * 它们都不碰 DOM 也不碰定时器，时间从 action 里带进来（`now`），
 * 所以能直接单测「无交互 20s 自动恢复」这种时序行为，不用等真实时间。
 * ================================================================== */

import { matchFilter, dominantTopic } from './filters.js';

export const MODES = {
  AUTO: 'auto',
  PREVIEW: 'preview',
  LOCKED: 'locked',
  REPLAY: 'replay',
};

/** 无交互多久回落到巡航 */
export const IDLE_RESUME_MS = 20000;

/** 队列里最多几条高优事件 */
export const QUEUE_HIGH_LIMIT = 12;

/** 连续几条同主题就要打散 */
export const SAME_TOPIC_RUN = 3;

/** 单步停留时长 */
export const STEP_MS = 6000;

export function createSpotlightState() {
  return {
    mode: MODES.AUTO,
    queue: [],
    index: 0,
    /** Preview 结束后要回到哪个模式 */
    returnTo: MODES.AUTO,
    /** 被锁定的那条事件 id */
    lockedId: null,
    /** 最近一次用户交互时刻，用于判断是否该自动恢复 */
    lastInteractAt: 0,
    playing: true,
  };
}

/**
 * 挑出巡航顺序。
 *
 * 规则（与计划一致）：
 *   1. 当前滤镜下，取最近的高优事件（level === 'high' 且能落到具体城市）；
 *   2. 不够就按 score 从高到低补 mid；
 *   3. 连续三条同主题时把第三条往后挪，避免连续讲同一件事。
 *
 * `hasTargets` 由调用方注入（map.js 用 targetCitiesFor），这样 logic 层
 * 不依赖 geo/cities.js，测试也不用造地理数据。
 */
export function buildSpotlightQueue(items, {
  filterKey = 'all',
  region = null,
  hasTargets = () => true,
  highLimit = QUEUE_HIGH_LIMIT,
  nowMs = Date.now(),
} = {}) {
  const pool = (Array.isArray(items) ? items : []).filter((ev) => {
    if (region && ev.region !== region) return false;
    if (!matchFilter(ev, filterKey)) return false;
    return hasTargets(ev);
  });

  const byTime = (a, b) => (String(b.time ?? '')).localeCompare(String(a.time ?? ''));
  const high = pool.filter((ev) => ev.level === 'high').sort(byTime).slice(0, highLimit);
  const chosen = new Set(high.map((ev) => ev.id));

  if (high.length < highLimit) {
    const filler = pool
      .filter((ev) => !chosen.has(ev.id) && ev.level === 'mid')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || byTime(a, b))
      .slice(0, highLimit - high.length);
    high.push(...filler);
  }

  return breakTopicRuns(high, SAME_TOPIC_RUN);
}

/**
 * 打散连续三连主题：发现第 i 条与前两条同主题时，和后面第一个不同主题的交换。
 * 找不到可交换的就保持原样（宁可连着播，也不打乱时间序太多）。
 */
export function breakTopicRuns(list, run = SAME_TOPIC_RUN) {
  const out = [...list];
  const keyOf = (ev) => dominantTopic(ev)?.key ?? null;

  for (let i = run - 1; i < out.length; i += 1) {
    const k = keyOf(out[i]);
    if (!k) continue;
    let same = true;
    for (let j = 1; j < run; j += 1) {
      if (keyOf(out[i - j]) !== k) { same = false; break; }
    }
    if (!same) continue;
    // 从 i+1 往后找第一个主题不同的，交换位置
    for (let m = i + 1; m < out.length; m += 1) {
      if (keyOf(out[m]) !== k) {
        const tmp = out[i];
        out[i] = out[m];
        out[m] = tmp;
        break;
      }
    }
  }
  return out;
}

/**
 * 状态机。
 *
 * action:
 *   { type: 'tick', now }            自动巡航推进一步
 *   { type: 'hover', id }            悬停事件条目 → Preview
 *   { type: 'unhover' }              Preview 结束，回到进入前的模式
 *   { type: 'click', id, now }       点击 → Locked
 *   { type: 'resume', now }          点「恢复巡航」/ 空格
 *   { type: 'idle', now }            定时器问「该恢复了吗」
 *   { type: 'setQueue', queue }      事件轮询后更新队列（保持当前那条不中断）
 *   { type: 'setPlaying', playing }  暂停 / 继续
 *   { type: 'replay' }               进入回放
 *   { type: 'replayEnd', now }       回放结束
 */
export function spotlightReducer(state, action) {
  switch (action?.type) {
    case 'tick': {
      // Preview / Locked / Replay 都不自动推进；暂停也不推进
      if (state.mode !== MODES.AUTO || !state.playing || !state.queue.length) return state;
      return { ...state, index: (state.index + 1) % state.queue.length };
    }

    case 'hover': {
      // 已经在 Locked 时，悬停只预览不改变锁定
      if (state.mode === MODES.LOCKED) return { ...state, previewId: action.id ?? null };
      if (state.mode === MODES.PREVIEW) return { ...state, previewId: action.id ?? null };
      return {
        ...state,
        mode: MODES.PREVIEW,
        returnTo: state.mode,
        previewId: action.id ?? null,
        lastInteractAt: action.now ?? state.lastInteractAt,
      };
    }

    case 'unhover': {
      if (state.mode !== MODES.PREVIEW) return { ...state, previewId: null };
      return { ...state, mode: state.returnTo ?? MODES.AUTO, previewId: null, lastInteractAt: action.now ?? state.lastInteractAt };
    }

    case 'click': {
      const idx = action.id ? state.queue.findIndex((ev) => ev.id === action.id) : -1;
      return {
        ...state,
        mode: MODES.LOCKED,
        returnTo: MODES.AUTO,
        lockedId: action.id ?? null,
        previewId: null,
        index: idx >= 0 ? idx : state.index,
        lastInteractAt: action.now ?? state.lastInteractAt,
      };
    }

    case 'resume':
    case 'replayEnd': {
      return {
        ...state,
        mode: MODES.AUTO,
        returnTo: MODES.AUTO,
        lockedId: null,
        previewId: null,
        lastInteractAt: action.now ?? state.lastInteractAt,
      };
    }

    case 'idle': {
      // 只有 Locked 会因闲置自动恢复；Preview 由鼠标移出自己结束
      if (state.mode !== MODES.LOCKED) return state;
      const now = action.now ?? 0;
      if (now - (state.lastInteractAt ?? 0) < IDLE_RESUME_MS) return state;
      return { ...state, mode: MODES.AUTO, returnTo: MODES.AUTO, lockedId: null, previewId: null };
    }

    case 'setQueue': {
      const next = Array.isArray(action.queue) ? action.queue : [];
      if (!next.length) return { ...state, queue: next, index: 0, lockedId: null, previewId: null };
      // 正在播的那条如果还在新队列里，保持播放位置，不要跳回首条
      const currentId = state.queue[state.index]?.id;
      const keep = currentId ? next.findIndex((ev) => ev.id === currentId) : -1;
      const index = keep >= 0 ? keep : Math.min(state.index, next.length - 1);
      return { ...state, queue: next, index: Math.max(0, index) };
    }

    case 'setPlaying':
      return { ...state, playing: Boolean(action.playing) };

    case 'replay':
      return { ...state, mode: MODES.REPLAY, lockedId: null, previewId: null, lastInteractAt: action.now ?? state.lastInteractAt };

    default:
      return state;
  }
}

/** 当前该高亮哪条事件（Preview 优先，其次 Locked，其次巡航位） */
export function currentSpotlightEvent(state) {
  if (!state) return null;
  if (state.previewId) return state.queue.find((ev) => ev.id === state.previewId) ?? null;
  if (state.mode === MODES.LOCKED && state.lockedId) {
    return state.queue.find((ev) => ev.id === state.lockedId) ?? null;
  }
  if (state.mode === MODES.AUTO) return state.queue[state.index] ?? null;
  return null;
}

/** 是否需要为 Locked 起一个闲置恢复定时器 */
export function needsIdleTimer(state, nowMs) {
  if (state?.mode !== MODES.LOCKED) return 0;
  const left = IDLE_RESUME_MS - (nowMs - (state.lastInteractAt ?? 0));
  return Math.max(0, left);
}
