// @vitest-environment jsdom
/* ================================================================== *
 * 有范围的追问（产品 2.5 后半）
 *
 * 三条约束各有断言：
 *   1. 问题与上下文绑定；
 *   2. 回答继承资产/窗口/证据，不引入新数据；
 *   3. 证据不足时明确说「这一版回答不了」，不编一段通顺的话。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { FOLLOWUP_KINDS, followupsHTML, scopedFollowups } from '../src/client/shared/followups.js';

const exp = (over = {}) => ({
  assetId: 'gold-intl',
  asOf: '2026-10-28T10:00:00.000Z',
  window: { key: 'session', label: '本交易日' },
  hypotheses: [
    { mechanismId: 'M-GOLD-REAL-YIELD', mechanismVersion: 'gold-v3', label: '实际收益率', status: 'consistent', evidence: [{ id: 'e1' }, { id: 'e2' }], unknowns: [] },
  ],
  unknowns: [],
  ...over,
});

describe('三类问题', () => {
  it('生成三个可点的问题（不是自由输入框）', () => {
    const list = scopedFollowups({ explanation: exp() });
    expect(list).toHaveLength(3);
    expect(FOLLOWUP_KINDS.map((k) => k.id)).toEqual(['why', 'fails', 'domestic']);
  });

  it('问题文本里带上机制名与资产名（与上下文绑定）', () => {
    const list = scopedFollowups({ explanation: exp() });
    expect(list[0].ask).toContain('实际收益率');
    expect(list[0].ask).toContain('金价');
  });

  it('没有机制假设时只给一个说明，不硬凑三个问题', () => {
    const list = scopedFollowups({ explanation: { assetId: 'gold-intl', hypotheses: [] } });
    expect(list).toHaveLength(1);
    expect(list[0].answer.kind).toBe('out_of_scope');
    expect(list[0].answer.text).toContain('还没有登记任何机制假设');
  });

  it('机制多于三条时只展开前三条（追问不是聊天）', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ mechanismId: `M${i}`, label: `机制${i}`, status: 'untested', evidence: [] }));
    const list = scopedFollowups({ explanation: exp({ hypotheses: many }) });
    expect(list).toHaveLength(3);
  });
});

describe('回答继承上下文', () => {
  it('带上资产、窗口、截至时刻与机制版本', () => {
    const list = scopedFollowups({ explanation: exp() });
    const ctx = list[0].answer.context;
    expect(ctx).toContain('gold-intl');
    expect(ctx).toContain('本交易日');
    expect(ctx).toContain('gold-v3');
  });

  it('不引入新数据：回答里不出现本页没有的数字', () => {
    const list = scopedFollowups({ explanation: exp() });
    for (const f of list) expect(f.answer.text).not.toMatch(/\d+\.\d+%/);
  });
});

describe('证据不足时说实话', () => {
  const untested = exp({ hypotheses: [{ mechanismId: 'M', label: '库存', status: 'untested', evidence: [] }] });

  it('先说「没有可用证据」，再说机制怎么说（顺序不能反）', () => {
    const list = scopedFollowups({ explanation: untested });
    const text = list[0].answer.text;
    expect(text.indexOf('没有可用证据')).toBeLessThan(text.indexOf('机制'));
  });

  it('没有反例与条件时明说这是缺口，不编一个反例', () => {
    const list = scopedFollowups({ explanation: untested });
    const fails = list.find((f) => f.id === 'fails');
    expect(fails.answer.text).toContain('不能可靠地说出');
    expect(fails.answer.text).toContain('缺口');
  });

  it('有反例时把它们列出来（最多三条）', () => {
    const withConds = exp({ hypotheses: [{ mechanismId: 'M', label: 'x', status: 'mixed', evidence: [], unknowns: ['a', 'b', 'c', 'd'], conditions: [] }] });
    const fails = scopedFollowups({ explanation: withConds }).find((f) => f.id === 'fails');
    expect(fails.answer.text).toContain('a');
    expect(fails.answer.text.split('；').length).toBeLessThanOrEqual(3);
  });
});

describe('只答适用的问题', () => {
  it('没有内外盘这一层的资产，国内问题明确说不适用', () => {
    const list = scopedFollowups({ explanation: exp({ assetId: 'us10y' }) });
    const dom = list.find((f) => f.id === 'domestic');
    expect(dom.answer.kind).toBe('out_of_scope');
    expect(dom.answer.text).toContain('不适用');
  });

  it('黄金的国内问题给出两条腿（汇率与溢价），不判断溢价该是多少', () => {
    const list = scopedFollowups({ explanation: exp() });
    const dom = list.find((f) => f.id === 'domestic');
    expect(dom.answer.text).toContain('汇率');
    expect(dom.answer.text).toContain('溢价');
    expect(dom.answer.text).toContain('不判断');
  });
});

describe('面板', () => {
  it('每个问题是一个可折叠项，点开看回答', () => {
    const el = document.createElement('div');
    el.innerHTML = followupsHTML(scopedFollowups({ explanation: exp() }));
    expect(el.querySelectorAll('details.fu-item')).toHaveLength(3);
    expect(el.querySelector('summary').textContent).toContain('实际收益率');
  });

  it('回答里带上下文那一行（读者知道回答的是哪个资产哪个窗口）', () => {
    const el = document.createElement('div');
    el.innerHTML = followupsHTML(scopedFollowups({ explanation: exp() }));
    expect(el.querySelector('.fu-context').textContent).toContain('gold-intl');
  });

  it('空列表不渲染任何东西', () => {
    expect(followupsHTML([])).toBe('');
    expect(followupsHTML(null)).toBe('');
  });

  it('整屏不出现买卖建议', () => {
    const html = followupsHTML(scopedFollowups({ explanation: exp() }));
    for (const word of ['买入', '卖出', '加仓', '抄底']) expect(html).not.toContain(word);
  });
});

describe('上下文缺失时的兜底（真实存在的情况）', () => {
  it('没有 window / asOf / 机制版本时上下文化简，不输出 undefined', () => {
    const list = scopedFollowups({
      explanation: { assetId: 'oil', hypotheses: [{ mechanismId: 'M', label: '库存', status: 'consistent', evidence: [{ id: 'e' }] }] },
    });
    const ctx = list[0].answer.context;
    expect(ctx).not.toContain('undefined');
    expect(ctx).toContain('oil');
  });

  it('资产不在名字表里时用 id 本身（不硬编一个中文名）', () => {
    const list = scopedFollowups({ explanation: exp({ assetId: 'copper' }) });
    expect(list[0].ask).toContain('copper');
  });

  it('完全没有资产 id 时用「这个标的」', () => {
    const list = scopedFollowups({ explanation: { hypotheses: [{ mechanismId: 'M', label: 'x' }] } });
    expect(list[0].ask).toContain('这个标的');
  });

  it('机制没有 label 时用 mechanismId', () => {
    const list = scopedFollowups({ explanation: exp({ hypotheses: [{ mechanismId: 'M-OIL-INV', status: 'untested', evidence: [] }] }) });
    expect(list[0].ask).toContain('M-OIL-INV');
  });

  it('既无 label 也无 mechanismId 的假设被过滤掉（它无法展示也无法解释）', () => {
    const list = scopedFollowups({ explanation: exp({ hypotheses: [{ status: 'untested', evidence: [] }] }) });
    expect(list).toHaveLength(1);
    expect(list[0].ask).toBe('这一版能回答什么');
  });

  it('有证据但状态是 untested 时走「无证据」那一支（状态与证据都要看）', () => {
    const list = scopedFollowups({ explanation: exp({ hypotheses: [{ mechanismId: 'M', label: 'x', status: 'untested', evidence: [{ id: 'e' }] }] }) });
    expect(list[0].answer.text).toContain('没有可用证据');
  });

  it('状态 unknown 时用中性说法而不是空白', () => {
    const list = scopedFollowups({ explanation: exp({ hypotheses: [{ mechanismId: 'M', label: 'x', status: 'weird', evidence: [{ id: 'e' }] }] }) });
    expect(list[0].answer.text).toContain('没有给出观测结论');
  });

  it('机制层没写 unknowns 时回落到解释层的 unknowns', () => {
    const list = scopedFollowups({
      explanation: exp({
        hypotheses: [{ mechanismId: 'M', label: 'x', status: 'mixed', evidence: [] }],
        unknowns: ['政策口径变化'],
      }),
    });
    const fails = list.find((f) => f.id === 'fails');
    expect(fails.answer.text).toContain('政策口径变化');
  });

  it('机制层写了空数组就不回落（「明确没有」与「没填」是两种情况）', () => {
    const list = scopedFollowups({
      explanation: exp({
        hypotheses: [{ mechanismId: 'M', label: 'x', status: 'mixed', evidence: [], unknowns: [] }],
        unknowns: ['政策口径变化'],
      }),
    });
    const fails = list.find((f) => f.id === 'fails');
    expect(fails.answer.text).not.toContain('政策口径变化');
    expect(fails.answer.text).toContain('缺口');
  });

  it('条目缺少 answer 时不输出 undefined（面板健壮性）', () => {
    const html = followupsHTML([{ id: 'x', ask: '问题' }]);
    expect(html).not.toContain('undefined');
  });
});

describe('无参调用', () => {
  it('不传任何东西时给「能回答什么」的说明（不抛）', () => {
    const list = scopedFollowups();
    expect(list).toHaveLength(1);
    expect(list[0].answer.kind).toBe('out_of_scope');
  });
});
