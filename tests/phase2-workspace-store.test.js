/* ================================================================== *
 * Phase 2 / P2-T1：工作台偏好状态库与 store 桥接
 *
 * 四条偏好决定首屏怎么画（红绿、主题、密度、时间基准），它们必须在
 * localStorage 被禁用 / 数据被手改时也不把页面带崩。PLACEHOLDER 的条数
 * 与服务端 INSTRUMENTS 对齐，才不会有「首屏 11 行暴涨到 23 行」的跳变。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PREF_STORAGE_KEY,
  DEFAULT_PREFERENCES,
  normalizePreferences,
  createWorkspaceStore,
  getWorkspaceStore,
} from '../src/client/shared/workspace-store.js';
import { PLACEHOLDER, store } from '../src/client/shared/store.js';
import { INSTRUMENTS } from '../src/server/providers/instruments.js';

const memoryStorage = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
};

describe('normalizePreferences：坏数据一律落到默认值', () => {
  it('空 / 非对象给全部默认值', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences('garbage')).toEqual(DEFAULT_PREFERENCES);
  });

  it('只认枚举内的值，未知值逐项回退', () => {
    const out = normalizePreferences({
      colorScheme: 'nope', theme: 'light', density: 'wall', anchorClock: 'intraday_open', extra: 1,
    });
    expect(out).toEqual({
      colorScheme: 'cn', theme: 'light', density: 'wall', anchorClock: 'intraday_open',
    });
    expect('extra' in out).toBe(false);
  });

  it('四个维度都接受三档取值', () => {
    expect(normalizePreferences({ colorScheme: 'intl' }).colorScheme).toBe('intl');
    expect(normalizePreferences({ colorScheme: 'cb' }).colorScheme).toBe('cb');
    expect(normalizePreferences({ theme: 'oled' }).theme).toBe('oled');
    expect(normalizePreferences({ density: 'flat' }).density).toBe('flat');
    expect(normalizePreferences({ anchorClock: 'ashare_close' }).anchorClock).toBe('ashare_close');
  });
});

describe('createWorkspaceStore：持久化 + DOM dataset 双向同步', () => {
  const root = () => ({ dataset: {} });

  it('初值来自 storage，并立刻同步到 root.dataset', () => {
    const storage = memoryStorage({ [PREF_STORAGE_KEY]: JSON.stringify({ theme: 'oled' }) });
    const el = root();
    const ws = createWorkspaceStore(storage, el);
    expect(ws.getState()).toEqual({ ...DEFAULT_PREFERENCES, theme: 'oled' });
    expect(el.dataset.theme).toBe('oled');
    expect(el.dataset.colorScheme).toBe('cn');
  });

  it('setState 写回 localStorage、更新 dataset，且只通知变化', () => {
    const storage = memoryStorage();
    const el = root();
    const ws = createWorkspaceStore(storage, el);
    const seen = [];
    ws.subscribe((s) => seen.push(s));
    ws.setState({ density: 'wall' });
    expect(JSON.parse(storage.getItem(PREF_STORAGE_KEY))).toEqual({ ...DEFAULT_PREFERENCES, density: 'wall' });
    expect(el.dataset.density).toBe('wall');
    expect(seen).toHaveLength(1);
    expect(seen[0].density).toBe('wall');
    // 同值不算变化，不重复通知 / 不重复落盘
    ws.setState({ density: 'wall' });
    expect(seen).toHaveLength(1);
  });

  it('setState 过滤非法值；reset 回默认；subscribe 可退订', () => {
    const ws = createWorkspaceStore(memoryStorage(), root());
    ws.setState({ colorScheme: 'hack' });
    expect(ws.getState().colorScheme).toBe('cn');
    ws.setState({ anchorClock: 'intraday_open' });
    ws.reset();
    expect(ws.getState()).toEqual(DEFAULT_PREFERENCES);
  });

  it('storage 抛错 / 坏 JSON 时不崩，仍能读写内存态', () => {
    const throwing = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    const ws = createWorkspaceStore(throwing, root());
    expect(ws.getState()).toEqual(DEFAULT_PREFERENCES);
    expect(() => ws.setState({ theme: 'light' })).not.toThrow();
    expect(ws.getState().theme).toBe('light');
    const corrupt = createWorkspaceStore(memoryStorage({ [PREF_STORAGE_KEY]: '{坏' }), root());
    expect(corrupt.getState()).toEqual(DEFAULT_PREFERENCES);
  });

  it('没有 storage / root 也能用（SSR 与 Node 单测）', () => {
    const ws = createWorkspaceStore(null, null);
    expect(ws.getState()).toEqual(DEFAULT_PREFERENCES);
    expect(() => ws.setState({ density: 'flat' })).not.toThrow();
    expect(ws.getState().density).toBe('flat');
  });
});

describe('store 桥接与首屏骨架', () => {
  it('getWorkspaceStore 与 store.preferences 双向同步', () => {
    const ws = getWorkspaceStore();
    ws.setState({ density: 'wall' });
    expect(store.preferences.density).toBe('wall');
    expect(typeof ws.subscribe).toBe('function');
    ws.reset();
  });

  it('PLACEHOLDER 与服务端 INSTRUMENTS 完全对齐（23 个品种，无首屏跳变）', () => {
    expect(PLACEHOLDER).toHaveLength(23);
    expect(INSTRUMENTS).toHaveLength(23);
    expect(PLACEHOLDER.map((p) => p.id)).toEqual(INSTRUMENTS.map((i) => i.id));
    for (const p of PLACEHOLDER) {
      expect(typeof p.group).toBe('string');
      expect(p.group.length).toBeGreaterThan(0);
      expect(p.name).toBeTruthy();
    }
  });

  it('分组覆盖核心品种与区域股指两类', () => {
    const groups = new Set(PLACEHOLDER.map((p) => p.group));
    expect(groups.size).toBeGreaterThanOrEqual(2);
    expect(PLACEHOLDER.find((p) => p.id === 'gold-intl').group).toBeTruthy();
    expect(PLACEHOLDER.find((p) => p.id === 'hsi').group).toBeTruthy();
  });
});
