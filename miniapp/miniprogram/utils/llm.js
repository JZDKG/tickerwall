/* ================================================================== *
 * LLM 摘要（WorkBuddy 云服务，keyless）
 *
 * 为什么走 cloud.llm 而不是自己的云函数：
 *   微信云开发给新函数的默认超时只有 3 秒，而模型一次要 3~10 秒；
 *   放进 api 函数必然超时，还会把已经抓好的行情一起丢掉。
 *   SDK 这条路不需要任何 API Key（服务端按 publishableKey + 会话鉴权），
 *   也不受那个 3 秒限制，而且能流式吐字。
 *
 * 【重要 · 别改成 HTTP 网关】
 *   `deepseek-v4.1-flash` 来自「小程序成长计划」，官方约束是**只能经
 *   小程序 SDK / 云开发 SDK 调用**。也就是说 cloud.llm 这条路是唯一正路：
 *     · 不要换成 `https://xxx.api.tcloudbasegateway.com/v1/ai/...` + API Key
 *       的直连方式 —— 那个模型在该分组下不认（按网关报「模型不存在」），
 *       而且 Key 是服务端凭据，打进小程序包等于公开泄露；
 *     · 也不要挪进云函数用 Node SDK 调 —— 3 秒超时先杀掉它。
 *   换模型时同样遵守：先用 cloud.llm.models.list() 看有哪些，再改偏好列表。
 *
 * 一条硬规则：**模型只负责归纳已给的事实**。提示词里明确禁止补数字、
 * 编原因、给建议；页面上也标「AI 生成 · 不构成投资建议」。宁可摘要短，
 * 也不能让它编。
 * ================================================================== */

const { cloud } = require('./cloud');

const MODEL_CACHE_KEY = 'llm:models:v2';
/*
 * 成长计划的免费额度只覆盖这三个模型（官方文档 ai-inspire-plan-guide）：
 *   hy4-preview / hy3 / deepseek-v4.1-flash
 * 调其他模型（含 glm-5.3-flash）会走套餐额度 —— 摘要这种小任务不值得，
 * 所以偏好列表只放免费额度内的，最后才退到 auto。
 */
const FREE_TIER_MODELS = ['deepseek-v4.1-flash', 'hy3', 'hy4-preview'];
const PREFERRED_MODELS = [...FREE_TIER_MODELS, 'auto'];
/** 一次生成最多换几个模型试：限流时换模型有用，但每换一次都是一次调用量 */
const MAX_ATTEMPTS = 2;

const SYSTEM_PROMPT = [
  '你是一名中文财经编辑，负责把快讯压缩成客观摘要。',
  '严格遵守：只使用给定标题里出现的事实；不补充外部信息；不编造数字、原因或预测；',
  '不评价好坏；不给出任何买卖建议；不逐条复述原文。',
  '输出简体中文，2 到 3 句，不超过 120 字。',
].join('');

function isReady() {
  return !!(cloud && cloud.llm && cloud.llm.chat && cloud.llm.chat.completions);
}

/**
 * 候选模型列表（按偏好排好序），缓存成数组。
 * 缓存的是一整条降级链而不仅是第一个 —— 限流时才有「下一个」可用。
 */
async function rankModels(force) {
  const cached = force ? null : wx.getStorageSync(MODEL_CACHE_KEY);
  if (Array.isArray(cached) && cached.length) return cached;

  const models = await cloud.llm.models.list();
  if (!Array.isArray(models) || !models.length) throw new Error('没有可用模型');
  const usable = models
    .filter((m) => m && m.disabled !== true && m.id)
    .map((m) => m.id);

  const ordered = [];
  for (const id of PREFERRED_MODELS) {
    if (usable.includes(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const id of usable) if (!ordered.includes(id)) ordered.push(id);
  if (!ordered.length) throw new Error('没有可用模型');

  wx.setStorageSync(MODEL_CACHE_KEY, ordered);
  return ordered;
}

/** 模型不存在 / 已下线的错误文案 */
function isModelError(msg) {
  return /model|模型/i.test(msg) && /not|invalid|unsupported|不存在|无效|下线|不可用|does not/i.test(msg);
}

/** 限流 / 额度耗尽的错误：这种错误换一个模型往往就能过 */
function isQuotaError(msg) {
  return /429|rate limit|too many|quota|exceed|超出|频率|额度|限流/i.test(msg);
}

/** 把原始错误翻译成用户能看懂的一句话（页面直接展示） */
function friendlyError(err) {
  const raw = String((err && (err.message || err.errMsg)) || err || '生成失败').trim();
  if (/429|超出频率|额度|限流|rate limit/i.test(raw)) {
    return '模型调用已达频率/额度上限，稍后再试或点「重写」换模型';
  }
  return raw;
}

/** 跑一次流式请求，把增量回调出去，返回完整文本 */
async function streamOnce(model, messages, opts) {
  let text = '';
  for await (const chunk of cloud.llm.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.3,
    signal: opts.signal,
  })) {
    const choice = chunk && chunk.choices && chunk.choices[0];
    const piece = choice && choice.delta && choice.delta.content;
    if (piece) {
      text += piece;
      if (opts.onChunk) opts.onChunk(text);
    }
  }
  return text;
}

/**
 * 通用对话：带模型降级链 + 限流换模型重试。
 * 摘要和翻译都走这里，别各自再写一份重试逻辑。
 * @param {Array} messages 必须以 system 开头
 * @param {{onChunk?:(t:string)=>void, signal?:any}} opts
 * @returns {Promise<{text:string, model:string}>}
 */
async function runChat(messages, opts) {
  opts = opts || {};
  if (!isReady()) throw new Error('云服务未初始化');

  let candidates = await rankModels(false);
  let lastErr = null;
  let text = '';

  for (let i = 0; i < Math.min(MAX_ATTEMPTS, candidates.length); i++) {
    const model = candidates[i];
    try {
      text = await streamOnce(model, messages, opts);
      const cleaned = String(text || '').trim();
      if (!cleaned) throw new Error('模型没有返回内容');
      return { text: cleaned, model };
    } catch (err) {
      lastErr = err;
      const msg = String((err && (err.message || err.errMsg)) || err);
      const aborted = /abort|cancel/i.test(msg) || !!(opts.signal && opts.signal.aborted);
      if (aborted) throw err;
      // 只有「模型不可用」和「限流/额度」值得换模型再试；网络错误换模型也一样
      if (!isModelError(msg) && !isQuotaError(msg)) throw err;

      // 模型清单可能已经变了：清缓存重排一次，避免拿旧链反复试
      if (isModelError(msg) && i === 0) {
        wx.removeStorageSync(MODEL_CACHE_KEY);
        try {
          candidates = await rankModels(true);
        } catch (e) {
          /* 拿不到清单就沿用旧的 */
        }
      }
      // 换模型重来：先把已吐的半截清掉，否则新旧文本会拼在一起
      if (opts.onChunk) opts.onChunk('');
    }
  }

  const e = new Error(friendlyError(lastErr));
  e.cause = lastErr;
  throw e;
}

/**
 * 流式生成摘要。
 * @param {{events:Array, dateLabel:string, onChunk?:(text:string)=>void, signal?:any}} opts
 * @returns {Promise<{text:string, model:string}>}
 */
async function summarize(opts) {
  if (!isReady()) throw new Error('云服务未初始化');
  const events = (opts.events || []).filter((e) => e && e.title);
  if (!events.length) throw new Error('没有可取的事件');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildPrompt(events, opts.dateLabel || '今天') },
  ];
  return runChat(messages, opts);
}

/** 把事件整理成「时间 · 重要度 · 标题」的紧凑清单，别把整个 JSON 塞进去 */
function buildPrompt(events, dateLabel) {
  const lines = events.map((e) => {
    const lv = e.level === 'high' ? '重要' : e.level === 'mid' ? '关注' : '快讯';
    return `- [${e.hhmm || ''}·${lv}] ${String(e.title || '').slice(0, 90)}`;
  });
  return [
    `${dateLabel}的财经快讯（按重要度挑选）：`,
    ...lines,
    '',
    '请归纳成一段摘要：第一句说最主要的市场主线，第二句补一条容易被忽略但重要的。',
    '只依据上面的标题，不要编造数字或原因，不要给操作建议。',
  ].join('\n');
}

module.exports = { isReady, summarize, rankModels, runChat, friendlyError };
