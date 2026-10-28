// @vitest-environment jsdom
/* ================================================================== *
 * 详情页的图表与指标：纯计算 + 字符串输出
 *
 * detail.js 的 render/网络绑定之外是一大批可独立验证的函数：区间切片、
 * 周月聚合、对数刻度、坐标映射、K 线/分时/成交量 SVG、指标卡与多源对照。
 * 这些错了界面不会报错，只会「看起来对」。这里逐条钉住口径。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

import {
  WEEK_MS,
  sliceByRange,
  aggregateDaily,
  logTicks,
  sma,
  niceAxis,
  chartAxisOf,
  chartSVG,
  candleSVG,
  volumeSVG,
  intradaySVG,
  fmtVolume,
  fmtAmount,
  metricCards,
  perfChips,
  crossCheckTable,
  goldSpreadBlock,
} from '../src/client/views/detail.js';

const day = (date, close, extra = {}) => [
  date,
  close - 1,
  close,
  close + 1,
  close - 2,
  extra.volume ?? 1000,
  extra.amount ?? 1e6,
  extra.pct ?? null,
];

describe('sliceByRange：区间裁剪', () => {
  const daily = [
    day('2024-01-02', 10),
    day('2024-06-03', 20),
    day('2025-06-03', 30),
    day('2026-06-03', 40),
    day('2026-10-23', 50),
  ];

  it('空数组 / all / 未知区间原样返回', () => {
    expect(sliceByRange([], '1y')).toEqual([]);
    expect(sliceByRange(daily, 'all')).toBe(daily);
    expect(sliceByRange(daily, 'wat')).toBe(daily);
    expect(sliceByRange(daily, null)).toBe(daily);
  });

  it('1y 以「最后一个点」为锚回推 365 天，而不是以今天为锚', () => {
    const out = sliceByRange(daily, '1y');
    expect(out.map((r) => r[0])).toEqual(['2026-06-03', '2026-10-23']);
  });

  it('裁剪后不足两点时退回全量（不画一条点）', () => {
    const onlyOneRecent = [day('2019-01-02', 1), day('2019-01-03', 2), day('2020-12-31', 3)];
    expect(sliceByRange(onlyOneRecent, '1y')).toBe(onlyOneRecent);
    expect(sliceByRange(daily, '3y').length).toBe(5);
    expect(sliceByRange(daily, '5y')).toEqual(daily);
  });

  it('WEEK_MS 是一周毫秒数', () => {
    expect(WEEK_MS).toBe(7 * 86400000);
  });
});

describe('aggregateDaily：日/周/月聚合', () => {
  const daily = [
    day('2026-10-01', 10, { volume: 100 }),
    day('2026-10-02', 11, { volume: 200 }),
    day('2026-10-05', 12, { volume: 300 }),
    day('2026-11-02', 13, { volume: 400 }),
  ];

  it('day 模式直接返回原数组', () => {
    expect(aggregateDaily(daily, 'day')).toBe(daily);
  });

  it('周聚合：以周一为界，开取首日、收取末日、高低取极值、量额求和', () => {
    const out = aggregateDaily(daily, 'week');
    // 10-01(四)/10-02(五) 同周；10-05 是下一个周一；11-02 再下一周
    expect(out).toHaveLength(3);
    const [first] = out;
    expect(first[0]).toBe('2026-10-01');
    expect(first[1]).toBe(9); // 首日 open
    expect(first[2]).toBe(11); // 末日 close
    expect(first[3]).toBe(12); // max(high)
    expect(first[4]).toBe(8); // min(low)
    expect(first[5]).toBe(300);
    expect(first[6]).toBe(2e6);
    expect(out[1][0]).toBe('2026-10-05');
    expect(out[2][0]).toBe('2026-11-02');
  });

  it('月聚合：按 YYYY-MM 分组', () => {
    const out = aggregateDaily(daily, 'month');
    expect(out.map((r) => r[0])).toEqual(['2026-10-01', '2026-11-02']);
    expect(out[1][2]).toBe(13);
  });

  it('聚合后从第二根开始补涨跌幅；缺 high/low/volume 的行不污染极值', () => {
    const rows = [
      ['2026-10-01', 10, 10, null, null, null, null],
      ['2026-10-02', 11, 12, null, null, null, null],
    ];
    const out = aggregateDaily(rows, 'week');
    expect(out).toHaveLength(1);
    expect(out[0][7]).toBeNull(); // 单根没有前收
    expect(out[0][3]).toBeNull();
    expect(out[0][5]).toBeNull();

    const two = aggregateDaily([day('2026-10-05', 10), day('2026-10-12', 11)], 'week');
    expect(two).toHaveLength(2);
    expect(two[1][7]).toBeCloseTo(10, 10); // (11-10)/10*100
  });
});

describe('logTicks / niceAxis / sma', () => {
  it('对数刻度只出 1/2/5 × 10^n，并落在 ±6% 视野内', () => {
    const ticks = logTicks(9, 1100);
    expect(ticks).toContain(10);
    expect(ticks).toContain(100);
    expect(ticks).toContain(1000);
    expect(ticks.every((v) => v >= 9 * 0.94 && v <= 1100 * 1.06)).toBe(true);
    // 没有 300 这种非整档
    expect(ticks.some((v) => String(v)[0] === '3')).toBe(false);
  });

  it('niceAxis：等值时人为加 pad，避免 step=0 卡死', () => {
    const a = niceAxis(5, 5);
    expect(a.axisMax).toBeGreaterThan(a.axisMin);
    expect(a.step).toBeGreaterThan(0);
    const b = niceAxis(0, 100, 4);
    expect(b.step).toBe(25);
    expect(b.axisMin).toBe(0);
    expect(b.axisMax).toBe(100);
  });

  it('sma：前 n-1 位是 null，之后是窗口均值', () => {
    const series = [1, 2, 3, 4, 5].map((v) => [null, null, v]);
    const out = sma(series, 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(2, 10);
    expect(out[4]).toBeCloseTo(4, 10);
  });
});

describe('chartAxisOf：线性/对数坐标映射', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ v: 10 + i, label: `d${i}` }));

  it('线性轴把数据包进去，x 单调、y 反向', () => {
    const g = chartAxisOf(pts, { width: 400, height: 200 });
    expect(g.dataMin).toBe(10);
    expect(g.dataMax).toBe(19);
    expect(g.axisMin).toBeLessThanOrEqual(10);
    expect(g.axisMax).toBeGreaterThanOrEqual(19);
    expect(g.x(0)).toBeLessThan(g.x(9));
    expect(g.y(g.dataMax)).toBeLessThan(g.y(g.dataMin));
    expect(g.logMode).toBe(false);
    expect(g.tickValues.length).toBeGreaterThan(1);
  });

  it('hiLo 把影线极值纳入轴范围', () => {
    const g = chartAxisOf(pts, { hiLo: [[2, 40]] });
    expect(g.dataMin).toBe(2);
    expect(g.dataMax).toBe(40);
  });

  it('useLog 且全为正时启用对数，y 间距按 log10 压缩', () => {
    const wide = [1, 10, 100, 1000].map((v) => ({ v }));
    const g = chartAxisOf(wide, { useLog: true });
    expect(g.logMode).toBe(true);
    expect(g.tf(100)).toBe(2);
    expect(g.inv(2)).toBeCloseTo(100, 10);
    expect(g.y(1000) - g.y(100)).toBeCloseTo(g.y(100) - g.y(10), 6);
  });

  it('useLog 但存在非正值时退回线性（画不出 log 0）', () => {
    const g = chartAxisOf([{ v: 0 }, { v: 10 }], { useLog: true });
    expect(g.logMode).toBe(false);
  });

  it('单点也能算轴（x 除零保护）', () => {
    const g = chartAxisOf([{ v: 5 }]);
    expect(Number.isFinite(g.x(0))).toBe(true);
  });
});

describe('SVG 输出：空数据、折线、K 线、成交量、分时', () => {
  const pts = Array.from({ length: 24 }, (_, i) => ({ v: 100 + Math.sin(i / 3) * 5, label: `2026-10-${String(i + 1).padStart(2, '0')}` }));

  it('点数不足时给占位，而不是半张图', () => {
    expect(chartSVG([])).toContain('没有足够的历史数据');
    expect(chartSVG([{ v: 1 }])).toContain('没有足够的历史数据');
    expect(candleSVG([])).toContain('没有足够的历史数据');
    expect(intradaySVG([])).toContain('暂无分时数据');
    expect(volumeSVG([])).toBe('');
    expect(volumeSVG([{ v: 0, pct: 0 }])).toBe('');
  });

  it('chartSVG：主路径、涨跌配色、均线叠加、事件标记、月份模式', () => {
    const up = chartSVG(pts, { decimals: 2, dir: 'up', overlays: [{ color: '#f00', values: pts.map((p) => p.v) }] });
    expect(up.startsWith('<svg')).toBe(true);
    expect(up).toContain('var(--up)');
    expect(up).toContain('class="grid-line"');
    expect(up).toContain('axis-text');
    expect(up.match(/<path/g).length).toBeGreaterThanOrEqual(2); // 面积 + 均线

    const down = chartSVG(pts, { dir: 'down' });
    expect(down).toContain('var(--down)');
    const flat = chartSVG(pts);
    expect(flat).toContain('var(--flat)');

    const withEvents = chartSVG(pts, { events: [{ date: '2026-10-10', kind: 'fomc' }] });
    expect(withEvents).toContain('evt-line k-fomc');
    // 事件日期落在第一个点之前时忽略（idx<=0）
    const ignored = chartSVG(pts, { events: [{ date: '2000-01-01', kind: 'cpi' }] });
    expect(ignored).not.toContain('evt-line');

    const month = chartSVG(pts, { monthMode: true });
    expect(month).toContain('class="axis-text"');
    // 窄屏只出 3 个日期刻度
    const narrow = chartSVG(pts, { width: 400 });
    expect(narrow).toContain('<svg');
  });

  it('chartSVG：均线全 null 时不画空 path', () => {
    const svg = chartSVG(pts, { overlays: [{ color: '#f00', values: pts.map(() => null) }] });
    expect(svg.match(/<path/g).length).toBeGreaterThanOrEqual(1);
  });

  it('candleSVG：每根蜡烛一根 rect，影线随密度出现', () => {
    const series = Array.from({ length: 20 }, (_, i) => {
      const close = 100 + (i < 10 ? i : 20 - i);
      // 前半段收 > 开（阳线），后半段收 < 开（阴线）
      const open = i < 10 ? close - 1 : close + 1;
      return [`2026-10-${String(i + 1).padStart(2, '0')}`, open, close, close + 1, close - 2, 1000, 1e6, null];
    });
    const svg = candleSVG(series, { decimals: 2 });
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(20);
    expect(svg).toContain('chart-candle');
    expect(svg).toContain('var(--up)');
    expect(svg).toContain('var(--down)');
    // slot 太小（宽 80）时不再画影线
    const dense = candleSVG(series, { width: 80 });
    expect((dense.match(/stroke-width="1"/g) ?? []).length).toBe(0);

    const withEvents = candleSVG(series, { events: [{ date: '2026-10-10', kind: 'cpi' }] });
    expect(withEvents).toContain('evt-line k-cpi');
  });

  it('volumeSVG：按涨跌着色，零量跳过，标题给出最大值', () => {
    const bars = [
      { v: 100, pct: 1 },
      { v: 0, pct: 0 },
      { v: 200, pct: -1 },
      { v: 50, pct: 0 },
      { v: 30, pct: null },
    ];
    const svg = volumeSVG(bars);
    expect(svg).toContain('vol-bar up');
    expect(svg).toContain('vol-bar down');
    expect(svg).toContain('vol-bar flat');
    expect((svg.match(/<rect/g) ?? []).length).toBe(4);
    expect(svg).toContain('成交量');
  });

  it('intradaySVG：画昨收基准线与最新价标注', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ p: 100 + (i % 5), t: 1793000000000 + i * 60000 }));
    const svg = intradaySVG(points, { prevClose: 101, decimals: 2 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('base-line');
    expect(svg).toContain('分时');

    // prevClose 缺失 / 全等值时也不 NaN
    const flat = intradaySVG(points.map((p) => ({ p: 100, t: p.t })));
    expect(flat).toContain('<svg');
  });
});

describe('fmtVolume / fmtAmount 档位', () => {
  it('成交量按 亿/万 缩放，非法值给 null', () => {
    expect(fmtVolume(1.2e8)).toBe('1.20 亿');
    expect(fmtVolume(3.4e4)).toBe('3.40 万');
    expect(fmtVolume(999)).toBe('999');
    expect(fmtVolume(0)).toBeNull();
    expect(fmtVolume(null)).toBeNull();
    expect(fmtVolume(Number.NaN)).toBeNull();
  });

  it('成交额按 万亿/亿/万 缩放', () => {
    expect(fmtAmount(2.5e12)).toBe('2.50 万亿');
    expect(fmtAmount(3.2e8)).toBe('3.20 亿');
    expect(fmtAmount(5.6e4)).toBe('5.60 万');
    expect(fmtAmount(1234)).toBe('1234');
    expect(fmtAmount(0)).toBeNull();
  });
});

describe('metricCards / perfChips / crossCheckTable / goldSpreadBlock', () => {
  it('metricCards：basis=settle 时标签是「昨结算」，空字段不生成卡片', () => {
    const data = {
      decimals: 2,
      priceBasis: 'settle',
      quote: { open: 100, prevClose: 99, high: 102, low: 98 },
      ext: { volume: 1e6, amount: 2e8, turnoverRate: 1.23 },
      stats: {
        high52: 120,
        low52: 80,
        fromHigh52: -10,
        fromLow52: 25,
        rv20: 18.5,
        rv20Percentile: 70,
        volRegime: '偏高',
        rv60: 20.1,
        volatility: 22.2,
        histHigh: { value: 130 },
        histLow: { value: 10 },
        ma20: 101,
        ma60: 99.5,
        ma120: 98,
        ma250: 97,
        maxDrawdown: { pct: -33.3 },
        bestDay: { pct: 5.5 },
        worstDay: { pct: -6.1 },
        streak: 3,
      },
    };
    const html = String(metricCards(data));
    expect(html).toContain('昨结算');
    expect(html).toContain('振幅');
    // 产品 2.5 之后「实现波动率」是术语按钮：标签文本仍要在，但形态是 <button>
    expect(html).toContain('实现波动率');
    expect(html).toContain('RV20');
    expect(html).toContain('data-gl-term="realizedVol"');
    expect(html).toContain('偏高 70 分位');
    expect(html).toContain('连涨 3 日');
    expect(html).toContain('最大回撤');
    expect((html.match(/class="metric/g) ?? []).length).toBeGreaterThan(15);

    const bare = String(metricCards({ decimals: 2, quote: {}, ext: {}, stats: {} }));
    expect(bare).toContain('d-metrics');
    // 空值走 fmtPrice 的「—」占位，四个基础卡仍在；衍生指标一个都不出
    expect((bare.match(/class="metric /g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(bare).not.toContain('RV20');
    expect(bare).not.toContain('52周最高');
  });

  it('metricCards：负 streak 说「连跌」，无分位时不写分位', () => {
    const html = String(metricCards({
      decimals: 2,
      quote: {},
      ext: {},
      stats: { streak: -2, rv20: 9.9 },
    }));
    expect(html).toContain('连跌 2 日');
    expect(html).not.toContain('分位');
  });

  it('perfChips：缺 perf 返回空串，有值才出 chip', () => {
    expect(perfChips(null)).toBe('');
    expect(perfChips({})).toBe('');
    const html = String(perfChips({ perf: { d1: 1.2, w1: -0.5, m1: null } }));
    expect(html).toContain('近1日');
    expect(html).toContain('近1周');
    expect(html).not.toContain('近1月');
    expect(html).toContain('perf-chip up');
    expect(html).toContain('perf-chip down');
  });

  it('crossCheckTable：少于两个源不渲染；偏差相对首源计算', () => {
    expect(crossCheckTable([], 2)).toBe('');
    expect(crossCheckTable([{ source: 'a', price: 1 }], 2)).toBe('');
    const html = String(crossCheckTable(
      [
        { source: 'eastmoney:100.SPX', price: 100, note: '主源' },
        { source: 'sina:gb_$inx', price: 101 },
        { source: 'bad:price', price: null },
      ],
      2,
    ));
    expect(html).toContain('多源对照');
    expect(html).toContain('东财'); // prettySource 映射
    expect(html).toContain('+1.00%');
    expect(html).toContain('—');
  });

  it('goldSpreadBlock：没有折算价时不出块；有价差时带正负号', () => {
    expect(goldSpreadBlock(null, 2)).toBe('');
    expect(goldSpreadBlock({ convertedPerGram: 0 }, 2)).toBe('');
    const html = String(goldSpreadBlock(
      { xauUsd: 2650, usdCny: 7.1, convertedPerGram: 604.9, domesticPrice: 610.2, premiumPct: 0.87, gramsPerOunce: 31.1035 },
      2,
    ));
    expect(html).toContain('内外盘对照');
    expect(html).toContain('+0.87%');
    expect(html).toContain('31.1035');
  });
});
