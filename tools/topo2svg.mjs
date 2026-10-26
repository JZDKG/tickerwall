/**
 * 把 world-atlas 的 TopoJSON 转成轻量 SVG path，供前台地图渲染。
 * 一次性构建脚本，产物存 public/worldmap.js（零运行时依赖）。
 */
import fs from 'node:fs';

const topo = JSON.parse(fs.readFileSync('/tmp/world110.json', 'utf8'));

// ---- TopoJSON 解码 ----
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

function arcPoints(idx) {
  if (idx >= 0) return arcs[idx];
  return [...arcs[~idx]].reverse();
}

// 投影：等距圆柱，裁掉南北极无人区，让地图更紧凑
const W = 1200;
const H = 560;
const LAT_MAX = 84;
const LAT_MIN = -58;
function project(lon, lat) {
  return [
    ((lon + 180) / 360) * W,
    ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H,
  ];
}

function ringToPath(ringIdx) {
  const pts = [];
  for (const i of ringIdx) pts.push(...arcPoints(i));
  if (!pts.length) return '';
  // 简化：丢弃过近的点（1200x600 画布下 0.4 像素以下无意义）
  // 跨日界线（俄罗斯、斐济等）会让 x 从 1200 跳到 0，直接连线会横穿整张图，
  // 所以 x 跳变超过半张图时断开成独立子路径
  const parts = [];
  let cur = [];
  let lastX = Infinity;
  let lastY = Infinity;
  for (const [lon, lat] of pts) {
    const [x, y] = project(lon, lat);
    if (cur.length && Math.abs(x - lastX) > W / 2) {
      if (cur.length >= 3) parts.push(cur);
      cur = [];
    }
    if (Math.abs(x - lastX) + Math.abs(y - lastY) >= 0.4) {
      cur.push([x, y]);
      lastX = x;
      lastY = y;
    }
  }
  if (cur.length >= 3) parts.push(cur);
  if (!parts.length) return '';
  return parts
    .map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`)
    .join('');
}

const geoms = topo.objects.countries.geometries;
const countries = [];
for (const g of geoms) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  const d = polys.map((poly) => poly.map(ringToPath).join('')).join('');
  if (!d) continue;
  countries.push({ id: g.id, name: g.properties?.name ?? '', d });
}

const out = `/* 世界地图轮廓（world-atlas 110m，${countries.length} 个国家/地区，已投影到 ${W}x${H}） */
export const MAP_SIZE = { width: ${W}, height: ${H}, latMax: ${LAT_MAX}, latMin: ${LAT_MIN} };
export const WORLD_COUNTRIES = ${JSON.stringify(countries)};
/** 经纬度 → 画布坐标（与构建时同一套投影） */
export function project(lon, lat) {
  return [((lon + 180) / 360) * ${W}, ((${LAT_MAX} - lat) / (${LAT_MAX} - ${LAT_MIN})) * ${H}];
}
`;
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/worldmap.js', out, 'utf8');
console.log(`生成 ${countries.length} 个国家，体积 ${(out.length / 1024).toFixed(0)} KB`);
