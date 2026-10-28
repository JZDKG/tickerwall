/* ================================================================== *
 * 解释卡渲染与交互状态（B4 验收）
 *
 * 覆盖方案 §3.7 的六种页面状态、§8.3 的三个交互约束，以及 §4.3 的
 * 内容边界：过期不能伪装新鲜、证据不足不能装成结论、乱序响应不能覆盖新选择。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  explanationCardHTML,
  EXPLAIN_WINDOWS,
  meaningNotesFor,
  fmtFactorChange,
  shortTime,
} from '../src/client/views/explanations/card.js';
import {
  createExplainState,
  applyResponse,
  switchWindow,
  toggleFactor,
  refreshExplain,
  renderExplainCard,
  isExplainable,
  bindExplainInteractions,
  fetchExplanation,
  explainEnabled,
  setExplainEnabled,
  EXPLAIN_FLAG_KEY,
} from '../src/client/views/explanations/state.js';

/* ------------------------------ 测试载荷 ------------------------------ */

const EXP = {
  id: 'exp-1',
  assetId: 'gold-intl',
  asOf: '2026-10-28T03:00:00Z',
  generatedAt: '2026-10-28T03:01:00Z',
  window: { key: 'session', start: '2026-10-27', end: '2026-10-28', alignment: 'common-dates' },
  contentStatus: 'ready',
  summary: '国际金价本窗口下降 1.00%。当前观测与「实际收益率」方向一致，但这只是一致性，不能确认就是原因。',
  facts: [
    {
      code: 'TARGET_CHANGE',
      instrumentId: 'gold-intl',
      label: '国际金价本窗口变化',
      window: { start: '2026-10-27', end: '2026-10-28' },
      change: { value: -1.0, unit: 'pct' },
    },
    {
      code: 'DRIVER_CHANGE',
      instrumentId: 'dfii10',
      label: '10Y 实际本窗口变化',
      window: { start: '2026-10-27', end: '2026-10-28' },
      change: { value: 14, unit: 'bp' },
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
      mechanism: '黄金不付利息，实际收益率上升会提高持有无息资产的机会成本。',
      conditionCodes: ['SAME_WINDOW', 'SIGNED_SERIES'],
      exclusions: ['只有名义收益率上涨、实际收益率没有同向变化'],
      horizon: 'days-to-weeks',
      sources: [{ title: '芝加哥联储研究', url: 'https://example.test/a' }],
      evidence: [
        {
          role: 'support',
          instrumentId: 'gold-intl',
          instrumentLabel: '黄金',
          window: { start: '2026-10-27', end: '2026-10-28' },
          change: { value: -1.0, unit: 'pct' },
          observationIds: ['gold-intl@2026-10-27', 'gold-intl@2026-10-28'],
        },
      ],
    },
    {
      mechanismId: 'M-GOLD-USD',
      relationType: 'mechanism',
      label: '美元计价',
      status: 'mixed',
      statusLabel: '有相反证据',
      sign: 1,
      plain: '计价效应',
      mechanism: '美元走强抬高非美买家的成本。',
      conditionCodes: [],
      exclusions: [],
      sources: [],
      evidence: [],
    },
    {
      mechanismId: 'M-GOLD-RISK',
      relationType: 'mechanism',
      label: '避险需求',
      status: 'untested',
      statusLabel: '尚未确认',
      sign: 1,
      plain: '避险需求',
      mechanism: '风险资产动荡时资金可能转向黄金。',
      conditionCodes: ['NEEDS_POSITION_EVIDENCE'],
      exclusions: [],
      sources: [],
      evidence: [],
    },
  ],
  unknowns: [{ code: 'NO_EVENT_EVIDENCE', text: '缺少可核实的事件证据。' }],
  nextChecks: ['等事件与发布时间补齐后，确认窗口内是否有可核实的供给或风险事件。'],
  versions: { mechanisms: 'gold-v1', calculation: 'calc-v1', language: 'template-v1' },
};

const DATA = { assetId: 'gold-intl', assetName: '国际金价', windowKey: 'session', phase: 'ready', explanation: EXP };

/* ------------------------------ 六种状态 ------------------------------ */

describe('六种页面状态都能渲染，没有白屏分支', () => {
  it('正在准备：有事实与准备状态说明，不是空白', () => {
    const htmlText = explanationCardHTML({ ...DATA, phase: 'loading' });
    expect(htmlText).toContain('正在整理解释');
    expect(htmlText).toContain('data-phase="loading"');
  });

  it('正在准备（202）：给出重试间隔', () => {
    const htmlText = explanationCardHTML({ ...DATA, phase: 'pending', explanation: null, retryAfterMs: 4000 });
    expect(htmlText).toContain('data-phase="pending"');
    expect(htmlText).toContain('4 秒后自动再试');
  });

  it('证据不足：只说数据不足，不编主因', () => {
    const htmlText = explanationCardHTML({
      ...DATA,
      explanation: { ...EXP, contentStatus: 'insufficient', summary: '当前数据不足以解释本次黄金变动。', facts: [], hypotheses: [] },
    });
    expect(htmlText).toContain('当前数据不足以解释');
    expect(htmlText).toContain('证据不足');
    expect(htmlText).not.toContain('就是因为');
  });

  it('证据冲突：显式并列支持与反向，不合成单一方向', () => {
    const htmlText = explanationCardHTML(DATA);
    expect(htmlText).toContain('支持与反向证据同时存在');
    expect(htmlText).toContain('有相反证据');
  });

  it('来源过期：保留原内容，同时标出过期与原因', () => {
    const htmlText = explanationCardHTML({
      ...DATA,
      meta: { freshness: 'stale', freshnessReasons: ['BEYOND_UPDATE_CYCLE'], refreshStatus: 'idle' },
    });
    expect(htmlText).toContain('数据已过期');
    // 标签短、原因具体，且「已过期」只出现一次（不重复声明同一件事）
    expect(htmlText).toContain('已超过该数据的正常更新周期');
    expect(htmlText.split('已过期').length - 1).toBe(1);
    // 快照内容仍在
    expect(htmlText).toContain('国际金价本窗口下降');
  });

  it('背景指标过期：单独提示，不影响「数据在正常更新周期内」的判断', () => {
    const htmlText = explanationCardHTML({
      ...DATA,
      meta: { freshness: 'fresh', freshnessReasons: [], refreshStatus: 'idle', backgroundStale: ['oil'] },
    });
    expect(htmlText).toContain('背景指标过期：oil');
    expect(htmlText).toContain('数据状态：数据在正常更新周期内');
  });

  it('获取失败：提供重试入口，提示行情不受影响', () => {
    const htmlText = explanationCardHTML({ ...DATA, phase: 'error', error: 'HTTP 503', explanation: null });
    expect(htmlText).toContain('data-phase="error"');
    expect(htmlText).toContain('重新获取解释');
    expect(htmlText).toContain('行情数据不受影响');
  });

  it('未开放资产：说明能力边界，不当作错误', () => {
    const htmlText = explanationCardHTML({ ...DATA, phase: 'unsupported', explanation: null });
    expect(htmlText).toContain('解释能力还没开放');
  });
});

/* ------------------------------ 三层阅读 ------------------------------ */

describe('三层阅读：默认只展开结论，依据要主动点开', () => {
  it('默认：摘要 + 最多三个候选渠道 + 一个关键未知，依据默认收起', () => {
    const htmlText = explanationCardHTML(DATA);
    expect(htmlText).toContain('explain-summary');
    // 三个候选渠道都在首层（consistent / mixed / not_supported 里取前 3）
    expect(htmlText).toContain('实际收益率');
    expect(htmlText).toContain('美元计价');
    expect(htmlText).toContain('还缺什么');
    // 依据区默认 hidden
    expect(htmlText).toContain('class="explain-factor-body" id="ef-0" hidden');
  });

  it('展开某条渠道时，依据与来源随之可见', () => {
    const htmlText = explanationCardHTML({ ...DATA, openFactors: new Set(['M-GOLD-REAL-YIELD']) });
    expect(htmlText).not.toContain('id="ef-0" hidden');
    expect(htmlText).toContain('适用条件');
    expect(htmlText).toContain('哪些情况会削弱它');
    expect(htmlText).toContain('https://example.test/a');
    expect(htmlText).toContain('观测窗口');
  });

  it('未通过检验的机制收进「其余机制」，不占首屏', () => {
    const htmlText = explanationCardHTML(DATA);
    expect(htmlText).toContain('其余');
    expect(htmlText).toContain('尚未确认');
  });

  it('「与我有什么关系」在解释之后，标明地区、条件与时间范围', () => {
    const htmlText = explanationCardHTML(DATA);
    const iMeaning = htmlText.indexOf('与我有什么关系');
    const iSummary = htmlText.indexOf('explain-summary');
    expect(iMeaning).toBeGreaterThan(iSummary);
    const notes = meaningNotesFor('gold-intl');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.map(([k]) => k).join(' ')).toContain('中国');
    expect(htmlText).toContain('不构成对下一交易日的价格预测');
  });

  it('声明不表示因果（每条状态都不能被读成已证实）', () => {
    const htmlText = explanationCardHTML(DATA);
    expect(htmlText).toContain('不表示因果已被证实');
    expect(htmlText).toContain('不代表因果被证实');
  });
});

/* ------------------------------ 交互与状态 ------------------------------ */

describe('请求序号：旧响应不能覆盖新选择', () => {
  const okBody = (id) => ({ schemaVersion: 1, explanation: { ...EXP, id }, meta: { freshness: 'fresh', freshnessReasons: [] } });

  it('慢响应回来时如果窗口已切换，结果被丢弃', async () => {
    let resolveSlow;
    const slow = new Promise((r) => {
      resolveSlow = r;
    });
    const fetchImpl = vi.fn((url) => {
      // 第一次（session）故意慢；第二次（5d）立刻返回
      if (url.includes('window=session')) return slow.then(() => ({ status: 200, json: async () => okBody('exp-session') }));
      return Promise.resolve({ status: 200, json: async () => okBody('exp-5d') });
    });

    const base = createExplainState('gold-intl');
    const sessionPromise = refreshExplain(base, { fetchImpl });
    // 用户立刻切到 5d
    const switched = switchWindow(base, '5d');
    const fiveDay = await refreshExplain(switched, { fetchImpl });
    expect(fiveDay.explanation.id).toBe('exp-5d');

    resolveSlow();
    const sessionResult = await sessionPromise;
    // 旧请求的 seq 更小；调用方据此丢弃它
    expect(sessionResult.seq).toBeLessThan(fiveDay.seq);
  });

  it('201/202 映射为 pending，并带重试间隔', () => {
    const st = applyResponse(createExplainState('gold-intl'), {
      status: 202,
      body: { explanation: null, meta: { freshness: 'unavailable', refreshStatus: 'pending', retryAfterMs: 5000 } },
    });
    expect(st.phase).toBe('pending');
    expect(st.retryAfterMs).toBe(5000);
  });

  it('400/404/503 分别映射为可读错误', () => {
    expect(applyResponse(createExplainState('gold-intl'), { status: 404, body: {} }).error).toContain('已不存在');
    expect(applyResponse(createExplainState('gold-intl'), { status: 503, body: {} }).error).toContain('暂时不可用');
    expect(applyResponse(createExplainState('gold-intl'), { status: 400, body: { error: '不支持的资产' } }).error).toContain('不支持的资产');
  });

  it('展开状态在窗口切换后保留（同一批机制继续可读）', () => {
    let st = createExplainState('gold-intl');
    st = toggleFactor(st, 'M-GOLD-REAL-YIELD');
    expect(st.openFactors.has('M-GOLD-REAL-YIELD')).toBe(true);
    st = switchWindow(st, '1m');
    expect(st.openFactors.has('M-GOLD-REAL-YIELD')).toBe(true);
    st = toggleFactor(st, 'M-GOLD-REAL-YIELD');
    expect(st.openFactors.has('M-GOLD-REAL-YIELD')).toBe(false);
  });

  it('未开放资产直接进 unsupported，不发请求', async () => {
    const fetchImpl = vi.fn();
    const st = createExplainState('btc');
    expect(st.phase).toBe('unsupported');
    const out = await refreshExplain(st, { fetchImpl });
    expect(out.phase).toBe('unsupported');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(isExplainable('gold-intl')).toBe(true);
    // C1 之后原油、美债 10 年期、美元指数都已开放；
    // 未登记机制库的资产（比特币、标普）仍然不在集合里
    for (const id of ['gold-intl', 'oil', 'us10y', 'dxy']) expect(isExplainable(id), id).toBe(true);
    for (const id of ['btc', 'sp500', 'copper']) expect(isExplainable(id), id).toBe(false);
  });
});

describe('功能开关：可关闭解释卡并保留旧行情路径', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };
  });

  it('默认开启；写 0 之后关闭', () => {
    expect(explainEnabled()).toBe(true);
    setExplainEnabled(false);
    expect(localStorage.getItem(EXPLAIN_FLAG_KEY)).toBe('0');
    expect(explainEnabled()).toBe(false);
  });

  it('隐私模式（localStorage 抛错）按开启处理', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(explainEnabled()).toBe(true);
    expect(() => setExplainEnabled(false)).not.toThrow();
  });
});

describe('渲染器：单位与时间格式化', () => {
  it('利率用 bp、价格用 %、无值用破折号', () => {
    expect(fmtFactorChange({ value: 14, unit: 'bp' })).toBe('+14.0bp');
    expect(fmtFactorChange({ value: -1, unit: 'pct' })).toBe('−1.00%');
    expect(fmtFactorChange(null)).toBe('—');
  });

  it('时间只显示到分钟', () => {
    expect(shortTime('2026-10-28T03:04:59Z')).toBe('2026-10-28 03:04');
    expect(shortTime(null)).toBe('—');
  });

  it('窗口按钮就是三个契约窗口，顺序稳定', () => {
    expect(EXPLAIN_WINDOWS.map(([k]) => k)).toEqual(['session', '5d', '1m']);
  });

  it('renderExplainCard 与 explanationCardHTML 输出一致', () => {
    const state = { ...createExplainState('gold-intl'), phase: 'ready', explanation: EXP, meta: { freshness: 'fresh' } };
    expect(renderExplainCard(state, { assetName: '国际金价' })).toBe(
      explanationCardHTML({ ...state, assetName: '国际金价' }),
    );
  });
});

/* ================================================================== *
 * 取数的三条容错路径
 * ================================================================== */
describe('fetchExplanation 的容错', () => {
  it('响应不是 JSON 时返回空 body（不抛）', async () => {
    const fetchImpl = async () => ({
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });
    const r = await fetchExplanation({ assetId: 'gold-intl', windowKey: 'session', fetchImpl });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({});
  });

  it('fetch 抛错时给 503 与可读原因', async () => {
    const fetchImpl = async () => {
      throw new Error('offline');
    };
    const r = await fetchExplanation({ assetId: 'gold-intl', windowKey: 'session', fetchImpl });
    expect(r.status).toBe(503);
    expect(r.body.error).toContain('offline');
  });

  it('没有 fetch 的环境给 503（不是静默失败）', async () => {
    const r = await fetchExplanation({ assetId: 'gold-intl', windowKey: 'session', fetchImpl: null });
    expect(r.status).toBe(503);
  });
});

/* ================================================================== *
 * 分支补齐：格式化与未知项的两种长度
 * ================================================================== */
describe('变化幅度格式化与未知项列表', () => {
  it('fmtFactorChange：bp / pct / 无单位各自的位数与符号', () => {
    // 直接测格式化函数：走到它需要的卡片结构在别的用例里，这里只钉格式契约
    expect(fmtFactorChange({ value: 12.345, unit: 'bp' })).toBe('+12.3bp');
    expect(fmtFactorChange({ value: -0.5, unit: 'pct' })).toBe('−0.50%');
    expect(fmtFactorChange({ value: 0, unit: 'pct' })).toBe('0.00%');
    expect(fmtFactorChange({ value: 3, unit: undefined })).toBe('+3.00');
  });

  it('fmtFactorChange：缺值给破折号（不是 NaN）', () => {
    expect(fmtFactorChange(null)).toBe('—');
    expect(fmtFactorChange({ value: NaN })).toBe('—');
    expect(fmtFactorChange({})).toBe('—');
  });

  it('未知项只有 1 条时不再单列第二组（1 条已经在上面写过）', () => {
    const html = String(renderExplainCard({
      ...createExplainState('gold-intl'),
      phase: 'ready',
      explanation: {
        id: 'e1', facts: [], hypotheses: [], nextChecks: [],
        unknowns: [{ text: '只有一条' }],
      },
    }, { assetName: '黄金' }));
    expect(html).not.toContain('explain-unknowns');
  });

  it('未知项 2 条以上时从第二条起单列（第一条已作为主结论出现）', () => {
    const html = String(renderExplainCard({
      ...createExplainState('gold-intl'),
      phase: 'ready',
      explanation: {
        id: 'e1', facts: [], hypotheses: [], nextChecks: [],
        unknowns: [{ text: '第一条' }, { text: '第二条' }],
      },
    }, { assetName: '黄金' }));
    expect(html).toContain('explain-unknowns');
    expect(html).toContain('第二条');
  });
});
