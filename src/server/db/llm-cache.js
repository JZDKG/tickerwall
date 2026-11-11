/* ================================================================== *
 * Phase 1 / P1-T1：LLM 标题分类缓存（llm_headline_cache 表）
 *
 * 单独成层，不寄生在 quotes-storage.js：事件服务只需要这两个函数，
 * 直接 import 整个存储层会把 ring、registerFlushHook、provider 播种链路
 * 一起拉进事件服务的依赖图（测试里的 db 层 mock 会被撑破）。
 *
 * 原来整份 Map 写成一个 kv 值，每批分类都要重写全部条目；现在一个
 * hash 一行，内容没变的条目不碰 updated_at。
 * ================================================================== */

import { getDb } from './sqlite.js';

/** 逐条 upsert：只有内容变了的 hash 才更新 updated_at */
export function saveLlmCache(entries, at = Date.now()) {
  const db = getDb();
  const select = db.prepare('SELECT payload_json FROM llm_headline_cache WHERE hash = ?');
  const upsert = db.prepare(
    `INSERT INTO llm_headline_cache (hash, payload_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(hash) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
  );
  let written = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [hash, payload] of Object.entries(entries ?? {})) {
      const json = JSON.stringify(payload);
      if (select.get(hash)?.payload_json === json) continue;
      upsert.run(hash, json, Math.trunc(at));
      written += 1;
    }
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* 已回滚 */
    }
    throw err;
  }
  return written;
}

/** 读回 LLM 分类缓存；坏 JSON 行跳过，不拖垮整份缓存 */
export function loadLlmCache() {
  const out = {};
  for (const row of getDb().prepare('SELECT hash, payload_json FROM llm_headline_cache').all()) {
    try {
      out[row.hash] = JSON.parse(row.payload_json);
    } catch {
      /* 跳过坏行 */
    }
  }
  return out;
}
