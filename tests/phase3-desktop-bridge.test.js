// @vitest-environment jsdom
/* ================================================================== *
 * Phase 3 / P3-T1：Tauri v2 桌面壳 + 前端桌面桥接层
 *
 * 验收（规格书 §3.1）：
 *   · tauri.conf.json / Cargo.toml 结构完整合法；
 *   · isTauriRuntime 识别 __TAURI_INTERNALS__ / __TAURI__；
 *   · formatMenuBarTicker 用置顶自选（或默认三品种）生成紧凑菜单栏文本；
 *   · 每次报价更新同步 invoke('update_tray_ticker') 与 document.title；
 *   · togglePipMode 切 dataset.pip，Tauri 下调用 set_always_on_top。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareTauriDist } from '../tools/prepare-tauri-dist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const {
  isTauriRuntime,
  formatMenuBarTicker,
  MENU_BAR_FALLBACK_IDS,
  updateTrayTicker,
  togglePipMode,
  mountDesktopBridge,
  PIP_DATASET_KEY,
} = await import('../src/client/shared/desktop-bridge.js');

const QUOTES = [
  { id: 'gold-intl', name: '国际金', price: 2745.2, changePct: 0.82 },
  { id: 'btc', name: 'BTC', price: 91200, changePct: 2.1 },
  { id: 'sp500', name: '标普500', price: 5912.3, changePct: -0.31 },
  { id: 'oil', name: 'WTI原油', price: 71.4, changePct: 1.12 },
  { id: 'bad', name: '坏数据', price: null, changePct: null },
];

beforeEach(() => {
  document.documentElement.dataset.pip = '0';
  document.title = '市场看板';
  delete globalThis.window.__TAURI_INTERNALS__;
  delete globalThis.window.__TAURI__;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.window.__TAURI_INTERNALS__;
  delete globalThis.window.__TAURI__;
});

describe('Tauri v2 工程配置', () => {
  it('tauri.conf.json 含标识、主窗口与 pip 窗口配置', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(conf.identifier).toBe('com.tickerwall.desktop');
    expect(conf.productName).toBe('TickerWall');
    expect(conf.build.frontendDist).toBe('../dist-desktop');
    expect(conf.build.beforeBuildCommand).toBe('npm run build:desktop');
    expect(conf.build.devUrl).toBe('http://127.0.0.1:8787');
    const windows = conf.app.windows;
    const main = windows.find((w) => w.label === 'main');
    expect(main).toMatchObject({ width: 1440, height: 900 });
    const pip = windows.find((w) => w.label === 'pip');
    expect(pip).toMatchObject({ width: 420, height: 640, alwaysOnTop: true, decorations: false });
  });

  it('prepareTauriDist 产出含 public + src/client 且无越界 ../ 路径的自包含目录', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'tw-tauri-dist-'));
    try {
      const res = prepareTauriDist({ rootDir: ROOT, outDir });
      for (const rel of res.required) {
        expect(existsSync(path.join(outDir, rel))).toBe(true);
      }
      const appJs = readFileSync(path.join(outDir, 'app.js'), 'utf8');
      expect(appJs).toContain('./src/client/main.js');
      expect(appJs).not.toContain('../src/client');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('Cargo.toml 声明 tauri v2 与托盘/通知相关特性', () => {
    const cargo = read('src-tauri/Cargo.toml');
    expect(cargo).toMatch(/\[package\]/);
    expect(cargo).toMatch(/name\s*=\s*"tickerwall"/);
    expect(cargo).toMatch(/tauri\s*=\s*\{[^\n]*version\s*=\s*"2/);
    expect(cargo).toMatch(/tray-icon/);
  });

  it('main.rs / lib.rs 提供三个命令与全局快捷键', () => {
    const src = read('src-tauri/src/main.rs') + read('src-tauri/src/lib.rs');
    expect(src).toContain('update_tray_ticker');
    expect(src).toContain('set_always_on_top');
    expect(src).toContain('CmdOrCtrl+Shift+K');
    expect(src).toContain('generate_handler!');
  });
});

describe('isTauriRuntime：运行时探测', () => {
  it('普通浏览器返回 false', () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it('__TAURI_INTERNALS__ 存在返回 true', () => {
    globalThis.window.__TAURI_INTERNALS__ = { invoke: () => {} };
    expect(isTauriRuntime()).toBe(true);
  });

  it('旧式 __TAURI__ 存在也返回 true', () => {
    globalThis.window.__TAURI__ = { invoke: () => {} };
    expect(isTauriRuntime()).toBe(true);
  });

  it('root 可注入（Node/单测不依赖 window）', () => {
    expect(isTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(isTauriRuntime({})).toBe(false);
  });
});

describe('formatMenuBarTicker：紧凑菜单栏文本', () => {
  it('无置顶时取国际金/BTC/标普500 前三个有效品种', () => {
    expect(MENU_BAR_FALLBACK_IDS).toEqual(['gold-intl', 'btc', 'sp500']);
    expect(formatMenuBarTicker(QUOTES, [])).toBe('国际金 2745.2 +0.82% · BTC 91200 +2.10% · 标普500 5912.3 -0.31%');
  });

  it('有置顶时按置顶顺序取前三个有效品种', () => {
    expect(formatMenuBarTicker(QUOTES, ['oil', 'btc', 'sp500'])).toBe('WTI原油 71.4 +1.12% · BTC 91200 +2.10% · 标普500 5912.3 -0.31%');
  });

  it('置顶里含无效/未知标的时自动回退补齐', () => {
    expect(formatMenuBarTicker(QUOTES, ['bad', 'nope', 'oil'])).toBe('WTI原油 71.4 +1.12% · 国际金 2745.2 +0.82% · BTC 91200 +2.10%');
  });

  it('报价为空或全无效时返回空串（不输出乱码）', () => {
    expect(formatMenuBarTicker([], ['gold-intl'])).toBe('');
    expect(formatMenuBarTicker([{ id: 'x', price: 'nan' }], [])).toBe('');
  });

  it('名称与价格都被安全处理（不把原始 HTML 带进菜单栏）', () => {
    const q = [{ id: 'gold-intl', name: '<script>x</script>', price: 10, changePct: Infinity }];
    const text = formatMenuBarTicker(q, ['gold-intl']);
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;');
  });
});

describe('updateTrayTicker：报价更新同步托盘与标题', () => {
  it('非 Tauri 环境只更新 document.title，不尝试 invoke', () => {
    updateTrayTicker(QUOTES, ['btc'], { invoke: () => { throw new Error('should not invoke'); } });
    expect(document.title).toContain('BTC 91200');
  });

  it('Tauri 环境调用 update_tray_ticker 并更新标题', () => {
    globalThis.window.__TAURI_INTERNALS__ = { invoke: async () => {} };
    const calls = [];
    updateTrayTicker(QUOTES, [], { invoke: (cmd, args) => calls.push([cmd, args]) });
    expect(calls).toEqual([['update_tray_ticker', { text: '国际金 2745.2 +0.82% · BTC 91200 +2.10% · 标普500 5912.3 -0.31%' }]]);
    expect(document.title).toContain('国际金');
  });

  it('空文本时不覆盖标题、也不推托盘', () => {
    const calls = [];
    updateTrayTicker([], [], { invoke: (...a) => calls.push(a) });
    expect(document.title).toBe('市场看板');
    expect(calls).toHaveLength(0);
  });
});

describe('togglePipMode：画中画 dataset 与置顶命令', () => {
  it('开 → 关 → 开，dataset.pip 正确切换', () => {
    const root = document.documentElement;
    expect(togglePipMode(root)).toBe('1');
    expect(root.dataset.pip).toBe('1');
    expect(togglePipMode(root)).toBe('0');
    expect(root.dataset.pip).toBe('0');
    expect(PIP_DATASET_KEY).toBe('pip');
  });

  it('可显式指定目标状态，重复设置不重复发命令', () => {
    const root = document.documentElement;
    const calls = [];
    const invoke = (cmd, args) => calls.push([cmd, args]);
    togglePipMode(root, { force: '1', invoke, isTauri: true });
    togglePipMode(root, { force: '1', invoke, isTauri: true });
    expect(calls).toEqual([['set_always_on_top', { enabled: true }]]);
    togglePipMode(root, { force: '0', invoke, isTauri: true });
    expect(calls[1]).toEqual(['set_always_on_top', { enabled: false }]);
  });

  it('非 Tauri 环境不发命令', () => {
    const calls = [];
    togglePipMode(document.documentElement, { invoke: (...a) => calls.push(a), isTauri: false });
    expect(calls).toHaveLength(0);
    expect(document.documentElement.dataset.pip).toBe('1');
  });

  it('workspace.css 提供 [data-pip="1"] 紧凑样式', () => {
    expect(read('public/styles/workspace.css')).toMatch(/\[data-pip="1"\]/);
  });
});

describe('mountDesktopBridge：接入顶栏/工作台', () => {
  it('订阅 quotes 事件，每次报价刷新菜单栏；返回解绑函数', async () => {
    globalThis.window.__TAURI_INTERNALS__ = { invoke: async () => {} };
    const calls = [];
    const listeners = new Map();
    const bus = {
      on: (ev, fn) => { listeners.set(ev, fn); return () => listeners.delete(ev); },
    };
    const unmount = mountDesktopBridge({ bus, invoke: (cmd, args) => calls.push([cmd, args]) });
    listeners.get('quotes')({ quotes: QUOTES });
    expect(calls[0][0]).toBe('update_tray_ticker');
    expect(calls[0][1].text).toContain('国际金');
    unmount();
    listeners.get('quotes')?.({ quotes: QUOTES });
    expect(calls).toHaveLength(1);
  });
});
