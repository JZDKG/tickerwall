#!/usr/bin/env node
/* ================================================================== *
 * 一次性维护脚本：清理内容完全相同的重复事件修订
 *
 * 背景：早期写入路径只靠进程内缓存判断「内容有没有变」，进程重启后会给
 * 所有事件追加一版重复内容。写入侧已修（改为读库里最新一版的 contentHash），
 * 这个脚本用来收拾已经产生的脏数据。
 *
 * 只删「与前一条 contentHash 完全相同」的记录，保留最早那条；
 * 任何内容真的变过的版本都不会被删。没有 contentHash 的旧记录不动。
 *
 * 用法：node scripts/dedupe-event-revisions.mjs [--dry-run]
 * ================================================================== */

import { openDatabase, pruneDuplicateEventRevisions, closeDb } from '../src/server/db/index.js';

const dryRun = process.argv.includes('--dry-run');
const dbFile = process.env.KANBAN_DB || 'data/kanban.db';

openDatabase(dbFile);
const before = (await import('../src/server/db/index.js')).explanationStorageStatus();

if (dryRun) {
  // 干跑：只统计会被删多少，不写库
  const rows = (await import('../src/server/db/index.js'));
  const db = openDatabase(dbFile);
  const all = db.prepare('SELECT event_id, revision, payload FROM event_revisions ORDER BY event_id, revision').all();
  const lastHash = new Map();
  let removable = 0;
  for (const r of all) {
    let hash = null;
    try {
      hash = JSON.parse(r.payload)?.contentHash ?? null;
    } catch {
      hash = null;
    }
    const prev = lastHash.get(r.event_id);
    if (hash && prev && hash === prev) removable += 1;
    else if (hash) lastHash.set(r.event_id, hash);
  }
  console.log(`[dry-run] 库：${dbFile}`);
  console.log(`[dry-run] 可删除的重复修订：${removable} 条（未改动）`);
} else {
  const { removed, events } = pruneDuplicateEventRevisions();
  console.log(`库：${dbFile}`);
  console.log(`删除重复修订：${removed} 条，涉及 ${events} 个事件`);
  console.log(`存储状态：${JSON.stringify(before)}`);
}

closeDb();
