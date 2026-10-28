/* ================================================================== *
 * 事件中心顶部：今天重点三件 + 下一件关键发布（产品 §3）
 *
 * 事件中心默认不该是一长串消息流。顶部先回答两个问题，其余下沉。
 *
 * 三条界面约定：
 *   · 不足三件时**不说「三件」**，说「今天只有 N 件」；
 *   · 每条都显示「为什么它在前面」（排序规则摊开，不是黑箱）；
 *   · 下一件关键发布只显示「什么时候 · 还有多久」，不显示预期值 ——
 *     没有校准依据的预期只会增加权威感，不是信息。
 * ================================================================== */

import { esc } from '../shared/format.js';

/** 还有多久：分钟级到天级，超过两天就只给日期 */
export function untilText(inMs) {
  if (!Number.isFinite(Number(inMs)) || Number(inMs) <= 0) return '即将';
  const m = Math.round(Number(inMs) / 60_000);
  if (m < 60) return `${m} 分钟后`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} 小时后`;
  return `${Math.round(h / 24)} 天后`;
}

export function focusRowHTML(row, index) {
  const more = (row?.sources ?? 1) > 1 ? `<span class="tf-more">${row.sources} 家也在报</span>` : '';
  return `<li class="tf-row" data-id="${esc(row?.id ?? '')}">
      <span class="tf-idx">${index + 1}</span>
      <span class="tf-title">${esc(row?.title ?? '')}</span>
      <span class="tf-time">${esc(String(row?.time ?? '').slice(11, 16))}</span>
      ${more}
      <span class="tf-why">${esc(row?.why ?? '')}</span>
    </li>`;
}

export function todayFocusHTML(focus) {
  if (!focus || !focus.count) {
    return `<section class="d-block tf-card" data-state="empty">
      <h3>今天重点 <span class="h3-note">${esc(focus?.rule ?? '')}</span></h3>
      <p class="tf-empty">今天还没有达到展示门槛的事件。</p>
    </section>`;
  }

  const shortLine = focus.short
    ? `<p class="tf-short">今天只有 ${focus.count} 件。</p>`
    : '';

  return `<section class="d-block tf-card" data-state="ok" data-count="${focus.count}">
    <h3>今天重点 ${focus.short ? `<span class="h3-note">共 ${focus.count} 件</span>` : '<span class="h3-note">三件</span>'}</h3>
    ${shortLine}
    <ol class="tf-list">${(focus.focus ?? []).map(focusRowHTML).join('')}</ol>
    <p class="tf-rule">${esc(focus.rule ?? '')}</p>
    ${
      focus.next
        ? `<div class="tf-next">
            <span class="tf-next-label">下一件关键发布</span>
            <span class="tf-next-title">${esc(focus.next.title ?? '')}</span>
            <span class="tf-next-when">${esc(String(focus.next.releaseAt ?? '').slice(5, 16).replace('T', ' '))} · ${esc(untilText(focus.next.inMs))}</span>
          </div>`
        : `<div class="tf-next" data-state="none"><span class="tf-next-label">下一件关键发布</span><span class="tf-next-when">日历里暂时没有</span></div>`
    }
  </section>`;
}
