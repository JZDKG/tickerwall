/* ================================================================== *
 * 报价服务：标的配置 · 多源降级 · 分时缓冲与播种 · 价差芯片 · 隔夜复盘
 *
 * 从 server.mjs 整段搬出（L87–L1393 与快照节流/隔夜复盘两块），逻辑一字未改，
 * 只加了 export 与 import。这是服务层里唯一「零同层依赖」的两块之一：
 * 只用 domain/（市场时段与环形缓冲）、db/（日线缓存与快照）、providers/（各源）。
 *
 * 为什么 include 隔夜复盘：它读的是 db 里的快照，与 getQuotes 的写入端成对，
 * 分开会让「谁在什么时候落快照」这条因果散在两个模块里。
 * ================================================================== */

import {
  MARKET_PROFILES,
  marketStatusOf,
  parseDataTime,
  gradeFreshness,
  humanAge,
} from '../domain/market-hours.js';
import { createHistoryRing } from '../domain/history-ring.js';
import {
  getDb,
  readDailyCache,
  writeDailyCache,
  takeSnapshot,
  readSnapshots,
  readJson,
  writeHistoryFile,
} from '../db/index.js';
import {
  fetchRaw,
  toNum,
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
  historySourcesFor,
  DEFAULT_FETCH_TIMEOUT_MS,
} from '../providers/index.js';
import { DATA_DIR } from '../paths.js';
import path from 'node:path';
import fsp from 'node:fs/promises';

export const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
// 日线落盘缓存：源全挂时详情页直接读盘，不再白屏
export const DAILY_CACHE_DIR = path.join(DATA_DIR, 'daily');
// SQLite 单文件库（node:sqlite 内置，零依赖）

// getDb() 已下沉到 src/server/db/sqlite.js

export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 15000);
export const FETCH_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS;
export const HISTORY_LIMIT = 240;


/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */



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
export const GLOBAL_CNBC_SYMBOLS = [
  '.GDAXI', '.FCHI', '.KS11', '.NSEI', '.AXJO', '.GSPTSE', '.TWII', 'US10Y',
  '.N225', '.FTSE', '.DJI', '.BVSP',
];

export const GLOBAL_INDEX_DEFS = [
  // 亚太（最早开盘，北京时间 08:00–15:00）
  { id: 'hsi', name: '恒生指数', sub: '香港恒生指数', market: 'hk-index', yahoo: '^HSI', em: '100.HSI', tx: 'hkHSI' },
  { id: 'n225', name: '日经225', sub: '东京日经225指数', market: 'jp-index', cnbc: '.N225', yahoo: '^N225', em: '100.N225' },
  { id: 'kospi', name: '韩国KOSPI', sub: '首尔KOSPI指数', market: 'kr-index', yahoo: '^KS11', cnbc: '.KS11' },
  { id: 'twii', name: '台湾加权', sub: '台湾加权股价指数', market: 'tw-index', yahoo: '^TWII', cnbc: '.TWII' },
  { id: 'asx', name: '澳洲ASX200', sub: '悉尼ASX 200指数', market: 'au-index', yahoo: '^AXJO', cnbc: '.AXJO' },
  { id: 'nifty', name: '印度NIFTY', sub: '印度NIFTY 50指数', market: 'in-index', yahoo: '^NSEI', cnbc: '.NSEI' },
  // 欧洲（北京时间 15:00–23:30）
  { id: 'dax', name: '德国DAX', sub: '法兰克福DAX指数', market: 'eu-index', yahoo: '^GDAXI', cnbc: '.GDAXI' },
  { id: 'ftse', name: '英国富时100', sub: '伦敦富时100指数', market: 'uk-index', cnbc: '.FTSE', yahoo: '^FTSE', em: '100.FTSE' },
  { id: 'cac', name: '法国CAC40', sub: '巴黎CAC40指数', market: 'eu-index', yahoo: '^FCHI', cnbc: '.FCHI' },
  // 美洲（北京时间 21:30–04:00）
  { id: 'dji', name: '道琼斯', sub: '道琼斯工业平均指数', market: 'us-index', cnbc: '.DJI', yahoo: '^DJI', em: '100.DJIA' },
  { id: 'tsx', name: '加拿大TSX', sub: '多伦多S&P/TSX指数', market: 'ca-index', yahoo: '^GSPTSE', cnbc: '.GSPTSE' },
  { id: 'bvsp', name: '巴西Bovespa', sub: '圣保罗Bovespa指数', market: 'br-index', cnbc: '.BVSP', yahoo: '^BVSP' },
];

/** 标记跨合约兜底源（如现货金降级到期货金）：报价可应急展示，但禁止混写进现货分时缓冲 */
export const basisProxy = (src) => ({ ...src, basisProxy: true });

export const INSTRUMENTS = [
  /* ── 核心跨资产（前 11 项：免滚动就能看全宏观定价锚）─────────────────
     顺序按「商品 → 核心股指/波动率 → 定价锚与加密」，
     12 个区域股指沉到后面，避免首屏第一眼被巴西、澳洲这类边缘指数占满。   */

  {
    id: 'gold-cn',
    market: 'cn-spot',
    em: '118.AU9999',
    name: '国内金价',
    sub: '上海黄金交易所 Au99.99 现货',
    unit: '元/克',
    decimals: 2,
    sources: [sinaSpot('gds_AU9999'), sinaSpot('gds_AUTD'), basisProxy(sinaFutures('nf_AU0'))],
    seed: { kind: 'em', secid: '118.AU9999' },
  },
  {
    id: 'gold-intl',
    market: 'intl-futures',
    em: '122.XAU',
    sinaFutures: 'XAU',
    name: '国际金价',
    sub: '伦敦金 XAU/USD 现货',
    unit: '美元/盎司',
    decimals: 2,
    sources: [sinaSpot('hf_XAU'), basisProxy(sinaSpot('hf_GC')), goldApi('XAU')],
    seed: [
      { kind: 'em', secid: '101.GC00Y', note: '走势参考 COMEX 黄金期货' },
      { kind: 'yahoo', symbol: 'GC=F', note: '走势参考 COMEX 黄金期货' },
    ],
  },
  {
    id: 'oil',
    market: 'intl-futures',
    em: '102.CL00Y',
    sinaFutures: 'CL',
    fred: 'DCOILWTICO',
    name: '国际原油',
    sub: 'WTI 纽约原油',
    unit: '美元/桶',
    decimals: 2,
    sources: [sinaSpot('hf_CL'), eastmoney('102.CL00Y')],
    extras: [
      {
        id: 'brent',
        name: '布伦特',
        sources: [sinaSpot('hf_OIL'), eastmoney('112.B00Y')],
      },
    ],
    seed: [{ kind: 'em', secid: '102.CL00Y' }, { kind: 'yahoo', symbol: 'CL=F' }],
  },
  {
    id: 'sp500',
    market: 'us-index',
    em: '100.SPX',
    yahoo: '^GSPC',
    fred: 'SP500',
    name: '标普500',
    sub: 'S&P 500 指数',
    unit: '点',
    decimals: 2,
    sources: [sinaGlobal('gb_$inx'), yahooQuote('^GSPC'), eastmoney('100.SPX')],
    seed: [{ kind: 'em', secid: '100.SPX' }, { kind: 'yahoo', symbol: '^GSPC' }],
  },
  {
    id: 'ndx100',
    market: 'us-index',
    em: '100.NDX100',
    sinaUs: '.NDX',
    yahoo: '^NDX',
    tx: 'usNDX',
    nasdaq: 'NDX',
    name: '纳斯达克100',
    sub: 'NASDAQ 100 指数',
    unit: '点',
    decimals: 2,
    // 兜底不能用 gb_$ixic —— 那是纳斯达克综合指数，实测 25,955 点，
    // 而 NDX100 是 28,957 点，差 3,002 点（11.6%）。主源一超时就会跳崖，
    // 而且这个跳变会被 pushHistory 写进分时环形缓冲，留下永久断崖。
    sources: [sinaGlobal('gb_$ndx'), tencentQuote('usNDX'), yahooQuote('^NDX'), eastmoney('100.NDX100')],
    seed: [{ kind: 'em', secid: '100.NDX100' }, { kind: 'yahoo', symbol: '^NDX' }],
  },
  {
    id: 'sh000001',
    market: 'cn-index',
    em: '1.000001',
    tx: 'sh000001',
    name: '上证指数',
    sub: '上海证券交易所 000001',
    unit: '点',
    decimals: 2,
    sources: [sinaIndexFull('sh000001'), sinaSimpleIndex('s_sh000001'), eastmoney('1.000001')],
    seed: { kind: 'em', secid: '1.000001' },
  },
  {
    id: 'vix',
    market: 'us-index',
    cboe: 'VIX',
    name: '市场波动率',
    sub: 'CBOE VIX 恐慌指数 / VXN 纳指波动率',
    unit: '点',
    decimals: 2,
    sources: [cboeIndex('VIX')],
    extras: [{ id: 'vxn', name: 'VXN', sources: [cboeIndex('VXN')] }],
  },
  {
    // 2026-10 新增：美元指数是黄金/原油/新兴市场的第一定价锚，首屏必须有
    id: 'dxy',
    market: 'fx',
    em: '100.UDI',
    sinaForex: 'DINIW',
    name: '美元指数',
    sub: 'ICE 美元指数（DINIW）',
    unit: '点',
    decimals: 2,
    // DINIW 就是 ICE DXY 本身（末值约 101.8），不要拿 FRED 的 DTWEXBGS 顶替 ——
    // 那是广义贸易加权指数（约 121，含人民币/比索等 26 个经济体），两个不同的东西
    sources: [sinaForexQuote('DINIW'), eastmoney('100.UDI')],
  },
  {
    id: 'us10y',
    market: 'us-rate',
    em: '171.US10Y',
    fred: 'DGS10',
    name: '美债10年期',
    sub: '美国 10 年期国债收益率',
    unit: '%',
    decimals: 3,
    kind: 'rate',
    // 兜底链：CNBC 批量（零额外 HTTP）→ 东财 → 读库的 FRED DGS10
    sources: [cnbcQuote('US10Y'), eastmoney('171.US10Y'), fredQuote('DGS10', 'us10y')],
  },
  {
    id: 'usdcny',
    market: 'fx',
    fred: 'DEXCHUS',
    name: '离岸人民币',
    sub: 'USD/CNH 离岸人民币',
    unit: '元',
    decimals: 4,
    sources: [sinaForexQuote('fx_susdcnh'), sinaForexQuote('fx_susdcny'), fredQuote('DEXCHUS', 'usdcny')],
  },
  {
    id: 'btc',
    market: 'crypto',
    binanceSymbol: 'BTCUSDT',
    name: '比特币',
    sub: 'BTC/USDT · 24 小时',
    unit: '美元',
    decimals: 2,
    sources: [binance('api.binance.com'), binance('data-api.binance.vision'), coinbase('BTC-USD')],
    seed: { kind: 'binance', symbol: 'BTCUSDT', interval: '5m' },
  },

  /* ── 全球区域股指（12 项，按交易时段从早到晚）──────────────────── */
  ...GLOBAL_INDEX_DEFS.map((d) => ({
    id: d.id,
    market: d.market,
    tx: d.tx ?? null,
    name: d.name,
    sub: d.sub,
    unit: '点',
    decimals: 2,
    sources: [
      ...(d.cnbc ? [cnbcQuote(d.cnbc)] : []),
      ...(d.em ? [eastmoney(d.em)] : []),
      // 腾讯行情：hkHSI 这类只有它有活源。此前 tx 仅作为元数据暴露，从未参与
      // sources 组装，等于配了却不用 —— 恒生一旦东财断连就只剩 yahoo 一条腿。
      ...(d.tx ? [tencentQuote(d.tx)] : []),
      ...(d.sina ? [sinaInt(d.sina)] : []),
      yahooQuote(d.yahoo),
    ],
  })),
];

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
 * 日线落盘缓存。
 *
 * 起因：2026-10-26 实测东财整段返回空、Yahoo 返回 429，四个标的的详情页
 * 变成「0 条」。多源能缓解，但所有源同时不可用时就只剩缓存这一条路。
 *
 * 策略：新鲜（8h 内）直接用、不打源；过期则请求源，源全失败时回退到旧缓存
 * 并标注陈旧时长。这样图表永远有东西可画，只是明确告诉用户数据截止到哪天。
 */

export function dailyCacheFile(id) {
  return path.join(DAILY_CACHE_DIR, `${id}.json`);
}




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

/** CME Globex / 纽约汇市：周日 18:00 ET 开盘，周五 17:00 ET 收盘，每日 17:00–18:00 结算 */





/** 当前是否在该市场的交易时段内（按交易所本地时区判断） */


/* 布伦特在列表里是原油行的附加报价，但详情页可以单独打开，所以这里给它一份等价配置 */
export const DETAIL_ONLY_INSTRUMENTS = [
  {
    id: 'brent',
    market: 'intl-futures',
    sinaFutures: 'OIL',
    name: '布伦特原油',
    sub: 'ICE 布伦特原油当月连续',
    unit: '美元/桶',
    decimals: 2,
    em: '112.B00Y',
    sources: [sinaSpot('hf_OIL'), eastmoney('112.B00Y')],
  },
  {
    id: 'vxn',
    market: 'us-index',
    cboe: 'VXN',
    name: 'VXN 纳指波动率',
    sub: 'CBOE 纳斯达克100 波动率指数',
    unit: '点',
    decimals: 2,
    sources: [cboeIndex('VXN')],
  },
];

export function findInstrument(id) {
  return INSTRUMENTS.find((i) => i.id === id) ?? DETAIL_ONLY_INSTRUMENTS.find((i) => i.id === id) ?? null;
}

/* ------------------------------------------------------------------ *
 * 走势历史（内存环形缓冲 + 落盘，重启后走势不断档）
 * ------------------------------------------------------------------ */

// 分时环形缓冲：结构与两条写入护栏都在 domain/history-ring.js，这里只持唯一实例
export const ring = createHistoryRing({ limit: HISTORY_LIMIT });

/** 兼容层：保留原函数名与签名，调用点一行未改 */
export function pushHistory(id, price, t = Date.now(), decimals = 2, meta = {}) {
  return ring.push(id, price, t, decimals, meta);
}
export const lastGood = new Map(); // id -> 最近一次成功快照


export let saveTimer = null;

/**
 * 仅供测试：清掉模块级节流状态。
 *
 * saveTimer / lastSnapshotAt 都是「进程内只该有一份」的状态，跨用例会互相
 * 影响（上一个用例排的 2 秒落盘定时器会让下一个用例的 scheduleHistorySave
 * 直接 early-return）。生产代码不调用它。
 */
export function __resetRuntimeStateForTests() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  lastSnapshotAt = 0;
}

export function scheduleHistorySave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      // 注脚记录走势的真实来源（例如现货金用了期货形态），必须随历史一起持久化
      await writeHistoryFile(HISTORY_FILE, {
        notes: Object.fromEntries([...seedNotes].map(([id, rec]) => [id, rec])),
        history: Object.fromEntries(ring.entries()),
      });
    } catch {
      /* 落盘失败不影响主流程 */
    }
  }, 2000);
}

/**
 * 一次性迁移：把旧的 JSON / JSONL 落盘数据导入 SQLite。
 * 只跑一次（kv 里记 migrated-sqlite-v1 标记），迁移完保留原文件不删，
 * 方便回滚核对。新数据一律只写库。
 */
export async function migrateLegacyStorage() {
  try {
    const db = getDb();
    const done = db.prepare("SELECT v FROM kv WHERE k = 'migrated-sqlite-v1'").get();
    if (done) return;

    let importedBars = 0;
    let importedSnaps = 0;
    let importedLlm = 0;

    // 1) data/daily/*.json
    try {
      const files = await fsp.readdir(DAILY_CACHE_DIR);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const obj = JSON.parse(await fsp.readFile(path.join(DAILY_CACHE_DIR, f), 'utf8'));
          if (Array.isArray(obj?.rows) && obj.rows.length >= 2 && obj.id) {
            await writeDailyCache(obj.id, obj.source, obj.rows);
            importedBars += obj.rows.length;
          }
        } catch {
          /* 单个坏文件跳过 */
        }
      }
    } catch {
      /* 目录不存在 */
    }

    // 2) data/snapshots.jsonl
    try {
      const raw = await fsp.readFile(SNAPSHOT_FILE, 'utf8');
      const ins = db.prepare(
        'INSERT OR REPLACE INTO snapshots (at, id, name, price, change_pct) VALUES (?, ?, ?, ?, ?)',
      );
      db.exec('BEGIN');
      try {
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          // 只把「JSON 解析失败」当半截行跳过。写入失败（约束冲突、磁盘满）
          // 必须冒到事务层，否则整批 0 行也会静默 COMMIT，迁移看起来成功。
          let obj;
          try {
            obj = JSON.parse(line);
          } catch {
            continue;
          }
          if (!obj?.at || !Array.isArray(obj.quotes)) continue;
          for (const snap of obj.quotes) {
            if (!snap?.id || !(snap.price > 0)) continue;
            ins.run(obj.at, snap.id, snap.name ?? null, snap.price, snap.changePct ?? null);
            importedSnaps += 1;
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    } catch (err) {
      // 文件不存在是正常情况（首次运行）；写库失败不能一起被吞掉
      if (err?.code !== 'ENOENT') throw err;
    }

    // 3) data/llm-cache.json
    try {
      const obj = JSON.parse(await fsp.readFile(LLM_STORE_FILE, 'utf8'));
      if (obj && Object.keys(obj).length) {
        db.prepare(
          `INSERT INTO kv (k, v, at) VALUES ('llm-cache', ?, ?)
           ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at`,
        ).run(JSON.stringify(obj), Date.now());
        importedLlm = Object.keys(obj).length;
      }
    } catch {
      /* 文件不存在 */
    }

    db.prepare("INSERT INTO kv (k, v, at) VALUES ('migrated-sqlite-v1', ?, ?)").run(
      JSON.stringify({ importedBars, importedSnaps, importedLlm }),
      Date.now(),
    );
    console.log(
      `SQLite 迁移完成：日线 ${importedBars} 行 / 快照 ${importedSnaps} 行 / LLM 缓存 ${importedLlm} 条`,
    );
  } catch (err) {
    console.warn('SQLite 迁移失败:', err?.message ?? err);
  }
}

export async function loadPersistedHistory() {
  try {
    const obj = await readJson(HISTORY_FILE);
    if (!obj) return;
    // 兼容旧格式（直接是 id -> points 的扁平对象）
    const points = obj.history && typeof obj.history === 'object' ? obj.history : obj;
    for (const [id, arr] of Object.entries(points)) {
      if (Array.isArray(arr) && arr.length) {
        ring.set(id, arr);
      }
    }
    if (obj.notes && typeof obj.notes === 'object') {
      for (const [id, rec] of Object.entries(obj.notes)) {
        if (rec && typeof rec.note === 'string' && Number.isFinite(rec.at)) seedNotes.set(id, rec);
      }
    }
  } catch {
    /* 首次运行没有历史文件 */
  }
}

/** 用真实的分时/K 线补齐走势，避免打开看板时空空如也。
 *  只补「当前标的本身」的日内数据；确有代理标的时（如现货金→黄金期货），
 *  会在卡片上注明，并在 12 小时后自动不再显示（届时历史已由真实报价填满）。 */
export const SEED_NOTE_TTL_MS = 12 * 3600 * 1000;
export const seedNotes = new Map(); // id -> { note, at }

export async function seedPoints(inst) {
  if (!inst.seed) return null;
  const attempts = Array.isArray(inst.seed) ? inst.seed : [inst.seed];
  for (const attempt of attempts) {
    try {
      const got = await seedFrom(attempt);
      if (got) return got;
    } catch {
      /* 换下一个种子源 */
    }
  }
  return null;
}

/** 只保留最后一个自然日（北京时间）内的点，避免把多日数据塞进「日内走势」 */
export function trimToLastSession(points) {
  if (points.length < 2) return points;
  const dayOf = (t) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const lastDay = dayOf(points[points.length - 1].t);
  const kept = points.filter((p) => dayOf(p.t) === lastDay);
  return kept.length >= 2 ? kept : points;
}

export async function seedFrom(s) {
  if (s.kind === 'em') {
    const url =
      'https://push2his.eastmoney.com/api/qt/stock/trends2/get' +
      `?secid=${encodeURIComponent(s.secid)}&fields1=f1,f2,f3&fields2=f51,f53&iscr=0&ndays=1`;
    const j = JSON.parse(await fetchRaw(url));
    const trends = j?.data?.trends;
    if (!Array.isArray(trends) || trends.length === 0) return null;
    const pts = [];
    for (const row of trends) {
      const [ts, val] = String(row).split(',');
      const p = toNum(val);
      if (!(p > 0)) continue;
      const parsed = Date.parse(`${ts.replace(' ', 'T')}:00+08:00`);
      pts.push({ t: Number.isFinite(parsed) ? parsed : Date.now(), p });
    }
    const trimmed = trimToLastSession(pts);
    return trimmed.length >= 2 ? { points: trimmed, note: s.note ?? null } : null;
  }

  if (s.kind === 'yahoo') {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}` +
      '?interval=5m&range=1d';
    const j = JSON.parse(await fetchRaw(url, { headers: { Accept: 'application/json' } }));
    const result = j?.chart?.result?.[0];
    if (!result) return null;
    const stamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const pts = [];
    for (let i = 0; i < stamps.length; i += 1) {
      const p = toNum(closes[i]);
      if (!(p > 0)) continue;
      pts.push({ t: stamps[i] * 1000, p });
    }
    return pts.length >= 2 ? { points: pts, note: s.note ?? null } : null;
  }

  if (s.kind === 'binance') {
    const url =
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(s.symbol)}` +
      `&interval=${s.interval ?? '5m'}&limit=${HISTORY_LIMIT}`;
    const rows = JSON.parse(await fetchRaw(url));
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const pts = [];
    for (const row of rows) {
      const p = toNum(row[4]); // 收盘价
      const t = toNum(row[0]); // 开盘时间(ms)
      if (!(p > 0)) continue;
      pts.push({ t: t ?? Date.now(), p });
    }
    return pts.length >= 2 ? { points: pts, note: s.note ?? null } : null;
  }

  return null;
}

export async function seedHistory() {
  const targets = INSTRUMENTS.filter((i) => i.seed && !ring.has(i.id));
  await Promise.all(
    targets.map(async (inst) => {
      try {
        const seeded = await seedPoints(inst);
        if (!seeded) return;
        ring.set(inst.id, seeded.points);
        if (seeded.note) seedNotes.set(inst.id, { note: seeded.note, at: Date.now() });
      } catch {
        /* 补种失败就让它自然积累 */
      }
    }),
  );
}

export function historyNoteFor(id) {
  const rec = seedNotes.get(id);
  if (!rec) return null;
  return Date.now() - rec.at < SEED_NOTE_TTL_MS ? rec.note : null;
}

/* ------------------------------------------------------------------ *
 * 聚合刷新
 * ------------------------------------------------------------------ */

/** 依次尝试多个源，把结果归一化；全部失败时 ok:false 并带错误信息 */
export async function loadWithFallback(sources) {
  const errors = [];
  for (let i = 0; i < sources.length; i += 1) {
    const src = sources[i];
    try {
      const raw = await src.load();
      const price = raw.price;
      if (!(price > 0)) throw new Error('价格无效');
      const prevClose = raw.prevClose ?? null;
      let change = raw.change ?? null;
      let changePct = raw.changePct ?? null;
      if (change == null && prevClose != null && prevClose > 0) change = price - prevClose;
      // 优先用「涨跌额 / 昨收」自己算：源端给的百分比常被四舍五入到 2 位
      // （如纳指100 -0.004% 会变成 -0.00%）
      if (change != null && prevClose != null && prevClose > 0) {
        changePct = (change / prevClose) * 100;
      } else if (changePct == null && prevClose != null && prevClose > 0) {
        changePct = ((price - prevClose) / prevClose) * 100;
      }
      return {
        ok: true,
        price,
        prevClose,
        change,
        changePct,
        open: raw.open ?? null,
        high: raw.high ?? null,
        low: raw.low ?? null,
        sessionTime: raw.sessionTime ?? null,
        source: src.name,
        fallback: i > 0,
        stale: Boolean(raw.stale),
        basisProxy: Boolean(src.basisProxy || raw.basisProxy),
        error: null,
      };
    } catch (err) {
      errors.push(`${src.name}: ${err?.message ?? String(err)}`);
    }
  }
  return {
    ok: false,
    price: null,
    prevClose: null,
    change: null,
    changePct: null,
    open: null,
    high: null,
    low: null,
    sessionTime: null,
    source: null,
    fallback: false,
    error: errors.join(' / '),
  };
}

export const extraLastGood = new Map(); // "instId:extraId" -> 上一次成功的附加报价

/** 附加报价：挂在主标的同一张卡片里（如原油行的布伦特），独立取数与兜底 */
export async function resolveExtras(inst) {
  if (!inst.extras?.length) return [];
  return Promise.all(
    inst.extras.map(async (ex) => {
      const key = `${inst.id}:${ex.id}`;
      const r = await loadWithFallback(ex.sources);
      const payload = {
        id: ex.id,
        name: ex.name,
        ok: r.ok,
        price: r.price,
        change: r.change,
        changePct: r.changePct,
        sessionTime: r.sessionTime,
        source: r.source,
        stale: false,
        error: r.error,
      };
      if (r.ok) {
        extraLastGood.set(key, payload);
        return payload;
      }
      const cached = extraLastGood.get(key);
      return cached ? { ...cached, ok: false, stale: true, error: r.error } : payload;
    }),
  );
}


/* ------------------------------------------------------------------ *
 * 数据新鲜度
 * 看板最怕的不是没数据，是安静地显示一个旧值 —— 周末收盘、源延迟、
 * 停牌都长一个样。这里把「源数据时点」解析出来，按市场状态分级。
 * ------------------------------------------------------------------ */


/** 分级：交易中的容忍度远小于已收盘（已收盘本来就是最后成交价） */


/** 单日变动超过这个幅度基本可以确定是脏数据或极端行情，需要人工看一眼 */
export const MOVE_SUSPECT_PCT = {
  'gold-cn': 8,
  'gold-intl': 10,
  btc: 30,
  oil: 15,
  sp500: 10,
  ndx100: 12,
  sh000001: 10,
  vix: 60,
  vxn: 60,
  // 新增标的：美元/人民币单日 3-4% 已是百年一遇或脏数据，用 20% 默认值会漏判
  dxy: 4,
  usdcny: 3,
  us10y: 15,
};

export function buildFreshness(inst, main, marketStatus, now = new Date()) {
  const dataTime = parseDataTime(main.sessionTime, now);
  let ageMs = dataTime ? now.getTime() - dataTime.getTime() : null;

  // 有些源（币安 ticker）本身不给时间戳，但那是实时推送，取数即当下
  // 部分源（新浪 int_ 指数、币安 ticker）不返回时间戳：按市场状态给一个人话标签，
  // 而不是让界面显示「—」——交易中就是实时，已收盘就是收盘价
  const isLive = !dataTime && /binance|coinbase|sina:int_|cnbc:/i.test(String(main.source ?? ''));
  if (isLive) ageMs = 0;

  const isOpen = Boolean(marketStatus?.open);
  const level = ageMs == null ? 'unknown' : gradeFreshness(ageMs, isOpen);

  const limit = MOVE_SUSPECT_PCT[inst.id] ?? 20;
  const pct = main.changePct;
  const suspect = pct != null && Math.abs(pct) > limit;

  return {
    dataTime: dataTime ? dataTime.toISOString() : null,
    ageMs,
    label: isLive
      ? marketStatus?.open
        ? '实时'
        : '收盘价'
      : ageMs == null
        ? (main.sessionTime ? String(main.sessionTime) : '—')
        : humanAge(ageMs),
    level,
    suspect,
    suspectNote: suspect ? `单日变动 ${pct.toFixed(1)}% 超出该标的常规区间（±${limit}%），可能是脏数据或极端行情` : null,
  };
}
export async function resolveInstrument(inst) {
  const [main, extras] = await Promise.all([loadWithFallback(inst.sources), resolveExtras(inst)]);

  if (main.ok) {
    pushHistory(inst.id, main.price, Date.now(), inst.decimals ?? 2, {
      source: main.source,
      basisProxy: main.basisProxy,
    });
    const status = marketStatusOf(inst);
    const snapshot = {
      ok: true,
      id: inst.id,
      name: inst.name,
      sub: inst.sub,
      unit: inst.unit,
      decimals: inst.decimals,
      price: main.price,
      prevClose: main.prevClose,
      change: main.change,
      changePct: main.changePct,
      open: main.open,
      high: main.high,
      low: main.low,
      sessionTime: main.sessionTime,
      marketStatus: status,
      freshness: buildFreshness(inst, main, status),
      priceBasis: MARKET_PROFILES[inst.market]?.priceBasis ?? 'close',
      historyNote: historyNoteFor(inst.id),
      source: main.source,
      fallback: main.fallback,
      stale: Boolean(main.stale),
      basisProxy: Boolean(main.basisProxy),
      error: null,
      extras,
      history: ring.get(inst.id) ?? [],
    };
    lastGood.set(inst.id, snapshot);
    return snapshot;
  }

  // 主标的全部源失败：保留上一次成功的数值，标记为过期，避免整屏变空
  const cached = lastGood.get(inst.id);
  if (cached) {
    return {
      ...cached,
      ok: false,
      stale: true,
      error: main.error,
      extras,
      history: ring.get(inst.id) ?? [],
    };
  }
  return {
    ok: false,
    id: inst.id,
    name: inst.name,
    sub: inst.sub,
    unit: inst.unit,
    decimals: inst.decimals,
    price: null,
    prevClose: null,
    change: null,
    changePct: null,
    open: null,
    high: null,
    low: null,
    sessionTime: null,
    historyNote: null,
    source: null,
    fallback: false,
    stale: false,
    error: main.error,
    extras,
    history: [],
  };
}

/**
 * 首屏两个高价值价差 Chip，在同批次报价里直接合成 —— 零额外 HTTP。
 *   · 沪金溢价：国际金价折人民币 vs 上金所现货，反映内外盘背离
 *   · Brent-WTI：两个原油基准的价差，反映运输/品质与出口限制
 */
export const OZ_TO_GRAM = 31.1034768;

export function applySpreadChips(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const priceOf = (id) => {
    const it = byId.get(id);
    return it?.ok && it.price > 0 ? it.price : null;
  };

  // 沪金溢价（元/克）
  const goldCn = priceOf('gold-cn');
  const xau = priceOf('gold-intl');
  const rate = priceOf('usdcny');
  const goldRow = byId.get('gold-cn');
  if (goldRow && goldCn && xau && rate) {
    const converted = (xau / OZ_TO_GRAM) * rate;
    const diff = goldCn - converted;
    goldRow.extras = [
      ...(Array.isArray(goldRow.extras) ? goldRow.extras : []),
      {
        id: 'gold-intl',
        name: '沪金溢价',
        ok: true,
        price: diff,
        priceText: `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} 元/克`,
        changePct: converted > 0 ? (diff / converted) * 100 : null,
        sessionTime: null,
        source: 'calc:内外盘',
        stale: false,
        error: null,
      },
    ];
  }

  // Brent-WTI 价差（美元/桶）
  const oilRow = byId.get('oil');
  const wti = priceOf('oil');
  const brentEx = Array.isArray(oilRow?.extras) ? oilRow.extras.find((e) => e.id === 'brent') : null;
  const brent = brentEx?.ok && brentEx.price > 0 ? brentEx.price : null;
  if (oilRow && wti && brent) {
    const spread = brent - wti;
    oilRow.extras = [
      ...(Array.isArray(oilRow.extras) ? oilRow.extras : []),
      {
        // id 必须是 oil 自己：用 'brent' 会和真实布伦特 Chip 撞 id，
        // 前端 data-detail-id 会同时指向两个元素
        id: 'oil',
        name: 'B-W 价差',
        ok: true,
        price: spread,
        priceText: `$${spread.toFixed(2)}`,
        changePct: null,
        sessionTime: null,
        source: 'calc:价差',
        stale: false,
        error: null,
      },
    ];
  }

  return items;
}

export async function refresh() {
  const items = applySpreadChips(await Promise.all(INSTRUMENTS.map(resolveInstrument)));
  scheduleHistorySave();
  return {
    ok: items.some((i) => i.ok),
    generatedAt: new Date().toISOString(),
    ttlMs: CACHE_TTL_MS,
    items,
  };
}

export let cache = { at: 0, data: null };
export let inflight = null;

export async function getQuotes({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await refresh();
      cache = { at: Date.now(), data };
      // 落一份快照供「隔夜复盘」用。刷新是 15 秒一次，全量落盘会让文件迅速膨胀，
      // 所以节流到 5 分钟，并只记录价格类标的。
      if (Date.now() - lastSnapshotAt > SNAPSHOT_MIN_GAP_MS) {
        lastSnapshotAt = Date.now();
        takeSnapshot(data?.quotes ?? data?.items ?? [], { maxJumpPctById: MOVE_SUSPECT_PCT }).catch(() => {});
      }
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export const LLM_STORE_FILE = path.join(DATA_DIR, 'llm-cache.json');
export const EVENTS_DIR = path.join(DATA_DIR, 'events');
export const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshots.jsonl');
// 快照节流：15 秒刷一次全量落盘会让文件半年就上 GB
export const SNAPSHOT_MIN_GAP_MS = 5 * 60_000;
export let lastSnapshotAt = 0;

/* ------------------------------------------------------------------ *
 * 隔夜复盘
 *
 * A股 15:00 收盘之后，美股/美债/美元/黄金/原油还在走。第二天开盘前
 * 最想知道的就是「昨晚这些东西各走了多少」。这里用自己落的快照做差，
 * 不依赖任何外部源，因此不会因为限流而失效。
 *
 * 基准取「上一个自然日的最后一条快照」（按 Asia/Shanghai 切日）。
 * 数据不足时如实返回 collecting，不编造。
 * ------------------------------------------------------------------ */
export const BRIEFING_MAX_LINES = 20_000;

export function shanghaiDay(iso) {
  try {
    const d = new Date(iso);
    // toLocaleDateString 对 Invalid Date 不抛错，而是返回字符串 "Invalid Date"。
    // 只靠 try/catch 会把它当成合法日期，隔夜复盘的基准切分就会算错。
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  } catch {
    return null;
  }
}

/** 北京时间的「当日第几分钟」，用来切 15:00 这个收盘边界 */
export function shanghaiMinuteOfDay(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const t = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false });
    const [h, m] = t.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  } catch {
    return null;
  }
}


export async function buildBriefing() {
  const snaps = await readSnapshots();
  if (snaps.length < 2) {
    return { ok: true, status: 'collecting', samples: snaps.length, items: [] };
  }
  const latest = snaps[snaps.length - 1];
  /**
   * 基准取「最近一个已过的 A 股收盘 15:00」之前的最后一条快照。
   *
   * 原来取的是上一个自然日 23:59，会把 15:00–24:00 整段漏掉 —— 而这段正好包含
   * 欧盘全程、20:30 美东重磅数据、21:30 美股开盘上半场，正是隔夜最该复盘的部分；
   * 同时日经/A股这些在 23:59 早已收盘的品种会显示 0.00%。
   */
  const CLOSE_MIN = 15 * 60;
  const today = shanghaiDay(latest.at);
  const nowMin = shanghaiMinuteOfDay(latest.at);
  const yesterday = shanghaiDay(new Date(new Date(latest.at).getTime() - 86_400_000).toISOString());
  // 若今天还没到 15:00，边界就落在昨天 15:00
  const cutDay = nowMin != null && nowMin >= CLOSE_MIN ? today : yesterday;

  let baseline = null;
  let crossedDay = false;
  for (let i = snaps.length - 1; i >= 0; i -= 1) {
    const d = shanghaiDay(snaps[i].at);
    const m = shanghaiMinuteOfDay(snaps[i].at);
    if (!d || m == null) continue;
    if (d < cutDay || (d === cutDay && m <= CLOSE_MIN)) {
      baseline = snaps[i];
      crossedDay = true;
      break;
    }
  }
  if (!baseline) {
    // 还没跨过任何 15:00：退回最早一条，标注为「今日开盘以来」而不是「隔夜」
    baseline = snaps[0];
  }
  const baseMap = new Map(baseline.quotes.map((q) => [q.id, q]));
  const items = [];
  const dropped = [];
  for (const q of latest.quotes) {
    const b = baseMap.get(q.id);
    if (!b || !(b.price > 0) || !(q.price > 0)) continue;
    const move = q.price - b.price;
    const movePct = (move / b.price) * 100;
    if (!Number.isFinite(movePct)) continue;

    /**
     * 跨源口径错位过滤：基准与最新刻度若来自不同上游（典型是新浪停更的
     * sina:int_* 僵尸价 vs 东财实时价），差值不是「隔夜涨跌」而是一条脏数据。
     * 阈值复用报价层的 MOVE_SUSPECT_PCT —— 同一套「这个品种一天能动多少」的认知，
     * 不另立一套。宁可少一行，也不给用户看 +40% 这种假信号。
     */
    const suspect = MOVE_SUSPECT_PCT[q.id] ?? 12;
    if (Math.abs(movePct) > suspect) {
      dropped.push({ id: q.id, movePct: Number(movePct.toFixed(2)), limit: suspect });
      continue;
    }
    items.push({
      id: q.id,
      name: q.name,
      from: b.price,
      to: q.price,
      move,
      movePct,
      changePctNow: q.changePct ?? null,
    });
  }
  items.sort((a, b) => Math.abs(b.movePct) - Math.abs(a.movePct));
  return {
    ok: true,
    status: crossedDay ? 'overnight' : 'intraday',
    dropped,
    cutLabel: '15:00 A股收盘',
    baselineAt: baseline.at,
    latestAt: latest.at,
    samples: snaps.length,
    items,
  };
}
