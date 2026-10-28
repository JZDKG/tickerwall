/* ================================================================== *
 * 图谱消费同一份解释快照（B5 完成标准）
 *
 * 「首页结论、详情和图谱的窗口、版本与因素一致」不能只靠肉眼：
 * 这里钉住三件事 ——
 *   1. 边 → 渠道的映射只覆盖方向性机制；
 *   2. 相关状态与机制状态并列，互不覆盖，不一致时说明原因；
 *   3. 取不到解释时明确说「还没生成」，不猜测。
 * ================================================================== */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EDGE_MECHANISM,
  factorIndex,
  edgeExplanationOf,
  graphExplanationBlock,
  loadGraphExplanation,
  clearGraphExplanationCache,
} from '../src/client/views/explanations/graph.js';
import { edgeExplainRow } from '../src/client/views/macro/panels.js';
import { CORE_EDGES } from '../src/client/views/macro/knowledge-base.js';

const EXP = {
  id: 'exp_gold-intl_session_abc',
  assetId: 'gold-intl',
  summary: '国际金价本窗口下降 1.00%。当前观测与「实际收益率」方向一致，但这只是一致性。',
  hypotheses: [
    { mechanismId: 'M-GOLD-REAL-YIELD', relationType: 'mechanism', label: '实际收益率', status: 'consistent', reasons: ['SIGN_MATCH'], evidence: [{}, {}] },
    { mechanismId: 'M-GOLD-NOMINAL-RATE', relationType: 'mechanism', label: '名义利率', status: 'untested', reasons: ['NO_MATERIAL_DRIVER_CHANGE'], evidence: [] },
    { mechanismId: 'M-GOLD-CN-CONVERSION', relationType: 'valuation-conversion', label: '内外盘折算', status: 'consistent', reasons: [], evidence: [] },
  ],
};

beforeEach(() => clearGraphExplanationCache());

describe('边 → 渠道映射', () => {
  it('只映射方向性机制，计价换算与相关边不映射', () => {
    const mapped = Object.keys(EDGE_MECHANISM);
    expect(mapped).toContain('E01');
    expect(mapped).toContain('E05');
    // E16 国际金→沪金、E17 权重重叠、E18 WTI→布伦特 都不是方向性机制
    expect(mapped).not.toContain('E16');
    expect(mapped).not.toContain('E17');
    expect(mapped).not.toContain('E18');
    // 映射到的边必须真实存在（拼错 id 会静默失效）
    const ids = new Set(CORE_EDGES.map((e) => e.id));
    for (const edgeId of mapped) expect(ids.has(edgeId), edgeId).toBe(true);
  });
});

describe('相关状态与机制状态并列', () => {
  it('相关背离 + 机制尚未确认 → 不矛盾，给出解释原因', () => {
    const info = edgeExplanationOf('E05', EXP, { status: 'diverged' });
    expect(info.available).toBe(true);
    expect(info.status).toBe('untested');
    expect(info.coincide).toBe(false);
    expect(info.note).toContain('不矛盾');
  });

  it('相关背离 + 机制不支持 → 一致（都指向机制这次没兑现）', () => {
    const exp = { ...EXP, hypotheses: [{ mechanismId: 'M-GOLD-NOMINAL-RATE', relationType: 'mechanism', label: '名义利率', status: 'not_supported', reasons: [] }] };
    const info = edgeExplanationOf('E05', exp, { status: 'diverged' });
    expect(info.coincide).toBe(true);
    expect(info.note).toBeNull();
  });

  it('相关一致 + 机制一致 → coincide true', () => {
    const info = edgeExplanationOf('E01', { ...EXP, hypotheses: [{ mechanismId: 'M-GOLD-USD', relationType: 'mechanism', label: '美元计价', status: 'consistent', reasons: [] }] }, { status: 'aligned' });
    expect(info.coincide).toBe(true);
  });

  it('解释里没有这条渠道 → available false 且说明原因', () => {
    const info = edgeExplanationOf('E08', EXP, { status: 'neutral' });
    expect(info.available).toBe(false);
    expect(info.note).toContain('没有这条渠道');
  });

  it('没有映射的边 → 说明它不是方向性机制', () => {
    const info = edgeExplanationOf('E17', EXP, null);
    expect(info.available).toBe(false);
    expect(info.note).toContain('不是方向性机制');
  });

  it('factorIndex 只按 mechanismId 建索引，不按标签猜', () => {
    const idx = factorIndex(EXP);
    expect(idx.get('M-GOLD-REAL-YIELD').status).toBe('consistent');
    expect(idx.get('实际收益率')).toBeUndefined();
  });
});

describe('渲染：机理卡的解释状态行', () => {
  it('有解释时显示状态徽章与原因说明', () => {
    const html = edgeExplainRow({ id: 'E05' }, { status: 'diverged' }, EXP);
    expect(html).toContain('解释状态');
    expect(html).toContain('尚未确认');
    expect(html).toContain('不矛盾');
  });

  it('没有解释时不渲染这一行（不显示空壳）', () => {
    expect(edgeExplainRow({ id: 'E05' }, { status: 'diverged' }, null)).toBe('');
  });

  it('焦点卡的解释块带窗口、版本与详情页链接', () => {
    const html = graphExplanationBlock(EXP, { assetId: 'gold-intl', windowKey: 'session' });
    expect(html).toContain('当前观测与「实际收益率」方向一致');
    expect(html).toContain('exp_gold-intl_session_abc');
    expect(html).toContain('#/d/gold-intl');
    expect(html).toContain('尚未确认');
  });

  it('取不到解释时明说，不编内容', () => {
    const html = graphExplanationBlock(null, { assetId: 'gold-intl' });
    expect(html).toContain('还没生成');
    expect(html).not.toContain('一致');
  });
});

describe('取数：与详情页同一接口', () => {
  it('请求 /api/explanations 并缓存 60 秒', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ explanation: EXP, meta: {} }) }));
    const a = await loadGraphExplanation('gold-intl', { fetchImpl });
    expect(a.id).toBe(EXP.id);
    const b = await loadGraphExplanation('gold-intl', { fetchImpl });
    expect(b.id).toBe(EXP.id);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('asset=gold-intl');
    expect(fetchImpl.mock.calls[0][0]).toContain('window=session');
  });

  it('未开放资产不发请求', async () => {
    const fetchImpl = vi.fn();
    expect(await loadGraphExplanation('dxy', { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('失败时返回 null（图退回只显示统计相关）', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 503, json: async () => ({}) }));
    expect(await loadGraphExplanation('oil', { fetchImpl })).toBeNull();
  });
});
