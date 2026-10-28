/* ================================================================== *
 * 请求状态与数据缓存（方案 E07 / §8）
 *
 * 要解决的具体问题：`shared/store.js` 把「接口缓存」和「界面状态」混在一个对象
 * 里（quotes / calendar / events / macro 各自一份 {data, at}），于是：
 *
 *   · 视图各自判断「有没有数据、要不要刷新」，判断口径不一致；
 *   · 首页、详情、图谱、地图可能展示**不同批次**的解释，谁也不知道自己旧了；
 *   · 刷新失败时只有一个 `at` 时间戳，看不出「这次刷新挂了」。
 *
 * 这里把一个键的状态拆成明确的五个字段：
 *
 *   data         最近一次成功的数据
 *   fetchedAt    那次成功的时间（**不是观测时间**，界面不能拿它当行情时间）
 *   error        最近一次失败（成功后清空）
 *   refreshStatus idle | pending | failed
 *   inflight     进行中的 Promise（同键复用）
 *
 * 并保证两件事：
 *   1. 失败**不覆盖** data（旧数据继续显示，但 refreshStatus=failed 要说出来）；
 *   2. 订阅者拿到的是同一个快照对象，视图之间不会再各存一份。
 * ================================================================== */

import { ApiError, ApiErrorKind } from './api.js';

/**
 * @typedef {'idle'|'pending'|'failed'} RefreshStatus
 * @typedef {{data:any, fetchedAt:number|null, error:ApiError|null, refreshStatus:RefreshStatus, inflight:Promise<any>|null}} QueryEntry
 */

/**
 * @param {object} [opts]
 * @param {{get:Function}} opts.api createApi 的产物
 * @param {() => number} [opts.now]
 */
export function createQueryCache({ api, now = () => Date.now() } = {}) {
  if (!api?.get) throw new Error('queryCache 需要一个 api 客户端');
  /** key → QueryEntry */
  const entries = new Map();
  /** key → Set<listener> */
  const listeners = new Map();

  const empty = () => ({ data: null, fetchedAt: null, error: null, refreshStatus: 'idle', inflight: null });

  const snapshotOf = (key) => {
    const e = entries.get(key) ?? empty();
    // 快照是**拷贝**：视图拿着它不会被后续刷新改掉
    return { key, data: e.data, fetchedAt: e.fetchedAt, error: e.error, refreshStatus: e.refreshStatus };
  };

  function notify(key, extra = null) {
    const snap = snapshotOf(key);
    for (const fn of listeners.get(key) ?? []) fn(extra ? { ...snap, ...extra } : snap);
  }

  function subscribe(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    fn(snapshotOf(key));
    return () => listeners.get(key)?.delete(fn);
  }

  /** 读快照（不发请求） */
  function peek(key) {
    return snapshotOf(key);
  }

  /**
   * 取数据。
   *
   * @param {string} key 缓存键（通常是接口路径 + 参数，语义由调用方定）
   * @param {object} opts
   * @param {string} opts.path 请求路径
   * @param {object} [opts.params]
   * @param {number} [opts.maxAgeMs] 超过则刷新（默认 0 = 每次都刷新）
   * @param {boolean} [opts.force]
   */
  async function fetchKey(key, { path, params = null, maxAgeMs = 0, force = false } = {}) {
    const entry = entries.get(key) ?? empty();
    entries.set(key, entry);

    const fresh = entry.data != null && entry.fetchedAt != null && now() - entry.fetchedAt <= maxAgeMs;
    if (!force && fresh) return snapshotOf(key);

    // 同键在跑：复用同一个 Promise（与服务端同键合并对称）
    if (entry.inflight) return entry.inflight;

    entry.refreshStatus = 'pending';
    notify(key, { refreshStatus: 'pending' });

    entry.inflight = (async () => {
      try {
        const { data, fetchedAt } = await api.get(path, { params });
        entry.data = data;
        entry.fetchedAt = fetchedAt ?? now();
        entry.error = null;
        entry.refreshStatus = 'idle';
        return snapshotOf(key);
      } catch (err) {
        const error = err instanceof ApiError ? err : new ApiError(ApiErrorKind.network, String(err?.message ?? err));
        // 主动取消不算「刷新失败」：那是视图自己的决定，不该在界面报错
        if (error.kind === ApiErrorKind.aborted) {
          entry.refreshStatus = 'idle';
          return snapshotOf(key);
        }
        // 失败不覆盖旧数据：能显示的东西继续显示，但要标出来
        entry.error = error;
        entry.refreshStatus = 'failed';
        return snapshotOf(key);
      } finally {
        entry.inflight = null;
        notify(key);
      }
    })();

    return entry.inflight;
  }

  /** 把外部已有的数据塞进缓存（例如服务端同源首屏内联） */
  function seed(key, data, fetchedAt = now()) {
    const entry = entries.get(key) ?? empty();
    Object.assign(entry, { data, fetchedAt, error: null, refreshStatus: 'idle' });
    entries.set(key, entry);
    notify(key);
    return snapshotOf(key);
  }

  /** 作废（不发请求） */
  function invalidate(key = null) {
    if (key == null) {
      for (const k of entries.keys()) {
        entries.set(k, empty());
        notify(k);
      }
      return;
    }
    entries.set(key, empty());
    notify(key);
  }

  return { fetchKey, peek, subscribe, seed, invalidate, keys: () => [...entries.keys()] };
}

/**
 * 说明文案：界面要能对「数据旧了」和「这次刷新失败」给出不同说法。
 *
 * 刻意把 fetchedAt 与观测时间分开：这里只谈「我们什么时候成功取到的」，
 * 不谈行情本身的时间 —— 那是服务端 freshness 的事（见 quality.js）。
 */
export function describeRefresh({ refreshStatus, error, fetchedAt, now = Date.now() } = {}) {
  if (refreshStatus === 'pending') return { tone: 'progress', text: '正在刷新…' };
  if (refreshStatus === 'failed') {
    const reason =
      error?.kind === ApiErrorKind.timeout ? '请求超时'
        : error?.kind === ApiErrorKind.network ? '网络不可用'
          : error?.kind === ApiErrorKind.http ? `服务返回 ${error.status}`
            : error?.kind === ApiErrorKind.business ? String(error.message ?? '接口返回失败')
              : '请求失败';
    const base = fetchedAt ? `显示的是 ${formatAge(now - fetchedAt)}前的数据` : '暂无可用数据';
    return { tone: 'error', text: `${reason}：${base}` };
  }
  if (!fetchedAt) return { tone: 'muted', text: '尚未加载' };
  return { tone: 'ok', text: `更新于 ${formatAge(now - fetchedAt)}前` };
}

/** 粗粒度时间差：界面要的是「大概多久前」，不是精确到毫秒 */
export function formatAge(ms) {
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.round(m / 60);
  return `${h} 小时`;
}
