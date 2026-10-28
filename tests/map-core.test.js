// @vitest-environment jsdom
/* ================================================================== *
 * 地图主模块的纯函数（views/map.js）
 *
 * map.js 是 1533 行的编排层，绝大多数是 DOM 与手势。这里只挑**不依赖
 * geo-kit 运行时、结论可验证**的部分：
 *   · 经纬度 → 逻辑画布坐标（投影契约）
 *   · 经纬网路径缓存
 *   · 昼夜层的三层结构（晨昏带由外向内 + 黑夜球冠 + 终止线）
 *   · 事件新鲜度四档
 *   · 镜头动画在相机未装好时直接落终态
 *
 * geo-kit 走 vite.config.js 的 alias（src/client/vendor/geo-kit.js），
 * 所以这里用的是**真投影**：断言的是真实换算结果，不是假实现的自洽。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

const map = await import('../src/client/views/map.js');
const { LOGICAL_HEIGHT, LOGICAL_WIDTH, lonLatToLogical } = await import('../src/client/views/map/geo/projection.js');

describe('投影契约', () => {
  it('mapProject 就是 lonLatToLogical（保留旧名，不另算一套）', () => {
    for (const [lon, lat] of [
      [0, 0],
      [116.4, 39.9],
      [-74, 40.7],
      [139.7, 35.7],
    ]) {
      const a = map.mapProject(lon, lat);
      const b = lonLatToLogical(lon, lat);
      expect(a[0]).toBeCloseTo(b[0], 10);
      expect(a[1]).toBeCloseTo(b[1], 10);
    }
  });

  it('结果落在逻辑画布范围内（不是 0..1 也不是像素屏坐标）', () => {
    const [x, y] = map.mapProject(116.4, 39.9);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(LOGICAL_WIDTH);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(LOGICAL_HEIGHT);
  });

  it('经度递增时 x 递增（东亚在东侧）', () => {
    const [xBeijing] = map.mapProject(116.4, 39.9);
    const [xLondon] = map.mapProject(-0.1, 51.5);
    expect(xBeijing).toBeGreaterThan(xLondon);
  });
});

describe('经纬网', () => {
  it('每次返回同一条路径（模块级缓存：renderMap 每 15 秒重建 DOM，不该重算）', () => {
    const first = map.graticulePath();
    const second = map.graticulePath();
    expect(first).toBe(second);
    expect(typeof first).toBe('string');
    // 经纬网是多条子路径拼出来的，至少要有一堆 M 指令
    expect((first.match(/M/g) ?? []).length).toBeGreaterThan(3);
  });
});

describe('昼夜层', () => {
  it('三层结构齐全：晨昏带（由外向内）+ 黑夜球冠 + 终止线', () => {
    const out = map.nightLayerPaths(new Date('2026-10-28T12:00:00Z'));
    expect(out.sun).toBeTruthy();
    expect(Array.isArray(out.outer)).toBe(true);
    expect(out.outer.length).toBeGreaterThan(0);
    expect(typeof out.core).toBe('string');
    expect(typeof out.line).toBe('string');
    for (const band of out.outer) {
      expect(band.key).toBeTruthy();
      expect(typeof band.d).toBe('string');
    }
  });

  it('晨昏带顺序是「从外到内」（半径大的先铺，否则纯黑夜会被盖掉）', () => {
    const out = map.nightLayerPaths(new Date('2026-10-28T12:00:00Z'));
    // 外层 key 应当是 twilightBands 反转后的顺序
    const keys = out.outer.map((b) => b.key);
    expect(keys[0]).not.toBe(keys[keys.length - 1]);
  });

  it('不同时刻得到不同结果（不是把第一次的缓存返回）', () => {
    const noon = map.nightLayerPaths(new Date('2026-10-28T12:00:00Z'));
    const midnight = map.nightLayerPaths(new Date('2026-10-28T00:00:00Z'));
    expect(noon.core).not.toBe(midnight.core);
  });
});

describe('事件新鲜度', () => {
  const minsAgo = (m) => {
    const t = new Date(Date.now() - m * 60_000);
    // freshnessOf 按「北京时间字符串」解析，所以输出成 +08:00 的形态
    const beijing = new Date(t.getTime() + 8 * 3600_000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())} ${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}`;
  };

  it('四档：5 分钟内最亮，越旧越淡', () => {
    expect(map.freshnessOf(minsAgo(1))).toBe(1);
    expect(map.freshnessOf(minsAgo(10))).toBe(0.72);
    expect(map.freshnessOf(minsAgo(60))).toBe(0.42);
    expect(map.freshnessOf(minsAgo(600))).toBe(0.18);
  });

  it('缺时间或解析不出来给 0（不是 1，也不是 NaN）', () => {
    expect(map.freshnessOf('')).toBe(0);
    expect(map.freshnessOf(null)).toBe(0);
    expect(map.freshnessOf('not-a-time')).toBe(0);
  });

  it('未来时间也按最亮处理（时钟偏差不该让事件变透明）', () => {
    expect(map.freshnessOf(minsAgo(-30))).toBe(1);
  });
});

describe('镜头动画', () => {
  it('相机还没装好时直接落终态（不让调用方等一个不存在的动画）', () => {
    // 没有 .world-svg 节点 → 走「直接落终态」分支
    document.body.innerHTML = '';
    map.mapView.k = 1;
    map.animateMapView({ k: 2, tx: 30, ty: 40 }, 500);
    expect(map.mapView.k).toBe(2);
    expect(map.mapView.tx).toBe(30);
    expect(map.mapView.ty).toBe(40);
  });
});

/* ================================================================== *
 * 冲击弧（impactArcsFor）
 *
 * 用户看到的是一条从事件赛区连到受影响城市的弧线 + 弧顶标签。
 * 三条容易错的地方：
 *   · 连到事件自己的交易中心会产生零长度弧（必须滤掉）；
 *   · 弧顶标签要挂在**最长**那条上（挂第一条会压在城市名旁）；
 *   · 没有主题时不要挂一个空标签。
 * ================================================================== */
describe('冲击弧', () => {
  const event = (over = {}) => ({
    id: 'ev_1',
    title: '美国 CPI 超预期',
    region: 'us',
    topics: [{ label: '通胀', strong: true }, { label: '货币政策' }],
    symbols: ['us10y', 'dxy'],
    ...over,
  });

  it('有赛区锚点时画弧，并带主题标签', () => {
    const svg = map.impactArcsFor(event());
    expect(svg).toContain('impact-arc');
    expect(svg).toContain('arc-tag');
    expect(svg).toContain('通胀');
  });

  it('没有事件 / 未知赛区 → 空串（不画一条莫名其妙的弧）', () => {
    expect(map.impactArcsFor(null)).toBe('');
    expect(map.impactArcsFor(event({ region: 'nowhere' }))).toBe('');
  });

  it('tagOverride 覆盖主题（用于「假设」类场景标签）', () => {
    const svg = map.impactArcsFor(event(), '假设：CPI 超预期');
    expect(svg).toContain('假设：CPI 超预期');
    expect(svg).not.toContain('>通胀<');
  });

  it('没有主题也没有覆盖标签时只画弧，不挂空标签', () => {
    const svg = map.impactArcsFor(event({ topics: [] }));
    expect(svg).toContain('impact-arc');
    expect(svg).not.toContain('arc-tag');
  });

  it('标签里的尖括号被转义（事件标题来自外部）', () => {
    const svg = map.impactArcsFor(event({ topics: [{ label: '<b>x</b>', strong: true }] }));
    expect(svg).toContain('&lt;b&gt;');
  });

  it('多个目标时每条弧有递增的动画延迟（不是同时出现）', () => {
    const svg = map.impactArcsFor(event());
    const delays = [...svg.matchAll(/animation-delay:([\d.]+)s/g)].map((m) => Number(m[1]));
    expect(delays.length).toBeGreaterThan(1);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  it('没有标的时退回「赛区兜底目标」，不是不画（这层兜底本身就是设计）', () => {
    const svg = map.impactArcsFor(event({ symbols: [], city: null, topics: [] }));
    expect(svg).toContain('impact-arc');
    // 没有主题就不挂标签
    expect(svg).not.toContain('arc-tag');
  });

  it('未知赛区且没有标的时没有可连的目标 → 空串', () => {
    expect(map.impactArcsFor({ id: 'x', symbols: [], region: 'nowhere' })).toBe('');
  });
});
