/* ================================================================== *
 * 关注简报卡（产品 2.3 的界面）
 *
 * 三态，各有各的话：
 *   未选关注问题 → 给选择入口（不是「暂无重要更新」）；
 *   选了但没变化  → 「暂无重要更新」，并且**不塞任何新闻**；
 *   有变化        → 列出条目，转载的标「N 家也在报」。
 *
 * 另外：本地记住上次查看时刻，简报的窗口由它决定，不是「最近 24 小时」。
 * ================================================================== */

import { esc } from '../shared/format.js';

export const LAST_SEEN_KEY = 'kanban.brief.lastSeen.v1';

/** 读取上次查看时刻；没存过给 null（服务端据此用默认回看窗口） */
export function readLastSeen(storage) {
  try {
    const raw = storage?.getItem?.(LAST_SEEN_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLastSeen(storage, ms) {
  try {
    storage?.setItem?.(LAST_SEEN_KEY, String(ms));
  } catch {
    // 隐私模式下会抛：不阻断，只是这次没记住
  }
}

export function briefRowHTML(item) {
  const more = (item?.sources ?? 1) > 1 ? `<span class="wb-more">${item.sources} 家也在报</span>` : '';
  return `<li class="wb-row" data-id="${esc(item?.id ?? '')}">
      <span class="wb-time">${esc(String(item?.time ?? '').slice(11, 16))}</span>
      <span class="wb-title">${esc(item?.title ?? '')}</span>
      ${more}
    </li>`;
}

/**
 * @param {{ reason:string, items?:object[], sinceMs?:number|null, watchedKeys?:string[] }} brief
 */
export function watchBriefHTML(brief) {
  const head = `<h3>关注简报 <span class="h3-note">只看你关心的问题</span></h3>`;

  if (!brief || brief.reason === 'NO_WATCH') {
    return `<section class="d-block wb-card" data-state="no-watch">
      ${head}
      <p class="wb-hint">选最多三个你关心的问题，下次进来先看它们有没有新变化。</p>
      <button type="button" class="wb-pick" id="wb-pick">选择关心的问题</button>
    </section>`;
  }

  if (brief.ok === false) {
    return `<section class="d-block wb-card" data-state="unavailable">
      ${head}
      <div class="chart-empty chart-empty-err">事件流暂时取不到${brief.reason ? `：${esc(brief.reason)}` : ''}</div>
    </section>`;
  }

  if (brief.empty) {
    return `<section class="d-block wb-card" data-state="empty">
      ${head}
      <p class="wb-empty">暂无重要更新。</p>
      <p class="wb-foot">自上次查看${brief.sinceMs ? `（${esc(fmtSince(brief.sinceMs))} 起）` : ''}没有与你的问题相关的新变化。</p>
    </section>`;
  }

  return `<section class="d-block wb-card" data-state="items">
    ${head}
    <ul class="wb-list">${(brief.items ?? []).map(briefRowHTML).join('')}</ul>
    <p class="wb-foot">共 ${brief.count ?? (brief.items ?? []).length} 条 · 转载合并显示 · 自上次查看${
      brief.sinceMs ? `（${esc(fmtSince(brief.sinceMs))} 起）` : ''
    }</p>
  </section>`;
}

/** 只给「多久以前」，不给绝对时间点 —— 读者关心的是新鲜度 */
export function fmtSince(sinceMs, nowMs = Date.now()) {
  const diff = Math.max(0, nowMs - Number(sinceMs || 0));
  const h = Math.floor(diff / 3600_000);
  if (h < 1) return '刚刚';
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
