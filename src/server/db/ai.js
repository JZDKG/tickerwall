/* ================================================================== *
 * AI 问财：模型配置与会话消息的持久层
 *
 * 只依赖 sqlite 底座与 node:crypto，不 import providers/ services/ domain/。
 * 网关调用需要明文 key，界面只需要掩码 —— 所以读取入口刻意分成两个：
 *   · getAiModel()       脱敏，可安全返回给浏览器；
 *   · getAiModelSecret() 含明文 apiKey，只许服务端网关使用。
 *
 * 时间统一存毫秒时间戳，排序与前端展示都不需要再做时区换算。
 * ================================================================== */

import { randomUUID } from 'node:crypto';
import { getDb } from './sqlite.js';

/* ------------------------------ 模型配置 ------------------------------ */

/**
 * API Key 掩码：空串保持空，短 key 只显示圆点，长 key 保留可辨识的首尾。
 * 注意返回值只用于展示，绝不能拿它去调用上游。
 */
export function maskApiKey(raw) {
  const s = raw == null ? '' : String(raw);
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 3)}••••${s.slice(-4)}`;
}

function requiredText(value, label) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) throw new Error(`${label}不能为空`);
  return s;
}

/** 校验并规范化 baseUrl：只允许 http(s)，去掉末尾斜杠便于拼路径 */
function normalizeBaseUrl(raw) {
  const input = String(raw ?? '').trim();
  if (!input) throw new Error('baseUrl 不能为空');
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('baseUrl 不是合法的 URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('baseUrl 只支持 http/https');
  }
  return url.toString().replace(/\/+$/, '');
}

/** undefined = 不修改；null / 空串 = 清空；其余必须是有限数字 */
function optionalNumber(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} 必须是数字`);
  return n;
}

function optionalPositiveInt(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} 必须是正整数`);
  return n;
}

/** 事务包装：失败整段回滚，避免「清了默认但没设新默认」的中间态 */
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* 已经回滚 */
    }
    throw err;
  }
}

/** 数据库行 → 对外模型对象；绝不带 apiKey 明文 */
function toModel(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    baseUrl: row.base_url,
    model: row.model,
    supportsTools: row.supports_tools === 1,
    temperature: row.temperature ?? null,
    maxTokens: row.max_tokens ?? null,
    isDefault: row.is_default === 1,
    hasApiKey: Boolean(row.api_key),
    apiKeyMasked: maskApiKey(row.api_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 按「默认优先、最近更新优先、id 稳定兜底」列出模型（脱敏） */
export function listAiModels() {
  const db = getDb();
  return db
    .prepare('SELECT * FROM ai_models ORDER BY is_default DESC, updated_at DESC, id ASC')
    .all()
    .map(toModel);
}

/** 单个模型（脱敏），不存在返回 null */
export function getAiModel(id) {
  const db = getDb();
  return toModel(db.prepare('SELECT * FROM ai_models WHERE id = ?').get(String(id)));
}

/**
 * 网关专用：返回含明文 apiKey 的完整配置。
 * 调用方必须保证结果不进入 HTTP 响应或日志。
 */
export function getAiModelSecret(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(String(id));
  if (!row) return null;
  return { ...toModel(row), apiKey: row.api_key };
}

/**
 * 新增或更新模型。
 * 更新时 apiKey 传 undefined / null 表示保留原值，传空串表示清空 ——
 * 这样界面回填掩码后直接提交也不会把 key 抹掉。
 */
export function upsertAiModel(input = {}) {
  const db = getDb();
  const id = input.id == null || String(input.id).trim() === '' ? randomUUID() : String(input.id).trim();
  const name = requiredText(input.name, '模型名称');
  const protocol = requiredText(input.protocol, '协议').toLowerCase();
  if (protocol !== 'openai' && protocol !== 'anthropic') {
    throw new Error('协议必须是 openai 或 anthropic');
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const model = requiredText(input.model, '模型标识');
  const supportsTools = input.supportsTools === undefined ? undefined : input.supportsTools ? 1 : 0;
  const temperature = optionalNumber(input.temperature, 'temperature');
  const maxTokens = optionalPositiveInt(input.maxTokens, 'maxTokens');
  const now = Date.now();

  transaction(db, () => {
    const existing = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(id);
    const count = db.prepare('SELECT COUNT(*) AS n FROM ai_models').get().n;

    const apiKey =
      input.apiKey === undefined || input.apiKey === null
        ? existing?.api_key ?? ''
        : String(input.apiKey);

    // 首条模型自动成为默认；显式 isDefault=true 抢占唯一默认；
    // 显式 false 只取消当前这条，不自动补位（删默认模型时才会补）。
    let isDefault;
    if (input.isDefault === true || (!existing && count === 0)) isDefault = 1;
    else if (input.isDefault === false) isDefault = 0;
    else isDefault = existing?.is_default ?? 0;

    if (isDefault === 1) db.prepare('UPDATE ai_models SET is_default = 0 WHERE is_default = 1').run();

    if (existing) {
      db.prepare(
        `UPDATE ai_models
            SET name = ?, protocol = ?, base_url = ?, api_key = ?, model = ?,
                supports_tools = ?, temperature = ?, max_tokens = ?, is_default = ?, updated_at = ?
          WHERE id = ?`,
      ).run(
        name,
        protocol,
        baseUrl,
        apiKey,
        model,
        supportsTools === undefined ? existing.supports_tools : supportsTools,
        temperature === undefined ? existing.temperature : temperature,
        maxTokens === undefined ? existing.max_tokens : maxTokens,
        isDefault,
        now,
        id,
      );
    } else {
      db.prepare(
        `INSERT INTO ai_models
          (id, name, protocol, base_url, api_key, model, supports_tools, temperature, max_tokens, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        name,
        protocol,
        baseUrl,
        apiKey,
        model,
        supportsTools ?? 1,
        temperature ?? null,
        maxTokens ?? null,
        isDefault,
        now,
        now,
      );
    }
  });

  return getAiModel(id);
}

/** 删除模型；删掉默认模型时把最近更新的一条剩余模型补为默认 */
export function deleteAiModel(id) {
  const db = getDb();
  return transaction(db, () => {
    const existing = db.prepare('SELECT id, is_default FROM ai_models WHERE id = ?').get(String(id));
    if (!existing) return false;
    db.prepare('DELETE FROM ai_models WHERE id = ?').run(existing.id);
    if (existing.is_default === 1) {
      const next = db.prepare('SELECT id FROM ai_models ORDER BY updated_at DESC, id ASC LIMIT 1').get();
      if (next) db.prepare('UPDATE ai_models SET is_default = 1 WHERE id = ?').run(next.id);
    }
    return true;
  });
}

/** 指定默认模型；id 不存在时返回 false 且不改动现有默认 */
export function setDefaultAiModel(id) {
  const db = getDb();
  return transaction(db, () => {
    const existing = db.prepare('SELECT id FROM ai_models WHERE id = ?').get(String(id));
    if (!existing) return false;
    db.prepare('UPDATE ai_models SET is_default = 0 WHERE is_default = 1').run();
    db.prepare('UPDATE ai_models SET is_default = 1 WHERE id = ?').run(existing.id);
    return true;
  });
}

/* ------------------------------ 会话与消息 ------------------------------ */

function toSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    modelId: row.model_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 历史脏数据或半截 JSON 不应该让整个会话读不出来 */
function parseToolTrace(raw) {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    toolTrace: parseToolTrace(row.tool_trace_json),
    modelLabel: row.model_label ?? null,
    createdAt: row.created_at,
  };
}

/** 新建会话；标题为空时给一个可直接展示的默认名 */
export function createAiSession({ id = null, title = '', modelId = null } = {}) {
  const db = getDb();
  const sessionId = id == null || String(id).trim() === '' ? randomUUID() : String(id).trim();
  const finalTitle = String(title ?? '').trim() || '新对话';
  const now = Date.now();
  db.prepare(
    'INSERT INTO ai_sessions (id, title, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(sessionId, finalTitle, modelId == null ? null : String(modelId), now, now);
  return getAiSession(sessionId);
}

/** 会话列表（默认 30 条），不带消息体，按最近活跃倒序 */
export function listAiSessions({ limit = 30 } = {}) {
  const db = getDb();
  const n = Number.isFinite(Number(limit)) ? Math.max(0, Math.trunc(Number(limit))) : 30;
  return db
    .prepare('SELECT * FROM ai_sessions ORDER BY updated_at DESC, id ASC LIMIT ?')
    .all(n)
    .map(toSession);
}

/** 会话详情：messages 按时间升序回放，toolTrace 解析失败时降级为 null */
export function getAiSession(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ai_sessions WHERE id = ?').get(String(id));
  if (!row) return null;
  const messages = db
    .prepare('SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC')
    .all(row.id)
    .map(toMessage);
  return { ...toSession(row), messages };
}

/**
 * 更新会话标题 / 绑定模型并刷新活跃时间。
 * patch.title 为空时不覆盖原标题；modelId 传 null 表示解绑。
 */
export function touchAiSession(id, patch = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ai_sessions WHERE id = ?').get(String(id));
  if (!row) return null;
  const title =
    patch.title === undefined ? row.title : String(patch.title ?? '').trim() || row.title;
  const modelId =
    patch.modelId === undefined
      ? row.model_id
      : patch.modelId === null
        ? null
        : String(patch.modelId);
  const now = Date.now();
  db.prepare('UPDATE ai_sessions SET title = ?, model_id = ?, updated_at = ? WHERE id = ?').run(
    title,
    modelId,
    now,
    row.id,
  );
  return toSession({ ...row, title, model_id: modelId, updated_at: now });
}

/** 删除会话；ai_messages 靠外键 ON DELETE CASCADE 一并清掉 */
export function deleteAiSession(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM ai_sessions WHERE id = ?').run(String(id));
  return Number(result.changes) > 0;
}

/**
 * 追加一条消息，并在同一事务里推进会话 updated_at。
 * 两步必须同成同败，否则会话列表的排序会和实际消息对不上。
 */
export function appendAiMessage({ sessionId, role, content = '', toolTrace = null, modelLabel = null } = {}) {
  const db = getDb();
  if (role !== 'user' && role !== 'assistant') throw new Error('role 必须是 user 或 assistant');
  const sid = String(sessionId ?? '').trim();
  if (!sid) throw new Error('sessionId 不能为空');
  const id = randomUUID();
  let createdAt = Date.now();
  // 字符串按原样存（调用方可能已经序列化好），对象/数组才 JSON.stringify
  const traceJson =
    toolTrace == null ? null : typeof toolTrace === 'string' ? toolTrace : JSON.stringify(toolTrace);

  transaction(db, () => {
    const session = db.prepare('SELECT id FROM ai_sessions WHERE id = ?').get(sid);
    if (!session) throw new Error('会话不存在');
    // 同一毫秒内连续追加（user → assistant、多段工具轨迹）时 created_at 会并列，
    // 仅靠 UUID 兜底排序就变成随机顺序。这里把时间戳严格推后 1ms，
    // 保证回放顺序永远等于追加顺序。
    const last = db
      .prepare('SELECT MAX(created_at) AS ts FROM ai_messages WHERE session_id = ?')
      .get(sid);
    if (last?.ts != null && Number(last.ts) >= createdAt) createdAt = Number(last.ts) + 1;
    db.prepare(
      `INSERT INTO ai_messages
        (id, session_id, role, content, tool_trace_json, model_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      sid,
      role,
      String(content ?? ''),
      traceJson,
      modelLabel == null ? null : String(modelLabel),
      createdAt,
    );
    db.prepare('UPDATE ai_sessions SET updated_at = ? WHERE id = ?').run(createdAt, sid);
  });

  return toMessage(db.prepare('SELECT * FROM ai_messages WHERE id = ?').get(id));
}
