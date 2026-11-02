/* ================================================================== *
 * 详情：日 K + 分时 + 区间统计
 *
 * 契约对齐 web 端 GET /api/detail/:id 的可展示子集（那边还带多源对照、
 * 缓存诊断、日线原始行；小程序用不上，传过去只是白占带宽）。
 *
 * 统计口径与 web 端 buildDayStats 一致：对数收益率、年化按市场天数
 * （加密 365、股票商品 252）、最大回撤用收盘价峰值回落。
 * ================================================================== */

const { findInstrument } = require('./instruments');
const { marketStatusOf } = require('./market');
const { getQuoteOne } = require('./quotes');
const S = require('./sources');

const DAYS_DEFAULT = 250;
const cache = new Map(); // id -> { at, data }
const CACHE_TTL_MS = 120_000;

/** 等距抽稀（分时点太多，画在手机上也是糊的） */
function downsample(arr, n) {
  if (!arr || arr.length <= n) return arr || [];
  const out = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i += 1) out.push(arr[Math.round(i * step)]);
  return out;
}

async function buildDetail(inst) {
  const now = Date.now();

  /* 三件事互不依赖，必须并行：报价、日线、分时。
     微信云开发给新函数的默认超时只有 3 秒，串行下来（日线 2.5s + 分时 1s）
     必然超时；并行之后整体就是最慢那一条的耗时。 */
  const dailyJob = (async () => {
    /* 日线三个源依次试：币安 → 东财 → 腾讯。
       东财的 kline 只认一部分 secid（A 股、商品、美债、标普/纳指有，
       恒指和多数全球指数返回 rc=102），腾讯正好补上港/A 股这块。 */
    const tryDaily = async (fn) => {
      try {
        const r = await fn();
        return r && r.rows && r.rows.length ? r : null;
      } catch (err) {
        return null;
      }
    };
    let dailyRes = null;
    if (inst.binance) dailyRes = await tryDaily(() => S.fetchDailyBinance(inst.binance, DAYS_DEFAULT));
    if (!dailyRes && inst.em) dailyRes = await tryDaily(() => S.fetchDailyEm(inst.em, DAYS_DEFAULT));
    if (!dailyRes && inst.tencent) dailyRes = await tryDaily(() => S.fetchDailyTencent(inst.tencent, DAYS_DEFAULT));
    return dailyRes;
  })();

  const intradayJob = (async () => {
    try {
      let points = [];
      if (inst.binance) points = (await S.fetchIntradayBinance(inst.binance)) || [];
      if (points.length < 2 && inst.em) points = (await S.fetchIntradayEm(inst.em)) || [];
      if (points.length < 2 && inst.tencent && /^(cn|hk)-/.test(inst.market)) {
        points = (await S.fetchIntradayTencent(inst.tencent)) || [];
      }
      return points;
    } catch (err) {
      return [];
    }
  })();

  const [quote, dailyRes, intraday] = await Promise.all([
    getQuoteOne(inst.id).catch(() => null),
    dailyJob,
    intradayJob,
  ]);

  const dailyRows = (dailyRes && dailyRes.rows) || [];
  const dailySource = (dailyRes && dailyRes.meta && dailyRes.meta.source) || null;

  // 统计口径（区间涨跌 / 年化波动 / 最大回撤）在前端算：三种数据源
  // （云函数 / 本机 web 服务 / 演示快照）的 stats 形状并不一致，而日线序列
  // 的形状是一致的。少一次形状适配，就少一处只在某个环境才暴露的 bug。
  // 只把画图要用的三条序列传出去，日期单独一列（前端按 index 对齐）
  const view = dailyRows.slice(-DAYS_DEFAULT);

  return {
    ok: dailyRows.length > 0 || !!(quote && quote.ok),
    id: inst.id,
    name: inst.name,
    sub: inst.sub,
    unit: inst.unit,
    decimals: inst.decimals,
    market: inst.market,
    cat: inst.cat,
    quote,
    marketStatus: marketStatusOf(inst, new Date(now)),
    daily: {
      dates: view.map((r) => r.date),
      close: view.map((r) => r.close),
      high: view.map((r) => r.high),
      low: view.map((r) => r.low),
      count: view.length,
      source: dailySource,
    },
    intraday: {
      points: downsample(intraday || [], 240).map((p) => [p.t, p.p]),
    },
    generatedAt: new Date(now).toISOString(),
  };
}

async function getDetail(id) {
  const inst = findInstrument(id);
  if (!inst) return { ok: false, error: `未知标的: ${id}` };

  const hit = cache.get(inst.id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.data, cached: true };

  const data = await buildDetail(inst);
  if (data.ok) cache.set(inst.id, { at: Date.now(), data });
  return data;
}

module.exports = { getDetail };
