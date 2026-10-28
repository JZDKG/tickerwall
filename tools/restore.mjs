#!/usr/bin/env node
/* ================================================================== *
 * restore —— 把备份恢复到新目录并验证（方案 E05 / §9.2）
 *
 *   node tools/restore.mjs <备份目录> [--target DIR] [--force]
 *
 * 行为：
 *   · 先校验清单与每个文件的 sha256，缺一个就停；
 *   · 默认恢复到新目录，**拒绝就地覆盖**（--force 才允许到当前 data/）；
 *   · 在恢复出的库上跑 integrity_check + foreign_key_check，不过就明确失败；
 *   · 打印「下一步」（用隔离端口验证、切换方式），不替用户改任何配置。
 *
 * 退出码：0 成功；1 失败。
 * ================================================================== */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flag = (name) => args.includes(name);

const src = positional[0];
if (!src || !existsSync(src)) {
  console.error('用法：node tools/restore.mjs <备份目录> [--target DIR] [--force]');
  process.exit(1);
}
const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : path.join(ROOT, 'data-restored');

try {
  const { restoreTo, verifyBackup } = await import('../src/server/db/maintenance.js');

  // 先只校验，不复制：坏备份不该在磁盘上留下半套文件
  const verified = verifyBackup(path.resolve(src));
  if (!verified.ok) {
    console.error('✗ 备份校验未通过：');
    for (const e of verified.errors) console.error(`  · ${e}`);
    process.exit(1);
  }
  console.log(`✓ 备份校验通过：${verified.manifest.files.length} 个文件 · 生成于 ${verified.manifest.createdAt}`);

  const result = restoreTo(path.resolve(src), { targetDir: target, force: flag('--force') });
  if (!result.ok) {
    console.error('✗ 恢复失败：');
    for (const e of result.errors ?? []) console.error(`  · ${e}`);
    process.exit(1);
  }

  console.log(`✓ 已恢复到 ${result.targetDir}`);
  console.log(`  数据库完整性：${result.integrity.integrity.join(', ')} · 外键违规 ${result.integrity.foreignKeyViolations} 条`);
  console.log('');
  console.log('下一步（不会自动替你执行）：');
  console.log(`  1. 用隔离端口验证：KANBAN_DATA_DIR=${result.targetDir} PORT=8790 node server.mjs`);
  console.log('  2. 确认页面正常后，停掉原服务、把原 data/ 改名留档，再把恢复目录改成 data/');
  console.log('  3. 备份时间点之后的写入不会存在 —— 这一点在切换前要确认清楚');
} catch (err) {
  console.error(`✗ 恢复失败：${err?.message ?? err}`);
  process.exit(1);
}
