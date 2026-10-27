/* ================================================================== *
 * 分时环形缓冲 + 写入护栏（纯内存，零 I/O）
 *
 * 从 server.mjs 抽出来的原因：`pushHistory` 里那两条护栏是「分时图会不会出现
 * 断崖针」的唯一防线，逻辑很细但完全可判——给定上一笔、上一次来源、本次价格，
 * 答案就定了。抽成纯对象之后可以直接喂构造好的序列去测，不用起服务。
 *
 * 两条护栏（顺序不能换）：
 *   1. 跨合约代理源（期货兜底现货）在已有现货底子时一律拒写。
 *      gold-intl 的 hf_GC 比 hf_XAU 通常高 $15–30，混写会在分时图上留下永久脉冲针。
 *   2. 源切换且单步跳变 > 0.25%，判为跨源基差/时点错位，拦截。
 *
 * 另外还有一条「按显示精度判重」：数值没变就直接跳过，且**不能改动 prev.t**，
 * 否则休市期间会把最后一个点一直拖到现在，走势图上多出一条跨几个交易日的假尾巴。
 * ================================================================== */

/** 跨源切换时允许的单步跳变上限；超过就判为基差/时点错位 */
export const BASIS_JUMP_LIMIT = 0.0025;

/**
 * 单笔写入裁决（纯函数，护栏的全部逻辑都在这里）
 * @returns {{ write: boolean, reason?: 'basis-proxy'|'cross-source-jump'|'duplicate' }}
 */
export function historyWriteVerdict({ prev, prevSource, price, meta = {}, decimals = 2 }) {
  if (!prev) return { write: true };
  // 护栏 1：跨合约代理源在已有真实分时底子时绝不混写
  if (meta.basisProxy) return { write: false, reason: 'basis-proxy' };
  // 护栏 2：源切换 + 单步跳变超阈值
  if (prevSource && meta.source && prevSource !== meta.source) {
    if (Math.abs(price - prev.p) / prev.p > BASIS_JUMP_LIMIT) return { write: false, reason: 'cross-source-jump' };
  }
  // 按显示精度判重（不改动 prev.t）
  if (Number(prev.p).toFixed(decimals) === Number(price).toFixed(decimals)) return { write: false, reason: 'duplicate' };
  return { write: true };
}

/**
 * 环形缓冲：每个标的一条 { t, p } 序列，超过 limit 从头丢。
 * server.mjs 里用它的唯一实例，落盘 / 载入 / 种子数据都通过这里。
 */
export function createHistoryRing({ limit = 240 } = {}) {
  const series = new Map();
  const sources = new Map();

  return {
    /** @returns {boolean} 是否真的写入了（被护栏拦下时 false） */
    push(id, price, t = Date.now(), decimals = 2, meta = {}) {
      const arr = series.get(id) ?? [];
      const prev = arr[arr.length - 1];
      const verdict = historyWriteVerdict({ prev, prevSource: sources.get(id), price, meta, decimals });
      if (!verdict.write) return false;
      arr.push({ t, p: price });
      while (arr.length > limit) arr.shift();
      series.set(id, arr);
      if (meta.source) sources.set(id, meta.source);
      return true;
    },
    get: (id) => series.get(id),
    has: (id) => series.has(id),
    source: (id) => sources.get(id),
    /** 载入/种子：整体替换，同样受 limit 约束 */
    set(id, points) {
      if (!Array.isArray(points) || !points.length) return;
      series.set(id, points.slice(-limit));
    },
    /** 从 history.json 的 history 字段整体恢复 */
    restore(obj) {
      for (const [id, points] of Object.entries(obj ?? {})) {
        if (Array.isArray(points) && points.length) series.set(id, points.slice(-limit));
      }
    },
    entries: () => series.entries(),
    get size() {
      return series.size;
    },
    get limit() {
      return limit;
    },
  };
}
