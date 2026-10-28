/* ================================================================== *
 * 备份与恢复（方案 E05 / §9.2）
 *
 * 两条硬规矩：
 *   1. **备份是整套状态**，不是一个 .db 文件。库里存日线缓存/快照/解释，
 *      data/ 下还有分时历史、事件归档、旧缓存 —— 只备份一半，恢复后
 *      要靠人猜少了什么。
 *   2. **恢复默认写到新目录**，绝不原地覆盖。唯一现存的数据被一次错误的
 *      恢复指令覆盖掉，是不可逆的事故；写到新目录、用隔离端口验证过再切换，
 *      出错最多是多一个目录。
 *
 * 时序：stopWrites → flush → VACUUM INTO → 复制附属文件 → manifest → resumeWrites。
 * 顺序错了会得到「看起来完整、实际半新半旧」的快照。
 * ================================================================== */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  currentDatabaseFile,
  flush,
  getDb,
  resumeWrites,
  schemaVersionOf,
  stopWrites,
  withWriteAccess,
} from './sqlite.js';

/** 需要跟着一起走的持久状态（相对 data/） */
export const BACKUP_FILES = ['history.json', 'snapshots.jsonl', 'llm-cache.json'];
export const BACKUP_DIRS = ['events', 'daily'];
export const MANIFEST_NAME = 'manifest.json';

// 恢复要开一个**独立**连接（不能借用单例：那会把正在服务的库换成备份）
const require = createRequire(import.meta.url);

const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  const st = statSync(dir);
  if (!st.isDirectory()) {
    out.push({ path: path.relative(base, dir), bytes: st.size, sha256: sha256File(dir) });
    return out;
  }
  for (const name of readdirSync(dir)) walk(path.join(dir, name), base, out);
  return out;
}

/**
 * 生成一份备份。
 *
 * @param {string} outDir 目标目录（不存在会自动建）
 * @param {{ dataDir?:string, keep?:number, appVersion?:string }} [opts]
 */
export async function createBackup(outDir, { dataDir = process.env.KANBAN_DATA_DIR || path.resolve('data'), keep = 0, appVersion = null } = {}) {
  mkdirSync(outDir, { recursive: true });

  let flushed = null;
  let resumed = false;
  try {
    stopWrites();
    flushed = await flush();

    const dbFile = currentDatabaseFile();
    if (dbFile === ':memory:' || !existsSync(dbFile)) throw new Error(`数据库文件不存在：${dbFile}`);
    const dbOut = path.join(outDir, 'kanban.db');
    // VACUUM INTO 是写操作，需要在维护窗口里临时拿回写权限（同步执行，不留窗口）
    withWriteAccess((db) => db.exec(`VACUUM INTO '${dbOut.replace(/'/g, "''")}'`));

    for (const f of BACKUP_FILES) {
      const src = path.join(dataDir, f);
      if (existsSync(src)) copyFileSync(src, path.join(outDir, f));
    }
    for (const sub of BACKUP_DIRS) {
      const src = path.join(dataDir, sub);
      if (!existsSync(src)) continue;
      mkdirSync(path.join(outDir, sub), { recursive: true });
      for (const name of readdirSync(src)) {
        const full = path.join(src, name);
        if (statSync(full).isFile()) copyFileSync(full, path.join(outDir, sub, name));
      }
    }
  } finally {
    if (!resumed) {
      try {
        resumeWrites();
        resumed = true;
      } catch {
        /* 连接可能已关闭 */
      }
    }
  }

  const files = walk(outDir).sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    createdAt: new Date().toISOString(),
    appVersion,
    schemaVersion: schemaVersionOf(getDb()),
    sourceDataDir: dataDir,
    flushed,
    files,
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    retention: { keep, note: 'keep=0 表示不自动清理' },
  };
  writeFileSync(path.join(outDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dir: outDir, manifest };
}

/** 校验一份备份：清单存在、文件齐全、摘要一致 */
export function verifyBackup(dir) {
  const manifestFile = path.join(dir, MANIFEST_NAME);
  if (!existsSync(manifestFile)) return { ok: false, errors: [`缺少 ${MANIFEST_NAME}`] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch (err) {
    return { ok: false, errors: [`清单无法解析：${err?.message ?? err}`] };
  }
  const errors = [];
  for (const f of manifest.files ?? []) {
    const full = path.join(dir, f.path);
    if (!existsSync(full)) {
      errors.push(`缺少文件 ${f.path}`);
      continue;
    }
    const actual = sha256File(full);
    if (actual !== f.sha256) errors.push(`${f.path} 摘要不一致：清单 ${f.sha256.slice(0, 12)} ≠ 实际 ${actual.slice(0, 12)}`);
  }
  if (!(manifest.files ?? []).some((f) => f.path === 'kanban.db')) errors.push('备份里没有 kanban.db');
  return { ok: errors.length === 0, errors, manifest };
}

/** 数据库完整性 + 外键检查 */
export function integrityCheck(db) {
  const integrity = db.prepare('PRAGMA integrity_check').all();
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  const integrityOk = integrity.every((r) => Object.values(r)[0] === 'ok');
  return {
    ok: integrityOk && fk.length === 0,
    integrity: integrity.map((r) => Object.values(r)[0]),
    foreignKeyViolations: fk.length,
  };
}

/**
 * 把备份恢复到**新目录**。
 *
 * @param {string} srcDir 备份目录
 * @param {{ targetDir:string, force?:boolean }} opts
 */
export function restoreTo(srcDir, { targetDir, force = false } = {}) {
  if (!targetDir) throw new Error('恢复必须指定 targetDir（默认不覆盖原目录）');
  const normalized = path.resolve(targetDir);
  if (normalized === path.resolve(process.env.KANBAN_DATA_DIR || 'data') && !force) {
    throw new Error('拒绝就地恢复：请恢复到新目录，验证后再切换（确需覆盖请显式 --force）');
  }
  const verified = verifyBackup(srcDir);
  if (!verified.ok) return { ok: false, errors: verified.errors };

  mkdirSync(normalized, { recursive: true });
  for (const f of verified.manifest.files) {
    const from = path.join(srcDir, f.path);
    const to = path.join(normalized, f.path);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }

  // 在副本上开一次库做完整性检查，不合规就明确失败（不删已复制的文件，留给人工）
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(normalized, 'kanban.db'));
  let check;
  try {
    check = integrityCheck(db);
  } finally {
    db.close();
  }
  return { ok: check.ok, errors: check.ok ? [] : ['恢复出的数据库未通过完整性检查'], integrity: check, targetDir: normalized, manifest: verified.manifest };
}
