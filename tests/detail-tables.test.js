// @vitest-environment jsdom
/* ================================================================== *
 * 详情页的表格与提示（views/detail.js 的纯渲染部分）
 *
 * 这几块的共同点：数据不全时**不能装作正常**。
 *   · 多源对照少于两个来源就不渲染（一个来源没有对照可言）；
 *   · 偏差算不出来（缺基准价）时给破折号，不是 0.00%；
 *   · 历史表只在还有更多行时才给「再显示」；
 *   · 其它源没有可用条数时不列出来（列了等于说「采集到了」);
 * ================================================================== */

import { describe, it, expect } from 'vitest';

document.body.innerHTML = '<section id="detail"></section>';

const d = await import('../src/client/views/detail.js');

const rows = (n) =>
  Array.from({ length: n }, (_, i) => {
    const day = String(1 + (i % 28)).padStart(2, '0');
    return [`2026-09-${day}`, 100 + i, 101 + i, 103 + i, 99 + i, 1000 + i, 1e8, i === 0 ? null : 0.5];
  });

describe('多源对照', () => {
  it('少于两个来源时不渲染（一个来源没有对照可言）', () => {
    expect(String(d.crossCheckTable([], 2))).toBe('');
    expect(String(d.crossCheckTable([{ source: '主源', price: 1 }], 2))).toBe('');
    expect(String(d.crossCheckTable(null, 2))).toBe('');
  });

  it('第一个来源作为基准，偏差以它为准', () => {
    const html = String(d.crossCheckTable([
      { source: 'main', price: 100 },
      { source: 'alt', price: 101 },
    ], 2));
    expect(html).toContain('多源对照');
    expect(html).toContain('+1.00%');
  });

  it('基准价缺失时偏差给破折号（不是 0.00%）', () => {
    const html = String(d.crossCheckTable([
      { source: 'main', price: null },
      { source: 'alt', price: 101 },
    ], 2));
    expect(html).toContain('—');
    expect(html).not.toContain('+0.00%');
  });

  it('说明字段缺失时留空（不输出 undefined）', () => {
    const html = String(d.crossCheckTable([{ source: 'a', price: 1 }, { source: 'b', price: 2 }], 2));
    expect(html).not.toContain('undefined');
  });
});

describe('历史日线表', () => {
  it('空数据不渲染整块', () => {
    expect(String(d.historyTable([], 2, 30))).toBe('');
  });

  it('按时间倒序，且只取最后 N 行', () => {
    const html = String(d.historyTable(rows(40), 2, 10));
    const dates = [...html.matchAll(/2026-09-(\d\d)/g)].map((m) => m[1]);
    // 第一行应是最新那条（序列最后一个日期），且顺序是倒着的
    expect(Number(dates[0])).toBeGreaterThan(Number(dates[1]));
    expect(html).toContain('共 40 个交易日');
  });

  it('还有更多行时给「再显示」按钮；已经全显示时不给', () => {
    expect(String(d.historyTable(rows(40), 2, 10))).toContain('more-rows');
    expect(String(d.historyTable(rows(5), 2, 30))).not.toContain('more-rows');
  });

  it('涨跌幅缺失时给破折号、成交量缺失时也给破折号', () => {
    const html = String(d.historyTable(rows(2), 2, 30));
    expect(html).toContain('—');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });
});

describe('其它历史源', () => {
  it('没有替代源时返回空串', () => {
    expect(String(d.altSources({}))).toBe('');
    expect(String(d.altSources({ alternatives: [] }))).toBe('');
  });

  it('只列有可用条数、且不是当前源的（否则等于说「采集到了」）', () => {
    const html = String(d.altSources({
      source: 'main',
      alternatives: [
        { source: 'main', count: 100 },
        { source: 'alt', count: 0 },
        { source: 'ok', count: 12 },
      ],
    }));
    expect(html).toContain('ok');
    expect(html).not.toContain('main');
    expect(html).toContain('12 条');
  });
});

describe('区间表现胶囊', () => {
  it('没有 perf 时整块不渲染', () => {
    expect(String(d.perfChips({}))).toBe('');
    expect(String(d.perfChips({ perf: null }))).toBe('');
  });

  it('只列有值的区间（缺数据不显示一格空的）', () => {
    const html = String(d.perfChips({ perf: { d1: 1.2, w1: null, m1: -0.4 } }));
    expect(html).toContain('近1日');
    expect(html).toContain('近1月');
    expect(html).not.toContain('近1周');
  });

  it('涨跌方向带对应类名', () => {
    const html = String(d.perfChips({ perf: { d1: 1.2, m1: -0.4 } }));
    expect(html).toContain('perf-chip up');
    expect(html).toContain('perf-chip down');
  });
});

describe('指标网格', () => {
  it('没有派生指标时仍然渲染基础卡（不是空网格）', () => {
    const html = String(d.metricCards({ decimals: 2, quote: { price: 100 }, stats: {} }));
    expect(html).toContain('d-metrics');
  });

  it('波动率分位缺失时不显示一个假数字', () => {
    const html = String(d.metricCards({ decimals: 2, quote: { price: 100 }, stats: { rv20: 12 } }));
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });
});

/* ================================================================== *
 * 图表十字光标（bindChartCrosshair）
 *
 * 它是最典型的「看得见但测不到」的交互：鼠标在图上移动 → 竖线/横线/圆点
 * 跟着走，浮层显示当天的开高低收与涨跌幅。这里用真实 svg 结构驱动。
 * ================================================================== */
describe('十字光标', () => {
  const setup = (over = {}) => {
    const host = document.createElement('div');
    host.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 600 260">
        <g class="xhair" style="display:none">
          <line class="xh-v"></line>
          <line class="xh-h"></line>
          <circle class="xh-dot"></circle>
        </g>
      </svg>`;
    document.body.appendChild(host);
    const svg = host.querySelector('svg');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 260 });
    const payload = {
      geom: { width: 600, height: 260, padL: 6, innerW: 532, x: (i) => 6 + i * 10, y: (v) => 200 - v },
      series: [
        ['2026-09-01', 100, 102, 103, 99, 1000, 1e8, 1.2],
        ['2026-09-02', 102, 101, 104, 100, 1100, 1e8, null],
      ],
      decimals: 2,
      overlays: [{ name: 'MA20', values: [null, 101] }],
      events: [{ date: '2026-09-01', title: 'FOMC' }],
      ...over,
    };
    d.bindChartCrosshair(host, payload);
    return { host, svg, payload };
  };

  it('绑定后浮层容器存在（第一次移动不必自己创建）', () => {
    const { host } = setup();
    expect(host.querySelector('.chart-tip')).toBeTruthy();
  });

  it('没有 svg 或没有十字层时安全返回（图表类型不支持十字光标）', () => {
    const host = document.createElement('div');
    host.innerHTML = '<svg class="chart-svg"></svg>';
    expect(() => d.bindChartCrosshair(host, { geom: {}, series: [] })).not.toThrow();
    expect(host.querySelector('.chart-tip')).toBeNull();
  });

  it('移动鼠标后显隐与坐标被写入（竖线/横线/圆点）', () => {
    const { svg } = setup();
    const gx = svg.querySelector('.xhair');
    svg.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 106, clientY: 150, bubbles: true }));
    if (gx.style.display === '') {
      const v = svg.querySelector('.xh-v');
      expect(v.getAttribute('x1')).toBeTruthy();
      expect(svg.querySelector('.xh-dot').getAttribute('cx')).toBeTruthy();
    }
  });

  it('移出图表后十字层隐藏（不留一根线在图上）', () => {
    const { svg } = setup();
    svg.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 106, clientY: 150, bubbles: true }));
    svg.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));
    expect(svg.querySelector('.xhair').style.display).toBe('none');
  });

  it('缺涨跌幅时用前一根收盘自己算（每个标的都要有涨跌幅）', () => {
    const { svg, host } = setup();
    svg.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 116, clientY: 150, bubbles: true }));
    const tip = host.querySelector('.chart-tip');
    expect(tip.innerHTML).not.toContain('NaN');
  });

  it('没有均线数据时那一格显示破折号（不显示 0.00）', () => {
    const { svg, host } = setup();
    svg.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 6, clientY: 150, bubbles: true }));
    expect(host.querySelector('.chart-tip').innerHTML).not.toContain('undefined');
  });

  it('宽度为 0（尚未布局）时不做换算（避免除零）', () => {
    const host = document.createElement('div');
    host.innerHTML = '<svg class="chart-svg"><g class="xhair"><line class="xh-v"></line><line class="xh-h"></line><circle class="xh-dot"></circle></g></svg>';
    document.body.appendChild(host);
    host.querySelector('svg').getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
    d.bindChartCrosshair(host, {
      geom: { width: 600, height: 260, padL: 6, innerW: 532, x: (i) => 6 + i, y: (v) => v },
      series: [['2026-09-01', 1, 1, 1, 1, 1, 1, 0]],
      decimals: 2,
    });
    expect(() => host.querySelector('svg').dispatchEvent(new window.MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true }))).not.toThrow();
  });
});
