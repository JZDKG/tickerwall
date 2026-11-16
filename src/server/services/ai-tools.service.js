/* ================================================================== *
 * AI 只读工具集（Milestone 2）
 *
 * 模型不能直接看数据库或上游：所有事实必须经这里取，返回值统一为
 *   { ok, source, asOf, stale, staleReason, data, note }
 * —— source / asOf / stale 是回答里必须能复述的「数据口径」，不是可选装饰。
 *
 * 设计约束：
 *   · 纯只读，不写库、不触发采集；
 *   · 全部依赖可注入（单测不碰网络与仓库 data/）；
 *   · 大数组一律裁剪（history / 日线 / 分时点 / 宏观 recent 400×13 矩阵）；
 *   · 单工具超时默认 15s，未知工具返回 ok:false，绝不把异常抛给编排层。
 * ================================================================== */

import { getQuotes } from './quotes.service.js';
import { getDetail } from './detail.service.js';
import { getMacro } from './macro.service.js';
import { getExplanationResponse } from './explanations.service.js';
import { mechanismsFor } from '../domain/explanations/mechanisms.js';
import { getGoldComparison } from './comparison.service.js';
import { getEventHistory, getEvents } from './events.service.js';
import { getCalendar, getEventStudy } from './calendar.service.js';
import { getTodayFocus } from './today-focus.service.js';
import { getExpectationLedger } from './expectations.service.js';
import { buildBriefing } from '../domain/briefing-calc.js';
import { getLifePath } from './life-path.service.js';
import {
  searchAShareStock,
  fetchTencentBatchQuotes,
  fetchTencentKline,
  fetchEmPool,
  fetchEmFundFlowMinute,
  fetchNorthbound,
} from '../providers/a-share.js';

const DEFAULT_TOOL_TIMEOUT_MS = 15_000;
const MAX_EVENTS = 40;
const MAX_BARS = 120;
const MAX_CODES = 20;

const DAY_WINDOWS = new Set(['session', '5d', '1m']);
const GOLD_WINDOWS = new Set(['session', '5d', '20d']);
const KLINE_PERIODS = new Set(['day', 'week', 'month', 'm5', 'm15', 'm30', 'm60']);
const KLINE_ADJUSTS = new Set(['qfq', 'hfq', 'day']);
const POOL_KINDS = new Set(['zt', 'zb', 'dt', 'yzt']);
const EVENT_LEVELS = new Set(['high', 'mid', 'low']);

/* ------------------------------ 通用工具 ------------------------------ */

const objectOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const strOf = (v) => (typeof v === 'string' ? v.trim() : '');
const isoOf = (ms) => {
  const n = Number(ms);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
};
const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function beijingDateCompact(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(ms))
    .replace(/-/g, '');
}

function envelope({ source = null, asOf = null, stale = false, staleReason = null, data = null, note = null } = {}) {
  return { ok: true, source, asOf, stale: Boolean(stale), staleReason, data, note };
}

function failEnvelope(message, extra = {}) {
  return {
    ok: false,
    source: null,
    asOf: null,
    stale: false,
    staleReason: null,
    data: null,
    note: null,
    error: String(message ?? '工具执行失败'),
    ...extra,
  };
}

function normalizeEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return failEnvelope('工具未返回结果');
  const base = {
    ok: raw.ok !== false,
    source: raw.source ?? null,
    asOf: raw.asOf ?? null,
    stale: Boolean(raw.stale),
    staleReason: raw.staleReason ?? null,
    data: raw.data ?? null,
    note: raw.note ?? null,
  };
  return raw.ok === false ? { ...base, error: raw.error ?? '工具执行失败' } : base;
}

function abortableTimeout(promise, timeoutMs, signal) {
  if (signal?.aborted) return Promise.reject(new Error('已取消'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`工具执行超时（${timeoutMs}ms）`)), timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('已取消'));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        reject(err);
      },
    );
  });
}

/* ------------------------------ 裁剪函数 ------------------------------ */

function trimFreshness(freshness) {
  if (!freshness || typeof freshness !== 'object') return null;
  return {
    label: freshness.label ?? null,
    level: freshness.level ?? null,
    ageMs: freshness.ageMs ?? null,
    dataTime: freshness.dataTime ?? null,
    suspect: Boolean(freshness.suspect),
  };
}

function trimMarketStatus(status) {
  if (!status || typeof status !== 'object') return null;
  return {
    market: status.market ?? null,
    open: Boolean(status.open),
    label: status.label ?? null,
    phase: status.phase ?? null,
    nextOpenAt: status.nextOpenAt ?? null,
    nextCloseAt: status.nextCloseAt ?? null,
  };
}

/** 报价行：丢掉 history 环形数组与 extras，保留判断新鲜度所需的字段 */
function trimQuote(item) {
  if (!item || typeof item !== 'object') return item;
  return {
    id: item.id ?? null,
    name: item.name ?? null,
    unit: item.unit ?? null,
    price: item.price ?? null,
    change: item.change ?? null,
    changePct: item.changePct ?? null,
    source: item.source ?? null,
    fallback: Boolean(item.fallback),
    stale: Boolean(item.stale),
    freshness: trimFreshness(item.freshness),
    marketStatus: trimMarketStatus(item.marketStatus),
    ok: item.ok !== false,
    error: item.error ?? null,
  };
}

function trimMechanism(m) {
  if (!m || typeof m !== 'object') return m;
  return {
    id: m.id,
    label: m.label ?? null,
    plain: m.plain ?? null,
    mechanism: m.mechanism ?? null,
    sign: m.sign ?? null,
    relationType: m.relationType ?? null,
    from: m.from ?? null,
    to: m.to ?? null,
    horizon: m.horizon ?? null,
    requires: m.requires ?? [],
    conditionCodes: m.conditionCodes ?? [],
    exclusions: m.exclusions ?? [],
  };
}

function trimCalendarEvent(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  return {
    date: ev.date ?? null,
    time: ev.time ?? null,
    kind: ev.kind ?? null,
    title: ev.title ?? null,
    importance: ev.importance ?? null,
    source: ev.source ?? null,
    symbols: ev.symbols ?? [],
    expected: ev.expected ?? null,
    previous: ev.previous ?? null,
    actual: ev.actual ?? null,
    unit: ev.unit ?? null,
  };
}

function trimEvent(ev) {
  const topics = Array.isArray(ev?.topics)
    ? ev.topics.map((t) => (typeof t === 'string' ? { key: t, label: t, strong: false } : { key: t.key, label: t.label, strong: Boolean(t.strong) }))
    : [];
  return {
    id: ev?.id ?? null,
    time: ev?.time ?? null,
    title: ev?.title ?? null,
    zh: ev?.zh ?? null,
    level: ev?.level ?? null,
    score: ev?.score ?? null,
    region: ev?.region ?? null,
    topics,
    symbols: Array.isArray(ev?.symbols) ? ev.symbols : [],
    source: ev?.source ?? null,
    publisher: ev?.publisher ?? ev?.sourceName ?? null,
    url: ev?.url ?? null,
  };
}

function trimRule(rule) {
  if (!rule || typeof rule !== 'object') return rule;
  return {
    id: rule.id,
    name: rule.name,
    kind: rule.kind,
    target_id: rule.target_id,
    operator: rule.operator,
    threshold: rule.threshold,
    mode: rule.mode,
    enabled: rule.enabled,
    cooldown_ms: rule.cooldown_ms,
    last_triggered_at: rule.last_triggered_at,
  };
}

function trimAlertEvent(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  return {
    id: ev.id,
    rule_id: ev.rule_id,
    kind: ev.kind,
    target_id: ev.target_id,
    title: ev.title,
    message: ev.message,
    observed_value: ev.observed_value,
    triggered_at: ev.triggered_at,
  };
}

function ladderOf(kind, rows) {
  const counts = new Map();
  for (const row of rows) {
    let label;
    if (kind === 'zt' || kind === 'yzt') {
      const days = Number(kind === 'zt' ? row.limitDays : row.yLimitDays);
      label = Number.isFinite(days) && days >= 2 ? `${days}连板` : '首板';
    } else if (kind === 'dt') {
      const days = Number(row.dtDays);
      label = Number.isFinite(days) && days >= 2 ? `${days}连跌` : '跌停';
    } else {
      label = strOf(row.ztStat) || '炸板';
    }
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      const na = Number.parseInt(a.label, 10) || 1;
      const nb = Number.parseInt(b.label, 10) || 1;
      return nb - na || b.count - a.count;
    });
}

function eventTopicText(topics) {
  if (!Array.isArray(topics)) return '';
  return topics
    .map((t) => (typeof t === 'string' ? t : `${t?.key ?? ''} ${t?.label ?? ''}`))
    .join(' ')
    .toLowerCase();
}

/* ------------------------------ 工具定义 ------------------------------ */

const TOOL_SCHEMAS = [
  {
    name: 'get_global_quotes',
    description:
      '取 Tickerwall 全球行情快照（23 个标的，可指定 ids）。返回价格、涨跌、数据源、是否回退、过期状态、市场开闭市与四大合成比价。询问「现在多少钱」「今天涨跌」时先用它。',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: '标的 ID，如 gold-intl、dxy、us10y；省略则返回全部',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_asset_detail',
    description:
      '取单个标的的详情：最新报价、22 项历史统计、衍生指标、多源对照、市场状态、最近日 K 与分时摘要。需要波动率、52 周高低、均线、回撤或近期走势时使用。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '标的 ID，如 gold-intl' },
        barsLimit: { type: 'integer', minimum: 5, maximum: 120, description: '返回最近多少根日 K，默认 30' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_macro_correlations',
    description:
      '取宏观关联分析：经过 BH 校正的相关对、领先滞后、风险偏好与 VRP。不要臆造相关系数；问「黄金和美元相关性」「谁领先谁」时使用。可只查某个资产相关配对。',
    parameters: {
      type: 'object',
      properties: {
        window: { type: 'integer', minimum: 20, maximum: 5000, description: '回看窗口（交易日/周），默认 250' },
        freq: { type: 'string', enum: ['day', 'week'], description: '日频或周频，默认 day' },
        assetId: { type: 'string', description: '只返回与该资产相关的配对与领先滞后' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_asset_explanation',
    description:
      '取某个标的当期「为什么涨跌」的结构化解释：事实层、假设状态与证据数量、未知项、一般传导机制。问「为什么涨/跌」时先查它；若当期解释未生成，只能引用一般机制并明确说明。',
    parameters: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: '标的 ID，如 gold-intl' },
        window: { type: 'string', enum: ['session', '5d', '1m'], description: '解释窗口，默认 session' },
      },
      required: ['asset'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_gold_comparison',
    description:
      '取国内金价与国际金价的对数拆解：国际金价、美元兑人民币、境内外溢价三因子贡献。问「国内金为什么比国际金涨得多」时使用。',
    parameters: {
      type: 'object',
      properties: {
        window: { type: 'string', enum: ['session', '5d', '20d'], description: '比较窗口，默认 session' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_events_and_news',
    description:
      '搜索最近的事件与快讯，可按关键词、主题、标的、等级与小时数过滤。回答「今天有什么消息/事件」时使用。返回来源与发布时间，转载不重复展开。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '在标题与中文摘要中匹配的关键词' },
        topic: { type: 'string', description: '主题 key 或标签，如 fed、oil' },
        symbol: { type: 'string', description: '关联标的 ID，如 gold-intl' },
        level: { type: 'string', enum: ['high', 'mid', 'low'], description: '事件等级' },
        hours: { type: 'integer', minimum: 1, maximum: 72, description: '回看小时数，默认 24' },
        limit: { type: 'integer', minimum: 1, maximum: 40, description: '最多返回条数，默认 20' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_macro_calendar_and_study',
    description:
      '取宏观日历（今天与未来关键发布）、今日重点、预期账本，以及可选的事件研究统计。回答「接下来有什么数据」「非农对美债影响多大」时使用。',
    parameters: {
      type: 'object',
      properties: {
        includeStudy: { type: 'boolean', description: '是否附带事件研究统计，默认 false' },
        studyKind: { type: 'string', description: '只取某类事件研究，如 cpi、nfp、fomc' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_overnight_briefing_and_alerts',
    description:
      '取隔夜复盘（相对 A 股收盘的变动）、默认生活成本传导链、预警规则与最近 20 条预警事件。回答「隔夜发生了什么」「我的预警触发了吗」时使用。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_a_share',
    description: '按名称、拼音或代码搜索 A 股，返回代码与市场。用户只给公司名时先用它换代码。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '公司名、拼音或代码片段' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: '最多返回条数，默认 10' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_a_share_quotes',
    description:
      '取 1–20 个 A 股的实时快照：价格、涨跌、PE-TTM/静态 PE、PB、市值、换手、涨跌停价、量比与过期状态。',
    parameters: {
      type: 'object',
      properties: {
        codes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20, description: '6 位 A 股代码' },
      },
      required: ['codes'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_a_share_kline',
    description: '取单只 A 股的 K 线（日/周/月/5–60 分钟，前复权/后复权/不复权），附区间涨跌幅与高低点。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '6 位 A 股代码' },
        period: { type: 'string', enum: ['day', 'week', 'month', 'm5', 'm15', 'm30', 'm60'], description: '周期，默认 day' },
        adjust: { type: 'string', enum: ['qfq', 'hfq', 'day'], description: '复权方式，默认 qfq' },
        count: { type: 'integer', minimum: 5, maximum: 120, description: '返回根数，默认 30' },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_a_share_pool',
    description: '取 A 股涨停/炸板/跌停/昨日涨停池，附总数、连板梯队与截断明细。回答「今天涨停多少家」时使用。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['zt', 'zb', 'dt', 'yzt'], description: '池类型，默认 zt（涨停）' },
        date: { type: 'string', description: 'YYYYMMDD，默认北京时间今日' },
        limit: { type: 'integer', minimum: 1, maximum: 60, description: '最多返回条数，默认 30' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_a_share_fund_flow',
    description:
      '取个股分钟资金流（最新累计净额、大单结构、尾盘 5 分钟趋势）与北向资金最新读数。回答「主力在买还是卖」「北向今天流入多少」时使用。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '6 位 A 股代码；省略则只查北向' },
        includeNorthbound: { type: 'boolean', description: '是否附带北向资金，默认 true' },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------ 注册表 ------------------------------ */

/**
 * @param {object} deps 全量可注入；默认使用仓库内的服务与上游 provider。
 */
export function createAiToolRegistry(deps = {}) {
  const d = {
    getQuotes,
    getDetail,
    getMacro,
    getExplanationResponse,
    mechanismsFor,
    getGoldComparison,
    getEventHistory,
    getEvents,
    getCalendar,
    getEventStudy,
    getTodayFocus,
    getExpectationLedger,
    buildBriefing,
    getLifePath,
    searchAShareStock,
    fetchTencentBatchQuotes,
    fetchTencentKline,
    fetchEmPool,
    fetchEmFundFlowMinute,
    fetchNorthbound,
    alertsService: null,
    now: () => Date.now(),
    ...deps,
  };

  const runners = {
    async get_global_quotes(args) {
      const input = objectOf(args);
      const wantIds = Array.isArray(input.ids)
        ? [...new Set(input.ids.map(strOf).filter(Boolean))]
        : [];
      const payload = await d.getQuotes({ force: false });
      const all = Array.isArray(payload?.items) ? payload.items : [];
      const wanted = wantIds.length ? new Set(wantIds) : null;
      const quotes = all.filter((item) => !wanted || wanted.has(item?.id)).map(trimQuote);
      const synthetics = (Array.isArray(payload?.synthetics) ? payload.synthetics : []).map((s) => ({
        id: s.id ?? null,
        name: s.name ?? null,
        formula: s.formula ?? null,
        unit: s.unit ?? null,
        ok: s.ok !== false,
        value: s.value ?? null,
        reason: s.reason ?? null,
      }));
      const staleIds = quotes.filter((q) => q?.stale).map((q) => q.id);
      const missing = wantIds.filter((id) => !all.some((item) => item?.id === id));
      const notes = [];
      if (missing.length) notes.push(`未找到标的：${missing.join('、')}`);
      if (wantIds.length && !quotes.length) notes.push('没有匹配的行情；请用标的 ID 而不是中文名');
      return envelope({
        source: 'quotes.service',
        asOf: payload?.generatedAt ?? isoOf(d.now()),
        stale: staleIds.length > 0,
        staleReason: staleIds.length ? `${staleIds.join('、')} 报价已过期（数据源失败，保留上次成功值）` : null,
        data: { quotes, synthetics },
        note: notes.join('；') || null,
      });
    },

    async get_asset_detail(args) {
      const input = objectOf(args);
      const id = strOf(input.id);
      if (!id) throw new Error('id 不能为空');
      const barsLimit = clampInt(input.barsLimit, 5, MAX_BARS, 30);
      const detail = await d.getDetail(id, { force: false });
      if (!detail) return failEnvelope(`未知标的：${id}`);

      const daily = (Array.isArray(detail.history?.daily) ? detail.history.daily : [])
        .slice(-barsLimit)
        .map((row) =>
          Array.isArray(row)
            ? { date: row[0] ?? null, open: row[1] ?? null, close: row[2] ?? null, high: row[3] ?? null, low: row[4] ?? null, pct: row[7] ?? null }
            : {
                date: row?.date ?? null,
                open: row?.open ?? null,
                close: row?.close ?? null,
                high: row?.high ?? null,
                low: row?.low ?? null,
                pct: row?.pct ?? null,
              },
        );

      let intraday = null;
      const points = Array.isArray(detail.intraday?.points) ? detail.intraday.points : [];
      if (points.length) {
        let high = points[0];
        let low = points[0];
        for (const point of points) {
          if (Number(point.p) > Number(high.p)) high = point;
          if (Number(point.p) < Number(low.p)) low = point;
        }
        intraday = {
          date: detail.intraday?.date ?? null,
          count: points.length,
          first: { label: points[0]?.label ?? null, p: points[0]?.p ?? null },
          last: { label: points.at(-1)?.label ?? null, p: points.at(-1)?.p ?? null },
          high: high?.p ?? null,
          highAt: high?.label ?? null,
          low: low?.p ?? null,
          lowAt: low?.label ?? null,
        };
      }

      const cache = detail.history?.cache;
      const stale = Boolean(detail.quote?.stale) || cache?.hit === 'stale';
      const staleReason = detail.quote?.stale
        ? detail.quote?.error ?? '报价已过期（数据源失败，保留上次成功值）'
        : cache?.hit === 'stale'
          ? `日线缓存已过期（约 ${Math.round(Number(cache.ageMs ?? 0) / 60000)} 分钟前）`
          : null;

      return envelope({
        source: detail.history?.source ?? detail.quote?.source ?? null,
        asOf: detail.generatedAt ?? isoOf(d.now()),
        stale,
        staleReason,
        data: {
          id: detail.id ?? id,
          name: detail.name ?? null,
          unit: detail.unit ?? null,
          quote: trimQuote(detail.quote),
          stats: detail.stats ?? null,
          derived: detail.derived ?? null,
          crosscheck: detail.crosscheck ?? null,
          marketStatus: trimMarketStatus(detail.marketStatus),
          daily,
          barsLimit,
          intraday,
        },
        note: detail.history?.count ? `日线原始共 ${detail.history.count} 根，这里只给最近 ${daily.length} 根` : null,
      });
    },

    async get_macro_correlations(args) {
      const input = objectOf(args);
      const windowSize = clampInt(input.window, 20, 5000, 250);
      const freq = input.freq === 'week' ? 'week' : 'day';
      const assetId = strOf(input.assetId);
      const macro = await d.getMacro(windowSize, freq, { force: false });

      const universe = (Array.isArray(macro?.universe) ? macro.universe : []).map((u) => ({
        id: u.id ?? null,
        name: u.name ?? null,
        short: u.short ?? null,
        kind: u.kind ?? null,
        group: u.group ?? null,
        unit: u.unit ?? null,
        ok: u.ok !== false,
        last: u.last ?? null,
        lastDate: u.lastDate ?? null,
        samples: u.samples ?? null,
        source: u.source ?? u.quality?.source ?? null,
        error: u.error ?? null,
      }));

      const pairMatches = (p) => !assetId || p.a === assetId || p.b === assetId;
      const pairs = (Array.isArray(macro?.matrix?.stats) ? macro.matrix.stats : [])
        .filter(pairMatches)
        .map((p) => ({
          a: p.a,
          b: p.b,
          corr: p.corr,
          n: p.n,
          ci: p.ci ?? null,
          t: p.t ?? null,
          p: p.p ?? null,
          pNW: p.pNW ?? null,
          q: p.q ?? null,
          significantBH: Boolean(p.significantBH),
          stable: Boolean(p.stable),
        }));

      const leadLag = (Array.isArray(macro?.leadLag) ? macro.leadLag : [])
        .filter((row) => !assetId || row.leader === assetId || row.follower === assetId)
        .slice(0, 20)
        .map((row) => ({
          leader: row.leader,
          follower: row.follower,
          lag: row.lag,
          corr: row.corr,
          n: row.n ?? null,
          q: row.q ?? null,
          significantBH: Boolean(row.significantBH),
          pool: row.pool ?? null,
        }));

      const ra = macro?.riskAppetite;
      const riskAppetite = ra
        ? {
            risk: ra.risk ?? null,
            hedge: ra.hedge ?? null,
            spread: ra.spread ?? null,
            label: ra.label ?? null,
            unit: ra.unit ?? null,
            riskMembers: ra.riskMembers ?? [],
            hedgeMembers: ra.hedgeMembers ?? [],
            aligned: ra.aligned ?? null,
            asOf: ra.asOf ?? null,
          }
        : null;

      const vrp = macro?.vrp
        ? {
            vix: macro.vrp.vix ?? null,
            rv20: macro.vrp.rv20 ?? null,
            vrp: macro.vrp.vrp ?? null,
            ratio: macro.vrp.ratio ?? null,
            asOf: macro.vrp.asOf ?? null,
            rvWindow: macro.vrp.rvWindow ?? null,
            label: macro.vrp.label ?? null,
            unit: macro.vrp.unit ?? null,
          }
        : null;

      const failed = universe.filter((u) => !u.ok);
      return envelope({
        source: 'macro.service',
        asOf: macro?.generatedAt ?? isoOf(d.now()),
        stale: macro?.ok === false,
        staleReason: macro?.ok === false ? '宏观样本不足，相关性不可用' : null,
        // 刻意不返回 macro.recent.changes（400×13 大矩阵），模型不需要也不该背它。
        data: { windowSize, freq, assetId: assetId || null, universe, pairs, leadLag, riskAppetite, vrp },
        note: failed.length ? `${failed.length} 个标的数据不可用：${failed.map((u) => u.id).join('、')}` : null,
      });
    },

    async get_asset_explanation(args) {
      const input = objectOf(args);
      const asset = strOf(input.asset);
      if (!asset) throw new Error('asset 不能为空');
      const windowKey = DAY_WINDOWS.has(input.window) ? input.window : 'session';
      const response = await d.getExplanationResponse({ asset, windowKey });
      const body = objectOf(response?.body);
      const explanation = body.explanation ?? null;
      const meta = objectOf(body.meta);
      const generalMechanisms = (Array.isArray(d.mechanismsFor(asset)) ? d.mechanismsFor(asset) : []).map(trimMechanism);

      if (response?.status === 200 && explanation) {
        const hypotheses = (Array.isArray(explanation.hypotheses) ? explanation.hypotheses : []).map((h) => {
          const evidence = Array.isArray(h.evidence) ? h.evidence : [];
          return {
            mechanismId: h.mechanismId ?? null,
            label: h.label ?? null,
            status: h.status ?? 'untested',
            evidenceCount: evidence.length,
            supportCount: evidence.filter((e) => e?.role === 'support').length,
            contraryCount: evidence.filter((e) => e?.role === 'contrary').length,
            reasons: h.reasons ?? [],
          };
        });
        return envelope({
          source: 'explanations.service',
          asOf: explanation.asOf ?? meta.evaluatedAt ?? isoOf(d.now()),
          stale: meta.freshness === 'stale',
          staleReason: meta.freshness === 'stale' ? (meta.freshnessReasons ?? []).join('；') || '解释已过期' : null,
          data: {
            assetId: explanation.assetId ?? asset,
            window: explanation.window ?? { key: windowKey },
            contentStatus: explanation.contentStatus ?? meta.contentStatus ?? 'unknown',
            freshness: meta.freshness ?? null,
            summary: explanation.summary ?? null,
            facts: explanation.facts ?? [],
            hypotheses,
            unknowns: explanation.unknowns ?? [],
            nextChecks: explanation.nextChecks ?? [],
            generalMechanisms,
          },
        });
      }

      const reason =
        body.error ??
        (Array.isArray(meta.freshnessReasons) && meta.freshnessReasons.length
          ? meta.freshnessReasons.join('；')
          : `解释服务返回 ${response?.status ?? '不可用'}`);
      return envelope({
        source: 'mechanisms',
        asOf: meta.evaluatedAt ?? isoOf(d.now()),
        stale: true,
        staleReason: `当期解释未生成：${reason}`,
        data: {
          assetId: asset,
          window: { key: windowKey },
          contentStatus: 'unavailable',
          freshness: meta.freshness ?? 'unavailable',
          summary: null,
          facts: [],
          hypotheses: [],
          unknowns: [],
          nextChecks: [],
          generalMechanisms,
        },
        note: `当期解释未生成（${reason}），以下仅为一般机制说明，不代表当前行情判断`,
      });
    },

    async get_gold_comparison(args) {
      const input = objectOf(args);
      const windowKey = GOLD_WINDOWS.has(input.window) ? input.window : 'session';
      const cmp = await d.getGoldComparison({ windowKey, force: false });
      const end = cmp?.windowRange?.end;
      const endMs = end ? Date.parse(`${end}T00:00:00+08:00`) : NaN;
      const dataAgeMs = Number.isFinite(endMs) ? Math.max(0, d.now() - endMs) : null;
      const warning = cmp?.dataAgeWarning ?? null;
      return envelope({
        source: 'comparison.service',
        asOf: cmp?.generatedAt ?? isoOf(d.now()),
        stale: Boolean(warning),
        staleReason: warning,
        data: {
          status: cmp?.status ?? 'unknown',
          windowKey: cmp?.windowKey ?? windowKey,
          windowLabel: cmp?.windowLabel ?? null,
          comparable: cmp?.comparable ?? false,
          missing: cmp?.missing ?? [],
          reasonText: cmp?.reasonText ?? [],
          decomposition: cmp?.decomposition ?? null,
          windowRange: cmp?.windowRange ?? null,
          alignedEndDates: cmp?.alignedEndDates ?? null,
          cutoff: cmp?.cutoff ?? null,
          dataAgeMs,
        },
        note: warning ?? (cmp?.comparable ? null : '三个市场尚未对齐到同一可比窗口，拆解不可用'),
      });
    },

    async search_events_and_news(args) {
      const input = objectOf(args);
      const hours = clampInt(input.hours, 1, 72, 24);
      const limit = clampInt(input.limit, 1, MAX_EVENTS, 20);
      const query = strOf(input.query).toLowerCase();
      const topic = strOf(input.topic).toLowerCase();
      const symbol = strOf(input.symbol);
      const level = EVENT_LEVELS.has(input.level) ? input.level : null;

      let source = 'events.history';
      let payload;
      try {
        payload = await d.getEventHistory({ hours, limit: 600 });
      } catch {
        source = 'events.snapshot';
        payload = await d.getEvents({ force: false, limit: 200 });
      }

      const filtered = (Array.isArray(payload?.items) ? payload.items : []).filter((ev) => {
        if (level && ev?.level !== level) return false;
        if (symbol && !(Array.isArray(ev?.symbols) ? ev.symbols : []).map(String).includes(symbol)) return false;
        if (topic) {
          const text = eventTopicText(ev?.topics);
          if (!text.includes(topic)) return false;
        }
        if (query) {
          const hay = `${ev?.title ?? ''} ${ev?.zh ?? ''}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      });

      return envelope({
        source,
        asOf: payload?.generatedAt ?? isoOf(d.now()),
        stale: hours > 24,
        staleReason: hours > 24 ? `回看 ${hours} 小时，较早条目可能已被归档裁剪` : null,
        data: {
          hours,
          query: query || null,
          topic: topic || null,
          symbol: symbol || null,
          level,
          total: filtered.length,
          events: filtered.slice(0, limit).map(trimEvent),
          coverageFrom: payload?.coverageFrom ?? null,
        },
        note: filtered.length ? null : '没有匹配的事件；可放宽 hours 或去掉过滤条件',
      });
    },

    async get_macro_calendar_and_study(args) {
      const input = objectOf(args);
      const studyKind = strOf(input.studyKind);
      const includeStudy = input.includeStudy === true || Boolean(studyKind);
      const errors = [];

      const capture = (promise, label) =>
        Promise.resolve(promise).catch((err) => {
          errors.push(`${label}：${err?.message ?? err}`);
          return null;
        });

      const tasks = [
        capture(d.getCalendar({ force: false }), '日历'),
        capture(d.getTodayFocus({ nowMs: d.now() }), '今日重点'),
        capture(d.getExpectationLedger({ limit: 8, force: false, nowMs: d.now() }), '预期账本'),
      ];
      if (includeStudy) tasks.push(capture(d.getEventStudy({ force: false }), '事件研究'));
      const [calendar, focus, ledger, study] = await Promise.all(tasks);

      let studyData = null;
      if (includeStudy) {
        if (!study) studyData = { error: errors.at(-1) ?? '事件研究不可用', rows: [], kinds: [] };
        else {
          const rows = (Array.isArray(study.rows) ? study.rows : [])
            .filter((row) => !studyKind || row.kind === studyKind)
            .sort((a, b) => Number(b?.significant) - Number(a?.significant))
            .slice(0, 12)
            .map((row) => ({
              kind: row.kind,
              symbol: row.symbol,
              name: row.name,
              lag: row.lag,
              eventDays: row.eventDays,
              eventMeanPct: row.eventMeanPct,
              baseMeanPct: row.baseMeanPct,
              ratio: row.ratio,
              t: row.t,
              significant: Boolean(row.significant),
            }));
          studyData = { kinds: study.kinds ?? [], rows, note: study.note ?? null };
        }
      }

      const upcoming = Array.isArray(calendar?.upcoming)
        ? calendar.upcoming
        : Array.isArray(calendar?.events)
          ? calendar.events.filter((ev) => ev?.date >= calendar?.today)
          : [];

      return envelope({
        source: 'calendar/focus/expectations',
        asOf: calendar?.generatedAt ?? focus?.checkedAt ?? isoOf(d.now()),
        stale: errors.length > 0,
        staleReason: errors.length ? errors.join('；') : null,
        data: {
          calendar: calendar
            ? { today: calendar.today ?? null, upcoming: upcoming.slice(0, 12).map(trimCalendarEvent), errors: calendar.errors ?? [] }
            : { error: '日历不可用' },
          focus: focus
            ? {
                day: focus.day ?? null,
                short: focus.short ?? null,
                count: focus.count ?? null,
                next: focus.next ?? null,
                rule: focus.rule ?? null,
                focus: (Array.isArray(focus.focus) ? focus.focus : []).slice(0, 5),
              }
            : null,
          expectations: ledger
            ? {
                status: ledger.status ?? null,
                checkedAt: ledger.checkedAt ?? null,
                released: (Array.isArray(ledger.released) ? ledger.released : []).slice(0, 10),
                pending: (Array.isArray(ledger.pending) ? ledger.pending : []).slice(0, 10),
              }
            : null,
          study: studyData,
        },
        note: errors.length ? `部分数据不可用：${errors.join('；')}` : null,
      });
    },

    async get_overnight_briefing_and_alerts() {
      const errors = [];
      const capture = (promise, label) =>
        Promise.resolve(promise).catch((err) => {
          errors.push(`${label}：${err?.message ?? err}`);
          return null;
        });

      const [briefing, lifePath] = await Promise.all([
        capture(Promise.resolve().then(() => d.buildBriefing()), '隔夜复盘'),
        capture(d.getLifePath({}), '生活传导'),
      ]);

      let alerts = null;
      if (d.alertsService) {
        try {
          alerts = {
            rules: (d.alertsService.listRules() ?? []).map(trimRule),
            events: (d.alertsService.listEvents(20) ?? []).map(trimAlertEvent),
          };
        } catch (err) {
          errors.push(`预警：${err?.message ?? err}`);
        }
      }

      const notes = [];
      if (!d.alertsService) notes.push('预警服务未启用');
      if (errors.length) notes.push(`部分数据不可用：${errors.join('；')}`);

      return envelope({
        source: 'briefing/life-path/alerts',
        asOf: briefing?.latestAt ?? briefing?.baselineAt ?? isoOf(d.now()),
        stale: errors.length > 0,
        staleReason: errors.length ? errors.join('；') : null,
        data: {
          briefing: briefing
            ? {
                ok: briefing.ok !== false,
                status: briefing.status ?? null,
                cutLabel: briefing.cutLabel ?? null,
                baselineAt: briefing.baselineAt ?? null,
                latestAt: briefing.latestAt ?? null,
                samples: briefing.samples ?? null,
                items: (Array.isArray(briefing.items) ? briefing.items : []).slice(0, 12),
              }
            : null,
          lifePath: lifePath
            ? {
                ok: lifePath.ok !== false,
                id: lifePath.id ?? null,
                title: lifePath.title ?? null,
                plain: lifePath.plain ?? null,
                headline: lifePath.headline ?? null,
                upstreamAsOf: lifePath.upstreamAsOf ?? null,
                steps: (Array.isArray(lifePath.steps) ? lifePath.steps : []).slice(0, 10),
                gaps: lifePath.gaps ?? [],
                disclaimer: lifePath.disclaimer ?? null,
                upstreamError: lifePath.upstreamError ?? null,
              }
            : null,
          alerts,
        },
        note: notes.join('；') || null,
      });
    },

    async search_a_share(args) {
      const input = objectOf(args);
      const query = strOf(input.query);
      if (!query) throw new Error('query 不能为空');
      const limit = clampInt(input.limit, 1, MAX_CODES, 10);
      const results = (await d.searchAShareStock(query, { limit })) ?? [];
      return envelope({
        source: 'tencent.smartbox',
        asOf: isoOf(d.now()),
        data: { query, results },
        note: results.length ? null : '未找到匹配的 A 股代码，请换名称、拼音或 6 位代码',
      });
    },

    async get_a_share_quotes(args) {
      const input = objectOf(args);
      const codes = [
        ...new Set(
          (Array.isArray(input.codes) ? input.codes : [])
            .map(strOf)
            .filter(Boolean),
        ),
      ];
      if (!codes.length) throw new Error('codes 至少需要 1 个 A 股代码');
      const useCodes = codes.slice(0, MAX_CODES);
      const record = (await d.fetchTencentBatchQuotes(useCodes)) ?? {};
      const quotes = useCodes
        .filter((code) => record?.[code])
        .map((code) => {
          const q = record[code];
          return {
            code,
            symbol: q.symbol ?? null,
            name: q.name ?? null,
            price: q.price ?? null,
            prevClose: q.prevClose ?? null,
            open: q.open ?? null,
            change: q.change ?? null,
            changePct: q.changePct ?? null,
            high: q.high ?? null,
            low: q.low ?? null,
            amountWan: q.amountWan ?? null,
            turnoverPct: q.turnoverPct ?? null,
            peTtm: q.peTtm ?? null,
            peStatic: q.peStatic ?? null,
            pb: q.pb ?? null,
            amplitudePct: q.amplitudePct ?? null,
            floatMcapYi: q.floatMcapYi ?? null,
            mcapYi: q.mcapYi ?? null,
            limitUp: q.limitUp ?? null,
            limitDown: q.limitDown ?? null,
            volRatio: q.volRatio ?? null,
            sessionTime: q.sessionTime ?? null,
            isStale: Boolean(q.isStale),
            staleReason: q.staleReason ?? null,
          };
        });
      const missing = useCodes.filter((code) => !record?.[code]);
      const staleRows = quotes.filter((q) => q.isStale);
      const notes = [];
      if (missing.length) notes.push(`未取到：${missing.join('、')}`);
      if (codes.length > MAX_CODES) notes.push(`代码超过 ${MAX_CODES} 个，只查了前 ${MAX_CODES} 个`);
      return envelope({
        source: 'tencent',
        asOf: quotes.find((q) => q.sessionTime)?.sessionTime ?? isoOf(d.now()),
        stale: staleRows.length > 0,
        staleReason: staleRows.length
          ? staleRows.map((q) => `${q.code}${q.staleReason ? `（${q.staleReason}）` : ''}`).join('、')
          : null,
        data: { quotes },
        note: notes.join('；') || null,
      });
    },

    async get_a_share_kline(args) {
      const input = objectOf(args);
      const code = strOf(input.code);
      if (!code) throw new Error('code 不能为空');
      const period = KLINE_PERIODS.has(input.period) ? input.period : 'day';
      const adjust = KLINE_ADJUSTS.has(input.adjust) ? input.adjust : 'qfq';
      const count = clampInt(input.count, 5, MAX_BARS, 30);
      const payload = await d.fetchTencentKline({ code, period, adjust, count });
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const first = rows[0];
      const last = rows.at(-1);
      const highs = rows.map((r) => Number(r.high)).filter(Number.isFinite);
      const lows = rows.map((r) => Number(r.low)).filter(Number.isFinite);
      const summary = rows.length
        ? {
            count: rows.length,
            start: first?.datetime ?? null,
            end: last?.datetime ?? null,
            firstClose: first?.close ?? null,
            lastClose: last?.close ?? null,
            changePct: Number(first?.close) ? round2(((Number(last?.close) - Number(first?.close)) / Number(first?.close)) * 100) : null,
            high: highs.length ? Math.max(...highs) : null,
            low: lows.length ? Math.min(...lows) : null,
          }
        : null;
      return envelope({
        source: 'tencent',
        asOf: last?.datetime ?? isoOf(d.now()),
        data: {
          code: payload?.code ?? code,
          period: payload?.period ?? period,
          adjust: payload?.adjust ?? adjust,
          host: payload?.host ?? null,
          rows,
          summary,
        },
        note: rows.length ? null : '未取到 K 线数据（可能为休市日、代码不支持或该周期无数据）',
      });
    },

    async get_a_share_pool(args) {
      const input = objectOf(args);
      const kind = POOL_KINDS.has(input.kind) ? input.kind : 'zt';
      const date = strOf(input.date) || beijingDateCompact(d.now());
      if (!/^\d{8}$/.test(date)) throw new Error('date 需要 YYYYMMDD 格式，例如 20261116');
      const limit = clampInt(input.limit, 1, 60, 30);
      const payload = await d.fetchEmPool(kind, date);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const total = payload?.total ?? rows.length;
      const ladder = ladderOf(kind, rows);
      const notes = [];
      if (!rows.length) notes.push('当日无交易数据（可能为休市日或尚未开盘）');
      else if (rows.length > limit) notes.push(`仅返回前 ${limit} 条，共 ${rows.length} 条`);
      return envelope({
        source: 'eastmoney',
        asOf: isoOf(d.now()),
        data: {
          kind,
          date,
          total,
          returned: Math.min(rows.length, limit),
          truncated: rows.length > limit,
          ladder,
          rows: rows.slice(0, limit),
        },
        note: notes.join('；') || null,
      });
    },

    async get_a_share_fund_flow(args) {
      const input = objectOf(args);
      const code = strOf(input.code);
      const includeNorthbound = input.includeNorthbound !== false;
      const [flow, north] = await Promise.all([
        code ? d.fetchEmFundFlowMinute(code) : Promise.resolve(null),
        includeNorthbound ? d.fetchNorthbound() : Promise.resolve(null),
      ]);

      let fundFlow = null;
      if (code) {
        const rows = Array.isArray(flow?.rows) ? flow.rows : [];
        if (!rows.length) {
          fundFlow = { code, points: 0, latest: null, largeOrder: null, last5Minutes: null };
        } else {
          const latest = rows.at(-1);
          const base = rows[Math.max(0, rows.length - 6)];
          const netChange = Number(latest.mainNet) - Number(base.mainNet);
          fundFlow = {
            code,
            points: rows.length,
            latest: {
              time: latest.time ?? null,
              mainNet: latest.mainNet ?? null,
              superNet: latest.superNet ?? null,
              largeNet: latest.largeNet ?? null,
              midNet: latest.midNet ?? null,
              smallNet: latest.smallNet ?? null,
            },
            largeOrder: {
              superNet: latest.superNet ?? null,
              largeNet: latest.largeNet ?? null,
              total: Number.isFinite(Number(latest.superNet)) && Number.isFinite(Number(latest.largeNet))
                ? Number(latest.superNet) + Number(latest.largeNet)
                : null,
            },
            last5Minutes: {
              from: base.time ?? null,
              to: latest.time ?? null,
              netChange: Number.isFinite(netChange) ? netChange : null,
              direction: netChange > 0 ? '流入' : netChange < 0 ? '流出' : '持平',
            },
          };
        }
      }

      let northbound = null;
      if (north) {
        const times = Array.isArray(north.time) ? north.time : [];
        const i = Math.max(0, times.length - 1);
        northbound = {
          time: times[i] ?? null,
          hgt: north.hgt?.[i] ?? null,
          sgt: north.sgt?.[i] ?? null,
          unit: '亿元',
          recent: times
            .map((time, j) => ({ time, hgt: north.hgt?.[j] ?? null, sgt: north.sgt?.[j] ?? null }))
            .slice(-10),
        };
      }

      const notes = [];
      if (includeNorthbound) notes.push('深股通近期上游披露收紧，仅作参考；分钟资金流不覆盖 ETF');
      if (code && fundFlow?.points === 0) notes.push('该代码无分钟资金流数据（ETF 不覆盖，或当日尚未开盘）');
      return envelope({
        source: [code ? 'eastmoney' : null, includeNorthbound ? 'hexin' : null].filter(Boolean).join('+') || 'none',
        asOf: isoOf(d.now()),
        data: { code: code || null, fundFlow, northbound },
        note: notes.join('；') || null,
      });
    },
  };

  const tools = TOOL_SCHEMAS.map((schema) => ({ ...schema, run: runners[schema.name] }));
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  const definitions = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

  function promptSummary() {
    return tools
      .map((tool) => {
        const props = Object.keys(tool.parameters?.properties ?? {});
        const required = tool.parameters?.required ?? [];
        const args = props.map((key) => (required.includes(key) ? key : `${key}?`)).join(', ');
        return `- ${tool.name}(${args}): ${tool.description}`;
      })
      .join('\n');
  }

  async function execute(name, args = {}, opts = {}) {
    const tool = byName.get(name);
    if (!tool) return failEnvelope(`未知工具：${name}`);
    const timeoutMs =
      Number.isFinite(Number(opts?.timeoutMs)) && Number(opts.timeoutMs) > 0
        ? Number(opts.timeoutMs)
        : DEFAULT_TOOL_TIMEOUT_MS;
    try {
      const pending = Promise.resolve().then(() => tool.run(objectOf(args), { signal: opts?.signal ?? null }));
      return normalizeEnvelope(await abortableTimeout(pending, timeoutMs, opts?.signal ?? null));
    } catch (err) {
      return failEnvelope(err?.message ?? String(err));
    }
  }

  return { definitions, promptSummary, execute };
}
