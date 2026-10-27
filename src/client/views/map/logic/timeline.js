/* ================================================================== *
 * 24h 局势时间轴：把事件按小时分桶
 *
 * 只做分桶与配色判定，不做渲染。柱子高度=事件数，颜色=桶内最高等级。
 * 时间基准用「桶的右边界对齐 now」而不是整点 —— 否则刚过整点时最新那个
 * 桶里只有几分钟的数据，柱高会显得莫名很低。
 * ================================================================== */

export const BUCKET_HOURS = 24;

/** 等级 → 颜色（与 worldmap.css 的 --up / 琥珀 / 蓝一致） */
export const LEVEL_COLOR = {
  high: '#f5455c',
  mid: '#f59e0b',
  low: '#5b9cf8',
};

const LEVEL_RANK = { low: 0, mid: 1, high: 2 };

/** 事件时间 `YYYY-MM-DD HH:mm:ss`（北京墙钟）→ epoch ms */
export function eventTimeMs(ev) {
  const s = ev?.time;
  if (!s) return null;
  const iso = String(s).replace(' ', 'T');
  const ms = Date.parse(`${iso}+08:00`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {Array} items 事件列表（time 为北京墙钟字符串）
 * @param {number} nowMs
 * @returns {{buckets: Array<{index:number,start:number,end:number,count:number,level:string,color:string,items:Array}>, from:number, to:number, coveredFrom:number|null, total:number}}
 */
export function bucketEvents24h(items, nowMs, hours = BUCKET_HOURS) {
  const span = hours * 3600e3;
  const from = nowMs - span;
  const step = span / hours;

  const buckets = [];
  for (let i = 0; i < hours; i += 1) {
    buckets.push({
      index: i,
      start: from + i * step,
      end: from + (i + 1) * step,
      count: 0,
      level: 'low',
      color: LEVEL_COLOR.low,
      items: [],
    });
  }

  let earliest = null;
  for (const ev of Array.isArray(items) ? items : []) {
    const t = eventTimeMs(ev);
    if (t == null || t < from || t > nowMs) continue;
    const idx = Math.min(hours - 1, Math.max(0, Math.floor((t - from) / step)));
    const b = buckets[idx];
    b.count += 1;
    b.items.push(ev);
    if (LEVEL_RANK[ev.level] > LEVEL_RANK[b.level]) b.level = ev.level;
    if (earliest == null || t < earliest) earliest = t;
  }

  for (const b of buckets) b.color = LEVEL_COLOR[b.level] ?? LEVEL_COLOR.low;

  return {
    buckets,
    from,
    to: nowMs,
    // 数据实际覆盖到的起点：拿不到 24h 就在时间轴上明确标注，不假装有
    coveredFrom: earliest,
    total: buckets.reduce((n, b) => n + b.count, 0),
  };
}

/** 取某时刻之前（含）的事件 —— 点某个桶做「回溯到那一刻」用 */
export function eventsUpTo(items, cutoffMs) {
  return (Array.isArray(items) ? items : []).filter((ev) => {
    const t = eventTimeMs(ev);
    return t != null && t <= cutoffMs;
  });
}

/** 桶高度归一化到 0..1（全空时全 0，不除零） */
export function normalizedHeights(buckets) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);
  if (max <= 0) return buckets.map(() => 0);
  return buckets.map((b) => b.count / max);
}
