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
import { readDailyCache, writeDailyCache } from '../db/index.js';
import {
  writeExplanation,
  writeObservationRevisions,
  readExplanation,
  latestExplanation,
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
import { WINDOW_KEYS, WINDOW_SPECS, windowSpec } from '../domain/explanations/alignment.js';
import { assessExplanationFreshness } from '../domain/explanations/quality.js';
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
export function explanationFingerprint({ assetId, windowKey, observations }) {
  const parts = [assetId, windowKey, MECHANISM_LIBRARY_VERSION, CALCULATION_VERSION, LANGUAGE_VERSION];
  const ids = [...observations.keys()].sort();
  for (const id of ids) {
    const obs = observations.get(id);
    const last = obs?.series?.dates?.length ? obs.series.dates[obs.series.dates.length - 1] : 'none';
    const lastVal = obs?.series?.values?.length ? obs.series.values[obs.series.values.length - 1] : 'none';
    const fellBack = obs?.quality?.fellBack ? 'fallback' : 'direct';
    parts.push(`${id}:${last}:${lastVal}:${fellBack}`);
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
  const facts = buildFacts({
    targetId: assetId,
    targetDefinition: assetDefinition,
    targetSeries: targetObs?.series ?? null,
    drivers: [...observations.entries()].filter(([id]) => id !== assetId && relevance.has(id)),
    windowKey,
  });

  const hypotheses = mechanisms.map((m) =>
    evaluateMechanism(m, observations, { windowKey, eventEvidence: events }),
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
export function persistReferencedObservations(explanation, observations, { knownAt } = {}) {
  const wanted = new Set();
  for (const f of explanation.facts ?? []) for (const id of f.observationIds ?? []) wanted.add(id);
  for (const h of explanation.hypotheses ?? []) {
    for (const e of h.evidence ?? []) for (const id of e.observationIds ?? []) wanted.add(id);
  }
  const records = [];
  for (const [instrumentId, obs] of observations) {
    const dates = obs?.series?.dates ?? [];
    for (const date of dates) {
      const id = observationIdOf(instrumentId, date);
      if (!wanted.has(id)) continue;
      const idx = dates.indexOf(date);
      records.push({
        id,
        logicalKey: id,
        instrumentId,
        observedAt: date,
        publishedAt: null,
        fetchedAt: knownAt ?? new Date().toISOString(),
        knownAt: knownAt ?? new Date().toISOString(),
        value: obs.series.values[idx],
        unit: obs.definition?.unit ?? null,
        valueDomain: obs.definition?.valueDomain ?? 'positive',
        revision: 1,
        quality: obs.quality ?? null,
        sourceRef: obs.source ?? null,
      });
    }
  }
  return writeObservationRevisions(records);
}

/**
 * 这次解释**实际引用**到的指标集合。
 *
 * 为什么不用「加载到的全部指标」算新鲜度：一个没有被任何事实或证据引用的
 * 辅助序列（例如只服务于内外盘折算的美元兑人民币）落后几天，不该让整张
 * 黄金解释变成「已过期」—— 那会把「有个旁支数据旧了」误报成「这次结论不可读」。
 */
export function referencedInstrumentIds(explanation) {
  const ids = new Set();
  for (const f of explanation?.facts ?? []) if (f.instrumentId) ids.add(f.instrumentId);
  for (const h of explanation?.hypotheses ?? []) {
    for (const e of h.evidence ?? []) if (e.instrumentId) ids.add(e.instrumentId);
  }
  return ids;
}

/** 读取元数据：freshness 与 contentStatus 是两件事，可以同时「证据不足且过期」 */
function metaFor(explanation, observations) {
  const used = referencedInstrumentIds(explanation);
  const list = observationQualityList(observations).filter((o) => used.size === 0 || used.has(o.instrumentId));
  const fresh = assessExplanationFreshness({ observations: list, asOf: new Date().toISOString() });
  return {
    evaluatedAt: new Date().toISOString(),
    freshness: fresh.freshness,
    freshnessReasons: fresh.freshnessReasons,
    refreshStatus: 'idle',
    contentStatus: explanation?.contentStatus ?? null,
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
  try {
    observations = injected ?? (await loadAssetObservations(asset, { force }));
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

  const fingerprint = explanationFingerprint({ assetId: asset, windowKey, observations });
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
    events: Array.isArray(eventEvidence) ? eventEvidence : [],
    asOf: generatedAt,
    generatedAt,
    id,
    fingerprint,
  });

  try {
    persistReferencedObservations(explanation, observations, { knownAt: generatedAt });
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
  return {
    status: 200,
    body: { schemaVersion: EXPLANATION_SCHEMA_VERSION, explanation, meta: metaFor(explanation, observations) },
  };
}

/** 读固定版本：返回不可变快照，不改内容、不自动换新版本 */
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
