/* ================================================================== *
 * 把关注简报接进启动流程（产品 2.3 的最后一段）
 *
 * 之前的模块都只是「可被调用」：问题清单、简报判定、卡片、挂载点。
 * 这一段负责把它们连起来，否则选择面板永远没人点得到、简报永远不刷新。
 *
 * 时序（每一条都有理由）：
 *   1. 先从本地读关注项 —— 没选就只拉台账，不拉简报（省一次上游）；
 *   2. 简报用「上次查看时刻」当窗口，**渲染成功后才写新的 lastSeen**；
 *      先写会让这次都没看到的条目永远消失；
 *   3. 两块各自独立失败：简报挂了台账照常显示；
 *   4. 「选择关心的问题」点开面板 → 勾选立即存本地并重新拉简报。
 * ================================================================== */

import { createApi } from '../shared/api.js';
import { html } from '../shared/format.js';
import {
  WATCH_QUESTIONS,
  assetsOf,
  normalizeWatched,
  readWatched,
  toggleWatched,
  writeWatched,
} from '../shared/watchlist.js';
import { readLastSeen, writeLastSeen } from './watch-brief.js';
import { renderHomeBrief, watchPickerHTML } from './home-brief.js';

const api = createApi({ base: './' });

/** 拉简报：没关注项时直接返回 NO_WATCH，不去请求 */
export async function fetchBrief({ watched, sinceMs, fetchJson = null }) {
  const keys = normalizeWatched(watched);
  if (!keys.length) return { ok: true, status: 'ok', reason: 'NO_WATCH', items: [], empty: true, count: 0, watchedKeys: [] };
  const assets = [...assetsOf(keys)];
  const params = { assets: assets.join(','), keys: keys.join(',') };
  if (sinceMs) params.since = String(sinceMs);

  const get = fetchJson ?? (async (p) => (await api.get(p, { params })).data);
  try {
    return await get('api/brief', params);
  } catch (err) {
    // 简报取不到是「暂时不可用」，不是「没有变化」——这两句对读者不同
    return { ok: false, status: 'unavailable', reason: String(err?.message ?? err), items: [], empty: true, count: 0, watchedKeys: keys };
  }
}

export async function fetchLifePath({ scenario = 'fuel-cost', fetchJson = null } = {}) {
  const get = fetchJson ?? (async (p) => (await api.get(p)).data);
  try {
    return await get(`api/life-path?scenario=${encodeURIComponent(scenario)}`);
  } catch {
    // 生活场景取不到就不渲染那一块（它本来就是「额外一块」）
    return null;
  }
}

export async function fetchLedger({ fetchJson = null } = {}) {
  const get = fetchJson ?? (async (p) => (await api.get(p)).data);
  try {
    return await get('api/expectations');
  } catch (err) {
    return { ok: false, status: 'unavailable', reason: String(err?.message ?? err), total: 0, released: [], pending: [], deviated: [] };
  }
}

/**
 * 一次完整的首屏刷新。
 *
 * @param {{ host: HTMLElement|null, storage: Storage|null, nowMs?: number,
 *           fetchJson?: Function|null }} opts
 */
export async function refreshHomeBrief({ host, storage, nowMs = Date.now(), fetchJson = null } = {}) {
  const watched = readWatched(storage);
  const sinceMs = readLastSeen(storage);

  const [brief, ledger, lifePath] = await Promise.all([
    fetchBrief({ watched, sinceMs, fetchJson }),
    fetchLedger({ fetchJson }),
    fetchLifePath({ fetchJson }),
  ]);

  renderHomeBrief(host, brief, ledger, {
    lifePath,
    onPick: () => openPicker({ host, storage, fetchJson, nowMs }),
  });

  /**
   * 只在简报这次真的读到了内容之后才推进 lastSeen。
   * 先写会让「这次都没显示出来的条目」永远消失 —— 那是最坏的一种丢数据。
   */
  if (brief?.ok !== false && brief?.reason !== 'NO_CHANGE_PLACEHOLDER') {
    writeLastSeen(storage, nowMs);
  }
  return { brief, ledger, watched };
}

/** 打开选择面板；每次切换立即存本地并重拉简报 */
export async function openPicker({ host, storage, fetchJson = null, nowMs = Date.now() } = {}) {
  if (!host) return null;
  const chosen = readWatched(storage);
  host.hidden = false;
  host.innerHTML = html`<section class="d-block wp-host">${watchPickerHTML(WATCH_QUESTIONS, chosen)}</section>`.toString();

  const onChange = async (key) => {
    const cur = readWatched(storage);
    const { keys, changed } = toggleWatched(cur, key);
    if (!changed) return;
    writeWatched(storage, keys);
    await refreshHomeBrief({ host, storage, fetchJson, nowMs: Date.now() });
  };

  host.querySelectorAll('[data-watch]').forEach((input) => {
    input.addEventListener('change', () => onChange(input.dataset.watch));
  });
  return { chosen };
}
