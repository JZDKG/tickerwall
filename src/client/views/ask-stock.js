/* ================================================================== *
 * AI 问财 · A 股原位快览弹窗（Milestone B）
 *
 * 正文里的 A 股代码点开即看：报价 + 近 30 日前复权日 K。
 * 诚实口径：stale / klineError 只在真发生时出现一行警告，
 * 正常态不常驻说明；指标网格只渲染非 null 字段，缺数不造数。
 * 复用 openModalDialog（Esc / 点遮罩 / 焦点归还）与 renderChartBlock。
 * ================================================================== */

import { html, fmtPrice, fmtPct, dirOf, prettySource } from '../shared/format.js';
import { iconHtml } from '../shared/icons.js';
import { openModalDialog } from '../shared/modal-dialog.js';
import { renderChartBlock } from '../shared/ask-charts.js';

const STOCK_PATH = 'api/ai/stock';

/** 指标网格：只列非 null / 非 NaN 字段；总市值单位亿 */
const METRIC_FIELDS = [
  { key: 'open', label: '今开', fmt: (v) => fmtPrice(v, 2) },
  { key: 'prevClose', label: '昨收', fmt: (v) => fmtPrice(v, 2) },
  { key: 'high', label: '最高', fmt: (v) => fmtPrice(v, 2) },
  { key: 'low', label: '最低', fmt: (v) => fmtPrice(v, 2) },
  { key: 'turnoverPct', label: '换手率', fmt: (v) => fmtPct(v).replace(/^\+/, '') },
  { key: 'peTtm', label: 'PE(TTM)', fmt: (v) => fmtPrice(v, 2) },
  { key: 'pb', label: 'PB', fmt: (v) => fmtPrice(v, 2) },
  { key: 'mcapYi', label: '总市值', fmt: (v) => `${fmtPrice(v, 0)} 亿` },
];

function metricsHTML(quote) {
  if (!quote) return '';
  const cells = METRIC_FIELDS.filter((f) => quote[f.key] != null && Number.isFinite(quote[f.key])).map(
    (f) => html`<div class="ask-stock-metric">
      <span class="ask-stock-metric-label">${f.label}</span>
      <span class="ask-stock-metric-value">${f.fmt(quote[f.key])}</span>
    </div>`,
  );
  if (!cells.length) return '';
  return html`<div class="ask-stock-metrics">${cells}</div>`;
}

function klineHTML(data) {
  const bars = Array.isArray(data?.bars) ? data.bars : [];
  const chart = bars.length
    ? renderChartBlock('kline', JSON.stringify({ title: '近 30 日 K 线（前复权）', unit: '元', data: bars }))
    : null;
  if (chart) return chart;
  return html`<p class="ask-stock-kline-empty">${data?.klineError || '暂无日 K 数据'}</p>`;
}

/**
 * 纯渲染：Loading → Error → Ready 的全部 DOM 从这里产出。
 */
export function stockDialogHTML(state = {}) {
  const code = state.code ?? '';
  const data = state.data ?? null;
  const quote = data?.quote ?? null;
  const label = quote?.name || code;
  const loading = Boolean(state.loading);
  const loadError = state.loadError ?? '';

  let body;
  if (loading) {
    body = html`<p class="ask-loading" role="status">正在读取 ${code} 行情与日 K…</p>`;
  } else if (loadError) {
    body = html`<div class="ask-load-error" role="alert">
      <p>加载失败：${loadError}</p>
      <button type="button" class="ask-btn" data-dialog-act="reload">重试</button>
    </div>`;
  } else {
    const warnParts = [];
    if (data?.stale) warnParts.push(data.staleReason || '报价可能已过期');
    else if (!quote) warnParts.push(data?.staleReason || '未取到实时行情');
    if (data?.klineError) warnParts.push(data.klineError);
    const dir = dirOf(quote?.changePct);
    body = html`
      ${warnParts.length ? html`<p class="ask-stock-warn" role="status">${iconHtml('alert', 13)} ${warnParts.join('；')}</p>` : ''}
      <div class="ask-stock-price-row">
        <span class="ask-stock-price is-${dir}">${fmtPrice(quote?.price, 2)}</span>
        <span class="ask-stock-chg is-${dir}">${fmtPct(quote?.changePct)}</span>
      </div>
      ${metricsHTML(quote)}
      ${klineHTML(data)}
      <div class="ask-stock-foot">
        <button type="button" class="ask-btn is-primary" data-dialog-act="followup">追问 ${label} 主力资金流与近期走势</button>
      </div>`;
  }

  return html`<div class="ask-stock">
    <header class="ask-stock-head">
      <div class="ask-stock-title">
        <h2 id="ask-stock-title">${label}</h2>
        <span class="ask-stock-code">${data?.code || code}</span>
        ${!loading && !loadError && data
          ? html`<span class="ask-stock-meta">${data.asOf ?? ''}${data.source ? ` · ${prettySource(`${data.source}:`).replace(/:$/, '').trim()}` : ''}</span>`
          : ''}
      </div>
      <button type="button" class="ask-icon-btn" data-dialog-act="close" aria-label="关闭">${iconHtml('close', 14)}</button>
    </header>
    <div class="ask-stock-body">${body}</div>
  </div>`;
}

/**
 * 打开 A 股快览弹窗。
 * @returns {() => void} 关闭函数（幂等）
 */
export function openStockPreviewDialog({
  code,
  triggerEl = null,
  api,
  document: doc = null,
  onFollowup = null,
} = {}) {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  const normCode = String(code ?? '').trim().toLowerCase();
  if (!targetDoc || !api || !normCode || typeof targetDoc.createElement !== 'function') return () => {};

  const dialog = targetDoc.createElement('dialog');
  dialog.className = 'ask-stock-dialog';
  dialog.setAttribute('closedby', 'any');
  dialog.setAttribute('aria-labelledby', 'ask-stock-title');
  targetDoc.body.appendChild(dialog);

  const state = { code: normCode, data: null, loading: true, loadError: '' };
  let disposed = false;
  let inflight = false;
  let closeDialog = () => {};

  const render = () => {
    if (disposed) return;
    dialog.innerHTML = stockDialogHTML(state);
  };

  const load = async () => {
    if (inflight) return;
    inflight = true;
    state.loading = true;
    state.loadError = '';
    render();
    try {
      const { data } = await api.get(`${STOCK_PATH}?code=${encodeURIComponent(normCode)}`);
      inflight = false;
      if (disposed) return;
      state.data = data;
      state.loading = false;
    } catch (err) {
      inflight = false;
      if (disposed) return;
      state.loading = false;
      state.loadError = err?.message || String(err);
    }
    render();
  };

  dialog.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-dialog-act]');
    if (!target || !dialog.contains(target)) return;
    const act = target.dataset.dialogAct;
    if (act === 'close') {
      closeDialog();
      return;
    }
    if (act === 'reload') {
      load();
      return;
    }
    if (act === 'followup') {
      const label = state.data?.quote?.name || normCode;
      const prompt = `${label} 主力资金流与近期走势`;
      closeDialog();
      onFollowup?.(prompt);
    }
  });

  render();
  closeDialog = openModalDialog(dialog, {
    doc: targetDoc,
    opener: triggerEl ?? targetDoc.activeElement,
    onClose: () => {
      disposed = true;
      dialog.remove();
    },
  });
  load();

  return () => {
    disposed = true;
    closeDialog();
  };
}