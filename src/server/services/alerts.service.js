/* ================================================================== *
 * 预警服务（Phase 3 / P3-T2）
 *
 * domain/alerts.js 只回答「哪些条件命中」；这里负责：
 *   · 规则的 CRUD 与参数校验（不合法的请求在进数据库之前就挡住）；
 *   · 把命中结果追加进 alert_events、回写 last_triggered_at（冷却去重）；
 *   · 通过 SSE hub 广播 `alert` 帧。
 *
 * db 可注入：单测用 :memory:，生产走 getDb() 单例。所有写都在同步事务里，
 * 「记事件」与「更新冷却时间」要么一起成功要么一起回滚 —— 否则会重复轰炸。
 * ================================================================== */

import { randomUUID } from 'node:crypto';
import { evaluateAlertRules, ALERT_KINDS, OPERATORS, DEFAULT_COOLDOWN_MS } from '../domain/alerts.js';
import { getDb } from '../db/index.js';

const RULE_COLUMNS = 'id, name, kind, target_id, operator, threshold, enabled, cooldown_ms, last_triggered_at, created_at';

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 校验并归一化一条规则输入；抛出的错误带字段名，供 HTTP 层转 400 */
export function normalizeRuleInput(input = {}, { partial = false } = {}) {
  const out = {};
  const require = (cond, field) => {
    if (!cond) throw new Error(`invalid ${field}`);
  };
  if (!partial || 'name' in input) {
    require(typeof input.name === 'string' && input.name.trim().length > 0, 'name');
    out.name = input.name.trim().slice(0, 120);
  }
  if (!partial || 'kind' in input) {
    require(ALERT_KINDS.includes(input.kind), 'kind');
    out.kind = input.kind;
  }
  if (!partial || 'target_id' in input) {
    require(typeof input.target_id === 'string' && input.target_id.trim().length > 0, 'target_id');
    out.target_id = input.target_id.trim().slice(0, 120);
  }
  if (!partial || 'operator' in input) {
    require(OPERATORS.includes(input.operator), 'operator');
    out.operator = input.operator;
  }
  if ('threshold' in input) out.threshold = numOrNull(input.threshold);
  else if (!partial) out.threshold = null;
  if ('enabled' in input) out.enabled = input.enabled === false || input.enabled === 0 ? 0 : 1;
  else if (!partial) out.enabled = 1;
  if ('cooldown_ms' in input) {
    const v = Number(input.cooldown_ms);
    out.cooldown_ms = Number.isFinite(v) && v >= 0 ? Math.floor(v) : DEFAULT_COOLDOWN_MS;
  } else if (!partial) out.cooldown_ms = DEFAULT_COOLDOWN_MS;
  if (partial && 'mode' in input) out.mode = input.mode === 'abs_pct' ? 'abs_pct' : 'signed';
  else if (!partial && 'mode' in input) out.mode = input.mode === 'abs_pct' ? 'abs_pct' : 'signed';
  if ('id' in input && typeof input.id === 'string' && input.id.trim()) out.id = input.id.trim().slice(0, 120);
  return out;
}

/**
 * @param {{ db?:any, now?:()=>number, sseHub?:object, idFactory?:()=>string }} opts
 */
export function createAlertsService(opts = {}) {
  const db = opts.db ?? getDb();
  const now = opts.now ?? (() => Date.now());
  const sseHub = opts.sseHub ?? null;
  const newId = opts.idFactory ?? (() => `alr_${randomUUID()}`);

  function listRules() {
    return db.prepare(`SELECT ${RULE_COLUMNS} FROM alert_rules ORDER BY created_at DESC, id ASC`).all();
  }

  function getRule(id) {
    return db.prepare(`SELECT ${RULE_COLUMNS} FROM alert_rules WHERE id = ?`).get(id) ?? null;
  }

  function createRule(input) {
    const r = normalizeRuleInput(input);
    const row = {
      id: r.id ?? newId(),
      name: r.name,
      kind: r.kind,
      target_id: r.target_id,
      operator: r.operator,
      threshold: r.threshold ?? null,
      enabled: r.enabled,
      cooldown_ms: r.cooldown_ms,
      last_triggered_at: null,
      created_at: now(),
    };
    db.prepare(`INSERT INTO alert_rules (${RULE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(row.id, row.name, row.kind, row.target_id, row.operator, row.threshold,
        row.enabled, row.cooldown_ms, row.last_triggered_at, row.created_at);
    return { ...row, mode: r.mode ?? 'signed' };
  }

  function updateRule(id, patch) {
    const current = getRule(id);
    if (!current) return null;
    const p = normalizeRuleInput(patch, { partial: true });
    const allowed = ['name', 'kind', 'target_id', 'operator', 'threshold', 'enabled', 'cooldown_ms'];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (!(key in p)) continue;
      sets.push(`${key} = ?`);
      values.push(p[key]);
    }
    if (sets.length) db.prepare(`UPDATE alert_rules SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    return getRule(id);
  }

  function deleteRule(id) {
    return db.prepare('DELETE FROM alert_rules WHERE id = ?').run(id).changes > 0;
  }

  function listEvents(limit = 50) {
    const n = Math.max(1, Math.min(500, Math.floor(Number(limit) || 50)));
    return db.prepare(
      'SELECT id, rule_id, kind, target_id, title, message, observed_value, triggered_at FROM alert_events ORDER BY triggered_at DESC, id DESC LIMIT ?',
    ).all(n);
  }

  /** 把命中结果落库 + 回写冷却；一个事务里完成 */
  function persistHits(hits) {
    if (!hits.length) return;
    const insert = db.prepare(`INSERT INTO alert_events
      (rule_id, kind, target_id, title, message, observed_value, triggered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const touch = db.prepare('UPDATE alert_rules SET last_triggered_at = ? WHERE id = ?');
    db.exec('BEGIN');
    try {
      for (const h of hits) {
        insert.run(h.ruleId, h.kind, h.targetId, h.title, h.message, h.observedValue, h.triggeredAt);
        touch.run(h.triggeredAt, h.ruleId);
      }
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 已回滚 */
      }
      throw err;
    }
  }

  /**
   * 评估当前上下文并广播命中事件。
   * @returns {object[]} 触发帧（同时是 SSE 的 payload）
   */
  function evaluate(context = {}) {
    const rules = listRules();
    const hits = evaluateAlertRules(rules, context, { nowMs: now() });
    persistHits(hits);
    for (const h of hits) {
      if (sseHub?.broadcast) {
        try {
          sseHub.broadcast('alert', {
            ruleId: h.ruleId,
            kind: h.kind,
            targetId: h.targetId,
            title: h.title,
            message: h.message,
            observedValue: h.observedValue,
            triggeredAt: h.triggeredAt,
          });
        } catch {
          // 广播失败不该让一次成功的评估判成失败
        }
      }
    }
    return hits;
  }

  return {
    listRules, getRule, createRule, updateRule, deleteRule, listEvents, evaluate,
  };
}
