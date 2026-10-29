/* ================================================================== *
 * 首页骨架的完整性（这一层 jsdom 与单元测试都看不见）
 *
 * 真实浏览器走查抓到两类只有页面才会暴露的错：
 *   1. `app.css` 根本没被 `<link>` —— 而 `.tasks/.task-group/.task-label`
 *      的样式全在它里面，任务导航因此「裸奔」：没有 flex 间距、
 *      没有胶囊背景、没有激活下划线；
 *   2. `<nav>` 用 `</div>` 闭合 —— 浏览器会自行修复 DOM，但嵌套层级已经错了。
 *
 * 这两条都能用静态检查挡住，不需要起浏览器。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync('public/index.html', 'utf8');

describe('样式表全部可达', () => {
  const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);

  it('至少引入了样式（否则整页无样式）', () => {
    expect(links.length).toBeGreaterThan(5);
  });

  it('每个 href 在磁盘上真的存在（漏文件 / 拼错路径都会被这条挡住）', () => {
    const missing = links.filter((href) => !href.startsWith('http') && !existsSync(`public/${href.replace(/^\.\//, '')}`));
    expect(missing).toEqual([]);
  });

  it('app.css 被引入 —— 任务导航的样式只写在那里', () => {
    expect(links.some((h) => h.includes('app.css'))).toBe(true);
    const css = readFileSync('public/app.css', 'utf8');
    // 断言「样式确实在里面」，避免哪天把它搬走而 link 留成死引用
    expect(css).toContain('.tasks');
    expect(css).toContain('.task-group');
  });
});

describe('标签闭合', () => {
  it('nav 用 </nav> 闭合（不是 </div>）', () => {
    const open = (html.match(/<nav\b/g) ?? []).length;
    const close = (html.match(/<\/nav>/g) ?? []).length;
    expect(open).toBe(close);
    expect(open).toBeGreaterThan(0);
  });

  it('div 与 section 的开闭数量一致', () => {
    const count = (re) => (html.match(re) ?? []).length;
    expect(count(/<div\b/g)).toBe(count(/<\/div>/g));
    expect(count(/<section\b/g)).toBe(count(/<\/section>/g));
    expect(count(/<main\b/g)).toBe(count(/<\/main>/g));
  });
});

describe('首页区块顺序（看板核心不该被挤到两屏外）', () => {
  it('问题 → 简报 → 行情（简报折叠态，只占一行）', () => {
    const q = html.indexOf('id="questions"');
    const rows = html.indexOf('id="rows"');
    const brief = html.indexOf('id="home-brief"');
    expect(q).toBeGreaterThan(0);
    expect(q).toBeLessThan(brief);
    expect(brief).toBeLessThan(rows);
  });
});

/* ================================================================== *
 * 类名必须有样式（外部走查：今天重点呈现为「普通文本列表」）
 *
 * 只有类名、没有规则的写法不会报错，只会看起来没有层级 ——
 * 只能靠静态检查守住。
 * ================================================================== */
describe('今天重点的类名有样式', () => {
  const css = ['public/app.css', 'public/styles/base.css', 'public/styles/explanations.css', 'public/styles/events.css']
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  for (const cls of ['.tf-card', '.tf-list', '.tf-row', '.tf-idx', '.tf-title', '.tf-time', '.tf-why', '.tf-next']) {
    it(`${cls} 在样式表里有规则`, () => {
      expect(css.includes(cls)).toBe(true);
    });
  }
});

describe('内外盘对照的类名有样式', () => {
  const css = ['public/app.css', 'public/styles/detail.css', 'public/styles/explanations.css']
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  for (const cls of ['.cmp-card', '.cmp-term', '.cmp-sub', '.cmp-open', '.cmp-reasons', '.cmp-empty']) {
    it(`${cls} 在样式表里有规则`, () => {
      expect(css.includes(cls)).toBe(true);
    });
  }
});
