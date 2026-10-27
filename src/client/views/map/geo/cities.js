/* ================================================================== *
 * 定价中心：城市坐标、标的 → 城市、事件 → 城市
 *
 * 「一条新闻该连到哪几个交易所」不是按事件发生地拍脑袋，而是按
 * 后端 classify 给出的 `ev.symbols` 反查定价地：中东地缘冲突打到芝加哥
 * （WTI）与伦敦（Brent），而不是凭空连孟买。区域只作为兜底。
 *
 * 纯数据 + 纯函数，不碰 DOM、不依赖投影 —— 逻辑坐标的弧线在别处生成。
 * ================================================================== */

/**
 * 交易所坐标。同城多标的聚合到一个节点，纵向堆叠显示。
 * dx/dy 是标签相对城市点的偏移：欧洲三国、北美三城在地图上只隔十几像素，
 * 不手动错开会叠成一团。
 */
export const MAP_CITIES = [
  { key: 'ny', name: '纽约', lon: -74.0, lat: 40.7, ids: ['sp500', 'ndx100', 'dji', 'vix', 'vxn'], side: 'right', dx: 16, dy: -46 },
  { key: 'tor', name: '多伦多', lon: -79.4, lat: 43.7, ids: ['tsx'], side: 'left', dx: -18, dy: -16 },
  { key: 'chi', name: '芝加哥', lon: -87.6, lat: 41.9, ids: ['oil'], side: 'left', dx: -18, dy: 28 },
  { key: 'sh', name: '上海', lon: 121.5, lat: 31.2, ids: ['sh000001', 'gold-cn'], side: 'left', dx: -14, dy: 16 },
  { key: 'hkg', name: '香港', lon: 114.2, lat: 22.3, ids: ['hsi'], side: 'left', dx: -12, dy: 34 },
  { key: 'ldn', name: '伦敦', lon: -0.1, lat: 51.5, ids: ['gold-intl', 'ftse'], side: 'left', dx: -14, dy: -28 },
  { key: 'par', name: '巴黎', lon: 2.3, lat: 48.9, ids: ['cac'], side: 'left', dx: -16, dy: 20 },
  { key: 'fra', name: '法兰克福', lon: 8.7, lat: 50.1, ids: ['dax'], side: 'right', dx: 16, dy: -10 },
  { key: 'tyo', name: '东京', lon: 139.7, lat: 35.7, ids: ['n225'], side: 'left', dx: -16, dy: -10 },
  { key: 'sel', name: '首尔', lon: 127.0, lat: 37.6, ids: ['kospi'], side: 'left', dx: -14, dy: 26 },
  { key: 'tpe', name: '台北', lon: 121.6, lat: 25.0, ids: ['twii'], side: 'left', dx: -12, dy: 18 },
  { key: 'sao', name: '圣保罗', lon: -46.6, lat: -23.5, ids: ['bvsp'], side: 'right', dx: 14, dy: 2 },
  { key: 'bom', name: '孟买', lon: 72.9, lat: 19.1, ids: ['nifty'], side: 'right', dx: 14, dy: 48 },
  { key: 'syd', name: '悉尼', lon: 151.2, lat: -33.9, ids: ['asx'], side: 'left', dx: -14, dy: 6 },
];

/** 地图标签用的指数简称 */
export const MAP_TAG = {
  sp500: '标普', ndx100: '纳指', dji: '道指', vix: 'VIX', vxn: 'VXN',
  sh000001: '上证', 'gold-cn': '沪金', 'gold-intl': '黄金', ftse: '富时',
  oil: 'WTI', n225: '日经', hsi: '恒生', dax: 'DAX', cac: 'CAC',
  bvsp: '巴西', nifty: '印度', kospi: '韩国', asx: '澳洲', tsx: '加拿大',
  twii: '台湾', btc: 'BTC',
};

/** 城市 key → 城市对象 */
export const CITY_BY_KEY = new Map(MAP_CITIES.map((c) => [c.key, c]));

/** 区域 → 受影响的交易中心（仅在拿不到 symbols 时兜底） */
export const REGION_IMPACT = {
  us: ['ny'],
  cn: ['sh', 'hkg'],
  eu: ['fra', 'ldn'],
  uk: ['ldn'],
  jp: ['tyo'],
  me: ['ldn', 'bom'],
  asia: ['hkg', 'syd'],
  latam: ['sao'],
  africa: ['ldn'],
  global: ['ny', 'ldn', 'sh'],
};

/** 标的 → 定价中心城市 */
export const SYMBOL_CITY = {
  // 美债与美元：定价在纽约
  us10y: ['ny'],
  dxy: ['ny', 'ldn'],
  usdcny: ['sh', 'hkg'],
  // 美股与波动率：纽约 / 芝加哥 CBOE
  sp500: ['ny'],
  ndx100: ['ny'],
  dji: ['ny'],
  vix: ['chi', 'ny'],
  // 商品：WTI 在芝加哥，Brent 与伦敦金在伦敦，沪金在上金所，铜在 LME
  oil: ['chi', 'ldn'],
  brent: ['ldn'],
  copper: ['ldn', 'chi'],
  'gold-intl': ['ldn', 'ny'],
  'gold-cn': ['sh'],
  // 加密：现货无实体中心，取 CME 期货所在的纽约
  btc: ['ny'],
  // A 股与亚太
  sh000001: ['sh', 'hkg'],
  hsi: ['hkg'],
  n225: ['tyo'],
  kospi: ['sel'],
  twii: ['tpe'],
  asx: ['syd'],
  nifty: ['bom'],
  // 欧洲
  dax: ['fra'],
  cac: ['par'],
  ftse: ['ldn'],
  // 美洲
  tsx: ['tor'],
  bvsp: ['sao'],
};

/**
 * 由事件的 symbols 推出该连到哪些定价中心；拿不到才退回区域兜底。
 * 最多 5 个，避免一条事件拉出一张网。
 */
export function targetCitiesFor(ev) {
  const keys = new Set();
  for (const sym of ev?.symbols ?? []) {
    for (const city of SYMBOL_CITY[sym] ?? []) keys.add(city);
  }
  const list = [...keys];
  if (list.length) return list.slice(0, 5);
  return REGION_IMPACT[ev?.region] ?? [];
}

/**
 * 一次算好「从哪几个方位射向哪些城市」，供弧线层反复使用（不重复计算）。
 * 连到事件自身所在交易中心没有意义（零长度弧），这里就滤掉。
 */
export function arcTargetsFor(ev, from) {
  return targetCitiesFor(ev)
    .map((k) => CITY_BY_KEY.get(k))
    .filter(Boolean)
    .filter((c) => !from || Math.hypot(c.lon - from.lon, c.lat - from.lat) > 4);
}

/** 两点之间的拱形二次贝塞尔（逻辑坐标）。lift 随距离增长但有上限 */
export function arcBetween([x1, y1], [x2, y2], liftRatio = 0.32, maxLift = 90) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(maxLift, dist * liftRatio);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${(my - lift).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

/** 某个标的绑定到哪几个城市（全景卡要按城市反查标的） */
export function citiesOfSymbol(symbolId) {
  return SYMBOL_CITY[symbolId] ?? [];
}
