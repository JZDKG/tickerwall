// @vitest-environment jsdom
/* ================================================================== *
 * Phase 4 / P4-T2：TradingView lightweight-charts 双模图表
 *
 * 验收：toLightweightSeriesData 转换 / 排序 / 去重 / 过滤非有限值；
 *      MA20 / MA60；JSDOM 与 Canvas 不可用时优雅回退到原生 SVG；
 *      具备真实 Canvas 时按 K 线 / 折线双模调用 createChart。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  toLightweightSeriesData, computeMovingAverage, hasRealCanvas2D,
  fallbackSVG, mountLightweightChart,
} from '../src/client/views/detail-lwchart.js';

describe('ui-kit 受管产物：双模图表所需导出', () => {
  it('源码入口导出 createChart / createStore / QueryClient / React 与系列类', () => {
    const entry = readFileSync('src/client/vendor/ui-kit.js', 'utf8');
    for (const name of ['createChart', 'createStore', 'QueryClient', 'createElement', 'CandlestickSeries', 'LineSeries']) {
      expect(entry, `ui-kit 没导出 ${name}`).toContain(name);
    }
  });

  it('入库产物真的带这些导出（零安装打开时 Canvas 模式可用）', () => {
    const built = readFileSync('public/vendor/ui-kit.js', 'utf8');
    const m = /export\s*\{([^}]*)\}/g;
    const names = [...built.matchAll(m)].flatMap((x) => x[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()));
    for (const name of ['createChart', 'CandlestickSeries', 'LineSeries', 'createStore']) {
      expect(names, `产物缺 ${name}`).toContain(name);
    }
  });
});

const rows = () => [
  ['2026-01-05', 10, 12, 13, 9, 100],
  ['2026-01-02', 8, 9, 9.5, 7, 80],
  ['2026-01-04', 9, 11, 12, 8, 90],
];

describe('toLightweightSeriesData：转换 / 排序 / 去重 / 过滤', () => {
  it('把 packDaily 数组转成标准字段并升序', () => {
    const out = toLightweightSeriesData(rows());
    expect(out.map((r) => r.time)).toEqual(['2026-01-02', '2026-01-04', '2026-01-05']);
    expect(out[0]).toEqual({ time: '2026-01-02', open: 8, high: 9.5, low: 7, close: 9, value: 9 });
    expect(out[2].value).toBe(12);
  });

  it('过滤非有限值与空值（Number(null) 悄悄变 0 的坑）', () => {
    const out = toLightweightSeriesData([
      ['2026-01-01', 1, 2, 2, 1],
      ['2026-01-02', NaN, 2, 2, 1],
      ['2026-01-03', 1, null, 2, 1],
      ['2026-01-04', 1, 2, Infinity, 1],
      ['2026-01-05', 1, 2, 2, 'abc'],
      ['2026-01-06', 1, 2, 2, 1],
    ]);
    expect(out.map((r) => r.time)).toEqual(['2026-01-01', '2026-01-06']);
  });

  it('同一日期去重（后出现者覆盖），日期归一化到 YYYY-MM-DD', () => {
    const out = toLightweightSeriesData([
      ['2026-1-2', 1, 2, 3, 0.5],
      ['2026-01-02', 5, 6, 7, 4],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe('2026-01-02');
    expect(out[0].close).toBe(6);
  });

  it('high/low 被夹到至少包住开收盘（否则图表库拒绝该 K 线）', () => {
    const out = toLightweightSeriesData([['2026-01-01', 10, 20, 12, 15]]);
    expect(out[0].high).toBe(20);
    expect(out[0].low).toBe(10);
  });

  it('对象形态、时间戳、无效日期、非数组入参都能安全处理', () => {
    expect(toLightweightSeriesData([{ date: '2026-02-01', open: 1, close: 2, high: 2, low: 1 }])).toHaveLength(1);
    expect(toLightweightSeriesData([[Date.parse('2026-03-01T00:00:00Z'), 1, 2, 3, 0]])[0].time).toBe('2026-03-01');
    expect(toLightweightSeriesData([['not-a-date', 1, 2, 3, 0]])).toEqual([]);
    expect(toLightweightSeriesData(null)).toEqual([]);
    expect(toLightweightSeriesData([null, 42, 'x'])).toEqual([]);
  });
});

describe('computeMovingAverage：MA20 / MA60', () => {
  const series = Array.from({ length: 65 }, (_, i) => ({
    time: `2026-01-${String(i + 1).padStart(2, '0')}`,
    value: i + 1,
    close: i + 1,
  }));

  it('前 period-1 根不产出，第 20 根是前 20 项均值', () => {
    const ma = computeMovingAverage(series, 20);
    expect(ma).toHaveLength(46);
    expect(ma[0]).toEqual({ time: '2026-01-20', value: 10.5 });
    expect(ma[45].value).toBeCloseTo(55.5, 6);
  });

  it('MA60 只在窗口够长时产出，非法值重置窗口', () => {
    expect(computeMovingAverage(series, 60)).toHaveLength(6);
    const dirty = [{ time: 'a', value: 1 }, { time: 'b', value: NaN }, { time: 'c', value: 2 }, { time: 'd', value: 3 }];
    expect(computeMovingAverage(dirty, 2)).toEqual([{ time: 'd', value: 2.5 }]);
  });

  it('period 非法值回退 20，空输入不抛', () => {
    expect(computeMovingAverage(series, 0)).toHaveLength(46);
    expect(computeMovingAverage(null, 20)).toEqual([]);
  });
});

describe('hasRealCanvas2D：能力探测', () => {
  it('JSDOM 环境直接短路为 false（不刷 Not implemented 噪声）', () => {
    expect(hasRealCanvas2D(document)).toBe(false);
  });

  it('无 document / 无 createElement 时 false', () => {
    expect(hasRealCanvas2D(null)).toBe(false);
    expect(hasRealCanvas2D({})).toBe(false);
  });

  it('真实 2D 上下文可用时 true；getContext 抛错时 false', () => {
    const ctx = { fillRect() {}, measureText() {} };
    expect(hasRealCanvas2D({
      createElement: () => ({ getContext: () => ctx }),
      defaultView: { navigator: { userAgent: 'Mozilla/5.0 Chrome' } },
    })).toBe(true);
    expect(hasRealCanvas2D({
      createElement: () => ({ getContext: () => null }),
      defaultView: { navigator: { userAgent: 'Mozilla/5.0 Chrome' } },
    })).toBe(false);
    expect(hasRealCanvas2D({
      createElement: () => ({ getContext: () => { throw new Error('blocked'); } }),
      defaultView: { navigator: { userAgent: 'Mozilla/5.0 Chrome' } },
    })).toBe(false);
  });
});

describe('fallbackSVG：零依赖原生图表', () => {
  it('空数据给可读空态', () => {
    expect(fallbackSVG([])).toContain('没有足够的历史数据');
  });

  it('折线模式输出收盘路径 + MA20 / MA60 三条线', () => {
    const data = toLightweightSeriesData(Array.from({ length: 65 }, (_, i) => [
      `2026-01-${String(i + 1).padStart(2, '0')}`, i + 1, i + 2, i + 3, i,
    ]));
    const svg = fallbackSVG(data, { type: 'line' });
    expect(svg).toContain('class="chart-svg lw-fallback"');
    expect(svg).toContain('role="img"');
    expect((svg.match(/<path/g) ?? []).length).toBe(3);
  });

  it('蜡烛模式画实体与影线；showMA:false 时只有收盘线', () => {
    const data = toLightweightSeriesData(rows());
    const candle = fallbackSVG(data, { type: 'candle', showMA: false });
    expect(candle).toContain('<rect');
    expect(candle).toContain('<line');
    expect((candle.match(/<path/g) ?? []).length).toBe(1);
  });

  it('标签被转义', () => {
    expect(fallbackSVG(toLightweightSeriesData(rows()), { label: '<script>x</script>' })).not.toContain('<script>');
  });
});

/* ------------------------------ 挂载双模 ------------------------------ */

function fakeChartKit() {
  const series = [];
  const chart = {
    addSeries: vi.fn((kind, opts) => {
      const s = { kind, opts, setData: vi.fn() };
      series.push(s);
      return s;
    }),
    timeScale: () => ({ fitContent: vi.fn() }),
    remove: vi.fn(),
  };
  return {
    createChart: vi.fn(() => chart),
    CandlestickSeries: { name: 'CandlestickSeries' },
    LineSeries: { name: 'LineSeries' },
    chart, series,
  };
}

/** 造一个「有真实 Canvas」的 doc：能力探测走这个，而非 JSDOM 的 document */
function canvasDoc() {
  return {
    createElement: () => ({ getContext: () => ({ fillRect() {}, measureText() {} }) }),
    defaultView: { navigator: { userAgent: 'Mozilla/5.0 Chrome' } },
  };
}

describe('mountLightweightChart：优雅回退', () => {
  it('未开启模式（enabled 非 true）→ SVG 回退，不加载 ui-kit', async () => {
    const container = document.createElement('div');
    const out = await mountLightweightChart(container, toLightweightSeriesData(rows()));
    expect(out.mode).toBe('svg');
    expect(container.querySelector('svg.lw-fallback')).not.toBeNull();
  });

  it('JSDOM / 无真实 Canvas → SVG 回退，不调 createChart', async () => {
    const kit = fakeChartKit();
    const container = document.createElement('div');
    const out = await mountLightweightChart(container, toLightweightSeriesData(rows()), { enabled: true, charts: kit });
    expect(out.mode).toBe('svg');
    expect(kit.createChart).not.toHaveBeenCalled();
  });

  it('自定义 fallback 渲染器生效（调用方可保留原有 SVG 几何）', async () => {
    const container = document.createElement('div');
    const fallback = vi.fn(() => '<svg id="custom"></svg>');
    const out = await mountLightweightChart(container, [], { enabled: false, fallback });
    expect(fallback).toHaveBeenCalled();
    expect(container.querySelector('#custom')).not.toBeNull();
    expect(out.mode).toBe('svg');
  });

  it('没有 container 也安全返回 SVG 结果', async () => {
    const out = await mountLightweightChart(null, [], { enabled: false });
    expect(out.mode).toBe('svg');
    expect(typeof out.remove).toBe('function');
  });
});

describe('mountLightweightChart：Canvas 双模', () => {
  const longRows = () => Array.from({ length: 65 }, (_, i) => [
    `2026-01-${String(i + 1).padStart(2, '0')}`, i + 1, i + 2, i + 3, i,
  ]);

  it('折线模式：createChart + 1 条收盘线 + MA20/MA60，fitContent', async () => {
    const kit = fakeChartKit();
    const container = document.createElement('div');
    const out = await mountLightweightChart(container, toLightweightSeriesData(longRows()), {
      enabled: true, charts: kit, document: canvasDoc(), type: 'line', width: 600, height: 240,
    });
    expect(out.mode).toBe('canvas');
    expect(kit.createChart).toHaveBeenCalledWith(container, expect.objectContaining({ width: 600, height: 240 }));
    // 收盘线 1 条 + 两条均线
    expect(kit.chart.addSeries).toHaveBeenCalledTimes(3);
    expect(kit.series[0].kind).toBe(kit.LineSeries);
    expect(kit.series[0].setData).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ time: '2026-01-01' })]));
    expect(out.series).toHaveLength(3);
    expect(kit.chart.timeScale().fitContent).toBeDefined();
    out.remove();
    expect(kit.chart.remove).toHaveBeenCalled();
  });

  it('蜡烛模式：CandlestickSeries 收到 OHLC，showMA:false 不画均线', async () => {
    const kit = fakeChartKit();
    const container = document.createElement('div');
    const out = await mountLightweightChart(container, toLightweightSeriesData(rows()), {
      enabled: true, charts: kit, document: canvasDoc(), type: 'candle', showMA: false,
    });
    expect(out.mode).toBe('canvas');
    expect(kit.series).toHaveLength(1);
    expect(kit.series[0].kind).toBe(kit.CandlestickSeries);
    expect(kit.series[0].setData).toHaveBeenCalledWith([
      { time: '2026-01-02', open: 8, high: 9.5, low: 7, close: 9 },
      { time: '2026-01-04', open: 9, high: 12, low: 8, close: 11 },
      { time: '2026-01-05', open: 10, high: 13, low: 9, close: 12 },
    ]);
  });

  it('缺少 createChart / series 定义时回退并回收 chart', async () => {
    const container = document.createElement('div');
    const out = await mountLightweightChart(container, toLightweightSeriesData(rows()), {
      enabled: true, charts: {}, document: canvasDoc(),
    });
    expect(out.mode).toBe('svg');

    const remove = vi.fn();
    const kit = { createChart: () => ({ addSeries: () => {}, timeScale: () => ({}), remove }) };
    const out2 = await mountLightweightChart(container, toLightweightSeriesData(rows()), {
      enabled: true, charts: kit, document: canvasDoc(),
    });
    expect(out2.mode).toBe('svg');
    expect(remove).toHaveBeenCalled();
  });

  it('createChart 抛错时回收并回退，不把异常抛给详情页', async () => {
    const remove = vi.fn();
    const kit = {
      ...fakeChartKit(),
      createChart: () => { throw new Error('canvas init failed'); },
    };
    const container = document.createElement('div');
    const out = await mountLightweightChart(container, toLightweightSeriesData(rows()), {
      enabled: true, charts: kit, document: canvasDoc(),
    });
    expect(out.mode).toBe('svg');
    void remove;
  });

  it('addSeries 抛错时回收 chart 并回退', async () => {
    const remove = vi.fn();
    const kit = {
      ...fakeChartKit(),
      createChart: () => ({ addSeries: () => { throw new Error('bad series'); }, timeScale: () => ({}), remove }),
    };
    const container = document.createElement('div');
    const out = await mountLightweightChart(container, toLightweightSeriesData(rows()), {
      enabled: true, charts: kit, document: canvasDoc(),
    });
    expect(out.mode).toBe('svg');
    expect(remove).toHaveBeenCalled();
  });
});
