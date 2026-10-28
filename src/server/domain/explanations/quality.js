/* ================================================================== *
 * 数据质量：这个窗口能不能拿来解释
 *
 * 三件事要分开说，之前它们被混成一句「数据过期」：
 *   1. 不是实时（日频数据天然滞后）—— 正常状态，不是故障；
 *   2. 已超过该频率的正常更新周期 —— 真的过期，要标出来并说明原因；
 *   3. 拿不到或不可比 —— 这个窗口不能用，解释只能给一般机制。
 *
 * 「刚抓取」不等于「新数据」：fetchedAt 是系统动作时间，observedAt 才是
 * 市场观测时间。这里所有判断都基于 observedAt，绝不拿 fetchedAt 充当新鲜度。
 *
 * 纯函数，now / asOf 全部由调用方注入。
 * ================================================================== */

const DAY_MS = 86_400_000;

/**
 * 各频率的「正常更新周期」容忍窗口（日历日）。
 * 日频给 4 天：覆盖周末 + 一个假日；超过就说明源真的停了。
 */
export const FRESHNESS_TOLERANCE_DAYS = {
  intraday: 1,
  daily: 4,
  weekly: 10,
  monthly: 45,
  quarterly: 120,
};

export const FRESHNESS_REASON_TEXT = {
  DAILY_NATURAL_LAG: '日频数据按发布周期更新，本身不是实时行情',
  BEYOND_UPDATE_CYCLE: '已超过该数据的正常更新周期，可能源侧停更或抓取失败',
  NO_OBSERVATION: '窗口内没有任何观测',
  FALLBACK_TO_CACHE: '上游全部失败，这里是库里的旧序列',
  SOURCE_UNAVAILABLE: '该指标当前没有可用来源',
  UNALIGNED_WINDOW: '与目标资产缺少共同时间窗的观测',
};

/** 解析成毫秒时间；不可解析返回 null（不猜） */
export function parseInstant(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

/**
 * 单个指标的观测质量。
 *
 * @param {object} obs { instrumentId, lastObservedAt, frequency, quality }
 * @param {{ asOf?: string, now?: number }} opts
 */
export function assessObservationQuality(obs, opts = {}) {
  const asOfMs = parseInstant(opts.asOf) ?? opts.now ?? Date.now();
  const lastMs = parseInstant(obs?.lastObservedAt);
  const frequency = obs?.frequency ?? 'daily';
  const tolerance = FRESHNESS_TOLERANCE_DAYS[frequency] ?? FRESHNESS_TOLERANCE_DAYS.daily;
  const reasons = [];

  if (lastMs == null) {
    return {
      instrumentId: obs?.instrumentId ?? null,
      status: 'unavailable',
      ageDays: null,
      toleranceDays: tolerance,
      reasons: ['NO_OBSERVATION'],
      reasonText: [FRESHNESS_REASON_TEXT.NO_OBSERVATION],
      notRealtime: frequency !== 'intraday',
    };
  }

  const ageDays = Math.max(0, (asOfMs - lastMs) / DAY_MS);
  const fellBack = !!obs?.quality?.fellBack;
  if (fellBack) reasons.push('FALLBACK_TO_CACHE');
  const beyond = ageDays > tolerance;
  if (beyond) reasons.push('BEYOND_UPDATE_CYCLE');
  else if (frequency !== 'intraday') reasons.push('DAILY_NATURAL_LAG');

  return {
    instrumentId: obs?.instrumentId ?? null,
    status: beyond ? 'stale' : 'fresh',
    ageDays: Number(ageDays.toFixed(2)),
    toleranceDays: tolerance,
    reasons,
    reasonText: reasons.map((r) => FRESHNESS_REASON_TEXT[r] ?? r),
    // 「不是实时」是日频数据的常态，界面要能单独表达这一点
    notRealtime: frequency !== 'intraday',
  };
}

/**
 * 整个解释快照的读取新鲜度。
 *
 * 依据是「解释所能用的最新观测」里最旧的那一条：只要有一个必需指标已经
 * 超过更新周期，这次解释就不适合当作当前状态阅读。
 *
 * 与 contentStatus 独立：一个刚生成、证据不足的解释也可以是 fresh。
 */
export function assessExplanationFreshness({ observations = [], asOf, now } = {}) {
  if (!observations.length) {
    return { freshness: 'unavailable', freshnessReasons: ['NO_OBSERVATION'], details: [] };
  }
  const details = observations.map((o) => assessObservationQuality(o, { asOf, now }));
  const stale = details.filter((d) => d.status === 'stale');
  const usable = details.filter((d) => d.status !== 'unavailable');
  if (!usable.length) {
    return { freshness: 'unavailable', freshnessReasons: ['NO_OBSERVATION'], details };
  }
  if (stale.length) {
    return {
      freshness: 'stale',
      freshnessReasons: [...new Set(stale.flatMap((d) => d.reasons))],
      details,
    };
  }
  return { freshness: 'fresh', freshnessReasons: [], details };
}

/**
 * 某个窗口是否适合做解释（而不是只画图）。
 *
 * 返回 usable=false 时 reasons 必须非空 —— 调用方据此写进 unknowns，
 * 界面显示「证据不足」而不是一个看起来正常的解释。
 */
export function assessWindowUsability({ paired, windowKey, drivers = [] } = {}) {
  const reasons = [];
  if (!paired?.comparable) {
    reasons.push(...(paired?.reasons?.length ? paired.reasons : ['UNALIGNED_WINDOW']));
  } else if (windowKey === 'session' && paired.n < 2) {
    reasons.push('INSUFFICIENT_COMMON_DATES');
  }
  const unavailable = drivers.filter((d) => d.status === 'unavailable').map((d) => d.instrumentId);
  const stale = drivers.filter((d) => d.status === 'stale').map((d) => d.instrumentId);
  return {
    usable: reasons.length === 0,
    reasons,
    unavailableDrivers: unavailable,
    staleDrivers: stale,
  };
}
