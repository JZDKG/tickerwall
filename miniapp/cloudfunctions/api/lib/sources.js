/* ================================================================== *
 * 上游取数：批量优先，单点兜底
 *
 * 云函数出口 IP 是共享的，逐个标的发请求既慢又容易被限流（web 端在本机实测
 * 23 个标的逐个抓要 6 秒，批量只要 0.3 秒）。所以这一层的原则是：
 *
 *   1. 能批量的绝不分次 —— 新浪 list=a,b,c、东财 ulist.np、腾讯 q=a,b 都支持；
 *   2. 批量失败不抛，返回「已经拿到的部分」—— 少一行数据不应该让整块看板白屏；
 *   3. 每个源单独计价超时，慢源不拖垮快源。
 * ================================================================== */

const { getText, getJson } = require('./http');
const P = require('./parse');

const SINA_REFERER = 'https://finance.sina.com.cn';

/* 东财有多个等价入口，但**不是每个都可用**：实测在腾讯云上海出口，
   push2.eastmoney.com 会「连上即被挂断」（socket hang up），而带编号的
   82.push2 / 1.push2 正常返回。所以顺序里把编号入口放前面，并记住上一次
   成功的那个（recordHost），下一次直接命中，不用每次都试错。 */
const EM_HOSTS = ['82.push2.eastmoney.com', '1.push2.eastmoney.com', 'push2.eastmoney.com', '48.push2.eastmoney.com'];
/* 历史/分时的入口和行情不是同一组：push2his 这几个域名在云出口经常
   「连上即断」，而带编号的 push2 分片（82/48）同时也能服务 trends2 / kline。
   所以两组共用一套候选，靠 preferredHisHost 记住上次成功的那个。 */
const EM_HIS_HOSTS = [
  '82.push2.eastmoney.com',
  '48.push2.eastmoney.com',
  'push2his.eastmoney.com',
  '91.push2his.eastmoney.com',
  'push2delay.eastmoney.com',
];

let preferredEmHost = null;
let preferredHisHost = null;

/** 把上次成功的入口提到第一位 */
function ordered(hosts, preferred) {
  if (!preferred || hosts.indexOf(preferred) <= 0) return hosts;
  return [preferred, ...hosts.filter((h) => h !== preferred)];
}

/** 新浪批量报价（一次最多几十个代码）。返回 Map<code, quote|null> */
async function fetchSina(codes, kinds) {
  const out = new Map();
  if (!codes.length) return out;
  const text = await getText(`https://hq.sinajs.cn/list=${codes.join(',')}`, {
    headers: { Referer: SINA_REFERER },
    encoding: 'gb18030',
    timeoutMs: 5000,
  });
  const map = P.parseSinaBatch(text);
  for (const code of codes) {
    const f = map.get(code);
    if (!f) continue;
    const kind = kinds[code] || 'spot';
    let q = null;
    if (kind === 'global') q = P.parseSinaGlobal(f);
    else if (kind === 'index') q = P.parseSinaIndexFull(f);
    else if (kind === 'forex') q = P.parseSinaForex(f);
    else if (kind === 'futures') q = P.parseSinaFutures(f);
    else if (kind === 'btc') q = P.parseSinaBtc(f);
    else q = P.parseSinaSpot(f);
    if (q) out.set(code, { ...q, source: `sina:${code}` });
  }
  return out;
}

/** 东财批量报价（secid 形如 1.000001 / 100.SPX）。返回 Map<secid, quote> */
async function fetchEastmoney(secids) {
  const out = new Map();
  if (!secids.length) return out;
  const fields = 'f12,f13,f14,f2,f3,f4,f15,f16,f17,f18';
  const qs = `fltt=2&secids=${encodeURIComponent(secids.join(','))}&fields=${fields}`;
  let lastErr = null;
  for (const host of ordered(EM_HOSTS, preferredEmHost)) {
    try {
      const json = await getJson(`https://${host}/api/qt/ulist.np/get?${qs}`, { timeoutMs: 5000 });
      const map = P.parseEastmoneyBatch(json);
      if (map.size) {
        preferredEmHost = host;
        for (const [key, q] of map) out.set(key, { ...q, source: `eastmoney:${key}` });
        return out;
      }
      lastErr = new Error('空响应');
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return out;
}

/** 腾讯批量报价（q=a,b,c）。返回 Map<code, quote> */
async function fetchTencent(codes) {
  const out = new Map();
  if (!codes.length) return out;
  const text = await getText(`https://qt.gtimg.cn/q=${encodeURIComponent(codes.join(','))}`, {
    headers: { Referer: 'https://gu.qq.com/' },
    encoding: 'gb18030',
    timeoutMs: 5000,
  });
  const map = P.parseTencentBatch(text);
  for (const [code, q] of map) out.set(code, { ...q, source: `tencent:${code}` });
  return out;
}

/** CBOE 延迟报价（VIX / VXN）。CDN 会 307，http 层已跟随 */
async function fetchCboe(symbol) {
  const json = await getJson(`https://cdn.cboe.com/api/global/delayed_quotes/quotes/_${symbol}.json`, {
    timeoutMs: 5000,
  });
  const q = P.parseCboe(json);
  return q ? { ...q, source: `cboe:${symbol}` } : null;
}

/** Binance 24h（加密） */
async function fetchBinance(symbol) {
  const json = await getJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, {
    timeoutMs: 5000,
  });
  const q = P.parseBinance24h(json);
  return q ? { ...q, source: 'binance:24h' } : null;
}

async function fetchCoinbase(pair) {
  const json = await getJson(`https://api.coinbase.com/v2/prices/${encodeURIComponent(pair)}/spot`, {
    timeoutMs: 5000,
  });
  const q = P.parseCoinbase(json);
  return q ? { ...q, source: `coinbase:${pair}` } : null;
}

async function fetchGoldApi(symbol) {
  const json = await getJson(`https://api.gold-api.com/price/${encodeURIComponent(symbol)}`, { timeoutMs: 5000 });
  const q = P.parseGoldApi(json);
  return q ? { ...q, source: `gold-api:${symbol}` } : null;
}

/* ------------------------------------------------------------------ *
 * 加密：多家并行抢答
 *
 * Binance / Coinbase 在国内出口经常被墙或超时，而加密是 24×7 的标的，
 * 不能因为一家不可达就让「比特币」这一行空着。这里让 5 家同时发请求，
 * 谁先回来用谁 —— 串行重试的话最坏要等 25 秒，云函数早就超时了。
 * ------------------------------------------------------------------ */

/** OKX 现货（公共行情，无需签名） */
async function fetchOkx(instId) {
  const json = await getJson(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, {
    timeoutMs: 4000,
  });
  const d = json && json.data && json.data[0];
  if (!d) throw new Error('无数据');
  const price = P.toNum(d.last);
  if (!(price > 0)) throw new Error('价格无效');
  return {
    price,
    open: P.toNum(d.open24h),
    high: P.toNum(d.high24h),
    low: P.toNum(d.low24h),
    prevClose: P.toNum(d.open24h),
    changePct: P.toNum(d.open24h) ? ((price - P.toNum(d.open24h)) / P.toNum(d.open24h)) * 100 : null,
    sessionTime: d.ts ? new Date(Number(d.ts)).toISOString() : null,
    source: `okx:${instId}`,
  };
}

/** HTX（原火币）24h 合并行情 */
async function fetchHtx(symbol) {
  const json = await getJson(`https://api.huobi.pro/market/detail/merged?symbol=${encodeURIComponent(symbol)}`, {
    timeoutMs: 4000,
  });
  const t = json && json.tick;
  if (!t) throw new Error('无数据');
  const price = P.toNum(t.close);
  if (!(price > 0)) throw new Error('价格无效');
  const open = P.toNum(t.open);
  return {
    price,
    open,
    high: P.toNum(t.high),
    low: P.toNum(t.low),
    prevClose: open,
    changePct: open ? ((price - open) / open) * 100 : null,
    sessionTime: t.ts ? new Date(Number(t.ts)).toISOString() : null,
    source: `htx:${symbol}`,
  };
}

/** Kraken 公开 Ticker */
async function fetchKraken(pair) {
  const json = await getJson(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`, {
    timeoutMs: 4000,
  });
  const result = json && json.result;
  const key = result && Object.keys(result)[0];
  const d = key ? result[key] : null;
  if (!d || !d.c) throw new Error('无数据');
  const price = P.toNum(d.c[0]);
  if (!(price > 0)) throw new Error('价格无效');
  const open = P.toNum(d.o);
  return {
    price,
    open,
    high: P.toNum(d.h && d.h[1]),
    low: P.toNum(d.l && d.l[1]),
    prevClose: open,
    changePct: open ? ((price - open) / open) * 100 : null,
    sessionTime: null,
    source: `kraken:${pair}`,
  };
}

/** 抢答：第一个成功的源胜出，全部失败才抛 */
/**
 * 加密多家抢答。
 *
 * 注意 budgetMs：`Promise.any` 只在**全部失败**时才 reject，而每一家在云出口
 * 都是 5 秒超时 —— 也就是说五家全挂时这里要等 5 秒，直接把整个云函数顶过超时。
 * 所以加一道总闸，到点就认输，让上层用新浪的 BTC 报价兜底。
 */
async function fetchCryptoAny(spec, budgetMs = 1200) {
  const tasks = [];
  if (spec.binance) tasks.push(() => fetchBinance(spec.binance));
  if (spec.coinbase) tasks.push(() => fetchCoinbase(spec.coinbase));
  if (spec.okx) tasks.push(() => fetchOkx(spec.okx));
  if (spec.htx) tasks.push(() => fetchHtx(spec.htx));
  if (spec.kraken) tasks.push(() => fetchKraken(spec.kraken));
  if (!tasks.length) throw new Error('未配置加密源');

  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('加密源整体超时')), budgetMs);
  });
  try {
    return await Promise.any([...tasks.map((fn) => fn()), guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * 分时 / 日线（逐标的，无法批量）
 * ------------------------------------------------------------------ */

/** 东财当日分时（每分钟一个点）。返回 [{t,p}]，失败返回 null */
/* ------------------------------------------------------------------ *
 * 腾讯：兜底通道
 *
 * 为什么需要它：东财的 trends2 / kline 只认一部分 secid —— 商品、美债、
 * 标普/纳指有，港股恒指和多数全球指数在 K 线接口上直接返回 rc=102，
 * 分时接口更是只对部分代码有效。腾讯这套接口对「港/A 股」最完整，
 * 正好补上东财缺的那块。
 * ------------------------------------------------------------------ */

/** 解析 "0930 3605.65 6231985 9297140974.10" 这种分钟行 */
function tencentMinutePoints(rows, dateStr) {
  const d = String(dateStr || '').replace(/-/g, '');
  const date = /^\d{8}$/.test(d)
    ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
  const points = [];
  for (const row of rows) {
    const parts = String(row).trim().split(/\s+/);
    const hm = parts[0] || '';
    const p = P.toNum(parts[1]);
    if (!/^\d{3,4}$/.test(hm) || !(p > 0)) continue;
    const hh = hm.length === 3 ? `0${hm[0]}` : hm.slice(0, 2);
    const mm = hm.slice(-2);
    const t = Date.parse(`${date}T${hh}:${mm}:00+08:00`);
    if (Number.isFinite(t)) points.push({ t, p });
  }
  return points;
}

/** 腾讯分钟线：sh000001 / hkHSI 这类有连续竞价的代码才有；美股指数只回 1 个点 */
async function fetchIntradayTencent(code) {
  const json = await getJson(
    `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${encodeURIComponent(code)}`,
    { timeoutMs: 5000 },
  );
  const node = json && json.data && json.data[code];
  const rows = node && node.data && node.data.data;
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const points = tencentMinutePoints(rows, node.data.date);
  return points.length >= 2 ? points : null;
}

/** 腾讯日线：返回 { rows:[{date,open,close,high,low,volume}], meta } */
async function fetchDailyTencent(code, limit = 320) {
  const json = await getJson(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(code)},day,,,${limit},qfq`,
    { timeoutMs: 6000 },
  );
  const node = json && json.data && json.data[code];
  const rows = (node && (node.qfqday || node.day)) || [];
  if (!Array.isArray(rows) || !rows.length) throw new Error('无日线');
  const out = [];
  for (const r of rows) {
    const close = P.toNum(r[2]);
    if (!(close > 0)) continue;
    out.push({
      date: String(r[0]),
      open: P.toNum(r[1]),
      close,
      high: P.toNum(r[3]),
      low: P.toNum(r[4]),
      volume: P.toNum(r[5]),
    });
  }
  if (!out.length) throw new Error('无日线');
  return { rows: out, meta: { source: `tencent:${code}` } };
}

/**
 * 东财分时。
 *
 * opts.budgetMs 是这一整次抓取的时间上限（默认 5 秒）：入口有好几个，逐个
 * 试到底会拖到 25 秒，把调用方整轮的预算吃光 —— 卡片走势图就是这样变空的。
 * 所以每个入口的超时按「剩余预算 / 剩余入口数」均摊，试不完就认输。
 */
async function fetchIntradayEm(secid, opts = {}) {
  const qs = `secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3&fields2=f51,f53&iscr=0&ndays=1`;
  const allHosts = ordered(EM_HIS_HOSTS, preferredHisHost);
  // 预算紧的时候只试两个入口：试满五个会把整轮预算吃光，反而一个都拿不到
  const hosts = (opts.budgetMs || 5000) < 2500 ? allHosts.slice(0, 2) : allHosts;
  const deadline = Date.now() + (opts.budgetMs || 5000);
  let lastErr = null;

  for (let k = 0; k < hosts.length; k += 1) {
    const left = deadline - Date.now();
    if (left < 600) break;
    const slice = Math.max(800, Math.min(4000, Math.floor(left / (hosts.length - k))));
    try {
      const json = await getJson(`https://${hosts[k]}/api/qt/stock/trends2/get?${qs}`, { timeoutMs: slice });
      const trends = json && json.data && json.data.trends;
      if (!Array.isArray(trends) || !trends.length) throw new Error('无分时');
      preferredHisHost = hosts[k];
      const points = [];
      for (const row of trends) {
        const [ts, val] = String(row).split(',');
        const p = P.toNum(val);
        if (!(p > 0)) continue;
        const t = Date.parse(`${ts.replace(' ', 'T')}:00+08:00`);
        points.push({ t: Number.isFinite(t) ? t : null, p });
      }
      return points.length ? points : null;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

/** Binance 1 分钟 K（最近 12 小时），用于 BTC 分时 */
async function fetchIntradayBinance(symbol) {
  const json = await getJson(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=720`,
    { timeoutMs: 5000 },
  );
  if (!Array.isArray(json)) return null;
  return json.map((r) => ({ t: Number(r[0]), p: P.toNum(r[4]) })).filter((x) => x.p > 0);
}

/**
 * 东财日 K。返回行数组，字段顺序与 web 端一致：
 * [日期, 开, 收, 高, 低, 成交量, 成交额, 振幅%, 涨跌幅%, 涨跌额]
 */
async function fetchDailyEm(secid, limit = 250) {
  const qs =
    `secid=${encodeURIComponent(secid)}` +
    '&fields1=f1,f2,f3,f4,f5,f6' +
    '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60' +
    `&klt=101&fqt=1&end=20500101&lmt=${limit}`;
  let lastErr = null;
  for (const host of ordered(EM_HIS_HOSTS, preferredHisHost)) {
    try {
      const json = await getJson(`https://${host}/api/qt/stock/kline/get?${qs}`, { timeoutMs: 6000 });
      const klines = json && json.data && json.data.klines;
      if (!Array.isArray(klines) || !klines.length) throw new Error('无历史数据');
      preferredHisHost = host;
      const rows = [];
      for (const line of klines) {
        const c = String(line).split(',');
        const close = P.toNum(c[2]);
        if (close == null) continue;
        rows.push({
          date: c[0],
          open: P.toNum(c[1]),
          close,
          high: P.toNum(c[3]),
          low: P.toNum(c[4]),
          volume: P.toNum(c[5]),
          amount: P.toNum(c[6]),
          pct: P.toNum(c[8]),
        });
      }
      return { rows, meta: { source: `eastmoney:${secid}`, name: (json.data && json.data.name) || null } };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('日K取数失败');
}

/** Binance 日 K */
async function fetchDailyBinance(symbol, limit = 250) {
  const json = await getJson(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=${limit}`,
    { timeoutMs: 6000 },
  );
  if (!Array.isArray(json) || !json.length) throw new Error('无历史数据');
  const rows = json.map((r) => ({
    date: new Date(Number(r[0])).toISOString().slice(0, 10),
    open: P.toNum(r[1]),
    close: P.toNum(r[4]),
    high: P.toNum(r[2]),
    low: P.toNum(r[3]),
    volume: P.toNum(r[5]),
    amount: null,
    pct: null,
  }));
  return { rows, meta: { source: `binance:${symbol}`, name: symbol } };
}

module.exports = {
  fetchSina,
  fetchEastmoney,
  fetchTencent,
  fetchCboe,
  fetchBinance,
  fetchCoinbase,
  fetchGoldApi,
  fetchOkx,
  fetchHtx,
  fetchKraken,
  fetchCryptoAny,
  fetchIntradayEm,
  fetchIntradayBinance,
  fetchIntradayTencent,
  fetchDailyEm,
  fetchDailyBinance,
  fetchDailyTencent,
  fetchText: getText,
};
