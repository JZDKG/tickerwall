// @vitest-environment jsdom
/* ================================================================== *
 * 独立 #/watch（今天重点）视图回归
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

document.body.innerHTML = `
  <main id="rows"></main>
  <section id="detail"></section>
  <section id="macro"></section>
  <section id="events"></section>
  <section id="map"></section>
  <section id="watch" hidden>
    <div id="watch-content"></div>
    <section id="home-brief" hidden></section>
  </section>
  <div id="updated"></div>
  <div id="countdown"></div>
  <button id="refresh"></button>
`;

window.scrollTo = vi.fn();

const { store, PLACEHOLDER } = await import('../src/client/shared/store.js');
const { readPinnedAssets, togglePinnedAsset } = await import('../src/client/shared/watchlist.js');
const { emit } = await import('../src/client/shared/bus.js');
const watch = await import('../src/client/views/watch.js');

describe('独立 #/watch（今天重点）视图', () => {
  beforeEach(() => {
    localStorage.clear();
    store.quotes = null;
    store.todayFocus = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('api/today-focus')) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              count: 1,
              short: true,
              rule: '按影响分级',
              generatedAt: '2026-11-13T08:00:00Z',
              focus: [
                { id: 'f1', title: '美国核心 CPI 低于预期', why: '利好黄金与美债', time: '21:30' },
              ],
              next: { id: 'n1', title: '美联储议息会议', releaseAt: '2026-11-14T02:00:00Z', inMs: 3600_000 },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, items: [], ledgerOk: true }),
        };
      }),
    );
  });

  afterEach(() => {
    watch.unmountWatch();
    vi.unstubAllGlobals();
  });

  it('watchPinnedHTML 空列表渲染快速加入按钮，有自选时渲染带交易状态的实时卡片', () => {
    const map = new Map(PLACEHOLDER.map((x) => [x.id, { ...x, price: 2500, changePct: 1.2, marketStatus: { open: true, phase: 'open', label: '交易中' } }]));
    const emptyHtml = String(watch.watchPinnedHTML([], map, { anchorClock: 'default' }, false));
    expect(emptyHtml).toContain('还没有星标自选标的');
    expect(emptyHtml).toContain('data-watch-pin="gold-intl"');

    const cardHtml = String(watch.watchPinnedHTML(['gold-intl'], map, { anchorClock: 'default' }, true));
    expect(cardHtml).toContain('watch-pin-card');
    expect(cardHtml).toContain('交易中');
    expect(cardHtml).toContain('watch-pin-picker');
  });

  it('mountWatch 展示独立页面并支持管理/星标切换持久化；unmountWatch 正确清理', async () => {
    store.quotes = PLACEHOLDER.map((x) => ({ ...x, price: 100, changePct: 0.5 }));
    togglePinnedAsset(localStorage, 'gold-intl');
    watch.mountWatch();

    const watchEl = document.getElementById('watch');
    expect(watchEl.hidden).toBe(false);
    expect(watchEl.querySelector('.watch-pin-card[data-id="gold-intl"]')).toBeTruthy();

    // 展开管理自选并加入 dxy
    watchEl.querySelector('#watch-manage-btn').click();
    expect(watchEl.querySelector('#watch-pin-picker')).toBeTruthy();
    watchEl.querySelector('#watch-pin-picker [data-watch-pin="dxy"]').click();
    expect(readPinnedAssets(localStorage)).toContain('dxy');

    // 等 async api/today-focus 落地
    await new Promise((r) => setTimeout(r, 20));
    expect(watchEl.querySelector('#watch-focus-slot').textContent).toContain('美国核心 CPI 低于预期');

    watch.unmountWatch();
    expect(watchEl.hidden).toBe(true);
    expect(document.getElementById('watch-content').innerHTML).toBe('');
  });

  it('响应 quotes 广播重绘、支持刷新与返回、支持已有 home-brief 展开及接口异常降级', async () => {
    const briefHost = document.getElementById('home-brief');
    briefHost.innerHTML = '<details class="home-brief-accordion"><summary>简报</summary></details>';
    togglePinnedAsset(localStorage, 'gold-intl');
    store.quotes = PLACEHOLDER.map((x) => ({ ...x, price: 2100, changePct: 1.5 }));
    location.hash = '#/watch';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('api/today-focus')) return { ok: false, status: 500, json: async () => null };
        return { ok: true, json: async () => ({ ok: true, items: [], ledgerOk: true }) };
      }),
    );

    watch.mountWatch();
    expect(briefHost.hidden).toBe(false);
    expect(briefHost.querySelector('details.home-brief-accordion').open).toBe(true);

    // emit('quotes') 更新自选价格
    store.quotes = PLACEHOLDER.map((x) => ({ ...x, price: 2222, changePct: -0.8 }));
    emit('quotes', store.quotes);
    expect(document.getElementById('watch').textContent).toContain('2,222');

    // 今日重点失败时不抛错，展示降级文案
    await new Promise((r) => setTimeout(r, 20));
    expect(document.getElementById('watch-focus-slot').textContent).toContain('暂时未能读取今日宏观重点');

    // 点击刷新与返回
    document.getElementById('watch-refresh').click();
    document.getElementById('watch-back').click();
    expect(location.hash).toBe('');
  });
});
