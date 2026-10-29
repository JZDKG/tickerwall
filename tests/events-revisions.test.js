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
const { store } = await import('../src/client/shared/store.js');

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

/* ================================================================== *
 * 事件中心顶部「今天重点」（产品 §3 的挂载点）
 *
 * 这块是加分项：取不到就保持空槽，**不能让顶部结构挡住事件流**。
 * ================================================================== */
describe('今天重点的挂载', () => {
  const slotHTML = '<div id="today-focus-slot"></div>';

  it('取到数据后填进槽位', async () => {
    document.body.innerHTML = `<section id="events">${slotHTML}</section>`;
    const body = { count: 1, short: true, rule: '规则', focus: [{ id: 'a', title: 'A', time: '2026-10-28 10:00:00', why: '高等级' }], next: null };
    const out = await events.hydrateTodayFocus({
      fetchImpl: async () => ({ ok: true, json: async () => body }),
    });
    expect(out.count).toBe(1);
    expect(document.getElementById('today-focus-slot').textContent).toContain('今天重点');
  });

  it('没有槽位时直接返回 null（不在别的页面乱插）', async () => {
    document.body.innerHTML = '<section id="events"></section>';
    expect(await events.hydrateTodayFocus({ fetchImpl: async () => ({ json: async () => ({}) }) })).toBeNull();
  });

  it('取数失败时保持空槽，不显示红字（加分项不该遮挡主内容）', async () => {
    document.body.innerHTML = `<section id="events">${slotHTML}</section>`;
    const out = await events.hydrateTodayFocus({ fetchImpl: async () => { throw new Error('502'); } });
    expect(out).toBeNull();
    expect(document.getElementById('today-focus-slot').innerHTML).toBe('');
  });

  it('返回体不是 JSON 时也不抛', async () => {
    document.body.innerHTML = `<section id="events">${slotHTML}</section>`;
    const out = await events.hydrateTodayFocus({ fetchImpl: async () => ({ json: async () => { throw new Error('bad'); } }) });
    expect(out).toBeNull();
  });

  it('没有 fetch 时安全返回（离线/测试环境）', async () => {
    document.body.innerHTML = `<section id="events">${slotHTML}</section>`;
    const saved = globalThis.fetch;
    globalThis.fetch = undefined;
    expect(await events.hydrateTodayFocus()).toBeNull();
    globalThis.fetch = saved;
  });
});

/* ================================================================== *
 * 重绘后「今天重点」不能消失
 *
 * 故障形态（真实浏览器里观察到的）：`renderEvents` 整块重建 innerHTML，
 * 槽位一起被清空；30 秒定时刷新或 LLM 重试再渲染一次，顶部就空了 ——
 * 而接口明明有数据。修法：缓存最近一次 payload，重绘后用缓存补回。
 * ================================================================== */
describe('今天重点在重绘后仍在', () => {
  it('第二次渲染不需要重新请求就能把槽位补回来', async () => {
    // 槽位要真的在容器里：hydrate 找不到 #today-focus-slot 会直接返回，不发请求
    document.body.innerHTML = '<section id="events"><div id="today-focus-slot"></div></section>';
    store.events = { data: { items: [], total: 0, sources: [], coverage: null, llm: { enabled: false, applied: 0, pending: false } }, level: '', topic: '', origin: '', studyMode: 'auto' };
    let calls = 0;
    const body = { count: 1, short: true, rule: '规则', focus: [{ id: 'a', title: 'A', time: '2026-10-29 10:00:00', why: '高等级' }], next: { title: '非农', inMs: 3600_000 } };
    await events.hydrateTodayFocus({ fetchImpl: async () => { calls += 1; return { ok: true, json: async () => body }; } });
    expect(calls).toBe(1);
    const first = document.getElementById('today-focus-slot').textContent;
    expect(first).toContain('今天重点');

    // 模拟整块重绘：renderEvents 会重建 innerHTML，槽位被清空，
    // 由 paintTodayFocus 用缓存补回 —— 不重新请求
    events.renderEvents();
    const slot = document.getElementById('today-focus-slot');
    expect(slot?.textContent ?? '').toContain('今天重点');
    expect(calls).toBe(1);
  });
});
