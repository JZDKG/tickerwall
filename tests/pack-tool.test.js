/* ================================================================== *
 * 发布包（E03）：解压到全新目录必须能起来
 *
 * 这条不是「命令退出码 0」的检查，而是三件可验证的事实：
 *   1. 包里带齐了运行期文件（白名单，不是黑名单排除）；
 *   2. 解压到**全新目录**后真的能起进程；
 *   3. /api/health、/、/app.css 三个入口都能 200。
 *
 * 打包 + 冒烟要起进程，耗时较长，所以默认跳过；
 * 用 PACK_SMOKE=1 显式开启（CI 里跑）。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const RUN = process.env.PACK_SMOKE === '1';

describe.skipIf(!RUN)('发布包冒烟', () => {
  it('打包并在新目录启动通过', () => {
    const out = execFileSync(process.execPath, ['tools/pack.mjs', '--out', 'dist-pack-test'], {
      encoding: 'utf8',
      timeout: 180_000,
    });
    expect(out).toContain('冒烟通过');
    expect(existsSync('dist-pack-test')).toBe(true);
  }, 200_000);
});

describe('打包清单自洽（不需要起进程）', () => {
  it('白名单里的运行期文件都在仓库里', () => {
    const src = readFileSync('tools/pack.mjs', 'utf8');
    for (const must of ['server.mjs', 'package.json', 'src', 'public']) {
      expect(src).toContain(`'${must}'`);
      expect(existsSync(must)).toBe(true);
    }
  });

  it('记录两次踩到的坑：符号链接与目录前缀', () => {
    const src = readFileSync('tools/pack.mjs', 'utf8');
    // 依赖树里有自链（ajv-formats/node_modules/ajv-formats），必须跳过
    expect(src).toContain('isSymbolicLink');
    // 目录项不能再用「相对 ROOT 的路径」再拼一次前缀（会得到 public/public/x）
    expect(src).toContain('collectDir');
  });
});
