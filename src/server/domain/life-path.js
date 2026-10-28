/* ================================================================== *
 * 与生活和行业的连接（产品 2.6）
 *
 * 「世界经济变化和我的出行、进口商品、工作行业有什么关系？」
 *
 * 这一层只做一件事：给出一条**有资料支持**的传导路径，并把三类东西分开放：
 *   1. 直接渠道（机制上说得通的那一段）；
 *   2. 当地政策或合同条件（决定这条渠道在这个地区强不强）；
 *   3. 可能的延迟与未知项（**必须写，不能省**）。
 *
 * 四条硬约束（方案 2.6 与 §4.3 的边界）：
 *   · 国际油价上涨**不能**直接写成「明天本地油价上涨」——
 *     中间隔着调价机制、税费、汇率、合同；
 *   · 没有本地数据时只展示机制与缺失项，**不补一个数字**；
 *   · 真实资金/贸易/运输流量需要独立数据，不能用价格变化替代；
 *   · 首版不要求任何个人财务信息（不碰收入、持仓、家庭结构）。
 * ================================================================== */

/** 场景。首版只做一个地区 × 一个场景，其余留空而不是凑。 */
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
 */
export function scenariosForAsset(assetId) {
  return LIFE_SCENARIOS.filter((s) => s.upstream === assetId);
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
 * 场景清单（给入口用）。只列「已有一个可展示场景」的地区，
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
