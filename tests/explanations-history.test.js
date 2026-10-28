/* ================================================================== *
 * 历史回放（C3）
 *
 * 回放不是「用今天的规则重算一遍」，而是把当时那份快照原样取出来。
 * 这里钉住四条：
 *   · 只有一版时不显示「此前的解释」；
 *   · 回放横幅必须说明「不是当前状态」，并给出回到当前的入口；
 *   · 回放时摘掉新鲜度判定（用今天的时钟说历史版本过期没有意义）；
 *   · 取失败不把当前视图搞坏。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import {
  shortStamp,
  loadExplanationHistory,
  loadExplanationVersion,
  historyListHTML,
  replayBannerHTML,
} from '../src/client/views/explanations/history.js';
import {
  createExplainState,
  renderExplainCard,
  refreshHistory,
  viewVersion,
  backToCurrent,
} from '../src/client/views/explanations/state.js';

const EXP = {
  id: 'exp_gold-intl_session_new',
  assetId: 'gold-intl',
  asOf: '2026-10-28T03:00:00Z',
  generatedAt: '2026-10-28T03:00:00Z',
  contentStatus: 'ready',
  summary: '国际金价本窗口下降 1.00%。',
  facts: [],
  hypotheses: [
    {
      mechanismId: 'M-GOLD-REAL-YIELD',
      relationType: 'mechanism',
      label: '实际收益率',
      status: 'consistent',
      statusLabel: '观测一致',
      plain: '实际收益率：扣掉预期通胀的债券回报。',
      mechanism: '机会成本渠道。',
      conditionCodes: [],
      exclusions: [],
      sources: [],
      evidence: [],
    },
  ],
  unknowns: [],
  nextChecks: [],
  versions: { mechanisms: 'gold-v3', calculation: 'calc-v2', language: 'template-v1' },
};

const OLD = { ...EXP, id: 'exp_gold-intl_session_old', asOf: '2026-10-27T03:00:00Z', generatedAt: '2026-10-27T03:00:00Z', summary: '旧版本摘要。' };

const ITEMS = [
  { id: EXP.id, asOf: EXP.asOf, contentStatus: 'ready', versions: { mechanisms: 'gold-v3' } },
  { id: OLD.id, asOf: OLD.asOf, contentStatus: 'insufficient', versions: { mechanisms: 'gold-v2' } },
];

describe('版本列表', () => {
  it('只有一版时不渲染（那时没有「此前」）', () => {
    expect(historyListHTML({ items: [ITEMS[0]], currentId: ITEMS[0].id })).toBe('');
    expect(historyListHTML({ items: [] })).toBe('');
  });

  it('多版时列出时间、状态与机制版本，并标出当前', () => {
    const html = historyListHTML({ items: ITEMS, currentId: EXP.id });
    expect(html).toContain('此前的解释（2 版）');
    expect(html).toContain('内容已生成');
    expect(html).toContain('证据不足');
    expect(html).toContain('gold-v2');
    expect(html).toContain('当前');
    expect(html).toContain(`data-explain-version="${OLD.id}"`);
  });

  it('说明「不会用今天的规则重算」', () => {
    expect(historyListHTML({ items: ITEMS, currentId: EXP.id })).toContain('不会用今天的规则重算');
  });

  it('时间戳格式稳定，无法解析时给破折号', () => {
    expect(shortStamp('2026-10-28T03:00:00Z')).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(shortStamp(null)).toBe('—');
    expect(shortStamp('not-a-date')).toBe('—');
  });
});

describe('回放横幅', () => {
  it('明确写「历史版本…不是当前状态」，并给回到当前', () => {
    const html = replayBannerHTML({ ...OLD, versions: { mechanisms: 'gold-v2' } });
    expect(html).toContain('历史版本');
    expect(html).toContain('不是当前状态');
    expect(html).toContain('gold-v2');
    expect(html).toContain('data-explain-current="1"');
  });

  it('没有版本 id 时什么都不渲染', () => {
    expect(replayBannerHTML(null)).toBe('');
    expect(replayBannerHTML({})).toBe('');
  });
});

describe('取数', () => {
  it('历史列表走 /api/explanations/history 并带 asset/window', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ items: ITEMS }) }));
    const { status, items } = await loadExplanationHistory({ assetId: 'gold-intl', windowKey: '5d', fetchImpl });
    expect(status).toBe(200);
    expect(items).toHaveLength(2);
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain('/api/explanations/history');
    expect(url).toContain('asset=gold-intl');
    expect(url).toContain('window=5d');
  });

  it('单版取数走 /api/explanations/:id，不做缓存', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ explanation: OLD }) }));
    const { status, body } = await loadExplanationVersion(OLD.id, { fetchImpl });
    expect(status).toBe(200);
    expect(body.explanation.id).toBe(OLD.id);
    expect(fetchImpl.mock.calls[0][1]?.cache).toBe('no-store');
  });

  it('列表取失败时返回空列表，不抛错', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom');
    });
    expect((await loadExplanationHistory({ assetId: 'gold-intl', fetchImpl })).items).toEqual([]);
  });
});

describe('状态机', () => {
  it('回放时用当时那份快照渲染，并摘掉新鲜度判定', () => {
    const state = {
      ...createExplainState('gold-intl'),
      phase: 'ready',
      explanation: EXP,
      meta: { freshness: 'stale', freshnessReasons: ['SOURCE_UNAVAILABLE'], backgroundStale: ['oil'] },
      replay: { id: OLD.id, explanation: OLD, asOf: OLD.asOf, versions: OLD.versions },
    };
    const html = renderExplainCard(state, { assetName: '国际金价' });
    expect(html).toContain('历史版本');
    expect(html).toContain('旧版本摘要。');
    // 历史版本不再报「已过期」——那是用今天的时钟量过去
    expect(html).not.toContain('数据已过期');
    expect(html).not.toContain('背景指标过期');
  });

  it('回到当前后横幅消失、回到最新摘要', () => {
    const base = { ...createExplainState('gold-intl'), phase: 'ready', explanation: EXP, meta: { freshness: 'fresh' } };
    const replayed = { ...base, replay: { id: OLD.id, explanation: OLD } };
    const html = renderExplainCard(backToCurrent(replayed), { assetName: '国际金价' });
    expect(html).not.toContain('历史版本');
    expect(html).toContain('国际金价本窗口下降 1.00%');
  });

  it('切版本后保留用户展开的机制', async () => {
    const state = {
      ...createExplainState('gold-intl'),
      phase: 'ready',
      explanation: EXP,
      meta: { freshness: 'fresh' },
      openFactors: new Set(['M-GOLD-REAL-YIELD']),
    };
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ explanation: OLD }) }));
    const next = await viewVersion(state, OLD.id, { fetchImpl });
    expect(next.replay.id).toBe(OLD.id);
    expect(next.openFactors).toEqual(new Set(['M-GOLD-REAL-YIELD']));
  });

  it('版本取不到时保留当前视图并给出错误文案', async () => {
    const state = { ...createExplainState('gold-intl'), phase: 'ready', explanation: EXP };
    const fetchImpl = vi.fn(async () => ({ status: 404, json: async () => ({ ok: false, error: '这个解释版本已不存在' }) }));
    const next = await viewVersion(state, 'gone', { fetchImpl });
    // 状态里 replay 字段初始为 null；失败时不能被写成「正在回放」
    expect(next.replay).toBeFalsy();
    expect(next.error).toContain('不存在');
    // 当前解释仍在，用户不会因此丢掉已读内容
    expect(next.explanation.id).toBe(EXP.id);
  });

  it('refreshHistory 失败时清空列表但不改状态其它字段', async () => {
    const state = { ...createExplainState('gold-intl'), history: ITEMS, phase: 'ready' };
    const fetchImpl = vi.fn(async () => ({ status: 503, json: async () => ({}) }));
    const next = await refreshHistory(state, { fetchImpl });
    expect(next.history).toEqual([]);
    expect(next.historyStatus).toBe('failed');
    expect(next.phase).toBe('ready');
  });
});

/* ================================================================== *
 * 分支补齐：取单版快照的三条失败路径
 * ================================================================== */
describe('loadExplanationVersion 的容错', () => {
  it('没有 fetch 的环境给 503', async () => {
    const r = await loadExplanationVersion('exp_1', { fetchImpl: null });
    expect(r.status).toBe(503);
  });

  it('响应不是 JSON 时 body 为空对象（不抛）', async () => {
    const r = await loadExplanationVersion('exp_1', {
      fetchImpl: async () => ({
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      }),
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({});
  });

  it('fetch 抛错时给 503 与可读原因', async () => {
    const r = await loadExplanationVersion('exp_1', {
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    expect(r.status).toBe(503);
    expect(r.body.error).toContain('offline');
  });

  it('版本号里有特殊字符时被编码（不能拼出坏 URL）', async () => {
    let seen = null;
    await loadExplanationVersion('exp/1?a=b', {
      fetchImpl: async (url) => {
        seen = String(url);
        return { status: 200, json: async () => ({}) };
      },
    });
    expect(seen).toContain('exp%2F1%3Fa%3Db');
  });
});

/* ================================================================== *
 * 分支补齐：回放横幅与历史列表的边界
 * ================================================================== */
describe('replayBannerHTML / historyListHTML 的边界', () => {
  it('横幅在没有水位信息时不写一个空括号', () => {
    const html = String(replayBannerHTML({ id: 'exp_1', versions: {} }));
    expect(html).not.toContain('（）');
    expect(html).not.toContain('机制 ）');
  });

  it('横幅带机制版本时写出来（哪一版口径产的，用户要能看见）', () => {
    const html = String(replayBannerHTML({ id: 'exp_1', versions: { mechanisms: 'gold-v3' } }));
    expect(html).toContain('gold-v3');
  });

  it('历史列表只有一版时整块不渲染（一个版本没有「此前」）', () => {
    expect(String(historyListHTML({ items: [{ id: 'a' }] }))).toBe('');
    expect(String(historyListHTML({ items: [] }))).toBe('');
    expect(String(historyListHTML({}))).toBe('');
  });

  it('历史列表跳过没有 id 的脏数据（不让一个坏条目毁掉整块）', () => {
    const html = String(historyListHTML({ items: [{ id: 'a' }, { id: 'b' }, { nope: 1 }] }));
    expect(html).toContain('a');
    expect(html).toContain('b');
  });

  it('没有 contentStatus 的条目显示破折号', () => {
    const html = String(historyListHTML({ items: [{ id: 'a' }, { id: 'b', contentStatus: 'ready' }] }));
    expect(html).toContain('—');
  });
});
