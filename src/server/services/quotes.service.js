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
import {
  getDb,
  readDailyCache,
  writeDailyCache,
  takeSnapshot,
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

export const LLM_STORE_FILE = path.join(DATA_DIR, 'llm-cache.json');
export const EVENTS_DIR = path.join(DATA_DIR, 'events');
export const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshots.jsonl');
// 快照节流：15 秒刷一次全量落盘会让文件半年就上 GB
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
