/* ================================================================== *
 * Phase 2 / P2-T3：标的星标自选（Pinned Instruments）
 *
 * 与既有「关注问题」完全隔离：键不同、逻辑不同、旧单测一个字不改。
 * 本地数据可能被手改，读的时候要能容错；隐私模式下写失败不能阻断使用。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  PINNED_STORAGE_KEY,
  readPinnedAssets,
  togglePinnedAsset,
  isAssetPinned,
} from '../src/client/shared/watchlist.js';

const memoryStorage = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
};

describe('标的自选：读写与切换', () => {
  it('键与旧关注问题隔离', () => {
    expect(PINNED_STORAGE_KEY).toBe('kanban.pinnedAssets.v1');
    expect(PINNED_STORAGE_KEY).not.toContain('watch');
  });

  it('没存过时是空数组', () => {
    expect(readPinnedAssets(memoryStorage())).toEqual([]);
    expect(readPinnedAssets(null)).toEqual([]);
  });

  it('星标后可读回，isAssetPinned 认得', () => {
    const s = memoryStorage();
    const out = togglePinnedAsset(s, 'gold-intl');
    expect(out).toEqual(['gold-intl']);
    expect(JSON.parse(s.getItem(PINNED_STORAGE_KEY))).toEqual(['gold-intl']);
    expect(readPinnedAssets(s)).toEqual(['gold-intl']);
    expect(isAssetPinned(s, 'gold-intl')).toBe(true);
    expect(isAssetPinned(s, 'oil')).toBe(false);
  });

  it('再点一次取消；多个标的按点击顺序保留', () => {
    const s = memoryStorage();
    togglePinnedAsset(s, 'oil');
    expect(togglePinnedAsset(s, 'btc')).toEqual(['oil', 'btc']);
    expect(togglePinnedAsset(s, 'oil')).toEqual(['btc']);
    expect(isAssetPinned(s, 'oil')).toBe(false);
  });

  it('坏 JSON / 非数组 / 非字符串 id / 重复项都被规范化', () => {
    expect(readPinnedAssets(memoryStorage({ [PINNED_STORAGE_KEY]: '{坏' }))).toEqual([]);
    expect(readPinnedAssets(memoryStorage({ [PINNED_STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
    expect(readPinnedAssets(memoryStorage({ [PINNED_STORAGE_KEY]: '["a",1,null,"a",""]' }))).toEqual(['a']);
    expect(togglePinnedAsset(memoryStorage({ [PINNED_STORAGE_KEY]: '["a",1,null,"a",""]' }), 'b')).toEqual(['a', 'b']);
  });

  it('localStorage 抛错时不崩，仍返回可预期的数组', () => {
    const throwing = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(readPinnedAssets(throwing)).toEqual([]);
    expect(() => togglePinnedAsset(throwing, 'gold-intl')).not.toThrow();
    expect(togglePinnedAsset(throwing, 'gold-intl')).toEqual(['gold-intl']);
    expect(isAssetPinned(throwing, 'gold-intl')).toBe(false);
  });

  it('空 / 非法 id 的切换被忽略', () => {
    const s = memoryStorage();
    expect(togglePinnedAsset(s, '')).toEqual([]);
    expect(togglePinnedAsset(s, null)).toEqual([]);
    expect(togglePinnedAsset(s, 42)).toEqual([]);
  });
});
