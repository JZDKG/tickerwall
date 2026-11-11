/* ================================================================== *
 * 智能预警中心 UI（Phase 4 / P4-T1）
 *
 * 对接 Phase 3 的 GET /api/alerts 与 POST /api/alerts：
 *   · 规则列表 + 新建表单（kind / target / operator / threshold）；
 *   · 删除按钮 [data-delete-alert]；
 *   · 最近触发告警记录；
 *   · SSE `alert` 帧 → 页面顶部 #alert-toast-banner 横幅 + 未读计数徽章。
 *
 * 与命令面板同样的分层：render/normalize 是纯函数，网络与 DOM 在 mount 里。
 * 请求层可注入（单测不必起服务），失败只给可读文案，绝不让面板把首屏带崩。
 * ================================================================== */

import { esc, html } from '../shared/format.js';

export const ALERTS_PANEL_ID = 'alerts-panel';
export const ALERT_TOAST_ID = 'alert-toast-banner';
export const ALERTS_BTN_ID = 'alerts-btn';
export const ALERT_UNREAD_ID = 'alerts-unread';
export const ALERT_TOAST_MS = 8000;

export const ALERT_KINDS = Object.freeze([
  ['price', '价格'],
  ['change_pct', '涨跌幅'],
  ['spread', '合成比价'],
  ['divergence', '传导背离'],
]);
export const ALERT_OPERATORS = Object.freeze(['>', '<', '>=', '<=']);

const KIND_LABEL = Object.fromEntries(ALERT_KINDS);

/**
 * 表单 → POST /api/alerts 的请求体。
 *
 * divergence 是「观测到显著背离即为 1」的布尔型条件：给它 > 阈值 1 永远
 * 不命中，所以这里统一改成 >= 1；阈值字段对这类规则没有数值意义，也不让
 * 用户填的数字改变它的语义。其余三类按表单原样交给服务端校验。
 */
export function normalizeAlertForm(raw = {}) {
  const kind = ALERT_KINDS.some(([k]) => k === raw.kind) ? raw.kind : 'price';
  const target = String(raw.target_id ?? '').trim().slice(0, 120);
  const operator = ALERT_OPERATORS.includes(raw.operator) ? raw.operator : '>';
  const thresholdRaw = String(raw.threshold ?? '').trim();
  const threshold = thresholdRaw === '' ? null : Number(thresholdRaw);
  const validThreshold = threshold != null && Number.isFinite(threshold) ? threshold : null;
  const name = String(raw.name ?? '').trim().slice(0, 120);
  if (kind === 'divergence') {
    return {
      name: name || '传导背离预警',
      kind,
      target_id: target || 'any',
      operator: '>=',
      threshold: 1,
    };
  }
  return {
    name: name || `${target || '标的'} ${operator} ${validThreshold ?? ''}`.trim(),
    kind,
    target_id: target,
    operator,
    threshold: validThreshold,
  };
}

/** 请求层：注入 fetchImpl 即可在 Node/测试里跑 */
export function createAlertsApi({ fetchImpl = null, base = './' } = {}) {
  const doFetch = fetchImpl ?? ((...args) => fetch(...args));
  const url = `${base}api/alerts`;
  async function request(method, body = null) {
    const res = await doFetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res?.ok) throw new Error(`HTTP ${res?.status ?? '?'}`);
    return res.json();
  }
  return {
    list: () => request('GET'),
    create: (rule) => request('POST', rule),
    remove: (id) => request('POST', { action: 'delete', id }),
  };
}

const fmtTime = (v) => {
  if (!Number.isFinite(Number(v))) return '—';
  const d = new Date(Number(v));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
};

export function alertRuleHTML(rule) {
  const kind = KIND_LABEL[rule?.kind] ?? rule?.kind ?? '';
  const threshold = rule?.threshold == null ? '—' : String(rule.threshold);
  return `<li class="al-rule" data-alert-rule="${esc(rule?.id ?? '')}">
    <span class="al-rule-main"><b>${esc(rule?.name ?? '')}</b>
      <span class="al-tag">${esc(kind)}</span>
      <span class="al-dim">${esc(rule?.target_id ?? '')} ${esc(rule?.operator ?? '')} ${esc(threshold)}</span>
    </span>
    <span class="al-rule-meta">${rule?.enabled === 0 || rule?.enabled === false ? '已停用' : '启用中'}</span>
    <button type="button" data-delete-alert="${esc(rule?.id ?? '')}" aria-label="删除规则 ${esc(rule?.name ?? '')}">删除</button>
  </li>`;
}

export function alertEventHTML(ev) {
  return `<li class="al-event" data-alert-event="${esc(ev?.id ?? '')}">
    <span class="al-event-dot" aria-hidden="true"></span>
    <span class="al-event-body"><b>${esc(ev?.title ?? '宏观预警')}</b><span>${esc(ev?.message ?? '')}</span></span>
    <time>${esc(fmtTime(ev?.triggered_at))}</time>
  </li>`;
}

export function alertsPanelHTML({ rules = [], recentEvents = [], error = '', busy = false } = {}) {
  const kinds = ALERT_KINDS.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
  const ops = ALERT_OPERATORS.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  return `<div class="al-backdrop" data-alerts-dismiss="1"></div>
  <div class="al-dialog" role="dialog" aria-modal="true" aria-label="智能预警中心">
    <div class="al-head">
      <div><h3>智能预警中心</h3><p class="al-sub">价格 / 涨跌幅 / 合成比价 / 传导背离</p></div>
      <button type="button" data-alerts-dismiss="1" aria-label="关闭">×</button>
    </div>
    ${error ? `<p class="al-error" role="alert">${esc(error)}</p>` : ''}
    <form class="al-form" data-alert-form="1" autocomplete="off">
      <label>名称<input type="text" name="name" placeholder="留空自动生成" maxlength="120" /></label>
      <label>类型<select name="kind">${kinds}</select></label>
      <label>目标标的 / 比价<input type="text" name="target_id" placeholder="如 gold-intl、spread 指标 id、any" maxlength="120" /></label>
      <label>操作符<select name="operator">${ops}</select></label>
      <label>阈值<input type="number" step="any" name="threshold" placeholder="如 2750" /></label>
      <button type="submit" ${busy ? 'disabled' : ''}>${busy ? '保存中…' : '新建预警'}</button>
    </form>
    <div class="al-cols">
      <section class="al-col"><h4>当前规则（${rules.length}）</h4>
        <ul class="al-list">${rules.length ? rules.map(alertRuleHTML).join('') : '<li class="al-empty">还没有规则，用上面的表单建一条。</li>'}</ul>
      </section>
      <section class="al-col"><h4>最近触发</h4>
        <ul class="al-list">${recentEvents.length ? recentEvents.map(alertEventHTML).join('') : '<li class="al-empty">暂无触发记录。</li>'}</ul>
      </section>
    </div>
  </div>`;
}

/** 顶部实时告警横幅（与 Phase 3 的 tw-alert-banner 互补：这里带未读计数语义） */
export function alertToastHTML(hit) {
  return `<div class="al-toast-inner" role="alert">
    <span class="al-toast-dot" aria-hidden="true"></span>
    <strong>${esc(hit?.title ?? '宏观预警')}</strong>
    <span>${esc(hit?.message ?? '')}</span>
    <button type="button" data-alert-toast-dismiss="1" aria-label="关闭告警">×</button>
  </div>`;
}

export function unreadBadgeText(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 99 ? '99+' : String(Math.floor(n));
}

/**
 * 挂载预警中心，返回解绑函数。
 *
 * @param {{
 *   document?:Document, bus?:object, api?:object, setTimeout?:Function,
 *   onOpen?:Function,
 * }} opts
 */
/** 同一 document 只挂一份：重复 mount（热重载 / 测试）不叠监听 */
const MOUNTED_DOCS = new WeakSet();

export function mountAlertsPanel(opts = {}) {
  const doc = opts.document ?? (typeof document === 'undefined' ? null : document);
  if (!doc) return () => {};
  if (MOUNTED_DOCS.has(doc) && typeof doc.__twAlertsPanelOff === 'function') {
    doc.__twAlertsPanelOff();
  }
  const api = opts.api ?? createAlertsApi();
  const schedule = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));

  let panel = null;
  let toast = null;
  let unread = 0;
  let disposed = false;

  function badge() {
    const el = doc.getElementById(ALERT_UNREAD_ID);
    if (!el) return;
    const text = unreadBadgeText(unread);
    el.textContent = text;
    el.hidden = !text;
    el.setAttribute('aria-label', text ? `${text} 条未读告警` : '没有未读告警');
  }

  function showToast(hit) {
    if (!toast) {
      toast = doc.createElement('div');
      toast.id = ALERT_TOAST_ID;
      toast.className = 'al-toast';
      doc.body?.appendChild?.(toast);
    }
    toast.innerHTML = alertToastHTML(hit);
    toast.hidden = false;
    schedule(() => { if (toast) toast.hidden = true; }, ALERT_TOAST_MS);
  }

  async function load() {
    if (!panel || disposed) return;
    try {
      const data = await api.list();
      if (!panel || disposed) return;
      panel.innerHTML = alertsPanelHTML({ rules: data?.rules ?? [], recentEvents: data?.recentEvents ?? [] });
    } catch (err) {
      if (!panel || disposed) return;
      panel.innerHTML = alertsPanelHTML({ error: `读取预警失败：${String(err?.message ?? err)}` });
    }
  }

  function close() {
    panel?.remove();
    panel = null;
  }

  function open() {
    if (panel) { close(); return; }
    unread = 0;
    badge();
    opts.onOpen?.();
    panel = doc.createElement('div');
    panel.id = ALERTS_PANEL_ID;
    panel.className = 'al-host';
    doc.body?.appendChild?.(panel);
    panel.innerHTML = alertsPanelHTML({ busy: true });
    void load();
  }

  const formOf = (root) => {
    const form = root?.querySelector?.('[data-alert-form]');
    if (!form) return null;
    const pick = (name) => form.querySelector(`[name="${name}"]`)?.value ?? '';
    return normalizeAlertForm({
      name: pick('name'), kind: pick('kind'), target_id: pick('target_id'),
      operator: pick('operator'), threshold: pick('threshold'),
    });
  };

  const onClick = async (e) => {
    const t = e.target;
    if (t?.closest?.(`#${ALERTS_BTN_ID}`)) return open();
    if (t?.closest?.('[data-alert-toast-dismiss]')) {
      if (toast) toast.hidden = true;
      return;
    }
    if (!panel) return;
    if (t?.closest?.('[data-alerts-dismiss]')) return close();
    const del = t?.closest?.('[data-delete-alert]');
    if (del) {
      const id = del.getAttribute('data-delete-alert');
      if (!id) return;
      try { await api.remove(id); await load(); } catch { /* 面板保留，下一次操作可重试 */ }
      return;
    }
  };

  const onSubmit = async (e) => {
    if (!e.target?.matches?.('[data-alert-form]') || !panel) return;
    e.preventDefault();
    const rule = formOf(panel);
    if (!rule?.target_id) {
      panel.innerHTML = alertsPanelHTML({ error: '请填写目标标的 / 比价 id' });
      return;
    }
    try { await api.create(rule); await load(); } catch (err) {
      panel.innerHTML = alertsPanelHTML({ error: `保存失败：${String(err?.message ?? err)}` });
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape' && panel) close();
  };

  const onAlert = (hit) => {
    if (!hit || typeof hit !== 'object') return;
    unread += 1;
    badge();
    showToast(hit);
    // 面板开着时顺带刷新最近触发列表，不必手动关掉重开
    if (panel) void load();
  };

  const unsubscribe = opts.bus?.on?.('alert', onAlert) ?? null;
  doc.addEventListener('click', onClick);
  doc.addEventListener('submit', onSubmit);
  doc.addEventListener('keydown', onKey);
  MOUNTED_DOCS.add(doc);
  doc.__twAlertsPanelOff = () => {
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('submit', onSubmit);
    doc.removeEventListener('keydown', onKey);
    if (typeof unsubscribe === 'function') unsubscribe();
    else opts.bus?.off?.('alert', onAlert);
    close();
  };
  badge();
  return () => {
    disposed = true;
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('submit', onSubmit);
    doc.removeEventListener('keydown', onKey);
    if (typeof unsubscribe === 'function') unsubscribe();
    else opts.bus?.off?.('alert', onAlert);
    if (doc.__twAlertsPanelOff) delete doc.__twAlertsPanelOff;
    MOUNTED_DOCS.delete(doc);
    close();
    toast?.remove();
    toast = null;
  };
}
