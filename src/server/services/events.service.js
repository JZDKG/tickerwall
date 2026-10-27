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
import { kvGetJson, kvSetJson, appendJsonl, readJsonlField } from '../db/index.js';
import { DATA_DIR } from '../paths.js';

const EVENTS_CACHE_TTL_MS = 25_000;
const eventsCache = new Map();

/** 主题规则：命中任意关键词就打上该主题，并关联受影响标的 */
const TOPIC_RULES = [
  { key: 'fed', label: '货币政策', weight: 3,
    words: ['美联储', '加息', '降息', 'FOMC', '利率决议', '鲍威尔', '议息', '点阵图', '缩表', '扩表', 'QE', 'Taper', '联邦基金利率', '贴现率', '超额准备金'],
    symbols: ['us10y', 'dxy', 'sp500', 'ndx100', 'gold-intl', 'btc'] },
  { key: 'inflation', label: '通胀', weight: 3,
    words: ['CPI', 'PPI', '通胀', '通膨', '物价', 'PCE', '消费者物价', '生产者物价', '核心CPI', '通胀预期'],
    symbols: ['us10y', 'gold-intl', 'dxy', 'sp500'] },
  { key: 'jobs', label: '就业', weight: 3,
    words: ['非农', '失业率', '就业人数', 'ADP', '初请', '续请', '薪资', '劳动参与率', '裁员'],
    symbols: ['us10y', 'dxy', 'sp500', 'ndx100'] },
  { key: 'geopolitics', label: '地缘政治', weight: 3,
    words: ['战争', '冲突', '制裁', '袭击', '空袭', '轰炸', '封锁', '禁运', '关税', '贸易战', '升级', '停火', '入侵', '政变', '弹劾'],
    symbols: ['gold-intl', 'oil', 'vix'] },
  // 选举本身不是价格传导事件：绝大多数是政治八卦与民调播报。
  // 单列成低权主题、不挂任何标的，落在事件流里可看，但不会被判 high、也不连冲击弧线。
  { key: 'politics', label: '选举政治', weight: 1.2,
    words: ['选举', '大选', '中期选举', '投票', '民调', '初选', '竞选'],
    symbols: [] },
  { key: 'energy', label: '能源', weight: 2,
    words: ['OPEC', '欧佩克', '减产', '增产', '原油', '油价', '天然气', '炼油', '库存', '页岩', '钻井', '管道'],
    symbols: ['oil', 'brent'] },
  { key: 'precious', label: '贵金属', weight: 2,
    words: ['黄金', '金价', '白银', '避险', '金饰', '央行购金', '金矿', '现货金'],
    symbols: ['gold-intl', 'gold-cn'] },
  { key: 'crypto', label: '加密资产', weight: 2,
    words: ['比特币', 'BTC', '以太坊', 'ETH', '加密', '稳定币', '币安', 'Coinbase', '数字资产', '现货ETF'],
    symbols: ['btc'] },
  { key: 'china', label: '中国政策', weight: 2,
    words: ['国务院', '发改委', '财政部', '证监会', '人民银行', '央行', '降准', 'LPR', 'MLF', '专项债', '政治局', '刺激政策', '一揽子'],
    symbols: ['sh000001', 'gold-cn'] },
  { key: 'equities', label: '权益市场', weight: 2,
    words: ['纳斯达克', '标普', '道琼斯', '美股', '财报', '英伟达', '苹果', '特斯拉', '微软', '科技股', 'A股', '沪指', '恒生'],
    symbols: ['sp500', 'ndx100', 'sh000001'] },
  { key: 'rates', label: '债市', weight: 2,
    words: ['国债', '收益率', '美债', '债券', '收益率曲线', '期限利差', '拍卖'],
    symbols: ['us10y'] },
  { key: 'fx', label: '汇率', weight: 1,
    words: ['美元指数', '人民币', '日元', '欧元', '汇率', '升值', '贬值', '外汇', '中间价'],
    symbols: ['dxy'] },
  { key: 'macro', label: '宏观数据', weight: 1,
    words: ['GDP', 'PMI', '工业产出', '零售销售', '贸易帐', '进出口', '工业增加值', '社融', '信贷', '库存'],
    symbols: ['sp500', 'sh000001'] },
];

/** 关键词兜底的地区推断（LLM 会覆盖它） */
const REGION_WORDS = [
  ['cn', ['中国', '北京', '上海', '国务院', '发改委', '央行', '人民币', 'A股', '沪深', '证监会', '财政部', '深圳', '广州']],
  ['us', ['美国', '美联储', '华盛顿', '纽约', '纳斯达克', '标普', '道琼斯', '白宫', '鲍威尔', '财政部', '硅谷']],
  ['eu', ['欧元区', '欧盟', '德国', '法国', '欧洲央行', '拉加德', '意大利', '西班牙', '布鲁塞尔']],
  ['uk', ['英国', '伦敦', '英国央行', '英镑', '英格兰银行']],
  ['jp', ['日本', '东京', '日本央行', '日元', '日经']],
  ['me', ['中东', '伊朗', '以色列', '沙特', '也门', '胡塞', '阿联酋', '伊拉克', '卡塔尔', '叙利亚', '加沙']],
  ['latam', ['巴西', '阿根廷', '墨西哥', '智利', '委内瑞拉', '哥伦比亚', '秘鲁']],
  ['africa', ['南非', '埃及', '尼日利亚', '非洲', '肯尼亚']],
  ['asia', ['韩国', '印度', '新加坡', '越南', '泰国', '印尼', '马来西亚', '菲律宾', '台湾']],
];

function guessRegion(text) {
  for (const [region, words] of REGION_WORDS) {
    if (words.some((w) => text.includes(w))) return region;
  }
  return 'global';
}

/** 高影响动词：出现时额外加权，这类词往往意味着盘面会动 */
const IMPACT_WORDS = ['暴跌', '暴涨', '崩盘', '熔断', '创历史', '创新高', '创新低', '紧急', '意外', '大幅', '远超预期', '不及预期', '超预期', '暂停', '禁止', '批准', '通过', '签署'];

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
 * 清洗多义词，防止气象征候、产业政策、公司治理被误判成地缘政治冲突。
 * 「风暴袭击欧洲」和「空袭伊朗」在词表上都命中「袭击」，但前者对资产价格没有传导路径，
 * 实测这类稿子会被打成 high 并连上黄金/原油/VIX 的冲击弧线，必须拦住。
 */
function sanitizeAmbiguousContext(text) {
  return String(text ?? '')
    // 气象灾害不是地缘政治冲突
    .replace(/台风|风暴|飓风|暴雨|寒潮|暴雪|强风|洪涝|洪水|龙卷风|沙尘暴|热浪|干旱|野火/g, '气象灾害')
    .replace(/(气象灾害[^，。；！？]{0,12})袭击/g, '$1侵袭')
    .replace(/袭击([^，。！？]{0,12}(电力|交通|航班|供电|通信|港口|机场|铁路|供水))/g, '侵袭$1')
    // 政策与产业语境里的「升级」
    .replace(/消费升级|产业升级|转型升级|品牌升级|服务升级|系统升级|版本升级|技术升级|智能升级|装备升级|产品升级|结构升级|评级升级/g, '产业演进')
    // 公司治理与党争语境里的「选举 / 弹劾」
    .replace(/董事会|监事会|换届选举|独立董事|股东大会|职工代表|选举董事/g, '公司治理');
}

/**
 * 分类：标题命中的主题才算「强命中」，正文命中打 7 折。
 * 主主题取权重最大者，其余主题只做次要加权（×0.35），
 * 避免「一条稿子提到很多词」被误判成重大新闻。
 */
function classify(title, body) {
  const cTitle = sanitizeAmbiguousContext(title);
  const cBody = sanitizeAmbiguousContext(body);
  const topics = [];
  const symbols = new Set();
  let mainWeight = 0;
  let mainInTitle = false;
  let secondary = 0;

  for (const rule of TOPIC_RULES) {
    const hitTitle = rule.words.some((w) => cTitle.includes(w));
    const hitBody = !hitTitle && rule.words.some((w) => cBody.includes(w));
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

  const impact = IMPACT_WORDS.some((w) => cTitle.includes(w) || cBody.includes(w));
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
function readDshLlmConfig() {
  const home = process.env.DSH_HOME || `${process.env.HOME}/.dsh`;
  const cfg = { baseURL: null, apiKeyEnv: 'CLINE_API_KEY', models: [], apiKey: null, source: null };

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
    } catch {
      /* 无凭据 */
    }
  }

  // 优先 deepseek-v4.1-flash（dsh web 的默认模型），否则取配置里第一个
  const preferred = ['cline-pass/deepseek-v4.1-flash-1017', 'cline-pass/glm-5.3-flash'];
  cfg.model =
    preferred.find((m) => cfg.models.includes(m)) ?? cfg.models[0] ?? 'cline-pass/deepseek-v4.1-flash-1017';
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
  const rule = TOPIC_RULES.find((r) => r.key === aliased);
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

export async function getEvents({ force = false, limit = 120 } = {}) {
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

  const results = await Promise.allSettled([fetchJin10(), fetchSinaLive(2), fetchWscn(40)]);
  const sourceStatus = [];
  const raw = [];

  results.forEach((r, i) => {
    const name = ['金十数据', '新浪财经', '华尔街见闻'][i];
    if (r.status === 'fulfilled') {
      sourceStatus.push({ source: name, ok: true, count: r.value.length });
      raw.push(...r.value);
    } else {
      sourceStatus.push({ source: name, ok: false, error: String(r.reason?.message ?? r.reason) });
    }
  });

  // 去重：同一 id，或标题高度重合（不同源转发同一条）
  const seenId = new Set();
  const seenTitle = new Set();
  const items = [];
  for (const ev of raw) {
    if (!ev.time || !ev.title) continue;
    if (seenId.has(ev.id)) continue;
    const key = ev.title.slice(0, 36).replace(/\s/g, '');
    if (seenTitle.has(key)) continue;
    seenId.add(ev.id);
    seenTitle.add(key);

    if (NOISE_RE.test(ev.title)) continue; // 汇总稿/营销稿不进事件流

    const info = classify(ev.title, ev.body);
    if (!info.topics.length) continue;
    // 弱相关（例如公司新闻里顺带提到「人民币」）不算市场事件
    if (info.mainWeight < 1.5) continue;

    items.push({
      ...ev,
      topics: info.topics,
      symbols: info.symbols,
      region: guessRegion(`${ev.title} ${ev.body}`),
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

  const data = {
    ok: items.length > 0,
    generatedAt: new Date().toISOString(),
    sources: sourceStatus,
    total: items.length,
    counts: {
      high: items.filter((i) => i.level === 'high').length,
      mid: items.filter((i) => i.level === 'mid').length,
      low: items.filter((i) => i.level === 'low').length,
    },
    topics: TOPIC_RULES.map((t) => ({ key: t.key, label: t.label })),
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
