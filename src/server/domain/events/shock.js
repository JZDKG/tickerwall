/* ================================================================== *
 * 冲击类型分类（供给 / 需求 / 无法判定）
 *
 * 为什么需要它：原油的「供给受阻」「需求增强」两条渠道如果没有冲击类型，
 * 只能永远显示「尚未确认」（方案 §7.2 要求这种诚实）。但只要有可核实的
 * 报道文字，就可以按**保守的规则**给出一个类型；判不出来就返回 null，
 * 绝不猜。
 *
 * 规则设计的三条纪律：
 *   1. 供给类词必须指向「产量 / 运输 / 产能」这类**数量约束**，
 *      不能因为标题里出现「原油」两个字就判供给；
 *   2. 需求类词必须指向「消费 / 开工 / 出行 / 补库」；
 *   3. 两类同时出现（例如「需求疲弱但 OPEC 减产」）→ null：
 *      这恰恰是最需要人判断的情形。
 *
 * 纯函数，不读时钟、不发请求、不依赖模型。
 * ================================================================== */

/** 供给侧：产量与运输的**数量约束** */
export const SUPPLY_TOKENS = [
  '减产', '限产', '停产', '中断', '断供', '供应中断', '供给中断', '产量下降',
  '关闭油田', '油田停产', '出口受阻', '出口禁令', '禁运', '制裁', '袭击',
  '无人机', '封锁', '海峡', '航道', '管道泄漏', '罢工', '飓风', '不可抗力',
  'opec+减产', 'opec 减产', '增产', '释放储备', '抛储',
];

/** 需求侧：消费与开工 */
export const DEMAND_TOKENS = [
  '需求复苏', '需求回暖', '需求强劲', '需求疲弱', '需求疲软', '需求下降',
  '开工率', '开工回升', '炼厂开工', '出行增加', '旺季', '补库', '去库',
  '库存下降', '库存增加', '进口增加', '进口下降', '订单增加', '订单减少',
  '航空煤油需求', '汽油消费', '柴油消费', '工业需求',
];

/**
 * 报道文字 → 冲击类型。
 *
 * @param {{title?:string, body?:string}} article
 * @returns {{shockType:'supply'|'demand'|null, evidence:string[], reason:string}}
 */
export function classifyShockType(article) {
  const text = `${article?.title ?? ''} ${article?.body ?? ''}`.toLowerCase();
  const supply = SUPPLY_TOKENS.filter((t) => text.includes(t.toLowerCase()));
  const demand = DEMAND_TOKENS.filter((t) => text.includes(t.toLowerCase()));

  if (supply.length && demand.length) {
    return {
      shockType: null,
      evidence: [...supply, ...demand],
      reason: 'BOTH_SIDES_MENTIONED',
    };
  }
  if (supply.length) return { shockType: 'supply', evidence: supply, reason: 'SUPPLY_TOKENS' };
  if (demand.length) return { shockType: 'demand', evidence: demand, reason: 'DEMAND_TOKENS' };
  return { shockType: null, evidence: [], reason: 'NO_SHOCK_TOKENS' };
}

/** 资产相关性词：只统计确实在讲这个品种的报道 */
export const ASSET_TOKENS = {
  oil: ['原油', '石油', '油价', 'opec', 'wti', '布伦特', 'brent', '炼厂', '汽油', '柴油', '能源', 'crude'],
  'gold-intl': ['黄金', '金价', 'xau', 'comex', 'gold'],
  us10y: ['美债', '国债', '收益率', 'treasury', 'yield'],
  dxy: ['美元', 'dollar', 'dxy', '美元指数'],
};

/**
 * 把事件列表转成解释层要的 eventEvidence。
 *
 * 只保留：有 eventId 与 revision、时间落在窗口内、且能判出冲击类型的条目。
 * 判不出类型的仍会以 `shockType: null` 返回吗？**不会** —— 解释层需要的是
 * 「已分类事件」；未分类的留在 unknowns 里由 nextChecks 提示。
 *
 * @param {Array<object>} events 归档或实时事件条目（{id|eventId, title, body, publishedAt}）
 * @param {{sinceMs:number, nowMs:number}} span
 */
export function toEventEvidence(events, { sinceMs, nowMs, assetId = null } = {}) {
  const out = [];
  const relevance = assetId ? ASSET_TOKENS[assetId] ?? null : null;
  for (const ev of events ?? []) {
    const id = ev.eventId ?? ev.id;
    if (!id) continue;
    const ts = Date.parse(String(ev.publishedAt ?? ev.time ?? ''));
    if (Number.isFinite(ts) && (ts < sinceMs || ts > nowMs)) continue;
    // 必须确实在讲这个品种：否则「某国罢工」会被当成原油供给冲击
    if (relevance) {
      const hay = `${ev.title ?? ''} ${ev.body ?? ''}`.toLowerCase();
      if (!relevance.some((t) => hay.includes(t.toLowerCase()))) continue;
    }
    const cls = classifyShockType(ev);
    if (!cls.shockType) continue;
    out.push({
      eventId: String(id),
      revision: Number(ev.revision ?? 1) || 1,
      shockType: cls.shockType,
      evidence: cls.evidence.slice(0, 3),
      at: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
    });
  }
  return out;
}
