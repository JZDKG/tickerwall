#!/usr/bin/env node
/* ================================================================== *
 * verify-build —— 受管产物的可重复构建校验（方案 E03 / §5.2）
 *
 * 校验的不是「命令退出码 0」，而是三件可验证的事实：
 *   1. 从**独立空临时目录**构建，产物**文件集合**与 `public/vendor/` 一致
 *      （漏提交、旧文件残留、多出的 chunk 都要报出来）；
 *   2. 每个文件的 **sha256 摘要**一致（源码或工具链变了没重新构建，会在这里断）；
 *   3. 同一提交在**两个不同临时路径**各构建一次，摘要相同（排除路径泄漏进产物）。
 *
 *   node tools/verify-build.mjs
 *
 * 退出码：0 通过；1 不一致（打印差异）。
 * 说明：模拟仓库里 `public/vendor/` 是受管产物；构建只用 devDependencies。
 * ================================================================== */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANAGED = path.join(ROOT, 'public', 'vendor');

/** 构建产物的文件集合（递归，返回相对路径） */
function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** 在给定目录里跑一次构建 */
function buildInto(dir) {
  execFileSync(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'],
    { cwd: ROOT, stdio: 'pipe' },
  );
}

const problems = [];
const wipes = [];
const tmpA = mkdtempSync(path.join(tmpdir(), 'verify-build-a-'));
const tmpB = mkdtempSync(path.join(tmpdir(), 'verify-build-b-'));

try {
  if (!existsSync(MANAGED)) {
    problems.push(`受管产物目录不存在：public/vendor（先跑 npm run build）`);
  }

  for (const [label, dir] of [
    ['A', tmpA],
    ['B', tmpB],
  ]) {
    try {
      buildInto(dir);
      wipes.push(label);
    } catch (err) {
      problems.push(`构建 ${label} 失败：${String(err?.stderr ?? err?.message ?? err).slice(0, 400)}`);
    }
  }

  if (wipes.length === 2) {
    const filesA = listFiles(tmpA);
    const filesB = listFiles(tmpB);
    const filesM = listFiles(MANAGED);

    // 1) 两次构建的文件集合必须相同
    const setA = new Set(filesA);
    const setB = new Set(filesB);
    const onlyA = filesA.filter((f) => !setB.has(f));
    const onlyB = filesB.filter((f) => !setA.has(f));
    if (onlyA.length || onlyB.length) {
      problems.push(`两次构建的文件集合不同：只在 A=${onlyA.join(',') || '-'}；只在 B=${onlyB.join(',') || '-'}`);
    }

    // 2) 两次构建的摘要必须相同（路径不能泄漏进产物）
    for (const f of filesA) {
      if (!setB.has(f)) continue;
      const ha = sha(path.join(tmpA, f));
      const hb = sha(path.join(tmpB, f));
      if (ha !== hb) problems.push(`${f} 在不同临时路径下摘要不同（${ha.slice(0, 12)} ≠ ${hb.slice(0, 12)}）：产物可能内嵌了绝对路径`);
    }

    // 3) 与受管产物比对：集合 + 摘要
    const setM = new Set(filesM);
    const missing = filesA.filter((f) => !setM.has(f));
    const stale = filesM.filter((f) => !setA.has(f));
    if (missing.length) problems.push(`public/vendor 缺少构建产物：${missing.join(',')}（漏提交或忘了 npm run build）`);
    if (stale.length) problems.push(`public/vendor 有构建不再产出的文件：${stale.join(',')}（旧产物残留）`);
    for (const f of filesA) {
      if (!setM.has(f)) continue;
      const hb = sha(path.join(tmpB, f));
      const hm = sha(path.join(MANAGED, f));
      if (hb !== hm) problems.push(`${f} 摘要不一致：构建 ${hb.slice(0, 12)} ≠ 入库 ${hm.slice(0, 12)}（改了源码没重新构建）`);
    }

    const totalBytes = filesA.reduce((n, f) => n + statSync(path.join(tmpA, f)).size, 0);
    console.log(`构建产物：${filesA.length} 个文件 / ${(totalBytes / 1024).toFixed(1)} KB`);
    for (const f of filesA) {
      const same = setM.has(f) && sha(path.join(tmpA, f)) === sha(path.join(MANAGED, f));
      console.log(`  ${same ? '✓' : '✗'} ${f}  ${sha(path.join(tmpA, f)).slice(0, 12)}`);
    }
  }
} finally {
  rmSync(tmpA, { recursive: true, force: true });
  rmSync(tmpB, { recursive: true, force: true });
}

if (problems.length) {
  console.error('\n✗ 构建校验未通过：');
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log('\n✓ 构建可重复：两次构建摘要一致，且与 public/vendor 完全一致');
