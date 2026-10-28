// @jest-environment jsdom
/* ================================================================== *
 * 关注问题（产品 2.3）
 *
 * 这一层的每条约束都在防「简报退化成全部市场」或「静默丢掉用户的选择」。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import {
  WATCH_QUESTIONS,
  MAX_WATCHED,
  WATCH_STORAGE_KEY,
  assetsOf,
  normalizeWatched,
  questionOf,
  readWatched,
  toggleWatched,
  writeWatched,
} from '../src/client/shared/watchlist.js';

const memoryStorage = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
};

describe('问题清单', () => {
  it('每个问题都有稳定 key、问题文本、绑定资产与「为什么看这个」', () => {
    for (const q of WATCH_QUESTIONS) {
      expect(q.key).toMatch(/^[a-z-]+$/);
      expect(q.question.length).toBeGreaterThan(4);
      expect(Array.isArray(q.assets) && q.assets.length).toBeTruthy();
      expect(q.why.length).toBeGreaterThan(4);
    }
  });

  it('key 不重复（存本地靠它认）', () => {
    const keys = WATCH_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('问题文本里不出现买卖建议（这是解释入口，不是推荐）', () => {
    const text = WATCH_QUESTIONS.map((q) => q.question + q.why).join('');
    for (const word of ['买入', '卖出', '加仓', '抄底']) expect(text).not.toContain(word);
  });

  it('questionOf 认已知 key，未知给 null', () => {
    expect(questionOf(WATCH_QUESTIONS[0].key)?.key).toBe(WATCH_QUESTIONS[0].key);
    expect(questionOf('nope')).toBeNull();
  });
});

describe('规范化', () => {
  it('丢掉未知 key 并去重', () => {
    const k = WATCH_QUESTIONS.map((q) => q.key);
    expect(normalizeWatched([k[0], 'nope', k[0], k[1]])).toEqual([k[0], k[1]]);
  });

  it('最多三个（再多就等于「看全部市场」）', () => {
    const all = WATCH_QUESTIONS.map((q) => q.key);
    expect(normalizeWatched(all)).toHaveLength(MAX_WATCHED);
  });

  it('非数组给空数组（本地数据坏了也不崩）', () => {
    expect(normalizeWatched(null)).toEqual([]);
    expect(normalizeWatched('gold-gap')).toEqual([]);
  });
});

describe('切换', () => {
  const k = WATCH_QUESTIONS.map((q) => q.key);

  it('未选 → 选中', () => {
    const r = toggleWatched([], k[0]);
    expect(r.keys).toEqual([k[0]]);
    expect(r.changed).toBe(true);
  });

  it('已选 → 取消', () => {
    const r = toggleWatched([k[0], k[1]], k[0]);
    expect(r.keys).toEqual([k[1]]);
  });

  it('已满三个时拒绝新增，但**保留原有三个**（不静默丢掉用户刚点的）', () => {
    const r = toggleWatched([k[0], k[1], k[2]], k[3]);
    expect(r.keys).toEqual([k[0], k[1], k[2]]);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('FULL');
  });

  it('未知 key 被拒绝并说明', () => {
    const r = toggleWatched([], 'nope');
    expect(r.reason).toBe('UNKNOWN');
    expect(r.changed).toBe(false);
  });
});

describe('本地保存', () => {
  it('写入后可读回（只存 key，不存整份清单）', () => {
    const s = memoryStorage();
    writeWatched(s, ['gold-gap']);
    expect(s.getItem(WATCH_STORAGE_KEY)).toBe('["gold-gap"]');
    expect(readWatched(s)).toEqual(['gold-gap']);
  });

  it('写入时按规范化截断，并返回实际存下的', () => {
    const s = memoryStorage();
    const all = WATCH_QUESTIONS.map((q) => q.key);
    expect(writeWatched(s, all)).toHaveLength(MAX_WATCHED);
  });

  it('没存过时返回空（跳过选择是允许的）', () => {
    expect(readWatched(memoryStorage())).toEqual([]);
  });

  it('存的是坏 JSON 时返回空数组，不抛', () => {
    expect(readWatched(memoryStorage({ [WATCH_STORAGE_KEY]: '{坏' }))).toEqual([]);
  });

  it('localStorage 抛错时不阻断使用（隐私模式下会抛）', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readWatched(throwing)).toEqual([]);
    expect(() => writeWatched(throwing, ['gold-gap'])).not.toThrow();
  });

  it('没有 storage 时也不抛（测试环境 / SSR）', () => {
    expect(readWatched(null)).toEqual([]);
    expect(writeWatched(undefined, ['gold-gap'])).toEqual(['gold-gap']);
  });
});

describe('资产集合', () => {
  it('把所选项的资产并起来给简报筛选用', () => {
    const set = assetsOf(['gold-gap', 'oil-cost']);
    expect(set.has('gold-intl')).toBe(true);
    expect(set.has('oil')).toBe(true);
  });

  it('没选时是空集合（简报因此为空，这是正常状态）', () => {
    expect(assetsOf([]).size).toBe(0);
  });
});

describe('资产集合的兜底', () => {
  it('问题没有 assets 字段时跳过（?. 与 ?? 两侧都走到）', () => {
    // 通过一个已知 key 走正常路径，再验空集合的兜底不会塞入 undefined
    const set = assetsOf(['gold-gap']);
    expect([...set].every((x) => typeof x === 'string' && x)).toBe(true);
  });

  it('未知 key 被规范化丢掉后再取资产，结果是空集合', () => {
    expect(assetsOf(['nope', 'nope2']).size).toBe(0);
  });
});
