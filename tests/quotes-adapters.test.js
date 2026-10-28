/* ================================================================== *
 * 报价服务（一）：各数据源适配器 + 降级链
 *
 * 12 个上游的字段下标各不相同（新浪就有四种排布），写错一个下标不会报错，
 * 只会把昨收当现价。这里对每个适配器喂「与真实响应同构」的文本，断言
 * 字段映射、空响应/无效价语义、以及降级链的涨跌幅重算口径。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/server/providers/http.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchRaw: vi.fn() };
});

vi.mock('../src/server/db/index.js', () => ({
  getDb: vi.fn(),
  readDailyCache: vi.fn(),
  writeDailyCache: vi.fn(),
  takeSnapshot: vi.fn(),
  readSnapshots: vi.fn(),
  readJson: vi.fn(),
  writeHistoryFile: vi.fn(),
  registerFlushHook: vi.fn(),
}));

const { fetchRaw } = await import('../src/server/providers/http.js');
const { readDailyCache, writeDailyCache } = await import('../src/server/db/index.js');
const q = await import('../src/server/services/quotes.service.js');

const {
  hhmmss,
  sinaSpot,
  sinaGlobal,
  sinaSimpleIndex,
  sinaIndexFull,
  sinaFutures,
  eastmoney,
  binance,
  coinbase,
  goldApi,
  sinaForexQuote,
  fredQuote,
  yahooQuote,
  yahooQuoteOnce,
  parseYahooChart,
  cnbcBatchFetch,
  cnbcQuote,
  tencentQuote,
  sinaInt,
  loadWithFallback,
} = q;

const sina = (fields) => `var hq_str_x="${fields.join(',')}";`;
const pad = (n) => Array.from({ length: n }, () => '');

beforeEach(() => {
  fetchRaw.mockReset();
  readDailyCache.mockReset();
  writeDailyCache.mockReset();
  readDailyCache.mockResolvedValue(null);
  writeDailyCache.mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------ 基础工具 ------------------------------ */

describe('基础工具', () => {
  it('dailyCacheFile 指向 <DATA_DIR>/daily/<id>.json；findInstrument 覆盖详情专用标的', () => {
    expect(q.dailyCacheFile('sp500').endsWith('/daily/sp500.json')).toBe(true);
    expect(q.findInstrument('gold-cn')?.id).toBe('gold-cn');
    expect(q.findInstrument('brent')?.id).toBe('brent'); // DETAIL_ONLY_INSTRUMENTS
    expect(q.findInstrument('vxn')?.id).toBe('vxn');
    expect(q.findInstrument('nope')).toBeNull();
  });

  it('hhmmss 只接受 6 位数字，其余返回 null', () => {
    expect(hhmmss('093000')).toBe('09:30:00');
    expect(hhmmss(93000)).toBe('09:30:00');
    expect(hhmmss('93000')).toBe('09:30:00');
    expect(hhmmss('09:30:00')).toBeNull();
    // 空串经 padStart 会变成 000000 —— 这是既有行为，不在这里改口径
    expect(hhmmss('')).toBe('00:00:00');
    expect(hhmmss(null)).toBe('00:00:00'); // null ?? '' 同样落到 000000
  });
});

/* ------------------------------ 新浪系列 ------------------------------ */

describe('新浪适配器：四种字段排布', () => {
  it('现货：0 现价 / 4 高 / 5 低 / 6 时间 / 7 昨收 / 8 开', async () => {
    fetchRaw.mockResolvedValue(
      sina(['560.10', '0', '0', '0', '561.5', '559.2', '2026-10-26 14:30:00', '558.0', '559.0', '', '', '', '', '沪金']),
    );
    const out = await sinaSpot('gds_AU9999').load();
    expect(out).toMatchObject({
      price: 560.1,
      high: 561.5,
      low: 559.2,
      prevClose: 558,
      open: 559,
      sessionTime: '2026-10-26 14:30:00',
      note: '沪金',
    });
  });

  it('美股指数：1 最新 / 2 涨跌幅 / 4 涨跌额 / 26 昨收', async () => {
    const f = pad(27);
    f[1] = '5738.2';
    f[2] = '0.83';
    f[3] = '2026-10-25 16:00:00';
    f[4] = '47.2';
    f[5] = '5700';
    f[6] = '5750';
    f[7] = '5680';
    f[26] = '5691.0';
    fetchRaw.mockResolvedValue(sina(f));
    const out = await sinaGlobal('gb_$inx').load();
    expect(out.price).toBe(5738.2);
    expect(out.prevClose).toBe(5691);
    expect(out.changePct).toBe(0.83);
    expect(out.high).toBe(5750);
    expect(out.sessionTime).toBe('16:00:00'); // 只留时间部分
  });

  it('美股指数缺昨收时用「现价 − 涨跌额」反推', async () => {
    const f = pad(27);
    f[1] = '100';
    f[4] = '2.5';
    fetchRaw.mockResolvedValue(sina(f));
    expect((await sinaGlobal('gb_$ndx').load()).prevClose).toBe(97.5);
  });

  it('A 股简版：1 现价 / 2 涨跌额 / 3 涨跌幅', async () => {
    fetchRaw.mockResolvedValue(sina(['上证指数', '3200.5', '12.3', '0.39', '123456', '98765']));
    const out = await sinaSimpleIndex('s_sh000001').load();
    expect(out).toMatchObject({ price: 3200.5, change: 12.3, changePct: 0.39, prevClose: 3188.2 });
  });

  it('A 股完整版：3 现价 / 2 昨收 / 1 开 / 4 高 / 5 低 / 31 时间', async () => {
    const f = pad(32);
    f[1] = '3190';
    f[2] = '3180';
    f[3] = '3201';
    f[4] = '3210';
    f[5] = '3175';
    f[31] = '15:00:00';
    fetchRaw.mockResolvedValue(sina(f));
    const out = await sinaIndexFull('sh000001').load();
    expect(out).toMatchObject({ price: 3201, prevClose: 3180, open: 3190, high: 3210, low: 3175, sessionTime: '15:00:00' });
  });

  it('国内期货：8 最新 / 10 昨结算，时间走 hhmmss', async () => {
    const f = pad(15);
    f[1] = '093000';
    f[2] = '555';
    f[3] = '562';
    f[4] = '554';
    f[8] = '560.5';
    f[10] = '556.2';
    fetchRaw.mockResolvedValue(sina(f));
    const out = await sinaFutures('nf_AU0').load();
    expect(out).toMatchObject({ price: 560.5, prevClose: 556.2, open: 555, high: 562, low: 554, sessionTime: '09:30:00' });
  });

  it('期货缺最新价时回落到 6 号字段', async () => {
    const f = pad(15);
    f[6] = '401.2';
    f[1] = '101500';
    fetchRaw.mockResolvedValue(sina(f));
    expect((await sinaFutures('nf_CL0').load()).price).toBe(401.2);
  });

  it('国际指数：1 现价 / 2 涨跌额 / 3 涨跌幅，昨收由差值还原', async () => {
    fetchRaw.mockResolvedValue(sina(['恒生指数', '20500.5', '-120.4', '-0.58']));
    const out = await sinaInt('int_hangseng').load();
    expect(out).toMatchObject({ price: 20500.5, change: -120.4, changePct: -0.58, prevClose: 20620.9 });
  });

  it('外汇：8 现价优先，0 时间 / 3 昨收 / 5-7 开高低', async () => {
    fetchRaw.mockResolvedValue(
      sina(['2026-10-26 10:00:00', '0', '0', '101.5', '0', '101.2', '101.9', '100.8', '101.8']),
    );
    const out = await sinaForexQuote('DINIW').load();
    expect(out).toMatchObject({ price: 101.8, prevClose: 101.5, open: 101.2, high: 101.9, low: 100.8 });
  });

  it('所有新浪适配器：空响应 / 无效价都抛错（由降级链接管）', async () => {
    fetchRaw.mockResolvedValue('garbage');
    await expect(sinaSpot('hf_XAU').load()).rejects.toThrow('空响应');
    await expect(sinaSimpleIndex('s_sh000001').load()).rejects.toThrow('空响应');

    fetchRaw.mockResolvedValue(sina(pad(32)));
    await expect(sinaSpot('hf_XAU').load()).rejects.toThrow('价格无效');
    await expect(sinaGlobal('gb_$inx').load()).rejects.toThrow('价格无效');
    await expect(sinaIndexFull('sh000001').load()).rejects.toThrow('价格无效');
    await expect(sinaFutures('nf_AU0').load()).rejects.toThrow('价格无效');
    await expect(sinaForexQuote('DINIW').load()).rejects.toThrow('价格无效');
    await expect(sinaInt('int_x').load()).rejects.toThrow('价格无效');
  });
});

/* ------------------------------ 东财 / 加密 / gold-api ------------------------------ */

describe('东财 / Binance / Coinbase / gold-api', () => {
  it('东财按 f59 小数位缩放，涨跌幅是 ×100 的整数', async () => {
    fetchRaw.mockResolvedValue(
      JSON.stringify({ data: { f43: 32015, f44: 32100, f45: 31800, f46: 31900, f59: 2, f60: 31800, f169: 215, f170: 68 } }),
    );
    const out = await eastmoney('1.000001').load();
    expect(out).toMatchObject({ price: 320.15, prevClose: 318, change: 2.15, changePct: 0.68, open: 319, high: 321, low: 318 });
  });

  it('东财缺 f59 时按 2 位小数；0 值不当成有效字段', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { f43: 100, f44: 0, f45: 0, f46: 0, f60: 0 } }));
    const out = await eastmoney('100.UDI').load();
    expect(out.price).toBe(1);
    expect(out.prevClose).toBeNull();
    expect(out.open).toBeNull();
    expect(out.high).toBeNull();
  });

  it('东财无 data / 非法价抛错', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify({}));
    await expect(eastmoney('1.1').load()).rejects.toThrow('无数据');
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { f43: 0, f59: 2 } }));
    await expect(eastmoney('1.1').load()).rejects.toThrow('价格无效');
  });

  it('Binance 24h ticker 全字段映射', async () => {
    fetchRaw.mockResolvedValue(
      JSON.stringify({ lastPrice: '68000.5', prevClosePrice: '67000', priceChange: '1000.5', priceChangePercent: '1.49', openPrice: '67000', highPrice: '69000', lowPrice: '66000' }),
    );
    const out = await binance().load();
    expect(out).toMatchObject({ price: 68000.5, prevClose: 67000, change: 1000.5, changePct: 1.49, open: 67000, high: 69000, low: 66000 });
    fetchRaw.mockResolvedValue(JSON.stringify({ lastPrice: '0' }));
    await expect(binance().load()).rejects.toThrow('价格无效');
  });

  it('Coinbase / gold-api 只给价格，非法价抛错', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { amount: '68100.25' } }));
    expect((await coinbase().load()).price).toBe(68100.25);
    fetchRaw.mockResolvedValue(JSON.stringify({ price: 2650.4 }));
    expect((await goldApi('XAU').load()).price).toBe(2650.4);
    fetchRaw.mockResolvedValue(JSON.stringify({}));
    await expect(coinbase().load()).rejects.toThrow('价格无效');
    await expect(goldApi().load()).rejects.toThrow('价格无效');
  });
});

/* ------------------------------ FRED 兜底 ------------------------------ */

describe('fredQuote：先读库，缺了才抓，且永远标 stale', () => {
  const rows = [
    { date: '2026-10-23', close: 4.1 },
    { date: '2026-10-24', close: 4.25 },
  ];

  it('库里已有两条以上时零网络', async () => {
    readDailyCache.mockResolvedValue({ rows });
    const out = await fredQuote('DGS10', 'us10y').load();
    expect(out).toMatchObject({ price: 4.25, prevClose: 4.1, sessionTime: '2026-10-24', stale: true });
    expect(fetchRaw).not.toHaveBeenCalled();
    expect(writeDailyCache).not.toHaveBeenCalled();
  });

  it('库里不足时抓 FRED 并回写', async () => {
    readDailyCache.mockResolvedValue(null);
    const csv = ['observation_date,DGS10', ...Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')},4.${String(i).padStart(2, '0')}`)].join('\n');
    fetchRaw.mockResolvedValue(csv);
    const out = await fredQuote('DGS10', 'us10y').load();
    expect(out.stale).toBe(true);
    expect(out.price).toBeCloseTo(4.29, 10);
    expect(writeDailyCache).toHaveBeenCalledWith('us10y', 'fred:DGS10', expect.any(Array));
  });
});

/* ------------------------------ Yahoo ------------------------------ */

describe('Yahoo：双域名轮换、429 退避、字段解析', () => {
  const chart = (extra = {}) =>
    JSON.stringify({
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: 5738.2,
              chartPreviousClose: 5691,
              regularMarketTime: 1793000000,
              marketState: 'REGULAR',
              ...extra,
            },
          },
        ],
      },
    });

  it('parseYahooChart 映射字段，时间转北京时间字符串', () => {
    const out = parseYahooChart(chart());
    expect(out.price).toBe(5738.2);
    expect(out.prevClose).toBe(5691);
    expect(out.note).toBe('REGULAR');
    expect(out.sessionTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('parseYahooChart 空响应 / 无效价抛错', () => {
    expect(() => parseYahooChart(JSON.stringify({ chart: {} }))).toThrow('空响应');
    expect(() => parseYahooChart(chart({ regularMarketPrice: 0 }))).toThrow('价格无效');
  });

  it('yahooQuoteOnce：第一个域名失败后自动换 query1', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('query2')) throw new Error('429');
      return chart();
    });
    const out = await yahooQuoteOnce('^GSPC');
    expect(out.price).toBe(5738.2);
    expect(fetchRaw.mock.calls.map(([u]) => u.includes('query2'))).toEqual([true, false]);
  });

  it('yahooQuoteOnce：两个域名都失败时抛最后一个错误', async () => {
    fetchRaw.mockRejectedValue(new Error('502'));
    await expect(yahooQuoteOnce('^GSPC')).rejects.toThrow('502');
  });

  it('yahooQuote：429 时退避重试，成功后返回', async () => {
    vi.useFakeTimers();
    fetchRaw
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce(chart());
    const p = yahooQuote('^GSPC').load();
    await vi.advanceTimersByTimeAsync(2500); // 380ms 队列 + 1200ms 退避
    const out = await p;
    expect(out.price).toBe(5738.2);
  });

  it('yahooQuote：两次域名都 429 后，按 quote 层再退避一轮并成功', async () => {
    vi.useFakeTimers();
    fetchRaw
      .mockRejectedValueOnce(new Error('429'))
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce(chart());
    const p = yahooQuote('^GSPC').load();
    await vi.advanceTimersByTimeAsync(6000);
    expect((await p).price).toBe(5738.2);
  });

  it('yahooQuote：连续 429 超过重试次数后抛出最后一次错误', async () => {
    vi.useFakeTimers();
    fetchRaw.mockRejectedValue(new Error('429'));
    const p = yahooQuote('^GSPC').load();
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(20000);
    await expect(p).rejects.toThrow('429');
  });

  it('yahooQuote：非 429 直接抛，不空转重试', async () => {
    fetchRaw.mockRejectedValue(new Error('404'));
    await expect(yahooQuote('^GSPC').load()).rejects.toThrow('404');
  });
});

/* ------------------------------ CNBC / 腾讯 ------------------------------ */

describe('CNBC 批量与腾讯', () => {
  const payload = JSON.stringify({
    ITVQuoteResult: {
      ITVQuote: [
        { symbol: '.GDAXI', last: '18,000.5', previous_day_closing: '17,900', change: '100.5', change_pct: '0.56' },
        { symbol: 'US10Y', last: '4.245%', previous_day_closing: '4.1%', change: '0.145%', change_pct: '3.5' },
      ],
    },
  });

  it('一次请求解析多标的，60 秒内复用缓存', async () => {
    fetchRaw.mockResolvedValue(payload);
    const a = await cnbcBatchFetch(['.GDAXI', 'US10Y']);
    expect(a.get('.GDAXI').last).toBe('18,000.5');
    const b = await cnbcBatchFetch(['.GDAXI', 'US10Y']);
    expect(b).toBe(a);
    expect(fetchRaw).toHaveBeenCalledTimes(1);
    // 标的不同 → 缓存键不同，重新抓
    await cnbcBatchFetch(['.FTSE']);
    expect(fetchRaw).toHaveBeenCalledTimes(2);
  });

  it('单条响应（对象而非数组）也能解析；US10Y 的百分号被清掉', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify({ ITVQuoteResult: { ITVQuote: { symbol: 'US10Y', last: '4.245%' } } }));
    const map = await cnbcBatchFetch(['US10Y']);
    expect(map.get('US10Y').last).toBe('4.245%');
    // cnbcQuote 走 cnbcQuoteOf：价格 4.245（去掉 %）
    fetchRaw.mockResolvedValue(JSON.stringify({ ITVQuoteResult: { ITVQuote: [{ symbol: 'US10Y', last: '4.245%', change: '0.1%' }] } }));
    // 换 key 绕过缓存
    const outQuote = await cnbcQuote('US10Y').load();
    expect(outQuote.price).toBe(4.245);
    expect(outQuote.change).toBe(0.1);
  });

  it('腾讯：~ 分隔字段，f32 已是百分数', async () => {
    const f = pad(40);
    f[1] = '恒生指数';
    f[3] = '20500.5';
    f[4] = '20620.9';
    f[30] = '20261026160000';
    f[31] = '-120.4';
    f[32] = '-0.58';
    fetchRaw.mockResolvedValue(`v_hkHSI="${f.join('~')}";`);
    const out = await tencentQuote('hkHSI').load();
    expect(out).toMatchObject({ price: 20500.5, prevClose: 20620.9, change: -120.4, changePct: -0.58, sessionTime: '20261026160000', note: '恒生指数' });
  });

  it('腾讯：空响应 / 非法价抛错', async () => {
    fetchRaw.mockResolvedValue('');
    await expect(tencentQuote('hkHSI').load()).rejects.toThrow('空响应');
    const f = pad(40);
    f[3] = '0';
    fetchRaw.mockResolvedValue(`v_gb_$ixic="${f.join('~')}";`);
    await expect(tencentQuote('usNDX').load()).rejects.toThrow('价格无效');
    fetchRaw.mockResolvedValue('garbage');
    await expect(tencentQuote('usNDX').load()).rejects.toThrow('空响应');
  });
});

/* ------------------------------ 降级链 ------------------------------ */

describe('loadWithFallback：多源降级与涨跌幅重算', () => {
  it('首个源成功就不碰后面的', async () => {
    const second = vi.fn();
    const out = await loadWithFallback([
      { name: 'a', load: async () => ({ price: 100, prevClose: 99 }) },
      { name: 'b', load: second },
    ]);
    expect(out.ok).toBe(true);
    expect(out.source).toBe('a');
    expect(out.fallback).toBe(false);
    expect(out.change).toBe(1);
    expect(out.changePct).toBeCloseTo((1 / 99) * 100, 12);
    expect(second).not.toHaveBeenCalled();
  });

  it('前一个源失败后换下一个，并标记 fallback', async () => {
    const out = await loadWithFallback([
      { name: 'a', load: async () => { throw new Error('429'); } },
      { name: 'b', load: async () => ({ price: 50, changePct: 0.004 }) },
    ]);
    expect(out.ok).toBe(true);
    expect(out.source).toBe('b');
    expect(out.fallback).toBe(true);
    // 没有昨收时保留源端给的百分比
    expect(out.changePct).toBe(0.004);
  });

  it('百分比被源端四舍五入时，用「涨跌额/昨收」重算', async () => {
    const out = await loadWithFallback([
      { name: 'a', load: async () => ({ price: 100, prevClose: 50, change: 50, changePct: 99.9 }) },
    ]);
    expect(out.changePct).toBeCloseTo(100, 12);
  });

  it('change 缺失但有昨收 → 自行相减并算百分比', async () => {
    const out = await loadWithFallback([{ name: 'a', load: async () => ({ price: 90, prevClose: 100 }) }]);
    expect(out.change).toBe(-10);
    expect(out.changePct).toBeCloseTo(-10, 12);
  });

  it('价格无效算失败；全部失败时把每个源的错误串起来', async () => {
    const out = await loadWithFallback([
      { name: 'a', load: async () => ({ price: 0 }) },
      { name: 'b', load: async () => { throw new Error('timeout'); } },
    ]);
    expect(out.ok).toBe(false);
    expect(out.price).toBeNull();
    expect(out.error).toBe('a: 价格无效 / b: timeout');
    expect(out.fallback).toBe(false);
  });

  it('stale / basisProxy 标记透传', async () => {
    const out = await loadWithFallback([
      { name: 'a', basisProxy: true, load: async () => ({ price: 1, stale: true }) },
    ]);
    expect(out.stale).toBe(true);
    expect(out.basisProxy).toBe(true);
  });
});
