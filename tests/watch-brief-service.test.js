/* ================================================================== *
 * 关注简报的服务层与卡片（产品 2.3）
 *
 * 服务层：没选关注问题就不去拉事件（省一次上游，也避免凑几条给你看）；
 *         「自上次查看」由调用方给，服务端不猜成「最近 24 小时」。
 * 卡片：  三态各有各的话，未选 ≠ 没变化。
 * ================================================================== */

// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { getWatchBrief } from '../src/server/services/watch-brief.service.js';
import {
  briefRowHTML,
  fmtSince,
  readLastSeen,
  watchBriefHTML,
  writeLastSeen,
} from '../src/client/views/watch-brief.js';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');

const fakeEvents = (items) => async () => ({ items });

const ev = (over = {}) => ({
  id: 'e1',
  time: '2026-10-28 10:00:00',
  title: '金价盘中回落',
  level: 'mid',
  symbols: ['gold-intl'],
  ...over,
});

describe('服务层：没选就不拉', () => {
  it('没有关注问题时不去取事件（省一次上游）', async () => {
    let called = 0;
    const out = await getWatchBrief({
      assets: [],
      watchedKeys: [],
      nowMs: NOW,
      deps: { getEvents: async () => { called += 1; return { items: [] }; } },
    });
    expect(called).toBe(0);
    expect(out.reason).toBe('NO_WATCH');
  });

  it('有 optional chaining 的两个操作数都走到（items 缺失时按空处理）', async () => {
    const out = await getWatchBrief({
      assets: ['gold-intl'],
      watchedKeys: ['gold-gap'],
      nowMs: NOW,
      deps: { getEvents: async () => ({}) },
    });
    expect(out.ok).toBe(true);
    expect(out.count).toBe(0);
  });
});

describe('服务层：窗口与筛选', () => {
  it('sinceMs 由调用方给（三天没来就看三天）', async () => {
    const out = await getWatchBrief({
      assets: ['gold-intl'],
      watchedKeys: ['gold-gap'],
      sinceMs: NOW - 4 * 24 * 3600_000,
      nowMs: NOW,
      deps: { getEvents: fakeEvents([ev({ time: '2026-10-25 10:00:00' })]) },
    });
    expect(out.count).toBe(1);
  });

  it('没有 sinceMs 时用默认回看窗口', async () => {
    const out = await getWatchBrief({
      assets: ['gold-intl'],
      watchedKeys: ['gold-gap'],
      sinceMs: null,
      nowMs: NOW,
      deps: { getEvents: fakeEvents([ev({ time: '2026-10-20 10:00:00' })]) },
    });
    expect(out.count).toBe(0); // 一周前的不算
  });

  it('把关注资产与 key 回传（界面据此显示「你在看哪几个问题」）', async () => {
    const out = await getWatchBrief({
      assets: ['gold-intl'],
      watchedKeys: ['gold-gap'],
      nowMs: NOW,
      deps: { getEvents: fakeEvents([]) },
    });
    expect(out.assets).toEqual(['gold-intl']);
    expect(out.watchedKeys).toEqual(['gold-gap']);
  });

  it('事件流取不到给 unavailable，不抛', async () => {
    const out = await getWatchBrief({
      assets: ['gold-intl'],
      watchedKeys: ['gold-gap'],
      nowMs: NOW,
      deps: { getEvents: async () => { throw new Error('upstream 502'); } },
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('502');
  });
});

describe('卡片：三态各有各的话', () => {
  it('未选关注问题 → 给选择入口，而不是「暂无重要更新」', () => {
    const el = document.createElement('div');
    el.innerHTML = watchBriefHTML({ reason: 'NO_WATCH' });
    expect(el.querySelector('.wb-card').dataset.state).toBe('no-watch');
    expect(el.textContent).toContain('选择关心的问题');
    expect(el.textContent).not.toContain('暂无重要更新');
  });

  it('选了但没变化 → 说「暂无重要更新」且不塞新闻', () => {
    const el = document.createElement('div');
    el.innerHTML = watchBriefHTML({ reason: 'NO_CHANGES', empty: true, items: [], sinceMs: NOW - 7200_000 });
    expect(el.querySelector('.wb-card').dataset.state).toBe('empty');
    expect(el.textContent).toContain('暂无重要更新');
    expect(el.querySelectorAll('.wb-row')).toHaveLength(0);
  });

  it('有变化 → 列出条目并写清条数', () => {
    const el = document.createElement('div');
    el.innerHTML = watchBriefHTML({ reason: 'HAS_ITEMS', count: 1, items: [ev({ id: 'a' })], sinceMs: NOW - 7200_000 });
    expect(el.querySelectorAll('.wb-row')).toHaveLength(1);
    expect(el.querySelector('.wb-foot').textContent).toContain('共 1 条');
  });

  it('转载合并的条目标「N 家也在报」', () => {
    const el = document.createElement('div');
    el.innerHTML = watchBriefHTML({
      reason: 'HAS_ITEMS', count: 1, items: [ev({ id: 'a', sources: 3 })], sinceMs: NOW - 3600_000,
    });
    expect(el.textContent).toContain('3 家也在报');
  });

  it('单家报道不写「1 家也在报」', () => {
    expect(briefRowHTML(ev({ sources: 1 }))).not.toContain('也在报');
  });

  it('取不到事件流时给可读错误，且不装作「没有更新」', () => {
    const el = document.createElement('div');
    el.innerHTML = watchBriefHTML({ ok: false, reason: 'upstream 502', items: [] });
    expect(el.querySelector('.wb-card').dataset.state).toBe('unavailable');
    expect(el.textContent).toContain('502');
    expect(el.textContent).not.toContain('暂无重要更新');
  });
});

describe('上次查看时刻', () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  };

  it('写入后可读回', () => {
    const s = memory();
    writeLastSeen(s, NOW);
    expect(readLastSeen(s)).toBe(NOW);
  });

  it('没存过给 null（服务端据此用默认窗口）', () => {
    expect(readLastSeen(memory())).toBeNull();
  });

  it('坏值给 null，不抛', () => {
    expect(readLastSeen({ getItem: () => 'abc' })).toBeNull();
    expect(readLastSeen({ getItem: () => { throw new Error('denied'); } })).toBeNull();
    expect(() => writeLastSeen({ setItem: () => { throw new Error('denied'); } }, NOW)).not.toThrow();
  });
});

describe('多久以前', () => {
  it('一小时内说「刚刚」', () => {
    expect(fmtSince(NOW - 60_000, NOW)).toBe('刚刚');
  });

  it('一天内说小时', () => {
    expect(fmtSince(NOW - 3 * 3600_000, NOW)).toBe('3 小时前');
  });

  it('超过一天说天', () => {
    expect(fmtSince(NOW - 50 * 3600_000, NOW)).toBe('2 天前');
  });
});
