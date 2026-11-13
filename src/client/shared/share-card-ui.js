/* ================================================================== *
 * 分享卡按钮接线（Phase 3 / P3-T3）
 *
 * 事件委托绑在 document 上：解释卡与隔夜复盘面板都会被反复重绘，逐个
 * addEventListener 会叠加、重绘后又失效。点开后先给一个可关闭的预览浮层，
 * 浮层里再提供「下载 SVG」—— 让创作者先看一眼，而不是一点就往下载目录
 * 里丢文件。
 * ================================================================== */

import {
  buildShareCardModel,
  renderShareCardSVG,
  createDownloadShareCard,
} from './share-card.js';
import { openModalDialog } from './modal-dialog.js';

export const SHARE_PREVIEW_ID = 'tw-share-preview';

/** 从点击位置附近的容器里尽量凑出一份模型；取不到就用最小占位模型 */
export function modelFromClick(target, fallback = {}) {
  const card = target?.closest?.('.explain-card, .briefing-panel');
  const assetName = card?.getAttribute?.('data-asset') || card?.querySelector?.('h3')?.textContent || fallback.assetName || '市场';
  const priceEl = card?.querySelector?.('.briefing-px, .explain-fact-main b');
  const rawPrice = priceEl?.textContent?.replace(/[^\d.-]/g, '');
  return buildShareCardModel({
    ...fallback,
    assetName,
    price: fallback.price ?? (rawPrice && Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : null),
    title: fallback.title ?? `${assetName}复盘`,
  });
}

/** 预览浮层 HTML（SVG 是已转义的自包含字符串，嵌入原生 <dialog> 内层） */
export function previewHTML(svg) {
  return `<div class="tw-share-head">
        <strong id="tw-share-title">分享战报卡预览</strong>
        <div class="tw-share-actions">
          <button type="button" data-action="share-download">下载 SVG</button>
          <button type="button" data-share-dismiss="1" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="tw-share-body">${svg}</div>
      <p class="tw-share-note">自包含 SVG · 可直接贴进 Notion / 博客，或使用 ?embed=1 挂件模式</p>`;
}

/**
 * 挂载委托监听，返回解绑函数。
 * @param {{ document?:Document, getModel?:Function, bus?:object }} opts
 */
export function mountShareCard(opts = {}) {
  const doc = opts.document ?? (typeof document === 'undefined' ? null : document);
  if (!doc) return () => {};
  let currentModel = null;
  let dialog = null;
  let dismissDialog = null;

  const close = () => {
    const fn = dismissDialog;
    dismissDialog = null;
    dialog = null;
    currentModel = null;
    fn?.();
    doc.getElementById(SHARE_PREVIEW_ID)?.remove();
  };

  const show = (model, opener = null) => {
    currentModel = model;
    const svg = renderShareCardSVG(model, { aspect: '16:9' });
    const existing = doc.getElementById(SHARE_PREVIEW_ID);
    if (existing) {
      dialog = existing;
      dialog.innerHTML = previewHTML(svg);
      return;
    }
    dialog = doc.createElement('dialog');
    dialog.id = SHARE_PREVIEW_ID;
    dialog.className = 'tw-share-dialog';
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', 'tw-share-title');
    dialog.innerHTML = previewHTML(svg);
    doc.body?.appendChild?.(dialog);
    dismissDialog = openModalDialog(dialog, {
      doc,
      opener,
      onClose: () => {
        dialog = null;
        dismissDialog = null;
        currentModel = null;
        doc.getElementById(SHARE_PREVIEW_ID)?.remove();
      },
    });
  };

  const onClick = (e) => {
    const t = e.target;
    if (t?.closest?.('[data-share-dismiss]')) return close();
    if (t?.closest?.('[data-action="share-download"]')) {
      if (currentModel) createDownloadShareCard(currentModel, { document: doc });
      return;
    }
    const trigger = t?.closest?.('[data-action="share-card"]');
    if (trigger) {
      const model = opts.getModel?.(trigger) ?? modelFromClick(trigger);
      show(model, trigger);
    }
  };
  // 原生 <dialog> 自带 Esc 关闭与焦点还回（非 showModal 降级由 openModalDialog 处理）
  doc.addEventListener('click', onClick);
  return () => {
    doc.removeEventListener('click', onClick);
    close();
  };
}
