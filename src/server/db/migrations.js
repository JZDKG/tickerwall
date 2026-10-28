/* ================================================================== *
 * 版本化数据库迁移
 *
 * 为什么需要：解释功能要新增 7 张表（观测版本、报道、事件修订、解释、证据、
 * 关联、采集状态）。SQLite 的 CREATE TABLE IF NOT EXISTS 只能「从无到有」，
 * 表达不了「第几版结构、还差哪些步骤」—— 一旦某个库已经是中间态，
 * 缺少版本记录就只能靠人工猜。
 *
 * 用 SQLite 内建的 PRAGMA user_version 记录已应用到第几版：
 *   · 只前进不回退（DOWN 迁移在本地看板上没有收益，风险却很大）；
 *   · 每一步在事务里执行，失败整步回滚，不会留下半张表；
 *   · 新增步骤只追加到 MIGRATIONS 末尾，已上线的步骤不再改内容。
 *
 * 迁移在独立测试库上验证（tests/db-explanations.test.js 用 :memory:），
 * 真实库升级前先备份 —— 见 docs 方案 §6.3。
 *
 * 2026-10 补强（方案 E05）：
 *   · 增加 schema_migrations 表，逐条记录 version / name / **checksum** / applied_at。
 *     只有 user_version 一个数字时，「这个库升过但没有记录」和「升到一半失败」
 *     长得一模一样；有了校验和还能发现「已上线的迁移被别人悄悄改过」。
 *   · 库版本比程序新时**拒绝写入**（旧程序操作新结构会把数据改坏），抛出可读错误。
 * ================================================================== */

import { createHash } from 'node:crypto';

/**
 * @typedef {{ version:number, name:string, up:(db:any)=>void }} Migration
 */

/** @type {Migration[]} */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'explanations-foundation',
    up(db) {
      // 观测版本：解释引用的是「某次修订」，不是「当前值」。
      // logical_key 标识同一来源 + 指标 + 观测期；修订有各自不同的 id。
      db.exec(`CREATE TABLE IF NOT EXISTS observation_revisions (
        id TEXT PRIMARY KEY,
        logical_key TEXT NOT NULL,
        instrument_id TEXT NOT NULL,
        observed_at TEXT,
        published_at TEXT,
        fetched_at TEXT,
        known_at TEXT,
        value REAL,
        unit TEXT,
        value_domain TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        quality TEXT,
        source_ref TEXT
      )`);
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_obs_rev_key ON observation_revisions(instrument_id, observed_at, known_at)',
      );
      db.exec('CREATE INDEX IF NOT EXISTS idx_obs_rev_logical ON observation_revisions(logical_key, revision)');

      // 报道：每个 id 对应不可变内容；原文更新产生新 revision 与新 id
      db.exec(`CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        logical_article_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        url TEXT,
        publisher TEXT,
        published_at TEXT,
        fetched_at TEXT,
        known_at TEXT,
        content_hash TEXT,
        excerpt TEXT,
        language TEXT,
        UNIQUE (logical_article_id, revision)
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_articles_known ON articles(known_at, published_at)');

      // 事件修订：聚合结果不可变，修订不覆盖历史解释所用版本
      db.exec(`CREATE TABLE IF NOT EXISTS event_revisions (
        event_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        payload TEXT NOT NULL,
        known_at TEXT,
        PRIMARY KEY (event_id, revision)
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_event_rev_known ON event_revisions(known_at)');

      // 解释快照：payload 存结构化解释；常用查询字段保留独立列
      db.exec(`CREATE TABLE IF NOT EXISTS explanations (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        window_key TEXT NOT NULL,
        as_of TEXT,
        generated_at TEXT NOT NULL,
        content_status TEXT NOT NULL,
        payload TEXT NOT NULL,
        mechanism_version TEXT,
        calculation_version TEXT,
        language_version TEXT,
        input_fingerprint TEXT
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_expl_lookup ON explanations(asset_id, window_key, as_of)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_expl_fingerprint ON explanations(input_fingerprint)');

      // 证据：不可变载荷，JSON 里存 observationIds 与 eventRevisionRefs
      db.exec(`CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        hypothesis_id TEXT,
        role TEXT NOT NULL,
        payload TEXT NOT NULL
      )`);

      // 解释 ↔ 证据：外键约束在这里才能真正生效（需要 PRAGMA foreign_keys=ON）
      db.exec(`CREATE TABLE IF NOT EXISTS explanation_evidence (
        explanation_id TEXT NOT NULL REFERENCES explanations(id) ON DELETE CASCADE,
        evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
        PRIMARY KEY (explanation_id, evidence_id)
      )`);

      // 采集状态：每个任务键的最后成功时间、错误与退避
      db.exec(`CREATE TABLE IF NOT EXISTS collection_state (
        job_key TEXT PRIMARY KEY,
        last_success_at INTEGER,
        last_error TEXT,
        last_error_at INTEGER,
        fails INTEGER NOT NULL DEFAULT 0,
        backoff_until INTEGER,
        inflight INTEGER NOT NULL DEFAULT 0
      )`);
    },
  },
  {
    version: 2,
    name: 'import-ledger',
    up(db) {
      /**
       * 旧 JSON / JSONL 的导入台账（方案 E05 / §9.1）。
       *
       * 原来只有一个 kv 标记 `migrated-sqlite-v1`：一旦写上，就无法区分
       * 「文件本来就不存在」「文件坏了没导进去」「导进去一半」——三种状态
       * 在库里长得一模一样，而这三种状态该做的事完全不同。
       *
       * 现在按来源逐条记录：status ∈ ok | absent | partial | failed，
       * 并保存文件校验和与行数，重跑时只重试没成功的那几条。
       */
      db.exec(`CREATE TABLE IF NOT EXISTS import_ledger (
        source TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        rows INTEGER NOT NULL DEFAULT 0,
        checksum TEXT,
        error TEXT,
        attempted_at TEXT NOT NULL,
        finished_at TEXT
      )`);
    },
  },
];

/** 当前代码期望的 schema 版本 */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/**
 * 每个迁移的稳定校验和。
 *
 * 取 `up` 的源码文本：函数体一改，校验和立刻变 —— 这正是我们要的信号
 * （已上线的迁移**不该再改**；改了就必须新开一版，否则老库与新代码的结构
 * 会静默分叉）。调用方不许把返回值用于安全用途，它只用来发现漂移。
 */
export function migrationChecksum(migration) {
  return createHash('sha256').update(`${migration.version}:${migration.name}:${String(migration.up)}`).digest('hex');
}

export function currentSchemaVersion(db) {
  try {
    const row = db.prepare('PRAGMA user_version').get();
    const v = row?.user_version ?? row?.['user_version'] ?? 0;
    return Number(v) || 0;
  } catch {
    return 0;
  }
}

/**
 * 把库升到最新版本。
 *
 * @param {any} db 已打开的 node:sqlite DatabaseSync
 * @returns {{ from:number, to:number, applied:string[] }}
 */
const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

/** 已应用的迁移记录（读不到表时返回空数组，兼容刚建的库） */
export function appliedMigrations(db) {
  try {
    return db.prepare('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC').all();
  } catch {
    return [];
  }
}

/**
 * 校验「记录里的迁移」与「代码里的迁移」是否一致。
 *
 * 两种漂移都要报：
 *   · 记录里有、代码里没有 → 这个库来自更全的版本，或者迁移被删了；
 *   · 校验和不同 → 已上线的迁移被改过（结构可能与数据对不上）。
 *
 * @returns {string[]} 问题列表（空数组表示一致）
 */
export function migrationDrift(db) {
  const recorded = new Map(appliedMigrations(db).map((r) => [Number(r.version), r]));
  const known = new Map(MIGRATIONS.map((m) => [m.version, m]));
  const problems = [];
  for (const [version, row] of recorded) {
    const m = known.get(version);
    if (!m) {
      problems.push(`迁移 v${version}（${row.name}）在代码里不存在`);
      continue;
    }
    const want = migrationChecksum(m);
    if (row.checksum !== want) {
      problems.push(`迁移 v${version}（${row.name}）内容被改过：记录 ${row.checksum.slice(0, 12)} ≠ 当前 ${want.slice(0, 12)}`);
    }
  }
  return problems;
}

/**
 * 库是否比程序新。是的话调用方**必须拒绝写入**：
 * 旧程序不认识新表/新列，写进去的数据可能被新版本的约束判为非法，
 * 而且升级路径也断了。
 */
export function assertDatabaseCompatible(db) {
  const version = currentSchemaVersion(db);
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `数据库 schema 版本 ${version} 比本程序支持的 ${SCHEMA_VERSION} 新：请升级程序，或把数据恢复到新目录后再启动。`,
    );
  }
  const drift = migrationDrift(db);
  if (drift.length) throw new Error(`迁移记录与代码不一致：${drift.join('；')}`);
  return version;
}

/**
 * 把库升到最新版本。
 *
 * @param {any} db 已打开的 node:sqlite DatabaseSync
 * @returns {{ from:number, to:number, applied:string[] }}
 */
export function migrateDatabase(db) {
  const from = currentSchemaVersion(db);
  const applied = [];
  db.exec(MIGRATIONS_TABLE);
  // 先判兼容性：库比程序新时直接停，别把它「升级」成一半新一半旧
  assertDatabaseCompatible(db);

  const recorded = new Set(appliedMigrations(db).map((r) => Number(r.version)));
  for (const m of MIGRATIONS) {
    // 同一个库可能 user_version 到了但记录缺（老库第一次升级）：按记录补
    if (m.version <= from && recorded.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      if (m.version > from) m.up(db);
      // PRAGMA 不接受参数绑定，这里只拼数字
      db.exec(`PRAGMA user_version = ${Math.max(m.version, from)}`);
      db.prepare(
        `INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(version) DO NOTHING`,
      ).run(m.version, m.name, migrationChecksum(m), new Date().toISOString());
      db.exec('COMMIT');
      applied.push(m.name);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw new Error(`迁移 v${m.version} ${m.name} 失败：${err?.message ?? err}`);
    }
  }
  return { from, to: currentSchemaVersion(db), applied };
}
