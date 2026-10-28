/* ================================================================== *
 * 行情源适配器
 *
 * 从 services/quotes.service.js 拆出来（那边 1381 行，混了适配器、标的注册表、
 * 分时缓冲、价差芯片、隔夜复盘六种职责）。这里只做一件事：把各家上游的
 * 响应形状翻译成统一的 { price, prevClose, sessionTime, note }。
 *
 * 为什么值得独立成层：适配器是「外部世界的边界」，上游改字段、换域名、
 * 加限流都在这一层反应；而聚合、缓存、降级策略不该跟着一起改。分开之后
 * 「哪个源又坏了」只需要看这个文件。
 *
 * 无模块状态 —— 都是纯函数（yahooThrottle 除外，它持有一个节流计时器，
 * 这是有意为之：同一进程内对 Yahoo 的调用必须共享节流）。
 * ================================================================== */

import {
  toNum,
  fetchRaw,
  UA,
  SINA_REFERER,
  splitSina,
  parseSinaSpot,
  parseSinaGlobal,
  cnbcQuoteOf,
  parseCnbcQuotes,
  fredQuoteFromRows,
  cboeIndex,
  fetchFredDaily,
  DEFAULT_FETCH_TIMEOUT_MS,
} from './index.js';
// fredQuote 是「先读库、缺了才抓」的模式 —— 它自己带缓存，不走聚合层的缓存
import { readDailyCache, writeDailyCache } from '../db/index.js';

const FETCH_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS;

/** 取出 var hq_str_xxx="a,b,c"; 里的字段数组 */

export function hhmmss(v) {
  const s = String(v ?? '').padStart(6, '0');
  if (!/^\d{6}$/.test(s)) return null;
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

/* ------------------------------------------------------------------ *
 * 各数据源适配器 —— 每个 load() 返回统一结构：
 * { price, prevClose?, open?, high?, low?, change?, changePct?, sessionTime? }
 * ------------------------------------------------------------------ */

/** 新浪外盘/贵金属：hf_XAU、gds_AU9999 都是同一套字段
 *  0 现价 · 2 买价 · 3 卖价 · 4 最高 · 5 最低 · 6 时间 · 7 昨收/昨结算 · 8 开盘 · 13 名称 */
export function sinaSpot(code) {
  return {
    name: `sina:${code}`,
    async load() {
      const text = await fetchRaw(`https://hq.sinajs.cn/list=${code}`, {
        headers: { Referer: SINA_REFERER },
        encoding: 'gb18030',
      });
      return parseSinaSpot(text);
    },
  };
}

/** 新浪美股指数：gb_$inx / gb_$ndx
 *  1 最新价 · 2 涨跌幅% · 3 时间 · 4 涨跌额 · 5 开盘 · 6 最高 · 7 最低 · 26 昨收 */
export function sinaGlobal(code) {
  return {
    name: `sina:${code}`,
    async load() {
      const text = await fetchRaw(`https://hq.sinajs.cn/list=${code}`, {
        headers: { Referer: SINA_REFERER },
        encoding: 'gb18030',
      });
      return parseSinaGlobal(text);
    },
  };
}

/** 新浪 A 股指数简版：s_sh000001
 *  1 现价 · 2 涨跌额 · 3 涨跌幅% · 4 成交量(手) · 5 成交额(万) */
export function sinaSimpleIndex(code) {
  return {
    name: `sina:${code}`,
    async load() {
      const text = await fetchRaw(`https://hq.sinajs.cn/list=${code}`, {
        headers: { Referer: SINA_REFERER },
        encoding: 'gb18030',
      });
      const f = splitSina(text);
      if (!f) throw new Error('空响应');
      const price = toNum(f[1]);
      if (!(price > 0)) throw new Error('价格无效');
      const change = toNum(f[2]);
      return {
        price,
        change,
        changePct: toNum(f[3]),
        prevClose: change != null ? price - change : null,
        sessionTime: null,
      };
    },
  };
}

/** 新浪 A 股指数完整格式：sh000001
 *  1 今开 · 2 昨收 · 3 现价 · 4 最高 · 5 最低 · 8 成交量 · 31 时间 */
export function sinaIndexFull(code) {
  return {
    name: `sina:${code}`,
    async load() {
      const text = await fetchRaw(`https://hq.sinajs.cn/list=${code}`, {
        headers: { Referer: SINA_REFERER },
        encoding: 'gb18030',
      });
      const f = splitSina(text);
      if (!f) throw new Error('空响应');
      const price = toNum(f[3]);
      if (!(price > 0)) throw new Error('价格无效');
      const prevClose = toNum(f[2]);
      return {
        price,
        prevClose,
        open: toNum(f[1]),
        high: toNum(f[4]),
        low: toNum(f[5]),
        sessionTime: f[31] || null,
      };
    },
  };
}

/** 新浪国内期货：nf_AU0 沪金连续
 *  1 时间HHMMSS · 2 开盘 · 3 最高 · 4 最低 · 8 最新 · 10 昨结算 · 13 持仓 · 14 成交 */
export function sinaFutures(code) {
  return {
    name: `sina:${code}`,
    async load() {
      const text = await fetchRaw(`https://hq.sinajs.cn/list=${code}`, {
        headers: { Referer: SINA_REFERER },
        encoding: 'gb18030',
      });
      const f = splitSina(text);
      if (!f) throw new Error('空响应');
      const price = toNum(f[8]) ?? toNum(f[6]);
      if (!(price > 0)) throw new Error('价格无效');
      return {
        price,
        prevClose: toNum(f[10]),
        open: toNum(f[2]),
        high: toNum(f[3]),
        low: toNum(f[4]),
        sessionTime: hhmmss(f[1]),
      };
    },
  };
}

/** 东方财富：f43 现价 f44 高 f45 低 f46 开 f59 小数位 f60 昨收 f169 涨跌 f170 涨跌幅(×100) */
export function eastmoney(secid) {
  return {
    name: `eastmoney:${secid}`,
    async load() {
      const fields = 'f43,f44,f45,f46,f57,f58,f59,f60,f169,f170';
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=${fields}`;
      const j = JSON.parse(await fetchRaw(url));
      const d = j?.data;
      if (!d || d.f43 == null) throw new Error('无数据');
      const dec = Number.isFinite(Number(d.f59)) ? Number(d.f59) : 2;
      const k = 10 ** dec;
      const price = d.f43 / k;
      if (!(price > 0)) throw new Error('价格无效');
      return {
        price,
        prevClose: d.f60 != null && d.f60 > 0 ? d.f60 / k : null,
        change: d.f169 != null ? d.f169 / k : null,
        changePct: d.f170 != null ? d.f170 / 100 : null,
        open: d.f46 != null && d.f46 > 0 ? d.f46 / k : null,
        high: d.f44 != null && d.f44 > 0 ? d.f44 / k : null,
        low: d.f45 != null && d.f45 > 0 ? d.f45 / k : null,
        sessionTime: null,
      };
    },
  };
}

/** Binance 24h ticker */
export function binance(host = 'api.binance.com') {
  return {
    name: `binance:${host}`,
    async load() {
      const j = JSON.parse(await fetchRaw(`https://${host}/api/v3/ticker/24hr?symbol=BTCUSDT`));
      const price = toNum(j.lastPrice);
      if (!(price > 0)) throw new Error('价格无效');
      return {
        price,
        prevClose: toNum(j.prevClosePrice),
        change: toNum(j.priceChange),
        changePct: toNum(j.priceChangePercent),
        open: toNum(j.openPrice),
        high: toNum(j.highPrice),
        low: toNum(j.lowPrice),
        sessionTime: null,
      };
    },
  };
}

/** Coinbase 现货价（只有价格，用于兜底） */
export function coinbase(pair = 'BTC-USD') {
  return {
    name: `coinbase:${pair}`,
    async load() {
      const j = JSON.parse(await fetchRaw(`https://api.coinbase.com/v2/prices/${pair}/spot`));
      const price = toNum(j?.data?.amount);
      if (!(price > 0)) throw new Error('价格无效');
      return { price };
    },
  };
}

/** gold-api.com 现货金银（只有价格，用于兜底） */
export function goldApi(symbol = 'XAU') {
  return {
    name: `gold-api:${symbol}`,
    async load() {
      const j = JSON.parse(await fetchRaw(`https://api.gold-api.com/price/${symbol}`));
      const price = toNum(j?.price);
      if (!(price > 0)) throw new Error('价格无效');
      return { price };
    },
  };
}

/**
 * 新浪外汇实时：DINIW（ICE 美元指数）/ fx_susdcnh / fx_susdcny 共用。
 * 实测字段：0 时间 · 3 昨收 · 5 今开 · 6 最高 · 7 最低 · 8 现价
 */
export function sinaForexQuote(code) {
  return {
    name: `sina-forex:${code}`,
    async load() {
      const text = await fetchRaw(`https://hq.sinajs.cn/list=${code}`, {
        headers: { Referer: SINA_REFERER },
        encoding: 'gb18030',
      });
      const f = splitSina(text);
      if (!f) throw new Error('空响应');
      const price = toNum(f[8]) ?? toNum(f[1]);
      if (!(price > 0)) throw new Error('价格无效');
      return {
        price,
        prevClose: toNum(f[3]),
        open: toNum(f[5]),
        high: toNum(f[6]),
        low: toNum(f[7]),
        sessionTime: f[0] || null,
      };
    },
  };
}

/**
 * FRED 兜底报价：先读库（readDailyCache），取末两条算 price / prevClose。
 *
 * 好处是连外部网络超时都不怕 —— 库里已有上万条日线；代价是拿到的是
 * 「上一交易日收盘」，所以必须标 stale，让前端亮「数据过期」角标，
 * 不能静默伪装成实时绿灯。
 */
export function fredQuote(seriesId, cacheId) {
  return {
    name: `fred:${seriesId}`,
    async load() {
      const key = cacheId ?? seriesId.toLowerCase();
      let rows = (await readDailyCache(key))?.rows ?? null;
      if (!rows || rows.length < 2) {
        const fresh = await fetchFredDaily(seriesId);
        rows = fresh?.rows ?? null;
        if (rows && rows.length >= 2) {
          await writeDailyCache(key, fresh.meta?.source ?? `fred:${seriesId}`, rows);
        }
      }
      return fredQuoteFromRows(rows);
    },
  };
}

/* ------------------------------------------------------------------ *
 * 标的配置（顺序即页面从上到下的顺序）
 * ------------------------------------------------------------------ */

/** 全球主要股指：本地源优先（更快更实时），Yahoo 兜底 */
// 一次批量取回所有 CNBC 全球指数，避免逐个请求。新增标的必须同时登记在这里，
// 否则 cnbcQuote() 查缓存必然落空（表现为该标的静默 ok:false）。




/* ------------------------------------------------------------------ *
 * 市场画像：交易时段（北京时间）、年化口径、涨跌基准
 * —— 期货涨跌基准是「昨结算」而不是「昨收盘」，两者在换月/结算时差异明显；
 * —— 加密 7×24 交易，年化波动率必须用 √365，用 √252 会系统性低估约 17%。
 * ------------------------------------------------------------------ */

/**
 * Yahoo 对并发很敏感：7 个指数同时请求会直接 429。
 * 所以所有 Yahoo 请求串行排队 + 间隔，429 时指数退避重试。
 */
export let yahooChain = Promise.resolve();
export function yahooThrottle(fn) {
  const next = yahooChain.then(() => new Promise((r) => setTimeout(r, 380)).then(fn));
  yahooChain = next.catch(() => {});
  return next;
}

/** Yahoo 实时报价（chart API，覆盖全球指数最全） */
export function yahooQuote(symbol) {
  return {
    name: `yahoo:${symbol}`,
    async load() {
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await yahooThrottle(() => yahooQuoteOnce(symbol));
        } catch (err) {
          lastErr = err;
          if (/429/.test(String(err?.message ?? '')) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      throw lastErr ?? new Error('Yahoo 请求失败');
    },
  };
}

/**
 * CNBC 报价接口：一次请求拿多个指数，只有 1 次 HTTP。
 * Yahoo 的限流是按请求频率算的，7 个指数各发一次必然 429，所以用批量源做主源。
 */
export let cnbcCache = { at: 0, map: new Map() };


export async function cnbcBatchFetch(symbols) {
  const key = symbols.join('|');
  if (Date.now() - cnbcCache.at < 60_000 && cnbcCache.key === key) return cnbcCache.map;

  const url = `https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=${encodeURIComponent(
    symbols.join('|'),
  )}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;
  const txt = await fetchRaw(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  const map = parseCnbcQuotes(txt);
  cnbcCache = { at: Date.now(), key, map };
  return map;
}

export const GLOBAL_CNBC_SYMBOLS = [
  '.GDAXI', '.FCHI', '.KS11', '.NSEI', '.AXJO', '.GSPTSE', '.TWII', 'US10Y',
  '.N225', '.FTSE', '.DJI', '.BVSP',
];

export function cnbcQuote(symbol) {
  return {
    name: `cnbc:${symbol}`,
    async load() {
      const map = await cnbcBatchFetch(GLOBAL_CNBC_SYMBOLS);
      return cnbcQuoteOf(map.get(symbol));
    },
  };
}

/**
 * 腾讯行情：`qt.gtimg.cn` 单次可查多个标的，实测几乎不限流，
 * 且是少数同时覆盖 A 股 / 港股 / 美股指数的免费源。
 * 实时报价用 q=，返回以 ~ 分隔的字段串。
 */
export function tencentQuote(code) {
  return {
    name: `tencent:${code}`,
    async load() {
      const txt = await fetchRaw(`https://qt.gtimg.cn/q=${encodeURIComponent(code)}`, {
        headers: { Referer: 'https://gu.qq.com/' },
        encoding: 'gb18030',
      });
      const m = /="([\s\S]*?)"/.exec(txt);
      if (!m || !m[1].trim()) throw new Error('空响应');
      const f = m[1].split('~');
      const price = toNum(f[3]);
      const prev = toNum(f[4]);
      if (!(price > 0)) throw new Error('价格无效');
      // f[32] 已经是百分数（-0.52 表示 -0.52%），不要再除 100
      const pct = toNum(f[32]);
      return {
        price,
        prevClose: prev > 0 ? prev : null,
        change: toNum(f[31]),
        changePct: pct,
        sessionTime: f[30] ?? null,
        note: f[1] ?? null,
      };
    },
  };
}

/**
 * 腾讯日线（A 股 / 港股 / 美股指数）。
 * 返回 [日期, 开, 收, 高, 低, 成交量]，和东财口径不同，这里统一映射成内部 rows。
 * 实测：A 股可回溯 640 交易日，美股指数只给 1 天（历史要走 Nasdaq / FRED）。
 */

/**
 * FRED（圣路易斯联储）日频序列，官方数据、无需 key、不限流、可回溯数十年。
 * 是美债收益率 / WTI / 汇率这类宏观序列最稳的来源。
 * CSV 里缺失值写作 "."，直接跳过。
 */

/**
 * Nasdaq 官方历史接口，给纳指系列完整 OHLC（实测 NDX 2979 条，2015 起）。
 * 日期是 MM/DD/YYYY，数值带千分位逗号，需要清洗。
 */






/**
 * 新浪全球期货日线 —— 覆盖商品：XAU(伦敦金) / GC(COMEX金) / CL(WTI) /
 * OIL(布伦特) / HG(铜) / SI(白银) / NG(天然气)。
 * 实测 CL 可回溯 1996 年（7689 条），是免费商品历史里最全的。
 */

/**
 * 新浪外汇日线。DINIW 就是 ICE 美元指数本身（点位约 101.8，与东财 100.UDI 同口径），
 * 自 1985 年起 10594 条。注意它不是 JSON，是 `日期,开,低,高,收,` 用 | 分隔的长串。
 * 不要拿 FRED 的 DTWEXBGS 顶替 —— 那是广义贸易加权指数（约 121），两个不同的东西。
 */

/**
 * 新浪国内期货日线（AU0 = 上期所沪金主力连续，2008 年起 4576 条）。
 * 只用于宏观/事件研究的收益率计算：AU0 与 AU9999 现货的日对数收益率相关性 > 0.99，
 * 基差在收益率里会被消掉。详情页的价格轴仍应走现货，不要把期货价当现货价展示。
 */

// query1 被限流时 query2 通常还能用，两个域名轮换能绕开短时封禁
export const YAHOO_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];

export function parseYahooChart(txt) {
  const meta = JSON.parse(txt)?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('空响应');
  const price = toNum(meta.regularMarketPrice);
  const prev = toNum(meta.chartPreviousClose ?? meta.previousClose);
  if (!(price > 0)) throw new Error('价格无效');
  const ts = Number(meta.regularMarketTime);
  const sessionTime = ts
    ? new Date(ts * 1000 + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
    : null;
  return { price, prevClose: prev, sessionTime, note: meta.marketState ?? null };
}

export async function yahooQuoteOnce(symbol) {
  const chartPath = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  let lastErr = null;
  for (const host of YAHOO_HOSTS) {
    try {
      const txt = await fetchRaw(`https://${host}${chartPath}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      return parseYahooChart(txt);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Yahoo 请求失败');
}

/** 新浪国际指数：名称,最新价,涨跌额,涨跌幅% */
export function sinaInt(code) {
  return {
    name: `sina:${code}`,
    async load() {
      const text = await fetchRaw(`https://hq.sinajs.cn/list=${code}`, {
        headers: { Referer: SINA_REFERER },
        encoding: 'gb18030',
      });
      const m = /="([^"]*)"/.exec(text);
      const body = m?.[1];
      if (!body) throw new Error('空响应');
      const f = body.split(',');
      const price = toNum(f[1]);
      const chg = toNum(f[2]);
      const pct = toNum(f[3]);
      if (!(price > 0)) throw new Error('价格无效');
      return {
        price,
        prevClose: Number.isFinite(price - chg) ? price - chg : null,
        change: Number.isFinite(chg) ? chg : null,
        changePct: Number.isFinite(pct) ? pct : null,
        sessionTime: null,
        note: f[0] || null,
      };
    },
  };
}