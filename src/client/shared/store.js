/* ================================================================== *
 * 跨视图共享状态
 *
 * 为什么集中放：这些值原本是 app.js 顶层的模块级 let，被三处以上视图读写
 * （报价缓存被地图读、日历缓存被详情/事件/地图读、事件数据被事件与地图共用）。
 * 拆成模块后如果各留一份副本，就会出现「事件页拿到了新数据、地图还在用旧的」。
 * 保持单一对象 + 属性访问，语义与原来的模块级变量完全一致。
 *
 * 注意：ESM 的 import 绑定是只读的，所以不能用 `export let ttl` 再赋值；
 * 统一走 store.xxx 这个可变对象。
 * ================================================================== */

/**
 * 标的元数据表（列表顺序 + 名称/分组/小数位/类别）。
 *
 * P2-T1：与服务端 providers/instruments.js 的 INSTRUMENTS **逐项对齐**（23 个），
 * 首屏骨架不再从 11 行暴涨到 23 行造成 Layout Shift。group 用于「分组列表」
 * 密度模式：核心跨资产锚点一组，12 个区域股指按时段再分两组。
 */
const meta = (id, name, sub, unit, decimals, group) => ({ id, name, sub, unit, decimals, group });

export const PLACEHOLDER = [
  // ── 核心跨资产（免滚动就能看全宏观定价锚）────────────────────────────
  meta('gold-cn', '国内金价', '上海黄金交易所 Au99.99 现货', '元/克', 2, 'core'),
  meta('gold-intl', '国际金价', '伦敦金 XAU/USD 现货', '美元/盎司', 2, 'core'),
  meta('oil', '国际原油', 'WTI 纽约原油', '美元/桶', 2, 'core'),
  meta('sp500', '标普500', 'S&P 500 指数', '点', 2, 'core'),
  meta('ndx100', '纳斯达克100', 'NASDAQ 100 指数', '点', 2, 'core'),
  meta('sh000001', '上证指数', '上海证券交易所 000001', '点', 2, 'core'),
  meta('vix', '市场波动率', 'CBOE VIX 恐慌指数', '点', 2, 'core'),
  meta('dxy', '美元指数', 'ICE 美元指数（DINIW）', '点', 2, 'core'),
  meta('us10y', '美债10年期', '美国 10 年期国债收益率', '%', 3, 'core'),
  meta('usdcny', '离岸人民币', 'USD/CNH 离岸人民币', '元', 4, 'core'),
  meta('btc', '比特币', 'BTC/USDT · 24 小时', '美元', 2, 'core'),
  // ── 亚太 / 欧洲 / 美洲区域股指（12 项，按交易时段）──────────────────
  meta('hsi', '恒生指数', '香港恒生指数', '点', 2, 'asia'),
  meta('n225', '日经225', '东京日经225指数', '点', 2, 'asia'),
  meta('kospi', '韩国KOSPI', '首尔KOSPI指数', '点', 2, 'asia'),
  meta('twii', '台湾加权', '台湾加权股价指数', '点', 2, 'asia'),
  meta('asx', '澳洲ASX200', '悉尼ASX 200指数', '点', 2, 'asia'),
  meta('nifty', '印度NIFTY', '印度NIFTY 50指数', '点', 2, 'asia'),
  meta('dax', '德国DAX', '法兰克福DAX指数', '点', 2, 'europe'),
  meta('ftse', '英国富时100', '伦敦富时100指数', '点', 2, 'europe'),
  meta('cac', '法国CAC40', '巴黎CAC40指数', '点', 2, 'europe'),
  meta('dji', '道琼斯', '道琼斯工业平均指数', '点', 2, 'americas'),
  meta('tsx', '加拿大TSX', '多伦多S&P/TSX指数', '点', 2, 'americas'),
  meta('bvsp', '巴西Bovespa', '圣保罗Bovespa指数', '点', 2, 'americas'),
];


/** 列表行的 DOM 引用（id → { el, ... }），snapshot 复用，避免每轮重建 */
export const refs = new Map();

/** 共享可变状态：唯一一份，所有视图读写同一个对象 */
export const store = {
  ttl: 15000,          // 服务端下发的刷新间隔
  nextAt: 0,           // 下一次刷新的时间戳
  loading: false,      // 首屏/刷新进行中
  quotes: null,        // 最近一轮报价，供地图节点复用
  calendar: null,      // 财经日历缓存（详情页图上事件竖线 / 事件页 / 地图都用）
  events: null,        // 事件中心的数据 + UI 状态（地图复用同一份）
  // /api/macro 的载荷 + 拉取时刻（#/macro 与 #/map 共用）。
  // 这个接口要拉 13 个市场的全量日线，冷启动好几秒，所以地图只在首屏渲染完
  // 之后懒加载它，绝不阻塞首屏；5 分钟内复用同一份。
  macro: null,         // { data, at }
};
