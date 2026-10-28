/* ================================================================== *
 * 版本化迁移：记录、校验和、兼容性（方案 E05 / §9.1）
 *
 * 钉住三件事：
 *   1. 迁移逐条写入 schema_migrations，重复运行是幂等的；
 *   2. 已上线的迁移被改动 → 立刻报漂移（老库与新代码结构会静默分叉）；
 *   3. 库版本比程序新 → 拒绝打开（旧程序写新结构会把数据改坏）。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

import {
  MIGRATIONS,
  SCHEMA_VERSION,
  appliedMigrations,
  assertDatabaseCompatible,
  currentSchemaVersion,
  migrateDatabase,
  migrationChecksum,
  migrationDrift,
} from '../src/server/db/migrations.js';

const fresh = () => new DatabaseSync(':memory:');

describe('迁移执行与记录', () => {
  it('空库升到最新版本，并逐条记录 name / checksum / applied_at', () => {
    const db = fresh();
    const out = migrateDatabase(db);
    expect(out.from).toBe(0);
    expect(out.to).toBe(SCHEMA_VERSION);
    expect(out.applied).toHaveLength(MIGRATIONS.length);

    const rows = appliedMigrations(db);
    expect(rows.map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version));
    for (const r of rows) {
      expect(r.checksum).toBe(migrationChecksum(MIGRATIONS.find((m) => m.version === r.version)));
      expect(Number.isFinite(Date.parse(r.applied_at))).toBe(true);
    }
  });

  it('再跑一次是空操作（不会重复执行 up）', () => {
    const db = fresh();
    migrateDatabase(db);
    const again = migrateDatabase(db);
    expect(again.applied).toEqual([]);
    expect(again.from).toBe(SCHEMA_VERSION);
  });

  it('版本 2 带来了导入台账表', () => {
    const db = fresh();
    migrateDatabase(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    expect(tables).toContain('import_ledger');
    expect(tables).toContain('schema_migrations');
  });

  it('user_version 已到但记录缺失（老库首次升级）→ 补记录但不重跑建表', () => {
    const db = fresh();
    db.exec('PRAGMA user_version = 2');
    const out = migrateDatabase(db);
    expect(out.from).toBe(2);
    expect(out.applied.sort()).toEqual(MIGRATIONS.map((m) => m.name).sort());
    expect(appliedMigrations(db)).toHaveLength(MIGRATIONS.length);
  });
});

describe('漂移与兼容性', () => {
  it('迁移记录与代码一致时 drift 为空', () => {
    const db = fresh();
    migrateDatabase(db);
    expect(migrationDrift(db)).toEqual([]);
    expect(assertDatabaseCompatible(db)).toBe(SCHEMA_VERSION);
  });

  it('已上线的迁移被改过 → 报漂移（不静默放过）', () => {
    const db = fresh();
    migrateDatabase(db);
    db.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1').run('0'.repeat(64));
    const drift = migrationDrift(db);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('内容被改过');
    expect(() => assertDatabaseCompatible(db)).toThrow(/迁移记录与代码不一致/);
  });

  it('记录里有代码里没有的迁移 → 也报漂移', () => {
    const db = fresh();
    migrateDatabase(db);
    db.prepare("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (999, 'ghost', 'x', '2026-01-01T00:00:00Z')").run();
    expect(migrationDrift(db).join(' ')).toContain('代码里不存在');
  });

  it('库版本比程序新 → 拒绝（并说明该升级程序还是恢复备份）', () => {
    const db = fresh();
    migrateDatabase(db);
    db.exec('PRAGMA user_version = 999');
    expect(currentSchemaVersion(db)).toBe(999);
    expect(() => assertDatabaseCompatible(db)).toThrow(/比本程序支持的/);
    expect(() => migrateDatabase(db)).toThrow(/比本程序支持的/);
  });
});
