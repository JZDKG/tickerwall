/* ================================================================== *
 * 天文：太阳直射点、黑夜面片、晨昏带
 *
 * 换成 d3-geo 之后，昼夜不再是「解方程画两条曲线」，而是直接在球面上生成
 * 一块闭合球冠：以太阳对跖点为中心、半径 90°，交给 geoCircle 出 GeoJSON，
 * 再由 projection 裁剪。好处是极昼极夜、跨日界线、高纬形变全部由库处理，
 * 手写版本在极区附近会出现横穿整图的断裂。
 *
 * 精度说明：太阳位置沿用低精度天文公式（误差 < 0.01°），对「哪边是白天」
 * 绰绰有余；这里不做视差、大气折射、均时差之外的高阶修正。
 * ================================================================== */

import { geoCircle } from 'geo-kit';

const DEG = Math.PI / 180;

/**
 * 太阳直射点（赤纬 + 经度），单位度。
 * 低精度公式，误差 < 0.01°，够画昼夜分界。
 */
export function sunPosition(now) {
  const jd = now.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360) * Math.PI) / 180;
  const lambda = ((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const eps = ((23.439 - 0.0000004 * n) * Math.PI) / 180;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  let lon = (ra * 180) / Math.PI - gmst * 15;
  lon = ((lon + 540) % 360) - 180;
  return { decl: (decl * 180) / Math.PI, lon };
}

/**
 * 晨昏圈：只取球冠的边界环，做成 **不闭合的 LineString**。
 *
 * 为什么不直接给黑夜面片描边：球冠被投影裁剪后，路径边界是「晨昏圈 +
 * 图幅边界」两段拼起来的，描边会把左右两条地图边缘的竖线也画出来。
 * 单独一条 LineString 只含晨昏圈本身，跨裁剪边界自然断开，是正确的样子。
 */
export function terminatorGeometry(sun, radius = 90) {
  const ring = geoCircle()
    .center([wrapLon(sun.lon + 180), -sun.decl])
    .radius(radius)().coordinates[0];
  return { type: 'LineString', coordinates: ring };
}

/** 把经度规整到 [-180, 180) */
export function wrapLon(lon) {
  return ((lon + 540) % 360) - 180;
}

/**
 * 黑夜面片：以太阳对跖点为中心、半径 90° 的球冠。
 * 返回 GeoJSON geometry（不是 Feature），直接喂给 geoPath。
 */
export function nightGeometry(sun, radius = 90) {
  return geoCircle()
    .center([wrapLon(sun.lon + 180), -sun.decl])
    .radius(radius)();
}

/**
 * 三层晨昏带：从黑夜边缘往外，按太阳高度角分层。
 *
 * 半径 = 90° + |高度角|。太阳在地平线以下是负高度角，-6° 表示
 * 「比地平线再低 6°」，也就是距直射点 96° —— 所以晨昏带是**比黑夜更大的**
 * 球冠，绘制时由外向内叠：108° → 102° → 96° → 黑夜 90°，
 * 越往外越亮，最内层才是纯黑。
 */
export const TWILIGHT_BANDS = [
  { key: 'civil', altitude: -6, label: '民用曙暮光' },
  { key: 'nautical', altitude: -12, label: '航海曙暮光' },
  { key: 'astronomical', altitude: -18, label: '天文曙暮光' },
];

/**
 * 晨昏带几何：每层是「半径 90−|altitude| 的球冠」，从大到小叠，
 * 最内层是纯黑夜。绘制顺序由调用方从外到内。
 */
export function twilightBands(sun) {
  return TWILIGHT_BANDS.map((b) => ({
    ...b,
    radius: 90 + Math.abs(b.altitude),
    geometry: geoCircle()
      .center([wrapLon(sun.lon + 180), -sun.decl])
      .radius(90 + Math.abs(b.altitude))(),
  }));
}

/** 太阳直射点的地理坐标，供地图上的小太阳标记使用 */
export function sunPoint(sun) {
  return [wrapLon(sun.lon), sun.decl];
}

/**
 * 某地在给定时刻的太阳高度角（度）。
 * 用于「这个城市现在是白天还是夜里」的呼吸灯，以及单测里对拍昼夜。
 */
export function solarAltitude(lon, lat, sun) {
  const phi = lat * DEG;
  const delta = sun.decl * DEG;
  const H = (wrapLon(lon - sun.lon)) * DEG;
  return Math.asin(
    Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H),
  ) / DEG;
}

/** 该地在此时刻是否处于白昼（太阳高度角 > 0） */
export function isDaylight(lon, lat, sun) {
  return solarAltitude(lon, lat, sun) > 0;
}
