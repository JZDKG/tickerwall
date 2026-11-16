/* ================================================================== *
 * 路由请求体读取（/api/alerts 与 /api/ai 共用）
 *
 * 两种来源：Node 原生 req 是流（生产），单测直接把对象塞在 req.body。
 * 统一在这里读，别让每个路由各写一套；坏 JSON / 超限体由调用方转 400。
 * ================================================================== */

export const MAX_BODY_BYTES = 64 * 1024;

/** 读请求体：支持「已解析对象」「JSON 字符串」与「可读流」三种形态 */
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
