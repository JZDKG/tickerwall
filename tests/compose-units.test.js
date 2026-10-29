/* ================================================================== *
 * 文案合成的边角（server/domain/explanations/compose.js）
 *
 * 这些不是「为凑覆盖率的脏数据」—— 每一条都是真实会遇到的输入形态：
 * bp 与 pct 的单位不同、单日窗口不显示箭头、没有目标观测时不能编句子、
 * 事实里的数值必须有限、摘要里的数字必须能回溯。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  formatChange,
  factSentence,
  contentStatusOf,
  verifyExplanation,
  buildUnknowns,
  buildFacts,
} from '../src/server/domain/explanations/compose.js';

describe('formatChange', () => {
  it('bp 保留一位、pct 保留两位、无单位保留两位', () => {
    expect(formatChange({ value: -2.04, unit: 'bp' })).toBe('−2.0bp');
    expect(formatChange({ value: 0.1234, unit: 'pct' })).toBe('+0.12%');
    expect(formatChange({ value: 3.456, unit: null })).toBe('+3.46');
  });

  it('带符号时正负分明；不带符号时不出现负号', () => {
    expect(formatChange({ value: 1.5, unit: 'pct' })).toBe('+1.50%');
    expect(formatChange({ value: -1.5, unit: 'pct' }, { withSign: false })).toBe('1.50%');
    expect(formatChange({ value: 0, unit: 'pct' })).toBe('0.00%');
  });

  it('没有变化对象时给破折号（不是 NaN）', () => {
    expect(formatChange(null)).toBe('—');
    expect(formatChange(undefined)).toBe('—');
  });
});

describe('factSentence', () => {
  const facts = (window) => [{ code: 'TARGET_CHANGE', instrumentId: 'gold-intl', window, change: { value: -0.8, unit: 'pct' } }];

  it('单日窗口只写日期，不写箭头', () => {
    const s = factSentence(facts({ start: '2026-10-28', end: '2026-10-28' }), { name: '国际金价' });
    expect(s).toContain('2026-10-28');
    expect(s).not.toContain('→');
  });

  it('跨日窗口写起止', () => {
    const s = factSentence(facts({ start: '2026-10-27', end: '2026-10-28' }), { name: '国际金价' });
    expect(s).toContain('→');
  });

  it('没有窗口时不编时间，仍给方向与幅度', () => {
    const s = factSentence(facts({}), { name: '国际金价' });
    expect(s).toContain('本窗口');
    expect(s).toContain('下降');
  });

  it('没有目标观测时明说没有，而不是给一句像样的话', () => {
    expect(factSentence([], { name: '国际金价' })).toBe('本窗口没有可用的目标资产观测。');
  });

  it('变化为 0 时说「基本持平」（不写成上涨 0.00%）', () => {
    const s = factSentence([{ code: 'TARGET_CHANGE', instrumentId: 'x', window: {}, change: { value: 0, unit: 'pct' } }], { name: 'X' });
    expect(s).toContain('基本持平');
  });
});

describe('contentStatusOf', () => {
  it('没有事实 → 证据不足', () => {
    expect(contentStatusOf({ facts: [], hypotheses: [] })).toBe('insufficient');
  });

  it('有事实但没有渠道 → 证据不足', () => {
    expect(contentStatusOf({ facts: [{}], hypotheses: [] })).toBe('insufficient');
  });

  it('有渠道全未检验 → 部分可用', () => {
    expect(contentStatusOf({ facts: [{}], hypotheses: [{ status: 'untested' }] })).toBe('partial');
  });

  it('至少一条被检验过 → ready', () => {
    expect(contentStatusOf({ facts: [{}], hypotheses: [{ status: 'mixed' }] })).toBe('ready');
  });
});

describe('verifyExplanation（受约束生成的守门人）', () => {
  it('非对象直接拒绝', () => {
    expect(verifyExplanation(null).ok).toBe(false);
    expect(verifyExplanation('x').reason).toBe('NOT_AN_OBJECT');
  });

  it('证据没有观测引用 → 拒绝（缺引用比没解释更危险）', () => {
    const out = verifyExplanation({ facts: [], hypotheses: [{ mechanismId: 'M1', evidence: [{ observationIds: [] }] }] });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('EVIDENCE_WITHOUT_OBSERVATIONS');
  });

  it('事实里出现非有限数 → 拒绝', () => {
    const out = verifyExplanation({ facts: [{ instrumentId: 'x', change: { value: Number.POSITIVE_INFINITY } }], hypotheses: [] });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('NON_FINITE_FACT');
  });
});

describe('buildUnknowns 的驱动质量分支', () => {
  it('驱动过期 → 明说只作背景', () => {
    const out = buildUnknowns({ hypotheses: [], facts: [], driverQuality: [{ instrumentId: 'oil', status: 'stale' }], events: [{}] });
    const text = out.map((u) => u.text ?? '').join(' ');
    expect(text).toContain('只作为背景');
  });

  it('驱动不可用 → 明说没有可用观测', () => {
    const out = buildUnknowns({ hypotheses: [], facts: [], driverQuality: [{ instrumentId: 'dxy', status: 'unavailable' }], events: [{}] });
    const text = out.map((u) => u.text ?? '').join(' ');
    expect(text).toContain('没有可用观测');
  });
});

/* ================================================================== *
 * 第 90 轮：事实里的观测引用也要带修订号
 *
 * 线上复现过：同一份解释里「事实」指向 r1、「证据」指向 r2 ——
 * 历史回看时两处对不上。根因是 compose 里手拼 `指标@日期`。
 * ================================================================== */
describe('事实引用的修订号', () => {
  const series = { dates: ['2026-10-28', '2026-10-29'], values: [2010, 2007] };

  it('只有终点被修订时：起点不带后缀、终点带 #r2', () => {
    const targetObs = {
      definition: { short: '国际金价', unit: 'usd', comparisonPolicy: 'log-return' },
      series,
      revisionOf: (id, date) => (date === '2026-10-29' ? 2 : 1),
    };
    const facts = buildFacts({
      targetId: 'gold-intl',
      targetDefinition: targetObs.definition,
      targetSeries: series,
      targetObs,
      drivers: [],
      windowKey: 'session',
      anchor: { start: '2026-10-28', end: '2026-10-29' },
    });
    const ids = facts.find((f) => f.code === 'TARGET_CHANGE').observationIds;
    expect(ids).toEqual(['gold-intl@2026-10-28', 'gold-intl@2026-10-29#r2']);
  });

  it('没有 revisionOf 时退回可读形式（不编后缀）', () => {
    const facts = buildFacts({
      targetId: 'gold-intl',
      targetDefinition: { short: '国际金价', unit: 'usd', comparisonPolicy: 'log-return' },
      targetSeries: series,
      drivers: [],
      windowKey: 'session',
      anchor: { start: '2026-10-28', end: '2026-10-29' },
    });
    expect(facts.find((f) => f.code === 'TARGET_CHANGE').observationIds)
      .toEqual(['gold-intl@2026-10-28', 'gold-intl@2026-10-29']);
  });

  it('revisionOf 抛错时不影响生成（降级到可读形式）', () => {
    const targetObs = {
      definition: { short: '国际金价', unit: 'usd', comparisonPolicy: 'log-return' },
      series,
      revisionOf: () => { throw new Error('db down'); },
    };
    const facts = buildFacts({
      targetId: 'gold-intl', targetDefinition: targetObs.definition, targetSeries: series, targetObs,
      drivers: [], windowKey: 'session', anchor: { start: '2026-10-28', end: '2026-10-29' },
    });
    expect(facts.find((f) => f.code === 'TARGET_CHANGE').observationIds[0]).toBe('gold-intl@2026-10-28');
  });
});
