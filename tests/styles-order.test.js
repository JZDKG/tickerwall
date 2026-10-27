/* ================================================================== *
 * 样式分片的加载顺序契约
 *
 * public/styles.css 拆成 11 个文件后，「谁在谁前面」变成了隐式契约：
 * 同优先级规则谁后加载谁赢。这条契约靠肉眼守不住（改一次 <link> 顺序就可能
 * 让移动端列表布局静默失效），所以用测试钉住。
 *
 * 覆盖三类风险：
 *   1. 链接顺序被改动 / 增删文件；
 *   2. tokens.css 不再是第一个（后面的文件全都引用 --var）；
 *   3. 覆盖 ticker-list 的 @media 跑到了 ticker-list 前面（列表布局失效）。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML = readFileSync(`${ROOT}public/index.html`, 'utf8');

/** index.html 里样式表的相对顺序（只取 ./styles/ 下的） */
const linkOrder = [...HTML.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/(styles\/[^"]+)"/g)].map((m) => m[1]);

const EXPECTED = [
  'styles/tokens.css',
  'styles/base.css',
  'styles/ticker-list.css',
  'styles/responsive.css',
  'styles/detail.css',
  'styles/macro-matrix.css',
  'styles/events.css',
  'styles/worldmap.css',
  'styles/wide-screen.css',
  'styles/recap.css',
  'styles/macro-graph.css',
];

const read = (rel) => readFileSync(`${ROOT}public/${rel}`, 'utf8');

describe('样式分片：文件与顺序', () => {
  it('index.html 正好按契约顺序挂了 11 个分片', () => {
    expect(linkOrder).toEqual(EXPECTED);
  });

  it('旧的单体 styles.css 不能再被引用（已拆分）', () => {
    expect(HTML).not.toMatch(/href="\.\/styles\.css"/);
    expect(existsSync(`${ROOT}public/styles.css`)).toBe(false);
  });

  it('每个分片都存在且非空', () => {
    for (const rel of EXPECTED) {
      expect(existsSync(`${ROOT}public/${rel}`), `缺少 ${rel}`).toBe(true);
      expect(read(rel).trim().length, `${rel} 是空文件`).toBeGreaterThan(0);
    }
  });

  it('每个分片第一行横幅写的是自己的文件名（便于追溯来源区间）', () => {
    for (const rel of EXPECTED) {
      const name = rel.replace('styles/', '');
      expect(read(rel).split('\n')[1], `${name} 的横幅`).toContain(name);
    }
  });
});

describe('样式分片：层叠前提', () => {
  it('tokens.css 必须第一个加载（后续文件全部引用 --var）', () => {
    expect(linkOrder[0]).toBe('styles/tokens.css');
    const tokens = read('styles/tokens.css');
    expect(tokens).toMatch(/:root\s*\{/);
    // 至少定义了配色/尺寸变量，别被清空
    expect((tokens.match(/--[a-z-]+\s*:/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it('覆盖列表布局的 @media 必须排在 ticker-list.css 之后', () => {
    const idx = (rel) => linkOrder.indexOf(rel);
    const listIdx = idx('styles/ticker-list.css');
    const risky = [];

    for (const rel of EXPECTED) {
      const css = read(rel);
      // 找出所有 @media 块里出现 .row 选择器的分片
      for (const m of css.matchAll(/@media[^{]+\{([\s\S]*?)\n\}/g)) {
        if (/\.row[\s.,{:]/.test(m[1])) {
          risky.push(rel);
          break;
        }
      }
    }
    expect(risky.length, '应该至少有一个覆盖列表的媒体查询').toBeGreaterThan(0);
    for (const rel of risky) {
      expect(idx(rel), `${rel} 含 .row 媒体查询，却排在 ticker-list.css 之前`).toBeGreaterThan(listIdx);
    }
  });

  it('没有任何分片重复定义 @keyframes（同名会全局覆盖）', () => {
    const seen = new Map();
    for (const rel of EXPECTED) {
      for (const m of read(rel).matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)) {
        const name = m[1];
        if (seen.has(name)) {
          throw new Error(`@keyframes ${name} 同时出现在 ${seen.get(name)} 与 ${rel}`);
        }
        seen.set(name, rel);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('拆分前后规则数守恒：11 个文件里没有丢失 @media / @keyframes', () => {
    const all = EXPECTED.map(read).join('\n');
    // @media 仍是拆分时的 13 个 —— 这个数字只会因为真的新增响应式规则而变。
    expect((all.match(/@media/g) ?? []).length).toBe(13);
    // @keyframes：拆分时 16 个。地图 v2 加了 sunPulse（太阳直射点呼吸）
    // 与 maBreath（城市锚点开市呼吸），所以是 18。改这个数字时请确认是
    // 「新增动画」而不是「拆分时丢了又补回来」—— 下面那条唯一性断言会拦住重名。
    expect((all.match(/@keyframes/g) ?? []).length).toBe(18);
  });
});
