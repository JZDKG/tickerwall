/* ================================================================== *
 * 解释卡：三层阅读 + 六种页面状态
 *
 * 读法（方案 §3.2）：
 *   快速理解（默认展开）→ 一句变化概述、最多三个候选因素、一个关键未知
 *   理解路径（点开单条因素）→ 这条机制怎么起作用、什么条件成立、什么会削弱它
 *   查看依据（再展开）→ 原始观测、窗口、状态、来源
 *
 * 状态（方案 §3.7）：正在准备 / 部分数据可用 / 证据不足 / 证据冲突 /
 * 来源延迟过期 / 获取失败。六种都在这里显式渲染，没有「白屏」分支。
 *
 * 纯字符串渲染（无 DOM），抓取与状态保存在下方的解释模块里，方便单测。
 * 所有交互都用按钮或 <details>，键盘可达，不依赖悬停。
 * ================================================================== */

import { esc } from '../../shared/format.js';

export const EXPLAIN_WINDOWS = [
  ['session', '最近一个交易时段'],
  ['5d', '最近 5 个时段'],
  ['1m', '约 1 个月'],
];

export const CONTENT_STATUS_LABEL = {
  ready: { text: '内容已生成', tone: 'ok', note: '内容和引用都已生成，但不代表因果被证实' },
  partial: { text: '部分可用', tone: 'warn', note: '有事实，但候选机制大多还没被检验' },
  insufficient: { text: '证据不足', tone: 'dim', note: '缺少可比观测，只能给一般机制' },
};

export const CHANNEL_TONE = {
  consistent: 'ok',
  mixed: 'warn',
  not_supported: 'dim',
  untested: 'dim',
};

export const FRESHNESS_LABEL = {
  fresh: '数据在正常更新周期内',
  // 短标签 + 括号里的具体原因：两者都不重复自身
  stale: '已过期',
  unavailable: '当前没有可用观测',
};

/**
 * 「与我有什么关系」——标地区、传递条件与时间范围。
 *
 * 严禁由国际油价直接推出「某地明天汽油多少钱」：这里给的是影响渠道和
 * 需要满足的条件，不是价格预测。每一条都带地区与条件。
 */
const MEANING_NOTES = {
  'gold-intl': [
    ['购金成本（中国境内）', '国际金价以美元计价，折算成人民币/克后还要叠加境内外溢价与实际零售加价；汇率与溢价都变化时，方向可能与国际金不同。'],
    ['首饰与回收价差', '零售金饰含加工费与品牌溢价，回收价按原料金计价，两者短期不一定同步变动。'],
    ['时间范围', '这里说的是「同一窗口内的方向一致性」，不构成对下一交易日的价格预测。'],
  ],
  'gold-cn': [
    ['境内溢价', '国内金价 = 国际金折算 + 境内外溢价；进口配额与季节性需求会改变溢价，因此不能只看国际金涨跌。'],
    ['计价单位', '元/克与国际美元/盎司之间还有汇率与单位换算（1 盎司 ≈ 31.1035 克）。'],
  ],
};

export function meaningNotesFor(assetId) {
  return MEANING_NOTES[assetId] ?? [];
}

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

export function fmtFactorChange(change) {
  if (!change || !Number.isFinite(change.value)) return '—';
  const v = change.value;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  const abs = Math.abs(v);
  if (change.unit === 'bp') return `${sign}${abs.toFixed(1)}bp`;
  if (change.unit === 'pct') return `${sign}${abs.toFixed(2)}%`;
  return `${sign}${abs.toFixed(2)}`;
}

/** 时间戳只显示到分钟，避免把毫秒噪声显示给用户 */
export function shortTime(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

function evidenceRows(hypothesis) {
  const rows = (hypothesis.evidence ?? []).map((e) => {
    const win = e.window?.start && e.window?.end ? `${e.window.start} → ${e.window.end}` : '窗口未知';
    return `<tr>
      <td>${esc(e.instrumentLabel ?? e.instrumentId ?? '—')}</td>
      <td>${esc(fmtFactorChange(e.change))}</td>
      <td>${esc(win)}</td>
      <td>${esc(e.role === 'support' ? '支持' : e.role === 'contrary' ? '反向' : '背景')}</td>
    </tr>`;
  });
  if (!rows.length) return '<tr><td colspan="4">这条渠道还没有可用观测。</td></tr>';
  return rows.join('');
}

function sourceList(hypothesis) {
  const list = (hypothesis.sources ?? []).filter((s) => s?.url);
  if (!list.length) return '<span class="explain-dim">这条机制暂无可点开的来源。</span>';
  return list
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noreferrer noopener">${esc(s.title ?? s.url)}</a>`)
    .join(' · ');
}

/** 单条候选渠道（第二、三层阅读都在这里面） */
export function factorHTML(hypothesis, { open = false, index = 0 } = {}) {
  const tone = CHANNEL_TONE[hypothesis.status] ?? 'dim';
  const conds = (hypothesis.conditionCodes ?? []).length
    ? `<ul class="explain-conds">${hypothesis.conditionCodes
        .map((c) => `<li>${esc(CONDITION_TEXT_SAFE(c))}</li>`)
        .join('')}</ul>`
    : '<span class="explain-dim">这条关系没有额外的适用条件登记。</span>';
  const exclusions = (hypothesis.exclusions ?? []).length
    ? `<ul class="explain-excl">${hypothesis.exclusions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '<span class="explain-dim">未登记削弱条件。</span>';

  return `<li class="explain-factor" data-factor="${esc(hypothesis.mechanismId)}" data-open="${open ? '1' : '0'}">
    <button type="button" class="explain-factor-head" data-explain-toggle="${esc(hypothesis.mechanismId)}"
      aria-expanded="${open ? 'true' : 'false'}" aria-controls="ef-${index}">
      <span class="explain-factor-idx">${index + 1}</span>
      <span class="explain-factor-label">${esc(hypothesis.label ?? hypothesis.mechanismId)}</span>
      <span class="explain-badge ${tone}">${esc(hypothesis.statusLabel ?? '')}</span>
      <span class="explain-factor-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
    </button>
    <div class="explain-factor-body" id="ef-${index}" ${open ? '' : 'hidden'}>
      <p class="explain-plain">${esc(hypothesis.plain ?? '')}</p>
      <p class="explain-mech">${esc(hypothesis.mechanism ?? '')}</p>
      <div class="explain-sub"><b>适用条件</b>${conds}</div>
      <div class="explain-sub"><b>哪些情况会削弱它</b>${exclusions}</div>
      <div class="explain-sub"><b>查看依据</b>
        <table class="explain-evidence">
          <thead><tr><th>指标</th><th>本窗口变化</th><th>观测窗口</th><th>作用</th></tr></thead>
          <tbody>${evidenceRows(hypothesis)}</tbody>
        </table>
        <p class="explain-src">来源：${sourceList(hypothesis)}</p>
        <p class="explain-dim">关系类型：${esc(RELATION_LABEL(hypothesis.relationType))}　时滞：${
          hypothesis.horizon && hypothesis.horizon !== 'unknown' ? esc(hypothesis.horizon) : '未给出依据，不推断'
        }</p>
      </div>
    </div>
  </li>`;
}

/* 条件码 → 白话。放在这里而不是再引一份数据类型：卡片只做展示映射。
   真正的文案在 domain/explanations/mechanisms.js 的 CONDITION_TEXT 里，
   这里做兜底，避免后端新增条件码时界面出现裸代码。 */
const CONDITION_FALLBACK = {
  SAME_WINDOW: '两个指标必须落在同一组共同观测日期上',
  SIGNED_SERIES: '利率序列允许零与负值，缺失不等于零',
  NEEDS_REAL_YIELD_CONFIRMATION: '需要实际收益率确认，名义收益率单独不够',
  NEEDS_SHOCK_TYPE: '需要先区分供给冲击与需求冲击',
  NEEDS_INTERMEDIATE: '需要中间变量（通胀补偿或实际收益率）确有变化',
  NEEDS_POSITION_EVIDENCE: '需要持仓、流量或实物需求证据，VIX 单独不够',
  NEEDS_FX: '需要同窗口汇率数据',
  NOT_CAUSAL: '这条关系不表达单向因果',
  STATISTICAL_ONLY: '这只是统计相关，不给方向也不给当期原因',
};

/** 后端通过 explanation.conditionText 下发；没下发时用本地兜底 */
let SERVER_CONDITION_TEXT = null;
export function setConditionText(map) {
  SERVER_CONDITION_TEXT = map && typeof map === 'object' ? map : null;
}
function CONDITION_TEXT_SAFE(code) {
  return SERVER_CONDITION_TEXT?.[code] ?? CONDITION_FALLBACK[code] ?? String(code);
}

const RELATION_FALLBACK = {
  mechanism: '机制假设',
  'valuation-conversion': '计价换算',
  'co-driver': '共同驱动',
  'historical-correlation': '历史相关',
};
let SERVER_RELATION_TYPES = null;
export function setRelationTypes(map) {
  SERVER_RELATION_TYPES = map && typeof map === 'object' ? map : null;
}
function RELATION_LABEL(code) {
  return SERVER_RELATION_TYPES?.[code]?.label ?? RELATION_FALLBACK[code] ?? String(code ?? '机制假设');
}

/** 事实条：发生了什么（只写数字与日期，不写原因） */
function factsHTML(facts) {
  const f = (facts ?? []).find((x) => x.code === 'TARGET_CHANGE');
  if (!f) return '';
  const others = (facts ?? []).filter((x) => x.code === 'DRIVER_CHANGE').slice(0, 6);
  return `<div class="explain-facts">
    <div class="explain-fact-main">
      <b>${esc(fmtFactorChange(f.change))}</b>
      <span>${esc(f.label ?? '')}　${esc(f.window?.start ?? '')}${f.window?.end ? ` → ${esc(f.window.end)}` : ''}</span>
    </div>
    <ul class="explain-fact-chips">
      ${others
        .map(
          (o) =>
            `<li><span>${esc(o.instrumentId)}</span><b>${esc(fmtFactorChange(o.change))}</b></li>`,
        )
        .join('')}
    </ul>
  </div>`;
}

function metaLine(meta, explanation) {
  const fresh = FRESHNESS_LABEL[meta?.freshness] ?? '—';
  const cs = CONTENT_STATUS_LABEL[explanation?.contentStatus] ?? null;
  const reasons = (meta?.freshnessReasons ?? []).map((r) => FRESHNESS_REASON_TEXT[r] ?? r);
  // 过期状态由上面的提示条完整说明，meta 行不再重复一遍（同一件事只说一次）
  const freshSpan =
    meta?.freshness === 'stale'
      ? ''
      : `<span>数据状态：${esc(fresh)}${reasons.length ? `（${esc(reasons.join('；'))}）` : ''}</span>`;
  return `<div class="explain-meta">
    ${freshSpan}
    <span>截至 ${esc(shortTime(explanation?.asOf))}</span>
    ${cs ? `<span class="explain-cs ${cs.tone}" title="${esc(cs.note)}">${esc(cs.text)}</span>` : ''}
    ${cs ? `<span class="explain-cs-note">${esc(cs.note)}</span>` : ''}
    ${meta?.refreshStatus === 'pending' ? '<span class="explain-cs warn">正在准备新的解释</span>' : ''}
  </div>`;
}

export const FRESHNESS_REASON_TEXT = {
  DAILY_NATURAL_LAG: '日频数据按发布周期更新，本身不是实时行情',
  BEYOND_UPDATE_CYCLE: '已超过该数据的正常更新周期',
  NO_OBSERVATION: '窗口内没有观测',
  FALLBACK_TO_CACHE: '上游失败，使用库里的旧序列',
  SOURCE_UNAVAILABLE: '该指标当前没有可用来源',
  UNALIGNED_WINDOW: '与目标资产缺少共同时间窗',
  PARTIAL_OVERLAP: '两侧交易日不完全重叠',
};

/**
 * 主渲染。
 *
 * @param {{phase:'loading'|'ready'|'pending'|'error'|'unsupported', assetId?:string,
 *          assetName?:string, windowKey?:string, explanation?:object, meta?:object,
 *          error?:string, openFactors?:Set<string>, retryAfterMs?:number}} state
 */
export function explanationCardHTML(state = {}) {
  const phase = state.phase ?? 'loading';
  const windowKey = state.windowKey ?? 'session';
  const assetName = state.assetName ?? '该资产';
  if (state.explanation) {
    setConditionText(state.explanation.conditionText);
    setRelationTypes(state.explanation.relationTypes);
  }

  const tabs = `<div class="explain-windows" role="group" aria-label="解释窗口">
    ${EXPLAIN_WINDOWS.map(
      ([key, label]) =>
        `<button type="button" class="explain-win ${windowKey === key ? 'on' : ''}" data-explain-window="${key}">${label}</button>`,
    ).join('')}
  </div>`;

  const head = `<div class="explain-head">
    <h3>${esc(assetName)}为什么这样走
      <span class="h3-note">先读结论（约 20 秒），再点开单条渠道看依据</span>
    </h3>
    ${tabs}
  </div>`;

  if (phase === 'loading') {
    return `<section class="d-block explain-card" data-phase="loading" data-asset="${esc(state.assetId ?? '')}">
      ${head}
      <div class="explain-body"><p class="explain-loading">正在整理解释：先取观测，再核对时间窗与机制…</p></div>
    </section>`;
  }

  if (phase === 'unsupported') {
    return `<section class="d-block explain-card" data-phase="unsupported" data-asset="${esc(state.assetId ?? '')}">
      ${head}
      <div class="explain-body"><p class="explain-dim">这个标的的解释能力还没开放。下面的行情、走势与统计照常可看。</p></div>
    </section>`;
  }

  if (phase === 'error') {
    return `<section class="d-block explain-card" data-phase="error" data-asset="${esc(state.assetId ?? '')}">
      ${head}
      <div class="explain-body">
        <p class="explain-error">解释暂时取不到：${esc(state.error ?? '未知错误')}</p>
        <p class="explain-dim">行情数据不受影响。可以重试，或继续看下面的图表。</p>
        <button type="button" class="explain-retry" data-explain-retry="1">重新获取解释</button>
      </div>
    </section>`;
  }

  if (phase === 'pending' || !state.explanation) {
    const retry = Math.max(1, Math.round((state.retryAfterMs ?? 3000) / 1000));
    return `<section class="d-block explain-card" data-phase="pending" data-asset="${esc(state.assetId ?? '')}">
      ${head}
      <div class="explain-body">
        <p class="explain-loading">正在准备这个窗口的解释。观测已开始取得，机制核对还没完成。</p>
        <p class="explain-dim">约 ${retry} 秒后自动再试；下面的行情与图表已经可用。</p>
      </div>
    </section>`;
  }

  const ex = state.explanation;
  const meta = state.meta ?? {};
  const open = state.openFactors ?? new Set();
  const hypotheses = ex.hypotheses ?? [];
  // 快速理解层最多三个候选因素；证据少时不勉强凑满
  const top = hypotheses
    .filter((h) => h.status === 'consistent' || h.status === 'mixed' || h.status === 'not_supported')
    .slice(0, 3);
  const rest = hypotheses.filter((h) => !top.includes(h));
  const unknown = (ex.unknowns ?? [])[0];
  const staleNotice =
    meta.freshness === 'stale'
      ? `<div class="explain-stale">数据已过期：${esc(
          (meta.freshnessReasons ?? []).map((r) => FRESHNESS_REASON_TEXT[r] ?? r).join('；') || '来源延迟',
        )}。下面是当时生成的解释，不代表当前状态。</div>`
      : '';
  const conflictNotice = hypotheses.some((h) => h.status === 'mixed')
    ? '<div class="explain-conflict">支持与反向证据同时存在：方向未定，不是「一定会怎样」。</div>'
    : '';

  return `<section class="d-block explain-card" data-phase="ready" data-asset="${esc(state.assetId ?? '')}">
    ${head}
    <div class="explain-body">
      ${factsHTML(ex.facts)}
      <p class="explain-summary">${esc(ex.summary ?? '')}</p>
      ${staleNotice}
      ${conflictNotice}
      ${metaLine(meta, ex)}
      <ol class="explain-factors">
        ${top.map((h, i) => factorHTML(h, { open: open.has(h.mechanismId), index: i })).join('')}
      </ol>
      ${unknown ? `<p class="explain-unknown"><b>还缺什么：</b>${esc(unknown.text)}</p>` : ''}
      ${
        rest.length
          ? `<details class="explain-more">
              <summary>其余 ${rest.length} 条机制（本次没有通过检验或缺条件）</summary>
              <ol class="explain-factors">
                ${rest.map((h, i) => factorHTML(h, { open: open.has(h.mechanismId), index: top.length + i })).join('')}
              </ol>
            </details>`
          : ''
      }
      <details class="explain-checks" ${state.openChecks ? 'open' : ''}>
        <summary>接下来观察什么（${(ex.nextChecks ?? []).length} 项）</summary>
        <ul>${(ex.nextChecks ?? []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        ${
          (ex.unknowns ?? []).length > 1
            ? `<ul class="explain-unknowns">${ex.unknowns.slice(1).map((u) => `<li>${esc(u.text)}</li>`).join('')}</ul>`
            : ''
        }
      </details>
      ${
        meaningNotesFor(state.assetId).length
          ? `<details class="explain-meaning">
              <summary>与我有什么关系</summary>
              <dl>${meaningNotesFor(state.assetId)
                .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
                .join('')}</dl>
              <p class="explain-dim">以上是影响渠道与适用条件，不是对具体价格或时间的预测。</p>
            </details>`
          : ''
      }
      <p class="explain-foot">
        版本：机制 ${esc(ex.versions?.mechanisms ?? '—')} · 计算 ${esc(ex.versions?.calculation ?? '—')} · 文案 ${esc(
          ex.versions?.language ?? '—',
        )}
        <button type="button" class="explain-refresh" data-explain-refresh="1">重新获取最新解释</button>
      </p>
      <p class="explain-dim">「观测一致」只说明这次窗口里方向相同，不表示因果已被证实。</p>
    </div>
  </section>`;
}
