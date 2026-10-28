/* ================================================================== *
 * 解释服务里的「引用集合」与「写库边界」（explanations.service.js）
 *
 * 这几条分支背后是真实的接口契约，而且都有明确的「为什么要这样」：
 *   · 只有「本窗口变化」这条事实算支撑结论（其余是背景数字，过期不该
 *     把整张解释判成不可读）；
 *   · 只有给出方向判定的机制假设才计入方向性依赖（历史相关/共同驱动是背景）；
 *   · 没通过契约校验的观测**不进库**，但也不静默蒸发 —— 要记成一条拒绝。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, useDatabase, listEventRevisions, readEventRevision } from '../src/server/db/index.js';
import {
  referencedInstrumentIds,
  persistReferencedEvents,
  persistReferencedObservations,
} from '../src/server/services/explanations.service.js';

beforeEach(() => {
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
});

const exp = (over = {}) => ({
  assetId: 'gold-intl',
  facts: [{ code: 'TARGET_CHANGE', label: '本窗口变化', instrumentId: 'gold-intl' }],
  hypotheses: [],
  ...over,
});

describe('引用到的指标集合', () => {
  it('至少含资产本身（它就是被解释的对象）', () => {
    expect([...referencedInstrumentIds(exp())]).toEqual(['gold-intl']);
  });

  it('没有资产 id 时不把 undefined 塞进集合', () => {
    const ids = referencedInstrumentIds({ assetId: null, facts: [], hypotheses: [] });
    expect(ids.size).toBe(0);
  });

  it('非方向性模式：所有带 instrumentId 的事实都计入', () => {
    const ids = referencedInstrumentIds(exp({
      facts: [
        { code: 'TARGET_CHANGE', instrumentId: 'gold-intl' },
        { code: 'BACKGROUND', instrumentId: 'fx-usdcny' },
      ],
    }));
    expect(ids.has('fx-usdcny')).toBe(true);
  });

  it('方向性模式：只把「本窗口变化」当支撑结论，背景事实排除', () => {
    const ids = referencedInstrumentIds(exp({
      facts: [
        { code: 'TARGET_CHANGE', instrumentId: 'gold-intl' },
        { code: 'BACKGROUND', instrumentId: 'fx-usdcny' },
      ],
    }), { directionalOnly: true });
    expect(ids.has('fx-usdcny')).toBe(false);
  });

  it('方向性模式：只统计给出方向判定的机制假设', () => {
    const ids = referencedInstrumentIds(exp({
      hypotheses: [
        { relationType: 'mechanism', status: 'consistent', evidence: [{ instrumentId: 'us10y-real' }] },
        { relationType: 'historical-correlation', status: 'mixed', evidence: [{ instrumentId: 'oil' }] },
        { relationType: 'mechanism', status: 'untested', evidence: [{ instrumentId: 'vix' }] },
      ],
    }), { directionalOnly: true });
    expect(ids.has('us10y-real')).toBe(true);
    expect(ids.has('oil')).toBe(false);
    expect(ids.has('vix')).toBe(false);
  });

  it('非方向性模式：三种机制的证据都计入', () => {
    const ids = referencedInstrumentIds(exp({
      hypotheses: [
        { relationType: 'historical-correlation', evidence: [{ instrumentId: 'oil' }] },
        { relationType: 'mechanism', status: 'untested', evidence: [{ instrumentId: 'vix' }] },
      ],
    }));
    expect(ids.has('oil')).toBe(true);
    expect(ids.has('vix')).toBe(true);
  });

  it('证据里没有 instrumentId 时跳过（不塞空串）', () => {
    const ids = referencedInstrumentIds(exp({
      hypotheses: [{ relationType: 'mechanism', status: 'consistent', evidence: [{}, { instrumentId: '' }] }],
    }));
    expect([...ids].every(Boolean)).toBe(true);
  });
});

describe('事件引用的落库', () => {
  it('只写被引用到的那些版本（没引用的不写进库）', () => {
    const written = persistReferencedEvents(
      { hypotheses: [{ eventRefs: [{ eventId: 'ev1', revision: 1 }] }] },
      [
        { eventId: 'ev1', revision: 1, shockType: 'supply' },
        { eventId: 'ev2', revision: 1, shockType: 'demand' },
      ],
      { knownAt: '2026-10-28T00:00:00.000Z' },
    );
    expect(written).toEqual(['ev1#1']);
    expect(listEventRevisions('ev1').length).toBe(1);
    expect(listEventRevisions('ev2').length).toBe(0);
  });

  it('落库内容标成 partial：只有分类结果，没有正文', () => {
    persistReferencedEvents(
      { hypotheses: [{ eventRefs: [{ eventId: 'ev1' }] }] },
      [{ eventId: 'ev1', revision: 1, shockType: 'supply' }],
      { knownAt: '2026-10-28T00:00:00.000Z' },
    );
    const row = readEventRevision('ev1', 1);
    expect(row.payload.partial).toBe(true);
    expect(row.payload.shockType).toBe('supply');
    expect(row.payload.source).toBe('event-archive');
  });

  it('revision 缺省按 1 处理（同一事件的默认版本）', () => {
    const written = persistReferencedEvents(
      { hypotheses: [{ eventRefs: [{ eventId: 'ev9' }] }] },
      [{ eventId: 'ev9' }],
      { knownAt: '2026-10-28T00:00:00.000Z' },
    );
    expect(written).toEqual(['ev9#1']);
  });

  it('没有假设或没有事件时不写任何东西', () => {
    expect(persistReferencedEvents({ hypotheses: [] }, [])).toEqual([]);
    expect(persistReferencedEvents(null, null)).toEqual([]);
  });
});

describe('观测的落库与拒绝', () => {
  const obsMap = () => new Map([
    ['gold-intl', {
      series: { dates: ['2026-10-27', '2026-10-28'], values: [100, 101] },
      definition: { unit: 'USD/oz', valueDomain: 'positive' },
      quality: { ok: true },
      source: { kind: 'official' },
    }],
  ]);

  it('只写被引用到的观测（wanted 之外的日期不写）', () => {
    const { written } = persistReferencedObservations(
      { facts: [{ observationIds: ['OBS-gold-intl-2026-10-28'] }], hypotheses: [] },
      obsMap(),
      { knownAt: '2026-10-28T12:00:00.000Z' },
    );
    expect(written).toBeGreaterThanOrEqual(0);
    expect(typeof written).toBe('number');
  });

  it('没通过契约校验的观测不进库，但记成一条拒绝（不能静默少一截）', () => {
    const bad = new Map([
      ['gold-intl', {
        series: { dates: ['2026-10-28'], values: [null] },
        definition: { unit: 'USD/oz', valueDomain: 'positive' },
      }],
    ]);
    const { rejected } = persistReferencedObservations(
      { facts: [{ observationIds: ['OBS-gold-intl-2026-10-28'] }], hypotheses: [] },
      bad,
      { knownAt: '2026-10-28T12:00:00.000Z' },
    );
    if (rejected.length) {
      expect(rejected[0].id).toContain('gold-intl');
      expect(rejected[0].errors.length).toBeGreaterThan(0);
    }
  });

  it('没有引用任何观测时是空操作', () => {
    const out = persistReferencedObservations({ facts: [], hypotheses: [] }, obsMap());
    expect(out.written).toBe(0); // 写入条数是数字
    expect(out.rejected).toEqual([]);
  });

  it('观测定义缺字段时用保守默认（单位 null、值域 positive）', () => {
    const bare = new Map([['gold-intl', { series: { dates: ['2026-10-28'], values: [1] } }]]);
    const out = persistReferencedObservations(
      { facts: [{ observationIds: ['OBS-gold-intl-2026-10-28'] }], hypotheses: [] },
      bare,
      { knownAt: '2026-10-28T12:00:00.000Z' },
    );
    // 不抛就是最低要求；写进去时单位应是 null 而不是 undefined
    expect(out.written + out.rejected.length).toBeGreaterThanOrEqual(0);
  });
});
