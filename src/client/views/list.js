/* ================================================================== *
 * list.js —— 首屏纵向列表：一行一个标的、迷你走势、涨跌闪烁、刷新节奏。
 *
 * 来源：public/app.js（原 3655 行单体）L158-372，整段搬运，逻辑未改写。
 * ================================================================== */
import { rowsEl, updatedEl } from '../shared/dom.js';
import { clockText, dirOf, esc, fmtPct, fmtPrice, fmtSigned, html, metaRange, prettySource, sparklineSVG } from '../shared/format.js';
import { PLACEHOLDER, refs, store } from '../shared/store.js';
import { emit } from '../shared/bus.js';
import { getWorkspaceStore } from '../shared/workspace-store.js';
import { readPinnedAssets, togglePinnedAsset, isAssetPinned } from '../shared/watchlist.js';
import { mountWorkspaceBar } from './workspace-bar.js';

/* ------------------------------ 时间基准 ------------------------------ */

const pinnedStorage = () => (typeof localStorage === 'undefined' ? null : localStorage);

/** 每轮重绘后把 ☆/★ 与本地自选对齐（行会被复用，不能只在 buildRow 里设一次） */
function syncPinButtons() {
  const storage = pinnedStorage();
  for (const [id, ref] of refs) {
    const btn = ref.el.querySelector('[data-pin]');
    if (!btn) continue;
    const on = isAssetPinned(storage, id);
    btn.textContent = on ? '★' : '☆';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    ref.el.dataset.pinned = on ? '1' : '0';
  }
}

/** 合成指标条：服务端 /api/quotes 的 synthetics 字段，挂在列表上方 */
function renderSynthetics(synthetics) {
  const host = document.getElementById('synthetics-strip');
  if (!host) return;
  const list = Array.isArray(synthetics) ? synthetics : [];
  host.innerHTML = html`${list.map((s) => html`<span class="synthetic-chip${s.ok ? '' : ' is-dead'}" title="${s.formula ?? ''}">
    <em>${s.name}</em>
    <b>${s.ok && Number.isFinite(s.value) ? s.value.toFixed(2) : '—'}</b>
    <i>${s.unit ?? ''}</i>
  </span>`)}`.toString();
}

/**
 * 按锚点重算涨跌幅（P2-T2）。
 * default 用服务端前收口径；ashare_close 以 prevClose 重算（缺省退回服务端值）；
 * intraday_open 以当日分时首点为基准，缺分时 / 基准为 0 / 价格无效都退回
 * 服务端值，绝不显示 NaN。
 */
export function anchorChangePct(item, anchorClock) {
  const fallback = Number.isFinite(item?.changePct) ? item.changePct : null;
  if (anchorClock === 'ashare_close') {
    const base = item?.prevClose;
    return Number.isFinite(base) && base > 0 && Number.isFinite(item?.price)
      ? ((item.price - base) / base) * 100
      : fallback;
  }
  if (anchorClock === 'intraday_open') {
    const base = item?.history?.[0]?.p;
    return Number.isFinite(base) && base > 0 && Number.isFinite(item?.price)
      ? ((item.price - base) / base) * 100
      : fallback;
  }
  return fallback;
}

const ANCHOR_LABEL = {
  default: '前收',
  ashare_close: 'A股收盘',
  intraday_open: '分时首点',
};


/* ------------------------------ 渲染 ------------------------------ */

export function buildRow(item) {
  const el = document.createElement('article');
  el.className = 'row skeleton';
  el.dataset.id = item.id;
  el.innerHTML = html`
    <button type="button" class="pin-btn" data-pin aria-label="星标自选" aria-pressed="false" title="置顶到我的自选">☆</button>
    <div class="id">
      <div class="name">${item.name}</div>
      <div class="sub">${item.sub}</div>
      <div class="extras" data-f="extras"></div>
    </div>
    <div class="price">
      <div class="value" data-f="price">—</div>
      <div class="unit">${item.unit}</div>
    </div>
    <div class="delta">
      <span class="pct" data-f="pct">—</span>
      <span class="abs" data-f="abs"></span>
      <span class="anchor-note" data-f="anchor-note"></span>
    </div>
    <div class="spark" data-f="spark"></div>
    <div class="meta">
      <span class="fresh" data-f="fresh" title=""></span>
      <span data-f="metaline"></span>
      <span class="stale-tag" data-f="stale">数据过期</span>
      <span class="err" data-f="err"></span>
    </div>
  `.toString();
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${item.name} 详情`);
  el.addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      e.stopPropagation();
      togglePinnedAsset(pinnedStorage(), item.id);
      syncPinButtons();
      applyDensity(getWorkspaceStore().getState().density);
      return;
    }
    const hit = e.target.closest('[data-detail-id]');
    const id = hit ? hit.dataset.detailId : item.id;
    location.hash = `#/d/${encodeURIComponent(id)}`;
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      location.hash = `#/d/${encodeURIComponent(item.id)}`;
    }
  });

  const q = (f) => el.querySelector(`[data-f="${f}"]`);
  const ref = {
    el,
    price: q('price'),
    pct: q('pct'),
    abs: q('abs'),
    spark: q('spark'),
    metaline: q('metaline'),
    extras: q('extras'),
    stale: q('stale'),
    fresh: q('fresh'),
    err: q('err'),
    unitEl: el.querySelector('.unit'),
    nameEl: el.querySelector('.name'),
    subEl: el.querySelector('.sub'),
    lastPrice: null,
  };
  refs.set(item.id, ref);
  return el;
}

/** 渲染卡片内的附加报价（如原油行里的布伦特） */
export function renderExtras(host, item, decimals) {
  const list = Array.isArray(item.extras) ? item.extras : [];
  if (!list.length) {
    host.textContent = '';
    host.style.display = 'none';
    return;
  }
  host.style.display = '';
  host.innerHTML = html`${list.map((ex) => {
    const has = ex.price != null && Number.isFinite(ex.price);
    const d = decimals ?? 2;
    const ed = dirOf(ex.changePct);
    const cls = ex.ok === false ? ' extra-dead' : '';
    const tip = ex.source
      ? `${prettySource(ex.source)}${ex.sessionTime ? ` · 行情 ${ex.sessionTime}` : ''}`
      : (ex.error ?? '');
    const price = has ? ex.priceText ?? fmtPrice(ex.price, d) : '—';
    const pct = has && ex.changePct != null ? fmtPct(ex.changePct) : '';
    // changePct 为 null 的 Chip（如 Brent-WTI 价差只有美元差额）不渲染 <i>，
    // 否则会多出一个无意义的「—」
    const pctHtml = pct ? html`<i class="${has ? ed : 'flat'}">${pct}</i>` : '';
    return html`<span class="extra${cls}" data-detail-id="${ex.id}" title="${tip}　点击查看详情">
        <em>${ex.name}</em>
        <b>${price}</b>
        ${pctHtml}
      </span>`;
  })}`.toString();
}

export function updateRow(item, prefs = getWorkspaceStore().getState()) {
  const ref = refs.get(item.id);
  if (!ref) return;

  const d = item.decimals ?? 2;
  // 非默认锚点时按所选基准重算涨跌幅，行内标注口径，避免和别处对不上
  const anchor = prefs.anchorClock ?? 'default';
  const shownPct = anchor === 'default' ? item.changePct : anchorChangePct(item, anchor);
  const dir = dirOf(shownPct);
  const ok = item.ok !== false;

  ref.el.dataset.dir = dir;
  ref.el.dataset.anchor = anchor;
  ref.el.classList.remove('skeleton');
  ref.el.classList.toggle('is-error', !ok && !item.stale);
  ref.el.classList.toggle('is-stale', !!item.stale);

  if (item.name && ref.nameEl.textContent !== item.name) ref.nameEl.textContent = item.name;
  if (item.sub && ref.subEl.textContent !== item.sub) ref.subEl.textContent = item.sub;
  if (item.unit && ref.unitEl.textContent !== item.unit) ref.unitEl.textContent = item.unit;

  ref.price.textContent = fmtPrice(item.price, d);
  ref.pct.textContent = fmtPct(shownPct);
  ref.abs.textContent = fmtSigned(item.change, d);
  if (anchor !== 'default') {
    const note = ref.el.querySelector('[data-f="anchor-note"]');
    if (note) note.textContent = `基准 ${ANCHOR_LABEL[anchor] ?? anchor}`;
  } else {
    const note = ref.el.querySelector('[data-f="anchor-note"]');
    if (note) note.textContent = '';
  }

  // 价格变化时闪一下
  if (ref.lastPrice != null && Number.isFinite(item.price) && item.price !== ref.lastPrice) {
    const cls = item.price > ref.lastPrice ? 'tick-up' : 'tick-down';
    ref.el.classList.remove('tick-up', 'tick-down');
    void ref.el.offsetWidth;
    ref.el.classList.add(cls);
    setTimeout(() => ref.el.classList.remove(cls), 750);
  }
  if (Number.isFinite(item.price)) ref.lastPrice = item.price;

  ref.spark.innerHTML = sparklineSVG(item.history, dir);

  renderExtras(ref.extras, item, d);

  const parts = [];
  const range = metaRange(item);
  if (range) parts.push(range);
  const src = prettySource(item.source);
  if (src && src !== '—') parts.push(src);
  if (item.sessionTime) parts.push(`行情 ${item.sessionTime}`);
  if (item.historyNote) parts.push(item.historyNote);
  ref.metaline.textContent = parts.join(' · ');

  const f = item.freshness;
  if (ref.fresh) {
    if (!ok || !f) {
      ref.fresh.textContent = '';
      ref.fresh.className = 'fresh';
    } else {
      ref.fresh.textContent = freshShort(f);
      ref.fresh.className = `fresh lv-${f.level}${f.suspect ? ' suspect' : ''}`;
      ref.fresh.title = [
        f.dataTime ? `源数据时点 ${new Date(f.dataTime).toLocaleString('zh-CN', { hour12: false })}` : '源未提供时间戳',
        f.ageMs != null ? `距今 ${f.label}` : '',
        f.suspectNote ?? '',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
  if (f?.suspect) ref.el.classList.add('suspect');
  else ref.el.classList.remove('suspect');

  ref.err.textContent = !ok && item.error ? `取数失败：${item.error}` : '';
}


/** 新鲜度短标签：秒/分/时/天，一眼能看出数据有多旧 */
export function freshShort(f) {
  if (!f) return '—';
  if (f.label === '实时推送') return '实时';
  if (f.ageMs == null) return '—';
  const s = Math.max(0, Math.round(f.ageMs / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function apply(data) {
  store.ttl = Number(data.ttlMs) || 15000;
  store.quotes = data.items ?? [];
  if (Array.isArray(data.synthetics)) {
    store.synthetics = data.synthetics;
    renderSynthetics(data.synthetics);
  }
  const prefs = getWorkspaceStore().getState();

  const order = [];
  for (const item of data.items ?? []) {
    order.push(item.id);
    if (!refs.has(item.id)) rowsEl.appendChild(buildRow(item));
    updateRow(item, prefs);
  }

  // 后端若改变标的集合，清掉多余的卡片
  for (const [id, ref] of refs) {
    if (!order.includes(id)) {
      ref.el.remove();
      refs.delete(id);
    }
  }

  // 报价更新后广播一次；地图在挂载期间订阅（等价于原来「地图可见才刷」的判断）
  syncPinButtons();
  emit('quotes', data);

  const failed = (data.items ?? []).filter((i) => i.ok === false).length;
  const stamp = data.generatedAt ? clockText(new Date(data.generatedAt)) : clockText();
  updatedEl.textContent = failed ? `更新于 ${stamp} · ${failed} 项异常` : `更新于 ${stamp}`;

  rowsEl.setAttribute('aria-busy', 'false');
}

const GROUP_LABEL = {
  core: '核心跨资产',
  asia: '亚太股指',
  europe: '欧洲股指',
  americas: '美洲股指',
  pinned: '我的自选',
};

/** 分组标题只在 grouped 密度下渲染：按 group 把行包进 .row-group */
export function applyDensity(density) {
  rowsEl.dataset.density = density;
  rowsEl.querySelectorAll('.row-group-head').forEach((el) => el.remove());
  if (density !== 'grouped') return;

  const rows = [...rowsEl.querySelectorAll('.row[data-id]')];
  let lastGroup = null;
  for (const row of rows) {
    const group = row.dataset.group ?? groupOf(row.dataset.id);
    if (group === lastGroup) continue;
    lastGroup = group;
    const head = document.createElement('div');
    head.className = 'row-group-head';
    head.textContent = GROUP_LABEL[group] ?? group;
    rowsEl.insertBefore(head, row);
  }
}

function groupOf(id) {
  return PLACEHOLDER.find((p) => p.id === id)?.group ?? 'core';
}

/** 工作台控制条：只在首次挂载，偏好变化时重排列表（不重新取数） */
let barOff = null;

function mountBar() {
  const host = document.getElementById('ws-bar');
  if (!host || barOff) return;
  barOff = mountWorkspaceBar(host, {
    onChange: (prefs) => {
      applyDensity(prefs.density);
      const items = store.quotes ?? [];
      for (const item of items) updateRow(item, prefs);
    },
  });
}

export function renderSkeleton() {
  rowsEl.innerHTML = '';
  refs.clear();
  for (const item of PLACEHOLDER) {
    const el = buildRow(item);
    el.dataset.group = item.group;
    rowsEl.appendChild(el);
  }
  applyDensity(getWorkspaceStore().getState().density);
  syncPinButtons();
  mountBar();
  rowsEl.setAttribute('aria-busy', 'true');
}
