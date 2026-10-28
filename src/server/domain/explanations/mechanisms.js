/* ================================================================== *
 * 版本化经济机制库
 *
 * 一条机制回答的是「一般经济机制」，不是「今天为什么涨」。它必须带：
 *   · 类型（计价换算 / 机制假设 / 共同驱动 / 历史相关）
 *   · 方向与适用条件（什么时候这条渠道才成立）
 *   · 需要的中间变量（缺了就只能是「尚未确认」，不能默认成立）
 *   · 削弱 / 反例（哪些观测会推翻它）
 *   · 来源（可点开的机制依据，而不是模型记忆）
 *
 * 版本号进入解释快照：规则改了要升版本，历史解释才不会被新规则重新解释。
 *
 * 纯数据 + 纯查表函数，不依赖 HTTP / DOM / 数据库，也不含任何坐标或颜色。
 * ================================================================== */

export const MECHANISM_LIBRARY_VERSION = 'gold-v1';

/** 关系类型：决定图上怎么画、文案怎么说，绝不能混用 */
export const RELATION_TYPES = {
  'valuation-conversion': { label: '计价换算', causalDirection: true, arrow: true },
  mechanism: { label: '机制假设', causalDirection: true, arrow: true },
  'co-driver': { label: '共同驱动', causalDirection: false, arrow: false },
  'historical-correlation': { label: '历史相关', causalDirection: false, arrow: false },
};

/** 渠道状态：都**不**表示因果已证明 */
export const CHANNEL_STATUS = {
  consistent: { label: '观测一致', plain: '这次窗口内，观测方向与这个机制一致' },
  mixed: { label: '有相反证据', plain: '支持这一渠道的证据和反向证据同时存在' },
  not_supported: { label: '当前证据不支持', plain: '这次窗口内，观测方向与这个机制不一致' },
  untested: { label: '尚未确认', plain: '缺少必要条件，这次无法检验这个机制' },
};

const CHICAGO_FED = {
  title: '芝加哥联储：What Drives Gold Prices',
  url: 'https://www.chicagofed.org/publications/chicago-fed-letter/2021/464',
};
const NY_FED = {
  title: '纽约联储：区分石油市场的需求与供给冲击',
  url: 'https://libertystreeteconomics.newyorkfed.org/2013/03/a-new-approach-for-identifying-demand-and-supply-shocks-in-the-oil-market/',
};
const FRED_DFII10 = { title: 'FRED DFII10：10 年期通胀指数国债收益率', url: 'https://fred.stlouisfed.org/series/DFII10' };
const FRED_T10YIE = { title: 'FRED T10YIE：10 年期盈亏平衡通胀率', url: 'https://fred.stlouisfed.org/series/T10YIE' };

/**
 * @typedef {object} Mechanism
 * @property {string} id
 * @property {string} version
 * @property {'valuation-conversion'|'mechanism'|'co-driver'|'historical-correlation'} relationType
 * @property {string} from 驱动指标 id（共同驱动 / 历史相关也用 from/to 表达两端）
 * @property {string} to 目标指标 id
 * @property {-1|0|1} sign 预期方向；0 表示方向未定或不适用
 * @property {string} label 四字以内的渠道名
 * @property {string} plain 术语白话（首次出现时附一句）
 * @property {string} mechanism 机制说明（一般机制，不是本次归因）
 * @property {Array<{instrument:string, label:string, optional?:boolean}>} requires
 * @property {string[]} conditionCodes 成立所需的条件（由解释层翻译成文案）
 * @property {string[]} exclusions 削弱该解释的情况
 * @property {boolean} needsEventEvidence 是否必须有可核实的事件证据才能当作当期渠道
 * @property {string} horizon 只有存在依据时才写；未知就是 'unknown'
 * @property {object[]} sources
 * @property {string} reviewedAt
 */

/** @type {Mechanism[]} */
export const MECHANISMS = [
  {
    id: 'M-GOLD-REAL-YIELD',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'dfii10',
    to: 'gold-intl',
    sign: -1,
    label: '实际收益率',
    plain: '实际收益率：扣掉预期通胀之后衡量的债券回报。',
    mechanism:
      '黄金不付利息，实际收益率上升意味着持有无息资产的机会成本变高，可能给金价压力；实际收益率下降则相反。',
    requires: [{ instrument: 'dfii10', label: '10 年期实际收益率' }],
    conditionCodes: ['SAME_WINDOW', 'SIGNED_SERIES'],
    exclusions: [
      '只有名义收益率上涨、实际收益率没有同向变化',
      '所指事件发生时间晚于行情变化',
      '央行购金或避险需求压过机会成本渠道',
    ],
    needsEventEvidence: false,
    horizon: 'days-to-weeks',
    sources: [CHICAGO_FED, FRED_DFII10],
    reviewedAt: '2026-10-28',
  },
  {
    id: 'M-GOLD-NOMINAL-RATE',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'us10y',
    to: 'gold-intl',
    sign: -1,
    label: '名义利率',
    plain: '名义收益率：没有扣除通胀的债券到期收益率。',
    mechanism:
      '名义收益率上行常伴随折现率抬升，可能压制金价；但名义收益率同时包含通胀补偿，方向不一定等于实际收益率。',
    requires: [{ instrument: 'us10y', label: '10 年期名义收益率' }],
    conditionCodes: ['SAME_WINDOW', 'NEEDS_REAL_YIELD_CONFIRMATION'],
    exclusions: [
      '名义收益率上行完全由通胀预期推动，实际收益率持平或下行',
      '实际收益率数据缺失，无法区分是通胀补偿还是真实回报变化',
    ],
    needsEventEvidence: false,
    horizon: 'days-to-weeks',
    sources: [CHICAGO_FED, FRED_T10YIE],
  },
  {
    id: 'M-GOLD-USD',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'dxy',
    to: 'gold-intl',
    sign: -1,
    label: '美元计价',
    plain: '计价效应：黄金以美元报价，美元走强会抬高非美买家的本币成本。',
    mechanism:
      '美元走强抬高非美元买家购买以美元计价黄金的成本，也常伴随美元流动性收紧，可能压制金价。',
    requires: [{ instrument: 'dxy', label: '美元指数' }],
    conditionCodes: ['SAME_WINDOW'],
    exclusions: [
      '更强的购金或避险需求同时存在',
      '只看美元计价黄金，未比较其他币种报价，无法判断是本币因素还是美元因素',
    ],
    needsEventEvidence: false,
    horizon: 'days-to-weeks',
    sources: [CHICAGO_FED],
  },
  {
    id: 'M-GOLD-OIL-POLICY',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'oil',
    to: 'gold-intl',
    sign: 1,
    label: '油价→政策预期',
    plain: '这条是间接渠道：油价先影响通胀与政策预期，再影响金价。',
    mechanism:
      '供给受阻推高能源成本，若市场进一步预期利率保持高位、实际收益率上升，持有黄金相对更不划算，这条渠道可能给金价压力；同一事件也可能推高避险需求，两者方向相反。',
    requires: [
      { instrument: 'oil', label: '原油价格' },
      { instrument: 't10yie', label: '10 年期盈亏平衡通胀率' },
    ],
    conditionCodes: ['SAME_WINDOW', 'NEEDS_SHOCK_TYPE', 'NEEDS_INTERMEDIATE'],
    exclusions: [
      '原油上涨主要由需求增强推动，而不是供给受阻',
      '通胀预期与实际收益率这两个中间变量都没有同向变化',
      '缺少可核实的供给事件，只有价格方向',
    ],
    needsEventEvidence: true,
    horizon: 'unknown',
    sources: [NY_FED, FRED_T10YIE],
  },
  {
    id: 'M-GOLD-RISK',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'vix',
    to: 'gold-intl',
    sign: 1,
    label: '避险需求',
    plain: '避险需求：风险事件期间资金转向被认为更安全的资产。',
    mechanism:
      '风险资产剧烈动荡时，资金可能转向黄金对冲尾部风险；但极端流动性紧张时，机构会抛售黄金换取现金，方向可能反过来。',
    requires: [{ instrument: 'vix', label: 'VIX 波动率指数' }],
    conditionCodes: ['SAME_WINDOW', 'NEEDS_POSITION_EVIDENCE'],
    exclusions: [
      '流动性紧张导致无差别抛售换现金，金价与风险资产同跌',
      '只有 VIX 变化，没有任何持仓、流量或实物需求证据',
    ],
    needsEventEvidence: true,
    horizon: 'days',
    sources: [CHICAGO_FED],
  },
  {
    id: 'M-GOLD-CN-CONVERSION',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'valuation-conversion',
    from: 'gold-intl',
    to: 'gold-cn',
    sign: 1,
    label: '内外盘折算',
    plain: '计价换算：国际金按「÷31.1035 × 汇率」折算成人民币/克，再叠加境内外溢价。',
    mechanism:
      '国内金价由国际金价换算而来，同时受人民币汇率、境内外溢价和交易时段影响，因此不能只用国际金的涨跌方向推断国内金。',
    requires: [
      { instrument: 'gold-intl', label: '国际金价' },
      { instrument: 'usdcny', label: '美元兑人民币汇率', optional: true },
    ],
    conditionCodes: ['SAME_WINDOW', 'NEEDS_FX'],
    exclusions: [
      '人民币汇率大幅波动，折算方向与国际金相反',
      '境内外溢价（进口配额、季节性购金）明显走阔',
      '两个市场交易时段不重叠，当日变化不可比',
    ],
    needsEventEvidence: false,
    horizon: 'same-day',
    sources: [],
  },
  {
    id: 'M-GOLD-COMMON-DRIVER',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'co-driver',
    from: 'us10y',
    to: 'dxy',
    sign: 0,
    label: '共同驱动',
    plain: '共同驱动：两者被同一个上游因素推动，彼此之间不是单向因果。',
    mechanism:
      '美元与美债收益率常被同一组因素（美联储路径、通胀预期、避险资金）同时推动。同向或反向的观测不能直接读成「一个推动了另一个」。',
    requires: [
      { instrument: 'us10y', label: '10 年期名义收益率' },
      { instrument: 'dxy', label: '美元指数' },
    ],
    conditionCodes: ['SAME_WINDOW', 'NOT_CAUSAL'],
    exclusions: ['出现只影响其中一端的独立冲击（例如单边的财政或汇率事件）'],
    needsEventEvidence: false,
    horizon: 'unknown',
    sources: [],
  },
  {
    id: 'M-GOLD-HISTORICAL-OIL',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'historical-correlation',
    from: 'oil',
    to: 'gold-intl',
    sign: 0,
    label: '历史相关',
    plain: '历史相关：过去一段时间同向或反向变动的统计结果，不等于因果。',
    mechanism:
      '原油与黄金在历史上多次同向，但这既可能来自通胀渠道，也可能来自共同的风险偏好。统计相关本身不指定方向，也不给出当期原因。',
    requires: [{ instrument: 'oil', label: '原油价格' }],
    conditionCodes: ['SAME_WINDOW', 'STATISTICAL_ONLY'],
    exclusions: ['相关方向在近期窗口内不稳定，或样本数不足'],
    needsEventEvidence: false,
    horizon: 'unknown',
    sources: [NY_FED],
  },
];

const BY_ID = new Map(MECHANISMS.map((m) => [m.id, m]));

export function mechanismById(id) {
  return BY_ID.get(String(id ?? '')) ?? null;
}

/** 与某个目标资产有关的所有机制 */
export function mechanismsFor(assetId) {
  return MECHANISMS.filter((m) => m.to === assetId);
}

/** 某个资产作为「驱动端」参与的关系（例如黄金 → 沪金） */
export function mechanismsFrom(instrumentId) {
  return MECHANISMS.filter((m) => m.from === instrumentId);
}

/** 机制库版本（进入解释快照） */
export function mechanismLibraryVersion() {
  return MECHANISM_LIBRARY_VERSION;
}

/** 条件码 → 白话。界面第一次出现条件时用它，避免术语堆叠 */
export const CONDITION_TEXT = {
  SAME_WINDOW: '两个指标必须落在同一组共同观测日期上',
  SIGNED_SERIES: '利率序列允许零与负值，缺失不等于零',
  NEEDS_REAL_YIELD_CONFIRMATION: '需要实际收益率确认，名义收益率单独不够',
  NEEDS_SHOCK_TYPE: '需要先区分供给冲击与需求冲击',
  NEEDS_INTERMEDIATE: '需要中间变量（通胀补偿或实际收益率）确有变化',
  NEEDS_POSITION_EVIDENCE: '需要持仓、流量或实物需求证据，VIX 单独不够',
  NEEDS_FX: '需要同窗口汇率数据',
  NOT_CAUSAL: '这条关系不表达单向因果',
  STATISTICAL_ONLY: '这只是统计相关，不给方向也不给当期原因',
};
