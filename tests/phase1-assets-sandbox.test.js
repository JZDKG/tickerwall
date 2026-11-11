/* ================================================================== *
 * Phase 1 / P1-T4：10 品种解释扩面 + 沙盘全震源条件集
 *
 * 验收：
 *   · EXPLAINABLE_ASSETS 启用 10 个核心品种（原 4 + 新 6）；
 *   · 每个启用资产都有驱动集合与至少一条候选机制，且都能通过
 *     validateExplanationEnvelope 契约校验；
 *   · SHOCK_CONDITION_SETS 覆盖全部 6 个沙盘震源，且每个都有
 *     unknown / supply / demand 三态与激活/抑制边配置；
 *   · 问题卡不再写死 4 个品种，按 σ 显著性动态挑选前 4~6 个。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

import { EXPLAINABLE_ASSETS, explainableAsset, INSTRUMENT_DEFINITIONS } from '../src/server/domain/explanations/instruments.js';
import { mechanismsFor } from '../src/server/domain/explanations/mechanisms.js';
import { validateExplanationEnvelope } from '../src/server/contracts/index.js';
import { SHOCK_CONDITION_SETS, shockConditionSet, MACRO_TRANSMISSION_EDGES } from '../src/client/views/macro/knowledge-base.js';
import { EXPLAINABLE } from '../src/client/views/explanations/state.js';
import { selectQuestionAssets, sigmaOfHistory } from '../src/client/views/explanations/questions.js';

const CORE_IDS = [
  'gold-intl', 'oil', 'dxy', 'us10y',
  'sp500', 'ndx100', 'btc', 'sh000001', 'usdcny', 'gold-cn',
];

describe('10 个核心可解释资产', () => {
  it('EXPLAINABLE_ASSETS 恰好启用 10 个核心品种', () => {
    const enabled = EXPLAINABLE_ASSETS.filter((a) => a.enabled).map((a) => a.id);
    expect(enabled).toHaveLength(10);
    for (const id of CORE_IDS) expect(enabled, id).toContain(id);
  });

  it('每个启用资产都有 instrument 定义、驱动集合与候选机制', () => {
    const defined = new Set(INSTRUMENT_DEFINITIONS.map((d) => d.id));
    for (const a of EXPLAINABLE_ASSETS.filter((x) => x.enabled)) {
      expect(explainableAsset(a.id)).toBeTruthy();
      expect(a.instruments.length, a.id).toBeGreaterThan(1); // 自身 + 至少一个驱动
      expect(a.instruments[0], a.id).toBe(a.id);
      const drivers = a.instruments.slice(1);
      expect(drivers.length, a.id).toBeGreaterThan(0);
      for (const d of drivers) expect(defined.has(d), `${a.id} 的驱动 ${d} 没有 instrument 定义`).toBe(true);
      expect(mechanismsFor(a.id).length, `${a.id} 没有候选机制`).toBeGreaterThan(0);
    }
  });

  it('前端 EXPLAINABLE 与服务端启用清单一致（不再写死 4 个）', () => {
    expect([...EXPLAINABLE].sort()).toEqual(CORE_IDS.slice().sort());
  });

  it('10 个资产各自产出的最小解释外壳都通过契约校验', () => {
    for (const id of CORE_IDS) {
      const env = {
        schemaVersion: 1,
        explanation: {
          id: `exp_${id}`, assetId: id,
          summary: `${id} 本窗口变化。`,
          contentStatus: 'ready', facts: [], hypotheses: [],
        },
        meta: { freshness: 'fresh', contentStatus: 'ready', refreshStatus: 'idle' },
      };
      const r = validateExplanationEnvelope(env);
      expect(r.ok, `${id}: ${JSON.stringify(r.errors)}`).toBe(true);
    }
  });
});

describe('沙盘全震源条件集', () => {
  const SOURCES = ['oil', 'dxy', 'us10y', 'vix', 'copper', 'ndx100'];

  it('SHOCK_CONDITION_SETS 覆盖全部 6 个震源', () => {
    for (const id of SOURCES) expect(SHOCK_CONDITION_SETS[id], id).toBeTruthy();
    expect(Object.keys(SHOCK_CONDITION_SETS).sort()).toEqual(SOURCES.slice().sort());
  });

  it('每个震源都有 unknown / supply / demand 三态', () => {
    for (const id of SOURCES) {
      for (const key of ['unknown', 'supply', 'demand']) {
        expect(SHOCK_CONDITION_SETS[id][key], `${id}.${key}`).toBeTruthy();
      }
      expect(shockConditionSet(id, 'unknown').conditionKey).toBe('unknown');
      expect(shockConditionSet(id, 'supply').conditionKey).toBe('supply');
    }
  });

  it('supply / demand 都配置了激活边或抑制边，且边 id 真实存在', () => {
    const edgeIds = new Set(MACRO_TRANSMISSION_EDGES.map((e) => e.id));
    for (const id of SOURCES) {
      for (const key of ['supply', 'demand']) {
        const set = SHOCK_CONDITION_SETS[id][key];
        const enabled = set.enabled ?? [];
        const suppressed = Object.keys(set.suppressed ?? {});
        expect(enabled.length + suppressed.length, `${id}.${key} 是半成品`).toBeGreaterThan(0);
        for (const e of [...enabled, ...suppressed]) {
          expect(edgeIds.has(e), `${id}.${key} 引用了不存在的边 ${e}`).toBe(true);
        }
      }
    }
  });

  it('文案不含概率或先后顺序', () => {
    const text = JSON.stringify(SHOCK_CONDITION_SETS);
    expect(text).not.toMatch(/概率|大概率|随后|一周内|下周|%/);
  });
});

describe('问题卡按 σ 显著性动态选品种', () => {
  it('从核心池里挑波动最大的前 5 个（不再写死 4 个）', () => {
    const quotes = CORE_IDS.map((id, i) => ({
      id,
      name: id,
      history: Array.from({ length: 12 }, (_, k) => ({ t: k, p: 100 + (i + 1) * Math.sin(k) })),
    }));
    const picked = selectQuestionAssets(quotes, { max: 5 });
    expect(picked).toHaveLength(5);
    // σ 最大的 5 个（i = 9..5）应被选中，且按 σ 降序
    expect(picked.map((x) => x.assetId)).toEqual(['gold-cn', 'usdcny', 'sh000001', 'btc', 'ndx100']);
    expect(picked[0].sigma).toBeGreaterThan(picked[4].sigma);
  });

  it('没有历史的品种不进候选；一个都没有时给一个可解释的兜底资产', () => {
    const one = selectQuestionAssets([{ id: 'sp500', name: '标普500' }], { max: 5 });
    // 没有任何带 σ 的候选 → 兜底，不空手请求
    expect(one.length).toBeGreaterThan(0);
    expect(CORE_IDS).toContain(one[0].assetId);
    const none = selectQuestionAssets([], { max: 5 });
    expect(none.length).toBeGreaterThan(0);
    expect(CORE_IDS).toContain(none[0].assetId);
  });

  it('非可解释品种不进入候选（只给可解释池的兜底）', () => {
    const picked = selectQuestionAssets([
      { id: 'vix', name: 'VIX', history: Array.from({ length: 12 }, (_, k) => ({ t: k, p: 20 + 5 * Math.sin(k) })) },
    ], { max: 5 });
    expect(picked.map((x) => x.assetId)).not.toContain('vix');
    expect(CORE_IDS).toContain(picked[0].assetId);
  });
});

describe('冷启动：intraday 历史点数不足时仍凑够候选（B4 回归）', () => {
  // 真实 /api/quotes 的冷启动形态：history 只有 1~3 个盘中点，
  // sigmaOfHistory 要求 >= 8 个点 → 绝大多数品种拿不到 σ。
  const sparse = (id, changePct) => ({ id, name: id, changePct, history: [{ t: 1, p: 100 }, { t: 2, p: 100.5 }] });
  const fullHistory = Array.from({ length: 12 }, (_, k) => ({ t: k, p: 100 + 3 * Math.sin(k) }));

  it('σ 有效候选不足 target 时，用其它可解释品种按 |changePct| 补齐到 target', () => {
    const quotes = [
      { id: 'gold-intl', name: '国际金价', changePct: 0.11, history: fullHistory },
      sparse('oil', 2.5), sparse('dxy', -1.8), sparse('btc', 1.2),
      sparse('sp500', 0.4), sparse('us10y', -0.2), sparse('ndx100', 0.9),
    ];
    const picked = selectQuestionAssets(quotes, { max: 5 });
    expect(picked.length).toBe(5);
    // 1 个 valid-σ 在前，其余按 |changePct| 降序：oil > dxy > btc > ndx100
    expect(picked.map((x) => x.assetId)).toEqual(['gold-intl', 'oil', 'dxy', 'btc', 'ndx100']);
    expect(picked[0].sigma).toBeGreaterThan(0);
    for (const p of picked.slice(1)) expect(p.sigma).toBeNull();
    // 不重复
    expect(new Set(picked.map((x) => x.assetId)).size).toBe(picked.length);
  });

  it('报价里可解释品种仍少于 4 个时，用默认核心清单补足到 4（且不去重、仍可解释）', () => {
    const picked = selectQuestionAssets([sparse('btc', 5.1)], { max: 5 });
    expect(picked).toHaveLength(4);
    expect(picked[0].assetId).toBe('btc');
    const ids = picked.map((x) => x.assetId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(CORE_IDS).toContain(id);
    // 只补到 4 个：默认清单按序取前 3 个即可，不越过 4 上限
    expect(ids).toEqual(['btc', 'gold-intl', 'dxy', 'gold-cn']);
    for (const p of picked) expect(p.sigma).toBeNull();
  });

  it('完全空报价也补齐到至少 4 个（问题区不会只剩 1 张卡）', () => {
    const picked = selectQuestionAssets([], { max: 5 });
    expect(picked.length).toBeGreaterThanOrEqual(4);
    const ids = picked.map((x) => x.assetId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(CORE_IDS).toContain(id);
  });

  it('valid-σ 候选已够 target 时不追加补齐项，也不改主排序', () => {
    const quotes = CORE_IDS.map((id, i) => ({
      id, name: id, changePct: 9.9,
      history: Array.from({ length: 12 }, (_, k) => ({ t: k, p: 100 + (i + 1) * Math.sin(k) })),
    }));
    const picked = selectQuestionAssets(quotes, { max: 5 });
    expect(picked).toHaveLength(5);
    expect(picked.map((x) => x.assetId)).toEqual(['gold-cn', 'usdcny', 'sh000001', 'btc', 'ndx100']);
    expect(picked.every((x) => x.sigma > 0)).toBe(true);
  });
});
