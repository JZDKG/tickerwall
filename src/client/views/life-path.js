/* ================================================================== *
 * 生活场景卡（产品 2.6 界面 / Phase 4 P4-T3）
 *
 * 一屏三块，顺序就是读者要知道的顺序：
 *   1. 上游发生了什么（只说这一步）；
 *   2. 传导链条每一步「取决于什么」（不是乘数）；
 *   3. 已知缺口 —— **必须显示，不能折叠隐藏**。
 *
 * 缺口不折叠是有意的：把「本页没有本地价格数据」收进 details 里，
 * 等于把最重要的免责说明变成了看不见的东西。
 *
 * Phase 4：新增场景切换胶囊 [data-life-scenario="${id}"]。点击后异步拉取
 * 对应场景的传导链路卡片，替换卡片内容而不重建整个首页补充区。
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

/** 场景切换胶囊。只用响应里的 availableScenarios，不硬编码四个 id */
export function scenarioTabsHTML(available = [], activeId = '') {
  if (!available.length) return '';
  const tabs = available.map((s) => {
    const on = s.id === activeId;
    return `<button type="button" class="lp-tab${on ? ' on' : ''}" data-life-scenario="${esc(s.id)}"
      aria-pressed="${on ? 'true' : 'false'}" title="${esc(s.title ?? '')}">${esc(s.title ?? s.id)}</button>`;
  }).join('');
  return `<div class="lp-tabs" role="tablist" aria-label="生活传导场景">${tabs}</div>`;
}

/** 卡片主体（不含切换条），供切换时原位替换 */
export function lifePathBodyHTML(path) {
  const steps = path.steps ?? [];
  const gaps = path.gaps ?? [];
  return `<h3>${esc(path.title)} <span class="h3-note">${esc(path.plain ?? '')}</span></h3>
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
    <p class="lp-disclaimer">${esc(path.disclaimer ?? '')}</p>`;
}

export function lifePathHTML(path) {
  if (!path || path.ok === false) {
    return `<section class="d-block lp-card" data-state="unavailable">
      <h3>与生活的连接 <span class="h3-note">机制与缺口</span></h3>
      <div class="chart-empty chart-empty-err">这个场景暂时没有可展示的路径。</div>
    </section>`;
  }

  const available = path.availableScenarios ?? path.scenarios ?? [];
  return `<section class="d-block lp-card" data-state="ok" data-life-scenario-active="${esc(path.id ?? '')}">
    ${scenarioTabsHTML(available, path.id)}
    <div class="lp-body">${lifePathBodyHTML(path)}</div>
  </section>`;
}

/**
 * 挂载场景切换（事件委托绑在 document 上）。
 *
 * 首页补充区会被 refreshHomeBrief 反复重绘，逐按钮 addEventListener 既会叠加、
 * 重绘后又会失效；委托到 document 一次即可。切场景走 fetchLifePath 异步取数，
 * 成功后只替换 .lp-body 与按钮选中态，不重建整个折叠区（不打断读者）。
 *
 * @param {{ document?:Document, fetchLifePath?:Function }} opts
 * @returns {Function} 解绑函数
 */
export function mountLifePathSwitcher(opts = {}) {
  const doc = opts.document ?? (typeof document === 'undefined' ? null : document);
  if (!doc) return () => {};
  // 由调用方注入，避免 life-path.js → home-brief-wiring.js → home-brief.js
  // → life-path.js 的循环依赖（ESM 下会拿到未初始化的绑定）。
  const loadScenario = opts.fetchLifePath ?? (async ({ scenario, fetchJson }) => {
    const mod = await import('./home-brief-wiring.js');
    return mod.fetchLifePath({ scenario, fetchJson });
  });

  const onClick = async (e) => {
    const btn = e.target?.closest?.('[data-life-scenario]');
    if (!btn) return;
    const card = btn.closest?.('.lp-card');
    if (!card) return;
    const id = btn.getAttribute('data-life-scenario');
    if (!id || card.dataset.lifeScenarioActive === id) return;

    card.dataset.loading = '1';
    try {
      const next = await loadScenario({ scenario: id, fetchJson: opts.fetchJson });
      if (!next || next.ok === false) throw new Error('场景暂时不可用');
      card.dataset.lifeScenarioActive = id;
      card.querySelectorAll('[data-life-scenario]').forEach((b) => {
        const on = b.getAttribute('data-life-scenario') === id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const body = card.querySelector('.lp-body');
      if (body) body.innerHTML = lifePathBodyHTML(next);
    } catch {
      // 取不到就保留当前场景，不让读者看到一张空卡
      const body = card.querySelector('.lp-body');
      if (body) body.insertAdjacentHTML('afterbegin', '<p class="lp-switch-err">切换场景失败，已保留当前内容，可重试。</p>');
    } finally {
      delete card.dataset.loading;
    }
  };

  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}
