/* ================================================================== *
 * 组合解释对象 + 确定性文案
 *
 * 原则（见方案 §4.1 / §7.1）：事实、一般机制、本次候选解释三者分开写。
 *   · 事实只由数据计算，措辞里不出现「因为」；
 *   · 机制是库里的版本化规则，措辞固定；
 *   · 候选解释只在证据匹配成立时出现，并且必须带「可能」「与…一致」这类限定；
 *   · 缺证据时输出「尚未确认」与「接下来观察什么」，而不是编一个主因。
 *
 * 第一版优先用模板：同一输入必须得到同样的文字与证据顺序，方便回归测试
 * 与历史回放。语言模型若启用，只允许改写已经给到的事实与机制。
 *
 * 纯函数：不读时钟（时间由调用方传）、不写库、不发请求。
 * ================================================================== */

import { changeBetween, presentChange, computeChange, windowSpec } from './alignment.js';
import { CHANNEL_STATUS, RELATION_TYPES, CONDITION_TEXT } from './mechanisms.js';

export const EXPLANATION_SCHEMA_VERSION = 1;
// calc-v2：证据装配口径变化 —— 事件型渠道最多引用 3 条已分类报道，
// 价格型渠道不再引用窗口内全部事件。版本号进快照，旧快照按旧口径保留。
/**
 * 计算口径版本。**改了「怎么算」就要抬这里**：
 * 指纹包含它，所以抬版本会让已有快照全部失效并重建。
 *
 * calc-v3（2026-10-29）：机制与驱动事实改为**锚定目标窗口**（同窗证据），
 * 不再各取自己最新的一段 —— 见 evidence.js 的 OUT_OF_WINDOW 分支。
 * 不抬版本的话，旧快照会按指纹命中、继续把历史关系当当期证据。
 */
export const CALCULATION_VERSION = 'calc-v3';
export const LANGUAGE_VERSION = 'template-v1';

/** 单位格式化：pct 保留两位小数、bp 保留一位小数、level 原样 */
export function formatChange(change, { withSign = true } = {}) {
  if (!change) return '—';
  const v = change.value;
  const sign = withSign ? (v > 0 ? '+' : v < 0 ? '−' : '') : '';
  const abs = Math.abs(v);
  if (change.unit === 'bp') return `${sign}${abs.toFixed(1)}bp`;
  if (change.unit === 'pct') return `${sign}${abs.toFixed(2)}%`;
  return `${sign}${abs.toFixed(2)}`;
}

function inWindowText(window) {
  if (!window?.start || !window?.end) return null;
  return window.start === window.end ? window.start : `${window.start} → ${window.end}`;
}

/**
 * 事实：目标资产与各驱动指标在本窗口的变化。
 *
 * 每个事实都带 window、单位与观测标识；界面「查看依据」用它们定位原始数据。
 */
export function buildFacts({ targetId, targetDefinition, targetSeries, drivers, windowKey, anchor = null }) {
  const spec = windowSpec(windowKey) ?? windowSpec('session');
  const facts = [];
  const targetChange = targetSeries
    ? computeChange(targetSeries, {
        comparisonPolicy: targetDefinition?.comparisonPolicy,
        observations: spec.observations,
      })
    : null;
  if (targetChange) {
    facts.push({
      code: 'TARGET_CHANGE',
      instrumentId: targetId,
      label: `${targetDefinition?.short ?? targetId}本窗口变化`,
      window: { start: targetChange.start, end: targetChange.end },
      change: presentChange(targetChange),
      level: { from: targetChange.from, to: targetChange.to },
      unit: targetDefinition?.unit ?? null,
      observationIds: [`${targetId}@${targetChange.start}`, `${targetId}@${targetChange.end}`],
    });
  }
  /**
   * 驱动事实也锚定到目标窗口（与机制同一口径）。
   *
   * 锚不上时不再假装它是本窗口的变化：保留它自己的窗口，并标
   * `alignedToTarget: false`，界面据此刻意写「历史背景」。
   */
  for (const [instrumentId, obs] of drivers) {
    if (!obs?.series?.dates?.length) continue;
    const anchored = anchor?.start && anchor?.end
      ? changeBetween(obs.series, anchor.start, anchor.end, { comparisonPolicy: obs.definition?.comparisonPolicy })
      : null;
    const ch = anchored ?? computeChange(obs.series, {
      comparisonPolicy: obs.definition?.comparisonPolicy,
      observations: spec.observations,
    });
    if (!ch) continue;
    facts.push({
      code: 'DRIVER_CHANGE',
      alignedToTarget: anchored ? true : anchor?.start ? false : null,
      instrumentId,
      label: `${obs.definition?.short ?? instrumentId}本窗口变化`,
      window: { start: ch.start, end: ch.end },
      change: presentChange(ch),
      level: { from: ch.from, to: ch.to },
      unit: obs.definition?.unit ?? null,
      observationIds: [`${instrumentId}@${ch.start}`, `${instrumentId}@${ch.end}`],
    });
  }
  return facts;
}

/** 目标变化的白话句，用真实数字，不带原因 */
export function factSentence(facts, targetDefinition) {
  const f = facts.find((x) => x.code === 'TARGET_CHANGE');
  if (!f) return '本窗口没有可用的目标资产观测。';
  const w = inWindowText(f.window);
  const direction = f.change?.value > 0 ? '上升' : f.change?.value < 0 ? '下降' : '基本持平';
  return `${targetDefinition?.name ?? f.instrumentId}在 ${w ?? '本窗口'}${direction} ${formatChange(f.change, { withSign: false })}。`;
}

/**
 * 一句话概述：先事实，再候选因素的性质，不写具体原因。
 *
 * 有 consistent 渠道 → 「与…一致，但存在其他可能」；
 * 只有 mixed → 「支持与反向证据同时存在」；
 * 只有 not_supported → 「这些机制在本窗口没有得到支持」；
 * 全 untested → 「证据不足」。
 */
export function buildSummary({ hypotheses, facts, assetName }) {
  const f = facts.find((x) => x.code === 'TARGET_CHANGE');
  if (!f) return `当前数据不足以解释本次${assetName ?? '资产'}变动。`;
  const direction = f.change?.value > 0 ? '上升' : f.change?.value < 0 ? '下降' : '基本持平';
  const head = `${assetName ?? f.instrumentId}本窗口${direction} ${formatChange(f.change, { withSign: false })}`;
  const consistent = hypotheses.filter((h) => h.status === 'consistent');
  const mixed = hypotheses.filter((h) => h.status === 'mixed');
  if (consistent.length) {
    const names = consistent.slice(0, 3).map((h) => h.label).join('、');
    return `${head}。当前观测与「${names}」方向一致，但这些只是一致性，不能确认就是原因；下面还列了反向与未确认的因素。`;
  }
  if (mixed.length) {
    return `${head}。支持与反向的证据同时存在，方向尚未确定。`;
  }
  const tested = hypotheses.filter((h) => h.status === 'not_supported');
  if (tested.length) {
    return `${head}。本次窗口内，已登记的几个机制都没有得到支持，仍待确认更合适的原因。`;
  }
  return `${head}。但没有足够证据判断原因，下面给出一般机制与需要观察的数据。`;
}

/**
 * 未知项：每一条都必须说清「缺什么」而不是笼统的一句「数据不足」。
 */
export function buildUnknowns({ hypotheses, facts, driverQuality = [], events = [] }) {
  const unknowns = [];
  const seen = new Set();
  const push = (code, text) => {
    if (seen.has(code)) return;
    seen.add(code);
    unknowns.push({ code, text });
  };

  if (!facts.some((f) => f.code === 'TARGET_CHANGE')) {
    push('NO_TARGET_WINDOW', '缺少目标资产在该窗口的可比观测，无法描述变化本身。');
  }
  for (const h of hypotheses) {
    for (const reason of h.reasons ?? []) {
      if (reason === 'NO_COMMON_DATES' || reason === 'UNALIGNED_WINDOW') {
        push('UNALIGNED_WINDOW', '部分指标与目标资产缺少共同时间窗的观测，相关渠道无法检验。');
      } else if (reason.startsWith('MISSING_INSTRUMENT:')) {
        const id = reason.split(':')[1];
        push(`MISSING_${id}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_'), `缺少${id} 的可比观测，相关渠道只能是「尚未确认」。`);
      } else if (reason === 'NO_EVENT_EVIDENCE') {
        push('NO_EVENT_EVIDENCE', '缺少可核实的事件证据，无法判断这次变化对应哪一类冲击。');
      } else if (reason === 'SHOCK_TYPE_UNCLASSIFIED') {
        push('SHOCK_TYPE_UNCLASSIFIED', '有价格变化，但没有区分供给冲击与需求冲击，间接渠道无法检验。');
      } else if (reason === 'CHANGE_UNAVAILABLE') {
        push('CHANGE_UNAVAILABLE', '有观测但对数收益率或百分点差不可计算，窗口内变化无法呈现。');
      }
    }
  }
  for (const q of driverQuality) {
    if (q.status === 'stale') {
      push(`STALE_${String(q.instrumentId).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`, `${q.instrumentId} 的最新观测已超过正常更新周期，这里只作为背景。`);
    }
    if (q.status === 'unavailable') {
      push(`UNAVAILABLE_${String(q.instrumentId).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`, `${q.instrumentId} 当前没有可用观测。`);
    }
  }
  if (!events.length) {
    push('NO_EVENTS_IN_WINDOW', '窗口内没有已归类的事件，解释只基于价格与利率观测。');
  }
  return unknowns;
}

/** 接下来观察什么：只写可执行、可核验的动作 */
export function buildNextChecks({ hypotheses, unknowns }) {
  const checks = [];
  const has = (code) => unknowns.some((u) => u.code === code);
  if (hypotheses.some((h) => h.reasons?.includes('MISSING_INSTRUMENT:dfii10')) || has('MISSING_DFII10')) {
    checks.push('取得同窗口的 10 年期实际收益率（DFII10）后，再检查机会成本渠道。');
  }
  if (has('NO_EVENT_EVIDENCE') || has('NO_EVENTS_IN_WINDOW')) {
    checks.push('等事件与发布时间补齐后，确认窗口内是否有可核实的供给或风险事件。');
  }
  if (hypotheses.some((h) => h.status === 'mixed')) {
    checks.push('跟踪两个方向相反的渠道（例如避险需求与实际收益率）哪个继续得到数据支持。');
  }
  if (has('UNALIGNED_WINDOW')) {
    checks.push('等到两个市场都有同一交易日的收盘数据后，再比较当期方向。');
  }
  if (!checks.length) {
    checks.push('观察下一个交易时段，确认这条渠道是否继续与观测方向一致。');
  }
  return checks;
}

/**
 * 内容状态：ready / partial / insufficient。
 * 只描述「解释内容和引用是否已生成」，不是概率，也不表示因果已证实。
 */
export function contentStatusOf({ facts, hypotheses }) {
  if (!facts.length) return 'insufficient';
  const tested = hypotheses.filter((h) => h.status === 'consistent' || h.status === 'not_supported' || h.status === 'mixed');
  if (!hypotheses.length) return 'insufficient';
  if (!tested.length) return 'partial';
  return 'ready';
}

/**
 * 校验解释里出现的每个数字都能回溯到事实或证据。
 *
 * 这是「受约束的语言生成」的守门人：第一版文案由模板生成，本来就不会
 * 凭空造数；但接口允许将来换成模型改写，改写的输出必须先过这一关 ——
 * 出现一个无法回溯的数字，就整段回退到确定性模板（见服务层）。
 *
 * @returns {{ ok:boolean, reason?:string, untraceable?:string[] }}
 */
export function verifyExplanation(explanation) {
  if (!explanation || typeof explanation !== 'object') return { ok: false, reason: 'NOT_AN_OBJECT' };
  const facts = explanation.facts ?? [];
  const hypotheses = explanation.hypotheses ?? [];

  // 1) 证据引用必须存在且可解析（缺引用的解释比没有解释更危险）
  for (const h of hypotheses) {
    const ev = h.evidence ?? [];
    for (const e of ev) {
      if (!Array.isArray(e.observationIds) || e.observationIds.length === 0) {
        return { ok: false, reason: `EVIDENCE_WITHOUT_OBSERVATIONS:${h.mechanismId}` };
      }
    }
  }
  // 2) 事实里的数值必须是有限数
  for (const f of facts) {
    if (f.change && !Number.isFinite(f.change.value)) {
      return { ok: false, reason: `NON_FINITE_FACT:${f.instrumentId}` };
    }
  }
  // 3) 摘要中出现的数字必须能在格式化的变化值集合里找到
  const allowed = new Set();
  const addToken = (v) => {
    if (!Number.isFinite(v)) return;
    const abs = Math.abs(v);
    allowed.add(abs.toFixed(2));
    allowed.add(abs.toFixed(1));
    allowed.add(String(Math.round(abs)));
    allowed.add(abs.toFixed(3));
  };
  for (const f of facts) if (f.change) addToken(f.change.value);
  for (const h of hypotheses) {
    for (const e of h.evidence ?? []) if (e.change) addToken(e.change.value);
  }
  const summary = String(explanation.summary ?? '');
  const tokens = summary.match(/\d+(?:\.\d+)?/g) ?? [];
  const untraceable = tokens.filter((t) => {
    const norm = String(Number(t));
    return !allowed.has(t) && !allowed.has(Number(t).toFixed(2)) && !allowed.has(Number(t).toFixed(1)) && !allowed.has(norm);
  });
  if (untraceable.length) return { ok: false, reason: 'UNTRACEABLE_NUMBER', untraceable };
  return { ok: true };
}

/**
 * 组装最终解释对象（不可变快照的形状）。
 *
 * 注意 versions：机制库 / 计算口径 / 文案版本都进去，历史快照才能被解释成
 * 「当时用的哪套规则」。generatedAt 只说明何时生成，不代表数据新鲜程度。
 */
export function composeExplanation({
  id,
  assetId,
  assetDefinition,
  windowKey,
  asOf,
  generatedAt,
  facts,
  hypotheses,
  events = [],
  driverQuality = [],
  versions = {},
}) {
  const unknowns = buildUnknowns({ hypotheses, facts, driverQuality, events });
  const contentStatus = contentStatusOf({ facts, hypotheses });
  const summary =
    contentStatus === 'insufficient'
      ? `当前数据不足以解释本次${assetDefinition?.short ?? assetId}变动。`
      : buildSummary({ hypotheses, facts, assetName: assetDefinition?.name ?? assetId });

  const windowStart = facts.find((f) => f.code === 'TARGET_CHANGE')?.window?.start ?? null;
  const windowEnd = facts.find((f) => f.code === 'TARGET_CHANGE')?.window?.end ?? null;

  return {
    id,
    assetId,
    asOf,
    generatedAt,
    window: {
      key: windowKey,
      start: windowStart,
      end: windowEnd,
      alignment: windowStart && windowEnd ? 'common-dates' : 'unavailable',
    },
    contentStatus,
    summary,
    facts,
    hypotheses,
    unknowns,
    nextChecks: buildNextChecks({ hypotheses, unknowns }),
    versions: {
      mechanisms: versions.mechanisms ?? null,
      calculation: versions.calculation ?? CALCULATION_VERSION,
      language: versions.language ?? LANGUAGE_VERSION,
    },
    relationTypes: RELATION_TYPES,
    statusLegend: CHANNEL_STATUS,
    conditionText: CONDITION_TEXT,
  };
}
