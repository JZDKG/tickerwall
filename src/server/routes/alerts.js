/* ================================================================== *
 * /api/alerts 路由（Phase 3 / P3-T2）
 *
 * GET  → { ok:true, rules, recentEvents }
 * POST → 创建/更新规则（无 action）、删除（action=delete）、手动评估（action=evaluate）
 *
 * 请求体来源有两种：Node 原生 req 是流（生产），单测直接把对象塞在 req.body。
 * 统一在这里读，别让调用方各写一套；坏 JSON / 超限体一律 400。
 * ================================================================== */

import { sendJson } from '../http.js';

const MAX_BODY_BYTES = 64 * 1024;

/** 读请求体：支持「已解析对象」与「可读流」两种形态 */
export async function readJsonBody(req) {
  if (req?.body != null && typeof req.body === 'object') return req.body;
  if (typeof req?.body === 'string') {
    if (!req.body.trim()) return {};
    return JSON.parse(req.body);
  }
  // 生产里 req 是 IncomingMessage（async iterable）；单测/轻量调用可能只给一个
  // 普通对象且没有 body。没有可迭代流就当空体，别把「没带 body」变成 500。
  if (typeof req?.[Symbol.asyncIterator] !== 'function') return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ service:object|null }} deps
 */
export async function handleAlertsRoutes(req, res, { service } = {}) {
  if (!service) return sendJson(res, 503, { ok: false, error: '预警服务未启用' });

  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return sendJson(res, 200, {
        ok: true,
        rules: service.listRules(),
        recentEvents: service.listEvents(50),
      });
    }

    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { ok: false, error: '请求体必须是 JSON 对象' });
    }

    if (body.action === 'delete') {
      if (typeof body.id !== 'string' || !body.id) {
        return sendJson(res, 400, { ok: false, error: '缺少 id' });
      }
      return sendJson(res, 200, { ok: true, deleted: service.deleteRule(body.id) });
    }

    if (body.action === 'evaluate') {
      const context = body.context && typeof body.context === 'object' ? body.context : {};
      const triggered = service.evaluate(context);
      return sendJson(res, 200, { ok: true, triggered });
    }

    // 创建或更新：带 id 且已存在 → 更新；否则新建
    let rule;
    if (body.id && service.getRule(body.id)) {
      rule = service.updateRule(body.id, body);
    } else {
      rule = service.createRule(body);
    }
    return sendJson(res, 200, { ok: true, rule });
  } catch (err) {
    const message = String(err?.message ?? err);
    const bad = message.startsWith('invalid ') || message.includes('JSON') || message.includes('body');
    return sendJson(res, bad ? 400 : 500, { ok: false, error: bad ? message : '服务器内部错误' });
  }
}
