/* ================================================================== *
 * watch.js —— #/watch：独立「今天重点」工作区
 *
 * 把用户的自选标的实时行情、今日宏观重点（Top 3 + 下一件发布）与
 * 个人关注简报 / 预期台账 / 生活传导合并在一个专属页面，不与首页列表混排。
 * ================================================================== */

import { watchEl } from '../shared/dom.js';
import { on } from '../shared/bus.js';
import { getJson } from '../shared/fetch-json.js';
import { dirOf, fmtPct, fmtPrice, fmtSigned, html } from '../shared/format.js';
import { PLACEHOLDER, store } from '../shared/store.js';
import { getWorkspaceStore } from '../shared/workspace-store.js';
import { readPinnedAssets, togglePinnedAsset, isAssetPinned } from '../shared/watchlist.js';
import { anchorChangePct } from './list.js';
import { todayFocusHTML } from './today-focus.js';
import { refreshHomeBrief } from './home-brief-wiring.js';

const STARTER_IDS = ['gold-intl', 'dxy', 'sp500', 'btc', 'sh000001', 'oil'];

function storageOf() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function contentHost() {
  if (!watchEl) return null;
  let el = document.getElementById('watch-content');
  if (!el) {
    el = document.createElement('div');
    el.id = 'watch-content';
    watchEl.prepend(el);
  }
  return el;
}

function quotesByIdMap() {
  const map = new Map();
  for (const item of PLACEHOLDER) map.set(item.id, item);
  for (const q of store.quotes ?? []) map.set(q.id, q);
  return map;
}

/** 渲染「我的星标自选」卡片墙 + 快速添加/管理面板 */
export function watchPinnedHTML(pinnedIds, byId, prefs, pickerOpen = false) {
  const pins = Array.isArray(pinnedIds) ? pinnedIds : [];
  const anchor = prefs?.anchorClock ?? 'default';

  const cards = pins.length
    ? html`<div class="watch-pin-grid">
        ${pins.map((id) => {
          const item = byId.get(id);
          if (!item) return '';
          const d = item.decimals ?? 2;
          const pct = anchor === 'default' ? item.changePct : anchorChangePct(item, anchor);
          const dir = dirOf(pct);
          const ms = item.marketStatus;
          const phase = ms?.label ? (ms.phase || (ms.open ? 'open' : 'closed')) : '';
          return html`<article class="watch-pin-card" data-id="${item.id}" data-dir="${dir}" data-open="${ms?.open ? '1' : '0'}">
            <div class="watch-pin-top">
              <a class="watch-pin-title" href="#/d/${encodeURIComponent(item.id)}">${item.name}</a>
              ${ms?.label ? html`<span class="session-pill" data-phase="${phase}">${ms.label}</span>` : ''}
              <button type="button" class="watch-unpin-btn" data-watch-pin="${item.id}" aria-label="取消自选 ${item.name}" aria-pressed="true" title="移出我的自选">★</button>
            </div>
            <div class="watch-pin-sub">${item.sub ?? ''}</div>
            <div class="watch-pin-num">
              <span class="watch-pin-price">${fmtPrice(item.price, d)}</span>
              <span class="watch-pin-pct ${dir}">${fmtPct(pct)}</span>
              <span class="watch-pin-abs">${fmtSigned(item.change, d)}</span>
            </div>
          </article>`;
        })}
      </div>`
    : html`<div class="watch-empty">
        <p class="watch-empty-title">还没有星标自选标的</p>
        <p class="watch-empty-hint">点击常用基准快速加入，或在右上角「管理自选」自由勾选，首页磁贴墙的 ☆ 也会同步到此处。</p>
        <div class="watch-starter-picks">
          ${STARTER_IDS.map((id) => {
            const meta = byId.get(id);
            if (!meta) return '';
            return html`<button type="button" class="pick" data-watch-pin="${meta.id}" aria-pressed="false">+ ${meta.name}</button>`;
          })}
        </div>
      </div>`;

  const picker = pickerOpen
    ? html`<div class="watch-pin-picker" id="watch-pin-picker">
        ${PLACEHOLDER.map((item) => {
          const on = isAssetPinned(storageOf(), item.id);
          return html`<button type="button" class="pick ${on ? 'on' : ''}" data-watch-pin="${item.id}" aria-pressed="${on ? 'true' : 'false'}">${on ? '★ ' : '☆ '}${item.name}</button>`;
        })}
      </div>`
    : '';

  return html`<section class="d-block watch-pinned-block">
    <div class="chart-head">
      <h3>我的自选盯盘 <span class="h3-note">${pins.length ? `已选 ${pins.length} 个标的` : '待添加'}</span></h3>
      <button type="button" class="back-btn" id="watch-manage-btn" aria-expanded="${pickerOpen ? 'true' : 'false'}">${pickerOpen ? '收起管理' : '管理自选'}</button>
    </div>
    ${picker}
    ${cards}
  </section>`;
}

function renderFocusSlot(focus) {
  const slot = document.getElementById('watch-focus-slot');
  if (!slot) return;
  if (!focus) {
    slot.innerHTML = html`<section class="d-block tf-card" data-state="empty"><h3>今天重点</h3><p class="tf-empty">暂时未能读取今日宏观重点。</p></section>`.toString();
    return;
  }
  slot.innerHTML = todayFocusHTML(focus).toString();
}

export function renderWatch() {
  const host = contentHost();
  if (!host) return;
  const pinnedIds = readPinnedAssets(storageOf());
  const byId = quotesByIdMap();
  const prefs = getWorkspaceStore().getState();
  const pickerOpen = Boolean(store.watchPickerOpen);

  host.innerHTML = html`
    <div class="d-top">
      <button type="button" class="back-btn" id="watch-back">← 返回市场行情</button>
      <div class="d-id">
        <h2>今天重点 · 自选与宏观焦点</h2>
        <p>把你关注的标的实时走势、今日最关键事件与预期差集中在一个页面</p>
      </div>
      <div class="macro-status">
        <button type="button" class="back-btn" id="watch-refresh">刷新</button>
      </div>
    </div>

    ${watchPinnedHTML(pinnedIds, byId, prefs, pickerOpen)}

    <div id="watch-focus-slot">
      ${store.todayFocus ? '' : html`<div class="d-loading">正在汇总今日重点…</div>`}
    </div>
  `.toString();

  if (store.todayFocus) renderFocusSlot(store.todayFocus);

  host.querySelector('#watch-back')?.addEventListener('click', () => {
    location.hash = '';
  });
  host.querySelector('#watch-refresh')?.addEventListener('click', () => {
    void loadWatchData(true);
  });
  host.querySelector('#watch-manage-btn')?.addEventListener('click', () => {
    store.watchPickerOpen = !store.watchPickerOpen;
    renderWatch();
  });
  host.querySelectorAll('[data-watch-pin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-watch-pin');
      togglePinnedAsset(storageOf(), id);
      renderWatch();
    });
  });
}

async function loadWatchData(force = false) {
  if (!watchEl || watchEl.hidden) return;
  const briefHost = document.getElementById('home-brief');
  const tasks = [
    getJson('api/today-focus').then((body) => {
      if (watchEl.hidden) return;
      if (body) store.todayFocus = body;
      renderFocusSlot(store.todayFocus ?? body);
    }),
  ];
  if (briefHost) {
    tasks.push(
      refreshHomeBrief({ host: briefHost, storage: storageOf(), open: true })
        .then(() => {
          if (watchEl.hidden) return;
          const acc = briefHost.querySelector('details.home-brief-accordion');
          if (acc) acc.open = true;
        })
        .catch(() => null),
    );
  }
  await Promise.all(tasks);
}

export function mountWatch() {
  if (!watchEl) return;
  watchEl.hidden = false;
  window.scrollTo({ top: 0 });
  renderWatch();
  const briefHost = document.getElementById('home-brief');
  if (briefHost && briefHost.innerHTML.trim().length > 0) {
    briefHost.hidden = false;
    const acc = briefHost.querySelector('details.home-brief-accordion');
    if (acc) acc.open = true;
  }
  if (!store.watchQuotesOff) {
    store.watchQuotesOff = on('quotes', () => {
      if (watchEl && !watchEl.hidden) renderWatch();
    });
  }
  void loadWatchData(false);
}

export function unmountWatch() {
  if (typeof store.watchQuotesOff === 'function') {
    store.watchQuotesOff();
    store.watchQuotesOff = null;
  }
  store.watchPickerOpen = false;
  if (!watchEl) return;
  watchEl.hidden = true;
  const content = document.getElementById('watch-content');
  if (content) content.innerHTML = '';
  const briefHost = document.getElementById('home-brief');
  if (briefHost) briefHost.hidden = true;
}
