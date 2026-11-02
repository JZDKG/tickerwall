/* ================================================================== *
 * 事件中心：三源快讯聚合 + 主题打标 + 重要度分级
 *
 * 从 web 端 src/server/services/events.service.js 裁剪而来。原实现有 38 个
 * 全球 feed + LLM 语义复核 + 按天归档，云函数里做不了也不该做（一次冷启动
 * 要抓 5 秒、还要落库）。保留的是「三源国内快讯 + 词典打标」这条主干 ——
 * 事件中心对手机端的价值是「现在发生了什么」，不是「全语种索引」。
 *
 * 词典只留中文主干标签：多语种规则在 web 端有 500 行，手机上刷不到那么多条。
 * ================================================================== */

const { getText, getJson } = require('./http');

const NOISE_RE =
  /汇总|一览|早报|晚报|周报|月刊|盘点|速览|每日.{0,4}动态|领跑|净值|半日成交|基金份额|涨幅榜|跌幅榜|涨停揭秘|跌停揭秘|ETF.{0,6}成交|目标价|目标位|上调.{0,10}目标|下调.{0,10}目标|维持.{0,8}(买入|增持|中性|持有|跑赢|卖出|减持)|(买入|增持|中性|跑赢|卖出|减持)?.{0,4}评级|评级.{0,8}(上调|下调)|评级为|首次覆盖|主力资金净|龙虎榜/;

/** 主题词典：命中标题权重翻倍，正文只做加分（和 web 端同一套打分思路） */
const TOPICS = [
  { key: 'fed', label: '货币政策', weight: 3, symbols: ['us10y', 'dxy', 'gold-intl'],
    words: ['美联储', '加息', '降息', 'FOMC', '利率决议', '鲍威尔', '议息', '点阵图', '缩表', '扩表', '欧央行', '央行', 'LPR', 'MLF', '降准'] },
  { key: 'inflation', label: '通胀', weight: 3, symbols: ['us10y', 'gold-intl'],
    words: ['CPI', 'PPI', '通胀', '通膨', 'PCE', '物价', '消费者物价', '生产者物价'] },
  { key: 'jobs', label: '就业', weight: 3, symbols: ['us10y', 'sp500'],
    words: ['非农', '失业率', '就业', 'ADP', '初请', '续请', '裁员', '薪资'] },
  { key: 'geo', label: '地缘', weight: 3, symbols: ['gold-intl', 'oil'],
    words: ['制裁', '关税', '战争', '冲突', '袭击', '空袭', '停火', '谈判', '大选', '峰会', '封锁', '禁运', '出口管制'] },
  { key: 'oil', label: '原油', weight: 2, symbols: ['oil'],
    words: ['原油', '油价', 'OPEC', '减产', '增产', '库存', '炼厂', 'WTI', '布伦特'] },
  { key: 'gold', label: '黄金', weight: 2, symbols: ['gold-intl', 'gold-cn'],
    words: ['黄金', '金价', '白银', '贵金属', '央行购金', '金饰'] },
  { key: 'equity', label: '股市', weight: 2, symbols: ['sp500', 'ndx100', 'sh000001'],
    words: ['美股', 'A股', '港股', '三大指数', '标普', '纳指', '道指', '上证', '深成指', '创业板', '财报', '业绩'] },
  { key: 'crypto', label: '加密', weight: 2, symbols: ['btc'],
    words: ['比特币', '以太坊', '加密', '数字货币', '稳定币', 'ETF 批准'] },
  { key: 'fx', label: '汇率', weight: 2, symbols: ['usdcny', 'dxy'],
    words: ['人民币', '汇率', '美元指数', '离岸', '中间价', '日元', '欧元'] },
  { key: 'china', label: '中国数据', weight: 2, symbols: ['sh000001'],
    words: ['社融', 'PMI', '进出口', '工业增加值', '社会消费品零售', 'GDP', '国常会', '政治局'] },
];

const IMPACT_WORDS = [
  '暴跌', '暴涨', '崩盘', '熔断', '创历史', '创新高', '创新低', '紧急', '意外', '大幅',
  '远超预期', '不及预期', '超预期', '暂停', '禁止', '批准', '签署', '闪崩', '跳水', '飙升',
];

function stripHtml(html) {
  return String(html == null ? '' : html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 只放行 http/https，避免把 javascript: 塞进「原文」按钮 */
function safeUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^https?:\/\//i.test(s)) return '';
  return s;
}

/** 北京时间 "YYYY-MM-DD HH:mm:ss"（hourCycle 必须显式 h23，否则午夜会出 24:xx） */
function bjTime(input) {
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '00';
  const pad = (v) => String(v).padStart(2, '0');
  return `${get('year')}-${pad(get('month'))}-${pad(get('day'))} ${pad(get('hour'))}:${pad(get('minute'))}:${pad(get('second'))}`;
}

/**
 * 时间戳统一成毫秒。
 * 三个源的字段单位不一致：金十/新浪给「北京时间的墙钟字符串」，见闻给
 * 毫秒时间戳（不是秒 —— 乘 1000 会得到公元 58797 年）。
 */
function toMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? n : n * 1000;
}

function clip(text, n) {
  const s = stripHtml(text);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* ------------------------------ 三个源 ------------------------------ */

/** 金十数据（最快，自带 important 标记） */
async function fetchJin10() {
  const json = await getJson('https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1', {
    headers: { Referer: 'https://www.jin10.com/', 'x-app-id': 'bVBF4FyRTn5NJF5n', 'x-version': '1.0.0' },
    timeoutMs: 5000,
  });
  const list = (json && json.data) || [];
  return list.map((x) => {
    const d = x.data || {};
    return {
      id: `jin10:${x.id}`,
      source: '金十数据',
      time: bjTime(String(x.time || '').replace(' ', 'T') + '+08:00'),
      title: clip(d.title || d.content, 90),
      body: clip(d.content, 400),
      url: safeUrl(d.source_link),
      important: Number(x.important) > 0,
    };
  });
}

/** 新浪财经 7×24 */
async function fetchSinaLive(pages) {
  const out = [];
  for (let p = 1; p <= pages; p += 1) {
    const json = await getJson(
      `https://zhibo.sina.com.cn/api/zhibo/feed?page=${p}&page_size=30&zhibo_id=152&tag_id=0&dire=f&dpc=1`,
      { headers: { Referer: 'https://finance.sina.com.cn' }, timeoutMs: 5000 },
    );
    const list = (json && json.result && json.result.data && json.result.data.feed && json.result.data.feed.list) || [];
    for (const x of list) {
      const raw = String(x.rich_text || '');
      const m = /^【([^】]+)】([\s\S]*)$/.exec(raw);
      out.push({
        id: `sina:${x.id}`,
        source: '新浪财经',
        time: bjTime(String(x.create_time || '').replace(' ', 'T') + '+08:00'),
        title: clip(m ? m[1] : raw, 90),
        body: clip(m ? m[2] : raw, 400),
        url: safeUrl(x.docurl),
        important: Number(x.top_value) > 0,
      });
    }
    if (!list.length) break;
  }
  return out;
}

/** 华尔街见闻（专业度最高） */
async function fetchWscn(limit) {
  const json = await getJson(
    `https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&client=pc&limit=${limit}`,
    { timeoutMs: 5000 },
  );
  const items = (json && json.data && json.data.items) || [];
  return items.map((x) => ({
    id: `wscn:${x.id}`,
    source: '华尔街见闻',
    time: bjTime(Number(x.display_time)),
    title: clip(x.title || x.content, 90),
    body: clip(x.content, 400),
    url: safeUrl(x.uri),
    important: Number(x.score) >= 3,
  }));
}

/* --------------------------- 打标与分级 --------------------------- */

function tagEvent(ev) {
  const title = ev.title;
  const body = ev.body;
  let mainWeight = 0;
  let mainInTitle = false;
  const topics = [];

  for (const topic of TOPICS) {
    let titleHit = false;
    let bodyHit = false;
    for (const w of topic.words) {
      if (!titleHit && title.indexOf(w) >= 0) titleHit = true;
      else if (!bodyHit && body.indexOf(w) >= 0) bodyHit = true;
    }
    if (!titleHit && !bodyHit) continue;
    const weight = topic.weight + (titleHit ? 1 : 0);
    topics.push({ key: topic.key, label: topic.label, strong: titleHit && topic.weight >= 3 });
    if (weight > mainWeight) {
      mainWeight = weight;
      mainInTitle = titleHit;
    }
  }

  const impact = IMPACT_WORDS.some((w) => title.indexOf(w) >= 0);
  let level = 'low';
  if (ev.important || (mainInTitle && mainWeight >= 4) || (impact && mainInTitle)) level = 'high';
  else if (mainWeight >= 3 || impact) level = 'mid';

  return { topics: topics.slice(0, 3), level, mainWeight };
}

/** 去重：同一句话常被三家同时发；按前 18 个字符做键，保留先到的（金十最快） */
function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const ev of list) {
    const key = ev.title.replace(/[\s，。、：；！？""''（）()【】\-—·.,:;!?"']/g, '').slice(0, 18);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  return out;
}

let cache = { at: 0, data: null };
const CACHE_TTL_MS = 45_000;
let inflight = null;

async function buildEvents({ limit = 60 } = {}) {
  const results = await Promise.allSettled([fetchJin10(), fetchSinaLive(2), fetchWscn(40)]);
  const errors = [];
  let all = [];
  const names = ['金十', '新浪', '见闻'];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all = all.concat(r.value);
    else errors.push(`${names[i]}: ${String((r.reason && r.reason.message) || r.reason)}`);
  });

  // 三家可能都挂了 —— 这不是异常，是上游常态；返回空列表比 500 更有用
  all = all
    .filter((ev) => ev && ev.title && ev.time)
    .filter((ev) => !NOISE_RE.test(ev.title));

  all.sort((a, b) => (a.time < b.time ? 1 : -1));
  all = dedupe(all).slice(0, limit);

  const items = all.map((ev) => {
    const tag = tagEvent(ev);
    return {
      id: ev.id,
      time: ev.time,
      hhmm: ev.time.slice(11, 16),
      date: ev.time.slice(5, 10),
      title: ev.title,
      body: ev.body && ev.body !== ev.title ? ev.body : '',
      level: tag.level,
      topics: tag.topics,
      source: ev.source,
      url: ev.url,
    };
  });

  const counts = {
    high: items.filter((i) => i.level === 'high').length,
    mid: items.filter((i) => i.level === 'mid').length,
    low: items.filter((i) => i.level === 'low').length,
  };

  return {
    ok: items.length > 0,
    generatedAt: new Date().toISOString(),
    total: items.length,
    counts,
    items,
    errors: errors.length ? errors : undefined,
    error: items.length ? undefined : '三个快讯源都暂不可用',
  };
}

async function getEvents(opts = {}) {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_TTL_MS) {
    return { ...cache.data, cached: true };
  }
  if (inflight) return inflight;
  inflight = buildEvents(opts)
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

module.exports = { getEvents, TOPICS };
