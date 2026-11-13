/* ================================================================== *
 * 原生 <dialog> 模态容器工具（modern-web-guidance: dialog + light-dismiss）
 *
 * 浏览器支持 showModal() 与 closedby="any" 时走原生 top-layer、背景 inert
 * 与焦点返还；旧版 Safari/Firefox 或 jsdom 测试环境按需降级。
 * ================================================================== */

export const MODAL_CLOSE_EVENT = 'tw:modal-close';

/**
 * 打开 <dialog> 并绑定轻触退场（closedby="any" 降级 + close 事件同步）。
 * @param {HTMLDialogElement} dialog
 * @param {{ doc?: Document, opener?: Element|null, onClose?: Function }} opts
 * @returns {() => void} 解绑与关闭清理函数
 */
export function openModalDialog(dialog, { doc = null, opener = null, onClose = null } = {}) {
  if (!dialog) return () => {};

  const targetDoc = doc ?? dialog.ownerDocument ?? null;
  const fallbackOpener = targetDoc?.activeElement && typeof targetDoc.activeElement.focus === 'function'
    ? targetDoc.activeElement
    : null;
  const returnTarget = opener ?? (fallbackOpener && fallbackOpener !== targetDoc?.body ? fallbackOpener : null);

  let pointerStartedOutside = false;
  let closed = false;
  let usedShowModal = false;
  let cancelTimer = null;

  const isOutside = (e) => {
    const rect = dialog.getBoundingClientRect?.();
    // jsdom 的 getBoundingClientRect() 默认返回全 0，不做误判
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    return e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
  };

  const restoreFocus = () => {
    if (!returnTarget || typeof returnTarget.focus !== 'function') return;
    if (targetDoc && !targetDoc.body?.contains?.(returnTarget)) return;
    const active = targetDoc?.activeElement ?? null;
    if (!active || active === targetDoc?.body || dialog.contains?.(active) || !usedShowModal) {
      try { returnTarget.focus(); } catch { /* ignore */ }
    }
  };

  const notifyModalClose = () => {
    const EventCtor = targetDoc?.defaultView?.CustomEvent ?? globalThis.CustomEvent;
    targetDoc?.dispatchEvent?.(new EventCtor(MODAL_CLOSE_EVENT, { detail: { dialog } }));
  };

  const finish = () => {
    if (closed) return false;
    closed = true;
    if (cancelTimer != null) {
      clearTimeout(cancelTimer);
      cancelTimer = null;
    }
    dialog.removeEventListener?.('close', handleClose);
    dialog.removeEventListener?.('toggle', onToggle);
    dialog.removeEventListener?.('cancel', onCancel);
    dialog.removeEventListener?.('pointerdown', onPointerDown);
    dialog.removeEventListener?.('pointerup', onPointerUp);
    targetDoc?.removeEventListener?.('keydown', onFallbackEsc);
    return true;
  };

  const handleClose = () => {
    if (!finish()) return;
    onClose?.();
    restoreFocus();
    notifyModalClose();
  };

  // Chromium 个别版本在原生 Esc / light-dismiss 关掉 <dialog> 时可能只派发 cancel/toggle 而吞掉 close；
  // 监听 toggle(newState === 'closed') 与 cancel 后的微任务/宏任务兜底，确保 DOM 与延迟横幅不卡死。
  const onToggle = (e) => {
    if (e?.newState === 'closed' && !dialog.open) handleClose();
  };

  const onCancel = (e) => {
    if (e?.defaultPrevented || cancelTimer != null) return;
    cancelTimer = setTimeout(() => {
      cancelTimer = null;
      if (!closed && !dialog.open) handleClose();
    }, 0);
  };

  const onPointerDown = (e) => {
    pointerStartedOutside = isOutside(e);
  };
  const onPointerUp = (e) => {
    const outside = pointerStartedOutside && isOutside(e);
    pointerStartedOutside = false;
    if (outside) close();
  };
  const onFallbackEsc = (e) => {
    if (e.key === 'Escape' && !e.isComposing) {
      e.preventDefault?.();
      close();
    }
  };

  const close = () => {
    if (!finish()) return;
    if (dialog.open && typeof dialog.close === 'function') {
      try { dialog.close(); } catch { /* ignore */ }
    }
    dialog.removeAttribute?.('open');
    dialog.remove?.();
    onClose?.();
    restoreFocus();
    notifyModalClose();
  };

  dialog.addEventListener?.('close', handleClose);
  dialog.addEventListener?.('toggle', onToggle);
  dialog.addEventListener?.('cancel', onCancel);
  const supportsClosedBy = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;
  if (!supportsClosedBy) {
    dialog.addEventListener?.('pointerdown', onPointerDown);
    dialog.addEventListener?.('pointerup', onPointerUp);
  }

  if (typeof dialog.showModal === 'function') {
    try {
      if (!dialog.open) dialog.showModal();
      usedShowModal = true;
    } catch {
      dialog.setAttribute?.('open', '');
    }
  } else {
    dialog.setAttribute?.('open', '');
  }

  if (!usedShowModal) {
    targetDoc?.addEventListener?.('keydown', onFallbackEsc);
  }

  return close;
}
