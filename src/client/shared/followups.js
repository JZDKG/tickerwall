/* ================================================================== *
 * 有范围的追问（产品 2.5 的后半）
 *
 * 「我还不知道该怎么问」——所以**先给可点的问题**，不做自由输入。
 * 方案明确写了：自由输入不是首屏必需入口；而 §4 把「全能聊天助手」列为
 * 暂缓项，解锁条件之一正是「有范围的追问被验证有效」。
 *
 * 三条约束：
 *   1. 问题与上下文绑定：只有当前解释里**存在对应机制**时才给这个问题；
 *   2. 回答继承当前资产 / 窗口 / 证据，不引入新数据；
 *   3. 证据不足时明确说「这一版还回答不了」，而不是编一段通顺的话。
 *
 * 这一层是纯函数：吃「解释快照 + 机制」，吐「问题 + 有界回答」。
 * ================================================================== */

/** 三类与任何机制都相关的问题（顺序即展示顺序） */
export const FOLLOWUP_KINDS = [
  {
    id: 'why',
    ask: (m) => `为什么${m.shortLabel}可能影响${m.assetName}`,
    hint: '看这条渠道的机制说法与本次证据',
  },
  {
    id: 'fails',
    ask: (m) => `什么情况下${m.shortLabel}这条渠道不成立`,
    hint: '看反例、条件与未确认项',
  },
  {
    id: 'domestic',
    ask: (m) => m.domesticAsk ?? `国内${m.assetName}为什么和国际不同步`,
    hint: '看境内外价差与折算这两条腿',
  },
];

const STATUS_TEXT = {
  consistent: '这次观测与机制说法一致',
  mixed: '这次观测有支持也有不一致的地方',
  not_supported: '这次观测不支持这条机制的说法',
  untested: '这一版还没有可用的观测来检验它',
};

/** 一条机制的可读摘要（用于回答里「继承上下文」的那一句） */
function contextLine(exp, mechanism) {
  const parts = [];
  if (exp?.assetId) parts.push(`资产：${exp.assetId}`);
  if (exp?.window?.label) parts.push(`窗口：${exp.window.label}`);
  if (exp?.asOf) parts.push(`截至：${String(exp.asOf).slice(0, 16).replace('T', ' ')}`);
  if (mechanism?.mechanismVersion) parts.push(`机制版本：${mechanism.mechanismVersion}`);
  return parts.join(' · ');
}

/**
 * 生成三个追问。
 *
 * @param {{ explanation?: object }} input
 * @returns {{ id:string, ask:string, hint:string, answer:object|null }[]}
 */
export function scopedFollowups({ explanation } = {}) {
  const hyps = (explanation?.hypotheses ?? []).filter((h) => h?.mechanismId || h?.label);
  if (!hyps.length) {
    return [{
      id: 'none',
      ask: '这一版能回答什么',
      hint: '当前没有机制假设',
      answer: {
        kind: 'out_of_scope',
        text: '这一版解释还没有登记任何机制假设，因此不能回答「为什么」。先补证据再来问更合适。',
        context: contextLine(explanation, null),
        status: null,
      },
    }];
  }

  // 只取前三条机制：追问不是聊天，是「就这三条展开」
  return FOLLOWUP_KINDS.map((kind, i) => {
    const h = hyps[Math.min(i, hyps.length - 1)];
    const m = {
      // 上面的 filter 保证 label 与 mechanismId 至少有一个，不需要第三层兜底
      shortLabel: h.label ?? h.mechanismId,
      assetName: assetNameOf(explanation),
      mechanismVersion: h.mechanismVersion ?? null,
      domesticAsk: null,
    };
    return {
      id: kind.id,
      ask: kind.ask(m),
      hint: kind.hint,
      answer: answerFor(kind.id, explanation, h),
    };
  });
}

function assetNameOf(exp) {
  const id = exp?.assetId ?? '';
  const map = { 'gold-intl': '金价', 'gold-cn': '国内金价', oil: '油价', us10y: '利率', dxy: '美元', sp500: '美股' };
  // ?? 与 || 不能直接混用（语法错误），要显式括号
  return map[id] ?? (id || '这个标的');
}

function answerFor(kind, exp, h) {
  const context = contextLine(exp, h);
  const status = h.status ?? null;
  const statusText = STATUS_TEXT[status] ?? '这一版没有给出观测结论';
  const evidenceCount = (h.evidence ?? []).length;

  if (kind === 'why') {
    /**
     * 机制说明本身来自机制库（有版本），不是现场编的。
     * 证据不足时**先说证据不足**，再说机制怎么说 —— 顺序不能反：
     * 先讲机制会让读者以为机制已经成立。
     */
    const head = status === 'untested' || !evidenceCount
      ? '这一版没有可用证据检验这条渠道，下面是机制本身的说法，不是本次结论。'
      : `${statusText}（${evidenceCount} 条证据）。`;
    return {
      kind: 'why',
      text: `${head}机制：${h.label ?? h.mechanismId}。`,
      context,
      status,
    };
  }

  if (kind === 'fails') {
    const unknowns = (h.unknowns ?? exp?.unknowns ?? []).filter(Boolean);
    const conds = (h.conditions ?? []).filter(Boolean);
    if (!unknowns.length && !conds.length) {
      return {
        kind: 'fails',
        text: '这一版没有登记反例或成立条件，因此不能可靠地说出「什么情况下不成立」。这本身是一个缺口。',
        context,
        status,
      };
    }
    const list = [...conds, ...unknowns].slice(0, 3).join('；');
    return { kind: 'fails', text: `${statusText}。已知条件与未确认项：${list}。`, context, status };
  }

  // domestic：只有资产本身有「内外盘」这一层时才答
  const hasDomestic = ['gold-intl', 'gold-cn', 'oil'].includes(exp?.assetId);
  if (!hasDomestic) {
    return {
      kind: 'out_of_scope',
      text: `${assetNameOf(exp)}没有「国内与国外两个价格」这一层，这个问题不适用。`,
      context,
      status,
    };
  }
  return {
    kind: 'domestic',
    text: '境内外价格差由两条腿决定：汇率折算与本地溢价。本页只给出分解，不判断溢价该是多少。',
    context,
    status,
  };
}

/** 追问面板：可点的问题 + 点开后的回答 */
export function followupsHTML(list) {
  const items = (list ?? []).filter((x) => x?.ask);
  if (!items.length) return '';
  return items
    .map(
      (f) => `<details class="fu-item" data-kind="${f.id}">
        <summary>${f.ask}</summary>
        <p class="fu-answer">${f.answer?.text ?? ''}</p>
        <p class="fu-context">${f.answer?.context ?? ''}</p>
      </details>`,
    )
    .join('');
}
