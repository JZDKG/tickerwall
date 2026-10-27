/* ================================================================== *
 * SQLite 打开与建表（唯一入口）
 *
 * 为什么要收口：库里 4 张表（daily_bars / daily_meta / snapshots / kv）的
 * PRAGMA、建表语句、连接复用原来都写在 server.mjs 顶部的 getDb() 里，
 * 而读写在文件另一头 —— 想单测「日线缓存写进去再读出来」就必须起整个服务。
 *
 * 测试钩子：useDatabase(':memory:') 之后所有读写都落在内存库，毫秒级、
 * 且绝不会碰到生产 data/kanban.db。默认路径从模块位置推导，不依赖 cwd。
 * ================================================================== */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 仓库根目录：src/server/db → 上三级 */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const DEFAULT_DB_FILE = path.join(REPO_ROOT, 'data', 'kanban.db');

let handle = null;
/** 测试注入用：非 null 时覆盖默认路径 */
let overrideFile = null;

/** 建表语句集中在这里，改 schema 只改一处 */
function applySchema(db) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(`CREATE TABLE IF NOT EXISTS daily_bars (
    id TEXT NOT NULL,
    date TEXT NOT NULL,
    open REAL, close REAL NOT NULL, high REAL, low REAL, volume REAL,
    PRIMARY KEY (id, date)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS daily_meta (
    id TEXT PRIMARY KEY,
    source TEXT,
    saved_at INTEGER NOT NULL,
    count INTEGER NOT NULL,
    start_date TEXT,
    end_date TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS snapshots (
    at TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT,
    price REAL,
    change_pct REAL,
    PRIMARY KEY (at, id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_snap_at ON snapshots(at)');
  db.exec(`CREATE TABLE IF NOT EXISTS kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL,
    at INTEGER NOT NULL
  )`);
}

/**
 * 打开一个独立连接并建表（不走单例）。
 * @param {string} file 文件路径，或 ':memory:'
 */
export function openDatabase(file = DEFAULT_DB_FILE) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  applySchema(db);
  return db;
}

/** 当前实际使用的库文件：测试注入 > 环境变量 > 默认 */
export function currentDatabaseFile() {
  return overrideFile ?? process.env.KANBAN_DB ?? DEFAULT_DB_FILE;
}

/** 进程内唯一连接（服务端用这个） */
export function getDb() {
  if (handle) return handle;
  handle = openDatabase(currentDatabaseFile());
  return handle;
}

/**
 * 测试钩子：切换数据库文件并让下一次 getDb() 重新打开。
 * @param {string|null} file 传 null 恢复默认
 */
export function useDatabase(file) {
  closeDb();
  overrideFile = file ?? null;
  return getDb();
}

export function closeDb() {
  if (handle) {
    try {
      handle.close();
    } catch {
      /* 已关闭 */
    }
    handle = null;
  }
}

/* ------------------------------------------------------------------ *
 * kv 表：小体量键值（LLM 分类缓存、迁移标记）
 * ------------------------------------------------------------------ */

export function kvGet(key, fallback = null) {
  try {
    const row = getDb().prepare('SELECT v FROM kv WHERE k = ?').get(key);
    return row ? row.v : fallback;
  } catch (err) {
    console.warn(`[sqlite] 读取 kv「${key}」失败：${err?.message ?? err}`);
    return fallback;
  }
}

export function kvSet(key, value) {
  try {
    getDb()
      .prepare(
        `INSERT INTO kv (k, v, at) VALUES (?, ?, ?)
         ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at`,
      )
      .run(key, String(value), Date.now());
    return true;
  } catch (err) {
    console.warn(`[sqlite] 写入 kv「${key}」失败：${err?.message ?? err}`);
    return false;
  }
}

/** 读取并 JSON.parse 一个 kv 值；坏数据返回 null */
export function kvGetJson(key) {
  const raw = kvGet(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function kvSetJson(key, obj) {
  return kvSet(key, JSON.stringify(obj));
}
