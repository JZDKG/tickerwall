/* ================================================================== *
 * 预警横幅（Phase 3 / P3-T2）
 *
 * realtime.js 收到 SSE `alert` 帧后只往 bus 上丢，展示在这里：
 *   · 页面顶部一条可关闭的横幅（不遮挡行情，几秒后自动淡出）；
 *   · 浏览器 Notification 已授权时再发一条系统通知；未授权不主动索要
 *     —— 弹权限框要由用户显式点「开启通知」，不能一进页面就问。
 *
 * 全部 DOM 依赖可注入，单测用假 document 就能跑。
 * ================================================================== */

import { MODAL_CLOSE_EVENT } from './modal-dialog.js';

export const ALERT_BANNER_ID = 'tw-alert-banner';
export const ALERT_BANNER_MS = 8000;

/** 转义：标题与正文来自服务端规则，但规则名是用户可输入的，不能裸拼 innerHTML */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function bannerHTML(hit) {
  return `<div class="tw-alert-inner" role="status">
    <span class="tw-alert-dot" aria-hidden="true"></span>
    <strong>${esc(hit?.title ?? '宏观预警')}</strong>
    <span>${esc(hit?.message ?? '')}</span>
    <button type="button" data-action="dismiss-alert" aria-label="关闭预警">×</button>
  </div>`;
}

/**
 * 挂载监听，返回解绑函数。
 * @param {{ bus:object, document?:Document, NotificationImpl?:Function, setTimeout?:Function }} opts
 */
export function mountAlertBanner(opts = {}) {
  const bus = opts.bus ?? null;
  const doc = opts.document ?? (typeof document === 'undefined' ? null : document);
  const NotificationImpl = opts.NotificationImpl ?? (typeof Notification === 'undefined' ? null : Notification);
  const schedule = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = opts.clearTimeout ?? ((id) => clearTimeout(id));
  if (!bus?.on || !doc) return () => {};

  let host = doc.getElementById(ALERT_BANNER_ID);
  if (!host) {
    host = doc.createElement('div');
    host.id = ALERT_BANNER_ID;
    host.className = 'tw-alert-banner';
    host.hidden = true;
    doc.body?.appendChild?.(host);
  }

  let timerId = null;
  const clearTimer = () => {
    if (timerId != null) {
      cancel(timerId);
      timerId = null;
    }
  };

  const dismiss = () => {
    clearTimer();
    host.hidden = true;
    host.innerHTML = '';
  };

  const tryDismiss = () => {
    timerId = null;
    if (doc.activeElement && host.contains?.(doc.activeElement)) return;
    dismiss();
  };

  const onClick = (e) => {
    if (e.target?.closest?.('[data-action="dismiss-alert"]')) dismiss();
  };
  const onFocusOut = (e) => {
    if (host.hidden || timerId != null) return;
    if (e?.relatedTarget && host.contains?.(e.relatedTarget)) return;
    if (doc.activeElement && host.contains?.(doc.activeElement)) return;
    timerId = schedule(tryDismiss, ALERT_BANNER_MS);
  };
  let pendingHit = null;
  const hasOpenModal = () => Boolean(doc.querySelector?.('dialog:modal, dialog[open]'));
  const showHit = (hit) => {
    clearTimer();
    host.innerHTML = bannerHTML(hit);
    host.hidden = false;
    timerId = schedule(tryDismiss, ALERT_BANNER_MS);
  };
  const onDialogClose = () => {
    if (!pendingHit || hasOpenModal()) return;
    const next = pendingHit;
    pendingHit = null;
    showHit(next);
  };

  host.addEventListener?.('click', onClick);
  host.addEventListener?.('focusout', onFocusOut);
  doc.addEventListener?.('close', onDialogClose, true);
  doc.addEventListener?.(MODAL_CLOSE_EVENT, onDialogClose);

  const onAlert = (hit) => {
    if (!hit || typeof hit !== 'object') return;
    if (hasOpenModal()) {
      pendingHit = hit;
    } else {
      pendingHit = null;
      showHit(hit);
    }
    try {
      if (NotificationImpl?.permission === 'granted') {
        new NotificationImpl(hit.title ?? '宏观预警', { body: hit.message ?? '', tag: hit.ruleId });
      }
    } catch {
      // 系统通知失败不该影响页面内横幅
    }
  };

  const unsubscribe = bus.on('alert', onAlert);
  return () => {
    clearTimer();
    pendingHit = null;
    if (typeof unsubscribe === 'function') unsubscribe();
    else bus.off?.('alert', onAlert);
    host.removeEventListener?.('click', onClick);
    host.removeEventListener?.('focusout', onFocusOut);
    doc.removeEventListener?.('close', onDialogClose, true);
    doc.removeEventListener?.(MODAL_CLOSE_EVENT, onDialogClose);
  };
}
