/* ================================================================== *
 * 事件修订（C3）：内容变了才写新版本
 *
 * 方案 §6.3 的 event_revisions 之前几乎没被用过 —— 只有「被解释引用」才写，
 * 于是「这条新闻为什么从 mid 变成 high」事后无法追。
 *
 * 三条判据：
 *   · 同一内容重复抓到 → 不产生新版本；
 *   · 标题 / 等级 / 标的 / 主题任一变化 → 新版本，序号递增；
 *   · 单轮写入有上限，首次运行不会把整批历史一次铺满。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useDatabase, closeDb, readEventRevision, listEventRevisions, nextEventRevision, eventRevisionCounts } from '../src/server/db/index.js';
import { recordEventRevisions, resetEventRevisionCache } from '../src/server/services/events.service.js';

const ev = (over = {}) => ({
  id: 'jin10:1',
  time: '2026-10-28 10:00:00',
  title: 'OPEC+ 宣布减产',
  body: '减产 100 万桶/日',
  level: 'mid',
  region: 'me',
  topics: [{ key: 'energy', label: '能源' }],
  symbols: ['oil'],
  publisher: '金十数据',
  ...over,
});

beforeEach(() => {
  useDatabase(':memory:');
  // 内容哈希是进程内缓存：换库必须清掉，否则新库第一次写入会被跳过
  resetEventRevisionCache();
});
afterEach(() => closeDb());

describe('内容变化才留痕', () => {
  it('第一次出现写第 1 版', () => {
    const written = recordEventRevisions([ev()], { knownAt: '2026-10-28T02:00:00Z' });
    expect(written).toEqual(['jin10:1#1']);
    const row = readEventRevision('jin10:1', 1);
    expect(row.payload.title).toBe('OPEC+ 宣布减产');
    expect(row.payload.symbols).toEqual(['oil']);
  });

  it('同一内容再抓一次不产生新版本', () => {
    recordEventRevisions([ev()]);
    recordEventRevisions([ev()]);
    expect(listEventRevisions('jin10:1')).toHaveLength(1);
  });

  it('等级变更 → 第 2 版，旧版仍在（append-only）', () => {
    recordEventRevisions([ev()], { knownAt: '2026-10-28T02:00:00Z' });
    recordEventRevisions([ev({ level: 'high' })], { knownAt: '2026-10-28T03:00:00Z' });
    const rows = listEventRevisions('jin10:1');
    expect(rows.map((r) => r.revision)).toEqual([1, 2]);
    expect(readEventRevision('jin10:1', 1).payload.level).toBe('mid');
    expect(readEventRevision('jin10:1', 2).payload.level).toBe('high');
  });

  it('标的被证据剔除也算内容变化（这正是需要事后解释的改判）', () => {
    recordEventRevisions([ev()]);
    recordEventRevisions([ev({ symbols: [] })]);
    expect(listEventRevisions('jin10:1')).toHaveLength(2);
    expect(readEventRevision('jin10:1', 2).payload.symbols).toEqual([]);
  });

  it('主题变化同样留痕', () => {
    recordEventRevisions([ev()]);
    recordEventRevisions([ev({ topics: [{ key: 'geopolitics', label: '地缘' }] })]);
    expect(readEventRevision('jin10:1', 2).payload.topics).toEqual(['地缘']);
  });

  it('重启进程（缓存清空）不会追加重复修订', () => {
    recordEventRevisions([ev()]);
    // 模拟重启：内存哈希清空，但库里已有同样内容的最新版
    resetEventRevisionCache();
    const written = recordEventRevisions([ev()]);
    expect(written).toEqual([]);
    expect(listEventRevisions('jin10:1')).toHaveLength(1);
  });

  it('重启后内容确实变了才写新版本', () => {
    recordEventRevisions([ev()]);
    resetEventRevisionCache();
    recordEventRevisions([ev({ level: 'high' })]);
    expect(listEventRevisions('jin10:1').map((r) => r.revision)).toEqual([1, 2]);
  });

  it('单轮写入有上限，且按传入顺序', () => {
    const many = Array.from({ length: 5 }, (_, i) => ev({ id: `jin10:${i}`, title: `新闻 ${i}` }));
    const written = recordEventRevisions(many, { maxWrites: 3 });
    expect(written).toHaveLength(3);
    expect(written[0]).toBe('jin10:0#1');
    expect(listEventRevisions('jin10:4')).toHaveLength(0);
  });

  it('没有 id 的条目被跳过（不写脏数据）', () => {
    expect(recordEventRevisions([{ title: '无 id' }])).toEqual([]);
  });
});

describe('版本号与计数', () => {
  it('nextEventRevision 从 1 开始并递增', () => {
    expect(nextEventRevision('x')).toBe(1);
    recordEventRevisions([ev({ id: 'x' })]);
    expect(nextEventRevision('x')).toBe(2);
  });

  it('eventRevisionCounts 一次取多条，缺的按 null 处理', () => {
    recordEventRevisions([ev({ id: 'a' }), ev({ id: 'b' })]);
    recordEventRevisions([ev({ id: 'a', level: 'high' })]);
    const counts = eventRevisionCounts(['a', 'b', 'c']);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.has('c')).toBe(false);
  });

  it('空列表不查库', () => {
    expect(eventRevisionCounts([]).size).toBe(0);
    expect(eventRevisionCounts(null).size).toBe(0);
  });
});

/* 历史脏数据的清理：只删「与前一条内容完全相同」的记录 */
describe('清理重复修订', () => {
  it('保留最早一条，删掉内容相同的后续记录', async () => {
    const { pruneDuplicateEventRevisions, writeEventRevision } = await import('../src/server/db/index.js');
    writeEventRevision({ eventId: 'dup', revision: 1, payload: { title: 'A', contentHash: 'h1' }, knownAt: '2026-10-28T01:00:00Z' });
    writeEventRevision({ eventId: 'dup', revision: 2, payload: { title: 'A', contentHash: 'h1' }, knownAt: '2026-10-28T02:00:00Z' });
    writeEventRevision({ eventId: 'dup', revision: 3, payload: { title: 'B', contentHash: 'h2' }, knownAt: '2026-10-28T03:00:00Z' });
    writeEventRevision({ eventId: 'dup', revision: 4, payload: { title: 'B', contentHash: 'h2' }, knownAt: '2026-10-28T04:00:00Z' });

    const out = pruneDuplicateEventRevisions();
    expect(out.removed).toBe(2);
    expect(listEventRevisions('dup').map((r) => r.revision)).toEqual([1, 3]);
  });

  it('内容确实变过的版本一条都不删', async () => {
    const { pruneDuplicateEventRevisions, writeEventRevision } = await import('../src/server/db/index.js');
    for (let i = 1; i <= 3; i += 1) {
      writeEventRevision({ eventId: 'chg', revision: i, payload: { title: `v${i}`, contentHash: `h${i}` }, knownAt: `2026-10-28T0${i}:00:00Z` });
    }
    expect(pruneDuplicateEventRevisions().removed).toBe(0);
    expect(listEventRevisions('chg')).toHaveLength(3);
  });

  it('没有 contentHash 的旧记录不动（信息不足就不猜）', async () => {
    const { pruneDuplicateEventRevisions, writeEventRevision } = await import('../src/server/db/index.js');
    writeEventRevision({ eventId: 'old', revision: 1, payload: { title: 'A' }, knownAt: '2026-10-28T01:00:00Z' });
    writeEventRevision({ eventId: 'old', revision: 2, payload: { title: 'A' }, knownAt: '2026-10-28T02:00:00Z' });
    expect(pruneDuplicateEventRevisions().removed).toBe(0);
    expect(listEventRevisions('old')).toHaveLength(2);
  });
});

/* 上游 id 复用：标题整体换掉时要标出来，而不是当成普通改标题 */
describe('标题整体更换的标记', () => {
  it('相似度低的新旧标题 → retitled 且保留上一版标题', () => {
    recordEventRevisions([ev({ title: 'GE Vernova to Report Earnings Wednesday' })]);
    recordEventRevisions([ev({ title: 'OPEC+ 宣布大幅减产' })]);
    const row = readEventRevision('jin10:1', 2);
    expect(row.payload.retitled).toBe(true);
    expect(row.payload.previousTitle).toBe('GE Vernova to Report Earnings Wednesday');
  });

  it('只是微调标题时不标 retitled', () => {
    recordEventRevisions([ev({ title: 'OPEC+ 宣布减产 100 万桶/日' })]);
    recordEventRevisions([ev({ title: 'OPEC+ 宣布减产 100 万桶/日，油价跳涨' })]);
    expect(readEventRevision('jin10:1', 2).payload.retitled).toBeUndefined();
  });
});
