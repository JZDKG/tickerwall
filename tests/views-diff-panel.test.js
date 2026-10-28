// @vitest-environment jsdom
/* ================================================================== *
 * 变化记录的界面（产品 2.2）
 *
 * 断言的是三条界面纪律：口径优先、不说好坏、数值给前后。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  KIND_TEXT,
  diffPanelHTML,
  diffToggleHTML,
  factChangeHTML,
  gapText,
  hypothesisChangeHTML,
} from '../src/client/views/explanations/diff-panel.js';

const mount = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

const DIFF = {
  status: 'ok',
  before: { id: 'exp_1', generatedAt: '2026-10-27T10:00:00.000Z' },
  after: { id: 'exp_2', generatedAt: '2026-10-28T10:00:00.000Z' },
  rulesChanged: [],
  rulesChangedFlag: false,
  contentStatusChanged: null,
  summaryChanged: null,
  hypotheses: [
    {
      kind: 'gainedEvidence',
      key: 'M-GOLD-REAL-YIELD',
      label: '实际收益率',
      statusBefore: 'untested',
      statusAfter: 'consistent',
      labelBefore: '尚未确认',
      labelAfter: '一致',
      evidenceCountBefore: 0,
      evidenceCountAfter: 2,
    },
  ],
  facts: [{ kind: 'changed', key: 'TARGET_CHANGE', label: '本窗口变化', before: -0.13, after: -0.42 }],
  counts: { hypothesesChanged: 1, factsChanged: 1 },
  hasChanges: true,
};

const PAYLOAD = {
  schemaVersion: 1,
  ok: true,
  status: 'ok',
  before: DIFF.before,
  after: DIFF.after,
  diff: DIFF,
  summary: '1 条假设的判定变了；1 项数据事实变了',
  gapMs: 86_400_000,
};

describe('单行渲染', () => {
  it('假设变化：状态前后 + 证据条数', () => {
    const el = mount(hypothesisChangeHTML(DIFF.hypotheses[0]));
    expect(el.textContent).toContain('实际收益率');
    expect(el.textContent).toContain('有了证据');
    expect(el.textContent).toContain('尚未确认');
    expect(el.textContent).toContain('一致');
    expect(el.textContent).toContain('证据 0 → 2 条');
  });

  it('事实变化：前后数值都写出来', () => {
    const el = mount(factChangeHTML(DIFF.facts[0]));
    expect(el.textContent).toContain('-0.13%');
    expect(el.textContent).toContain('-0.42%');
    expect(el.textContent).toContain('数值变化');
  });

  it('缺失的一侧显示破折号，不显示 null', () => {
    const el = mount(factChangeHTML({ kind: 'added', label: 'X', before: null, after: 1 }));
    expect(el.textContent).toContain('—');
    expect(el.textContent).not.toContain('null');
  });
});

describe('整块', () => {
  it('正常变化：摘要 + 两组 + 相隔时间', () => {
    const el = mount(diffPanelHTML(PAYLOAD));
    expect(el.querySelector('[data-state="changed"]')).toBeTruthy();
    expect(el.textContent).toContain('1 条假设的判定变了');
    expect(el.querySelectorAll('.dfd-group')).toHaveLength(2);
    expect(el.textContent).toContain('两版相隔 1 天');
  });

  it('口径变了时口径说明排在最前面（不能藏在细节里）', () => {
    const withRules = {
      ...PAYLOAD,
      diff: {
        ...DIFF,
        rulesChanged: [{ field: 'mechanisms', from: 'gold-v3', to: 'gold-v4' }],
        rulesChangedFlag: true,
      },
    };
    const el = mount(diffPanelHTML(withRules));
    const rules = el.querySelector('.dfd-rules');
    expect(rules).toBeTruthy();
    expect(rules.textContent).toContain('判定口径变了');
    expect(rules.textContent).toContain('不一定是市场变了');
    // 它在摘要之前
    expect(el.innerHTML.indexOf('dfd-rules')).toBeLessThan(el.innerHTML.indexOf('dfd-summary'));
  });

  it('没有变化时明确说「没有变化」，不渲染空列表', () => {
    const el = mount(diffPanelHTML({
      ...PAYLOAD,
      diff: { ...DIFF, hypotheses: [], facts: [], counts: { hypothesesChanged: 0, factsChanged: 0 }, hasChanges: false },
    }));
    expect(el.textContent).toContain('没有变化');
    expect(el.querySelectorAll('.dfd-group')).toHaveLength(0);
  });

  it('第一版：说明没有可比的历史版本（不是错误态）', () => {
    const el = mount(diffPanelHTML({ status: 'no-previous' }));
    expect(el.querySelector('.dfd-panel--first')).toBeTruthy();
    expect(el.textContent).toContain('第一版');
  });

  it('拿不到记录 / 接口失败都有兜底文案', () => {
    expect(mount(diffPanelHTML(null)).textContent).toContain('拿不到');
    expect(mount(diffPanelHTML({ status: 'error', error: '接口 503' })).textContent).toContain('接口 503');
  });

  it('contentStatus 变化单独一行', () => {
    const el = mount(diffPanelHTML({
      ...PAYLOAD,
      diff: { ...DIFF, contentStatusChanged: { from: 'ready', to: 'partial' } },
    }));
    expect(el.textContent).toContain('内容状态：ready → partial');
  });
});

describe('界面纪律', () => {
  it('不使用「变好 / 更准确 / 改善」这类价值判断', () => {
    const el = mount(diffPanelHTML(PAYLOAD));
    for (const banned of ['变好', '变差', '更准确', '改善', '更可信']) {
      expect(el.textContent).not.toContain(banned);
    }
  });

  it('变化类型文案覆盖全部 kind（新增的 kind 不会显示成 undefined）', () => {
    for (const kind of ['gainedEvidence', 'lostEvidence', 'contradicted', 'statusChanged', 'added', 'removed', 'changed']) {
      expect(KIND_TEXT[kind]).toBeTruthy();
    }
  });

  it('入口按钮带版本号；没有版本号时不渲染', () => {
    expect(mount(diffToggleHTML('exp_9')).querySelector('[data-explain-diff="exp_9"]')).toBeTruthy();
    expect(diffToggleHTML(null)).toBe('');
  });
});

describe('时间差文案', () => {
  it('秒 / 分钟 / 小时 / 天', () => {
    expect(gapText(30_000)).toBe('30 秒');
    expect(gapText(120_000)).toBe('2 分钟');
    expect(gapText(3 * 3600_000)).toBe('3 小时');
    expect(gapText(2 * 86_400_000)).toBe('2 天');
  });

  it('非法输入给「未知」，不显示 NaN', () => {
    expect(gapText(null)).toBe('未知');
    expect(gapText(-1)).toBe('未知');
  });
});

/* ================================================================== *
 * 与解释卡接线（产品 2.2）
 * ================================================================== */
describe('解释卡里的入口', () => {
  it('有两版及以上才显示入口；只有一版时不显示', async () => {
    // 入口挂在「卡 + 历史列表 + 入口」的组合渲染上，不是纯卡片本身
    const { renderExplainCard, createExplainState } = await import('../src/client/views/explanations/state.js');
    const base = createExplainState('gold-intl');
    const withOne = { ...base, phase: 'ready', explanation: { id: 'exp_1', hypotheses: [], facts: [] }, history: [{ id: 'exp_1' }] };
    const withTwo = {
      ...base,
      phase: 'ready',
      explanation: { id: 'exp_2', hypotheses: [], facts: [] },
      history: [{ id: 'exp_2' }, { id: 'exp_1' }],
    };
    expect(renderExplainCard(withOne, { assetName: '黄金' })).not.toContain('data-explain-diff=');
    expect(renderExplainCard(withTwo, { assetName: '黄金' })).toContain('data-explain-diff="exp_2"');
    expect(renderExplainCard(withTwo, { assetName: '黄金' })).toContain('data-explain-diff-slot');
  });

  it('取数：成功 / 失败都返回 {status, body}，不抛', async () => {
    const { fetchExplanationDiff } = await import('../src/client/views/explanations/state.js');
    const okFetch = async () => ({ status: 200, json: async () => ({ status: 'no-previous' }) });
    const badFetch = async () => {
      throw new Error('offline');
    };
    expect((await fetchExplanationDiff('exp_1', { fetchImpl: okFetch })).body.status).toBe('no-previous');
    expect((await fetchExplanationDiff('exp_1', { fetchImpl: badFetch })).status).toBe(503);
    expect((await fetchExplanationDiff(null, { fetchImpl: okFetch })).status).toBe(400);
  });
});

/* ================================================================== *
 * 分支补齐：每个「有/无」都要两边都走过
 *
 * 这一组是分支覆盖，不是行覆盖 —— 上面那些用例已经跑过每一行，
 * 但条件只走了 true 那一侧。
 * ================================================================== */
describe('分支：可选字段的有与无', () => {
  const base = (over = {}) => {
    const { diff, ...rest } = over;
    return { ...PAYLOAD, ...rest, diff: { ...DIFF, ...(diff ?? {}) } };
  };

  it('没有 summary 时不渲染摘要行（不输出空 <p>）', () => {
    const el = mount(diffPanelHTML(base({ summary: null })));
    expect(el.querySelector('.dfd-summary')).toBeNull();
  });

  it('没有 contentStatusChanged 时不渲染状态行', () => {
    const el = mount(diffPanelHTML(base()));
    expect(el.querySelector('.dfd-status')).toBeNull();
  });

  it('只有假设变化、没有事实变化时，只有一组', () => {
    const el = mount(diffPanelHTML(base({ diff: { facts: [], counts: { hypothesesChanged: 1, factsChanged: 0 } } })));
    expect(el.querySelectorAll('.dfd-group')).toHaveLength(1);
    expect(el.textContent).toContain('假设判定');
  });

  it('只有事实变化、没有假设变化时，只有一组', () => {
    const el = mount(diffPanelHTML(base({ diff: { hypotheses: [], counts: { hypothesesChanged: 0, factsChanged: 1 } } })));
    const groups = [...el.querySelectorAll('.dfd-group h4')].map((h) => h.textContent);
    expect(groups).toEqual(['数据事实']);
  });

  it('没有 gapMs 时不渲染「相隔多久」（不知道就别写）', () => {
    const el = mount(diffPanelHTML(base({ gapMs: null })));
    expect(el.querySelector('.dfd-foot')).toBeNull();
  });

  it('contentStatus 某一侧为 null 时显示破折号', () => {
    const el = mount(diffPanelHTML(base({ diff: { contentStatusChanged: { from: null, to: 'ready' } } })));
    const line = el.querySelector('.dfd-status').textContent;
    expect(line).toContain('—');
    expect(line).toContain('ready');
    expect(line).not.toContain('null');
  });

  it('没有变化但口径变了：仍然要显示口径说明', () => {
    const el = mount(diffPanelHTML(base({
      diff: {
        hasChanges: false,
        hypotheses: [],
        facts: [],
        rulesChanged: [{ field: 'mechanisms', from: 'gold-v3', to: 'gold-v4' }],
        rulesChangedFlag: true,
      },
    })));
    expect(el.querySelector('.dfd-rules')).toBeTruthy();
    expect(el.textContent).toContain('没有变化');
  });

  it('只有一条假设变化时也渲染证据条数（0 → 0 也给）', () => {
    const el = mount(hypothesisChangeHTML({
      kind: 'statusChanged', key: 'k', label: 'L', statusBefore: 'mixed', statusAfter: 'consistent',
      labelBefore: '参差', labelAfter: '一致', evidenceCountBefore: 0, evidenceCountAfter: 0,
    }));
    expect(el.textContent).toContain('证据 0 → 0 条');
  });

  it('假设变化缺证据条数时不渲染那一行（不给假数据）', () => {
    const el = mount(hypothesisChangeHTML({ kind: 'added', key: 'k', label: 'L', statusAfter: 'untested' }));
    expect(el.querySelector('.dfd-evidence')).toBeNull();
  });
});

describe('分支：兜底文案的反面（不传字段也要有话说）', () => {
  it('factChangeHTML：缺 label 与 key 时名字为空串，不输出 undefined', () => {
    const el = mount(factChangeHTML({ kind: 'added' }));
    expect(el.textContent).not.toContain('undefined');
    expect(el.querySelector('.dfd-name').textContent).toBe('');
  });

  it('factChangeHTML：未知 kind 原样显示（不显示「变化」以外的假标签）', () => {
    const el = mount(factChangeHTML({ kind: 'weird', label: 'X', before: 1, after: 2 }));
    expect(el.textContent).toContain('weird');
  });

  it('diff 为空但没有 error 时给默认文案', () => {
    const el = mount(diffPanelHTML({ status: 'ok', diff: null }));
    expect(el.textContent).toContain('变化记录暂时不可用');
  });

  it('payload 整个缺 diff 且 status 未知：仍然渲染一个面板（不白屏）', () => {
    const el = mount(diffPanelHTML({}));
    expect(el.querySelector('.dfd-panel')).toBeTruthy();
  });
});

describe('分支：两侧都缺时的破折号', () => {
  it('假设变化两侧状态都没给：显示「—」而不是空', () => {
    const el = mount(hypothesisChangeHTML({ kind: 'removed', key: 'k', label: 'L' }));
    expect(el.querySelector('.dfd-change').textContent).toContain('—');
  });

  it('只有一侧状态时另一侧仍是破折号', () => {
    const el = mount(hypothesisChangeHTML({ kind: 'added', key: 'k', label: 'L', statusAfter: 'untested' }));
    const text = el.querySelector('.dfd-change').textContent;
    expect(text).toContain('—');
    expect(text).toContain('untested');
  });

  it('hypotheses / facts 缺失时按空数组处理（不抛）', () => {
    const el = mount(diffPanelHTML({ ...PAYLOAD, diff: { hasChanges: true } }));
    expect(el.querySelector('.dfd-panel')).toBeTruthy();
  });

  it('contentStatusChanged 两侧都有时都写出来', () => {
    const el = mount(diffPanelHTML({ ...PAYLOAD, diff: { ...DIFF, contentStatusChanged: { from: 'ready', to: 'partial' } } }));
    const line = el.querySelector('.dfd-status').textContent;
    expect(line).toContain('ready');
    expect(line).toContain('partial');
  });
});

describe('分支：整行构造器收到 null', () => {
  it('hypothesisChangeHTML(null) 不抛，且不输出 undefined', () => {
    const el = mount(`<div>${hypothesisChangeHTML(null)}</div>`);
    expect(el.textContent).not.toContain('undefined');
    expect(el.querySelector('.dfd-row')).toBeTruthy();
  });

  it('factChangeHTML(null) 不抛，且不输出 NaN', () => {
    const el = mount(`<div>${factChangeHTML(null)}</div>`);
    expect(el.textContent).not.toContain('NaN');
    expect(el.textContent).not.toContain('undefined');
  });

  it('diffPanelHTML(undefined) 与 (null) 都给同一句兜底文案', () => {
    expect(mount(diffPanelHTML(undefined)).textContent).toContain('拿不到');
    expect(mount(diffPanelHTML(null)).textContent).toContain('拿不到');
  });

  it('payload 没有 status 但有 diff：照常渲染（字段缺失不该挡住内容）', () => {
    const el = mount(diffPanelHTML({ diff: DIFF }));
    expect(el.querySelector('[data-state="changed"]')).toBeTruthy();
  });
});
