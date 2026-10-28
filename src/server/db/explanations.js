/* ================================================================== *
 * 解释 / 证据 / 事件修订 / 报道 —— 持久化层
 *
 * 约束（方案 §6.3）：
 *   · 解释与证据都是**不可变**记录：新证据到达时创建新版本，不改写旧快照；
 *   · 写入解释及其证据引用在**同一事务**里，并逐项校验 JSON 引用确实存在；
 *   · 关系表开启外键（PRAGMA foreign_keys=ON，见 sqlite.js）；
 *   · 清理必须保留仍被引用的版本，且遍历解释 → 证据 → 事件 → 报道。
 *
 * 依赖方向：db/ 只依赖 node:sqlite 与 fs，不 import services/ 或 providers/。
 * ================================================================== */

import { getDb, schemaVersionOf, SCHEMA_VERSION } from './sqlite.js';

function db() {
  return getDb();
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(text) {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 观测版本
 * ------------------------------------------------------------------ */

/**
 * 写入一批观测版本。
 *
 * 同一 id 重复写入按 INSERT OR IGNORE 处理：观测是不可变事实，
 * 「抓到了同一观测的同一修订」不该覆盖已有记录（也不该刷新 known_at）。
 * 真正的修订要带不同的 id（logical_key 相同、revision 不同）。
 *
 * @param {Array<object>} records
 * @returns {number} 实际新增条数
 */
export function writeObservationRevisions(records) {
  if (!Array.isArray(records) || !records.length) return 0;
  const stmt = db().prepare(
    `INSERT OR IGNORE INTO observation_revisions
      (id, logical_key, instrument_id, observed_at, published_at, fetched_at, known_at,
       value, unit, value_domain, revision, quality, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let written = 0;
  db().exec('BEGIN');
  try {
    for (const r of records) {
      if (!r?.id || !r.instrumentId) continue;
      const res = stmt.run(
        String(r.id),
        String(r.logicalKey ?? `${r.instrumentId}@${r.observedAt ?? 'unknown'}`),
        String(r.instrumentId),
        r.observedAt ?? null,
        r.publishedAt ?? null,
        r.fetchedAt ?? null,
        r.knownAt ?? nowIso(),
        Number.isFinite(r.value) ? r.value : null,
        r.unit ?? null,
        r.valueDomain ?? null,
        Number(r.revision ?? 1),
        r.quality ? JSON.stringify(r.quality) : null,
        r.sourceRef ?? null,
      );
      written += Number(res?.changes ?? 0);
    }
    db().exec('COMMIT');
  } catch (err) {
    try {
      db().exec('ROLLBACK');
    } catch {
      /* 已回滚 */
    }
    throw err;
  }
  return written;
}

export function readObservationRevision(id) {
  const row = db().prepare('SELECT * FROM observation_revisions WHERE id = ?').get(String(id));
  if (!row) return null;
  return {
    id: row.id,
    logicalKey: row.logical_key,
    instrumentId: row.instrument_id,
    observedAt: row.observed_at,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    knownAt: row.known_at,
    value: row.value,
    unit: row.unit,
    valueDomain: row.value_domain,
    revision: row.revision,
    quality: parseJson(row.quality),
    sourceRef: row.source_ref,
  };
}

/**
 * 历史回放的唯一正确读法：对每个 logical_key 选 `known_at <= asOf` 的最新修订。
 * 不能把多个修订当成多个样本，也不能让后来取得的修订进入过去时点的解释。
 */
export function readObservationAsOf(logicalKey, asOf) {
  const row = db()
    .prepare(
      `SELECT * FROM observation_revisions
        WHERE logical_key = ? AND (known_at IS NULL OR known_at <= ?)
        ORDER BY revision DESC LIMIT 1`,
    )
    .get(String(logicalKey), String(asOf));
  return row ? readObservationRevision(row.id) : null;
}

export function countObservationRevisions() {
  const row = db().prepare('SELECT COUNT(*) AS n FROM observation_revisions').get();
  return Number(row?.n ?? 0);
}

/* ------------------------------------------------------------------ *
 * 报道
 * ------------------------------------------------------------------ */

export function writeArticle(rec) {
  if (!rec?.id) throw new Error('article 需要 id');
  db()
    .prepare(
      `INSERT OR IGNORE INTO articles
        (id, logical_article_id, revision, url, publisher, published_at, fetched_at, known_at,
         content_hash, excerpt, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      String(rec.id),
      String(rec.logicalArticleId ?? rec.id),
      Number(rec.revision ?? 1),
      rec.url ?? null,
      rec.publisher ?? null,
      rec.publishedAt ?? null,
      rec.fetchedAt ?? nowIso(),
      rec.knownAt ?? nowIso(),
      rec.contentHash ?? null,
      rec.excerpt ?? null,
      rec.language ?? null,
    );
  return readArticle(rec.id);
}

export function readArticle(id) {
  const row = db().prepare('SELECT * FROM articles WHERE id = ?').get(String(id));
  if (!row) return null;
  return {
    id: row.id,
    logicalArticleId: row.logical_article_id,
    revision: row.revision,
    url: row.url,
    publisher: row.publisher,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    knownAt: row.known_at,
    contentHash: row.content_hash,
    excerpt: row.excerpt,
    language: row.language,
  };
}

/** 同一篇原文的最新修订（引用旧摘录时仍用 readArticle(旧 id) 读回原内容） */
export function latestArticleRevision(logicalArticleId) {
  const row = db()
    .prepare('SELECT id FROM articles WHERE logical_article_id = ? ORDER BY revision DESC LIMIT 1')
    .get(String(logicalArticleId));
  return row ? readArticle(row.id) : null;
}

/* ------------------------------------------------------------------ *
 * 事件修订
 * ------------------------------------------------------------------ */

export function writeEventRevision({ eventId, revision = 1, payload, knownAt }) {
  if (!eventId) throw new Error('event 需要 eventId');
  if (!payload || typeof payload !== 'object') throw new Error('event 需要 payload');
  db()
    .prepare('INSERT OR IGNORE INTO event_revisions (event_id, revision, payload, known_at) VALUES (?, ?, ?, ?)')
    .run(String(eventId), Number(revision), JSON.stringify(payload), knownAt ?? nowIso());
  return readEventRevision(eventId, revision);
}

export function readEventRevision(eventId, revision) {
  const row = db()
    .prepare('SELECT * FROM event_revisions WHERE event_id = ? AND revision = ?')
    .get(String(eventId), Number(revision));
  if (!row) return null;
  return {
    eventId: row.event_id,
    revision: row.revision,
    knownAt: row.known_at,
    payload: parseJson(row.payload) ?? {},
  };
}

export function listEventRevisions(eventId) {
  return db()
    .prepare('SELECT event_id, revision, known_at FROM event_revisions WHERE event_id = ? ORDER BY revision ASC')
    .all(String(eventId))
    .map((r) => ({ eventId: r.event_id, revision: r.revision, knownAt: r.known_at }));
}

/** 事件在 asOf 之前的最新修订（回放用） */
export function readEventAsOf(eventId, asOf) {
  const row = db()
    .prepare(
      `SELECT revision FROM event_revisions
        WHERE event_id = ? AND (known_at IS NULL OR known_at <= ?)
        ORDER BY revision DESC LIMIT 1`,
    )
    .get(String(eventId), String(asOf));
  return row ? readEventRevision(eventId, row.revision) : null;
}

/* ------------------------------------------------------------------ *
 * 解释 + 证据
 * ------------------------------------------------------------------ */

function evidenceIdOf(explanationId, hypothesisId, role, index) {
  return `ev_${explanationId}_${hypothesisId}_${role}_${index}`;
}

/**
 * 把解释引用的观测 / 事件引用展开成可校验的列表。
 * 返回 { observationIds, eventRefs } 并**不去重** —— 去重只在写库时做。
 */
function collectRefs(hypotheses, facts) {
  const observationIds = new Set();
  const eventRefs = new Map();
  for (const f of facts ?? []) {
    for (const id of f.observationIds ?? []) observationIds.add(id);
  }
  for (const h of hypotheses ?? []) {
    for (const e of h.evidence ?? []) {
      for (const id of e.observationIds ?? []) observationIds.add(id);
    }
    for (const ref of h.eventRefs ?? []) {
      if (ref?.eventId) eventRefs.set(`${ref.eventId}#${ref.revision}`, ref);
    }
  }
  return { observationIds: [...observationIds], eventRefs: [...eventRefs.values()] };
}

/**
 * 校验 JSON 里引用的观测版本与事件版本是否真的存在。
 *
 * 为什么放在事务内部、写解释之前：一旦允许「引用不存在的证据」落库，
 * 界面点开依据会得到空白，而解释看起来仍然完整 —— 这比写入失败危险得多。
 */
export function validateReferences({ observationIds = [], eventRefs = [] }) {
  const missing = { observationIds: [], eventRefs: [] };
  const obsStmt = db().prepare('SELECT 1 AS ok FROM observation_revisions WHERE id = ?');
  for (const id of observationIds) {
    if (!obsStmt.get(String(id))) missing.observationIds.push(id);
  }
  const evStmt = db().prepare('SELECT 1 AS ok FROM event_revisions WHERE event_id = ? AND revision = ?');
  for (const ref of eventRefs) {
    if (!evStmt.get(String(ref.eventId), Number(ref.revision))) {
      missing.eventRefs.push({ eventId: ref.eventId, revision: ref.revision });
    }
  }
  return { ok: missing.observationIds.length === 0 && missing.eventRefs.length === 0, missing };
}

/**
 * 写入一次解释快照（解释 + 证据 + 关联，同一事务）。
 *
 * @param {{ explanation: object }} input
 * @returns {{ id:string, evidenceCount:number }}
 */
export function writeExplanation({ explanation }) {
  if (!explanation?.id) throw new Error('explanation 需要 id');
  if (!explanation.assetId || !explanation.window?.key) throw new Error('explanation 需要 assetId 与 window.key');

  const { observationIds, eventRefs } = collectRefs(explanation.hypotheses, explanation.facts);
  const check = validateReferences({ observationIds, eventRefs });
  if (!check.ok) {
    const err = new Error(
      `证据引用不存在：observations=[${check.missing.observationIds.join(', ')}] events=[${check.missing.eventRefs
        .map((r) => `${r.eventId}#${r.revision}`)
        .join(', ')}]`,
    );
    err.code = 'EVIDENCE_REFERENCE_MISSING';
    err.missing = check.missing;
    throw err;
  }

  const d = db();
  d.exec('BEGIN');
  try {
    d.prepare(
      `INSERT INTO explanations
        (id, asset_id, window_key, as_of, generated_at, content_status, payload,
         mechanism_version, calculation_version, language_version, input_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      String(explanation.id),
      String(explanation.assetId),
      String(explanation.window.key),
      explanation.asOf ?? null,
      explanation.generatedAt ?? nowIso(),
      String(explanation.contentStatus ?? 'partial'),
      JSON.stringify(explanation),
      explanation.versions?.mechanisms ?? null,
      explanation.versions?.calculation ?? null,
      explanation.versions?.language ?? null,
      explanation.inputFingerprint ?? null,
    );

    const insEv = d.prepare('INSERT INTO evidence (id, hypothesis_id, role, payload) VALUES (?, ?, ?, ?)');
    const link = d.prepare('INSERT OR IGNORE INTO explanation_evidence (explanation_id, evidence_id) VALUES (?, ?)');
    let evidenceCount = 0;
    for (const h of explanation.hypotheses ?? []) {
      for (let i = 0; i < (h.evidence ?? []).length; i += 1) {
        const e = h.evidence[i];
        const evId = evidenceIdOf(explanation.id, h.mechanismId ?? 'unknown', e.role ?? 'background', i);
        insEv.run(
          evId,
          h.mechanismId ?? null,
          String(e.role ?? 'background'),
          JSON.stringify({
            ...e,
            hypothesisId: h.mechanismId ?? null,
            window: e.window ?? h.window ?? null,
            qualityReasons: e.qualityReasons ?? [],
            eventRevisionRefs: h.eventRefs ?? [],
            sourceRefs: h.sources?.map((s) => s.url) ?? [],
          }),
        );
        link.run(String(explanation.id), evId);
        evidenceCount += 1;
      }
    }
    d.exec('COMMIT');
    return { id: explanation.id, evidenceCount };
  } catch (err) {
    try {
      d.exec('ROLLBACK');
    } catch {
      /* 已回滚 */
    }
    throw err;
  }
}

export function readExplanation(id) {
  const row = db().prepare('SELECT * FROM explanations WHERE id = ?').get(String(id));
  if (!row) return null;
  return {
    id: row.id,
    assetId: row.asset_id,
    windowKey: row.window_key,
    asOf: row.as_of,
    generatedAt: row.generated_at,
    contentStatus: row.content_status,
    versions: {
      mechanisms: row.mechanism_version,
      calculation: row.calculation_version,
      language: row.language_version,
    },
    inputFingerprint: row.input_fingerprint,
    explanation: parseJson(row.payload),
  };
}

/** 某资产 + 窗口的最新快照（按 as_of 再按生成时间倒序） */
export function latestExplanation({ assetId, windowKey }) {
  const row = db()
    .prepare(
      `SELECT id FROM explanations WHERE asset_id = ? AND window_key = ?
        ORDER BY COALESCE(as_of, generated_at) DESC, generated_at DESC LIMIT 1`,
    )
    .get(String(assetId), String(windowKey));
  return row ? readExplanation(row.id) : null;
}

/** 输入指纹相同则视为同一内容：只有输入或质量状态变了才需要新版本 */
export function explanationIdByFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const row = db()
    .prepare('SELECT id FROM explanations WHERE input_fingerprint = ? ORDER BY generated_at DESC LIMIT 1')
    .get(String(fingerprint));
  return row?.id ?? null;
}

export function listExplanationEvidence(explanationId) {
  return db()
    .prepare(
      `SELECT e.id, e.hypothesis_id, e.role, e.payload
         FROM explanation_evidence l JOIN evidence e ON e.id = l.evidence_id
        WHERE l.explanation_id = ?
        ORDER BY e.id ASC`,
    )
    .all(String(explanationId))
    .map((r) => ({
      id: r.id,
      hypothesisId: r.hypothesis_id,
      role: r.role,
      payload: parseJson(r.payload) ?? {},
    }));
}

/**
 * 清理不被任何解释引用的证据。
 *
 * 只删「没有关联行」的证据：仍被引用的版本必须留下，否则历史解释点开依据
 * 会变成空白。解释与观测版本本身不在这里删 —— 它们是不可变历史。
 */
export function pruneUnlinkedEvidence() {
  const res = db()
    .prepare('DELETE FROM evidence WHERE id NOT IN (SELECT evidence_id FROM explanation_evidence)')
    .run();
  return Number(res?.changes ?? 0);
}

export function countExplanations() {
  const row = db().prepare('SELECT COUNT(*) AS n FROM explanations').get();
  return Number(row?.n ?? 0);
}

/* ------------------------------------------------------------------ *
 * 采集状态
 * ------------------------------------------------------------------ */

export function recordCollectionSuccess(jobKey, atMs = Date.now()) {
  db()
    .prepare(
      `INSERT INTO collection_state (job_key, last_success_at, last_error, last_error_at, fails, backoff_until, inflight)
       VALUES (?, ?, NULL, NULL, 0, NULL, 0)
       ON CONFLICT(job_key) DO UPDATE SET
         last_success_at = excluded.last_success_at,
         -- 成功即恢复健康：错误与退避描述的是「当前状态」，不是历史
         last_error = NULL, last_error_at = NULL,
         fails = 0, backoff_until = NULL, inflight = 0`,
    )
    .run(String(jobKey), Number(atMs));
}

export function recordCollectionFailure(jobKey, error, { atMs = Date.now(), backoffUntil = null } = {}) {
  db()
    .prepare(
      `INSERT INTO collection_state (job_key, last_success_at, last_error, last_error_at, fails, backoff_until, inflight)
       VALUES (?, NULL, ?, ?, 1, ?, 0)
       ON CONFLICT(job_key) DO UPDATE SET
         last_error = excluded.last_error,
         last_error_at = excluded.last_error_at,
         fails = collection_state.fails + 1,
         backoff_until = excluded.backoff_until,
         inflight = 0`,
    )
    .run(String(jobKey), String(error ?? 'unknown'), Number(atMs), backoffUntil == null ? null : Number(backoffUntil));
}

export function readCollectionState(jobKey) {
  const row = db().prepare('SELECT * FROM collection_state WHERE job_key = ?').get(String(jobKey));
  if (!row) return null;
  return {
    jobKey: row.job_key,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    fails: row.fails,
    backoffUntil: row.backoff_until,
    inflight: row.inflight,
  };
}

export function listCollectionStates() {
  return db()
    .prepare('SELECT * FROM collection_state ORDER BY job_key ASC')
    .all()
    .map((row) => ({
      jobKey: row.job_key,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
      lastErrorAt: row.last_error_at,
      fails: row.fails,
      backoffUntil: row.backoff_until,
    }));
}

/** 诊断用：schema 版本是否已到当前代码期望值 */
export function explanationStorageStatus() {
  const d = db();
  return {
    schemaVersion: schemaVersionOf(d),
    expectedSchemaVersion: SCHEMA_VERSION,
    observations: countObservationRevisions(),
    explanations: countExplanations(),
  };
}
