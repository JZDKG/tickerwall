/* ================================================================== *
 * 日线源适配器（10 个上游 + 源降级顺序）
 *
 * 为什么收在 providers/：日线抓取被四处共用 —— 首屏分时播种（seedFrom）、
 * 详情日K（buildDetail）、宏观日线（fetchMacroSeries）、事件研究（buildEventStudy）。
 * 留在任何一个服务里，其余三个都得反向 import，DAG 立刻破。
 *
 * 本模块零 db 依赖：只负责「抓 + 解析成 { rows, meta }」，缓存与落库由调用方决定。
 * ================================================================== */

import { fetchRaw, toNum, UA, SINA_REFERER, parseFredCsvOrThrow } from './index.js';
// CBOE 指数日线（VIX/VXN）的抓取实现放在 cboe.js（它只依赖 http.js，不会成环）。
// 原来这里直接调用 fetchCboeIndexDetail 却没 import：spec.cboe 的任务一定
// ReferenceError，VXN 这种只有 CBOE 一个源的标的整条历史静默为空。
import { fetchCboeIndexDetail } from './cboe.js';
// 东财 K 线上限（约 20 年日线）。默认参数以前写成 DETAIL_HISTORY_LIMIT，
// 但那个常量定义在 services/detail.service.js 里，本模块根本没 import ——
// 只要调用方不显式传 limit 就直接 ReferenceError。providers 不能反向依赖
// services，所以在本层保留一个本地常量。
const EASTMONEY_MAX_LIMIT = 5000;

export async function fetchEastmoneyDaily(secid, limit = EASTMONEY_MAX_LIMIT) {
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


export async function fetchBinanceDaily(symbol, pages = 3) {
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


export async function fetchSinaUsDaily(symbol) {
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


export async function fetchYahooDaily(symbol, range = '10y', attempt = 1) {
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


export async function fetchTencentDaily(code, count = 640) {
  const txt = await fetchRaw(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(code)},day,,,${count},qfq`,
    { timeoutMs: 15_000 },
  );
  const node = JSON.parse(txt)?.data?.[code];
  const list = node?.qfqday ?? node?.day ?? [];
  if (!Array.isArray(list) || list.length < 2) throw new Error('无历史数据');
  const rows = [];
  for (const item of list) {
    const [date, open, close, high, low, volume] = item;
    const c = toNum(close);
    if (!date || !(c > 0)) continue;
    rows.push({
      date,
      open: toNum(open),
      close: c,
      high: toNum(high),
      low: toNum(low),
      volume: toNum(volume),
    });
  }
  if (rows.length < 2) throw new Error('历史过短');
  return { rows, meta: { source: `tencent:${code}`, name: code, code } };
}


export async function fetchFredDaily(seriesId) {
  const csv = await fetchRaw(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`, {
    timeoutMs: 25_000,
    // FRED 对 Chrome 伪装的 UA 会挂起连接，必须用默认 UA
    omitUa: true,
    headers: { Accept: 'text/csv' },
  });
  return parseFredCsvOrThrow(csv, seriesId);
}


export async function fetchNasdaqDaily(symbol, fromYear = 2010) {
  const from = `${fromYear}-01-01`;
  const to = new Date().toISOString().slice(0, 10);
  const txt = await fetchRaw(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical` +
      `?assetclass=index&fromdate=${from}&todate=${to}&limit=9999`,
    { timeoutMs: 25_000, headers: { Accept: 'application/json' } },
  );
  const data = JSON.parse(txt)?.data;
  const list = data?.tradesTable?.rows;
  if (!Array.isArray(list) || !list.length) throw new Error('无历史数据');
  const rows = [];
  for (const r of list) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(r.date ?? '').trim());
    if (!m) continue;
    const close = toNum(String(r.close ?? '').replace(/,/g, ''));
    if (!(close > 0)) continue;
    rows.push({
      date: `${m[3]}-${m[1]}-${m[2]}`,
      open: toNum(String(r.open ?? '').replace(/,/g, '')),
      close,
      high: toNum(String(r.high ?? '').replace(/,/g, '')),
      low: toNum(String(r.low ?? '').replace(/,/g, '')),
      volume: toNum(String(r.volume ?? '').replace(/,/g, '')),
    });
  }
  // 官方接口按倒序返回，统一成升序
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (rows.length < 2) throw new Error('历史过短');
  return { rows, meta: { source: `nasdaq:${symbol}`, name: symbol, code: symbol } };
}


export async function fetchSinaFuturesDaily(symbol) {
  const txt = await fetchRaw(
    `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/` +
      `GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=${encodeURIComponent(symbol)}`,
    { timeoutMs: 20_000, headers: { Referer: 'https://finance.sina.com.cn' } },
  );
  const m = /\((\[[\s\S]*\])\)/.exec(txt);
  if (!m) throw new Error('空响应');
  const list = JSON.parse(m[1]);
  if (!Array.isArray(list) || !list.length) throw new Error('无历史数据');
  const rows = [];
  for (const r of list) {
    const close = toNum(r.close);
    if (!r.date || !(close > 0)) continue;
    rows.push({
      date: String(r.date).slice(0, 10),
      open: toNum(r.open),
      close,
      high: toNum(r.high),
      low: toNum(r.low),
      volume: toNum(r.volume ?? r.vol),
    });
  }
  if (rows.length < 2) throw new Error('历史过短');
  return { rows, meta: { source: `sina-futures:${symbol}`, name: symbol, code: symbol } };
}


export async function fetchSinaForexDaily(symbol) {
  const txt = await fetchRaw(
    `https://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/var%20t=/NewForexService.getDayKLine?symbol=${encodeURIComponent(symbol)}`,
    { timeoutMs: 20_000, headers: { Referer: 'https://finance.sina.com.cn' } },
  );
  const i = txt.indexOf('var t=(');
  if (i < 0) throw new Error('空响应');
  const body = txt
    .slice(i + 7, txt.lastIndexOf(')'))
    .trim()
    .replace(/^"|"$/g, '');
  const rows = [];
  for (const seg of body.split('|')) {
    const f = seg.split(',');
    if (f.length < 5) continue;
    const date = (f[0] ?? '').trim();
    const close = toNum(f[4]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(close > 0)) continue;
    rows.push({ date, open: toNum(f[1]), close, high: toNum(f[3]), low: toNum(f[2]) });
  }
  if (rows.length < 30) throw new Error('历史过短');
  return { rows, meta: { source: `sina-forex:${symbol}`, name: symbol, code: symbol } };
}


export async function fetchSinaInnerFuturesDaily(symbol) {
  const txt = await fetchRaw(
    `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/InnerFuturesNewService.getDailyKLine?symbol=${encodeURIComponent(symbol)}`,
    { timeoutMs: 20_000, headers: { Referer: 'https://finance.sina.com.cn' } },
  );
  const m = /\((\[[\s\S]*\])\)/.exec(txt);
  if (!m) throw new Error('空响应');
  const list = JSON.parse(m[1]);
  const rows = [];
  for (const r of list) {
    const date = String(r.d ?? '').slice(0, 10);
    const close = toNum(r.c);
    if (!date || !(close > 0)) continue;
    rows.push({
      date,
      open: toNum(r.o),
      close,
      high: toNum(r.h),
      low: toNum(r.l),
      volume: toNum(r.v),
    });
  }
  if (rows.length < 30) throw new Error('历史过短');
  return { rows, meta: { source: `sina-inner:${symbol}`, name: symbol, code: symbol } };
}


export function seedYahooOf(spec) {
  if (Array.isArray(spec.seed)) return spec.seed.find((x) => x?.kind === 'yahoo')?.symbol ?? null;
  return spec.seed?.kind === 'yahoo' ? spec.seed.symbol : null;
}


export function historySourcesFor(spec) {
  const jobs = [];
  const add = (name, fn) => {
    fn.sourceName = name;
    jobs.push(fn);
  };
  const binance = spec.binance ?? spec.binanceSymbol;
  if (binance) add('binance', () => fetchBinanceDaily(binance, 4));
  if (spec.sinaUs) add('sina-us', () => fetchSinaUsDaily(spec.sinaUs));
  if (spec.cboe) add('cboe', () => fetchCboeIndexDetail(spec.cboe));
  if (spec.em) add('eastmoney', () => fetchEastmoneyDaily(spec.em, 5000));
  if (spec.fred) add('fred', () => fetchFredDaily(spec.fred));
  if (spec.nasdaq) add('nasdaq', () => fetchNasdaqDaily(spec.nasdaq));
  if (spec.tx) add('tencent', () => fetchTencentDaily(spec.tx, 640));
  if (spec.sinaFutures) add('sina-futures', () => fetchSinaFuturesDaily(spec.sinaFutures));
  if (spec.sinaForex) add('sina-forex', () => fetchSinaForexDaily(spec.sinaForex));
  if (spec.sinaInner) add('sina-inner', () => fetchSinaInnerFuturesDaily(spec.sinaInner));
  const yahoo = spec.yahoo ?? seedYahooOf(spec);
  if (yahoo) add('yahoo', () => fetchYahooDaily(yahoo, '10y'));
  return jobs;
}

