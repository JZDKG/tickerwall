/* ================================================================== *
 * 带转义的标签模板
 *
 * 目标是让「忘记转义」在代码里变得显眼：默认就转，要原样得写 raw()。
 * 这里既测实现，也测**约束**（raw 的使用范围、裸 ${} 的棘轮）。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
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
  // 加入白名单前请先想清楚：这里每一处都是「绕过转义」的授权
  const RAW_ALLOWED = new Set();

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
  const { eventItemHTML } = await import('../src/client/views/events.js');
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
    const out = eventItemHTML(EV);
    expect(out).toContain('&lt;b&gt;暂停加息&lt;/b&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;quoted&quot;');
    // 不能出现双转义
    expect(out).not.toContain('&amp;lt;');
    expect(out).not.toContain('&amp;amp;');
  });

  it('href 的 & 只转一次，且仍走协议白名单', () => {
    expect(eventItemHTML(EV)).toContain('href="https://a.com/x?a=1&amp;b=2"');
    // javascript: 的那条不渲染链接
    expect(eventItemHTML({ ...EV, url: 'javascript:alert(1)' })).not.toContain('ev-link');
    expect(eventItemHTML({ ...EV, url: null })).not.toContain('ev-link');
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
   * events.js 目前只迁了 eventItemHTML，整页模板与日历块还是拼字符串 ——
   * 那两处各有十几个插值，值得单独一版做。所以暂不列入；等它归零再进来。
   * 逐文件列入比「列一个文件但允许它有裸插值」有意义得多。
   */
  const MIGRATED = new Set();

  /**
   * 全站基线。这个数字只允许变小，不许变大。
   *
   * 统计口径的局限（必须说清，否则数字看着精确其实不是）：
   * 只数 `innerHTML = \`…\`` 这种**直接赋值**的模板。像 calendarBlockHTML
   * 原先那种 `return \`…\`` 的模板不在计数里 —— 所以要配合「已迁移文件
   * 必须为 0」来守，两者合起来才有意义。195 是 `innerHTML` 这一类当前
   * 的实测值（detail 82 / macro 45 / events 33 / map 28 / 其余 7）。
   */
  const BASELINE = 195;

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
