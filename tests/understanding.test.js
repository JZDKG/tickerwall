/* ================================================================== *
 * 面向非金融用户的理解测试（方案 §10.2，脚本化）
 *
 * 方案要求「不离开页面即可回答六个问题」。这里把六个问题写成断言，
 * 用同一套渲染函数（详情卡 + 首页问题卡）产出 HTML，再检查答案是否真的
 * 可读出来：
 *
 *   1. 发生了什么？
 *   2. 可能的原因是什么（且明确是候选，不是结论）？
 *   3. 哪些还不确定？
 *   4. 依据在哪里、能不能点开？
 *   5. 这次解释是什么时候、哪个窗口的？
 *   6. 和「我」有什么关系，需要什么条件？
 *
 * 同时反向断言：没有因果已被证实的措辞、没有概率、没有无来源数字。
 * 这套断言不依赖浏览器，因此可以进 CI；浏览器走查仍保留为人工复核。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { explanationCardHTML } from '../src/client/views/explanations/card.js';
import { questionCardsHTML, cardFromResponse } from '../src/client/views/explanations/questions.js';

/** 「能读懂」的判据：卡片正文里必须出现这些可读片段 */
const GOLD = {
  id: 'exp_gold-intl_session_1',
  assetId: 'gold-intl',
  asOf: '2026-10-28T03:00:00Z',
  contentStatus: 'ready',
  window: { key: 'session', start: '2026-10-27', end: '2026-10-28' },
  summary:
    '国际金价本窗口下降 1.00%。当前观测与「实际收益率」方向一致，但这只是一致性，不能确认就是原因；下面还列了未确认的因素。',
  facts: [
    {
      code: 'TARGET_CHANGE',
      instrumentId: 'gold-intl',
      label: '黄金本窗口变化',
      window: { start: '2026-10-27', end: '2026-10-28' },
      change: { value: -1.0, unit: 'pct' },
      unit: '美元/盎司',
      observationIds: ['gold-intl@2026-10-27', 'gold-intl@2026-10-28'],
    },
    {
      code: 'DRIVER_CHANGE',
      instrumentId: 'dfii10',
      label: '10Y 实际本窗口变化',
      window: { start: '2026-10-27', end: '2026-10-28' },
      change: { value: 14.0, unit: 'bp' },
      observationIds: ['dfii10@2026-10-27', 'dfii10@2026-10-28'],
    },
  ],
  hypotheses: [
    {
      mechanismId: 'M-GOLD-REAL-YIELD',
      relationType: 'mechanism',
      label: '实际收益率',
      status: 'consistent',
      statusLabel: '观测一致',
      sign: -1,
      plain: '实际收益率：扣掉预期通胀之后衡量的债券回报。',
      mechanism: '黄金不付利息，实际收益率上升意味着持有无息资产的机会成本变高。',
      conditionCodes: ['SAME_WINDOW', 'SIGNED_SERIES'],
      exclusions: ['只有名义收益率上涨、实际收益率没有同向变化'],
      sources: [{ title: '芝加哥联储研究', url: 'https://example.test/a' }],
      evidence: [
        {
          role: 'support',
          instrumentId: 'dfii10',
          instrumentLabel: '10Y 实际收益率',
          window: { start: '2026-10-27', end: '2026-10-28' },
          change: { value: 14.0, unit: 'bp' },
          observationIds: ['dfii10@2026-10-27', 'dfii10@2026-10-28'],
        },
      ],
    },
    {
      mechanismId: 'M-GOLD-RISK',
      relationType: 'mechanism',
      label: '避险需求',
      status: 'untested',
      statusLabel: '尚未确认',
      sign: 1,
      plain: '避险需求：风险事件期间资金转向被认为更安全的资产。',
      mechanism: '风险资产动荡时资金可能转向黄金，但极端流动性紧张时会反过来。',
      conditionCodes: ['NEEDS_POSITION_EVIDENCE'],
      exclusions: ['只有 VIX 变化，没有持仓或实物需求证据'],
      sources: [],
      evidence: [],
    },
  ],
  unknowns: [{ code: 'NO_EVENT_EVIDENCE', text: '缺少可核实的事件证据。' }],
  nextChecks: ['等事件与发布时间补齐后，确认窗口内是否有可核实的供给或风险事件。'],
  versions: { mechanisms: 'gold-v2', calculation: 'calc-v1', language: 'template-v1' },
};

const META = { freshness: 'fresh', freshnessReasons: [], refreshStatus: 'idle' };

function card(state = {}) {
  return explanationCardHTML({
    phase: 'ready',
    assetId: 'gold-intl',
    assetName: '国际金价',
    windowKey: 'session',
    explanation: GOLD,
    meta: META,
    openFactors: new Set(),
    ...state,
  });
}

const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('六个问题：不离开页面就能回答', () => {
  it('1 发生了什么：给出方向、幅度与日期', () => {
    const t = text(card());
    expect(t).toContain('−1.00%');
    expect(t).toContain('2026-10-27');
    expect(t).toContain('2026-10-28');
  });

  it('2 可能的原因：以候选措辞出现，并标注状态', () => {
    const t = text(card());
    expect(t).toContain('实际收益率');
    expect(t).toContain('观测一致');
    // 必须同时说明「只是一致性」
    expect(t).toContain('不能确认就是原因');
  });

  it('3 哪些还不确定：至少一条关键未知 + 未确认渠道', () => {
    const t = text(card());
    expect(t).toContain('还缺什么');
    expect(t).toContain('缺少可核实的事件证据');
    expect(t).toContain('尚未确认');
  });

  it('4 依据在哪：可点开的来源 + 观测窗口 + 关系类型', () => {
    const html = card({ openFactors: new Set(['M-GOLD-REAL-YIELD']) });
    expect(html).toContain('https://example.test/a');
    expect(html).toContain('观测窗口');
    expect(text(html)).toContain('机制假设');
  });

  it('5 什么时候、哪个窗口：截至时间与窗口按钮都在', () => {
    const t = text(card());
    expect(t).toContain('截至 2026-10-28 03:00');
    expect(t).toContain('最近一个交易时段');
  });

  it('6 与我有什么关系：标地区与条件，不给预测', () => {
    const t = text(card());
    expect(t).toContain('与我有什么关系');
    expect(t).toContain('中国境内');
    expect(t).toContain('不构成对下一交易日的价格预测');
  });
});

describe('反向断言：不能出现的东西', () => {
  it('不出现「因果已证实 / 必然 / 一定会」这类断言', () => {
    const t = text(card());
    for (const banned of ['证实了', '必然', '一定会', '就是因为', '确定了原因']) {
      expect(t, banned).not.toContain(banned);
    }
  });

  it('不出现概率或对未来的点位预测', () => {
    const t = text(card());
    expect(t).not.toMatch(/概率|%的可能|目标价|将上涨到/);
  });

  it('不把裸条件码或机制 id 直接丢给用户', () => {
    const t = text(card({ openFactors: new Set(['M-GOLD-REAL-YIELD', 'M-GOLD-RISK']) }));
    expect(t).not.toMatch(/NEEDS_POSITION_EVIDENCE|SAME_WINDOW|SIGNED_SERIES/);
    // 条件必须翻译成人话
    expect(t).toContain('同一组共同观测日期');
  });

  it('每个渠道都有白话解释，没有「只有术语」的条目', () => {
    for (const h of GOLD.hypotheses) {
      expect(h.plain, h.mechanismId).toBeTruthy();
      expect(h.mechanism, h.mechanismId).toBeTruthy();
    }
  });
});

describe('首页问题卡：同一套可读性要求', () => {
  const cardOf = (status, body) =>
    cardFromResponse({ assetId: 'gold-intl', assetName: '国际金价', windowKey: 'session', status, body });

  it('有快照时：问题 → 事实 → 简短解释 → 数据状态 → 三个入口', () => {
    const html = questionCardsHTML([cardOf(200, { explanation: GOLD, meta: META })]);
    const t = text(html);
    expect(t).toContain('为何走弱');
    expect(t).toContain('观察事实');
    expect(t).toContain('不能确认是原因');
    expect(t).toContain('截至 2026-10-28 03:00');
    expect(t).toContain('看影响路径');
  });

  it('准备中时：不编造解释，只说明稍后补上', () => {
    const html = questionCardsHTML([cardOf(202, { explanation: null, meta: { freshness: 'unavailable' } })]);
    const t = text(html);
    expect(t).toContain('稍后会自动补上');
    expect(t).not.toContain('一致');
  });

  it('证据不足时：问题本身就说「没有明确解释」', () => {
    const html = questionCardsHTML([
      cardOf(200, { explanation: { ...GOLD, contentStatus: 'insufficient', facts: [], hypotheses: [] }, meta: META }),
    ]);
    expect(text(html)).toContain('没有明确解释');
  });
});
