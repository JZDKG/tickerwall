/* ================================================================== *
 * Phase 2 / P2-T1：TypeScript 配置与现代前端依赖的工具链契约
 *
 * 这些约束不会让页面报错，只会让「明明引入了 React 19 却没入库」、
 * 「typecheck 脚本没接上」这类问题静默溜过去 —— 静态钉住。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const html = readFileSync('public/index.html', 'utf8');
const vite = readFileSync('vite.config.js', 'utf8');

const NEW_DEPS = [
  'typescript', 'react', 'react-dom', '@types/react', '@types/react-dom',
  'zustand', '@tanstack/react-query', 'lightweight-charts',
];

describe('package.json：依赖与脚本', () => {
  it('typecheck 脚本为 tsc --noEmit', () => {
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
  });

  it('八个新依赖都在 devDependencies（运行时不需要 node_modules）', () => {
    for (const dep of NEW_DEPS) {
      expect(pkg.devDependencies, `缺 ${dep}`).toHaveProperty(dep);
      expect(pkg.dependencies ?? {}, `${dep} 不该进运行时依赖`).not.toHaveProperty(dep);
    }
  });

  it('React 19 大版本', () => {
    expect(pkg.devDependencies.react).toMatch(/^\^?19\./);
    expect(pkg.devDependencies['react-dom']).toMatch(/^\^?19\./);
  });
});

describe('tsconfig.json', () => {
  const ts = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  const opts = ts.compilerOptions ?? {};

  it('按规格开启五档编译选项', () => {
    expect(opts.allowJs).toBe(true);
    expect(opts.checkJs).toBe(false);
    expect(opts.strict).toBe(true);
    expect(opts.jsx).toBe('react-jsx');
    expect(opts.noEmit).toBe(true);
  });

  it('覆盖 src 下的 js/ts/tsx，且排除受管产物与 node_modules', () => {
    expect(ts.include.join('\n')).toContain('src/**/*');
    expect(JSON.stringify(ts.exclude ?? [])).toContain('node_modules');
  });
});

describe('ui-kit 受管产物', () => {
  it('vite.config.js 有 ui-kit 打包入口', () => {
    expect(vite).toContain("'ui-kit'");
    expect(vite).toContain("src/client/vendor/ui-kit.js");
  });

  it('index.html 的 import map 声明 ui-kit', () => {
    const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
    expect(m).toBeTruthy();
    expect(JSON.parse(m[1]).imports['ui-kit']).toBe('/vendor/ui-kit.js');
  });

  it('源码入口导出 zustand / query / charts / react 能力', () => {
    const entry = readFileSync('src/client/vendor/ui-kit.js', 'utf8');
    for (const name of ['createStore', 'QueryClient', 'useQuery', 'createChart', 'createElement', 'createRoot']) {
      expect(entry, `ui-kit 没导出 ${name}`).toContain(name);
    }
  });

  it('public/vendor/ui-kit.js 已构建入库（零安装直接打开）', () => {
    expect(existsSync('public/vendor/ui-kit.js')).toBe(true);
  });
});

describe('doctor 的静态入口检查', () => {
  it('三个 vendor 产物都在必查清单里', () => {
    const doctor = readFileSync('tools/doctor.mjs', 'utf8');
    for (const f of ['macro-flow.js', 'geo-kit.js', 'ui-kit.js']) {
      expect(doctor).toContain(f);
    }
  });
});
