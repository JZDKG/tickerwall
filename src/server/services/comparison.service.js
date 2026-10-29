/* ================================================================== *
 * 内外金对照服务（产品 2.1）
 *
 * 纯计算在 `domain/explanations/comparison.js`；这里只负责**取数**：
 * 从本机日线缓存里拿国际金（美元/盎司）、国内金（元/克）、美元兑人民币，
 * 对齐到同一个窗口，然后交给域层。
 *
 * 取数上的三条纪律（都是「宁可说不知道」的方向）：
 *   1. 三个序列各自取「最后一个共同交易日」结束的窗口 —— 不同市场休市日不同，
 *      直接按自然日切片会拿错端点；
 *   2. 任何一个序列缺失就明确返回 UNKNOWN，不用相邻值填补；
 *   3. 历史缓存可能过期（DAILY_FRESH_MS），过期不影响「同一窗口的相对变化」，
 *      但要把它作为 `dataAgeMs` 报出来，界面不要假装是实时。
 * ================================================================== */

import { isDailyCacheFresh, readDailyCache } from '../db/index.js';
import { INSTRUMENTS } from '../providers/instruments.js';
import { buildGoldComparison } from '../domain/explanations/comparison.js';
import { createCoalescer } from '../jobs/coalesce.js';

/** 对照用到的三个标的 */
export const COMPARISON_INSTRUMENTS = {
  intl: 'gold-intl',
  domestic: 'gold-cn',
  fx: 'usdcny',
};

export const COMPARISON_WINDOWS = {
  session: { label: '今日', points: 1 },
  '5d': { label: '近 5 日', points: 5 },
  '20d': { label: '近 20 日', points: 20 },
};

const findInstrument = (id) => (INSTRUMENTS ?? []).find((i) => i.id === id) ?? null;

/**
 * 从日线里截出「截止到 cutoff、跨 N 个交易日」的窗口。
 *
 * @param {Array<{date:string, close:number}>} rows
 * @param {number} points 需要几个交易日的跨度
 * @param {string|null} [cutoff] 只取 <= cutoff 的行（用于三序列对齐）
 */
export function sliceWindow(rows, points = 1, cutoff = null) {
  const usable = (rows ?? []).filter(
    (r) => Number.isFinite(r?.close) && r.close > 0 && r?.date && (!cutoff || String(r.date) <= cutoff),
  );
  if (usable.length < 2) return null;
  const sorted = [...usable].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const endIdx = sorted.length - 1;
  const startIdx = Math.max(0, endIdx - Math.max(1, points));
  return {
    start: sorted[startIdx].close,
    end: sorted[endIdx].close,
    startDate: sorted[startIdx].date,
    endDate: sorted[endIdx].date,
  };
}

/**
 * 三条序列的**共同窗口**：先求日期的交集，再在交集上取跨度。
 *
 * 为什么不能各切各的：`commonCutoff` 只对齐了**末端**。若国内金缺一天，
 * 它的起点就会比国际金早一天 —— 于是「两天的境内外溢价都为零」这种情形
 * 仍会算出一个非零的溢价变化（因为两端根本不在同一天）。
 *
 * @param {Array<Array<{date:string,close:number}>>} rowsList 三条原始日线
 * @param {number} points 交集上要跨几个交易日
 * @returns {{dates:string[], at:(rows:Array)=>object|null}|null} 交集为空或不足两点时返回 null
 */
export function commonWindow(rowsList, points = 1) {
  const clean = (rows) =>
    (rows ?? []).filter((r) => Number.isFinite(r?.close) && r.close > 0 && r?.date);
  const sortedDates = rowsList.map((rows) => [...new Set(clean(rows).map((r) => String(r.date)))].sort());
  if (sortedDates.some((d) => d.length === 0)) return null;

  // 交集：按最短的那条去筛其他条
  const shortest = sortedDates.reduce((a, b) => (a.length <= b.length ? a : b));
  const sets = sortedDates.map((d) => new Set(d));
  const shared = shortest.filter((date) => sets.every((set) => set.has(date)));
  if (shared.length < 2) return null;

  const span = Math.max(1, Math.min(points, shared.length - 1));
  const startDate = shared[shared.length - 1 - span];
  const endDate = shared[shared.length - 1];

  /** 取某条序列在指定日期上的收盘价（两者都必须存在，不做「就近取」） */
  const at = (rows) => {
    const byDate = new Map(clean(rows).map((r) => [String(r.date), r.close]));
    const start = byDate.get(startDate);
    const end = byDate.get(endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { start, end, startDate, endDate };
  };
  return { dates: shared, startDate, endDate, at };
}

/**
 * 三个序列的共同截止日：取**最早**的那个「最后一根」。
 *
 * 为什么不是最晚：取最晚会让某个市场的窗口末端落在它没有数据的日期上，
 * 于是「国内金价」实际用的是三天前的价，却和今天的国际金对比 —— 正是
 * 我们要避免的那种错端点。
 */
export function commonCutoff(...series) {
  const ends = series.map((w) => w?.endDate).filter(Boolean);
  if (ends.length < series.length) return null;
  return ends.sort()[0];
}

/**
 * 取数 + 组装。
 *
 * @param {{windowKey?:string, deps?:object}} [opts]
 */
export async function buildComparison({ windowKey = 'session', deps = {} } = {}) {
  const read = deps.readDailyCache ?? readDailyCache;
  const freshCheck = deps.isDailyCacheFresh ?? isDailyCacheFresh;
  const now = deps.now ?? (() => Date.now());
  const window = COMPARISON_WINDOWS[windowKey] ?? COMPARISON_WINDOWS.session;

  const ids = COMPARISON_INSTRUMENTS;
  const load = async (id) => {
    const inst = findInstrument(id) ?? { id };
    const cached = await read(id).catch(() => null);
    const rows = cached?.rows ?? cached ?? null;
    return { inst, rows: Array.isArray(rows) ? rows : null, fresh: Boolean(freshCheck?.(id)?.fresh) };
  };

  const [intlRaw, domRaw, fxRaw] = await Promise.all([load(ids.intl), load(ids.domestic), load(ids.fx)]);

  const missing = [
    intlRaw.rows?.length ? null : ids.intl,
    domRaw.rows?.length ? null : ids.domestic,
    fxRaw.rows?.length ? null : ids.fx,
  ].filter(Boolean);

  if (missing.length) {
    return {
      ok: true,
      status: 'unknown',
      windowKey,
      windowLabel: window.label,
      comparable: false,
      missing,
      reasonText: [`缺少日线数据：${missing.join(' / ')}。请等采集完成再对照。`],
      decomposition: null,
      generatedAt: new Date(now()).toISOString(),
    };
  }

  /**
   * **先在日期交集上定窗口，再取数**。
   *
   * 原来只对齐末端（`commonCutoff`），三条序列各自向前切 N 天：任一条缺一天，
   * 起点就与别人不同，分解出来的「境内外溢价变化」其实是跨日的差。
   * 现在交集不足两点就直接判不可比，不输出分解。
   */
  const shared = commonWindow([intlRaw.rows, domRaw.rows, fxRaw.rows], window.points);
  if (!shared) {
    return {
      ok: true,
      status: 'unknown',
      windowKey,
      windowLabel: window.label,
      comparable: false,
      missing: [],
      reasonText: [
        '三条序列没有足够的共同交易日期（交集少于两天），这次不做分解 —— 强行分解会把不同日子的变化当成同一窗口。',
      ],
      decomposition: null,
      generatedAt: new Date(now()).toISOString(),
    };
  }
  const cutoff = shared.endDate;
  const intl = shared.at(intlRaw.rows);
  const domestic = shared.at(domRaw.rows);
  const fx = shared.at(fxRaw.rows);
  if (!intl || !domestic || !fx) {
    return {
      ok: true,
      status: 'unknown',
      windowKey,
      windowLabel: window.label,
      comparable: false,
      missing: [],
      reasonText: ['共同窗口缺少某一端的收盘价，这次不做分解。'],
      decomposition: null,
      generatedAt: new Date(now()).toISOString(),
    };
  }

  // 对齐后三个序列的末端就是同一天：`at` 用真实日期，而不是抹平成「随便一天」
  const align = (w) => (w ? { start: w.start, end: w.end, at: `${w.endDate}T00:00:00Z` } : w);

  const result = buildGoldComparison({
    intl: align(intl),
    domestic: align(domestic),
    fx: align(fx),
    windowKey,
  });

  const stale = !intlRaw.fresh || !domRaw.fresh || !fxRaw.fresh;
  return {
    ...result,
    status: result.decomposition ? 'ok' : 'unknown',
    windowLabel: window.label,
    // 三序列共同覆盖的最后一个交易日：界面要说清「对齐到哪一天」
    cutoff: cutoff ?? null,
    /**
     * 窗口的真实起止日期。
     *
     * 只写「近 5 日」是不够的：缓存过期时数据可能停在 10-23，标题却仍说「近 5 日」，
     * 读者会以为是到今天为止的 5 天。界面应显示实际区间。
     */
    windowRange: { start: intl.startDate, end: intl.endDate },
    alignedEndDates: { intl: intl?.endDate ?? null, domestic: domestic?.endDate ?? null, fx: fx?.endDate ?? null },
    missing: [],
    // 缓存是否过期要报出来：相对变化仍然成立，但不能当成实时行情
    dataAgeWarning: stale ? '日线缓存已过期（休市或采集未完成）：相对变化仍可用，但不是实时价' : null,
    generatedAt: new Date(now()).toISOString(),
  };
}

/** 同键合并：一次对照要读三个序列，连续点按钮不该重复算 */
const coalescer = createCoalescer();

export async function getGoldComparison({ windowKey = 'session', force = false, deps = undefined } = {}) {
  const key = `gold:${windowKey}`;
  const served = await coalescer.get(key, {
    ttlMs: 30_000,
    maxServeAgeMs: 5 * 60_000,
    force,
    load: () => buildComparison({ windowKey, deps }),
  });
  return served.value;
}

export function comparisonServeStats(windowKey = 'session') {
  return coalescer.statsFor(`gold:${windowKey}`);
}
