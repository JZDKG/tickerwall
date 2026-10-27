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
