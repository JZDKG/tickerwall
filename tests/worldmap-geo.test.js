/* ================================================================== *
 * 地图地理层：投影、昼夜、赛区
 *
 * 这层全是纯函数，之所以能测，是因为区间依赖收敛到了 geo-kit：
 * 以前 map.js 写 `import '/worldmap.js'` 这种绝对 URL，vitest 导入不了，
 * 于是整个地图模块一个单测都没有。
 *
 * 断言分两类，都不复用被测实现：
 *   · 与外部事实对拍 —— 春分赤纬≈0、夏至≈+23.4°、太阳每小时西移 15°、
 *     半球面积 2π、world-atlas 有 174 个带 ISO 的国家；
 *   · 与后端词表对拍 —— 地图赛区必须就是 REGION_WORDS 的口径。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { geoArea } from 'geo-kit';

import {
  LOGICAL_WIDTH,
  LOGICAL_HEIGHT,
  projection,
  worldFeatures,
  lonLatToLogical,
  logicalToLonLat,
  applyZoom,
  unapplyZoom,
  logicalToScreen,
  screenToLogical,
  projectToScreen,
  screenDeltaToLogical,
  logicalBoundsOf,
} from '../src/client/views/map/geo/projection.js';

import {
  sunPosition,
  wrapLon,
  nightGeometry,
  twilightBands,
  solarAltitude,
  isDaylight,
  sunPoint,
} from '../src/client/views/map/geo/astro.js';

import {
  REGION_ANCHORS,
  REGION_ORDER,
  COUNTRY_META,
  regionOfCountry,
  countryNameCn,
  normalizeIso,
  countriesByRegion,
} from '../src/client/views/map/geo/regions.js';

import {
  MAP_CITIES,
  CITY_BY_KEY,
  SYMBOL_CITY,
  targetCitiesFor,
  arcTargetsFor,
  arcBetween,
  citiesOfSymbol,
} from '../src/client/views/map/geo/cities.js';

import { REGION_WORDS } from '../src/server/domain/news-lexicon.js';
import { geoContains } from 'geo-kit';

/* ------------------------------------------------------------------ *
 * 工具：构造一个真实的 letterbox CTM
 * ------------------------------------------------------------------ */

/** 模拟浏览器在 xMidYMid meet 下给出的 getScreenCTM() */
function letterboxCTM(cw, ch, vw = LOGICAL_WIDTH, vh = LOGICAL_HEIGHT) {
  const s = Math.min(cw / vw, ch / vh);
  return { a: s, b: 0, c: 0, d: s, e: (cw - vw * s) / 2, f: (ch - vh * s) / 2 };
}

const IDENTITY = { k: 1, x: 0, y: 0 };

/* ------------------------------------------------------------------ *
 * 投影
 * ------------------------------------------------------------------ */

describe('投影：拟合与取点', () => {
  it('底图是 174 个国家 + 3 个无 ISO 的争议地区', () => {
    expect(worldFeatures).toHaveLength(177);
  });

  it('拟合后排除了南极洲，但没把赤道挤到中线下', () => {
    const eq = lonLatToLogical(0, 0);
    expect(eq).not.toBeNull();
    // 拟合排除南极洲后，赤道大致落在画布中部（允许极区形状带来的偏移）
    expect(eq[1]).toBeGreaterThan(LOGICAL_HEIGHT * 0.3);
    expect(eq[1]).toBeLessThan(LOGICAL_HEIGHT * 0.62);
  });

  it('每个国家的逻辑包围盒都落在画布内（南极洲除外）', () => {
    for (const f of worldFeatures) {
      if (f.id === '010') continue;
      const pts = f.geometry.type === 'Polygon'
        ? f.geometry.coordinates.flat()
        : f.geometry.coordinates.flat(2);
      for (const [lon, lat] of pts) {
        const p = lonLatToLogical(lon, lat);
        expect(p, `${f.properties.name} 投影出 null`).not.toBeNull();
        expect(p[0]).toBeGreaterThan(-40);
        expect(p[0]).toBeLessThan(LOGICAL_WIDTH + 40);
        expect(p[1]).toBeGreaterThan(-40);
        expect(p[1]).toBeLessThan(LOGICAL_HEIGHT + 40);
      }
    }
  });

  it('经纬度 ↔ 逻辑坐标互逆', () => {
    for (const [lon, lat] of [[0, 0], [121.5, 31.2], [-74, 40.7], [139.7, 35.7], [-58, -34]]) {
      const p = lonLatToLogical(lon, lat);
      const back = logicalToLonLat(p[0], p[1]);
      expect(back[0]).toBeCloseTo(lon, 6);
      expect(back[1]).toBeCloseTo(lat, 6);
    }
  });

  it('投影是模块级单例，重复取同一点结果一致', () => {
    expect(lonLatToLogical(-0.1, 51.5)).toEqual(lonLatToLogical(-0.1, 51.5));
    expect(typeof projection.invert).toBe('function');
  });

  it('非法经纬度返回 null，不产生 NaN 坐标', () => {
    expect(lonLatToLogical(NaN, 0)).toBeNull();
    expect(lonLatToLogical(undefined, 0)).toBeNull();
  });
});

describe('相机：逻辑坐标 → 屏幕坐标', () => {
  it('d3-zoom transform 的作用与定义一致', () => {
    const t = { k: 2, x: 10, y: -5 };
    expect(applyZoom(t, [3, 4])).toEqual([16, 3]);
    expect(unapplyZoom(t, [16, 3])).toEqual([3, 4]);
  });

  it('k=0 的退化 transform 返回 null', () => {
    expect(unapplyZoom({ k: 0, x: 1, y: 1 }, [5, 5])).toBeNull();
  });

  it('给定 letterbox 矩阵，正逆换算互逆（误差 < 0.01px）', () => {
    for (const [cw, ch] of [[1710, 605], [1240, 478], [794, 790]]) {
      const ctm = letterboxCTM(cw, ch);
      for (const t of [IDENTITY, { k: 2.4, x: -180, y: -60 }]) {
        for (const [x, y] of [[0, 0], [600, 300], [1200, 600], [87, 412]]) {
          const screen = logicalToScreen(ctm, t, [x, y]);
          const back = screenToLogical(ctm, t, screen[0], screen[1]);
          expect(back[0]).toBeCloseTo(x, 2);
          expect(back[1]).toBeCloseTo(y, 2);
        }
      }
    }
  });

  it('经纬度 → 屏幕坐标与两步换算等价', () => {
    const ctm = letterboxCTM(1710, 605);
    const t = { k: 1.6, x: -90, y: -30 };
    const direct = projectToScreen(ctm, t, 121.5, 31.2);
    const staged = logicalToScreen(ctm, t, lonLatToLogical(121.5, 31.2));
    expect(direct[0]).toBeCloseTo(staged[0], 9);
    expect(direct[1]).toBeCloseTo(staged[1], 9);
  });

  it('留白对称，所以画布正中心永远对得上（这正是老口径长期没被发现的缘故）', () => {
    for (const [cw, ch] of [[1710, 605], [794, 790]]) {
      const ctm = letterboxCTM(cw, ch);
      const truth = logicalToScreen(ctm, IDENTITY, [LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2]);
      // 老口径：把逻辑坐标直接按 rect 比例拉伸
      const wrong = [(LOGICAL_WIDTH / 2 / LOGICAL_WIDTH) * cw, (LOGICAL_HEIGHT / 2 / LOGICAL_HEIGHT) * ch];
      expect(Math.hypot(truth[0] - wrong[0], truth[1] - wrong[1])).toBeLessThan(1e-9);
    }
  });

  it('角落里两者会差出留白量', () => {
    const ctm = letterboxCTM(1710, 605);
    const truth = logicalToScreen(ctm, IDENTITY, [0, 0]);
    const wrong = [0, 0];
    expect(Math.hypot(truth[0] - wrong[0], truth[1] - wrong[1])).toBeGreaterThan(150);
  });

  it('位移换算抵消平移项', () => {
    const ctm = letterboxCTM(1710, 605);
    const t = { k: 2, x: 300, y: -120 };
    const d = screenDeltaToLogical(ctm, t, 100, 0);
    // 屏幕 100px 走 100/2/scale 个逻辑单位，与 t.x / t.y 无关
    expect(d[0]).toBeCloseTo(100 / 2 / ctm.a, 6);
    expect(d[1]).toBeCloseTo(0, 6);
  });

  it('逻辑包围盒从点集算出来', () => {
    expect(logicalBoundsOf([[10, 20], [30, 5], [-4, 8]])).toEqual([[-4, 5], [30, 20]]);
    expect(logicalBoundsOf([])).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 天文
 * ------------------------------------------------------------------ */

describe('天文：太阳直射点', () => {
  const at = (iso) => sunPosition(new Date(iso));

  it('春分赤纬接近 0', () => {
    expect(Math.abs(at('2026-03-20T12:00:00Z').decl)).toBeLessThan(0.6);
  });

  it('夏至赤纬接近 +23.4°，冬至接近 −23.4°', () => {
    expect(at('2026-06-21T12:00:00Z').decl).toBeCloseTo(23.4, 0);
    expect(at('2026-12-21T12:00:00Z').decl).toBeCloseTo(-23.4, 0);
  });

  it('每小时西移约 15°', () => {
    const a = at('2026-04-10T06:00:00Z').lon;
    const b = at('2026-04-10T07:00:00Z').lon;
    // 经度随时间减小 15°（地球自西向东转，直射点相对经度向西走）
    let delta = b - a;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    expect(delta).toBeCloseTo(-15, 0);
  });

  it('经度始终规整在 [-180, 180)', () => {
    for (let h = 0; h < 48; h += 1) {
      const sun = at(new Date(Date.UTC(2026, 8, 1, h)).toISOString());
      expect(sun.lon).toBeGreaterThanOrEqual(-180);
      expect(sun.lon).toBeLessThan(180);
    }
  });

  it('wrapLon 处理跨界', () => {
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(540)).toBe(-180);
  });
});

describe('天文：黑夜面片', () => {
  const sun = { lon: 30, lat: 0, decl: 10 };

  it('几何是闭合多边形', () => {
    const g = nightGeometry(sun);
    expect(g.type).toBe('Polygon');
    expect(g.coordinates[0].length).toBeGreaterThan(60);
  });

  it('面积等于半个球面', () => {
    for (const s of [{ lon: 0, decl: 0 }, { lon: 120, decl: 23.4 }, { lon: -75, decl: -12 }]) {
      expect(geoArea(nightGeometry(s))).toBeCloseTo(2 * Math.PI, 3);
    }
  });

  it('直射点在黑夜之外，对跖点在黑夜之内', () => {
    for (const s of [{ lon: 0, decl: 0 }, { lon: 120, decl: 23.4 }, { lon: -150, decl: -10 }]) {
      const g = nightGeometry(s);
      expect(geoContains(g, [s.lon, s.decl]), `直射点 ${JSON.stringify(s)} 不该在黑夜里`).toBe(false);
      expect(geoContains(g, [wrapLon(s.lon + 180), -s.decl])).toBe(true);
    }
  });

  it('三层晨昏带都在黑夜之外，由外向内叠（半径 108 → 102 → 96 → 黑夜 90）', () => {
    const bands = twilightBands(sun);
    // 半径必须大于 90：太阳低于地平线 6° 处，距直射点 96°
    expect(bands.map((b) => b.radius)).toEqual([96, 102, 108]);
    const nightArea = geoArea(nightGeometry(sun));
    for (const b of bands) {
      expect(b.radius).toBeGreaterThan(90);
      expect(geoArea(b.geometry), `${b.key} 带应比黑夜大`).toBeGreaterThan(nightArea);
    }
    // 半径越大面积越大：天文档位越高（|altitude| 越大）越靠外
    expect(geoArea(bands[0].geometry)).toBeLessThan(geoArea(bands[1].geometry));
    expect(geoArea(bands[1].geometry)).toBeLessThan(geoArea(bands[2].geometry));
  });

  it('极地极昼极夜不产生 NaN', () => {
    for (const s of [{ lon: 0, decl: 90 }, { lon: 0, decl: -90 }, { lon: 180, decl: 66.6 }]) {
      const g = nightGeometry(s);
      const coords = g.coordinates.flat(2);
      expect(coords.every((v) => Number.isFinite(v))).toBe(true);
    }
  });

  it('太阳高度角与昼夜判定自洽', () => {
    // 直射点正午高度角 = 90°
    expect(solarAltitude(30, 10, sun)).toBeCloseTo(90, 4);
    expect(isDaylight(30, 10, sun)).toBe(true);
    // 对跖点是午夜，高度角 = −90°
    expect(solarAltitude(-150, -10, sun)).toBeCloseTo(-90, 4);
    expect(isDaylight(-150, -10, sun)).toBe(false);
  });

  it('晨昏线附近高度角接近 0', () => {
    // 沿赤道向东 90°，正好是晨昏线
    expect(solarAltitude(120, 0, sun)).toBeCloseTo(0, 4);
  });

  it('sunPoint 返回直射点本身', () => {
    expect(sunPoint({ lon: 200, decl: 5 })).toEqual([-160, 5]);
  });
});

/* ------------------------------------------------------------------ *
 * 赛区：与后端词表同口径
 * ------------------------------------------------------------------ */

describe('赛区：与后端 REGION_WORDS 一致', () => {
  const lexicon = new Map(REGION_WORDS.map(([key, words]) => [key, new Set(words)]));

  it('赛区键集合与后端完全相同，顺序也一致（顺序决定匹配优先级）', () => {
    expect(REGION_ORDER).toEqual(REGION_WORDS.map(([key]) => key));
  });

  it('地图锚点覆盖全部赛区，global 明确标注没有地理起点', () => {
    for (const key of REGION_ORDER) {
      expect(REGION_ANCHORS[key], `缺锚点 ${key}`).toBeTruthy();
      expect(typeof REGION_ANCHORS[key].lon).toBe('number');
      expect(typeof REGION_ANCHORS[key].lat).toBe('number');
      expect(REGION_ANCHORS[key].label.length).toBeGreaterThan(0);
    }
    expect(REGION_ANCHORS.global.noAnchor).toBe(true);
    expect(REGION_ORDER).not.toContain('global');
  });

  it('每个国家的证据词确实在该赛区的后端词表里', () => {
    const missing = [];
    for (const [iso, meta] of Object.entries(COUNTRY_META)) {
      const set = lexicon.get(meta.region);
      if (!set) { missing.push(`${iso} ${meta.cn}：赛区 ${meta.region} 不存在`); continue; }
      if (!set.has(meta.lexicon)) missing.push(`${iso} ${meta.cn}：${JSON.stringify(meta.lexicon)} 不在 ${meta.region} 词表里`);
    }
    expect(missing, `地图与后端口径不一致：\n${missing.join('\n')}`).toEqual([]);
  });

  it('每个映射国家的 ISO 都存在于底图', () => {
    const ids = new Set(worldFeatures.map((f) => normalizeIso(f.id)).filter(Boolean));
    const missing = Object.entries(COUNTRY_META)
      .filter(([iso]) => !ids.has(iso))
      .map(([iso, m]) => `${iso} ${m.cn}`);
    expect(missing, `底图里没有：${missing.join('、')}`).toEqual([]);
  });

  it('ISO 规范化能吃下前导零与数字两种写法', () => {
    expect(normalizeIso('004')).toBe('4');
    expect(normalizeIso(4)).toBe('4');
    expect(normalizeIso('840')).toBe('840');
    expect(normalizeIso(null)).toBeNull();
  });

  it('查表接口对未知国家返回 null / undefined，不抛', () => {
    expect(regionOfCountry('804')).toBeNull(); // 乌克兰：后端词表没有
    expect(countryNameCn('804')).toBeUndefined();
    expect(regionOfCountry('156')).toBe('cn');
    expect(countryNameCn('156')).toBe('中国');
    expect(regionOfCountry(undefined)).toBeNull();
  });

  it('俄罗斯归 eu、澳大利亚归 asia —— 以词表为准修正了计划书', () => {
    // 计划书把它们列在「未归属」，但后端词表明确收录，两边必须一致
    expect(regionOfCountry('643')).toBe('eu');
    expect(lexicon.get('eu').has('Russia')).toBe(true);
    expect(regionOfCountry('036')).toBe('asia');
    expect(lexicon.get('asia').has('Australia')).toBe(true);
  });

  it('赛区分组覆盖所有映射条目', () => {
    const byRegion = countriesByRegion();
    const total = [...byRegion.values()].reduce((n, list) => n + list.length, 0);
    expect(total).toBe(Object.keys(COUNTRY_META).length);
    for (const key of byRegion.keys()) expect(REGION_ORDER).toContain(key);
  });
});

/* ------------------------------------------------------------------ *
 * 定价中心与弧线
 * ------------------------------------------------------------------ */

describe('定价中心：事件 → 城市', () => {
  it('按标的定价地连线，而不是按事件发生地', () => {
    // 中东地缘冲突影响油价：应打到芝加哥（WTI），不是凭空连中东附近
    const ev = { region: 'me', symbols: ['oil'] };
    expect(targetCitiesFor(ev)).toEqual(['chi', 'ldn']);
  });

  it('多标的取并集，最多 5 个', () => {
    const ev = { region: 'us', symbols: ['sp500', 'ndx100', 'dji', 'vix', 'us10y', 'dxy', 'btc'] };
    const list = targetCitiesFor(ev);
    expect(list.length).toBeLessThanOrEqual(5);
    expect(list).toContain('ny');
    expect(list).toContain('chi'); // vix 的 CBOE 定价地
  });

  it('拿不到 symbols 才退回区域兜底', () => {
    expect(targetCitiesFor({ region: 'latam', symbols: [] })).toEqual(['sao']);
    expect(targetCitiesFor({ region: 'global' })).toEqual(['ny', 'ldn', 'sh']);
    expect(targetCitiesFor({ region: 'unknown' })).toEqual([]);
  });

  it('未知标的被忽略而不是报错', () => {
    expect(targetCitiesFor({ region: 'us', symbols: ['nope', 'sp500'] })).toEqual(['ny']);
  });

  it('arcTargetsFor 滤掉零长度弧（连到自身没有意义）', () => {
    const from = { lon: 10, lat: 50 }; // 欧元区锚点附近
    const keys = arcTargetsFor({ region: 'eu', symbols: ['dax', 'sp500'] }, from).map((c) => c.key);
    expect(keys).toContain('ny');
    // 法兰克福距离欧元区锚点很近，应被滤掉
    expect(keys).not.toContain('fra');
  });

  it('城市表与标的表互相自洽：每个城市至少被一个标的引用', () => {
    const referenced = new Set(Object.values(SYMBOL_CITY).flat());
    const lonely = MAP_CITIES.filter((c) => !referenced.has(c.key)).map((c) => c.key);
    expect(lonely, `没有标的引用的城市：${lonely.join(',')}`).toEqual([]);
  });

  it('citiesOfSymbol 反向查询', () => {
    expect(citiesOfSymbol('oil')).toEqual(['chi', 'ldn']);
    expect(citiesOfSymbol('nope')).toEqual([]);
  });

  it('CITY_BY_KEY 覆盖全部城市', () => {
    expect(CITY_BY_KEY.size).toBe(MAP_CITIES.length);
    for (const c of MAP_CITIES) expect(CITY_BY_KEY.get(c.key)).toBe(c);
  });
});

describe('弧线路径', () => {
  it('起终点精确落在给定坐标上', () => {
    const d = arcBetween([100, 200], [300, 120]);
    expect(d.startsWith('M100.0,200.0')).toBe(true);
    expect(d.endsWith('300.0,120.0')).toBe(true);
    expect(d).toContain('Q');
  });

  it('弧顶抬升随距离增长但有上限', () => {
    const near = arcBetween([0, 0], [40, 0]);
    const far = arcBetween([0, 0], [900, 0]);
    const lift = (d) => Number(/Q[\d.-]+,([\d.-]+)/.exec(d)[1]);
    expect(lift(near)).toBeLessThan(0);
    expect(Math.abs(lift(far))).toBeLessThanOrEqual(90);
    expect(Math.abs(lift(far))).toBeGreaterThan(Math.abs(lift(near)));
  });

  it('零长度弧不产生 NaN', () => {
    const d = arcBetween([50, 50], [50, 50]);
    expect(d.includes('NaN')).toBe(false);
  });
});
