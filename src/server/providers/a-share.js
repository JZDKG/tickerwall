/* ================================================================== *
 * A 股取数（腾讯主源 + 东财限流源）
 *
 * 端点与字段口径来自 simonlin1212/a-stock-data 的实测校准结果（Apache-2.0），
 * 但这里是**重写**，不是移植：那边是 Python + pandas 的 SKILL.md 代码块，
 * 本项目零运行时依赖，只复用它的「哪个 URL、哪个下标、哪个坑」这类事实。
 *
 * 两条铁律（照抄它的结论）：
 *   1. 行情 / K 线 / 逐笔优先腾讯——实测不封 IP；东财 push2/datacenter 有风控，
 *      一律经 emGet() 串行限流。
 *   2. 「确实没有数据」与「接口坏了」必须分开：前者返回 null/空，后者抛错。
 *      东财对不存在的 secid 返回 data:null，不是空数组。
 *
 * 与本地既有适配器的关系：quotes.js 的 tencentQuote(code) 是单标的、只取价量；
 * 这里补的是批量估值字段、三入口 K 线、逐笔、涨停池、资金流、北向。
 * 解析全部是纯函数（吃文本），抓取在下面，测试喂固定串即可。
 * ================================================================== */

import { fetchRaw, toNum } from './http.js';

const EM_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const EM_REFERER = 'https://quote.eastmoney.com/';

/* ══════════════════════════════════════════════════════════════════ *
 * 一、代码归一化与路由
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 沪市指数白名单。000300/000905 这类与深市 000xxx 个股同段，
 * 不靠白名单就只能靠猜——猜错会静默返回「另一只标的」的行情，比报错危险。
 */
export const SH_INDEX_CODES = new Set(['000001', '000010', '000016', '000300', '000688', '000852', '000905']);

/**
 * 纯 6 位代码 → 腾讯符号（sh/sz/bj 前缀）。
 * 显式前缀原样透传（sh000001 与 sz000001 是两只不同标的）。
 * 920 号段必须在 9x 判断之前，否则北交所新股会落到 sh。
 */
export function aShareSymbol(code) {
  const raw = String(code ?? '').trim().toLowerCase();
  if (!raw) throw new Error('空代码');
  if (/^(sh|sz|bj)\d{6}$/.test(raw)) return raw;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length !== 6) throw new Error(`代码解析失败：${code}`);
  if (digits.startsWith('92')) return `bj${digits}`;
  if (SH_INDEX_CODES.has(digits) || /^[569]/.test(digits)) return `sh${digits}`;
  if (/^[48]/.test(digits)) return `bj${digits}`;
  return `sz${digits}`;
}

/** 6 位代码 → 东财 secid（1=沪，0=深/北）。ETF 与 B 股必须走这里，startswith('6') 会判错。 */
export function emSecid(code) {
  const sym = aShareSymbol(code);
  const market = sym.slice(0, 2) === 'sh' ? '1' : '0';
  return `${market}.${sym.slice(2)}`;
}

/* ══════════════════════════════════════════════════════════════════ *
 * 二、腾讯批量行情（PE/PB/市值/换手/涨跌停）
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 腾讯 88 字段的下标。**43 是振幅不是 PB，PB 在 46；44 流通市值、45 总市值。**
 * 这三条是原项目踩过的坑，抄错一处只会得到「看起来正常」的错数。
 */
export const TENCENT_FIELD = {
  name: 1,
  price: 3,
  prevClose: 4,
  open: 5,
  sessionTime: 30,
  change: 31,
  changePct: 32,
  high: 33,
  low: 34,
  priceVolumeAmount: 35, // "现价/成交量/成交额(元)"
  amountWan: 37,
  turnoverPct: 38,
  peTtm: 39,
  amplitudePct: 43,
  floatMcapYi: 44,
  mcapYi: 45,
  pb: 46,
  limitUp: 47,
  limitDown: 48,
  volRatio: 49,
  peStatic: 52,
  afterHoursAmountWan: 58, // 盘后定价成交额（万元）
};

/**
 * 解析 `v_sh600519="a~b~c";` 批量响应。
 * @param {string} text GBK 已解码的原文
 * @param {Map<string,string>|null} keyOf 带前缀符号 → 调用方原始写法（保证键一一对应）
 * @returns {Record<string, object>}
 */
export function parseTencentBatchQuotes(text, keyOf = null) {
  const out = {};
  for (const chunk of String(text ?? '').split(';')) {
    const line = chunk.trim();
    if (!line || !line.includes('=') || !line.includes('"')) continue;
    const sym = line.slice(0, line.indexOf('=')).split('_').pop();
    const quoted = /"([\s\S]*)"/.exec(line);
    if (!quoted) continue;
    const f = quoted[1].split('~');
    if (f.length < 53) continue;
    const price = toNum(f[TENCENT_FIELD.price]);
    const prevClose = toNum(f[TENCENT_FIELD.prevClose]);
    const amountWan = toNum(f[TENCENT_FIELD.amountWan]);
    const key = keyOf?.get(sym) ?? sym;
    const q = {
      symbol: sym,
      name: f[TENCENT_FIELD.name] ?? null,
      price: price > 0 ? price : null,
      prevClose,
      open: toNum(f[TENCENT_FIELD.open]),
      change: toNum(f[TENCENT_FIELD.change]),
      changePct: toNum(f[TENCENT_FIELD.changePct]),
      high: toNum(f[TENCENT_FIELD.high]),
      low: toNum(f[TENCENT_FIELD.low]),
      amountWan,
      turnoverPct: toNum(f[TENCENT_FIELD.turnoverPct]),
      peTtm: toNum(f[TENCENT_FIELD.peTtm]),
      peStatic: toNum(f[TENCENT_FIELD.peStatic]),
      pb: toNum(f[TENCENT_FIELD.pb]),
      amplitudePct: toNum(f[TENCENT_FIELD.amplitudePct]),
      floatMcapYi: toNum(f[TENCENT_FIELD.floatMcapYi]),
      mcapYi: toNum(f[TENCENT_FIELD.mcapYi]),
      limitUp: toNum(f[TENCENT_FIELD.limitUp]),
      limitDown: toNum(f[TENCENT_FIELD.limitDown]),
      volRatio: toNum(f[TENCENT_FIELD.volRatio]),
      sessionTime: f[TENCENT_FIELD.sessionTime] ?? null,
    };
    // 僵尸报价：停牌 / 已迁移的老号段 / 未开盘，腾讯照样 200 + 一份定格的报价，
    // 成交量为 0 且最新价 == 昨收。直接拿去算估值会得出完全错误的结论。
    q.isStale = amountWan === 0 && price > 0 && price === prevClose;
    if (q.isStale) {
      q.staleReason = /^(43|83|87)/.test(sym.slice(2))
        ? '北交所老号段，多数已迁至 920xxx，按名称反查现行代码'
        : '成交量为 0（停牌 / 未开盘 / 废码），报价非当日真实成交';
    }
    out[key] = q;
  }
  return out;
}

/**
 * 批量实时行情。一次请求最多几十个代码（URL 长度限制），内部按 50 个分批。
 * @param {string[]} codes
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchTencentBatchQuotes(codes, { timeoutMs = 10_000 } = {}) {
  const list = [...new Set(codes.map((c) => String(c).trim()).filter(Boolean))];
  if (!list.length) return {};
  const result = {};
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const keyOf = new Map();
    const symbols = batch.map((c) => {
      const sym = aShareSymbol(c);
      keyOf.set(sym, c); // 键用入参原样：同时传 sh000001 / sz000001 才不会互相覆盖
      return sym;
    });
    const txt = await fetchRaw(`https://qt.gtimg.cn/q=${symbols.join(',')}`, {
      headers: { Referer: 'https://gu.qq.com/' },
      encoding: 'gb18030',
      timeoutMs,
    });
    Object.assign(result, parseTencentBatchQuotes(txt, keyOf));
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════ *
 * 三、腾讯 K 线（三入口轮换 + 冷却）
 * ══════════════════════════════════════════════════════════════════ */

/** 同一后端的三个域名，限流各自独立；某入口返回空即视为被限流，冷却 120s 换下一个。 */
export const TENCENT_KLINE_HOSTS = [
  'https://web.ifzq.gtimg.cn',
  'https://proxy.finance.qq.com/ifzqgtimg',
  'https://ifzq.gtimg.cn',
];
const HOST_COOLDOWN_MS = 120_000;
const hostDownUntil = new Map();
const MINUTE_PERIODS = new Set(['m1', 'm5', 'm15', 'm30', 'm60']);

export function resetTencentKlineCooldown() {
  hostDownUntil.clear();
}

/**
 * 解析 fqkline 响应。日/周/月复权返回 qfqday/hfqday/day；分钟线返回 m1/m5/...
 * 行格式：[日期(或时间), 开, 收, 高, 低, 量]（注意是「开收高低」，不是 OHLC 顺序）。
 */
export function parseTencentKline(json, code, period = 'day', adjust = 'qfq') {
  const node = json?.data?.[code];
  if (!node) throw new Error('无该标的');
  const key = MINUTE_PERIODS.has(period) ? period : adjust === 'hfq' ? 'hfqday' : adjust === 'qfq' ? 'qfqday' : 'day';
  const list = node[key] ?? (MINUTE_PERIODS.has(period) ? null : node.day);
  if (!Array.isArray(list) || !list.length) throw new Error('无历史数据');
  const rows = [];
  for (const item of list) {
    const [dt, open, close, high, low, volume] = item;
    const c = toNum(close);
    if (!dt || !(c > 0)) continue; // 腾讯等差前复权会把高分红的早年价格减成负数
    rows.push({
      datetime: String(dt),
      open: toNum(open),
      high: toNum(high),
      low: toNum(low),
      close: c,
      volume: toNum(volume),
    });
  }
  if (!rows.length) throw new Error('历史数据全被过滤（复权后价格 ≤ 0）');
  return { rows, period, adjust: MINUTE_PERIODS.has(period) ? '' : adjust, code };
}

/**
 * 取 K 线。日/周/月支持 start/end 分段（单段 ≤640 根），分钟线只取最近 ≤320 根。
 * 北交所腾讯只返回 1 根且区间全空 —— 直接抛错，别让人误以为「这几天没交易」。
 * @returns {Promise<{rows: object[], period: string, adjust: string, code: string, host: string}>}
 */
export async function fetchTencentKline(
  { code, period = 'day', adjust = 'qfq', count = 320, start = null, end = null } = {},
  { timeoutMs = 15_000 } = {},
) {
  const sym = aShareSymbol(code);
  if (sym.startsWith('bj')) throw new Error('腾讯 K 线不支持北交所（只有 1 根日线），北交所日线走通达信盘后包');
  const minute = MINUTE_PERIODS.has(period);
  // 分钟线是另一条路径（mkline），且只有不复权、只能取最近 ≤320 根；param 只有 4 段。
  const path = minute ? '/appstock/app/kline/mkline' : '/appstock/app/fqkline/get';
  const param = minute
    ? `${sym},${period},,${Math.min(count, 320)}`
    : `${sym},${period},${start ? startOfDay(start) : ''},${end ? startOfDay(end) : ''},${Math.min(count, 640)},${adjust}`;

  const errors = [];
  // 分钟线在 web.ifzq 上会 301，直接返回非 JSON；把能直出的入口排前面，别让冷却列表被无效域名占满。
  const hosts = minute
    ? ['https://ifzq.gtimg.cn', 'https://proxy.finance.qq.com/ifzqgtimg', 'https://web.ifzq.gtimg.cn']
    : TENCENT_KLINE_HOSTS;
  for (const host of hosts) {
    if ((hostDownUntil.get(host) ?? 0) > Date.now()) continue;
    const url = `${host}${path}?param=${encodeURIComponent(param)}`;
    try {
      const json = JSON.parse(await fetchRaw(url, { timeoutMs, headers: { Referer: 'https://gu.qq.com/' } }));
      const parsed = parseTencentKline(json, sym, period, adjust);
      return { ...parsed, host };
    } catch (err) {
      const msg = String(err?.message ?? err);
      // 空数据 / 限流 → 该入口冷却；格式或参数错误没有换域名重试的意义，但保持与上游一致：继续试下一个
      hostDownUntil.set(host, Date.now() + HOST_COOLDOWN_MS);
      errors.push(`${host}: ${msg}`);
    }
  }
  throw new Error(`腾讯 K 线三个入口都失败：${errors.join(' | ') || '全部在冷却中'}`);
}

const startOfDay = (v) => String(v).replace(/-/g, '').slice(0, 8);

/* ══════════════════════════════════════════════════════════════════ *
 * 四、腾讯逐笔（当日分笔）
 * ══════════════════════════════════════════════════════════════════ */

const TICK_URL = 'https://stock.gtimg.cn/data/index.php';
const TICK_MAX_PAGES = 300;
const TICK_SESSION_END = '15:00:59';

/** 解析一页逐笔：`v_detail_data_sh600519=[0,"seq/时间/价/变动/量/额/方向|..."];` */
export function parseTencentTickPage(text, symbol, page) {
  const body = String(text ?? '').trim();
  if (!body) return null; // 翻过最后一页返回空
  const m = new RegExp(`v_detail_data_${symbol}=\\[(\\d+),"([^"]*)"\\];?`).exec(body);
  if (!m) throw new Error(`逐笔第 ${page} 页格式异常：${body.slice(0, 80)}`);
  if (Number(m[1]) !== page) throw new Error(`逐笔第 ${page} 页的页码字段是 ${m[1]}`);
  if (!m[2]) return null;
  const rows = [];
  for (const item of m[2].split('|')) {
    const parts = item.split('/');
    if (parts.length !== 7) throw new Error(`逐笔记录字段数 ${parts.length}：${item}`);
    const [seq, clock, price, change, volume, amount, side] = parts;
    if (!/^\d\d:\d\d:\d\d$/.test(clock) || !'BSM'.includes(side)) throw new Error(`逐笔记录格式变了：${item}`);
    rows.push({
      seq: Number(seq),
      time: clock,
      price: toNum(price),
      // 注意：这里 change/volume 沿用腾讯原始口径，volume 单位「手」（科创板也是手）
      change: toNum(change),
      volume: toNum(volume),
      amount: toNum(amount),
      side,
    });
  }
  return rows;
}

/**
 * 最近一个交易日的全部分笔。沪深个股与 ETF；北交所与指数没有。
 *
 * 完整性：连续竞价段（≤15:00:59）逐笔金额合计要与当日成交额相符（原项目实测差 0–285 元，
 * 容差 0.1% + 1000 元）；盘中不做这项核对。序号倒退 / 连续竞价段缺号 → 抛错（腾讯缓存不全，稍后重试）。
 *
 * @returns {Promise<{rows: object[], date: string|null, missingSeq: number[], checked: boolean}>}
 */
export async function fetchTencentTicks(code, { timeoutMs = 20_000, maxPages = TICK_MAX_PAGES } = {}) {
  const sym = aShareSymbol(code);
  if (sym.startsWith('bj')) throw new Error('腾讯逐笔不支持北交所');
  if (/^(sh000|sz399)/.test(sym)) throw new Error(`${sym} 是指数，没有逐笔成交`);

  const snapshot = parseTencentSnapshot(
    await fetchRaw(`https://qt.gtimg.cn/q=${sym}`, {
      headers: { Referer: 'https://gu.qq.com/' },
      encoding: 'gb18030',
      timeoutMs: 10_000,
    }),
    sym,
  );
  if (!snapshot.amount) throw new Error(`${sym} 当日没有成交（停牌 / 未开盘 / 集合竞价未撮合）`);

  const rows = [];
  const missingSeq = [];
  for (let page = 0; page < maxPages; page += 1) {
    const txt = await fetchRaw(`${TICK_URL}?appn=detail&action=data&c=${sym}&p=${page}`, {
      encoding: 'gb18030',
      timeoutMs,
    });
    const page_rows = parseTencentTickPage(txt, sym, page);
    if (!page_rows) break;
    for (const r of page_rows) {
      const expected = rows.length ? rows[rows.length - 1].seq + 1 : 0;
      if (r.seq < expected || (rows.length && r.time < rows[rows.length - 1].time)) {
        throw new Error(`逐笔 ${sym} 序号/时间倒退（第 ${page} 页 ${r.seq} ${r.time}），结果不可信`);
      }
      if (r.seq > expected) {
        if (r.time <= TICK_SESSION_END) {
          throw new Error(`逐笔 ${sym} 缺序号 ${expected}–${r.seq - 1}（${page} 页），腾讯该页缓存不完整`);
        }
        for (let s = expected; s < r.seq; s += 1) missingSeq.push(s);
      }
      rows.push(r);
    }
  }
  if (!rows.length) throw new Error(`${sym} 当日成交 ${snapshot.amount} 元，逐笔却为空：接口变了或开盘前已清空`);

  const session = rows.filter((r) => r.time <= TICK_SESSION_END).reduce((s, r) => s + (r.amount ?? 0), 0);
  const tol = snapshot.amount * 0.001 + 1000;
  const checked = Math.abs(session - snapshot.amount) <= tol;
  if (!checked && snapshot.closed) {
    throw new Error(`逐笔 ${sym} 连续竞价段 ${session.toFixed(0)} 元与快照 ${snapshot.amount.toFixed(0)} 元对不上，不完整`);
  }
  return { rows, date: snapshot.date, missingSeq, checked };
}

/** 腾讯行情快照里逐笔核对需要的少数字段 */
export function parseTencentSnapshot(text, symbol) {
  const body = String(text ?? '');
  if (body.includes('v_pv_none_match')) throw new Error(`腾讯没有 ${symbol} 这个代码`);
  const m = new RegExp(`v_${symbol}="([^"]*)"`).exec(body);
  if (!m) throw new Error(`快照里没有 v_${symbol}`);
  const f = m[1].split('~');
  if (f.length < 36 || !/^\d{14}$/.test(f[30] ?? '')) throw new Error(`${symbol} 快照格式变了（字段数 ${f.length}）`);
  const parts = String(f[35] ?? '').split('/');
  if (parts.length !== 3) throw new Error(`${symbol} 快照的量价额字段异常：${f[35]}`);
  const after = toNum(f[58]);
  return {
    date: f[30].slice(0, 4) + '-' + f[30].slice(4, 6) + '-' + f[30].slice(6, 8),
    clock: f[30].slice(8),
    amount: toNum(parts[2]),
    afterHoursAmount: after == null ? null : after * 1e4,
    closed: f[30].slice(8) >= '153100',
  };
}

/* ══════════════════════════════════════════════════════════════════ *
 * 五、东财统一入口（串行限流 + 条件重试）
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 东财风控阈值（社区实测）：每秒 >5 次 / 单 IP 并发 ≥10 / 每分钟 ≥200 次 → 临时封 IP。
 * 这里用「串行 + 最小间隔 + 抖动」把它压到 1 req/s 以下，批量任务再调大间隔。
 */
export const EM_MIN_INTERVAL_MS = Number(process.env.EM_MIN_INTERVAL_MS || 1000);
let emLastCall = 0;
let emChain = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 所有 eastmoney.com 请求的唯一出口。
 * 403 是风控信号，**不重试**（重试只会加重）；429 / 5xx 按指数退避重试 3 次。
 * @returns {Promise<any>} 已解析的 JSON
 */
export async function emGet(url, params = {}, { timeoutMs = 15_000, retries = 3, referer = EM_REFERER } = {}) {
  const qs = new URLSearchParams(params).toString();
  const full = qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
  // 串行化：多个 job 同时打东财 = 并发 ≥10，这正是它的封禁条件
  const task = emChain.then(async () => {
    let attempt = 0;
    for (;;) {
      const wait = EM_MIN_INTERVAL_MS - (Date.now() - emLastCall);
      if (wait > 0) await sleep(wait + Math.floor(Math.random() * 300));
      try {
        const txt = await fetchRaw(full, {
          timeoutMs,
          headers: { 'User-Agent': EM_UA, Referer: referer, Accept: 'application/json' },
        });
        return JSON.parse(txt);
      } catch (err) {
        const msg = String(err?.message ?? err);
        const status = Number((/^HTTP (\d{3})/.exec(msg) ?? [])[1] ?? 0);
        const retryable = status === 429 || status >= 500 || status === 0;
        if (status === 403 || !retryable || attempt >= retries) throw err;
        attempt += 1;
        await sleep(600 * 2 ** (attempt - 1));
      } finally {
        emLastCall = Date.now();
      }
    }
  });
  // 链上失败不能毒化后续请求
  emChain = task.catch(() => {});
  return task;
}

/** 东财数据中心统一查询：龙虎榜 / 解禁 / 两融 / 大宗 / 股东户数 / 分红 / 事件驱动 共用。 */
export async function eastmoneyDatacenter({
  reportName,
  columns = 'ALL',
  filter = '',
  pageSize = 50,
  sortColumns = '',
  sortTypes = '-1',
} = {}) {
  if (!reportName) throw new Error('reportName 必填');
  const json = await emGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
    reportName,
    columns,
    filter,
    pageNumber: '1',
    pageSize: String(pageSize),
    sortColumns,
    sortTypes,
    source: 'WEB',
    client: 'WEB',
  });
  const data = json?.result?.data;
  if (!Array.isArray(data)) throw new Error(`东财 datacenter 无数据或结构变了：${JSON.stringify(json).slice(0, 160)}`);
  return data;
}

/* ══════════════════════════════════════════════════════════════════ *
 * 六、涨停板四池（push2ex）
 * ══════════════════════════════════════════════════════════════════ */

const ZTB_UT = '7eea3edcaed734bea9cbfc24409ed989';
/** 四池只有 sort 不同；date 必须是交易日，非交易日 data 为 null（不是空数组）。 */
export const EM_POOL_SORT = {
  zt: { endpoint: 'getTopicZTPool', sort: 'fbt:asc' }, // 涨停
  zb: { endpoint: 'getTopicZBPool', sort: 'fbt:asc' }, // 炸板
  dt: { endpoint: 'getTopicDTPool', sort: 'fund:asc' }, // 跌停
  yzt: { endpoint: 'getYesterdayZTPool', sort: 'zs:desc' }, // 昨涨停
};

const fmtHms = (n) => {
  if (n == null) return null;
  const s = String(n).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
};

/** 涨停池原始条目 → 内部行（价格字段原始值是 ×1000 整数；金额单位是元） */
export function parseEmPool(kind, pool) {
  const ztStat = (p) => `${p?.zttj?.days ?? '?'}天${p?.zttj?.ct ?? '?'}板`;
  return (pool ?? []).map((p) => {
    const base = { code: p.c, name: p.n, price: p.p == null ? null : p.p / 1000, pct: p.zdp ?? null, industry: p.hybk ?? '' };
    if (kind === 'zt') {
      return {
        ...base,
        amount: p.amount,
        floatCap: p.ltsz,
        turnover: p.hs,
        limitDays: p.lbc,
        firstSeal: fmtHms(p.fbt),
        lastSeal: fmtHms(p.lbt),
        sealFund: p.fund,
        breakTimes: p.zbc,
        ztStat: ztStat(p),
      };
    }
    if (kind === 'zb') {
      return {
        ...base,
        limitPrice: p.ztp == null ? null : p.ztp / 1000,
        turnover: p.hs,
        firstSeal: fmtHms(p.fbt),
        breakTimes: p.zbc,
        amplitude: p.zf,
        speed: p.zs,
        ztStat: ztStat(p),
      };
    }
    if (kind === 'dt') {
      return {
        ...base,
        turnover: p.hs,
        pe: p.pe,
        sealFund: p.fund,
        lastSeal: fmtHms(p.lbt),
        boardAmount: p.fba,
        dtDays: p.days,
        openTimes: p.oc,
      };
    }
    return {
      ...base,
      turnover: p.hs,
      amplitude: p.zf,
      speed: p.zs,
      yFirstSeal: fmtHms(p.yfbt),
      yLimitDays: p.ylbc,
      ztStat: ztStat(p),
    };
  });
}

/**
 * 取某交易日的涨停池 / 炸板池 / 跌停池 / 昨涨停池。
 * @param {'zt'|'zb'|'dt'|'yzt'} kind
 * @param {string} date YYYYMMDD（交易日）
 */
export async function fetchEmPool(kind, date) {
  const spec = EM_POOL_SORT[kind];
  if (!spec) throw new Error(`未知池类型：${kind}`);
  if (!/^\d{8}$/.test(String(date))) throw new Error(`date 需要 YYYYMMDD：${date}`);
  const json = await emGet(`https://push2ex.eastmoney.com/${spec.endpoint}`, {
    ut: ZTB_UT,
    dpt: 'wz.ztzt',
    Pageindex: 0,
    pagesize: 10000,
    sort: spec.sort,
    date: String(date),
  });
  const data = json?.data;
  if (!data) return { rows: [], total: 0, date: String(date), kind }; // 非交易日：data 为 null
  return { rows: parseEmPool(kind, data.pool), total: data.tc ?? 0, date: String(date), kind };
}

/* ══════════════════════════════════════════════════════════════════ *
 * 七、个股资金流（分钟级）与北向
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 个股当日分钟级资金流。单位元；主力 = 大单 + 超大单。
 * 注意：这个接口不覆盖 ETF（secid 对了也是 0 条），ETF 资金流要另找端点。
 */
export async function fetchEmFundFlowMinute(code) {
  const json = await emGet('https://push2.eastmoney.com/api/qt/stock/fflow/kline/get', {
    secid: emSecid(code),
    klt: 1,
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57',
  });
  const klines = json?.data?.klines;
  if (!Array.isArray(klines)) return { rows: [], code }; // data:null = secid 无此数据（含 ETF）
  const rows = [];
  for (const line of klines) {
    const p = line.split(',');
    if (p.length < 6) continue;
    rows.push({
      time: p[0],
      mainNet: toNum(p[1]),
      smallNet: toNum(p[2]),
      midNet: toNum(p[3]),
      largeNet: toNum(p[4]),
      superNet: toNum(p[5]),
    });
  }
  return { rows, code };
}

/**
 * 沪深股通当日实时分钟流向（同花顺 hexin，不经东财，零鉴权）。
 * 单位：亿元，累计净买入。深股通近期上游披露收紧，只作参考。
 */
export async function fetchNorthbound() {
  const txt = await fetchRaw('https://data.hexin.cn/market/hsgtApi/method/dayChart/', {
    timeoutMs: 10_000,
    headers: {
      'User-Agent': EM_UA,
      Referer: 'https://data.10jqka.com.cn/hsgt/',
    },
  });
  const j = JSON.parse(txt);
  return { time: j.time ?? [], hgt: j.hgt ?? [], sgt: j.sgt ?? [] };
}
