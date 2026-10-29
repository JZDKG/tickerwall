/* ================================================================== *
 * 首页问题卡：从一个具体问题出发
 *
 * 方案 §3.1 的硬要求：
 *   · 先展示最多三个「值得理解的问题」，再展示行情入口；
 *   · 第一版用**可控模板**生成问题，不让模型自由造耸动标题；
 *   · 每张卡写清：问题 / 观察事实 / 简短解释（最多两句）/ 数据状态 /
 *     主操作「看影响路径」/ 深入入口「查看行情」「查看来源」；
 *   · 排序先看数据是否可用，再看标准化变动、事件重要度与用户关注对象，
 *     并**记录排序原因**；不能用原始百分比把高波动资产长期顶在前面；
 *   · 用户阅读期间不自动重排：新结果只在下一轮「可更新」时替换。
 *
 * 纯函数 + 一个 fetch 包装，可单测。
 * ================================================================== */

import { esc } from '../../shared/format.js';
import { fetchExplanation, isExplainable, explainEnabled } from './state.js';

/** 问题模板：只用事实与状态，不写耸动标题 */
export function questionTemplate({ assetName, windowLabel, direction, magnitude, status }) {
  if (status === 'insufficient') return `${windowLabel}${assetName}为什么没有明确解释`;
  if (direction === 'flat') return `${windowLabel}${assetName}为什么基本没动`;
  /**
   * 幅度缺失时不写 `（ ）`：审阅在服务失败时看到过「为何走弱（）」。
   * 宁可只写「为何走弱」，也不留一对空括号冒充完整信息。
   */
  const dirText = `${windowLabel}${assetName}为何${direction === 'up' ? '走强' : '走弱'}`;
  return magnitude ? `${dirText}（${magnitude}）` : dirText;
}

const WINDOW_LABEL = { session: '过去一个交易时段，', '5d': '最近 5 个交易时段，', '1m': '最近一个月，' };

/** 目标事实的方向与幅度（只用于「问题」措辞，不当作原因） */
export function targetFactOf(explanation) {
  const f = (explanation?.facts ?? []).find((x) => x.code === 'TARGET_CHANGE');
  if (!f?.change) return { direction: 'unknown', magnitude: '', value: null };
  const v = f.change.value;
  const direction = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const abs = Math.abs(v);
  const unit = f.change.unit === 'bp' ? 'bp' : '%';
  const magnitude = `${abs.toFixed(unit === 'bp' ? 1 : 2)}${unit}`;
  return { direction, magnitude, value: v, unit, window: f.window };
}

/**
 * 卡片的解释文案：**一条白话路径 + 本次事实 + 一个重要未知**。
 *
 * 外部走查的原话：「写『观测与实际收益率、名义利率方向一致』，但没有回答
 * 这些因素通常怎样影响黄金、本次缺什么」。原来的两句话只描述了状态码，
 * 读者还得自己翻译成经济关系。
 *
 * 三段各自的边界：
 *   · 路径：只描述**一般机制**（这条渠道通常怎么传导），不是本次归因；
 *   · 事实：只写本次窗口的数字与方向，不写原因；
 *   · 未知：优先用服务端给的 unknowns 原文；没有就按状态码给一句诚实的兜底。
 */
export function explainBriefOf(explanation) {
  if (!explanation) return { path: '', fact: '', unknown: '' };
  const fact = targetFactOf(explanation);
  const hypotheses = explanation.hypotheses ?? [];

  // 1) 白话路径：挑一条「本次有观测支持」的渠道；都没有就挑第一条已登记的机制
  const supported = hypotheses.filter((h) => h.status === 'consistent' || h.status === 'mixed');
  const pick = supported[0] ?? hypotheses[0] ?? null;
  const path = pick?.plain
    ? String(pick.plain).trim()
    : pick?.label
      ? `常见路径：${pick.label}。`
      : '';

  // 2) 本次事实：数字来自 TARGET_CHANGE，不掺原因
  const dirText = fact.direction === 'up' ? '上升' : fact.direction === 'down' ? '下降' : fact.direction === 'flat' ? '基本持平' : '';
  const factText = fact.magnitude ? `本时段${dirText} ${fact.magnitude}。` : '';

  // 3) 一个重要未知：优先 unknowns 的原文，其次按状态给一句
  let unknown = '';
  const firstUnknown = (explanation.unknowns ?? []).find((u) => u?.text || u?.message);
  if (firstUnknown) unknown = String(firstUnknown.text ?? firstUnknown.message).trim();
  else if (pick?.status === 'untested' && pick?.reasons?.includes('OUT_OF_WINDOW')) {
    unknown = '这次窗口里没有这条渠道的同窗观测，它只能算历史背景。';
  } else if (pick?.status === 'untested') {
    unknown = '这条渠道本次缺必要条件，还无法检验。';
  } else if (!pick) {
    unknown = '还没有可用的机制记录，暂时说不上常见的传导路径。';
  } else {
    unknown = '一致性不等于因果：还有别的因素可能同时起作用，这里没有排除。';
  }

  return { path, fact: factText, unknown };
}

/** 简报一句话（保留给旧调用方）：路径 + 事实 + 未知拼成两句以内 */
export function shortExplainOf(explanation) {
  if (!explanation) return '';
  if (explanation.contentStatus === 'insufficient') return '缺少可比观测，先给不出候选因素。';
  const { path, fact, unknown } = explainBriefOf(explanation);
  const head = [fact, path].filter(Boolean).join('');
  return [head, unknown].filter(Boolean).join(' ');
}

/** 数据状态文案：截至时间 / 延迟 / 过期 / 部分缺失都要能看见 */
export function dataStatusOf(meta, explanation) {
  if (!explanation) return { text: '正在准备', tone: 'pending' };
  const parts = [];
  const asOf = explanation.asOf ? String(explanation.asOf).slice(0, 16).replace('T', ' ') : null;
  if (asOf) parts.push(`截至 ${asOf}`);
  if (meta?.freshness === 'stale') parts.push('已过期');
  else if (meta?.freshness === 'fresh') parts.push('正常更新周期内');
  if (meta?.freshness === 'unavailable') parts.push('无可用观测');
  const missing = (explanation.unknowns ?? []).filter((u) => /^MISSING_|UNAVAILABLE_/.test(u.code)).length;
  if (missing) parts.push(`部分因素缺失（${missing} 项）`);
  return {
    text: parts.join(' · ') || '状态未知',
    tone: meta?.freshness === 'stale' ? 'warn' : meta?.freshness === 'fresh' ? 'ok' : 'dim',
  };
}

/** 历史序列的日波动（用于标准化变动，避免按百分比排序） */
export function sigmaOfHistory(history) {
  const vals = (Array.isArray(history) ? history : []).filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 8) return null;
  const rets = [];
  for (let i = 1; i < vals.length; i += 1) rets.push(Math.log(vals[i] / vals[i - 1]));
  if (rets.length < 5) return null;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1));
  return sd > 0 ? sd : null;
}

/**
 * 排序：先可用性，再标准化变动，再看是否用户关注。
 *
 * 返回每张卡都带 `reasons`，界面与日志都能检查「为什么它在第一位」。
 * 没有历史波动数据时明确退化到原始幅度，并记录 NO_SIGMA_FALLBACK ——
 * 而不是假装做了标准化。
 */
export function rankQuestions(cards, { focusAssets = [] } = {}) {
  const focus = new Set(focusAssets);
  const scored = cards.map((c) => {
    const reasons = [];
    let score = 0;
    // 1) 数据是否可用（权重最大：不可用的卡片不该排在前面）
    if (c.phase === 'ready') {
      score += 100;
      reasons.push('DATA_READY');
    } else if (c.phase === 'pending') {
      score += 20;
      reasons.push('DATA_PENDING');
    } else {
      reasons.push('DATA_UNAVAILABLE');
    }
    if (c.freshness === 'stale') {
      score -= 30;
      reasons.push('DATA_STALE');
    }
    // 2) 标准化变动：|change| / σ，避免按百分比把高波动资产顶上去
    if (c.standardizedMove != null) {
      score += Math.min(60, Math.abs(c.standardizedMove) * 20);
      reasons.push(`Z_MOVE_${c.standardizedMove.toFixed(2)}`);
    } else if (c.movePct != null) {
      score += Math.min(20, Math.abs(c.movePct));
      reasons.push('NO_SIGMA_FALLBACK');
    }
    // 3) 用户关注对象：最近看过的资产优先
    if (focus.has(c.assetId)) {
      score += 25;
      reasons.push('USER_FOCUS');
    }
    return { ...c, score: Number(score.toFixed(2)), reasons };
  });
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * 把一次解释响应变成一张问题卡（不排序）。
 *
 * @param {{assetId:string, assetName:string, windowKey:string, status:number, body:object}} input
 */
export function cardFromResponse({ assetId, assetName, windowKey, status, body }) {
  const explanation = body?.explanation ?? null;
  const meta = body?.meta ?? null;
  const phase = status === 200 && explanation ? 'ready' : status === 202 ? 'pending' : 'error';
  const fact = targetFactOf(explanation);
  const brief = shortExplainOf(explanation);
  const briefParts = explainBriefOf(explanation);
  const dataStatus = dataStatusOf(meta, explanation);
  const question = questionTemplate({
    assetName: assetName ?? assetId,
    windowLabel: WINDOW_LABEL[windowKey] ?? '',
    direction: fact.direction,
    magnitude: fact.magnitude,
    status: explanation?.contentStatus ?? (phase === 'pending' ? 'insufficient' : 'unknown'),
  });
  return {
    assetId,
    assetName: assetName ?? assetId,
    windowKey,
    phase,
    freshness: meta?.freshness ?? null,
    question,
    fact: explanation
      ? `${fact.direction === 'up' ? '上升' : fact.direction === 'down' ? '下降' : '基本持平'} ${fact.magnitude}`.trim()
      : null,
    brief: brief || null,
    // 三段分开给：卡片按「路径 / 事实 / 未知」分行显示，读者不用自己翻译
    briefParts: {
      path: briefParts.path || null,
      fact: briefParts.fact || null,
      unknown: briefParts.unknown || null,
    },
    dataStatus,
    movePct: fact.value,
    standardizedMove: null,
    href: `#/d/${encodeURIComponent(assetId)}`,
    explanationId: explanation?.id ?? null,
    reasons: [],
  };
}

/**
 * 取资产列表并逐项取解释，生成最多 max 张卡。
 *
 * 注意这里**只读快照**：页面切换不会触发上游与模型调用。
 */
export async function loadQuestionCards({ assets = [], max = 3, fetchImpl, focusAssets = [], windowKey = 'session' } = {}) {
  if (!explainEnabled()) return [];
  const pool = (assets.length ? assets : [{ assetId: 'gold-intl', name: '国际金价' }]).filter((a) =>
    isExplainable(a.assetId),
  );
  const cards = [];
  for (const a of pool) {
    const { status, body } = await fetchExplanation({ assetId: a.assetId, windowKey, fetchImpl });
    const card = cardFromResponse({ assetId: a.assetId, assetName: a.name, windowKey, status, body });
    if (a.sigma) card.standardizedMove = card.movePct == null ? null : (card.movePct / 100) / a.sigma;
    cards.push(card);
  }
  return rankQuestions(cards, { focusAssets }).slice(0, max);
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

export function questionCardsHTML(cards) {
  if (!cards?.length) return '';
  return `<div class="q-head">
      <h2>先看这几个问题</h2>
      <span class="q-note">每张卡都标了数据状态与依据入口；这里的问题由模板生成，不是模型编的标题。</span>
    </div>
    <ul class="q-list">
      ${cards
        .map(
          (c, i) => `<li class="q-card" data-q-asset="${esc(c.assetId)}" data-q-phase="${esc(c.phase)}">
        <div class="q-top">
          <span class="q-idx">${i + 1}</span>
          <h3>${esc(c.question)}</h3>
          <span class="q-status ${esc(c.dataStatus.tone)}">${esc(c.dataStatus.text)}</span>
        </div>
        ${
          /**
           * 三段分行：路径 / 事实 / 未知。
           *
           * 原来只有一段「观测与…方向一致」，读者得自己翻译成经济关系
           * （外部走查的原话）。分开写之后每段只承担一件事：
           * 路径讲一般机制、事实讲本窗口发生了什么、未知讲这次还缺什么。
           */
          c.briefParts?.path
            ? `<p class="q-path"><b>常见路径</b>${esc(c.briefParts.path)}</p>`
            : ''
        }
        ${c.fact ? `<p class="q-fact"><b>本次事实</b>${esc(c.fact)}</p>` : ''}
        ${
          c.briefParts?.unknown
            ? `<p class="q-unknown"><b>还缺什么</b>${esc(c.briefParts.unknown)}</p>`
            : c.brief
              ? `<p class="q-brief">${esc(c.brief)}</p>`
              : '<p class="q-brief q-dim">解释仍在准备，稍后会自动补上。</p>'
        }
        <div class="q-actions">
          ${
            /**
             * 三个按钮三个落点（外部走查：前两个原来指向同一个详情地址，
             * 第三个直接打开 JSON）：
             *   看影响路径 → 详情页解释卡，自动展开第一条渠道
             *   查看行情   → 详情页走势图
             *   看依据     → 详情页解释卡里的证据条目（不是裸 JSON）
             */
            ''
          }
          <a class="q-primary" href="${esc(deepLink(c, 'path'))}" data-q-path="${esc(c.assetId)}">看影响路径</a>
          <a class="q-secondary" href="${esc(deepLink(c, 'chart'))}">查看行情</a>
          <a class="q-secondary" href="${esc(deepLink(c, 'evidence'))}">看依据</a>
        </div>
      </li>`,
        )
        .join('')}
    </ul>`;
}

/** 主操作：跳到该资产详情页，并把窗口带过去（同一解释快照） */
export function pathHashFor(card) {
  return `${card.href}?window=${encodeURIComponent(card.windowKey)}`;
}

/**
 * 三个按钮的深链接：同一个详情页，但**落点不同**。
 *
 * `focus` 由详情页消费：
 *   path     → 展开解释卡的第一条渠道（读者要看的是传导链）
 *   chart    → 滚到历史走势
 *   evidence → 滚到解释卡的证据区（带日期与来源，不是裸 JSON）
 */
export function deepLink(card, focus) {
  const base = pathHashFor(card);
  return `${base}&focus=${encodeURIComponent(focus)}`;
}
