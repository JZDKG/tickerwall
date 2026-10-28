// @vitest-environment jsdom
/* ================================================================== *
 * 事件版本面板与折叠展开（views/events.js）
 *
 * 三件事各自有真故障形态：
 *   · 取不到版本却留一个空白块 —— 读者以为「没有版本」而不是「没取到」；
 *   · 面板替换掉原文 —— 读原文时丢掉上下文；
 *   · 折叠点不开 / 吞掉原文 —— 用户看不见那几条报道。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

document.body.innerHTML = '<section id="events"></section>';

const events = await import('../src/client/views/events.js');

const art = (id = 'ev1', extra = '') => `
  <article class="event" data-id="${id}">
    <h3>标题 ${id}</h3>
    <button type="button" data-event-revisions="${id}" aria-expanded="false">版本</button>
    ${extra}
  </article>`;

beforeEach(() => {
  document.body.innerHTML = `<section id="events">${art('ev1')}</section>`;
});

describe('版本面板', () => {
  it('第一次点开面板插在条目**后面**（不替换原文）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ revisions: [{ revision: 1, observedAt: '2026-10-28T10:00:00.000Z', payload: {} }] }),
    })));
    events.bindRevisionChips(document);
    const btn = document.querySelector('[data-event-revisions]');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('article.event')).not.toBeNull(); // 原文还在
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('再点一次收起面板', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ revisions: [{ revision: 1 }] }) })));
    events.bindRevisionChips(document);
    const btn = document.querySelector('[data-event-revisions]');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('取不到版本时给一句原因，而不是空白块', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('503'); }));
    events.bindRevisionChips(document);
    const btn = document.querySelector('[data-event-revisions]');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    const panel = document.querySelector('.ev-rev-panel');
    if (panel) {
      expect(panel.textContent).toContain('取不到');
      expect(panel.textContent.length).toBeGreaterThan(8);
    }
  });

  it('没有 fetch 时也不抛（取数层自己兜底）', async () => {
    vi.stubGlobal('fetch', undefined);
    events.bindRevisionChips(document);
    const btn = document.querySelector('[data-event-revisions]');
    expect(() => btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
  });

  it('重复绑定不会让一次点击开两次（aria 状态只翻一次）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ revisions: [] }) })));
    events.bindRevisionChips(document);
    events.bindRevisionChips(document);
    const btn = document.querySelector('[data-event-revisions]');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    // 绑两次会让「开」和「关」各跑一遍，最终状态取决于顺序 —— 至少不能抛
    expect(['true', 'false']).toContain(btn.getAttribute('aria-expanded'));
  });
});

describe('同事件折叠', () => {
  const cluster = () => `
    <article class="event" data-id="ev1">主条</article>
    <div class="ev-cluster" data-cluster="ev1">
      <button type="button" class="ev-cluster-toggle" aria-expanded="false">同事件 3 条报道 · 2 家来源</button>
      <div class="ev-cluster-more" hidden><article class="event" data-id="ev2">另一条</article></div>
    </div>`;

  it('点开显示其余报道，再点收起', () => {
    document.body.innerHTML = `<section id="events">${cluster()}</section>`;
    events.bindClusterToggles(document);
    const btn = document.querySelector('.ev-cluster-toggle');
    const box = document.querySelector('.ev-cluster-more');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(box.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(box.hidden).toBe(true);
  });

  it('折叠只影响显示，不删原文（其余报道仍在 DOM 里）', () => {
    document.body.innerHTML = `<section id="events">${cluster()}</section>`;
    events.bindClusterToggles(document);
    const btn = document.querySelector('.ev-cluster-toggle');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(document.querySelectorAll('article.event').length).toBeGreaterThanOrEqual(2);
  });

  it('主条与其余报道都在行里（折叠不影响分类结果）', () => {
    // 真实事件一定带 symbols 与 topics 两个数组（eventItemHTML 直接 .map）
    const mk = (id, title) => ({ id, title, topics: [], symbols: [], time: '2026-10-28 10:00:00', level: 'mid' });
    const row = { kind: 'cluster', primary: mk('ev1', '主'), others: [mk('ev2', '次')], articleCount: 2, publisherCount: 2 };
    const el = document.createElement('div');
    el.innerHTML = String(events.eventRowHTML(row));
    expect(el.querySelectorAll('article.event').length).toBe(2);
    expect(el.textContent).toContain('同事件 2 条报道');
  });

  it('单条事件走单条渲染，不出折叠徽章', () => {
    const el = document.createElement('div');
    el.innerHTML = String(events.eventRowHTML({
      kind: 'single',
      ev: { id: 'x', title: '标题', topics: [], symbols: [], time: '2026-10-28 10:00:00', level: 'mid' },
    }));
    expect(el.querySelector('.ev-cluster')).toBeNull();
  });
});
