#!/usr/bin/env node
/* ================================================================== *
 * prepare-tauri-dist —— 为 Tauri v2 生产构建组装自包含静态目录
 *
 * 背景：开发与自托管模式下，server.mjs 同时服务 `public/`（根路径）与
 * `src/client/`（/src/client/*），`public/app.js` 通过 `./../src/client/main.js`
 * 引入入口模块。若 Tauri 的 `frontendDist` 直接指向 `../public`，生产包
 * 会缺少 `src/client/*` 并在 `..` 上越出静态根。
 *
 * 本脚本将 `public/` 与 `src/client/` 合入 `dist-desktop/`，并将
 * `dist-desktop/app.js` 改写为包内相对路径 `./src/client/main.js`。
 * ================================================================== */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function prepareTauriDist({
  rootDir = DEFAULT_ROOT,
  outDir = path.join(DEFAULT_ROOT, 'dist-desktop'),
} = {}) {
  const publicDir = path.join(rootDir, 'public');
  const clientDir = path.join(rootDir, 'src', 'client');

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(publicDir, outDir, { recursive: true });
  cpSync(clientDir, path.join(outDir, 'src', 'client'), { recursive: true });

  const appJsPath = path.join(outDir, 'app.js');
  const appJs = readFileSync(appJsPath, 'utf8');
  const rewritten = appJs.replace(/['"]\.\/\.\.\/src\/client\/main\.js['"]/, "'./src/client/main.js'");
  if (rewritten === appJs) {
    throw new Error('dist-desktop/app.js 入口路径未能改写，请检查 public/app.js');
  }
  writeFileSync(appJsPath, rewritten, 'utf8');

  const required = [
    'index.html',
    'app.js',
    'src/client/main.js',
    'vendor/macro-flow.js',
    'vendor/geo-kit.js',
    'vendor/ui-kit.js',
  ];
  for (const rel of required) {
    if (!existsSync(path.join(outDir, rel))) {
      throw new Error(`Tauri dist 缺少关键文件：${rel}`);
    }
  }
  return { outDir, required };
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  const res = prepareTauriDist();
  console.log(`Tauri frontendDist ready: ${path.relative(DEFAULT_ROOT, res.outDir)} (${res.required.length} entries verified)`);
}
