/* ================================================================== *
 * 金融传导图谱 · 知识库（纯数据，零依赖，无 DOM）
 *
 * 这里只写「金融常识」：谁是因、谁是果、机理是什么、什么时候会失效。
 * 不含任何坐标、颜色、像素 —— 布局交给 flow-layouts.js，渲染交给 flow-canvas.js。
 * 原 public/macro-graph.js 里每个节点都钉死了 x/y、每条边都手调了 bend/t，
 * 那是上一代做法；这里只保留语义字段，坐标由算法算。
 *
 * 数据分工：
 *   定性 —— MACRO_TRANSMISSION_EDGES（18 条因果边，写死的金融常识）
 *   定量 —— /api/macro 的 matrix / recent.changes（实测相关与最新涨跌）
 * 两者交叉的地方就是 divergence-engine.js 的 evaluateEdgeReality()。
 * ================================================================== */

/** 画布逻辑尺寸（X6 里会在 FitView 时按容器缩放，不是硬约束） */
export const GRAPH_SIZE = { width: 1080, height: 700 };

export const POS = '#f5455c'; // 正向：暖红（与 --up 同色，但语义是「同向」不是「上涨」）
export const NEG = '#5b9cf8'; // 负向：冷蓝
export const DIV = '#f59e0b'; // 背离：琥珀
export const TONE_COLOR = { pos: POS, neg: NEG, div: DIV };
export const TONE_DASH = { pos: null, neg: '6 4', div: '2 4' };

/**
 * 关系类型（方案 §3.3 / §4.4）。
 *
 * 箭头只表达「有依据的机制方向」。共同驱动与历史相关不是单向因果，
 * 所以它们不画箭头、改用点线，并且在图例与机理卡里用文字说明 ——
 * 颜色必须有等价的文字/线型，不能只靠颜色区分含义。
 */
/**
 * 沙盘的冲击条件（方案 §5.4 / C2）。
 *
 * 「原油大涨」可以由完全不同的原因造成，同一涨价在不同条件下走的渠道不同。
 * 本项目的机制库只登记了条件，没有幅度与时间模型，所以这里**只做两件事**：
 *   1. 按条件筛选「本次有资格参与的边」，其余标为暂不考虑并给出原因；
 *   2. 用一句话说明这个条件要求什么证据。
 * 不产出概率、幅度或先后顺序。
 */
export const SHOCK_CONDITIONS = [
  { key: 'unknown', label: '原因未知', note: '原因未分类：只展示结构路径，不判断哪条渠道更强。' },
  { key: 'supply', label: '供给受阻', note: '产能或运输受阻导致供给减少：成本与通胀渠道有资格参与。' },
  { key: 'demand', label: '需求增强', note: '需求端走强：需要先有需求证据，通胀与避险渠道不自动生效。' },
];

/** 每个震源 + 条件下「有资格参与」的边；未列出的边在该条件下不参与 */
export const SHOCK_CONDITION_SETS = {
  oil: {
    unknown: { enabled: null, suppressed: {}, requires: [] },
    supply: {
      // E10（油→股）在供给冲击下方向明确（成本上冲），但这不代表「需求共振」，
      // 所以它参与传播、却在解释里必须写成成本冲击 —— 见 suppressed 里的说明。
      enabled: ['E02', 'E08', 'E09', 'E18', 'E05', 'E01', 'E15'],
      suppressed: {
        E10: '供给冲击下的股市下跌主要是成本冲击，不能当作「需求共振」的证据',
      },
      requires: ['EVENT_EVIDENCE', 'SHOCK_TYPE_CLASSIFIED'],
    },
    demand: {
      enabled: ['E10', 'E02', 'E18', 'E06', 'E17'],
      suppressed: {
        E08: '需求驱动的温和涨价通常不改变通胀预期，通胀渠道需要实际通胀证据',
        E09: '同上：缺少通胀证据时，利率跟随涨价不是必然结果',
      },
      requires: ['DEMAND_EVIDENCE'],
    },
  },
  dxy: {
    unknown: { enabled: null, suppressed: {}, requires: [] },
    supply: { enabled: null, suppressed: {}, requires: [] },
    demand: { enabled: null, suppressed: {}, requires: [] },
  },
};

/** 取某震源在某条件下的筛选结果；null 表示全部边参与 */
export function shockConditionSet(sourceId, conditionKey = 'unknown') {
  const sets = SHOCK_CONDITION_SETS[sourceId];
  if (!sets) return { enabled: null, suppressed: {}, requires: [], conditionKey: 'unknown' };
  const hit = sets[conditionKey] ?? sets.unknown;
  return { ...hit, conditionKey: sets[conditionKey] ? conditionKey : 'unknown' };
}

export const RELATION_TYPES = {
  mechanism: { label: '机制假设', arrow: true, dash: null, plain: '一条有机制依据的传导渠道，方向有条件' },
  'valuation-conversion': { label: '计价换算', arrow: true, dash: null, plain: '同一个标的换币种/单位后的定价关系' },
  'co-driver': { label: '共同驱动', arrow: false, dash: '2 5', plain: '两者被同一个上游推动，不是单向因果' },
  'historical-correlation': { label: '历史相关', arrow: false, dash: '1 6', plain: '统计上同向或反向，不指定方向也不给原因' },
};

/** 取边的关系类型（未标注的按机制假设处理） */
export function relationTypeOf(edge) {
  return RELATION_TYPES[edge?.relationType ?? 'mechanism'] ?? RELATION_TYPES.mechanism;
}

/* ------------------------------------------------------------------ *
 * 1. 生态位 / 层级
 *
 * tier 是「因果层级」，直接决定自动布局的行号：
 *   0 = 定价之锚（流动性总阀）  1 = 通胀与实体之源
 *   2 = 终极避险                3 = 权益与高 Beta
 * 老版本把 ②③ 摆成左右翼是手工调坐标的产物；这里改成四行下行流，
 * 结构由 tier 声明，行内左右顺序交给重心排序算法（flow-layouts.js）。
 *
 * 同源标的（WTI↔布伦特、国际金↔沪金、VIX↔VXN）在全局视图里合并成一张卡，
 * 主画布核心节点 10 个 —— 18 条边里 E16/E18 属于「簇内联动」，只在导图里画线，
 * 全局图用卡片头顶的锚点徽章表达，否则会出现两条几乎重合的平行短线。
 * ------------------------------------------------------------------ */

export const ZONE_META = {
  anchor: { label: '① 全球定价之锚 · 流动性总阀', short: '定价之锚', tone: 'anchor' },
  commodity: { label: '② 通胀与实体之源', short: '通胀实体', tone: 'commodity' },
  hedge: { label: '③ 终极避险 · 波动温度计', short: '终极避险', tone: 'hedge' },
  risk: { label: '④ 全球权益与高 Beta', short: '权益高Beta', tone: 'risk' },
};

/**
 * tier：因果层级（布局行号）
 * zone：生态位（用于卡片配色与分组带）
 * sub ：同源子标的 id（渲染成卡片底部小行）
 * w/h：卡片基准尺寸（有 sub 行要更高）
 */
export const MACRO_GRAPH_NODES = [
  { id: 'dxy', tier: 0, zone: 'anchor', w: 152, h: 78 },
  { id: 'us10y', tier: 0, zone: 'anchor', w: 152, h: 78 },
  { id: 'oil', tier: 1, zone: 'commodity', sub: 'brent', w: 152, h: 98 },
  { id: 'copper', tier: 1, zone: 'commodity', w: 152, h: 78 },
  { id: 'gold-intl', tier: 2, zone: 'hedge', sub: 'gold-cn', w: 152, h: 98 },
  { id: 'sh000001', tier: 3, zone: 'risk', w: 152, h: 78 },
  { id: 'sp500', tier: 3, zone: 'risk', w: 152, h: 78 },
  { id: 'ndx100', tier: 3, zone: 'risk', w: 152, h: 78 },
  { id: 'btc', tier: 3, zone: 'risk', w: 152, h: 78 },
  { id: 'vix', tier: 3, zone: 'risk', sub: 'vxn', w: 152, h: 98 },
];

export const NODE_BY_ID = new Map(MACRO_GRAPH_NODES.map((n) => [n.id, n]));

/** 单点导图允许聚焦的 13 个标的（10 张主卡 + 3 个同源子标的） */
export const FOCUS_PILLS = [
  ['gold-intl', '黄金'],
  ['oil', '原油'],
  ['dxy', '美元'],
  ['us10y', '美债10Y'],
  ['ndx100', '纳指'],
  ['sp500', '标普'],
  ['copper', '铜'],
  ['btc', 'BTC'],
  ['vix', 'VIX'],
  ['sh000001', '上证'],
  ['gold-cn', '沪金'],
  ['brent', '布伦特'],
  ['vxn', 'VXN'],
];

/** 沙盘可选震源 */
export const SHOCK_SOURCES = ['oil', 'dxy', 'us10y', 'vix', 'copper', 'ndx100'];

export const MODES = [
  ['compass', '🌐 全局罗盘'],
  ['mindmap', '🌿 单点思维导图'],
  ['sandbox', '⚡ 沙盘推演'],
];

/* ------------------------------------------------------------------ *
 * 2. 18 条核心因果传导边
 *
 * sign: +1 同向 / -1 反向；weight 1~3 只影响线宽与默认不透明度（纯视觉）。
 * 注意：这里**没有** bend / pill.t / pill.dy —— 连线路由由 X6 的 manhattan
 * 正交路由器在端口之间自动求折点，胶囊钉在路径弧长的固定比例上。
 * ------------------------------------------------------------------ */
export const MACRO_TRANSMISSION_EDGES = [
  {
    id: 'E01', from: 'dxy', to: 'gold-intl', sign: -1, weight: 3, label: '计价压制',
    mechanism: '国际黄金以美元计价。美元走强一方面抬高非美买家的本币成本，另一方面说明美元信用相对走强，两者共同压制金价。',
    divergence: '地缘危机 / 主权债务担忧：爆发战争或市场担忧美债信用时，资金同时涌入美元与黄金避险，出现罕见的「同涨」。',
  },
  {
    id: 'E02', from: 'dxy', to: 'oil', sign: -1, weight: 2, label: '计价效应',
    mechanism: '原油贸易以美元结算（石油美元）。美元升值直接削弱新兴市场与欧洲的原油进口购买力，压制以美元计价的油价。',
    divergence: '供给端强冲击：OPEC+ 大幅减产或中东航道受阻时，供给短缺压倒汇率计价，油价与美元同时走强。',
  },
  {
    id: 'E03', from: 'dxy', to: 'copper', sign: -1, weight: 2, label: '计价与流动性',
    mechanism: '美元走强往往伴随全球美元流动性收紧，抑制工业金属的投机需求与非美制造业的原料采购。',
    divergence: '中美制造业共振复苏：全球工业补库需求极强时，基本面拉动铜价无视美元走强。',
  },
  {
    id: 'E04', from: 'dxy', to: 'btc', sign: -1, weight: 2, label: '流动性虹吸',
    mechanism: '美元指数走强代表全球风险资金回流美元现金资产。高风险、高 Beta 的加密资产首当其冲失血。',
    divergence: '加密原生叙事 / ETF 资金流入：现货 ETF 大规模净流入或监管利好期间，BTC 可走出独立行情。',
  },
  {
    id: 'E05', from: 'us10y', to: 'gold-intl', sign: -1, weight: 3, label: '机会成本',
    mechanism: '黄金是零息资产，美债收益率就是持有黄金的直接机会成本。美债利率上行（尤其实际利率上行）对金价构成强压制。',
    divergence: '去美元化与央行购金：全球央行战略性增持黄金、或市场担忧财政赤字货币化时，金价经常顶着高美债利率创新高。',
  },
  {
    id: 'E06', from: 'us10y', to: 'ndx100', sign: -1, weight: 3, label: '估值折现',
    mechanism: '美债 10Y 是全球风险资产定价的「分母」。科技成长股远期现金流占比高（长久期），对利率上行极其敏感。',
    divergence: '经济强劲复苏 / AI 盈利爆发：利率温和上行源于经济繁荣、企业盈利（分子端）增速远超利率涨幅时，纳指可与利率同涨。',
  },
  {
    id: 'E07', from: 'us10y', to: 'dxy', sign: 1, weight: 3, label: '利差吸引',
    mechanism: '美债收益率上升扩大了美元对欧元、日元、人民币的利差优势，吸引全球套息与配置资金流入美元。',
    divergence: '美国财政可持续性危机：美债遭抛售（收益率飙升）若源于市场质疑财政纪律，美元反而可能随美债价格一同下跌（股债汇三杀）。',
  },
  {
    id: 'E08', from: 'oil', to: 'gold-intl', sign: 1, weight: 2, label: '通胀驱动',
    mechanism: '原油是「通胀之母」。油价上涨直接推升 CPI 与通胀预期，激发黄金作为硬通货的抗通胀保值需求。',
    divergence: '衰退型油价下跌 / 紧缩抢跑：衰退担忧升温时原油因需求坍塌暴跌，而黄金因避险与降息预期反而上涨（金油比飙升）。',
  },
  {
    id: 'E09', from: 'oil', to: 'us10y', sign: 1, weight: 2, label: '通胀与加息',
    mechanism: '油价大涨推升全面通胀预期，迫使美联储推迟降息甚至维持高利率；债券投资者要求更高的通胀补偿，推升美债收益率。',
    divergence: '地缘恐慌下的避险买债：油价暴涨若由突发战争引起，避险资金短期涌入美债，反而压低美债收益率。',
  },
  {
    id: 'E10', from: 'oil', to: 'sp500', sign: -1, weight: 1, label: '能源成本税',
    mechanism: '高油价相当于对全社会企业和居民征收「能源税」，挤压航空、物流、制造利润并削弱消费能力（能源板块除外）。',
    divergence: '需求驱动型温和上涨：经济复苏早期需求回暖带动油价与股市同步温和上涨，此时油价反映的是景气而非供给冲击。',
  },
  {
    id: 'E11', from: 'copper', to: 'sp500', sign: 1, weight: 2, label: '经济晴雨表',
    mechanism: '铜广泛用于电力、建筑、新能源与制造业，被称为「铜博士」。铜价走强验证全球实体需求扩张，利好企业盈利。',
    divergence: '供给侧矿端罢工 / 逼仓：铜价暴涨若纯由矿山停产或期货逼仓导致，并不代表实体需求好转。',
  },
  {
    id: 'E12', from: 'copper', to: 'sh000001', sign: 1, weight: 2, label: '中国需求映射',
    mechanism: '中国消耗全球约一半的精炼铜。地产基建与制造业景气度同时驱动铜价与 A 股周期 / 顺周期板块。',
    divergence: '国内纯流动性 / 题材行情：A 股由微盘股或科技主题驱动、而宏观总需求偏弱时，两者相关性明显减弱。',
  },
  {
    id: 'E13', from: 'ndx100', to: 'btc', sign: 1, weight: 3, label: '科技与流动性',
    mechanism: '两者同属全球美元流动性与风险偏好的最前沿晴雨表，机构投资者画像高度重叠，呈显著正相关。',
    divergence: '加密行业独立黑天鹅：交易所暴雷或专属监管事件会导致 BTC 脱离美股独立剧烈波动。',
  },
  {
    id: 'E14', from: 'sp500', to: 'vix', sign: -1, weight: 3, label: '恐慌期权对冲',
    mechanism: '标普 500 下跌时机构恐慌性抢购看跌期权（Put）做尾部保护，直接推升隐含波动率 VIX（实测相关性约 −0.75）。',
    divergence: '极少失效（结构性负相关）：仅在极端逼空行情中，可能出现股指暴涨而看涨期权隐含波动率短暂抬升。',
  },
  {
    id: 'E15', from: 'vix', to: 'gold-intl', sign: 1, weight: 2, label: '避险买盘',
    mechanism: 'VIX 飙升、全球风险资产剧烈动荡时，避险资金从股市撤出并配置黄金，以对冲尾部风险。',
    divergence: '流动性枯竭危机（Cash is King）：极端崩盘初期（如 2020 年 3 月熔断），机构为补交保证金无差别抛售黄金换现金，黄金随股市短暂同跌。',
  },
  {
    id: 'E16', from: 'gold-intl', to: 'gold-cn', sign: 1, weight: 3, label: '内外盘折算', cluster: true,
    relationType: 'valuation-conversion',
    mechanism: '沪金由伦敦金通过「÷ 31.1035 × 美元兑人民币汇率」传导定价，长周期周频相关性在 +0.72 以上。',
    divergence: '人民币汇率大幅波动 / 境内外溢价：人民币单日大幅波动，或国内春节购金旺季、进口配额收紧时，内外盘出现明显价差偏离。',
  },
  {
    id: 'E17', from: 'sp500', to: 'ndx100', sign: 1, weight: 3, label: '权重重叠',
    relationType: 'co-driver',
    mechanism: '纳指 100 的权重股（科技七巨头）同时占标普 500 近三成权重，两者被同一批美国宏观与企业盈利因素推动。这是共同驱动与成分重叠，不是「标普推动了纳指」。',
    divergence: '风格高低切换（价值 vs 成长）：利率急升引发科技股杀估值、资金轮动去能源 / 金融 / 道指时，纳指显著弱于标普。',
  },
  {
    id: 'E18', from: 'oil', to: 'brent', sign: 1, weight: 3, label: '全球原油双锚', cluster: true,
    relationType: 'valuation-conversion',
    mechanism: '同受全球原油供需与 OPEC+ 政策驱动（相关性 > +0.92）。WTI 偏重美国内陆供需，布伦特偏重欧洲与中东海运。',
    divergence: '美湾库欣交割库拥堵 / 地缘航运割裂：地缘冲突封锁红海或霍尔木兹海峡时，布伦特溢价会显著扩大。',
  },
];

export const EDGE_BY_ID = new Map(MACRO_TRANSMISSION_EDGES.map((e) => [e.id, e]));

/** 全局视图只画主干边：簇内联动（E16/E18）留到单点导图 */
export const CORE_EDGES = MACRO_TRANSMISSION_EDGES.filter((e) => !e.cluster);

/** 子标的 → 宿主卡（布伦特挂在原油卡里，沪金挂在黄金卡里，VXN 挂在 VIX 卡里） */
export const SUB_HOST = new Map(
  MACRO_GRAPH_NODES.filter((n) => n.sub).map((n) => [n.sub, n.id]),
);

/* ------------------------------------------------------------------ *
 * 3. 5 大经典宏观剧本
 *
 * edges  = 顺链条走、用高对比流光点亮
 * breaks = 该剧本里「被打破」的常规边（例如地缘危机下美元与黄金同涨），
 *          单独渲染成琥珀色，比单纯隐藏更有信息量。
 * ------------------------------------------------------------------ */
export const MACRO_PLAYBOOKS = [
  {
    id: 'dollar-tide',
    name: '① 美元潮汐',
    sub: '鹰派加息冲击',
    edges: ['E07', 'E06', 'E01', 'E02', 'E03', 'E04'],
    breaks: [],
    steps: [
      ['美联储收紧或通胀超预期', '10Y ↑'],
      ['利差吸引全球套息资金', '美元 ↑'],
      ['分母端折现率抬升 + 流动性收紧', '黄金 / 原油 / 铜 / BTC ↓'],
      ['长久期成长股杀估值', '纳指 ↓'],
    ],
    note: '「万物皆跌」型冲击：利率与美元同向走强，风险资产与大宗同时承压。',
  },
  {
    id: 'oil-spiral',
    name: '② 石油通胀螺旋',
    sub: '滞胀魅影',
    edges: ['E08', 'E09', 'E06', 'E10'],
    breaks: [],
    steps: [
      ['地缘减产或供给危机引爆油价', '原油 ↑'],
      ['通胀预期抬头，抗通胀买盘进场', '黄金 ↑（直接渠道）'],
      ['顽固通胀倒逼利率走高', '10Y ↑'],
      ['高估值科技股与消费股承压', '纳指 ↓ / 标普 ↓'],
    ],
    note: '黄金受两条相反渠道影响：通胀补偿让它受益，利率上行让它承压。这里只列出渠道，不推断先后时间。',
  },
  {
    id: 'geo-crisis',
    name: '③ 地缘危机',
    sub: '黄金与美元同向',
    edges: ['E14', 'E15', 'E09'],
    breaks: ['E01', 'E02'],
    steps: [
      ['战乱或重大地缘冲突爆发', '标普 ↓ → VIX ↑'],
      ['避险资金涌入黄金', '黄金 ↑'],
      ['同时抢购原油防断供、抢美元要流动性', '原油 ↑ / 美元 ↑'],
      ['平时「美元涨→黄金跌」的压制渠道这次没有占上风', '美元 ↑ 与 黄金 ↑ 同向'],
    ],
    note: '这条剧本的意义在于：它专门用来解释「观测方向与机制不同」。看到 E01 / E02 变琥珀色，就该切到这个剧本看看有没有相反渠道。',
  },
  {
    id: 'recession',
    name: '④ 衰退恐慌交易',
    sub: '铜油跌、债金涨',
    edges: ['E11', 'E14', 'E05'],
    breaks: ['E10'],
    steps: [
      ['非农 / 制造业数据暴雷', '铜 ↓ / 原油 ↓'],
      ['对实体需求最敏感的铜博士率先下跌', '标普 ↓'],
      ['押注央行大幅降息，美债收益率跳水', '10Y ↓'],
      ['持有成本下降 + 避险需求', '黄金 ↑（独立走强）'],
    ],
    note: '注意 E10「能源成本税」在这里失效：油价跌本该利多股市，但需求坍塌压倒成本利好 —— 所以标为打破。',
  },
  {
    id: 'risk-on',
    name: '⑤ 流动性狂欢',
    sub: 'Risk-On 降息交易',
    edges: ['E07', 'E06', 'E01', 'E02', 'E03', 'E04', 'E13', 'E14'],
    breaks: [],
    steps: [
      ['宽松周期开启', '10Y ↓'],
      ['利差优势收窄，美元回落', '美元 ↓'],
      ['廉价资金涌入高 Beta 与实物资产', 'BTC ↑ / 纳指 ↑'],
      ['计价压制反转 + 工业需求预期改善', '黄金 ↑ / 铜 ↑ / 原油 ↑'],
      ['波动率被压平', 'VIX ↓'],
    ],
    note: '与①完全镜像：利率与美元同步下行时，几乎所有风险资产与大宗同涨。',
  },
];

export const PLAYBOOK_BY_ID = new Map(MACRO_PLAYBOOKS.map((p) => [p.id, p]));

/* ------------------------------------------------------------------ *
 * 4. 文案小工具（无 DOM 依赖，SSR/Node 里也能跑）
 * ------------------------------------------------------------------ */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function signChar(sign) {
  return sign > 0 ? '+' : '−';
}

/** 边沿线型类别：背离优先于符号 */
export function edgeTone(edge, realityRow) {
  if (realityRow?.status === 'diverged') return 'div';
  return edge.sign > 0 ? 'pos' : 'neg';
}
