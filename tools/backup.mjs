#!/usr/bin/env node
/* ================================================================== *
 * backup —— 维护窗口内的整套状态备份（方案 E05 / §9.2）
 *
 * 实现在 src/server/db/maintenance.js（要能复用停写 / 排空 / VACUUM INTO），
 * 这里只负责参数、目录命名与保留策略。
 *
 *   node tools/backup.mjs [--out DIR] [--keep N]
 *
 * 退出码：0 成功；1 失败（失败也会恢复写入状态）。
 * ================================================================== */

import { readdirSync, rmSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};

const outRoot = path.resolve(argOf('--out', path.join(ROOT, 'backups')));
const keep = Number(argOf('--keep', '5'));
const dataDir = process.env.KANBAN_DATA_DIR ? path.resolve(process.env.KANBAN_DATA_DIR) : path.join(ROOT, 'data');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

try {
  const { createBackup } = await import('../src/server/db/maintenance.js');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const { dir, manifest } = await createBackup(path.join(outRoot, stamp), {
    dataDir,
    keep,
    appVersion: pkg.version,
  });

  // 保留策略：按目录名（时间戳）排序，只留最近 keep 份
  let removed = [];
  if (keep > 0) {
    const all = readdirSync(outRoot)
      .filter((n) => statSync(path.join(outRoot, n)).isDirectory())
      .sort();
    removed = all.slice(0, Math.max(0, all.length - keep));
    for (const name of removed) rmSync(path.join(outRoot, name), { recursive: true, force: true });
  }

  console.log(`✓ 备份完成：${dir}`);
  console.log(
    `  应用 ${manifest.appVersion} · schema v${manifest.schemaVersion} · ${manifest.files.length} 个文件 / ${(manifest.totalBytes / 1024).toFixed(1)} KB`,
  );
  console.log(`  排空钩子 ${manifest.flushed.hooks} 个${manifest.flushed.hookErrors.length ? `（${manifest.flushed.hookErrors.length} 个报错）` : ''}`);
  if (removed.length) console.log(`  按保留策略删除旧备份：${removed.join(', ')}`);
} catch (err) {
  console.error(`✗ 备份失败：${err?.message ?? err}`);
  process.exit(1);
}
