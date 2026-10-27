/* ================================================================== *
 * events.js —— #/events：事件流 + 财经日历 + 事件研究（含 AI 复核轮询）。
 *
 * 来源：public/app.js（原 3655 行单体）L2374-2753，整段搬运，逻辑未改写。
 * ================================================================== */

/* ================================================================== *
 * 全球事件中心 + 宏观日历
 * ================================================================== */
import { loadCalendarCached } from '../shared/calendar.js';
import { eventsEl } from '../shared/dom.js';
import { clockText, esc } from '../shared/format.js';
import { PLACEHOLDER, store } from '../shared/store.js';


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
    return '<div class="chart-empty">暂无日历数据</div>';
  }
  const today = cal.today;
  return `<div class="cal-list">${upcoming
    .map((e) => {
      const isToday = e.date === today;
      const days = Math.round((new Date(`${e.date}T00:00:00+08:00`) - new Date(`${today}T00:00:00+08:00`)) / 86400000);
      const when = isToday ? '今天' : days === 1 ? '明天' : `${days} 天后`;
      return `<div class="cal-item${isToday ? ' today' : ''}">
        <span class="cal-date"><b>${e.date.slice(5)}</b><em>${weekdayCN(e.date)}</em></span>
        <span class="cal-kind k-${e.kind}">${esc(KIND_LABEL[e.kind] ?? e.kind)}</span>
        <span class="cal-title">${esc(e.title)}</span>
        <span class="cal-time">${esc(e.time)}<em>${esc(when)}</em></span>
      </div>`;
    })
    .join('')}</div>`;
}

export function eventItemHTML(ev) {
  const topicChips = ev.topics
    .map((t) => `<span class="ev-topic${t.strong ? ' strong' : ''}">${esc(t.label)}</span>`)
    .join('');
  const symChips = ev.symbols
    .slice(0, 5)
    .map((s) => {
      const meta = PLACEHOLDER.find((p) => p.id === s);
      return meta ? `<span class="ev-sym">${esc(meta.short ?? meta.name)}</span>` : '';
    })
    .join('');
  const link = ev.url
    ? `<a class="ev-link" href="${esc(ev.url)}" target="_blank" rel="noreferrer noopener">原文 ↗</a>`
    : '';
  const isNew = store.events?.newIds?.has(ev.id);
  // 有多源时「谁发的」比「哪个通道抓的」有用得多：日经的稿子经 Google 聚合
  // 转手，读者要看到的是「日本経済新聞」而不是「日文财经」。
  const byline = ev.publisher && ev.publisher !== ev.source ? ev.publisher : ev.source;
  const channelNote = ev.publisher && ev.publisher !== ev.source ? ev.source : '';
  const oneHand = ev.origin === 'direct'
    ? `<span class="ev-origin direct" title="媒体/机构自己发布的feed，链接直达原文域名">一手</span>`
    : ev.origin === 'aggregate'
      ? `<span class="ev-origin agg" title="${esc(channelNote || '聚合索引')}｜经 Google News 索引转手，标题与出处由聚合方提供">索引</span>`
      : '';
  const langChip = ev.lang && ev.lang !== 'zh' ? `<span class="ev-lang">${esc(ev.lang)}</span>` : '';
  return `<article class="event lv-${ev.level}${isNew ? ' is-new' : ''}" data-id="${esc(ev.id)}">
    <div class="ev-time">${esc(ev.time.slice(11, 16))}<em>${esc(ev.time.slice(5, 10))}</em></div>
    <div class="ev-main">
      <div class="ev-tags">
        ${ev.level === 'high' ? '<span class="ev-badge high">重要</span>' : ev.level === 'mid' ? '<span class="ev-badge mid">关注</span>' : ''}
        ${ev.llm ? '<span class="ev-ai" title="已由 LLM 做语义判定">AI</span>' : ''}
        ${isNew ? '<span class="ev-new">NEW</span>' : ''}
        ${topicChips}
      </div>
      <h4 class="ev-title">${esc(ev.title)}</h4>
      ${ev.body && ev.body !== ev.title ? `<p class="ev-body">${esc(ev.body)}</p>` : ''}
      <div class="ev-meta">${oneHand}${langChip}<span class="ev-pub"${channelNote ? ` title="经 ${esc(channelNote)} 采集"` : ''}>${esc(byline)}</span>${symChips ? `<span class="ev-sep">·</span>${symChips}` : ''}${link}</div>
    </div>
  </article>`;
}

export function renderEvents(opts = {}) {
  const keepScroll = opts.keepScroll ? window.scrollY : null;
  const st = store.events;
  if (!st?.data) {
    eventsEl.innerHTML = '<div class="d-store.loading">正在聚合全球实时快讯…</div>';
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

  eventsEl.innerHTML = `
    <div class="d-top">
      <button type="button" class="back-btn" id="back-events">← 返回列表</button>
      <div class="d-id">
        <h2>全球事件中心</h2>
        <p>${esc(srcLine)} · 只保留对市场有影响的条目</p>
      </div>
      <div class="macro-status">
        ${
          data.llm?.enabled
            ? `<span class="llm-pill" title="关键词打底 + LLM 语义复核；${data.llm.pending ? '正在分类新的条目' : '已完成当前批次'}">AI 复核 ${data.llm.applied}/${data.total}${data.llm.pending ? ' …' : ''}</span>`
            : ''
        }
        <span class="risk-note">${data.generatedAt ? clockText(new Date(data.generatedAt)) : ''} 更新</span>
        <button type="button" class="back-btn" id="refresh-events">刷新</button>
      </div>
    </div>
    ${
      st.newCount
        ? `<button type="button" class="new-banner" id="jump-new">↑ ${st.newCount} 条新事件</button>`
        : ''
    }

    <section class="d-block">
      <h3>即将公布 <span class="h3-note">FOMC 取美联储官网，CPI/非农等取美国劳工统计局发布日程</span></h3>
      ${calendarBlockHTML(cal)}
    </section>

    <section class="d-block">
      <div class="chart-head">
        <h3>实时事件流 <span class="h3-note">共 ${data.total} 条 · 外媒 ${foreignCount} 条 · 一手 ${cov.origins?.direct ?? 0} 条 · 高影响 ${data.counts?.high ?? 0} 条 · 按时间倒序</span></h3>
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
        ${topics
          .map((t) => `<button type="button" class="pick ${st.topic === t.key ? 'on' : ''}" data-t="${esc(t.key)}">${esc(t.label)}</button>`)
          .join('')}
      </div>
      <div class="event-list">
        ${items.length ? items.map(eventItemHTML).join('') : '<div class="chart-empty">当前筛选下没有条目</div>'}
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
  `;

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
    const [evRes, cal, study] = await Promise.all([
      fetch(`./api/events${force ? '?force=1' : ''}`, { cache: 'no-store' }),
      loadCalendarCached(force),
      loadEventStudy(false),
    ]);
    if (!evRes.ok) throw new Error(`HTTP ${evRes.status}`);
    const data = await evRes.json();
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
    eventsEl.innerHTML = `<div class="d-top"><button type="button" class="back-btn" id="back-events">← 返回列表</button><div class="d-id"><h2>全球事件中心</h2><p>加载失败</p></div></div><div class="d-error">${esc(err?.message ?? String(err))}</div>`;
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
    return `<div class="chart-empty">${esc(study?.error ?? '暂无足够历史事件')}</div>`;
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

  let head = '<tr><th class="corner">标的</th>';
  for (const k of kinds) {
    const info = study.kinds.find((x) => x.kind === k);
    head += `<th>${esc(STUDY_KIND_LABEL[k] ?? k)}<em>n=${info?.count ?? 0}</em></th>`;
  }
  head += '</tr>';

  let body = '';
  for (const s of symbols) {
    body += `<tr><th class="row-head">${esc(s.name)}</th>`;
    for (const k of kinds) {
      const r = cell.get(`${s.id}|${k}`);
      if (!r) {
        body += '<td class="corr na">—</td>';
        continue;
      }
      const sig = r.significant ? '*' : '';
      const lagTag = mode === 'auto' ? `T+${r.lag}` : '';
      const medRatio = r.medianRatio ?? r.ratio;
      const lagLabel = r.lag
        ? '事件后第 1 个交易日'
        : mode === 'auto' ? '该市场开始消化消息的交易日' : '事件当日';
      const title =
        `${s.name} · ${STUDY_KIND_LABEL[k]}：${lagLabel}` +
        `平均波动 ${r.eventMeanPct.toFixed(2)}%，普通日 ${r.baseMeanPct.toFixed(2)}%，` +
        `倍数 ${r.ratio.toFixed(2)}x（中位数口径 ${medRatio.toFixed(2)}x），` +
        `t=${r.t == null ? '—' : r.t.toFixed(2)}，样本 ${r.eventDays}`;
      body += `<td class="corr ${Math.abs(r.ratio - 1) > 0.3 ? 'strong' : 'mid'}"
        style="background:${ratioBg(r.ratio)}" title="${esc(title)}">${r.ratio.toFixed(2)}x${sig}${
          lagTag ? `<i class="lag-tag">${lagTag}</i>` : ''
        }</td>`;
    }
    body += '</tr>';
  }

  const top = [...cell.values()]
    .filter((r) => r.significant && r.ratio > 1)
    .sort((a, b) => Math.abs(b.t) - Math.abs(a.t))
    .slice(0, 6);

  const modeBtn = (val, label, hint) =>
    `<button type="button" data-lag="${val}" class="${String(mode) === String(val) ? 'on' : ''}" title="${esc(hint)}">${label}</button>`;

  return `<div class="study-toolbar">
    <div class="seg" id="study-lag">
      ${modeBtn('auto', '智能对齐', '事件日已按各品种所在市场的交易时段投影：FOMC 对美股是当日、对上证/沪金是北京次日凌晨；CPI/非农对 A 股要等次日')}
      ${modeBtn('0', 'T+0', '全部按事件当日口径（不区分市场）')}
      ${modeBtn('1', 'T+1', '全部按事件后一个交易日口径（不区分市场）')}
    </div>
  </div>
  <div class="matrix-wrap">
    <table class="corr-matrix study-matrix"><thead>${head}</thead><tbody>${body}</tbody></table>
  </div>
  <p class="macro-hint">
    数字 = 事件日平均绝对波动 ÷ 普通日平均绝对波动（&gt;1 说明这天更动荡），带 <b>*</b> 表示 Welch t 检验 |t|&gt;1.96。
    悬停看具体数值与中位数口径。<br>
    ${
      mode === 'auto'
        ? '智能对齐：事件日按各品种所在市场的交易时段换算，不是拿同一个日历日期套所有标的。' +
          'FOMC 在美东 14:00 公布（收盘前）→ 美股算当日，北京时间已是次日凌晨 → 上证/沪金也算当日；' +
          'CPI / 非农在美东 08:30 公布 → 美股算当日，而北京 20:30 已经收盘 → A 股要等到次日。' +
          '所以对齐之后格内统一标 <b>T+0</b>，含义是「这个市场开始消化这条消息的那一天」，不是「发布那一刻所在的那一天」。'
        : `当前强制统一为 <b>T+${mode}</b> 口径，即所有标的共用同一个日历日期。跨市场资产在此口径下会混入「消息发布时该市场尚未开盘 / 已经收盘」的错配，仅作对照参考。`
    }
  </p>
  ${
    top.length
      ? `<div class="study-top"><span class="study-top-label">统计上最显著：</span>${top
          .map(
            (r) =>
              `<span class="study-chip">${esc(r.name)} × ${esc(STUDY_KIND_LABEL[r.kind] ?? r.kind)} <b>${r.ratio.toFixed(2)}x</b> <em>t=${r.t.toFixed(1)}</em></span>`,
          )
          .join('')}</div>`
      : ''
  }`;
}

export async function loadEventStudy(force = false) {
  if (!force && studyCacheClient) return studyCacheClient;
  try {
    const res = await fetch(`./api/eventstudy${force ? '?force=1' : ''}`, { cache: 'no-store' });
    if (res.ok) studyCacheClient = await res.json();
  } catch {
    /* 忽略 */
  }
  return studyCacheClient;
}

/* ------------------------------------------------------------------ *
 * 生命周期（由 router 调用）
 *
 * 注意 llmRetry：它是「等 AI 复核结果」的一次性定时器，挂在 store.events 上
 * （store.events.llmRetry）。原来的 stopEventsTimer() 只 clearInterval(eventsTimer)，
 * 漏了这一个 —— 离开事件页后它仍会触发一次重绘，把已经清空的容器写回内容。
 * ------------------------------------------------------------------ */
export function mountEvents() {
  eventsEl.hidden = false;
  window.scrollTo({ top: 0 });
  loadEvents(true);
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
