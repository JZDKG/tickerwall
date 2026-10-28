/* ================================================================== *
 * 首页「问题优先区」（产品 2.3 + 2.4 的挂载点）
 *
 * 首页第一屏现在先回答两件事：
 *   1. 你关心的问题有没有新变化（§2.3 关注简报）；
 *   2. 刚公布的数据和预期差多少（§2.4 预期台账）。
 * 然后再是行情列表。
 *
 * 为什么两块放一起：它们共享同一次「今天有什么变化」的读图动作，
 * 分成两个区域会让首页变成三屏。用户点进来只想看「有没有需要我注意的」。
 *
 * 约束：
 *   · 任何一块取不到都不影响另一块（各自有自己的 unavailable 态）；
 *   · 两块都为空时整块隐藏，不留一块空白面板。
 * ================================================================== */

import { esc, html } from '../shared/format.js';
import { watchBriefHTML } from './watch-brief.js';
import { expectationsCardHTML } from './expectations.js';

export const HOME_BRIEF_ID = 'home-brief';

/** 两块都「没有内容可看」时整块隐藏 —— 空白面板比没有面板更糟 */
export function shouldHideHomeBrief(brief, ledger) {
  // 显式转成布尔：`empty` 缺省时表达式会得到 undefined，虽然判断结果一样，
  // 但返回值类型不稳定（调用方可能拿它去 === false）
  const briefEmptyOrNone = !brief || brief.reason === 'NO_WATCH' || Boolean(brief.empty && brief.ok !== false);
  const ledgerEmpty = !ledger || ledger.total === 0;
  return Boolean(briefEmptyOrNone && ledgerEmpty);
}

export function homeBriefHTML(brief, ledger) {
  return `${watchBriefHTML(brief)}${expectationsCardHTML(ledger)}`;
}

/**
 * 把两块渲染进容器。
 *
 * @param {HTMLElement|null} host
 * @param {object} brief
 * @param {object} ledger
 * @param {{ onPick?: Function }} handlers
 */
export function renderHomeBrief(host, brief, ledger, handlers = {}) {
  if (!host) return false;
  if (shouldHideHomeBrief(brief, ledger)) {
    host.hidden = true;
    host.innerHTML = '';
    return false;
  }
  host.innerHTML = homeBriefHTML(brief, ledger);
  host.hidden = false;
  host.querySelector('#wb-pick')?.addEventListener('click', () => handlers.onPick?.());
  return true;
}

/** 选择关心的问题：首版就是一个多选面板，最多三个 */
export function watchPickerHTML(questions, chosen = []) {
  const list = (questions ?? []).map((q) => {
    const on = chosen.includes(q.key);
    const full = !on && chosen.length >= 3;
    return html`<label class="wp-item${on ? ' on' : ''}${full ? ' disabled' : ''}">
        <input type="checkbox" data-watch="${q.key}" ${on ? 'checked' : ''} ${full ? 'disabled' : ''} />
        <span class="wp-q">${q.question}</span>
        <span class="wp-why">${q.why}</span>
      </label>`;
  });
  return html`<div class="wp" role="group" aria-label="选择关心的问题">
    <p class="wp-hint">最多选三个。选多了简报就变成「全部市场」，和现在没区别。</p>
    ${list}
  </div>`;
}
