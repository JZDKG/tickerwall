/* ================================================================== *
 * Phase 1 / P1-T1：双轨 JSON 存储收敛到 SQLite
 *
 * 验收：
 *   · v4 建出 intraday_ring 与 llm_headline_cache（当前 SCHEMA_VERSION = 5，见 v5 预警表）；
 *   · 分时点用一次 BEGIN IMMEDIATE ... COMMIT 批量写入，按品种保留 240 点；
 *   · 旧 history.json 启动时导入一次，且文件缺失时兼容回退；
 *   · LLM 标题分类缓存读写走 llm_headline_cache 表（不再整文件重写）。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  MIGRATIONS,
  SCHEMA_VERSION,
  migrateDatabase,
} from '../src/server/db/migrations.js';
import {
  useDatabase,
  closeDb,
  getDb,
} from '../src/server/db/index.js';
import {
  saveHistoryRing,
  loadHistoryRing,
  saveLlmCache,
  loadLlmCache,
  importLegacyHistoryFile,
  persistHistoryRing,
  HISTORY_FILE,
  ring,
  seedNotes,
  HISTORY_LIMIT,
} from '../src/server/db/quotes-storage.js';

const tables = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);

const columns = (db, table) =>
  db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);

beforeEach(() => {
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('迁移 v4：两张收敛表（当前 SCHEMA_VERSION 已升到 5）', () => {
  it('v4 仍是 sqlite-storage-convergence；当前版本为 5', () => {
    expect(SCHEMA_VERSION).toBe(5);
    const v4 = MIGRATIONS.find((m) => m.version === 4);
    expect(v4?.name).toMatch(/storage|ring|sqlite/i);
  });

  it('空库升到最新版建出 intraday_ring 与 llm_headline_cache（v4 表不丢）', () => {
    const db = new DatabaseSync(':memory:');
    const out = migrateDatabase(db);
    expect(out.to).toBe(SCHEMA_VERSION);
    expect(tables(db)).toContain('intraday_ring');
    expect(tables(db)).toContain('llm_headline_cache');
    expect(columns(db, 'intraday_ring')).toEqual(['instrument_id', 'ts', 'price']);
    expect(columns(db, 'llm_headline_cache')).toEqual(['hash', 'payload_json', 'updated_at']);
    db.close();
  });

  it('v0 老库增量升到最新版，v1~v3 的表都还在', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA user_version = 2');
    const out = migrateDatabase(db);
    expect(out.from).toBe(2);
    expect(out.to).toBe(SCHEMA_VERSION);
    expect(out.applied).toContain('job-queue-and-watermarks');
    expect(tables(db)).toContain('collection_jobs');
    expect(tables(db)).toContain('intraday_ring');
    db.close();
  });
});

describe('intraday_ring：批量事务写入与读回', () => {
  it('saveHistoryRing 把多个品种的点写进 SQLite，loadHistoryRing 读回', () => {
    const db = getDb();
    const at = 1_700_000_000_000;
    saveHistoryRing({
      'gold-intl': [{ t: at, p: 2650.5 }, { t: at + 60_000, p: 2651.25 }],
      oil: [{ t: at, p: 71.2 }],
    });
    const rows = db.prepare('SELECT instrument_id, ts, price FROM intraday_ring ORDER BY instrument_id, ts').all();
    expect(rows).toEqual([
      { instrument_id: 'gold-intl', ts: at, price: 2650.5 },
      { instrument_id: 'gold-intl', ts: at + 60_000, price: 2651.25 },
      { instrument_id: 'oil', ts: at, price: 71.2 },
    ]);
    expect(loadHistoryRing()).toEqual({
      'gold-intl': [{ t: at, p: 2650.5 }, { t: at + 60_000, p: 2651.25 }],
      oil: [{ t: at, p: 71.2 }],
    });
  });

  it('整次写入是一个事务：同批里出现坏行时全部回滚，不留半批', () => {
    const db = getDb();
    expect(() =>
      saveHistoryRing({
        good: [{ t: 1, p: 2 }],
        bad: [{ t: 2, p: Number.NaN }],
      }),
    ).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM intraday_ring').get().n).toBe(0);
  });

  it('按品种只保留最近 240 个点（HISTORY_LIMIT）', () => {
    const at = 1_700_000_000_000;
    const points = Array.from({ length: HISTORY_LIMIT + 25 }, (_, i) => ({ t: at + i * 60_000, p: 100 + i }));
    saveHistoryRing({ x: points });
    const got = loadHistoryRing().x;
    expect(got).toHaveLength(HISTORY_LIMIT);
    expect(got[0].p).toBe(125);
    expect(got[got.length - 1].p).toBe(100 + HISTORY_LIMIT + 24);
  });

  it('重复写同一批是幂等的（主键冲突走覆盖，不抛）', () => {
    saveHistoryRing({ a: [{ t: 5, p: 1 }] });
    saveHistoryRing({ a: [{ t: 5, p: 9 }] });
    expect(loadHistoryRing().a).toEqual([{ t: 5, p: 9 }]);
  });
});

describe('llm_headline_cache：逐条 upsert，不再整文件重写', () => {
  it('saveLlmCache 只写/更新有变化的 hash，loadLlmCache 原样读回', () => {
    const db = getDb();
    saveLlmCache({ h1: { topics: ['通胀'], at: 10 } }, 1000);
    expect(db.prepare('SELECT COUNT(*) AS n FROM llm_headline_cache').get().n).toBe(1);

    saveLlmCache({ h1: { topics: ['通胀'], at: 10 }, h2: { topics: ['就业'], at: 20 } }, 2000);
    const rows = db.prepare('SELECT hash, payload_json, updated_at FROM llm_headline_cache ORDER BY hash').all();
    expect(rows.map((r) => r.hash)).toEqual(['h1', 'h2']);
    // h1 没变，不该被重写（updated_at 保持 1000）
    expect(rows[0].updated_at).toBe(1000);
    expect(rows[1].updated_at).toBe(2000);
    expect(loadLlmCache()).toEqual({
      h1: { topics: ['通胀'], at: 10 },
      h2: { topics: ['就业'], at: 20 },
    });
  });

  it('坏 JSON 行被跳过，不拖垮整份缓存', () => {
    const db = getDb();
    db.prepare('INSERT INTO llm_headline_cache (hash, payload_json, updated_at) VALUES (?, ?, ?)').run('broken', '{oops', 1);
    saveLlmCache({ ok: { at: 1 } }, 2);
    expect(loadLlmCache()).toEqual({ ok: { at: 1 } });
  });
});

describe('旧 history.json 导入与兼容回退', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kanban-phase1-legacy-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('启动时把旧文件里的走势点导入 SQLite，且重复导入不产生重复行', async () => {
    const file = path.join(dir, 'history.json');
    writeFileSync(file, JSON.stringify({
      savedAt: '2026-11-10T00:00:00Z',
      notes: { a: { note: 'seed', at: 1 } },
      history: { a: [{ t: 10, p: 1 }, { t: 20, p: 2 }], bad: 'skip-me' },
    }));
    const n = await importLegacyHistoryFile({ file, force: true });
    expect(n).toBe(2);
    expect(loadHistoryRing()).toEqual({ a: [{ t: 10, p: 1 }, { t: 20, p: 2 }] });
    expect(await importLegacyHistoryFile({ file, force: true })).toBe(2);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM intraday_ring').get().n).toBe(2);
  });

  it('文件不存在时是空操作，不抛（首次启动）', async () => {
    await expect(importLegacyHistoryFile({ file: path.join(dir, 'missing.json'), force: true })).resolves.toBe(0);
  });

  it('persistHistoryRing 走 SQLite 事务，文件里不再全量重写走势点', async () => {
    ring.set('live', [{ t: 7, p: 3.5 }]);
    seedNotes.set('live', { note: 'seed', at: 1 });
    const out = await persistHistoryRing();
    expect(out.backend).toBe('sqlite');
    expect(loadHistoryRing().live).toEqual([{ t: 7, p: 3.5 }]);
    const { readJson } = await import('../src/server/db/files.js');
    const file = await readJson(HISTORY_FILE);
    expect(file.history).toEqual({}); // 点已收敛到 SQLite，文件只留注脚兼容
    expect(file.notes.live.note).toBe('seed');
  });

  it('SQLite 写入失败时完整走势退回 JSON 文件（兼容护栏）', async () => {
    ring.set('fallback', [{ t: 9, p: 4.5 }]);
    const db = getDb();
    db.exec('DROP TABLE intraday_ring'); // 模拟老库没升到 v4
    const out = await persistHistoryRing();
    expect(out.backend).toBe('file');
    const { readJson } = await import('../src/server/db/files.js');
    const file = await readJson(HISTORY_FILE);
    expect(file.history.fallback).toEqual([{ t: 9, p: 4.5 }]);
  });
});
