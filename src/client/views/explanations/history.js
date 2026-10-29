/* ================================================================== *
 * 历史回放（C3）：看「当时那份解释」，而不是用今天的规则重算
 *
 * 方案 §7.3 / §9 C3：解释是**不可变快照**，所以回放不是「重新算一遍」，
 * 而是把当时那一份原样取出来。两条纪律：
 *
 *   1. 回放必须显式标注：这是什么时候生成的、哪个版本，不是当前状态；
 *   2. 回放不写缓存、不触发新生成 —— 读的就是那一条 id。
 *
 * 纯取数 + 纯字符串，可在 Node 里单测。
 * ================================================================== */

import { getJsonWithStatus } from '../../shared/fetch-json.js';

const VERSIONS_SHOWN = 6;

export const CONTENT_STATUS_TEXT = {
  ready: '内容已生成',
  insufficient: '证据不足',
  unsupported: '不支持',
};

/** 'YYYY-MM-DDTHH:mm:ss.sssZ' → 'MM-DD HH:mm'（本地） */
export function shortStamp(iso) {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 取某资产 + 窗口的历史快照列表 */
export async function loadExplanationHistory({ assetId, windowKey = 'session', limit = VERSIONS_SHOWN, fetchImpl } = {}) {
  const { status, body } = await getJsonWithStatus('api/explanations/history', {
    fetchImpl: fetchImpl ?? null,
    query: `asset=${encodeURIComponent(assetId)}&window=${encodeURIComponent(windowKey)}&limit=${limit}`,
  });
  return { status, items: body?.items ?? [] };
}

/** 取某一版快照（就是 /api/explanations/:id） */
export async function loadExplanationVersion(id, { fetchImpl } = {}) {
  return getJsonWithStatus(`api/explanations/${encodeURIComponent(id)}`, { fetchImpl: fetchImpl ?? null });
}

/**
 * 版本列表 HTML。
 *
 * 默认收起：回放是查证工具，不该在正常阅读时占版面。只有一版时不显示
 * 「此前的解释」（那时候没有「此前」）。
 */
export function historyListHTML({ items = [], currentId = null, open = false } = {}) {
  const list = (items ?? []).filter((it) => it?.id);
  if (list.length <= 1) return '';
  const rows = list
    .map((it) => {
      const isCurrent = it.id === currentId;
      const status = CONTENT_STATUS_TEXT[it.contentStatus] ?? it.contentStatus ?? '—';
      const ver = it.versions?.mechanisms ? `机制 ${it.versions.mechanisms}` : '';
      return `<li class="explain-ver${isCurrent ? ' is-current' : ''}">
        <button type="button" class="explain-ver-btn" data-explain-version="${it.id}"${isCurrent ? ' aria-current="true"' : ''}>
          <span class="explain-ver-time">${shortStamp(it.asOf ?? it.generatedAt)}</span>
          <span class="explain-ver-status">${status}</span>
          <span class="explain-ver-meta">${ver}</span>
          ${isCurrent ? '<span class="explain-ver-now">当前</span>' : ''}
        </button>
      </li>`;
    })
    .join('');
  return `<details class="explain-history"${open ? ' open' : ''}>
    <summary>此前的解释（${list.length} 版）</summary>
    <p class="explain-history-note">每一版都是当时生成的快照，不会用今天的规则重算。</p>
    <ul class="explain-ver-list">${rows}</ul>
  </details>`;
}

/**
 * 回放横幅：必须能一眼看出「我不是在看当前状态」。
 *
 * @param {{asOf?:string, generatedAt?:string, versions?:object, id?:string}} item
 */
export function replayBannerHTML(item) {
  if (!item?.id) return '';
  const when = shortStamp(item.asOf ?? item.generatedAt);
  const ver = item.versions?.mechanisms ?? '';
  return `<div class="explain-replay" role="status">
    <b>历史版本</b>：这是 ${when} 生成的解释${ver ? `（机制 ${ver}）` : ''}，不是当前状态。
    <button type="button" class="explain-replay-back" data-explain-current="1">回到当前解释</button>
  </div>`;
}
