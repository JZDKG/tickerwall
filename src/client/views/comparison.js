/* ================================================================== *
 * 内外金对照卡片（产品 2.1）
 *
 * 回答的是首页/详情页最常见的一个疑问：「国际金跌了，国内金怎么还在涨？」
 *
 * 界面纪律（与域层一致）：
 *   · 三项各自列出，**亏损项照常显示**（不做「净贡献」一个总分数）；
 *   · 不可比时只显示原因，不显示分解 —— 给数字就是在鼓励误读；
 *   · 溢价那一项必须标注「残差」，否则读者会把它当成一个新发现的原因；
 *   · 对齐到的交易日要写出来（休市不同会让两边末端不是同一天）。
 *
 * 纯字符串拼装，不碰 DOM：可以在 Node 里断言文案与结构。
 * ================================================================== */

import { esc } from '../shared/format.js';

/** 数字格式化：带符号、两位小数 */
export function pctText(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/** 方向类名：涨/跌/平（用类名 + 符号，不靠颜色单独表意） */
export function dirOf(value) {
  if (!Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/**
 * 一项贡献的行。
 *
 * @param {{key:string,label:string,changePct:number,contributionPct:number}} term
 * @param {{residual?:boolean}} [opts]
 */
export function termRowHTML(term, { residual = false } = {}) {
  const dir = dirOf(term.changePct);
  return `<div class="cmp-term" data-term="${esc(term.key)}">
      <span class="cmp-term-label">${esc(term.label)}${residual ? '<em class="cmp-residual" title="由国内价与折算价的偏离倒推，说明不了它为什么变">残差</em>' : ''}</span>
      <span class="cmp-term-change ${dir}">${pctText(term.changePct)}</span>
      <span class="cmp-term-contrib">贡献 ${pctText(term.contributionPct)}</span>
    </div>`;
}

/**
 * 整张卡片。
 *
 * @param {object} data /api/comparison/gold 的响应
 */
/**
 * 副标题：窗口名 + **真实起止日期** + 缓存状态。
 *
 * 外部走查看到的错：标题写「近 5 日」，而数据截至 10-23 且缓存已过期 ——
 * 只写窗口名会让读者以为覆盖到今天。
 */
export function comparisonWindowText(data) {
  const label = data?.windowLabel ?? '本次窗口';
  const range = data?.windowRange ?? null;
  const span = range?.start && range?.end ? ` · ${range.start} → ${range.end}` : data?.cutoff ? ` · 对齐到 ${data.cutoff}` : '';
  const stale = data?.dataAgeWarning ? ' · 日线缓存已过期（不是实时价）' : '';
  return `${label}${span}${stale}`;
}

export function comparisonCardHTML(data) {
  if (!data || data.ok === false) {
    return `<div class="cmp-card cmp-card--error"><p class="cmp-empty">对照暂时不可用：${esc(data?.error ?? '接口没有返回内容')}</p></div>`;
  }

  const head = `<div class="cmp-head">
      <h3>为什么国内金和国际金不同步？</h3>
      <p class="cmp-sub">${esc(comparisonWindowText(data))}</p>
    </div>`;

  // 不可比 / 缺数据：只给原因
  if (!data.decomposition) {
    const reasons = (data.reasonText ?? []).map((r) => `<li>${esc(r)}</li>`).join('');
    return `<div class="cmp-card" data-state="unknown">${head}
      <ul class="cmp-reasons">${reasons || '<li>数据还不足，先不做对照。</li>'}</ul>
    </div>`;
  }

  const d = data.decomposition;
  const rows = d.terms.map((t) => termRowHTML(t, { residual: t.key === 'premium' })).join('');
  const notes = (data.notes ?? []).map((n) => `<li>${esc(n)}</li>`).join('');
  const warn = data.dataAgeWarning ? `<p class="cmp-warn">${esc(data.dataAgeWarning)}</p>` : '';

  return `<div class="cmp-card" data-state="ok">
    ${head}
    <div class="cmp-total">
      <span class="cmp-total-label">国内金价变化</span>
      <span class="cmp-total-value ${dirOf(d.domesticChangePct)}">${pctText(d.domesticChangePct)}</span>
    </div>
    ${warn}
    <div class="cmp-terms">${rows}</div>
    <div class="cmp-converted">
      <span>折算价（国际金 × 汇率）</span>
      <span>${d.convertedPerGram.start.toFixed(2)} → ${d.convertedPerGram.end.toFixed(2)} 元/克</span>
      <span class="${dirOf(d.convertedChangePct)}">${pctText(d.convertedChangePct)}</span>
    </div>
    <p class="cmp-premium">境内外溢价：${d.premiumPct.start.toFixed(2)}% → ${d.premiumPct.end.toFixed(2)}%</p>
    <details class="cmp-notes"><summary>口径说明</summary><ul>${notes}</ul></details>
  </div>`;
}

/** 小尺寸版本：详情页侧栏用，只给三项最关键的数字 */
export function comparisonCompactHTML(data) {
  if (!data?.decomposition) return '';
  const d = data.decomposition;
  const byKey = Object.fromEntries(d.terms.map((t) => [t.key, t]));
  return `<div class="cmp-compact" data-state="ok">
      <span class="cmp-total-value ${dirOf(d.domesticChangePct)}">${pctText(d.domesticChangePct)}</span>
      <span class="cmp-compact-item">国际 ${pctText(byKey.intl?.changePct)}</span>
      <span class="cmp-compact-item">汇率 ${pctText(byKey.fx?.changePct)}</span>
      <span class="cmp-compact-item">溢价 ${pctText(byKey.premium?.changePct)}</span>
    </div>`;
}
