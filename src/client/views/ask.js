/* ================================================================== *
 * AI 问财工作区
 *
 * 三层披露：
 *   L1 回答正文（安全 Markdown）
 *   L2 取数轨迹（原生 <details>，默认折叠）
 *   L3 模型参数（在 ask-models 弹窗里）
 *
 * 这里只消费 /api/ai/ask 的 SSE 帧，不自己拼请求头、不监听 hashchange。
 * ================================================================== */

import { askEl } from '../shared/dom.js';
import { api as defaultApi } from '../shared/api.js';
import { store } from '../shared/store.js';
import { on as onBus } from '../shared/bus.js';
import { html } from '../shared/format.js';
import { iconHtml } from '../shared/icons.js';
import {
  clearCopyFeedbackTimers,
  copyIconHtml,
  copyTextWithFeedback,
  extractFollowups,
  formatAnswerForCopy,
  resolveFollowups,
} from '../shared/ask-assist.js';
import { markdownToSafeHtml, safeMarkdownHref } from '../shared/markdown.js';
import { openModelsDialog } from './ask-models.js';
import { openStockPreviewDialog } from './ask-stock.js';

const STATIC_PROMPTS = [
  '为什么今天国际金价和国内金价不同步？',
  '查询今天 A 股涨停池和连板梯队',
  '查贵州茅台当前估值与主力资金流',
  '近 24 小时高影响宏观事件有哪些？',
];

/**
 * router 传进来的是 `#/ask` 后面的 query 串（不含 #）。
 * 兼容测试/手工构造时带 `?` 或整段 hash 的写法。
 */
export function parseAskHashQuery(arg) {
  let raw = String(arg ?? '');
  if (raw.startsWith('#')) {
    const qIndex = raw.indexOf('?');
    raw = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  } else if (raw.startsWith('?')) {
    raw = raw.slice(1);
  }
  const params = new URLSearchParams(raw);
  return {
    assetId: String(params.get('asset') ?? '').trim(),
    question: String(params.get('q') ?? '').trim(),
  };
}

export function buildStarterPrompts(quotes, { max = 6 } = {}) {
  const list = Array.isArray(quotes) ? quotes : [];
  const dynamic = list
    .filter((q) => q && q.ok !== false && q.id && q.name && Number.isFinite(Number(q.changePct)))
    .sort((a, b) => Math.abs(Number(b.changePct)) - Math.abs(Number(a.changePct)))
    .slice(0, 2)
    .map((q) => `分析 ${q.name} 今天走势与可能原因`);

  const out = [];
  for (const prompt of [...dynamic, ...STATIC_PROMPTS]) {
    if (!out.includes(prompt)) out.push(prompt);
  }
  return out.slice(0, Math.max(4, Math.min(6, Number(max) || 6)));
}

/**
 * SSE 帧 → [{type,data}]。返回的 rest 是还没等到 `\n\n` 的残帧，
 * 调用方把它接回下一段 buffer 即可（跨 chunk 的 JSON 不会被腰斩）。
 */
export function parseSSEFrames(buffer) {
  const text = String(buffer ?? '').replace(/\r\n/g, '\n');
  const parts = text.split('\n\n');
  const rest = parts.pop() ?? '';
  const events = [];

  for (const part of parts) {
    if (!part.trim()) continue;
    let type = 'message';
    const dataLines = [];
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) continue;
    let data;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      continue;
    }
    events.push({ type, data });
  }
  return { events, rest };
}

export async function consumeAskResponse(response, onEvent) {
  const body = response?.body;
  if (!body || typeof body.getReader !== 'function') throw new Error('响应不支持流式读取');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSSEFrames(buffer);
      buffer = parsed.rest;
      for (const ev of parsed.events) await onEvent?.(ev);
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSSEFrames(`${buffer}\n\n`);
      for (const ev of parsed.events) await onEvent?.(ev);
    }
  } finally {
    reader.releaseLock?.();
  }
}

function argsSummary(args) {
  if (args == null) return '';
  let text;
  if (typeof args === 'string') text = args;
  else {
    try {
      text = JSON.stringify(args);
    } catch {
      text = String(args);
    }
  }
  if (!text || text === '{}' || text === 'null') return '';
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

function traceHTML(msg) {
  const trace = Array.isArray(msg?.toolTrace) ? msg.toolTrace : [];
  if (!trace.length) return '';

  const stale = trace.some((t) => t && t.stale);
  const model = msg.modelLabel ? ` · ${msg.modelLabel}` : '';
  const summary = `数据来源 · ${trace.length} 次查询${model}${stale ? ' · 含过期数据' : ''}`;

  return html`<details class="ask-trace">
    <summary>${summary}</summary>
    <ol class="ask-trace-list">
      ${trace.map((t) => {
        const meta = [
          t?.source ? `来源 ${t.source}` : '',
          t?.asOf ? String(t.asOf) : '',
          Number.isFinite(t?.durationMs) ? `${t.durationMs}ms` : '',
        ].filter(Boolean).join(' · ');
        return html`<li class="ask-trace-item${t?.ok === false ? ' is-error' : ''}">
          <div class="ask-trace-head">
            <code>${t?.tool ?? 'unknown'}</code>
            <span class="ask-trace-status">${t?.ok === false ? '失败' : '完成'}</span>
            ${t?.stale ? html`<span class="ask-trace-stale">过期</span>` : ''}
          </div>
          ${argsSummary(t?.args) ? html`<p class="ask-trace-args">参数 ${argsSummary(t.args)}</p>` : ''}
          ${meta ? html`<p class="ask-trace-meta">${meta}</p>` : ''}
          ${t?.summary ? html`<p class="ask-trace-summary">${t.summary}</p>` : ''}
          ${t?.error ? html`<p class="ask-trace-error" role="alert">${t.error}</p>` : ''}
        </li>`;
      })}
    </ol>
  </details>`;
}

function answerBodyHTML(msg = {}, { isLast = false } = {}) {
  const streaming = Boolean(msg.streaming);
  const content = String(msg.content ?? '');
  const stripped = extractFollowups(content).markdown.trim();
  const progress = streaming ? msg.progress || '正在生成…' : '';
  const emptyText = msg.stopped
    ? '已停止生成'
    : streaming
      ? '正在生成…'
      : '没有返回内容';

  const trace = traceHTML(msg);
  const canCopy = !streaming && Boolean(stripped);
  const foot = canCopy
    ? html`<div class="ask-msg-foot">
      ${trace ? html`<div class="ask-msg-foot-left">${trace}</div>` : ''}
      <div class="ask-copy-wrap">
        <button type="button" class="ask-copy-btn" data-ask-copy="1" aria-label="复制回答">${copyIconHtml(14, 'ask-copy-ico')}<span>复制</span></button>
        <span class="ask-copy-tip" role="status"></span>
      </div>
    </div>`
    : trace;

  const canFollowup = isLast && canCopy && !msg.error && !msg.stopped;
  const followups = canFollowup ? resolveFollowups(content, msg.toolTrace) : [];

  return html`${progress ? html`<p class="ask-progress" role="status">${progress}</p>` : ''}
    ${msg.error ? html`<p class="ask-error" role="alert">回答失败：${msg.error}</p>` : ''}
    <div class="ask-answer">${stripped ? markdownToSafeHtml(content) : html`<p class="ask-answer-placeholder">${emptyText}</p>`}</div>
    ${msg.stopped && stripped ? html`<p class="ask-stopped">已停止生成</p>` : ''}
    ${foot}
    ${followups.length ? html`<div class="ask-followups" aria-label="继续追问">${followups.map((q) => html`<button type="button" class="ask-followup-chip" data-followup="${q}"><span>${q}</span>${iconHtml('arrow-right', 12, 'ask-followup-ico')}</button>`)}</div>` : ''}`;
}

export function renderAskAnswerHTML(msg = {}, { isLast = false, msgIdx = null } = {}) {
  const idxAttr = Number.isInteger(msgIdx) ? html` data-msg-idx="${msgIdx}"` : '';
  return html`<article class="ask-msg is-assistant${msg.streaming ? ' is-streaming' : ''}" data-role="assistant"${idxAttr}>
    ${answerBodyHTML(msg, { isLast })}
  </article>`;
}

function userMessageHTML(msg) {
  return html`<article class="ask-msg is-user" data-role="user"><p>${msg.content}</p></article>`;
}

function selectableModels(state) {
  const models = Array.isArray(state.models) ? state.models.slice() : [];
  if (state.envPreset?.hasApiKey) models.push(state.envPreset);
  return models;
}

function setMarkup(doc, el, markup) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(markup);
  el.replaceChildren(tpl.content);
}

function nodeOf(doc, markup) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(markup);
  return tpl.content.firstElementChild;
}

function sessionTime(session) {
  const ts = Number(session?.updatedAt ?? session?.createdAt ?? 0);
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

let active = null;

export function mountAsk(arg = '', {
  api: apiClient = defaultApi,
  document: doc = typeof document !== 'undefined' ? document : null,
  window: win = typeof window !== 'undefined' ? window : null,
  quotes = null,
} = {}) {
  if (active) unmountAsk();
  if (!askEl || !doc) return;

  const state = {
    arg: String(arg ?? ''),
    doc,
    win: win ?? doc.defaultView,
    api: apiClient,
    models: [],
    envPreset: null,
    modelId: '',
    sessions: [],
    sessionId: null,
    messages: [],
    assetId: '',
    quotes: Array.isArray(quotes) ? quotes : (store.quotes ?? []),
    unsubscribeQuotes: null,
    streaming: false,
    controller: null,
    currentMessage: null,
    pendingTools: new Map(),
    completedTools: 0,
    paintTimer: null,
    listeners: [],
    disposed: false,
    modelsLoading: true,
    loadError: '',
    sessionsLoading: true,
    sessionsError: '',
    configClose: null,
    stockClose: null,
    activeChartFig: null,
    activeChartHit: null,
    graphOpen: false,
    graphTriggerEl: null,
    cleanupPopover: null,
  };
  active = state;

  askEl.hidden = false;
  askEl.replaceChildren();
  setMarkup(doc, askEl, html`<div class="ask-shell">
    <header class="ask-toolbar">
      <div class="ask-toolbar-group">
        <label class="ask-sr-only" for="ask-model-select">模型</label>
        <select id="ask-model-select" class="ask-select" disabled></select>
        <button type="button" class="ask-btn" id="ask-models-btn">模型配置</button>
      </div>
      <div class="ask-toolbar-group ask-toolbar-right">
        <button type="button" class="ask-btn" id="ask-new-btn">新对话</button>
      </div>
    </header>
    <div class="ask-body">
      <aside id="ask-history" class="ask-history" aria-label="历史会话">
        <div class="ask-history-head">
          <span>历史会话</span>
        </div>
        <ul class="ask-history-list" id="ask-history-list"></ul>
      </aside>
      <div class="ask-main">
        <div id="ask-messages" class="ask-messages"></div>
        <form id="ask-form" class="ask-form">
          <label class="ask-sr-only" for="ask-input">提问</label>
          <textarea id="ask-input" class="ask-input" rows="2" placeholder="输入标的、指标或宏观事件，按 Enter 发送"></textarea>
          <button type="submit" class="ask-btn is-primary" id="ask-send">发送</button>
        </form>
      </div>
    </div>
    <div id="ask-graph-popover" class="ask-graph-popover" popover="auto" hidden></div>
  </div>`);

  const refs = {
    select: askEl.querySelector('#ask-model-select'),
    modelsBtn: askEl.querySelector('#ask-models-btn'),
    newBtn: askEl.querySelector('#ask-new-btn'),
    body: askEl.querySelector('.ask-body'),
    history: askEl.querySelector('#ask-history'),
    historyList: askEl.querySelector('#ask-history-list'),
    messages: askEl.querySelector('#ask-messages'),
    form: askEl.querySelector('#ask-form'),
    input: askEl.querySelector('#ask-input'),
    send: askEl.querySelector('#ask-send'),
    graphPopover: askEl.querySelector('#ask-graph-popover'),
  };
  state.refs = refs;

  const parsed = parseAskHashQuery(arg);
  state.assetId = parsed.assetId;
  if (parsed.question) {
    refs.input.value = parsed.question;
    refs.input.focus();
  }

  const on = (el, type, handler) => {
    el.addEventListener(type, handler);
    state.listeners.push([el, type, handler]);
  };

  const scrollToBottom = () => {
    refs.messages.scrollTop = refs.messages.scrollHeight;
  };

  const renderModelSelect = () => {
    const options = selectableModels(state);
    if (state.loadError) {
      refs.select.disabled = true;
      setMarkup(doc, refs.select, html`<option value="">模型加载失败</option>`);
      return;
    }
    if (!options.length) {
      refs.select.disabled = true;
      setMarkup(doc, refs.select, html`<option value="">未配置模型</option>`);
      return;
    }
    refs.select.disabled = false;
    setMarkup(doc, refs.select, html`${options.map((m) => (m.id === state.modelId
      ? html`<option value="${m.id}" selected>${m.name}</option>`
      : html`<option value="${m.id}">${m.name}</option>`))}`);
  };

  const renderEmpty = () => {
    if (state.messages.length) return;
    if (state.loadError) {
      setMarkup(doc, refs.messages, html`<div class="ask-error" role="alert">
        <p>模型加载失败：${state.loadError}</p>
        <button type="button" class="ask-btn" data-ask-act="retry-load">重试</button>
      </div>`);
      return;
    }
    if (state.modelsLoading) {
      setMarkup(doc, refs.messages, html`<div class="ask-empty"><p class="ask-empty-line" role="status">正在读取模型…</p></div>`);
      return;
    }

    const hasModels = selectableModels(state).length > 0;
    const prompts = buildStarterPrompts(state.quotes);
    setMarkup(doc, refs.messages, html`<div class="ask-empty" id="ask-empty">
      <p class="ask-empty-line">${hasModels ? '常用研判与实时查询' : '尚未配置接入模型'}</p>
      ${hasModels
        ? html`<div class="ask-starters">${prompts.map((p) => html`<button type="button" class="ask-chip" data-starter="${p}"><span>${p}</span>${iconHtml('arrow-right', 13, 'ask-chip-ico')}</button>`)}</div>`
        : html`<button type="button" class="ask-btn is-primary" data-ask-act="configure">配置接入模型</button>`}
    </div>`);
  };

  const renderSessions = () => {
    if (state.sessionsLoading) {
      setMarkup(doc, refs.historyList, html`<li class="ask-history-empty">正在读取…</li>`);
      return;
    }
    if (state.sessionsError) {
      setMarkup(doc, refs.historyList, html`<li class="ask-history-empty">
        <span>会话加载失败</span>
        <button type="button" class="ask-link-btn" data-history-act="retry">重试</button>
      </li>`);
      return;
    }
    if (!state.sessions.length) {
      setMarkup(doc, refs.historyList, html`<li class="ask-history-empty">暂无历史会话</li>`);
      return;
    }
    setMarkup(doc, refs.historyList, html`${state.sessions.map((s) => html`<li class="ask-history-item${s.id === state.sessionId ? ' is-active' : ''}">
      <button type="button" class="ask-history-open" data-session-id="${s.id}">
        <span class="ask-history-title">${s.title || '未命名会话'}</span>
        <span class="ask-history-time">${sessionTime(s)}</span>
      </button>
      <button type="button" class="ask-history-del" data-session-delete="${s.id}" aria-label="删除会话 ${s.title || '未命名会话'}">${iconHtml('close', 14)}</button>
    </li>`)}`);
  };

  const hideActiveChartTip = () => {
    const fig = state.activeChartFig;
    if (fig) {
      const tip = fig.querySelector('.md-chart-tip');
      const cross = fig.querySelector('.md-chart-crosshair');
      if (tip) tip.hidden = true;
      if (cross) cross.setAttribute('hidden', '');
    }
    state.activeChartFig = null;
    state.activeChartHit = null;
  };

  const showChartTip = (hitEl) => {
    const fig = hitEl?.closest?.('.md-chart');
    const tip = fig?.querySelector?.('.md-chart-tip');
    if (!fig || !tip) return;
    if (state.activeChartFig && state.activeChartFig !== fig) hideActiveChartTip();

    const tipX = Number(hitEl.getAttribute('data-tip-x'));
    const title = hitEl.getAttribute('data-tip-title') || '';
    const rows = (hitEl.getAttribute('data-tip-rows') || '').split('|').filter(Boolean);
    const cross = fig.querySelector('.md-chart-crosshair');
    if (cross && Number.isFinite(tipX)) {
      cross.setAttribute('x1', String(tipX));
      cross.setAttribute('x2', String(tipX));
      cross.removeAttribute('hidden');
    }

    setMarkup(doc, tip, html`<div class="md-chart-tip-title">${title}</div><div class="md-chart-tip-rows">${rows.map((r) => html`<span class="md-chart-tip-row">${r}</span>`)}</div>`);
    const ratio = Number.isFinite(tipX) ? tipX / 640 : 0.5;
    if (ratio < 0.28) {
      tip.style.left = '8px';
      tip.style.right = 'auto';
      tip.style.transform = 'none';
    } else if (ratio > 0.72) {
      tip.style.left = 'auto';
      tip.style.right = '8px';
      tip.style.transform = 'none';
    } else {
      tip.style.left = `${(ratio * 100).toFixed(1)}%`;
      tip.style.right = 'auto';
      tip.style.transform = 'translateX(-50%)';
    }
    tip.hidden = false;
    state.activeChartFig = fig;
    state.activeChartHit = hitEl;
  };

  const closeGraphPopover = ({ restoreFocus = false } = {}) => {
    const pop = refs.graphPopover;
    if (!pop || (!state.graphOpen && pop.hidden)) return;
    const trigger = state.graphTriggerEl;
    state.graphOpen = false;
    state.graphTriggerEl = null;
    if (typeof pop.hidePopover === 'function') {
      try {
        pop.hidePopover();
      } catch {
        // ignore when already closed
      }
    }
    pop.hidden = true;
    if (restoreFocus && trigger?.isConnected) trigger.focus?.();
  };
  state.cleanupPopover = () => closeGraphPopover({ restoreFocus: false });

  const openGraphPopover = (nodeEl) => {
    const pop = refs.graphPopover;
    if (!pop || !nodeEl) return;
    if (state.graphOpen && state.graphTriggerEl === nodeEl) {
      closeGraphPopover({ restoreFocus: true });
      return;
    }

    const label = nodeEl.getAttribute('data-graph-label') || '';
    const detail = nodeEl.getAttribute('data-graph-detail') || '';
    const assetId = nodeEl.getAttribute('data-asset-id') || '';
    const detailHref = assetId ? safeMarkdownHref(`#/d/${encodeURIComponent(assetId)}`) : '';
    const followupQuestion = `围绕「${label}」深入分析传导逻辑与关键跟踪指标`;

    setMarkup(doc, pop, html`<div class="ask-graph-popover-head">
      <strong class="ask-graph-popover-title">${label}</strong>
      ${detail ? html`<span class="ask-graph-popover-detail">${detail}</span>` : ''}
    </div>
    <div class="ask-graph-popover-actions">
      <button type="button" class="ask-graph-popover-btn" data-graph-followup="${followupQuestion}"><span>围绕「${label}」深入追问</span>${iconHtml('arrow-right', 12, 'ask-followup-ico')}</button>
      ${detailHref ? html`<a class="ask-graph-popover-link" href="${detailHref}">查看详情 ↗</a>` : ''}
    </div>`);

    const rect = typeof nodeEl.getBoundingClientRect === 'function'
      ? nodeEl.getBoundingClientRect()
      : { left: 16, bottom: 80, top: 40 };
    const vw = Number(state.win?.innerWidth) || 1280;
    const vh = Number(state.win?.innerHeight) || 800;
    const popMaxW = Math.min(280, Math.max(196, vw - 24));
    const rawLeft = Number(rect.left) || 12;
    const clampedLeft = Math.max(12, Math.min(rawLeft, vw - popMaxW - 12));
    const bottomEdge = Number(rect.bottom) || 80;
    const topEdge = Number(rect.top) || 40;
    const spaceBelow = vh - bottomEdge;
    const top = spaceBelow < 140 && topEdge > 150
      ? Math.max(12, topEdge - 124)
      : Math.max(12, Math.min(bottomEdge + 6, vh - 140));

    pop.style.maxWidth = `${popMaxW}px`;
    pop.style.left = `${Math.round(clampedLeft)}px`;
    pop.style.top = `${Math.round(top)}px`;

    state.graphTriggerEl = nodeEl;
    state.graphOpen = true;
    pop.hidden = false;
    if (typeof pop.showPopover === 'function') {
      try {
        pop.showPopover();
      } catch {
        // fallback uses hidden=false
      }
    }
    pop.querySelector('button')?.focus?.();
  };

  const renderMessages = () => {
    hideActiveChartTip();
    closeGraphPopover();
    if (!state.messages.length) {
      renderEmpty();
      return;
    }
    const lastIdx = state.messages.length - 1;
    setMarkup(doc, refs.messages, html`${state.messages.map((m, idx) => (m.role === 'user'
      ? userMessageHTML(m)
      : renderAskAnswerHTML(m, { isLast: idx === lastIdx, msgIdx: idx })))}`);
    scrollToBottom();
  };

  const updateSendButton = () => {
    refs.send.textContent = state.streaming ? '停止' : '发送';
    refs.send.classList.toggle('is-stop', state.streaming);
  };

  const paintAnswer = (msg) => {
    const article = msg?.el;
    if (!article?.isConnected) return;
    const answer = article.querySelector('.ask-answer');
    if (answer) setMarkup(doc, answer, markdownToSafeHtml(msg.content || ''));
    const progress = article.querySelector('.ask-progress');
    if (progress) progress.textContent = msg.progress || '';
  };

  const paintAll = (msg) => {
    if (!msg?.el?.isConnected) return;
    const isLast = state.messages[state.messages.length - 1] === msg;
    // article 元素本身不重建，流式态结束时必须同步 class，否则 is-streaming 残留
    msg.el.classList.toggle('is-streaming', Boolean(msg.streaming));
    setMarkup(doc, msg.el, answerBodyHTML(msg, { isLast }));
  };

  const cancelPaint = () => {
    if (state.paintTimer != null) {
      state.win.clearTimeout(state.paintTimer);
      state.paintTimer = null;
    }
  };

  const schedulePaint = (msg) => {
    if (state.paintTimer != null) return;
    state.paintTimer = state.win.setTimeout(() => {
      state.paintTimer = null;
      paintAnswer(msg);
    }, 16);
  };

  const progressText = () => {
    if (state.pendingTools.size) {
      const tools = [...state.pendingTools.values()];
      const tool = tools[tools.length - 1];
      const done = state.completedTools ? ` · 已完成 ${state.completedTools} 项系统查询` : '';
      return `正在查询 ${tool}…${done}`;
    }
    if (state.completedTools) return `已完成 ${state.completedTools} 项系统查询，正在生成…`;
    return '正在生成…';
  };

  const handleEvent = (ev, msg) => {
    const data = ev?.data ?? {};
    if (ev?.type === 'session') {
      if (data.session?.id) state.sessionId = data.session.id;
      return;
    }
    if (ev?.type === 'tool_start') {
      state.pendingTools.set(data.id ?? `${data.tool}-${state.pendingTools.size}`, data.tool ?? '数据');
      msg.progress = progressText();
      paintAnswer(msg);
      return;
    }
    if (ev?.type === 'tool_result') {
      if (data.id != null) state.pendingTools.delete(data.id);
      state.completedTools += 1;
      msg.toolTrace.push({
        round: data.round,
        tool: data.tool,
        args: data.args,
        ok: data.ok,
        source: data.source,
        asOf: data.asOf,
        stale: data.stale,
        durationMs: data.durationMs,
        summary: data.summary,
        error: data.error,
      });
      msg.progress = progressText();
      paintAnswer(msg);
      return;
    }
    if (ev?.type === 'delta') {
      if (typeof data.text === 'string') {
        msg.content += data.text;
        schedulePaint(msg);
      }
      return;
    }
    if (ev?.type === 'done') {
      if (data.sessionId) state.sessionId = data.sessionId;
      if (data.message) {
        msg.content = String(data.message.content ?? msg.content);
        if (Array.isArray(data.message.toolTrace)) msg.toolTrace = data.message.toolTrace;
        msg.modelLabel = data.message.modelLabel ?? msg.modelLabel;
      }
      msg.streaming = false;
      msg.progress = '';
      cancelPaint();
      paintAll(msg);
      return;
    }
    if (ev?.type === 'error') {
      msg.error = data.error || '生成失败';
      msg.streaming = false;
      msg.progress = '';
      cancelPaint();
      paintAll(msg);
    }
  };

  async function send(question) {
    const text = String(question ?? '').trim();
    if (!text || state.streaming || state.disposed) return;
    if (!selectableModels(state).length) {
      openConfig();
      return;
    }

    hideActiveChartTip();
    closeGraphPopover();
    closeStockPreview();
    const priorMarkup = state.messages.map((m, idx) => (m.role === 'user'
      ? userMessageHTML(m)
      : renderAskAnswerHTML(m, { isLast: false, msgIdx: idx })));
    setMarkup(doc, refs.messages, html`${priorMarkup}`);
    const userMsg = { role: 'user', content: text };
    const assistant = {
      role: 'assistant',
      content: '',
      toolTrace: [],
      modelLabel: '',
      streaming: true,
      progress: '正在准备…',
    };
    state.messages.push(userMsg, assistant);
    const assistantIdx = state.messages.length - 1;
    state.pendingTools = new Map();
    state.completedTools = 0;
    state.currentMessage = assistant;

    refs.messages.append(nodeOf(doc, userMessageHTML(userMsg)));
    const article = nodeOf(doc, renderAskAnswerHTML(assistant, { isLast: true, msgIdx: assistantIdx }));
    assistant.el = article;
    refs.messages.append(article);
    scrollToBottom();

    refs.input.value = '';
    state.streaming = true;
    updateSendButton();

    const controller = new AbortController();
    state.controller = controller;

    const payload = {
      sessionId: state.sessionId,
      modelId: state.modelId || null,
      question: text,
      context: state.assetId ? { assetId: state.assetId } : null,
    };

    try {
      const response = await state.api.postStream('api/ai/ask', payload, { signal: controller.signal });
      await consumeAskResponse(response, (ev) => handleEvent(ev, assistant));
    } catch (err) {
      if (state.disposed) return;
      const stopped = controller.signal.aborted || err?.kind === 'aborted' || err?.name === 'AbortError';
      if (stopped) {
        assistant.stopped = true;
        assistant.progress = '';
      } else {
        assistant.error = err?.message || '请求失败';
        assistant.progress = '';
      }
    } finally {
      if (state.disposed) return;
      assistant.streaming = false;
      state.streaming = false;
      if (state.controller === controller) state.controller = null;
      cancelPaint();
      paintAll(assistant);
      updateSendButton();
      if (!assistant.error) refreshSessions();
    }
  }

  const submitQuestion = (text) => {
    send(text ?? refs.input.value).catch(() => {});
  };

  const stopStreaming = () => {
    if (state.currentMessage) state.currentMessage.progress = '正在停止…';
    if (state.controller && !state.controller.signal.aborted) state.controller.abort();
  };

  const closeStockPreview = () => {
    state.stockClose?.();
    state.stockClose = null;
  };

  const openConfig = () => {
    closeStockPreview();
    if (state.configClose) state.configClose();
    state.configClose = openModelsDialog({
      api: state.api,
      currentModelId: state.modelId,
      document: doc,
      onChanged: () => { loadModels(); },
    });
  };

  const newConversation = () => {
    if (state.streaming) stopStreaming();
    state.sessionId = null;
    state.messages = [];
    refs.input.value = '';
    renderMessages();
    renderSessions();
    refs.input.focus();
  };

  async function loadModels() {
    state.modelsLoading = true;
    state.loadError = '';
    renderModelSelect();
    renderEmpty();
    try {
      const { data } = await state.api.get('api/ai/models');
      if (state.disposed) return;
      state.models = Array.isArray(data?.models) ? data.models : [];
      state.envPreset = data?.envPreset ?? null;
      const options = selectableModels(state);
      if (!options.some((m) => m.id === state.modelId)) {
        state.modelId = options.find((m) => m.isDefault)?.id ?? options[0]?.id ?? '';
      }
    } catch (err) {
      if (state.disposed) return;
      state.loadError = err?.message || '网络错误';
    }
    state.modelsLoading = false;
    renderModelSelect();
    if (!state.messages.length) renderEmpty();
  }

  async function loadSessions() {
    state.sessionsLoading = true;
    renderSessions();
    try {
      const { data } = await state.api.get('api/ai/sessions');
      if (state.disposed) return;
      state.sessions = Array.isArray(data?.sessions) ? data.sessions : [];
      state.sessionsError = '';
    } catch (err) {
      if (state.disposed) return;
      state.sessionsError = err?.message || '网络错误';
    }
    state.sessionsLoading = false;
    renderSessions();
  }

  async function refreshSessions() {
    try {
      const { data } = await state.api.get('api/ai/sessions');
      if (state.disposed) return;
      state.sessions = Array.isArray(data?.sessions) ? data.sessions : [];
      state.sessionsError = '';
    } catch (err) {
      if (state.disposed) return;
      state.sessionsError = err?.message || '网络错误';
    }
    state.sessionsLoading = false;
    renderSessions();
  }

  async function openSession(id) {
    try {
      const { data } = await state.api.get(`api/ai/sessions/${encodeURIComponent(id)}`);
      if (state.disposed) return;
      const session = data?.session;
      if (!session) throw new Error('会话不存在');
      state.sessionId = session.id;
      const options = selectableModels(state);
      if (session.modelId && options.some((m) => m.id === session.modelId)) {
        state.modelId = session.modelId;
        renderModelSelect();
      }
      state.messages = (Array.isArray(session.messages) ? session.messages : [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role,
          content: String(m.content ?? ''),
          toolTrace: Array.isArray(m.toolTrace) ? m.toolTrace : [],
          modelLabel: m.modelLabel ?? '',
        }));
      renderMessages();
      renderSessions();
    } catch (err) {
      if (state.disposed) return;
      state.sessionsError = err?.message || '会话加载失败';
      renderSessions();
    }
  }

  async function deleteSession(id) {
    try {
      await state.api.post('api/ai/sessions', { action: 'delete', id });
      if (state.disposed) return;
      state.sessions = state.sessions.filter((s) => s.id !== id);
      if (state.sessionId === id) {
        state.sessionId = null;
        state.messages = [];
        renderMessages();
      }
      renderSessions();
    } catch (err) {
      if (state.disposed) return;
      state.sessionsError = err?.message || '删除失败';
      renderSessions();
    }
  }

  on(refs.form, 'submit', (event) => {
    event.preventDefault();
    if (state.streaming) {
      stopStreaming();
      return;
    }
    submitQuestion();
  });

  on(refs.input, 'keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (state.streaming) return;
    submitQuestion();
  });

  on(refs.select, 'change', () => {
    state.modelId = refs.select.value;
  });

  on(refs.modelsBtn, 'click', openConfig);
  on(refs.newBtn, 'click', newConversation);
  on(refs.send, 'click', () => {
    if (state.streaming) stopStreaming();
  });

  on(refs.messages, 'click', (event) => {
    const starter = event.target?.closest?.('[data-starter]');
    if (starter) {
      submitQuestion(starter.dataset.starter);
      return;
    }
    const followup = event.target?.closest?.('[data-followup]');
    if (followup) {
      submitQuestion(followup.dataset.followup);
      return;
    }
    const stockRef = event.target?.closest?.('.md-stock-ref');
    if (stockRef) {
      closeStockPreview();
      state.stockClose = openStockPreviewDialog({
        code: stockRef.dataset.stockCode,
        triggerEl: stockRef,
        api: state.api,
        document: doc,
        onFollowup: (prompt) => submitQuestion(prompt),
      });
      return;
    }
    const copyBtn = event.target?.closest?.('[data-ask-copy]');
    if (copyBtn) {
      const article = copyBtn.closest('[data-msg-idx]');
      const idx = Number(article?.dataset?.msgIdx);
      const msg = Number.isInteger(idx) ? state.messages[idx] : null;
      if (msg) {
        copyTextWithFeedback(copyBtn, formatAnswerForCopy(msg), {
          tipEl: copyBtn.nextElementSibling,
          navigatorObj: state.win?.navigator,
          doc,
          win: state.win,
        });
      }
      return;
    }
    const graphNode = event.target?.closest?.('[data-graph-node]');
    if (graphNode) {
      openGraphPopover(graphNode);
      return;
    }
    const action = event.target?.closest?.('[data-ask-act]')?.dataset.askAct;
    if (action === 'configure') openConfig();
    if (action === 'retry-load') {
      loadModels();
      loadSessions();
    }
  });

  on(refs.messages, 'mouseover', (event) => {
    const hit = event.target?.closest?.('[data-chart-tip]');
    if (hit) showChartTip(hit);
  });

  on(refs.messages, 'mouseout', (event) => {
    if (!state.activeChartFig) return;
    const next = event.relatedTarget;
    if (!next || !state.activeChartFig.contains(next)) {
      hideActiveChartTip();
    }
  });

  on(refs.messages, 'focusin', (event) => {
    const hit = event.target?.closest?.('[data-chart-tip]');
    if (hit) showChartTip(hit);
  });

  on(refs.messages, 'focusout', (event) => {
    if (!state.activeChartFig) return;
    const next = event.relatedTarget;
    if (!next || !state.activeChartFig.contains(next)) {
      hideActiveChartTip();
    }
  });

  on(refs.messages, 'keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = event.target?.closest?.('[data-graph-node]');
    if (!node) return;
    event.preventDefault();
    openGraphPopover(node);
  });

  on(refs.graphPopover, 'click', (event) => {
    const followupBtn = event.target?.closest?.('[data-graph-followup]');
    if (followupBtn) {
      const q = followupBtn.dataset.graphFollowup;
      closeGraphPopover({ restoreFocus: false });
      submitQuestion(q);
      return;
    }
    const detailLink = event.target?.closest?.('.ask-graph-popover-link');
    if (detailLink) closeGraphPopover({ restoreFocus: false });
  });

  on(refs.graphPopover, 'toggle', (event) => {
    if (event.newState === 'closed' && state.graphOpen) {
      const trigger = state.graphTriggerEl;
      state.graphOpen = false;
      state.graphTriggerEl = null;
      refs.graphPopover.hidden = true;
      if (trigger?.isConnected) trigger.focus?.();
    }
  });

  on(doc, 'keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.graphOpen) {
      event.preventDefault();
      closeGraphPopover({ restoreFocus: true });
      return;
    }
    if (state.activeChartFig) {
      hideActiveChartTip();
    }
  });

  on(doc, 'click', (event) => {
    if (!state.graphOpen) return;
    const target = event.target;
    if (refs.graphPopover.contains(target)) return;
    if (target?.closest?.('[data-graph-node]') === state.graphTriggerEl) return;
    closeGraphPopover({ restoreFocus: false });
  });

  on(refs.history, 'click', (event) => {
    const retry = event.target?.closest?.('[data-history-act="retry"]');
    if (retry) {
      loadSessions();
      return;
    }
    const del = event.target?.closest?.('[data-session-delete]');
    if (del) {
      deleteSession(del.dataset.sessionDelete).catch(() => {});
      return;
    }
    const open = event.target?.closest?.('[data-session-id]');
    if (open) openSession(open.dataset.sessionId).catch(() => {});
  });

  renderModelSelect();
  renderEmpty();
  renderSessions();
  loadModels();
  loadSessions();

  // 深链进入 #/ask 时首屏报价往往还没回来；等列表广播后再补上当日涨跌靠前的
  // 场景提问。显式传入 quotes 的调用方（测试/嵌入）自己负责刷新。
  if (!Array.isArray(quotes)) {
    state.unsubscribeQuotes = onBus('quotes', (payload) => {
      if (state.disposed) return;
      state.quotes = Array.isArray(payload?.items) ? payload.items : (store.quotes ?? []);
      if (!state.messages.length) renderEmpty();
    });
  }
}

export function unmountAsk() {
  if (active) {
    const state = active;
    active = null;
    state.disposed = true;
    if (state.controller && !state.controller.signal.aborted) state.controller.abort();
    state.controller = null;
    if (state.paintTimer != null) {
      state.win.clearTimeout(state.paintTimer);
      state.paintTimer = null;
    }
    clearCopyFeedbackTimers(state.win);
    state.cleanupPopover?.();
    state.cleanupPopover = null;
    for (const [el, type, handler] of state.listeners) {
      el.removeEventListener?.(type, handler);
    }
    state.listeners.length = 0;
    state.unsubscribeQuotes?.();
    state.unsubscribeQuotes = null;
    state.configClose?.();
    state.stockClose?.();
    state.stockClose = null;
  }
  if (askEl) {
    askEl.replaceChildren();
    askEl.hidden = true;
  }
}
