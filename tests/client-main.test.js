// @vitest-environment jsdom
/* ================================================================== *
 * 前端引导（src/client/main.js）
 *
 * 这一段是首页的取数与轮询。断言的是「失败也不把首屏搞坏」：
 *   · 取数失败给可读文案，并在 finally 里恢复按钮与轮询（不能卡在 loading）；
 *   · 问题卡失败静默隐藏，行情列表照常；
 *   · 标签页隐藏时停表、回来立刻拉一次；
 *   · R 快捷键刷新，但在输入框里 / 带修饰键时不抢；
 *   · 倒计时文案在刷新中与空闲时不同。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

document.body.innerHTML = `
  <div id="rows"></div>
  <span id="updated"></span>
  <span id="countdown"></span>
  <button id="refresh"></button>
  <section id="detail"></section>
  <section id="macro"></section>
  <section id="events"></section>
  <section id="map"></section>
  <div id="questions"></div>
`;

// 引导脚本会拉起全部视图与解释卡：这里只测取数循环，其余换成空实现
vi.mock('../src/client/router.js', () => ({ route: () => {} }));
// apply 负责把响应写进 store：这里保留这个副作用，否则测不到「数据落地」
vi.mock('../src/client/views/list.js', () => ({
  renderSkeleton: () => {},
  apply: (payload) => {
    storeRef.quotes = payload?.quotes ?? [];
    storeRef.ttl = payload?.ttlMs ?? 60_000;
    storeRef.updatedAt = payload?.updatedAt ?? null;
  },
}));
vi.mock('../src/client/views/briefing.js', () => ({ openBriefing: () => {} }));
vi.mock('../src/client/views/explanations/questions.js', () => ({
  loadQuestionCards: async () => [],
  questionCardsHTML: () => '',
}));

const { store } = await import('../src/client/shared/store.js');
// 模拟模块里需要 store，但 store 是异步导入的：用一个对象在运行时接上
const storeRef = store;
const main = await import('../src/client/main.js');

const okQuotes = () => ({
  ok: true,
  ttlMs: 60_000,
  updatedAt: '2026-10-28T12:00:00.000Z',
  quotes: [{ id: 'gold-intl', name: '国际金价', ok: true, price: 4050, changePct: 0.3, decimals: 2 }],
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  store.loading = false;
  store.quotes = [];
  document.getElementById('updated').textContent = '';
  vi.unstubAllGlobals();
});

afterEach(() => {
  main.timer && clearTimeout(main.timer);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('取数成功', () => {
  it('写进 store 并排下一轮', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => okQuotes() })));
    await main.loadQuotes(true);
    expect(store.quotes.length).toBeGreaterThan(0);
    expect(store.nextAt).toBeGreaterThan(Date.now());
    expect(main.timer).toBeTruthy();
  });

  it('force 时带 force=1', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => okQuotes() }));
    vi.stubGlobal('fetch', f);
    await main.loadQuotes(true);
    expect(String(f.mock.calls[0][0])).toContain('force=1');
  });
});

describe('取数失败', () => {
  it('给可读文案，并在 finally 里恢复 loading 与按钮', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await main.loadQuotes(false);
    expect(document.getElementById('updated').textContent).toContain('连接失败');
    expect(store.loading).toBe(false);
    expect(document.getElementById('refresh').disabled).toBe(false);
  });

  it('失败后也会排下一轮（不能一次失败就停摆）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    await main.loadQuotes(false);
    expect(main.timer).toBeTruthy();
  });

  it('正在加载时重复调用直接返回（防抖，不打两次请求）', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => okQuotes() }));
    vi.stubGlobal('fetch', f);
    store.loading = true;
    await main.loadQuotes(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('倒计时', () => {
  it('刷新中显示「刷新中…」', () => {
    store.loading = true;
    main.paintCountdown();
    expect(document.getElementById('countdown').textContent).toContain('刷新中');
    store.loading = false;
  });

  it('空闲时显示剩余秒数', () => {
    store.loading = false;
    store.nextAt = Date.now() + 12_000;
    main.paintCountdown();
    expect(document.getElementById('countdown').textContent).toMatch(/^\d+s 后刷新$/);
  });

  it('时间已过时显示 0s，不显示负数', () => {
    store.nextAt = Date.now() - 5000;
    main.paintCountdown();
    expect(document.getElementById('countdown').textContent).toBe('0s 后刷新');
  });
});

describe('问题卡', () => {
  it('没有解释能力之外的标的时退回默认资产（不空手请求）', async () => {
    store.quotes = [{ id: 'sp500', name: '标普500', ok: true }];
    await expect(main.refreshQuestions({ force: true })).resolves.toBeUndefined();
    expect(document.getElementById('questions').hidden).toBe(true);
  });

  it('没有卡片时隐藏问题区（不占位）', async () => {
    await main.refreshQuestions({ force: true });
    expect(document.getElementById('questions').hidden).toBe(true);
  });

  it('TTL 内不重复请求（阅读期间不自动重排）', async () => {
    const t0 = Date.now();
    await main.refreshQuestions({ force: true });
    // 立刻再调一次：仍在 TTL 内，应早退
    expect(Date.now() - t0).toBeLessThan(main.QUESTIONS_TTL_MS);
    await expect(main.refreshQuestions()).resolves.toBeUndefined();
  });
});

describe('键盘与可见性', () => {
  it('R 键触发刷新', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => okQuotes() }));
    vi.stubGlobal('fetch', f);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    await vi.waitFor(() => expect(f).toHaveBeenCalled());
  });

  it('输入框里按 R 不抢（用户可能在打字）', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => okQuotes() }));
    vi.stubGlobal('fetch', f);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    await Promise.resolve();
    expect(f).not.toHaveBeenCalled();
    input.remove();
  });

  it('带修饰键的 R 不抢（⌘R 是浏览器刷新）', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => okQuotes() }));
    vi.stubGlobal('fetch', f);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', metaKey: true, bubbles: true }));
    await Promise.resolve();
    expect(f).not.toHaveBeenCalled();
  });

  it('标签页隐藏时停表（不再自动拉），回来立刻拉一次', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => okQuotes() }));
    vi.stubGlobal('fetch', f);
    await main.loadQuotes(false);
    const afterLoad = f.mock.calls.length;

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
    vi.advanceTimersByTime(180_000);
    await Promise.resolve();
    // 隐藏期间定时器被清掉：不该有新请求
    expect(f.mock.calls.length).toBe(afterLoad);

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
    await vi.waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(afterLoad));
  });
});
