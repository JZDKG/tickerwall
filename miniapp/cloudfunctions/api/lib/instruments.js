/* ================================================================== *
 * 标的注册表（云函数版）
 *
 * 与 web 端 src/server/providers/instruments.js 保持同一份 id / 名称 / 单位 /
 * 小数位 / 降级链，只把「适配器闭包」换成了「可序列化的源描述」——
 * 云函数里没有闭包注册表，源选择必须在取数时按描述执行。
 *
 * 加标的只改这个文件；重复 id 会被自检拦住（见文件末尾）。
 * ================================================================== */

/**
 * @typedef {object} Instrument
 * @property {string} id
 * @property {string} name
 * @property {string} sub
 * @property {string} unit
 * @property {number} decimals
 * @property {string} market  交易时段画像 key（见 market.js）
 * @property {'商品'|'股指'|'外汇'|'加密'} cat  小程序筛选分类
 * @property {boolean} [core] 是否进「核心」筛选
 * @property {string} [em]    东财 secid（报价 / 日K / 分时都用它）
 * @property {{code:string,kind:'spot'|'global'|'index'|'forex'|'futures'}} [sina]
 * @property {string} [tencent]      腾讯行情 code
 * @property {string} [binance]      Binance symbol
 * @property {string} [coinbase]     Coinbase pair
 * @property {string} [goldapi]      gold-api 代码
 * @property {string} [cboe]         CBOE 代码
 * @property {Array<{id:string,name:string,em?:string,sina?:object}>} [extras] 卡内附加报价
 */

/** 全球区域股指（顺序 = 交易时段从早到晚，和 web 端一致） */
const GLOBAL_INDEX = [
  { id: 'hsi', name: '恒生指数', sub: '香港恒生指数', market: 'hk-index', em: '100.HSI', tencent: 'hkHSI' },
  { id: 'n225', name: '日经225', sub: '东京日经225指数', market: 'jp-index', em: '100.N225' },
  { id: 'kospi', name: '韩国KOSPI', sub: '首尔KOSPI指数', market: 'kr-index', em: '100.KS11' },
  { id: 'twii', name: '台湾加权', sub: '台湾加权股价指数', market: 'tw-index', em: '100.TWII' },
  // 100.AXJO 只在报价接口上认，trends2/kline 都返回 rc=100；AS51 两边都通
  { id: 'asx', name: '澳洲ASX200', sub: '悉尼ASX 200指数', market: 'au-index', em: '100.AS51' },
  { id: 'nifty', name: '印度NIFTY', sub: '印度NIFTY 50指数', market: 'in-index', em: '100.NSEI' },
  { id: 'dax', name: '德国DAX', sub: '法兰克福DAX指数', market: 'eu-index', em: '100.GDAXI' },
  { id: 'ftse', name: '英国富时100', sub: '伦敦富时100指数', market: 'uk-index', em: '100.FTSE' },
  { id: 'cac', name: '法国CAC40', sub: '巴黎CAC40指数', market: 'eu-index', em: '100.FCHI' },
  { id: 'dji', name: '道琼斯', sub: '道琼斯工业平均指数', market: 'us-index', em: '100.DJIA', tencent: 'us.DJI' },
  // 同理：GSPTSE 只有报价，TSX 才有分时与 K 线
  { id: 'tsx', name: '加拿大TSX', sub: '多伦多S&P/TSX指数', market: 'ca-index', em: '100.TSX' },
  { id: 'bvsp', name: '巴西Bovespa', sub: '圣保罗Bovespa指数', market: 'br-index', em: '100.BVSP' },
];

/** @type {Instrument[]} */
const INSTRUMENTS = [
  /* ── 核心跨资产（前 11 项：免滚动就能看全宏观定价锚）────────────── */
  {
    id: 'gold-cn',
    name: '国内金价',
    sub: '上海黄金交易所 Au99.99 现货',
    unit: '元/克',
    decimals: 2,
    market: 'cn-spot',
    cat: '商品',
    core: true,
    sina: { code: 'gds_AU9999', kind: 'spot' },
    em: '118.AU9999',
  },
  {
    id: 'gold-intl',
    name: '国际金价',
    sub: '伦敦金 XAU/USD 现货',
    unit: '美元/盎司',
    decimals: 2,
    market: 'intl-futures',
    cat: '商品',
    core: true,
    sina: { code: 'hf_XAU', kind: 'spot' },
    em: '122.XAU',
    goldapi: 'XAU',
  },
  {
    id: 'oil',
    name: '国际原油',
    sub: 'WTI 纽约原油',
    unit: '美元/桶',
    decimals: 2,
    market: 'intl-futures',
    cat: '商品',
    core: true,
    sina: { code: 'hf_CL', kind: 'spot' },
    em: '102.CL00Y',
    extras: [{ id: 'brent', name: '布伦特', em: '112.B00Y', sina: { code: 'hf_OIL', kind: 'spot' } }],
  },
  {
    id: 'sp500',
    name: '标普500',
    sub: 'S&P 500 指数',
    unit: '点',
    decimals: 2,
    market: 'us-index',
    cat: '股指',
    core: true,
    sina: { code: 'gb_$inx', kind: 'global' },
    em: '100.SPX',
    tencent: 'usINX',
  },
  {
    id: 'ndx100',
    name: '纳斯达克100',
    sub: 'NASDAQ 100 指数',
    unit: '点',
    decimals: 2,
    market: 'us-index',
    cat: '股指',
    core: true,
    // 兜底绝不能用 gb_$ixic（纳斯达克综合指数，与 NDX 差 10% 以上）
    sina: { code: 'gb_$ndx', kind: 'global' },
    em: '100.NDX100',
    tencent: 'usNDX',
  },
  {
    id: 'sh000001',
    name: '上证指数',
    sub: '上海证券交易所 000001',
    unit: '点',
    decimals: 2,
    market: 'cn-index',
    cat: '股指',
    core: true,
    sina: { code: 'sh000001', kind: 'index' },
    em: '1.000001',
    tencent: 'sh000001',
  },
  {
    id: 'vix',
    name: '市场波动率',
    sub: 'CBOE VIX 恐慌指数 / VXN 纳指波动率',
    unit: '点',
    decimals: 2,
    market: 'us-index',
    cat: '股指',
    core: true,
    cboe: 'VIX',
    extras: [{ id: 'vxn', name: 'VXN', cboe: 'VXN' }],
  },
  {
    id: 'dxy',
    name: '美元指数',
    sub: 'ICE 美元指数（DINIW）',
    unit: '点',
    decimals: 2,
    market: 'fx',
    cat: '外汇',
    core: true,
    // DINIW 就是 ICE DXY 本身，不要用 FRED 的 DTWEXBGS（广义贸易加权，量级不同）
    sina: { code: 'DINIW', kind: 'forex' },
    em: '100.UDI',
  },
  {
    id: 'us10y',
    name: '美债10年期',
    sub: '美国 10 年期国债收益率',
    unit: '%',
    decimals: 3,
    market: 'us-rate',
    cat: '外汇',
    core: true,
    em: '171.US10Y',
  },
  {
    id: 'usdcny',
    name: '离岸人民币',
    sub: 'USD/CNH 离岸人民币',
    unit: '元',
    decimals: 4,
    market: 'fx',
    cat: '外汇',
    core: true,
    sina: { code: 'fx_susdcnh', kind: 'forex' },
  },
  {
    id: 'btc',
    name: '比特币',
    sub: 'BTC/USDT · 24 小时',
    unit: '美元',
    decimals: 2,
    market: 'crypto',
    cat: '加密',
    core: true,
    // 新浪的加密行情走 hq.sinajs.cn，和商品/外汇同一条批量请求 ——
    // Binance/OKX/Coinbase 在国内出口全部不可达（实测 5 家全部超时），
    // 所以主角是新浪，海外所只作为兜底保留。
    sina: { code: 'btc_btcbtcusd', kind: 'btc' },
    binance: 'BTCUSDT',
    coinbase: 'BTC-USD',
    okx: 'BTC-USDT',
    htx: 'btcusdt',
    kraken: 'XBTUSD',
  },

  /* ── 全球区域股指（12 项）────────────────────────────────────── */
  ...GLOBAL_INDEX.map((d) => ({
    id: d.id,
    name: d.name,
    sub: d.sub,
    unit: '点',
    decimals: 2,
    market: d.market,
    cat: '股指',
    em: d.em,
    tencent: d.tencent,
  })),
];

/** 只在详情页出现的标的（列表里作为 card 内 chip 存在） */
const DETAIL_ONLY = [
  {
    id: 'brent',
    name: '布伦特原油',
    sub: 'ICE 布伦特原油当月连续',
    unit: '美元/桶',
    decimals: 2,
    market: 'intl-futures',
    cat: '商品',
    sina: { code: 'hf_OIL', kind: 'spot' },
    em: '112.B00Y',
  },
  {
    id: 'vxn',
    name: 'VXN 纳指波动率',
    sub: 'CBOE 纳斯达克100 波动率指数',
    unit: '点',
    decimals: 2,
    market: 'us-index',
    cat: '股指',
    cboe: 'VXN',
  },
];

function findInstrument(id) {
  const key = String(id || '');
  return INSTRUMENTS.find((i) => i.id === key) || DETAIL_ONLY.find((i) => i.id === key) || null;
}

/** 自检：id 重复会让 Map 覆盖，静默丢一行数据，启动期就该炸 */
(function assertUniqueIds() {
  const seen = new Set();
  for (const inst of INSTRUMENTS.concat(DETAIL_ONLY)) {
    if (seen.has(inst.id)) throw new Error(`标的 id 重复: ${inst.id}`);
    seen.add(inst.id);
  }
})();

module.exports = { INSTRUMENTS, DETAIL_ONLY, findInstrument, GLOBAL_INDEX };
