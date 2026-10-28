/* ================================================================== *
 * 解释与事件版本的路由（从入口拆出来，避免 server.mjs 继续膨胀）
 *
 * 只做「URL → 服务调用 → 状态码」这一层：
 *   · 参数白名单在服务层校验（资产 / 窗口 / 版本号）；
 *   · 这里不做数值计算，也不拼解释文案；
 *   · 返回 true 表示已处理，入口继续往下走静态资源。
 *
 * 契约（方案 §8.1）：200 有快照 / 202 正在准备 / 400 参数不合法 /
 * 404 版本不存在 / 503 暂时不可用。
 * ================================================================== */

import { sendJson } from './http.js';
import {
  getExplanationResponse,
  getExplanationById,
  getExplanationHistory,
  explanationAssetIds,
  questionCandidates,
} from './services/explanations.service.js';
import { readEventRevision, listEventRevisions } from './db/index.js';

const EVENT_REV_RE = /^\/api\/events\/([^/]+)\/revisions\/(\d+)$/;
const EVENT_REVS_RE = /^\/api\/events\/([^/]+)\/revisions$/;

/**
 * @param {URL} url
 * @param {import('node:http').ServerResponse} res
 * @param {{ takeForce: (url: URL) => boolean }} deps
 * @returns {Promise<boolean>} 是否已处理
 */
export async function handleExplanationRoutes(url, res, { takeForce }) {
  if (url.pathname === '/api/explanations/meta/assets') {
    // 供首页问题卡与前端功能开关使用：哪些资产已有解释能力
    sendJson(res, 200, { ok: true, assets: questionCandidates(), enabled: explanationAssetIds() });
    return true;
  }
  if (url.pathname === '/api/explanations') {
    const asset = url.searchParams.get('asset') || 'gold-intl';
    const windowKey = url.searchParams.get('window') || 'session';
    const { status, body } = await getExplanationResponse({ asset, windowKey, force: takeForce(url) });
    sendJson(res, status, body);
    return true;
  }
  // 历史快照列表必须在 :id 之前匹配，否则 history 会被当成一个版本号
  if (url.pathname === '/api/explanations/history') {
    const asset = url.searchParams.get('asset') || 'gold-intl';
    const windowKey = url.searchParams.get('window') || 'session';
    const limit = Number(url.searchParams.get('limit') || 20);
    const { status, body } = getExplanationHistory({ asset, windowKey, limit });
    sendJson(res, status, body);
    return true;
  }
  if (url.pathname.startsWith('/api/explanations/')) {
    const id = url.pathname.slice('/api/explanations/'.length);
    if (!id || id.includes('/')) {
      sendJson(res, 400, { ok: false, error: '解释版本号不合法' });
      return true;
    }
    const { status, body } = getExplanationById(id);
    sendJson(res, status, body);
    return true;
  }
  const revMatch = EVENT_REV_RE.exec(url.pathname);
  if (revMatch) {
    const row = readEventRevision(decodeURIComponent(revMatch[1]), Number(revMatch[2]));
    if (!row) {
      sendJson(res, 404, { ok: false, error: `未知事件版本：${decodeURIComponent(revMatch[1])}#${revMatch[2]}` });
      return true;
    }
    sendJson(res, 200, { schemaVersion: 1, event: row });
    return true;
  }
  const revsMatch = EVENT_REVS_RE.exec(url.pathname);
  if (revsMatch) {
    const eventId = decodeURIComponent(revsMatch[1]);
    const rows = listEventRevisions(eventId);
    if (!rows.length) {
      sendJson(res, 404, { ok: false, error: `未知事件：${eventId}` });
      return true;
    }
    sendJson(res, 200, { schemaVersion: 1, eventId, revisions: rows });
    return true;
  }
  return false;
}
