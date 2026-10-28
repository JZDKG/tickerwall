/* ================================================================== *
 * 同键合并与最旧可用数据（方案 E06 / §7.1）
 *
 * 问题：三个服务入口（详情 / 宏观 / 事件）都是「查缓存 → 没命中就抓 →
 * 写缓存」。两个页面同时打开同一个标的时，两边都查不到缓存，于是**同一份
 * 上游数据被并行抓两次**。报价服务早就有这条合并，其余入口没有。
 *
 * 这里把三件事收口成一份实现：
 *
 *   1. **同键合并（single flight）**：同键在跑时后来者复用同一个 Promise。
 *      注意是「复用结果」而不是「等它跑完再自己跑一遍」。
 *   2. **两级时间**：`ttlMs` 是多久刷新，`maxServeAgeMs` 是多久之后不能再
 *      当作当前值。刷新失败**不覆盖**最后一次合格数据；超过 maxServeAge
 *      才标记为过期（但仍作为历史返回，不装作没有数据）。
 *   3. **失败可见**：返回 `{value, state}`，state ∈ ok | stale | unavailable。
 *      调用方据此在页面上说「这是 N 分钟前的数据」，而不是把旧数据当新的用。
 *
 * 刻意不做的事：不做队列、不做重试调度。重试属于调度器（jobs/collector.js），
 * 在这里塞一套只会让两处退避互相打架。
 * ================================================================== */

/**
 * @typedef {'ok'|'stale'|'unavailable'} ServeState
 */

/**
 * @param {object} [opts]
 * @param {Map<string, {value:any, at:number}>} [opts.store] 自定义存储（测试注入）
 * @param {() => number} [opts.now]
 */
export function createCoalescer({ store = new Map(), now = () => Date.now() } = {}) {
  /** key → Promise（进行中的抓取） */
  const inflight = new Map();
  /** key → 统计（调试与断言用） */
  const stats = new Map();

  const bump = (key, field) => {
    const s = stats.get(key) ?? { hits: 0, misses: 0, merged: 0, failures: 0, servedStale: 0 };
    s[field] += 1;
    stats.set(key, s);
  };

  /**
   * 取一个键的值。
   *
   * @param {string} key
   * @param {object} opts
   * @param {(ctx:{previous:any}) => Promise<any>} opts.load 真正的加载函数
   * @param {number} opts.ttlMs 多久后触发刷新
   * @param {number} [opts.maxServeAgeMs] 多久后不能再当当前值（默认 4×ttl）
   * @param {boolean} [opts.force] 强制刷新（仍遵守同键合并）
   * @returns {Promise<{value:any, state:ServeState, at:number|null, ageMs:number|null, error?:string, merged?:boolean}>}
   */
  async function get(key, { load, ttlMs, maxServeAgeMs = null, force = false }) {
    const entry = store.get(key) ?? null;
    const t = now();
    const ageMs = entry ? Math.max(0, t - entry.at) : null;
    const maxAge = maxServeAgeMs ?? Math.max(ttlMs * 4, ttlMs);

    const usable = entry && ageMs != null && ageMs <= maxAge;
    if (!force && entry && ageMs < ttlMs) {
      bump(key, 'hits');
      return { value: entry.value, state: 'ok', at: entry.at, ageMs };
    }

    if (inflight.has(key)) {
      // 同键在跑：复用那次结果，不重复打上游
      bump(key, 'merged');
      const shared = await inflight.get(key);
      return { ...shared, merged: true };
    }

    bump(key, 'misses');
    const promise = (async () => {
      try {
        const value = await load({ previous: entry?.value ?? null });
        store.set(key, { value, at: now() });
        return { value, state: 'ok', at: now(), ageMs: 0 };
      } catch (err) {
        bump(key, 'failures');
        const message = String(err?.message ?? err);
        if (entry) {
          // 刷新失败不覆盖最后一次合格数据：能服务就继续服务，但要说清楚它旧了
          const stale = ageMs != null && ageMs > maxAge;
          if (stale) bump(key, 'servedStale');
          return { value: entry.value, state: stale ? 'unavailable' : 'stale', at: entry.at, ageMs, error: message };
        }
        return { value: null, state: 'unavailable', at: null, ageMs: null, error: message };
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  /** 只为测试与诊断：某个键的计数 */
  function statsFor(key) {
    return stats.get(key) ?? { hits: 0, misses: 0, merged: 0, failures: 0, servedStale: 0 };
  }

  /** 清空（测试用；也用于「数据源换了」时强制丢弃） */
  function clear(key = null) {
    if (key == null) {
      store.clear();
      stats.clear();
      inflight.clear();
    } else {
      store.delete(key);
      stats.delete(key);
    }
  }

  return { get, statsFor, clear, inflightSize: () => inflight.size };
}

/**
 * 把「缓存 + 同键合并」接进一个服务的入口。
 *
 * 为什么不直接在 getDetail 里手写：三个服务要完全一致的语义（含失败保留旧值、
 * 超龄降级），各写一份必然分叉。这里只包一层，服务自己的 build 函数不变。
 *
 * @param {{ ttlMs:number, maxServeAgeMs?:number, name?:string }} cfg
 */
export function coalescedEntry(cfg) {
  const c = createCoalescer();
  return {
    get: (key, load, { force = false } = {}) => c.get(key, { load, ttlMs: cfg.ttlMs, maxServeAgeMs: cfg.maxServeAgeMs, force }),
    statsFor: c.statsFor,
    clear: c.clear,
    name: cfg.name ?? 'coalesced',
  };
}
