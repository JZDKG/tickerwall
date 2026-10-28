/* ================================================================== *
 * 解释快照的共享注册表（方案 E07 / §8）
 *
 * 四个视图必须看到同一个 explanationId。这条约束以前靠「各自都去请求一次、
 * 碰巧拿到同一份」实现，慢响应一来就分叉。
 * ================================================================== */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  allExplanations,
  currentExplanation,
  currentExplanationId,
  isNewer,
  keyOf,
  publishExplanation,
  resetExplainStore,
  subscribeExplanation,
} from '../src/client/shared/explanation-store.js';

const envelope = (id, generatedAt = '2026-10-28T10:00:00.000Z') => ({
  schemaVersion: 1,
  explanation: { id, assetId: 'gold-intl', generatedAt, summary: 'x', contentStatus: 'ready', facts: [], hypotheses: [] },
  meta: { freshness: 'fresh' },
});

beforeEach(() => resetExplainStore());

describe('发布与读取', () => {
  it('发布后四个视图读到同一个 id', () => {
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_1') });
    expect(currentExplanationId('gold-intl')).toBe('exp_1');
    expect(currentExplanationId('gold-intl', 'session')).toBe('exp_1');
    // 不同窗口互不影响
    expect(currentExplanationId('gold-intl', '1w')).toBeNull();
  });

  it('同一份重复发布不重复广播（accepted=false）', () => {
    const first = publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_1') });
    const second = publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_1') });
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe('stale');
  });

  it('新版本覆盖旧版本', () => {
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_1', '2026-10-28T10:00:00.000Z') });
    const r = publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_2', '2026-10-28T11:00:00.000Z') });
    expect(r.accepted).toBe(true);
    expect(currentExplanationId('gold-intl')).toBe('exp_2');
  });

  it('旧快照晚到被丢弃（慢响应不许把界面退回去）', () => {
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_2', '2026-10-28T11:00:00.000Z') });
    const late = publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_1', '2026-10-28T10:00:00.000Z') });
    expect(late.accepted).toBe(false);
    expect(currentExplanationId('gold-intl')).toBe('exp_2');
  });

  it('没有 id 的载荷不入库（不产生一个「无名」快照）', () => {
    const r = publishExplanation({ assetId: 'gold-intl', envelope: { explanation: { assetId: 'gold-intl' } } });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('no-id');
    expect(currentExplanation('gold-intl')).toBeNull();
  });
});

describe('订阅', () => {
  it('订阅立即收到当前值，新版本再通知一次', () => {
    const seen = [];
    subscribeExplanation('gold-intl', 'session', (s) => seen.push(s?.explanationId ?? null));
    expect(seen).toEqual([null]);
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_1') });
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_2', '2026-10-28T12:00:00.000Z') });
    expect(seen).toEqual([null, 'exp_1', 'exp_2']);
  });

  it('取消订阅后不再收到', () => {
    const seen = [];
    const off = subscribeExplanation('gold-intl', 'session', (s) => seen.push(s?.explanationId ?? null));
    off();
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_1') });
    expect(seen).toEqual([null]);
  });

  it('快照是不可变引用：后续更新不会改掉视图手里的对象', () => {
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_1') });
    const held = currentExplanation('gold-intl');
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('exp_2', '2026-10-28T13:00:00.000Z') });
    expect(held.explanationId).toBe('exp_1');
  });

  it('订阅不同窗口互不干扰', () => {
    const a = [];
    const b = [];
    subscribeExplanation('gold-intl', 'session', (s) => a.push(s?.explanationId ?? null));
    subscribeExplanation('gold-intl', '1w', (s) => b.push(s?.explanationId ?? null));
    publishExplanation({ assetId: 'gold-intl', windowKey: '1w', envelope: envelope('exp_w') });
    expect(a).toEqual([null]);
    expect(b).toEqual([null, 'exp_w']);
  });
});

describe('新旧判断', () => {
  it('有 generatedAt 时按时间比较', () => {
    expect(isNewer({ explanationId: 'b', generatedAt: '2026-10-28T12:00:00Z' }, { explanationId: 'a', generatedAt: '2026-10-28T11:00:00Z' })).toBe(true);
    expect(isNewer({ explanationId: 'a', generatedAt: '2026-10-28T10:00:00Z' }, { explanationId: 'b', generatedAt: '2026-10-28T11:00:00Z' })).toBe(false);
  });

  it('时间缺失时宁可刷新（不同 id 视为新版本）', () => {
    expect(isNewer({ explanationId: 'x', generatedAt: null }, { explanationId: 'y', generatedAt: null })).toBe(true);
  });

  it('没有既有值时一律接受', () => {
    expect(isNewer({ explanationId: 'x' }, null)).toBe(true);
  });
});

describe('辅助', () => {
  it('keyOf 把资产与窗口拼成稳定键', () => {
    expect(keyOf('gold-intl')).toBe('gold-intl@session');
    expect(keyOf('oil', '1w')).toBe('oil@1w');
  });

  it('allExplanations 列出全部快照（诊断用）', () => {
    publishExplanation({ assetId: 'gold-intl', envelope: envelope('e1') });
    publishExplanation({ assetId: 'oil', envelope: { explanation: { id: 'e2', assetId: 'oil', generatedAt: '2026-10-28T10:00:00Z' } } });
    expect(allExplanations()).toHaveLength(2);
  });
});

describe('边角分支', () => {
  it('assetId 缺失时不写脏键（键为 @session，调用方本来就不该这么发）', () => {
    // 记录行为而不是假装它能用：没有 assetId 的快照对界面没有意义
    const r = publishExplanation({ envelope: { explanation: { id: 'x', generatedAt: '2026-10-28T10:00:00Z' } } });
    expect(r.accepted).toBe(true);
    expect(currentExplanationId(undefined)).toBe('x');
  });

  it('generatedAt 缺失但 id 不同 → 视为新版本（宁可刷新也不卡住）', () => {
    publishExplanation({ assetId: 'oil', envelope: { explanation: { id: 'a' } } });
    const r = publishExplanation({ assetId: 'oil', envelope: { explanation: { id: 'b' } } });
    expect(r.accepted).toBe(true);
    expect(currentExplanationId('oil')).toBe('b');
  });

  it('meta.generatedAt 可以作为兜底时间', () => {
    publishExplanation({ assetId: 'dxy', envelope: { explanation: { id: 'm1' }, meta: { generatedAt: '2026-10-28T09:00:00Z' } } });
    expect(currentExplanation('dxy').generatedAt).toBe('2026-10-28T09:00:00Z');
  });
});
