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
import { MOVE_SUSPECT_PCT } from '../domain/instruments.js';
import { readDailyCache, takeSnapshot } from '../db/index.js';
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
import {
  hhmmss,
  sinaSpot,
  sinaGlobal,
  sinaSimpleIndex,
  sinaIndexFull,
  sinaFutures,
  eastmoney,
  binance,
  coinbase,
  goldApi,
  sinaForexQuote,
  fredQuote,
  yahooThrottle,
  yahooQuote,
  cnbcBatchFetch,
  cnbcQuote,
  tencentQuote,
  sinaInt,
  parseYahooChart,
  yahooQuoteOnce,
} from '../providers/quotes.js';

// 适配器已下沉到 providers/quotes.js；这里转发一遍保持导出面不变
// （tests/quotes-adapters.test.js 与 detail.service.js 都从这里取）
export {
  hhmmss,
  sinaSpot,
  sinaGlobal,
  sinaSimpleIndex,
  sinaIndexFull,
  sinaFutures,
  eastmoney,
  binance,
  coinbase,
  goldApi,
  sinaForexQuote,
  fredQuote,
  yahooThrottle,
  yahooQuote,
  cnbcBatchFetch,
  cnbcQuote,
  tencentQuote,
  sinaInt,
  parseYahooChart,
  yahooQuoteOnce,
};

import {
  basisProxy,
  GLOBAL_INDEX_DEFS,
  INSTRUMENTS,
  DETAIL_ONLY_INSTRUMENTS,
  findInstrument,
} from '../providers/instruments.js';

// 标的注册表已下沉到 providers/instruments.js；这里转发保持导出面不变
// （detail.service.js 与 tests 里的 withInst 都直接操作 INSTRUMENTS）
export {
  basisProxy,
  GLOBAL_INDEX_DEFS,
  INSTRUMENTS,
  DETAIL_ONLY_INSTRUMENTS,
  findInstrument,
};

import {
  HISTORY_FILE,
  DAILY_CACHE_DIR,
  dailyCacheFile,
  LLM_STORE_FILE,
  EVENTS_DIR,
  SNAPSHOT_FILE,
  scheduleHistorySave,
  loadPersistedHistory,
  migrateLegacyStorage,
  resetStorageTimerForTests,
  HISTORY_LIMIT,
  ring,
  pushHistory,
  SEED_NOTE_TTL_MS,
  seedNotes,
  seedPoints,
  trimToLastSession,
  seedFrom,
  seedHistory,
  historyNoteFor,
} from '../db/quotes-storage.js';

// 走势存储已下沉到 db/quotes-storage.js；转发保持导出面不变
// （server.mjs 启动时调 loadPersistedHistory、测试里 resetRuntimeState 都从这取）
export {
  HISTORY_FILE,
  DAILY_CACHE_DIR,
  dailyCacheFile,
  LLM_STORE_FILE,
  EVENTS_DIR,
  SNAPSHOT_FILE,
  scheduleHistorySave,
  loadPersistedHistory,
  migrateLegacyStorage,
  HISTORY_LIMIT,
  ring,
  pushHistory,
  SEED_NOTE_TTL_MS,
  seedNotes,
  seedPoints,
  trimToLastSession,
  seedFrom,
  seedHistory,
  historyNoteFor,
};


export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 15000);
export const FETCH_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS;

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */





/** CME Globex / 纽约汇市：周日 18:00 ET 开盘，周五 17:00 ET 收盘，每日 17:00–18:00 结算 */





/** 当前是否在该市场的交易时段内（按交易所本地时区判断） */


/* 布伦特在列表里是原油行的附加报价，但详情页可以单独打开，所以这里给它一份等价配置 */
/** 标记跨合约兜底源（如现货金降级到期货金）：报价可应急展示，但禁止混写进现货分时缓冲 */


/* ------------------------------------------------------------------ *
 * 走势历史（内存环形缓冲 + 落盘，重启后走势不断档）
 * ------------------------------------------------------------------ */

export const lastGood = new Map(); // id -> 最近一次成功快照


/**
 * 仅供测试：清掉模块级节流状态。
 *
 * saveTimer / lastSnapshotAt 都是「进程内只该有一份」的状态，跨用例会互相
 * 影响（上一个用例排的 2 秒落盘定时器会让下一个用例的 scheduleHistorySave
 * 直接 early-return）。生产代码不调用它。
 */
export function __resetRuntimeStateForTests() {
  resetStorageTimerForTests();
  lastSnapshotAt = 0;
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


/** 单日变动阈值已下沉至 domain/instruments.js，此处保留 re-export 维持外部契约 */
export { MOVE_SUSPECT_PCT };

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

export const SNAPSHOT_MIN_GAP_MS = 5 * 60_000;
export let lastSnapshotAt = 0;

/* ------------------------------------------------------------------ *
 * 隔夜复盘（逻辑已下沉至 domain/briefing-calc.js）
 * ------------------------------------------------------------------ */
export {
  BRIEFING_MAX_LINES,
  shanghaiDay,
  shanghaiMinuteOfDay,
  buildBriefing,
} from '../domain/briefing-calc.js';
