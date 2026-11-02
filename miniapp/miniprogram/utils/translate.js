/* ================================================================== *
 * 外文快讯翻译
 *
 * 三源快讯里偶尔混进英文条目（华尔街见闻的 global channel、金十的海外
 * 快讯都会带英文原文）。这里做两件事：
 *
 *   1. **判语种不花模型**：按 CJK 字符占比 + 拉丁字母数量判断，纯本地计算。
 *      中文标题里夹 "CPI" "FOMC" 这种缩写不该被当成外文（SHIBOR 那条就是
 *      数字密集，差点被误判），所以判的是「几乎不含汉字」而不是「含英文」。
 *   2. **翻译批量做**：一次调用翻完当前列表里的所有外文条目，按索引对齐。
 *      逐条调会在 429 限流下更难受，而且 n 条就是 n 次配额。
 *
 * 一条规矩：翻译只做「忠实转换」。不许补背景、不许解释、不许把长标题
 * 拆成两句摘要 —— 那是摘要卡片的事，混在一起用户就分不清哪句是原文说的。
 * 译文单独存在 item.zh 上，原文永远保留。
 * ================================================================== */

const llm = require('./llm');

/** 译名缓存：标题文本 → 译文。事件流 45 秒一刷，命中率很高 */
const CACHE_KEY = 'trans:v1';
const CACHE_MAX = 400;
/** 一次最多翻多少条：再多就分页等用户手动触发，避免单请求过大 */
const MAX_BATCH = 20;

function hash(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readCache() {
  const raw = wx.getStorageSync(CACHE_KEY);
  return raw && typeof raw === 'object' ? raw : {};
}

function lookup(title) {
  const hit = readCache()[hash(title)];
  return hit && hit.v ? hit.v : '';
}

function remember(pairs) {
  if (!pairs.length) return;
  const cache = readCache();
  const now = Date.now();
  for (const p of pairs) {
    if (!p.zh) continue;
    cache[hash(p.title)] = { v: p.zh, t: now };
  }
  // 超量就按写入时间砍掉最老的一批，别让 storage 无限长
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX) {
    keys
      .sort((a, b) => (cache[a].t || 0) - (cache[b].t || 0))
      .slice(0, keys.length - CACHE_MAX)
      .forEach((k) => delete cache[k]);
  }
  try {
    wx.setStorageSync(CACHE_KEY, cache);
  } catch (e) {
    /* 存储满了就算了，翻译本身不该因此失败 */
  }
}

/**
 * 是不是需要翻译的外文。
 * 判据：至少有 3 个真正的英文单词（小写字母开头的 2 字母以上），
 * 且汉字占比 < 15%。
 *
 * 为什么不用「字母数」：`CPI GDP FOMC`、`ETF 净值` 这类纯缩写会被误判成英文，
 * 而真正的英文标题一定有 the/is/will/cuts 这种小写词。
 */
function isForeign(text) {
  const s = String(text || '');
  if (!s) return false;
  const lowerWords = (s.match(/\b[a-z][a-z'’-]{1,}\b/g) || []).length;
  if (lowerWords < 3) return false;
  const compact = s.replace(/\s/g, '');
  if (!compact) return false;
  const cjk = (compact.match(/[\u4e00-\u9fff]/g) || []).length;
  return cjk / compact.length < 0.15;
}

const SYSTEM_PROMPT = [
  '你是财经新闻标题的翻译器，把非中文标题忠实转成简体中文。',
  '规则：',
  '1) 只翻译，不解释、不评价、不补充背景、不加评论；',
  '2) 数字、百分比、单位、股票代码、机构缩写按原样保留（如 Fed、CPI、Q3、2.1%、NVDA）；',
  '3) 不合并、不拆分、不省略任何一条；输出条数必须等于输入条数，顺序严格一致；',
  '4) 本来就是中文的条目原样返回；',
  '5) 只输出 JSON 字符串数组，形如 ["译文1","译文2"]，不要 Markdown 代码块、不要任何说明文字。',
].join('');

function buildUserPrompt(titles) {
  const lines = titles.map((t, i) => `${i + 1}. ${String(t).slice(0, 200)}`);
  return ['逐条翻译下面的标题，按顺序返回 JSON 字符串数组：', ...lines].join('\n');
}

/** 从模型输出里挖出 JSON 数组，容忍 ```json 围栏和前后废话 */
function parseArray(text) {
  const s = String(text || '');
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const arr = JSON.parse(s.slice(start, end + 1));
      if (Array.isArray(arr)) return arr.map((x) => String(x == null ? '' : x).trim());
    } catch (e) {
      /* 落到按行解析 */
    }
  }
  // 兜底：一行一条，去掉 「1. 」「- 」前缀
  const lines = s
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)、]|[-*])\s*/, '').trim())
    .filter((l) => l && !/^```/.test(l));
  return lines;
}

/**
 * 批量翻译标题。
 * 先吃缓存，只把未命中的条目发给模型；事件流 45 秒一刷，重进页面基本零调用。
 * @param {string[]} titles
 * @param {{signal?:any}} [opts]
 * @returns {Promise<{pairs:Array<{title:string, zh:string}>, model:string, truncated:boolean}>}
 */
async function translateBatch(titles, opts) {
  opts = opts || {};
  // 同一标题可能因为「今日重点 + 流水」出现两次，去重后再翻
  const seen = {};
  const list = [];
  (titles || []).forEach((t) => {
    if (!t || seen[t]) return;
    seen[t] = 1;
    list.push(t);
  });
  const batch = list.slice(0, MAX_BATCH);
  if (!batch.length) return { pairs: [], model: '', truncated: false };

  const got = {};
  const missing = [];
  for (const t of batch) {
    const zh = lookup(t);
    if (zh) got[t] = zh;
    else missing.push(t);
  }

  let model = '';
  if (missing.length) {
    const { text, model: m } = await llm.runChat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(missing) },
      ],
      { signal: opts.signal },
    );
    model = m;

    const arr = parseArray(text);
    // 条数对不上时只认能对齐的前缀部分，剩下的留给下次 —— 宁可少翻，不能错位把
    // A 的译文贴到 B 的标题上
    const n = Math.min(arr.length, missing.length);
    const pairs = [];
    for (let i = 0; i < n; i += 1) {
      const zh = String(arr[i] || '').replace(/\s+/g, ' ').trim();
      if (!zh || zh === missing[i]) continue;
      pairs.push({ title: missing[i], zh: zh.slice(0, 300) });
    }
    remember(pairs);
    pairs.forEach((p) => {
      got[p.title] = p.zh;
    });
  }

  const out = batch.filter((t) => got[t]).map((t) => ({ title: t, zh: got[t] }));
  return { pairs: out, model, truncated: out.length < batch.length };
}

module.exports = { isForeign, lookup, translateBatch, hash, MAX_BATCH };
