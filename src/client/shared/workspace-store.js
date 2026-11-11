/* ================================================================== *
 * 工作台偏好（P2-T1）
 *
 * 用与 zustand/vanilla 相同的 subscribe/ setState 语义管理四条偏好，
 * 不引入浏览器裸模块名：业务代码保持零构建的原生 ES Module。真正的
 * zustand/vanilla 由 ui-kit 受管产物导出，供后续 React 视图复用。
 * ================================================================== */

import { store } from './store.js';

export const PREF_STORAGE_KEY = 'tw.preferences.v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  colorScheme: 'cn',        // cn 红涨绿跌 | intl 绿涨红跌 | cb 蓝橙色盲友好
  theme: 'dark',            // dark 深空黑 | oled 纯黑 | light 浅色研报
  density: 'grouped',       // grouped 分组 | wall 磁贴墙 | flat 平铺
  anchorClock: 'default',   // default 前收 | ashare_close A股收盘 | intraday_open 分时首点
});

const ENUMS = {
  colorScheme: ['cn', 'intl', 'cb'],
  theme: ['dark', 'oled', 'light'],
  density: ['grouped', 'wall', 'flat'],
  anchorClock: ['default', 'ashare_close', 'intraday_open'],
};

// 原生 store.js 上的偏好初值；workspace-store 接管后由它单向写入
store.preferences = store.preferences ?? { ...DEFAULT_PREFERENCES };

/** 本地数据可能被手改：只保留枚举内的值，其余逐项回退默认 */
export function normalizePreferences(raw) {
  const out = {};
  for (const [key, allowed] of Object.entries(ENUMS)) {
    const v = raw && typeof raw === 'object' ? raw[key] : null;
    out[key] = allowed.includes(v) ? v : DEFAULT_PREFERENCES[key];
  }
  return out;
}

function readStored(storage) {
  try {
    const raw = storage?.getItem?.(PREF_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function syncDataset(root, prefs) {
  if (!root?.dataset) return;
  for (const [key, v] of Object.entries(prefs)) root.dataset[key] = v;
}

/**
 * 注入 storage 与 root 便于单测；生产走 getWorkspaceStore() 的懒单例。
 * 返回 { getState, setState, subscribe, reset }。
 */
export function createWorkspaceStore(storage, root) {
  let state = readStored(storage);
  const listeners = new Set();

  const publish = (next) => {
    state = next;
    syncDataset(root, next);
    store.preferences = next;
    try {
      storage?.setItem?.(PREF_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 隐私模式下 localStorage 会抛：内存态仍然生效，只是这次没记住
    }
    for (const fn of listeners) fn(next);
  };

  publish(state);

  return {
    getState: () => state,
    setState(patch) {
      const next = normalizePreferences({ ...state, ...(patch ?? {}) });
      if (Object.keys(ENUMS).every((k) => state[k] === next[k])) return state;
      publish(next);
      return next;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset: () => publish({ ...DEFAULT_PREFERENCES }),
  };
}

let singleton = null;

/** 浏览器启动时调用一次；测试里可重复调用拿到同一实例 */
export function getWorkspaceStore() {
  if (!singleton) {
    const storage = typeof localStorage === 'undefined' ? null : localStorage;
    const root = typeof document === 'undefined' ? null : document.documentElement;
    singleton = createWorkspaceStore(storage, root);
  }
  return singleton;
}
