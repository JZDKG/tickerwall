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

// gold-v1：只有黄金。gold-v2：加入原油（含事件型供给/需求机制）。
// gold-v3：加入美债 10 年期与美元指数（收益率分解 + 利差/避险）。
// 版本号进快照，历史解释不会被新规则重新解释。
export const MECHANISM_LIBRARY_VERSION = 'gold-v3';

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
    /**
     * 事件前提：这条渠道讲的是「供给受阻推高能源成本」，
     * 所以支持它的报道必须是**供给减少**。需求增加同样能推高油价，
     * 但那是另一条故事，不能拿来支持这一条。
     */
    eventPremise: { shockType: 'supply', direction: 'decrease' },
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

  /* ---------------------------- 原油（C1） ---------------------------- */
  {
    id: 'M-OIL-USD',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'dxy',
    to: 'oil',
    sign: -1,
    label: '计价效应',
    plain: '计价效应：原油以美元报价，美元走强会抬高非美买家的采购成本。',
    mechanism:
      '美元走强意味着用其他货币买同一桶油更贵，需求可能因此收缩；但供给端冲击往往盖过计价效应，所以这条渠道的成立有前提。',
    requires: [{ instrument: 'dxy', label: '美元指数' }],
    conditionCodes: ['SAME_WINDOW'],
    exclusions: [
      '供给受阻主导价格，计价效应被供给冲击盖过',
      '美元与油价同时被同一组风险偏好推动（此时属于共同驱动，不是单向因果）',
    ],
    needsEventEvidence: false,
    horizon: 'days-to-weeks',
    sources: [NY_FED],
  },
  {
    id: 'M-OIL-BRENT-ANCHOR',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'valuation-conversion',
    from: 'brent',
    to: 'oil',
    sign: 1,
    label: '基准价差',
    plain: '计价换算：WTI 与布伦特是两个交割地、品质不同的基准，长期同向但存在价差。',
    mechanism:
      '两个基准共同反映全球供需，因此大体同向；但交割地瓶颈、航运成本与品质差异会让价差走阔，此时同向关系会暂时失效。',
    requires: [{ instrument: 'brent', label: '布伦特原油' }],
    conditionCodes: ['SAME_WINDOW'],
    exclusions: [
      '库欣交割地库存异常或航运受阻，价差主导了单边走势',
      '两个基准的交易时段不重叠，当日变化不可比',
    ],
    needsEventEvidence: false,
    horizon: 'same-day',
    sources: [NY_FED],
  },
  {
    id: 'M-OIL-RISK-APPETITE',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'vix',
    to: 'oil',
    sign: -1,
    label: '风险偏好',
    plain: '风险偏好：市场恐慌时资金撤离风险资产，原油常被归为风险资产一端。',
    mechanism:
      '风险资产被抛售时，原油作为顺周期资产常承压，波动率上升是这类情形的同步信号；但供给冲击也会同时推高油价与波动率，方向可能相反。',
    requires: [{ instrument: 'vix', label: 'VIX 波动率指数' }],
    conditionCodes: ['SAME_WINDOW', 'NEEDS_POSITION_EVIDENCE'],
    exclusions: [
      '供给冲击主导，油价与波动率同时上升',
      '只有波动率变化，没有持仓、裂解价差或库存证据',
    ],
    needsEventEvidence: false,
    horizon: 'days',
    sources: [NY_FED],
  },
  {
    id: 'M-OIL-SUPPLY-SHOCK',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'oil',
    to: 'oil',
    sign: 1,
    label: '供给受阻',
    plain: '供给冲击：产能、运输或政策导致供给减少，价格由供给端决定。',
    mechanism:
      '供给减少时，在需求不变的假设下价格上行。这条渠道需要**已分类的事件证据**：只知道涨价，无法区分是供给还是需求造成。',
    requires: [],
    eventOnly: true,
    shockType: 'supply',
    conditionCodes: ['NEEDS_EVENT_EVIDENCE', 'SHOCK_TYPE_CLASSIFIED'],
    exclusions: [
      '需求同时坍塌，价格可能不涨反跌',
      '产油国释放储备或联合增产，抵消了供给缺口',
      '事件发生时间晚于价格变化',
    ],
    needsEventEvidence: true,
    horizon: 'unknown',
    sources: [NY_FED],
  },
  {
    id: 'M-OIL-DEMAND-SHOCK',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'oil',
    to: 'oil',
    sign: 1,
    label: '需求增强',
    plain: '需求冲击：开工、出行或补库走强带动需求，价格由需求端决定。',
    mechanism:
      '需求走强时价格上行，但「需求驱动」与「供给驱动」的后续影响完全不同：前者通常伴随风险资产同向，后者常见股跌债跌。区分需要需求侧证据。',
    requires: [],
    eventOnly: true,
    shockType: 'demand',
    conditionCodes: ['NEEDS_EVENT_EVIDENCE', 'NEEDS_DEMAND_EVIDENCE'],
    exclusions: [
      '需求证据缺失，仅凭价格上涨无法归类',
      '去库存或进口配额变化造成的表观需求波动',
    ],
    needsEventEvidence: true,
    horizon: 'unknown',
    sources: [NY_FED],
  },
  {
    id: 'M-OIL-HISTORICAL-COPPER',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'historical-correlation',
    from: 'copper',
    to: 'oil',
    sign: 0,
    label: '历史相关',
    plain: '历史相关：铜与油常被同一组工业需求推动，统计同向不等于因果。',
    mechanism:
      '铜与原油都受全球工业周期影响，因此历史上多次同向；但两者各有独立的供给冲击（矿山事故 / 产油国政策），统计相关不给当期原因。',
    requires: [{ instrument: 'copper', label: '铜价' }],
    conditionCodes: ['SAME_WINDOW', 'STATISTICAL_ONLY'],
    exclusions: ['任一端出现独立的供给冲击，同向关系失效'],
    needsEventEvidence: false,
    horizon: 'unknown',
    sources: [NY_FED],
  },

  /* ------------------------ 美债 10 年期（C1） ------------------------ */
  {
    id: 'M-US10Y-REAL-PART',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'dfii10',
    to: 'us10y',
    sign: 1,
    label: '实际回报',
    plain: '名义收益率 ≈ 实际收益率 + 通胀补偿。实际回报上行会推高名义收益率。',
    mechanism:
      '名义收益率可以拆成实际回报与通胀补偿两部分。实际收益率上行（经济增长预期或政策偏紧）通常带动名义收益率同向上行。',
    requires: [{ instrument: 'dfii10', label: '10 年期实际收益率' }],
    conditionCodes: ['SAME_WINDOW', 'SIGNED_SERIES'],
    exclusions: [
      '通胀补偿同幅下行，抵消了实际回报的上行',
      '避险买盘压低名义收益率（危机时常见）',
    ],
    needsEventEvidence: false,
    horizon: 'days-to-weeks',
    sources: [FRED_DFII10],
  },
  {
    id: 'M-US10Y-BREAKEVEN',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 't10yie',
    to: 'us10y',
    sign: 1,
    label: '通胀补偿',
    plain: '通胀补偿（盈亏平衡通胀率）：市场对未来十年通胀的补偿要求。',
    mechanism:
      '通胀补偿上行意味着投资者要求更高的名义回报来覆盖预期通胀，因此通常推高名义收益率；但它不说明实际回报如何变化。',
    requires: [{ instrument: 't10yie', label: '10 年期盈亏平衡通胀率' }],
    conditionCodes: ['SAME_WINDOW', 'SIGNED_SERIES'],
    exclusions: [
      '通胀补偿上行同时实际收益率下行，名义收益率几乎不变',
      '流动性溢价（避险买债）压过通胀补偿',
    ],
    needsEventEvidence: false,
    horizon: 'days-to-weeks',
    sources: [FRED_T10YIE],
  },
  {
    id: 'M-US10Y-HISTORICAL-OIL',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'historical-correlation',
    from: 'oil',
    to: 'us10y',
    sign: 0,
    label: '历史相关',
    plain: '历史相关：油价与收益率历史上多次同向（通胀渠道或增长渠道）。',
    mechanism:
      '油价上行既可能推高通胀预期、也可能反映需求走强，两者都可能带动收益率；但避险行情下两者会反向。统计相关不给当期原因。',
    requires: [{ instrument: 'oil', label: '原油价格' }],
    conditionCodes: ['SAME_WINDOW', 'STATISTICAL_ONLY'],
    exclusions: ['避险主导时收益率与油价反向'],
    needsEventEvidence: false,
    horizon: 'unknown',
    sources: [NY_FED, FRED_T10YIE],
  },

  /* ------------------------ 美元指数（C1） ------------------------ */
  {
    id: 'M-DXY-RATE-DIFF',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'us10y',
    to: 'dxy',
    sign: 1,
    label: '利差吸引',
    plain: '利差：两地利率之差决定了套息与资金流向。',
    mechanism:
      '美国利率相对上行时，持有美元的利息回报变高，资金流入可能推高美元；但若上行源于财政风险担忧，美元反而可能走弱。',
    requires: [{ instrument: 'us10y', label: '10 年期名义收益率' }],
    conditionCodes: ['SAME_WINDOW', 'SIGNED_SERIES'],
    exclusions: [
      '收益率上行由信用风险（财政可持续性）推动，美元同时走弱',
      '其他经济体利率上行更快，利差其实在收窄',
    ],
    needsEventEvidence: false,
    horizon: 'days-to-weeks',
    sources: [FRED_DFII10],
  },
  {
    id: 'M-DXY-RISK',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'mechanism',
    from: 'vix',
    to: 'dxy',
    sign: 1,
    label: '避险买美元',
    plain: '避险：全球流动性紧张时，美元常被当作结算与避险货币买进。',
    mechanism:
      '市场恐慌时，机构需要美元结算与补充保证金，美元常被动走强；这是流动性需求，不代表美国经济更好。',
    requires: [{ instrument: 'vix', label: 'VIX 波动率指数' }],
    conditionCodes: ['SAME_WINDOW'],
    exclusions: [
      '美国自身是风险源（例如美债信用事件），美元与风险资产同跌',
      '美联储大幅宽松、美元流动性充裕时避险属性减弱',
    ],
    needsEventEvidence: false,
    horizon: 'days',
    sources: [FRED_DFII10],
  },
  {
    id: 'M-DXY-HISTORICAL-GOLD',
    version: MECHANISM_LIBRARY_VERSION,
    relationType: 'historical-correlation',
    from: 'gold-intl',
    to: 'dxy',
    sign: 0,
    label: '历史相关',
    plain: '历史相关：美元与黄金长期反向，但方向可能来自共同驱动。',
    mechanism:
      '黄金以美元计价，同时两者都对实际利率与避险情绪敏感，因此长期反向；共同驱动存在时，不能把同向变化读成「一个推动了另一个」。',
    requires: [{ instrument: 'gold-intl', label: '国际金价' }],
    conditionCodes: ['SAME_WINDOW', 'STATISTICAL_ONLY'],
    exclusions: ['地缘危机或央行购金主导时两者同向'],
    needsEventEvidence: false,
    horizon: 'unknown',
    sources: [CHICAGO_FED],
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
  NEEDS_EVENT_EVIDENCE: '需要可核实的事件与发布时间，只有价格方向不算',
  SHOCK_TYPE_CLASSIFIED: '事件需要先分类为供给受阻，才能走这条渠道',
  NEEDS_DEMAND_EVIDENCE: '需要需求侧证据（开工、出行、订单、库存）',
};
