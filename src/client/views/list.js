/* ================================================================== *
 * list.js —— 首屏纵向列表：一行一个标的、迷你走势、涨跌闪烁、刷新节奏。
 *
 * 来源：public/app.js（原 3655 行单体）L158-372，整段搬运，逻辑未改写。
 * ================================================================== */
import { rowsEl, updatedEl } from '../shared/dom.js';
import { clockText, dirOf, esc, fmtPct, fmtPrice, fmtSigned, html, metaRange, prettySource, sparklineSVG } from '../shared/format.js';
import { PLACEHOLDER, refs, store } from '../shared/store.js';
import { emit } from '../shared/bus.js';


/* ------------------------------ 渲染 ------------------------------ */

export function buildRow(item) {
  const el = document.createElement('article');
  el.className = 'row skeleton';
  el.dataset.id = item.id;
  el.innerHTML = html`
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

export function updateRow(item) {
  const ref = refs.get(item.id);
  if (!ref) return;

  const d = item.decimals ?? 2;
  const dir = dirOf(item.changePct);
  const ok = item.ok !== false;

  ref.el.dataset.dir = dir;
  ref.el.classList.remove('skeleton');
  ref.el.classList.toggle('is-error', !ok && !item.stale);
  ref.el.classList.toggle('is-stale', !!item.stale);

  if (item.name && ref.nameEl.textContent !== item.name) ref.nameEl.textContent = item.name;
  if (item.sub && ref.subEl.textContent !== item.sub) ref.subEl.textContent = item.sub;
  if (item.unit && ref.unitEl.textContent !== item.unit) ref.unitEl.textContent = item.unit;

  ref.price.textContent = fmtPrice(item.price, d);
  ref.pct.textContent = fmtPct(item.changePct);
  ref.abs.textContent = fmtSigned(item.change, d);

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

  const order = [];
  for (const item of data.items ?? []) {
    order.push(item.id);
    if (!refs.has(item.id)) rowsEl.appendChild(buildRow(item));
    updateRow(item);
  }

  // 后端若改变标的集合，清掉多余的卡片
  for (const [id, ref] of refs) {
    if (!order.includes(id)) {
      ref.el.remove();
      refs.delete(id);
    }
  }

  // 报价更新后广播一次；地图在挂载期间订阅（等价于原来「地图可见才刷」的判断）
  emit('quotes', data);

  const failed = (data.items ?? []).filter((i) => i.ok === false).length;
  const stamp = data.generatedAt ? clockText(new Date(data.generatedAt)) : clockText();
  updatedEl.textContent = failed ? `更新于 ${stamp} · ${failed} 项异常` : `更新于 ${stamp}`;

  rowsEl.setAttribute('aria-busy', 'false');
}

export function renderSkeleton() {
  rowsEl.innerHTML = '';
  refs.clear();
  for (const item of PLACEHOLDER) rowsEl.appendChild(buildRow(item));
  rowsEl.setAttribute('aria-busy', 'true');
}
