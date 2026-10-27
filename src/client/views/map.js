/* ================================================================== *
 * map.js —— #/map：晨昏线世界地图、城市节点、影响弧线、气泡与节点详情卡。
 *
 * 来源：public/app.js（原 3655 行单体）L2754-3500，整段搬运，逻辑未改写。
 * ================================================================== */

/* ================================================================== *
 * 全球市场地图 v2
 * 全屏 / 缩放平移 / 各地指数直接标注 / 新事件气泡 / 右侧滚动事件流
 * ================================================================== */
import { geoGraticule10, select } from 'geo-kit';
import * as GEO from './map/geo/cities.js';
import * as REGIONS from './map/geo/regions.js';
import {
  LOGICAL_WIDTH, LOGICAL_HEIGHT, worldFeatures, pathOf,
  lonLatToLogical,
} from './map/geo/projection.js';
import { sunPosition, nightGeometry, twilightBands, terminatorGeometry } from './map/geo/astro.js';
import { regionBounds, viewForBounds, toggleRegion } from './map/logic/focus.js';
import { createCamera, destroyCamera, applyTransform, syncCamera } from './map/camera.js';
import { cityAnchorsHtml, lodClassFor } from './map/layers/markers.js';
import { broadcastHtml } from './map/layers/broadcast.js';
import { relayBandHtml, macroCapsuleHtml, alertChipHtml, alertCardHtml, alertsNow, ALERT_ANCHOR } from './map/layers/hud.js';
import { timelineBarHtml, hhmmOf } from './map/layers/timeline-bar.js';
import { bucketEvents24h, eventsUpTo } from './map/logic/timeline.js';
import {
  createSpotlightState, buildSpotlightQueue, spotlightReducer,
  currentSpotlightEvent, needsIdleTimer, STEP_MS,
} from './map/logic/spotlight.js';
import { TOPIC_FILTERS, filterMapEvents } from './map/logic/filters.js';
import { sparklinePath } from './map/logic/sparkline.js';
import { mapEl } from '../shared/dom.js';
import { dirOf, esc, fmtPrice } from '../shared/format.js';
import { store } from '../shared/store.js';
import { on } from '../shared/bus.js';
import { loadCalendarCached } from '../shared/calendar.js';
import { applyInverseMatrix, applyMatrix } from '../shared/matrix.js';

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
export const arcApex = GEO.arcApex;
export function arcBetween([x1, y1], [x2, y2]) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(90, dist * 0.32);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${(my - lift).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

/**
 * 单条事件的专属冲击链：从赛区锚点射向 `targetCitiesFor` 命中的定价中心，
 * 弧顶挂一个主主题胶囊。
 *
 * 旧版给「最新 3 条 high」各画一组弧，满屏都是线，读者分不清哪条是哪条；
 * 而且它和播报台讲的事件不是同一条 —— 眼睛在上下两处对不上。现在弧线跟着
 * spotlight 走：播报台念哪条，画面上就只画那条的传导路径。
 */
export function impactArcsFor(ev) {
  if (!ev) return '';
  const anchor = REGION_ANCHORS[ev.region];
  if (!anchor) return '';
  const from = mapProject(anchor.lon, anchor.lat);
  if (!from) return '';

  const cityById = new Map(MAP_CITIES.map((c) => [c.key, c]));
  const targets = targetCitiesFor(ev)
    .map((k) => cityById.get(k))
    .filter(Boolean)
    // 连到事件自身所在的交易中心没有意义（零长度弧）
    .filter((c) => Math.hypot(c.lon - anchor.lon, c.lat - anchor.lat) > 4);
  if (!targets.length) return '';

  const topic = ev.topics?.find((t) => t.strong)?.label ?? ev.topics?.[0]?.label ?? '';

  let svg = '';
  // 弧顶标签挂在最长那条弧上。取第一条会把「货币政策」标在华盛顿→纽约
  // 这种几百公里的短弧顶上，正好压在城市名旁边；最长那条才是传导的代表方向。
  let apex = null;
  let apexSpan = -1;
  targets.forEach((city, ti) => {
    const to = mapProject(city.lon, city.lat);
    if (!to) return;
    svg += `<path class="impact-arc is-live" d="${arcBetween(from, to)}" style="animation-delay:${(ti * 0.12).toFixed(2)}s" />`;
    const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (span > apexSpan) {
      apexSpan = span;
      apex = arcApex(from, to);
    }
  });

  // 弧顶标签：只有主主题，不重复标题（标题在播报台里）
  if (apex && topic) {
    svg += `<g class="arc-tag" transform="translate(${apex[0].toFixed(1)},${apex[1].toFixed(1)})">`
      + `<g class="scene-fixed"><rect x="-1" y="-7" width="${(topic.length * 9 + 10).toFixed(0)}" height="14" rx="7" />`
      + `<text x="${(topic.length * 4.5 + 4).toFixed(1)}" y="3.6" text-anchor="middle">${esc(topic)}</text></g></g>`;
  }
  return svg;
}

/* ---------- 平滑视图动画 ---------- */

/** d3-zoom 相机实例（renderMap 时重建） */
let mapCamera = null;

/* ---------- 底部播报台 ---------- */

/** 当前滤镜（all / high / fed / geo / china / precious），按钮接好后由点击切换 */
let mapFilter = 'all';

/** 巡航状态机。6 秒一步、队列随刷新重建，但正在播的那条不中断 */
let bcState = createSpotlightState();
/** 步进定时器 */
let bcStepTimer = null;
/** 闲置自动恢复的轮询（只有 Locked 才需要） */
let bcIdleTimer = null;
/** 上一次渲染的播报事件 id，用来判断要不要重启进度条动画 */
let bcRenderedId = null;

/** 接力带倒计时的每秒刷新 */
let hudTimer = null;

/* ---------- 24h 时间轴 ---------- */

/** 回溯到的时刻（null = 看实时）。非 null 时事件流/弧线只留截至那时，昼夜切到那一刻 */
let mapAtMs = null;
/** 回放中：每 0.6s 推进一格 */
let replayTimer = null;
/** 24h 归档事件（懒加载，5 分钟） */
let historyCache = null;
/** 时间轴自己的 active 索引 */
let tlActive = null;

/**
 * 全量事件索引。
 *
 * 巡航队列只收「有靶点 + 高优/mid」的那几条，但用户悬停事件流时可能是任意
 * 一条 —— 只按队列查会让播报台和弧线一起变空。这里留一份全量兜底索引：
 * 队列里有就用队列的（保证 tick 顺序），没有就按 id 直接取。
 */
let evIndex = new Map();

function spotlightEvent() {
  const fromQueue = currentSpotlightEvent(bcState);
  if (fromQueue) return fromQueue;
  const id = bcState.previewId ?? bcState.lockedId;
  return id ? evIndex.get(id) ?? null : null;
}

/**
 * 重建队列。`hasTargets` 交给地理层判断：没有可挂靶点的事件不进队列，
 * 否则地图上会出现「播报了一条但画面上什么都没动」的脱节。
 */
function refreshBroadcastQueue(items) {
  evIndex = new Map(items.map((ev) => [ev.id, ev]));
  const queue = buildSpotlightQueue(items, {
    filterKey: mapFilter,
    region: mapRegion,
    hasTargets: (ev) => targetCitiesFor(ev).length > 0,
  });
  bcState = spotlightReducer(bcState, { type: 'setQueue', queue });
  renderBroadcast();
}

/** 进度条要跟着「新的一条」重启；同一条重绘时保持当前进度，不要闪 */
function renderBroadcast() {
  const box = document.getElementById('map-broadcast');
  if (!box) return;
  const ev = spotlightEvent();
  const quotesById = new Map((store.quotes ?? []).filter((q) => q && q.ok).map((q) => [q.id, q]));
  box.innerHTML = broadcastHtml(ev, quotesById);
  box.dataset.mode = bcState.mode;
  box.dataset.empty = ev ? '0' : '1';

  const bar = box.querySelector('.bc-bar > i');
  if (bar) {
    if (ev && ev.id !== bcRenderedId) {
      // 换了一条：强制重启 CSS 动画（改 animation 名不行，必须重排一次）
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = '';
    }
    bar.style.animationPlayState = bcState.playing ? 'running' : 'paused';
  }
  bcRenderedId = ev ? ev.id : null;
  renderImpact(ev);
  syncFeedTo(ev?.id ?? null);
}

/**
 * 把当前播报的那条滚进事件流视野，并给它加一道高亮。
 *
 * 手算 scrollTop 而不用 scrollIntoView：后者会连带把整个页面滚起来 ——
 * 播报台自己在地图底部，视觉上不该把页面推走。只在 AUTO 时滚，用户正在
 * 翻列表（Preview / Locked）时不该动他的视野。
 */
function syncFeedTo(id) {
  const list = mapEl.querySelector('.mf-list');
  if (!list) return;
  mapEl.querySelectorAll('.mf-item.is-current').forEach((r) => r.classList.remove('is-current'));
  if (!id) return;
  const row = list.querySelector(`.mf-item[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  row.classList.add('is-current');
  if (bcState.mode !== 'auto') return;

  const rel = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  const want = rel - list.clientHeight / 2 + row.offsetHeight / 2;
  list.scrollTo({ top: Math.max(0, want), behavior: 'smooth' });
}

/**
 * 弧线层与节点高亮。与播报台同一份输入 —— 念哪条就画哪条、亮哪些靶点，
 * 其余城市压暗，这样「传导到谁」是一眼的事，不用读文字。
 */
function renderImpact(ev) {
  const layer = mapEl.querySelector('.impact-layer');
  // 同一事件不重画：quotes 每 30 秒刷新都会走到这里，重画会把弧线的
  // 入场动画（animation-delay）反复重启，看起来一直在抽。
  const id = ev?.id ?? '';
  if (layer && layer.dataset.evId !== id) {
    layer.innerHTML = impactArcsFor(ev);
    layer.dataset.evId = id;
  }

  const targets = new Set(ev ? targetCitiesFor(ev) : []);
  const src = ev?.region ?? null;
  mapEl.querySelectorAll('.map-city[data-city]').forEach((g) => {
    const on = targets.has(g.dataset.city);
    g.classList.toggle('is-target', on);
    g.classList.toggle('is-dim', Boolean(ev) && !on);
  });
  mapEl.querySelectorAll('.map-region[data-region-anchor]').forEach((g) => {
    g.classList.toggle('is-source', Boolean(src) && g.dataset.regionAnchor === src);
  });
}

/** 暂停 / 继续。播报台自己 hover 时用，切事件时进度停在原处 */
function setBroadcastPlaying(playing) {
  if (bcState.playing === Boolean(playing)) return;
  bcState = spotlightReducer(bcState, { type: 'setPlaying', playing });
  renderBroadcast();
}

function startBroadcast() {
  stopBroadcast();
  bcStepTimer = setInterval(() => {
    bcState = spotlightReducer(bcState, { type: 'tick' });
    renderBroadcast();
  }, STEP_MS);
  // Locked 之后 20 秒无操作自动回到巡航。
  // 注意 needsIdleTimer 的语义是「还需等多久」，返回 0 表示不用再等 ——
  // 不是「不用管」。把它当 falsy 直接 return 的话，恰好在该恢复的那一刻跳过，
  // 锁定就再也回不到巡航了（实测 22 秒后仍是 locked）。
  bcIdleTimer = setInterval(() => {
    if (bcState.mode !== 'locked') return;
    if (needsIdleTimer(bcState, Date.now()) > 0) return;
    bcState = spotlightReducer(bcState, { type: 'idle', now: Date.now() });
    renderBroadcast();
  }, 1000);
}

/**
 * 接力带与宏观胶囊。
 *
 * 单独一个函数是因为它们每秒都要变（倒计时），但不能每秒重建整张地图 ——
 * 那样相机、锚点、卡片全被打断。这里只改两个容器的 innerHTML。
 */
function renderHud() {
  const band = document.getElementById('relay-band');
  const cap = document.getElementById('macro-capsule');
  if (!band && !cap) return;
  const quotesById = new Map((store.quotes ?? []).filter((q) => q && q.ok).map((q) => [q.id, q]));
  if (band) band.innerHTML = relayBandHtml(quotesById);
  if (cap) {
    const html = macroCapsuleHtml(store.macro, quotesById);
    cap.innerHTML = html;
    cap.hidden = !html;
  }
  // 信标每秒只剩倒计时要变，单独改文本，别重建整个 chip
  const chip = document.getElementById('cal-chip');
  if (chip) {
    const alerts = alertsNow(store.calendar ?? store.events?.calendar, Date.now());
    if (alerts[0]) chip.innerHTML = alertChipHtml(alerts[0]);
    else chip.parentElement?.remove();
  }

  // 接力带上的胶囊也要能点（bindMapEvents 每轮重绘后会重绑，这里补一次）
  band?.querySelectorAll('.relay-chip[data-anchor]').forEach((b) => {
    b.onclick = () => {
      const anchor = b.dataset.anchor;
      const a = REGION_ANCHORS[anchor];
      if (!a) return;
      // 走动画而不是直接赋值 —— 直接改 mapView 会跳变，也和 d3-zoom 的
      // 内部变换脱钩（后续拖拽会从旧位置接着算）
      const b2 = regionBounds(anchor);
      animateMapView(b2 ? viewForBounds(b2) : { k: 2, tx: 0, ty: 0 }, 520);
    };
  });
}

/** 宏观数据懒加载：首屏渲染完之后才拉，失败就静默（胶囊整块不渲染） */
let macroLoading = false;
const MACRO_TTL_MS = 5 * 60 * 1000;

async function ensureMacro() {
  if (macroLoading) return;
  const at = store.macro?.at ?? 0;
  if (store.macro?.data && Date.now() - at < MACRO_TTL_MS) return;
  macroLoading = true;
  try {
    const res = await fetch('./api/macro?window=250', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    store.macro = { data: await res.json(), at: Date.now() };
    renderHud();
  } catch {
    // 这个面板是加分项，不是地图的前提。失败就让它空着。
  } finally {
    macroLoading = false;
  }
}

/* ---------- 24h 时间轴 ---------- */

const HISTORY_TTL_MS = 5 * 60 * 1000;

/**
 * 归档事件懒加载。进入时间轴才请求 —— 这个接口要读两份 jsonl 再合并，
 * 没必要在首屏就跟地图抢带宽。
 */
async function ensureHistory() {
  if (historyCache && Date.now() - historyCache.at < HISTORY_TTL_MS) return historyCache.data;
  try {
    const res = await fetch('./api/events/history?hours=24', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    historyCache = { data, at: Date.now() };
    return data;
  } catch {
    return null;
  }
}

/** 时间轴数据：优先用归档，拿不到就退回当前快照（并且会如实显示条数少） */
function timelineData() {
  const items = historyCache?.data?.items ?? store.events?.data?.items ?? [];
  return bucketEvents24h(items, Date.now());
}

function renderTimeline() {
  const host = document.getElementById('map-timeline');
  if (!host) return;
  const data = timelineData();
  host.innerHTML = timelineBarHtml(data, { activeIndex: tlActive, playing: Boolean(replayTimer) });

  host.querySelectorAll('.tl-col').forEach((b) => {
    b.onclick = () => {
      const idx = Number(b.dataset.index);
      if (!Number.isFinite(idx)) return;
      seekToBucket(idx);
    };
  });
  host.querySelector('.tl-play')?.addEventListener('click', () => {
    if (replayTimer) stopReplay();
    else startReplay();
  });
  host.querySelector('.tl-live')?.addEventListener('click', () => {
    stopReplay();
    tlActive = null;
    mapAtMs = null;
    renderMap();
  });
}

/**
 * 回溯到某个桶的结束时刻。
 *
 * 只换「看什么」和「天亮到哪儿」：事件流按 cutoff 截断，昼夜面片按那一刻
 * 的太阳位置重画。不重建整张图 —— 相机、LOD、卡片都得留着。
 */
function seekToBucket(idx) {
  const data = timelineData();
  const bucket = data.buckets[idx];
  if (!bucket) return;
  tlActive = idx;
  mapAtMs = bucket.end;

  // 2) 重绘（renderMap 自己会按 mapAtMs 截断事件流，并按那一刻画昼夜）
  renderMap();
}

/** 浓缩回放：24 格 × 0.6s ≈ 14.4s，正好一口气看完一昼夜 */
const REPLAY_STEP_MS = 600;

function startReplay() {
  stopReplay();
  const data = timelineData();
  let i = 0;
  tlActive = 0;
  seekToBucket(0);
  replayTimer = setInterval(() => {
    i += 1;
    // 跳过空桶，否则深夜会连着好几秒画面不动
    while (i < data.buckets.length && data.buckets[i].count === 0) i += 1;
    if (i >= data.buckets.length) {
      stopReplay();
      tlActive = null;
      mapAtMs = null;
      renderMap();
      return;
    }
    seekToBucket(i);
    renderTimeline();
  }, REPLAY_STEP_MS);
  renderTimeline();
}

function stopReplay() {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
}

/**
 * 窄屏时把播报台从画布内搬出来，作为 .map-body 的独立一行。
 *
 * 390px 宽的地图画布只有 200px 高，浮在底部的播报台会直接压住东南亚一串
 * 城市标签 —— 那不是「浮层」，那是遮挡。
 */
function placeBroadcast() {
  const bar = document.getElementById('map-broadcast');
  const canvas = document.getElementById('map-canvas');
  const body = mapEl.querySelector('.map-body');
  const feed = mapEl.querySelector('#map-feed');
  if (!bar || !canvas || !body) return;

  if (window.innerWidth > 720) {
    if (bar.parentElement !== canvas) canvas.appendChild(bar);
    return;
  }
  // 窄屏插在画布与事件流之间 —— append 到 .map-body 末尾的话它会落到
  // 事件流下面，整条被挤出首屏。
  if (bar.parentElement !== body || bar.nextElementSibling !== feed) {
    body.insertBefore(bar, feed ?? null);
  }
}

function stopBroadcast() {
  stopReplay();
  if (hudTimer) { clearInterval(hudTimer); hudTimer = null; }
  if (bcStepTimer) { clearInterval(bcStepTimer); bcStepTimer = null; }
  if (bcIdleTimer) { clearInterval(bcIdleTimer); bcIdleTimer = null; }
}

/** ease-out cubic：起手快、收尾稳，比线性自然得多 */
/**
 * 平滑移动相机。
 *
 * 插值交给 d3-zoom 的 transition —— 它内部按缩放级别差插值（interpolateZoom），
 * 跨越多个量级时比线性插值自然：线性在中途会显得突然加速，缩放感知插值则
 * 先拉远再推近，像真正的镜头。
 *
 * 边界约束也交给 d3 的 translateExtent（在 tween 每帧生效），所以原来那套
 * clampMapView 事后截断可以删掉了 —— 那会导致相机状态与实际渲染短暂不一致。
 */
export function animateMapView(target, dur = 420) {
  const svg = document.querySelector('.world-svg');
  if (!svg || !mapCamera) {
    // 相机还没装（首帧渲染过程中）：直接落到终态，别让调用方等
    mapView.k = target.k;
    mapView.tx = target.tx;
    mapView.ty = target.ty;
    applyMapView();
    return;
  }
  applyTransform(svg, mapCamera, target, dur);
}

/* LOD 阈值与档位在 map/layers/markers.js（lodClassFor），这里不再重复一份 */

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
/* LOD 已改为「只切 class」，不再需要渲染档位与重建定时器 */

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

  // 锚点跟着相机走：位置每帧更新（rAF 合并），LOD 只切一个 class
  applyLodClass();
  scheduleAnchorUpdate();
}

/**
 * LOD 只改容器上的一个 class，14 个锚点共享 —— 不用逐元素遍历，
 * 也不重建 DOM。所以跨档位时城市卡片的节点数与布局都不变。
 */
function applyLodClass() {
  const host = mapEl.querySelector('.map-anchors');
  if (!host) return;
  const cls = lodClassFor(mapView.k);
  // 以 class 为准判断是否需要改：dataset 只是给调试看的镜像，
  // 拿它当早退条件会让「首次设置」被跳过（初始 DOM 里 class 可能还没同步）。
  if (host.classList.contains(cls)) return;
  host.dataset.lod = cls;
  host.classList.remove('lod-0', 'lod-1', 'lod-2');
  host.classList.add(cls);
}

let anchorRaf = null;

/**
 * 逻辑坐标 → 屏幕坐标，写进每个锚点的 translate3d。
 *
 * 用 rAF 合并：d3 的 zoom 事件每帧都来，14 个元素逐帧写 transform 会产生
 * 大量样式重算，合并到一帧只做一次。视口外的直接 visibility: hidden，
 * 省掉合成开销（放大到 8× 时大多数城市都在画布外）。
 */
function scheduleAnchorUpdate() {
  if (anchorRaf) return;
  anchorRaf = requestAnimationFrame(() => {
    anchorRaf = null;
    updateAnchors();
  });
}

/** 立刻更新（renderMap 后首帧用，不等下一帧） */
export function updateAnchors() {
  const svg = mapEl.querySelector('.world-svg');
  const canvas = mapEl.querySelector('.map-canvas');
  const host = document.getElementById('map-anchors');
  if (!svg || !canvas || !host) return;
  const ctm = svgCTM(svg);
  if (!ctm) return;

  const cr = canvas.getBoundingClientRect();
  for (const el of host.children) {
    const lx = Number(el.dataset.lx);
    const ly = Number(el.dataset.ly);
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
    const p = applyMatrix(ctm, lx * mapView.k + mapView.tx, ly * mapView.k + mapView.ty);
    if (!p) continue;
    const x = p[0] - cr.left;
    const y = p[1] - cr.top;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    const off = x < -200 || y < -100 || x > cr.width + 200 || y > cr.height + 100;
    const flag = off ? '1' : '0';
    if (el.dataset.off !== flag) {
      el.dataset.off = flag;
      el.style.visibility = off ? 'hidden' : '';
    }
  }
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
  const rawItems = store.events?.data?.items ?? [];
  // 回溯模式下只看到那一刻为止 —— 时间轴点某一格、或回放到某一格时，
  // 事件流、弧线、播报台都该停在那时，不能把未来的事件摆出来。
  const items = mapAtMs != null ? eventsUpTo(rawItems, mapAtMs) : rawItems;
  const quoteOf = (id) => quotes.find((q) => q.id === id);

  // ---- 城市节点：SVG 只画点与光环，标签交给 HTML 锚点层 ----
  const quotesById = new Map(quotes.filter((q) => q && q.ok).map((q) => [q.id, q]));
  let citySvg = '';
  for (const city of MAP_CITIES) {
    const [x, y] = mapProject(city.lon, city.lat);
    if (!x && !y) continue;
    const all = city.ids.map((id) => quotesById.get(id)).filter(Boolean);
    if (!all.length) continue;

    const lead = all[0];
    // 交易中的市场光环亮，已收盘的压暗 —— 配合晨昏线读「谁在开着」
    const openNow = Boolean(lead.marketStatus?.open);
    const ldir = dirOf(lead.changePct);
    const color = ldir === 'up' ? '#f5455c' : ldir === 'down' ? '#0ecb81' : '#7e8899';

    citySvg += `<g class="map-city${openNow ? ' is-open' : ' is-closed'}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"
        data-city="${esc(city.key)}" data-open="${openNow ? 1 : 0}">
      <circle class="city-halo scene-fixed" r="8" fill="${color}" />
      <circle class="city-dot scene-fixed" r="2.8" fill="${color}" />
      <circle class="city-hit scene-fixed" r="10" />
    </g>`;
  }

  // 标签与火花线：全部行都渲染，超出当前 LOD 的用 CSS 隐藏（跨档不重建 DOM）
  const anchorsHtml = cityAnchorsHtml(MAP_CITIES, quotesById);

  // 48h 日历信标。挂在华盛顿坐标，作为锚点层的子元素 —— 这样它自动复用
  // updateAnchors 的投影换算，缩放平移都跟着走，不必另写一套。
  const alerts = alertsNow(store.calendar ?? store.events?.calendar, Date.now());
  const nextAlert = alerts[0] ?? null;
  const beaconLxLy = mapProject(ALERT_ANCHOR.lon, ALERT_ANCHOR.lat);
  const beaconHtml = nextAlert && beaconLxLy
    ? `<div class="map-anchor cal-beacon" data-lx="${beaconLxLy[0].toFixed(2)}" data-ly="${beaconLxLy[1].toFixed(2)}">`
      + `<button type="button" class="cal-chip" id="cal-chip">${alertChipHtml(nextAlert)}</button>`
      + '</div>'
    : '';

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

  // ---- 右侧事件流 ----
  // 滤镜与赛区是「与」关系：聚焦中东后再点「地缘/能源」，在该赛区内继续收窄。
  const visibleItems = filterMapEvents(items, { filterKey: mapFilter, region: mapRegion });
  // 事件流只渲染前 40 条，但当前播报的那条必须在内 —— 否则「同步滚动」
  // 找不到行，高亮也挂不上（实测锁定恢复后 is-current 为 null 就是这个原因）。
  // 位置靠后就临时把窗口扩到它为止，上限 120 行。
  const curId = spotlightEvent()?.id;
  const curIdx = curId ? visibleItems.findIndex((ev) => ev.id === curId) : -1;
  const feedEnd = Math.min(120, Math.max(40, curIdx + 1));
  const feedRows = visibleItems
    .slice(0, feedEnd)
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
  const night = nightLayerPaths(new Date(mapAtMs ?? Date.now()));

  /**
   * 太阳直射点。它和黑夜面片是同一份数据的两种表达：面片说「哪儿是夜里」，
   * 这个点说「此刻太阳在谁头顶正上方」。放大到 3× 找城市时，靠它能判断某地
   * 是清晨还是黄昏 —— 局部明暗反而不容易看出方向。
   */
  const sunXY = mapProject(night.sun.lon, night.sun.decl);
  const sunMark = sunXY
    ? '<g class="sun-mark" transform="translate(' + sunXY[0].toFixed(1) + ',' + sunXY[1].toFixed(1) + ')">'
      + '<g class="scene-fixed"><circle class="sun-glow" r="7" /><circle class="sun-core" r="2.6" /></g>'
      + '</g>'
    : '';

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
    <div class="map-relay">
      <div class="relay-band" id="relay-band"></div>
      <div class="macro-capsule" id="macro-capsule"></div>
    </div>
    <div class="map-filters" role="tablist" aria-label="主题筛选">
      ${TOPIC_FILTERS.map((f) => {
        const on = f.key === mapFilter;
        const n = filterMapEvents(items, { filterKey: f.key, region: mapRegion }).length;
        return `<button type="button" class="map-pill${on ? ' on' : ''}" role="tab" aria-selected="${on}" data-filter="${esc(f.key)}">${esc(f.label)}<em>${n}</em></button>`;
      }).join('')}
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
            ${sunMark}
            <g class="impact-layer"></g>
            <g class="map-regions">${regionSvg}</g>
            <g class="map-cities">${citySvg}</g>
            ${btcSvg}
          </g>
        </svg>
        <div class="map-anchors lod-0" id="map-anchors" data-lod="lod-0">${anchorsHtml}${beaconHtml}</div>
        <div class="map-broadcast" id="map-broadcast"></div>
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
      <div class="map-timeline" id="map-timeline"></div>
    </div>
  `;

  const layerNow = document.getElementById('map-bubbles');
  if (layerNow && liveBubbles.length) {
    liveBubbles.forEach((b) => layerNow.appendChild(b));
  }

  placeBroadcast();
  renderHud();
  renderTimeline();
  refreshBroadcastQueue(visibleItems);
  applyMapView();
  updateAnchors();
  applyRegionClasses();
  bindMapEvents();

  // mapEl.innerHTML 整体重建会连带删掉打开中的节点卡。quotes 有 15 秒 ttl、
  // 30 秒轮询也会走到这里 —— 用户正读着卡片时它会突然消失。重建后重开一次。
  if (nodeCardKey) {
    const reopen = nodeCardKey;
    nodeCardKey = null; // 否则 openNodeCard 会当成「再点一次」而关闭
    openNodeCard(reopen);
  }
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
  // 每个成员一条迷你走势，放在价格右边 —— 一行数字看不出「它是怎么走到这儿的」
  const sparkOf = (q) => {
    const sp = sparklinePath(q.history, 44, 12, 1);
    if (!sp) return '';
    const d = dirOf(q.changePct);
    return `<svg class="nc-spark" viewBox="0 0 44 12" aria-hidden="true">
      <path class="nc-spark-area ${d}" d="${sp.area}" /><path class="nc-spark-line ${d}" d="${sp.line}" />
    </svg>`;
  };

  const rowsWithSpark = members
    .map((m) => {
      const d = dirOf(m.changePct);
      const c = d === 'up' ? '#f5455c' : d === 'down' ? '#0ecb81' : '#8a8f99';
      const pct = m.changePct == null ? '—' : `${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`;
      const f = m.freshness?.label ?? '';
      return `<div class="nc-row">
        <span class="nc-name">${esc(MAP_TAG[m.id] ?? m.name)}</span>
        ${sparkOf(m)}
        <span class="nc-price">${fmtPrice(m.price, m.decimals ?? 2)}</span>
        <span class="nc-pct" style="color:${c}">${pct}</span>
        <span class="nc-fresh">${esc(f)}</span>
      </div>`;
    })
    .join('');

  // 横向四件套：读某个定价中心时，利率 / 美元 / 人民币 / 原油是绕不开的背景。
  // 它们不属于这个城市，但决定这个城市的价格在什么环境里。
  const macroIds = ['us10y', 'dxy', 'usdcny', 'oil'];
  const macro = macroIds
    .map((id) => quotes.find((q) => q.id === id))
    .filter((q) => q && q.ok)
    .map((q) => {
      const d = dirOf(q.changePct);
      return `<span class="nc-macro ${d}">${esc(MAP_TAG[q.id] ?? q.name)} <b>${q.changePct == null ? '—' : (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%'}</b></span>`;
    })
    .join('');

  // 波及事件 Top3：按赛区 + 标的命中，重要的排前面
  // 赛区要按 REGION_IMPACT 反查 —— MAP_CITIES 上没有 region 字段，
  // 写 city.region 的话条件恒等于 ev.region，等于没过滤，纽约卡里会冒出
  // 「泽连斯基袭击乌克兰基础设施」这种只是碰巧命中 vix 的条目。
  const cityRegion = Object.entries(REGION_IMPACT).find(([, keys]) => keys.includes(city.key))?.[0] ?? null;
  const cityIds = new Set(city.ids);
  const spill = (store.events?.data?.items ?? [])
    // global 事件对每个中心都成立，不能因为赛区不同就丢掉
    .filter((ev) => !cityRegion || ev.region === cityRegion || ev.region === 'global')
    .filter((ev) => (ev.symbols ?? []).some((id) => cityIds.has(id)))
    .sort((a, b) => (b.level === 'high' ? 1 : 0) - (a.level === 'high' ? 1 : 0) || String(b.time).localeCompare(String(a.time)))
    .slice(0, 3);

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
    ${macro ? `<div class="nc-macros">${macro}</div>` : ''}
    ${rowsWithSpark}
    ${spill.length ? `<div class="nc-spill">
      <span class="nc-spill-head">波及事件</span>
      ${spill.map((ev) => `<a class="nc-spill-row lv-${esc(ev.level)}" href="#/d/${encodeURIComponent(ev.id)}">
        <i>${esc(String(ev.time).slice(11, 16))}</i><span>${esc(ev.title.slice(0, 34))}</span></a>`).join('')}
    </div>` : ''}
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

  /**
   * 相机：滚轮 / 拖拽 / 双指 / 触摸全交给 d3-zoom。
   * 手写版只有鼠标滚轮和指针拖拽，触屏上根本没法缩放；平移边界靠事后
   * clamp 截断，还会让相机状态与渲染短暂不一致。
   *
   * 点击与拖拽的区分用 d3 的 start/end 对比位移（DRAG_SLOP = 2 个 viewBox 单位），
   * 结果写进 mapDrag.moved，供下面的 click handler 判断 —— 拖完地图不会误触聚焦。
   */
  mapCamera = createCamera(svg, {
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    onChange: (t) => {
      mapView.k = t.k;
      mapView.tx = t.x;
      mapView.ty = t.y;
      applyMapView();
    },
    onDragState: (on) => canvas.classList.toggle('dragging', on),
    onDragEnd: (moved) => {
      // click 紧跟 pointerup 同步触发，所以这条标志只需存活到本轮事件循环结束
      mapDrag = { moved };
      setTimeout(() => {
        mapDrag = null;
      }, 0);
    },
  });
  // 相机内部状态要对齐当前视图（聚焦状态下重建会被拉回 1×）
  syncCamera(svg, mapView);
  // 双击我们自己在下面实现（以指针为中心 1.8×），关掉 d3 的默认翻倍
  select(svg).on('dblclick.zoom', null);

  // 点城市节点（SVG 上的点，或 HTML 锚点上的城市名）→ 就地浮出卡片。
  // 两条路径都留着：点是地图上的定位感，城市名是更好按的命中区。
  const openCity = (key) => (e) => {
    if (mapDrag?.moved) return;
    e.stopPropagation();
    openNodeCard(key);
  };
  svg.querySelectorAll('.map-city[data-city]').forEach((g) => {
    g.addEventListener('click', openCity(g.dataset.city));
  });
  mapEl.querySelectorAll('.map-anchors .ma-head').forEach((b) => {
    b.addEventListener('click', openCity(b.dataset.city));
  });

  // 事件流：悬停预览该条的冲击链、点击锁定、移开恢复巡航。
  // 用 on* 赋值（bindMapEvents 每轮跑，事件行每轮重建）。
  mapEl.querySelectorAll('.mf-item[data-id]').forEach((row) => {
    const id = row.dataset.id;
    row.onpointerenter = () => {
      bcState = spotlightReducer(bcState, { type: 'hover', id, now: Date.now() });
      renderBroadcast();
    };
    row.onpointerleave = () => {
      bcState = spotlightReducer(bcState, { type: 'unhover', id, now: Date.now() });
      renderBroadcast();
    };
    row.onclick = () => {
      bcState = spotlightReducer(bcState, { type: 'click', id, now: Date.now() });
      renderBroadcast();
    };
  });

  // 滤镜：切换后整张重绘。数量徽标要跟着赛区一起变，所以顺带重算。
  mapEl.querySelectorAll('.map-pill[data-filter]').forEach((b) => {
    b.onclick = () => {
      const key = b.dataset.filter;
      if (key === mapFilter) return;
      mapFilter = key;
      renderMap();
    };
  });

  // 48h 信标：点开预览卡（发布时间双时区 + 关联标的现价）
  const calChip = document.getElementById('cal-chip');
  if (calChip) {
    calChip.onclick = (e) => {
      e.stopPropagation();
      const existing = document.getElementById('cal-card');
      if (existing) { existing.remove(); return; }
      const alerts = alertsNow(store.calendar ?? store.events?.calendar, Date.now());
      if (!alerts[0]) return;
      const quotesById = new Map((store.quotes ?? []).filter((q) => q && q.ok).map((q) => [q.id, q]));
      const card = document.createElement('div');
      card.className = 'cal-card';
      card.id = 'cal-card';
      card.innerHTML = alertCardHtml(alerts[0], quotesById);
      // 贴在信标下方
      const r = calChip.getBoundingClientRect();
      const host = document.getElementById('map-anchors').getBoundingClientRect();
      card.style.left = `${Math.round(r.left - host.left)}px`;
      card.style.top = `${Math.round(r.bottom - host.top + 6)}px`;
      document.getElementById('map-anchors').appendChild(card);
    };
  }

  // 播报台：悬停暂停进度、点击跳详情。用 on* 赋值而不是 addEventListener ——
  // bindMapEvents 每轮 renderMap 都会跑，而播报台是同一个常驻元素，
  // addEventListener 会把监听器叠起来（悬停一次触发 N 次）。
  const bc = document.getElementById('map-broadcast');
  if (bc) {
    bc.onpointerenter = () => setBroadcastPlaying(false);
    bc.onpointerleave = () => setBroadcastPlaying(true);
    bc.onclick = () => {
      const ev = spotlightEvent();
      if (ev?.id) location.hash = `#/d/${encodeURIComponent(ev.id)}`;
    };
  }

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
  stopBroadcast();
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

/**
 * 窗口尺寸变化会改变 viewBox 的 letterbox 比例，锚点的屏幕坐标得重算。
 * 用 rAF 合并 —— resize 事件在拖窗口时能一秒来几十次。
 */
function onMapResize() {
  scheduleAnchorUpdate();
  placeBroadcast();
}

export function mountMap() {
  mapEl.hidden = false;
  window.scrollTo({ top: 0 });
  window.addEventListener('resize', onMapResize);
  loadMap();
  mapTimer = setInterval(() => loadMap(), 30000);
  startBroadcast();
  // 首屏已经渲染完了，现在才去拉宏观（这个接口要拉 13 个市场的全量日线）
  ensureMacro();
  // 归档事件也懒加载：拿到之后把时间轴和「覆盖 HH:MM 起」的注记补上
  ensureHistory().then(() => renderTimeline());
  hudTimer = setInterval(() => {
    // 只刷倒计时那部分，别碰地图
    renderHud();
    if (!store.macro?.data) ensureMacro();
  }, 1000);
  // 列表每轮拿到新报价后顺带刷新地图节点（原来由 list 直接调 renderMap）
  unsubscribeQuotes?.();
  unsubscribeQuotes = on('quotes', () => {
    if (!mapEl.hidden) renderMap();
  });
}

export function unmountMap() {
  stopMapTimer();
  stopBroadcast();
  window.removeEventListener('resize', onMapResize);
  destroyCamera(mapEl.querySelector('.world-svg'));
  mapCamera = null;
  unsubscribeQuotes?.();
  unsubscribeQuotes = null;
  mapBubbles.forEach((b) => b.remove());
  mapBubbles = [];
  mapDrag = null;
  closeNodeCard?.();
  mapEl.hidden = true;
  mapEl.innerHTML = '';
}
