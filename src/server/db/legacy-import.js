/* ================================================================== *
 * 旧落盘数据导入（方案 E05 / §9.1）
 *
 * 背景：早期版本把日线、快照、LLM 缓存各自写在 data/ 下的 JSON / JSONL 里，
 * 后来迁到 SQLite。原来这段逻辑长在采集服务里，且用**一个** kv 标记表示
 * 「导入过了」—— 于是三种完全不同的状态在库里长得一模一样：
 *
 *   · 文件本来就不存在（首次运行，正常）
 *   · 文件坏了 / 解析失败（数据丢了，要知道）
 *   · 导进去一半就失败（最危险：标记已写，剩下的一半永远不会再导）
 *
 * 现在每次导入都按来源写一行台账（import_ledger）：
 *   status: ok | absent | partial | failed
 *   rows / checksum / error / attempted_at / finished_at
 * 重跑时只重试 ok 与 absent 之外的条目，且**全部成功才写总体完成标记**。
 *
 * 落盘目标仍是 SQLite；这里只管「怎么搬」，不关心采集。
 * ================================================================== */

import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { DATA_DIR } from '../paths.js';
import { getDb, kvGet, kvSet } from './sqlite.js';
import { writeDailyCache } from './daily-cache.js';

/** 台账里可能出现的外部文件（相对 data/ 或目录） */
export const LEGACY_SOURCES = {
  daily: { kind: 'dir', label: '日线缓存 data/daily/*.json' },
  snapshots: { kind: 'file', label: '快照 data/snapshots.jsonl' },
  'llm-cache': { kind: 'file', label: 'LLM 缓存 data/llm-cache.json' },
};

/** 总体完成标记（老版本用的 kv 键，新增台账后仍保留以便回滚） */
export const LEGACY_DONE_KEY = 'migrated-sqlite-v1';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * 目标内容的校验和。
 *
 * 目录要单独算：对目录 readFile 会直接 EISDIR，只记 null 就等于「不知道导的
 * 是哪一版数据」。这里把文件名（排序后）+ 各自摘要拼起来再哈希，等价于一份
 * 可复核的快照指纹。
 */
async function checksumOf(target) {
  try {
    const st = await fsp.stat(target);
    if (st.isDirectory()) {
      const names = (await fsp.readdir(target)).filter((n) => n.endsWith('.json')).sort();
      if (!names.length) return null;
      const parts = [];
      for (const name of names) {
        const buf = await fsp.readFile(path.join(target, name));
        parts.push(`${name}:${sha(buf)}`);
      }
      return sha(parts.join('\n'));
    }
    return sha(await fsp.readFile(target));
  } catch (err) {
    if (err?.code === 'ENOENT') return null; // 本来就没有这个来源
    return null;
  }
}

/** 写一条台账（同来源覆盖） */
export function recordImport(source, { status, rows = 0, checksum = null, error = null, finished = true }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO import_ledger (source, status, rows, checksum, error, attempted_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET
         status = excluded.status, rows = excluded.rows, checksum = excluded.checksum,
         error = excluded.error, attempted_at = excluded.attempted_at, finished_at = excluded.finished_at`,
    )
    .run(source, status, rows, checksum, error, now, finished ? now : null);
  return { source, status, rows, checksum, error, attemptedAt: now, finishedAt: finished ? now : null };
}

/** 读台账；没有表或没有记录时返回空数组 */
export function importLedger() {
  try {
    return getDb().prepare('SELECT * FROM import_ledger ORDER BY source ASC').all();
  } catch {
    return [];
  }
}

/** 还有没有未完成的导入（failed / 半途而废的 partial） */
export function pendingImports() {
  return importLedger().filter((r) => r.status === 'failed' || r.status === 'partial');
}

/* ------------------------------ 各来源的导入 ------------------------------ */

async function importDailyDir(dir) {
  let files;
  try {
    files = await fsp.readdir(dir);
  } catch (err) {
    if (err?.code === 'ENOENT') return { status: 'absent', rows: 0 };
    throw err;
  }
  const md = files.filter((f) => f.endsWith('.json'));
  if (!md.length) return { status: 'absent', rows: 0 };

  let rows = 0;
  let okFiles = 0;
  const bad = [];
  for (const f of md) {
    const full = path.join(dir, f);
    try {
      const raw = await fsp.readFile(full);
      const obj = JSON.parse(raw.toString('utf8'));
      if (!Array.isArray(obj?.rows) || obj.rows.length < 2 || !obj.id) {
        bad.push(`${f}: 结构不符`);
        continue;
      }
      await writeDailyCache(obj.id, obj.source, obj.rows);
      rows += obj.rows.length;
      okFiles += 1;
    } catch (err) {
      // 单个坏文件不抛整批失败，但要被记下来（后面据此判 partial）
      bad.push(`${f}: ${err?.message ?? err}`);
    }
  }
  if (!okFiles) return { status: 'failed', rows: 0, error: bad.slice(0, 3).join('; ') };
  if (bad.length) return { status: 'partial', rows, error: bad.slice(0, 3).join('; ') };
  return { status: 'ok', rows };
}

async function importSnapshotsFile(file) {
  let raw;
  try {
    raw = await fsp.readFile(file);
  } catch (err) {
    if (err?.code === 'ENOENT') return { status: 'absent', rows: 0 };
    throw err;
  }
  const db = getDb();
  const ins = db.prepare(
    'INSERT OR REPLACE INTO snapshots (at, id, name, price, change_pct) VALUES (?, ?, ?, ?, ?)',
  );
  let rows = 0;
  let halfLine = 0;
  db.exec('BEGIN');
  try {
    for (const line of raw.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        // 半截行（进程被杀时常见）不算错误，但要计数：整份都半截才算 failed
        halfLine += 1;
        continue;
      }
      if (!obj?.at || !Array.isArray(obj.quotes)) continue;
      for (const snap of obj.quotes) {
        if (!snap?.id || !(snap.price > 0)) continue;
        ins.run(obj.at, snap.id, snap.name ?? null, snap.price, snap.changePct ?? null);
        rows += 1;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  if (!rows) return { status: halfLine ? 'failed' : 'absent', rows: 0, error: halfLine ? `${halfLine} 行无法解析` : null };
  return { status: halfLine ? 'partial' : 'ok', rows, error: halfLine ? `${halfLine} 行无法解析` : null };
}

async function importLlmCache(file) {
  let raw;
  try {
    raw = await fsp.readFile(file);
  } catch (err) {
    if (err?.code === 'ENOENT') return { status: 'absent', rows: 0 };
    throw err;
  }
  let obj;
  try {
    obj = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    return { status: 'failed', rows: 0, error: `JSON 解析失败：${err?.message ?? err}` };
  }
  const n = obj && typeof obj === 'object' ? Object.keys(obj).length : 0;
  if (!n) return { status: 'absent', rows: 0 };
  getDb()
    .prepare(
      `INSERT INTO kv (k, v, at) VALUES ('llm-cache', ?, ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at`,
    )
    .run(JSON.stringify(obj), Date.now());
  return { status: 'ok', rows: n };
}

/**
 * 跑一次导入。
 *
 * @param {{ dataDir?: string, force?: boolean }} [opts]
 *        force=true 时忽略「已完成」标记，重跑全部来源（迁移/恢复演练用）
 * @returns {Promise<{skipped:boolean, results:object[], pending:object[]}>}
 */
export async function runLegacyImport({ dataDir = DATA_DIR, force = false } = {}) {
  const done = kvGet(LEGACY_DONE_KEY, null);
  const pending = pendingImports();
  // 老库（只有 kv 标记、没有台账）视作已完成；有新失败项则继续重试
  if (done && !force && !pending.length) {
    return { skipped: true, results: importLedger(), pending: [] };
  }

  const results = [];
  const dailyDir = path.join(dataDir, 'daily');
  const snapshotsFile = path.join(dataDir, 'snapshots.jsonl');
  const llmFile = path.join(dataDir, 'llm-cache.json');

  const tasks = [
    ['daily', dailyDir, () => importDailyDir(dailyDir)],
    ['snapshots', snapshotsFile, () => importSnapshotsFile(snapshotsFile)],
    ['llm-cache', llmFile, () => importLlmCache(llmFile)],
  ];

  for (const [source, file, run] of tasks) {
    // 已完成（ok / absent）的来源不重复导入，除非 force
    const prior = importLedger().find((r) => r.source === source);
    if (!force && prior && (prior.status === 'ok' || prior.status === 'absent')) {
      results.push(prior);
      continue;
    }
    const checksum = await checksumOf(file);
    try {
      const out = await run();
      results.push(recordImport(source, { ...out, checksum }));
    } catch (err) {
      results.push(recordImport(source, { status: 'failed', rows: 0, checksum, error: String(err?.message ?? err) }));
    }
  }

  const remaining = pendingImports();
  if (!remaining.length) {
    kvSet(LEGACY_DONE_KEY, JSON.stringify({ at: new Date().toISOString(), results: results.map((r) => ({ source: r.source, status: r.status, rows: r.rows })) }));
  }
  return { skipped: false, results, pending: remaining };
}
