/* ================================================================== *
 * 预期台账卡（产品 2.4 的界面）
 *
 * 这一屏回答两个问题，顺序也是这两个：
 *   1. 刚公布的那些，和预期差多少？（有偏差的排最前）
 *   2. 接下来要看什么？
 *
 * 三条与口径相关的约束（测试里逐条钉住）：
 *   · 不给命中率：一个百分比会把「哪几条反了」藏起来；
 *   · 「尚未公布」不能写成「无法判定」——前者是还没到点，后者是数据有问题；
 *   · 差额要带单位写出来，不给一个光秃秃的方向词。
 * ================================================================== */

import { esc } from '../shared/format.js';

/** 判定 → 徽章类名。词汇本身来自 domain，这里只决定颜色。 */
const TONE = {
  above: 'up',
  below: 'down',
  inLine: 'flat',
  pending: 'dim',
  undetermined: 'dim',
};

/** 差额文本：有单位就带单位，没有就只给数字 */
export function gapText(item) {
  if (item?.gap == null || !Number.isFinite(Number(item.gap))) return '—';
  const g = Number(item.gap);
  const sign = g > 0 ? '+' : '';
  const unit = item.unit ? esc(item.unit) : '';
  // 幅度很小时给三位小数，否则两位就够（读者不需要 2.3000001）
  const digits = Math.abs(g) < 0.1 ? 3 : 2;
  return `${sign}${g.toFixed(digits)}${unit}`;
}

export function releaseRowHTML(item) {
  const tone = TONE[item?.verdict] ?? 'dim';
  const label = esc(item?.label ?? '');
  return `<li class="exp-row" data-verdict="${esc(item?.verdict ?? '')}">
      <span class="exp-when">${esc(String(item?.releaseAt ?? '').slice(5, 16).replace('T', ' '))}</span>
      <span class="exp-title">${esc(item?.title ?? '')}</span>
      <span class="exp-badge ${tone}">${label}</span>
      <span class="exp-gap mono">${gapText(item)}</span>
    </li>`;
}

export function expectationsCardHTML(ledger) {
  if (!ledger || ledger.ok === false) {
    return `<section class="d-block exp-card" data-state="unavailable">
      <h3>预期与实际 <span class="h3-note">数据公布值 vs 公布前预期</span></h3>
      <div class="chart-empty chart-empty-err">日历暂时取不到${ledger?.reason ? `：${esc(ledger.reason)}` : ''}</div>
    </section>`;
  }
  if (!ledger.total) {
    return `<section class="d-block exp-card" data-state="empty">
      <h3>预期与实际 <span class="h3-note">数据公布值 vs 公布前预期</span></h3>
      <div class="chart-empty">这段时间没有带预期值的公布项。</div>
    </section>`;
  }

  const released = ledger.released ?? [];
  const pending = ledger.pending ?? [];
  const deviated = ledger.deviated ?? [];

  return `<section class="d-block exp-card" data-state="ok">
    <h3>预期与实际 <span class="h3-note">只讲偏差，不给命中率</span></h3>
    ${
      deviated.length
        ? `<div class="exp-deviated">
            <h4>与预期有偏差（${deviated.length} 条）</h4>
            <ul class="exp-list">${deviated.map(releaseRowHTML).join('')}</ul>
          </div>`
        : `<p class="exp-inline-all">已公布 ${released.length} 条，都在预期附近。</p>`
    }
    ${
      released.length
        ? `<details class="exp-released"><summary>全部已公布（${released.length}）</summary>
            <ul class="exp-list">${released.map(releaseRowHTML).join('')}</ul>
          </details>`
        : ''
    }
    ${
      pending.length
        ? `<details class="exp-pending"><summary>接下来要看（${pending.length}）</summary>
            <ul class="exp-list">${pending.map(releaseRowHTML).join('')}</ul>
          </details>`
        : ''
    }
    <p class="exp-foot">检查于 ${esc(String(ledger.checkedAt ?? '').slice(0, 16).replace('T', ' '))}${
      ledger.calendarFetchedAt ? `　·　日历抓取于 ${esc(String(ledger.calendarFetchedAt).slice(0, 16).replace('T', ' '))}` : ''
    }　·　判定只用方向与量级，不表示因果</p>
  </section>`;
}
