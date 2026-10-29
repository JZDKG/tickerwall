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

/** 事件时间：`YYYY-MM-DD HH:mm:ss` 取 HH:mm；已经是 ISO 的就按北京时间格式化 */
export function clockOf(value) {
  const text = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const ms = Date.parse(text);
    if (Number.isFinite(ms)) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(ms));
    }
  }
  const m = /(\d{2}):(\d{2})/.exec(text);
  return m ? `${m[1]}:${m[2]}` : '';
}

/** 非中文报道只标「原文」，不冒充译文 */
const SCRIPT_NOTE = { latin: '原文（非中文）', hangul: '原文（韩语）', cyrillic: '原文（俄语）', other: '原文' };

export function focusRowHTML(row, index) {
  const more = (row?.sources ?? 1) > 1 ? `<span class="tf-more">${row.sources} 家也在报</span>` : '';
  const clock = clockOf(row?.time);
  const note = SCRIPT_NOTE[row?.script] ?? '';
  return `<li class="tf-row" data-id="${esc(row?.id ?? '')}">
      <span class="tf-idx">${index + 1}</span>
      <span class="tf-title">${esc(row?.title ?? '')}${note ? `<span class="tf-lang">${esc(note)}</span>` : ''}</span>
      <span class="tf-time">${esc(clock)}</span>
      ${more}
      <span class="tf-why">${esc(row?.why ?? '')}</span>
    </li>`;
}

/**
 * 下一件发布的时间文案。
 *
 * 曾经直接切 `releaseAt`（UTC ISO）的字符 → 界面显示 13:30，而日历显示 21:30，
 * 同一个发布两个时间。现在优先用服务端给的北京时间，并**显式标注时区**。
 */
export function nextWhenText(next) {
  const local = next?.releaseLocal ?? null;
  if (local?.date && local?.time) return `${local.date} ${local.time}（北京时间）`;
  const parsed = Date.parse(String(next?.releaseAt ?? ''));
  if (Number.isFinite(parsed)) {
    const hm = clockOf(next.releaseAt);
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(parsed));
    return `${d} ${hm}（北京时间）`;
  }
  return '时间待确认';
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
    <h3>今天重点 ${focus.short ? `<span class="h3-note">共 ${focus.count} 件</span>` : '<span class="h3-note">三件</span>'}
      <span class="h3-note">时间为北京时间</span></h3>
    ${shortLine}
    <!-- 用 ul + 自己的序号：ol 自带编号会和 .tf-idx 叠成「1 1」 -->
    <ul class="tf-list">${(focus.focus ?? []).map(focusRowHTML).join('')}</ul>
    <p class="tf-rule">${esc(focus.rule ?? '')}</p>
    ${
      focus.next
        ? `<div class="tf-next">
            <span class="tf-next-label">下一件关键发布</span>
            <span class="tf-next-title">${esc(focus.next.title ?? '')}</span>
            <span class="tf-next-when">${esc(nextWhenText(focus.next))} · ${esc(untilText(focus.next.inMs))}</span>
          </div>`
        : `<div class="tf-next" data-state="none"><span class="tf-next-label">下一件关键发布</span><span class="tf-next-when">日历里暂时没有</span></div>`
    }
  </section>`;
}
