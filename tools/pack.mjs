#!/usr/bin/env node
/* ================================================================== *
 * pack —— 发布包（方案 E03）
 *
 * 目标不是「打一个 tar」，而是让**解压到全新目录就能跑**这件事可验证。
 * 所以这里三件事一起做：
 *   1. 按**白名单**收集文件（不是黑名单排除）：漏了谁，来得及在冒烟阶段发现；
 *   2. 记录每个文件的 sha256 与大小，写进 `PACK_MANIFEST.json`；
 *   3. 冒烟：把包解到临时目录，用 `DISABLE_BACKGROUND=1` 起真进程，
 *      请求 `/` 与 `/api/health`，两项都通过才算成功。
 *
 *   node tools/pack.mjs              # 打包 + 冒烟
 *   node tools/pack.mjs --no-smoke   # 只打包
 *   node tools/pack.mjs --out DIR    # 指定输出目录（默认 dist-pack/）
 *
 * 退出码：0 通过；1 打包或冒烟失败。
 * 说明：运行期只依赖 ajv / ajv-formats，所以 node_modules 只带这两棵子树；
 *       数据目录由进程自己创建（包内不放 data/）。
 * ================================================================== */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const OUT = (() => {
  const i = argv.indexOf('--out');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : 'dist-pack';
})();
const SMOKE = !argv.includes('--no-smoke');

/** 白名单：只有这些路径进包。新增运行期文件必须加在这里。 */
const INCLUDE = [
  'server.mjs',
  'package.json',
  'package-lock.json',
  'config.example.json',
  '.nvmrc',
  'src',
  'public',
  'Dockerfile',
  'README.md',
];
/** 运行期依赖（dependencies 里的直接依赖 + 它们的传递依赖由 npm ci 负责） */
const RUNTIME_DEPS = ['ajv', 'ajv-formats', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string'];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const walk = (dir, base = dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, base));
    else out.push({ path: relative(base, full), size: st.size, sha256: sha(readFileSync(full)) });
  }
  return out;
};

/** 递归收集一个目录下的普通文件；符号链接一律跳过（自链会让 walk 打转） */
function collectDir(base, prefix) {
  const out = [];
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { stack.push(full); continue; }
      out.push({ path: join(prefix, relative(base, full)), size: st.size, sha256: sha(readFileSync(full)) });
    }
  }
  return out;
}

function collect() {
  const files = [];
  for (const item of INCLUDE) {
    const full = join(ROOT, item);
    if (!existsSync(full)) continue;
    const st = lstatSync(full);
    if (st.isDirectory()) files.push(...collectDir(full, item));
    else files.push({ path: item, size: st.size, sha256: sha(readFileSync(full)) });
  }
  for (const dep of RUNTIME_DEPS) {
    // 符号链接指向别处时 walk 会跟进去（ajv-formats/node_modules/ajv-formats 就是自链）：
    // 用 lstat 判目录，遇到链接直接跳过，真正的文件由它指向的那个包负责
    const base = join(ROOT, 'node_modules', dep);
    if (!existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = lstatSync(full);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) { stack.push(full); continue; }
        files.push({
          path: relative(ROOT, full),
          size: st.size,
          sha256: sha(readFileSync(full)),
        });
      }
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return files;
}

async function smoke(dir) {
  const port = 18000 + Math.floor(Math.random() * 500);
  const child = execFileSync(
    process.execPath,
    ['-e', `
      process.env.DISABLE_BACKGROUND = '1';
      process.env.PORT = '${port}';
      process.env.KANBAN_DATA_DIR = ${JSON.stringify(join(dir, 'data-smoke'))};
      await import(${JSON.stringify(join(dir, 'server.mjs'))});
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let ok = false;
      for (let i = 0; i < 40; i += 1) {
        await sleep(250);
        try {
          const r = await fetch('http://127.0.0.1:${port}/api/health');
          if (r.ok) { ok = true; break; }
        } catch {}
      }
      if (!ok) { console.error('SMOKE_FAIL health'); process.exit(1); }
      const home = await fetch('http://127.0.0.1:${port}/');
      if (!home.ok) { console.error('SMOKE_FAIL home ' + home.status); process.exit(1); }
      const css = await fetch('http://127.0.0.1:${port}/app.css');
      if (!css.ok) { console.error('SMOKE_FAIL css ' + css.status); process.exit(1); }
      console.log('SMOKE_OK');
      process.exit(0);
    `],
    { cwd: dir, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return child.includes('SMOKE_OK');
}

const files = collect();
if (!files.length) {
  console.error('打包失败：白名单收集到 0 个文件');
  process.exit(1);
}

mkdirSync(join(ROOT, OUT), { recursive: true });
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const stage = mkdtempSync(join(tmpdir(), 'kanban-pack-'));
const pkgRoot = join(stage, `kanban-${stamp}`);
for (const f of files) {
  const dest = join(pkgRoot, f.path);
  mkdirSync(join(dest, '..'), { recursive: true });
  cpSync(join(ROOT, f.path), dest);
}
writeFileSync(
  join(pkgRoot, 'PACK_MANIFEST.json'),
  `${JSON.stringify({ createdAt: new Date().toISOString(), files: files.length, bytes: files.reduce((s, f) => s + f.size, 0), list: files }, null, 2)}\n`,
);

const tarball = join(ROOT, OUT, `kanban-${stamp}.tgz`);
rmSync(tarball, { force: true });
execFileSync('tar', ['-czf', tarball, '-C', stage, `kanban-${stamp}`]);
const bytes = statSync(tarball).size;
console.log(`打包完成：${relative(ROOT, tarball)}（${files.length} 个文件，${(bytes / 1024).toFixed(1)} KB）`);
rmSync(stage, { recursive: true, force: true });

if (!SMOKE) process.exit(0);

// 冒烟：解压到全新目录再起进程
const fresh = mkdtempSync(join(tmpdir(), 'kanban-smoke-'));
execFileSync('tar', ['-xzf', tarball, '-C', fresh]);
const ok = await smoke(join(fresh, `kanban-${stamp}`));
rmSync(fresh, { recursive: true, force: true });
if (!ok) {
  console.error('冒烟失败：解压到新目录后启动或首页/健康检查未通过');
  process.exit(1);
}
console.log('冒烟通过：解压到新目录 → /api/health + / + /app.css 均 200');
