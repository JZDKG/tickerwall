/* ================================================================== *
 * 上游运行时：fetchRaw 传输语义、Sina/CBOE 解析补齐、feed 链接回落
 *
 * providers.test.js 覆盖了大部分纯解析；这里补「抓取底座」和只在异常/冷门
 * 分支才走到的路径：超时映射、非 2xx 带原因、gb18030 解码、CBOE 运行时缓存、
 * RSS 只有 <link>/<guid> 时的链接提取。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setFetcher, fetchRaw, splitSinaPipe } from '../src/server/providers/http.js';
import {
  parseSinaSpot,
  parseSinaGlobal,
  parseSinaSimpleIndex,
  parseSinaFutures,
} from '../src/server/providers/sina.js';
import {
  CBOE_MIN_ROWS,
  parseCboeCsv,
  parseCboeCsvOrThrow,
  cboeQuoteFromRows,
  cboeIndexRows,
  cboeIndex,
  fetchCboeIndexDetail,
  fetchCboeVix,
  cboeCache,
} from '../src/server/providers/cboe.js';
import { parseFeed } from '../src/server/providers/news-feeds.js';

const enc = (s) => new TextEncoder().encode(s);

function fakeResponse({ ok = true, status = 200, body = '', bytes = null } = {}) {
  const buf = bytes ?? enc(body);
  return {
    ok,
    status,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => body,
  };
}

afterEach(() => {
  setFetcher(null);
  cboeCache.clear();
  vi.useRealTimers();
});

/* ------------------------------ fetchRaw ------------------------------ */

describe('fetchRaw：传输语义', () => {
  it('默认带 UA 与 Accept，返回 utf-8 文本', async () => {
    const calls = [];
    setFetcher(async (url, init) => {
      calls.push([url, init]);
      return fakeResponse({ body: 'hello' });
    });
    await expect(fetchRaw('https://x.test/a')).resolves.toBe('hello');
    expect(calls[0][1].headers['User-Agent']).toMatch(/Mozilla/);
    expect(calls[0][1].headers.Accept).toBe('*/*');
    expect(calls[0][1].signal).toBeTruthy();
  });

  it('omitUa 时不发 UA；自定义 header 覆盖默认', async () => {
    let init;
    setFetcher(async (_url, i) => {
      init = i;
      return fakeResponse({ body: 'x' });
    });
    await fetchRaw('https://x.test/', { omitUa: true, headers: { Referer: 'r', Accept: 'text/csv' } });
    expect(init.headers['User-Agent']).toBeUndefined();
    expect(init.headers.Referer).toBe('r');
    expect(init.headers.Accept).toBe('text/csv');
  });

  it('POST body 透传；GET 不带 body 字段', async () => {
    const seen = [];
    setFetcher(async (_url, init) => {
      seen.push(init);
      return fakeResponse({ body: 'ok' });
    });
    await fetchRaw('https://x.test/', { method: 'POST', body: '{"a":1}' });
    expect(seen[0].method).toBe('POST');
    expect(seen[0].body).toBe('{"a":1}');
    await fetchRaw('https://x.test/');
    expect('body' in seen[1]).toBe(false);
  });

  it('gb18030 按字节解码，不出现问号', async () => {
    // 「伦敦金」的 gb18030 字节
    setFetcher(async () => fakeResponse({ bytes: Buffer.from([0xc2, 0xd7, 0xb6, 0xd8, 0xbd, 0xf0]) }));
    await expect(fetchRaw('https://x.test/', { encoding: 'gb18030' })).resolves.toBe('伦敦金');
  });

  it('非 2xx 抛 HTTP 状态，并截取响应体前 160 字', async () => {
    setFetcher(async () => fakeResponse({ ok: false, status: 429, body: 'slow down' }));
    await expect(fetchRaw('https://x.test/')).rejects.toThrow('HTTP 429: slow down');
    setFetcher(async () => fakeResponse({ ok: false, status: 500, body: '' }));
    await expect(fetchRaw('https://x.test/')).rejects.toThrow('HTTP 500');
  });

  it('AbortError 统一翻译成「请求超时」，其他错误原样抛', async () => {
    setFetcher(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    await expect(fetchRaw('https://x.test/')).rejects.toThrow('请求超时');
    setFetcher(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(fetchRaw('https://x.test/')).rejects.toThrow('ECONNRESET');
  });

  it('超时定时器在请求结束后被清掉（不会留下悬挂 timer）', async () => {
    vi.useFakeTimers();
    setFetcher(async () => fakeResponse({ body: 'ok' }));
    await fetchRaw('https://x.test/', { timeoutMs: 50 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('splitSinaPipe 解析竖线串，非该形状返回 null', () => {
    expect(splitSinaPipe('var t="a|b|c";')).toEqual(['a', 'b', 'c']);
    expect(splitSinaPipe('nope')).toBeNull();
  });
});

/* ------------------------------ Sina 解析补齐 ------------------------------ */

describe('Sina 纯解析：缺字段与坏输入', () => {
  it('parseSinaSpot：空响应 / 无效价抛错；其余字段允许缺失', () => {
    expect(() => parseSinaSpot('nope')).toThrow('空响应');
    expect(() => parseSinaSpot('var hq_str_x="0,1,2";')).toThrow('价格无效');
    const out = parseSinaSpot('var hq_str_x="560,0,0,0";');
    expect(out.price).toBe(560);
    expect(out.prevClose).toBeNull();
    expect(out.note).toBeNull();
  });

  it('parseSinaGlobal：缺昨收时用涨跌额反推；无涨跌额则 null', () => {
    const f = Array.from({ length: 27 }, () => '');
    f[1] = '100';
    f[4] = '2';
    expect(parseSinaGlobal(`var hq_str_x="${f.join(',')}";`).prevClose).toBe(98);

    f[4] = '';
    expect(parseSinaGlobal(`var hq_str_x="${f.join(',')}";`).prevClose).toBeNull();
    expect(() => parseSinaGlobal(`var hq_str_x="${Array(27).fill('0').join(',')}";`)).toThrow('价格无效');
  });

  it('parseSinaSimpleIndex / parseSinaFutures：空响应与无效价', () => {
    expect(() => parseSinaSimpleIndex('nope')).toThrow('空响应');
    expect(() => parseSinaSimpleIndex('var hq_str_x="n,0,0";')).toThrow('价格无效');
    expect(() => parseSinaFutures('nope')).toThrow('空响应');
    expect(() => parseSinaFutures('var hq_str_x="0,0,0";')).toThrow('价格无效');

    const out = parseSinaFutures('var hq_str_x="401.2,1.2,0.3,0,0,402,400,2026-10-26,399";');
    expect(out).toMatchObject({ price: 401.2, change: 1.2, changePct: 0.3, high: 402, low: 400, prevClose: 399 });
  });

  it('所有新浪解析器都对「不是行情串」的输入抛空响应，而不是 TypeError', () => {
    for (const fn of [parseSinaSpot, parseSinaGlobal, parseSinaSimpleIndex, parseSinaFutures]) {
      expect(() => fn('not a quote')).toThrow('空响应');
      expect(() => fn('')).toThrow('空响应');
    }
  });
});

/* ------------------------------ CBOE 运行时 ------------------------------ */

describe('CBOE：行数校验、报价映射与 10 分钟缓存', () => {
  const csv = (n) =>
    ['DATE,OPEN,HIGH,LOW,CLOSE', ...Array.from({ length: n }, (_, i) => `01/${String((i % 28) + 1).padStart(2, '0')}/2020,10,11,9,${10 + i / 10}`)].join('\n');

  it('parseCboeCsvOrThrow：不足 50 行视为抓到了错误页', () => {
    expect(CBOE_MIN_ROWS).toBe(50);
    expect(() => parseCboeCsvOrThrow(csv(10), 'VIX')).toThrow('VIX CSV 解析失败');
    expect(parseCboeCsvOrThrow(csv(60), 'VIX')).toHaveLength(60);
  });

  it('cboeQuoteFromRows：取最后两行，数据不足抛错', () => {
    const rows = parseCboeCsv(csv(60));
    const out = cboeQuoteFromRows(rows, 'VIX');
    expect(out.price).toBe(rows[rows.length - 1].close);
    expect(out.prevClose).toBe(rows[rows.length - 2].close);
    expect(out.sessionTime).toBe(rows[rows.length - 1].date);
    expect(out.note).toBe('VIX 日收盘');
    expect(() => cboeQuoteFromRows([{ close: 1 }], 'VIX')).toThrow('数据不足');
    expect(() => cboeQuoteFromRows(undefined, 'VIX')).toThrow('数据不足');
  });

  it('cboeIndexRows：抓一次并缓存 10 分钟；cboeIndex().load() 走同一份', async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls += 1;
      expect(String(url)).toContain('VIX_History.csv');
      return fakeResponse({ body: csv(60) });
    };
    try {
      const a = await cboeIndexRows('VIX');
      const b = await cboeIndexRows('VIX');
      expect(a).toBe(b);
      expect(calls).toBe(1);

      const q = await cboeIndex('VIX').load();
      expect(q.price).toBe(a[a.length - 1].close);
      expect(calls).toBe(1);

      const detail = await fetchCboeIndexDetail('VIX');
      expect(detail.meta).toEqual({ source: 'cboe:VIX', name: 'VIX', code: 'VIX' });
      const vix = await fetchCboeVix();
      expect(vix.rows.length).toBe(60);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('缓存过期后重新抓', async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return fakeResponse({ body: csv(60) });
    };
    try {
      vi.useFakeTimers();
      await cboeIndexRows('VXN');
      vi.setSystemTime(Date.now() + 11 * 60_000);
      await cboeIndexRows('VXN');
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

/* ------------------------------ feed 链接回落 ------------------------------ */

describe('parseFeed：只有 <link> / <guid> 时的链接提取', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const item = (inner) => `<rss><channel><item>${inner}</item></channel></rss>`;
  const date = '<pubDate>Sun, 26 Oct 2026 10:00:00 GMT</pubDate>';

  it('Atom 风格的 <link href> 优先', () => {
    const xml = item(`<title>T</title>${date}<link rel="alternate" href="https://e.test/a" />`);
    expect(parseFeed(xml, { now }).items[0].url).toBe('https://e.test/a');
  });

  it('RSS 的 <link>文本</link> 也能取到', () => {
    const xml = item(`<title>T</title>${date}<link>https://e.test/b</link>`);
    expect(parseFeed(xml, { now }).items[0].url).toBe('https://e.test/b');
  });

  it('只有 <guid> 里的 URL 时回落到它；非 URL 的 guid 不当作链接', () => {
    const withUrl = item(`<title>T</title>${date}<guid>https://e.test/c</guid>`);
    expect(parseFeed(withUrl, { now }).items[0].url).toBe('https://e.test/c');
    expect(parseFeed(withUrl, { now }).items[0].guid).toBe('https://e.test/c');

    const nonUrl = item(`<title>T</title>${date}<guid>tag:foo,2026:1</guid>`);
    const out = parseFeed(nonUrl, { now });
    expect(out.items[0].url).toBeNull();
    expect(out.items[0].guid).toBe('tag:foo,2026:1');
  });

  it('过旧条目被丢弃；标题为空也丢弃；itemCount 仍反映原始块数', () => {
    const old = item(`<title>旧</title><pubDate>Mon, 01 Jan 2020 00:00:00 GMT</pubDate>`);
    const empty = item(`${date}`);
    const out = parseFeed(old + empty, { now });
    expect(out.items).toEqual([]);
    expect(out.itemCount).toBe(2);
  });
});
