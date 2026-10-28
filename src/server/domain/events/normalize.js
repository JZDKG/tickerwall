/* ================================================================== *
 * 事件规范化：区分「提及的实体」与「影响假设」
 *
 * 起因（方案 §2 第 8 行 / §7.2）：关键词表把「债市」映射到 us10y，于是
 * 一条「中国国债期货」的稿子会挂上「美国 10 年期国债」标签；同一发言被
 * 多家媒体转载时又会各自出现。前者是**实体归错**，后者是**重复报道**。
 *
 * 这里给出两条可测的规则：
 *   1. 标的标签必须有文本证据：提到美股/美联储才能给 us10y，只提到「国债」
 *      而没有任何美国指向时不算。缺失就丢掉标签并记原因，而不是猜。
 *   2. LLM 输出按四态处理：
 *        classified  有主题或影响候选 → 校验后使用
 *        irrelevant  明确为空或无关     → 允许清除关键词产生的旧标签
 *        uncertain   说不清              → 保留未知，不升级为「有影响」
 *        invalid     结构不合法          → 走明确的规则回退，并记录失败
 *
 * 纯函数，不依赖 DOM / HTTP / 模型。
 * ================================================================== */

/**
 * 每个标的「被提及」所需的最小文本证据。
 *
 * require 里任一命中就算「被提及」；全都命不中说明这条稿子根本没提到这个市场，
 * 标签是从主题词里自动补出来的（例如「债市 → us10y」）。
 *
 * exclude 用于硬区分：提到「中国国债」「日本国债」时不应该算作美债。
 */
export const SYMBOL_ENTITY_RULES = {
  us10y: {
    label: '美国国债 / 美元利率',
    require: ['美债', '美国国债', '美国财政部', '美联储', '鲍威尔', 'fomc', '美国', '美元', 'treasury', 'ust', 'fed', 'yield', 'yields'],
    deny: ['中国国债', '中国债券', '国债期货', '日本国债', 'jgb', '英国国债', 'gilt', '德国国债', 'bund'],
  },
  'gold-intl': { label: '国际金价', require: ['黄金', '金价', '伦敦金', 'comex', 'xau', 'gold'] },
  'gold-cn': { label: '国内金价', require: ['沪金', '上海金', '国内金', '人民币金', '上期所黄金'] },
  oil: { label: 'WTI 原油', require: ['原油', 'wti', '油价', '石油', 'opec', 'crude'] },
  brent: { label: '布伦特原油', require: ['布伦特', 'brent'] },
  copper: { label: '铜', require: ['铜', 'copper', 'lme'] },
  sp500: { label: '标普 500', require: ['标普', 's&p', 'sp500', '美股'] },
  ndx100: { label: '纳斯达克 100', require: ['纳指', '纳斯达克', 'ndx', '科技股'] },
  sh000001: { label: '上证指数', require: ['上证', '沪指', 'a股', '沪深', '中国股市'] },
  btc: { label: '比特币', require: ['比特币', 'btc', '加密', '数字货币'] },
  dxy: { label: '美元指数', require: ['美元指数', 'dxy', '美元'] },
  vix: { label: 'VIX', require: ['vix', '波动率', '恐慌指数'] },
  vxn: { label: 'VXN', require: ['vxn'] },
};

function upper(s) {
  return String(s ?? '').toLowerCase();
}

/**
 * 按文本证据过滤标的标签。
 *
 * 两种调用场景必须区别对待：
 *   requireMention=true（关键词分类）
 *     标签是从主题词推出来的，例如「债市 → us10y」。没有任何美国指向就必须丢掉，
 *     否则「中国国债期货」会一直挂着美债标签。
 *   requireMention=false（模型给的影响候选）
 *     模型说的是「可能受影响的对象」，不一定在正文里出现。这时只拦**实体冲突**
 *     （明确在讲中国/日本/德国国债时不能标成 us10y），其余保留并标注证据强度 ——
 *     它是假设，不是已核实的影响。
 *
 * @param {string[]} symbols
 * @param {string} text 标题 + 正文（调用方自行拼接）
 * @param {{ requireMention?: boolean }} opts
 * @returns {{ kept:string[], dropped:Array<{symbol:string, reason:string}>, hypothesis:string[] }}
 */
export function filterSymbolsByEvidence(symbols, text, opts = {}) {
  const requireMention = opts.requireMention !== false;
  const hay = upper(text);
  const kept = [];
  const dropped = [];
  const hypothesis = [];
  for (const sym of [...new Set(symbols ?? [])]) {
    const rule = SYMBOL_ENTITY_RULES[sym];
    if (!rule) {
      // 没有规则就保留：新增标的不会因为这里没登记而静默消失
      kept.push(sym);
      continue;
    }
    const denied = (rule.deny ?? []).find((w) => hay.includes(upper(w)));
    if (denied) {
      dropped.push({ symbol: sym, reason: `DENIED_BY_ENTITY:${denied}` });
      continue;
    }
    const hit = (rule.require ?? []).some((w) => hay.includes(upper(w)));
    if (hit) {
      kept.push(sym);
      continue;
    }
    if (requireMention) {
      dropped.push({ symbol: sym, reason: 'NO_ENTITY_MENTION' });
    } else {
      kept.push(sym);
      hypothesis.push(sym);
    }
  }
  return { kept, dropped, hypothesis };
}

/** 硬区分用的实体对：中国国债 ≠ 美国国债 */
export const ENTITY_PAIRS = [
  { a: '中国国债', b: '美国国债', tokens: [['中国', '国债'], ['美国', '国债']] },
  { a: '中国央行', b: '美联储', tokens: [['中国央行', '人行', 'pboc'], ['美联储', 'fed', 'fomc']] },
];

/**
 * 文本里出现了哪些实体（可多选）。
 * 只做字面命中，不做推理 —— 这是「提及实体」，不是「受影响对象」。
 */
export function mentionedEntities(text) {
  const hay = upper(text);
  const out = [];
  for (const [symbol, rule] of Object.entries(SYMBOL_ENTITY_RULES)) {
    if ((rule.require ?? []).some((w) => hay.includes(upper(w)))) out.push(symbol);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * LLM 四态
 * ------------------------------------------------------------------ */

export const LLM_ROW_STATE = {
  classified: 'classified',
  irrelevant: 'irrelevant',
  uncertain: 'uncertain',
  invalid: 'invalid',
};

/**
 * 规范化一条 LLM 输出行。
 *
 * 判据顺序很重要：
 *   结构不合法 → invalid（不能当成「无关」）
 *   只有「无关」而没有别的主题 → irrelevant（可以清旧标签）
 *   有主题 / 有标的 / 等级 mid|high → classified
 *   其余（空数组、等级 low、字段缺失）→ uncertain（保留未知）
 *
 * @param {object} row
 * @param {{ topics?:string[], symbols?:string[], regions?:string[], normalizeTopic:(v:any)=>any, normalizeSymbol:(v:any)=>any }} adapters
 */
export function normalizeLlmRow(row, adapters = {}) {
  const normalizeTopic = adapters.normalizeTopic ?? ((v) => ({ key: String(v), label: String(v) }));
  const normalizeSymbol = adapters.normalizeSymbol ?? ((v) => String(v));
  if (!row || typeof row !== 'object') return { state: LLM_ROW_STATE.invalid, reason: 'NOT_AN_OBJECT' };

  const rawTopics = Array.isArray(row.topics) ? row.topics : null;
  const rawSymbols = Array.isArray(row.symbols) ? row.symbols : null;
  if (rawTopics == null && rawSymbols == null) {
    return { state: LLM_ROW_STATE.invalid, reason: 'NO_TOPICS_NO_SYMBOLS' };
  }

  const rawLabels = (rawTopics ?? []).map((t) => String(t).trim());
  const saidIrrelevant = rawLabels.some((t) => t === '无关' || t.toLowerCase() === 'unrelated');
  const topics = rawLabels.filter((t) => t !== '无关' && t.toLowerCase() !== 'unrelated').map(normalizeTopic).filter(Boolean);
  const symbols = [...new Set((rawSymbols ?? []).map(normalizeSymbol).filter(Boolean))];
  const level = ['high', 'mid', 'low'].includes(row.level) ? row.level : 'low';
  const region = adapters.regions?.includes?.(row.region) ? row.region : null;

  // 「无关」只有在它是唯一信号时才成立；同时给了有效主题说明模型自相矛盾，
  // 这种情况按「有主题」处理，别把一条真实新闻当成噪声删掉。
  if (saidIrrelevant && !topics.length && !symbols.length) {
    return { state: LLM_ROW_STATE.irrelevant, topics: [], symbols: [], level: 'low', region, reason: 'EXPLICIT_IRRELEVANT' };
  }
  if (topics.length || symbols.length) {
    return { state: LLM_ROW_STATE.classified, topics, symbols, level, region, reason: null };
  }
  // 明确说了「无关」但等级高、或者字段为空数组：信息不足，保留未知
  return { state: LLM_ROW_STATE.uncertain, topics: [], symbols: [], level, region, reason: saidIrrelevant ? 'IRRELEVANT_WITH_SIGNAL' : 'EMPTY_RESULT' };
}
