/* ================================================================== *
 * 四维预警规则评估器（Phase 3 / P3-T2）
 *
 * 纯函数：不读写数据库、不碰时钟、不依赖任何服务。给它规则 + 一批上下文，
 * 还给它「哪些条件命中了」。冷却时间、持久化、SSE 广播都在 service 层，
 * 这样四维条件本身可以脱离数据库单测。
 *
 * 四个维度：
 *   price      目标标的 price 越过 threshold
 *   change_pct 目标标的当日涨跌幅（或绝对值 abs_pct）越过 threshold
 *   spread     合成比价/利差指标越过 threshold
 *   divergence 目标传导边（或任意核心边 target_id='any'）处于显著背离态
 * ================================================================== */

export const ALERT_KINDS = ['price', 'change_pct', 'spread', 'divergence'];
export const OPERATORS = ['>', '>=', '<', '<='];
export const DEFAULT_COOLDOWN_MS = 300_000;

/** 比较器：非法运算符一律 false，不让一条坏规则把整批评估带崩 */
const COMPARATORS = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
};

function finite(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 只接受有限数：字符串 '2800' 与 null 都不算有效观测 */
function observed(rule, ctx) {
  const quotes = Array.isArray(ctx?.quotes) ? ctx.quotes : [];
  const synthetics = Array.isArray(ctx?.synthetics) ? ctx.synthetics : [];
  const divergences = Array.isArray(ctx?.divergences) ? ctx.divergences : [];
  const findQuote = (id) => quotes.find((q) => q?.id === id && q?.ok !== false);

  if (rule.kind === 'price') {
    const q = findQuote(rule.target_id);
    return finite(q?.price) ? q.price : null;
  }
  if (rule.kind === 'change_pct') {
    const q = findQuote(rule.target_id);
    if (!finite(q?.changePct)) return null;
    return rule.mode === 'abs_pct' ? Math.abs(q.changePct) : q.changePct;
  }
  if (rule.kind === 'spread') {
    const s = synthetics.find((x) => x?.id === rule.target_id && x?.ok !== false);
    return finite(s?.value) ? s.value : null;
  }
  if (rule.kind === 'divergence') {
    const significant = (d) => Boolean(d) && (d.significant === true || d.divergent === true || finite(d.score) && d.score >= 0.7);
    const target = divergences.find((d) => d?.edge === rule.target_id || d?.id === rule.target_id || d?.pair === rule.target_id);
    if (rule.target_id === 'any') {
      return divergences.some(significant) ? 1 : null;
    }
    return significant(target) ? 1 : null;
  }
  return null;
}

/** 人类可读的触发文案：title 带规则名，message 带观测值与阈值 */
function describe(rule, value) {
  const verb = { price: '价格', change_pct: '涨跌幅', spread: '合成指标', divergence: '传导背离' }[rule.kind] ?? '指标';
  if (rule.kind === 'divergence') {
    return {
      title: `${rule.name || '传导背离预警'}`,
      message: `目标 ${rule.target_id === 'any' ? '核心传导边' : rule.target_id} 出现显著背离，请检查传导链假设。`,
    };
  }
  const unit = rule.kind === 'change_pct' ? '%' : '';
  return {
    title: `${rule.name || '预警'} · ${verb}越界`,
    message: `${rule.target_id} 当前 ${value}${unit}，${rule.operator} 阈值 ${rule.threshold}${unit}。`,
  };
}

/**
 * 评估一批规则。
 *
 * @param {object[]} rules 规则行（允许带 enabled / cooldown_ms / last_triggered_at）
 * @param {{quotes?:object[], synthetics?:object[], divergences?:object[]}} context
 * @param {{nowMs?:number}} opts
 * @returns {{ruleId:string, kind:string, targetId:string, title:string, message:string,
 *            observedValue:number, triggeredAt:number}[]}
 */
export function evaluateAlertRules(rules, context = {}, { nowMs = Date.now() } = {}) {
  const hits = [];
  const t = finite(nowMs) ? nowMs : Date.now();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || rule.enabled === 0 || rule.enabled === false) continue;
    if (!ALERT_KINDS.includes(rule.kind)) continue;
    const cmp = COMPARATORS[rule.operator];
    if (!cmp) continue;

    // 冷却：last_triggered_at 为空（从未触发）时直接放行
    const last = finite(rule.last_triggered_at) ? rule.last_triggered_at : null;
    const cooldown = finite(rule.cooldown_ms) ? rule.cooldown_ms : DEFAULT_COOLDOWN_MS;
    if (last != null && t - last < cooldown) continue;

    const value = observed(rule, context);
    if (value == null) continue;
    // divergence 的 threshold 无数值意义：观测到显著背离就是 1，>= 1 即命中
    const threshold = finite(rule.threshold) ? rule.threshold : 1;
    if (!cmp(value, threshold)) continue;

    const { title, message } = describe(rule, value);
    hits.push({
      ruleId: rule.id,
      kind: rule.kind,
      targetId: rule.target_id,
      title,
      message,
      observedValue: value,
      triggeredAt: t,
    });
  }
  return hits;
}
