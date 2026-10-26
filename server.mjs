#!/usr/bin/env node
/**
 * 市场看板 —— 零依赖后端
 *
 * 作用：把多个公开行情接口聚合成一个 JSON，供前端纵向列表渲染。
 * 为什么要后端：新浪 / 东方财富接口不带 CORS 头，且新浪要求 Referer，浏览器直连会被拦。
 *
 * 启动：node server.mjs   （默认 http://127.0.0.1:8787）
 */
import http from 'node:http';
import fsp from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 15000);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);
const HISTORY_LIMIT = 240;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SINA_REFERER = 'https://finance.sina.com.cn';

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '' || s === '-' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchRaw(
  url,
  { headers = {}, encoding = 'utf-8', method = 'GET', body = null, timeoutMs = null } = {},
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      ...(body != null ? { body } : {}),
      headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (encoding === 'gb18030') {
      return new TextDecoder('gb18030').decode(buf);
    }
    return buf.toString('utf8');
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('请求超时');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 取出 var hq_str_xxx="a,b,c"; 里的字段数组 */
function splitSina(text) {
  const m = /="([\s\S]*)"/.exec(text);
  if (!m) return null;
  const raw = m[1];
  if (!raw.trim()) return null;
  return raw.split(',');
}

function hhmmss(v) {
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
function sinaSpot(code) {
  return {
    name: `sina:${code}`,
    async load() {
      const text = await fetchRaw(`https://hq.sinajs.cn/list=${code}`, {
        headers: { Referer: SINA_REFERER },
        encoding: 'gb18030',
      });
      const f = splitSina(text);
      if (!f) throw new Error('空响应');
      const price = toNum(f[0]);
      if (!(price > 0)) throw new Error('价格无效');
      return {
        price,
        prevClose: toNum(f[7]),
        open: toNum(f[8]),
        high: toNum(f[4]),
        low: toNum(f[5]),
        sessionTime: f[6] || null,
        note: f[13] || null,
      };
    },
  };
}

/** 新浪美股指数：gb_$inx / gb_$ndx
 *  1 最新价 · 2 涨跌幅% · 3 时间 · 4 涨跌额 · 5 开盘 · 6 最高 · 7 最低 · 26 昨收 */
function sinaGlobal(code) {
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
      const change = toNum(f[4]);
      let prevClose = toNum(f[26]);
      if (prevClose == null && change != null) prevClose = price - change;
      return {
        price,
        prevClose,
        change,
        changePct: toNum(f[2]),
        open: toNum(f[5]),
        high: toNum(f[6]),
        low: toNum(f[7]),
        sessionTime: f[3] ? f[3].slice(-8) : null,
      };
    },
  };
}

/** 新浪 A 股指数简版：s_sh000001
 *  1 现价 · 2 涨跌额 · 3 涨跌幅% · 4 成交量(手) · 5 成交额(万) */
function sinaSimpleIndex(code) {
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
function sinaIndexFull(code) {
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
function sinaFutures(code) {
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
function eastmoney(secid) {
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
function binance(host = 'api.binance.com') {
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
function coinbase(pair = 'BTC-USD') {
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
function goldApi(symbol = 'XAU') {
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

/* ------------------------------------------------------------------ *
 * 标的配置（顺序即页面从上到下的顺序）
 * ------------------------------------------------------------------ */

/** 全球主要股指：本地源优先（更快更实时），Yahoo 兜底 */
const GLOBAL_CNBC_SYMBOLS = ['.GDAXI', '.FCHI', '.KS11', '.NSEI', '.AXJO', '.GSPTSE', '.TWII'];

const GLOBAL_INDEX_DEFS = [
  { id: 'dji', name: '道琼斯', sub: '道琼斯工业平均指数', market: 'us-index', yahoo: '^DJI', sina: 'int_dji', em: '100.DJIA' },
  { id: 'n225', name: '日经225', sub: '东京日经225指数', market: 'jp-index', yahoo: '^N225', em: '100.N225', sina: 'int_nikkei' },
  { id: 'hsi', name: '恒生指数', sub: '香港恒生指数', market: 'hk-index', yahoo: '^HSI', em: '100.HSI', sina: 'int_hangseng' },
  { id: 'dax', name: '德国DAX', sub: '法兰克福DAX指数', market: 'eu-index', yahoo: '^GDAXI', cnbc: '.GDAXI' },
  { id: 'ftse', name: '英国富时100', sub: '伦敦富时100指数', market: 'uk-index', yahoo: '^FTSE', em: '100.FTSE', sina: 'int_ftse' },
  { id: 'cac', name: '法国CAC40', sub: '巴黎CAC40指数', market: 'eu-index', yahoo: '^FCHI', cnbc: '.FCHI' },
  { id: 'bvsp', name: '巴西Bovespa', sub: '圣保罗Bovespa指数', market: 'br-index', yahoo: '^BVSP', sina: 'int_bovespa' },
  { id: 'nifty', name: '印度NIFTY', sub: '印度NIFTY 50指数', market: 'in-index', yahoo: '^NSEI', cnbc: '.NSEI' },
  { id: 'kospi', name: '韩国KOSPI', sub: '首尔KOSPI指数', market: 'kr-index', yahoo: '^KS11', cnbc: '.KS11' },
  { id: 'asx', name: '澳洲ASX200', sub: '悉尼ASX 200指数', market: 'au-index', yahoo: '^AXJO', cnbc: '.AXJO' },
  { id: 'tsx', name: '加拿大TSX', sub: '多伦多S&P/TSX指数', market: 'ca-index', yahoo: '^GSPTSE', cnbc: '.GSPTSE' },
  { id: 'twii', name: '台湾加权', sub: '台湾加权股价指数', market: 'tw-index', yahoo: '^TWII', cnbc: '.TWII' },
];

const INSTRUMENTS = [
  {
    id: 'gold-cn',
    market: 'cn-spot',
    em: '118.AU9999',
    name: '国内金价',
    sub: '上海黄金交易所 Au99.99 现货',
    unit: '元/克',
    decimals: 2,
    sources: [sinaSpot('gds_AU9999'), sinaSpot('gds_AUTD'), sinaFutures('nf_AU0')],
    seed: { kind: 'em', secid: '118.AU9999' },
  },
  {
    id: 'gold-intl',
    market: 'intl-futures',
    em: '122.XAU',
    name: '国际金价',
    sub: '伦敦金 XAU/USD 现货',
    unit: '美元/盎司',
    decimals: 2,
    sources: [sinaSpot('hf_XAU'), sinaSpot('hf_GC'), goldApi('XAU')],
    seed: [
      { kind: 'em', secid: '101.GC00Y', note: '走势参考 COMEX 黄金期货' },
      { kind: 'yahoo', symbol: 'GC=F', note: '走势参考 COMEX 黄金期货' },
    ],
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
  {
    id: 'oil',
    market: 'intl-futures',
    em: '102.CL00Y',
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
  ...GLOBAL_INDEX_DEFS.map((d) => ({
    id: d.id,
    market: d.market,
    name: d.name,
    sub: d.sub,
    unit: '点',
    decimals: 2,
    sources: [
      ...(d.cnbc ? [cnbcQuote(d.cnbc)] : []),
      ...(d.em ? [eastmoney(d.em)] : []),
      ...(d.sina ? [sinaInt(d.sina)] : []),
      yahooQuote(d.yahoo),
    ],
  })),
  {
    id: 'sp500',
    market: 'us-index',
    em: '100.SPX',
    name: '标普500',
    sub: 'S&P 500 指数',
    unit: '点',
    decimals: 2,
    sources: [sinaGlobal('gb_$inx'), eastmoney('100.SPX')],
    seed: { kind: 'em', secid: '100.SPX' },
  },
  {
    id: 'ndx100',
    market: 'us-index',
    em: '100.NDX100',
    sinaUs: '.NDX',
    name: '纳斯达克100',
    sub: 'NASDAQ 100 指数',
    unit: '点',
    decimals: 2,
    sources: [sinaGlobal('gb_$ndx'), sinaGlobal('gb_$ixic')],
    seed: [{ kind: 'em', secid: '100.NDX100' }, { kind: 'yahoo', symbol: '^NDX' }],
  },
  {
    id: 'sh000001',
    market: 'cn-index',
    em: '1.000001',
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
let yahooChain = Promise.resolve();
function yahooThrottle(fn) {
  const next = yahooChain.then(() => new Promise((r) => setTimeout(r, 380)).then(fn));
  yahooChain = next.catch(() => {});
  return next;
}

/** Yahoo 实时报价（chart API，覆盖全球指数最全） */
function yahooQuote(symbol) {
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
let cnbcCache = { at: 0, map: new Map() };

function cnbcNum(v) {
  if (v == null || v === 'UNCH' || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function cnbcBatchFetch(symbols) {
  const key = symbols.join('|');
  if (Date.now() - cnbcCache.at < 60_000 && cnbcCache.key === key) return cnbcCache.map;

  const url = `https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=${encodeURIComponent(
    symbols.join('|'),
  )}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;
  const txt = await fetchRaw(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  const arr = JSON.parse(txt)?.ITVQuoteResult?.ITVQuote;
  const list = Array.isArray(arr) ? arr : arr ? [arr] : [];

  const map = new Map();
  for (const q of list) {
    if (!q?.symbol) continue;
    map.set(q.symbol, q);
  }
  cnbcCache = { at: Date.now(), key, map };
  return map;
}

function cnbcQuote(symbol) {
  return {
    name: `cnbc:${symbol}`,
    async load() {
      const map = await cnbcBatchFetch(GLOBAL_CNBC_SYMBOLS);
      const q = map.get(symbol);
      if (!q) throw new Error('无该标的');
      const price = cnbcNum(q.last);
      if (!(price > 0)) throw new Error('价格无效');
      return {
        price,
        prevClose: cnbcNum(q.previous_day_closing),
        change: cnbcNum(q.change),
        changePct: cnbcNum(q.change_pct),
        sessionTime: null,
        note: q.name ?? null,
      };
    },
  };
}

// query1 被限流时 query2 通常还能用，两个域名轮换能绕开短时封禁
const YAHOO_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];

function parseYahooChart(txt) {
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

async function yahooQuoteOnce(symbol) {
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
function sinaInt(code) {
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

const MARKET_PROFILES = {
  'cn-spot': {
    label: '上金所',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: [
      { days: [1, 2, 3, 4, 5], from: '09:00', to: '11:30' },
      { days: [1, 2, 3, 4, 5], from: '13:30', to: '15:30' },
      { days: [1, 2, 3, 4, 5], from: '20:00', to: '02:30' },
    ],
  },
  'cn-index': {
    label: 'A股',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: [
      { days: [1, 2, 3, 4, 5], from: '09:30', to: '11:30' },
      { days: [1, 2, 3, 4, 5], from: '13:00', to: '15:00' },
    ],
  },
  'us-index': {
    label: '美股',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: [{ days: [1, 2, 3, 4, 5], from: '21:30', to: '04:00' }],
  },
  'intl-futures': {
    label: '国际期货',
    priceBasis: 'settle',
    daysPerYear: 252,
    ranges: [{ days: [1, 2, 3, 4, 5], from: '06:00', to: '05:00' }],
  },
  crypto: {
    label: '加密',
    priceBasis: 'close',
    daysPerYear: 365,
    ranges: [],
  },
  // 以下时段均按北京时间估算（含夏令时折中），只用于判断新鲜度容忍度
  'jp-index': { label: '东京', priceBasis: 'close', daysPerYear: 245, ranges: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '14:00' }] },
  'hk-index': { label: '港股', priceBasis: 'close', daysPerYear: 245, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:30', to: '16:00' }] },
  'eu-index': { label: '欧股', priceBasis: 'close', daysPerYear: 252, ranges: [{ days: [1, 2, 3, 4, 5], from: '15:00', to: '23:30' }] },
  'uk-index': { label: '英股', priceBasis: 'close', daysPerYear: 252, ranges: [{ days: [1, 2, 3, 4, 5], from: '15:00', to: '23:30' }] },
  'br-index': { label: '巴西', priceBasis: 'close', daysPerYear: 250, ranges: [{ days: [1, 2, 3, 4, 5], from: '21:00', to: '04:00' }] },
  'in-index': { label: '印度', priceBasis: 'close', daysPerYear: 250, ranges: [{ days: [1, 2, 3, 4, 5], from: '11:45', to: '18:00' }] },
  'kr-index': { label: '韩股', priceBasis: 'close', daysPerYear: 245, ranges: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '14:30' }] },
  'au-index': { label: '澳股', priceBasis: 'close', daysPerYear: 252, ranges: [{ days: [1, 2, 3, 4, 5], from: '07:00', to: '14:00' }] },
  'ca-index': { label: '加股', priceBasis: 'close', daysPerYear: 252, ranges: [{ days: [1, 2, 3, 4, 5], from: '21:30', to: '04:00' }] },
  'tw-index': { label: '台股', priceBasis: 'close', daysPerYear: 245, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '13:30' }] },
};

/** 当前是否在该市场的交易时段内（按北京时间判断，跨午夜的时段单独处理） */
function isMarketOpen(profile, now = new Date()) {
  if (!profile) return null;
  if (!profile.ranges.length) return true;
  const bj = new Date(now.getTime() + 8 * 3600_000);
  const day = bj.getUTCDay();
  const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  for (const r of profile.ranges) {
    if (r.days && !r.days.includes(day)) continue;
    const [fh, fm] = r.from.split(':').map(Number);
    const [th, tm] = r.to.split(':').map(Number);
    const start = fh * 60 + fm;
    const end = th * 60 + tm;
    const hit = end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    if (hit) return true;
  }
  return false;
}

function marketStatusOf(inst) {
  const profile = MARKET_PROFILES[inst.market];
  if (!profile) return null;
  const open = isMarketOpen(profile);
  return {
    market: profile.label,
    open,
    label: !profile.ranges.length ? '24×7' : open ? '交易中' : '已收盘',
  };
}

/* 布伦特在列表里是原油行的附加报价，但详情页可以单独打开，所以这里给它一份等价配置 */
const DETAIL_ONLY_INSTRUMENTS = [
  {
    id: 'brent',
    market: 'intl-futures',
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

function findInstrument(id) {
  return INSTRUMENTS.find((i) => i.id === id) ?? DETAIL_ONLY_INSTRUMENTS.find((i) => i.id === id) ?? null;
}

/* ------------------------------------------------------------------ *
 * 走势历史（内存环形缓冲 + 落盘，重启后走势不断档）
 * ------------------------------------------------------------------ */

const history = new Map(); // id -> [{ t, p }]
const lastGood = new Map(); // id -> 最近一次成功快照

function pushHistory(id, price, t = Date.now(), decimals = 2) {
  const arr = history.get(id) ?? [];
  const prev = arr[arr.length - 1];
  // 按「显示精度」判重：收盘/休市期间刷新不会堆出一长串肉眼看不出的重复值，
  // 也避免浮点尾差（7623.68017 vs 7623.6802）把走势拉出一条跨日的假尾巴。
  if (prev && prev.p.toFixed(decimals) === price.toFixed(decimals)) {
    // 数值没变就直接跳过：不能改动 prev.t，否则休市期间会把最后一个点
    // 一直「拖」到现在，走势图上多出一条跨越几个交易日的假尾巴。
    return;
  }
  arr.push({ t, p: price });
  while (arr.length > HISTORY_LIMIT) arr.shift();
  history.set(id, arr);
}

let saveTimer = null;
function scheduleHistorySave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      const payload = {
        savedAt: new Date().toISOString(),
        // 注脚记录走势的真实来源（例如现货金用了期货形态），必须随历史一起持久化
        notes: Object.fromEntries([...seedNotes].map(([id, rec]) => [id, rec])),
        history: Object.fromEntries(history),
      };
      await fsp.writeFile(HISTORY_FILE, JSON.stringify(payload), 'utf8');
    } catch {
      /* 落盘失败不影响主流程 */
    }
  }, 2000);
}

async function loadPersistedHistory() {
  try {
    const raw = await fsp.readFile(HISTORY_FILE, 'utf8');
    const obj = JSON.parse(raw);
    // 兼容旧格式（直接是 id -> points 的扁平对象）
    const points = obj.history && typeof obj.history === 'object' ? obj.history : obj;
    for (const [id, arr] of Object.entries(points)) {
      if (Array.isArray(arr) && arr.length) {
        history.set(id, arr.slice(-HISTORY_LIMIT));
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
const SEED_NOTE_TTL_MS = 12 * 3600 * 1000;
const seedNotes = new Map(); // id -> { note, at }

async function seedPoints(inst) {
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
function trimToLastSession(points) {
  if (points.length < 2) return points;
  const dayOf = (t) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const lastDay = dayOf(points[points.length - 1].t);
  const kept = points.filter((p) => dayOf(p.t) === lastDay);
  return kept.length >= 2 ? kept : points;
}

async function seedFrom(s) {
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

async function seedHistory() {
  const targets = INSTRUMENTS.filter((i) => i.seed && !history.has(i.id));
  await Promise.all(
    targets.map(async (inst) => {
      try {
        const seeded = await seedPoints(inst);
        if (!seeded) return;
        history.set(inst.id, seeded.points.slice(-HISTORY_LIMIT));
        if (seeded.note) seedNotes.set(inst.id, { note: seeded.note, at: Date.now() });
      } catch {
        /* 补种失败就让它自然积累 */
      }
    }),
  );
}

function historyNoteFor(id) {
  const rec = seedNotes.get(id);
  if (!rec) return null;
  return Date.now() - rec.at < SEED_NOTE_TTL_MS ? rec.note : null;
}

/* ------------------------------------------------------------------ *
 * 聚合刷新
 * ------------------------------------------------------------------ */

/** 依次尝试多个源，把结果归一化；全部失败时 ok:false 并带错误信息 */
async function loadWithFallback(sources) {
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

const extraLastGood = new Map(); // "instId:extraId" -> 上一次成功的附加报价

/** 附加报价：挂在主标的同一张卡片里（如原油行的布伦特），独立取数与兜底 */
async function resolveExtras(inst) {
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

/**
 * 各源给的 sessionTime 格式不统一：
 *   黄金CN "14:30:00" ｜ 新浪 "2026-10-26 14:30:00" ｜ CBOE "2026-10-23"
 * 统一解析成绝对时间，解析不了就返回 null（前端只显示"取数时刻"）。
 */
function parseDataTime(sessionTime, now = new Date()) {
  if (!sessionTime) return null;
  const s = String(sessionTime).trim();

  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const bj = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const d = new Date(`${bj}T${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}+08:00`);
    // 源时间比现在还晚，说明是昨天的（跨零点）
    if (d.getTime() > now.getTime() + 3600_000) d.setDate(d.getDate() - 1);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(`${s}T00:00:00+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/** 分级：交易中的容忍度远小于已收盘（已收盘本来就是最后成交价） */
function gradeFreshness(ageMs, isOpen) {
  const min = ageMs / 60_000;
  if (isOpen) {
    if (min <= 2) return 'fresh';
    if (min <= 15) return 'normal';
    if (min <= 60) return 'delayed';
    return 'stale';
  }
  // 已收盘 / 休市：数据不该频繁变，超过 4 天才算异常
  if (min <= 4 * 24 * 60) return 'normal';
  return 'stale';
}

function humanAge(ageMs) {
  const s = Math.max(0, Math.round(ageMs / 1000));
  if (s < 60) return `${s} 秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

/** 单日变动超过这个幅度基本可以确定是脏数据或极端行情，需要人工看一眼 */
const MOVE_SUSPECT_PCT = {
  'gold-cn': 8,
  'gold-intl': 10,
  btc: 30,
  oil: 15,
  sp500: 10,
  ndx100: 12,
  sh000001: 10,
  vix: 60,
  vxn: 60,
};

function buildFreshness(inst, main, marketStatus, now = new Date()) {
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
async function resolveInstrument(inst) {
  const [main, extras] = await Promise.all([loadWithFallback(inst.sources), resolveExtras(inst)]);

  if (main.ok) {
    pushHistory(inst.id, main.price, Date.now(), inst.decimals ?? 2);
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
      stale: false,
      error: null,
      extras,
      history: history.get(inst.id) ?? [],
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
      history: history.get(inst.id) ?? [],
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

async function refresh() {
  const items = await Promise.all(INSTRUMENTS.map(resolveInstrument));
  scheduleHistorySave();
  return {
    ok: items.some((i) => i.ok),
    generatedAt: new Date().toISOString(),
    ttlMs: CACHE_TTL_MS,
    items,
  };
}

let cache = { at: 0, data: null };
let inflight = null;

async function getQuotes({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await refresh();
      cache = { at: Date.now(), data };
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/* ------------------------------------------------------------------ *
 * HTTP 服务
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 详情页：历史数据（日K）+ 统计指标 + 当日分时 + 多源对照
 * ------------------------------------------------------------------ */

const DETAIL_HISTORY_LIMIT = 5000; // 日K最多取多少条（东财上限，约 20 年）
const DETAIL_CACHE_TTL_MS = 60_000;
const detailCache = new Map(); // id -> { at, data }

/** 东财日K：f51日期 f52开 f53收 f54高 f55低 f56量 f57额 f58振幅 f59涨跌幅 f60涨跌额 f61换手 */
async function fetchEastmoneyDaily(secid, limit = DETAIL_HISTORY_LIMIT) {
  const url =
    'https://push2his.eastmoney.com/api/qt/stock/kline/get' +
    `?secid=${encodeURIComponent(secid)}` +
    '&fields1=f1,f2,f3,f4,f5,f6' +
    '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
    `&klt=101&fqt=1&end=20500101&lmt=${limit}`;
  const j = JSON.parse(await fetchRaw(url));
  const d = j?.data;
  if (!d?.klines?.length) throw new Error('无历史数据');

  const rows = [];
  for (const line of d.klines) {
    const c = line.split(',');
    const close = toNum(c[2]);
    if (close == null) continue;
    rows.push({
      date: c[0],
      open: toNum(c[1]),
      close,
      high: toNum(c[3]),
      low: toNum(c[4]),
      volume: toNum(c[5]),
      amount: toNum(c[6]),
      amplitude: toNum(c[7]),
      pct: toNum(c[8]),
      change: toNum(c[9]),
      turnover: toNum(c[10]),
    });
  }
  return {
    rows,
    meta: {
      code: d.code ?? null,
      name: d.name ?? null,
      source: `eastmoney:${secid}`,
      exchange: d.market ?? null,
    },
  };
}

/** Binance 日K（可翻页，最多 pages×1000 条） */
async function fetchBinanceDaily(symbol, pages = 3) {
  const rows = [];
  let endTime = Date.now();
  for (let p = 0; p < pages; p += 1) {
    const url =
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
      `&interval=1d&limit=1000&endTime=${endTime}`;
    const batch = JSON.parse(await fetchRaw(url));
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const r of batch) {
      rows.push({
        date: new Date(r[0]).toISOString().slice(0, 10),
        open: toNum(r[1]),
        close: toNum(r[4]),
        high: toNum(r[2]),
        low: toNum(r[3]),
        volume: toNum(r[5]),
        amount: toNum(r[7]),
        amplitude: null,
        pct: null,
        change: null,
        turnover: null,
      });
    }
    endTime = batch[0][0] - 1;
    if (batch.length < 1000) break;
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    if (prev) {
      rows[i].change = rows[i].close - prev;
      rows[i].pct = (rows[i].change / prev) * 100;
    }
  }
  return { rows, meta: { code: symbol, name: symbol, source: 'binance', exchange: 'BINANCE' } };
}

/** 新浪美股日K：返回 [{d,o,h,l,c,v,a}, ...]（可回溯到 2014 年） */
async function fetchSinaUsDaily(symbol) {
  const url =
    'https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20t=/' +
    `US_MinKService.getDailyK?symbol=${encodeURIComponent(symbol)}&___qn=3`;
  const text = await fetchRaw(url, { headers: { Referer: SINA_REFERER } });
  const m = /\((\[[\s\S]*\])\)/.exec(text);
  if (!m) throw new Error('响应格式异常');
  const arr = JSON.parse(m[1]);
  if (!Array.isArray(arr) || !arr.length) throw new Error('无历史数据');

  const rows = arr
    .map((r) => ({
      date: r.d,
      open: toNum(r.o),
      close: toNum(r.c),
      high: toNum(r.h),
      low: toNum(r.l),
      volume: toNum(r.v),
      amount: toNum(r.a),
      amplitude: null,
      pct: null,
      change: null,
      turnover: null,
    }))
    .filter((r) => r.close != null && r.date);
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    if (prev) {
      rows[i].change = rows[i].close - prev;
      rows[i].pct = (rows[i].change / prev) * 100;
    }
  }
  return {
    rows,
    meta: { code: symbol, name: symbol, source: `sina:${symbol}`, exchange: 'US' },
  };
}

/** 当日分时（东财 trends2），返回 {date, points:[{t,p}]} */
async function fetchIntradayByEm(secid) {
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
async function fetchIntradayByBinance(symbol) {
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
async function fetchExtraMetrics(secid) {
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

const TROY_OUNCE_GRAMS = 31.1035; // 1 金衡盎司 = 31.1035 克

/** 在岸美元人民币（新浪 fx_susdcny）：1 昨收 · 8 现价 · 9 名称 · 0 时间 */
async function fetchUsdCny() {
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
async function buildGoldSpread(domesticPrice) {
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

const DAY_MS = 86_400_000;

/** 从日K算出详情页需要的全部统计量 */
function buildDayStats(rows, { daysPerYear = 252 } = {}) {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const lastTs = Date.parse(last.date);
  const closeAtOrBefore = (ts) => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (Date.parse(rows[i].date) <= ts) return rows[i].close;
    }
    return rows[0].close;
  };
  const perf = (days) => {
    if (days == null) return null;
    const base = closeAtOrBefore(lastTs - days * DAY_MS);
    return base ? ((last.close - base) / base) * 100 : null;
  };

  // 年初至今
  const yearStart = `${last.date.slice(0, 4)}-01-01`;
  const beforeYear = rows.filter((r) => r.date < yearStart);
  const ytdBase = beforeYear.length ? beforeYear[beforeYear.length - 1].close : rows[0].close;

  // 52 周高低
  const yearRows = rows.filter((r) => Date.parse(r.date) >= lastTs - 365 * DAY_MS);
  const highs = yearRows.map((r) => r.high).filter((v) => v != null);
  const lows = yearRows.map((r) => r.low).filter((v) => v != null);
  const high52 = highs.length ? Math.max(...highs) : null;
  const low52 = lows.length ? Math.min(...lows) : null;

  // 全历史高低
  let histHigh = { value: null, date: null };
  let histLow = { value: null, date: null };
  for (const r of rows) {
    if (r.high != null && (histHigh.value == null || r.high > histHigh.value)) histHigh = { value: r.high, date: r.date };
    if (r.low != null && (histLow.value == null || r.low < histLow.value)) histLow = { value: r.low, date: r.date };
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
    fromHigh52: high52 ? ((last.close - high52) / high52) * 100 : null,
    fromLow52: low52 ? ((last.close - low52) / low52) * 100 : null,
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
      d1: last.pct,
      w1: perf(7),
      m1: perf(30),
      m3: perf(91),
      m6: perf(182),
      y1: perf(365),
      y3: perf(1095),
      ytd: ytdBase ? ((last.close - ytdBase) / ytdBase) * 100 : null,
    },
    lastClose: last.close,
    lastDate: last.date,
  };
}

/** 日K 压缩成数组：[日期, 开, 收, 高, 低, 量, 额, 涨跌幅] */
function packDaily(rows) {
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

async function buildDetail(inst) {
  const quotes = await getQuotes();
  let quote = quotes.items.find((i) => i.id === inst.id) ?? null;
  if (!quote) quote = await resolveInstrument(inst);

  // 历史：所有可用源并发采集，取条数最多（最长）的那一份，其余记下来做说明
  const historyJobs = [];
  if (inst.binanceSymbol) historyJobs.push(() => fetchBinanceDaily(inst.binanceSymbol, 4));
  if (inst.sinaUs) historyJobs.push(() => fetchSinaUsDaily(inst.sinaUs));
  if (inst.cboe) historyJobs.push(() => fetchCboeIndexDetail(inst.cboe));
  if (inst.em) historyJobs.push(() => fetchEastmoneyDaily(inst.em));

  const [historyResults, intradayRes, extRes] = await Promise.all([
    Promise.allSettled(historyJobs.map((job) => job())),
    inst.binanceSymbol
      ? fetchIntradayByBinance(inst.binanceSymbol).catch(() => null)
      : fetchIntradayByEm(inst.em).catch(() => null),
    inst.binanceSymbol
      ? fetchBinanceSnapshot(inst.binanceSymbol).catch(() => null)
      : fetchExtraMetrics(inst.em).catch(() => null),
  ]);

  const alternatives = [];
  let history = null;
  for (const r of historyResults) {
    if (r.status !== 'fulfilled') continue;
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
  const stats = buildDayStats(rows, { daysPerYear: profile?.daysPerYear ?? 252 });

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
async function fetchBinanceSnapshot(symbol) {
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

async function getDetail(id, { force = false } = {}) {
  const inst = findInstrument(id);
  if (!inst) return null;
  const cached = detailCache.get(id);
  if (!force && cached && Date.now() - cached.at < DETAIL_CACHE_TTL_MS) return cached.data;
  const data = await buildDetail(inst);
  detailCache.set(id, { at: Date.now(), data });
  return data;
}

/* ------------------------------------------------------------------ *
 * 宏观关联分析：把股 / 债 / 汇 / 商品 / 加密 / 波动率放在同一张相关矩阵里
 * ------------------------------------------------------------------ */

/** Yahoo 日线（VIX 等只有 Yahoo 有） */
async function fetchYahooDaily(symbol, range = '10y', attempt = 1) {
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    `${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  let j;
  try {
    j = JSON.parse(await fetchRaw(url, { headers: { Accept: 'application/json' } }));
  } catch (err) {
    // Yahoo 对同 IP 限流很紧，429 时退避重试
    const msg = String(err?.message ?? err);
    if (attempt < 3 && msg.includes('429')) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
      return fetchYahooDaily(symbol, range, attempt + 1);
    }
    throw err;
  }
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error('无数据');
  const ts = r.timestamp ?? [];
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const rows = [];
  for (let i = 0; i < ts.length; i += 1) {
    const c = toNum(closes[i]);
    if (!(c > 0)) continue;
    rows.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (rows.length < 30) throw new Error('历史过短');
  return { rows, meta: { source: `yahoo:${symbol}`, name: symbol } };
}

/* ------------------------------------------------------------------ *
 * CBOE 波动率指数（VIX / VXN）
 * 官方 CSV 体积大（VIX 9300+ 行），做 10 分钟缓存，供列表报价、详情历史、关联矩阵共用
 * ------------------------------------------------------------------ */
const cboeCache = new Map();

async function cboeIndexRows(symbol) {
  const hit = cboeCache.get(symbol);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.rows;
  const csv = await fetchRaw(
    `https://cdn.cboe.com/api/global/us_indices/daily_prices/${symbol}_History.csv`,
    { headers: { Accept: 'text/csv' } },
  );
  const rows = [];
  for (const line of csv.split('\n')) {
    const p = line.trim().split(',');
    if (p.length < 5 || p[0] === 'DATE') continue;
    const [mm, dd, yy] = p[0].split('/');
    const close = toNum(p[4]);
    if (!yy || !(close > 0)) continue;
    rows.push({
      date: `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
      open: toNum(p[1]),
      high: toNum(p[2]),
      low: toNum(p[3]),
      close,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (rows.length < 50) throw new Error(`${symbol} CSV 解析失败`);
  cboeCache.set(symbol, { at: Date.now(), rows });
  return rows;
}

/** 列表用适配器：取 CSV 最后两行算涨跌（CBOE 每日更新） */
function cboeIndex(symbol) {
  return {
    name: `cboe:${symbol}`,
    async load() {
      const rows = await cboeIndexRows(symbol);
      const last = rows[rows.length - 1];
      const prev = rows[rows.length - 2];
      if (!last || !prev) throw new Error('数据不足');
      return {
        price: last.close,
        prevClose: prev.close,
        open: last.open,
        high: last.high,
        low: last.low,
        sessionTime: last.date,
        note: `${symbol} 日收盘`,
      };
    },
  };
}

/** 详情用历史源 */
async function fetchCboeIndexDetail(symbol) {
  const rows = await cboeIndexRows(symbol);
  return { rows, meta: { source: `cboe:${symbol}`, name: symbol, code: symbol } };
}

/** CBOE 官方 VIX 历史（CSV，1990 年起，9300+ 交易日），比第三方更权威且不限流 */
async function fetchCboeVix() {
  return fetchCboeIndexDetail('VIX');
}

/** 关联分析的标的池：覆盖股 / 债 / 汇 / 商品 / 加密 / 波动率 */
const MACRO_UNIVERSE = [
  { id: 'gold-intl', name: '国际金价', short: '黄金', group: 'metal', em: '122.XAU', unit: '美元/盎司', decimals: 2, cat: '避险' },
  { id: 'gold-cn', name: '国内金价', short: '沪金', group: 'metal', em: '118.AU9999', unit: '元/克', decimals: 2, cat: '避险' },
  { id: 'copper', name: 'COMEX 铜', short: '铜', group: 'metal', em: '101.HG00Y', unit: '美元/磅', decimals: 4, cat: '工业' },
  { id: 'oil', name: 'WTI 原油', short: 'WTI', group: 'energy', em: '102.CL00Y', unit: '美元/桶', decimals: 2, cat: '工业' },
  { id: 'brent', name: '布伦特原油', short: '布伦特', group: 'energy', em: '112.B00Y', unit: '美元/桶', decimals: 2, cat: '工业' },
  { id: 'sp500', name: '标普500', short: '标普', group: 'equity', em: '100.SPX', unit: '点', decimals: 2, cat: '风险' },
  { id: 'ndx100', name: '纳斯达克100', short: '纳指', group: 'equity', em: '100.NDX100', unit: '点', decimals: 2, cat: '风险' },
  { id: 'sh000001', name: '上证指数', short: '上证', group: 'equity', em: '1.000001', unit: '点', decimals: 2, cat: '风险' },
  { id: 'btc', name: '比特币', short: 'BTC', group: 'crypto', binance: 'BTCUSDT', unit: '美元', decimals: 2, cat: '风险' },
  { id: 'dxy', name: '美元指数', short: '美元', group: 'fx', em: '100.UDI', unit: '点', decimals: 2, cat: '美元' },
  { id: 'us10y', name: '美债10年期', short: '10Y', group: 'rate', em: '171.US10Y', unit: '%', decimals: 3, cat: '利率', kind: 'rate' },
  { id: 'vix', name: 'VIX 恐慌指数', short: 'VIX', group: 'vol', cboe: 'VIX', yahoo: '^VIX', unit: '点', decimals: 2, cat: '风险' },
  { id: 'vxn', name: 'VXN 纳指波动率', short: 'VXN', group: 'vol', cboe: 'VXN', unit: '点', decimals: 2, cat: '风险' },
];

const MACRO_CACHE_TTL_MS = 120_000;
const macroCache = new Map();

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** 取单个标的的日收盘序列（按来源分流） */
async function fetchMacroSeries(def) {
  if (def.binance) return fetchBinanceDaily(def.binance, 3);
  if (def.em) return fetchEastmoneyDaily(def.em, 5000);

  const jobs = [];
  if (def.cboe) jobs.push(() => fetchCboeIndexDetail(def.cboe));
  if (def.yahoo) jobs.push(() => fetchYahooDaily(def.yahoo, '10y'));
  const errors = [];
  for (const job of jobs) {
    try {
      return await job();
    } catch (err) {
      errors.push(String(err?.message ?? err));
    }
  }
  throw new Error(errors.join(' / ') || '无可用来源');
}

/** 收盘序列 → 日变化序列（利率用百分点差，其余用对数收益率） */
function toChanges(rows, kind) {
  const dates = [];
  const values = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    const cur = rows[i].close;
    if (!(prev > 0) || !(cur > 0)) continue;
    dates.push(rows[i].date);
    values.push(kind === 'rate' ? cur - prev : Math.log(cur / prev));
  }
  return { dates, values };
}

/**
 * 把日线聚合成周线（按 ISO 周，保留每周最后一个交易日）。
 * 跨时区标的（国际金 vs 沪金）的日收益率会因「交易日切分点不同」而错位，
 * 实测同一标的日频相关仅 0.48、周频 0.79，所以周频矩阵是必要的对照口径。
 */
function aggregateWeekly(rows) {
  const weeks = new Map();
  for (const r of rows) {
    const ts = Date.parse(r.date);
    if (!Number.isFinite(ts)) continue;
    const key = Math.floor((ts / 86400000 + 4) / 7);
    // 关键：标签统一用「该周周一」。
    // 若沿用原始交易日日期，美股（周五收）与加密（周日收）的标签会不同，
    // 跨标的配对时会全部错开——之前 BTC 整行都算不出相关性就是这个原因。
    const monday = new Date((key * 7 - 4) * 86400000).toISOString().slice(0, 10);
    weeks.set(key, { ...r, date: monday });
  }
  return [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

/** 按窗口截取最近 N 个观测 */
function tailWindow(series, win) {
  if (!win || win <= 0) return series;
  return {
    dates: series.dates.slice(-win),
    values: series.values.slice(-win),
  };
}

/** 两两相关性：用两者共同交易日（pairwise），比强行取全体交集保留更多样本 */

/* ------------------------------------------------------------------ *
 * 统计严谨性
 * 之前只给了相关系数点估计。12x12 矩阵有 66 对、领先滞后再乘 11 个滞后，
 * 约 700 个检验 —— 5% 显著性下纯随机也会跑出 35 个「显著」。
 * 所以补：Fisher z 置信区间、Newey-West 标准误、Benjamini-Hochberg 校正、样本内外验证。
 * ------------------------------------------------------------------ */

/** 标准正态 CDF（Abramowitz-Stegun 近似，误差 < 1e-7） */
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/** 双尾 p 值 */
function pFromT(t, df) {
  if (!Number.isFinite(t)) return 1;
  // df 较大时 t 分布近似正态
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(t)))));
}

/** Fisher z 变换的 95% 置信区间 */
function fisherCI(r, n) {
  if (!(n > 3) || r == null || Math.abs(r) >= 1) return null;
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  return {
    z,
    lo: Math.tanh(z - 1.96 * se),
    hi: Math.tanh(z + 1.96 * se),
  };
}

/**
 * Newey-West HAC 标准误
 * 把相关系数看成 y 对 x 的 OLS 斜率，用 Bartlett 核加权残差自协方差，
 * 得到对自相关和异方差稳健的标准误。
 */
function olsNeoeyWest(xs, ys, maxLag = 4) {
  const n = xs.length;
  if (n < 30) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const dx = xs.map((v) => v - mx);
  const dy = ys.map((v) => v - my);
  const sxx = dx.reduce((a, v) => a + v * v, 0);
  if (!(sxx > 0)) return null;
  const b = dx.reduce((a, v, i) => a + v * dy[i], 0) / sxx;
  const resid = dy.map((v, i) => v - b * dx[i]);

  let S = 0;
  for (let i = 0; i < n; i += 1) S += resid[i] * resid[i] * dx[i] * dx[i];
  const L = Math.min(maxLag, Math.floor(n / 20));
  for (let l = 1; l <= L; l += 1) {
    const w = 1 - l / (L + 1);
    let g = 0;
    for (let i = l; i < n; i += 1) g += resid[i] * resid[i - l] * dx[i] * dx[i - l];
    S += 2 * w * g;
  }
  const varB = S / (sxx * sxx);
  if (!(varB > 0)) return null;
  return { slope: b, se: Math.sqrt(varB) };
}

/** Benjamini-Hochberg：控制错误发现率，返回每个检验是否通过校正 */
function benjaminiHochberg(pvals, alpha = 0.05) {
  const m = pvals.length;
  if (!m) return { reject: [], qvals: [] };
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let kmax = -1;
  for (let k = 0; k < m; k += 1) {
    if (order[k].p <= ((k + 1) / m) * alpha) kmax = k;
  }
  const reject = new Array(m).fill(false);
  for (let k = 0; k <= kmax; k += 1) reject[order[k].i] = true;

  // q 值（单调化后的校正 p 值）
  const qvals = new Array(m).fill(1);
  let running = 1;
  for (let k = m - 1; k >= 0; k -= 1) {
    const q = Math.min(running, (order[k].p * m) / (k + 1));
    qvals[order[k].i] = q;
    running = q;
  }
  return { reject, qvals };
}

/**
 * 单个相关对的完整统计
 * 同时给样本内（前 70%）与样本外（后 30%）的系数，符号一致才算稳定
 */
function corrStats(xs, ys) {
  const n = xs.length;
  const corr = pearson(xs, ys);
  const ci = fisherCI(corr, n);
  const nw = olsNeoeyWest(xs, ys, 4);

  // 朴素 t（假设独立同分布，通常过于乐观）
  const tPlain = n > 2 ? corr * Math.sqrt((n - 2) / Math.max(1e-12, 1 - corr * corr)) : null;
  const pPlain = tPlain != null ? pFromT(tPlain, n - 2) : null;

  // Newey-West 稳健 t
  let tNW = null;
  let pNW = null;
  if (nw && nw.se > 0) {
    // 斜率换算回相关尺度：t 值不变（对同一回归）
    tNW = nw.slope / nw.se;
    pNW = pFromT(tNW, n - 2);
  }

  // 样本内外
  const cut = Math.floor(n * 0.7);
  let inR = null;
  let outR = null;
  if (cut > 30 && n - cut > 10) {
    inR = pearson(xs.slice(0, cut), ys.slice(0, cut));
    outR = pearson(xs.slice(cut), ys.slice(cut));
  }
  const stable = inR != null && outR != null ? Math.sign(inR) === Math.sign(outR) && inR !== 0 : null;

  return {
    corr,
    n,
    ci: ci ? { lo: ci.lo, hi: ci.hi } : null,
    t: tPlain,
    p: pPlain,
    tNW,
    pNW,
    inR,
    outR,
    stable,
  };
}

function pairwiseCorr(a, b) {
  const mapB = new Map();
  b.dates.forEach((d, i) => mapB.set(d, b.values[i]));
  const xs = [];
  const ys = [];
  a.dates.forEach((d, i) => {
    const y = mapB.get(d);
    if (y !== undefined) {
      xs.push(a.values[i]);
      ys.push(y);
    }
  });
  return corrStats(xs, ys);
}

/** 把两个序列对齐到共同交易日 */
function alignSeries(a, b) {
  const mapB = new Map();
  b.dates.forEach((d, i) => mapB.set(d, b.values[i]));
  const xs = [];
  const ys = [];
  a.dates.forEach((d, i) => {
    if (mapB.has(d)) {
      xs.push(a.values[i]);
      ys.push(mapB.get(d));
    }
  });
  return { xs, ys };
}

/**
 * 领先滞后：只在「共同交易日」序列上做索引平移（lag 单位 = 交易日）。
 * lag > 0 表示 A 的当日在预测 B 的 lag 个交易日之后 → A 领先 B。
 */
function leadLagScan(a, b, maxLag = 5) {
  const { xs, ys } = alignSeries(a, b);
  if (xs.length < 30) return null;
  const base = pearson(xs, ys);
  let best = { lag: 0, corr: base };
  for (let lag = 1; lag <= maxLag; lag += 1) {
    const lx = [];
    const ly = [];
    for (let i = 0; i < xs.length - lag; i += 1) {
      lx.push(xs[i]);
      ly.push(ys[i + lag]);
    }
    const c = pearson(lx, ly);
    if (c != null && (best.corr == null || Math.abs(c) > Math.abs(best.corr))) {
      best = { lag, corr: c };
    }
  }
  return { base, best, n: xs.length };
}

async function buildMacro(windowSize = 250, freq = 'day') {
  const results = await Promise.allSettled(MACRO_UNIVERSE.map((d) => fetchMacroSeries(d)));

  const universe = [];
  const series = new Map();

  results.forEach((r, i) => {
    const def = MACRO_UNIVERSE[i];
    if (r.status !== 'fulfilled') {
      universe.push({ ...def, ok: false, error: String(r.reason?.message ?? r.reason) });
      return;
    }
    const rawRows = r.value.rows;
    const rows = freq === 'week' ? aggregateWeekly(rawRows) : rawRows;
    const chg = toChanges(rows, def.kind);
    series.set(def.id, tailWindow(chg, windowSize));
    universe.push({
      id: def.id,
      name: def.name,
      short: def.short,
      group: def.group,
      cat: def.cat,
      unit: def.unit,
      decimals: def.decimals,
      ok: true,
      last: rows[rows.length - 1]?.close ?? null,
      lastDate: rows[rows.length - 1]?.date ?? null,
      samples: chg.dates.length,
      start: chg.dates[0] ?? null,
      end: chg.dates[chg.dates.length - 1] ?? null,
      source: r.value.meta?.source ?? null,
    });
  });

  const ids = universe.filter((u) => u.ok).map((u) => u.id);
  const corr = [];
  const counts = [];
  const pairStats = [];
  for (let i = 0; i < ids.length; i += 1) {
    corr.push([]);
    counts.push([]);
  }
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i; j < ids.length; j += 1) {
      if (i === j) {
        corr[i][j] = 1;
        counts[i][j] = series.get(ids[i]).dates.length;
        continue;
      }
      const st = pairwiseCorr(series.get(ids[i]), series.get(ids[j]));
      const c = st.corr;
      corr[i][j] = c;
      corr[j][i] = c;
      pairStats.push({ i, j, ...st });
      counts[i][j] = st.n;
      counts[j][i] = st.n;
    }
  }

  // 多重比较校正：66 个相关对一起做 BH，避免「纯随机也显著」被当成发现
  const pList = pairStats.map((r) => (r.pNW != null ? r.pNW : 1));
  const { reject, qvals } = benjaminiHochberg(pList, 0.05);
  const matrixStats = pairStats.map((r, k) => ({
    a: ids[r.i],
    b: ids[r.j],
    corr: r.corr,
    n: r.n,
    ci: r.ci,
    t: r.t,
    p: r.p,
    tNW: r.tNW,
    pNW: r.pNW,
    q: qvals[k],
    significantBH: reject[k],
    inR: r.inR,
    outR: r.outR,
    stable: r.stable,
  }));

  const sigCount = matrixStats.filter((r) => r.significantBH).length;
  const stableCount = matrixStats.filter((r) => r.significantBH && r.stable).length;

  // 领先滞后：只遍历 i<j，且要求「滞后相关」明显强于同期相关，才算真的领先
  const leadLag = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const r = leadLagScan(series.get(ids[i]), series.get(ids[j]));
      if (!r || r.best.lag === 0 || r.base == null || r.best.corr == null) continue;
      const gain = Math.abs(r.best.corr) - Math.abs(r.base);
      if (gain < 0.04) continue; // 提升不明显就按同期联动处理
      if (Math.abs(r.best.corr) < 0.15) continue; // 太弱的关系不列出，避免误导
      leadLag.push({
        leader: ids[i],
        follower: ids[j],
        lag: r.best.lag,
        corr: r.best.corr,
        sameDay: r.base,
        n: r.n,
      });
    }
  }

  // 领先滞后是 13x12x11 ≈ 1700 个检验，不做校正几乎必然挑出假信号
  const llP = leadLag.map((r) => {
    const denom = Math.max(1e-12, 1 - r.corr * r.corr);
    const t = r.corr * Math.sqrt((r.n - 2) / denom);
    return pFromT(t, r.n - 2);
  });
  const llBH = benjaminiHochberg(llP, 0.05);
  leadLag.forEach((r, k) => {
    r.p = llP[k];
    r.q = llBH.qvals[k];
    r.significantBH = llBH.reject[k];
  });

  leadLag.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));

  /**
   * 风险偏好（Risk-On / Risk-Off）。
   * 不能把各资产收益率简单等权：BTC 日波动约 3.5%，美元指数只有 0.35%，
   * 等权相加后这个指标基本等于「BTC + 原油指标」，标普和美元的信号被噪声淹掉。
   * 所以先按各自波动率标准化（z = r / σ60），再取均值，让每个资产贡献一个「标准差单位」。
   *
   * 篮子里也不放原油：供给冲击下油涨、股跌是典型滞胀型 Risk-Off，
   * 把原油算进风险端会把方向判反。改用 COMEX 铜（工业需求代理）。
   * 避险端用 VIX + 美元，美债按「债券价格」口径计入（收益率上行 = 债券跌 = 避险走弱，故取反）。
   */
  const zOf = (id, invert = false) => {
    const s = series.get(id);
    if (!s || s.values.length < 40) return null;
    // 用前 60 期估波动率，把当期剔出去，否则当期极值会同时污染分子和分母
    const look = s.values.slice(-61, -1);
    if (look.length < 20) return null;
    const mean = look.reduce((a, b) => a + b, 0) / look.length;
    const sd = Math.sqrt(look.reduce((a, b) => a + (b - mean) ** 2, 0) / (look.length - 1));
    if (!(sd > 0)) return null;
    const cur = s.values[s.values.length - 1];
    if (!Number.isFinite(cur)) return null;
    const z = (cur - mean) / sd;
    return { z: invert ? -z : z, sigma: sd, date: s.dates[s.dates.length - 1] };
  };
  const zBasket = (specs) => {
    const items = specs.map(([id, inv]) => [id, zOf(id, inv)]).filter(([, v]) => v);
    if (!items.length) return null;
    const z = items.reduce((a, [, v]) => a + v.z, 0) / items.length;
    // 成员日期不一致说明有市场还停在上一交易日（BTC 周末交易、时区错位）
    const dates = [...new Set(items.map(([, v]) => v.date))].sort();
    return { z, n: items.length, members: items.map(([id]) => id), dates, aligned: dates.length === 1 };
  };
  const riskBasket = zBasket([['sp500', false], ['ndx100', false], ['copper', false], ['btc', false]]);
  const hedgeBasket = zBasket([['vix', false], ['dxy', false], ['us10y', true]]);
  const risk = riskBasket?.z ?? null;
  const hedge = hedgeBasket?.z ?? null;
  const spread = risk != null && hedge != null ? risk - hedge : null;

  /**
   * 波动率风险溢价 VRP = VIX − 标普 20 日实现波动率。
   * 隐含波动率长期高于实现波动率（期权卖方要报酬），溢价被压到极低说明保护便宜、
   * 市场自满；溢价飙升说明大家在抢着买保护。
   */
  const vrp = (() => {
    const vixU = universe.find((u) => u.id === 'vix');
    const spx = series.get('sp500');
    if (!vixU?.ok || vixU.last == null || !spx || spx.values.length < 20) return null;
    const sl = spx.values.slice(-20);
    const m = sl.reduce((a, b) => a + b, 0) / sl.length;
    const sd = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / (sl.length - 1));
    const rv20 = sd * Math.sqrt(252) * 100;
    return {
      vix: vixU.last,
      rv20,
      vrp: vixU.last - rv20,
      ratio: rv20 > 0 ? vixU.last / rv20 : null,
      asOf: spx.dates[spx.dates.length - 1] ?? null,
    };
  })();

  // 最近 400 个共同观测，供前端画归一化对比与滚动相关性
  const allDates = new Set();
  for (const s of series.values()) s.dates.slice(-400).forEach((d) => allDates.add(d));
  const recentDates = [...allDates].sort().slice(-400);
  const recent = {};
  for (const [id, s] of series) {
    const map = new Map();
    s.dates.forEach((d, i) => map.set(d, s.values[i]));
    recent[id] = recentDates.map((d) => (map.has(d) ? map.get(d) : null));
  }

  return {
    ok: ids.length >= 2,
    generatedAt: new Date().toISOString(),
    windowSize,
    freq,
    universe,
    matrix: { ids, corr, counts, stats: matrixStats },
    leadLag: leadLag.slice(0, 20),
    riskAppetite: {
      risk,
      hedge,
      spread,
      label:
        spread == null ? null : spread > 0.2 ? 'Risk-On' : spread < -0.2 ? 'Risk-Off' : '中性',
      unit: 'sigma',
      riskMembers: riskBasket?.members ?? [],
      hedgeMembers: hedgeBasket?.members ?? [],
      aligned: riskBasket?.aligned && hedgeBasket?.aligned ? true : false,
      memberDates: [...new Set([...(riskBasket?.dates ?? []), ...(hedgeBasket?.dates ?? [])])].sort(),
      asOf: recentDates[recentDates.length - 1] ?? null,
    },
    vrp,
    recent: { dates: recentDates, changes: recent },
  };
}

async function getMacro(windowSize, freq = 'day', { force = false } = {}) {
  const key = `${freq}:${windowSize}`;
  const cached = macroCache.get(key);
  if (!force && cached && Date.now() - cached.at < MACRO_CACHE_TTL_MS) return cached.data;
  const data = await buildMacro(windowSize, freq);
  macroCache.set(key, { at: Date.now(), data });
  return data;
}

/* ------------------------------------------------------------------ *
 * 宏观日历：FOMC（美联储官网）+ BLS 数据发布日程（CPI/非农/PPI/GDP）
 * —— FOMC 直接解析美联储官网；BLS 页面有反爬，走文本代理读取官方页
 * ------------------------------------------------------------------ */

const CAL_CACHE_TTL_MS = 6 * 3600_000; // 日历半年内不会变，缓存 6 小时
const calCache = new Map();

const MONTH_IDX = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** 美东 08:30 发布 → 北京时间（夏令时 20:30 / 冬令时 21:30），这里给个近似值并标注时区 */
function blsReleaseBeijingTime(month) {
  // 美国夏令时 3 月第二个周日 ~ 11 月第一个周日
  const dst = month >= 3 && month <= 10;
  return dst ? '20:30' : '21:30';
}

/**
 * FOMC 会议日期。
 * 美联储官网的 HTML 对「已开 / 未开」会议用了不同结构，直接解析会漏一半（每年只抓到 4 次），
 * 所以走文本代理读成 markdown：月份是 `**January**`、日期是紧跟的 `27-28*`，按行号就近配对最稳。
 */
async function fetchFomcMeetings() {
  const text = await fetchRaw(
    'https://r.jina.ai/https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  );
  const lines = text.split('\n').map((l) => l.trim());
  const out = [];
  const pad = (n) => String(n).padStart(2, '0');
  let year = null;

  for (let i = 0; i < lines.length; i += 1) {
    const ym = /^#+\s*\[?(\d{4}) FOMC Meetings/.exec(lines[i]);
    if (ym) {
      year = Number(ym[1]);
      continue;
    }
    const mm = /^\*\*([A-Za-z]+)\*\*$/.exec(lines[i]);
    if (!mm || !year) continue;
    const month = MONTH_IDX[mm[1].toLowerCase()];
    if (!month) continue;

    // 月份后 1~6 行内找第一条 "27-28" / "17-18*" 形式的日期
    let days = null;
    let isProjection = false; // 带 * 的会议会同时发布经济预测摘要（SEP）与点阵图
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j += 1) {
      const dm = /^(\d{1,2})\s*[-–]\s*(\d{1,2})(\*?)$/.exec(lines[j]);
      if (dm) {
        days = [Number(dm[1]), Number(dm[2])];
        isProjection = dm[3] === '*';
        break;
      }
      if (/^\*\*[A-Za-z]+\*\*$/.test(lines[j])) break; // 撞到下个月，放弃
    }
    if (!days) continue;

    const startDay = days[0];
    const endDay = days[1];
    // 跨月会议（如 "31-1"）按结束日落到下个月
    let endMonth = month;
    let endYear = year;
    if (endDay < startDay) {
      endMonth += 1;
      if (endMonth > 12) {
        endMonth = 1;
        endYear += 1;
      }
    }
    out.push({
      date: `${endYear}-${pad(endMonth)}-${pad(endDay)}`,
      startDate: `${year}-${pad(month)}-${pad(startDay)}`,
      time: '02:00',
      kind: 'fomc',
      title: `美联储 FOMC 利率决议（${startDay}-${endDay} 日会议）`,
      note: isProjection ? '含经济预测摘要 SEP 与点阵图' : null,
      importance: 3,
      source: 'Federal Reserve',
      symbols: ['us10y', 'dxy', 'sp500', 'ndx100', 'gold-intl', 'btc'],
    });
  }
  return out;
}


/**
 * BLS 官方 ICS 日历：含 2007 年至今全部数据发布日（313 个事件）。
 * 比抓月度日程页好得多——月度页只有未来几个月，做不了历史事件研究。
 * BLS 对直连有反爬（403），走文本代理读。
 */
async function fetchBlsIcsEvents() {
  const text = await fetchRaw('https://r.jina.ai/https://www.bls.gov/schedule/news_release/bls.ics', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const ICS_KINDS = [
    { re: /^Consumer Price Index$/i, kind: 'cpi', title: '美国 CPI 消费者物价指数', importance: 3, symbols: ['us10y', 'gold-intl', 'dxy', 'sp500'] },
    { re: /^Employment Situation$/i, kind: 'nfp', title: '美国非农就业报告', importance: 3, symbols: ['us10y', 'dxy', 'sp500', 'ndx100'] },
    { re: /^Producer Price Index$/i, kind: 'ppi', title: '美国 PPI 生产者物价指数', importance: 2, symbols: ['us10y', 'gold-intl'] },
    { re: /^Personal Income and Outlays$/i, kind: 'pce', title: '美国 PCE 物价指数', importance: 3, symbols: ['us10y', 'gold-intl', 'dxy'] },
    { re: /^Gross Domestic Product$/i, kind: 'gdp', title: '美国 GDP', importance: 2, symbols: ['sp500', 'dxy'] },
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const out = [];

  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const summary = /SUMMARY:(.+)/.exec(body)?.[1]?.trim();
    const m = /DTSTART(?:;TZID=([^:]+))?:(\d{8})T(\d{6})/.exec(body);
    if (!summary || !m) continue;

    const kind = ICS_KINDS.find((k) => k.re.test(summary));
    if (!kind) continue;

    const [, tzid, dateStr, timeStr] = m;
    const y = Number(dateStr.slice(0, 4));
    const mo = Number(dateStr.slice(4, 6));
    const d = Number(dateStr.slice(6, 8));
    const hh = Number(timeStr.slice(0, 2));
    const mi = Number(timeStr.slice(2, 4));

    // 美东 → 北京：夏令时 +12、冬令时 +13
    const isEastern = !tzid || /Eastern/i.test(tzid);
    const dst = isEastern && mo >= 3 && mo <= 10;
    const shift = isEastern ? (dst ? 12 : 13) : 8;
    let bh = hh + shift;
    let dayShift = 0;
    while (bh >= 24) {
      bh -= 24;
      dayShift += 1;
    }

    const dt = new Date(Date.UTC(y, mo - 1, d + dayShift));
    const bjDate = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

    // 同一天同一指标可能重复（如完整版/初值），保留第一条
    if (out.some((e) => e.date === bjDate && e.kind === kind.kind)) continue;

    out.push({
      date: bjDate,
      time: `${pad(bh)}:${pad(mi)}`,
      kind: kind.kind,
      title: kind.title,
      importance: kind.importance,
      source: 'U.S. BLS (ICS)',
      symbols: kind.symbols,
    });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}
/** BLS 月度日程：解析日历表格里带 CPI / Employment Situation / PPI 的格子 */
async function fetchBlsMonth(year, month) {
  const pad = String(month).padStart(2, '0');
  const target = `https://www.bls.gov/schedule/${year}/${pad}_sched.htm`;
  const text = await fetchRaw(`https://r.jina.ai/${target}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const out = [];
  const KINDS = [
    { re: /Consumer Price Index/i, kind: 'cpi', title: '美国 CPI 消费者物价指数', importance: 3, symbols: ['us10y', 'gold-intl', 'dxy', 'sp500'] },
    { re: /Employment Situation/i, kind: 'nfp', title: '美国非农就业报告', importance: 3, symbols: ['us10y', 'dxy', 'sp500', 'ndx100'] },
    { re: /Producer Price Index/i, kind: 'ppi', title: '美国 PPI 生产者物价指数', importance: 2, symbols: ['us10y', 'gold-intl'] },
    { re: /Personal Income and Outlays/i, kind: 'pce', title: '美国 PCE 物价指数', importance: 3, symbols: ['us10y', 'gold-intl', 'dxy'] },
    { re: /Gross Domestic Product/i, kind: 'gdp', title: '美国 GDP', importance: 2, symbols: ['sp500', 'dxy'] },
    { re: /Retail Trade/i, kind: 'retail', title: '美国零售销售', importance: 2, symbols: ['sp500', 'us10y'] },
  ];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    // BLS 日历表格最后一行会跨到下个月（| 30 | 1 | 2 | 3 | 4 ... |），
    // 日期一旦回退就说明月份翻页了，否则会把「12 月 4 日非农」算成「11 月 4 日」
    let curMonth = month;
    let curYear = year;
    let prevDay = 0;
    for (const cell of cells) {
      const dayMatch = /^(\s*)(\d{1,2})\b/.exec(cell);
      if (!dayMatch) continue;
      const day = parseInt(dayMatch[2], 10);
      if (day < 1 || day > 31) continue;
      if (prevDay && day < prevDay) {
        curMonth += 1;
        if (curMonth > 12) {
          curMonth = 1;
          curYear += 1;
        }
      }
      prevDay = day;
      for (const k of KINDS) {
        if (!k.re.test(cell)) continue;
        const date = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (out.some((e) => e.date === date && e.kind === k.kind)) continue;
        // 同一指标一个月可能出现两次（如政府停摆后补发上月数据），
        // 所以把「数据所属月份」写进标题，否则用户会以为是重复条目
        const refMatch = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(cell);
        const refLabel = refMatch ? `${refMatch[2]} 年 ${MONTH_IDX[refMatch[1].toLowerCase()]} 月` : null;
        out.push({
          date,
          time: blsReleaseBeijingTime(curMonth),
          kind: k.kind,
          title: refLabel ? `${k.title}（${refLabel}数据）` : k.title,
          importance: k.importance,
          source: 'U.S. BLS',
          symbols: k.symbols,
        });
      }
    }
  }
  return out;
}

async function getCalendar({ force = false } = {}) {
  const cached = calCache.get('cal');
  if (!force && cached && Date.now() - cached.at < CAL_CACHE_TTL_MS) return cached.data;

  const now = new Date();
  const bjYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(now));
  const bjMonth = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', month: 'numeric' }).format(now));

  // 抓本月 + 未来 4 个月的 BLS 日程（跨年处理）
  const months = [];
  for (let i = 0; i < 5; i += 1) {
    let m = bjMonth + i;
    let y = bjYear;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    months.push({ year: y, month: m });
  }

  const [fomcRes, icsRes] = await Promise.allSettled([fetchFomcMeetings(), fetchBlsIcsEvents()]);

  const events = [];
  const errors = [];

  if (fomcRes.status === 'fulfilled') events.push(...fomcRes.value);
  else errors.push(`FOMC: ${fomcRes.reason?.message ?? fomcRes.reason}`);

  if (icsRes.status === 'fulfilled') {
    events.push(...icsRes.value);
  } else {
    // ICS 拿不到时退回月度日程页（只有未来几个月，历史事件研究会缺数据）
    errors.push(`BLS ICS: ${icsRes.reason?.message ?? icsRes.reason}`);
    const blsRes = await Promise.allSettled(months.map(({ year, month }) => fetchBlsMonth(year, month)));
    blsRes.forEach((r, i) => {
      if (r.status === 'fulfilled') events.push(...r.value);
      else errors.push(`BLS ${months[i].year}-${months[i].month}: ${r.reason?.message ?? r.reason}`);
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const today = new Date().toISOString().slice(0, 10);

  const data = {
    ok: events.length > 0,
    generatedAt: new Date().toISOString(),
    today,
    events,
    upcoming: events.filter((e) => e.date >= today).slice(0, 30),
    errors,
    coverage: { monthsFetched: months.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}`) },
  };
  calCache.set('cal', { at: Date.now(), data });
  return data;
}

/* ------------------------------------------------------------------ *
 * 全球事件中心：聚合多源实时快讯，按对市场的影响打分
 * 源：金十（最快，带重要度标记）/ 新浪 7×24 / 华尔街见闻（最专业）
 * ------------------------------------------------------------------ */

const EVENTS_CACHE_TTL_MS = 25_000;
const eventsCache = new Map();

/** 主题规则：命中任意关键词就打上该主题，并关联受影响标的 */
const TOPIC_RULES = [
  { key: 'fed', label: '货币政策', weight: 3,
    words: ['美联储', '加息', '降息', 'FOMC', '利率决议', '鲍威尔', '议息', '点阵图', '缩表', '扩表', 'QE', 'Taper', '联邦基金利率', '贴现率', '超额准备金'],
    symbols: ['us10y', 'dxy', 'sp500', 'ndx100', 'gold-intl', 'btc'] },
  { key: 'inflation', label: '通胀', weight: 3,
    words: ['CPI', 'PPI', '通胀', '通膨', '物价', 'PCE', '消费者物价', '生产者物价', '核心CPI', '通胀预期'],
    symbols: ['us10y', 'gold-intl', 'dxy', 'sp500'] },
  { key: 'jobs', label: '就业', weight: 3,
    words: ['非农', '失业率', '就业人数', 'ADP', '初请', '续请', '薪资', '劳动参与率', '裁员'],
    symbols: ['us10y', 'dxy', 'sp500', 'ndx100'] },
  { key: 'geopolitics', label: '地缘政治', weight: 3,
    words: ['战争', '冲突', '制裁', '袭击', '空袭', '轰炸', '封锁', '禁运', '关税', '贸易战', '升级', '停火', '入侵', '政变', '弹劾'],
    symbols: ['gold-intl', 'oil', 'vix'] },
  // 选举本身不是价格传导事件：绝大多数是政治八卦与民调播报。
  // 单列成低权主题、不挂任何标的，落在事件流里可看，但不会被判 high、也不连冲击弧线。
  { key: 'politics', label: '选举政治', weight: 1.2,
    words: ['选举', '大选', '中期选举', '投票', '民调', '初选', '竞选'],
    symbols: [] },
  { key: 'energy', label: '能源', weight: 2,
    words: ['OPEC', '欧佩克', '减产', '增产', '原油', '油价', '天然气', '炼油', '库存', '页岩', '钻井', '管道'],
    symbols: ['oil', 'brent'] },
  { key: 'precious', label: '贵金属', weight: 2,
    words: ['黄金', '金价', '白银', '避险', '金饰', '央行购金', '金矿', '现货金'],
    symbols: ['gold-intl', 'gold-cn'] },
  { key: 'crypto', label: '加密资产', weight: 2,
    words: ['比特币', 'BTC', '以太坊', 'ETH', '加密', '稳定币', '币安', 'Coinbase', '数字资产', '现货ETF'],
    symbols: ['btc'] },
  { key: 'china', label: '中国政策', weight: 2,
    words: ['国务院', '发改委', '财政部', '证监会', '人民银行', '央行', '降准', 'LPR', 'MLF', '专项债', '政治局', '刺激政策', '一揽子'],
    symbols: ['sh000001', 'gold-cn'] },
  { key: 'equities', label: '权益市场', weight: 2,
    words: ['纳斯达克', '标普', '道琼斯', '美股', '财报', '英伟达', '苹果', '特斯拉', '微软', '科技股', 'A股', '沪指', '恒生'],
    symbols: ['sp500', 'ndx100', 'sh000001'] },
  { key: 'rates', label: '债市', weight: 2,
    words: ['国债', '收益率', '美债', '债券', '收益率曲线', '期限利差', '拍卖'],
    symbols: ['us10y'] },
  { key: 'fx', label: '汇率', weight: 1,
    words: ['美元指数', '人民币', '日元', '欧元', '汇率', '升值', '贬值', '外汇', '中间价'],
    symbols: ['dxy'] },
  { key: 'macro', label: '宏观数据', weight: 1,
    words: ['GDP', 'PMI', '工业产出', '零售销售', '贸易帐', '进出口', '工业增加值', '社融', '信贷', '库存'],
    symbols: ['sp500', 'sh000001'] },
];

/** 关键词兜底的地区推断（LLM 会覆盖它） */
const REGION_WORDS = [
  ['cn', ['中国', '北京', '上海', '国务院', '发改委', '央行', '人民币', 'A股', '沪深', '证监会', '财政部', '深圳', '广州']],
  ['us', ['美国', '美联储', '华盛顿', '纽约', '纳斯达克', '标普', '道琼斯', '白宫', '鲍威尔', '财政部', '硅谷']],
  ['eu', ['欧元区', '欧盟', '德国', '法国', '欧洲央行', '拉加德', '意大利', '西班牙', '布鲁塞尔']],
  ['uk', ['英国', '伦敦', '英国央行', '英镑', '英格兰银行']],
  ['jp', ['日本', '东京', '日本央行', '日元', '日经']],
  ['me', ['中东', '伊朗', '以色列', '沙特', '也门', '胡塞', '阿联酋', '伊拉克', '卡塔尔', '叙利亚', '加沙']],
  ['latam', ['巴西', '阿根廷', '墨西哥', '智利', '委内瑞拉', '哥伦比亚', '秘鲁']],
  ['africa', ['南非', '埃及', '尼日利亚', '非洲', '肯尼亚']],
  ['asia', ['韩国', '印度', '新加坡', '越南', '泰国', '印尼', '马来西亚', '菲律宾', '台湾']],
];

function guessRegion(text) {
  for (const [region, words] of REGION_WORDS) {
    if (words.some((w) => text.includes(w))) return region;
  }
  return 'global';
}

/** 高影响动词：出现时额外加权，这类词往往意味着盘面会动 */
const IMPACT_WORDS = ['暴跌', '暴涨', '崩盘', '熔断', '创历史', '创新高', '创新低', '紧急', '意外', '大幅', '远超预期', '不及预期', '超预期', '暂停', '禁止', '批准', '通过', '签署'];

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 北京时间字符串 */
function bjTimeString(input) {
  const d = typeof input === 'number' ? new Date(input * 1000) : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** 噪声稿：汇总/营销/榜单/券商评级类，命中直接丢弃，否则会污染重要性排序 */
const NOISE_RE =
  /汇总|一览|早报|晚报|周报|月刊|盘点|速览|每日.{0,4}动态|领跑|净值|半日成交|基金份额|涨幅榜|跌幅榜|涨停揭秘|跌停揭秘|ETF.{0,6}成交|目标价|目标位|上调.{0,10}目标|下调.{0,10}目标|维持.{0,8}(买入|增持|中性|持有|跑赢|卖出|减持)|(买入|增持|中性|跑赢|卖出|减持)?.{0,4}评级|评级.{0,8}(上调|下调)|评级为|首次覆盖|主力资金净|龙虎榜/;

/**
 * 清洗多义词，防止气象征候、产业政策、公司治理被误判成地缘政治冲突。
 * 「风暴袭击欧洲」和「空袭伊朗」在词表上都命中「袭击」，但前者对资产价格没有传导路径，
 * 实测这类稿子会被打成 high 并连上黄金/原油/VIX 的冲击弧线，必须拦住。
 */
function sanitizeAmbiguousContext(text) {
  return String(text ?? '')
    // 气象灾害不是地缘政治冲突
    .replace(/台风|风暴|飓风|暴雨|寒潮|暴雪|强风|洪涝|洪水|龙卷风|沙尘暴|热浪|干旱|野火/g, '气象灾害')
    .replace(/(气象灾害[^，。；！？]{0,12})袭击/g, '$1侵袭')
    .replace(/袭击([^，。！？]{0,12}(电力|交通|航班|供电|通信|港口|机场|铁路|供水))/g, '侵袭$1')
    // 政策与产业语境里的「升级」
    .replace(/消费升级|产业升级|转型升级|品牌升级|服务升级|系统升级|版本升级|技术升级|智能升级|装备升级|产品升级|结构升级|评级升级/g, '产业演进')
    // 公司治理与党争语境里的「选举 / 弹劾」
    .replace(/董事会|监事会|换届选举|独立董事|股东大会|职工代表|选举董事/g, '公司治理');
}

/**
 * 分类：标题命中的主题才算「强命中」，正文命中打 7 折。
 * 主主题取权重最大者，其余主题只做次要加权（×0.35），
 * 避免「一条稿子提到很多词」被误判成重大新闻。
 */
function classify(title, body) {
  const cTitle = sanitizeAmbiguousContext(title);
  const cBody = sanitizeAmbiguousContext(body);
  const topics = [];
  const symbols = new Set();
  let mainWeight = 0;
  let mainInTitle = false;
  let secondary = 0;

  for (const rule of TOPIC_RULES) {
    const hitTitle = rule.words.some((w) => cTitle.includes(w));
    const hitBody = !hitTitle && rule.words.some((w) => cBody.includes(w));
    if (!hitTitle && !hitBody) continue;
    topics.push({ key: rule.key, label: rule.label, strong: hitTitle });
    rule.symbols.forEach((sym) => symbols.add(sym));
    const w = rule.weight * (hitTitle ? 1 : 0.7);
    if (w > mainWeight) {
      secondary += mainWeight * 0.35;
      mainWeight = w;
      mainInTitle = hitTitle;
    } else {
      secondary += w * 0.35;
    }
  }

  const impact = IMPACT_WORDS.some((w) => cTitle.includes(w) || cBody.includes(w));
  return {
    topics,
    symbols: [...symbols],
    mainWeight,
    mainInTitle,
    impact,
    rawScore: mainWeight + secondary + (impact ? 1 : 0),
  };
}

/** 影响等级：源自身的「重要」标记最可信，其次是标题直接命中强主题 */
function toLevel(info, important) {
  if (important) return 'high';
  if (info.mainInTitle && info.mainWeight >= 3) return 'high';
  if (info.mainWeight >= 2) return 'mid';
  return 'low';
}

/** 金十快讯（最快，带 important 标记） */
async function fetchJin10() {
  const j = JSON.parse(
    await fetchRaw('https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.jin10.com/',
        'x-app-id': 'bVBF4FyRTn5NJF5n',
        'x-version': '1.0.0',
      },
    }),
  );
  const list = j?.data ?? [];
  return list.map((x) => {
    const d = x.data ?? {};
    const title = stripHtml(d.title || d.content || '');
    const body = stripHtml(d.content || '');
    return {
      id: `jin10:${x.id}`,
      sourceKey: 'jin10',
      source: '金十数据',
      time: bjTimeString((x.time ?? '').replace(' ', 'T') + '+08:00'),
      title: title.length > 90 ? `${title.slice(0, 90)}…` : title,
      body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
      url: d.source_link || null,
      important: Number(x.important) > 0,
    };
  });
}

/** 新浪 7×24 全球直播 */
async function fetchSinaLive(pages = 2) {
  const out = [];
  for (let p = 1; p <= pages; p += 1) {
    const j = JSON.parse(
      await fetchRaw(
        `https://zhibo.sina.com.cn/api/zhibo/feed?page=${p}&page_size=30&zhibo_id=152&tag_id=0&dire=f&dpc=1`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn' } },
      ),
    );
    const list = j?.result?.data?.feed?.list ?? [];
    for (const x of list) {
      const raw = String(x.rich_text ?? '');
      const m = /^【([^】]+)】([\s\S]*)$/.exec(raw);
      const title = stripHtml(m ? m[1] : raw);
      const body = stripHtml(m ? m[2] : raw);
      out.push({
        id: `sina:${x.id}`,
        sourceKey: 'sina',
        source: '新浪财经',
        time: bjTimeString((x.create_time ?? '').replace(' ', 'T') + '+08:00'),
        title: title.length > 90 ? `${title.slice(0, 90)}…` : title,
        body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
        url: x.docurl || null,
        important: Number(x.top_value) > 0,
      });
    }
    if (!list.length) break;
  }
  return out;
}

/** 华尔街见闻实时快讯（专业度最高） */
async function fetchWscn(limit = 40) {
  const j = JSON.parse(
    await fetchRaw(
      `https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&client=pc&limit=${limit}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ),
  );
  const items = j?.data?.items ?? [];
  return items.map((x) => {
    const title = stripHtml(x.title || '');
    const body = stripHtml(x.content || '');
    return {
      id: `wscn:${x.id}`,
      sourceKey: 'wscn',
      source: '华尔街见闻',
      time: bjTimeString(x.display_time),
      title: (title || body).slice(0, 90) + ((title || body).length > 90 ? '…' : ''),
      body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
      url: x.uri || null,
      important: Number(x.score) >= 2,
    };
  });
}

/* ------------------------------------------------------------------ *
 * 持久化
 * 三样东西必须落地，否则每次重启都在重复付成本、也无法回溯：
 *   1. LLM 分类缓存 —— 重启后不必重新调网关（省 token / 省时间）
 *   2. 事件归档     —— 按天分文件，可按日回放当天事件流
 *   3. 指标快照     —— 定时记录价格与涨跌，用于事后回溯与变化检测
 * ------------------------------------------------------------------ */
const LLM_STORE_FILE = path.join(DATA_DIR, 'llm-cache.json');
const EVENTS_DIR = path.join(DATA_DIR, 'events');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshots.jsonl');

let llmStoreTimer = null;
let llmStoreDirty = false;
let archivedIds = new Set();
let archivedDay = null;

async function ensureDataDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(EVENTS_DIR, { recursive: true });
}

/** 启动时把 LLM 缓存读回内存 */
async function loadLlmStore() {
  try {
    const raw = await fsp.readFile(LLM_STORE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    const now = Date.now();
    let n = 0;
    for (const [id, v] of Object.entries(obj)) {
      if (!v || typeof v !== 'object') continue;
      if (now - (v.at ?? 0) > 7 * 24 * 3600_000) continue; // 超过 7 天的丢掉
      llmCache.set(id, v);
      n += 1;
    }
    console.log(`LLM 分类缓存已恢复 ${n} 条`);
  } catch {
    /* 首次运行没有文件 */
  }
}

/** 写入 debounce：分类是逐批来的，攒一下再落盘 */
function scheduleLlmStore() {
  llmStoreDirty = true;
  if (llmStoreTimer) return;
  llmStoreTimer = setTimeout(async () => {
    llmStoreTimer = null;
    if (!llmStoreDirty) return;
    llmStoreDirty = false;
    try {
      await ensureDataDirs();
      const obj = {};
      for (const [id, v] of llmCache) obj[id] = v;
      await fsp.writeFile(LLM_STORE_FILE, JSON.stringify(obj), 'utf8');
    } catch (err) {
      console.error('LLM 缓存落盘失败:', err?.message ?? err);
    }
  }, 3000);
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function loadArchivedIds(day) {
  if (archivedDay === day) return;
  archivedDay = day;
  archivedIds = new Set();
  try {
    const raw = await fsp.readFile(path.join(EVENTS_DIR, `${day}.jsonl`), 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.id) archivedIds.add(obj.id);
      } catch {
        /* 跳过坏行 */
      }
    }
  } catch {
    /* 当天还没有文件 */
  }
}

/** 把本轮事件追加归档（按天分文件，同一天内按 id 去重） */
async function archiveEvents(items) {
  try {
    const day = todayKey();
    await loadArchivedIds(day);
    const fresh = items.filter((it) => !archivedIds.has(it.id));
    if (!fresh.length) return;
    await ensureDataDirs();
    const lines = fresh
      .map((it) =>
        JSON.stringify({
          id: it.id,
          time: it.time,
          source: it.source,
          title: it.title,
          body: it.body?.slice(0, 300) ?? '',
          url: it.url,
          level: it.level,
          topics: it.topics?.map((t) => t.label) ?? [],
          symbols: it.symbols ?? [],
          region: it.region ?? null,
          llm: Boolean(it.llm),
        }),
      )
      .join('\n');
    await fsp.appendFile(path.join(EVENTS_DIR, `${day}.jsonl`), `${lines}\n`, 'utf8');
    fresh.forEach((it) => archivedIds.add(it.id));
  } catch (err) {
    console.error('事件归档失败:', err?.message ?? err);
  }
}

/** 指标快照：记录当前 8 个标的的报价，供回溯 */
async function takeSnapshot(quotes) {
  try {
    await ensureDataDirs();
    const rows = (quotes ?? [])
      .filter((q) => q.ok)
      .map((q) => ({
        id: q.id,
        name: q.name,
        price: q.price,
        changePct: q.changePct,
      }));
    if (!rows.length) return;
    const line = JSON.stringify({ at: new Date().toISOString(), quotes: rows });
    await fsp.appendFile(SNAPSHOT_FILE, `${line}\n`, 'utf8');
  } catch (err) {
    console.error('快照写入失败:', err?.message ?? err);
  }
}

/* ------------------------------------------------------------------ *
 * LLM 语义分类
 * 背景：纯关键词分类有天花板（「AI基建把保险业逼进新战场」会因「战场」被判成地缘政治）。
 * 这里接 cline 网关（与 dsh web profile 同一个 provider）做二次语义判定，
 * 关键词结果作兜底，LLM 结果按事件 id 缓存 6 小时。
 *
 * 为什么不用 `dsh headless`：它会完整加载 agent 栈，实测单次 inputTokens 24 万、
 * 耗时 28 秒，对每分钟一轮的新闻流不现实；直连同一个网关只要 3 秒、几百 tokens。
 * ------------------------------------------------------------------ */
const LLM_CACHE_TTL_MS = 6 * 3600_000;
const llmCache = new Map(); // eventId -> { topics, symbols, level, at }
let llmInFlight = false;
let llmStats = { calls: 0, classified: 0, lastError: null, lastAt: null };

const LLM_TOPICS = ['货币政策', '通胀', '就业', '地缘政治', '能源', '贵金属', '加密', '中国政策', '权益', '债市', '汇率', '宏观', '无关'];
const LLM_SYMBOLS = ['gold-intl', 'gold-cn', 'oil', 'brent', 'copper', 'sp500', 'ndx100', 'sh000001', 'btc', 'dxy', 'us10y', 'vix', 'vxn'];

const LLM_REGIONS = ['us', 'cn', 'eu', 'uk', 'jp', 'me', 'asia', 'latam', 'africa', 'global'];

const LLM_SYSTEM = `你是金融市场的新闻分类器。输入是一批编号的财经快讯，格式为「编号. 标题 ｜ 正文摘要」，判断每条对市场的影响。

对每条输出四个字段：
- topics: 最相关的 1-2 个，取值必须来自 [${LLM_TOPICS.join(',')}]
- level: high / mid / low
- symbols: 受影响的标的，取值必须来自 [${LLM_SYMBOLS.join(',')}]
- region: 事件发生地，取值必须来自 [${LLM_REGIONS.join(',')}]
  · us=美国/北美 · cn=中国 · eu=欧元区 · uk=英国 · jp=日本 · me=中东
  · asia=其他亚洲 · latam=拉美 · africa=非洲 · global=全球性/无明确地点

判断标准：
- high：央行货币政策、通胀/就业数据、重大地缘冲突、能源供给中断、监管重大变化
- mid：有参考价值的行业或公司动态、次要宏观数据、区域性事件
- low：边缘信息、泛泛的综述、影响不明确
- 公司融资、产品发布、营销稿 → low 或 无关
- 正文只用于辅助判断，不要臆测原文没有的信息；信息不足就判 low
- region 按「事件主体所在地」判断，不是按媒体报道来源

只输出 JSON 数组，不要任何解释文字、不要 markdown 代码块：
[{"i":1,"topics":["货币政策"],"level":"high","symbols":["us10y","dxy"],"region":"us"}]`;

/**
 * 从 dsh 的 web profile 里提取 cline 网关配置，而不是硬编码。
 * 这样 dsh 换了 provider / 模型，这边会跟着走。
 */
function readDshLlmConfig() {
  const home = process.env.DSH_HOME || `${process.env.HOME}/.dsh`;
  const cfg = { baseURL: null, apiKeyEnv: 'CLINE_API_KEY', models: [], apiKey: null, source: null };

  try {
    const patch = readFileSync(`${home}/profiles/web/cordis.patch.yml`, 'utf8');
    const idx = patch.indexOf('cline:');
    if (idx >= 0) {
      const seg = patch.slice(idx, idx + 2500);
      cfg.baseURL = /baseURL:\s*(\S+)/.exec(seg)?.[1] ?? null;
      cfg.apiKeyEnv = /apiKeyEnv:\s*(\S+)/.exec(seg)?.[1] ?? 'CLINE_API_KEY';
      cfg.models = [...seg.matchAll(/-\s*id:\s*(cline-pass\/[A-Za-z0-9._-]+)/g)].map((m) => m[1]);
      cfg.source = 'dsh:profiles/web';
    }
  } catch {
    /* 用默认值兜底 */
  }

  if (!cfg.baseURL) cfg.baseURL = 'https://api.cline.bot/api/v1';

  cfg.apiKey = process.env[cfg.apiKeyEnv] || null;
  if (!cfg.apiKey) {
    try {
      const cred = readFileSync(`${home}/.credentials.yaml`, 'utf8');
      cfg.apiKey = new RegExp(`${cfg.apiKeyEnv}:\\s*(\\S+)`).exec(cred)?.[1] ?? null;
    } catch {
      /* 无凭据 */
    }
  }

  // 优先 deepseek-v4.1-flash（dsh web 的默认模型），否则取配置里第一个
  const preferred = ['cline-pass/deepseek-v4.1-flash-1017', 'cline-pass/glm-5.3-flash'];
  cfg.model =
    preferred.find((m) => cfg.models.includes(m)) ?? cfg.models[0] ?? 'cline-pass/deepseek-v4.1-flash-1017';
  return cfg;
}

/** LLM 常返回同义词（原油供应 / wti / 纳指），做一次归一 */
const TOPIC_ALIAS = new Map([
  ['融资', 'equities'], ['IPO', 'equities'], ['股市', 'equities'], ['股票', 'equities'],
  ['原油供应', 'energy'], ['石油', 'energy'], ['油价', 'energy'], ['天然气', 'energy'],
  ['利率', 'fed'], ['央行', 'fed'], ['流动性', 'fed'],
  ['贵金属', 'precious'], ['白银', 'precious'],
  ['加密货币', 'crypto'], ['数字资产', 'crypto'],
  ['国债', 'rates'], ['收益率', 'rates'], ['债券', 'rates'],
  ['外汇', 'fx'],
  ['经济数据', 'macro'], ['增长', 'macro'], ['贸易', 'macro'],
  ['战争', 'geopolitics'], ['冲突', 'geopolitics'], ['制裁', 'geopolitics'], ['关税', 'geopolitics'],
]);

const SYMBOL_ALIAS = new Map([
  ['wti', 'oil'], ['原油', 'oil'], ['布伦特', 'brent'],
  ['国际金价', 'gold-intl'], ['沪金', 'gold-cn'], ['国内金价', 'gold-cn'],
  ['铜', 'copper'], ['纳指', 'ndx100'], ['纳斯达克', 'ndx100'],
  ['标普', 'sp500'], ['美股', 'sp500'], ['上证', 'sh000001'], ['a股', 'sh000001'],
  ['比特币', 'btc'], ['美元', 'dxy'], ['美债', 'us10y'],
]);

/**
 * LLM 输出的 JSON 偶尔会被截断（reasoning 吃掉预算）或带多余字符，
 * 先标准解析，失败就逐个抠出完整的 {...} 对象，尽量不浪费这一批请求。
 */
function parseLooseJsonArray(text) {
  const bracket = /\[[\s\S]*\]/.exec(text);
  if (bracket) {
    try {
      const arr = JSON.parse(bracket[0]);
      if (Array.isArray(arr)) return arr;
    } catch {
      /* 落到逐个解析 */
    }
  }
  const out = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj && obj.i != null) out.push(obj);
    } catch {
      /* 跳过坏片段 */
    }
  }
  return out;
}

function normalizeTopicLabel(raw) {
  const t = String(raw).trim();
  const directKey = TOPIC_LABEL_TO_KEY.get(t);
  if (directKey) return { key: directKey, label: t, strong: true };
  const aliased = TOPIC_ALIAS.get(t);
  if (!aliased) return null;
  const rule = TOPIC_RULES.find((r) => r.key === aliased);
  return rule ? { key: rule.key, label: rule.label, strong: true } : null;
}

function normalizeSymbolToken(raw) {
  const t = String(raw).trim();
  if (LLM_SYMBOLS.includes(t)) return t;
  return SYMBOL_ALIAS.get(t) ?? SYMBOL_ALIAS.get(t.toLowerCase()) ?? null;
}

/** 把中文 topic 映射回内部 key，保证前端筛选一致 */
const TOPIC_LABEL_TO_KEY = new Map([
  ['货币政策', 'fed'],
  ['通胀', 'inflation'],
  ['就业', 'jobs'],
  ['地缘政治', 'geopolitics'],
  ['能源', 'energy'],
  ['贵金属', 'precious'],
  ['加密', 'crypto'],
  ['中国政策', 'china'],
  ['权益', 'equities'],
  ['债市', 'rates'],
  ['汇率', 'fx'],
  ['宏观', 'macro'],
]);

async function llmClassifyBatch(batch) {
  const cfg = readDshLlmConfig();
  if (!cfg.apiKey) throw new Error('未找到 LLM 凭据');

  // 正文截断后一起喂进去：只给标题时，"某公司中东项目交付"这类会被误判成地缘冲突，
  // 带上摘要就能看出是公司动态。每条控制 80 字，避免 token 膨胀。
  const list = batch
    .map((ev, i) => {
      const body = String(ev.body ?? '').replace(/\s+/g, ' ').slice(0, 80);
      return body && body !== ev.title.slice(0, 80)
        ? `${i + 1}. ${ev.title} ｜ ${body}`
        : `${i + 1}. ${ev.title}`;
    })
    .join('\n');
  const payload = JSON.stringify({
    model: cfg.model,
    max_tokens: 2500, // reasoning 模型会先思考，预算给小了 content 会被截断
    messages: [
      { role: 'system', content: LLM_SYSTEM },
      { role: 'user', content: list },
    ],
  });

  const raw = await fetchRaw(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: payload,
    timeoutMs: 40_000,
  });

  llmStats.calls += 1;
  llmStats.lastAt = new Date().toISOString();
  llmStats.model = cfg.model;
  scheduleLlmStore();

  const j = JSON.parse(raw);
  // 这个网关把 OpenAI 标准结构包在 data 里，不是顶层 choices
  const text = j?.data?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.message?.content ?? '';
  const arr = parseLooseJsonArray(text);
  if (!arr.length) throw new Error(`LLM 未返回可解析的 JSON（content 长度 ${text.length}）`);
  const now = Date.now();
  let hitCount = 0;
  for (const row of arr) {
    const idx = Number(row?.i) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= batch.length) continue;
    const ev = batch[idx];

    const topics = (Array.isArray(row.topics) ? row.topics : [])
      .map(normalizeTopicLabel)
      .filter(Boolean)
      // 「无关」不是可筛选主题，遇到就只保留等级判断
      .filter((t) => t.key !== 'unrelated');
    const symbols = [...new Set((Array.isArray(row.symbols) ? row.symbols : []).map(normalizeSymbolToken).filter(Boolean))];
    const level = ['high', 'mid', 'low'].includes(row.level) ? row.level : 'low';
    const region = LLM_REGIONS.includes(row.region) ? row.region : null;

    if (!topics.length && level !== 'low') continue; // 判不出主题又说不重要，就不覆盖关键词结果
    llmCache.set(ev.id, { topics, symbols, level, region, at: now });
    hitCount += 1;
  }
  llmStats.classified += hitCount;
}

/** 异步跑 LLM 分类（不阻塞接口返回），下一轮轮询时前端自然拿到增强结果 */
function kickLlmClassify(items) {
  if (llmInFlight) return;
  const now = Date.now();
  const todo = items
    .filter((it) => {
      const hit = llmCache.get(it.id);
      return !hit || now - hit.at > LLM_CACHE_TTL_MS;
    })
    .slice(0, 30);
  if (!todo.length) return;

  llmInFlight = true;
  (async () => {
    try {
      const BATCH = 15;
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        // 网关对连续请求会 500，单批失败重试一次，批之间留间隔
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            await llmClassifyBatch(batch);
            llmStats.lastError = null;
            break;
          } catch (err) {
            llmStats.lastError = String(err?.message ?? err);
            if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
          }
        }
        if (i + BATCH < todo.length) await new Promise((r) => setTimeout(r, 1200));
      }
    } finally {
      llmInFlight = false;
    }
  })();
}

/** 把 LLM 结果盖到关键词结果上 */
function applyLlmResults(items) {
  let applied = 0;
  for (const it of items) {
    const hit = llmCache.get(it.id);
    if (!hit) continue;
    if (Date.now() - hit.at > LLM_CACHE_TTL_MS) continue;
    if (hit.topics.length) it.topics = hit.topics;
    if (hit.symbols.length) it.symbols = hit.symbols;
    if (hit.region) it.region = hit.region;
    it.level = hit.level;
    it.llm = true;
    applied += 1;
  }
  return applied;
}

async function getEvents({ force = false, limit = 120 } = {}) {
  const cached = eventsCache.get('ev');
  if (!force && cached && Date.now() - cached.at < EVENTS_CACHE_TTL_MS) {
    // 缓存期内 LLM 可能刚复核完，重新盖一次（幂等且廉价），
    // 否则前端在缓存有效期内都拿不到 AI 判定结果
    const data = cached.data;
    data.llm.applied = applyLlmResults(data.items);
    data.llm.pending = llmInFlight;
    Object.assign(data.llm, llmStats);
    return data;
  }

  const results = await Promise.allSettled([fetchJin10(), fetchSinaLive(2), fetchWscn(40)]);
  const sourceStatus = [];
  const raw = [];

  results.forEach((r, i) => {
    const name = ['金十数据', '新浪财经', '华尔街见闻'][i];
    if (r.status === 'fulfilled') {
      sourceStatus.push({ source: name, ok: true, count: r.value.length });
      raw.push(...r.value);
    } else {
      sourceStatus.push({ source: name, ok: false, error: String(r.reason?.message ?? r.reason) });
    }
  });

  // 去重：同一 id，或标题高度重合（不同源转发同一条）
  const seenId = new Set();
  const seenTitle = new Set();
  const items = [];
  for (const ev of raw) {
    if (!ev.time || !ev.title) continue;
    if (seenId.has(ev.id)) continue;
    const key = ev.title.slice(0, 36).replace(/\s/g, '');
    if (seenTitle.has(key)) continue;
    seenId.add(ev.id);
    seenTitle.add(key);

    if (NOISE_RE.test(ev.title)) continue; // 汇总稿/营销稿不进事件流

    const info = classify(ev.title, ev.body);
    if (!info.topics.length) continue;
    // 弱相关（例如公司新闻里顺带提到「人民币」）不算市场事件
    if (info.mainWeight < 1.5) continue;

    items.push({
      ...ev,
      topics: info.topics,
      symbols: info.symbols,
      region: guessRegion(`${ev.title} ${ev.body}`),
      score: Math.round(info.rawScore * 10) / 10,
      level: toLevel(info, ev.important),
    });
  }

  // 事件中心的第一性是「实时」：按时间倒序，重要度只用于视觉高亮与筛选
  items.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));

  // 关键词结果先顶上，LLM 结果能命中就覆盖（更准），并顺手在后台补跑没分类过的
  const llmApplied = applyLlmResults(items);
  kickLlmClassify(items);
  archiveEvents(items); // 不 await，失败不影响接口返回

  const data = {
    ok: items.length > 0,
    generatedAt: new Date().toISOString(),
    sources: sourceStatus,
    total: items.length,
    counts: {
      high: items.filter((i) => i.level === 'high').length,
      mid: items.filter((i) => i.level === 'mid').length,
      low: items.filter((i) => i.level === 'low').length,
    },
    topics: TOPIC_RULES.map((t) => ({ key: t.key, label: t.label })),
    llm: {
      enabled: Boolean(readDshLlmConfig().apiKey),
      applied: llmApplied,
      pending: llmInFlight,
      ...llmStats,
    },
    items: items.slice(0, limit),
  };
  eventsCache.set('ev', { at: Date.now(), data });
  return data;
}

/* ------------------------------------------------------------------ *
 * 事件研究（event study）
 * 回答一个问题：这些日历事件日，市场波动真的比平时大吗？
 * 方法：事件日 |日收益率| vs 非事件日 |日收益率|，Welch t 检验
 * 注意：收益率绝对值厚尾，t 检验偏宽松，所以同时给中位数作稳健参考
 * ------------------------------------------------------------------ */

const STUDY_CACHE_TTL_MS = 6 * 3600_000;
const studyCache = new Map();

function statOf(arr) {
  const n = arr.length;
  if (!n) return { n: 0, mean: null, median: null, var: null };
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const sorted = [...arr].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = n > 1 ? arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, median, var: variance };
}

/** Welch t：两样本均值差（不假设方差相等） */
function welchT(a, b) {
  const sa = statOf(a);
  const sb = statOf(b);
  if (!sa.n || !sb.n || sa.var == null || sb.var == null) return null;
  const denom = Math.sqrt(sa.var / sa.n + sb.var / sb.n);
  if (!denom) return null;
  return (sa.mean - sb.mean) / denom;
}

/** 在日期数组里偏移 n 个交易日 */
function shiftDate(dates, i, lag) {
  const j = i + lag;
  return j >= 0 && j < dates.length ? dates[j] : null;
}

/**
 * lag=0：事件日当天
 * lag=1：事件后一个交易日（美股在北京次日收盘，这一步能看出是提前还是滞后反应）
 */
async function buildEventStudy() {
  const cal = await getCalendar();
  const today = new Date().toISOString().slice(0, 10);

  // 只统计已经发生的事件
  const kindDates = new Map();
  for (const e of cal.events) {
    if (!e.date || e.date > today) continue;
    if (!kindDates.has(e.kind)) kindDates.set(e.kind, new Map());
    const m = kindDates.get(e.kind);
    m.set(e.date, (m.get(e.date) ?? 0) + 1);
  }

  const kinds = [...kindDates.keys()];
  if (!kinds.length) return { ok: false, kinds: [], rows: [], error: '没有历史事件可供统计' };

  const rows = [];
  const coverage = [];

  for (const def of MACRO_UNIVERSE) {
    let series;
    try {
      series = await fetchMacroSeries(def);
    } catch {
      continue;
    }
    const chg = toChanges(series.rows, def.kind);
    if (chg.dates.length < 100) continue;
    coverage.push({ id: def.id, name: def.name, from: chg.dates[0], to: chg.dates[chg.dates.length - 1], n: chg.dates.length });

    const absReturns = chg.values.map((v) => Math.abs(v));

    /**
     * 时区自动对齐：美国宏观数据公布时，北京时间落在凌晨或前夜。
     * FOMC 美东 14:00 公布 ≈ 北京次日 02:00/03:00，A 股次日开盘才交易；
     * CPI/非农美东 08:30 公布 ≈ 北京 20:30/21:30，A 股当日 15:00 已收盘。
     * 所以对上证与沪金，真实反应落在「事件后第一个交易日」，其余资产当日即反应。
     * （沪金标的取上金所 Au99.99，日盘 09:00–15:30，与 A 股同属白盘。）
     */
    const autoLag = def.id === 'sh000001' || def.id === 'gold-cn' ? 1 : 0;

    for (const kind of kinds) {
      const dateSet = kindDates.get(kind);
      for (const lag of [0, 1]) {
        const ev = [];
        const base = [];
        for (let i = 0; i < chg.dates.length; i += 1) {
          // absReturns[i] 属于 dates[i] 这个交易日；
          // lag=1 要看「事件发生在前一个交易日」时当日的反应，所以往前挪 i。
          const eventDay = shiftDate(chg.dates, i, -lag);
          if (!eventDay) continue;
          if (dateSet.has(eventDay)) ev.push(absReturns[i]);
          else base.push(absReturns[i]);
        }
        if (ev.length < 5) continue;

        const se = statOf(ev);
        const sb = statOf(base);
        const t = welchT(ev, base);
        rows.push({
          kind,
          symbol: def.id,
          name: def.short,
          lag,
          isAuto: lag === autoLag,
          eventDays: se.n,
          eventMeanPct: se.mean * 100,
          eventMedianPct: se.median * 100,
          baseMeanPct: sb.mean * 100,
          baseMedianPct: sb.median * 100,
          ratio: sb.mean ? se.mean / sb.mean : null,
          // 中位数口径不受厚尾极值影响，和均值口径一起看才知道结果稳不稳
          medianRatio: sb.median ? se.median / sb.median : null,
          t,
          significant: t != null && Math.abs(t) > 1.96,
        });
      }
    }
  }

  return {
    ok: rows.length > 0,
    generatedAt: new Date().toISOString(),
    today,
    kinds: kinds.map((k) => ({ kind: k, count: kindDates.get(k).size })),
    coverage,
    rows,
    note: '事件日波动通常天然偏高（事件本身就在波动时被关注），这里做的是统计对照，不是因果推断',
  };
}

async function getEventStudy({ force = false } = {}) {
  const cached = studyCache.get('study');
  if (!force && cached && Date.now() - cached.at < STUDY_CACHE_TTL_MS) return cached.data;
  const data = await buildEventStudy();
  studyCache.set('study', { at: Date.now(), data });
  return data;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '' || rel === '/') rel = '/index.html';
  const full = path.join(PUBLIC_DIR, path.normalize(rel));
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  try {
    const st = await fsp.stat(full);
    if (st.isDirectory()) return serveStatic(res, path.posix.join(rel, 'index.html'));
    const buf = await fsp.readFile(full);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname === '/api/quotes') {
      const force = url.searchParams.get('force') === '1';
      const data = await getQuotes({ force });
      return sendJson(res, 200, data);
    }
    if (url.pathname.startsWith('/api/detail/')) {
      const id = url.pathname.slice('/api/detail/'.length);
      const force = url.searchParams.get('force') === '1';
      const detail = await getDetail(id, { force });
      if (!detail) return sendJson(res, 404, { ok: false, error: `未知标的: ${id}` });
      return sendJson(res, 200, detail);
    }
    if (url.pathname === '/api/macro') {
      const winRaw = url.searchParams.get('window');
      const win = winRaw === 'all' ? 0 : Math.max(20, Math.min(5000, Number(winRaw) || 250));
      const freq = url.searchParams.get('freq') === 'week' ? 'week' : 'day';
      const force = url.searchParams.get('force') === '1';
      const data = await getMacro(win, freq, { force });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/events') {
      const force = url.searchParams.get('force') === '1';
      const limit = Math.max(10, Math.min(300, Number(url.searchParams.get('limit')) || 120));
      const data = await getEvents({ force, limit });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/eventstudy') {
      const force = url.searchParams.get('force') === '1';
      const data = await getEventStudy({ force });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/calendar') {
      const force = url.searchParams.get('force') === '1';
      const data = await getCalendar({ force });
      return sendJson(res, 200, data);
    }
    if (url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()), ttlMs: CACHE_TTL_MS });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    return serveStatic(res, url.pathname);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err?.message ?? String(err) });
  }
});

/* 后台定时刷新，保证走势连续（即使没有浏览器打开） */
function startBackground() {
  setInterval(() => {
    getQuotes().catch(() => {});
  }, Math.max(CACHE_TTL_MS, 5000)).unref?.();
}

await loadPersistedHistory();
await seedHistory();
await loadLlmStore();

server.listen(PORT, HOST, () => {
  console.log(`市场看板已启动 → http://${HOST}:${PORT}`);
  console.log(`刷新间隔 ${CACHE_TTL_MS}ms，历史点上限 ${HISTORY_LIMIT}`);
  getQuotes().catch(() => {});
  startBackground();
});
