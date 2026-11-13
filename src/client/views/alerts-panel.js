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

import { esc } from '../shared/format.js';
import { openModalDialog, MODAL_CLOSE_EVENT } from '../shared/modal-dialog.js';

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
export const ALERT_MODES = Object.freeze([
  ['signed', '正负方向'],
  ['abs_pct', '绝对幅度'],
]);

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
    ...(kind === 'change_pct' ? { mode: raw.mode === 'abs_pct' ? 'abs_pct' : 'signed' } : {}),
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
  const enabled = !(rule?.enabled === 0 || rule?.enabled === false);
  const absTag = rule?.kind === 'change_pct' && rule?.mode === 'abs_pct'
    ? '<span class="al-tag">绝对幅度</span>'
    : '';
  return `<li class="al-rule${enabled ? '' : ' is-paused'}" data-alert-rule="${esc(rule?.id ?? '')}">
    <span class="al-rule-main"><b>${esc(rule?.name ?? '')}</b>
      <span class="al-tag">${esc(kind)}</span>
      ${absTag}
      <span class="al-dim">${esc(rule?.target_id ?? '')} ${esc(rule?.operator ?? '')} ${esc(threshold)}</span>
    </span>
    <span class="al-rule-meta">${enabled ? '启用中' : '已停用'}</span>
    <span class="al-rule-actions">
      <button type="button" data-toggle-alert="${esc(rule?.id ?? '')}" data-next-enabled="${enabled ? '0' : '1'}" aria-label="${enabled ? '停用规则' : '启用规则'} ${esc(rule?.name ?? '')}">${enabled ? '停用' : '启用'}</button>
      <button type="button" data-delete-alert="${esc(rule?.id ?? '')}" aria-label="删除规则 ${esc(rule?.name ?? '')}">删除</button>
    </span>
  </li>`;
}

export function alertEventHTML(ev) {
  return `<li class="al-event" data-alert-event="${esc(ev?.id ?? '')}">
    <span class="al-event-dot" aria-hidden="true"></span>
    <span class="al-event-body"><b>${esc(ev?.title ?? '宏观预警')}</b><span>${esc(ev?.message ?? '')}</span></span>
    <time>${esc(fmtTime(ev?.triggered_at))}</time>
  </li>`;
}

export function alertsPanelHTML({ rules = [], recentEvents = [], error = '', busy = false, draft = {} } = {}) {
  const dKind = draft?.kind ?? 'price';
  const dOp = draft?.operator ?? '>';
  const dMode = draft?.mode === 'abs_pct' ? 'abs_pct' : 'signed';
  const kinds = ALERT_KINDS.map(([v, label]) => `<option value="${esc(v)}"${v === dKind ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const ops = ALERT_OPERATORS.map((v) => `<option value="${esc(v)}"${v === dOp ? ' selected' : ''}>${esc(v)}</option>`).join('');
  const modes = ALERT_MODES.map(([v, label]) => `<option value="${esc(v)}"${v === dMode ? ' selected' : ''}>${esc(label)}</option>`).join('');
  return `<div class="al-head">
      <h2 id="alerts-panel-title">智能预警中心</h2>
      <button type="button" data-alerts-dismiss="1" aria-label="关闭">×</button>
    </div>
    ${error ? `<p class="al-error" role="alert">${esc(error)}</p>` : ''}
    <form class="al-form" data-alert-form="1" autocomplete="off">
      <div class="al-field">
        <label for="al-field-name">名称</label>
        <input id="al-field-name" type="text" name="name" value="${esc(draft?.name ?? '')}" placeholder="留空自动生成" maxlength="120" />
      </div>
      <div class="al-field">
        <label for="al-field-kind">类型</label>
        <select id="al-field-kind" name="kind">${kinds}</select>
      </div>
      <div class="al-field" data-al-field="mode"${dKind !== 'change_pct' ? ' hidden' : ''}>
        <label for="al-field-mode">涨跌口径</label>
        <select id="al-field-mode" name="mode">${modes}</select>
      </div>
      <div class="al-field" data-al-field="target_id">
        <label for="al-field-target">目标标的 / 比价</label>
        <input id="al-field-target" type="text" name="target_id" value="${esc(draft?.target_id ?? '')}" placeholder="${dKind === 'divergence' ? '自动：any（全图谱）' : '如 gold-intl、spread 指标 id、any'}" maxlength="120" ${dKind === 'divergence' ? 'disabled' : ''} />
      </div>
      <div class="al-field" data-al-field="operator">
        <label for="al-field-operator">操作符</label>
        <select id="al-field-operator" name="operator" ${dKind === 'divergence' ? 'disabled' : ''}>${ops}</select>
      </div>
      <div class="al-field" data-al-field="threshold">
        <label for="al-field-threshold">阈值</label>
        <input id="al-field-threshold" type="text" inputmode="decimal" enterkeyhint="done" name="threshold" value="${esc(draft?.threshold ?? '')}" placeholder="${dKind === 'divergence' ? '自动 >= 1' : '如 2750'}" ${dKind === 'divergence' ? 'disabled' : ''} />
      </div>
      <button type="submit" ${busy ? 'disabled' : ''}>${busy ? '保存中…' : '新建预警'}</button>
    </form>
    <div class="al-cols">
      <section class="al-col"><h3>当前规则（${rules.length}）</h3>
        <ul class="al-list">${rules.length ? rules.map(alertRuleHTML).join('') : '<li class="al-empty">还没有规则</li>'}</ul>
      </section>
      <section class="al-col"><h3>最近触发</h3>
        <ul class="al-list">${recentEvents.length ? recentEvents.map(alertEventHTML).join('') : '<li class="al-empty">暂无触发记录</li>'}</ul>
      </section>
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
  const cancel = opts.clearTimeout ?? ((id) => clearTimeout(id));
  const enableToast = opts.toast !== false;

  let panel = null;
  let dismissDialog = null;
  let toast = null;
  let toastTimer = null;
  let unread = 0;
  let disposed = false;
  let state = { rules: [], recentEvents: [] };

  function badge() {
    const el = doc.getElementById(ALERT_UNREAD_ID);
    if (!el) return;
    const text = unreadBadgeText(unread);
    el.textContent = text;
    el.hidden = !text;
    el.setAttribute('aria-label', text ? `${text} 条未读告警` : '没有未读告警');
  }

  function clearToastTimer() {
    if (toastTimer != null) {
      cancel(toastTimer);
      toastTimer = null;
    }
  }

  let pendingToast = null;
  const hasOpenModal = () => Boolean(doc.querySelector?.('dialog:modal, dialog[open]'));
  const onDialogClose = () => {
    if (!enableToast || !pendingToast || hasOpenModal()) return;
    const next = pendingToast;
    pendingToast = null;
    showToast(next);
  };

  function tryHideToast() {
    toastTimer = null;
    if (!toast) return;
    if (doc.activeElement && toast.contains?.(doc.activeElement)) {
      toastTimer = schedule(tryHideToast, ALERT_TOAST_MS);
      return;
    }
    toast.hidden = true;
  }

  function showToast(hit) {
    if (hasOpenModal()) {
      pendingToast = hit;
      return;
    }
    pendingToast = null;
    clearToastTimer();
    if (!toast) {
      toast = doc.createElement('div');
      toast.id = ALERT_TOAST_ID;
      toast.className = 'al-toast';
      toast.addEventListener?.('focusout', (e) => {
        if (!toast || toast.hidden || toastTimer != null) return;
        if (e?.relatedTarget && toast.contains?.(e.relatedTarget)) return;
        if (doc.activeElement && toast.contains?.(doc.activeElement)) return;
        toastTimer = schedule(tryHideToast, ALERT_TOAST_MS);
      });
      doc.body?.appendChild?.(toast);
    }
    toast.innerHTML = alertToastHTML(hit);
    toast.hidden = false;
    toastTimer = schedule(tryHideToast, ALERT_TOAST_MS);
  }

  const draftOf = (root) => {
    const form = root?.querySelector?.('[data-alert-form]');
    if (!form) return {};
    const pick = (name) => form.querySelector(`[name="${name}"]`)?.value ?? '';
    return {
      name: pick('name'),
      kind: pick('kind') || 'price',
      target_id: pick('target_id'),
      operator: pick('operator') || '>',
      threshold: pick('threshold'),
      mode: pick('mode') || 'signed',
    };
  };

  function render({ error = '', busy = false, draft = null } = {}) {
    if (!panel || disposed) return;
    const prevName = panel.contains?.(doc.activeElement) ? doc.activeElement?.getAttribute?.('name') : null;
    panel.innerHTML = alertsPanelHTML({
      rules: state.rules,
      recentEvents: state.recentEvents,
      error,
      busy,
      draft: draft ?? draftOf(panel),
    });
    if (prevName) {
      panel.querySelector?.(`[name="${prevName}"]`)?.focus?.();
    }
  }

  async function load({ clearDraft = false } = {}) {
    if (!panel || disposed) return;
    try {
      const data = await api.list();
      if (!panel || disposed) return;
      state = {
        rules: data?.rules ?? [],
        recentEvents: data?.recentEvents ?? [],
      };
      render({ draft: clearDraft ? {} : null });
    } catch (err) {
      if (!panel || disposed) return;
      render({ error: `读取预警失败：${String(err?.message ?? err)}` });
    }
  }

  function close() {
    const fn = dismissDialog;
    dismissDialog = null;
    panel = null;
    fn?.();
    doc.getElementById(ALERTS_PANEL_ID)?.remove();
    onDialogClose();
  }

  function open() {
    if (panel) { close(); return; }
    const opener = doc.activeElement;
    unread = 0;
    badge();
    opts.onOpen?.();
    panel = doc.createElement('dialog');
    panel.id = ALERTS_PANEL_ID;
    panel.className = 'al-dialog';
    panel.setAttribute('closedby', 'any');
    panel.setAttribute('aria-labelledby', 'alerts-panel-title');
    doc.body?.appendChild?.(panel);
    dismissDialog = openModalDialog(panel, {
      doc,
      opener,
      onClose: () => {
        dismissDialog = null;
        panel = null;
        doc.getElementById(ALERTS_PANEL_ID)?.remove();
        onDialogClose();
      },
    });
    render({ busy: true, draft: {} });
    panel.querySelector?.('[name="name"], [data-alerts-dismiss]')?.focus?.();
    void load({ clearDraft: true });
  }

  const formOf = (root) => {
    const d = draftOf(root);
    return normalizeAlertForm(d);
  };

  const onClick = async (e) => {
    const t = e.target;
    if (t?.closest?.(`#${ALERTS_BTN_ID}`)) return open();
    if (t?.closest?.('[data-alert-toast-dismiss]')) {
      clearToastTimer();
      if (toast) toast.hidden = true;
      return;
    }
    if (!panel) return;
    if (t?.closest?.('[data-alerts-dismiss]')) return close();
    const toggle = t?.closest?.('[data-toggle-alert]');
    if (toggle) {
      const id = toggle.getAttribute('data-toggle-alert');
      if (!id) return;
      const nextEnabled = toggle.getAttribute('data-next-enabled') === '0' ? 0 : 1;
      try {
        if (typeof api.toggle === 'function') await api.toggle(id, nextEnabled);
        else await api.create({ id, enabled: nextEnabled });
        await load();
      } catch (err) {
        render({ error: `更新失败：${String(err?.message ?? err)}` });
      }
      return;
    }
    const del = t?.closest?.('[data-delete-alert]');
    if (del) {
      const id = del.getAttribute('data-delete-alert');
      if (!id) return;
      try {
        await api.remove(id);
        await load();
      } catch (err) {
        render({ error: `删除失败：${String(err?.message ?? err)}` });
      }
      return;
    }
  };

  const onSubmit = async (e) => {
    if (!e.target?.matches?.('[data-alert-form]') || !panel) return;
    e.preventDefault();
    const rule = formOf(panel);
    if (!rule?.target_id) {
      render({ error: '请填写目标标的 / 比价 id' });
      return;
    }
    try {
      await api.create(rule);
      await load({ clearDraft: true });
    } catch (err) {
      render({ error: `保存失败：${String(err?.message ?? err)}` });
    }
  };

  const onChange = (e) => {
    if (!panel || !e.target?.matches?.('[name="kind"]')) return;
    const kind = e.target.value;
    const modeRow = panel.querySelector('[data-al-field="mode"]');
    if (modeRow) modeRow.hidden = kind !== 'change_pct';
    const isDiv = kind === 'divergence';
    for (const field of ['target_id', 'operator', 'threshold']) {
      const el = panel.querySelector(`[name="${field}"]`);
      if (el) el.disabled = isDiv;
    }
    const targetInput = panel.querySelector('[name="target_id"]');
    if (targetInput) targetInput.placeholder = isDiv ? '自动：any（全图谱）' : '如 gold-intl、spread 指标 id、any';
    const threshInput = panel.querySelector('[name="threshold"]');
    if (threshInput) threshInput.placeholder = isDiv ? '自动 >= 1' : '如 2750';
  };

  // 原生 <dialog> 自带 Esc 关闭（非 showModal 降级由 openModalDialog 处理）

  const onAlert = (hit) => {
    if (!hit || typeof hit !== 'object') return;
    unread += 1;
    badge();
    if (enableToast) showToast(hit);
    // 面板开着时顺带刷新最近触发列表，不必手动关掉重开
    if (panel) void load();
  };

  const unsubscribe = opts.bus?.on?.('alert', onAlert) ?? null;
  doc.addEventListener('click', onClick);
  doc.addEventListener('change', onChange);
  doc.addEventListener('submit', onSubmit);
  if (enableToast) {
    doc.addEventListener('close', onDialogClose, true);
    doc.addEventListener(MODAL_CLOSE_EVENT, onDialogClose);
  }
  MOUNTED_DOCS.add(doc);
  const detach = () => {
    if (disposed) return;
    disposed = true;
    clearToastTimer();
    pendingToast = null;
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('change', onChange);
    doc.removeEventListener('submit', onSubmit);
    doc.removeEventListener('close', onDialogClose, true);
    doc.removeEventListener(MODAL_CLOSE_EVENT, onDialogClose);
    if (typeof unsubscribe === 'function') unsubscribe();
    else opts.bus?.off?.('alert', onAlert);
    if (doc.__twAlertsPanelOff === detach) delete doc.__twAlertsPanelOff;
    MOUNTED_DOCS.delete(doc);
    close();
    toast?.remove();
    toast = null;
  };
  doc.__twAlertsPanelOff = detach;
  badge();
  return detach;
}
