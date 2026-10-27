/* ================================================================== *
 * map.js —— #/map：晨昏线世界地图、城市节点、影响弧线、气泡与节点详情卡。
 *
 * 来源：public/app.js（原 3655 行单体）L2754-3500，整段搬运，逻辑未改写。
 * ================================================================== */

/* ================================================================== *
 * 全球市场地图 v2
 * 全屏 / 缩放平移 / 各地指数直接标注 / 新事件气泡 / 右侧滚动事件流
 * ================================================================== */
import { geoGraticule10 } from 'geo-kit';
import * as GEO from './map/geo/cities.js';
import * as REGIONS from './map/geo/regions.js';
import {
  LOGICAL_WIDTH, LOGICAL_HEIGHT, worldFeatures, pathOf,
  lonLatToLogical,
} from './map/geo/projection.js';
import { sunPosition, nightGeometry, twilightBands, terminatorGeometry } from './map/geo/astro.js';
import { regionBounds, viewForBounds, toggleRegion } from './map/logic/focus.js';
import { mapEl } from '../shared/dom.js';
import { dirOf, esc, fmtPrice } from '../shared/format.js';
import { store } from '../shared/store.js';
import { on } from '../shared/bus.js';
import { loadCalendarCached } from '../shared/calendar.js';
import { applyInverseDelta, applyInverseMatrix, applyMatrix } from '../shared/matrix.js';

/* ------------------------------------------------------------------ *
 * 屏幕坐标 ↔ SVG 用户坐标
 *
 * viewBox 是 1200×560，容器宽高由窗口决定，preserveAspectRatio="xMidYMid meet"
 * 会在宽高比不匹配时留白。直接按 rect.width / rect.height 换算等于假设
 * 「viewBox 铺满容器」，留白越多偏得越多：1920 视口能差 290px、平板竖屏差 210px，
 * 而地图正中心恰好不偏——所以这个问题一直没被看见。
 * 统一走浏览器算好的 getScreenCTM()，留白、缩放、将来的旋转都会被吸收。
 * ------------------------------------------------------------------ */

function svgCTM(svg) {
  return svg?.getScreenCTM?.() ?? null;
}

/** 屏幕坐标（clientX/clientY）→ viewBox 坐标 */
function toViewBox(svg, clientX, clientY) {
  return applyInverseMatrix(svgCTM(svg), clientX, clientY);
}

/** viewBox 坐标 → 屏幕坐标 */
function toClient(svg, x, y) {
  return applyMatrix(svgCTM(svg), x, y);
}

/** 屏幕位移 → viewBox 位移（拖拽用，平移项自行抵消） */
function deltaToViewBox(svg, dx, dy) {
  return applyInverseDelta(svgCTM(svg), dx, dy);
}


// 交易所坐标：同城多标的聚合到一个节点，纵向堆叠显示
// dx/dy 是标签相对城市点的偏移 —— 欧洲三国、北美三城在地图上只隔十几像素，
// 不手动错开标签会叠成一团
/* ---------- 地理常量：已搬到 views/map/geo/，这里转发以保持单一来源 ---------- */
export const MAP_CITIES = GEO.MAP_CITIES;
export const MAP_TAG = GEO.MAP_TAG;
export const REGION_ANCHORS = REGIONS.REGION_ANCHORS;
// 视图状态：缩放 + 平移。
// 事件流改成独立 grid 列之后，地图不再被面板遮住，初始不需要偏移。
export let mapView = { k: 1, tx: 0, ty: 0 };

/** 赛区聚焦：null = 全部。点国家或赛区点进入，点空白复位 */
export let mapRegion = null;

export { regionBounds, viewForBounds } from './map/logic/focus.js';
export let mapTimer = null;
export let mapBubbles = []; // 当前显示的气泡
export let mapSeenIds = null; // 上一轮事件 id，用于判断「新事件」
export let mapDrag = null;

/**
 * 经纬度 → 逻辑画布坐标。
 * Step 1 起真正的换算在 geo/projection.js（Natural Earth 投影），这里只是
 * 保留原函数名，让几十处调用点不用改。等 L3 换成 HTML 锚点后再统一改名。
 */
export function mapProject(lon, lat) {
  return lonLatToLogical(lon, lat);
}

/* ---------- 经纬网与昼夜：都是 d3-geo 生成 ---------- */

const GRATICULE_PATH = pathOf(geoGraticule10());

/** 经纬网（每 10°），一次性生成成一条 <path> */
export function graticulePath() {
  return GRATICULE_PATH;
}

/**
 * 昼夜层：三层晨昏带 + 黑夜球冠，由外向内叠。
 *
 * 手写版本是「对每个纬度解 cosH 画两条曲线」，在极昼极夜附近要特判、
 * 跨日界线还得断开重连，极区会出现横穿整图的缝。现在黑夜就是
 * 「以太阳对跖点为中心、半径 90° 的球冠」，geoCircle 出 GeoJSON、
 * projection 自动做球面裁剪，极区和日界线都由库处理。
 */
export function nightLayerPaths(now = new Date()) {
  const sun = sunPosition(now);
  const bands = twilightBands(sun);
  // 由外向内：天文档位最高（半径最大）的先铺，最内层才是纯黑夜
  // 必须走项目自己的投影。geoPath() 不传投影时是恒等变换 —— 经纬度会被
  // 当成像素直接画，svg 里「有 path」但整块面片缩在左上角一小片，极易漏看。
  const outer = [...bands].reverse().map((b) => ({
    key: b.key,
    d: pathOf(b.geometry) ?? '',
  }));
  return {
    sun,
    outer,
    core: pathOf(nightGeometry(sun)) ?? '',
    line: pathOf(terminatorGeometry(sun)) ?? '',
  };
}

/* ---------- 国家底图 ---------- */

let landCache = null;

/**
 * 177 个国家（含 3 个无 ISO 的争议地区）。
 * renderMap 每 15 秒重建一次 DOM，path 字符串重算 177 次不值得，缓存住。
 * data-region 是「地 - 事」联动的锚点：悬停高亮、点击聚焦赛区都靠它。
 */
function landPaths() {
  if (landCache) return landCache;
  landCache = worldFeatures
    .map((f) => {
      const iso = REGIONS.normalizeIso(f.id);
      const meta = iso ? REGIONS.COUNTRY_META[iso] : null;
      const region = meta?.region ?? '';
      const label = meta?.cn ?? f.properties?.name ?? '';
      const suffix = region ? REGIONS.REGION_ANCHORS[region].label : '未归属赛区';
      const d = pathOf(f) ?? '';
      return `<path d="${d}" data-iso="${esc(iso ?? '')}" data-name="${esc(label)}"${
        region ? ` data-region="${region}"` : ''
      }><title>${esc(label)} · ${esc(suffix)}</title></path>`;
    })
    .join('');
  return landCache;
}

/* ---------- 赛区聚焦：包围盒与视口拟合在 map/logic/focus.js（纯函数，可单测） ---------- */

/** 进入/退出赛区聚焦。传 null 或同一个赛区即复位 */
export function focusRegion(region) {
  mapRegion = toggleRegion(mapRegion, region);
  renderMap();
  if (mapRegion) {
    const b = regionBounds(mapRegion);
    if (b) {
      animateMapView(viewForBounds(b), 520);
      return;
    }
  }
  animateMapView({ k: 1, tx: 0, ty: 0 }, 460);
}

/* ---------- 事件影响弧线 ---------- */

/* ---------- 事件 → 定价中心：同上，统一由 geo/cities.js 提供 ---------- */
export const REGION_IMPACT = GEO.REGION_IMPACT;
export const SYMBOL_CITY = GEO.SYMBOL_CITY;
export const targetCitiesFor = GEO.targetCitiesFor;
export function arcBetween([x1, y1], [x2, y2]) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(90, dist * 0.32);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${(my - lift).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

export function impactArcs(items) {
  const cityById = new Map(MAP_CITIES.map((c) => [c.key, c]));
  let svg = '';
  // 只给最新 3 条高影响事件画弧，否则满屏都是线
  const hot = items.filter((e) => e.level === 'high').slice(0, 3);

  hot.forEach((ev, idx) => {
    const anchor = REGION_ANCHORS[ev.region];
    if (!anchor) return;
    const from = mapProject(anchor.lon, anchor.lat);
    const targets = targetCitiesFor(ev)
      .map((k) => cityById.get(k))
      .filter(Boolean)
      // 连到事件自身所在的交易中心没有意义（零长度弧）
      .filter((c) => Math.hypot(c.lon - anchor.lon, c.lat - anchor.lat) > 4);

    targets.forEach((city, ti) => {
      const to = mapProject(city.lon, city.lat);
      const d = arcBetween(from, to);
      const delay = (idx * 0.35 + ti * 0.2).toFixed(2);
      svg += `<path class="impact-arc" d="${d}" style="animation-delay:${delay}s" />`;
    });
  });

  return svg;
}

/* ---------- 平滑视图动画 ---------- */

export let mapAnim = null;

/** ease-out cubic：起手快、收尾稳，比线性自然得多 */
export function animateMapView(target, dur = 420) {
  if (mapAnim) cancelAnimationFrame(mapAnim);
  const from = { ...mapView };
  const t0 = performance.now();

  const step = (t) => {
    const p = Math.min(1, (t - t0) / Math.max(1, dur));
    const e = 1 - (1 - p) ** 3;
    mapView.k = from.k + (target.k - from.k) * e;
    mapView.tx = from.tx + (target.tx - from.tx) * e;
    mapView.ty = from.ty + (target.ty - from.ty) * e;
    clampMapView();
    applyMapView();
    if (p < 1) mapAnim = requestAnimationFrame(step);
    else mapAnim = null;
  };
  mapAnim = requestAnimationFrame(step);
}

/* ---------- LOD：同城标的按缩放级别展开 ---------- */

/** 低缩放时每个城市只留前两个标的，放大后全展开；否则纽约 5 行永远挤成一坨 */
export function tagLimitFor(k) {
  if (k >= 2.2) return 99;
  if (k >= 1.5) return 4;
  return 2;
}

export function freshnessOf(isoTime) {
  if (!isoTime) return 0;
  const t = new Date(`${isoTime.replace(' ', 'T')}+08:00`).getTime();
  if (!Number.isFinite(t)) return 0;
  const age = (Date.now() - t) / 60000;
  if (age < 5) return 1;
  if (age < 30) return 0.72;
  if (age < 120) return 0.42;
  return 0.18;
}

/** 把当前缩放/平移应用到 viewport */
// 上一次渲染用的 LOD 档位，缩放跨档时才需要重建标签
export let renderedTagLimit = null;
export let lodTimer = null;

export function applyMapView() {
  const vp = document.getElementById('map-viewport');
  if (!vp) return;
  vp.setAttribute('transform', `translate(${mapView.tx.toFixed(2)},${mapView.ty.toFixed(2)}) scale(${mapView.k.toFixed(3)})`);

  // 屏幕空间保持恒定的那些东西（标签字号、城市点、赛区点）靠 CSS 里的
  // scale(calc(1 / var(--map-k))) 反向缩放。这样不用每帧改几十个 font-size，
  // 也不用等缩放结束再重排 —— 只是一次变量赋值。
  vp.style.setProperty('--map-k', mapView.k.toFixed(4));
  const label = document.getElementById('zoom-label');
  if (label) label.textContent = `${mapView.k.toFixed(1)}×`;

  // 缩放跨越 LOD 阈值时重建标签；等动画停下再重建，否则每帧重绘会卡
  clearTimeout(lodTimer);
  lodTimer = setTimeout(() => {
    if (renderedTagLimit !== null && tagLimitFor(mapView.k) !== renderedTagLimit) renderMap();
  }, 240);
}

/** 以某点为中心缩放（屏幕坐标 → svg 坐标） */
export function zoomAt(clientX, clientY, factor, dur = 240) {
  const svg = document.querySelector('.world-svg');
  if (!svg) return;
  const p = toViewBox(svg, clientX, clientY);
  if (!p) return;
  const [sx, sy] = p;
  const k2 = Math.min(8, Math.max(1, mapView.k * factor));
  const scale = k2 / mapView.k;
  animateMapView(
    {
      k: k2,
      tx: sx - scale * (sx - mapView.tx),
      ty: sy - scale * (sy - mapView.ty),
    },
    dur,
  );
}

export function clampMapView() {
  const overX = LOGICAL_WIDTH * (mapView.k - 1);
  const overY = LOGICAL_HEIGHT * (mapView.k - 1);
  mapView.tx = Math.min(0, Math.max(-overX, mapView.tx));
  mapView.ty = Math.min(0, Math.max(-overY, mapView.ty));
}

export function resetMapView() {
  closeNodeCard();
  animateMapView({ k: 1, tx: 0, ty: 0 }, 460);
}

/** 事件气泡：按 region 定位，超出视口就钳制进来 */
export function spawnBubble(ev) {
  const anchor = REGION_ANCHORS[ev.region] ?? REGION_ANCHORS.global;
  const [x, y] = mapProject(anchor.lon, anchor.lat);
  const layer = document.getElementById('map-bubbles');
  if (!layer) return;

  // svg 坐标 → 屏幕坐标（走 CTM，留白自动扣掉）
  const svg = document.querySelector('.world-svg');
  const p = toClient(svg, x * mapView.k + mapView.tx, y * mapView.k + mapView.ty);
  if (!p) return;

  const host = layer.getBoundingClientRect();
  let left = p[0] - host.left - 150;
  let top = p[1] - host.top - 76;
  left = Math.max(12, Math.min(host.width - 320, left));
  top = Math.max(12, Math.min(host.height - 90, top));

  const el = document.createElement('div');
  el.className = `map-bubble lv-${ev.level}`;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.innerHTML = `
    <div class="bb-head"><span class="bb-region">${esc(anchor.label)}</span><span class="bb-time">${esc(ev.time.slice(11, 16))}</span></div>
    <div class="bb-title">${esc(ev.title.slice(0, 60))}</div>
  `;
  el.addEventListener('click', () => { location.hash = '#/events'; });
  layer.appendChild(el);

  mapBubbles.push(el);
  // 最多同时 3 个，超出移除最旧
  while (mapBubbles.length > 3) {
    const old = mapBubbles.shift();
    old.classList.add('out');
    setTimeout(() => old.remove(), 400);
  }
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
    mapBubbles = mapBubbles.filter((b) => b !== el);
  }, 6000);
}

export function renderMap() {
  // 正在显示的气泡要在重建后接回来，否则每 30 秒轮询会打断它
  const bubbleLayer = document.getElementById('map-bubbles');
  const liveBubbles = bubbleLayer ? [...bubbleLayer.children] : [];

  const quotes = store.quotes ?? [];
  const items = store.events?.data?.items ?? [];
  const quoteOf = (id) => quotes.find((q) => q.id === id);

  // ---- 城市节点（按缩放级别决定展开多少个标的）----
  const limit = tagLimitFor(mapView.k);
  renderedTagLimit = limit;
  let citySvg = '';
  for (const city of MAP_CITIES) {
    const [x, y] = mapProject(city.lon, city.lat);
    const all = city.ids.map(quoteOf).filter((q) => q && q.ok);
    if (!all.length) continue;

    const members = all.slice(0, limit);
    const hidden = all.length - members.length;
    const lead = members[0];

    // 交易中的市场光环亮，已收盘的压暗 —— 配合晨昏线读「谁在开着」
    const openNow = Boolean(lead.marketStatus?.open);
    const ldir = dirOf(lead.changePct);
    const color = ldir === 'up' ? '#f5455c' : ldir === 'down' ? '#0ecb81' : '#7e8899';

    const lineH = 15;
    const isRight = city.side !== 'left';
    const anchorX = isRight ? 9 : -9;
    const textAnchor = isRight ? 'start' : 'end';

    let rows = members
      .map((m, i) => {
        const d = dirOf(m.changePct);
        const c = d === 'up' ? '#f5455c' : d === 'down' ? '#0ecb81' : '#7e8899';
        const pct = m.changePct == null ? '—' : `${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`;
        const yy = i * lineH;
        return `<text class="tag-name" x="${anchorX}" y="${yy}" text-anchor="${textAnchor}">${esc(MAP_TAG[m.id] ?? m.name)}</text>
          <text class="tag-pct" x="${anchorX + (isRight ? 1 : -1) * 46}" y="${yy}" text-anchor="${textAnchor}" fill="${c}">${pct}</text>`;
      })
      .join('');
    // 折叠提示：还有 N 个标的没展开
    if (hidden > 0) {
      rows += `<text class="tag-more" x="${anchorX}" y="${members.length * lineH}" text-anchor="${textAnchor}">+${hidden} 放大可见</text>`;
    }

    const dx = city.dx ?? 12;
    const dy = city.dy ?? 0;
    const rowsShift = (-(members.length - 1) * lineH) / 2;
    citySvg += `<g class="map-city${openNow ? ' is-open' : ' is-closed'}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"
        data-city="${esc(city.key)}" data-open="${openNow ? 1 : 0}">
      <circle class="city-halo scene-fixed" r="8" fill="${color}" />
      <circle class="city-dot scene-fixed" r="2.8" fill="${color}" />
      <line class="city-link" x1="0" y1="0" x2="${dx}" y2="${(dy + rowsShift).toFixed(1)}" />
      <g transform="translate(${dx},${(dy + rowsShift).toFixed(1)})"><g class="scene-fixed">${rows}</g></g>
    </g>`;
  }

  // ---- 事件区域 ----
  const byRegion = new Map();
  for (const ev of items) {
    const r = ev.region || 'global';
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r).push(ev);
  }
  let regionSvg = '';
  for (const [region, evs] of byRegion) {
    const a = REGION_ANCHORS[region];
    if (!a) continue;
    const [x, y] = mapProject(a.lon, a.lat);
    const high = evs.filter((e) => e.level === 'high').length;
    const fresh = Math.max(...evs.slice(0, 5).map((e) => freshnessOf(e.time)));
    const r = 2.5 + Math.min(7, evs.length * 0.9);
    const color = high > 0 ? '#f5455c' : '#e0a83c';
    regionSvg += `<g class="map-region${fresh > 0.7 ? ' hot' : ''}" data-region-anchor="${esc(region)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
      <circle class="rg-pulse scene-fixed" r="${(r + 5).toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.9" opacity="${(fresh * 0.55).toFixed(2)}" />
      <circle class="rg-core scene-fixed" r="${r.toFixed(1)}" fill="${color}" opacity="${(0.2 + fresh * 0.6).toFixed(2)}" />
      <title>${esc(a.label)} · ${evs.length} 条 · 最新 ${esc(evs[0]?.title?.slice(0, 40) ?? '')}</title>
    </g>`;
  }

  // ---- BTC 卫星位 ----
  const btc = quoteOf('btc');
  let btcSvg = '';
  if (btc?.ok) {
    const d = dirOf(btc.changePct);
    const c = d === 'up' ? '#f5455c' : d === 'down' ? '#0ecb81' : '#7e8899';
    btcSvg = `<g class="map-sat" transform="translate(196,296)" data-goto="btc">
      <circle class="sat-ring scene-fixed" r="15" fill="none" stroke="${c}" stroke-width="0.9" opacity="0.5" />
      <circle class="scene-fixed" r="5" fill="${c}" />
      <g transform="translate(22,-2)"><g class="scene-fixed"><text x="0" y="0" class="tag-name">BTC</text></g></g>
      <g transform="translate(22,9)"><g class="scene-fixed"><text x="0" y="0" class="tag-pct" fill="${c}">${fmtPrice(btc.price, 0)} ${btc.changePct >= 0 ? '+' : ''}${btc.changePct.toFixed(2)}%</text></g></g>
    </g>`;
  }

  // ---- 右侧事件流（赛区聚焦时只留该赛区）----
  const visibleItems = mapRegion ? items.filter((ev) => ev.region === mapRegion) : items;
  const feedRows = visibleItems
    .slice(0, 40)
    .map((ev) => {
      const a = REGION_ANCHORS[ev.region] ?? REGION_ANCHORS.global;
      const hot = mapSeenIds && !mapSeenIds.has(ev.id) ? ' is-new' : '';
      return `<div class="mf-item lv-${ev.level}${hot}" data-id="${esc(ev.id)}">
        <span class="mf-meta"><i>${esc(ev.time.slice(11, 16))}</i>${esc(a.label)}</span>
        <span class="mf-text">${esc(ev.title)}</span>
      </div>`;
    })
    .join('');

  // 昼夜每小时才需要重算一次的量级，但这里跟着重建走，成本可以忽略
  const night = nightLayerPaths(new Date());

  mapEl.innerHTML = `
    <div class="map-top">
      <div class="map-title">
        <h2>全球市场地图</h2>
        <p>${
          mapRegion
            ? `聚焦 ${esc(REGIONS.REGION_ANCHORS[mapRegion].label)} · ${visibleItems.length} 条事件 · <button type="button" class="map-region-clear" id="map-region-clear">显示全部</button>`
            : `${quotes.length} 个标的 · ${items.length} 条实时事件 · 点国家或赛区点聚焦，滚轮缩放 / 拖拽平移`
        }</p>
      </div>
      <div class="map-tools">
        <button type="button" class="map-btn" id="map-zoom-out" title="缩小">−</button>
        <span class="map-zoom" id="zoom-label">1.0×</span>
        <button type="button" class="map-btn" id="map-zoom-in" title="放大">+</button>
        <button type="button" class="map-btn" id="map-reset" title="复位">复位</button>
        <button type="button" class="map-btn" id="map-full" title="全屏">⛶ 全屏</button>
      </div>
    </div>
    <div class="map-body">
      <div class="map-canvas" id="map-canvas">
        <svg class="world-svg" viewBox="0 0 ${LOGICAL_WIDTH} ${LOGICAL_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="全球市场地图">
          <defs>
            <radialGradient id="oceanGlow" cx="50%" cy="42%" r="62%">
              <stop offset="0%" stop-color="#0d1a2c" />
              <stop offset="58%" stop-color="#080d16" />
              <stop offset="100%" stop-color="#05070b" />
            </radialGradient>
            <linearGradient id="terminatorStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#4a7fd4" stop-opacity="0.15" />
              <stop offset="45%" stop-color="#7fb4ff" stop-opacity="0.55" />
              <stop offset="100%" stop-color="#4a7fd4" stop-opacity="0.15" />
            </linearGradient>
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect class="map-ocean" width="${LOGICAL_WIDTH}" height="${LOGICAL_HEIGHT}" fill="url(#oceanGlow)" />
          <g id="map-viewport">
            <g class="map-graticule"><path d="${graticulePath()}" /></g>
            <g class="world-land">${landPaths()}</g>
            <g class="night-layer">
              ${night.outer.map((b) => `<path class="night-band band-${b.key}" d="${b.d}" />`).join('')}
              <path class="night-core" d="${night.core}" />
              <path class="terminator" d="${night.line}" />
            </g>
            <g class="impact-layer">${impactArcs(items)}</g>
            <g class="map-regions">${regionSvg}</g>
            <g class="map-cities">${citySvg}</g>
            ${btcSvg}
          </g>
        </svg>
        <div class="map-bubbles" id="map-bubbles"></div>
      </div>
      <aside class="map-feed" id="map-feed">
        <div class="mf-head">
          <span>实时事件</span>
          <em>${visibleItems.filter((i) => i.level === 'high').length} 条高影响</em>
          <button type="button" class="mf-fold" id="mf-fold" title="收起面板">⟩</button>
        </div>
        <div class="mf-list">${feedRows}</div>
      </aside>
    </div>
  `;

  const layerNow = document.getElementById('map-bubbles');
  if (layerNow && liveBubbles.length) {
    liveBubbles.forEach((b) => layerNow.appendChild(b));
  }

  applyMapView();
  applyRegionClasses();
  bindMapEvents();
}

/**
 * 赛区聚焦时给国家加高亮/压暗 class。
 * 底图 path 字符串有缓存（landPaths），class 不能写进缓存里 —— 每帧按状态重加。
 */
function applyRegionClasses() {
  const svg = mapEl.querySelector('.world-svg');
  if (!svg) return;
  for (const p of svg.querySelectorAll('.world-land path')) {
    const hit = mapRegion && p.dataset.region === mapRegion;
    p.classList.toggle('is-active', Boolean(hit));
    p.classList.toggle('is-dim', Boolean(mapRegion && !hit));
  }
}

/* ---------- 节点详情卡（就地展开，不跳页） ---------- */

export let nodeCardKey = null;

export function closeNodeCard() {
  document.getElementById('map-node-card')?.remove();
  nodeCardKey = null;
}

export function openNodeCard(cityKey) {
  const city = MAP_CITIES.find((c) => c.key === cityKey);
  if (!city) return;
  if (nodeCardKey === cityKey) {
    closeNodeCard();
    return;
  }
  closeNodeCard();
  nodeCardKey = cityKey;

  const quotes = store.quotes ?? [];
  const members = city.ids.map((id) => quotes.find((q) => q.id === id)).filter((q) => q && q.ok);
  if (!members.length) return;

  const canvas = document.getElementById('map-canvas');
  const svg = document.querySelector('.world-svg');
  if (!canvas || !svg) return;

  // 把城市坐标换算成屏幕位置（CTM 吸收 letterbox 留白）
  const [mx, my] = mapProject(city.lon, city.lat);
  const hostRect = canvas.getBoundingClientRect();
  const p = toClient(svg, mx * mapView.k + mapView.tx, my * mapView.k + mapView.ty);
  if (!p) return;
  let px = p[0] - hostRect.left;
  let py = p[1] - hostRect.top;

  const W = 246;
  const H = 74 + members.length * 30;
  px = Math.max(10, Math.min(hostRect.width - W - 10, px - W / 2));
  py = Math.max(10, Math.min(hostRect.height - H - 10, py + 22));

  const openNow = Boolean(members[0].marketStatus?.open);
  const rows = members
    .map((m) => {
      const d = dirOf(m.changePct);
      const c = d === 'up' ? '#f5455c' : d === 'down' ? '#0ecb81' : '#8a8f99';
      const pct = m.changePct == null ? '—' : `${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`;
      const f = m.freshness?.label ?? '';
      return `<div class="nc-row">
        <span class="nc-name">${esc(MAP_TAG[m.id] ?? m.name)}</span>
        <span class="nc-price">${fmtPrice(m.price, m.decimals ?? 2)}</span>
        <span class="nc-pct" style="color:${c}">${pct}</span>
        <span class="nc-fresh">${esc(f)}</span>
      </div>`;
    })
    .join('');

  const el = document.createElement('div');
  el.className = 'map-node-card';
  el.id = 'map-node-card';
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
  el.innerHTML = `
    <div class="nc-head">
      <span class="nc-city">${esc(city.name)}</span>
      <span class="nc-status ${openNow ? 'on' : 'off'}">${openNow ? '交易中' : '已收盘'}</span>
    </div>
    ${rows}
    <div class="nc-foot">
      <a href="#/d/${encodeURIComponent(members[0].id)}">打开详情 →</a>
    </div>
  `;
  el.addEventListener('click', (e) => e.stopPropagation());
  canvas.appendChild(el);
}

export function bindMapEvents() {
  const svg = document.querySelector('.world-svg');
  const canvas = document.getElementById('map-canvas');
  if (!svg || !canvas) return;

  // 滚轮缩放
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    },
    { passive: false },
  );

  // 拖拽平移
  svg.addEventListener('pointerdown', (e) => {
    mapDrag = { x: e.clientX, y: e.clientY, tx: mapView.tx, ty: mapView.ty, moved: false };
    svg.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!mapDrag) return;
    if (Math.abs(e.clientX - mapDrag.x) + Math.abs(e.clientY - mapDrag.y) > 3) mapDrag.moved = true;
    const d = deltaToViewBox(svg, e.clientX - mapDrag.x, e.clientY - mapDrag.y);
    if (!d) return;
    mapView.tx = mapDrag.tx + d[0];
    mapView.ty = mapDrag.ty + d[1];
    clampMapView();
    applyMapView();
  });
  const endDrag = () => {
    mapDrag = null;
    canvas.classList.remove('dragging');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // 点城市节点 → 就地浮出卡片（不跳页，保住心流）
  svg.querySelectorAll('[data-city]').forEach((g) => {
    g.addEventListener('click', (e) => {
      if (mapDrag?.moved) return;
      e.stopPropagation();
      openNodeCard(g.dataset.city);
    });
  });

  // 点国家 → 聚焦该赛区（再点一次同一个国家即复位）
  // 命中区是国家多边形，未归属赛区的国家没有 data-region，点了不响应。
  svg.querySelectorAll('.world-land path[data-region]').forEach((p) => {
    p.addEventListener('click', (e) => {
      if (mapDrag?.moved) return;
      e.stopPropagation();
      focusRegion(p.dataset.region);
    });
  });

  // 点赛区脉冲点 → 同上
  svg.querySelectorAll('[data-region-anchor]').forEach((g) => {
    g.addEventListener('click', (e) => {
      if (mapDrag?.moved) return;
      e.stopPropagation();
      focusRegion(g.dataset.regionAnchor);
    });
  });

  // 顶栏「显示全部」
  document.getElementById('map-region-clear')?.addEventListener('click', (e) => {
    e.stopPropagation();
    focusRegion(null);
  });

  // 点空白处：收起卡片 + 退出赛区聚焦
  svg.addEventListener('click', () => {
    closeNodeCard();
    if (mapRegion) focusRegion(null);
  });

  // 双击放大（GIS 的标准手势）
  svg.addEventListener('dblclick', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, 1.8, 320);
  });

  // 工具按钮：以地图几何中心缩放。
  // 直接取 svg 的 rect 中心也行（xMidYMid 下两者重合），但那样就把
  // 「留白对称」当成了前提；走 CTM 投影 viewBox 中心，换成别的对齐方式也不会错位。
  const zoomAtCenter = (factor) => {
    const c = toClient(svg, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
    if (c) zoomAt(c[0], c[1], factor);
  };
  document.getElementById('map-zoom-in')?.addEventListener('click', () => zoomAtCenter(1.35));
  document.getElementById('map-zoom-out')?.addEventListener('click', () => zoomAtCenter(1 / 1.35));
  document.getElementById('map-reset')?.addEventListener('click', resetMapView);
  document.getElementById('mf-fold')?.addEventListener('click', () => {
    const host = document.querySelector('.map');
    const folded = host?.classList.toggle('feed-folded');
    const btn = document.getElementById('mf-fold');
    if (btn) btn.textContent = folded ? '\u27e8' : '\u27e9';
  });
  document.getElementById('map-full')?.addEventListener('click', () => {
    const host = document.querySelector('.map');
    if (!document.fullscreenElement) host?.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
}

export function stopMapTimer() {
  if (mapTimer) {
    clearInterval(mapTimer);
    mapTimer = null;
  }
  mapBubbles.forEach((b) => b.remove());
  mapBubbles = [];
}

export async function loadMap() {
  try {
    const [evRes, cal] = await Promise.all([
      fetch('./api/events', { cache: 'no-store' }),
      loadCalendarCached(false),
    ]);
    const data = evRes.ok ? await evRes.json() : null;
    if (!store.events) store.events = { data, calendar: cal, level: '', topic: '', studyMode: 'auto', newIds: null, newCount: 0 };
    if (data) {
      store.events.data = data;
      store.events.calendar = cal;
    }
    if (!location.hash.startsWith('#/map')) return;

    // 新事件 → 弹气泡
    const items = data?.items ?? [];
    const first = mapSeenIds === null;
    const fresh = first ? [] : items.filter((ev) => !mapSeenIds.has(ev.id));
    mapSeenIds = new Set(items.map((ev) => ev.id));

    // 必须先渲染再弹：renderMap 会重写 innerHTML，先弹的气泡会被一起清掉
    renderMap();
    fresh.reverse().slice(-2).forEach((ev) => spawnBubble(ev));
  } catch (err) {
    mapEl.innerHTML = `<div class="d-error">地图加载失败：${esc(err?.message ?? String(err))}</div>`;
  }
}

/* ------------------------------------------------------------------ *
 * 生命周期（由 router 调用）
 *
 * unmount 除了停表，还要清掉正在淡出的气泡节点与拖拽状态 —— 气泡是直接挂在
 * mapEl 里的绝对定位 div，容器清空后它们的 transitionend 回调仍会跑一次。
 * 另外要退订 bus 的 quotes 广播，否则地图离场后每轮报价仍会触发一次全量重绘。
 * ------------------------------------------------------------------ */
let unsubscribeQuotes = null;

export function mountMap() {
  mapEl.hidden = false;
  window.scrollTo({ top: 0 });
  loadMap();
  mapTimer = setInterval(() => loadMap(), 30000);
  // 列表每轮拿到新报价后顺带刷新地图节点（原来由 list 直接调 renderMap）
  unsubscribeQuotes?.();
  unsubscribeQuotes = on('quotes', () => {
    if (!mapEl.hidden) renderMap();
  });
}

export function unmountMap() {
  stopMapTimer();
  unsubscribeQuotes?.();
  unsubscribeQuotes = null;
  mapBubbles.forEach((b) => b.remove());
  mapBubbles = [];
  mapDrag = null;
  closeNodeCard?.();
  mapEl.hidden = true;
  mapEl.innerHTML = '';
}
