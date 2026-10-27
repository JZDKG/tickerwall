/* ================================================================== *
 * geo-kit：地图用到的 d3 栈与地图数据，统一从这里取
 *
 * 为什么要一个收口模块，而不是让业务代码直接 import 'd3-geo'：
 *
 *   1. **必须打进同一个包**。d3-transition 在 import 时会给
 *      d3-selection 的 selection.prototype 打补丁。如果 d3-selection 和
 *      d3-transition 被分成两份实例，补丁打到的是另一份原型上，
 *      `selection.transition()` 会静默失效 —— 表现是相机永远瞬移、没有动画。
 *      统一出口 + 单次打包是唯一可靠的做法。
 *
 *   2. **地图数据要随包分发**。world-atlas 的 countries-110m.json（177 国，
 *      含 ISO 数字 id）被打进同一个 bundle，运行时不请求任何在线瓦片或 CDN，
 *      双击 `启动看板.command` 就能开。
 *
 *   3. **测试要能解析**。业务模块从此只写 `import { geoPath } from 'geo-kit'`，
 *      vite.config.js 里给 `geo-kit` 配了 resolve.alias 指向本文件，
 *      于是纯函数模块在 Node 里可以直接跑单测（以前 map.js 写的是
 *      `import '/worldmap.js'` 这种绝对 URL，vitest 根本导入不了）。
 *
 * 产物：`public/vendor/geo-kit.js`（入库，不靠 node_modules 运行）。
 * 改了这里的导出之后要 `npm run build`。
 * ================================================================== */

/* ---------- 投影与球面几何 ---------- */
export {
  geoPath,
  geoNaturalEarth1,
  geoEquirectangular,
  geoMercator,
  geoGraticule10,
  geoCircle,
  geoArea,
  geoContains,
  geoDistance,
  geoCentroid,
  geoBounds,
  geoInterpolate,
} from 'd3-geo';

/* ---------- 相机 ---------- */
export { zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
export { select, pointer } from 'd3-selection';
// 这行同时把 selection.prototype.transition 补上，所以它必须和上面的
// d3-selection 待在同一次构建里（见文件头说明）。
export { transition } from 'd3-transition';
export { interpolateZoom } from 'd3-interpolate';

/* ---------- TopoJSON ---------- */
export { feature, mesh } from 'topojson-client';

/* ---------- 地图数据 ---------- */
// import attribute 是 Node 原生 ESM 的要求；Vite/rolldown 同样认这一写法，
// 于是同一份源码在浏览器产物与 Node 测试里都能解析。
import countries110m from 'world-atlas/countries-110m.json' with { type: 'json' };

/**
 * world-atlas 的 110m 拓扑（约 108KB）。features 里每条的 id 是 ISO 3166-1
 * 数字码字符串、properties.name 是英文名，两者在 countries-110m 里都齐。
 */
export const WORLD_TOPO = countries110m;

/** 兜底：确认拓扑结构与预期一致，免得某次升级悄悄换了字段名 */
export const WORLD_TOPO_BASE = 'world-atlas@2/countries-110m';
