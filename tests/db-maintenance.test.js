/* ================================================================== *
 * 维护窗口：停写 / 排空 / 备份 / 恢复（方案 E05 / §9.2）
 *
 * 这一层最容易「看起来对、实际错」：备份少一个文件、恢复原地覆盖、停写有
 * 漏网的一次写 —— 都要靠测试钉住，而不是靠流程文档。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  closeDb,
  getDb,
  inMaintenance,
  kvGet,
  kvSet,
  resumeWrites,
  stopWrites,
  useDatabase,
  withWriteAccess,
} from '../src/server/db/index.js';
import { createBackup, integrityCheck, restoreTo, verifyBackup } from '../src/server/db/maintenance.js';

let dir;
let dbFile;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'maint-'));
  dbFile = path.join(dir, 'data', 'kanban.db');
  mkdirSync(path.dirname(dbFile), { recursive: true });
  useDatabase(dbFile);
});

afterEach(() => {
  try {
    resumeWrites();
  } catch {
    /* 已关闭 */
  }
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe('停写与写权限', () => {
  it('停写后普通写入失败（语句层拦，不是靠每个写入点自觉）', () => {
    kvSet('a', '1');
    stopWrites();
    expect(inMaintenance()).toBe(true);
    expect(kvSet('b', '2')).toBe(false);
    // 读仍然可用：维护窗口不是「把服务停掉」
    expect(kvGet('a')).toBe('1');
    resumeWrites();
    expect(kvSet('c', '3')).toBe(true);
  });

  it('withWriteAccess 在维护窗口里临时放行同步写', () => {
    stopWrites();
    withWriteAccess((db) => db.exec('CREATE TABLE tmp_probe (x INTEGER)'));
    const row = getDb().prepare("SELECT name FROM sqlite_master WHERE name='tmp_probe'").get();
    expect(row?.name).toBe('tmp_probe');
    // 用完必须自动收回
    expect(kvSet('d', '4')).toBe(false);
    resumeWrites();
  });

  it('withWriteAccess 拒绝异步回调（那会让维护窗口漏出写机会）', () => {
    stopWrites();
    expect(() => withWriteAccess(async () => {})).toThrow(/只接受同步回调/);
    resumeWrites();
  });
});

describe('备份', () => {
  it('生成整套状态 + 清单，且备份期间库仍可读', async () => {
    kvSet('llm-cache', '{"a":1}');
    writeFileSync(path.join(dir, 'data', 'history.json'), JSON.stringify({ history: { a: [{ t: 1, p: 2 }] } }));
    mkdirSync(path.join(dir, 'data', 'events'), { recursive: true });
    writeFileSync(path.join(dir, 'data', 'events', '2026-10.jsonl'), '{"eventId":"e1"}\n');

    const out = path.join(dir, 'backup');
    const { manifest } = await createBackup(out, { dataDir: path.join(dir, 'data'), appVersion: '9.9.9' });

    expect(existsSync(path.join(out, 'kanban.db'))).toBe(true);
    expect(existsSync(path.join(out, 'history.json'))).toBe(true);
    expect(existsSync(path.join(out, 'events', '2026-10.jsonl'))).toBe(true);
    expect(manifest.appVersion).toBe('9.9.9');
    expect(manifest.schemaVersion).toBeGreaterThanOrEqual(2);
    expect(manifest.files.some((f) => f.path === 'kanban.db')).toBe(true);
    // 每个文件都有摘要，大小对得上
    for (const f of manifest.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyBackup(out).ok).toBe(true);
  });

  it('备份完成后自动恢复写入状态（失败也不能把进程留在只读）', async () => {
    await createBackup(path.join(dir, 'b1'), { dataDir: path.join(dir, 'data') }).catch(() => {});
    expect(inMaintenance()).toBe(false);
    expect(kvSet('after', '1')).toBe(true);
  });

  it('备份目录不可写时明确失败，并恢复写入状态', async () => {
    // 把「目标目录」指到一个普通文件上：mkdirSync 会失败，备份不该留下半个目录
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, 'x');
    await expect(createBackup(blocker, { dataDir: path.join(dir, 'data') })).rejects.toThrow();
    expect(inMaintenance()).toBe(false);
  });

  it('verifyBackup 能抓到被篡改的库文件', async () => {
    const out = path.join(dir, 'b3');
    await createBackup(out, { dataDir: path.join(dir, 'data') });
    writeFileSync(path.join(out, 'kanban.db'), 'not-a-database');
    const v = verifyBackup(out);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toContain('摘要不一致');
  });

  it('清单之外多出来的文件不会让校验失败（但也不会被当成备份的一部分）', async () => {
    const out = path.join(dir, 'b3b');
    await createBackup(out, { dataDir: path.join(dir, 'data') });
    writeFileSync(path.join(out, 'stray.txt'), 'x');
    const v = verifyBackup(out);
    expect(v.ok).toBe(true);
    expect(v.manifest.files.some((f) => f.path === 'stray.txt')).toBe(false);
  });

  it('缺清单时报错而不是「当作有效」', () => {
    const empty = path.join(dir, 'empty');
    mkdirSync(empty, { recursive: true });
    expect(verifyBackup(empty).errors[0]).toContain('manifest.json');
  });
});

describe('恢复', () => {
  it('恢复到新目录并通过完整性检查，数据还在', async () => {
    kvSet('marker', 'keep-me');
    const out = path.join(dir, 'b4');
    await createBackup(out, { dataDir: path.join(dir, 'data') });

    const target = path.join(dir, 'restored');
    const r = restoreTo(out, { targetDir: target });
    expect(r.ok).toBe(true);
    expect(r.integrity.foreignKeyViolations).toBe(0);

    // 真的能打开，且 kv 里那条记录还在
    useDatabase(path.join(target, 'kanban.db'));
    expect(kvGet('marker')).toBe('keep-me');
  });

  it('坏备份在复制前就被拦住（不留半套文件）', async () => {
    const out = path.join(dir, 'b5');
    await createBackup(out, { dataDir: path.join(dir, 'data') });
    writeFileSync(path.join(out, 'kanban.db'), 'not-a-database');

    const target = path.join(dir, 'restored-bad');
    const r = restoreTo(out, { targetDir: target });
    expect(r.ok).toBe(false);
    expect(existsSync(path.join(target, 'kanban.db'))).toBe(false);
  });

  it('拒绝就地覆盖（唯一现存数据不该被一条命令盖掉）', () => {
    const out = path.join(dir, 'b6');
    return createBackup(out, { dataDir: path.join(dir, 'data') }).then(() => {
      expect(() => restoreTo(out, { targetDir: process.env.KANBAN_DATA_DIR || 'data' })).toThrow(/拒绝就地恢复/);
      expect(() => restoreTo(out, {})).toThrow(/必须指定 targetDir/);
    });
  });

  it('integrityCheck 报出外键违规', () => {
    const db = getDb();
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec("INSERT INTO explanation_evidence (explanation_id, evidence_id) VALUES ('no-such-exp','no-such-ev')");
    const check = integrityCheck(db);
    expect(check.ok).toBe(false);
    expect(check.foreignKeyViolations).toBeGreaterThan(0);
  });

  it('恢复出的库能被程序正常打开（schema 版本一致）', async () => {
    const out = path.join(dir, 'b7');
    await createBackup(out, { dataDir: path.join(dir, 'data') });
    const target = path.join(dir, 'restored-ok');
    restoreTo(out, { targetDir: target });
    const file = path.join(target, 'kanban.db');
    expect(readFileSync(file).length).toBeGreaterThan(0);
    useDatabase(file); // 会跑迁移与兼容性断言，版本不对会抛
    expect(getDb().prepare('PRAGMA user_version').get().user_version).toBeGreaterThanOrEqual(2);
  });
});
