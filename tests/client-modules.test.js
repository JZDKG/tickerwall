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

  /**
   * 浏览器真正加载的模块图：从 public/app.js 出发，只有相对路径和
   * /src/client/** 这种绝对路径会被跟进去。
   *
   * 为什么不能对所有源码文件一刀切：src/client/views/macro/** 只在
   * `npm run build` 时被 Vite 打包进 public/vendor/macro-flow.js，
   * 浏览器加载的是那个产物，从不直接请求这些源码 —— 它们里面的
   * `import { Graph } from '@antv/x6'` 是构建期依赖，不该出现在 import map 里。
   */
  const browserReachable = (() => {
    const seen = new Set();
    const queue = [`${ROOT}public/app.js`];
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file) || !existsSync(file)) continue;
      seen.add(file);
      for (const spec of specifiers(read(file))) {
        let next = null;
        if (spec.startsWith('.')) next = new URL(spec, `file://${file}`).pathname;
        else if (spec.startsWith('/src/client/')) next = `${ROOT}${spec.slice(1)}`;
        if (next && next.endsWith('.js')) queue.push(next);
      }
    }
    return seen;
  })();

  it('浏览器可达模块用的裸模块名都在 import map 里声明', () => {
    // 浏览器原生加载 ES 模块，没有构建期改写。裸模块名一旦不在 import map 里，
    // 页面会整块加载失败，报的是 "Failed to resolve module specifier" ——
    // 很容易被当成服务端问题排查半天。这里把那张表当契约守。
    const html = readFileSync(`${ROOT}public/index.html`, 'utf8');
    const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
    expect(m, 'index.html 缺少 import map').toBeTruthy();
    const declared = new Set(Object.keys(JSON.parse(m[1]).imports ?? {}));

    const used = new Map(); // bare name → 出现在哪些模块
    for (const file of browserReachable) {
      for (const spec of specifiers(read(file))) {
        if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
        if (!used.has(spec)) used.set(spec, []);
        used.get(spec).push(file.slice(ROOT.length));
      }
    }

    const missing = [...used.entries()]
      .filter(([name]) => !declared.has(name))
      .map(([name, mods]) => `${name}（被 ${[...new Set(mods)].join('、')} 使用）`);
    expect(missing, `import map 里缺少：\n${missing.join('\n')}`).toEqual([]);
  });

  it('可达图确实覆盖到了视图层（防止解析逻辑退化后「通过」）', () => {
    const files = [...browserReachable].map((f) => f.slice(ROOT.length));
    for (const must of ['public/app.js', 'src/client/main.js', 'src/client/views/map.js', 'src/client/views/events.js']) {
      expect(files, `可达图里缺 ${must}`).toContain(must);
    }
    // macro 子树是构建期源码，不该被浏览器直接加载
    expect(files.some((f) => f.includes('/views/macro/'))).toBe(false);
  });

  it('vendor 打包入口的 bare 依赖不进业务代码（只能从 geo-kit 转出）', () => {
    // 业务模块直接 import 'd3-geo' 会绕过 geo-kit 的收口，
    // 一旦 d3-selection / d3-transition 分成两份实例，动画会静默失效。
    const ALLOWED = new Set(['src/client/vendor/geo-kit.js']);
    const bad = [];
    for (const mod of MODULES) {
      if (ALLOWED.has(rel(mod).replace(/^\/+/, ''))) continue;
      for (const spec of specifiers(read(mod))) {
        if (/^(d3-|topojson-|world-atlas)/.test(spec)) bad.push(`${rel(mod)} → ${spec}`);
      }
    }
    expect(bad, `请改从 geo-kit 导入：\n${bad.join('\n')}`).toEqual([]);
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

  it('/src/client/ 被当静态资源伺服（浏览器原生加载 ES 模块）', () => {
    // 实现从 server.mjs 搬到了 src/server/http.js 的 resolveStaticPath 纯函数
    // （为了能对路径穿越单测 —— 那段原先埋在入口里没法测）。这里断言的是
    // 「这个子树确实被伺服」这个语义，不锁定具体文件。
    const httpCode = read(`${ROOT}src/server/http.js`);
    expect(httpCode).toContain("path.join(ROOT, 'src', 'client')");
    expect(httpCode).toContain("rel.startsWith('/src/client/')");
    // 入口仍然必须用上静态服务（实现在 http.js，入口负责接线）
    // E08 后路由与静态映射在 src/server/app.js（入口只做装配）
    expect(read(`${ROOT}src/server/app.js`)).toContain('serveStatic');
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
