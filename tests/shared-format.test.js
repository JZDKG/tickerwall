/* ================================================================== *
 * client/shared 格式化、缓存与总线的行为测试
 *
 * 这些是全站显示口径的唯一来源：价格小数位、涨跌符号、极小百分比、
 * URL 白名单、迷你走势、来源名美化。之前只有 html`` 模板有测试，
 * 其余函数（尤其 safeHref 的协议白名单）实际是裸奔的。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  numFmt,
  fmtPrice,
  fmtSigned,
  fmtPct,
  esc,
  safeHref,
  attrHref,
  html,
  raw,
  dirOf,
  clockText,
  sparklineSVG,
  metaRange,
  prettySource,
} from '../src/client/shared/format.js';
import { loadCalendarCached } from '../src/client/shared/calendar.js';
import { store } from '../src/client/shared/store.js';
import { on, off, emit } from '../src/client/shared/bus.js';

/* ------------------------------ 数字格式 ------------------------------ */

describe('format：数字', () => {
  it('numFmt 按小数位缓存同一个 Intl 实例', () => {
    expect(numFmt(2)).toBe(numFmt(2));
    expect(numFmt(2)).not.toBe(numFmt(3));
    expect(numFmt(0).format(1234)).toBe('1,234');
  });

  it('fmtPrice：空值与非有限数显示破折号', () => {
    expect(fmtPrice(null, 2)).toBe('—');
    expect(fmtPrice(undefined, 2)).toBe('—');
    expect(fmtPrice(Number.NaN, 2)).toBe('—');
    expect(fmtPrice(Number.POSITIVE_INFINITY, 2)).toBe('—');
    expect(fmtPrice(0, 2)).toBe('0.00');
    expect(fmtPrice(3364.5, 2)).toBe('3,364.50');
  });

  it('fmtSigned：正数带 +，负数带 -，0 不带符号', () => {
    expect(fmtSigned(1.2, 2)).toBe('+1.20');
    expect(fmtSigned(-1.2, 2)).toBe('-1.20');
    expect(fmtSigned(0, 2)).toBe('0.00');
    expect(fmtSigned(null, 2)).toBe('—');
    expect(fmtSigned(Number.NaN, 2)).toBe('—');
  });

  it('fmtPct：极小幅度多给一位，避免显示成 -0.00%', () => {
    expect(fmtPct(-0.004)).toBe('-0.004%');
    expect(fmtPct(0.004)).toBe('+0.004%');
    expect(fmtPct(-1.234)).toBe('-1.23%');
    expect(fmtPct(0)).toBe('0.00%');
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct(Number.NaN)).toBe('—');
  });

  it('dirOf：0 / 非有限数算 flat', () => {
    expect(dirOf(1)).toBe('up');
    expect(dirOf(-1)).toBe('down');
    expect(dirOf(0)).toBe('flat');
    expect(dirOf(null)).toBe('flat');
    expect(dirOf(Number.NaN)).toBe('flat');
  });

  it('clockText 输出不含 AM/PM 的 24 小时制', () => {
    const text = clockText(new Date(2026, 0, 2, 15, 4, 5));
    expect(text).toMatch(/^15:04:05$/);
  });
});

/* ------------------------------ 转义 / URL ------------------------------ */

describe('format：转义与 URL 白名单', () => {
  it('esc 转义五类实体，null 变空串', () => {
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(esc(null)).toBe('');
    expect(esc(0)).toBe('0');
  });

  it('safeHref 只放行 http/https 绝对地址', () => {
    expect(safeHref('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(safeHref('http://example.com/')).toBe('http://example.com/');
    expect(safeHref('javascript:alert(1)')).toBe('');
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeHref('file:///etc/passwd')).toBe('');
    expect(safeHref('/relative/path')).toBe('');
    expect(safeHref('   ')).toBe('');
    expect(safeHref(null)).toBe('');
    expect(safeHref(undefined)).toBe('');
  });

  it('safeHref 拒绝含控制字符的地址（拆属性注入）', () => {
    expect(safeHref('https://e.com/\n"onmouseover=alert(1)')).toBe('');
    expect(safeHref('https://e.com/\u0000')).toBe('');
  });

  it('attrHref：合法地址转义，非法地址整段为空', () => {
    expect(attrHref('https://e.com/?q=1&r=2')).toBe('https://e.com/?q=1&amp;r=2');
    expect(attrHref('javascript:alert(1)')).toBe('');
    expect(attrHref(undefined)).toBe('');
  });

  it('html：嵌套 SafeHtml 不会被二次转义，数组递归拼接', () => {
    const inner = html`<i>${'<x>'}</i>`;
    expect(html`<p>${inner}</p>`.toString()).toBe('<p><i>&lt;x&gt;</i></p>');
    expect(html`<ul>${[html`<li>${1}</li>`, html`<li>${2}</li>`]}</ul>`.toString()).toBe(
      '<ul><li>1</li><li>2</li></ul>',
    );
    expect(html`${raw('<b>原样</b>')}`.toString()).toBe('<b>原样</b>');
  });

  it('html：未加引号的属性插值直接抛错', () => {
    expect(() => html`<a href=${'https://e.com'}>x</a>`).toThrow(/未加引号的属性插值/);
    // 引号在静态片段里也一样拒绝
    expect(() => html`<a href="${'x'}" onclick=${'alert(1)'}>`).toThrow(/未加引号的属性插值/);
  });

  it('html：正文里的等号不是属性，不该误杀', () => {
    expect(html`<p>总计 = ${3}</p>`.toString()).toBe('<p>总计 = 3</p>');
    expect(html`<p>1 USD = ${7.1} CNY</p>`.toString()).toBe('<p>1 USD = 7.1 CNY</p>');
    // 属性值已经在引号里，等号出现也不算未加引号
    // 静态片段原样输出（& 要由模板作者写成 &amp;）；插值里的 & 才会被转义
    expect(html`<a href="https://e.com/?a=${1}&b=${2}">x</a>`.toString()).toBe(
      '<a href="https://e.com/?a=1&b=2">x</a>',
    );
    expect(html`<a href="${'https://e.com/?a=1&b=2'}">x</a>`.toString()).toBe(
      '<a href="https://e.com/?a=1&amp;b=2">x</a>',
    );
  });

  it('raw 对 null 输出空串', () => {
    expect(raw(null).toString()).toBe('');
    expect(raw(undefined).toString()).toBe('');
  });
});

/* ------------------------------ 迷你走势 ------------------------------ */

describe('format：sparkline 与元信息', () => {
  const pts = (vals) => vals.map((p) => ({ p }));

  it('少于两个有效点显示占位符', () => {
    expect(sparklineSVG([], 'up')).toContain('走势积累中');
    expect(sparklineSVG(pts([1]), 'up')).toContain('走势积累中');
    expect(sparklineSVG(pts([1, null, Number.NaN]), 'up')).toContain('走势积累中');
    expect(sparklineSVG(null, 'up')).toContain('走势积累中');
  });

  it('正常序列生成 SVG，颜色随方向变化', () => {
    const up = sparklineSVG(pts([1, 2, 3]), 'up');
    expect(up).toMatch(/^<svg viewBox="0 0 240 56"/);
    expect(up).toContain('var(--up)');
    expect(sparklineSVG(pts([1, 2, 3]), 'down')).toContain('var(--down)');
    expect(sparklineSVG(pts([1, 2, 3]), 'flat')).toContain('var(--flat)');
  });

  it('水平序列自动加 padding，不出现除零（NaN 坐标）', () => {
    const flat = sparklineSVG(pts([5, 5, 5]), 'flat');
    expect(flat).not.toContain('NaN');
    const zero = sparklineSVG(pts([0, 0, 0]), 'flat');
    expect(zero).not.toContain('NaN');
  });

  it('自定义宽高进入 viewBox', () => {
    expect(sparklineSVG(pts([1, 2]), 'up', 100, 20)).toContain('viewBox="0 0 100 20"');
  });

  it('metaRange：高低优先，没有高低才回落到昨收/昨结算', () => {
    expect(metaRange({ high: 10, low: 8, decimals: 2 })).toBe('高 10.00 / 低 8.00');
    expect(metaRange({ high: 10, decimals: 2 })).toBe('高 10.00');
    expect(metaRange({ prevClose: 9, decimals: 2 })).toBe('昨收 9.00');
    expect(metaRange({ prevClose: 9, priceBasis: 'settle', decimals: 2 })).toBe('昨结算 9.00');
    expect(metaRange({})).toBe('');
  });

  it('prettySource：已知前缀翻译成产品名，未知/空值各自兜底', () => {
    expect(prettySource('sina-futures:CL')).toBe('新浪期货 CL');
    expect(prettySource('sina-forex:DINIW')).toBe('新浪外汇 DINIW');
    expect(prettySource('sina-inner:AU0')).toBe('新浪期货 AU0');
    expect(prettySource('sina-us:$inx')).toBe('新浪美股 $inx');
    expect(prettySource('sina:hf_XAU')).toBe('新浪 hf_XAU');
    expect(prettySource('eastmoney:1.000001')).toBe('东财 1.000001');
    expect(prettySource('binance:BTCUSDT')).toBe('Binance BTCUSDT');
    expect(prettySource('coinbase:BTC-USD')).toBe('Coinbase BTC-USD');
    expect(prettySource('gold-api:XAU')).toBe('gold-api XAU');
    expect(prettySource('fred:DGS10')).toBe('FRED DGS10');
    expect(prettySource('nasdaq:NDX')).toBe('Nasdaq NDX');
    expect(prettySource('tencent:sh000001')).toBe('腾讯 sh000001');
    expect(prettySource('cnbc:.SPX')).toBe('CNBC .SPX');
    expect(prettySource('yahoo:^GSPC')).toBe('Yahoo ^GSPC');
    expect(prettySource('cboe:VIX')).toBe('CBOE VIX');
    expect(prettySource('calc:gold-cn')).toBe('折算·gold-cn');
    expect(prettySource('unknown:x')).toBe('unknown:x');
    expect(prettySource('')).toBe('—');
    expect(prettySource(null)).toBe('—');
  });
});

/* ------------------------------ 日历缓存 ------------------------------ */

describe('calendar：一次取数、按需强刷', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    store.calendar = null;
  });

  it('已缓存且非强制时不再请求', async () => {
    const cached = { events: [{ id: 'fomc' }] };
    store.calendar = cached;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    await expect(loadCalendarCached()).resolves.toBe(cached);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('命中接口后写入 store 并返回', async () => {
    const payload = { events: [{ id: 'cpi' }] };
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }));
    await expect(loadCalendarCached(true)).resolves.toBe(payload);
    expect(store.calendar).toBe(payload);
  });

  it('非 2xx 保留旧值（不清空、不抛）', async () => {
    store.calendar = { keep: true };
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    await expect(loadCalendarCached(true)).resolves.toEqual({ keep: true });
  });

  it('网络异常同样不抛，返回当前缓存', async () => {
    store.calendar = null;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(loadCalendarCached(true)).resolves.toBeNull();
  });
});

/* ------------------------------ 发布订阅 ------------------------------ */

describe('bus：订阅 / 退订 / 异常隔离', () => {
  let log;
  const realWarn = console.warn;
  beforeEach(() => {
    log = [];
    console.warn = (...a) => log.push(a.join(' '));
  });
  afterEach(() => {
    console.warn = realWarn;
  });

  it('emit 把 payload 发给所有订阅者', () => {
    const got = [];
    const off1 = on('quotes', (p) => got.push(['a', p]));
    on('quotes', (p) => got.push(['b', p]));
    emit('quotes', 42);
    expect(got).toEqual([['a', 42], ['b', 42]]);
    off1();
    off('quotes', () => {});
    emit('quotes', 43);
    expect(got.filter(([k]) => k === 'a')).toHaveLength(1);
  });

  it('on 返回的取消函数可退订', () => {
    const fn = vi.fn();
    const cancel = on('topic-x', fn);
    emit('topic-x', 1);
    cancel();
    emit('topic-x', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('没有订阅者时 emit 静默返回', () => {
    expect(() => emit('nobody', {})).not.toThrow();
  });

  it('单个订阅者抛错不影响其他订阅者，并打警告', () => {
    const ok = vi.fn();
    on('boom', () => {
      throw new Error('bad');
    });
    on('boom', ok);
    emit('boom', null);
    expect(ok).toHaveBeenCalled();
    expect(log.join('\n')).toMatch(/\[bus\] boom 的订阅者抛错/);
  });

  it('退订不存在的处理器不抛错', () => {
    expect(() => off('ghost', () => {})).not.toThrow();
  });
});
