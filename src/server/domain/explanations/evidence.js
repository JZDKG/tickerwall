/* ================================================================== *
 * 证据匹配：把「机制」和「这次窗口的观测」对上
 *
 * 每个候选项的输出只有四种状态，**都不代表因果被证明**：
 *   consistent    观测方向与机制一致
 *   not_supported 观测方向与机制不一致
 *   untested      缺必要条件（中间变量、事件证据、共同窗口），无法检验
 *   mixed         支持与反向证据同时存在（在 compose 层汇总时判定）
 *
 * 三条硬约束：
 *   1. 两端变化必须在同一组共同日期上算，不能各取最新值；
 *   2. 利率允许零与负，价格要求为正；缺失不是零；
 *   3. 事件引用用 { eventId, revision }，同一原始报道的转载不重复计证据。
 *
 * 纯函数：观测、事件、时间都由调用方注入。
 * ================================================================== */

import { changeBetween, computeChange, presentChange, alignCommon, windowSpec } from './alignment.js';
import { CHANNEL_STATUS } from './mechanisms.js';

/** 稳定的观测标识：同一来源 + 指标 + 观测期 = 同一 logicalKey */
export function observationIdOf(instrumentId, date) {
  return `${instrumentId}@${date}`;
}

/** 变化是否小到无法判断方向 —— 阈值按单位区分，避免把 0.001bp 当成「上行」 */
export function isMaterialChange(change, minAbs) {
  if (change == null) return false;
  const shown = presentChange(change);
  if (!shown) return false;
  const threshold = minAbs ?? (shown.unit === 'bp' ? 0.5 : shown.unit === 'pct' ? 0.05 : 0);
  return Math.abs(shown.value) >= threshold;
}

function evidenceEntry({ role, instrumentId, definition, change, note }) {
  const shown = presentChange(change);
  return {
    role,
    instrumentId,
    instrumentLabel: definition?.short ?? instrumentId,
    unit: definition?.unit ?? null,
    window: { start: change?.start ?? null, end: change?.end ?? null },
    level: { from: change?.from ?? null, to: change?.to ?? null },
    change: shown ? { value: Number(shown.value.toFixed(6)), unit: shown.unit } : null,
    observationIds: change ? [observationIdOf(instrumentId, change.start), observationIdOf(instrumentId, change.end)] : [],
    note: note ?? null,
  };
}

/**
 * 评估一条机制在本窗口的观测状态。
 *
 * @param {object} mechanism
 * @param {Map<string, {series:{dates:string[],values:number[]}, definition:object, quality?:object}>} observations
 * @param {{ windowKey: string, eventEvidence?: Array<{eventId:string, revision:number, action?:string, shockType?:string}> }} opts
 */
export function evaluateMechanism(mechanism, observations, opts = {}) {
  const windowKey = opts.windowKey ?? 'session';
  const spec = windowSpec(windowKey) ?? windowSpec('session');
  const observationsCount = spec.observations;
  const events = Array.isArray(opts.eventEvidence) ? opts.eventEvidence : [];

  const base = {
    mechanismId: mechanism.id,
    mechanismVersion: mechanism.version,
    relationType: mechanism.relationType,
    from: mechanism.from,
    to: mechanism.to,
    sign: mechanism.sign,
    label: mechanism.label,
    plain: mechanism.plain ?? null,
    mechanism: mechanism.mechanism,
    conditionCodes: mechanism.conditionCodes ?? [],
    exclusions: mechanism.exclusions ?? [],
    horizon: mechanism.horizon ?? 'unknown',
    sources: mechanism.sources ?? [],
    status: 'untested',
    statusLabel: CHANNEL_STATUS.untested.label,
    statusPlain: CHANNEL_STATUS.untested.plain,
    reasons: [],
    missing: [],
    evidence: [],
    eventRefs: [],
    window: { key: windowKey, start: null, end: null, observations: 0 },
  };

  // 1) 必要条件先查：缺中间变量就不是「没证据」，而是「无法检验」
  const missing = [];
  for (const req of mechanism.requires ?? []) {
    const obs = observations.get(req.instrument);
    if (!obs || !obs.series?.dates?.length) {
      if (!req.optional) missing.push({ instrumentId: req.instrument, label: req.label, code: 'MISSING_INSTRUMENT' });
      else missing.push({ instrumentId: req.instrument, label: req.label, code: 'MISSING_OPTIONAL_INSTRUMENT' });
    }
  }
  const blocking = missing.filter((m) => m.code === 'MISSING_INSTRUMENT');
  if (blocking.length) {
    return {
      ...base,
      missing,
      reasons: blocking.map((m) => `MISSING_INSTRUMENT:${m.instrumentId}`),
    };
  }
  if (mechanism.needsEventEvidence && !events.length) {
    return {
      ...base,
      missing,
      reasons: ['NO_EVENT_EVIDENCE'],
      eventRefs: [],
    };
  }

  /**
   * 价格型但「需要事件才能检验」的机制（例如油价→政策预期）要引用什么事件？
   *
   * 只引用**已分类**的冲击事件，最多 3 条：未分类事件只是「有新闻」，
   * 不能作为这条渠道的依据。条数用 eventMatchCount 如实给出。
   */
  const citedEvents = mechanism.needsEventEvidence
    ? [...events]
        .filter((e) => e.shockType === 'supply' || e.shockType === 'demand')
        .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
        .slice(0, 3)
    : [];

  /**
   * 事件型机制（例如「供给受阻推高油价」）没有价格驱动端：
   * 它检验的是「已分类的事件 + 目标方向」是否与机制一致。
   *
   * 只有同时满足才可能成立：
   *   1. 存在可核实事件，且事件已被分类到这条机制对应的冲击类型；
   *   2. 目标在同一窗口内有实质变化。
   * 事件存在但方向相反 → not_supported（这就是「反向案例」，必须有）。
   */
  if (mechanism.eventOnly) {
    const targetObs = observations.get(mechanism.to);
    const chTo = targetObs
      ? computeChange(targetObs.series, {
          comparisonPolicy: targetObs.definition?.comparisonPolicy,
          observations: observationsCount,
        })
      : null;
    const matchedAll = events.filter((e) => !mechanism.shockType || e.shockType === mechanism.shockType);
    /**
     * 只把最近 3 条放进引用，其余用计数表达。
     *
     * 一个 7 天窗口里可能有几十条同类型报道：全部塞进证据会让「查看依据」
     * 变成新闻列表，也会让写库时引用数量失控。计数仍然诚实给出。
     */
    const matched = [...matchedAll]
      .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
      .slice(0, 3);
    if (!matched.length) {
      return { ...base, missing, reasons: ['NO_MATCHING_EVENT'], eventRefs: [] };
    }
    if (!chTo || !isMaterialChange(chTo)) {
      return {
        ...base,
        missing,
        reasons: ['NO_MATERIAL_TARGET_CHANGE'],
        eventRefs: matched.map((e) => ({ eventId: e.eventId, revision: e.revision })),
        eventMatchCount: matchedAll.length,
        evidence: [evidenceEntry({ role: 'support', instrumentId: mechanism.to, definition: targetObs?.definition, change: chTo })].filter(
          (e) => e.change,
        ),
      };
    }
    const shown = presentChange(chTo);
    const actualSign = Math.sign(shown.value);
    const expected = Math.sign(mechanism.sign);
    const ok = expected === 0 || actualSign === expected;
    return {
      ...base,
      status: ok ? 'consistent' : 'not_supported',
      statusLabel: ok ? CHANNEL_STATUS.consistent.label : CHANNEL_STATUS.not_supported.label,
      statusPlain: ok ? CHANNEL_STATUS.consistent.plain : CHANNEL_STATUS.not_supported.plain,
      reasons: [ok ? 'SIGN_MATCH' : 'SIGN_MISMATCH'],
      missing,
      window: { key: windowKey, start: chTo.start, end: chTo.end, observations: targetObs?.series?.dates?.length ?? 0 },
      evidence: [
        evidenceEntry({ role: ok ? 'support' : 'contrary', instrumentId: mechanism.to, definition: targetObs?.definition, change: chTo }),
      ].filter((e) => e.change),
      eventRefs: matched.map((e) => ({ eventId: e.eventId, revision: e.revision })),
      eventMatchCount: matchedAll.length,
    };
  }

  // 2) 统计相关类：只报两端变化与样本数，不给方向判定
  if (mechanism.relationType === 'historical-correlation' || mechanism.sign === 0) {
    const fromObs = observations.get(mechanism.from);
    const toObs = observations.get(mechanism.to);
    const aligned = fromObs && toObs ? alignCommon(fromObs.series, toObs.series) : { n: 0, dates: [] };
    const chFrom = fromObs ? computeChange(fromObs.series, { comparisonPolicy: fromObs.definition?.comparisonPolicy, observations: observationsCount }) : null;
    const chTo = toObs ? computeChange(toObs.series, { comparisonPolicy: toObs.definition?.comparisonPolicy, observations: observationsCount }) : null;
    return {
      ...base,
      status: aligned.n >= 2 ? 'untested' : 'untested',
      reasons: aligned.n >= 2 ? ['STATISTICAL_ONLY'] : ['NO_COMMON_DATES'],
      missing,
      window: { key: windowKey, start: chTo?.start ?? null, end: chTo?.end ?? null, observations: aligned.n },
      evidence: [
        evidenceEntry({ role: 'background', instrumentId: mechanism.from, definition: fromObs?.definition, change: chFrom }),
        evidenceEntry({ role: 'background', instrumentId: mechanism.to, definition: toObs?.definition, change: chTo }),
      ].filter((e) => e.change),
    };
  }

  // 3) 同一组共同日期上的两端变化
  const fromObs = observations.get(mechanism.from);
  const toObs = observations.get(mechanism.to);
  if (!fromObs || !toObs) {
    return { ...base, missing, reasons: ['MISSING_INSTRUMENT:SELF'] };
  }
  const aligned = alignCommon(fromObs.series, toObs.series);
  if (aligned.n < 2) {
    return {
      ...base,
      missing,
      reasons: ['NO_COMMON_DATES'],
      evidence: [],
      window: { key: windowKey, start: null, end: null, observations: aligned.n },
    };
  }
  const sa = { dates: aligned.dates, values: aligned.a };
  const sb = { dates: aligned.dates, values: aligned.b };

  /**
   * **锚定到被解释的那个窗口**（审阅复现的 bug）。
   *
   * 原来这里各取「最新 N 个」：黄金窗口是 10-28→10-29，而实际收益率只更新到
   * 10-27，于是解释卡拿 10-26→10-27 的「实际收益率下降、黄金上涨」去支持
   * 10-28→10-29 的下跌 —— 历史关系被当成了当期证据。
   *
   * 现在：给了 anchor 就必须两端都落在 anchor 上；落不上就明确标成
   * 「窗口外，仅作历史背景」，状态 untested，不参与当结论。
   */
  const anchor = opts.anchor ?? null;
  const inAnchor = anchor?.start && anchor?.end
    ? aligned.dates.includes(anchor.start) && aligned.dates.includes(anchor.end)
    : null;

  const chFromRaw = anchor && inAnchor
    ? changeBetween(sa, anchor.start, anchor.end, { comparisonPolicy: fromObs.definition?.comparisonPolicy })
    : computeChange(sa, { comparisonPolicy: fromObs.definition?.comparisonPolicy, observations: observationsCount });
  const chToRaw = anchor && inAnchor
    ? changeBetween(sb, anchor.start, anchor.end, { comparisonPolicy: toObs.definition?.comparisonPolicy })
    : computeChange(sb, { comparisonPolicy: toObs.definition?.comparisonPolicy, observations: observationsCount });

  if (anchor?.start && anchor?.end && inAnchor === false) {
    // 驱动数据没跟上目标窗口：如实说「本次窗口没有可比观测」，并把手上的
    // 数据标成背景（它证明的是历史关系，不是当期证据）
    return {
      ...base,
      missing,
      status: 'untested',
      reasons: ['OUT_OF_WINDOW'],
      window: { key: windowKey, start: anchor.start, end: anchor.end, observations: aligned.n },
      evidence: [
        evidenceEntry({
          role: 'background',
          instrumentId: mechanism.from,
          definition: fromObs.definition,
          change: chFromRaw,
          note: `历史背景：${chFromRaw?.start ?? '?'} → ${chFromRaw?.end ?? '?'}，不在本次窗口内`,
        }),
        evidenceEntry({
          role: 'background',
          instrumentId: mechanism.to,
          definition: toObs.definition,
          change: chToRaw,
          note: `历史背景：${chToRaw?.start ?? '?'} → ${chToRaw?.end ?? '?'}，不在本次窗口内`,
        }),
      ].filter((e) => e.change),
    };
  }

  const chFrom = chFromRaw;
  const chTo = chToRaw;
  if (!chFrom || !chTo) {
    return {
      ...base,
      missing,
      reasons: ['CHANGE_UNAVAILABLE'],
      window: { key: windowKey, start: null, end: null, observations: aligned.n },
    };
  }

  // 驱动端没有实质变化 → 这条渠道这次没被检验，而不是「不成立」
  if (!isMaterialChange(chFrom)) {
    return {
      ...base,
      missing,
      status: 'untested',
      reasons: ['NO_MATERIAL_DRIVER_CHANGE'],
      window: { key: windowKey, start: chFrom.start, end: chFrom.end, observations: aligned.n },
      evidence: [
        evidenceEntry({ role: 'background', instrumentId: mechanism.from, definition: fromObs.definition, change: chFrom }),
        evidenceEntry({ role: 'background', instrumentId: mechanism.to, definition: toObs.definition, change: chTo }),
      ].filter((e) => e.change),
    };
  }
  if (!isMaterialChange(chTo)) {
    return {
      ...base,
      missing,
      status: 'untested',
      reasons: ['NO_MATERIAL_TARGET_CHANGE'],
      window: { key: windowKey, start: chFrom.start, end: chFrom.end, observations: aligned.n },
      evidence: [
        evidenceEntry({ role: 'background', instrumentId: mechanism.from, definition: fromObs.definition, change: chFrom }),
        evidenceEntry({ role: 'background', instrumentId: mechanism.to, definition: toObs.definition, change: chTo }),
      ].filter((e) => e.change),
    };
  }

  const driverShown = presentChange(chFrom).value;
  const targetShown = presentChange(chTo).value;
  const expectedTargetSign = Math.sign(mechanism.sign) * Math.sign(driverShown);
  const actualTargetSign = Math.sign(targetShown);
  const consistent = expectedTargetSign !== 0 && actualTargetSign === expectedTargetSign;

  // 4) 需要事件证据的渠道：有事件但未归类的冲击类型时，仍不能当作当期渠道
  if (mechanism.conditionCodes?.includes('NEEDS_SHOCK_TYPE')) {
    const classified = events.filter((e) => e.shockType && e.shockType !== 'unknown');
    if (!classified.length) {
      return {
        ...base,
        missing,
        status: 'untested',
        reasons: ['SHOCK_TYPE_UNCLASSIFIED'],
        window: { key: windowKey, start: chFrom.start, end: chFrom.end, observations: aligned.n },
        evidence: [
          evidenceEntry({ role: 'background', instrumentId: mechanism.from, definition: fromObs.definition, change: chFrom }),
          evidenceEntry({ role: 'background', instrumentId: mechanism.to, definition: toObs.definition, change: chTo }),
        ].filter((e) => e.change),
      };
    }
  }

  // 5) 名义利率单独涨不能当机会成本主因：缺实际收益率时只能是「尚未确认」。
  //    方案 §10.1 的用例：名义收益率上涨、实际收益率未知 → 机会成本仅为未确认机制。
  if (mechanism.conditionCodes?.includes('NEEDS_REAL_YIELD_CONFIRMATION')) {
    const real = observations.get('dfii10');
    const realUsable = !!real?.series?.dates?.length;
    if (!realUsable) {
      return {
        ...base,
        missing: [...missing, { instrumentId: 'dfii10', label: '10 年期实际收益率', code: 'MISSING_INSTRUMENT' }],
        status: 'untested',
        reasons: ['MISSING_INSTRUMENT:dfii10', 'NEEDS_REAL_YIELD_CONFIRMATION'],
        window: { key: windowKey, start: chFrom.start, end: chFrom.end, observations: aligned.n },
        evidence: [
          evidenceEntry({ role: 'background', instrumentId: mechanism.from, definition: fromObs.definition, change: chFrom }),
          evidenceEntry({ role: 'background', instrumentId: mechanism.to, definition: toObs.definition, change: chTo }),
        ].filter((e) => e.change),
      };
    }
  }

  const status = consistent ? 'consistent' : 'not_supported';
  return {
    ...base,
    status,
    statusLabel: CHANNEL_STATUS[status].label,
    statusPlain: CHANNEL_STATUS[status].plain,
    reasons: consistent ? ['SIGN_MATCH'] : ['SIGN_MISMATCH'],
    missing,
    window: { key: windowKey, start: chFrom.start, end: chFrom.end, observations: aligned.n },
    /**
     * 价格型渠道原则上不引用事件。
     *
     * 原来这里把「窗口内所有事件」都挂到每条渠道上：一条美元计价渠道
     * 因此声称引用了 90 条新闻，既误导用户，也让写库时的引用校验失败
     * （那些修订并没有入库）。只有「需要事件才能检验」的渠道才引用，
     * 且只引用已分类的冲击事件。
     */
    eventRefs: citedEvents.map((e) => ({ eventId: e.eventId, revision: e.revision })),
    eventMatchCount: citedEvents.length,
    evidence: [
      evidenceEntry({
        role: consistent ? 'support' : 'contrary',
        instrumentId: mechanism.from,
        definition: fromObs.definition,
        change: chFrom,
      }),
      evidenceEntry({
        role: consistent ? 'support' : 'contrary',
        instrumentId: mechanism.to,
        definition: toObs.definition,
        change: chTo,
      }),
    ].filter((e) => e.change),
  };
}

/**
 * 汇总一批机制的评估结果，并标出「同向支持 + 反向支持同时存在」的冲突。
 *
 * mixed 不是折中，而是明确告诉用户「方向还没定」。任何单一总分都不能
 * 把相反证据藏起来，所以这里不改写状态，只把冲突双方都标出来。
 */
export function markConflicts(hypotheses) {
  const byTarget = new Map();
  for (const h of hypotheses) {
    if (!byTarget.has(h.to)) byTarget.set(h.to, []);
    byTarget.get(h.to).push(h);
  }
  for (const list of byTarget.values()) {
    /**
     * 只有「机制假设」之间才谈得上方向冲突。
     *
     * 计价换算（例如 WTI↔布伦特同向）、共同驱动与历史相关**不是方向预测**：
     * 它们天然会与某个机制方向相反（两个基准一起跌，就同时出现「同向」与
     * 「下跌渠道成立」）。把它们算进冲突，会让每次正常行情都被标成
     * 「有相反证据」，等于把冲突提示废掉。
     */
    const directional = list.filter((h) => h.relationType === 'mechanism');
    const positives = directional.filter((h) => h.status === 'consistent' && h.sign > 0);
    const negatives = directional.filter((h) => h.status === 'consistent' && h.sign < 0);
    if (!positives.length || !negatives.length) continue;
    for (const h of [...positives, ...negatives]) {
      h.status = 'mixed';
      h.statusLabel = CHANNEL_STATUS.mixed.label;
      h.statusPlain = CHANNEL_STATUS.mixed.plain;
      h.reasons = [...new Set([...h.reasons, 'OPPOSING_CHANNEL_SUPPORTED'])];
    }
  }
  return hypotheses;
}
