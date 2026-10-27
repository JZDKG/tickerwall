/* ================================================================== *
 * 24h 事件回放：合并 / 去重 / 时间窗 / 主题还原
 *
 * 被测：src/server/services/events.service.js 的 mergeHistoryRows（纯函数）
 *
 * 为什么单独测这个纯函数：时间轴上的柱高直接由它决定。错了不会抛异常，
 * 只会让某一小时凭空多出几十根柱子，或者整段历史悄悄少半截。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { mergeHistoryRows, eventTimeMs } from '../src/server/services/events.service.js';

const NOW = new Date('2026-10-27T12:00:00Z').getTime();       // 北京 20:00
const HOUR = 3600 * 1000;
const SINCE = NOW - 24 * HOUR;

/** 北京时间的 'YYYY-MM-DD HH:mm:ss' */
const bj = (ms) => new Date(ms + 8 * HOUR).toISOString().slice(0, 19).replace('T', ' ');

const row = (id, ms, extra = {}) => ({ id, time: bj(ms), title: `t-${id}`, level: 'mid', topics: ['能源'], symbols: [], region: 'global', ...extra });

describe('eventTimeMs：北京墙钟 → 绝对毫秒', () => {
  it('按 +08:00 解析，不是本地时区', () => {
    expect(eventTimeMs('2026-10-27 20:00:00')).toBe(Date.UTC(2026, 9, 27, 12, 0, 0));
  });

  it('解析不了给 null，不要给 NaN', () => {
    expect(eventTimeMs('')).toBeNull();
    expect(eventTimeMs('不是时间')).toBeNull();
    expect(eventTimeMs(undefined)).toBeNull();
  });
});

describe('mergeHistoryRows：合并归档与实时', () => {
  it('时间窗两头都卡：太早和「未来」都剔掉', () => {
    const { items } = mergeHistoryRows({
      archiveRows: [
        row('too-old', NOW - 30 * HOUR),
        row('in-window', NOW - 2 * HOUR),
        row('future', NOW + 5 * 24 * HOUR), // 源里真的有 2027-03 的会议公告
      ],
      liveItems: [],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(items.map((i) => i.id)).toEqual(['in-window']);
  });

  it('同一 id 实时覆盖归档（level 与 topics 以复核后的为准）', () => {
    const { items } = mergeHistoryRows({
      archiveRows: [row('x', NOW - HOUR, { level: 'low', topics: ['能源'] })],
      liveItems: [row('x', NOW - HOUR, { level: 'high', topics: ['货币政策'] })],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(items).toHaveLength(1);
    expect(items[0].level).toBe('high');
    expect(items[0].topics[0]).toEqual({ key: 'fed', label: '货币政策', strong: false });
  });

  it('归档的 label 还原成 { key, label }，认不出的保留 label、key 留空', () => {
    const { items } = mergeHistoryRows({
      archiveRows: [row('a', NOW - HOUR, { topics: ['能源', '某个没见过的主题'] })],
      liveItems: [],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(items[0].topics[0]).toEqual({ key: 'energy', label: '能源', strong: false });
    expect(items[0].topics[1].label).toBe('某个没见过的主题');
    expect(items[0].topics[1].key).toBe('');
  });

  it('按时间倒序，最新的在前', () => {
    const { items } = mergeHistoryRows({
      archiveRows: [row('a', NOW - 3 * HOUR), row('c', NOW - 1 * HOUR)],
      liveItems: [row('b', NOW - 2 * HOUR)],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(items.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('limit 从尾部截断，coverageFrom 反映的是截断后最早那条', () => {
    const rows = [1, 2, 3, 4, 5].map((n) => row(`r${n}`, NOW - n * HOUR));
    const { items, coverageFrom } = mergeHistoryRows({
      archiveRows: rows,
      liveItems: [],
      sinceMs: SINCE,
      nowMs: NOW,
      limit: 3,
    });
    expect(items.map((i) => i.id)).toEqual(['r1', 'r2', 'r3']);
    expect(coverageFrom).toBe(new Date(NOW - 3 * HOUR).toISOString());
  });

  it('没有覆盖到任何事件时 coverageFrom 为 null，不编时间', () => {
    const { items, coverageFrom } = mergeHistoryRows({
      archiveRows: [],
      liveItems: [],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(items).toEqual([]);
    expect(coverageFrom).toBeNull();
  });

  it('坏行（没有 id / 没有 time）直接跳过，不污染结果', () => {
    const { items } = mergeHistoryRows({
      archiveRows: [{ title: '无 id' }, { id: 'no-time', time: '' }, null],
      liveItems: [row('good', NOW - HOUR)],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(items.map((i) => i.id)).toEqual(['good']);
  });
});
