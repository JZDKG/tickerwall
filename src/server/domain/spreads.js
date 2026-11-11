/* ================================================================== *
 * 通用合成比价 / 利差引擎（P2-T3）
 *
 * 四大宏观合成指标全部由同批次报价现算，零额外 HTTP：
 *   · 金银比   gold-intl / silver        贵金属内部风险偏好
 *   · 金油比   gold-intl / oil           通胀与衰退定价
 *   · 铜金比   copper / gold-intl ×1000  制造业景气与美债收益率先行锚
 *   · 中美利差 us10y − cn10y（百分点）  汇率 / 利差联动锚
 *
 * silver / copper / cn10y 不是 INSTRUMENTS 里的一级标的：优先从 items 取，
 * 再退到任一条目的 extras（附加报价 Chip），都取不到就诚实标 ok:false。
 * 任何一条腿无效都不输出 NaN，而是带 reason 的占位。
 * ================================================================== */

export const SYNTHETIC_DEFS = [
  {
    id: 'gold-silver-ratio',
    name: '金银比',
    unit: '倍',
    formula: '国际金价 / 白银',
    legs: ['gold-intl', 'silver'],
    compute: (a, b) => a / b,
  },
  {
    id: 'gold-oil-ratio',
    name: '金油比',
    unit: '桶/盎司',
    formula: '国际金价 / WTI 原油',
    legs: ['gold-intl', 'oil'],
    compute: (a, b) => a / b,
  },
  {
    id: 'copper-gold-ratio',
    name: '铜金比',
    unit: '×1000',
    formula: '铜价 / 国际金价 × 1000',
    legs: ['copper', 'gold-intl'],
    compute: (a, b) => (a / b) * 1000,
  },
  {
    id: 'us-cn-10y-spread',
    name: '中美利差',
    unit: '百分点',
    formula: '美债10Y − 中债10Y',
    legs: ['us10y', 'cn10y'],
    compute: (a, b) => a - b,
  },
];

function priceMap(items) {
  const byId = new Map();
  const valid = (it) => it?.ok !== false && Number.isFinite(it?.price);
  for (const it of Array.isArray(items) ? items : []) {
    if (valid(it)) byId.set(it.id, it.price);
    for (const ex of Array.isArray(it?.extras) ? it.extras : []) {
      if (valid(ex) && !byId.has(ex.id)) byId.set(ex.id, ex.price);
    }
  }
  return byId;
}

/** 每个定义都产出一条结果；坏数据只影响自己那一条 */
export function computeSynthetics(items) {
  const byId = priceMap(items);
  return SYNTHETIC_DEFS.map((def) => {
    const legs = def.legs.map((id) => byId.get(id));
    const base = { id: def.id, name: def.name, formula: def.formula, unit: def.unit };
    if (!legs.every((v) => Number.isFinite(v))) {
      return { ...base, ok: false, value: null, reason: '缺少有效报价腿' };
    }
    // 比率类分母必须 > 0（利率差值允许负，但两个腿仍须是有限数）
    const isRatio = def.id !== 'us-cn-10y-spread';
    if (isRatio && !(legs[1] > 0)) {
      return { ...base, ok: false, value: null, reason: '分母为零或负数' };
    }
    const value = def.compute(legs[0], legs[1]);
    if (!Number.isFinite(value)) {
      return { ...base, ok: false, value: null, reason: '计算结果无效' };
    }
    return { ...base, ok: true, value, reason: null };
  });
}
