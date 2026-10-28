/* ================================================================== *
 * 关注简报的服务层（产品 2.3）
 *
 * 只做三件事：拿事件、按关注资产筛、交给 domain 去重与汇总。
 * 「自上次查看」的时刻由调用方给（前端存在本地），服务端不猜 ——
 * 猜成「最近 24 小时」会让三天没来的用户看不到三天前那件事。
 * ================================================================== */

import { getEvents } from './events.service.js';
import { buildWatchBrief, summarizeBrief } from '../domain/watch-brief.js';

/** 简报上限：简报不该变成第二份事件流 */
export const BRIEF_LIMIT = 6;
/** 没有 lastSeen 时的默认回看窗口（首次使用） */
export const DEFAULT_LOOKBACK_MS = 24 * 3600_000;

/**
 * @param {{ assets?: string[], watchedKeys?: string[], sinceMs?: number|null,
 *           nowMs?: number, limit?: number, deps?: { getEvents?: Function } }} opts
 */
export async function getWatchBrief({
  assets = [],
  watchedKeys = [],
  sinceMs = null,
  nowMs = Date.now(),
  limit = BRIEF_LIMIT,
  deps = {},
} = {}) {
  const watchedAssets = new Set((assets ?? []).filter(Boolean));

  // 没选关注问题就不去拉事件：省一次上游，也避免「凑几条给你看」
  if (!watchedKeys.length || !watchedAssets.size) {
    return {
      ...summarizeBrief({ items: [], watchedKeys, sinceMs, nowMs }),
      watchedKeys,
      assets: [...watchedAssets],
    };
  }

  /**
   * 注意 `Number(null)` 是 0，`Number.isFinite(0)` 是 true —— 直接判 isFinite
   * 会把「没给 sinceMs」当成「从 1970 年开始看」，于是把全部历史都算成新变化。
   * 必须先显式排除 null / undefined。
   */
  const hasSince = sinceMs != null && sinceMs !== '' && Number.isFinite(Number(sinceMs));
  const since = hasSince ? Number(sinceMs) : nowMs - DEFAULT_LOOKBACK_MS;
  const load = deps.getEvents ?? getEvents;

  let payload = null;
  try {
    payload = await load({ force: false, limit: 160 });
  } catch (err) {
    return {
      ...summarizeBrief({ items: [], watchedKeys, sinceMs: since, nowMs }),
      ok: false,
      status: 'unavailable',
      // 放在 summarizeBrief 之后：否则会被它的 reason（NO_CHANGES）盖掉
      reason: String(err?.message ?? err),
      watchedKeys,
      assets: [...watchedAssets],
    };
  }

  const items = buildWatchBrief({
    items: payload?.items ?? [],
    watchedAssets,
    sinceMs: since,
    nowMs,
    limit,
  });
  return {
    ok: true,
    status: 'ok',
    ...summarizeBrief({ items, watchedKeys, sinceMs: since, nowMs }),
    watchedKeys,
    assets: [...watchedAssets],
  };
}
