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
 * ================================================================== */

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
];

/** 当前代码期望的 schema 版本 */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

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
export function migrateDatabase(db) {
  const from = currentSchemaVersion(db);
  const applied = [];
  for (const m of MIGRATIONS) {
    if (m.version <= from) continue;
    db.exec('BEGIN');
    try {
      m.up(db);
      // PRAGMA 不接受参数绑定，这里只拼数字
      db.exec(`PRAGMA user_version = ${Number(m.version)}`);
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
