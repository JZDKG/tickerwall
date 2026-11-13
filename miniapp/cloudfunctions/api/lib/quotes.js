/* ================================================================== *
 * 行情聚合（云函数版）
 *
 * 契约与 web 端 GET /api/quotes 完全一致：
 *   { ok, generatedAt, ttlMs, items:[{ id,name,sub,unit,decimals,price,prevClose,
 *     change,changePct,open,high,low,sessionTime,marketStatus,freshness,
 *     source,stale,error,extras,history:[{t,p}] }] }
 *
 * 小程序里同一份渲染代码因此可以同时吃「云函数 / 本机 web 服务 / 内置演示
 * 快照」三种数据源，不需要分支。
 *
 * 缓存策略与 web 端对齐（15 秒），另外多一层「上一次成功值」：全源同时挂掉
 * 时返回带 stale 标记的旧值，而不是把 23 行全变成取数失败。
 * ================================================================== */

const { INSTRUMENTS, findInstrument } = require('./instruments');
const { marketStatusOf, freshnessOf } = require('./market');
const S = require('./sources');
const { toNum } = require('./parse');

const TTL_MS = 15_000;
/* 分时缓存 10 分钟（开市）/ 1 小时（收盘）。
   为什么这么长：每轮只补几个标的，23 个轮一圈要好几分钟；缓存太短会让
   排在前面的先过期、永远补不齐。走势图看的是「今天的形状」，10 分钟前的
   形状和现在几乎没有差别，末端那个点本来就是最新价。 */
const SPARK_TTL_MS = 600_000;
const SPARK_CLOSED_TTL_MS = 3_600_000;
const SPARK_POINTS = 72; // 卡片上最多画 72 个点，再多肉眼也看不出差别
const SPARK_RING_MAX = 72; // 自采环形缓冲的容量（约 72 分钟）
/* 整轮分的总预算。云函数默认超时只有 3 秒（微信云开发给新函数的默认值），
   所以这里不是「给分时留 2.5 秒」，而是「整轮必须在 2.6 秒内收工」——
   超时会把已经拿到的报价一起丢掉，那才是真的白屏。 */
const TOTAL_BUDGET_MS = 1800;

let quotesCache = { at: 0, data: null };
let inflight = null;
const sparkCache = new Map(); // id -> { at, points }
const lastGood = new Map(); // id -> { at, item }
let sparkCursor = 0;

/* ------------------------------------------------------------------ *
 * 自采环形缓冲
 *
 * web 端的卡片走势图就是「服务端内存里存一串最近成交价」，不额外打上游，
 * 所以任何标的都有线。云函数照搬这一套：每次拿到报价就往环里记一笔，
 * 一分钟一条。它不是真分时，所以只在拿不到真分时时兜底 —— 有 72 个点
 * 的近似走势，也好过卡片上一片空白。
 * ------------------------------------------------------------------ */
const sparkRing = new Map(); // id -> [{t,p}]

function pushRing(inst, price, now) {
  const p = toNum(price);
  if (!(p > 0)) return;
  const arr = sparkRing.get(inst.id) || [];
  const last = arr[arr.length - 1];
  if (last && now - last.t < 55_000) arr[arr.length - 1] = { t: now, p }; // 同一分钟内用最新价顶掉
  else arr.push({ t: now, p });
  if (arr.length > SPARK_RING_MAX) arr.splice(0, arr.length - SPARK_RING_MAX);
  sparkRing.set(inst.id, arr);
}

/** 把长序列等距抽稀到 n 个点，首尾必留 */
function downsample(points, n) {
  if (!Array.isArray(points) || points.length <= n) return points || [];
  const out = [];
  const step = (points.length - 1) / (n - 1);
  for (let i = 0; i < n; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

/** 有限并发：云函数同时开 23 个 socket 容易被上游判定为攻击 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i).catch(() => null);
    }
  });
  await Promise.all(workers);
  return out;
}

/** 分时：按市场状态给不同 TTL —— 收盘后不会变，别每 3 分钟重抓一遍 */
async function sparkFor(inst, status, now, budgetMs) {
  const cached = sparkCache.get(inst.id);
  const ttl = status && status.open ? SPARK_TTL_MS : SPARK_CLOSED_TTL_MS;
  if (cached && now - cached.at < ttl) return cached.points;

  const budget = Math.max(1200, Math.min(4000, budgetMs || 4000));
  let points = null;
  try {
    if (inst.binance) points = await S.fetchIntradayBinance(inst.binance);
    else if (inst.em) points = await S.fetchIntradayEm(inst.em, { budgetMs: budget });
  } catch (err) {
    points = null;
  }

  // 东财没有这个标的、或它的代码在 trends2 上无效（港股指数与多数全球指数
  // 就是这样）：用腾讯补。腾讯的美股分钟线只有一个点，所以只对 A 股/港股有意义。
  if ((!points || points.length < 2) && inst.tencent && /^(cn|hk)-/.test(inst.market)) {
    try {
      points = await S.fetchIntradayTencent(inst.tencent);
    } catch (err) {
      points = null;
    }
  }

  if (points && points.length >= 2) {
    const trimmed = downsample(
      points.filter((p) => p && Number.isFinite(p.p)),
      SPARK_POINTS,
    );
    if (trimmed.length >= 2) {
      sparkCache.set(inst.id, { at: now, points: trimmed });
      return trimmed;
    }
  }

  // 上游都没有：退到自采的环，画一条短一点的真实走势，总比空白强
  const ring = downsample(sparkRing.get(inst.id) || [], SPARK_POINTS);
  if (ring.length >= 2) return ring;
  // 抓失败但手里有旧点：继续用旧点（UI 会自己判断新鲜度）
  if (cached) return cached.points;
  return [];
}

/**
 * 整批分时：缓存/环先给结果，再用剩余预算轮转补真分时。
 *
 * 两种预算：
 *   · 用户请求（warm=false）：最多 2.5 秒、补 3 个 —— 首屏不能等上游；
 *   · 定时预热（warm=true）：最多 25 秒、补满 23 个 —— 这一轮抓到的会进
 *     缓存（开市 3 分钟、收盘 24 分钟），接下来十分钟的用户请求直接命中。
 *
 * 这样贵的那部分只在后台发生。轮转起点每次前移，避免排在末尾的标的
 * 永远吃不到预算 —— 之前 7 个标的长期没走势图就是这么来的。
 */
async function buildSparks(insts, statuses, now, warm) {
  // 预算从「本轮开始」算起，不是从现在：报价那一批已经花掉的时间要扣掉，
  // 否则分时会挤占报价、把整个函数顶过超时
  const budget = Math.max(600, TOTAL_BUDGET_MS - (Date.now() - now));
  const limit = warm ? 6 : 2;
  const deadline = Date.now() + budget;
  const out = new Array(insts.length);
  const pending = [];

  insts.forEach((inst, i) => {
    const cached = sparkCache.get(inst.id);
    const ttl =
      statuses[i] && statuses[i].open ? SPARK_TTL_MS : SPARK_CLOSED_TTL_MS;
    if (cached && now - cached.at < ttl && cached.points.length >= 2) {
      out[i] = cached.points;
      return;
    }
    out[i] = downsample(sparkRing.get(inst.id) || [], SPARK_POINTS);
    pending.push(i);
  });

  const n = pending.length;
  if (!n) return out;

  const start = sparkCursor % n;
  const order = pending.slice(start).concat(pending.slice(0, start));
  let done = 0;
  for (const i of order) {
    const left = deadline - Date.now();
    if (done >= limit || left < 700) break;
    const slice = Math.min(900, left);
    const pts = await sparkFor(insts[i], statuses[i], now, slice).catch(() => null);
    if (pts && pts.length >= 2) out[i] = pts;
    done += 1;
  }
  sparkCursor = (sparkCursor + done) % n;
  return out;
}

/** 涨跌字段补齐：源只给现价时用昨收反算，别让界面出现空涨跌 */
function fillChange(q) {
  const price = toNum(q.price);
  const prev = toNum(q.prevClose);
  let change = toNum(q.change);
  let changePct = toNum(q.changePct);
  if (change == null && price != null && prev) change = price - prev;
  if (changePct == null && change != null && prev) changePct = (change / prev) * 100;
  return { ...q, change, changePct };
}

/** 一轮抓取：三类批量请求并行，任何一个失败都不影响其它 */
async function fetchAll() {
  const all = INSTRUMENTS.slice();
  // extras 里的标的（布伦特 / VXN）也要参与批量，否则 chip 永远没有价格
  for (const inst of all) {
    for (const ex of inst.extras || []) {
      all.push({ ...ex, market: inst.market, __extra: true });
    }
  }

  const sinaKinds = {};
  const sinaCodes = [];
  const emSecids = [];
  const tencentCodes = [];

  for (const inst of all) {
    if (inst.sina) {
      sinaCodes.push(inst.sina.code);
      sinaKinds[inst.sina.code] = inst.sina.kind;
    }
    if (inst.em) emSecids.push(inst.em);
    if (inst.tencent) tencentCodes.push(inst.tencent);
  }

  const [sinaRes, emRes, tencentRes] = await Promise.allSettled([
    S.fetchSina(sinaCodes, sinaKinds),
    S.fetchEastmoney(emSecids),
    S.fetchTencent(tencentCodes),
  ]);

  const sinaMap = sinaRes.status === 'fulfilled' ? sinaRes.value : new Map();
  const emMap = emRes.status === 'fulfilled' ? emRes.value : new Map();
  const tencentMap = tencentRes.status === 'fulfilled' ? tencentRes.value : new Map();

  return { sinaMap, emMap, tencentMap, errors: [sinaRes, emRes, tencentRes].filter((r) => r.status === 'rejected').map((r) => String(r.reason && r.reason.message)) };
}

/** 单个标的的报价：按优先级取第一个拿到的源，并记住是谁给的 */
async function resolveQuote(inst, maps) {
  const tries = [];
  if (inst.sina) tries.push(() => maps.sinaMap.get(inst.sina.code));
  if (inst.tencent) tries.push(() => maps.tencentMap.get(inst.tencent));
  if (inst.em) tries.push(() => maps.emMap.get(inst.em));
  if (inst.cboe) tries.push(() => S.fetchCboe(inst.cboe).catch(() => null));
  if (inst.goldapi) tries.push(() => S.fetchGoldApi(inst.goldapi).catch(() => null));
  // 加密放最后：国内出口基本连不上这几家，串行放在前面会白等 4 秒，
  // 而新浪那条批量请求里已经有 BTC
  if (inst.binance) {
    tries.push(() =>
      S.fetchCryptoAny(
        {
          binance: inst.binance,
          coinbase: inst.coinbase,
          okx: inst.okx,
          htx: inst.htx,
          kraken: inst.kraken,
        },
        1200,
      ),
    );
  }

  for (const tryOne of tries) {
    let q = null;
    try {
      q = await tryOne();
    } catch (err) {
      q = null;
    }
    if (q && toNum(q.price) > 0) return fillChange(q);
  }
  return null;
}

/** 内外盘价差（国内金价卡上的 chip）：国际金价按汇率折成元/克再和上金所比 */
function goldSpreadChip(items) {
  const intl = items.find((i) => i.id === 'gold-intl');
  const cn = items.find((i) => i.id === 'gold-cn');
  const fx = items.find((i) => i.id === 'usdcny');
  if (!intl || !cn || !intl.price || !cn.price) return null;
  const rate = fx && fx.price ? fx.price : 7.1; // 汇率缺失时用近似值，但会标出来源
  const perGram = (intl.price * rate) / 31.1035;
  const spread = cn.price - perGram;
  return {
    id: 'gold-intl',
    name: '沪金溢价',
    ok: true,
    price: spread,
    priceText: `${spread >= 0 ? '+' : ''}${spread.toFixed(2)} 元/克`,
    // 溢价本身在 0 附近来回穿，算涨跌幅会动辄几百个百分点，没有解释价值；
    // 这里只给绝对价差，不给百分比（宁可少一个数，也不给一个会误读的数）
    changePct: null,
    sessionTime: null,
    source: fx ? 'calc:内外盘' : 'calc:内外盘(汇率近似)',
    stale: !fx,
    error: null,
  };
}

async function buildQuotes(opts = {}) {
  const now = Date.now();
  const statuses = INSTRUMENTS.map((inst) => marketStatusOf(inst, new Date(now)));

  /* 分时和报价并行跑：分时只依赖标的列表，不依赖这一轮的报价（环里是上一轮
     的值）。串行的话分时那 1~2 秒会直接叠在报价后面，3 秒超时的环境里必然超。 */
  const sparkPromise = buildSparks(INSTRUMENTS, statuses, now, !!opts.warm);

  const maps = await fetchAll();

  /* 阶段一：报价。绝大多数标的直接命中批量结果（零额外请求），
     只有 VIX / BTC 这类单点源各发一次，所以可以全量并行。 */
  const resolved = await mapLimit(INSTRUMENTS, 12, async (inst, i) => ({
    inst,
    status: statuses[i],
    q: await resolveQuote(inst, maps),
  }));

  // 先入环：分时拿不到时，环里的点就是卡片上唯一的走势
  for (const r of resolved) if (r.q) pushRing(r.inst, r.q.price, now);

  /* 阶段二：等分时。它已经在上面并行跑了，这里只是收口。
     真分时是「N 个标的 = N 个请求」，一次全抓要十几秒，而且并发一高东财就
     限流（表现是随机几行空着）。所以轮转补：每轮只补几个、其余先用环里的
     点顶上，几次调用之后全量都是真分时。 */
  const sparks = await sparkPromise;

  const items = resolved.map(({ inst, status, q }, i) => {
    const spark = sparks[i] || [];

    if (!q) {
      // 全源失败：拿上一次成功的值顶着，并明确标 stale（web 端同款行为）
      const prev = lastGood.get(inst.id);
      const base = {
        id: inst.id,
        name: inst.name,
        sub: inst.sub,
        unit: inst.unit,
        decimals: inst.decimals,
        cat: inst.cat,
        marketStatus: status,
        extras: [],
        history: spark,
      };
      if (prev && now - prev.at < 30 * 60_000) {
        return {
          ...prev.item,
          ...base,
          ok: true,
          stale: true,
          error: '上游暂不可用，显示上一次成功数据',
          freshness: { ...prev.item.freshness, level: 'stale', suspect: true, suspectNote: '上游暂不可用' },
        };
      }
      return {
        ...base,
        ok: false,
        price: null,
        changePct: null,
        stale: false,
        error: '取数失败（全部上游不可用）',
        freshness: { dataTime: null, ageMs: null, label: '无数据', level: 'stale', suspect: true },
      };
    }

    const item = {
      id: inst.id,
      name: inst.name,
      sub: inst.sub,
      unit: inst.unit,
      decimals: inst.decimals,
      cat: inst.cat,
      ok: true,
      price: q.price,
      prevClose: q.prevClose,
      change: q.change,
      changePct: q.changePct,
      open: q.open,
      high: q.high,
      low: q.low,
      sessionTime: q.sessionTime || null,
      marketStatus: status,
      freshness: freshnessOf(q.sessionTime, status, new Date(now)),
      priceBasis: q.priceBasis,
      source: q.source,
      stale: false,
      error: null,
      extras: [],
      history: spark,
    };
    lastGood.set(inst.id, { at: now, item });
    return item;
  });

  // 附加报价 chip：布伦特 / VXN 直接从批量结果里取
  for (const inst of INSTRUMENTS) {
    if (!inst.extras || !inst.extras.length) continue;
    const host = items.find((i) => i.id === inst.id);
    if (!host) continue;
    const chips = [];
    for (const ex of inst.extras) {
      const q = await resolveQuote({ ...ex, market: inst.market }, maps);
      if (!q) {
        chips.push({ id: ex.id, name: ex.name, ok: false, price: null, priceText: '—', changePct: null, error: '取数失败' });
        continue;
      }
      const d = ex.decimals || 2;
      chips.push({
        id: ex.id,
        name: ex.name,
        ok: true,
        price: q.price,
        priceText: q.price.toFixed(d),
        changePct: q.changePct,
        sessionTime: q.sessionTime || null,
        source: q.source,
      });
    }
    host.extras = chips;
  }

  const goldChip = goldSpreadChip(items);
  const goldCn = items.find((i) => i.id === 'gold-cn');
  if (goldCn && goldChip) goldCn.extras = [goldChip];

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    ttlMs: TTL_MS,
    items,
    degraded: maps.errors.length ? maps.errors : undefined,
  };
}

/**
 * 对外入口。同键合并：并发进来只跑一次抓取（小程序首屏会同时拉行情与事件，
 * 两个请求很容易撞在同一秒）。
 */
async function getQuotes({ force = false, warm = false } = {}) {
  const now = Date.now();
  if (!force && quotesCache.data && now - quotesCache.at < TTL_MS) {
    return { ...quotesCache.data, cached: true };
  }
  if (inflight) return inflight;
  inflight = buildQuotes({ warm })
    .then((data) => {
      quotesCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 给详情页复用的单项解析（详情页要用到 extras 之外的元数据） */
/**
 * 单个标的的报价（详情页用）。
 *
 * 不能直接调 getQuotes：那是 23 个标的的整批流水线（批量抓 + 分时轮转），
 * 详情页只要一个数，付整批的代价在 3 秒超时的环境里就是必然超时。
 * 这里只打这一条需要的源，一次请求。
 */
async function getQuoteOne(id) {
  const now = Date.now();
  if (quotesCache.data && now - quotesCache.at < TTL_MS) {
    const hit = quotesCache.data.items.find((i) => i.id === id);
    if (hit) return hit;
  }

  const inst = findInstrument(id);
  if (!inst) return null;

  const maps = { sinaMap: new Map(), tencentMap: new Map(), emMap: new Map() };
  const jobs = [];
  if (inst.sina) {
    jobs.push(
      S.fetchSina([inst.sina.code], { [inst.sina.code]: inst.sina.kind })
        .then((m) => {
          for (const [k, v] of m) maps.sinaMap.set(k, v);
        })
        .catch(() => {}),
    );
  }
  if (inst.tencent) {
    jobs.push(
      S.fetchTencent([inst.tencent])
        .then((m) => {
          for (const [k, v] of m) maps.tencentMap.set(k, v);
        })
        .catch(() => {}),
    );
  }
  if (inst.em) {
    jobs.push(
      S.fetchEastmoney([inst.em])
        .then((m) => {
          for (const [k, v] of m) maps.emMap.set(k, v);
        })
        .catch(() => {}),
    );
  }
  await Promise.all(jobs);

  const q = await resolveQuote(inst, maps);
  if (!q) return null;

  const status = marketStatusOf(inst, new Date(now));
  pushRing(inst, q.price, now);
  const cachedSpark = sparkCache.get(inst.id);
  const history =
    (cachedSpark && cachedSpark.points) ||
    downsample(sparkRing.get(inst.id) || [], SPARK_POINTS);

  return {
    id: inst.id,
    name: inst.name,
    sub: inst.sub,
    unit: inst.unit,
    decimals: inst.decimals,
    cat: inst.cat,
    ok: true,
    price: q.price,
    prevClose: q.prevClose,
    change: q.change,
    changePct: q.changePct,
    open: q.open,
    high: q.high,
    low: q.low,
    sessionTime: q.sessionTime || null,
    marketStatus: status,
    freshness: freshnessOf(q.sessionTime, status, new Date(now)),
    priceBasis: q.priceBasis,
    source: q.source,
    stale: false,
    error: null,
    extras: [],
    history,
  };
}

module.exports = { getQuotes, getQuoteOne, TTL_MS, findInstrument };
