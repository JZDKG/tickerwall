/* ================================================================== *
 * 事件服务：三源快讯聚合 · 主题打分 · LLM 语义复核 · 按天归档
 *
 * 从 server.mjs 整段搬出（逻辑一字未改），只补了 import 与几处导出。
 * 依赖方向：providers/（抓取）→ db/（kv 与 jsonl）→ 本模块，无反向引用，
 * 也不依赖 quotes/detail/macro/calendar 任何一个服务。
 *
 * 对外只暴露三样：getEvents（路由用）、loadLlmStore（启动用）、archiveEvents（调试用）。
 * ================================================================== */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import fsp from 'node:fs/promises';

import { fetchRaw, toNum } from '../providers/index.js';
import { fetchFeedCatalog, DIRECT_FEEDS, GOOGLE_FEEDS } from '../providers/news-feeds.js';
import { COMPILED_TOPICS, IMPACT_WORDS, anyWordHit, sanitizeText, sanitizeUrl, guessRegion, isOfficialRoutine, dedupeKey } from '../domain/news-lexicon.js';
import { kvGetJson, kvSetJson, appendJsonl, readJsonl, readJsonlField } from '../db/index.js';
import { DATA_DIR } from '../paths.js';

const EVENTS_CACHE_TTL_MS = 25_000;

/**
 * 全球源比国内快讯慢得多：一次要打 24 个直连 feed + 14 个语种的聚合，
 * 实测约 5 秒。前端每 30 秒轮询一次，若跟着 25 秒的缓存走，等于每轮都全量
 * 重抓 38 个上游 —— 既无必要（新闻不会 30 秒变一次）也容易被限流。
 * 国内快讯保持 25 秒的实时感，全球源单独按 3 分钟走。
 */
const GLOBAL_CACHE_TTL_MS = 180_000;
const eventsCache = new Map();

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 北京时间字符串 */
function bjTimeString(input) {
  const d = typeof input === 'number' ? new Date(input * 1000) : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** 噪声稿：汇总/营销/榜单/券商评级类，命中直接丢弃，否则会污染重要性排序 */
const NOISE_RE =
  /汇总|一览|早报|晚报|周报|月刊|盘点|速览|每日.{0,4}动态|领跑|净值|半日成交|基金份额|涨幅榜|跌幅榜|涨停揭秘|跌停揭秘|ETF.{0,6}成交|目标价|目标位|上调.{0,10}目标|下调.{0,10}目标|维持.{0,8}(买入|增持|中性|持有|跑赢|卖出|减持)|(买入|增持|中性|跑赢|卖出|减持)?.{0,4}评级|评级.{0,8}(上调|下调)|评级为|首次覆盖|主力资金净|龙虎榜/;


/**
 * 分类：标题命中的主题才算「强命中」，正文命中打 7 折。
 * 主主题取权重最大者，其余主题只做次要加权（×0.35），
 * 避免「一条稿子提到很多词」被误判成重大新闻。
 */
function classify(title, body) {
  const cTitle = sanitizeText(title);
  const cBody = sanitizeText(body);
  const topics = [];
  const symbols = new Set();
  let mainWeight = 0;
  let mainInTitle = false;
  let secondary = 0;

  for (const rule of COMPILED_TOPICS) {
    // 标题用全量词（含 titleOnly 的高风险泛词），正文用剔除后的词表
    const hitTitle = anyWordHit(cTitle, rule.titleWords);
    const hitBody = !hitTitle && anyWordHit(cBody, rule.bodyWords);
    if (!hitTitle && !hitBody) continue;
    topics.push({ key: rule.key, label: rule.label, strong: hitTitle });
    rule.symbols.forEach((sym) => symbols.add(sym));
    const w = rule.weight * (hitTitle ? 1 : 0.7);
    if (w > mainWeight) {
      secondary += mainWeight * 0.35;
      mainWeight = w;
      mainInTitle = hitTitle;
    } else {
      secondary += w * 0.35;
    }
  }

  const impact = anyWordHit(cTitle, IMPACT_WORDS) || anyWordHit(cBody, IMPACT_WORDS);
  return {
    topics,
    symbols: [...symbols],
    mainWeight,
    mainInTitle,
    impact,
    rawScore: mainWeight + secondary + (impact ? 1 : 0),
  };
}

/** 影响等级：源自身的「重要」标记最可信，其次是标题直接命中强主题 */
function toLevel(info, important) {
  if (important) return 'high';
  if (info.mainInTitle && info.mainWeight >= 3) return 'high';
  if (info.mainWeight >= 2) return 'mid';
  return 'low';
}

/** 金十快讯（最快，带 important 标记） */
async function fetchJin10() {
  const j = JSON.parse(
    await fetchRaw('https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.jin10.com/',
        'x-app-id': 'bVBF4FyRTn5NJF5n',
        'x-version': '1.0.0',
      },
    }),
  );
  const list = j?.data ?? [];
  return list.map((x) => {
    const d = x.data ?? {};
    const title = stripHtml(d.title || d.content || '');
    const body = stripHtml(d.content || '');
    return {
      id: `jin10:${x.id}`,
      sourceKey: 'jin10',
      source: '金十数据',
      time: bjTimeString((x.time ?? '').replace(' ', 'T') + '+08:00'),
      title: title.length > 90 ? `${title.slice(0, 90)}…` : title,
      body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
      url: d.source_link || null,
      important: Number(x.important) > 0,
    };
  });
}

/** 新浪 7×24 全球直播 */
async function fetchSinaLive(pages = 2) {
  const out = [];
  for (let p = 1; p <= pages; p += 1) {
    const j = JSON.parse(
      await fetchRaw(
        `https://zhibo.sina.com.cn/api/zhibo/feed?page=${p}&page_size=30&zhibo_id=152&tag_id=0&dire=f&dpc=1`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn' } },
      ),
    );
    const list = j?.result?.data?.feed?.list ?? [];
    for (const x of list) {
      const raw = String(x.rich_text ?? '');
      const m = /^【([^】]+)】([\s\S]*)$/.exec(raw);
      const title = stripHtml(m ? m[1] : raw);
      const body = stripHtml(m ? m[2] : raw);
      out.push({
        id: `sina:${x.id}`,
        sourceKey: 'sina',
        source: '新浪财经',
        time: bjTimeString((x.create_time ?? '').replace(' ', 'T') + '+08:00'),
        title: title.length > 90 ? `${title.slice(0, 90)}…` : title,
        body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
        url: x.docurl || null,
        important: Number(x.top_value) > 0,
      });
    }
    if (!list.length) break;
  }
  return out;
}

/** 华尔街见闻实时快讯（专业度最高） */
async function fetchWscn(limit = 40) {
  const j = JSON.parse(
    await fetchRaw(
      `https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&client=pc&limit=${limit}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ),
  );
  const items = j?.data?.items ?? [];
  return items.map((x) => {
    const title = stripHtml(x.title || '');
    const body = stripHtml(x.content || '');
    return {
      id: `wscn:${x.id}`,
      sourceKey: 'wscn',
      source: '华尔街见闻',
      time: bjTimeString(x.display_time),
      title: (title || body).slice(0, 90) + ((title || body).length > 90 ? '…' : ''),
      body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
      url: x.uri || null,
      important: Number(x.score) >= 2,
    };
  });
}


/* ------------------------------------------------------------------ *
 * 持久化
 * 三样东西必须落地，否则每次重启都在重复付成本、也无法回溯：
 *   1. LLM 分类缓存 —— 重启后不必重新调网关（省 token / 省时间）
 *   2. 事件归档     —— 按天分文件，可按日回放当天事件流
 *   3. 指标快照     —— 定时记录价格与涨跌，用于事后回溯与变化检测
 * ------------------------------------------------------------------ */
const LLM_STORE_FILE = path.join(DATA_DIR, 'llm-cache.json');
const EVENTS_DIR = path.join(DATA_DIR, 'events');

/** label → { key, label }。归档只存了 label，回放时要还原成和实时接口同一形状 */
const TOPIC_BY_LABEL = new Map(COMPILED_TOPICS.map((t) => [t.label, t]));

let llmStoreTimer = null;
let llmStoreDirty = false;
let archivedIds = new Set();
let archivedDay = null;

async function ensureDataDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(EVENTS_DIR, { recursive: true });
}

/** 启动时把 LLM 缓存读回内存（SQLite kv 表） */
export async function loadLlmStore() {
  try {
    const obj = kvGetJson('llm-cache');
    if (!obj || typeof obj !== 'object') return;
    const now = Date.now();
    let n = 0;
    for (const [id, v] of Object.entries(obj)) {
      if (!v || typeof v !== 'object') continue;
      if (now - (v.at ?? 0) > 7 * 24 * 3600_000) continue; // 超过 7 天的丢掉
      llmCache.set(id, v);
      n += 1;
    }
    console.log(`LLM 分类缓存已恢复 ${n} 条`);
  } catch (err) {
    console.warn('LLM 缓存恢复失败:', err?.message ?? err);
  }
}

/** 写入 debounce：分类是逐批来的，攒一下再落盘 */
function scheduleLlmStore() {
  llmStoreDirty = true;
  if (llmStoreTimer) return;
  llmStoreTimer = setTimeout(async () => {
    llmStoreTimer = null;
    if (!llmStoreDirty) return;
    llmStoreDirty = false;
    try {
      const obj = {};
      for (const [id, v] of llmCache) obj[id] = v;
      kvSetJson('llm-cache', obj);
    } catch (err) {
      console.error('LLM 缓存落盘失败:', err?.message ?? err);
    }
  }, 3000);
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function loadArchivedIds(day) {
  if (archivedDay === day) return;
  archivedDay = day;
  archivedIds = new Set();
  archivedIds = await readJsonlField(path.join(EVENTS_DIR, `${day}.jsonl`), 'id');
}

/** 把本轮事件追加归档（按天分文件，同一天内按 id 去重） */
export async function archiveEvents(items) {
  try {
    const day = todayKey();
    await loadArchivedIds(day);
    const fresh = items.filter((it) => !archivedIds.has(it.id));
    if (!fresh.length) return;
    await ensureDataDirs();
    await appendJsonl(
      path.join(EVENTS_DIR, `${day}.jsonl`),
      fresh.map((it) => ({
        id: it.id,
        time: it.time,
        source: it.source,
        title: it.title,
        body: it.body?.slice(0, 300) ?? '',
        url: it.url,
        level: it.level,
        topics: it.topics?.map((t) => t.label) ?? [],
        symbols: it.symbols ?? [],
        region: it.region ?? null,
        llm: Boolean(it.llm),
      })),
    );
    fresh.forEach((it) => archivedIds.add(it.id));
  } catch (err) {
    console.error('事件归档失败:', err?.message ?? err);
  }
}

/** 指标快照：记录当前 8 个标的的报价，供回溯 */


/* ------------------------------------------------------------------ *
 * LLM 语义分类
 * 背景：纯关键词分类有天花板（「AI基建把保险业逼进新战场」会因「战场」被判成地缘政治）。
 * 这里接 cline 网关（与 dsh web profile 同一个 provider）做二次语义判定，
 * 关键词结果作兜底，LLM 结果按事件 id 缓存 6 小时。
 *
 * 为什么不用 `dsh headless`：它会完整加载 agent 栈，实测单次 inputTokens 24 万、
 * 耗时 28 秒，对每分钟一轮的新闻流不现实；直连同一个网关只要 3 秒、几百 tokens。
 * ------------------------------------------------------------------ */
const LLM_CACHE_TTL_MS = 6 * 3600_000;
const llmCache = new Map(); // eventId -> { topics, symbols, level, at }
let llmInFlight = false;
let llmStats = { calls: 0, classified: 0, lastError: null, lastAt: null };

const LLM_TOPICS = ['货币政策', '通胀', '就业', '地缘政治', '能源', '贵金属', '加密', '中国政策', '权益', '债市', '汇率', '宏观', '无关'];
const LLM_SYMBOLS = ['gold-intl', 'gold-cn', 'oil', 'brent', 'copper', 'sp500', 'ndx100', 'sh000001', 'btc', 'dxy', 'us10y', 'vix', 'vxn'];

const LLM_REGIONS = ['us', 'cn', 'eu', 'uk', 'jp', 'me', 'asia', 'latam', 'africa', 'global'];

const LLM_SYSTEM = `你是金融市场的新闻分类器。输入是一批编号的财经快讯，格式为「编号. 标题 ｜ 正文摘要」，判断每条对市场的影响。

对每条输出四个字段：
- topics: 最相关的 1-2 个，取值必须来自 [${LLM_TOPICS.join(',')}]
- level: high / mid / low
- symbols: 受影响的标的，取值必须来自 [${LLM_SYMBOLS.join(',')}]
- region: 事件发生地，取值必须来自 [${LLM_REGIONS.join(',')}]
  · us=美国/北美 · cn=中国 · eu=欧元区 · uk=英国 · jp=日本 · me=中东
  · asia=其他亚洲 · latam=拉美 · africa=非洲 · global=全球性/无明确地点

判断标准：
- high：央行货币政策、通胀/就业数据、重大地缘冲突、能源供给中断、监管重大变化
- mid：有参考价值的行业或公司动态、次要宏观数据、区域性事件
- low：边缘信息、泛泛的综述、影响不明确
- 公司融资、产品发布、营销稿 → low 或 无关
- 正文只用于辅助判断，不要臆测原文没有的信息；信息不足就判 low
- region 按「事件主体所在地」判断，不是按媒体报道来源

只输出 JSON 数组，不要任何解释文字、不要 markdown 代码块：
[{"i":1,"topics":["货币政策"],"level":"high","symbols":["us10y","dxy"],"region":"us"}]`;

/**
 * 从 dsh 的 web profile 里提取 cline 网关配置，而不是硬编码。
 * 这样 dsh 换了 provider / 模型，这边会跟着走。
 */
/**
 * LLM 复核的配置来源。
 *
 * 优先级：环境变量 > （可选的）外部工具配置。
 *
 * 为什么要有 `LLM_CONFIG_SOURCE` 这个开关：默认行为会去读 `~/.dsh` 下另一个
 * 工具（dsh）的私有 YAML 与明文凭据。这不理想 —— 一旦 dsh 改了格式我们就
 * 静默失效，而且等于读了本项目之外的密钥。所以：
 *
 *   LLM_CONFIG_SOURCE=env   只认环境变量，绝不碰外部文件（推荐用于部署）
 *   LLM_CONFIG_SOURCE=auto  环境变量优先，缺失才回落读 ~/.dsh（默认，兼容现状）
 *
 * 无论走哪条路，配置来源都会记在 cfg.source 里，便于排查「为什么没在复核」。
 */
const ENV_LLM = {
  baseURL: 'LLM_BASE_URL',
  apiKey: 'LLM_API_KEY',
  model: 'LLM_MODEL',
};

export function readDshLlmConfig() {
  const sourceMode = String(process.env.LLM_CONFIG_SOURCE ?? 'auto').toLowerCase();
  const cfg = { baseURL: null, apiKeyEnv: 'CLINE_API_KEY', models: [], model: null, apiKey: null, source: null };

  // ---- 1) 环境变量（最高优先级，不依赖任何外部文件）----
  cfg.baseURL = process.env[ENV_LLM.baseURL] || null;
  cfg.apiKey = process.env[ENV_LLM.apiKey] || null;
  const envModel = process.env[ENV_LLM.model] || null;
  if (cfg.baseURL || cfg.apiKey || envModel) {
    cfg.source = 'env';
    if (envModel) cfg.models = [envModel];
    if (!cfg.baseURL) cfg.baseURL = 'https://api.cline.bot/api/v1';
    cfg.model = envModel ?? 'cline-pass/deepseek-v4.1-flash-1017';
    return cfg;
  }

  // ---- 2) 显式要求只用环境变量：到此为止，不再读外部文件 ----
  if (sourceMode === 'env') {
    cfg.source = 'env:missing';
    return cfg;
  }

  // ---- 3) 回落：读 dsh 的配置（兼容现状，仅在 auto 下发生）----
  const home = process.env.DSH_HOME || `${process.env.HOME}/.dsh`;

  try {
    const patch = readFileSync(`${home}/profiles/web/cordis.patch.yml`, 'utf8');
    const idx = patch.indexOf('cline:');
    if (idx >= 0) {
      const seg = patch.slice(idx, idx + 2500);
      cfg.baseURL = /baseURL:\s*(\S+)/.exec(seg)?.[1] ?? null;
      cfg.apiKeyEnv = /apiKeyEnv:\s*(\S+)/.exec(seg)?.[1] ?? 'CLINE_API_KEY';
      cfg.models = [...seg.matchAll(/-\s*id:\s*(cline-pass\/[A-Za-z0-9._-]+)/g)].map((m) => m[1]);
      cfg.source = 'dsh:profiles/web';
    }
  } catch {
    /* 用默认值兜底 */
  }

  if (!cfg.baseURL) cfg.baseURL = 'https://api.cline.bot/api/v1';

  cfg.apiKey = process.env[cfg.apiKeyEnv] || null;
  if (!cfg.apiKey) {
    try {
      const cred = readFileSync(`${home}/.credentials.yaml`, 'utf8');
      cfg.apiKey = new RegExp(`${cfg.apiKeyEnv}:\\s*(\\S+)`).exec(cred)?.[1] ?? null;
      if (cfg.apiKey) cfg.source = `${cfg.source ?? 'dsh'}:credentials.yaml`;
    } catch {
      /* 无凭据 */
    }
  }

  // 模型名不再唯独硬编码：LLM_MODEL 已在上面处理，这里只做「在已知模型里
  // 挑一个」，挑不到就用第一个，最后才是兜底常量
  const preferred = ['cline-pass/deepseek-v4.1-flash-1017', 'cline-pass/glm-5.3-flash'];
  cfg.model = preferred.find((m) => cfg.models.includes(m)) ?? cfg.models[0] ?? 'cline-pass/deepseek-v4.1-flash-1017';
  return cfg;
}

/** LLM 常返回同义词（原油供应 / wti / 纳指），做一次归一 */
const TOPIC_ALIAS = new Map([
  ['融资', 'equities'], ['IPO', 'equities'], ['股市', 'equities'], ['股票', 'equities'],
  ['原油供应', 'energy'], ['石油', 'energy'], ['油价', 'energy'], ['天然气', 'energy'],
  ['利率', 'fed'], ['央行', 'fed'], ['流动性', 'fed'],
  ['贵金属', 'precious'], ['白银', 'precious'],
  ['加密货币', 'crypto'], ['数字资产', 'crypto'],
  ['国债', 'rates'], ['收益率', 'rates'], ['债券', 'rates'],
  ['外汇', 'fx'],
  ['经济数据', 'macro'], ['增长', 'macro'], ['贸易', 'macro'],
  ['战争', 'geopolitics'], ['冲突', 'geopolitics'], ['制裁', 'geopolitics'], ['关税', 'geopolitics'],
]);

const SYMBOL_ALIAS = new Map([
  ['wti', 'oil'], ['原油', 'oil'], ['布伦特', 'brent'],
  ['国际金价', 'gold-intl'], ['沪金', 'gold-cn'], ['国内金价', 'gold-cn'],
  ['铜', 'copper'], ['纳指', 'ndx100'], ['纳斯达克', 'ndx100'],
  ['标普', 'sp500'], ['美股', 'sp500'], ['上证', 'sh000001'], ['a股', 'sh000001'],
  ['比特币', 'btc'], ['美元', 'dxy'], ['美债', 'us10y'],
]);

/**
 * LLM 输出的 JSON 偶尔会被截断（reasoning 吃掉预算）或带多余字符，
 * 先标准解析，失败就逐个抠出完整的 {...} 对象，尽量不浪费这一批请求。
 */
function parseLooseJsonArray(text) {
  const bracket = /\[[\s\S]*\]/.exec(text);
  if (bracket) {
    try {
      const arr = JSON.parse(bracket[0]);
      if (Array.isArray(arr)) return arr;
    } catch {
      /* 落到逐个解析 */
    }
  }
  const out = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj && obj.i != null) out.push(obj);
    } catch {
      /* 跳过坏片段 */
    }
  }
  return out;
}

function normalizeTopicLabel(raw) {
  const t = String(raw).trim();
  const directKey = TOPIC_LABEL_TO_KEY.get(t);
  if (directKey) return { key: directKey, label: t, strong: true };
  const aliased = TOPIC_ALIAS.get(t);
  if (!aliased) return null;
  const rule = COMPILED_TOPICS.find((r) => r.key === aliased);
  return rule ? { key: rule.key, label: rule.label, strong: true } : null;
}

function normalizeSymbolToken(raw) {
  const t = String(raw).trim();
  if (LLM_SYMBOLS.includes(t)) return t;
  return SYMBOL_ALIAS.get(t) ?? SYMBOL_ALIAS.get(t.toLowerCase()) ?? null;
}

/** 把中文 topic 映射回内部 key，保证前端筛选一致 */
const TOPIC_LABEL_TO_KEY = new Map([
  ['货币政策', 'fed'],
  ['通胀', 'inflation'],
  ['就业', 'jobs'],
  ['地缘政治', 'geopolitics'],
  ['能源', 'energy'],
  ['贵金属', 'precious'],
  ['加密', 'crypto'],
  ['中国政策', 'china'],
  ['权益', 'equities'],
  ['债市', 'rates'],
  ['汇率', 'fx'],
  ['宏观', 'macro'],
]);

async function llmClassifyBatch(batch) {
  const cfg = readDshLlmConfig();
  if (!cfg.apiKey) throw new Error('未找到 LLM 凭据');

  // 正文截断后一起喂进去：只给标题时，"某公司中东项目交付"这类会被误判成地缘冲突，
  // 带上摘要就能看出是公司动态。每条控制 80 字，避免 token 膨胀。
  const list = batch
    .map((ev, i) => {
      const body = String(ev.body ?? '').replace(/\s+/g, ' ').slice(0, 80);
      return body && body !== ev.title.slice(0, 80)
        ? `${i + 1}. ${ev.title} ｜ ${body}`
        : `${i + 1}. ${ev.title}`;
    })
    .join('\n');
  const payload = JSON.stringify({
    model: cfg.model,
    max_tokens: 2500, // reasoning 模型会先思考，预算给小了 content 会被截断
    messages: [
      { role: 'system', content: LLM_SYSTEM },
      { role: 'user', content: list },
    ],
  });

  const raw = await fetchRaw(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: payload,
    timeoutMs: 40_000,
  });

  llmStats.calls += 1;
  llmStats.lastAt = new Date().toISOString();
  llmStats.model = cfg.model;
  scheduleLlmStore();

  const j = JSON.parse(raw);
  // 这个网关把 OpenAI 标准结构包在 data 里，不是顶层 choices
  const text = j?.data?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.message?.content ?? '';
  const arr = parseLooseJsonArray(text);
  if (!arr.length) throw new Error(`LLM 未返回可解析的 JSON（content 长度 ${text.length}）`);
  const now = Date.now();
  let hitCount = 0;
  for (const row of arr) {
    const idx = Number(row?.i) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= batch.length) continue;
    const ev = batch[idx];

    const topics = (Array.isArray(row.topics) ? row.topics : [])
      .map(normalizeTopicLabel)
      .filter(Boolean)
      // 「无关」不是可筛选主题，遇到就只保留等级判断
      .filter((t) => t.key !== 'unrelated');
    const symbols = [...new Set((Array.isArray(row.symbols) ? row.symbols : []).map(normalizeSymbolToken).filter(Boolean))];
    const level = ['high', 'mid', 'low'].includes(row.level) ? row.level : 'low';
    const region = LLM_REGIONS.includes(row.region) ? row.region : null;

    if (!topics.length && level !== 'low') continue; // 判不出主题又说不重要，就不覆盖关键词结果
    llmCache.set(ev.id, { topics, symbols, level, region, at: now });
    hitCount += 1;
  }
  llmStats.classified += hitCount;
}

/** 异步跑 LLM 分类（不阻塞接口返回），下一轮轮询时前端自然拿到增强结果 */
function kickLlmClassify(items) {
  if (llmInFlight) return;
  const now = Date.now();
  const todo = items
    .filter((it) => {
      const hit = llmCache.get(it.id);
      return !hit || now - hit.at > LLM_CACHE_TTL_MS;
    })
    .slice(0, 30);
  if (!todo.length) return;

  llmInFlight = true;
  (async () => {
    try {
      const BATCH = 15;
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        // 网关对连续请求会 500，单批失败重试一次，批之间留间隔
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            await llmClassifyBatch(batch);
            llmStats.lastError = null;
            break;
          } catch (err) {
            llmStats.lastError = String(err?.message ?? err);
            if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
          }
        }
        if (i + BATCH < todo.length) await new Promise((r) => setTimeout(r, 1200));
      }
    } finally {
      llmInFlight = false;
    }
  })();
}

/** 把 LLM 结果盖到关键词结果上 */
function applyLlmResults(items) {
  let applied = 0;
  for (const it of items) {
    const hit = llmCache.get(it.id);
    if (!hit) continue;
    if (Date.now() - hit.at > LLM_CACHE_TTL_MS) continue;
    if (hit.topics.length) it.topics = hit.topics;
    if (hit.symbols.length) it.symbols = hit.symbols;
    if (hit.region) it.region = hit.region;
    it.level = hit.level;
    it.llm = true;
    applied += 1;
  }
  return applied;
}

/* ------------------------------------------------------------------ *
 * 全球源
 *
 * 两条腿（见 providers/news-feeds.js 的说明）：直连 feed 拿原文直链，
 * Google 多语种聚合覆盖那些关停 RSS 或被 WAF 挡住的媒体。合并后统一成
 * 与国内快讯同形的事件对象，后面的分类/去重/归档完全不用分叉。
 * ------------------------------------------------------------------ */
let globalCache = { at: 0, items: [], status: [], langs: [], regions: [] };

/** FNV-1a：Google 的 guid 是 base64 长串，收敛成短 id，免得撑爆 DOM 属性 */
function shortHash(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** 把一条 feed 条目改成事件对象的形状（与国内快讯同构） */
function feedItemToEvent(it) {
  const title = it.title.length > 90 ? `${it.title.slice(0, 90)}…` : it.title;
  const body = it.body && it.body.length > 400 ? `${it.body.slice(0, 400)}…` : it.body;
  return {
    id: `${it.sourceKey}:${shortHash(it.guid)}`,
    sourceKey: it.sourceKey,
    source: it.source,              // 通道名，如「日文财经」
    publisher: it.publisher,        // 原始媒体，如「日本経済新聞」
    lang: it.lang,
    // 这条稿是媒体自己发的，还是经聚合索引转手的 —— 前端据此标注「一手」
    origin: it.origin,
    sourceKind: it.sourceKind,
    sourceRegion: it.sourceRegion,
    time: bjTimeString(it.at),
    title,
    body: body || '',
    // 只放行 http(s)：RSS/聚合索引是外部不可信数据，javascript: 链接会被
    // 原样写进前端的 href
    url: sanitizeUrl(it.url),
    important: false,               // 全球源没有「重要」标记，等级全靠主题权重
  };
}

async function fetchGlobalFeeds(force = false) {
  if (!force && globalCache.at && Date.now() - globalCache.at < GLOBAL_CACHE_TTL_MS) {
    return globalCache;
  }
  const [direct, agg] = await Promise.all([
    // 聚合源每条 feed 有 50~100 条，只取前 10 条会让德/意/葡/俄这些语种
    // 剩不下几条通过分类；25 条既覆盖足够广度，也不至于把陈货全拉进来。
    fetchFeedCatalog(DIRECT_FEEDS, { perSource: 12 }),
    fetchFeedCatalog(GOOGLE_FEEDS, { perSource: 25, concurrency: 8 }),
  ]);

  const items = [];
  for (const res of [direct, agg]) {
    for (const it of res.items) items.push(feedItemToEvent(it));
  }
  const status = [...direct.status, ...agg.status];

  globalCache = {
    at: Date.now(),
    items,
    status,
    langs: [...new Set(status.filter((s) => s.ok).map((s) => s.lang))].sort(),
    regions: [...new Set(status.filter((s) => s.ok).map((s) => s.region))].sort(),
  };
  return globalCache;
}

/**
 * 最近 N 小时的完整事件流（Step 3 的 24h 时间轴用）。
 *
 * 数据来自「今天 + 昨天」两份按北京时间命名的归档，与当前实时快照按 id 合并
 * 去重（实时优先 —— 归档里的 level / topics 是当时算的，实时那份可能被 LLM
 * 复核改过）。归档里的 topics 只存 label，这里用 COMPILED_TOPICS 还原成
 * { key, label }，和 /api/events 保持同一形状，前端不用写两套判断。
 *
 * 返回 coverageFrom：数据实际覆盖到的最早时刻。归档不满 24h 时前端要如实
 * 标注「覆盖 HH:MM 起」，不能让时间轴假装有 24 小时。
 */
/**
 * 归档行 / 实时行 → 统一形状。归档只存 label，这里用 COMPILED_TOPICS 还原
 * 成 { key, label }；认不出的 label 保留 label、key 留空，别把信息丢掉。
 */
function normalizeHistoryRow(ev) {
  const topics = (ev.topics ?? [])
    .map((t) => {
      const label = typeof t === 'string' ? t : t?.label;
      if (!label) return null;
      const hit = TOPIC_BY_LABEL.get(label);
      return { key: hit?.key ?? '', label, strong: typeof t === 'object' ? Boolean(t.strong) : false };
    })
    .filter(Boolean);
  return {
    id: ev.id,
    time: ev.time,
    title: ev.title,
    level: ev.level ?? 'low',
    topics,
    symbols: ev.symbols ?? [],
    region: ev.region ?? 'global',
    source: ev.source,
    url: sanitizeUrl(ev.url),
    important: Boolean(ev.important),
  };
}

/** 'YYYY-MM-DD HH:mm:ss'（北京）→ 绝对毫秒；解析不了给 null */
export function eventTimeMs(time) {
  const t = new Date(`${String(time).replace(' ', 'T')}+08:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * 合并归档与实时快照（纯函数，好测）。
 *
 * 去重方向是「实时覆盖归档」：归档里的 level / topics 是写入那一刻算的，
 * 实时那份可能被 LLM 复核改过，应以它为准。
 *
 * 时间窗**两头都卡**。上界不是多余的：源里混着「2027-03-22」这种提前发布
 * 的会议公告，把未来事件算进 24h 回放，柱状图的最后一根会凭空多出来。
 */
export function mergeHistoryRows({ archiveRows = [], liveItems = [], sinceMs, nowMs, limit = 600 }) {
  const seen = new Map();

  for (const row of archiveRows) {
    const ms = eventTimeMs(row?.time);
    if (ms == null || ms < sinceMs || ms > nowMs) continue;
    if (row?.id) seen.set(row.id, normalizeHistoryRow(row));
  }
  for (const row of liveItems) {
    const ms = eventTimeMs(row?.time);
    if (ms == null || ms < sinceMs || ms > nowMs) continue;
    if (row?.id) seen.set(row.id, normalizeHistoryRow(row));
  }

  const items = [...seen.values()]
    .sort((a, b) => String(b.time).localeCompare(String(a.time)))
    .slice(0, limit);
  const oldest = items.length ? eventTimeMs(items[items.length - 1].time) : null;
  return { items, coverageFrom: oldest != null ? new Date(oldest).toISOString() : null };
}

/**
 * 最近 N 小时的完整事件流（Step 3 的 24h 时间轴用）。
 *
 * 数据来自「今天 + 昨天」两份按北京时间命名的归档，与当前实时快照合并。
 * 返回 coverageFrom：数据实际覆盖到的最早时刻 —— 归档不满 24h 时前端要
 * 如实标注「覆盖 HH:MM 起」，不能让时间轴假装有 24 小时。
 */
export async function getEventHistory({ hours = 24, limit = 600, nowMs = Date.now() } = {}) {
  const spanMs = Math.max(1, Math.min(72, Number(hours) || 24)) * 3600 * 1000;
  const sinceMs = nowMs - spanMs;

  // 北京时间的两天（跨天边界按北京算，和归档命名一致）
  const dayOf = (ms) => new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const files = [...new Set([dayOf(sinceMs), dayOf(nowMs)])]
    .map((d) => path.join(EVENTS_DIR, `${d}.jsonl`));

  const archiveRows = [];
  for (const file of files) archiveRows.push(...(await readJsonl(file)));

  const live = await getEvents({ limit: 200 });
  const merged = mergeHistoryRows({
    archiveRows,
    liveItems: live?.items ?? [],
    sinceMs,
    nowMs,
    limit,
  });

  return {
    ok: true,
    hours: Math.round(spanMs / 3600000),
    generatedAt: new Date(nowMs).toISOString(),
    count: merged.items.length,
    coverageFrom: merged.coverageFrom,
    items: merged.items,
  };
}

export async function getEvents({ force = false, limit = 160 } = {}) {
  const cached = eventsCache.get('ev');
  if (!force && cached && Date.now() - cached.at < EVENTS_CACHE_TTL_MS) {
    // 缓存期内 LLM 可能刚复核完，重新盖一次（幂等且廉价），
    // 否则前端在缓存有效期内都拿不到 AI 判定结果
    const data = cached.data;
    data.llm.applied = applyLlmResults(data.items);
    data.llm.pending = llmInFlight;
    Object.assign(data.llm, llmStats);
    return data;
  }

  // 国内三源是快讯流（秒级更新），全球源是报道流（分钟级）—— 两条并行，
  // 各自吃各自的缓存，合并后才做去重与分类。
  const DOMESTIC = [
    { key: 'jin10', name: '金十数据', run: () => fetchJin10() },
    { key: 'sina', name: '新浪财经', run: () => fetchSinaLive(2) },
    { key: 'wscn', name: '华尔街见闻', run: () => fetchWscn(40) },
  ];
  const [domesticResults, globals] = await Promise.all([
    Promise.allSettled(DOMESTIC.map((d) => d.run())),
    fetchGlobalFeeds(force),
  ]);

  const sourceStatus = [];
  const raw = [];

  domesticResults.forEach((r, i) => {
    const name = DOMESTIC[i].name;
    if (r.status === 'fulfilled') {
      sourceStatus.push({ key: DOMESTIC[i].key, source: name, kind: 'domestic', ok: true, count: r.value.length });
      raw.push(...r.value);
    } else {
      sourceStatus.push({ key: DOMESTIC[i].key, source: name, kind: 'domestic', ok: false, error: String(r.reason?.message ?? r.reason) });
    }
  });
  raw.push(...globals.items);
  sourceStatus.push(...globals.status);

  // 去重：同一 id，或标题高度重合（不同源转发同一条）
  const seenId = new Set();
  const seenTitle = new Set();
  const items = [];
  for (const ev of raw) {
    if (!ev.time || !ev.title) continue;
    if (seenId.has(ev.id)) continue;
    const key = dedupeKey(ev.title);
    if (seenTitle.has(key)) continue;
    seenId.add(ev.id);
    seenTitle.add(key);

    if (NOISE_RE.test(ev.title)) continue; // 汇总稿/营销稿不进事件流
    if (isOfficialRoutine(ev.title, ev.sourceKind)) continue; // 央行/国际组织的访谈、演讲、统计报表

    // 官方源只看标题（正文是样板文字，见 isOfficialRoutine 上的说明）。
    // 地区推断必须用同一份输入：官方公告正文常列出「与 Bank of England /
    // European Central Bank 联合」，而 REGION_WORDS 是特异优先（uk/eu 排在 us 前），
    // 于是美联储的公告会被正文里的欧洲机构名劫持成 uk。实测确认过。
    const official = ev.sourceKind === 'official';
    const textForClassify = official ? '' : ev.body;
    const info = classify(ev.title, textForClassify);
    if (!info.topics.length) continue;
    // 弱相关（例如公司新闻里顺带提到「人民币」）不算市场事件
    if (info.mainWeight < 1.5) continue;

    items.push({
      ...ev,
      // 国内快讯本身就是媒体自己的流，媒体名 = 通道名；全球源两者不同
      publisher: ev.publisher ?? ev.source,
      topics: info.topics,
      symbols: info.symbols,
      region: guessRegion(`${ev.title} ${textForClassify}`, ev.sourceRegion),
      score: Math.round(info.rawScore * 10) / 10,
      level: toLevel(info, ev.important),
    });
  }

  // 事件中心的第一性是「实时」：按时间倒序，重要度只用于视觉高亮与筛选
  items.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));

  // 关键词结果先顶上，LLM 结果能命中就覆盖（更准），并顺手在后台补跑没分类过的
  const llmApplied = applyLlmResults(items);
  kickLlmClassify(items);
  archiveEvents(items); // 不 await，失败不影响接口返回

  // 覆盖度：这是「是否真的抓到了全球各国主流媒体」唯一可验证的数字，
  // 而不是靠源列表看起来热闹。失败源单独计数，缺了能看见。
  const okSources = sourceStatus.filter((s) => s.ok);
  const publishers = new Set(items.map((i) => i.publisher).filter(Boolean));
  const data = {
    ok: items.length > 0,
    generatedAt: new Date().toISOString(),
    sources: sourceStatus,
    coverage: {
      sources: { total: sourceStatus.length, ok: okSources.length, failed: sourceStatus.length - okSources.length },
      domestic: okSources.filter((s) => s.kind === 'domestic').length,
      official: okSources.filter((s) => s.kind === 'official').length,
      media: okSources.filter((s) => s.kind === 'media').length,
      aggregate: okSources.filter((s) => s.kind === 'aggregate').length,
      languages: globals.langs,
      publishers: [...publishers].sort(),
      regions: [...new Set(items.map((i) => i.region))].sort(),
      origins: {
        direct: items.filter((i) => i.origin === 'direct').length,
        aggregate: items.filter((i) => i.origin === 'aggregate').length,
      },
    },
    total: items.length,
    counts: {
      high: items.filter((i) => i.level === 'high').length,
      mid: items.filter((i) => i.level === 'mid').length,
      low: items.filter((i) => i.level === 'low').length,
    },
    topics: COMPILED_TOPICS.map((t) => ({ key: t.key, label: t.label })),
    llm: {
      enabled: Boolean(readDshLlmConfig().apiKey),
      applied: llmApplied,
      pending: llmInFlight,
      ...llmStats,
    },
    items: items.slice(0, limit),
  };
  eventsCache.set('ev', { at: Date.now(), data });
  return data;
}
