/* ================================================================== *
 * 与生活和行业的连接（产品 2.6 / Phase 4 P4-T3）
 *
 * 「世界经济变化和我的出行、攒金、换汇、理财有什么关系？」
 *
 * 这一层只做一件事：给出一条**有资料支持**的传导路径，并把三类东西分开放：
 *   1. 直接渠道（机制上说得通的那一段）；
 *   2. 当地政策或合同条件（决定这条渠道在这个地区强不强）；
 *   3. 可能的延迟与未知项（**必须写，不能省**）。
 *
 * 四条硬约束（方案 2.6 与 §4.3 的边界）：
 *   · 国际价格变化**不能**直接写成「明天本地价格上涨」——
 *     中间隔着调价机制、税费、汇率、合同；
 *   · 没有本地数据时只展示机制与缺失项，**不补一个数字**；
 *   · 真实资金/贸易/运输流量需要独立数据，不能用价格变化替代；
 *   · 首版不要求任何个人财务信息（不碰收入、持仓、家庭结构）。
 *
 * Phase 4：从 1 个「油价」场景扩到 4 个高共鸣民生场景。fuel-cost 保持
 * 默认第一项，/api/life-path 不传 scenario 时行为 100% 向后兼容。
 * ================================================================== */

/** 场景。每一条链都按「上游 → 换算/政策 → 本地零售」排，最后必带缺口。 */
export const LIFE_SCENARIOS = [
  {
    id: 'fuel-cost',
    region: 'cn',
    title: '油价与出行成本',
    plain: '原油价格变化会不会传导到我的加油与出行开销',
    upstream: 'oil',
    /**
     * 链条每一步都标「依据类型」：
     *   mechanism = 机制上说得通（可解释）
     *   policy    = 取决于当地定价/税费规则
     *   contract  = 取决于合同或长期协议
     */
    steps: [
      { key: 'crude', label: '国际原油价格', basis: 'mechanism', note: '以美元计价的即期价格' },
      { key: 'fx', label: '人民币汇率', basis: 'mechanism', note: '换算成人民币成本的那一步' },
      { key: 'refine', label: '成品油调价', basis: 'policy', note: '按调价窗口与税费规则执行，不是实时跟随' },
      { key: 'pump', label: '加油站零售价', basis: 'policy', note: '含税费，且调价有滞后期' },
      { key: 'travel', label: '出行与物流成本', basis: 'contract', note: '机票、货运多按合同与期货锁定，传导更慢' },
    ],
    /** 已知的延迟与未知（这一段不许空） */
    gaps: [
      '国际油价到国内零售价之间有调价周期，具体幅度取决于当期规则',
      '出行成本还受票价策略、航线供需影响，不能只用油价解释',
      '本页没有当地零售价数据，因此不给出「会涨多少」的数字',
    ],
  },
  {
    id: 'gold-saving',
    region: 'cn',
    title: '金价与攒金成本',
    plain: '国际金价与汇率怎么走到金店克价和银行积存金',
    chain: ['gold-intl', 'usdcny', 'gold-cn'],
    upstream: 'gold-intl',
    steps: [
      { key: 'intl', label: '伦敦金现（美元/盎司）', basis: 'mechanism', note: '国际金价以美元计价，是境内外定价的共同起点' },
      { key: 'fx', label: '美元兑人民币汇率', basis: 'mechanism', note: '按 1 盎司 = 31.1035 克换算成人民币克价的那一步' },
      { key: 'premium', label: '沪金基准价与境内外溢价', basis: 'policy', note: '受进口配额、节假日购金与本地供需影响，会出现价差' },
      { key: 'retail', label: '品牌金店零售克价', basis: 'contract', note: '含工费、品牌溢价与渠道费用，各店报价口径不同' },
      { key: 'accumulation', label: '银行积存金 / 攒金成本', basis: 'contract', note: '按各行积存规则与买卖价差执行，不等于金店零售价' },
    ],
    gaps: [
      '本页没有品牌工费与银行积存买卖价差数据，因此不给具体克价',
      '境内外溢价在购金旺季或进口配额收紧时会扩大，传导不按固定比例',
      '国际金价上行不等于本地零售同日上行，中间有换算、溢价与报价滞后',
    ],
  },
  {
    id: 'fx-tuition',
    region: 'cn',
    title: '汇率与留学换汇成本',
    plain: '美债利差与美元指数怎么影响留学、海淘与出境购汇支出',
    chain: ['us10y', 'dxy', 'usdcny'],
    upstream: 'us10y',
    steps: [
      { key: 'rate', label: '美债 10Y 收益率与中美利差', basis: 'mechanism', note: '利差是跨境资金与汇率定价的重要参照' },
      { key: 'dxy', label: '美元指数', basis: 'mechanism', note: '美元相对一篮子货币的强弱，不等于对人民币双边汇率' },
      { key: 'cnh', label: '离岸 / 在岸人民币汇率', basis: 'policy', note: '受中间价、结售汇与跨境资金管理影响' },
      { key: 'purchase', label: '购汇人民币支出', basis: 'policy', note: '按银行现汇报价成交，含点差与手续规则' },
      { key: 'tuition', label: '学费 / 海淘账单', basis: 'contract', note: '账单金额与缴费时点由合同决定，汇率只影响换算那一步' },
    ],
    gaps: [
      '本页没有银行实时购汇报价，因此不给出需要多少人民币的数字',
      '学费与账单以外币计价、金额由合同锁定，不随汇率逐日重算',
      '利差到汇率的渠道在避险或政策干预时段可能明显减弱，方向不唯一',
    ],
  },
  {
    id: 'tech-valuation',
    region: 'cn',
    title: '美债利率与科技股波动',
    plain: '名义与实际利率怎么影响纳指估值和场内跨境 ETF 净值',
    chain: ['us10y', 'dfii10', 'ndx100', 'sp500'],
    upstream: 'us10y',
    steps: [
      { key: 'nominal', label: '美债 10Y 名义利率', basis: 'mechanism', note: '全球风险资产定价中常用的无风险利率参照' },
      { key: 'real', label: '10Y 实际利率（DFII10）', basis: 'mechanism', note: '剔除通胀补偿后的折现率，对长久期资产更贴近' },
      { key: 'discount', label: '远期现金流折现率', basis: 'mechanism', note: '成长股现金流更靠后，对折现率变化更敏感' },
      { key: 'valuation', label: '纳指 / 标普估值弹性', basis: 'mechanism', note: '利率只是分母端一条渠道，盈利预期同样在变' },
      { key: 'etf', label: '场内跨境 ETF 净值', basis: 'contract', note: '还叠加汇率、额度、溢价与跟踪误差，不等于指数本身' },
    ],
    gaps: [
      '本页没有跨境 ETF 的实时溢价与额度数据，因此不给出净值涨跌数字',
      '经济强劲或盈利爆发时，利率与股价可能同向，不能只按折现率推断',
      '利率渠道与盈利、风险偏好渠道同时作用，先后与强弱无法由本页判定',
    ],
  },
];

const byId = new Map(LIFE_SCENARIOS.map((s) => [s.id, s]));

export function scenarioOf(id) {
  return byId.get(id) ?? null;
}

/** 一步的「依据类型」措辞。到界面上就用这几个说法。 */
export const STEP_BASIS = {
  mechanism: '机制可解释',
  policy: '取决于当地规则',
  contract: '取决于合同/协议',
};

/**
 * 按上游资产找场景（哪些生活场景与这个资产有关）。
 * 只回「有关系」，不回「影响多大」—— 幅度需要本地数据，这里没有。
 * Phase 4：同一资产可能是多条链的上游或中间节点，全部列出。
 */
export function scenariosForAsset(assetId) {
  return LIFE_SCENARIOS.filter(
    (s) => s.upstream === assetId || (Array.isArray(s.chain) && s.chain.includes(assetId)),
  );
}

/**
 * 组装一条可读的路径。
 *
 * @param {{ id: string, upstream?: { changePct?: number, asOf?: string }|null }} input
 */
export function buildLifePath({ id, upstream = null } = {}) {
  const s = scenarioOf(id);
  if (!s) return { ok: false, reason: 'UNKNOWN_SCENARIO', steps: [], gaps: [] };

  const hasDir =
    upstream && Number.isFinite(Number(upstream.changePct)) && Number(upstream.changePct) !== 0;
  const dirWord = hasDir ? (Number(upstream.changePct) > 0 ? '上行' : '下行') : null;

  /**
   * 第一步的头条只说「上游发生了什么」，不说「所以你会怎样」。
   * 方向词只出现在这一步，后面的步骤一律是「取决于…」。
   */
  const headline = hasDir
    ? `${s.steps[0].label}本窗口${dirWord}`
    : `${s.steps[0].label}本窗口没有明显方向`;

  return {
    ok: true,
    id: s.id,
    title: s.title,
    plain: s.plain,
    headline,
    upstreamAsOf: upstream?.asOf ?? null,
    chain: [...(s.chain ?? [s.upstream])],
    steps: s.steps.map((st, i) => ({
      ...st,
      basisText: STEP_BASIS[st.basis] ?? '',
      /** 每一步都明确「不是实时跟随」，避免读者把整条链当成一个乘数 */
      lagNote: i === 0 ? null : '有滞后，且不按固定比例传导',
    })),
    gaps: [...s.gaps],
    /**
     * 结论段永远是这一句：本页只给机制，不给预测与幅度。
     * 把它放在数据里而不是硬编码在模板里，是为了让测试能钉住它。
     */
    disclaimer: '这一页只说明传导机制与缺口，不预测本地价格与幅度，也不构成任何建议。',
    /** 是否需要本地数据才能继续（首版恒为 true，因为没接本地价格源） */
    needsLocalData: true,
  };
}

/**
 * 场景清单（给入口 / 切换胶囊用）。只列「已有一个可展示场景」的地区，
 * 其余地区不出现在清单里 —— 空入口比没有入口更糟。
 */
export function listScenarios() {
  return LIFE_SCENARIOS.map((s) => ({
    id: s.id,
    region: s.region,
    title: s.title,
    plain: s.plain,
    upstream: s.upstream,
    stepCount: s.steps.length,
  }));
}

/** Phase 4：API 响应里附带的精简清单 [{ id, title }] */
export function availableScenarios() {
  return LIFE_SCENARIOS.map(({ id, title }) => ({ id, title }));
}
