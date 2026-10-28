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
