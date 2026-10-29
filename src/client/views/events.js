/* ================================================================== *
 * events.js —— #/events：事件流 + 财经日历 + 事件研究（含 AI 辅助分类轮询）。
 *
 * 来源：public/app.js（原 3655 行单体）L2374-2753，整段搬运，逻辑未改写。
 * ================================================================== */

/* ================================================================== *
 * 全球事件中心 + 宏观日历
 * ================================================================== */
import { loadCalendarCached } from '../shared/calendar.js';
import { eventsEl } from '../shared/dom.js';
import { clockText, esc, html, safeHref } from '../shared/format.js';
import { todayFocusHTML } from './today-focus.js';
import { PLACEHOLDER, store } from '../shared/store.js';
import { getJson } from '../shared/fetch-json.js';
import { api } from '../shared/api.js';


export let eventsTimer = null;

export const KIND_LABEL = { fomc: 'FOMC', cpi: 'CPI', nfp: '非农', ppi: 'PPI', pce: 'PCE', gdp: 'GDP', retail: '零售' };

export function weekdayCN(dateStr) {
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return '';
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}


export function calendarBlockHTML(cal) {
  const upcoming = (cal?.upcoming ?? []).slice(0, 8);
  if (!upcoming.length) {
    return html`<div class="chart-empty">暂无日历数据</div>`;
  }
  const today = cal.today;
  const items = upcoming.map((e) => {
    const isToday = e.date === today;
    const days = Math.round((new Date(`${e.date}T00:00:00+08:00`) - new Date(`${today}T00:00:00+08:00`)) / 86400000);
    const when = isToday ? '今天' : days === 1 ? '明天' : `${days} 天后`;
    return html`<div class="cal-item${isToday ? ' today' : ''}">
        <span class="cal-date"><b>${e.date.slice(5)}</b><em>${weekdayCN(e.date)}</em></span>
        <span class="cal-kind k-${e.kind}">${KIND_LABEL[e.kind] ?? e.kind}</span>
        <span class="cal-title">${e.title}</span>
        <span class="cal-time">${e.time}<em>${when}</em></span>
      </div>`;
  });
  return html`<div class="cal-list">${items}</div>`;
}

export function eventItemHTML(ev) {
  // 迁移到 html`` 后不再手写 esc()：插入即转义，嵌套的 html`` 结果原样拼入。
  // 静态片段（徽标、分隔符）一律再用一层 html`` 包，而不是 raw() ——
  // raw 是绕过转义的后门，白名单为空时就不该为静态字面量开口子。
  const topicChips = ev.topics.map(
    (t) => html`<span class="ev-topic${t.strong ? ' strong' : ''}">${t.label}</span>`,
  );
  const symChips = ev.symbols.slice(0, 5).map((s) => {
    const meta = PLACEHOLDER.find((p) => p.id === s);
    return meta ? html`<span class="ev-sym">${meta.short ?? meta.name}</span>` : '';
  });
  // safeHref 返回 '' 就整段不渲染 —— 宁可没有「原文」入口，也不给一条
  // javascript: 链接。服务端已清过一遍，这是第二道。
  const href = safeHref(ev.url);
  const link = href
    ? html`<a class="ev-link" href="${href}" target="_blank" rel="noreferrer noopener">原文 ↗</a>`
    : '';
  const isNew = store.events?.newIds?.has(ev.id);
  // 有多源时「谁发的」比「哪个通道抓的」有用得多：日经的稿子经 Google 聚合
  // 转手，读者要看到的是「日本経済新聞」而不是「日文财经」。
  const byline = ev.publisher && ev.publisher !== ev.source ? ev.publisher : ev.source;
  const channelNote = ev.publisher && ev.publisher !== ev.source ? ev.source : '';
  const oneHand =
    ev.origin === 'direct'
      ? html`<span class="ev-origin direct" title="媒体/机构自己发布的feed，链接直达原文域名">一手</span>`
      : ev.origin === 'aggregate'
        ? html`<span class="ev-origin agg" title="${channelNote || '聚合索引'}｜经 Google News 索引转手，标题与出处由聚合方提供">索引</span>`
        : '';
  const langChip = ev.lang && ev.lang !== 'zh' ? html`<span class="ev-lang">${ev.lang}</span>` : '';
  // 原来是 join('') 后判空：只要有一个符号命中就显示分隔符
  const symsExist = symChips.some((x) => x !== '');
  return html`<article class="event lv-${ev.level}${isNew ? ' is-new' : ''}" data-id="${ev.id}">
    <div class="ev-time">${ev.time.slice(11, 16)}<em>${ev.time.slice(5, 10)}</em></div>
    <div class="ev-main">
      <div class="ev-tags">
        ${ev.level === 'high' ? html`<span class="ev-badge high">重要</span>` : ev.level === 'mid' ? html`<span class="ev-badge mid">关注</span>` : ''}
        ${ev.llm ? html`<span class="ev-ai" title="已由 LLM 做语义判定">AI</span>` : ''}
        ${isNew ? html`<span class="ev-new">NEW</span>` : ''}
        ${topicChips}
      </div>
      <h4 class="ev-title">${ev.title}</h4>
      ${ev.body && ev.body !== ev.title ? html`<p class="ev-body">${ev.body}</p>` : ''}
      <div class="ev-meta">${oneHand}${langChip}<span class="ev-pub"${channelNote ? html` title="经 ${channelNote} 采集"` : ''}>${byline}</span>${symsExist ? html`<span class="ev-sep">·</span>${symChips}` : ''}${revisionChipHTML(ev)}${link}</div>
    </div>
  </article>`;
}

/**
 * 事件版本徽章（C3）。
 *
 * 只有真的改过才显示：`revision` 来自 /api/events（每条的当前最大修订号）。
 * 徽章本身不是「最新」暗示，而是「这条被改判过 N 次，可以查」。
 */
export function revisionChipHTML(ev) {
  const n = Number(ev?.revision);
  if (!Number.isFinite(n) || n <= 1) return '';
  return html`<button type="button" class="ev-rev" data-event-revisions="${ev.id}" title="这条事件有过 ${n} 个版本，点开看每一版的标题与等级">第 ${n} 版</button>`;
}

const SHOCK_LABEL = { supply: '供给受阻', demand: '需求增强' };

/**
 * 版本面板的一行：第 N 版 + 时间 + 等级 + 标题。
 *
 * 有些版本是**只带分类结果**的（解释引用事件时先落库的那一版，没有正文）。
 * 那种版本要说清楚它记了什么，而不是显示一个「标题缺失」——
 * 否则读者会以为标题被改掉了。
 */
export function revisionRowHTML(row) {
  const p = row?.payload ?? {};
  const when = String(row?.knownAt ?? '').replace('T', ' ').slice(5, 16);
  const level = p.level ? html`<span class="ev-rev-level">${p.level}</span>` : '';
  const text = p.title
    ? p.title
    : p.shockType
      ? `分类：${SHOCK_LABEL[p.shockType] ?? p.shockType}（此版只记录了分类结果）`
      : p.partial
        ? '（此版只记录了分类结果）'
        : '（未记录标题）';
  // 标题整体更换：多半是上游把同一个 id 复用到另一条新闻上，必须点明
  const retitle = p.retitled
    ? html`<span class="ev-rev-flag" title="上一版标题：${p.previousTitle ?? '—'}">标题整体更换</span>`
    : '';
  return html`<li class="ev-rev-row"><span class="ev-rev-no">#${row.revision}</span><span class="ev-rev-time">${when}</span>${level}<span class="ev-rev-title">${text}</span>${retitle}</li>`;
}

/** 版本面板：一次请求拿全，默认只列最近 5 版 */
export function revisionPanelHTML(eventId, rows) {
  const list = (rows ?? []).slice(-5).reverse();
  if (!list.length) return '';
  return html`<div class="ev-rev-panel" data-panel="${eventId}">
    <div class="ev-rev-head">这条事件的 ${list.length} 个版本 <span class="ev-rev-note">修订是追加的：旧版本不会被覆盖</span></div>
    <ul class="ev-rev-list">${list.map(revisionRowHTML)}</ul>
  </div>`;
}

/** 取某事件的版本列表 */
export async function loadEventRevisions(eventId, { fetchImpl } = {}) {
  // 统一出口：注入走 fetchImpl（测试），否则走共享 api（生产拿到超时/去重/错误分类）
  const body = await getJson(`api/events/${encodeURIComponent(eventId)}/revisions`, { fetchImpl: fetchImpl ?? null });
  return body?.revisions ?? [];
}

/**
 * 把同事件的重复报道折叠成一行（方案 B2 / §4.4）。
 *
 * 十条媒体转同一条央行发言不该占十行。折叠单位是**事件簇**而不是 URL：
 * 同一原始报道的转载 URL 不同，但事件是同一个。
 *
 * 返回的行有两类：
 *   { kind:'single', ev }
 *   { kind:'cluster', primary, others, articleCount, publisherCount, sources }
 * 折叠只影响展示：每条原文仍然保留，点开就能看到各自来源。
 */
export function groupEventsByCluster(items, clusters) {
  if (!Array.isArray(clusters) || !clusters.length) return (items ?? []).map((ev) => ({ kind: 'single', ev }));
  const byId = new Map((items ?? []).map((ev) => [ev.id, ev]));
  const clusterOf = new Map();
  for (const c of clusters) {
    for (const id of c.articleIds ?? []) clusterOf.set(id, c);
  }
  const seen = new Set();
  const rows = [];
  for (const ev of items ?? []) {
    const c = clusterOf.get(ev.id);
    if (!c || (c.articleCount ?? 1) <= 1) {
      rows.push({ kind: 'single', ev });
      continue;
    }
    if (seen.has(c.eventId)) continue;
    seen.add(c.eventId);
    const members = (c.articleIds ?? []).map((id) => byId.get(id)).filter(Boolean);
    const primary = members.find((m) => m.id === c.primary) ?? members[0] ?? ev;
    rows.push({
      kind: 'cluster',
      primary,
      others: members.filter((m) => m !== primary),
      articleCount: c.articleCount ?? members.length,
      publisherCount: c.independentPublisherCount ?? new Set(members.map((m) => m.publisher)).size,
      sources: c.sources ?? [],
    });
  }
  return rows;
}

/** 一行事件：单条事件，或折叠后的同事件多源 */
export function eventRowHTML(row) {
  if (row.kind === 'single') return eventItemHTML(row.ev);
  const badge = html`<div class="ev-cluster" data-cluster="${row.primary.id}">
    <button type="button" class="ev-cluster-toggle" aria-expanded="false">同事件 ${row.articleCount} 条报道 · ${row.publisherCount} 家来源</button>
    <div class="ev-cluster-more" hidden>${row.others.map(eventItemHTML)}</div>
  </div>`;
  return html`${eventItemHTML(row.primary)}${badge}`;
}

/**
 * 同事件折叠的展开/收起：只影响显示，不改变任何分类结果。
 *
 * 单独导出便于测试 —— 折叠是纯展示，但"点不开"和"吞掉原文"都是真故障。
 */
/**
 * 版本面板的展开/收起（C3）。
 *
 * 面板插在条目后面，不替换条目本身：读原文时不该丢掉上下文。
 * 取不到版本就显示一句原因，而不是留一个空白块。
 */
export function bindRevisionChips(root = document) {
  for (const btn of root.querySelectorAll('[data-event-revisions]')) {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.eventRevisions;
      const article = btn.closest('article.event');
      const existing = article?.nextElementSibling;
      if (existing?.classList?.contains('ev-rev-panel')) {
        existing.remove();
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      btn.setAttribute('aria-expanded', 'true');
      const rows = await loadEventRevisions(id);
      const holder = document.createElement('div');
      holder.innerHTML = rows.length
        ? revisionPanelHTML(id, rows).toString()
        : '<div class="ev-rev-panel ev-rev-empty">这个事件的版本记录取不到（接口不可用或尚未落库）</div>';
      article?.after(holder.firstElementChild ?? holder);
      holder.querySelector('.ev-rev-close')?.addEventListener('click', () => holder.remove());
    });
  }
}

export function bindClusterToggles(root = document) {
  for (const btn of root.querySelectorAll('.ev-cluster-toggle')) {
    btn.addEventListener('click', () => {
      const box = btn.closest('.ev-cluster');
      const more = box?.querySelector('.ev-cluster-more');
      if (!more) return;
      const open = more.hidden;
      more.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        const total = box.querySelectorAll('.event').length + 1;
        btn.dataset.label = btn.textContent;
        btn.textContent = `收起其余报道（共 ${total} 条）`;
      } else if (btn.dataset.label) {
        btn.textContent = btn.dataset.label;
      }
    });
  }
}

export function renderEvents(opts = {}) {
  const keepScroll = opts.keepScroll ? window.scrollY : null;
  const st = store.events;
  if (!st?.data) {
    eventsEl.innerHTML = html`<div class="d-loading">正在聚合全球实时快讯…</div>`.toString();
    return;
  }
  const data = st.data;
  const cal = st.calendar;
  const topics = data.topics ?? [];

  let items = data.items ?? [];
  if (st.level === 'high') items = items.filter((i) => i.level === 'high');
  if (st.topic) items = items.filter((i) => i.topics.some((t) => t.key === st.topic));
  // 来源筛选：国内三源是快讯流（更新最快），它们的条目天然排在最前，
  // 不提供「只看外媒」的开关，全球媒体会被中文快讯一直压在下面。
  if (st.origin === 'direct') items = items.filter((i) => i.origin === 'direct');
  else if (st.origin === 'aggregate') items = items.filter((i) => i.origin === 'aggregate');
  else if (st.origin === 'domestic') items = items.filter((i) => !i.origin);
  else if (st.origin === 'foreign') items = items.filter((i) => i.lang && i.lang !== 'zh');

  // 41 个源全部铺出来会把标题行撑爆，也没人读。按类别汇总，失败源单独点名
  // —— 静默降级最难查，必须让它自己跳出来。
  const cov = data.coverage ?? {};
  const failed = (data.sources ?? []).filter((s) => !s.ok);
  const foreignCount = (data.items ?? []).filter((i) => i.lang && i.lang !== 'zh').length;
  const srcLine = cov.sources
    ? `${cov.sources.ok}/${cov.sources.total} 个源可用 · 官方 ${cov.official} · 媒体 ${cov.media} · 本地聚合 ${cov.aggregate} · 国内快讯 ${cov.domestic}`
      + (failed.length ? ` · 失败 ${failed.map((s) => s.source).join('、')}` : '')
    : (data.sources ?? []).map((s) => (s.ok ? `${s.source} ${s.count}` : `${s.source} 失败`)).join(' · ');

  eventsEl.innerHTML = html`
    <div id="today-focus-slot"></div>
    <div class="d-top">
      <button type="button" class="back-btn" id="back-events">← 返回列表</button>
      <div class="d-id">
        <h2>全球事件中心</h2>
        <p>${srcLine} · 只保留对市场有影响的条目</p>
      </div>
      <div class="macro-status">
        ${
          data.llm?.enabled
            ? html`<span class="llm-pill" title="关键词打底 + LLM 语义辅助分类。这个标签表示「已按语义归过类」，不代表原文事实或资产影响已被核实；${data.llm.pending ? '正在分类新的条目' : '已完成当前批次'}">AI 辅助分类 ${data.llm.applied}/${data.total}${data.llm.pending ? ' …' : ''}</span>`
            : ''
        }
        <span class="risk-note">${data.generatedAt ? clockText(new Date(data.generatedAt)) : ''} 更新</span>
        <button type="button" class="back-btn" id="refresh-events">刷新</button>
      </div>
    </div>
    ${
      st.newCount
        ? html`<button type="button" class="new-banner" id="jump-new">↑ ${st.newCount} 条新事件</button>`
        : ''
    }

    <section class="d-block">
      <h3>即将公布 <span class="h3-note">FOMC 取美联储官网，CPI/非农等取美国劳工统计局发布日程</span></h3>
      ${calendarBlockHTML(cal)}
    </section>

    <section class="d-block">
      <div class="chart-head">
        <h3>实时事件流 <span class="h3-note">共 ${data.total} 条（同事件已折叠）· 外媒 ${foreignCount} 条 · 一手 ${cov.origins?.direct ?? 0} 条 · 高影响 ${data.counts?.high ?? 0} 条 · 按时间倒序</span></h3>
        <div class="seg" id="level-filter">
          <button type="button" data-l="" class="${!st.level ? 'on' : ''}">全部</button>
          <button type="button" data-l="high" class="${st.level === 'high' ? 'on' : ''}">只看重要</button>
        </div>
      </div>
      <div class="pick-row" id="origin-filter">
        <span class="pick-label">来源</span>
        <button type="button" class="pick ${!st.origin ? 'on' : ''}" data-o="">全部</button>
        <button type="button" class="pick ${st.origin === 'direct' ? 'on' : ''}" data-o="direct" title="媒体或机构自己发布的 feed，链接直达原文域名">一手直连</button>
        <button type="button" class="pick ${st.origin === 'aggregate' ? 'on' : ''}" data-o="aggregate" title="经 Google News 多语种索引转手，覆盖关停 RSS 的通讯社">全球索引</button>
        <button type="button" class="pick ${st.origin === 'domestic' ? 'on' : ''}" data-o="domestic">国内快讯</button>
        <button type="button" class="pick ${st.origin === 'foreign' ? 'on' : ''}" data-o="foreign">只看外媒</button>
      </div>
      <div class="pick-row" id="topic-filter">
        <button type="button" class="pick ${!st.topic ? 'on' : ''}" data-t="">全部主题</button>
        ${topics.map(
          (t) =>
            html`<button type="button" class="pick ${st.topic === t.key ? 'on' : ''}" data-t="${t.key}">${t.label}</button>`,
        )}
      </div>
      <div class="event-list">
        ${items.length ? groupEventsByCluster(items, data.clusters).map(eventRowHTML) : html`<div class="chart-empty">当前筛选下没有条目</div>`}
      </div>
    </section>

    <section class="d-block">
      <h3>事件研究 <span class="h3-note">这些日子真的更动荡吗 · 事件日 vs 普通日波动对照</span></h3>
      ${eventStudyHTML(st.study, st.studyMode ?? 'auto')}
    </section>

    <footer class="d-foot">
      <span>标签与影响等级由关键词、源重要度与 LLM 语义复核共同判定，仅供筛选参考</span>
      <span>覆盖 ${cov.languages?.length ?? 0} 种语言 · ${cov.publishers?.length ?? 0} 家媒体 · 一手 ${cov.origins?.direct ?? 0} 条 / 索引 ${cov.origins?.aggregate ?? 0} 条</span>
    </footer>
  `.toString();

  document.getElementById('back-events')?.addEventListener('click', () => {
    location.hash = '';
  });
  document.getElementById('refresh-events')?.addEventListener('click', () => {
    loadEvents(true);
  });
  document.getElementById('jump-new')?.addEventListener('click', () => {
    store.events.newIds = null;
    store.events.newCount = 0;
    renderEvents();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  bindClusterToggles();
  bindRevisionChips();
  document.querySelectorAll('#level-filter button').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.events.level = btn.dataset.l;
      renderEvents();
    });
  });
  document.querySelectorAll('#origin-filter .pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.events.origin = btn.dataset.o;
      renderEvents();
    });
  });
  document.querySelectorAll('#topic-filter .pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.events.topic = btn.dataset.t;
      renderEvents();
    });
  });
  // 事件研究的 T+0 / T+1 / 智能对齐 口径切换（纯前端切行，不重新请求）
  document.querySelectorAll('#study-lag button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.lag;
      store.events.studyMode = v === 'auto' ? 'auto' : Number(v);
      renderEvents();
    });
  });

  // 顶部槽位是这次重建里被清掉的那一块：用缓存补回来（没有缓存才发请求）
  paintTodayFocus();

  if (keepScroll != null) window.scrollTo(0, keepScroll);
}

export function stopEventsTimer() {
  if (eventsTimer) {
    clearInterval(eventsTimer);
    eventsTimer = null;
  }
}

export async function loadEvents(force = false) {
  try {
    const [data, cal, study] = await Promise.all([
      // 共享请求层：与地图共用同一份 in-flight，两边同时进不会打两次
      api.get('api/events', { params: force ? { force: 1 } : null }).then((r) => r.data),
      loadCalendarCached(force),
      loadEventStudy(false),
    ]);
    if (!store.events) store.events = { data, calendar: cal, study, level: '', topic: '', origin: '', studyMode: 'auto', newIds: null, newCount: 0 };
    store.events.study = study;

    // 增量：只有真正「没见过」的条目才标记为 NEW，避免整页闪
    const prevIds = new Set((store.events.data?.items ?? []).map((i) => i.id));
    const fresh = (data.items ?? []).filter((i) => !prevIds.has(i.id));

    store.events.data = data;
    store.events.calendar = cal;
    if (!force && prevIds.size && fresh.length) {
      store.events.newIds = new Set(fresh.map((i) => i.id));
      store.events.newCount = fresh.length;
    }
    if (location.hash.startsWith('#/events')) renderEvents({ keepScroll: !force });

    // LLM 是异步复核的：还在跑就稍后再拉一次，让 AI 徽章尽快出现
    if (data.llm?.pending && location.hash.startsWith('#/events')) {
      store.events.llmRetryCount = store.events.llmRetryCount ?? 0;
      if (store.events.llmRetryCount < 4 && !store.events.llmRetry) {
        store.events.llmRetry = setTimeout(() => {
          store.events.llmRetry = null;
          store.events.llmRetryCount += 1;
          loadEvents(false);
        }, 7000);
      }
    } else {
      store.events.llmRetryCount = 0;
    }
  } catch (err) {
    eventsEl.innerHTML = html`<div class="d-top"><button type="button" class="back-btn" id="back-events">← 返回列表</button><div class="d-id"><h2>全球事件中心</h2><p>加载失败</p></div></div><div class="d-error">${err?.message ?? String(err)}</div>`.toString();
    document.getElementById('back-events')?.addEventListener('click', () => {
      location.hash = '';
    });
  }
}


/* ================================================================== *
 * 事件研究：日历事件日 vs 普通日的波动对照
 * ================================================================== */

export const STUDY_KIND_LABEL = { fomc: 'FOMC', cpi: 'CPI', nfp: '非农', ppi: 'PPI', pce: 'PCE', gdp: 'GDP', retail: '零售' };
export let studyCacheClient = null;

export function ratioBg(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return 'rgba(255,255,255,0.035)';
  // 1.0 以下偏冷、以上偏暖，0.9~1.8 之间铺满色阶
  const t = Math.max(-1, Math.min(1, (ratio - 1.25) / 0.5));
  return t >= 0
    ? `rgba(245,69,92,${(t * 0.62 + 0.05).toFixed(3)})`
    : `rgba(91,156,248,${(-t * 0.62 + 0.05).toFixed(3)})`;
}

export function eventStudyHTML(study, mode = 'auto') {
  if (!study?.ok) {
    return html`<div class="chart-empty">${study?.error ?? '暂无足够历史事件'}</div>`;
  }
  const kinds = study.kinds.map((k) => k.kind);

  /**
   * 选行口径：
   * auto —— 用后端算好的对齐结果。事件日已经按「该品种所在市场的交易时段」投影过：
   *          FOMC 在美股算当日（美东 14:00 收盘前）、在上证/沪金算北京次日凌晨；
   *          CPI/非农在美股算当日、在 A 股要等到次日（北京 20:30 已收盘）。
   *          所以对齐之后格内统一是 T+0 —— 它表示「这个市场开始消化这条消息的那一天」。
   * 0/1  —— 强制全市场统一口径，用于对照「忽略交易时段错配会看到什么」
   */
  const pickRow = (symbol, kind) => {
    const pool = study.rows.filter((r) => r.symbol === symbol && r.kind === kind);
    if (!pool.length) return null;
    if (mode === 'auto') return pool.find((r) => r.isAuto) ?? pool.find((r) => r.lag === 0) ?? null;
    return pool.find((r) => r.lag === mode) ?? null;
  };

  const symbols = [];
  const seen = new Set();
  for (const r of study.rows) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    symbols.push({ id: r.symbol, name: r.name });
  }

  const cell = new Map();
  for (const s of symbols) {
    for (const k of kinds) {
      const r = pickRow(s.id, k);
      if (r) cell.set(`${s.id}|${k}`, r);
    }
  }

  const headCells = kinds.map((k) => {
    const info = study.kinds.find((x) => x.kind === k);
    return html`<th>${STUDY_KIND_LABEL[k] ?? k}<em>n=${info?.count ?? 0}</em></th>`;
  });
  const head = html`<tr><th class="corner">标的</th>${headCells}</tr>`;

  const bodyRows = symbols.map((s) => {
    const cells = kinds.map((k) => {
      const r = cell.get(`${s.id}|${k}`);
      if (!r) return html`<td class="corr na">—</td>`;
      const sig = r.significant ? '*' : '';
      const lagTag = mode === 'auto' ? `T+${r.lag}` : '';
      const medRatio = r.medianRatio ?? r.ratio;
      const lagLabel = r.lag
        ? '事件后第 1 个交易日'
        : mode === 'auto'
          ? '该市场开始消化消息的交易日'
          : '事件当日';
      const title =
        `${s.name} · ${STUDY_KIND_LABEL[k]}：${lagLabel}` +
        `平均波动 ${r.eventMeanPct.toFixed(2)}%，普通日 ${r.baseMeanPct.toFixed(2)}%，` +
        `倍数 ${r.ratio.toFixed(2)}x（中位数口径 ${medRatio.toFixed(2)}x），` +
        `t=${r.t == null ? '—' : r.t.toFixed(2)}，样本 ${r.eventDays}`;
      return html`<td class="corr ${Math.abs(r.ratio - 1) > 0.3 ? 'strong' : 'mid'}"
        style="background:${ratioBg(r.ratio)}" title="${title}">${r.ratio.toFixed(2)}x${sig}${
        lagTag ? html`<i class="lag-tag">${lagTag}</i>` : ''
      }</td>`;
    });
    return html`<tr><th class="row-head">${s.name}</th>${cells}</tr>`;
  });

  const top = [...cell.values()]
    .filter((r) => r.significant && r.ratio > 1)
    .sort((a, b) => Math.abs(b.t) - Math.abs(a.t))
    .slice(0, 6);

  const modeBtn = (val, label, hint) =>
    html`<button type="button" data-lag="${val}" class="${String(mode) === String(val) ? 'on' : ''}" title="${hint}">${label}</button>`;

  // 说明文案里有 <b> 标签，所以必须用 html`` 包（否则被当文本转义）。
  // 原来手写的 &gt; 改回字面 >：模板会转义一次，写实体就成了双转义。
  const hint =
    mode === 'auto'
      ? html`智能对齐：事件日按各品种所在市场的交易时段换算，不是拿同一个日历日期套所有标的。FOMC 在美东 14:00 公布（收盘前）→ 美股算当日，北京时间已是次日凌晨 → 上证/沪金也算当日；CPI / 非农在美东 08:30 公布 → 美股算当日，而北京 20:30 已经收盘 → A 股要等到次日。所以对齐之后格内统一标 <b>T+0</b>，含义是「这个市场开始消化这条消息的那一天」，不是「发布那一刻所在的那一天」。`
      : html`当前强制统一为 <b>T+${mode}</b> 口径，即所有标的共用同一个日历日期。跨市场资产在此口径下会混入「消息发布时该市场尚未开盘 / 已经收盘」的错配，仅作对照参考。`;

  const topChips = top.map(
    (r) =>
      html`<span class="study-chip">${r.name} × ${STUDY_KIND_LABEL[r.kind] ?? r.kind} <b>${r.ratio.toFixed(2)}x</b> <em>t=${r.t.toFixed(1)}</em></span>`,
  );

  return html`<div class="study-toolbar">
    <div class="seg" id="study-lag">
      ${modeBtn('auto', '智能对齐', '事件日已按各品种所在市场的交易时段投影：FOMC 对美股是当日、对上证/沪金是北京次日凌晨；CPI/非农对 A 股要等次日')}
      ${modeBtn('0', 'T+0', '全部按事件当日口径（不区分市场）')}
      ${modeBtn('1', 'T+1', '全部按事件后一个交易日口径（不区分市场）')}
    </div>
  </div>
  <div class="matrix-wrap">
    <table class="corr-matrix study-matrix"><thead>${head}</thead><tbody>${bodyRows}</tbody></table>
  </div>
  <p class="macro-hint">
    数字 = 事件日平均绝对波动 ÷ 普通日平均绝对波动（>1 说明这天更动荡），带 <b>*</b> 表示 Welch t 检验 |t|>1.96。
    悬停看具体数值与中位数口径。<br>
    ${hint}
  </p>
  ${
    top.length
      ? html`<div class="study-top"><span class="study-top-label">统计上最显著：</span>${topChips}</div>`
      : ''
  }`;
}


export async function loadEventStudy(force = false) {
  if (!force && studyCacheClient) return studyCacheClient;
  try {
    const { data } = await api.get('api/eventstudy', { params: force ? { force: 1 } : null });
    studyCacheClient = data;
  } catch {
    /* 忽略 */
  }
  return studyCacheClient;
}

/* ------------------------------------------------------------------ *
 * 生命周期（由 router 调用）
 *
 * 注意 llmRetry：它是「等 AI 辅助分类结果」的一次性定时器，挂在 store.events 上
 * （store.events.llmRetry）。原来的 stopEventsTimer() 只 clearInterval(eventsTimer)，
 * 漏了这一个 —— 离开事件页后它仍会触发一次重绘，把已经清空的容器写回内容。
 * ------------------------------------------------------------------ */
/**
 * 事件中心顶部「今天重点三件 + 下一件关键发布」（产品 §3）。
 *
 * 单独一路取数：它与事件流不是同一份数据（要用日历的下一件发布），
 * 而且**取不到就不显示这一块**，不能让顶部结构挡住事件流。
 */
/** 上一次取到的「今天重点」：重绘时用它把槽位补回来，不重复请求 */
let todayFocusCache = null;

/** 把缓存写进槽位（重绘后调用）；没有缓存就发一次请求 */
function paintTodayFocus() {
  const slot = typeof document !== 'undefined' ? document.getElementById('today-focus-slot') : null;
  if (!slot) return;
  if (todayFocusCache) {
    slot.innerHTML = todayFocusHTML(todayFocusCache).toString();
    return;
  }
  void hydrateTodayFocus();
}

export async function hydrateTodayFocus({ fetchImpl = null } = {}) {
  const slot = document.getElementById('today-focus-slot');
  if (!slot) return null;
  const body = await getJson('api/today-focus', { fetchImpl: fetchImpl ?? null });
  if (!body) {
    // 顶部结构是加分项：取不到就保持空槽，不给一块红字
    slot.innerHTML = '';
    return null;
  }
  todayFocusCache = body;
  slot.innerHTML = todayFocusHTML(body).toString();
  return body;
}

export function mountEvents() {
  eventsEl.hidden = false;
  window.scrollTo({ top: 0 });
  /**
   * 顺序很关键：`loadEvents` 会重写 eventsEl.innerHTML，槽位是它的一部分。
   * 先 hydrate 再 loadEvents，会把刚填好的内容冲掉（真实浏览器里槽位一直是空的）。
   */
  void loadEvents(true).then(() => hydrateTodayFocus());
  eventsTimer = setInterval(() => loadEvents(false), 30000);
}

export function unmountEvents() {
  stopEventsTimer();
  if (store.events?.llmRetry) {
    clearTimeout(store.events.llmRetry);
    store.events.llmRetry = null;
  }
  eventsEl.hidden = true;
  eventsEl.innerHTML = '';
}
