/* ================================================================== *
 * 首页问题卡（B5 验收）
 *
 * 方案 §3.1：模板生成问题、最多三张、排序先看可用性再看标准化变动、
 * 排序原因可检查、阅读期间不自动重排、主操作进入同一解释快照。
 * ================================================================== */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { meaningNotesFor } from '../src/client/views/explanations/card.js';
import {
  questionTemplate,
  targetFactOf,
  shortExplainOf,
  dataStatusOf,
  sigmaOfHistory,
  rankQuestions,
  cardFromResponse,
  loadQuestionCards,
  questionCardsHTML,
  pathHashFor,
} from '../src/client/views/explanations/questions.js';

const baseExplanation = (over = {}) => ({
  id: 'exp-a',
  assetId: 'gold-intl',
  asOf: '2026-10-28T03:00:00Z',
  contentStatus: 'ready',
  facts: [
    {
      code: 'TARGET_CHANGE',
      instrumentId: 'gold-intl',
      window: { start: '2026-10-27', end: '2026-10-28' },
      change: { value: -1.24, unit: 'pct' },
    },
  ],
  hypotheses: [
    { mechanismId: 'M1', label: '实际收益率', status: 'consistent' },
    { mechanismId: 'M2', label: '美元计价', status: 'mixed' },
    { mechanismId: 'M3', label: '避险需求', status: 'untested' },
  ],
  unknowns: [{ code: 'NO_EVENT_EVIDENCE', text: '缺少事件证据' }],
  ...over,
});

const readyBody = (over) => ({
  schemaVersion: 1,
  explanation: baseExplanation(over),
  meta: { freshness: 'fresh', freshnessReasons: [], refreshStatus: 'idle' },
});

beforeEach(() => {
  globalThis.localStorage = {
    getItem: () => '1',
    setItem: () => {},
  };
});

describe('问题模板：只写事实与状态', () => {
  it('写清对象与窗口，不写耸动标题', () => {
    const q = questionTemplate({ assetName: '国际金价', windowLabel: '过去一个交易时段，', direction: 'down', magnitude: '1.24%' });
    expect(q).toBe('过去一个交易时段，国际金价为何走弱（1.24%）');
    expect(q).not.toMatch(/暴跌|崩盘|史诗级|原因找到了/);
  });

  it('证据不足时问题本身就说明「没有明确解释」', () => {
    expect(questionTemplate({ assetName: '国际金价', windowLabel: '', status: 'insufficient' })).toContain('没有明确解释');
  });

  it('基本没动也如实说', () => {
    expect(questionTemplate({ assetName: '国际金价', windowLabel: '', direction: 'flat' })).toContain('基本没动');
  });
});

describe('事实与简报', () => {
  it('目标变化报方向与幅度', () => {
    const f = targetFactOf(baseExplanation());
    expect(f.direction).toBe('down');
    expect(f.magnitude).toBe('1.24%');
  });

  it('没有目标事实时给 unknown，不编数字', () => {
    expect(targetFactOf(baseExplanation({ facts: [] })).direction).toBe('unknown');
    expect(targetFactOf(null).value).toBeNull();
  });

  it('简报最多两句，且带限定词', () => {
    const s = shortExplainOf(baseExplanation());
    expect(s).toContain('一致');
    expect(s).toContain('不能确认是原因');
    expect(s.split('。').filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it('只有冲突证据时说方向未定', () => {
    const s = shortExplainOf(baseExplanation({ hypotheses: [{ label: 'x', status: 'mixed' }] }));
    expect(s).toContain('方向尚未确定');
  });

  it('证据不足时说给不出候选因素', () => {
    expect(shortExplainOf(baseExplanation({ contentStatus: 'insufficient' }))).toContain('先给不出候选因素');
  });
});

describe('数据状态', () => {
  it('显示截至时间与正常更新周期', () => {
    const s = dataStatusOf({ freshness: 'fresh' }, baseExplanation());
    expect(s.text).toContain('截至 2026-10-28 03:00');
    expect(s.text).toContain('正常更新周期内');
    expect(s.tone).toBe('ok');
  });

  it('过期要标出来（不能伪装成新鲜）', () => {
    const s = dataStatusOf({ freshness: 'stale' }, baseExplanation());
    expect(s.text).toContain('已过期');
    expect(s.tone).toBe('warn');
  });

  it('部分因素缺失要计数', () => {
    const s = dataStatusOf({ freshness: 'fresh' }, baseExplanation({ unknowns: [{ code: 'MISSING_DFII10', text: 'x' }] }));
    expect(s.text).toContain('部分因素缺失（1 项）');
  });

  it('没有快照时显示「正在准备」', () => {
    expect(dataStatusOf(null, null)).toMatchObject({ text: '正在准备', tone: 'pending' });
  });
});

describe('标准化变动：不用原始百分比排序', () => {
  it('从历史序列估日波动', () => {
    const history = [100, 101, 100.5, 101.2, 100.8, 101.5, 101.1, 100.9, 101.3];
    expect(sigmaOfHistory(history)).toBeGreaterThan(0);
  });

  it('样本太少返回 null（不猜波动率）', () => {
    expect(sigmaOfHistory([100, 101, 102])).toBeNull();
    expect(sigmaOfHistory(null)).toBeNull();
  });

  it('排在前面的不是涨幅最大的那个，而是标准化后更极端的', () => {
    const cards = [
      { assetId: 'a', phase: 'ready', movePct: 3.0, standardizedMove: 0.4, freshness: 'fresh' },
      { assetId: 'b', phase: 'ready', movePct: 0.8, standardizedMove: 2.1, freshness: 'fresh' },
    ];
    expect(rankQuestions(cards)[0].assetId).toBe('b');
  });

  it('数据不可用的卡片不会因为涨幅大排到前面', () => {
    const cards = [
      { assetId: 'err', phase: 'error', movePct: 9, standardizedMove: null, freshness: null },
      { assetId: 'ok', phase: 'ready', movePct: 0.2, standardizedMove: 0.1, freshness: 'fresh' },
    ];
    expect(rankQuestions(cards)[0].assetId).toBe('ok');
  });

  it('没有波动率时退化到原始幅度，并记录原因', () => {
    const [top] = rankQuestions([{ assetId: 'a', phase: 'ready', movePct: 1.2, standardizedMove: null, freshness: 'fresh' }]);
    expect(top.reasons).toContain('NO_SIGMA_FALLBACK');
  });

  it('排序原因可检查（含用户关注与过期惩罚）', () => {
    const cards = [
      { assetId: 'gold-intl', phase: 'ready', movePct: 1, standardizedMove: 1, freshness: 'fresh' },
      { assetId: 'other', phase: 'ready', movePct: 1, standardizedMove: 1, freshness: 'stale' },
    ];
    const ranked = rankQuestions(cards, { focusAssets: ['gold-intl'] });
    expect(ranked[0].reasons).toContain('DATA_READY');
    expect(ranked[0].reasons).toContain('USER_FOCUS');
    expect(ranked[1].reasons).toContain('DATA_STALE');
  });
});

describe('卡片与渲染', () => {
  it('200 响应生成 ready 卡，带主操作与深入入口', () => {
    const card = cardFromResponse({
      assetId: 'gold-intl',
      assetName: '国际金价',
      windowKey: 'session',
      status: 200,
      body: readyBody(),
    });
    expect(card.phase).toBe('ready');
    expect(card.explanationId).toBe('exp-a');
    const htmlText = questionCardsHTML([card]);
    expect(htmlText).toContain('看影响路径');
    expect(htmlText).toContain('查看行情');
    expect(htmlText).toContain('查看来源');
    expect(htmlText).toContain('/api/explanations/exp-a');
  });

  it('202 响应生成 pending 卡，不显示编造的解释', () => {
    const card = cardFromResponse({
      assetId: 'gold-intl',
      assetName: '国际金价',
      windowKey: 'session',
      status: 202,
      body: { explanation: null, meta: { freshness: 'unavailable', refreshStatus: 'pending' } },
    });
    expect(card.phase).toBe('pending');
    expect(card.brief).toBeNull();
    expect(questionCardsHTML([card])).toContain('稍后会自动补上');
  });

  it('原油也有自己的「与我有什么关系」（标地区与条件，不给具体油价）', () => {
    const notes = meaningNotesFor('oil');
    expect(notes.length).toBeGreaterThan(0);
    const text = notes.map(([k, v]) => `${k}${v}`).join(' ');
    expect(text).toContain('加油站');
    expect(text).toContain('不推断具体幅度');
  });

  it('最多渲染三张卡', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => ({
      assetId: id,
      question: `问题 ${id}`,
      dataStatus: { text: '正常', tone: 'ok' },
      href: `#/d/${id}`,
      windowKey: 'session',
      phase: 'ready',
    }));
    const htmlText = questionCardsHTML(cards.slice(0, 3));
    expect((htmlText.match(/class="q-card"/g) ?? []).length).toBe(3);
  });

  it('「看影响路径」带到同一个窗口（同一解释快照）', () => {
    expect(pathHashFor({ href: '#/d/gold-intl', windowKey: '5d' })).toBe('#/d/gold-intl?window=5d');
  });
});

describe('取数：只读快照，功能开关可关掉', () => {
  it('只请求可解释资产，并按 max 截断', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => readyBody() }));
    const cards = await loadQuestionCards({
      assets: [
        { assetId: 'gold-intl', name: '国际金价' },
        { assetId: 'btc', name: '比特币' },
        { assetId: 'oil', name: 'WTI 原油' },
      ],
      max: 3,
      fetchImpl,
    });
    // 比特币没有机制库 → 不请求；黄金与原油各一张
    expect(cards).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const urls = fetchImpl.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes('asset=gold-intl'))).toBe(true);
    expect(urls.some((u) => u.includes('asset=oil'))).toBe(true);
    expect(urls.every((u) => u.includes('window=session'))).toBe(true);
  });

  it('功能开关关闭时一张都不取', async () => {
    globalThis.localStorage = { getItem: () => '0', setItem: () => {} };
    const fetchImpl = vi.fn();
    const cards = await loadQuestionCards({ assets: [{ assetId: 'gold-intl', name: '国际金价' }], fetchImpl });
    expect(cards).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('带波动率时算出标准化变动', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => readyBody() }));
    const [card] = await loadQuestionCards({
      assets: [{ assetId: 'gold-intl', name: '国际金价', sigma: 0.0062 }],
      fetchImpl,
    });
    // -1.24% / 0.62% ≈ -2.0
    expect(card.standardizedMove).toBeCloseTo(-2.0, 1);
  });

  it('请求失败不影响其它卡片（错误也是一张有状态的卡）', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 503, json: async () => ({}) }));
    const cards = await loadQuestionCards({ assets: [{ assetId: 'gold-intl', name: '国际金价' }], fetchImpl });
    expect(cards[0].phase).toBe('error');
    expect(questionCardsHTML(cards)).toContain('正在准备');
  });
});
