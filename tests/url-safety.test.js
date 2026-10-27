/* ================================================================== *
 * 外链安全：只放行 http(s)
 *
 * 新闻 url 来自 RSS / 聚合索引，全是外部不可信数据。`esc()` 只转义 HTML
 * 实体，对 `javascript:alert(1)` 完全无效 —— 这类值一旦进了 href，读者
 * 一点就在本站执行对方的脚本。服务端与客户端各有一道，两个都测。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../src/server/domain/news-lexicon.js';
import { safeHref } from '../src/client/shared/format.js';
import pathMod from 'node:path';
import { readFileSync } from 'node:fs';

const ATTACKS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'javascript:alert(1)'.replace(':', '\t:'), // 制表符变形
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  '//evil.example.com/x',
  '/relative/path',
  '  javascript:alert(1)  ',
  '',
  '   ',
  null,
  undefined,
];

const OK = ['https://example.com/a?b=1', 'http://example.com/', 'https://例子.中国/路径'];

describe('服务端 sanitizeUrl：协议白名单', () => {
  it('拦掉所有非 http(s) 协议与相对路径', () => {
    for (const bad of ATTACKS) {
      expect(sanitizeUrl(bad), `应拦下 ${JSON.stringify(bad)}`).toBeNull();
    }
  });

  it('放行 http(s)，并归一化成绝对 URL', () => {
    for (const good of OK) {
      const out = sanitizeUrl(good);
      expect(out, `应放行 ${good}`).toBeTruthy();
      expect(out.startsWith('http')).toBe(true);
    }
    // 小写协议、去空白
    expect(sanitizeUrl(' HTTP://Example.com/x ')).toBe('http://example.com/x');
  });

  it('含控制字符的一律拦掉 —— 它们会让 URL 解析结果与字面不一致', () => {
    expect(sanitizeUrl('https://a.com/\nx')).toBeNull();
    expect(sanitizeUrl('https://a.com/\u0000')).toBeNull();
  });
});

describe('客户端 safeHref：第二道防线', () => {
  it('同样拦掉非 http(s)', () => {
    for (const bad of ATTACKS) {
      expect(safeHref(bad), `应拦下 ${JSON.stringify(bad)}`).toBe('');
    }
  });

  it('放行 http(s)，返回可直接进 href 的绝对地址', () => {
    for (const good of OK) {
      expect(safeHref(good).startsWith('http')).toBe(true);
    }
  });

  it('拦下时不返回 null/undefined 而返回空串，调用方好判断', () => {
    expect(safeHref('javascript:alert(1)')).toBe('');
    expect(typeof safeHref(null)).toBe('string');
  });
});

/* ================================================================== *
 * force=1 限流
 *
 * force 会跳过缓存直打上游，不设限就是一个放大器。这里锁住三条：
 * 不带 force 时不消耗预算、同一端点冷却、不同端点互不影响。
 * ================================================================== */

describe('takeForce：强制刷新的预算', () => {
  const u = (path, force) => new URL(`http://x${path}${force ? '?force=1' : ''}`);

  it('不带 force 直接放行成 false，且不消耗预算', async () => {
    const { takeForce } = await import('../src/server/http.js');
    expect(takeForce(u('/api/quotes', false))).toBe(false);
    expect(takeForce(u('/api/quotes', false))).toBe(false);
    // 预算没被消耗：紧接着的 force 仍然允许
    expect(takeForce(u('/api/quotes', true))).toBe(true);
  });

  it('同一端点第二次 force 被拒（静默退回缓存）', async () => {
    const { takeForce } = await import('../src/server/http.js');
    expect(takeForce(u('/api/briefing', true))).toBe(true);
    expect(takeForce(u('/api/briefing', true))).toBe(false);
  });

  it('不同端点各有自己的预算', async () => {
    const { takeForce } = await import('../src/server/http.js');
    expect(takeForce(u('/api/macro', true))).toBe(true);
    expect(takeForce(u('/api/calendar', true))).toBe(true);
  });

  it('带无限 id 的路径归到同一端点，Map 不会无限增长', async () => {
    const { takeForce } = await import('../src/server/http.js');
    // 第一次允许，之后全被拒 —— 说明它们共享同一个 key，而不是每个 id 一个
    expect(takeForce(u('/api/events/abc', true))).toBe(true);
    expect(takeForce(u('/api/events/def', true))).toBe(false);
    expect(takeForce(u('/api/events/ghi', true))).toBe(false);
  });

  it('不在白名单的路径不消耗也不放行', async () => {
    const { takeForce } = await import('../src/server/http.js');
    expect(takeForce(u('/api/_market', true))).toBe(false);
    expect(takeForce(u('/whatever', true))).toBe(false);
  });
});

/* ================================================================== *
 * 静态文件路径穿越
 *
 * 这是少数「写错了就是安全事故」的逻辑，原先埋在 server.mjs 里没法单测。
 * 抽成 resolveStaticPath 纯函数后就地覆盖：越界必须返回 null，
 * 正常路径必须落在 public/ 或 src/client/ 之内。
 * ================================================================== */

describe('resolveStaticPath：只放行 root 之内', () => {
  it('正常路径落在 public/ 下', async () => {
    const { resolveStaticPath } = await import('../src/server/http.js');
    const r = resolveStaticPath('/index.html');
    expect(r).not.toBeNull();
    expect(r.rel).toBe('/index.html');
    expect(r.full.endsWith('public/index.html')).toBe(true);
  });

  it('根路径映射到 index.html', async () => {
    const { resolveStaticPath } = await import('../src/server/http.js');
    expect(resolveStaticPath('/').rel).toBe('/index.html');
    expect(resolveStaticPath('').rel).toBe('/index.html');
  });

  it('/src/client/** 走另一个 root', async () => {
    const { resolveStaticPath } = await import('../src/server/http.js');
    const r = resolveStaticPath('/src/client/views/map.js');
    expect(r).not.toBeNull();
    expect(r.full.includes('/src/client/views/map.js')).toBe(true);
    expect(r.full.includes('/public/')).toBe(false);
  });

  const ATTACKS = [
    '/../package.json',
    '/../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/%2e%2e%2f%2e%2e%2fpackage.json',
    '/src/client/../../server.mjs',
    '/src/client/%2e%2e/%2e%2e/server.mjs',
    '/a/../../../../etc/hosts',
    '/%E0%A4%A', // 残缺的百分号序列，decodeURIComponent 会抛
    '/foo\0.png',
  ];

  // 核心不变量不是「必须返回 null」，而是「解析结果不能逃出 root」。
  // 绝对路径经 path.normalize 后前导 ../ 会被吃掉（/../x → /x），再 join
  // 到 root 上仍落在 root 内 —— 那是安全的 404，不是穿越。
  const escaped = (r) => {
    if (!r) return false;
    return !(r.full === r.root || r.full.startsWith(r.root + pathMod.sep));
  };

  it('没有任何穿越输入能落到 root 之外', async () => {
    const { resolveStaticPath } = await import('../src/server/http.js');
    for (const p of ATTACKS) {
      expect(escaped(resolveStaticPath(p)), `逃出了 root: ${p}`).toBe(false);
    }
  });

  it('尤其拿不到仓库根的 package.json / server.mjs', async () => {
    const { resolveStaticPath } = await import('../src/server/http.js');
    for (const p of ATTACKS) {
      const r = resolveStaticPath(p);
      if (!r) continue;
      if (r.full.endsWith('/package.json') || r.full.endsWith('/server.mjs')) {
        expect(
          r.full.includes('/public/') || r.full.includes('/src/client/'),
          `落到了仓库根: ${p} → ${r.full}`,
        ).toBe(true);
      }
    }
  });

  it('残缺的百分号序列与 NUL 直接拒绝', async () => {
    const { resolveStaticPath } = await import('../src/server/http.js');
    expect(resolveStaticPath('/%E0%A4%A')).toBeNull();
    expect(resolveStaticPath('/foo\u0000.png')).toBeNull();
  });
});

/* ================================================================== *
 * 事件输出：url 只能是 http(s) 或 null
 *
 * sanitizeUrl 本身有单测，但那只证明「函数对」。真正要守的是「所有出口都
 * 过了它」—— events.service.js 里有 6 处 url 赋值（三个中文源、归档写入、
 * 全球 feed、历史回读），漏一处就是这个洞。
 *
 * 用静态断言而不是跑一遍抓取：源是外网，不可控，也不该在单测里打出去。
 * ================================================================== */
describe('events.service 的 url 出口全部经 sanitizeUrl', () => {
  it('没有裸的 url 赋值', () => {
    const code = readFileSync(new URL('../src/server/services/events.service.js', import.meta.url), 'utf8');
    // 逐行找 `url: <expr>`，要求右边必须以 sanitizeUrl( 开头
    const bad = [];
    for (const line of code.split('\n')) {
      const m = /^\s*url:\s*(.+?),?\s*$/.exec(line);
      if (!m) continue;
      const rhs = m[1];
      if (!rhs.startsWith('sanitizeUrl(')) bad.push(line.trim());
    }
    expect(bad, `以下 url 赋值没有清洗：\n${bad.join('\n')}`).toEqual([]);
  });
});

/* ================================================================== *
 * 静态目录回退必须传原始 pathname
 *
 * 原实现递归时传的是已被截掉 `/src/client` 前缀的 `rel`，于是
 * /src/client/views/ 会被再解析一次成 public/views/ → 404。
 *
 * 当前仓库里没有「子目录 + index.html」的组合，这个 bug 无法从 HTTP 侧
 * 观察到（改前改后都是 404），所以用静态断言锁住修法本身。
 * ================================================================== */
describe('serveStatic 目录回退与 405 顺序', () => {
  it('递归传原始 pathname 而不是已截断的 rel', () => {
    const code = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
    expect(code).toContain("path.posix.join(pathname, '/index.html')");
    expect(code).not.toContain("path.posix.join(rel, 'index.html')");
  });

  it('405 在任何分发之前判，不会把 POST /api/* 当成 GET', () => {
    const code = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
    const i405 = code.indexOf('405');
    const iQuotes = code.indexOf("url.pathname === '/api/quotes'");
    expect(i405).toBeGreaterThan(0);
    expect(i405).toBeLessThan(iQuotes);
  });
});
