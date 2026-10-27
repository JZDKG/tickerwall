/* ================================================================== *
 * geo-kit 打包契约
 *
 * geo-kit 是浏览器端地图依赖的唯一出口（src/client/vendor/geo-kit.js）。
 * 这里钉三件「坏了不会报错、只会静默失效」的事：
 *
 *   1. **导出必须齐**。业务代码只写 `import { geoPath } from 'geo-kit'`，
 *      少一个导出就是运行时 undefined，而不是打包报错。
 *   2. **d3-selection 与 d3-transition 必须是同一份实例**。d3-transition 靠
 *      import 时的副作用给 selection.prototype 打补丁；分成两份实例，
 *      `selection.transition()` 会静默缺失 —— 表现是相机永远瞬移、没有动画。
 *   3. **地图数据必须随包走**。离线可用是本项目的硬约束，拓扑不能靠 CDN。
 *
 * 断言值都取自 world-atlas / d3-geo 的客观事实（177 国、半球面积 2π），
 * 不是「实现等于自己」。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  geoArea,
  geoCircle,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoNaturalEarth1,
  geoPath,
  interpolateZoom,
  select,
  transition,
  zoom,
  feature,
  mesh,
  WORLD_TOPO,
} from '../src/client/vendor/geo-kit.js';

const COUNTRIES = feature(WORLD_TOPO, WORLD_TOPO.objects.countries);

describe('geo-kit：导出完整性', () => {
  it('投影、路径、球面几何都在', () => {
    for (const fn of [geoNaturalEarth1, geoPath, geoCircle, geoArea, geoContains, geoDistance, geoGraticule10]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('相机与过渡都在', () => {
    expect(typeof zoom).toBe('function');
    expect(typeof select).toBe('function');
    expect(typeof transition).toBe('function');
    expect(typeof interpolateZoom).toBe('function');
  });

  it('TopoJSON 转换都在', () => {
    expect(typeof feature).toBe('function');
    expect(typeof mesh).toBe('function');
  });

  it('d3-transition 成功给 selection 打了补丁（同包单实例）', () => {
    // 分成两份实例时这里会是 undefined，而打包本身不会报任何错。
    // select() 无参不碰 document，所以这条在 Node 里也能跑（浏览器侧另有一轮实测）。
    const sel = select();
    expect(typeof sel.transition).toBe('function');
    expect(typeof sel.interrupt).toBe('function');
  });
});

describe('geo-kit：地图数据随包分发', () => {
  it('world-atlas 110m 是 177 国', () => {
    expect(COUNTRIES.type).toBe('FeatureCollection');
    expect(COUNTRIES.features).toHaveLength(177);
  });

  it('174 条带 ISO 数字码，3 条争议地区没有（这是 world-atlas 的事实，不是缺陷）', () => {
    const withId = COUNTRIES.features.filter((f) => f.id != null && f.id !== '');
    const noId = COUNTRIES.features.filter((f) => f.id == null || f.id === '');

    // 有 id 的必须是三位数字串，且不重复
    for (const f of withId) {
      expect(typeof f.id).toBe('string');
      expect(/^\d{3}$/.test(f.id), `id 格式异常: ${f.id}`).toBe(true);
    }
    expect(new Set(withId.map((f) => f.id)).size).toBe(withId.length);

    // 无 id 的固定就是北塞浦路斯 / 索马里兰 / 科索沃 —— 地图上无法映射赛区，
    // 只能靠 properties.name 显示国名。这个名单一变，COUNTRY_REGION_MAP 也要跟着查。
    expect(noId.map((f) => f.properties.name).sort()).toEqual(['Kosovo', 'N. Cyprus', 'Somaliland']);
    expect(withId).toHaveLength(174);
  });

  it('每条 feature 都有英文名（无 id 的靠它显示国名）', () => {
    for (const f of COUNTRIES.features) {
      expect(typeof f.properties?.name, `${f.id} 缺 name`).toBe('string');
      expect(f.properties.name.length).toBeGreaterThan(0);
    }
  });

  it('赛区映射要用到的国家都在底图里', () => {
    // 缺任何一个，地图上那块地就没有 data-region，点了没反应
    const NEEDED = {
      '156': '中国', '840': '美国', '124': '加拿大', '392': '日本', '826': '英国',
      '276': '德国', '250': '法国', '380': '意大利', '724': '西班牙',
      '364': '伊朗', '376': '以色列', '682': '沙特', '792': '土耳其', '004': '阿富汗',
      '410': '韩国', '356': '印度', '158': '台湾', '076': '巴西', '032': '阿根廷',
      '710': '南非', '818': '埃及',
    };
    const ids = new Set(COUNTRIES.features.map((f) => f.id));
    const missing = Object.entries(NEEDED).filter(([id]) => !ids.has(id)).map(([id, name]) => `${name}(${id})`);
    expect(missing, `底图缺少：${missing.join('、')}`).toEqual([]);
  });

  it('land 对象也在，画球体轮廓与描边用得上', () => {
    expect(WORLD_TOPO.objects.land).toBeTruthy();
    const land = mesh(WORLD_TOPO, WORLD_TOPO.objects.land);
    expect(land.type).toBe('MultiLineString');
  });
});

describe('geo-kit：投影与球面几何', () => {
  it('Natural Earth 投影后中国能生成非空 path', () => {
    const proj = geoNaturalEarth1().rotate([-10, 0]);
    proj.fitExtent([[20, 20], [1180, 580]], COUNTRIES);
    const d = geoPath(proj)(COUNTRIES.features.find((f) => f.id === '156'));
    expect(typeof d).toBe('string');
    expect(d.length).toBeGreaterThan(500);
    expect(d.startsWith('M')).toBe(true);
  });

  it('fitExtent 把整个底图装进给定矩形（各角都在框内）', () => {
    const BOX = [[20, 20], [1180, 580]];
    const proj = geoNaturalEarth1().rotate([-10, 0]);
    proj.fitExtent(BOX, COUNTRIES);
    for (const f of COUNTRIES.features) {
      if (f.id === '010') continue; // 南极洲拟合时被排除，允许溢出
      const p = geoPath(proj).bounds(f);
      expect(p[0][0]).toBeGreaterThanOrEqual(BOX[0][0] - 1.5);
      expect(p[1][0]).toBeLessThanOrEqual(BOX[1][0] + 1.5);
      expect(p[0][1]).toBeGreaterThanOrEqual(BOX[0][1] - 1.5);
      expect(p[1][1]).toBeLessThanOrEqual(BOX[1][1] + 1.5);
    }
  });
});

describe('geo-kit：黑夜面片', () => {
  /** 直射点 → 黑夜面片：以对跖点为中心、半径 90° 的球冠 */
  const nightOf = (lon, lat) => geoCircle().center([lon + 180, -lat]).radius(90)();

  it('面片是闭合多边形', () => {
    const night = nightOf(0, 0);
    expect(night.type).toBe('Polygon');
    expect(night.coordinates[0].length).toBeGreaterThan(60);
  });

  it('面积等于半个球面（2π）', () => {
    for (const [lon, lat] of [[0, 0], [120, 23.4], [-75, -12]]) {
      expect(geoArea(nightOf(lon, lat))).toBeCloseTo(2 * Math.PI, 3);
    }
  });

  it('太阳直射点落在面片之外，对跖点落在面片之内', () => {
    const cases = [[0, 0], [120, 23.4], [-150, -10], [45, 60]];
    for (const [lon, lat] of cases) {
      const night = nightOf(lon, lat);
      expect(geoContains(night, [lon, lat]), `直射点 (${lon},${lat}) 不该在黑夜里`).toBe(false);
      expect(geoContains(night, [lon + 180, -lat]), `对跖点不该在白天里`).toBe(true);
    }
  });

  it('晨昏线正好在距直射点 90° 处', () => {
    const [lon, lat] = [30, 10];
    const night = nightOf(lon, lat);
    // 沿赤道向东走 90°，应恰好落在分界（几何上贴着边界，用「刚好不在内部」近似）
    const edge = [lon + 90, 0];
    const dist = geoDistance([lon, lat], edge);
    expect(dist).toBeCloseTo(Math.PI / 2, 2);
    // 边界点既不算内部也不算外部，geoContains 对边界返回 false 是 d3 的约定
    expect(geoContains(night, [lon + 95, 0])).toBe(true);
    expect(geoContains(night, [lon + 85, 0])).toBe(false);
  });

  it('极地极昼极夜不产生 NaN', () => {
    for (const [lon, lat] of [[0, 90], [0, -90], [180, 66.6], [-180, -66.6]]) {
      const night = nightOf(lon, lat);
      const d = geoPath(geoNaturalEarth1())(night);
      expect(typeof d).toBe('string');
      expect(d.includes('NaN'), `(${lon},${lat}) 的 path 含 NaN`).toBe(false);
    }
  });
});

describe('geo-kit：import map 与 bare specifier 一致', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const html = readFileSync(`${ROOT}public/index.html`, 'utf8');
  const viteCfg = readFileSync(`${ROOT}vite.config.js`, 'utf8');

  /** 抽出 index.html 里的 import map */
  const importMap = (() => {
    const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
    expect(m, 'index.html 缺少 import map').toBeTruthy();
    return JSON.parse(m[1]);
  })();

  it('geo-kit 在 import map 里指向 vendor 产物', () => {
    expect(importMap.imports['geo-kit']).toBe('/vendor/geo-kit.js');
  });

  it('import map 出现在任何 module 脚本之前', () => {
    // 必须先去掉注释：注释里也会出现 type="module" 字样，直接 indexOf 会误判
    const code = html.replace(/<!--[\s\S]*?-->/g, '');
    const mapAt = code.indexOf('type="importmap"');
    const modAt = code.indexOf('type="module"');
    expect(mapAt, '缺 import map').toBeGreaterThan(-1);
    expect(modAt, '缺 module 脚本').toBeGreaterThan(-1);
    expect(mapAt, 'import map 必须早于 module 脚本，否则浏览器直接报解析错误').toBeLessThan(modAt);
  });

  it('vite.config.js 给同一个 bare name 配了 alias，Node/Vitest 才能解析', () => {
    expect(viteCfg).toMatch(/'geo-kit'\s*:\s*path\.resolve\(root,\s*'src\/client\/vendor\/geo-kit\.js'\)/);
  });

  it('vite 的多入口里有 geo-kit，产物才会生成', () => {
    expect(viteCfg).toMatch(/'geo-kit'\s*:\s*path\.resolve\(root,\s*'src\/client\/vendor\/geo-kit\.js'\)/);
    expect(viteCfg).toMatch(/'macro-flow'\s*:/);
  });
});
