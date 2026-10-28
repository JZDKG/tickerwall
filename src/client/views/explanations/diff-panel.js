/* ================================================================== *
 * 变化记录的界面（产品 2.2）
 *
 * 用户看到的是「昨天说尚未确认，今天说一致」，他想知道为什么。
 * 这里把 domain 层的 diff 渲染成两列表 + 一句摘要，并且守住三条：
 *
 *   1. **先说口径，再说变化**：如果机制库/算法版本变了，摘要第一句必须是
 *      「判定口径变了」—— 否则用户会把这些状态变化当成市场变化；
 *   2. **状态变化用「有了证据 / 证据转向反面 / 证据失效」描述**，不用
 *      「变好/变差」：我们不知道哪一版更接近真相；
 *   3. 数据事实的变化给前后数值，不做「变化显著」之类的判断。
 * ================================================================== */

import { esc } from '../../shared/format.js';

/** 变化类型 → 界面文案 */
export const KIND_TEXT = {
  added: '新增',
  removed: '移除',
  changed: '数值变化',
  gainedEvidence: '有了证据',
  lostEvidence: '证据失效',
  contradicted: '证据转向反面',
  stillUntested: '仍然没有证据',
  statusChanged: '判定改变',
  unchanged: '未变',
};

const fmtPct = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—');

/** 假设变化的一行 */
export function hypothesisChangeHTML(change) {
  const kind = KIND_TEXT[change?.kind] ?? change?.kind ?? '变化';
  const from = change?.labelBefore ?? (change?.statusBefore ? esc(change.statusBefore) : '—');
  const to = change?.labelAfter ?? (change?.statusAfter ? esc(change.statusAfter) : '—');
  const evidence =
    Number.isFinite(change?.evidenceCountBefore) || Number.isFinite(change?.evidenceCountAfter)
      ? `<span class="dfd-evidence">证据 ${change.evidenceCountBefore ?? 0} → ${change.evidenceCountAfter ?? 0} 条</span>`
      : '';
  return `<div class="dfd-row" data-kind="${esc(change?.kind ?? '')}">
      <span class="dfd-name">${esc(change?.label ?? change?.key ?? '')}</span>
      <span class="dfd-change"><b>${esc(kind)}</b>：${esc(String(from))} → ${esc(String(to))}</span>
      ${evidence}
    </div>`;
}

/** 数据事实变化的一行 */
export function factChangeHTML(change) {
  const kind = KIND_TEXT[change?.kind] ?? change?.kind ?? '变化';
  const before = change?.before == null ? '—' : fmtPct(Number(change.before));
  const after = change?.after == null ? '—' : fmtPct(Number(change.after));
  return `<div class="dfd-row dfd-row--fact" data-kind="${esc(change?.kind ?? '')}">
      <span class="dfd-name">${esc(change?.label ?? change?.key ?? '')}</span>
      <span class="dfd-change"><b>${esc(kind)}</b>：${esc(before)} → ${esc(after)}</span>
    </div>`;
}

/**
 * 整块变化记录。
 *
 * @param {object} payload /api/explanations/:id/diff 的响应
 */
export function diffPanelHTML(payload) {
  if (!payload) {
    return `<div class="dfd-panel dfd-panel--empty"><p>拿不到变化记录。</p></div>`;
  }
  if (payload.status === 'no-previous') {
    return `<div class="dfd-panel dfd-panel--first"><p>这是这个资产这个窗口的第一版解释，没有可比的历史版本。</p></div>`;
  }
  if (!payload.diff) {
    return `<div class="dfd-panel dfd-panel--empty"><p>${esc(payload.error ?? '变化记录暂时不可用')}</p></div>`;
  }

  const d = payload.diff;
  const rules = d.rulesChangedFlag
    ? `<p class="dfd-rules">判定口径变了：${d.rulesChanged
        .map((r) => `${esc(r.field)} ${esc(String(r.from))} → ${esc(String(r.to))}`)
        .join('、')}。这些变化可能来自规则调整，不一定是市场变了。</p>`
    : '';

  if (!d.hasChanges) {
    return `<div class="dfd-panel" data-state="unchanged">
        ${rules}
        <p class="dfd-empty">与上一版相比没有变化。</p>
      </div>`;
  }

  const hyps = (d.hypotheses ?? []).map(hypothesisChangeHTML).join('');
  const facts = (d.facts ?? []).map(factChangeHTML).join('');
  const statusLine = d.contentStatusChanged
    ? `<p class="dfd-status">内容状态：${esc(d.contentStatusChanged.from ?? '—')} → ${esc(d.contentStatusChanged.to ?? '—')}</p>`
    : '';

  return `<div class="dfd-panel" data-state="changed">
      ${rules}
      ${payload.summary ? `<p class="dfd-summary">${esc(payload.summary)}</p>` : ''}
      ${statusLine}
      ${hyps ? `<div class="dfd-group"><h4>假设判定</h4>${hyps}</div>` : ''}
      ${facts ? `<div class="dfd-group"><h4>数据事实</h4>${facts}</div>` : ''}
      ${
        payload.gapMs != null
          ? `<p class="dfd-foot">两版相隔 ${esc(gapText(payload.gapMs))}</p>`
          : ''
      }
    </div>`;
}

/** 「隔了多久」要说人话：几秒 / 几分钟 / 几小时 / 几天 */
export function gapText(ms) {
  // null / '' 不能走 Number() —— Number(null) 是 0，会显示成「0 秒」这种假精确
  if (ms == null || ms === '') return '未知';
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '未知';
  const s = Math.round(n / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时`;
  return `${Math.round(h / 24)} 天`;
}

/** 入口按钮：放在解释卡底部，和历史版本并列 */
export function diffToggleHTML(explanationId) {
  if (!explanationId) return '';
  return `<button type="button" class="explain-diff-toggle" data-explain-diff="${esc(explanationId)}">和上一版差在哪？</button>`;
}
