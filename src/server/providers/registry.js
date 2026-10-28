/* ================================================================== *
 * 来源注册表（方案 E04 / §7.1）
 *
 * 一张表回答「这个来源是什么、能不能用、多久刷一次、什么时候必须停用」。
 * 以前这些信息散在四个 service 的常量与 if 里：同一个源在一个地方超时 8s、
 * 另一个地方 12s，谁也说不清哪个才是真的。
 *
 * 这里只放**声明**，不放实现：
 *   · id            稳定标识，与 events 的 sourceKey / 指标来源前缀一致
 *   · kinds         支持的指标类型（quote 报价 / series 日频序列 / news 资讯 / econ 日历）
 *   · params        查询参数形状（超时、并发、预算），由调度与 HTTP 层读取
 *   · capabilities  能力开关（要不要 Referer、有没有缓存兜底、能否断点续抓）
 *   · cache         两级时间：refreshMs（多久刷）与 maxServeAgeMs（多久后不能再
 *                   当作当前数据；超过就只作历史记录，见 §3.3 World Monitor）
 *   · auth          是否需要凭据。需要凭据而没配 → 该源记为 unavailable，不静默跳过
 *
 * 与 adapters 的关系：适配器实现 `fetch → parse → Observation[]`，注册表负责
 * 「允不允许调用、调用几次、失败了怎么退」。契约测试只认注册表里的声明，
 * 所以加新源必须两步都做，漏一步测试就会红。
 * ================================================================== */

/** @typedef {'quote'|'series'|'news'|'econ'} SourceKind */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * 每个源的两级时间：
 *   refreshMs      —— 调度器两次抓取之间的最小间隔
 *   maxServeAgeMs  —— 超过这个年龄的数据不能再说「这是当前值」
 *
 * 后者按「来源频率 + 用途」定，不是拍脑袋：报价 15s 级给 5 分钟容错（盘中
 * 偶尔断连不该立刻判死），日频序列给 10 天（覆盖长假 + 源延迟），日历给
 * 30 天（一个月内的日程都还算有效）。
 */
export const SOURCES = {
  sina: {
    id: 'sina',
    label: '新浪财经',
    kinds: ['quote', 'series'],
    params: { timeoutMs: 8_000, concurrency: 4, budgetPerMinute: 240 },
    capabilities: { requiresReferer: true, htmlFallback: false, resumable: false },
    cache: { refreshMs: 15_000, maxServeAgeMs: 5 * MINUTE },
    auth: { required: false },
    notes: '国内行情主源；不带 Referer 会被拦，所以注册表显式声明 requiresReferer。',
  },
  tencent: {
    id: 'tencent',
    label: '腾讯行情',
    kinds: ['quote'],
    params: { timeoutMs: 8_000, concurrency: 4, budgetPerMinute: 120 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 15_000, maxServeAgeMs: 5 * MINUTE },
    auth: { required: false },
    notes: '港股指数在部分时段只有这条腿是活的。',
  },
  eastmoney: {
    id: 'eastmoney',
    label: '东方财富',
    kinds: ['quote'],
    params: { timeoutMs: 8_000, concurrency: 4, budgetPerMinute: 180 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 15_000, maxServeAgeMs: 5 * MINUTE },
    auth: { required: false },
  },
  cnbc: {
    id: 'cnbc',
    label: 'CNBC',
    kinds: ['quote'],
    params: { timeoutMs: 10_000, concurrency: 3, budgetPerMinute: 120 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 30_000, maxServeAgeMs: 10 * MINUTE },
    auth: { required: false },
    notes: '全球股指主源，境外时段的唯一活口之一。',
  },
  cboe: {
    id: 'cboe',
    label: 'CBOE',
    kinds: ['quote', 'series'],
    params: { timeoutMs: 10_000, concurrency: 2, budgetPerMinute: 60 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 60_000, maxServeAgeMs: 30 * MINUTE },
    auth: { required: false },
    notes: 'VIX 系列；CSV 直出，行数不足要判失败（CBOE_MIN_ROWS）。',
  },
  fred: {
    id: 'fred',
    label: 'FRED',
    kinds: ['series'],
    params: { timeoutMs: 12_000, concurrency: 2, budgetPerMinute: 60 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: true },
    cache: { refreshMs: 6 * HOUR, maxServeAgeMs: 10 * 24 * HOUR },
    auth: { required: false, envKey: null },
    notes: '日频宏观序列；负值与零是合法观测（DFII10 长期为负），不能被当成缺失。',
  },
  yahoo: {
    id: 'yahoo',
    label: 'Yahoo Finance',
    kinds: ['quote'],
    params: { timeoutMs: 10_000, concurrency: 3, budgetPerMinute: 90 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 30_000, maxServeAgeMs: 15 * MINUTE },
    auth: { required: false },
  },
  binance: {
    id: 'binance',
    label: 'Binance',
    kinds: ['quote', 'series'],
    params: { timeoutMs: 8_000, concurrency: 2, budgetPerMinute: 60 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 15_000, maxServeAgeMs: 5 * MINUTE },
    auth: { required: false },
    notes: '7×24，没有休市概念：陈旧判定只看年龄，不看交易日历。',
  },
  coinbase: {
    id: 'coinbase',
    label: 'Coinbase',
    kinds: ['quote'],
    params: { timeoutMs: 8_000, concurrency: 2, budgetPerMinute: 60 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 30_000, maxServeAgeMs: 10 * MINUTE },
    auth: { required: false },
  },
  goldapi: {
    id: 'goldapi',
    label: 'GoldAPI',
    kinds: ['quote'],
    params: { timeoutMs: 10_000, concurrency: 1, budgetPerMinute: 30 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 60_000, maxServeAgeMs: 30 * MINUTE },
    auth: { required: true, envKey: 'GOLDAPI_KEY' },
    notes: '需要 key 的源：没配就记 unavailable，而不是悄悄退化成「没有这个源」。',
  },
  // ---- 资讯 ----
  jin10: {
    id: 'jin10',
    label: '金十数据',
    kinds: ['news'],
    params: { timeoutMs: 10_000, concurrency: 2, budgetPerMinute: 30 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 60_000, maxServeAgeMs: 30 * MINUTE },
    auth: { required: false },
  },
  wscn: {
    id: 'wscn',
    label: '华尔街见闻',
    kinds: ['news'],
    params: { timeoutMs: 10_000, concurrency: 2, budgetPerMinute: 30 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 60_000, maxServeAgeMs: 30 * MINUTE },
    auth: { required: false },
  },
  'google-news': {
    id: 'google-news',
    label: 'Google News 多语种聚合',
    kinds: ['news'],
    params: { timeoutMs: 12_000, concurrency: 8, budgetPerMinute: 120 },
    capabilities: { requiresReferer: false, htmlFallback: false, resumable: false },
    cache: { refreshMs: 120_000, maxServeAgeMs: 60 * MINUTE },
    auth: { required: false },
    notes: '覆盖关停 RSS 的通讯社；guid 偶发被复用到另一条新闻（事件修订里标 retitled）。',
  },
  // ---- 日历 ----
  fed: {
    id: 'fed',
    label: '美联储',
    kinds: ['econ'],
    params: { timeoutMs: 12_000, concurrency: 1, budgetPerMinute: 10 },
    capabilities: { requiresReferer: false, htmlFallback: true, resumable: false },
    cache: { refreshMs: 6 * HOUR, maxServeAgeMs: 30 * 24 * HOUR },
    auth: { required: false },
    notes: 'ICS 失败时官网页面兜底（htmlFallback）。',
  },
  bls: {
    id: 'bls',
    label: '美国劳工统计局',
    kinds: ['econ'],
    params: { timeoutMs: 12_000, concurrency: 1, budgetPerMinute: 10 },
    capabilities: { requiresReferer: false, htmlFallback: true, resumable: false },
    cache: { refreshMs: 6 * HOUR, maxServeAgeMs: 30 * 24 * HOUR },
    auth: { required: false },
  },
};

/** 注册表按 id 取用；未知 id 返回 null（调用方必须显式处理，不许默认通过） */
export function getSource(id) {
  return SOURCES[id] ?? null;
}

/** 某类指标下有哪些源 */
export function sourcesOfKind(kind) {
  return Object.values(SOURCES).filter((s) => s.kinds.includes(kind));
}

/**
 * 某来源此刻可用吗。
 *
 * 返回 {available, reason}：需要凭据而没配 → `unavailable` + 具体缺哪个环境变量。
 * 这条判断要能被页面读到（§7.3「采集质量与页面可用性分别报告」）。
 */
export function sourceAvailability(id, env = process.env) {
  const src = getSource(id);
  if (!src) return { available: false, reason: `未注册的来源：${id}` };
  if (src.auth?.required && src.auth.envKey && !env[src.auth.envKey]) {
    return { available: false, reason: `未配置 ${src.auth.envKey}` };
  }
  return { available: true, reason: null };
}

/**
 * 调度参数：某个来源多久刷一次、超过多久不许再当当前值。
 * 未注册的来源用最保守的默认值（频繁刷新 + 短寿命），逼开发先注册。
 */
export function cachePolicyOf(id) {
  const src = getSource(id);
  if (!src) return { refreshMs: 60_000, maxServeAgeMs: 10 * MINUTE, unregistered: true };
  return { ...src.cache, unregistered: false };
}

/** 注册表自检：字段形状对不对（契约测试与 doctor 都用它） */
export function validateRegistry() {
  const errors = [];
  const seen = new Set();
  for (const [key, src] of Object.entries(SOURCES)) {
    if (src.id !== key) errors.push(`${key}: id 与键不一致（${src.id}）`);
    if (seen.has(src.id)) errors.push(`${key}: id 重复`);
    seen.add(src.id);
    if (!Array.isArray(src.kinds) || !src.kinds.length) errors.push(`${key}: 缺 kinds`);
    for (const kind of src.kinds ?? []) {
      if (!['quote', 'series', 'news', 'econ'].includes(kind)) errors.push(`${key}: 未知 kind ${kind}`);
    }
    for (const field of ['timeoutMs', 'concurrency', 'budgetPerMinute']) {
      const v = src.params?.[field];
      if (!Number.isFinite(v) || v <= 0) errors.push(`${key}: params.${field} 必须是正数`);
    }
    for (const field of ['refreshMs', 'maxServeAgeMs']) {
      const v = src.cache?.[field];
      if (!Number.isFinite(v) || v <= 0) errors.push(`${key}: cache.${field} 必须是正数`);
    }
    if (src.cache && src.cache.maxServeAgeMs < src.cache.refreshMs) {
      errors.push(`${key}: maxServeAgeMs 小于 refreshMs（数据还没刷新就先判死亡）`);
    }
    if (src.auth?.required && !src.auth.envKey) errors.push(`${key}: 声明需要凭据但没写 envKey`);
  }
  return errors;
}
