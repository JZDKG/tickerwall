/* ================================================================== *
 * 生活场景卡（产品 2.6 的界面）
 *
 * 一屏三块，顺序就是读者要知道的顺序：
 *   1. 上游发生了什么（只说这一步）；
 *   2. 传导链条每一步「取决于什么」（不是乘数）；
 *   3. 已知缺口 —— **必须显示，不能折叠隐藏**。
 *
 * 缺口不折叠是有意的：把「本页没有本地价格数据」收进 details 里，
 * 等于把最重要的免责说明变成了看不见的东西。
 * ================================================================== */

import { esc } from '../shared/format.js';

const BASIS_TONE = { mechanism: 'pos', policy: 'dim', contract: 'dim' };

export function stepRowHTML(step, index) {
  const tone = BASIS_TONE[step?.basis] ?? 'dim';
  const lag = step?.lagNote ? `<span class="lp-lag">${esc(step.lagNote)}</span>` : '';
  return `<li class="lp-step" data-basis="${esc(step?.basis ?? '')}">
      <span class="lp-idx">${index + 1}</span>
      <span class="lp-label">${esc(step?.label ?? '')}</span>
      <span class="lp-basis ${tone}">${esc(step?.basisText ?? '')}</span>
      <span class="lp-note">${esc(step?.note ?? '')}</span>
      ${lag}
    </li>`;
}

export function lifePathHTML(path) {
  if (!path || path.ok === false) {
    return `<section class="d-block lp-card" data-state="unavailable">
      <h3>与生活的连接 <span class="h3-note">机制与缺口</span></h3>
      <div class="chart-empty chart-empty-err">这个场景暂时没有可展示的路径。</div>
    </section>`;
  }

  const steps = path.steps ?? [];
  const gaps = path.gaps ?? [];

  return `<section class="d-block lp-card" data-state="ok">
    <h3>${esc(path.title)} <span class="h3-note">${esc(path.plain ?? '')}</span></h3>
    <p class="lp-headline">${esc(path.headline ?? '')}</p>
    <ol class="lp-chain">${steps.map(stepRowHTML).join('')}</ol>
    ${
      gaps.length
        ? `<div class="lp-gaps">
            <h4>已知缺口（${gaps.length} 条）</h4>
            <ul>${gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
          </div>`
        : ''
    }
    ${path.needsLocalData ? '<p class="lp-needs">本页缺本地价格数据，因此不给幅度与预测。</p>' : ''}
    <p class="lp-disclaimer">${esc(path.disclaimer ?? '')}</p>
  </section>`;
}
