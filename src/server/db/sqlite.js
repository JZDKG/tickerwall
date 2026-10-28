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
import { DATA_DIR } from '../paths.js';
import { migrateDatabase, SCHEMA_VERSION } from './migrations.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 仓库根目录：src/server/db → 上三级 */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/**
 * 默认库文件**跟着 DATA_DIR 走**。
 *
 * 原先写死成 `<仓库>/data/kanban.db`，于是 `KANBAN_DATA_DIR` 只能换掉
 * jsonl/历史那些文件，SQLite 仍在原地 —— 换数据目录不是「整套换走」，
 * 而是换了一半。后果不只是概念不干净：集成测试把 KANBAN_DATA_DIR 指向
 * 临时目录，却仍然打开并写入用户真实的 kanban.db（WAL 模式下两个进程
 * 同时写同一个库）。
 *
 * `paths.js` 里那句注释本来就说 KANBAN_DATA_DIR 是「把整个 data/ 换到别处」，
 * 这里补上兑现它。KANBAN_DB 仍然可以单独指定，优先级最高。
 */
export const DEFAULT_DB_FILE = path.join(DATA_DIR, 'kanban.db');

let handle = null;
/** 测试注入用：非 null 时覆盖默认路径 */
let overrideFile = null;

/**
 * 建表语句集中在这里，改 schema 只改一处。
 *
 * 历史四张表（daily_bars / daily_meta / snapshots / kv）保持原样，全部
 * CREATE IF NOT EXISTS —— 老库升级时它们本来就在，不会被动到。
 * 解释功能的新表走 migrations.js 的版本化迁移（PRAGMA user_version），
 * 因为新增 7 张表、还要能记录「这个库升到第几版了」。
 */
function applySchema(db) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  // 外键约束默认关闭；不开这个 pragma，explanation_evidence 的 REFERENCES 只是注释
  db.exec('PRAGMA foreign_keys = ON');
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
  // 版本化迁移：解释功能的 7 张表 + 后续增量结构。幂等，已是最新版时什么都不做。
  migrateDatabase(db);
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

/** 该连接的 schema 版本（诊断与测试用） */
export function schemaVersionOf(db) {
  try {
    const row = db.prepare('PRAGMA user_version').get() ?? {};
    return Number(row.user_version ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** 当前代码期望的版本，暴露给启动日志与 /api/health */
export { SCHEMA_VERSION };

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
  maintenance = false;
}

/* ------------------------------------------------------------------ *
 * 维护窗口：停写、排空、再备份（方案 E05 / §9.2）
 *
 * 为什么用 PRAGMA query_only 而不是在每个写入函数里加开关：写入点有十几处，
 * 逐个加判断必然有漏网的（漏掉的那一处正好会在备份过程中写进去，产生
 * 一份「看起来完整、实际半新半旧」的快照）。query_only 是 SQLite 自己在
 * 语句层拦，谁也绕不过去。
 * ------------------------------------------------------------------ */

let maintenance = false;
/** 排空钩子：延迟落盘的定时器由各存储层注册自己的 flush */
const flushHooks = new Set();

/** 注册一个「把缓冲写下去」的钩子，返回取消函数 */
export function registerFlushHook(fn) {
  flushHooks.add(fn);
  return () => flushHooks.delete(fn);
}

/** 当前是否处于维护窗口（测试与健康接口可读） */
export function inMaintenance() {
  return maintenance;
}

/**
 * 进入维护窗口：拒绝一切写语句。
 * 备份 / 迁移 / 恢复演练之前调用；与 resumeWrites 成对使用。
 */
export function stopWrites() {
  const db = getDb();
  db.exec('PRAGMA query_only = ON');
  maintenance = true;
  return { queryOnly: true };
}

/** 退出维护窗口，恢复写入 */
export function resumeWrites() {
  const db = getDb();
  db.exec('PRAGMA query_only = OFF');
  maintenance = false;
}

/**
 * 在维护窗口里临时获得写权限，执行一个**同步**回调。
 *
 * 为什么要这个口子：`VACUUM INTO` 与 checkpoint 本身是写操作，被 query_only
 * 挡住就没法备份。安全性来自 Node 的单线程 + 回调必须同步：从放开到收回
 * 之间没有 await，事件循环不会切到别的请求处理，所以不存在「备份过程中
 * 应用又写进去」的窗口。
 *
 * 异步回调会被直接拒绝（那才会真的漏写）。
 */
export function withWriteAccess(fn) {
  if (fn?.constructor?.name === 'AsyncFunction') {
    throw new Error('withWriteAccess 只接受同步回调：异步会让维护窗口漏出写机会');
  }
  const db = getDb();
  const wasMaintenance = maintenance;
  if (wasMaintenance) db.exec('PRAGMA query_only = OFF');
  try {
    return fn(db);
  } finally {
    if (wasMaintenance) db.exec('PRAGMA query_only = ON');
  }
}

/**
 * 排空：先跑所有钩子（延迟落盘的定时器），再把 WAL 合并回主库。
 *
 * 维护窗口里 checkpoint 需要写文件，而 query_only 会把写语句挡掉 ——
 * 所以这里临时放开、checkpoint 完再关上，而不是要求调用方自己记得顺序。
 */
export async function flush() {
  const hookErrors = [];
  for (const hook of flushHooks) {
    try {
      await hook();
    } catch (err) {
      hookErrors.push(String(err?.message ?? err));
    }
  }
  withWriteAccess((db) => db.exec('PRAGMA wal_checkpoint(TRUNCATE)'));
  return { hooks: flushHooks.size, hookErrors };
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
