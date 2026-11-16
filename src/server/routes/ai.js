/* ================================================================== *
 * AI 问财路由：模型配置、会话 CRUD 与 SSE 问答。
 *
 * ask 是长连接：先落 SSE 响应头，再逐个写 event/data 帧。
 * 客户端断开通过响应流 close 感知；请求体未读完时的 req close 也视为中断。
 * Node 在请求体读完后同样会触发 req close，因此必须用 req.complete 区分。
 * ================================================================== */

import { sendJson } from '../http.js';
import { readJsonBody } from './body.js';

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function badRequest(res, message) {
  sendJson(res, 400, { ok: false, error: message });
}

function failFromError(res, err) {
  // SSE 头已发出后不能再写 JSON，否则会抛 ERR_HTTP_HEADERS_SENT
  if (res.headersSent) {
    if (!res.writableEnded && !res.destroyed) res.end();
    return;
  }
  if (err?.statusCode) {
    sendJson(res, err.statusCode, { ok: false, error: err.message, code: err.code ?? null });
    return;
  }
  const message = err?.message ?? '';
  const bad =
    message.startsWith('invalid ') ||
    message.includes('JSON') ||
    message.includes('body') ||
    /不能为空|不合法|不支持|必须是|缺少/.test(message);
  sendJson(res, bad ? 400 : 500, { ok: false, error: bad ? message : '服务器内部错误' });
}

async function readObjectBody(req) {
  const body = await readJsonBody(req);
  if (!isPlainObject(body)) {
    const err = new Error('请求体必须是 JSON 对象');
    err.statusCode = 400;
    throw err;
  }
  return body;
}

async function handleModels(req, res, service) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const payload = service.listModels() ?? {};
    sendJson(res, 200, { ok: true, models: payload.models ?? [], envPreset: payload.envPreset ?? null });
    return;
  }

  const body = await readObjectBody(req);
  const action = typeof body.action === 'string' ? body.action : '';

  if (action === 'delete' || action === 'set_default') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return badRequest(res, '缺少 id');
    if (action === 'delete') {
      sendJson(res, 200, { ok: true, deleted: service.removeModel(id) });
    } else {
      sendJson(res, 200, { ok: true, updated: service.setDefaultModel(id) });
    }
    return;
  }

  if (action === 'test') {
    const result = await service.testModel(body);
    sendJson(res, 200, { ok: true, result });
    return;
  }

  const model = service.saveModel(body);
  sendJson(res, 200, { ok: true, model });
}

async function handleSessions(req, res, service, url) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (url.pathname === '/api/ai/sessions') {
      sendJson(res, 200, { ok: true, sessions: service.listSessions() ?? [] });
      return;
    }
    const id = decodeURIComponent(url.pathname.slice('/api/ai/sessions/'.length));
    const session = id ? service.getSession(id) : null;
    if (!session) {
      sendJson(res, 404, { ok: false, error: '会话不存在' });
      return;
    }
    sendJson(res, 200, { ok: true, session });
    return;
  }

  const body = await readObjectBody(req);
  if (body.action === 'delete') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return badRequest(res, '缺少 id');
    sendJson(res, 200, { ok: true, deleted: service.removeSession(id) });
    return;
  }

  const session = service.createSession({
    title: typeof body.title === 'string' ? body.title : '',
    modelId: body.modelId ?? null,
  });
  sendJson(res, 200, { ok: true, session });
}

async function handleAsk(req, res, service) {
  let body;
  try {
    body = await readObjectBody(req);
  } catch (err) {
    failFromError(res, err);
    return;
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    badRequest(res, '问题不能为空');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const controller = new AbortController();
  let finished = false;
  const onReqClose = () => {
    // 请求体读完后 req 也会 close；只有未读完才是真正的客户端中断
    if (!finished && req.complete !== true) controller.abort();
  };
  const onResClose = () => {
    if (!finished) controller.abort();
  };
  req.on?.('close', onReqClose);
  res.on?.('close', onResClose);

  const writeEvent = (ev) => {
    if (finished || res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    } catch {
      controller.abort();
    }
  };

  try {
    await service.ask(
      {
        sessionId: body.sessionId ?? null,
        modelId: body.modelId ?? null,
        question,
        context: isPlainObject(body.context) ? body.context : null,
        signal: controller.signal,
      },
      writeEvent,
    );
  } catch (err) {
    writeEvent({
      type: 'error',
      error: err?.message ?? '服务器内部错误',
      code: err?.code ?? null,
    });
  } finally {
    finished = true;
    req.off?.('close', onReqClose);
    res.off?.('close', onResClose);
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ service: object|null, url: URL }} ctx
 */
export async function handleAiRoutes(req, res, { service = null, url } = {}) {
  if (!service) {
    sendJson(res, 503, { ok: false, error: 'AI 服务未启用' });
    return;
  }

  const pathname = url?.pathname ?? '/api/ai';
  try {
    if (pathname === '/api/ai/models') {
      await handleModels(req, res, service);
      return;
    }
    if (pathname === '/api/ai/sessions' || pathname.startsWith('/api/ai/sessions/')) {
      await handleSessions(req, res, service, url);
      return;
    }
    if (pathname === '/api/ai/stock') {
      const code = (url.searchParams.get('code') ?? '').trim();
      if (!code) {
        badRequest(res, '缺少 code');
        return;
      }
      sendJson(res, 200, await service.getStockPreview(code));
      return;
    }
    if (pathname === '/api/ai/ask' && req.method === 'POST') {
      await handleAsk(req, res, service);
      return;
    }
    sendJson(res, 404, { ok: false, error: '未知的 AI 接口' });
  } catch (err) {
    failFromError(res, err);
  }
}
