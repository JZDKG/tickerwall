/* ================================================================== *
 * 详情服务：日K 历史 · 22 项统计指标 · 当日分时 · 多源对照 · 黄金溢价
 *
 * 从 server.mjs 整段搬出（L108–L599），逻辑一字未改，只加 export 与 import。
 * 同层依赖只有一条：quotes.service（取标的定义与实时报价兜底）。
 * ================================================================== */

import path from 'node:path';

import { MARKET_PROFILES, marketStatusOf, parseDataTime, gradeFreshness } from '../domain/market-hours.js';
import { createCoalescer } from '../jobs/coalesce.js';
import {
  readDailyCache,
  writeDailyCache,
  DAILY_FRESH_MS,
  isDailyCacheFresh,
  takeSnapshot,
  readSnapshots,
} from '../db/index.js';
import {
  fetchRaw,
  toNum,
  SINA_REFERER,
  splitSina,
  historySourcesFor,
  fetchCboeIndexDetail,
  fetchCboeVix,
  parseSinaSpot,
  parseSinaGlobal,
} from '../providers/index.js';
import {
  getQuotes,
  findInstrument,
  resolveInstrument,
  trimToLastSession,
  INSTRUMENTS,
  DETAIL_ONLY_INSTRUMENTS,
} from './quotes.service.js';

export const DETAIL_HISTORY_LIMIT = 5000; // 日K最多取多少条（东财上限，约 20 年）

export const DETAIL_CACHE_TTL_MS = 60_000;
export const detailCache = new Map(); // id -> { at, data }

/** 东财日K：f51日期 f52开 f53收 f54高 f55低 f56量 f57额 f58振幅 f59涨跌幅 f60涨跌额 f61换手 */

/** Binance 日K（可翻页，最多 pages×1000 条） */

/** 新浪美股日K：返回 [{d,o,h,l,c,v,a}, ...]（可回溯到 2014 年） */

/** 当日分时（东财 trends2），返回 {date, points:[{t,p}]} */
export async function fetchIntradayByEm(secid) {
  const url =
    'https://push2his.eastmoney.com/api/qt/stock/trends2/get' +
    `?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3&fields2=f51,f53&iscr=0&ndays=1`;
  const j = JSON.parse(await fetchRaw(url));
  const trends = j?.data?.trends;
  if (!Array.isArray(trends) || !trends.length) return null;
  const points = [];
  for (const row of trends) {
    const [ts, val] = String(row).split(',');
    const p = toNum(val);
    if (!(p > 0)) continue;
    const t = Date.parse(`${ts.replace(' ', 'T')}:00+08:00`);
    points.push({ t: Number.isFinite(t) ? t : null, p, label: ts.slice(-5) });
  }
  const kept = trimToLastSession(points.map((x) => ({ t: x.t ?? Date.now(), p: x.p })));
  const labels = new Map(points.map((x) => [x.p, x.label]));
  return {
    date: trends[trends.length - 1].slice(0, 10),
    points: kept.map((x) => ({ t: x.t, p: x.p, label: labels.get(x.p) ?? null })),
  };
}

/** BTC 当日分时（1 分钟 K 线，最近 12 小时） */
export async function fetchIntradayByBinance(symbol) {
  const url =
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
    '&interval=1m&limit=720';
  const rows = JSON.parse(await fetchRaw(url));
  if (!Array.isArray(rows) || !rows.length) return null;
  const points = rows
    .map((r) => ({ t: toNum(r[0]), p: toNum(r[4]) }))
    .filter((x) => x.t && x.p > 0);
  return {
    date: new Date(points[points.length - 1].t).toISOString().slice(0, 10),
    points: points.map((x) => ({ ...x, label: new Date(x.t + 8 * 3600 * 1000).toISOString().slice(11, 16) })),
  };
}

/** 补充指标（成交量/成交额/换手率等），东财口径 */
export async function fetchExtraMetrics(secid) {
  if (!secid) return null;
  const fields = 'f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86,f168,f169,f170,f171';
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=${fields}`;
  const j = JSON.parse(await fetchRaw(url));
  const d = j?.data;
  if (!d) return null;
  const dec = Number.isFinite(Number(d.f59)) ? Number(d.f59) : 2;
  const k = 10 ** dec;
  return {
    code: d.f57 ?? null,
    name: d.f58 ?? null,
    price: d.f43 != null && d.f43 > 0 ? d.f43 / k : null,
    open: d.f46 != null && d.f46 > 0 ? d.f46 / k : null,
    high: d.f44 != null && d.f44 > 0 ? d.f44 / k : null,
    low: d.f45 != null && d.f45 > 0 ? d.f45 / k : null,
    prevClose: d.f60 != null && d.f60 > 0 ? d.f60 / k : null,
    volume: d.f47 ?? null,
    amount: d.f48 ?? null,
    turnoverRate: d.f168 ?? null,
    change: d.f169 != null ? d.f169 / k : null,
    changePct: d.f170 != null ? d.f170 / 100 : null,
    quoteTime: d.f86 ? new Date(Number(d.f86) * 1000).toISOString() : null,
  };
}

export const TROY_OUNCE_GRAMS = 31.1035; // 1 金衡盎司 = 31.1035 克

/** 在岸美元人民币（新浪 fx_susdcny）：1 昨收 · 8 现价 · 9 名称 · 0 时间 */
export async function fetchUsdCny() {
  const text = await fetchRaw('https://hq.sinajs.cn/list=fx_susdcny', {
    headers: { Referer: SINA_REFERER },
    encoding: 'gb18030',
  });
  const f = splitSina(text);
  if (!f) throw new Error('空响应');
  const rate = toNum(f[8]) ?? toNum(f[1]);
  if (!(rate > 0)) throw new Error('汇率无效');
  return { rate, time: f[0] ?? null, name: f[9] ?? null };
}

/** 国内金价的内外盘对照：国际金价折人民币 vs 上金所现货 */
export async function buildGoldSpread(domesticPrice) {
  const [xau, fx] = await Promise.all([fetchExtraMetrics('122.XAU'), fetchUsdCny()]);
  const usd = xau?.price;
  if (!(usd > 0) || !(fx.rate > 0)) return null;
  const converted = (usd / TROY_OUNCE_GRAMS) * fx.rate;
  return {
    usdCny: fx.rate,
    usdCnyTime: fx.time,
    xauUsd: usd,
    xauSource: 'eastmoney:122.XAU',
    gramsPerOunce: TROY_OUNCE_GRAMS,
    convertedPerGram: converted,
    domesticPrice: domesticPrice ?? null,
    premiumPct:
      domesticPrice != null && converted > 0 ? ((domesticPrice - converted) / converted) * 100 : null,
  };
}

export const DAY_MS = 86_400_000;

/** 从日K算出详情页需要的全部统计量 */
export function buildDayStats(rows, { daysPerYear = 252, quote = null } = {}) {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const lastTs = Date.parse(last.date);
  /**
   * 实时报价融入口径。
   *
   * 起因：详情页顶部涨跌幅走实时价，而「近1日」「52周高低」走日线最后一条收盘，
   * 两个数会差一截（标普实测：实时 -0.52%，日线最后一条还停在前两天）。
   *
   * 试过「补一根今天的合成日线」，但这个方案不成立 —— quote.sessionTime 只给
   * 「04:38:43」没有日期，伪造出来的日期会让三日涨幅冒充一日。
   * 所以定点修两处：近1日直接取报价自带涨跌幅，区间高低把实时价并进极值集合。
   */
  const live = quote && quote.price > 0 ? quote : null;
  const lastClose = live ? live.price : last.close;
  // 区间基准要跟着实时价走：FRED 的日线会比实时慢 2 天，
  // 用 lastTs 算「近1周」实际是拿上周对再上周，标题和内容对不上
  const refTs = live ? Math.max(lastTs, Date.now()) : lastTs;
  const closeAtOrBefore = (ts) => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (Date.parse(rows[i].date) <= ts) return rows[i].close;
    }
    return rows[0].close;
  };
  const perf = (days) => {
    if (days == null) return null;
    // 近1日：报价自带的 changePct 天然是「相对昨收」，比用日线推算更准
    if (days === 1 && live?.changePct != null) return live.changePct;
    const base = closeAtOrBefore(refTs - days * DAY_MS);
    return base ? ((lastClose - base) / base) * 100 : null;
  };

  // 年初至今
  const yearStart = `${last.date.slice(0, 4)}-01-01`;
  const beforeYear = rows.filter((r) => r.date < yearStart);
  const ytdBase = beforeYear.length ? beforeYear[beforeYear.length - 1].close : rows[0].close;

  // 52 周高低
  const yearRows = rows.filter((r) => Date.parse(r.date) >= lastTs - 365 * DAY_MS);
  const highs = yearRows.map((r) => r.high).filter((v) => v != null);
  const lows = yearRows.map((r) => r.low).filter((v) => v != null);
  // FRED 这类官方源只给收盘价（没有 high/low），退回收盘口径，否则整块显示「—」
  const hiSeries = highs.length ? highs : yearRows.map((r) => r.close).filter((v) => v != null);
  const loSeries = lows.length ? lows : yearRows.map((r) => r.close).filter((v) => v != null);
  if (live) {
    hiSeries.push(live.high ?? live.price);
    loSeries.push(live.low ?? live.price);
  }
  const high52 = hiSeries.length ? Math.max(...hiSeries) : null;
  const low52 = loSeries.length ? Math.min(...loSeries) : null;

  // 全历史高低
  let histHigh = { value: null, date: null };
  let histLow = { value: null, date: null };
  for (const r of rows) {
    // 只有收盘的源（FRED）也要能算出历史高低，退回收盘口径
    const hi = r.high ?? r.close;
    const lo = r.low ?? r.close;
    if (hi != null && (histHigh.value == null || hi > histHigh.value)) histHigh = { value: hi, date: r.date };
    if (lo != null && (histLow.value == null || lo < histLow.value)) histLow = { value: lo, date: r.date };
  }
  if (live) {
    const d = last.date;
    if (live.high != null && (histHigh.value == null || live.high > histHigh.value)) histHigh = { value: live.high, date: d };
    if (live.low != null && (histLow.value == null || live.low < histLow.value)) histLow = { value: live.low, date: d };
  }

  // 单日最佳/最差
  let bestDay = null;
  let worstDay = null;
  for (const r of rows) {
    if (r.pct == null) continue;
    if (!bestDay || r.pct > bestDay.pct) bestDay = { date: r.date, pct: r.pct };
    if (!worstDay || r.pct < worstDay.pct) worstDay = { date: r.date, pct: r.pct };
  }

  // 年化波动率（日收益标准差 × √252）
  const rets = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    if (prev) rets.push((rows[i].close - prev) / prev);
  }
  const annVol = (sl) => {
    if (sl.length < 2) return null;
    const mean = sl.reduce((a, b) => a + b, 0) / sl.length;
    const variance = sl.reduce((a, b) => a + (b - mean) ** 2, 0) / (sl.length - 1);
    return Math.sqrt(variance) * Math.sqrt(daysPerYear) * 100;
  };
  let volatility = null;
  if (rets.length > 10) volatility = annVol(rets);

  /**
   * 实现波动率（Realized Volatility）。
   * 全样本年化波动率横跨 10~20 年，早已被几轮危机平滑掉，对交易员没有决策价值。
   * 真正要回答的是「现在的波动率环境是偏热还是偏冷」，所以给 RV20 / RV60，
   * 再给 RV20 在过去 5 年滚动分布里的分位（0% = 五年最安静，100% = 五年最动荡）。
   */
  const rv20 = rets.length >= 20 ? annVol(rets.slice(-20)) : null;
  const rv60 = rets.length >= 60 ? annVol(rets.slice(-60)) : null;
  const rv20Percentile = (() => {
    if (rv20 == null) return null;
    const lookback = Math.min(rets.length, Math.round(daysPerYear * 5));
    const from = Math.max(0, rets.length - lookback);
    const hist = [];
    for (let end = from + 20; end <= rets.length; end += 1) {
      const v = annVol(rets.slice(end - 20, end));
      if (v != null) hist.push(v);
    }
    if (hist.length < 60) return null;
    return (hist.filter((x) => x <= rv20).length / hist.length) * 100;
  })();

  // 波动率状态：给一句人话结论，省得用户自己对着百分比换算
  const volRegime =
    rv20Percentile == null
      ? null
      : rv20Percentile >= 85
        ? '极高'
        : rv20Percentile >= 65
          ? '偏高'
          : rv20Percentile >= 35
            ? '中性'
            : rv20Percentile >= 15
              ? '偏低'
              : '极低';

  // 最大回撤（收盘价口径，同时记录峰值日与谷底日）
  let peakValue = -Infinity;
  let runningPeakDate = null;
  let maxDrawdown = { pct: 0, peakDate: null, troughDate: null };
  for (const r of rows) {
    if (r.close > peakValue) {
      peakValue = r.close;
      runningPeakDate = r.date;
    }
    if (peakValue > 0) {
      const dd = ((r.close - peakValue) / peakValue) * 100;
      if (dd < maxDrawdown.pct) {
        maxDrawdown = { pct: dd, peakDate: runningPeakDate, troughDate: r.date };
      }
    }
  }

  // 均线
  const ma = (n) => {
    if (rows.length < n) return null;
    const slice = rows.slice(-n);
    return slice.reduce((sum, r) => sum + r.close, 0) / n;
  };

  // 近 20 日均量
  const last20 = rows.slice(-20).map((r) => r.volume).filter((v) => v != null && v > 0);
  const avgVolume20 = last20.length ? last20.reduce((a, b) => a + b, 0) / last20.length : null;

  // 连续涨跌天数
  let streak = 0;
  for (let i = rows.length - 1; i >= 1; i -= 1) {
    const p = rows[i].pct;
    if (p == null) break;
    if (streak === 0) streak = p > 0 ? 1 : p < 0 ? -1 : 0;
    else if (streak > 0 && p > 0) streak += 1;
    else if (streak < 0 && p < 0) streak -= 1;
    else break;
    if (i === 1) break;
  }

  return {
    high52,
    low52,
    // 必须用 lastClose（含实时价）：high52 已经把 live.price 算进极值，
    // 若这里仍用昨收，盘中刚创新高时「距 52 周高」会算出负数
    fromHigh52: high52 ? ((lastClose - high52) / high52) * 100 : null,
    fromLow52: low52 ? ((lastClose - low52) / low52) * 100 : null,
    histHigh,
    histLow,
    bestDay,
    worstDay,
    volatility,
    rv20,
    rv60,
    rv20Percentile,
    volRegime,
    volWindowYears: rets.length >= daysPerYear * 5 ? 5 : Math.round((rets.length / daysPerYear) * 10) / 10,
    ma20: ma(20),
    ma60: ma(60),
    ma120: ma(120),
    ma250: ma(250),
    avgVolume20,
    streak,
    maxDrawdown,
    perf: {
      // 近1日必须走 perf(1)：日线 pct 在 FRED/Yahoo 这类源上是空的，
      // 直接把 last.pct 填进来会让「近1日」chip 被前端过滤掉（此前一直缺失）
      d1: perf(1),
      w1: perf(7),
      m1: perf(30),
      m3: perf(91),
      m6: perf(182),
      y1: perf(365),
      y3: perf(1095),
      ytd: ytdBase ? ((lastClose - ytdBase) / ytdBase) * 100 : null,
    },
    lastClose,
    lastDate: last.date,
  };
}

/** 日K 压缩成数组：[日期, 开, 收, 高, 低, 量, 额, 涨跌幅] */
export function packDaily(rows) {
  return rows.map((r) => [
    r.date,
    r.open,
    r.close,
    r.high,
    r.low,
    r.volume,
    r.amount,
    r.pct,
  ]);
}

export async function buildDetail(inst) {
  const quotes = await getQuotes();
  let quote = quotes.items.find((i) => i.id === inst.id) ?? null;
  if (!quote) quote = await resolveInstrument(inst);

  // 历史：所有可用源并发采集，取条数最多（最长）的那一份，其余记下来做说明
  // 历史源统一由 historySourcesFor 构造，与宏观页/事件研究共用同一套降级顺序
  const historyJobs = historySourcesFor(inst);

  // 先看盘上有没有新鲜的日线：8 小时内的缓存直接复用，连源都不打
  const diskCache = await readDailyCache(inst.id);
  const cacheAgeMs = diskCache ? Date.now() - diskCache.savedAt : null;
  const cacheFresh = diskCache != null && cacheAgeMs < DAILY_FRESH_MS;

  const [historyResults, intradayRes, extRes] = await Promise.all([
    cacheFresh ? Promise.resolve([]) : Promise.allSettled(historyJobs.map((job) => job())),
    inst.binanceSymbol
      ? fetchIntradayByBinance(inst.binanceSymbol).catch(() => null)
      : fetchIntradayByEm(inst.em).catch(() => null),
    inst.binanceSymbol
      ? fetchBinanceSnapshot(inst.binanceSymbol).catch(() => null)
      : fetchExtraMetrics(inst.em).catch(() => null),
  ]);

  const alternatives = [];
  const historyErrors = [];
  let history = null;
  let cacheMeta = null;
  if (cacheFresh) {
    // 直接用盘上的，标注为缓存命中
    history = {
      rows: diskCache.rows,
      meta: { source: diskCache.source, code: inst.id, name: inst.name },
    };
    cacheMeta = { hit: 'fresh', savedAt: diskCache.savedAt, ageMs: cacheAgeMs };
  } else {
    for (let k = 0; k < historyResults.length; k += 1) {
      const r = historyResults[k];
      if (r.status !== 'fulfilled') {
        // 记下每个源为什么失败：东财限流时详情页会整页 0 条，没有这条就没法判断是源挂了还是真没数据
        const name = historyJobs[k]?.sourceName ?? `source#${k}`;
        historyErrors.push({ source: name, error: String(r.reason?.message ?? r.reason).slice(0, 160) });
        continue;
      }
      const h = r.value;
      alternatives.push({
        source: h.meta.source,
        count: h.rows.length,
        startDate: h.rows[0]?.date ?? null,
        endDate: h.rows[h.rows.length - 1]?.date ?? null,
      });
      if (!history || h.rows.length > history.rows.length) history = h;
    }
    alternatives.sort((a, b2) => b2.count - a.count);

    if (history) {
      // 拿到新数据就落盘，下次源挂了还有得读
      await writeDailyCache(inst.id, history.meta.source, history.rows);
    } else if (diskCache) {
      // 源全挂：退回旧缓存，并明确标注陈旧多久
      history = {
        rows: diskCache.rows,
        meta: { source: diskCache.source, code: inst.id, name: inst.name },
      };
      cacheMeta = { hit: 'stale', savedAt: diskCache.savedAt, ageMs: cacheAgeMs };
    }
  }

  const intraday = intradayRes;
  const ext = extRes;

  // 国内金价额外算一份内外盘对照（国际金价按汇率折成元/克 再和上金所现货比）
  let derived = null;
  if (inst.id === 'gold-cn') {
    derived = await buildGoldSpread(quote?.price ?? null).catch(() => null);
  }

  const rows = history?.rows ?? [];
  const profile = MARKET_PROFILES[inst.market] ?? null;
  // 年化口径随市场走：加密 365、股票/商品 252
  const stats = buildDayStats(rows, { daysPerYear: profile?.daysPerYear ?? 252, quote });

  // 多源对照：主源报价 vs 东财/Binance 口径
  const crosscheck = [];
  if (quote?.price != null) {
    crosscheck.push({ source: quote.source, price: quote.price, note: '列表主源' });
  }
  if (ext?.price != null) {
    crosscheck.push({ source: inst.binanceSymbol ? 'binance:24h快照' : `eastmoney:${inst.em}`, price: ext.price, note: '详情补充源' });
  }

  return {
    ok: Boolean(rows.length || quote?.ok),
    id: inst.id,
    name: inst.name,
    sub: inst.sub,
    unit: inst.unit,
    decimals: inst.decimals ?? 2,
    quote,
    ext,
    intraday,
    stats,
    marketStatus: marketStatusOf(inst),
    priceBasis: profile?.priceBasis ?? 'close',
    derived,
    crosscheck,
    history: {
      alternatives,
      errors: historyErrors,
      cache: cacheMeta,
      source: history?.meta?.source ?? null,
      code: history?.meta?.code ?? null,
      name: history?.meta?.name ?? null,
      exchange: history?.meta?.exchange ?? null,
      count: rows.length,
      startDate: rows[0]?.date ?? null,
      endDate: rows[rows.length - 1]?.date ?? null,
      // 字段顺序固定：[日期, 开, 收, 高, 低, 成交量, 成交额, 涨跌幅%]
      daily: packDaily(rows),
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Binance 24h 快照，用作 BTC 详情页的补充指标 */
export async function fetchBinanceSnapshot(symbol) {
  const j = JSON.parse(
    await fetchRaw(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`),
  );
  return {
    code: symbol,
    name: symbol,
    price: toNum(j.lastPrice),
    open: toNum(j.openPrice),
    high: toNum(j.highPrice),
    low: toNum(j.lowPrice),
    prevClose: toNum(j.prevClosePrice),
    volume: toNum(j.volume),
    amount: toNum(j.quoteVolume),
    turnoverRate: null,
    change: toNum(j.priceChange),
    changePct: toNum(j.priceChangePercent),
    trades: toNum(j.count),
  };
}

/**
 * 请求级同键合并（方案 E06 / §7.1）。
 *
 * 原来只有「缓存命中」没有「进行中合并」：两个页面同时打开同一个标的，
 * 双方都没命中缓存，于是同一份上游被并行抓两次。合并后后来者直接复用
 * 那次结果（`_merged` 标记，便于诊断）。
 *
 * 返回值形状不变（这是既有 API 契约），合并/降级信息挂在 `_serve` 上，
 * 由路由层决定要不要暴露给前端。
 */
const detailCoalescer = createCoalescer();

export async function getDetail(id, { force = false } = {}) {
  const inst = findInstrument(id);
  if (!inst) return null;
  const served = await detailCoalescer.get(id, {
    ttlMs: DETAIL_CACHE_TTL_MS,
    // 详情页的图表可以显示「N 分钟前」，超过 10 分钟就别再说这是当前行情
    maxServeAgeMs: DETAIL_CACHE_TTL_MS * 10,
    force,
    load: () => buildDetail(inst),
  });
  detailCache.set(id, { at: served.at ?? Date.now(), data: served.value });
  if (!served.value) return null;
  return served.value;
}

/** 诊断用：某个标的的命中 / 合并 / 失败计数 */
export function detailServeStats(id) {
  return detailCoalescer.statsFor(id);
}
