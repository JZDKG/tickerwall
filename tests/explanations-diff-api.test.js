/* ================================================================== *
 * 变化记录接口（产品 2.2）
 *
 * 纯比较逻辑在 domain-diff.test.js 里验过。这里验「从库里取两版并说清」：
 *   · 不指定 with 时自动取上一版（用户问的是「和上一版差在哪」）；
 *   · 第一版明确回 no-previous，不是 404（它不是错误）；
 *   · 跨版本比较时把「隔了多久」带上（10 分钟变了与隔三天变了含义不同）。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, useDatabase } from '../src/server/db/index.js';
import { writeExplanation } from '../src/server/db/explanations.js';
import { compareExplanations } from '../src/server/services/explanations.service.js';

/** 造一份最小可写入的解释（不需要真实观测引用） */
const makeExplanation = ({ id, generatedAt, status = 'untested', summary = '摘要', versions = {} }) => ({
  id,
  assetId: 'gold-intl',
  asOf: generatedAt,
  generatedAt,
  window: { key: 'session', label: '本交易日' },
  contentStatus: 'ready',
  summary,
  facts: [{ code: 'TARGET_CHANGE', label: '本窗口变化', change: { value: -0.1, unit: 'pct' } }],
  hypotheses: [
    {
      mechanismId: 'M-GOLD-REAL-YIELD',
      mechanismVersion: versions.mechanisms ?? 'gold-v3',
      label: '实际收益率',
      status,
      evidence: status === 'untested' ? [] : [{ id: 'ev1', kind: 'correlation' }],
      eventRefs: [],
    },
  ],
  unknowns: [],
  nextChecks: [],
  versions: {
    mechanisms: versions.mechanisms ?? 'gold-v3',
    calculation: versions.calculation ?? 'calc-v2',
    language: 'template-v1',
  },
  inputFingerprint: `fp-${id}`,
});

beforeEach(() => useDatabase(':memory:'));
afterEach(() => closeDb());

describe('取上一版', () => {
  it('不指定 with 时自动比对同资产同窗口的上一版', () => {
    writeExplanation({ explanation: makeExplanation({ id: 'exp_old', generatedAt: '2026-10-27T10:00:00.000Z' }) });
    writeExplanation({
      explanation: makeExplanation({ id: 'exp_new', generatedAt: '2026-10-28T10:00:00.000Z', status: 'consistent' }),
    });

    const { status, body } = compareExplanations({ afterId: 'exp_new' });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.before.id).toBe('exp_old');
    expect(body.after.id).toBe('exp_new');
    expect(body.diff.hypotheses[0]).toMatchObject({ statusBefore: 'untested', statusAfter: 'consistent' });
    expect(body.summary).toContain('假设');
  });

  it('带上两版之间的时间差（10 分钟与三天不是一回事）', () => {
    writeExplanation({ explanation: makeExplanation({ id: 'exp_a', generatedAt: '2026-10-25T10:00:00.000Z' }) });
    writeExplanation({ explanation: makeExplanation({ id: 'exp_b', generatedAt: '2026-10-28T10:00:00.000Z' }) });
    const { body } = compareExplanations({ afterId: 'exp_b', beforeId: 'exp_a' });
    expect(body.gapMs).toBe(3 * 86_400_000);
  });

  it('第一版明确回 no-previous（不是 404 —— 它不是错误）', () => {
    writeExplanation({ explanation: makeExplanation({ id: 'exp_only', generatedAt: '2026-10-28T10:00:00.000Z' }) });
    const { status, body } = compareExplanations({ afterId: 'exp_only' });
    expect(status).toBe(200);
    expect(body.status).toBe('no-previous');
    expect(body.message).toContain('第一版');
    expect(body.diff).toBeNull();
  });

  it('未知版本 → 404（真的找不到才报错）', () => {
    expect(compareExplanations({ afterId: 'exp_nope' }).status).toBe(404);
    writeExplanation({ explanation: makeExplanation({ id: 'exp_x', generatedAt: '2026-10-28T10:00:00.000Z' }) });
    expect(compareExplanations({ afterId: 'exp_x', beforeId: 'exp_nope' }).status).toBe(404);
  });
});

describe('显式指定对比版本', () => {
  it('可以跨版本比较（不限于相邻两版）', () => {
    writeExplanation({ explanation: makeExplanation({ id: 'v1', generatedAt: '2026-10-20T10:00:00.000Z' }) });
    writeExplanation({ explanation: makeExplanation({ id: 'v2', generatedAt: '2026-10-22T10:00:00.000Z', status: 'mixed' }) });
    writeExplanation({ explanation: makeExplanation({ id: 'v3', generatedAt: '2026-10-24T10:00:00.000Z', status: 'consistent' }) });

    const { body } = compareExplanations({ afterId: 'v3', beforeId: 'v1' });
    expect(body.before.id).toBe('v1');
    expect(body.diff.hypotheses[0].statusAfter).toBe('consistent');
  });

  it('机制版本变化时结果里标出「判定口径变了」', () => {
    writeExplanation({ explanation: makeExplanation({ id: 'm1', generatedAt: '2026-10-20T10:00:00.000Z' }) });
    writeExplanation({
      explanation: makeExplanation({
        id: 'm2',
        generatedAt: '2026-10-21T10:00:00.000Z',
        status: 'consistent',
        versions: { mechanisms: 'gold-v4' },
      }),
    });
    const { body } = compareExplanations({ afterId: 'm2', beforeId: 'm1' });
    expect(body.diff.rulesChangedFlag).toBe(true);
    expect(body.summary).toContain('判定口径');
  });

  it('同一版与自己比 → 没有变化', () => {
    writeExplanation({ explanation: makeExplanation({ id: 'same', generatedAt: '2026-10-28T10:00:00.000Z' }) });
    const { body } = compareExplanations({ afterId: 'same', beforeId: 'same' });
    expect(body.diff.status).toBe('same');
    expect(body.summary).toContain('同一份');
  });
});
