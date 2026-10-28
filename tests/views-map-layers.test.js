// @vitest-environment jsdom
/* ================================================================== *
 * 地图图层：时间轴、城市锚点、播报台、经纬网/昼夜
 *
 * 全是「数据 → 字符串/几何」的层。地图上出错不会抛异常，只会安静地画错：
 * 时间轴假装覆盖 24h、城市标签在没有报价时占位、播报台的火花线取到僵尸价。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

document.body.innerHTML = '<section id="map"><svg></svg></section><main id="rows"></main>';

const timeline = await import('../src/client/views/map/layers/timeline-bar.js');
const markers = await import('../src/client/views/map/layers/markers.js');
const broadcast = await import('../src/client/views/map/layers/broadcast.js');
const mapView = await import('../src/client/views/map.js');
const { MAP_CITIES } = await import('../src/client/views/map/geo/cities.js');

const quote = (over = {}) => ({
  id: 'sp500',
  name: '标普500',
  ok: true,
  price: 5738.2,
  changePct: 0.83,
  history: [{ t: 1, p: 5700 }, { t: 2, p: 5738 }],
  marketStatus: { open: true },
  ...over,
});

const QUOTES = new Map([
  ['sp500', quote()],
  ['us10y', quote({ id: 'us10y', name: '美债10年', changePct: -1.2 })],
  ['btc', quote({ id: 'btc', name: '比特币', ok: false })],
]);

/* ------------------------------ 时间轴 ------------------------------ */

describe('timeline-bar：24 格柱状带', () => {
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    start: Date.UTC(2026, 9, 26, 0, 0) + i * 3600_000,
    count: i % 4,
    color: i % 4 >= 3 ? '#f5455c' : '#5b9cf8',
  }));

  it('hhmmOf 按北京时间输出 HH:MM', () => {
    expect(timeline.hhmmOf(Date.UTC(2026, 9, 26, 0, 5))).toBe('08:05');
  });

  it('柱高至少留 2%，空桶也有底座；覆盖不足时如实标注', () => {
    const html = timeline.timelineBarHtml({
      buckets,
      total: 30,
      coveredFrom: Date.UTC(2026, 9, 26, 2, 0),
      from: '2026-10-26T00:00:00Z',
    });
    expect(html).toContain('tl-cols');
    expect((html.match(/<button type="button" class="tl-col/g) ?? []).length).toBe(24);
    expect(html).toContain('--h:2%'); // 空桶底座
    expect(html).toContain('覆盖 10:00 起 · 30 条');
    expect(html).toContain('24 小时');

    const none = timeline.timelineBarHtml({ buckets, total: 0, coveredFrom: null, from: null });
    expect(none).toContain('暂无归档数据');
  });

  it('active / playing 状态反映到类名与按钮文案', () => {
    const html = timeline.timelineBarHtml(
      { buckets, total: 3, coveredFrom: null, from: null },
      { activeIndex: 2, playing: true },
    );
    expect(html).toContain('tl-col on');
    expect(html).toContain('■ 停止');
    expect(html).toContain('回到实时');
    expect(html).toContain('data-index="2"');
  });

  it('bucketRangeText 处理空桶与正常桶', () => {
    expect(timeline.bucketRangeText(null)).toBe('');
    const text = timeline.bucketRangeText({ start: buckets[0].start, end: buckets[0].start + 3600_000 });
    expect(text).toMatch(/\d{2}:\d{2}/);
  });
});

/* ------------------------------ 城市锚点 ------------------------------ */

describe('markers：城市锚点与 LOD', () => {
  const city = MAP_CITIES.find((c) => c.key === 'ny');

  it('lodClassFor 三档阈值', () => {
    expect(markers.lodClassFor(1)).toBe('lod-0');
    expect(markers.lodClassFor(1.5)).toBe('lod-1');
    expect(markers.lodClassFor(2.2)).toBe('lod-2');
  });

  it('没有可用报价时整块不渲染（不占位）', () => {
    expect(markers.cityAnchorHtml(city, new Map())).toBe('');
    expect(markers.cityAnchorHtml(city, new Map([['sp500', quote({ ok: false })]]))).toBe('');
  });

  it('有报价时给出锚点坐标、涨跌方向、火花线与开市状态', () => {
    const html = markers.cityAnchorHtml(city, QUOTES);
    expect(html).toContain('map-anchor');
    expect(html).toContain('data-city="ny"');
    expect(html).toContain('data-lx=');
    expect(html).toContain('is-open');
    expect(html).toContain('ma-line up');
    expect(html).toContain('ma-pct up');
    expect(html).toContain('+0.83%');

    const closed = markers.cityAnchorHtml(city, new Map([['sp500', quote({ marketStatus: { open: false }, changePct: -0.5 })]]));
    expect(closed).toContain('is-closed');
    expect(closed).toContain('ma-pct down');
  });

  it('超过 4 行提示放大可见更多；无火花线时不画 svg', () => {
    const ids = MAP_CITIES.find((c) => c.key === 'ny').ids;
    const many = new Map(ids.map((id, i) => [id, quote({ id, name: id, history: [], changePct: i })]));
    const html = markers.cityAnchorHtml(city, many);
    expect(html).toContain('ma-more');
    expect(html).not.toContain('<svg class="ma-spark"');
  });

  it('cityAnchorsHtml 拼接整层', () => {
    const html = markers.cityAnchorsHtml([city, MAP_CITIES[0]], QUOTES);
    expect((html.match(/map-anchor/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------ 播报台 ------------------------------ */

describe('broadcast：底部播报台', () => {
  const ev = {
    time: '2026-10-26 10:05:00',
    level: 'high',
    publisher: '路透社',
    source: '英文财经',
    topics: [{ key: 'fed', label: '货币政策', strong: true }],
    symbols: ['sp500', 'us10y'],
    title: '美联储宣布降息',
    body: '正文',
  };

  it('无事件时待命文案', () => {
    expect(broadcast.broadcastHtml(null, new Map())).toContain('实时播报待命中');
  });

  it('展示来源/时间、最多两个标的、火花线', () => {
    const html = broadcast.broadcastHtml(ev, QUOTES);
    expect(html).toContain('路透社 · 10:05');
    expect(html).toContain('bc-mark up');
    expect(html).toContain('bc-mark down');
    expect(html).toContain('bc-spark-line up');
    expect(html).toContain('美联储宣布降息');
  });

  it('标的缺报价 / 无历史时降级，不崩', () => {
    const html = broadcast.broadcastHtml({ ...ev, symbols: ['btc', 'nope'] }, QUOTES);
    expect(html).not.toContain('class="bc-mark ');
    expect(html).toContain('bc-spark');
  });
});

/* ------------------------------ 地图纯几何 ------------------------------ */

describe('map：经纬网 / 昼夜 / 弧线', () => {
  it('graticulePath 返回非空 path 字符串', () => {
    const d = mapView.graticulePath();
    expect(typeof d).toBe('string');
    expect(d.length).toBeGreaterThan(100);
  });

  it('nightLayerPaths：三层晨昏带 + 黑夜面片 + 晨昏线', () => {
    const out = mapView.nightLayerPaths(new Date('2026-10-26T12:00:00Z'));
    expect(out.sun).toBeTruthy();
    expect(out.outer.length).toBeGreaterThanOrEqual(1);
    expect(out.outer.every((b) => b.d.includes('M'))).toBe(true);
    expect(out.core).toContain('M');
    expect(out.line).toContain('M');
  });

  it('arcBetween：二次贝塞尔，中点控制点被抬升', () => {
    const d = mapView.arcBetween([0, 0], [100, 0]);
    expect(d.startsWith('M0.0,0.0')).toBe(true);
    expect(d).toContain('Q50.0,-');
    expect(d.endsWith('100.0,0.0')).toBe(true);
  });

  it('impactArcsFor：无事件/未知赛区返回空串；已知赛区给出弧线与胶囊', () => {
    expect(mapView.impactArcsFor(null)).toBe('');
    expect(mapView.impactArcsFor({ region: 'nowhere', symbols: [] })).toBe('');
    const ev = {
      region: 'us',
      topics: [{ key: 'fed', label: '货币政策', strong: true }],
      symbols: ['sp500'],
      level: 'high',
    };
    const html = mapView.impactArcsFor(ev);
    expect(html).toContain('<path');
  });

  it('mapProject 与投影层一致：经纬度可投影且越界返回 null', () => {
    const p = mapView.mapProject(0, 0);
    expect(p).toBeTruthy();
    expect(mapView.mapProject(Number.NaN, 0)).toBeNull();
  });
});
