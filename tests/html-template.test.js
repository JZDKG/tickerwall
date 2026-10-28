/* ================================================================== *
 * 带转义的标签模板
 *
 * 目标是让「忘记转义」在代码里变得显眼：默认就转，要原样得写 raw()。
 * 这里既测实现，也测**约束**（raw 的使用范围、裸 ${} 的棘轮）。
 * ================================================================== */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { html, raw, attrHref, esc, SafeHtml } from '../src/client/shared/format.js';
// events.js 顶层会读几个元素引用，Node 里需要最小 DOM 桩。
// 这是测试基础设施，不改变被测逻辑（eventItemHTML 本身是纯函数）。
const stubEl = () => ({
  innerHTML: '', hidden: false, dataset: {}, style: {}, textContent: '',
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, appendChild() {}, remove() {}, querySelector: () => null,
  querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
  offsetWidth: 0, offsetHeight: 0, children: [],
});
globalThis.document = globalThis.document ?? {
  getElementById: () => stubEl(), querySelector: () => null, querySelectorAll: () => [],
  createElement: stubEl, addEventListener() {}, body: stubEl(), documentElement: stubEl(),
};
globalThis.window = globalThis.window ?? { addEventListener() {}, location: { hash: '' }, matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.location = globalThis.location ?? globalThis.window.location;
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, 0));
globalThis.CSS = globalThis.CSS ?? { escape: (x) => x };



const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(REPO, 'src/client');

describe('html``：默认转义', () => {
  it('普通值按实体转义', () => {
    expect(html`<b>${'<script>'}</b>`.toString()).toBe('<b>&lt;script&gt;</b>');
    expect(html`${`a&b"c'd`}`.toString()).toBe('a&amp;b&quot;c&#39;d');
  });

  it('只转义一次（迁移时若保留原来的 esc() 会得到 &amp;amp;）', () => {
    const out = html`${'&'}`.toString();
    expect(out).toBe('&amp;');
    expect(out).not.toBe('&amp;amp;');
    // 与 esc 完全一致，证明不是双份
    expect(out).toBe(esc('&'));
  });

  it('数字照常输出，0 不会被当成空', () => {
    expect(html`${0}`.toString()).toBe('0');
    expect(html`${12.5}`.toString()).toBe('12.5');
  });

  it('null / undefined / false 输出空串', () => {
    expect(html`[${null}]`.toString()).toBe('[]');
    expect(html`[${undefined}]`.toString()).toBe('[]');
    expect(html`[${false}]`.toString()).toBe('[]');
  });

  it('数组递归拼接', () => {
    expect(html`${[1, 2, 3]}`.toString()).toBe('123');
    expect(html`${[]}`.toString()).toBe('');
  });
});

describe('html``：嵌套不二次转义', () => {
  it('内层 html`` 的结果原样拼进去', () => {
    const items = ['<a>', '&b'];
    const out = html`<ul>${items.map((x) => html`<li>${x}</li>`)}</ul>`.toString();
    expect(out).toBe('<ul><li>&lt;a&gt;</li><li>&amp;b</li></ul>');
    // 关键：不能出现 &amp;lt;
    expect(out).not.toContain('&amp;lt;');
  });

  it('返回值是 SafeHtml 而不是字符串，所以能被识别', () => {
    expect(html`x`).toBeInstanceOf(SafeHtml);
    expect(typeof html`x`.toString()).toBe('string');
  });
});

describe('raw()：显式放行', () => {
  it('原样插入，不再转义', () => {
    expect(html`<p>${raw('<b>x</b>')}</p>`.toString()).toBe('<p><b>x</b></p>');
  });

  it('raw 里的外部数据仍然是洞 —— 所以只许出现在白名单文件', () => {
    // 记录这个语义：raw 不检查内容，责任在调用方
    expect(html`${raw('<img onerror=x>')}`.toString()).toBe('<img onerror=x>');
  });
});

describe('未加引号的属性插值被拒绝', () => {
  it('href=${x} 直接抛错', () => {
    expect(() => html`<a href=${'x'}>y</a>`).toThrow(/未加引号的属性插值/);
  });

  it('带引号则放行', () => {
    expect(() => html`<a href="${'x'}">y</a>`).not.toThrow();
  });

  it('正文里的插值不受影响', () => {
    expect(() => html`<p>${'x'}</p>`).not.toThrow();
  });

  /* ---------------------------------------------------------------- *
   * 对抗用例：v1 的实现真的漏过下面第一条
   *
   * 原来用 `!/["'][^"']*=\s*$/` 判断「是否在引号内」，那条正则可以从
   * `class="btn"` 的**闭合**引号开始匹配「引号 + 非引号字符 + =」，于是
   * 「已闭合」被判成「在引号内」，整个校验被绕过 —— 直接渲染出
   * `onclick=alert(1)`。现在用状态机扫描，两条都对。
   * ---------------------------------------------------------------- */
  it('前面已有闭合的带引号属性时，后面的裸属性仍要被拦', () => {
    expect(() => html`<button class="btn" onclick=${'alert(1)'}>x</button>`).toThrow(/未加引号的属性插值/);
    expect(() => html`<a class="a" title="b" href=${'x'}>y</a>`).toThrow(/未加引号的属性插值/);
  });

  it('属性值里的 = 不受影响（URL query 参数）', () => {
    expect(() => html`<a href="https://e.com?k=${'x'}">y</a>`).not.toThrow();
    expect(() => html`<a href="https://e.com?a=${'1'}&b=${'2'}">y</a>`).not.toThrow();
    expect(() => html`<a href='https://e.com?k=${'x'}'>y</a>`).not.toThrow();
  });

  it('引号内的另一种引号是字面字符，不改状态', () => {
    // title 里的撇号不能让「已闭合」被判成「未闭合」
    expect(() => html`<a title="it's" href=${'x'}>y</a>`).toThrow(/未加引号的属性插值/);
  });

  it('裸属性在前也要拦', () => {
    expect(() => html`<a href=${'x'} class="y">z</a>`).toThrow(/未加引号的属性插值/);
  });

  it('正文里的等号不算属性赋值，不能被误杀', () => {
    // 属性赋值只可能出现在标签内（< 与 > 之间）。正文里的 = 就是文本，
    // 早期实现只看「末尾是 = 且不在引号内」，于是 `总计 = ${n}` 直接抛错 ——
    // 一个正常文案让整个模板崩掉。
    expect(() => html`<span>总计 = ${100}</span>`).not.toThrow();
    expect(() => html`<p>1 USD = ${7.1} CNY</p>`).not.toThrow();
    expect(html`<span>总计 = ${100}</span>`.toString()).toBe('<span>总计 = 100</span>');
    // 标签闭合之后的等号同样是正文
    expect(() => html`<b>x</b> = ${1}`).not.toThrow();
  });

  it('被拦下的那一刻不会产生任何输出（不是「转义后放行」）', () => {
    let out = null;
    try {
      out = html`<button onclick=${'alert(1)'}>x</button>`;
    } catch {
      /* 预期 */
    }
    expect(out).toBeNull();
    // 反面教材：如果能拼出来，必然是裸的
    expect(() => `${out}`).not.toThrow();
  });
});

describe('attrHref：转义 + 协议白名单', () => {
  it('拒绝 javascript: 等非 http(s)，返回空串', () => {
    expect(attrHref('javascript:alert(1)')).toBe('');
    expect(attrHref('data:text/html,x')).toBe('');
    expect(attrHref(null)).toBe('');
  });

  it('放行 http(s) 并转义 & —— 两件事是正交的', () => {
    expect(attrHref('https://a.com/?a=1&b=2')).toBe('https://a.com/?a=1&amp;b=2');
  });

  it('调用方据此整段不渲染（没有 href="" 这种退化成可点击的写法）', () => {
    const href = attrHref('javascript:alert(1)');
    const out = href ? html`<a href="${href}">原文</a>`.toString() : '';
    expect(out).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * 约束：raw() 只允许出现在白名单文件里
 * ------------------------------------------------------------------ */
describe('raw() 的使用范围', () => {
  /**
   * raw() 的授权名单。加文件前请先想清楚：每一处都是「绕过转义」的授权，
   * 而且 raw 不检查内容，责任全在调用方。
   *
   * views/map.js —— 它的 SVG/HTML 片段由 landPaths()、regionSvg、
   *   citySvg、sunMark、anchorsHtml、feedRows、openNodeCard 的 rowsWithSpark
   *   等生成，这些函数内部已经用 esc()/模板完成转义，返回的是「渲染层
   *   自己产出的 HTML」。当普通字符串插进外层 html`` 会被整体转义成
   *   &lt;path，整张地图变乱码 —— 所以必须显式放行。
   *   这些片段不接受外部输入直接透传，安全边界在各自的生成函数里。
   *
   * views/macro.js —— 同类：multiLineSVG / richRollingSVG 产出的是纯 SVG
   *   几何（路径坐标由数值算出），不是 HTML 文本，必须原样嵌入。
   *
   * views/detail.js —— 同上：chartSVG / candleSVG / volumeSVG / intradaySVG
   *   四个图表生成器输出 SVG 几何，内部已对坐标标签做 esc。
   */
  const RAW_ALLOWED = new Set([
    path.join('views', 'map.js'),
    path.join('views', 'macro.js'),
    path.join('views', 'detail.js'),
  ]);

  function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (name.endsWith('.js')) out.push(p);
    }
    return out;
  }

  it('除 format.js 自身定义外，没有业务代码调用 raw()', () => {
    const offenders = [];
    for (const file of walk(CLIENT)) {
      const rel = path.relative(CLIENT, file);
      if (rel === path.join('shared', 'format.js')) continue;
      if (RAW_ALLOWED.has(rel)) continue;
      const code = readFileSync(file, 'utf8');
      // 排除注释里提到 raw( 的情况
      if (/\braw\s*\(/.test(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''))) {
        offenders.push(rel);
      }
    }
    expect(offenders, `以下文件用了 raw()，请确认后加入白名单：\n${offenders.join('\n')}`).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 迁移不改行为：events.js 的输出快照
 *
 * 快照是迁移前用它自己生成的（35 行 HTML，含三个样本：正常 url、
 * 无 url、javascript: url）。迁移后逐字节一致 —— 这是「重构没改行为」
 * 的证据，不靠肉眼。
 *
 * 换样本请先确认差异是**预期内**的（只允许转义等义、或明确的行为变更）。
 * ------------------------------------------------------------------ */
describe('events.js 迁移后的输出快照', async () => {
  // import 是提升的，静态 import 会跑在 DOM 桩之前 —— 必须动态取
  const { eventItemHTML, calendarBlockHTML } = await import('../src/client/views/events.js');
  const EV = {
    id: 'sina:1',
    time: '2026-10-27 20:30:00',
    source: '新浪财经',
    publisher: '日経',
    title: '美联储 <b>暂停加息</b> & 市场反应 "quoted" \'single\'',
    url: 'https://a.com/x?a=1&b=2',
    level: 'high',
    important: true,
    region: 'us',
    llm: true,
    topics: [
      { key: 'fed', label: '货币政策', strong: true },
      { key: 'rates', label: '利率', strong: false },
    ],
    symbols: ['us10y', 'dxy'],
    body: '正文 with <tag> & more',
  };

  it('标题里的标签与引号只转义一次', () => {
    // 子组件返回 SafeHtml（不是普通 string），转成文本再断言
    const out = String(eventItemHTML(EV));
    expect(out).toContain('&lt;b&gt;暂停加息&lt;/b&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;quoted&quot;');
    // 不能出现双转义
    expect(out).not.toContain('&amp;lt;');
    expect(out).not.toContain('&amp;amp;');
  });

  it('href 的 & 只转一次，且仍走协议白名单', () => {
    expect(String(eventItemHTML(EV))).toContain('href="https://a.com/x?a=1&amp;b=2"');
    // javascript: 的那条不渲染链接
    expect(String(eventItemHTML({ ...EV, url: 'javascript:alert(1)' }))).not.toContain('ev-link');
    expect(String(eventItemHTML({ ...EV, url: null }))).not.toContain('ev-link');
  });

  it('子组件必须返回 SafeHtml 而不是普通字符串', () => {
    // 这条是这次功能回归的根因：返回普通 string 时，外层 html`` 会把它
    // 当不可信输入整体转义 —— <article> 变成 &lt;article&gt;，浏览器里
    // 一条事件都渲染不出来，而所有单测照样全绿。
    expect(eventItemHTML(EV)).toBeInstanceOf(SafeHtml);
    expect(calendarBlockHTML({ upcoming: [] })).toBeInstanceOf(SafeHtml);
    expect(calendarBlockHTML({ today: '2026-10-28', upcoming: [{ date: '2026-10-28', kind: 'fomc', title: 'x', time: '02:00' }] })).toBeInstanceOf(SafeHtml);
  });
});

/* ------------------------------------------------------------------ *
 * main.js 必须引入所有副作用模块
 *
 * 事故：Phase 2 拆分时 briefing.js 没被任何地方 import，它顶层挂的
 * 「隔夜复盘」按钮监听从未执行 —— 按钮点了完全没反应，而所有测试全绿
 * （单测直接 import 模块，绕过了「入口有没有引它」这个问题）。
 * ------------------------------------------------------------------ */
describe('main.js 的副作用模块引入', () => {
  it('briefing.js 被 main.js 引入', () => {
    const main = readFileSync(path.join(CLIENT, 'main.js'), 'utf8');
    expect(main, 'briefing.js 没被引入 → 隔夜复盘按钮点击无效').toContain("import './views/briefing.js'");
  });
});

/* ------------------------------------------------------------------ *
 * 棘轮：innerHTML 里裸 ${} 的次数只许减少
 *
 * 不要求一次改完（那会是个巨大的 diff），但要求**不会变多**。
 * 已迁移的文件要求为 0。
 * ------------------------------------------------------------------ */
describe('棘轮：innerHTML 里的裸插值', () => {
  function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (name.endsWith('.js')) out.push(p);
    }
    return out;
  }

  /**
   * 已**整个文件**迁完的，必须为 0。
   *
   * 逐文件列入比「列一个文件但允许它有裸插值」有意义得多 —— 后者只是把
   * 数字挪个地方，没有守住任何东西。
   */
  const MIGRATED = new Set([
    'views/events.js',
    'views/map.js',
    'views/macro.js',
    'views/briefing.js',
    'views/list.js',
    'views/detail.js',
    path.join('views', 'macro', 'flow-canvas.js'),
  ]);

  /**
   * 全站基线。这个数字只允许变小，不许变大。
   *
   * 统计口径的局限（必须说清，否则数字看着精确其实不是）：
   * 只数 `innerHTML = \`…\`` 这种**直接赋值**的模板。像 calendarBlockHTML
   * 原先那种 `return \`…\`` 的模板不在计数里 —— 所以要配合「已迁移文件
   * 必须为 0」来守，两者合起来才有意义。195 是 `innerHTML` 这一类当前
   * 的实测值（detail 82 / macro 45 / events 33 / map 28 / 其余 7）。
   */
  /**
   * 全站基线：195 → 134（map）→ 89（macro）→ 82（三个小文件）。
   * 现在只剩 detail.js 一个未迁移文件，它就是 82。
   */
  const BASELINE = 0;

  function bareInterpolations(code) {
    // 数 `innerHTML = \`…\`` 之后的模板里出现的 ${，粗略但足够做棘轮
    let n = 0;
    const re = /\.innerHTML\s*=\s*`([\s\S]*?)`\s*;/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      n += (m[1].match(/\$\{/g) ?? []).length;
    }
    return n;
  }

  it('已迁移文件没有裸插值', () => {
    const bad = [];
    for (const rel of MIGRATED) {
      const code = readFileSync(path.join(CLIENT, rel), 'utf8');
      const n = bareInterpolations(code);
      if (n > 0) bad.push(`${rel}: ${n}`);
    }
    expect(bad, `已迁移文件仍有裸插值：\n${bad.join('\n')}`).toEqual([]);
  });

  it('全站计数不超过基线', () => {
    let total = 0;
    for (const file of walk(CLIENT)) total += bareInterpolations(readFileSync(file, 'utf8'));
    expect(total, '裸插值变多了 —— 新代码请用 html``').toBeLessThanOrEqual(BASELINE);
  });
});

/* ================================================================== *
 * 整页组合渲染：子组件不能被外层当纯文本二次转义
 *
 * 这条是把一次真实功能回归固化下来的防线。
 *
 * 事故：eventItemHTML / calendarBlockHTML 结尾多写了 `.toString()`，返回
 * 普通 string。外层 `eventsEl.innerHTML = html`…`` 按设计把普通 string 当
 * 不可信输入整体转义，于是 `<article>` 变成 `&lt;article&gt;` —— 浏览器里
 * 一条事件都渲染不出来。
 *
 * 而当时 22 个测试文件、616 条用例**全绿**：单测只测了孤立子函数，
 * 没人测「整页组合后 DOM 里到底有几个 .event」。是靠提交前手动开浏览器
 * 数出来的。这条测试补的就是那个缺口。
 * ================================================================== */
describe('整页组合渲染', () => {
  // dom.js 里的 eventsEl 就是 document.getElementById 的返回值（我们的 stub），
  // 直接读它的 innerHTML 即可 —— 不需要另外造容器
  let renderEvents;
  let eventsEl;

  beforeAll(async () => {
    const mod = await import('../src/client/views/events.js');
    renderEvents = mod.renderEvents;
    const { store } = await import('../src/client/shared/store.js');
    store.events = {
      data: {
        items: [
          {
            id: 'a:1', time: '2026-10-27 20:30:00', source: '新浪财经', publisher: '日経',
            title: '标题 <b>带标签</b> & 符号', url: 'https://a.com/x?a=1&b=2',
            level: 'high', important: true, region: 'us', llm: true,
            topics: [{ key: 'fed', label: '货币政策', strong: true }], symbols: ['us10y'],
            body: '正文 <tag>', origin: 'direct', lang: 'zh',
          },
          {
            id: 'b:2', time: '2026-10-27 20:20:00', source: '东方财富', publisher: null,
            title: '第二条', url: null, level: 'mid', important: false, region: 'cn',
            llm: false, topics: [{ key: 'china', label: '中国政策', strong: false }],
            symbols: [], body: '', origin: null, lang: 'zh',
          },
        ],
        topics: [{ key: 'fed', label: '货币政策' }],
        total: 2, counts: { high: 1 },
        sources: [], coverage: {}, generatedAt: '2026-10-27T12:00:00Z',
        llm: { enabled: true, applied: 2, pending: 0 },
      },
      calendar: { today: '2026-10-28', upcoming: [{ date: '2026-10-28', kind: 'fomc', title: 'FOMC', time: '02:00' }] },
      level: '', topic: '', origin: '', study: null, studyMode: 'auto',
      newIds: null, newCount: 0,
    };
    const dom = await import('../src/client/shared/dom.js');
    eventsEl = dom.eventsEl;
  });

  it('渲染出的事件条数与数据一致（不是 0）', () => {
    renderEvents();
    const html = eventsEl.innerHTML;
    const count = (html.match(/<article class="event /g) ?? []).length;
    expect(count, '事件条数应与数据一致；为 0 说明子组件被整体转义了').toBe(2);
  });

  it('没有把标签转义成文本', () => {
    renderEvents();
    const html = eventsEl.innerHTML;
    expect(html).not.toContain('&lt;article');
    expect(html).not.toContain('&lt;div class="cal-list"');
    expect(html).not.toContain('&lt;span class="ev-topic"');
    // 正常的实体转义仍然要在（标题里的 <b> 是外部数据，该转）
    expect(html).toContain('&lt;b&gt;带标签&lt;/b&gt;');
    expect(html).not.toContain('&amp;lt;b&amp;gt;');
  });

  it('日历块同样作为 SafeHtml 嵌入，而不是文本', () => {
    renderEvents();
    expect(eventsEl.innerHTML).toContain('<div class="cal-list">');
    expect(eventsEl.innerHTML).not.toContain('&lt;div class=&quot;cal-list&quot;');
  });
});

/* ------------------------------------------------------------------ *
 * map.js：SVG 不能被二次转义成文本
 *
 * 这是 map.js 迁移里最容易翻车的地方 —— 主模板里嵌着 landPaths()、
 * regionSvg、citySvg、sunMark、night 面片等内联 SVG。它们若被当普通字符串
 * 转义，`<path` 会变成 `&lt;path`，整张世界地图直接变乱码或空白。
 *
 * 用静态断言守（不起浏览器）：模板里这些插值必须经 raw() 包装。
 * ------------------------------------------------------------------ */
describe('map.js 的 SVG 片段经过 raw() 放行', () => {
  const code = () => readFileSync(path.join(CLIENT, 'views/map.js'), 'utf8');

  it('地图与图层片段都包了 raw()', () => {
    const src = code();
    for (const call of [
      'raw(graticulePath())',
      'raw(landPaths())',
      'raw(sunMark)',
      'raw(regionSvg)',
      'raw(citySvg)',
      'raw(btcSvg)',
      'raw(anchorsHtml)',
      'raw(beaconHtml)',
      'raw(feedRows)',
      'raw(rowsWithSpark)',
    ]) {
      expect(src, `缺少 ${call}`).toContain(call);
    }
  });

  it('夜空面片改用 html`` 生成，不再裸拼字符串', () => {
    const src = code();
    expect(src).toContain('night.outer.map((b) => html`<path class="night-band');
    expect(src).not.toContain("night.outer.map((b) => `<path");
  });

  it('主模板与卡片模板都走 html``', () => {
    const src = code();
    expect(src).toContain('mapEl.innerHTML = html`');
    expect(src).toContain('el.innerHTML = html`\n    <div class="nc-head">');
    // 事件流气泡
    expect(src).toContain('el.innerHTML = html`\n    <div class="bb-head">');
  });
});

/* ------------------------------------------------------------------ *
 * macro.js 子组件：必须返回 SafeHtml
 *
 * 主模板最终要 `${macroCompareHTML(data)}` 这样插值；若它们返回普通
 * string，会被外层整体转义（events.js 那次整页空白的同款事故）。
 *
 * 这里逐个断言，加一个就锁一个，不等主模板迁移时才发现。
 * ------------------------------------------------------------------ */
describe('macro.js 子组件返回 SafeHtml', async () => {
  const mod = await import('../src/client/views/macro.js');

  const DATA = {
    universe: [
      { id: 'sp500', short: '标普500', kind: 'price' },
      { id: 'us10y', short: '美债10年期', kind: 'rate' },
    ],
    recent: {
      dates: ['10-25', '10-26', '10-27'],
      changes: { sp500: [0, 0.5, 1.2], us10y: [0, -0.02, 0.03] },
    },
  };

  it('macroLeadLagHTML 返回 SafeHtml，且表格内容只转义一次', () => {
    const out = mod.macroLeadLagHTML({
      freq: 'day',
      universe: [{ id: 'sp500', short: '标普<500>' }, { id: 'us10y', short: '美债&10年' }],
      leadLag: [{ leader: 'sp500', follower: 'us10y', lag: 2, corr: -0.431, significantBH: true, sameDay: 0.12, q: 0.004, n: 120 }],
    });
    expect(out).toBeInstanceOf(SafeHtml);
    const h = String(out);
    expect(h).toContain('标普&lt;500&gt;');
    expect(h).toContain('美债&amp;10年');
    expect(h).not.toContain('&amp;lt;');
  });

  it('macroLeadLagHTML 空态也是 SafeHtml', () => {
    const out = mod.macroLeadLagHTML({ freq: 'day', universe: [], leadLag: [] });
    expect(out).toBeInstanceOf(SafeHtml);
    expect(String(out)).toContain('chart-empty');
  });

  it('macroCompareHTML / PairSection 的子片段不被外层当纯文本转义', () => {
    // 与 events.js 那次整页空白同源的风险：子组件返回普通 string 时，
    // 外层 html`` 会整体转义，表格/图表变成 &lt;table&gt; 文本。
    const out = mod.macroCompareHTML(DATA);
    expect(String(out)).not.toContain('&lt;div class="chart-legend"');
    expect(String(out)).not.toContain('&amp;lt;');
  });

  it('macroMatrixHTML 返回 SafeHtml，星号是真实标签而非转义文本', () => {
    const ids = ['sp500', 'us10y'];
    const out = mod.macroMatrixHTML({
      universe: [
        { id: 'sp500', name: '标普<500>', short: '标普&500' },
        { id: 'us10y', name: '美债', short: '美债' },
      ],
      matrix: {
        ids,
        corr: [[1, -0.43], [-0.43, 1]],
        counts: [[120, 120], [120, 120]],
        stats: [
          { a: 'sp500', b: 'us10y', significantBH: true, stable: true, p: 0.0001, pNW: 0.0002, q: 0.0004, n: 120 },
        ],
      },
    });
    expect(out).toBeInstanceOf(SafeHtml);
    const h = String(out);
    // 显著性星号必须是真标签 —— 写成普通字符串会被转义成 &lt;i&gt;
    expect(h).toContain('<i class="sig">*</i>');
    expect(h).not.toContain('&lt;i class="sig"&gt;');
    // 属性里的外部数据只转一次
    expect(h).toContain('标普&lt;500&gt;');
    expect(h).toContain('标普&amp;500');
    expect(h).not.toContain('&amp;lt;');
    // style 属性保留引号（assertQuotedAttribute 的硬要求）
    expect(h).toMatch(/style="background:[^"]*"/);
  });

  it('macroPairSection 返回 SafeHtml，标的名只转义一次', () => {
    // macroState 未初始化 → pair 为空 → 空态（也是 SafeHtml）
    const empty = mod.macroPairSection(DATA);
    expect(empty).toBeInstanceOf(SafeHtml);
    expect(String(empty)).toContain('chart-empty');
  });

  it('macroCompareHTML 返回 SafeHtml（未勾选标的时是空态）', () => {
    const out = mod.macroCompareHTML(DATA);
    expect(out).toBeInstanceOf(SafeHtml);
    // macroState 未初始化 → picked 为空 → 空态提示，而不是崩掉
    expect(String(out)).toContain('chart-empty');
  });
});

/* ------------------------------------------------------------------ *
 * detail.js 子组件：必须先返回 SafeHtml，主模板才能迁
 * ------------------------------------------------------------------ */
describe('detail.js 子组件返回 SafeHtml', async () => {
  const mod = await import('../src/client/views/detail.js');

  it('metricCards 返回 SafeHtml，标签与值都转义一次', () => {
    const out = mod.metricCards({
      decimals: 2,
      quote: { open: 1, prevClose: 0.9, high: 1.1, low: 0.8 },
      ext: { volume: 1000 },
      stats: { ma20: 1.05 },
    });
    expect(out).toBeInstanceOf(SafeHtml);
    expect(String(out)).toContain('d-metrics');
  });

  it('perfChips / crossCheckTable / historyTable 都是 SafeHtml', () => {
    expect(mod.perfChips({ perf: { d1: 1.2, w1: -0.5 } })).toBeInstanceOf(SafeHtml);
    expect(
      mod.crossCheckTable([
        { source: 'x', price: 1 },
        { source: 'y', price: 1.1, note: '<b>' },
      ], 2),
    ).toBeInstanceOf(SafeHtml);
    expect(mod.historyTable([['2026-10-27', 1, 1, 1, 1, 100, 0, 0.5]], 2, 30)).toBeInstanceOf(SafeHtml);
  });

  it('提示类子组件也是 SafeHtml，错误里的尖括号只转一次', () => {
    expect(mod.altSources({ alternatives: [{ source: 's', count: 3 }] })).toBeInstanceOf(SafeHtml);
    const empty = mod.historyEmptyNotice({ count: 0, errors: [{ source: 's', error: '<boom>' }] });
    expect(empty).toBeInstanceOf(SafeHtml);
    expect(String(empty)).toContain('&lt;boom&gt;');
    expect(String(empty)).not.toContain('&amp;lt;');
    const cache = mod.historyCacheNotice({ cache: { hit: 'stale', ageMs: 7200_000 }, endDate: '2026-10-25' });
    expect(cache).toBeInstanceOf(SafeHtml);
  });

  it('goldSpreadBlock 返回 SafeHtml', () => {
    const out = mod.goldSpreadBlock(
      { convertedPerGram: 500, xauUsd: 2400, usdCny: 7.1, domesticPrice: 520, premiumPct: 4, gramsPerOunce: 31.1 },
      2,
    );
    expect(out).toBeInstanceOf(SafeHtml);
  });

  it('空输入时返回空串（不是 SafeHtml），调用方按 falsy 判断', () => {
    expect(mod.perfChips(null)).toBe('');
    expect(mod.crossCheckTable(null, 2)).toBe('');
    expect(mod.historyTable([], 2, 30)).toBe('');
    expect(mod.altSources({})).toBe('');
    expect(mod.goldSpreadBlock(null, 2)).toBe('');
  });
});
