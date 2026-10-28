/* ================================================================== *
 * 分时走势的存储层
 *
 * 从 services/quotes.service.js 拆出来（那边 1503 行混了六种职责）。
 * 这里只管「走势点怎么存、怎么落盘、怎么恢复」，不管报价从哪个源来。
 *
 * 为什么独立成层：`ring` 是被四处共享的单例状态 ——
 *   resolveInstrument   写（pushHistory）
 *   scheduleHistorySave 读（ring.entries → 落盘）
 *   seedPoints/seedHistory 填（补日内缺口）
 *   loadPersistedHistory 恢复（启动时回灌）
 * 把它们收在一个模块里，这份状态才有明确的归属；散在服务层里时，
 * 「谁在什么时候改它」要靠翻 700 行才知道。
 *
 * 结构与两条写入护栏都在 domain/history-ring.js，这里只持唯一实例。
 * ================================================================== */

import path from 'node:path';
import fsp from 'node:fs/promises';

import { createHistoryRing } from '../domain/history-ring.js';
import { fetchRaw, toNum } from '../providers/index.js';
import { INSTRUMENTS } from '../providers/instruments.js';
import { getDb, readJson, writeHistoryFile, writeDailyCache } from './index.js';
import { DATA_DIR } from '../paths.js';

/** 每个标的保留的分时点数上限（240 点 × 5 分钟 ≈ 一个交易日） */
export const HISTORY_LIMIT = 240;

export const ring = createHistoryRing({ limit: HISTORY_LIMIT });

/** 兼容层：保留原函数名与签名，调用点一行未改 */
export function pushHistory(id, price, t = Date.now(), decimals = 2, meta = {}) {
  return ring.push(id, price, t, decimals, meta);
}

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

export const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
// 日线落盘缓存：源全挂时详情页直接读盘，不再白屏
export const DAILY_CACHE_DIR = path.join(DATA_DIR, 'daily');
// SQLite 单文件库（node:sqlite 是 Node 内置模块，不需要额外驱动）

// getDb() 已下沉到 src/server/db/sqlite.js

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

export let saveTimer = null;

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

export const LLM_STORE_FILE = path.join(DATA_DIR, 'llm-cache.json');
export const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshots.jsonl');
// 快照节流：15 秒刷一次全量落盘会让文件半年就上 GB

/**
 * 仅供测试：清掉落盘定时器。
 *
 * 单独抽出来是因为它和 `lastSnapshotAt` 不在一层：saveTimer 归存储层，
 * 快照节流归聚合层。服务层的 __resetRuntimeStateForTests 委托这里 + 自己清。
 */
export function resetStorageTimerForTests() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
