/* ================================================================== *
 * 标的注册表
 *
 * 从 services/quotes.service.js 拆出来（那边 1381 行混了六种职责）。
 *
 * **为什么放在 providers/ 而不是 domain/**：这里的每一项都内嵌了运行时求值的
 * 适配器调用（`sinaSpot('hf_XAU')`、`goldApi('XAU')`……），本质是「这个标的
 * 走哪些源、按什么顺序降级」的绑定配置。放进 domain 会让 domain 依赖
 * providers，方向颠倒；而 providers/instruments.js 与适配器同层，依赖向下，
 * 才不会和 domain 的纯数据常量（MOVE_SUSPECT_PCT）搅在一起。
 *
 * 加新标的只改这个文件：元数据 + sources 降级链 + seed 播种方式。
 * ================================================================== */

import {
  sinaSpot,
  sinaGlobal,
  sinaSimpleIndex,
  sinaIndexFull,
  sinaFutures,
  eastmoney,
  binance,
  coinbase,
  goldApi,
  sinaForexQuote,
  fredQuote,
  yahooQuote,
  cnbcQuote,
  tencentQuote,
  sinaInt,
} from './quotes.js';
import { cboeIndex } from './cboe.js';

export const basisProxy = (src) => ({ ...src, basisProxy: true });



export const GLOBAL_INDEX_DEFS = [
  // 亚太（最早开盘，北京时间 08:00–15:00）
  { id: 'hsi', name: '恒生指数', sub: '香港恒生指数', market: 'hk-index', yahoo: '^HSI', em: '100.HSI', tx: 'hkHSI' },
  { id: 'n225', name: '日经225', sub: '东京日经225指数', market: 'jp-index', cnbc: '.N225', yahoo: '^N225', em: '100.N225' },
  { id: 'kospi', name: '韩国KOSPI', sub: '首尔KOSPI指数', market: 'kr-index', yahoo: '^KS11', cnbc: '.KS11' },
  { id: 'twii', name: '台湾加权', sub: '台湾加权股价指数', market: 'tw-index', yahoo: '^TWII', cnbc: '.TWII' },
  { id: 'asx', name: '澳洲ASX200', sub: '悉尼ASX 200指数', market: 'au-index', yahoo: '^AXJO', cnbc: '.AXJO' },
  { id: 'nifty', name: '印度NIFTY', sub: '印度NIFTY 50指数', market: 'in-index', yahoo: '^NSEI', cnbc: '.NSEI' },
  // 欧洲（北京时间 15:00–23:30）
  { id: 'dax', name: '德国DAX', sub: '法兰克福DAX指数', market: 'eu-index', yahoo: '^GDAXI', cnbc: '.GDAXI' },
  { id: 'ftse', name: '英国富时100', sub: '伦敦富时100指数', market: 'uk-index', cnbc: '.FTSE', yahoo: '^FTSE', em: '100.FTSE' },
  { id: 'cac', name: '法国CAC40', sub: '巴黎CAC40指数', market: 'eu-index', yahoo: '^FCHI', cnbc: '.FCHI' },
  // 美洲（北京时间 21:30–04:00）
  { id: 'dji', name: '道琼斯', sub: '道琼斯工业平均指数', market: 'us-index', cnbc: '.DJI', yahoo: '^DJI', em: '100.DJIA' },
  { id: 'tsx', name: '加拿大TSX', sub: '多伦多S&P/TSX指数', market: 'ca-index', yahoo: '^GSPTSE', cnbc: '.GSPTSE' },
  { id: 'bvsp', name: '巴西Bovespa', sub: '圣保罗Bovespa指数', market: 'br-index', cnbc: '.BVSP', yahoo: '^BVSP' },
];

export const INSTRUMENTS = [
  /* ── 核心跨资产（前 11 项：免滚动就能看全宏观定价锚）─────────────────
     顺序按「商品 → 核心股指/波动率 → 定价锚与加密」，
     12 个区域股指沉到后面，避免首屏第一眼被巴西、澳洲这类边缘指数占满。   */

  {
    id: 'gold-cn',
    market: 'cn-spot',
    em: '118.AU9999',
    name: '国内金价',
    sub: '上海黄金交易所 Au99.99 现货',
    unit: '元/克',
    decimals: 2,
    sources: [sinaSpot('gds_AU9999'), sinaSpot('gds_AUTD'), basisProxy(sinaFutures('nf_AU0'))],
    seed: { kind: 'em', secid: '118.AU9999' },
  },
  {
    id: 'gold-intl',
    market: 'intl-futures',
    em: '122.XAU',
    sinaFutures: 'XAU',
    name: '国际金价',
    sub: '伦敦金 XAU/USD 现货',
    unit: '美元/盎司',
    decimals: 2,
    sources: [sinaSpot('hf_XAU'), basisProxy(sinaSpot('hf_GC')), goldApi('XAU')],
    seed: [
      { kind: 'em', secid: '101.GC00Y', note: '走势参考 COMEX 黄金期货' },
      { kind: 'yahoo', symbol: 'GC=F', note: '走势参考 COMEX 黄金期货' },
    ],
  },
  {
    id: 'oil',
    market: 'intl-futures',
    em: '102.CL00Y',
    sinaFutures: 'CL',
    fred: 'DCOILWTICO',
    name: '国际原油',
    sub: 'WTI 纽约原油',
    unit: '美元/桶',
    decimals: 2,
    sources: [sinaSpot('hf_CL'), eastmoney('102.CL00Y')],
    extras: [
      {
        id: 'brent',
        name: '布伦特',
        sources: [sinaSpot('hf_OIL'), eastmoney('112.B00Y')],
      },
    ],
    seed: [{ kind: 'em', secid: '102.CL00Y' }, { kind: 'yahoo', symbol: 'CL=F' }],
  },
  {
    id: 'sp500',
    market: 'us-index',
    em: '100.SPX',
    yahoo: '^GSPC',
    fred: 'SP500',
    name: '标普500',
    sub: 'S&P 500 指数',
    unit: '点',
    decimals: 2,
    sources: [sinaGlobal('gb_$inx'), yahooQuote('^GSPC'), eastmoney('100.SPX')],
    seed: [{ kind: 'em', secid: '100.SPX' }, { kind: 'yahoo', symbol: '^GSPC' }],
  },
  {
    id: 'ndx100',
    market: 'us-index',
    em: '100.NDX100',
    sinaUs: '.NDX',
    yahoo: '^NDX',
    tx: 'usNDX',
    nasdaq: 'NDX',
    name: '纳斯达克100',
    sub: 'NASDAQ 100 指数',
    unit: '点',
    decimals: 2,
    // 兜底不能用 gb_$ixic —— 那是纳斯达克综合指数，实测 25,955 点，
    // 而 NDX100 是 28,957 点，差 3,002 点（11.6%）。主源一超时就会跳崖，
    // 而且这个跳变会被 pushHistory 写进分时环形缓冲，留下永久断崖。
    sources: [sinaGlobal('gb_$ndx'), tencentQuote('usNDX'), yahooQuote('^NDX'), eastmoney('100.NDX100')],
    seed: [{ kind: 'em', secid: '100.NDX100' }, { kind: 'yahoo', symbol: '^NDX' }],
  },
  {
    id: 'sh000001',
    market: 'cn-index',
    em: '1.000001',
    tx: 'sh000001',
    name: '上证指数',
    sub: '上海证券交易所 000001',
    unit: '点',
    decimals: 2,
    sources: [sinaIndexFull('sh000001'), sinaSimpleIndex('s_sh000001'), eastmoney('1.000001')],
    seed: { kind: 'em', secid: '1.000001' },
  },
  {
    id: 'vix',
    market: 'us-index',
    cboe: 'VIX',
    name: '市场波动率',
    sub: 'CBOE VIX 恐慌指数 / VXN 纳指波动率',
    unit: '点',
    decimals: 2,
    sources: [cboeIndex('VIX')],
    extras: [{ id: 'vxn', name: 'VXN', sources: [cboeIndex('VXN')] }],
  },
  {
    // 2026-10 新增：美元指数是黄金/原油/新兴市场的第一定价锚，首屏必须有
    id: 'dxy',
    market: 'fx',
    em: '100.UDI',
    sinaForex: 'DINIW',
    name: '美元指数',
    sub: 'ICE 美元指数（DINIW）',
    unit: '点',
    decimals: 2,
    // DINIW 就是 ICE DXY 本身（末值约 101.8），不要拿 FRED 的 DTWEXBGS 顶替 ——
    // 那是广义贸易加权指数（约 121，含人民币/比索等 26 个经济体），两个不同的东西
    sources: [sinaForexQuote('DINIW'), eastmoney('100.UDI')],
  },
  {
    id: 'us10y',
    market: 'us-rate',
    em: '171.US10Y',
    fred: 'DGS10',
    name: '美债10年期',
    sub: '美国 10 年期国债收益率',
    unit: '%',
    decimals: 3,
    kind: 'rate',
    // 兜底链：CNBC 批量（零额外 HTTP）→ 东财 → 读库的 FRED DGS10
    sources: [cnbcQuote('US10Y'), eastmoney('171.US10Y'), fredQuote('DGS10', 'us10y')],
  },
  {
    id: 'usdcny',
    market: 'fx',
    fred: 'DEXCHUS',
    name: '离岸人民币',
    sub: 'USD/CNH 离岸人民币',
    unit: '元',
    decimals: 4,
    sources: [sinaForexQuote('fx_susdcnh'), sinaForexQuote('fx_susdcny'), fredQuote('DEXCHUS', 'usdcny')],
  },
  {
    id: 'btc',
    market: 'crypto',
    binanceSymbol: 'BTCUSDT',
    name: '比特币',
    sub: 'BTC/USDT · 24 小时',
    unit: '美元',
    decimals: 2,
    sources: [binance('api.binance.com'), binance('data-api.binance.vision'), coinbase('BTC-USD')],
    seed: { kind: 'binance', symbol: 'BTCUSDT', interval: '5m' },
  },

  /* ── 全球区域股指（12 项，按交易时段从早到晚）──────────────────── */
  ...GLOBAL_INDEX_DEFS.map((d) => ({
    id: d.id,
    market: d.market,
    tx: d.tx ?? null,
    name: d.name,
    sub: d.sub,
    unit: '点',
    decimals: 2,
    sources: [
      ...(d.cnbc ? [cnbcQuote(d.cnbc)] : []),
      ...(d.em ? [eastmoney(d.em)] : []),
      // 腾讯行情：hkHSI 这类只有它有活源。此前 tx 仅作为元数据暴露，从未参与
      // sources 组装，等于配了却不用 —— 恒生一旦东财断连就只剩 yahoo 一条腿。
      ...(d.tx ? [tencentQuote(d.tx)] : []),
      ...(d.sina ? [sinaInt(d.sina)] : []),
      yahooQuote(d.yahoo),
    ],
  })),
];



export const DETAIL_ONLY_INSTRUMENTS = [
  {
    id: 'brent',
    market: 'intl-futures',
    sinaFutures: 'OIL',
    name: '布伦特原油',
    sub: 'ICE 布伦特原油当月连续',
    unit: '美元/桶',
    decimals: 2,
    em: '112.B00Y',
    sources: [sinaSpot('hf_OIL'), eastmoney('112.B00Y')],
  },
  {
    id: 'vxn',
    market: 'us-index',
    cboe: 'VXN',
    name: 'VXN 纳指波动率',
    sub: 'CBOE 纳斯达克100 波动率指数',
    unit: '点',
    decimals: 2,
    sources: [cboeIndex('VXN')],
  },
];

export function findInstrument(id) {
  return INSTRUMENTS.find((i) => i.id === id) ?? DETAIL_ONLY_INSTRUMENTS.find((i) => i.id === id) ?? null;
}