/* ================================================================== *
 * 解释变化记录（产品 2.2「这版解释和上一版差在哪」）
 *
 * 目的很具体：用户昨天看到「实际收益率渠道：尚未确认」，今天变成「一致」，
 * 他想知道**是机制变了，还是数据变了**。如果只显示最新一版，这个问题
 * 无处可查；如果只说「有更新」，等于没说。
 *
 * 这个模块只做**比较**，不做评价。三条硬规矩：
 *
 *   1. **不排序、不打分**：「这一版更好」是价值判断，不是可计算的结论。
 *      这里只回答「哪些项变了、从什么变成什么、为什么可能变」。
 *   2. **区分「数据变了」与「规则变了」**：机制库版本（`gold-v3`）或算法
 *      版本（`calc-v2`）变了，说明是判定口径变了；版本没变而状态变了，
 *      说明是新数据导致。两者含义完全不同，混在一起会误导。
 *   3. **状态变化要说方向，但不说好坏**：`untested → consistent` 是
 *      「有证据了」，`consistent → not_supported` 是「证据反了」，
 *      都不是「变好/变坏」。
 * ================================================================== */

/** 状态的中文口径（与证据层一致） */
export const STATUS_LABEL = {
  consistent: '一致',
  mixed: '参差',
  not_supported: '不一致',
  untested: '尚未确认',
};

/** 状态变化的语义分类：只描述「发生了什么」，不评价好坏 */
export const CHANGE_KIND = {
  gainedEvidence: '有了证据',
  lostEvidence: '证据失效',
  contradicted: '证据转向反面',
  stillUntested: '仍然没有证据',
  statusChanged: '判定改变',
  unchanged: '未变',
};

/**
 * 单个假设的状态变化语义。
 *
 * @param {string} before
 * @param {string} after
 */
export function classifyStatusChange(before, after) {
  if (before === after) return CHANGE_KIND.unchanged;
  if (before === 'untested' && after !== 'untested') return CHANGE_KIND.gainedEvidence;
  if (before !== 'untested' && after === 'untested') return CHANGE_KIND.lostEvidence;
  if (after === 'not_supported' && before !== 'not_supported') return CHANGE_KIND.contradicted;
  if (before === 'not_supported' && after === 'consistent') return CHANGE_KIND.gainedEvidence;
  return CHANGE_KIND.statusChanged;
}

const keyOfHypothesis = (h) => h?.mechanismId ?? h?.label ?? null;
const keyOfFact = (f) => f?.code ?? f?.instrumentId ?? null;

/** 把数组按 key 建索引，重复 key 用「后者覆盖 + 记数」的方式避免静默丢数据 */
function indexBy(items, keyFn) {
  const map = new Map();
  const duplicates = [];
  for (const item of items ?? []) {
    const key = keyFn(item);
    if (!key) continue;
    if (map.has(key)) duplicates.push(key);
    map.set(key, item);
  }
  return { map, duplicates };
}

/**
 * 比较两版解释。
 *
 * @param {object} before 旧快照（envelope.explanation）
 * @param {object} after 新快照
 */
export function diffExplanations(before, after) {
  if (!before || !after) {
    return { status: 'unavailable', reason: 'MISSING_SNAPSHOT', changes: null };
  }
  if (before.id && after.id && before.id === after.id) {
    return { status: 'same', reason: 'SAME_EXPLANATION', changes: null, explanationId: after.id };
  }

  /**
   * 规则是否变过。
   *
   * 这是本模块最重要的一条判断：如果机制库或算法版本变了，那么「状态变化」
   * 可能只是口径变了，拿它当「市场变了」来读就是错的。
   */
  const rulesBefore = before.versions ?? {};
  const rulesAfter = after.versions ?? {};
  const rulesChanged = ['mechanisms', 'calculation'].filter((k) => rulesBefore[k] !== rulesAfter[k]).map((k) => ({
    field: k,
    from: rulesBefore[k] ?? null,
    to: rulesAfter[k] ?? null,
  }));

  const beforeH = indexBy(before.hypotheses, keyOfHypothesis);
  const afterH = indexBy(after.hypotheses, keyOfHypothesis);
  const hypothesisChanges = [];

  for (const [key, next] of afterH.map) {
    const prev = beforeH.map.get(key) ?? null;
    if (!prev) {
      hypothesisChanges.push({
        kind: 'added',
        key,
        label: next.label ?? key,
        statusBefore: null,
        statusAfter: next.status ?? null,
        labelBefore: null,
        labelAfter: STATUS_LABEL[next.status] ?? next.status ?? null,
      });
      continue;
    }
    if (prev.status !== next.status) {
      const kind = classifyStatusChange(prev.status, next.status);
      hypothesisChanges.push({
        kind,
        key,
        label: next.label ?? prev.label ?? key,
        statusBefore: prev.status ?? null,
        statusAfter: next.status ?? null,
        labelBefore: STATUS_LABEL[prev.status] ?? prev.status ?? null,
        labelAfter: STATUS_LABEL[next.status] ?? next.status ?? null,
        // 证据条数的变化是「为什么变」的直接线索，但要标清是条数不是结论
        evidenceCountBefore: (prev.evidence ?? []).length,
        evidenceCountAfter: (next.evidence ?? []).length,
      });
    }
  }
  for (const [key, prev] of beforeH.map) {
    if (afterH.map.has(key)) continue;
    hypothesisChanges.push({
      kind: 'removed',
      key,
      label: prev.label ?? key,
      statusBefore: prev.status ?? null,
      statusAfter: null,
      labelBefore: STATUS_LABEL[prev.status] ?? prev.status ?? null,
      labelAfter: null,
    });
  }

  const beforeF = indexBy(before.facts, keyOfFact);
  const afterF = indexBy(after.facts, keyOfFact);
  const factChanges = [];
  for (const [key, next] of afterF.map) {
    const prev = beforeF.map.get(key) ?? null;
    const prevValue = prev?.change?.value ?? null;
    const nextValue = next?.change?.value ?? null;
    if (!prev) {
      factChanges.push({ kind: 'added', key, label: next.label ?? key, before: null, after: nextValue });
      continue;
    }
    // 数值型事实只在「真的变了」时记一条；浮点噪声不算变化
    const changed = Number.isFinite(prevValue) && Number.isFinite(nextValue) ? Math.abs(nextValue - prevValue) > 1e-9 : prevValue !== nextValue;
    if (changed) {
      factChanges.push({ kind: 'changed', key, label: next.label ?? prev.label ?? key, before: prevValue, after: nextValue });
    }
  }
  for (const [key, prev] of beforeF.map) {
    if (afterF.map.has(key)) continue;
    factChanges.push({ kind: 'removed', key, label: prev.label ?? key, before: prev.change?.value ?? null, after: null });
  }

  const statusChanged = before.contentStatus !== after.contentStatus;
  const summaryChanged = before.summary !== after.summary;

  return {
    status: 'ok',
    before: { id: before.id ?? null, generatedAt: before.generatedAt ?? null, contentStatus: before.contentStatus ?? null },
    after: { id: after.id ?? null, generatedAt: after.generatedAt ?? null, contentStatus: after.contentStatus ?? null },
    rulesChanged,
    /**
     * 规则变了的时候必须显式置位：界面要说「判定口径变了」，
     * 而不是把这些状态变化当成市场变化。
     */
    rulesChangedFlag: rulesChanged.length > 0,
    contentStatusChanged: statusChanged
      ? { from: before.contentStatus ?? null, to: after.contentStatus ?? null }
      : null,
    summaryChanged: summaryChanged ? { from: before.summary ?? null, to: after.summary ?? null } : null,
    hypotheses: hypothesisChanges,
    facts: factChanges,
    duplicates: { before: beforeH.duplicates, after: afterH.duplicates },
    counts: {
      hypothesesChanged: hypothesisChanges.length,
      factsChanged: factChanges.length,
    },
    hasChanges:
      hypothesisChanges.length > 0 || factChanges.length > 0 || statusChanged || summaryChanged || rulesChanged.length > 0,
  };
}

/**
 * 一句话摘要（给卡片标题用）。
 *
 * 刻意不用「更准确了」「有改善」这类词：我们并不知道哪一版更接近真相。
 */
export function summarizeDiff(diff) {
  if (!diff || diff.status === 'unavailable') return '缺少可比的两版解释';
  if (diff.status === 'same') return '这是同一份解释，没有变化';
  if (!diff.hasChanges) return '与上一版相比没有变化';
  const parts = [];
  if (diff.rulesChangedFlag) parts.push(`判定口径变了（${diff.rulesChanged.map((r) => `${r.field} ${r.from}→${r.to}`).join('、')}）`);
  if (diff.counts.hypothesesChanged) parts.push(`${diff.counts.hypothesesChanged} 条假设的判定变了`);
  if (diff.counts.factsChanged) parts.push(`${diff.counts.factsChanged} 项数据事实变了`);
  if (diff.summaryChanged) parts.push('摘要文案变了');
  return parts.join('；');
}
