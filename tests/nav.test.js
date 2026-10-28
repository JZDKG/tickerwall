// @vitest-environment jsdom
/* ================================================================== *
 * 导航收敛（产品 §3.2）
 *
 * 收敛成三个任务，但**不能变成多一层点击**：深链接保留、不新增中间页、
 * 当前任务由 hash 反推（不另存状态）。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { TASKS, activeTaskOf, applyNavActive, isLinkActive } from '../src/client/nav.js';

describe('三个任务', () => {
  it('恰好三个，且各有说明', () => {
    expect(TASKS).toHaveLength(3);
    for (const t of TASKS) {
      expect(t.label.length).toBeGreaterThan(1);
      expect(t.hint.length).toBeGreaterThan(4);
      expect(t.links.length).toBeGreaterThan(0);
    }
  });

  it('三个任务的 id 是 today / explore / watch', () => {
    expect(TASKS.map((t) => t.id)).toEqual(['today', 'explore', 'watch']);
  });

  it('地图与关联分析都在「探索关系」下（它们都是看关系）', () => {
    const explore = TASKS.find((t) => t.id === 'explore');
    const hashes = explore.links.map((l) => l.hash);
    expect(hashes).toContain('#/map');
    expect(hashes).toContain('#/macro');
  });

  it('首页（空 hash）在「今日理解」的第一项（常用入口不许多一次点击）', () => {
    const today = TASKS.find((t) => t.id === 'today');
    expect(today.links[0].hash).toBe('');
  });

  it('每个链接都有可读标签', () => {
    for (const t of TASKS) for (const l of t.links) expect(l.label.length).toBeGreaterThan(1);
  });
});

describe('从 hash 反推任务', () => {
  it('首页 → today', () => {
    expect(activeTaskOf('')).toBe('today');
    expect(activeTaskOf('#')).toBe('today');
  });

  it('事件中心 → today', () => {
    expect(activeTaskOf('#/events')).toBe('today');
  });

  it('地图与宏观 → explore', () => {
    expect(activeTaskOf('#/map')).toBe('explore');
    expect(activeTaskOf('#/macro')).toBe('explore');
  });

  it('详情页 → today（它回答的也是「这是什么」）', () => {
    expect(activeTaskOf('#/d/gold-intl')).toBe('today');
  });

  it('未知 hash 不抛，落到 today（不返回 undefined）', () => {
    expect(activeTaskOf('#/wat')).toBe('today');
    expect(activeTaskOf(undefined)).toBe('today');
  });
});

describe('子项高亮', () => {
  it('空 hash 只匹配首页', () => {
    expect(isLinkActive('', '')).toBe(true);
    expect(isLinkActive('#/map', '')).toBe(false);
  });

  it('带子路径也算命中（深链接）', () => {
    expect(isLinkActive('#/events/123', '#/events')).toBe(true);
    expect(isLinkActive('#/map', '#/map')).toBe(true);
  });

  it('前缀相似但不同不算命中（#/macro 不该命中 #/map）', () => {
    expect(isLinkActive('#/macro', '#/map')).toBe(false);
  });
});

describe('写高亮', () => {
  const root = () => {
    const el = document.createElement('nav');
    el.innerHTML = `
      <a data-task="today" data-nav-hash="">首页</a>
      <a data-task="explore" data-nav-hash="#/map">地图</a>
      <a data-task="explore" data-nav-hash="#/macro">宏观</a>`;
    return el;
  };

  it('当前任务与当前子项各有一处 is-active', () => {
    const el = root();
    applyNavActive(el, '#/map');
    expect(el.querySelector('[data-task="explore"]').classList.contains('is-active')).toBe(true);
    expect(el.querySelector('[data-nav-hash="#/map"]').classList.contains('is-active')).toBe(true);
    expect(el.querySelector('[data-nav-hash="#/macro"]').classList.contains('is-active')).toBe(false);
  });

  it('切到另一个任务时旧高亮被清掉（不残留）', () => {
    const el = root();
    applyNavActive(el, '#/map');
    applyNavActive(el, '');
    expect(el.querySelector('[data-task="today"]').classList.contains('is-active')).toBe(true);
    expect(el.querySelector('[data-task="explore"]').classList.contains('is-active')).toBe(false);
  });

  it('把当前任务写到 dataset 上（样式与测试都能读）', () => {
    const el = root();
    expect(applyNavActive(el, '#/macro')).toBe('explore');
    expect(el.dataset.task).toBe('explore');
  });

  it('没有根节点时安全返回 null', () => {
    expect(applyNavActive(null, '#/map')).toBeNull();
  });
});
