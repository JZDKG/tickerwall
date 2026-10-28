/* ================================================================== *
 * 解释变化记录（产品 2.2）
 *
 * 这一段的价值在**语义区分**：
 *   · 「判定口径变了」vs「数据变了」—— 混在一起会让人把规则改动当成市场变化；
 *   · 状态变化只说发生了什么，不说好坏 —— 我们不知道哪一版更接近真相。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  CHANGE_KIND,
  STATUS_LABEL,
  classifyStatusChange,
  diffExplanations,
  summarizeDiff,
} from '../src/server/domain/explanations/diff.js';

const snap = (over = {}) => ({
  id: 'exp_1',
  assetId: 'gold-intl',
  generatedAt: '2026-10-27T10:00:00.000Z',
  contentStatus: 'ready',
  summary: '黄金本窗口下跌，实际收益率渠道尚未确认。',
  versions: { mechanisms: 'gold-v3', calculation: 'calc-v2', language: 'template-v1' },
  hypotheses: [
    { mechanismId: 'M-GOLD-REAL-YIELD', label: '实际收益率', status: 'untested', evidence: [] },
    { mechanismId: 'M-GOLD-USD', label: '美元计价', status: 'consistent', evidence: [{ id: 'e1' }, { id: 'e2' }] },
  ],
  facts: [
    { code: 'TARGET_CHANGE', label: '黄金本窗口变化', change: { value: -0.13, unit: 'pct' } },
    { code: 'USD_CNY', label: '汇率', change: { value: 0.02, unit: 'pct' } },
  ],
  ...over,
});

describe('状态变化的语义', () => {
  it('从没有证据到有证据', () => {
    expect(classifyStatusChange('untested', 'consistent')).toBe(CHANGE_KIND.gainedEvidence);
    expect(classifyStatusChange('untested', 'not_supported')).toBe(CHANGE_KIND.gainedEvidence);
  });

  it('从有证据回到没有证据（数据失效/回补失败）', () => {
    expect(classifyStatusChange('consistent', 'untested')).toBe(CHANGE_KIND.lostEvidence);
  });

  it('证据转向反面', () => {
    expect(classifyStatusChange('consistent', 'not_supported')).toBe(CHANGE_KIND.contradicted);
  });

  it('从反面变成一致，算「有了新证据」而不是「反转」', () => {
    expect(classifyStatusChange('not_supported', 'consistent')).toBe(CHANGE_KIND.gainedEvidence);
  });

  it('其他状态切换是中性描述', () => {
    expect(classifyStatusChange('consistent', 'mixed')).toBe(CHANGE_KIND.statusChanged);
    expect(classifyStatusChange('mixed', 'not_supported')).toBe(CHANGE_KIND.contradicted);
  });

  it('状态没变就是未变', () => {
    expect(classifyStatusChange('consistent', 'consistent')).toBe(CHANGE_KIND.unchanged);
  });
});

describe('整份比较', () => {
  it('同一份解释（id 相同）直接说「没有变化」，不做逐项比较', () => {
    const a = snap();
    const r = diffExplanations(a, { ...a });
    expect(r.status).toBe('same');
    expect(r.changes).toBeNull();
  });

  it('缺一版就明确说不可比', () => {
    expect(diffExplanations(null, snap())).toMatchObject({ status: 'unavailable', reason: 'MISSING_SNAPSHOT' });
    expect(diffExplanations(snap(), null)).toMatchObject({ status: 'unavailable' });
  });

  it('假设从 untested 变成 consistent：记下前后状态与证据条数变化', () => {
    const before = snap();
    const after = snap({
      id: 'exp_2',
      hypotheses: [
        { mechanismId: 'M-GOLD-REAL-YIELD', label: '实际收益率', status: 'consistent', evidence: [{ id: 'e9' }] },
        { mechanismId: 'M-GOLD-USD', label: '美元计价', status: 'consistent', evidence: [{ id: 'e1' }, { id: 'e2' }] },
      ],
    });
    const r = diffExplanations(before, after);
    expect(r.status).toBe('ok');
    expect(r.hypotheses).toHaveLength(1);
    expect(r.hypotheses[0]).toMatchObject({
      kind: CHANGE_KIND.gainedEvidence,
      key: 'M-GOLD-REAL-YIELD',
      statusBefore: 'untested',
      statusAfter: 'consistent',
      evidenceCountBefore: 0,
      evidenceCountAfter: 1,
    });
    expect(r.hasChanges).toBe(true);
  });

  it('只有事实数值变化时也算「有变化」，且只记真的变了的项', () => {
    const before = snap();
    const after = snap({
      id: 'exp_3',
      facts: [
        { code: 'TARGET_CHANGE', label: '黄金本窗口变化', change: { value: -0.42, unit: 'pct' } },
        { code: 'USD_CNY', label: '汇率', change: { value: 0.02, unit: 'pct' } },
      ],
    });
    const r = diffExplanations(before, after);
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toMatchObject({ kind: 'changed', key: 'TARGET_CHANGE', before: -0.13, after: -0.42 });
  });

  it('浮点噪声不算变化（避免每次比对都报「变了」）', () => {
    const before = snap();
    const after = snap({
      id: 'exp_4',
      // 两个事实都保留，只把其中一个扰动 1e-12：这才是「噪声」
      facts: [
        { code: 'TARGET_CHANGE', label: '黄金本窗口变化', change: { value: -0.13 + 1e-12, unit: 'pct' } },
        { code: 'USD_CNY', label: '汇率', change: { value: 0.02, unit: 'pct' } },
      ],
    });
    const r = diffExplanations(before, after);
    expect(r.facts).toHaveLength(0);
  });

  it('新增 / 删除的假设与事实都记下来（不只记改动）', () => {
    const before = snap();
    const after = snap({
      id: 'exp_5',
      hypotheses: [{ mechanismId: 'M-GOLD-NEW', label: '新机制', status: 'untested', evidence: [] }],
      facts: [{ code: 'NEW_FACT', label: '新事实', change: { value: 1 } }],
    });
    const r = diffExplanations(before, after);
    expect(r.hypotheses.filter((h) => h.kind === 'removed')).toHaveLength(2);
    expect(r.hypotheses.filter((h) => h.kind === 'added')).toHaveLength(1);
    expect(r.facts.filter((f) => f.kind === 'removed')).toHaveLength(2);
    expect(r.facts.filter((f) => f.kind === 'added')).toHaveLength(1);
  });

  it('contentStatus 变化单独记（ready → partial 与假设变化是两件事）', () => {
    const r = diffExplanations(snap(), snap({ id: 'exp_6', contentStatus: 'partial' }));
    expect(r.contentStatusChanged).toEqual({ from: 'ready', to: 'partial' });
    expect(r.hasChanges).toBe(true);
  });

  it('摘要变化记下前后文案（原文保留，不改写）', () => {
    const r = diffExplanations(snap(), snap({ id: 'exp_7', summary: '新的说法。' }));
    expect(r.summaryChanged).toEqual({ from: '黄金本窗口下跌，实际收益率渠道尚未确认。', to: '新的说法。' });
  });
});

describe('规则版本变化 vs 数据变化', () => {
  it('机制库版本变化被单独标出，并且置 rulesChangedFlag', () => {
    const r = diffExplanations(
      snap(),
      snap({
        id: 'exp_8',
        versions: { mechanisms: 'gold-v4', calculation: 'calc-v2', language: 'template-v1' },
        hypotheses: [
          { mechanismId: 'M-GOLD-REAL-YIELD', label: '实际收益率', status: 'consistent', evidence: [] },
          { mechanismId: 'M-GOLD-USD', label: '美元计价', status: 'consistent', evidence: [] },
        ],
      }),
    );
    expect(r.rulesChanged).toEqual([{ field: 'mechanisms', from: 'gold-v3', to: 'gold-v4' }]);
    expect(r.rulesChangedFlag).toBe(true);
    expect(summarizeDiff(r)).toContain('判定口径变了');
  });

  it('算法版本变化同样标出（calc-v2 → calc-v3）', () => {
    const r = diffExplanations(snap(), snap({ id: 'exp_9', versions: { mechanisms: 'gold-v3', calculation: 'calc-v3' } }));
    expect(r.rulesChanged).toEqual([{ field: 'calculation', from: 'calc-v2', to: 'calc-v3' }]);
  });

  it('只有文案版本变化不算口径变化（它只影响措辞）', () => {
    const r = diffExplanations(
      snap(),
      snap({ id: 'exp_10', versions: { mechanisms: 'gold-v3', calculation: 'calc-v2', language: 'template-v2' } }),
    );
    expect(r.rulesChanged).toEqual([]);
    expect(r.rulesChangedFlag).toBe(false);
  });

  it('版本都没变但状态变了 → 说明是新数据导致（不置口径标记）', () => {
    const r = diffExplanations(
      snap(),
      snap({
        id: 'exp_11',
        hypotheses: [
          { mechanismId: 'M-GOLD-REAL-YIELD', label: '实际收益率', status: 'consistent', evidence: [{ id: 'x' }] },
          { mechanismId: 'M-GOLD-USD', label: '美元计价', status: 'consistent', evidence: [] },
        ],
      }),
    );
    expect(r.rulesChangedFlag).toBe(false);
    expect(r.hypotheses[0].kind).toBe(CHANGE_KIND.gainedEvidence);
  });
});

describe('摘要文案', () => {
  it('有变化时说清哪几类变了', () => {
    const r = diffExplanations(
      snap(),
      snap({
        id: 'exp_12',
        hypotheses: [
          { mechanismId: 'M-GOLD-REAL-YIELD', label: '实际收益率', status: 'consistent', evidence: [] },
          { mechanismId: 'M-GOLD-USD', label: '美元计价', status: 'consistent', evidence: [] },
        ],
      }),
    );
    const text = summarizeDiff(r);
    expect(text).toContain('1 条假设的判定变了');
  });

  it('没有变化时说「没有变化」，不编造理由', () => {
    const r = diffExplanations(snap(), { ...snap(), id: 'exp_13' });
    expect(summarizeDiff(r)).toBe('与上一版相比没有变化');
  });

  it('同一份 / 不可比 各有明确文案', () => {
    expect(summarizeDiff({ status: 'same' })).toContain('同一份');
    expect(summarizeDiff(null)).toContain('缺少');
  });

  it('不使用「更准确」「改善」这类价值判断词', () => {
    const r = diffExplanations(snap(), snap({ id: 'exp_14', contentStatus: 'partial' }));
    const text = summarizeDiff(r);
    for (const banned of ['更准确', '改善', '变好', '更可信']) expect(text).not.toContain(banned);
  });
});

describe('边界', () => {
  it('状态标签覆盖四种状态', () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(['consistent', 'mixed', 'not_supported', 'untested']);
  });

  it('重复的 mechanismId 被记进 duplicates，不静默丢数据', () => {
    const before = snap();
    const after = snap({
      id: 'exp_15',
      hypotheses: [
        { mechanismId: 'DUP', label: 'A', status: 'consistent', evidence: [] },
        { mechanismId: 'DUP', label: 'B', status: 'untested', evidence: [] },
      ],
    });
    const r = diffExplanations(before, after);
    expect(r.duplicates.after).toContain('DUP');
  });

  it('缺 id 的假设按 label 兜底配对（不整条丢弃）', () => {
    const before = snap({ hypotheses: [{ label: '实际收益率', status: 'untested', evidence: [] }] });
    const after = snap({ id: 'exp_16', hypotheses: [{ label: '实际收益率', status: 'consistent', evidence: [] }] });
    const r = diffExplanations(before, after);
    expect(r.hypotheses).toHaveLength(1);
    expect(r.hypotheses[0].statusAfter).toBe('consistent');
  });

  it('两版都没有 changed 字段时按 null 处理（不抛）', () => {
    const before = snap({ facts: [{ code: 'X', label: 'X' }] });
    const after = snap({ id: 'exp_17', facts: [{ code: 'X', label: 'X' }] });
    expect(() => diffExplanations(before, after)).not.toThrow();
  });
});
