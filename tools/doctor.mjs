#!/usr/bin/env node
/* ================================================================== *
 * doctor —— 启动前的环境预检（方案 E01 / §5.1）
 *
 * 目标：把「本机能跑」和「按 README 装了就能跑」之间那层隐含状态查出来。
 * 只报告**可操作**的错误，不自动改全局 Node，不打印任何密钥。
 *
 *   node tools/doctor.mjs          # 人读
 *   node tools/doctor.mjs --json   # 机器读（CI / 启动脚本）
 *
 * 退出码：0 全过；1 有 error；2 只有 warn（仍可启动）。
 * 检查项：
 *   1. Node / npm 版本与 .nvmrc、package.json engines 一致
 *   2. node:sqlite 可用（22.5 引入，24 起是验证基线）
 *   3. 端口、TTL、并发这类数值配置在合法区间
 *   4. 数据目录可写、SQLite 能落盘（在临时目录里试，不碰真实库）
 *   5. 静态入口与所需 vendor 产物存在
 *   6. 服务端没有 node_modules 依赖也能起（dependencies 为空时的断言）
 * ================================================================== */

import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonMode = process.argv.includes('--json');

/** @type {{level:'ok'|'warn'|'error', id:string, message:string, fix?:string}[]} */
const results = [];
const add = (level, id, message, fix) => results.push({ level, id, message, ...(fix ? { fix } : {}) });

function readJson(file) {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
  } catch {
    return null;
  }
}

/* ---------- 1. 版本契约 ---------- */

function checkVersions() {
  const pkg = readJson('package.json');
  const pin = (() => {
    try {
      return readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim();
    } catch {
      return '';
    }
  })();
  const want = String(pkg?.engines?.node ?? '').replace(/^[>=^~]+/, '');
  const major = Number(process.versions.node.split('.')[0]);

  if (!pin) add('warn', 'node.nvmrc', '缺少 .nvmrc，开发机与 CI 可能不是同一版本', '写入 .nvmrc（推荐 24.21.0）');
  else if (want && !pin.startsWith(want.split('.')[0])) {
    add('error', 'node.nvmrc', `.nvmrc（${pin}）与 engines（${pkg?.engines?.node}）不一致`, '让两者指向同一个大版本');
  } else add('ok', 'node.nvmrc', `.nvmrc ${pin} 与 engines ${pkg?.engines?.node} 一致`);

  if (!want) add('error', 'node.engines', 'package.json 没有 engines.node', '声明 >=24.0.0');
  else if (major < Number(want.split('.')[0])) {
    add('error', 'node.version', `当前 Node ${process.versions.node}，要求 >= ${want}`, `nvm install ${pin || want}`);
  } else add('ok', 'node.version', `Node ${process.versions.node}（满足 >= ${want}）`);
}

/* ---------- 2. node:sqlite ---------- */

async function checkSqlite() {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (v INTEGER)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run(42);
    const row = db.prepare('SELECT v FROM t').get();
    db.close();
    if (row?.v !== 42) throw new Error('读写不一致');
    add('ok', 'node.sqlite', 'node:sqlite 可用（建表 / 写入 / 读回一致）');
  } catch (err) {
    add('error', 'node.sqlite', `node:sqlite 不可用：${err?.message ?? err}`, '升级到 Node 24 或换用带 SQLite 的发行版');
  }
}

/* ---------- 3. 数值配置区间 ---------- */

function checkConfig() {
  const pkg = readJson('package.json');
  const env = process.env;
  const num = (name, def, min, max) => {
    const raw = env[name];
    if (raw == null || raw === '') return { value: def, id: name };
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      add('error', `config.${name}`, `${name}="${raw}" 不是数字`, `设置成 ${min}..${max} 之间的整数`);
      return { value: def, id: name };
    }
    if (v < min || v > max) {
      add('error', `config.${name}`, `${name}=${v} 超出允许范围 ${min}..${max}`, `改成范围内的值`);
      return { value: def, id: name };
    }
    add('ok', `config.${name}`, `${name}=${v}`);
    return { value: v, id: name };
  };

  const port = num('PORT', 8787, 1, 65535);
  num('HOST', 0, 0, 0); // 占位：HOST 是字符串，单独校验
  if (env.HOST && !/^[0-9a-zA-Z.:\-[\]]+$/.test(env.HOST)) {
    add('error', 'config.HOST', `HOST="${env.HOST}" 不像合法主机名`, '用 127.0.0.1 或 0.0.0.0');
  }
  num('QUOTES_TTL_MS', 15_000, 1_000, 3_600_000);
  num('EVENTS_TTL_MS', 60_000, 5_000, 86_400_000);

  if (port.value && pkg) add('ok', 'config.port', `将监听 ${env.HOST || '127.0.0.1'}:${port.value}`);
}

/* ---------- 4. 数据目录可写（用临时目录试，不碰真实库） ---------- */

async function checkDataDir() {
  const dir = process.env.KANBAN_DATA_DIR || path.join(ROOT, 'data');
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch (err) {
    add('error', 'data.dir', `数据目录不可写：${dir}（${err?.code ?? err}）`, '检查权限或设置 KANBAN_DATA_DIR');
    return;
  }

  const probe = mkdtempSync(path.join(tmpdir(), 'kanban-doctor-'));
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(probe, 'probe.db'));
    db.exec('CREATE TABLE probe (v TEXT); PRAGMA journal_mode=WAL;');
    db.close();
    writeFileSync(path.join(probe, 'note.txt'), 'ok');
    add('ok', 'data.dir', `数据目录可写：${dir}`);
  } catch (err) {
    add('error', 'data.dir.probe', `SQLite 落盘失败：${err?.message ?? err}`, '检查磁盘空间与临时目录权限');
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

/* ---------- 5. 静态入口与 vendor 产物 ---------- */

function checkStatic() {
  const need = [
    'public/index.html',
    'public/app.js',
    'src/client/main.js',
    'public/vendor/macro-flow.js',
    'public/vendor/geo-kit.js',
  ];
  const missing = need.filter((f) => !existsSync(path.join(ROOT, f)));
  if (missing.length) {
    add('error', 'static.files', `缺少静态文件：${missing.join('、')}`, 'npm run build（vendor 产物）或恢复仓库文件');
  } else {
    add('ok', 'static.files', `静态入口与 ${need.length - 3} 个 vendor 产物齐全`);
  }
}

/* ---------- 6. 运行时依赖 ---------- */

function checkRuntimeDeps() {
  const pkg = readJson('package.json');
  const deps = Object.keys(pkg?.dependencies ?? {});
  const hasNodeModules = existsSync(path.join(ROOT, 'node_modules'));
  if (!deps.length) {
    add('ok', 'deps.runtime', '没有运行时依赖，启动不需要 node_modules');
    return;
  }
  if (!hasNodeModules) {
    add('error', 'deps.runtime', `package.json 声明了运行时依赖（${deps.join('、')}）但 node_modules 不存在`, 'npm ci --omit=dev');
  } else add('ok', 'deps.runtime', `运行时依赖 ${deps.length} 个，node_modules 已就绪`);
}

/* ---------- 输出 ---------- */

await checkVersions();
await checkSqlite();
checkConfig();
await checkDataDir();
checkStatic();
checkRuntimeDeps();

const errors = results.filter((r) => r.level === 'error');
const warns = results.filter((r) => r.level === 'warn');

if (jsonMode) {
  process.stdout.write(
    `${JSON.stringify({ ok: errors.length === 0, node: process.versions.node, results }, null, 2)}\n`,
  );
} else {
  const mark = { ok: '✓', warn: '!', error: '✗' };
  for (const r of results) console.log(`${mark[r.level]} [${r.id}] ${r.message}${r.fix ? `\n    → ${r.fix}` : ''}`);
  console.log(
    `\n${errors.length ? '✗' : warns.length ? '!' : '✓'} ${results.length - errors.length - warns.length} ok / ${warns.length} warn / ${errors.length} error`,
  );
}

process.exit(errors.length ? 1 : warns.length ? 2 : 0);
