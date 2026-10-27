/* ================================================================== *
 * 上游源解析层契约测试（src/server/providers/）
 *
 * 全部喂**录制下来的原始响应文本**，不碰外网 —— 这样断言的是解析逻辑本身，
 * 而不是「今天上游心情如何」。夹具按各源真实的字段排布构造，位置错一个就会挂，
 * 这正是这类代码最容易悄悄错的地方（把昨收当现价、把最高价当现价）。
 * ================================================================== */

import { describe, it, expect, afterEach } from 'vitest';

import {
  toNum,
  splitSina,
  splitSinaPipe,
  setFetcher,
  fetchRaw,
  UA,
  parseSinaSpot,
  parseSinaGlobal,
  parseSinaSimpleIndex,
  parseSinaFutures,
  parseCboeCsv,
  parseCboeCsvOrThrow,
  cboeQuoteFromRows,
  cnbcNum,
  parseCnbcQuotes,
  cnbcQuoteOf,
  parseFredCsv,
  parseFredCsvOrThrow,
  fredQuoteFromRows,
} from '../src/server/providers/index.js';

afterEach(() => setFetcher(null));

/* ================================================================== *
 * 数值清洗
 * ================================================================== */

describe('toNum：宽松清洗', () => {
  it('去千分位逗号', () => {
    expect(toNum('1,234.5')).toBe(1234.5);
    expect(toNum('8,255,000')).toBe(8255000);
  });

  it('空值 / 单个减号 / 双横线都当无值', () => {
    for (const v of [null, undefined, '', '  ', '-', '--']) expect(toNum(v)).toBeNull();
  });

  it('负数与零照常返回（零是合法值，只在报价层判 > 0）', () => {
    expect(toNum('-3')).toBe(-3);
    expect(toNum('0')).toBe(0);
  });

  it('非数字返回 null', () => {
    expect(toNum('abc')).toBeNull();
    expect(toNum('1.2.3')).toBeNull();
  });

  it('不去百分号（那是 cnbcNum 的职责）', () => {
    expect(toNum('4.245%')).toBeNull();
  });
});

/* ================================================================== *
 * 新浪文本切分
 * ================================================================== */

describe('新浪文本切分', () => {
  it('逗号串：取出引号内的字段数组', () => {
    expect(splitSina('var hq_str_gds_AU9999="762.34,1,2";')).toEqual(['762.34', '1', '2']);
  });

  it('竖线串同样能切', () => {
    expect(splitSinaPipe('var hq_str_x="a|b|c";')).toEqual(['a', 'b', 'c']);
  });

  it('不是这个形状返回 null（空响应 / 错误页）', () => {
    expect(splitSina('')).toBeNull();
    expect(splitSina('<html>404</html>')).toBeNull();
    expect(splitSina(null)).toBeNull();
  });
});

/* ================================================================== *
 * 新浪四种字段排布
 * ================================================================== */

/** 现货：0 现价 4 最高 5 最低 6 时间 7 昨收 8 今开 13 备注 */
const SPOT_FIXTURE =
  'var hq_str_hf_XAU="2650.5,0.00,2650.1,2650.9,2655.0,2645.0,14:30:00,2648.2,2649.0,0,0,0,0,伦敦金";';

/** 美股指数：1 现价 2 涨跌幅 3 时间 4 涨跌额 5 开 6 高 7 低 26 昨收 */
const GLOBAL_FIELDS = ['道琼斯', '46247.29', '0.43', '2026-10-27 14:30:00', '198.50', '46000.00', '46300.00', '45900.00'];
for (let i = 8; i < 26; i += 1) GLOBAL_FIELDS.push('0');
GLOBAL_FIELDS.push('46048.79', 'x');
const GLOBAL_FIXTURE = `var hq_str_gb_$inx="${GLOBAL_FIELDS.join(',')}";`;

/** A 股简版：1 现价 2 涨跌额 3 涨跌幅 4 成交量 5 成交额 */
const SIMPLE_FIXTURE = 'var hq_str_s_sh000001="上证指数,4000.54,12.34,0.31,1234567,890123";';

/** 国际期货：0 现价 1 涨跌额 2 涨跌幅 5 高 6 低 7 时间 8 昨收 */
const FUTURES_FIXTURE =
  'var hq_str_hf_CL="61.23,0.45,0.74,61.20,61.25,62.10,60.90,14:30:00,60.78,0,0,0,0,纽约原油";';

describe('parseSinaSpot：现货 / 场内品种', () => {
  it('按位置取全字段', () => {
    expect(parseSinaSpot(SPOT_FIXTURE)).toEqual({
      price: 2650.5,
      prevClose: 2648.2,
      open: 2649,
      high: 2655,
      low: 2645,
      sessionTime: '14:30:00',
      note: '伦敦金',
    });
  });

  it('现价缺失或非正 → 抛「价格无效」（上层据此降级到别的源）', () => {
    expect(() => parseSinaSpot('var hq_str_x="0,0,0,0,0,0,0,0,0";')).toThrow('价格无效');
    expect(() => parseSinaSpot('var hq_str_x="abc,0,0,0,0,0,0,0,0";')).toThrow('价格无效');
  });

  it('空响应 → 抛「空响应」', () => {
    expect(() => parseSinaSpot('')).toThrow('空响应');
  });
});

describe('parseSinaGlobal：美股指数（字段顺序与现货完全不同）', () => {
  it('现价取 f[1] 而不是 f[0]（f[0] 是指数名）', () => {
    const q = parseSinaGlobal(GLOBAL_FIXTURE);
    expect(q.price).toBe(46247.29);
    expect(q.changePct).toBe(0.43);
    expect(q.change).toBe(198.5);
    expect(q.open).toBe(46000);
    expect(q.high).toBe(46300);
    expect(q.low).toBe(45900);
    expect(q.prevClose).toBe(46048.79);
  });

  it('时间只留时分秒（源给的是完整日期时间）', () => {
    expect(parseSinaGlobal(GLOBAL_FIXTURE).sessionTime).toBe('14:30:00');
  });

  it('没给昨收时用「现价 − 涨跌额」反推', () => {
    const fields = ['纳指', '20000', '1.0', '2026-10-27 10:00:00', '200'];
    for (let i = 5; i < 30; i += 1) fields.push('');
    const q = parseSinaGlobal(`var hq_str_gb_$ndx="${fields.join(',')}";`);
    expect(q.prevClose).toBe(19800);
  });
});

describe('parseSinaSimpleIndex：A 股简版', () => {
  it('取现价 / 涨跌 / 量 / 额', () => {
    expect(parseSinaSimpleIndex(SIMPLE_FIXTURE)).toEqual({
      price: 4000.54,
      change: 12.34,
      changePct: 0.31,
      volume: 1234567,
      amount: 890123,
    });
  });

  it('价格非正抛错', () => {
    expect(() => parseSinaSimpleIndex('var hq_str_x="名,0,0,0,0,0";')).toThrow('价格无效');
  });
});

describe('parseSinaFutures：国际期货', () => {
  it('现价取 f[0]，高低在 f[5]/f[6]，昨收在 f[8]', () => {
    expect(parseSinaFutures(FUTURES_FIXTURE)).toEqual({
      price: 61.23,
      change: 0.45,
      changePct: 0.74,
      high: 62.1,
      low: 60.9,
      sessionTime: '14:30:00',
      prevClose: 60.78,
    });
  });
});

/* ================================================================== *
 * CBOE CSV
 * ================================================================== */

const CBOE_FIXTURE = `DATE,OPEN,HIGH,LOW,CLOSE
01/02/1990,17.24,17.24,17.24,17.24
01/03/1990,17.30,18.00,17.00,17.50
1/4/1990,17.5,17.9,17.2,17.35
,1,2,3,4
01/08/1990,0,0,0,0
01/09/1990,1,2,3,abc
`;

describe('parseCboeCsv', () => {
  it('MM/DD/YYYY 转 ISO 并补零', () => {
    const rows = parseCboeCsv(CBOE_FIXTURE);
    expect(rows[0].date).toBe('1990-01-02');
    expect(rows[2].date).toBe('1990-01-04');
  });

  it('跳过表头、缺日期、收盘非正、收盘非数字的行', () => {
    const rows = parseCboeCsv(CBOE_FIXTURE);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.close)).toEqual([17.24, 17.5, 17.35]);
  });

  it('按日期升序排列', () => {
    const rows = parseCboeCsv(`DATE,OPEN,HIGH,LOW,CLOSE
01/05/1990,1,1,1,5
01/02/1990,1,1,1,2
01/03/1990,1,1,1,3
`);
    expect(rows.map((r) => r.date)).toEqual(['1990-01-02', '1990-01-03', '1990-01-05']);
  });

  it('行数不足 50 视为抓到错误页 → 抛错', () => {
    expect(() => parseCboeCsvOrThrow(CBOE_FIXTURE, 'VIX')).toThrow('VIX CSV 解析失败');
  });

  it('行数够时正常返回', () => {
    let csv = 'DATE,OPEN,HIGH,LOW,CLOSE\n';
    for (let i = 1; i <= 60; i += 1) {
      csv += `01/${String((i % 28) + 1).padStart(2, '0')}/2026,1,2,0.5,${10 + i}\n`;
    }
    const rows = parseCboeCsvOrThrow(csv, 'VIX');
    expect(rows).toHaveLength(60);
  });

  it('quote 取最后两行算涨跌', () => {
    let csv = 'DATE,OPEN,HIGH,LOW,CLOSE\n';
    for (let i = 1; i <= 60; i += 1) csv += `01/${String((i % 28) + 1).padStart(2, '0')}/2026,1,2,0.5,${100 + i}\n`;
    const rows = parseCboeCsvOrThrow(csv, 'VIX');
    const q = cboeQuoteFromRows(rows, 'VIX');
    expect(q.price).toBe(rows[rows.length - 1].close);
    expect(q.prevClose).toBe(rows[rows.length - 2].close);
    expect(q.note).toBe('VIX 日收盘');
  });

  it('行数不足 2 时 quote 抛「数据不足」', () => {
    expect(() => cboeQuoteFromRows([{ date: '2026-01-01', close: 1 }])).toThrow('数据不足');
    expect(() => cboeQuoteFromRows([])).toThrow('数据不足');
  });
});

/* ================================================================== *
 * CNBC
 * ================================================================== */

describe('cnbcNum：收益率带 % 的关键清洗', () => {
  it('"4.245%" 要能算出 4.245（US10Y 曾因只去逗号被判价格无效）', () => {
    expect(cnbcNum('4.245%')).toBe(4.245);
  });

  it('同时去逗号与百分号', () => {
    expect(cnbcNum('1,234.5')).toBe(1234.5);
    expect(cnbcNum('-1.5%')).toBe(-1.5);
  });

  it('"UNCH" / 空串 → null（表示无变化，不是 0）', () => {
    expect(cnbcNum('UNCH')).toBeNull();
    expect(cnbcNum('')).toBeNull();
    expect(cnbcNum(null)).toBeNull();
  });

  it('非数字 → null', () => {
    expect(cnbcNum('N/A')).toBeNull();
  });
});

describe('parseCnbcQuotes：批量响应两种形状', () => {
  it('ITVQuote 是数组时逐条入 Map', () => {
    const map = parseCnbcQuotes({
      ITVQuoteResult: {
        ITVQuote: [
          { symbol: '.KS11', last: '2,545.30' },
          { symbol: '.TWII', last: '23000' },
        ],
      },
    });
    expect([...map.keys()]).toEqual(['.KS11', '.TWII']);
  });

  it('只有一条时是对象而不是数组，也要吃', () => {
    const map = parseCnbcQuotes({ ITVQuoteResult: { ITVQuote: { symbol: '.GDAXI', last: '24000' } } });
    expect(map.get('.GDAXI').last).toBe('24000');
  });

  it('没有 symbol 的条目跳过；结构缺失返回空 Map', () => {
    expect(parseCnbcQuotes({ ITVQuoteResult: { ITVQuote: [{ last: '1' }, { symbol: '.A', last: '2' }] } }).size).toBe(1);
    expect(parseCnbcQuotes({}).size).toBe(0);
    expect(parseCnbcQuotes('{}').size).toBe(0);
  });

  it('接受原始 JSON 文本', () => {
    const map = parseCnbcQuotes('{"ITVQuoteResult":{"ITVQuote":{"symbol":".FCHI","last":"8000"}}}');
    expect(map.get('.FCHI').last).toBe('8000');
  });
});

describe('cnbcQuoteOf：映射成统一 quote 形状', () => {
  const RAW = {
    symbol: '.KS11',
    name: 'KOSPI',
    last: '2,545.30',
    change: '+30.20',
    change_pct: '1.20%',
    previous_day_closing: '2,515.10',
  };

  it('数值清洗 + 字段映射', () => {
    expect(cnbcQuoteOf(RAW)).toEqual({
      price: 2545.3,
      prevClose: 2515.1,
      change: 30.2,
      changePct: 1.2,
      sessionTime: null,
      note: 'KOSPI',
    });
  });

  it('价格无效 / 无该标的 → 抛错让上层降级', () => {
    expect(() => cnbcQuoteOf(null)).toThrow('无该标的');
    expect(() => cnbcQuoteOf({ last: '0' })).toThrow('价格无效');
    expect(() => cnbcQuoteOf({ last: 'abc' })).toThrow('价格无效');
  });
});

/* ================================================================== *
 * FRED
 * ================================================================== */

const fredCsv = (n) => {
  let csv = 'observation_date,US10Y\n';
  for (let i = 0; i < n; i += 1) csv += `2026-01-${String((i % 28) + 1).padStart(2, '0')},${4 + i / 100}\n`;
  return csv;
};

describe('parseFredCsv', () => {
  it('跳过表头、缺失值 "."、非 ISO 日期、非正数值', () => {
    const csv = `observation_date,US10Y
2026-10-24,4.23
2026-10-25,.
2026/10/26,4.25
2026-10-27,0
2026-10-28,4.31
`;
    expect(parseFredCsv(csv)).toEqual([
      { date: '2026-10-24', close: 4.23 },
      { date: '2026-10-28', close: 4.31 },
    ]);
  });

  it('行数不足 30 抛「历史过短」（防止把错误页当历史）', () => {
    expect(() => parseFredCsvOrThrow(fredCsv(10), 'US10Y')).toThrow('历史过短');
  });

  it('行数够时返回 rows + meta', () => {
    const r = parseFredCsvOrThrow(fredCsv(40), 'US10Y');
    expect(r.rows).toHaveLength(40);
    expect(r.meta.source).toBe('fred:US10Y');
  });
});

describe('fredQuoteFromRows：必须标 stale', () => {
  const rows = [
    { date: '2026-10-26', close: 4.25 },
    { date: '2026-10-27', close: 4.31 },
  ];

  it('取最后两条 + stale: true（FRED 只给上一交易日收盘）', () => {
    expect(fredQuoteFromRows(rows)).toEqual({
      price: 4.31,
      prevClose: 4.25,
      sessionTime: '2026-10-27',
      stale: true,
    });
  });

  it('不足两条 / 价格非正 → 抛错', () => {
    expect(() => fredQuoteFromRows([])).toThrow('无可用历史');
    expect(() => fredQuoteFromRows([{ date: 'x', close: 1 }])).toThrow('无可用历史');
    expect(() => fredQuoteFromRows([{ date: 'a', close: 0 }, { date: 'b', close: 0 }])).toThrow('价格无效');
  });

  it('前一条价格非正时 prevClose 给 null（不编造）', () => {
    expect(fredQuoteFromRows([{ date: 'a', close: 0 }, { date: 'b', close: 4 }]).prevClose).toBeNull();
  });
});

/* ================================================================== *
 * fetchRaw：注入 fetcher 做确定性回放
 * ================================================================== */

describe('fetchRaw：可注入 fetcher，无需真实网络', () => {
  const fakeRes = (body, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    text: async () => (typeof body === 'string' ? body : ''),
    arrayBuffer: async () => Buffer.from(body),
  });

  it('utf-8 文本原样返回，并带上统一 UA', async () => {
    let seen = null;
    setFetcher(async (url, opts) => {
      seen = { url, opts };
      return fakeRes('hello');
    });
    expect(await fetchRaw('https://example.test/x')).toBe('hello');
    expect(seen.url).toBe('https://example.test/x');
    expect(seen.opts.headers['User-Agent']).toBe(UA);
    expect(seen.opts.headers.Accept).toBe('*/*');
  });

  it('omitUa 时不带 User-Agent（FRED 会挂起伪装浏览器的连接）', async () => {
    let seen = null;
    setFetcher(async (url, opts) => {
      seen = opts;
      return fakeRes('ok');
    });
    await fetchRaw('https://example.test/x', { omitUa: true });
    expect(seen.headers['User-Agent']).toBeUndefined();
  });

  it('gb18030 解码（新浪必须用这个编码）', async () => {
    setFetcher(async () => fakeRes(Buffer.from([0xc2, 0xd7, 0xb6, 0xd8, 0xbd, 0xf0])));
    expect(await fetchRaw('https://example.test/x', { encoding: 'gb18030' })).toBe('伦敦金');
  });

  it('非 2xx 抛错并带上状态码与响应片段', async () => {
    setFetcher(async () => fakeRes('<html>rate limited</html>', { ok: false, status: 429 }));
    await expect(fetchRaw('https://example.test/x')).rejects.toThrow('HTTP 429: <html>rate limited</html>');
  });

  it('超时转成「请求超时」而不是透出 AbortError', async () => {
    setFetcher(
      (url, opts) =>
        new Promise((resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    await expect(fetchRaw('https://example.test/x', { timeoutMs: 10 })).rejects.toThrow('请求超时');
  });

  it('setFetcher(null) 恢复真实 fetch', async () => {
    setFetcher(async () => fakeRes('injected'));
    expect(await fetchRaw('https://example.test/x')).toBe('injected');
    setFetcher(null); // 不应抛错
  });
});
