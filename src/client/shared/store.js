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

/** 标的元数据表（列表顺序 + 名称/分组/小数位/类别） */
export const PLACEHOLDER = [
  { id: 'gold-cn', name: '国内金价', sub: '上海黄金交易所 Au99.99 现货', unit: '元/克', decimals: 2 },
  { id: 'gold-intl', name: '国际金价', sub: '伦敦金 XAU/USD 现货', unit: '美元/盎司', decimals: 2 },
  { id: 'oil', name: '国际原油', sub: 'WTI 纽约原油', unit: '美元/桶', decimals: 2 },
  { id: 'sp500', name: '标普500', sub: 'S&P 500 指数', unit: '点', decimals: 2 },
  { id: 'ndx100', name: '纳斯达克100', sub: 'NASDAQ 100 指数', unit: '点', decimals: 2 },
  { id: 'sh000001', name: '上证指数', sub: '上海证券交易所 000001', unit: '点', decimals: 2 },
  { id: 'vix', name: '市场波动率', sub: 'CBOE VIX 恐慌指数', unit: '点', decimals: 2 },
  { id: 'dxy', name: '美元指数', sub: 'ICE 美元指数（DINIW）', unit: '点', decimals: 2 },
  { id: 'us10y', name: '美债10年期', sub: '美国 10 年期国债收益率', unit: '%', decimals: 3 },
  { id: 'usdcny', name: '离岸人民币', sub: 'USD/CNH 离岸人民币', unit: '元', decimals: 4 },
  { id: 'btc', name: '比特币', sub: 'BTC/USDT · 24 小时', unit: '美元', decimals: 2 },
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
