/* ================================================================== *
 * 冲击类型分类（供给 / 需求 / 无法判定）
 *
 * 这两类渠道是「条件化解释」的核心：同一涨价，原因不同，后续影响不同。
 * 但分类只能保守 —— 判不出来必须返回 null，而不是挑一个更像的故事。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { classifyShockType, toEventEvidence, SUPPLY_TOKENS, DEMAND_TOKENS, ASSET_TOKENS } from '../src/server/domain/events/shock.js';

describe('规则本身', () => {
  it('供给类词必须指向产量或运输的数量约束', () => {
    expect(SUPPLY_TOKENS).toContain('减产');
    expect(SUPPLY_TOKENS).toContain('停产');
    expect(SUPPLY_TOKENS).toContain('航道');
    // 「涨价」这类价格词不能当供给证据
    expect(SUPPLY_TOKENS).not.toContain('涨价');
    expect(SUPPLY_TOKENS).not.toContain('上涨');
  });

  it('需求类词必须指向消费或开工', () => {
    expect(DEMAND_TOKENS).toContain('开工率');
    expect(DEMAND_TOKENS).toContain('补库');
    expect(DEMAND_TOKENS).not.toContain('减产');
  });
});

describe('分类：判不出来就不判', () => {
  it('OPEC 减产 → supply', () => {
    expect(classifyShockType({ title: 'OPEC+ 宣布减产 100 万桶/日' }).shockType).toBe('supply');
  });

  it('炼厂开工回升、补库 → demand', () => {
    expect(classifyShockType({ title: '炼厂开工率回升，原油补库' }).shockType).toBe('demand');
  });

  it('两类同时出现 → null（这正是最需要人判断的情形）', () => {
    const r = classifyShockType({ title: 'OPEC 减产，但需求疲弱拖累油价' });
    expect(r.shockType).toBeNull();
    expect(r.reason).toBe('BOTH_SIDES_MENTIONED');
  });

  it('纯价格描述 → null（只知道涨价，不知道原因）', () => {
    const r = classifyShockType({ title: '国际油价上涨 2%' });
    expect(r.shockType).toBeNull();
    expect(r.reason).toBe('NO_SHOCK_TOKENS');
  });

  it('空输入不抛错', () => {
    expect(classifyShockType(null).shockType).toBeNull();
    expect(classifyShockType({}).shockType).toBeNull();
  });

  it('命中的词会被记下来（便于人工复核为什么这么判）', () => {
    const r = classifyShockType({ title: '红海航道受阻，油轮绕行' });
    expect(r.shockType).toBe('supply');
    expect(r.evidence).toContain('航道');
  });
});

describe('转成解释层的事件证据', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const span = { sinceMs: now - 7 * 86400000, nowMs: now };

  it('只保留窗口内、与品种相关、且能判出类型的条目', () => {
    const rows = [
      { id: 'a', title: 'OPEC+ 减产', publishedAt: '2026-10-27T10:00:00Z' },
      { id: 'b', title: '某国央行降息', publishedAt: '2026-10-27T10:00:00Z' }, // 与原油无关
      { id: 'c', title: '原油价格上涨 2%', publishedAt: '2026-10-27T10:00:00Z' }, // 判不出类型
      { id: 'd', title: 'OPEC+ 减产', publishedAt: '2026-09-01T10:00:00Z' }, // 窗口外
    ];
    const out = toEventEvidence(rows, { ...span, assetId: 'oil' });
    expect(out.map((e) => e.eventId)).toEqual(['a']);
    expect(out[0].shockType).toBe('supply');
  });

  it('资产相关性按词表过滤：讲到原油的减产才算原油供给冲击', () => {
    const rows = [
      { id: 'x', title: '智利铜矿罢工导致减产', publishedAt: '2026-10-27T10:00:00Z' },
      { id: 'y', title: '原油：利比亚油田停产', publishedAt: '2026-10-27T10:00:00Z' },
    ];
    expect(toEventEvidence(rows, { ...span, assetId: 'oil' }).map((e) => e.eventId)).toEqual(['y']);
  });

  it('每个资产都有相关性词表（新增品种不会静默变成空集）', () => {
    expect(Object.keys(ASSET_TOKENS)).toEqual(expect.arrayContaining(['oil', 'gold-intl', 'us10y', 'dxy']));
    for (const [id, words] of Object.entries(ASSET_TOKENS)) expect(words.length, id).toBeGreaterThan(2);
  });

  it('保留 revision：同一事件的后续修订不会被当成同一条', () => {
    const rows = [{ id: 'z', revision: 3, title: 'OPEC+ 减产', publishedAt: '2026-10-27T10:00:00Z' }];
    expect(toEventEvidence(rows, { ...span, assetId: 'oil' })[0].revision).toBe(3);
  });
});
