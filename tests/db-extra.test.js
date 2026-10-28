/* ================================================================== *
 * 持久层边界（src/server/db/）
 *
 * db.test.js 覆盖正常读写；这里补「坏路径 / 坏数据 / 事务回滚 / 跳变护栏」
 * 这些只在异常和边界上才走到的分支。仍然只用内存库与临时目录。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  useDatabase,
  closeDb,
  kvGet,
  kvSet,
  kvGetJson,
  kvSetJson,
  readDailyCache,
  writeDailyCache,
  isDailyCacheFresh,
  DAILY_FRESH_MS,
  takeSnapshot,
  readSnapshots,
  snapshotCount,
  resetSnapshotGuard,
  writeJsonAtomic,
  readJson,
  appendJsonl,
  readJsonl,
  readJsonlField,
  writeHistoryFile,
  readHistoryFile,
} from '../src/server/db/index.js';

const BAR = (date, close) => ({ date, open: close - 1, close, high: close + 1, low: close - 2, volume: 1000 });

let dir;

beforeEach(() => {
  useDatabase(':memory:');
  resetSnapshotGuard();
  dir = mkdtempSync(path.join(tmpdir(), 'kanban-db-extra-'));
});

afterEach(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/* ------------------------------ 日线缓存 ------------------------------ */

describe('日线缓存：跳过坏行、空表、新鲜度边界', () => {
  it('写入时丢弃缺日期/非正收盘的行，返回实际写入数', async () => {
    const written = await writeDailyCache('x', 'test', [
      BAR('2026-10-01', 100),
      { date: '', close: 5 },
      { date: '2026-10-02', close: 0 },
      BAR('2026-10-03', 101),
    ]);
    expect(written).toBe(2);
    // 整段替换语义：再写一次更短的有效集，旧行不残留
    await writeDailyCache('x', 'test', [BAR('2026-10-04', 102), BAR('2026-10-05', 103)]);
    const cache = await readDailyCache('x');
    expect(cache.rows.map((r) => r.date)).toEqual(['2026-10-04', '2026-10-05']);
    expect(cache.source).toBe('test');
  });

  it('少于两行不写（画不出图）', async () => {
    expect(await writeDailyCache('x', 'test', [BAR('2026-10-01', 1)])).toBeUndefined();
    expect(await writeDailyCache('x', 'test', null)).toBeUndefined();
    expect(await readDailyCache('x')).toBeNull();
  });

  it('库里只有一行时读取返回 null（不足两条视为无缓存）', async () => {
    // 绕过写入口径，直接看读侧：写入两行后删掉一行
    await writeDailyCache('y', 'test', [BAR('2026-10-01', 1), BAR('2026-10-02', 2)]);
    const { getDb } = await import('../src/server/db/sqlite.js');
    getDb().prepare('DELETE FROM daily_bars WHERE id = ? AND date = ?').run('y', '2026-10-02');
    expect(await readDailyCache('y')).toBeNull();
  });

  it('isDailyCacheFresh：8 小时边界前后', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(isDailyCacheFresh({ savedAt: now - DAILY_FRESH_MS + 1 }, now)).toBe(true);
    expect(isDailyCacheFresh({ savedAt: now - DAILY_FRESH_MS }, now)).toBe(false);
    expect(isDailyCacheFresh(null, now)).toBe(false);
  });

  it('数据库打不开时读返回 null、写返回 0，并留下警告', async () => {
    const warns = [];
    const realWarn = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    // 把库指到「文件下面的路径」——mkdir 必失败
    expect(() => useDatabase('/dev/null/nope.db')).toThrow();
    expect(await readDailyCache('x')).toBeNull();
    expect(await writeDailyCache('x', 't', [BAR('d1', 1), BAR('d2', 2)])).toBe(0);
    console.warn = realWarn;
    expect(warns.join('\n')).toMatch(/sqlite/);
    useDatabase(':memory:');
  });
});

/* ------------------------------ kv ------------------------------ */

describe('kv：坏值、写入失败', () => {
  it('kvGetJson 对非 JSON 返回 null，对缺失键给 fallback', () => {
    expect(kvGetJson('missing')).toBeNull();
    kvSet('bad', 'not-json{');
    expect(kvGetJson('bad')).toBeNull();
    kvSetJson('obj', { a: 1 });
    expect(kvGetJson('obj')).toEqual({ a: 1 });
    expect(kvGet('missing', 'dflt')).toBe('dflt');
  });

  it('库不可用时 kvGet 返回 fallback、kvSet 返回 false', () => {
    expect(() => useDatabase('/dev/null/nope.db')).toThrow();
    const warns = [];
    const realWarn = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    expect(kvGet('k', 'fb')).toBe('fb');
    expect(kvSet('k', 'v')).toBe(false);
    console.warn = realWarn;
    expect(warns.length).toBeGreaterThan(0);
    useDatabase(':memory:');
  });
});

/* ------------------------------ 快照 ------------------------------ */

describe('快照：空输入、跳变两次确认、读取与计数', () => {
  it('没有有效报价 / 全部无效时返回 0', async () => {
    expect(await takeSnapshot([])).toBe(0);
    expect(await takeSnapshot([{ id: 'a', ok: false, price: 1 }, { id: 'b', ok: true, price: 0 }])).toBe(0);
    expect(snapshotCount()).toBe(0);
  });

  it('首次写入后，超过阈值的跳变先挂起、连续第二次才确认', async () => {
    await takeSnapshot([{ id: 'sp500', name: '标普', ok: true, price: 100 }], { at: '2026-10-26T01:00:00Z' });
    const skips = [];
    const opts = { at: '2026-10-26T02:00:00Z', maxJumpPct: 10, onSkip: (s) => skips.push(s) };

    // 第一次 +50%：挂起，不写库
    expect(await takeSnapshot([{ id: 'sp500', name: '标普', ok: true, price: 150 }], opts)).toBe(0);
    expect(skips[0]).toMatchObject({ id: 'sp500', reason: 'jump-pending' });

    // 第二次仍是 150：确认换挡，放行
    skips.length = 0;
    expect(await takeSnapshot([{ id: 'sp500', name: '标普', ok: true, price: 150 }], { ...opts, at: '2026-10-26T03:00:00Z' })).toBe(1);
    expect(skips[0]).toMatchObject({ id: 'sp500', reason: 'regime-confirmed' });
  });

  it('没有锚点（首个刻度）时不触发护栏；未跳变时清掉待定状态', async () => {
    await takeSnapshot([{ id: 'a', name: 'A', ok: true, price: 10 }], { at: '2026-10-26T01:00:00Z' });
    const skips = [];
    expect(
      await takeSnapshot([{ id: 'a', name: 'A', ok: true, price: 10.1 }], { at: '2026-10-26T02:00:00Z', onSkip: (s) => skips.push(s) }),
    ).toBe(1);
    expect(skips).toEqual([]);
  });

  it('按品种覆盖阈值（maxJumpPctById）', async () => {
    await takeSnapshot([{ id: 'btc', name: 'BTC', ok: true, price: 100 }], { at: '2026-10-26T01:00:00Z' });
    const skips = [];
    // 全局阈值 5%，但 btc 单独给 50% → +20% 不算跳变
    expect(
      await takeSnapshot([{ id: 'btc', name: 'BTC', ok: true, price: 120 }], {
        at: '2026-10-26T02:00:00Z',
        maxJumpPct: 5,
        maxJumpPctById: { btc: 50 },
        onSkip: (s) => skips.push(s),
      }),
    ).toBe(1);
    expect(skips).toEqual([]);
  });

  it('readSnapshots 按 at 分组升序；空库返回 []', async () => {
    expect(await readSnapshots()).toEqual([]);
    await takeSnapshot(
      [
        { id: 'a', name: 'A', ok: true, price: 1 },
        { id: 'b', name: 'B', ok: true, price: 2 },
      ],
      { at: '2026-10-26T01:00:00Z' },
    );
    const out = await readSnapshots();
    expect(out).toHaveLength(1);
    expect(out[0].quotes.map((q) => q.id).sort()).toEqual(['a', 'b']);
  });

  it('库不可用时读空、计数 0，并留下警告', async () => {
    expect(() => useDatabase('/dev/null/nope.db')).toThrow();
    const warns = [];
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = (...a) => warns.push(a.join(' '));
    console.error = (...a) => warns.push(a.join(' '));
    expect(await readSnapshots()).toEqual([]);
    expect(snapshotCount()).toBe(0);
    expect(await takeSnapshot([{ id: 'a', ok: true, price: 1 }])).toBe(0);
    console.warn = realWarn;
    console.error = realError;
    expect(warns.join('\n')).toMatch(/sqlite|快照/);
    useDatabase(':memory:');
  });
});

/* ------------------------------ 文件 I/O ------------------------------ */

describe('files：原子写、JSONL 容错、历史文件', () => {
  it('writeJsonAtomic 自动建目录，写入后可读且无 .tmp 残留', async () => {
    const file = path.join(dir, 'nested', 'deep', 'a.json');
    await writeJsonAtomic(file, { ok: 1 });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ok: 1 });
    expect(existsSync(`${file}.tmp`)).toBe(false);
    expect(await readJson(file)).toEqual({ ok: 1 });
  });

  it('readJson 对坏文件 / 不存在返回 null', async () => {
    const bad = path.join(dir, 'bad.json');
    writeFileSyncSafe(bad, '{oops');
    expect(await readJson(bad)).toBeNull();
    expect(await readJson(path.join(dir, 'missing.json'))).toBeNull();
  });

  it('appendJsonl 接受单对象与数组；空数组不写文件', async () => {
    const file = path.join(dir, 'log.jsonl');
    expect(await appendJsonl(file, [])).toBe(0);
    expect(existsSync(file)).toBe(false);
    expect(await appendJsonl(file, { a: 1 })).toBe(1);
    expect(await appendJsonl(file, [{ a: 2 }, { a: 3 }])).toBe(2);
    expect(await readJsonl(file)).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('readJsonl 跳过坏行与空行；文件缺失返回 []', async () => {
    const file = path.join(dir, 'mixed.jsonl');
    writeFileSyncSafe(file, '{"ok":1}\n\nnot json\n{"ok":2}\n');
    expect(await readJsonl(file)).toEqual([{ ok: 1 }, { ok: 2 }]);
    expect(await readJsonl(path.join(dir, 'none.jsonl'))).toEqual([]);
  });

  it('readJsonlField 只收非空字段，去重', async () => {
    const file = path.join(dir, 'ids.jsonl');
    await appendJsonl(file, [{ id: 'a' }, { id: 'a' }, { id: null }, { other: 1 }, { id: 'b' }]);
    expect([...(await readJsonlField(file))].sort()).toEqual(['a', 'b']);
    expect([...(await readJsonlField(file, 'other'))]).toEqual([1]);
  });

  it('writeHistoryFile 带 savedAt，readHistoryFile 对缺字段/坏文件给空对象', async () => {
    const file = path.join(dir, 'history.json');
    await writeHistoryFile(file, { notes: { a: { note: 'n' } }, history: { a: [{ t: 1, p: 2 }] } });
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    expect(typeof raw.savedAt).toBe('string');
    expect(await readHistoryFile(file)).toEqual({
      notes: { a: { note: 'n' } },
      history: { a: [{ t: 1, p: 2 }] },
    });

    writeFileSyncSafe(file, JSON.stringify({ notes: 'bad', history: null }));
    expect(await readHistoryFile(file)).toEqual({ notes: {}, history: {} });
    expect(await readHistoryFile(path.join(dir, 'missing.json'))).toEqual({ notes: {}, history: {} });
  });
});

const writeFileSyncSafe = (file, text) => writeFileSync(file, text, 'utf8');
