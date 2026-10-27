/* ================================================================== *
 * 客户端模块结构契约
 *
 * app.js 从 3655 行单体拆成 src/client/ 之后，有几条约束靠肉眼守不住，
 * 而且一旦破了不会报错、只会静默失效（或者运行时才炸）。这里用静态检查钉住：
 *
 *   1. 每个 import 的路径都真的存在 —— 拆分过程中这是最高频的错
 *      （`./worldmap.js` 从 src/client/views/ 解析过去就指向了不存在的位置）。
 *   2. 页面骨架的 DOM 引用只在 shared/dom.js 里取一次。
 *   3. 每个视图都实现 mount/unmount，且只有 router 监听 hashchange。
 *   4. 共享可变状态只能挂在 store 上，不能在视图里另起一份 `let`。
 *   5. public/app.js 只是一行转发，不承载逻辑。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLIENT = `${ROOT}src/client`;

/** 递归收集客户端模块（含 Phase 1 的画布模块） */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const MODULES = walk(CLIENT).sort();
const rel = (p) => p.slice(ROOT.length);
const read = (p) => readFileSync(p, 'utf8');

/** 抽出所有 import / 动态 import 的 specifier */
function specifiers(code) {
  const out = [];
  for (const m of code.matchAll(/^\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

describe('客户端模块：import 路径解析', () => {
  it('每个相对 import 都指向真实存在的文件', () => {
    const missing = [];
    for (const mod of MODULES) {
      for (const spec of specifiers(read(mod))) {
        if (!spec.startsWith('.')) continue;
        const target = new URL(spec, `file://${mod}`).pathname;
        if (!existsSync(target)) missing.push(`${rel(mod)} → ${spec}`);
      }
    }
    expect(missing, `解析不到的 import:\n${missing.join('\n')}`).toEqual([]);
  });

  it('每个绝对路径 import 都指向 public/ 下真实存在的文件', () => {
    const missing = [];
    for (const mod of MODULES) {
      for (const spec of specifiers(read(mod))) {
        if (!spec.startsWith('/')) continue;
        const target = `${ROOT}public${spec}`;
        if (!existsSync(target)) missing.push(`${rel(mod)} → ${spec}`);
      }
    }
    expect(missing, `public/ 下找不到:\n${missing.join('\n')}`).toEqual([]);
  });

  it('没有模块反向依赖 public/ 里的相对路径（那是拆分时的经典错位）', () => {
    const bad = [];
    for (const mod of MODULES) {
      for (const spec of specifiers(read(mod))) {
        if (!spec.startsWith('.')) continue;
        const target = new URL(spec, `file://${mod}`).pathname;
        if (target.includes('/public/')) bad.push(`${rel(mod)} → ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('客户端模块：边界纪律', () => {
  const APP_MODULES = MODULES.filter((p) => !p.includes('/views/macro/'));

  it('页面骨架的 DOM 引用只在 shared/dom.js 里取', () => {
    const offenders = [];
    for (const mod of APP_MODULES) {
      if (mod.endsWith('/shared/dom.js')) continue;
      const hits = [...read(mod).matchAll(/getElementById\(\s*['"](rows|detail|macro|events|map|updated|countdown|refresh)['"]\s*\)/g)];
      if (hits.length) offenders.push(`${rel(mod)}: ${[...new Set(hits.map((h) => h[1]))].join(',')}`);
    }
    // macro.js 内部还用 #macro-graph-host 这类子容器，不在上面的白名单里，属正常
    expect(offenders).toEqual([]);
  });

  it('共享可变状态只能挂在 store 上（视图里不准另起一份 let）', () => {
    const offenders = [];
    for (const mod of APP_MODULES) {
      if (mod.endsWith('/shared/store.js')) continue;
      const code = read(mod);
      for (const name of ['quotesCache', 'calendarCache', 'eventsState', 'ttl', 'nextAt']) {
        if (new RegExp(`^\\s*(let|const|var)\\s+${name}\\b`, 'm').test(code)) offenders.push(`${rel(mod)}: ${name}`);
        if (new RegExp(`\\b${name}\\s*=`, 'm').test(code.replace(/store\.[a-zA-Z]+/g, ''))) {
          // 声明已被上面拦下；这里只兜「赋值给了裸标识符」
          if (new RegExp(`^\\s*${name}\\s*=`, 'm').test(code)) offenders.push(`${rel(mod)}: ${name} = (裸赋值)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('只有 router.js 监听 hashchange，且四个视图都实现了 mount/unmount', () => {
    const listeners = APP_MODULES.filter((p) => /addEventListener\(\s*['"]hashchange['"]/.test(read(p))).map(rel);
    expect(listeners).toEqual(['src/client/router.js']);

    for (const view of ['detail', 'map', 'events', 'macro']) {
      const code = read(`${CLIENT}/views/${view}.js`);
      expect(code, `${view}.js 缺 mount`).toMatch(new RegExp(`export function mount${view[0].toUpperCase()}${view.slice(1)}\\b`));
      expect(code, `${view}.js 缺 unmount`).toMatch(new RegExp(`export function unmount${view[0].toUpperCase()}${view.slice(1)}\\b`));
    }
  });

  it('unmount 必须清掉自己那枚定时器（按视图逐一核对）', () => {
    const pairs = [
      ['detail', 'stopDetailTimer'],
      ['map', 'stopMapTimer'],
      ['events', 'stopEventsTimer'],
    ];
    for (const [view, stop] of pairs) {
      const code = read(`${CLIENT}/views/${view}.js`);
      const at = code.indexOf(`export function unmount${view[0].toUpperCase()}${view.slice(1)}`);
      expect(at, `${view}.js 没有 unmount`).toBeGreaterThan(-1);
      expect(code.slice(at, at + 700), `${view}.unmount 里没调用 ${stop}`).toContain(stop);
    }
  });

  it('events.unmount 要连带清 llmRetry（原来这枚定时器被漏掉了）', () => {
    const code = read(`${CLIENT}/views/events.js`);
    const at = code.indexOf('export function unmountEvents');
    const body = code.slice(at, at + 700);
    expect(body).toContain('llmRetry');
    expect(body).toContain('clearTimeout');
  });

  it('macro.unmount 要显式 dispose X6 画布，且用 #macro-graph-host 做 key', () => {
    const code = read(`${CLIENT}/views/macro.js`);
    const at = code.indexOf('export function unmountMacro');
    const body = code.slice(at, at + 900);
    expect(body).toContain('destroyMacroFlow');
    expect(body, '画布挂在 #macro-graph-host 上，用 macroEl 做 key 会静默空转').toContain("querySelector('#macro-graph-host')");
  });

  it('map.unmount 要清气泡与拖拽状态', () => {
    const code = read(`${CLIENT}/views/map.js`);
    const at = code.indexOf('export function unmountMap');
    const body = code.slice(at, at + 700);
    expect(body).toContain('mapBubbles');
    expect(body).toContain('mapDrag');
  });
});

describe('入口保持零构建', () => {
  it('public/app.js 只是一行转发，不再承载业务逻辑', () => {
    const code = read(`${ROOT}public/app.js`);
    expect(code.split('\n').filter((l) => l.trim() && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).length).toBeLessThanOrEqual(3);
    expect(code).toContain("import './../src/client/main.js';");
    expect(code).not.toMatch(/function\s+\w+\s*\(/);
  });

  it('server.mjs 把 /src/client/ 当静态资源伺服（浏览器原生加载 ES 模块）', () => {
    const code = read(`${ROOT}server.mjs`);
    expect(code).toContain("const CLIENT_SRC_DIR = path.join(ROOT, 'src', 'client');");
    expect(code).toContain("rel.startsWith('/src/client/')");
  });
});

/* ================================================================== *
 * 画布几何：分组带不得越出画布
 *
 * 分组带上下各外扩 gapY*0.34，而最后一行下方只有 pad 余量，于是末行带底边
 * 会越出画布（实测 8px），表现为底排机理胶囊压着下沿被裁。这条断言把
 * 「带必须完整落在画布内」锁住。
 * ================================================================== */
describe('传导图画布几何', () => {
  it('最底分组带完整落在画布内，且底部留白不小于 pad', async () => {
    const { layoutTiered, CANVAS_PAD } = await import('../src/client/views/macro/flow-layouts.js');
    const L = layoutTiered({});

    const bandBottom = Math.max(...L.bands.map((b) => b.y + b.height));
    const nodeBottom = Math.max(...L.nodes.map((n) => n.y + n.h));

    expect(bandBottom, '分组带越出画布下沿').toBeLessThanOrEqual(L.height);
    expect(L.height - bandBottom, '带底边应留出一个 pad 的余量').toBeGreaterThanOrEqual(CANVAS_PAD);
    expect(L.height - nodeBottom, '卡片底边也要留够 pad').toBeGreaterThanOrEqual(CANVAS_PAD);
  });

  it('每条带都覆盖它那一行的卡片（上下不外扩到别的行）', async () => {
    const { layoutTiered } = await import('../src/client/views/macro/flow-layouts.js');
    const L = layoutTiered({});
    L.bands.forEach((b, i) => {
      expect(b.height).toBeGreaterThan(0);
      if (i > 0) expect(b.y).toBeGreaterThan(L.bands[i - 1].y);
    });
  });
});
