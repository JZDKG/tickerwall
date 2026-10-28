/* ================================================================== *
 * 解释层指标定义（InstrumentDefinition）
 *
 * 为什么单独定义一份：/api/macro 的 MACRO_UNIVERSE 是「图表要画哪些曲线」，
 * 这里回答的是「解释能不能用这个序列」。两者要求不同：
 *   · 图表只关心有没有值；解释还要知道单位、频率、值域和可比窗口。
 *   · 价格与利率的计算口径不同：价格用对数收益率（要求 > 0），
 *     利率用百分点差（允许零与负），利差同理。
 * 把口径写成数据而不是散落在 if 里，测试和界面才能读到同一份定义。
 *
 * 纯数据 + 纯函数，不依赖 HTTP / DOM / 数据库。
 * 版本号进入解释快照的 versions 字段：改口径就要换版本，历史快照才不会被
 * 悄悄重新解释一遍。
 * ================================================================== */

/** 本文件的定义版本。任何 valueDomain / comparisonPolicy 变化都必须改这里 */
export const INSTRUMENT_DEFINITION_VERSION = 'inst-v1';

/**
 * valueDomain
 *   positive —— 价格 / 指数 / 波动率：零与负数视为缺失
 *   signed   —— 利率 / 利差 / 收益率：零与负数都是合法观测
 *
 * comparisonPolicy
 *   log-return    —— 价格：ln(P1/P0)，展示为百分比
 *   pp-difference —— 利率：P1−P0（百分点），展示换算成 bp
 *   level         —— 只报水平值与绝对差，不做比例
 *
 * comparisonUnit：'pct' | 'bp' | 'level'
 */
export const INSTRUMENT_DEFINITIONS = [
  {
    id: 'gold-intl',
    name: '国际金价',
    short: '黄金',
    kind: 'price',
    unit: '美元/盎司',
    currency: 'USD',
    frequency: 'daily',
    calendarId: 'globex-metals',
    valueDomain: 'positive',
    comparisonPolicy: 'log-return',
    comparisonUnit: 'pct',
    decimals: 2,
  },
  {
    id: 'gold-cn',
    name: '国内金价',
    short: '沪金',
    kind: 'price',
    unit: '元/克',
    currency: 'CNY',
    frequency: 'daily',
    calendarId: 'shfe',
    valueDomain: 'positive',
    comparisonPolicy: 'log-return',
    comparisonUnit: 'pct',
    decimals: 2,
  },
  {
    id: 'us10y',
    name: '美债 10 年期名义收益率',
    short: '10Y 名义',
    kind: 'rate',
    unit: '%',
    currency: 'USD',
    frequency: 'daily',
    calendarId: 'us-treasury',
    valueDomain: 'signed',
    comparisonPolicy: 'pp-difference',
    comparisonUnit: 'bp',
    decimals: 3,
  },
  {
    id: 'dfii10',
    name: '10 年期 TIPS 实际收益率',
    short: '10Y 实际',
    kind: 'rate',
    unit: '%',
    currency: 'USD',
    frequency: 'daily',
    calendarId: 'us-treasury',
    valueDomain: 'signed',
    comparisonPolicy: 'pp-difference',
    comparisonUnit: 'bp',
    decimals: 3,
    provider: { fred: 'DFII10' },
    note: 'FRED 日频，通常滞后一个交易日；不能当作分钟级实时信号。',
  },
  {
    id: 't10yie',
    name: '10 年期盈亏平衡通胀率',
    short: '10Y 通胀补偿',
    kind: 'rate',
    unit: '%',
    currency: 'USD',
    frequency: 'daily',
    calendarId: 'us-treasury',
    valueDomain: 'signed',
    comparisonPolicy: 'pp-difference',
    comparisonUnit: 'bp',
    decimals: 3,
    provider: { fred: 'T10YIE' },
    note: '由名义与通胀指数国债收益率形成的市场隐含通胀补偿，不是对未来通胀的确定预测。',
  },
  {
    id: 'dxy',
    name: '美元指数',
    short: '美元',
    kind: 'price',
    unit: '点',
    currency: 'USD',
    frequency: 'daily',
    calendarId: 'ice-us',
    valueDomain: 'positive',
    comparisonPolicy: 'log-return',
    comparisonUnit: 'pct',
    decimals: 2,
  },
  {
    id: 'oil',
    name: 'WTI 原油',
    short: '原油',
    kind: 'price',
    unit: '美元/桶',
    currency: 'USD',
    frequency: 'daily',
    calendarId: 'nymex',
    valueDomain: 'positive',
    comparisonPolicy: 'log-return',
    comparisonUnit: 'pct',
    decimals: 2,
  },
  {
    id: 'vix',
    name: 'VIX 波动率指数',
    short: 'VIX',
    kind: 'index',
    unit: '点',
    currency: 'USD',
    frequency: 'daily',
    calendarId: 'cboe',
    valueDomain: 'positive',
    comparisonPolicy: 'log-return',
    comparisonUnit: 'pct',
    decimals: 2,
    note: '市场对未来波动的预期指标，不能代替黄金买盘或持仓数据。',
  },
  {
    id: 'usdcny',
    name: '美元兑人民币',
    short: 'USD/CNY',
    kind: 'fx',
    unit: '元',
    currency: 'CNY',
    frequency: 'daily',
    calendarId: 'fx-onshore',
    valueDomain: 'positive',
    comparisonPolicy: 'log-return',
    comparisonUnit: 'pct',
    decimals: 4,
  },
];

const BY_ID = new Map(INSTRUMENT_DEFINITIONS.map((d) => [d.id, d]));

/** 取定义；未知 id 返回 null（调用方要显式处理，不要编造默认单位） */
export function instrumentDefinition(id) {
  return BY_ID.get(String(id ?? '')) ?? null;
}

/** 该指标是否允许零 / 负值 */
export function isSignedInstrument(id) {
  return instrumentDefinition(id)?.valueDomain === 'signed';
}

/** 变化量的展示单位：pct | bp | level */
export function comparisonUnitOf(id) {
  return instrumentDefinition(id)?.comparisonUnit ?? 'pct';
}

/** 已知的黄金场景驱动指标（解释层用来决定要取哪些序列） */
export const GOLD_DRIVERS = ['dfii10', 't10yie', 'us10y', 'dxy', 'oil', 'vix', 'usdcny'];
/** 原油的驱动集合（C1）。铜只用于「历史相关」，不参与方向判定 */
export const OIL_DRIVERS = ['brent', 'dxy', 'vix', 'copper'];

/**
 * 支持的资产与它需要的观测集合。
 * 首版只有黄金；原油 / 美元 / 美债属于阶段三，这里显式标 enabled=false，
 * 让接口可以返回「尚未开放」而不是假装算出一个解释。
 */
export const EXPLAINABLE_ASSETS = [
  {
    id: 'gold-intl',
    name: '国际金价',
    enabled: true,
    instruments: ['gold-intl', ...GOLD_DRIVERS],
    relatedAssets: ['gold-cn'],
  },
  {
    id: 'oil',
    name: 'WTI 原油',
    enabled: true,
    instruments: ['oil', ...OIL_DRIVERS],
    relatedAssets: ['brent'],
  },
  { id: 'dxy', name: '美元指数', enabled: false, instruments: ['dxy'], relatedAssets: [] },
  { id: 'us10y', name: '美债 10 年期', enabled: false, instruments: ['us10y'], relatedAssets: [] },
];

export function explainableAsset(id) {
  return EXPLAINABLE_ASSETS.find((a) => a.id === id) ?? null;
}
