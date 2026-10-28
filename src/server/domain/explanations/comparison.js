/* ================================================================== *
 * 内外金对照（产品 2.1「对照解读」）
 *
 * 用户的问题：**国际黄金跌了，国内黄金为什么显示上涨？**
 *
 * 这个问题的答案是会计恒等式，不是因果推断：
 *
 *   国内金价（元/克） = 国际金价（美元/盎司） ÷ 31.1035 × 美元兑人民币 × (1 + 境内外溢价)
 *
 * 于是「国内涨、国际跌」只可能来自三项之一：汇率、溢价，或者两边的时间窗根本没对齐。
 * 本模块把这三项算清楚，并且**明确区分**：
 *
 *   · 可以直接计算的：三项各自的贡献（对数分解，恒等，不含模型假设）
 *   · 不能直接计算的：溢价为什么变（进口配额、季节性购金…）—— 那需要证据，
 *     本模块只给出「溢价变动了多少」，不解释「为什么」
 *
 * 三条不许做的事（与方案 §4.1 的解释纪律一致）：
 *   1. 时间窗不可比时**不给**分解结果，只说清为什么不可比；
 *   2. 不做方向归因（「因为美元走强所以…」），只给数字与必要的口径说明；
 *   3. 不拿一个总分数掩盖对立证据：三项各自列出，亏损项照样显示。
 * ================================================================== */

/** 金衡盎司换算克 */
export const TROY_OUNCE_GRAMS = 31.1035;

/**
 * 窗口可比性判定。
 *
 * 「同屏红绿不同」很可能只是两边时点不同：上海金 15:30 收盘，伦敦金 24 小时连续，
 * 同一个自然日里两边的「最新一根」可能是不同时刻的。
 *
 * @param {{intl?:{at:string|null}, domestic?:{at:string|null}}} input
 * @returns {{comparable:boolean, reasons:string[], dayGap:number|null}}
 */
export function checkComparability({ intl, domestic } = {}) {
  const reasons = [];
  const intlMs = Date.parse(intl?.at ?? '');
  const domMs = Date.parse(domestic?.at ?? '');
  if (!Number.isFinite(intlMs) || !Number.isFinite(domMs)) {
    return { comparable: false, reasons: ['MISSING_OBSERVATION_TIME'], dayGap: null };
  }
  const dayGap = Math.abs(intlMs - domMs) / 86_400_000;
  if (dayGap > 1) reasons.push('OBSERVATION_DATE_MISMATCH');
  // 同一天但差超过 8 小时：盘中时点错位（跨时区常见），仍给出结果但标注
  else if (dayGap > 8 / 24) reasons.push('INTRADAY_TIME_OFFSET');
  return { comparable: !reasons.includes('OBSERVATION_DATE_MISMATCH'), reasons, dayGap: Number(dayGap.toFixed(3)) };
}

/** 把美元/盎司折成元/克 */
export function convertUsdPerOunceToCnyPerGram(usdPerOunce, usdCny) {
  if (!(usdPerOunce > 0) || !(usdCny > 0)) return null;
  return (usdPerOunce / TROY_OUNCE_GRAMS) * usdCny;
}

/**
 * 三项分解。
 *
 * 用对数是为了**可加**：ln(1+r_domestic) = ln(1+r_intl) + ln(1+r_fx) + ln(1+r_premium)。
 * 直接加减百分比会留下随幅度变大的交叉项，读者会以为「三项加起来不等于总数」是 bug。
 *
 * 溢价是**残差**，不是独立观测：它由「国内价 ÷ 折算价 − 1」定义。所以这里的
 * premium 项精确地吃掉了所有无法归因的部分 —— 必须明确说明这一点，否则
 * 读者会把「溢价变动 0.8%」当成一个新发现的原因。
 *
 * @param {{intlStart:number, intlEnd:number, fxStart:number, fxEnd:number, domesticStart:number, domesticEnd:number}} input
 */
export function decomposeSpread({ intlStart, intlEnd, fxStart, fxEnd, domesticStart, domesticEnd }) {
  const valid = [intlStart, intlEnd, fxStart, fxEnd, domesticStart, domesticEnd].every((v) => Number.isFinite(v) && v > 0);
  if (!valid) return { status: 'unavailable', reason: 'INSUFFICIENT_INPUTS' };

  const convertedStart = convertUsdPerOunceToCnyPerGram(intlStart, fxStart);
  const convertedEnd = convertUsdPerOunceToCnyPerGram(intlEnd, fxEnd);
  if (!convertedStart || !convertedEnd) return { status: 'unavailable', reason: 'INSUFFICIENT_INPUTS' };

  // 溢价按定义是残差：国内价相对折算价的偏离
  const premiumStart = domesticStart / convertedStart - 1;
  const premiumEnd = domesticEnd / convertedEnd - 1;

  const rIntl = intlEnd / intlStart - 1;
  const rFx = fxEnd / fxStart - 1;
  const rPremium = (1 + premiumEnd) / (1 + premiumStart) - 1;
  const rDomestic = domesticEnd / domesticStart - 1;

  // 对数贡献（可加）
  const lDomestic = Math.log(1 + rDomestic);
  const lIntl = Math.log(1 + rIntl);
  const lFx = Math.log(1 + rFx);
  const lPremium = Math.log(1 + rPremium);
  const residual = lDomestic - (lIntl + lFx + lPremium);

  return {
    status: 'ok',
    domesticChangePct: rDomestic * 100,
    convertedChangePct: (convertedEnd / convertedStart - 1) * 100,
    // 三项：国际金（美元计价）、汇率、溢价
    terms: [
      { key: 'intl', label: '国际金价（美元计价）', changePct: rIntl * 100, contributionPct: lIntl * 100 },
      { key: 'fx', label: '美元兑人民币', changePct: rFx * 100, contributionPct: lFx * 100 },
      { key: 'premium', label: '境内外溢价', changePct: rPremium * 100, contributionPct: lPremium * 100 },
    ],
    premiumPct: { start: premiumStart * 100, end: premiumEnd * 100 },
    convertedPerGram: { start: convertedStart, end: convertedEnd },
    // 对数分解的残差：恒等成立时应当是 0（浮点误差量级）
    residualPct: residual * 100,
  };
}

/**
 * 组装给界面与解释卡用的对照结果。
 *
 * @param {object} input
 * @param {{start:number,end:number,at:string|null}} input.intl  美元/盎司
 * @param {{start:number,end:number,at:string|null}} input.domestic 元/克
 * @param {{start:number,end:number,at:string|null}} input.fx 美元兑人民币
 * @param {string} [input.windowKey]
 */
export function buildGoldComparison({ intl, domestic, fx, windowKey = 'session' } = {}) {
  const comparability = checkComparability({ intl, domestic });
  if (!comparability.comparable) {
    return {
      ok: true,
      windowKey,
      comparable: false,
      reasons: comparability.reasons,
      reasonText: describeReason(comparability.reasons),
      // 不可比时明确不给分解：给出来就是在鼓励误读
      decomposition: null,
    };
  }
  if (!fx) {
    return {
      ok: true,
      windowKey,
      comparable: true,
      reasons: [...comparability.reasons, 'MISSING_FX'],
      reasonText: describeReason([...comparability.reasons, 'MISSING_FX']),
      decomposition: null,
    };
  }

  const decomposition = decomposeSpread({
    intlStart: intl.start,
    intlEnd: intl.end,
    fxStart: fx.start,
    fxEnd: fx.end,
    domesticStart: domestic.start,
    domesticEnd: domestic.end,
  });

  if (decomposition.status !== 'ok') {
    return {
      ok: true,
      windowKey,
      comparable: true,
      reasons: [decomposition.reason],
      reasonText: describeReason([decomposition.reason]),
      decomposition: null,
    };
  }

  return {
    ok: true,
    windowKey,
    comparable: comparability.reasons.length === 0,
    reasons: comparability.reasons,
    reasonText: describeReason(comparability.reasons),
    decomposition,
    /**
     * 口径说明必须一起返回：界面不能只显示三个百分比。
     * `premiumIsResidual` 这条尤其重要 —— 它是残差，不是独立发现。
     */
    notes: [
      '国内金价 = 国际金价 ÷ 31.1035 × 美元兑人民币 × (1 + 境内外溢价)。三项贡献按对数分解，可加。',
      '「境内外溢价」是残差：由国内价与折算价的偏离倒推，说明不了它为什么变。',
      '直接渠道之外还可能有时段错位、进口配额与季节性购金的影响；那些需要证据，不在这里下结论。',
    ],
    premiumIsResidual: true,
  };
}

const REASON_TEXT = {
  MISSING_OBSERVATION_TIME: '缺少观测时间：无法确认两边是同一时点',
  OBSERVATION_DATE_MISMATCH: '两边最新观测不是同一天：同屏红绿不同不代表真实背离',
  INTRADAY_TIME_OFFSET: '同一天但盘中时点不同：亚洲与欧美时段的价格本来就不同步',
  MISSING_FX: '缺少美元兑人民币汇率：无法完成折算',
  INSUFFICIENT_INPUTS: '输入不完整：三项里至少有一项缺少起止价格',
};

export function describeReason(reasons = []) {
  return reasons.map((r) => REASON_TEXT[r] ?? r);
}
