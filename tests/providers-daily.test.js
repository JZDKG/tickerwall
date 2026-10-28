/* ================================================================== *
 * 日线源适配器（providers/daily.js）
 *
 * 十个上游的解析与降级顺序。这些函数被四处共用（首屏播种、详情日K、
 * 宏观矩阵、事件研究），一天里任何一次解析回归都会同时打穿四个页面。
 *
 * 全部通过 mock 掉 http.fetchRaw 来做：喂真实格式的响应文本，断言
 * 行字段、排序、百分比回填与失败语义。顺带钉住两个曾经直接 ReferenceError
 * 的路径：东财默认 limit 与 CBOE 详情源。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/server/providers/http.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchRaw: vi.fn() };
});

const { fetchRaw } = await import('../src/server/providers/http.js');
const { cboeCache } = await import('../src/server/providers/cboe.js');
const daily = await import('../src/server/providers/daily.js');

const {
  fetchEastmoneyDaily,
  fetchBinanceDaily,
  fetchSinaUsDaily,
  fetchYahooDaily,
  fetchTencentDaily,
  fetchFredDaily,
  fetchNasdaqDaily,
  fetchSinaFuturesDaily,
  fetchSinaForexDaily,
  fetchSinaInnerFuturesDaily,
  seedYahooOf,
  historySourcesFor,
} = daily;

const json = (o) => JSON.stringify(o);

beforeEach(() => {
  fetchRaw.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------ 东财 ------------------------------ */

describe('fetchEastmoneyDaily', () => {
  const payload = {
    data: {
      code: '000001',
      name: '上证指数',
      market: 1,
      klines: [
        '2026-10-20,3200.1,3210.5,3220,3190,123456,987654321,1.2,0.5,15.4,0.8',
        '2026-10-21,3210.5,3205.2,3230,3200,223456,997654321,1.1,0.2,6.5,0.9',
        '2026-10-22,3205.2,--,3210,3195,323456,1007654321,0.5,null,0,0.7',
      ],
    },
  };

  it('解析 klines，跳过收盘无效的行', async () => {
    fetchRaw.mockResolvedValue(json(payload));
    const out = await fetchEastmoneyDaily('1.000001', 5000);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({ date: '2026-10-20', open: 3200.1, close: 3210.5, high: 3220 });
    expect(out.meta).toEqual({ code: '000001', name: '上证指数', source: 'eastmoney:1.000001', exchange: 1 });
  });

  it('默认 limit 可用（以前默认参数引用未导入的常量，直接 ReferenceError）', async () => {
    fetchRaw.mockResolvedValue(json(payload));
    await expect(fetchEastmoneyDaily('1.000001')).resolves.toBeTruthy();
    expect(fetchRaw.mock.calls[0][0]).toContain('lmt=5000');
  });

  it('没有 klines 抛「无历史数据」', async () => {
    fetchRaw.mockResolvedValue(json({ data: { klines: [] } }));
    await expect(fetchEastmoneyDaily('1.1', 10)).rejects.toThrow('无历史数据');
    fetchRaw.mockResolvedValue(json({}));
    await expect(fetchEastmoneyDaily('1.1', 10)).rejects.toThrow('无历史数据');
  });

  it('URL 对 secid 做编码', async () => {
    fetchRaw.mockResolvedValue(json(payload));
    await fetchEastmoneyDaily('100.SPX', 10);
    expect(fetchRaw.mock.calls[0][0]).toContain('secid=100.SPX');
  });
});

/* ------------------------------ Binance ------------------------------ */

describe('fetchBinanceDaily', () => {
  const kline = (t, open, high, low, close, vol, amount) => [t, open, high, low, close, vol, 0, amount];

  it('分页抓到空批为止，并按日期升序回填涨跌', async () => {
    const day = 86400000;
    fetchRaw
      .mockResolvedValueOnce(
        json([
          kline(Date.UTC(2026, 9, 22), '100', '110', '90', '105', '10', '1000'),
          kline(Date.UTC(2026, 9, 21), '90', '100', '80', '100', '9', '900'),
        ]),
      )
      .mockResolvedValueOnce(json([]));

    const out = await fetchBinanceDaily('BTCUSDT', 3);
    expect(out.rows.map((r) => r.date)).toEqual(['2026-10-21', '2026-10-22']);
    expect(out.rows[0].change).toBeNull(); // 第一条没有前收
    expect(out.rows[1].close).toBe(105);
    expect(out.rows[1].change).toBeCloseTo(5, 12);
    expect(out.rows[1].pct).toBeCloseTo(5, 12);
    expect(out.meta).toEqual({ code: 'BTCUSDT', name: 'BTCUSDT', source: 'binance', exchange: 'BINANCE' });
  });

  it('整页 1000 条时继续翻页，并带上上一页最早时间', async () => {
    const base = Date.UTC(2023, 0, 1);
    const batch = Array.from({ length: 1000 }, (_, i) =>
      kline(base + i * 86400000, '1', '2', '0.5', String(1 + i / 1000), '1', '1'),
    );
    fetchRaw.mockResolvedValueOnce(json(batch)).mockResolvedValueOnce(json([]));
    const out = await fetchBinanceDaily('BTCUSDT', 2);
    expect(out.rows).toHaveLength(1000);
    expect(fetchRaw).toHaveBeenCalledTimes(2);
    expect(fetchRaw.mock.calls[1][0]).toContain(`endTime=${base - 1}`);
  });

  it('非数组响应直接结束，不抛', async () => {
    fetchRaw.mockResolvedValue(json({ nope: true }));
    const { rows } = await fetchBinanceDaily('BTCUSDT', 1);
    expect(rows).toEqual([]);
  });
});

/* ------------------------------ 新浪美股 / 期货 / 外汇 / 内盘 ------------------------------ */

describe('fetchSinaUsDaily', () => {
  it('解 jsonp 包体，过滤无效收盘并排序', async () => {
    fetchRaw.mockResolvedValue(
      'var t=([{"d":"2026-10-22","o":"100","c":"110","h":"115","l":"99","v":"10","a":"1000"},' +
        '{"d":"2026-10-21","o":"90","c":"100","h":"105","l":"89","v":"9","a":"900"},' +
        '{"d":"","c":"100"},{"d":"2026-10-20","c":"bad"}])',
    );
    const out = await fetchSinaUsDaily('$inx');
    expect(out.rows.map((r) => r.date)).toEqual(['2026-10-21', '2026-10-22']);
    expect(out.rows[1].pct).toBeCloseTo(10, 12);
    expect(out.meta).toEqual({ code: '$inx', name: '$inx', source: 'sina:$inx', exchange: 'US' });
  });

  it('格式异常与空数组各自抛错', async () => {
    fetchRaw.mockResolvedValue('not jsonp');
    await expect(fetchSinaUsDaily('$inx')).rejects.toThrow('响应格式异常');
    fetchRaw.mockResolvedValue('var t=([])');
    await expect(fetchSinaUsDaily('$inx')).rejects.toThrow('无历史数据');
  });
});

describe('fetchSinaFuturesDaily', () => {
  const body = (rows) => `var t=(${json(rows)})`;
  it('解析 close/date，过滤非法行', async () => {
    fetchRaw.mockResolvedValue(
      body([
        { date: '2026-10-21 10:00:00', open: '10', close: '11', high: '12', low: '9', volume: '100' },
        { date: '2026-10-22', open: '11', close: '0', high: '12', low: '9' },
        { date: '', close: '5' },
        { date: '2026-10-23', open: '11', close: '12.5', high: '13', low: '10', vol: '300' },
      ]),
    );
    const out = await fetchSinaFuturesDaily('CL');
    expect(out.rows.map((r) => [r.date, r.close, r.volume])).toEqual([
      ['2026-10-21', 11, 100],
      ['2026-10-23', 12.5, 300],
    ]);
  });

  it('空响应 / 无数据 / 历史过短分别抛错', async () => {
    fetchRaw.mockResolvedValue('nope');
    await expect(fetchSinaFuturesDaily('CL')).rejects.toThrow('空响应');
    fetchRaw.mockResolvedValue(body([]));
    await expect(fetchSinaFuturesDaily('CL')).rejects.toThrow('无历史数据');
    fetchRaw.mockResolvedValue(body([{ date: '2026-10-21', close: '1' }]));
    await expect(fetchSinaFuturesDaily('CL')).rejects.toThrow('历史过短');
  });
});

describe('fetchSinaForexDaily', () => {
  const line = (d, c) => `${d},1,2,3,${c}`;
  it('解析 var t= 管道串，按日期格式过滤', async () => {
    const body = [
      line('2026-10-20', '7.10'),
      line('bad-date', '7.11'),
      line('2026-10-21', '0'),
      'not,enough',
    ].join('|');
    fetchRaw.mockResolvedValue(`var t=("${body}")`);
    const rowsRaw = Array.from({ length: 30 }, (_, i) => line(`2026-09-${String(i + 1).padStart(2, '0')}`, '7.1'));
    fetchRaw.mockResolvedValue(`var t=("${rowsRaw.join('|')}")`);
    const out = await fetchSinaForexDaily('DINIW');
    expect(out.rows).toHaveLength(30);
    expect(out.rows[0]).toEqual({ date: '2026-09-01', open: 1, close: 7.1, high: 3, low: 2 });
  });

  it('缺少 var t=( 抛空响应；不足 30 条抛历史过短', async () => {
    fetchRaw.mockResolvedValue('nothing');
    await expect(fetchSinaForexDaily('DINIW')).rejects.toThrow('空响应');
    fetchRaw.mockResolvedValue(`var t=("${line('2026-10-20', '7.1')}")`);
    await expect(fetchSinaForexDaily('DINIW')).rejects.toThrow('历史过短');
  });
});

describe('fetchSinaInnerFuturesDaily', () => {
  const body = (rows) => `var t=(${json(rows)})`;
  const mk = (n) =>
    Array.from({ length: n }, (_, i) => ({ d: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, o: '1', c: '2', h: '3', l: '1', v: '9' }));

  it('把 d/c 映射成 date/close，过滤无效行', async () => {
    fetchRaw.mockResolvedValue(
      body([...mk(30), { d: '2026-02-01', c: '--' }, { d: '', c: '5' }]),
    );
    const out = await fetchSinaInnerFuturesDaily('AU0');
    expect(out.rows).toHaveLength(30);
    expect(out.meta.source).toBe('sina-inner:AU0');
  });

  it('空响应与历史过短', async () => {
    fetchRaw.mockResolvedValue('nope');
    await expect(fetchSinaInnerFuturesDaily('AU0')).rejects.toThrow('空响应');
    fetchRaw.mockResolvedValue(body(mk(3)));
    await expect(fetchSinaInnerFuturesDaily('AU0')).rejects.toThrow('历史过短');
  });
});

/* ------------------------------ 腾讯 / Nasdaq ------------------------------ */

describe('fetchTencentDaily', () => {
  const payload = (rows, key = 'qfqday') => json({ data: { sh000001: { [key]: rows } } });

  it('优先 qfqday，缺失时回落 day', async () => {
    fetchRaw.mockResolvedValueOnce(payload([['2026-10-21', '1', '2', '3', '0.5', '100'], ['2026-10-22', '2', '3', '4', '1', '200']]));
    const a = await fetchTencentDaily('sh000001');
    expect(a.rows[0]).toEqual({ date: '2026-10-21', open: 1, close: 2, high: 3, low: 0.5, volume: 100 });

    fetchRaw.mockResolvedValueOnce(payload([['2026-10-21', '1', '2', '3', '0.5', '100'], ['2026-10-22', '2', '3', '4', '1', '200']], 'day'));
    const b = await fetchTencentDaily('sh000001');
    expect(b.rows).toHaveLength(2);
  });

  it('结构缺失抛无历史数据，过滤后不足两条抛历史过短', async () => {
    fetchRaw.mockResolvedValue(json({}));
    await expect(fetchTencentDaily('sh000001')).rejects.toThrow('无历史数据');
    fetchRaw.mockResolvedValue(payload([['2026-10-21', '1', '0', '3', '0.5', '100'], ['2026-10-22', '1', '2', '3', '0.5', '100']]));
    await expect(fetchTencentDaily('sh000001')).rejects.toThrow('历史过短');
  });
});

describe('fetchNasdaqDaily', () => {
  it('解析 MM/DD/YYYY 与千分位，返回升序', async () => {
    fetchRaw.mockResolvedValue(
      json({
        data: {
          tradesTable: {
            rows: [
              { date: '10/22/2026', open: '1,100.5', close: '1,120.2', high: '1,130', low: '1,090', volume: '1,000' },
              { date: '10/21/2026', open: '1,090', close: '1,100.5', high: '1,110', low: '1,080', volume: '900' },
              { date: 'nope', close: '1' },
            ],
          },
        },
      }),
    );
    const out = await fetchNasdaqDaily('NDX');
    expect(out.rows.map((r) => r.date)).toEqual(['2026-10-21', '2026-10-22']);
    expect(out.rows[1].close).toBe(1120.2);
    expect(out.meta.source).toBe('nasdaq:NDX');
  });

  it('无行 / 过短都抛错', async () => {
    fetchRaw.mockResolvedValue(json({}));
    await expect(fetchNasdaqDaily('NDX')).rejects.toThrow('无历史数据');
    fetchRaw.mockResolvedValue(json({ data: { tradesTable: { rows: [{ date: '10/21/2026', close: '1' }] } } }));
    await expect(fetchNasdaqDaily('NDX')).rejects.toThrow('历史过短');
  });
});

/* ------------------------------ Yahoo ------------------------------ */

describe('fetchYahooDaily', () => {
  const payload = (n, opts = {}) =>
    json({
      chart: {
        result: [
          {
            timestamp: Array.from({ length: n }, (_, i) => Date.UTC(2026, 0, 1) / 1000 + i * 86400),
            indicators: { quote: [{ close: Array.from({ length: n }, (_, i) => (opts.bad && i === 0 ? null : 100 + i)) }] },
          },
        ],
      },
    });

  it('解析时间戳与收盘，过滤无效收盘', async () => {
    fetchRaw.mockResolvedValue(payload(31, { bad: true }));
    const out = await fetchYahooDaily('^GSPC');
    expect(out.rows).toHaveLength(30);
    expect(out.meta.source).toBe('yahoo:^GSPC');
    expect(out.rows[0].date).toBe('2026-01-02');
  });

  it('结果缺失 / 历史过短都抛错', async () => {
    fetchRaw.mockResolvedValue(json({ chart: {} }));
    await expect(fetchYahooDaily('^GSPC')).rejects.toThrow('无数据');
    fetchRaw.mockResolvedValue(payload(29));
    await expect(fetchYahooDaily('^GSPC')).rejects.toThrow('历史过短');
  });

  it('429 时退避重试，成功即返回', async () => {
    vi.useFakeTimers();
    fetchRaw
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce(payload(31));
    const p = fetchYahooDaily('^GSPC');
    await vi.advanceTimersByTimeAsync(1300);
    const out = await p;
    expect(out.rows).toHaveLength(31);
    expect(fetchRaw).toHaveBeenCalledTimes(2);
  });

  it('429 连续三次后放弃，其他错误不重试', async () => {
    vi.useFakeTimers();
    fetchRaw.mockRejectedValue(new Error('HTTP 429'));
    const p = fetchYahooDaily('^GSPC');
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(1200 + 2400 + 100);
    await expect(p).rejects.toThrow('HTTP 429');
    expect(fetchRaw).toHaveBeenCalledTimes(3);

    fetchRaw.mockReset();
    fetchRaw.mockRejectedValue(new Error('HTTP 500'));
    await expect(fetchYahooDaily('^GSPC')).rejects.toThrow('HTTP 500');
    expect(fetchRaw).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------ FRED / CBOE ------------------------------ */

describe('fetchFredDaily', () => {
  it('透传 FRED CSV 解析结果，并带 omitUa', async () => {
    const lines = [
      'observation_date,DGS10',
      ...Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')},4.${String(i).padStart(2, '0')}`),
    ];
    fetchRaw.mockResolvedValue(lines.join('\n'));
    const out = await fetchFredDaily('DGS10');
    expect(out.rows).toHaveLength(30);
    expect(out.meta.source).toBe('fred:DGS10');
    expect(fetchRaw.mock.calls[0][1]).toMatchObject({ omitUa: true, headers: { Accept: 'text/csv' } });
  });
});

describe('historySourcesFor：CBOE 源真的能跑（以前调用未导入的函数）', () => {
  it('spec.cboe 的任务命中 csv 解析而不是 ReferenceError', async () => {
    const header = 'DATE,OPEN,HIGH,LOW,CLOSE';
    const lines = Array.from({ length: 60 }, (_, i) => {
      const d = `0${(i % 9) + 1}/0${(i % 9) + 1}/2020`;
      return `${d},10,11,9,${10 + i / 100}`;
    });
    fetchRaw.mockResolvedValue([header, ...lines].join('\n'));
    const jobs = historySourcesFor({ cboe: 'VIX' });
    const out = await jobs[0]();
    expect(out.rows.length).toBeGreaterThanOrEqual(50);
    expect(out.meta.source).toBe('cboe:VIX');
    expect(fetchRaw.mock.calls[0][0]).toContain('VIX_History.csv');
  });
});

/* ------------------------------ 源顺序 ------------------------------ */

describe('historySourcesFor：降级顺序', () => {
  it('按 binance → sina-us → cboe → 东财 → fred → nasdaq → 腾讯 → 新浪期货 → 外汇 → 内盘 → yahoo 排列', () => {
    const jobs = historySourcesFor({
      binance: 'BTCUSDT',
      sinaUs: '$inx',
      cboe: 'VIX',
      em: '1.000001',
      fred: 'SP500',
      nasdaq: 'NDX',
      tx: 'sh000001',
      sinaFutures: 'CL',
      sinaForex: 'DINIW',
      sinaInner: 'AU0',
      yahoo: '^GSPC',
    });
    expect(jobs.map((j) => j.sourceName)).toEqual([
      'binance', 'sina-us', 'cboe', 'eastmoney', 'fred', 'nasdaq', 'tencent',
      'sina-futures', 'sina-forex', 'sina-inner', 'yahoo',
    ]);
  });

  it('binanceSymbol 是 binance 的别名；seed 里的 yahoo 自动补位', () => {
    expect(historySourcesFor({ binanceSymbol: 'ETHUSDT' }).map((j) => j.sourceName)).toEqual(['binance']);
    expect(historySourcesFor({ seed: [{ kind: 'em', code: '1.1' }, { kind: 'yahoo', symbol: '^VIX' }] }).map((j) => j.sourceName)).toEqual(['yahoo']);
    expect(historySourcesFor({ seed: { kind: 'yahoo', symbol: '^NDX' } }).map((j) => j.sourceName)).toEqual(['yahoo']);
    expect(historySourcesFor({ seed: [] }).map((j) => j.sourceName)).toEqual([]);
    expect(historySourcesFor({})).toEqual([]);
  });

  it('seedYahooOf 对数组 / 对象 / 空值都能取', () => {
    expect(seedYahooOf({ seed: [{ kind: 'em', symbol: 'x' }, { kind: 'yahoo', symbol: '^GSPC' }] })).toBe('^GSPC');
    expect(seedYahooOf({ seed: { kind: 'yahoo', symbol: '^VIX' } })).toBe('^VIX');
    expect(seedYahooOf({ seed: { kind: 'em', symbol: 'x' } })).toBeNull();
    expect(seedYahooOf({})).toBeNull();
  });

  it('每个降级任务都能真正执行（不是只在数组里挂着）', async () => {
    cboeCache.clear();
    const days = (n) => Array.from({ length: n }, (_, i) => `2026-03-${String((i % 28) + 1).padStart(2, '0')}`);
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('binance')) return '[]';
      if (url.includes('US_MinKService')) return 'var t=([])';
      if (url.includes('cboe')) {
        return ['DATE,OPEN,HIGH,LOW,CLOSE', ...days(60).map((d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/2020,10,11,9,10.5`)].join('\n');
      }
      if (url.includes('push2his')) return json({ data: { code: 'x', klines: ['2026-10-21,1,2,3,0.5,1,1,1,1,1,1', '2026-10-22,2,3,4,1,1,1,1,1,1,1'] } });
      if (url.includes('fredgraph')) return ['observation_date,X', ...days(30).map((d) => `${d},4.2`)].join('\n');
      if (url.includes('nasdaq')) return json({ data: { tradesTable: { rows: [{ date: '10/21/2026', close: '1' }, { date: '10/22/2026', close: '2' }] } } });
      if (url.includes('ifzq')) return json({ data: { sh000001: { qfqday: [['2026-10-21', '1', '2', '3', '0.5', '1'], ['2026-10-22', '2', '3', '4', '1', '2']] } } });
      if (url.includes('GlobalFuturesService')) return `var t=(${json([{ date: '2026-10-21', close: '1' }, { date: '2026-10-22', close: '2' }])})`;
      if (url.includes('NewForexService')) return `var t=("${days(30).map((d) => `${d},1,2,3,7.1`).join('|')}")`;
      if (url.includes('InnerFuturesNewService')) return `var t=(${json(days(30).map((d) => ({ d, o: '1', c: '2', h: '3', l: '1', v: '1' })))})`;
      if (url.includes('yahoo')) {
        return json({ chart: { result: [{ timestamp: days(31).map((d) => Date.parse(`${d}T00:00:00Z`) / 1000), indicators: { quote: [{ close: days(31).map((_, i) => 100 + i) }] } }] } });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const jobs = historySourcesFor({
      binance: 'BTCUSDT', sinaUs: '$inx', cboe: 'VIX', em: '1.1', fred: 'SP500',
      nasdaq: 'NDX', tx: 'sh000001', sinaFutures: 'CL', sinaForex: 'DINIW',
      sinaInner: 'AU0', yahoo: '^GSPC',
    });
    const results = await Promise.allSettled(jobs.map((j) => j()));
    // 新浪美股给的是空数组，必然 reject；其余都应该跑通
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.map((r) => r.reason.message)).toEqual(['无历史数据']);
    expect(fetchRaw).toHaveBeenCalledTimes(jobs.length);
  });

  it('每个 job 都带 sourceName，便于错误信息定位', () => {
    const jobs = historySourcesFor({ em: '1.1', fred: 'DGS10' });
    for (const j of jobs) expect(typeof j.sourceName).toBe('string');
  });
});
