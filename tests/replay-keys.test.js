/* ================================================================== *
 * 回放键的归一（server/providers/replay.js）
 *
 * 回放能不能命中，全靠「同一个请求算出同一个键」。这里的几种形态都是
 * 真实会碰到的：query 顺序不同、大小写不同、hash 片段、相对路径、
 * 以及五种不同的 body 类型。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { canonicalUrl, requestKey, headerSignature } from '../src/server/providers/replay.js';

describe('canonicalUrl', () => {
  it('query 顺序与大小写不影响归一结果', () => {
    const a = canonicalUrl('HTTPS://Example.COM/Path?b=2&a=1');
    const b = canonicalUrl('https://example.com/Path?a=1&b=2');
    expect(a).toBe(b);
    expect(a).toContain('a=1');
  });

  it('丢掉 hash 片段（它不会发到服务端）', () => {
    expect(canonicalUrl('https://e.com/x?a=1#frag')).toBe('https://e.com/x?a=1');
  });

  it('同名参数的多个值也会排序（值本身参与比较）', () => {
    expect(canonicalUrl('https://e.com/x?a=2&a=1')).toBe('https://e.com/x?a=1&a=2');
  });

  it('不是合法 URL 时原样返回（不能把键搞炸）', () => {
    expect(canonicalUrl('./api/events?force=1')).toBe('./api/events?force=1');
  });
});

describe('requestKey', () => {
  it('方法大小写与缺省都归一成 GET', () => {
    expect(requestKey(undefined, 'https://e.com/x')).toBe(requestKey('get', 'https://e.com/x'));
  });

  it('同一个请求的两种等价写法得到同一个键', () => {
    expect(requestKey('GET', 'https://e.com/x?a=1&b=2')).toBe(requestKey('GET', 'https://e.com/x?b=2&a=1'));
  });

  it('五种 body 形态各自稳定（字符串 / Buffer / URLSearchParams / ArrayBuffer / 视图）', () => {
    const s1 = requestKey('POST', 'https://e.com/x', 'a=1');
    const s2 = requestKey('POST', 'https://e.com/x', 'a=1');
    expect(s1).toBe(s2);
    expect(requestKey('POST', 'https://e.com/x', Buffer.from('a=1'))).toContain('b:');
    expect(requestKey('POST', 'https://e.com/x', new URLSearchParams({ a: '1' }))).toContain('b:');
    expect(requestKey('POST', 'https://e.com/x', new TextEncoder().encode('a=1').buffer)).toContain('b:');
    expect(requestKey('POST', 'https://e.com/x', new Uint8Array([97, 61, 49]))).toContain('b:');
  });

  it('普通对象走 JSON，循环引用也不抛（退化成 String）', () => {
    expect(requestKey('POST', 'https://e.com/x', { a: 1 })).toContain('b:');
    const cyc = {};
    cyc.self = cyc;
    expect(() => requestKey('POST', 'https://e.com/x', cyc)).not.toThrow();
  });

  it('空 body 不产生 b: 段', () => {
    expect(requestKey('GET', 'https://e.com/x', '')).not.toContain('b:');
    expect(requestKey('GET', 'https://e.com/x', null)).not.toContain('b:');
  });

  /**
   * 凭据**只记「有没有」，不记值**（刻意如此：回放文件不该存 token）。
   * 代价要写清：同一 URL 换一个 token 会命中同一份夹具。这是隐私与可重放性
   * 之间的取舍，不是遗漏。
   */
  it('凭据只记存在性，不把 token 写进键', () => {
    const a = requestKey('GET', 'https://e.com/x', null, { Authorization: 'Bearer A' });
    const b = requestKey('GET', 'https://e.com/x', null, { Authorization: 'Bearer B' });
    expect(a).toBe(b);
    expect(a).toContain('a:present');
    expect(a).not.toContain('Bearer');
  });

  it('语义头（accept / content-type / referer / user-agent / x-requested-with）值不同则键不同', () => {
    const a = requestKey('GET', 'https://e.com/x', null, { Accept: 'application/json' });
    const b = requestKey('GET', 'https://e.com/x', null, { Accept: 'text/html' });
    expect(a).not.toBe(b);
    expect(a).toContain('h:');
  });

  it('不在名单里的头不参与键（避免键被无关头污染）', () => {
    const a = requestKey('GET', 'https://e.com/x', null, { 'X-Trace-Id': 'abc' });
    expect(a).toBe('GET https://e.com/x');
  });
});

describe('headerSignature', () => {
  it('返回 { digest, credential } 而不是字符串', () => {
    const out = headerSignature({ Accept: 'application/json' });
    expect(typeof out.digest).toBe('string');
    expect(out.credential).toBe(false);
  });

  it('语义头的键顺序不影响 digest', () => {
    const a = headerSignature({ Accept: 'application/json', 'User-Agent': 'x' });
    const b = headerSignature({ 'User-Agent': 'x', Accept: 'application/json' });
    expect(a.digest).toBe(b.digest);
  });

  it('没有头时给空签名且 credential=false', () => {
    expect(headerSignature(null)).toEqual({ digest: '', credential: false });
    expect(headerSignature({})).toEqual({ digest: '', credential: false });
  });

  it('知道凭据存在时 credential=true', () => {
    expect(headerSignature({ Authorization: 'Bearer x' }).credential).toBe(true);
  });

  it('Map 与普通对象等价', () => {
    const asMap = new Map([['accept', 'application/json']]);
    expect(headerSignature(asMap).digest).toBe(headerSignature({ accept: 'application/json' }).digest);
  });
});
