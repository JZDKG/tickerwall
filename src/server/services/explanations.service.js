/* ================================================================== *
 * 解释服务：取数 → 对齐 → 机制匹配 → 结构化快照 → 持久化 → 读取元数据
 *
 * 分工（方案 §5 / §7）：
 *   · 数值计算、数据质量、机制匹配、降级判断全部在服务端；
 *   · 领域层（domain/explanations/*）是纯函数，服务层负责注入观测与事件；
 *   · 前端只读快照，不自己生成原因，避免「同一个问题三个页面三种说法」。
 *
 * 契约（方案 §8.1）：
 *   有快照            → 200 + explanation.contentStatus + meta
 *   正在准备且无旧快照 → 202 + explanation:null + meta.freshness=unavailable
 *   只有过期快照      → 200 + 原快照内容与原 asOf + meta.freshness=stale
 *   参数不合法/不存在  → 400 / 404
 *   系统不可用且无快照 → 503
 *
 * 注意：ready 只表示内容和引用已生成，**不表示因果被证实**；insufficient
 * 是正常业务结果，不是接口故障；一个刚生成的 insufficient 也可以是 fresh。
 * ================================================================== */

import { createHash } from 'node:crypto';
import { MACRO_UNIVERSE, fetchMacroSeries } from './macro.service.js';
import { readArchiveRowsForSpan } from '../db/event-archive.js';
import { writeEventRevision } from '../db/explanations.js';
import { validateObservation } from '../contracts/index.js';
import { toEventEvidence } from '../domain/events/shock.js';
import { readDailyCache, writeDailyCache } from '../db/index.js';
import {
  writeExplanation,
  writeObservationRevisions,
  latestObservationFor,
  readExplanation,
  latestExplanation,
  listExplanationHistory,
  explanationIdByFingerprint,
  explanationStorageStatus,
} from '../db/index.js';
import { fetchFredDaily, FRED_MIN_ROWS } from '../providers/index.js';
import {
  EXPLAINABLE_ASSETS,
  explainableAsset,
  instrumentDefinition,
  GOLD_DRIVERS,
} from '../domain/explanations/instruments.js';
import { WINDOW_KEYS, WINDOW_SPECS, computeChange, windowSpec } from '../domain/explanations/alignment.js';
import { assessExplanationFreshness } from '../domain/explanations/quality.js';
import { diffExplanations, summarizeDiff } from '../domain/explanations/diff.js';
import {
  mechanismsFor,
  mechanismLibraryVersion,
  MECHANISM_LIBRARY_VERSION,
} from '../domain/explanations/mechanisms.js';
import { evaluateMechanism, markConflicts, observationIdOf } from '../domain/explanations/evidence.js';
import {
  buildFacts,
  composeExplanation,
  factSentence,
  verifyExplanation,
  EXPLANATION_SCHEMA_VERSION,
  CALCULATION_VERSION,
  LANGUAGE_VERSION,
} from '../domain/explanations/compose.js';

export const EXPLANATION_CACHE_TTL_MS = 60_000;
const explanationCache = new Map();

/** 支持 GET /api/explanations 的资产白名单 */
export function explanationAssetIds() {
  return EXPLAINABLE_ASSETS.filter((a) => a.enabled).map((a) => a.id);
}

/** 额外需要 FRED 的指标（不在 MACRO_UNIVERSE 里，但解释要用） */
const EXTRA_FRED_SERIES = {
  dfii10: 'DFII10',
  t10yie: 'T10YIE',
  usdcny: 'DEXCHUS',
};

function defaultObservationFor(id) {
  const def = MACRO_UNIVERSE.find((d) => d.id === id);
  return def ?? null;
}

/**
 * 读取一个 FRED 指标（带缓存与值域处理）。
 *
 * 值域必须按指标类型走：dfii10 / t10yie 允许零与负，usdcny 是价格。
 * 写库也要带同一个值域，否则零值 / 负值在落库这一步又会被丢掉。
 */
async function loadFredInstrument(id, { force = false } = {}) {
  const seriesId = EXTRA_FRED_SERIES[id];
  const definition = instrumentDefinition(id);
  if (!seriesId) return null;
  const valueDomain = definition?.valueDomain ?? 'positive';
  const cached = await readDailyCache(id);
  const cachedUsable = cached && cached.rows?.length >= 2;
  // 缓存新鲜就不用打上游（宏观日频数据 1 小时刷新一次足够）
  if (cachedUsable && !force && Date.now() - cached.savedAt < 3600_000) {
    return {
      rows: cached.rows,
      meta: {
        source: cached.source,
        quality: { fromCache: true, fellBack: false, savedAt: cached.savedAt, ageMs: Date.now() - cached.savedAt },
      },
    };
  }
  try {
    const r = await fetchFredDaily(seriesId, { valueDomain });
    if (r.rows?.length >= 2) {
      await writeDailyCache(id, `fred:${seriesId}`, r.rows, { valueDomain });
      return { rows: r.rows, meta: { source: `fred:${seriesId}`, quality: { fromCache: false, fellBack: false } } };
    }
    if (r.rows?.length < FRED_MIN_ROWS) throw new Error('历史过短');
  } catch (err) {
    if (cachedUsable) {
      return {
        rows: cached.rows,
        meta: {
          source: cached.source,
          quality: {
            fromCache: true,
            fellBack: true,
            savedAt: cached.savedAt,
            ageMs: Date.now() - cached.savedAt,
            reason: 'SOURCE_FAILED',
            error: String(err?.message ?? err),
          },
        },
      };
    }
    return null;
  }
  return null;
}

/**
 * 取齐某个资产需要的观测。
 *
 * 返回 Map<instrumentId, { instrumentId, series:{dates,values}, definition, quality, lastObservedAt, source }>
 * 缺失的指标不会出现在 Map 里 —— 由领域层判定「无法检验」，不是补 0。
 */
export async function loadAssetObservations(assetId, { force = false } = {}) {
  const asset = explainableAsset(assetId);
  if (!asset) return new Map();
  const ids = asset.instruments ?? [];
  const out = new Map();

  await Promise.all(
    ids.map(async (id) => {
      const definition = instrumentDefinition(id);
      let loaded = null;
      if (EXTRA_FRED_SERIES[id]) {
        loaded = await loadFredInstrument(id, { force });
      } else if (defaultObservationFor(id)) {
        try {
          loaded = await fetchMacroSeries(defaultObservationFor(id));
        } catch (err) {
          // 单个源失败不拖垮整个解释：这个指标记为不可用，其余照常
          out.set(id, {
            instrumentId: id,
            definition,
            series: { dates: [], values: [] },
            quality: { unavailable: true, error: String(err?.message ?? err) },
            lastObservedAt: null,
            source: null,
          });
          return;
        }
      }
      if (!loaded?.rows?.length) {
        out.set(id, {
          instrumentId: id,
          definition,
          series: { dates: [], values: [] },
          quality: { unavailable: true },
          lastObservedAt: null,
          source: loaded?.meta?.source ?? null,
        });
        return;
      }
      const rows = loaded.rows;
      out.set(id, {
        instrumentId: id,
        definition,
        series: { dates: rows.map((r) => r.date), values: rows.map((r) => Number(r.close)) },
        quality: loaded.meta?.quality ?? {},
        lastObservedAt: rows[rows.length - 1]?.date ?? null,
        source: loaded.meta?.source ?? null,
        valueDomain: definition?.valueDomain ?? 'positive',
      });
    }),
  );
  return out;
}

/** 观测集合 → 参与质量评估的数组 */
export function observationQualityList(observations) {
  const list = [];
  for (const [id, obs] of observations) {
    list.push({
      instrumentId: id,
      lastObservedAt: obs.lastObservedAt,
      frequency: obs.definition?.frequency ?? 'daily',
      quality: obs.quality,
    });
  }
  return list;
}

/**
 * 输入指纹：同一批输入必须得到同一个指纹。
 *
 * 组成 = 资产 + 窗口 + 三个版本 + 每个指标的「最后观测日期 + 最后值」。
 * 只有这些变化才需要新快照；单纯经过时间不改变内容（读取时再算新鲜度）。
 */
export function explanationFingerprint({ assetId, windowKey, observations, events = [], windowSpan = null }) {
  const parts = [assetId, windowKey, MECHANISM_LIBRARY_VERSION, CALCULATION_VERSION, LANGUAGE_VERSION];
  const ids = [...observations.keys()].sort();
  /**
   * 指纹必须覆盖**窗口内真正用到的那两个点**，不能只看「最后一个值」。
   *
   * 审阅复现过两种失效：
   *   1. 窗口**起点**那一格的观测后来被修订 → 指纹没变 → 强制刷新仍复用旧解释；
   *   2. 终点变了、指纹变了、新解释显示新数值，但引用（`资产@日期`）指向的
   *      仍是旧修订 —— 历史回看时看到的是「新结论 + 旧证据」。
   *
   * 这里做两件事：
   *   · 把窗口起止日期及其值/修订号都纳入指纹；
   *   · 每条观测若有 `revision`，一并纳入（同 id 不同修订 = 不同事实）。
   */
  for (const id of ids) {
    const obs = observations.get(id);
    const dates = obs?.series?.dates ?? [];
    const values = obs?.series?.values ?? [];
    const last = dates.length ? dates[dates.length - 1] : 'none';
    const lastVal = values.length ? values[values.length - 1] : 'none';
    const fellBack = obs?.quality?.fellBack ? 'fallback' : 'direct';
    const spans = [];
    if (windowSpan?.start != null && dates.includes(windowSpan.start)) {
      const i = dates.indexOf(windowSpan.start);
      spans.push(`s=${windowSpan.start}:${values[i]}`);
    }
    if (windowSpan?.end != null && dates.includes(windowSpan.end)) {
      const i = dates.indexOf(windowSpan.end);
      spans.push(`e=${windowSpan.end}:${values[i]}`);
    }
    const rev = obs?.revision ?? obs?.quality?.revision ?? null;
    parts.push(`${id}:${last}:${lastVal}:${fellBack}:${spans.join(',')}:rev=${rev ?? 'none'}`);
  }
  /**
   * 事件证据必须进指纹（方案 §6.3 / §7.2）。
   *
   * 漏掉它的后果是实测到的：日频指标没变、但窗口里新出现了「供给受阻」报道，
   * 指纹相同 → 直接复用旧快照（events = []）→ 事件渠道永远停在「尚未确认」。
   * 参与指纹的身份 = eventId + revision + shockType；转载不影响（同一事件同一版本）。
   */
  for (const e of [...events].sort((a, b) => String(a.eventId).localeCompare(String(b.eventId)))) {
    parts.push(`ev:${e.eventId}#${e.revision ?? 1}:${e.shockType ?? 'none'}`);
  }
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function explanationIdFor(assetId, windowKey, fingerprint) {
  return `exp_${assetId}_${windowKey}_${fingerprint.slice(0, 10)}`;
}

/**
 * 纯装配：由观测 + 事件生成解释对象（不写库、不发请求）。
 *
 * @param {object} input
 */
export function buildExplanation({
  assetId,
  windowKey,
  observations,
  events = [],
  asOf,
  generatedAt,
  id,
  fingerprint,
}) {
  const asset = explainableAsset(assetId);
  const assetDefinition = instrumentDefinition(assetId);
  const spec = windowSpec(windowKey);
  if (!asset || !spec) throw new Error(`不支持的资产或窗口：${assetId} / ${windowKey}`);

  const targetObs = observations.get(assetId) ?? null;

  /**
   * 事实只列「这次解释真的会用到的指标」：目标资产 + 机制库里声明过的驱动。
   *
   * 不把加载到的所有序列都写进事实 —— 那会让一个与本次结论无关、但更新较慢
   * 的序列把整张解释拖成「已过期」（人民币汇率只服务于内外盘折算，与
   * 国际金的机会成本渠道无关）。
   */
  const relevance = new Set([assetId]);
  const mechanisms = mechanismsFor(assetId) ?? [];
  for (const m of mechanisms) {
    relevance.add(m.from);
    for (const req of m.requires ?? []) relevance.add(req.instrument);
  }
  /**
   * 先固定**被解释的窗口**（目标资产的本次变化），再把同一个窗口交给事实与机制。
   *
   * 审阅复现过的问题：事实用目标资产最新窗口，机制各取自己最新共同日期，
   * 于是「黄金 10-28→10-29 下跌 0.66%」的解释里，支持依据却是
   * 「实际收益率 10-26→10-27 下降 2bp、黄金上涨 1.07%」—— 那是历史关系，
   * 不是当期证据。现在两者共用一个 anchor。
   */
  const anchorSpec = windowSpec(windowKey) ?? windowSpec('session');
  const anchorChange = targetObs?.series
    ? computeChange(targetObs.series, {
        comparisonPolicy: assetDefinition?.comparisonPolicy,
        observations: anchorSpec.observations,
      })
    : null;
  const anchor = anchorChange ? { start: anchorChange.start, end: anchorChange.end } : null;

  const facts = buildFacts({
    targetId: assetId,
    targetDefinition: assetDefinition,
    targetSeries: targetObs?.series ?? null,
    targetObs,
    drivers: [...observations.entries()].filter(([id]) => id !== assetId && relevance.has(id)),
    windowKey,
    anchor,
  });

  const hypotheses = mechanisms.map((m) =>
    evaluateMechanism(m, observations, { windowKey, eventEvidence: events, anchor }),
  );
  markConflicts(hypotheses);

  const explanation = composeExplanation({
    id,
    assetId,
    assetDefinition,
    windowKey,
    asOf,
    generatedAt,
    facts,
    hypotheses,
    events,
    driverQuality: observationQualityList(observations),
    versions: {
      mechanisms: mechanismLibraryVersion(),
      calculation: CALCULATION_VERSION,
      language: LANGUAGE_VERSION,
    },
  });

  /**
   * 措辞校验：所有数字必须可回溯，所有证据必须带观测引用。
   * 失败就整段回退到确定性模板 —— 宁可少一句话，也不留一个查不到来源的数字。
   * （第一版本来只走模板，这道关是为将来「模型只改写已给定事实」准备的。）
   */
  const verdict = verifyExplanation(explanation);
  if (!verdict.ok) {
    explanation.summary = factSentence(facts, assetDefinition);
    explanation.languageFallback = true;
    explanation.languageFallbackReason = verdict.reason;
    explanation.versions.language = 'template-fallback-v1';
  }

  explanation.inputFingerprint = fingerprint ?? null;
  return explanation;
}

/**
 * 把解释引用到的观测点写成不可变版本记录。
 *
 * 只写被引用的点：把整段序列都塞进 observation_revisions 会让库迅速膨胀，
 * 而解释只需要「它引用的那两个日期」可回溯。
 */
/**
 * 把本次解释引用的**事件修订**落库。
 *
 * 写库时的引用校验要求每条 eventRef 都真实存在（方案 §6.3「不接受不存在的
 * 引用」）。归档里的条目还没有 event_revisions 行，所以先写再引用；已经存在
 * 的用 INSERT OR IGNORE，重复引用不会产生新版本。
 *
 * payload 只存解释需要的字段：事件身份、时间、冲击类型与判定依据 ——
 * 不复制整篇正文，避免两处内容各自漂移。
 */
export function persistReferencedEvents(explanation, events, { knownAt } = {}) {
  const byId = new Map((events ?? []).map((e) => [`${e.eventId}#${e.revision ?? 1}`, e]));
  const written = [];
  for (const h of explanation?.hypotheses ?? []) {
    for (const ref of h.eventRefs ?? []) {
      const key = `${ref.eventId}#${ref.revision ?? 1}`;
      if (!byId.has(key)) continue;
      const e = byId.get(key);
      writeEventRevision({
        eventId: e.eventId,
        revision: e.revision ?? 1,
        knownAt: knownAt ?? new Date().toISOString(),
        payload: {
          // 这里只有分类结果，没有正文：标成 partial，界面据此说明
          // 「此版只记录了分类结果」，而不是假装有一条标题缺失的改判
          partial: true,
          shockType: e.shockType ?? null,
          evidence: e.evidence ?? [],
          at: e.at ?? null,
          source: 'event-archive',
        },
      });
      written.push(key);
    }
  }
  return written;
}

export function persistReferencedObservations(explanation, observations, { knownAt } = {}) {
  const rejected = [];
  const wanted = new Set();
  for (const f of explanation.facts ?? []) for (const id of f.observationIds ?? []) wanted.add(id);
  for (const h of explanation.hypotheses ?? []) {
    for (const e of h.evidence ?? []) for (const id of e.observationIds ?? []) wanted.add(id);
  }
  const records = [];
  for (const [instrumentId, obs] of observations) {
    const dates = obs?.series?.dates ?? [];
    for (const date of dates) {
      const idx = dates.indexOf(date);
      const logicalKey = observationIdOf(instrumentId, date);
      /**
       * 同一 (指标, 日期) 的值变了 → 写一个新的**修订版本**（`#r2`、`#r3`…），
       * 旧版本保留。这样「这条解释后来怎么变了」才能被追溯；
       * 值没变就沿用原 id（`INSERT OR IGNORE` 不会重复写）。
       */
      const prev = latestObservationFor(instrumentId, date);
      const value = obs.series.values[idx];
      const sameValue = prev && Number.isFinite(prev.value) && Math.abs(prev.value - Number(value)) < 1e-9;
      const revision = prev ? (sameValue ? prev.revision : prev.revision + 1) : 1;
      const id = sameValue ? prev.id : observationIdOf(instrumentId, date, revision);
      const wantedIds = new Set([id, logicalKey]);
      if (![...wantedIds].some((x) => wanted.has(x))) continue;
      const record = {
        id,
        logicalKey,
        instrumentId,
        observedAt: date,
        publishedAt: null,
        fetchedAt: knownAt ?? new Date().toISOString(),
        knownAt: knownAt ?? new Date().toISOString(),
        value: obs.series.values[idx],
        unit: obs.definition?.unit ?? null,
        valueDomain: obs.definition?.valueDomain ?? 'positive',
        revision,
        quality: obs.quality ?? null,
        sourceRef: obs.source ?? null,
      };
      /**
       * 契约校验（方案 E04 / §4.3）：不通过的观测**不进库**，但也不静默蒸发。
       * 这里把它记成一条带 contract 结论的拒绝，调用方据此在 meta 里报
       * 「有 N 条观测没通过校验」，而不是让数字少一截却没人知道。
       */
      const { ok, errors } = validateObservation(record);
      if (!ok) {
        rejected.push({ id, instrumentId, observedAt: date, errors });
        continue;
      }
      records.push(record);
    }
  }
  const written = writeObservationRevisions(records);
  return { written, rejected };
}

/**
 * 这次解释**实际引用**到的指标集合。
 *
 * 为什么不用「加载到的全部指标」算新鲜度：一个没有被任何事实或证据引用的
 * 辅助序列（例如只服务于内外盘折算的美元兑人民币）落后几天，不该让整张
 * 黄金解释变成「已过期」—— 那会把「有个旁支数据旧了」误报成「这次结论不可读」。
 */
export function referencedInstrumentIds(explanation, { directionalOnly = false } = {}) {
  const ids = new Set([explanation?.assetId].filter(Boolean));
  for (const f of explanation?.facts ?? []) {
    // 只把「目标资产本窗口变化」当作支撑结论的事实；
    // 其余事实是背景数字，过期时按背景处理（见 meta.backgroundStale）
    if (directionalOnly && f.code !== 'TARGET_CHANGE') continue;
    if (f.instrumentId) ids.add(f.instrumentId);
  }
  for (const h of explanation?.hypotheses ?? []) {
    /**
     * directionalOnly：只统计「给出了方向判定」的机制假设所依赖的指标。
     *
     * 为什么需要区分：历史相关与共同驱动只是背景说明，事件型机制在缺事件时
     * 也没有给出任何判定。它们依赖的序列过期（例如原油源延迟 8 天）不该把整张
     * 黄金解释判成「已过期」—— 真正支撑结论的实际收益率、美元都是新的。
     * 这些被排除但仍过期的指标会单独列在 meta.backgroundStale 里，界面照实提示。
     */
    if (directionalOnly) {
      const isDirectional = h.relationType === 'mechanism' && ['consistent', 'not_supported', 'mixed'].includes(h.status);
      if (!isDirectional) continue;
    }
    for (const e of h.evidence ?? []) if (e.instrumentId) ids.add(e.instrumentId);
  }
  return ids;
}

/**
 * 窗口内「已分类」的事件证据。
 *
 * 事件型渠道（供给受阻 / 需求增强）需要它才能成立；取不到就返回空数组，
 * 渠道相应地显示「尚未确认」—— 这是有意的保守默认，不是故障。
 *
 * 只用归档里能判出冲击类型的条目：判不出来的事件留给 nextChecks 提示补证据。
 */
export async function loadEventEvidence(assetId, windowKey, { nowMs = Date.now() } = {}) {
  if (!explanationAssetIds().includes(assetId)) return [];
  const spec = windowSpec(windowKey);
  // 交易时段 ↔ 自然日：session 取 1 天，5d 取 7 天，1m 取 31 天（含周末）
  const days = windowKey === 'session' ? 1 : windowKey === '5d' ? 7 : 31;
  void spec;
  const sinceMs = nowMs - days * 86400000;
  try {
    const rows = await readArchiveRowsForSpan({ sinceMs, nowMs });
    // 带上资产相关性过滤：只统计确实在讲这个品种的报道
    return toEventEvidence(rows, { sinceMs, nowMs, assetId });
  } catch {
    // 归档读不到（首次启动、目录未建）不是错误：解释仍可给「尚未确认」
    return [];
  }
}

/** 读取元数据：freshness 与 contentStatus 是两件事，可以同时「证据不足且过期」 */
function metaFor(explanation, observations) {
  const used = referencedInstrumentIds(explanation, { directionalOnly: true });
  // 只关心「这次解释真的会用到」的指标：机制库没声明的序列（例如只服务沪金折算的
  // 汇率）既不参与判定，也不该出现在背景提示里
  const relevance = new Set([explanation?.assetId].filter(Boolean));
  for (const m of mechanismsFor(explanation?.assetId)) {
    if (m.from) relevance.add(m.from);
    for (const req of m.requires ?? []) relevance.add(req.instrument);
  }
  const all = observationQualityList(observations).filter((o) => relevance.has(o.instrumentId));
  const list = all.filter((o) => used.size === 0 || used.has(o.instrumentId));
  const fresh = assessExplanationFreshness({ observations: list, asOf: new Date().toISOString() });
  // 背景指标（历史相关 / 共同驱动 / 没有判定的渠道）里的过期项：不计入总体新鲜度，
  // 但要能看见，不能假装它们是最新的
  const backgroundStale = assessExplanationFreshness({
    observations: all.filter((o) => !used.has(o.instrumentId)),
    asOf: new Date().toISOString(),
  })
    .details.filter((d) => d.status === 'stale')
    .map((d) => d.instrumentId);
  return {
    evaluatedAt: new Date().toISOString(),
    freshness: fresh.freshness,
    freshnessReasons: fresh.freshnessReasons,
    refreshStatus: 'idle',
    contentStatus: explanation?.contentStatus ?? null,
    // 背景指标过期（不影响结论可读性，但界面要照实说）
    backgroundStale,
    storage: explanationStorageStatus(),
  };
}

/** 由已存快照重建 observations 质量视图（读取历史版本时用） */
function qualityListFromSnapshot(explanation) {
  const seen = new Map();
  for (const f of explanation.facts ?? []) {
    if (!f.instrumentId) continue;
    seen.set(f.instrumentId, {
      instrumentId: f.instrumentId,
      lastObservedAt: f.window?.end ?? null,
      frequency: instrumentDefinition(f.instrumentId)?.frequency ?? 'daily',
      quality: {},
    });
  }
  return [...seen.values()];
}

/**
 * 读取某资产 + 窗口的解释。
 *
 * @param {{ asset:string, windowKey:string, force?:boolean, observations?:Map }} options
 *        `observations` 用于注入（测试、回放）：给了就不再打上游。
 * @returns {{ status:number, body:object }}
 */
export async function getExplanationResponse({
  asset,
  windowKey,
  force = false,
  observations: injected = null,
  // 事件证据：{ eventId, revision, shockType? }。缺省为「窗口内没有已分类事件」，
  // 事件型机制（供给受阻 / 需求增强）因此只能是「尚未确认」，不会默认成立。
  eventEvidence = null,
} = {}) {
  if (!explanationAssetIds().includes(asset)) {
    return { status: 400, body: { ok: false, error: `不支持的资产：${asset ?? '(空)'}` } };
  }
  if (!WINDOW_KEYS.includes(windowKey)) {
    return { status: 400, body: { ok: false, error: `不支持的窗口：${windowKey ?? '(空)'}` } };
  }

  const cacheKey = `${asset}|${windowKey}`;
  const injectedAny = Boolean(injected) || Array.isArray(eventEvidence);
  const hit = explanationCache.get(cacheKey);
  if (!force && !injectedAny && hit && Date.now() - hit.at < EXPLANATION_CACHE_TTL_MS) {
    return {
      status: 200,
      body: {
        schemaVersion: EXPLANATION_SCHEMA_VERSION,
        explanation: hit.explanation,
        meta: metaFor(hit.explanation, hit.observations),
      },
    };
  }

  let observations;
  let eventsResolved;
  try {
    observations = injected ?? (await loadAssetObservations(asset, { force }));
    // 事件证据与观测一起取：事件型渠道没有它只能「尚未确认」
    eventsResolved = Array.isArray(eventEvidence)
      ? eventEvidence
      : await loadEventEvidence(asset, windowKey, { nowMs: Date.now() }).catch(() => []);
  } catch (err) {
    const stale = latestExplanation({ assetId: asset, windowKey });
    if (stale?.explanation) {
      return {
        status: 200,
        body: {
          schemaVersion: EXPLANATION_SCHEMA_VERSION,
          explanation: stale.explanation,
          meta: { ...metaFor(stale.explanation, new Map()), freshness: 'stale', freshnessReasons: ['SOURCE_UNAVAILABLE'], refreshStatus: 'failed' },
        },
      };
    }
    return {
      status: 503,
      body: {
        ok: false,
        error: '解释服务暂时不可用',
        meta: { evaluatedAt: new Date().toISOString(), freshness: 'unavailable', refreshStatus: 'failed', retryAfterMs: 5000 },
      },
    };
  }

  /**
   * 把「这一天的最新修订号」挂到观测上。
   *
   * 为什么在组合之前挂：解释里引用的观测 id 要指向**当时那一版**。
   * 落库时若发现同一 (指标, 日期) 的值变了，会写 `#rN` 的新行；
   * 这里读回最新的那一版，让新解释引用它，而不是继续引用 r1。
   * 库不可用时静默降级（revisionOf 缺失 → id 退回 `指标@日期`）。
   */
  try {
    const revisionOf = (instrumentId, date) => {
      const row = latestObservationFor(instrumentId, date);
      return row ? row.revision : null;
    };
    for (const [, obs] of observations) {
      obs.revisionOf = revisionOf;
      const dates = obs?.series?.dates ?? [];
      const revs = dates.map((d) => revisionOf(obs.instrumentId ?? '', d)).filter((x) => x != null);
      obs.revision = revs.length ? Math.max(...revs) : 1;
    }
  } catch {
    /* 读修订失败不影响解释生成 */
  }

  const targetObs = observations.get(asset);
  const hasTarget = !!targetObs?.series?.dates?.length;
  if (!hasTarget) {
    // 目标资产一条观测都没有：这是「正在准备」，不是 500
    const stale = latestExplanation({ assetId: asset, windowKey });
    if (stale?.explanation) {
      return {
        status: 200,
        body: {
          schemaVersion: EXPLANATION_SCHEMA_VERSION,
          explanation: stale.explanation,
          meta: { ...metaFor(stale.explanation, observations), freshness: 'stale', refreshStatus: 'pending' },
        },
      };
    }
    return {
      status: 202,
      body: {
        schemaVersion: EXPLANATION_SCHEMA_VERSION,
        explanation: null,
        meta: {
          evaluatedAt: new Date().toISOString(),
          freshness: 'unavailable',
          freshnessReasons: ['NO_OBSERVATION'],
          refreshStatus: 'pending',
          retryAfterMs: 3000,
        },
      },
    };
  }

  // 指纹带上窗口起止：起点那格被修订时，旧快照必须失效
  const fpAnchor = targetObs?.series
    ? (() => {
        const spec0 = windowSpec(windowKey) ?? windowSpec('session');
        const ch = computeChange(targetObs.series, {
          comparisonPolicy: instrumentDefinition(asset)?.comparisonPolicy,
          observations: spec0.observations,
        });
        return ch ? { start: ch.start, end: ch.end } : null;
      })()
    : null;
  const fingerprint = explanationFingerprint({
    assetId: asset,
    windowKey,
    observations,
    events: eventsResolved,
    windowSpan: fpAnchor,
  });
  const existingId = explanationIdByFingerprint(fingerprint);
  if (existingId) {
    const stored = readExplanation(existingId);
    if (stored?.explanation) {
      explanationCache.set(cacheKey, { at: Date.now(), explanation: stored.explanation, observations });
      return {
        status: 200,
        body: { schemaVersion: EXPLANATION_SCHEMA_VERSION, explanation: stored.explanation, meta: metaFor(stored.explanation, observations) },
      };
    }
  }

  const generatedAt = new Date().toISOString();
  const id = explanationIdFor(asset, windowKey, fingerprint);
  const explanation = buildExplanation({
    assetId: asset,
    windowKey,
    observations,
    events: eventsResolved,
    asOf: generatedAt,
    generatedAt,
    id,
    fingerprint,
  });

  let invalidObservations = 0;
  try {
    const obsResult = persistReferencedObservations(explanation, observations, { knownAt: generatedAt });
    invalidObservations = obsResult?.rejected?.length ?? 0;
    if (invalidObservations) {
      // 不通过契约校验的观测不进库，但必须留下痕迹（方案 E04：不许静默丢数据）
      console.warn(
        `[explanations] ${invalidObservations} 条观测未通过契约校验：`,
        obsResult.rejected.slice(0, 3).map((r) => `${r.instrumentId}@${r.observedAt} ${r.errors[0]}`).join('; '),
      );
    }
    // 事件引用必须先落库，否则 writeExplanation 的引用校验会拒绝这次快照
    persistReferencedEvents(explanation, eventsResolved, { knownAt: generatedAt });
    writeExplanation({ explanation });
  } catch (err) {
    // 写库失败不该让用户看不到内容：返回快照但明确标持久化失败
    console.warn('[explanations] 快照写入失败', err?.message ?? err);
    explanationCache.set(cacheKey, { at: Date.now(), explanation, observations });
    return {
      status: 200,
      body: {
        schemaVersion: EXPLANATION_SCHEMA_VERSION,
        explanation,
        meta: { ...metaFor(explanation, observations), persistence: 'failed', persistenceError: String(err?.message ?? err) },
      },
    };
  }

  explanationCache.set(cacheKey, { at: Date.now(), explanation, observations });
  const meta = metaFor(explanation, observations);
  if (invalidObservations) meta.invalidObservations = invalidObservations;
  return {
    status: 200,
    body: { schemaVersion: EXPLANATION_SCHEMA_VERSION, explanation, meta },
  };
}

/** 读固定版本：返回不可变快照，不改内容、不自动换新版本 */
/** 某资产 + 窗口的历史快照列表（C3）。只读快照，不重算 */
export function getExplanationHistory({ asset, windowKey, limit = 20 } = {}) {
  if (!explanationAssetIds().includes(asset)) {
    return { status: 400, body: { ok: false, error: `不支持的资产：${asset ?? '(空)'}` } };
  }
  if (!WINDOW_KEYS.includes(windowKey)) {
    return { status: 400, body: { ok: false, error: `不支持的窗口：${windowKey ?? '(空)'}` } };
  }
  const items = listExplanationHistory({ assetId: asset, windowKey, limit });
  return {
    status: 200,
    body: {
      schemaVersion: EXPLANATION_SCHEMA_VERSION,
      assetId: asset,
      windowKey,
      count: items.length,
      items,
    },
  };
}

/**
 * 解释变化记录（产品 2.2）。
 *
 * 取两版快照做比较：`with` 省略时自动取「同一资产同一窗口的上一版」——
 * 用户问的是「和上一版差在哪」，让他先去找版本号是没必要的。
 *
 * 比较逻辑在 domain/explanations/diff.js（纯函数），这里只负责取数与
 * 把「为什么变了」的必要上下文带上。
 */
export function compareExplanations({ afterId, beforeId = null, asset = null, windowKey = null } = {}) {
  const after = readExplanation(afterId);
  if (!after?.explanation) return { status: 404, body: { ok: false, error: `未知解释版本：${afterId}` } };

  let before = null;
  if (beforeId) {
    before = readExplanation(beforeId);
    if (!before?.explanation) return { status: 404, body: { ok: false, error: `未知解释版本：${beforeId}` } };
  } else {
    // 没指定对比版本：取同资产同窗口的上一版
    const targetAsset = asset ?? after.explanation.assetId;
    // 快照里的 window 是 { key, label }，不是字符串：直接传对象会查不到历史
    const targetWindow = windowKey ?? after.explanation.window?.key ?? 'session';
    const history = listExplanationHistory({ assetId: targetAsset, windowKey: targetWindow, limit: 50 });
    const idx = history.findIndex((h) => h.id === afterId);
    const prev = idx >= 0 ? history[idx + 1] : null;
    if (prev?.id) before = readExplanation(prev.id);
  }

  if (!before?.explanation) {
    return {
      status: 200,
      body: {
        schemaVersion: EXPLANATION_SCHEMA_VERSION,
        ok: true,
        status: 'no-previous',
        after: { id: after.explanation.id, generatedAt: after.explanation.generatedAt ?? null },
        before: null,
        diff: null,
        message: '这是该资产该窗口的第一版解释，没有可比的历史版本',
      },
    };
  }

  const diff = diffExplanations(before.explanation, after.explanation);
  return {
    status: 200,
    body: {
      schemaVersion: EXPLANATION_SCHEMA_VERSION,
      ok: true,
      status: diff.status,
      after: diff.after,
      before: diff.before,
      diff,
      summary: summarizeDiff(diff),
      /**
       * 两版之间隔了多久很重要：「10 分钟内变了」与「隔三天变了」含义不同。
       * 这里给毫秒差，界面自己决定怎么显示。
       */
      gapMs: (() => {
        const a = Date.parse(after.explanation.generatedAt ?? '');
        const b = Date.parse(before.explanation.generatedAt ?? '');
        return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : null;
      })(),
    },
  };
}

export function getExplanationById(id) {
  const stored = readExplanation(id);
  if (!stored?.explanation) return { status: 404, body: { ok: false, error: `未知解释版本：${id}` } };
  const list = qualityListFromSnapshot(stored.explanation);
  const fresh = assessExplanationFreshness({ observations: list, asOf: new Date().toISOString() });
  return {
    status: 200,
    body: {
      schemaVersion: EXPLANATION_SCHEMA_VERSION,
      explanation: stored.explanation,
      meta: {
        evaluatedAt: new Date().toISOString(),
        freshness: fresh.freshness,
        freshnessReasons: fresh.freshnessReasons,
        refreshStatus: 'idle',
        historical: true,
      },
    },
  };
}

/** 测试用：清缓存 */
export function clearExplanationCache() {
  explanationCache.clear();
}

/** 首页问题卡要用的待解释资产 */
export function questionCandidates() {
  return EXPLAINABLE_ASSETS.filter((a) => a.enabled).map((a) => ({
    assetId: a.id,
    name: a.name,
    drivers: GOLD_DRIVERS,
    windows: WINDOW_KEYS,
  }));
}

export { WINDOW_SPECS };
