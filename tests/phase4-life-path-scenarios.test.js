// @vitest-environment jsdom
/* ================================================================== *
 * Phase 4 / P4-T3：4 大生活传导场景 + 场景切换 + 边→解释卡双向映射
 *
 * 验收：切换胶囊渲染 / 异步切换 / 失败保留；
 *      resolveEdgeExplanationLink 对 18 条边全部给出可解释资产深链接；
 *      /api/life-path 四个 scenario 都返回完整结构化链路。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  scenarioTabsHTML, lifePathBodyHTML, lifePathHTML, mountLifePathSwitcher,
} from '../src/client/views/life-path.js';
import {
  MACRO_TRANSMISSION_EDGES, EDGE_BY_ID, resolveEdgeExplanationLink, SUB_HOST,
} from '../src/client/views/macro/knowledge-base.js';
import { edgeCard } from '../src/client/views/macro/panels.js';
import { LIFE_SCENARIOS, buildLifePath, listScenarios, availableScenarios } from '../src/server/domain/life-path.js';
import { getLifePath } from '../src/server/services/life-path.service.js';

const SCENARIOS = availableScenarios();
const withQuotes = (items) => async () => ({ items });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('场景清单与后端 API', () => {
  it('4 个场景，fuel-cost 第一，availableScenarios 只含 [{ id, title }]', () => {
    expect(listScenarios()).toHaveLength(4);
    expect(LIFE_SCENARIOS[0].id).toBe('fuel-cost');
    expect(SCENARIOS).toHaveLength(4);
    for (const s of SCENARIOS) expect(Object.keys(s).sort()).toEqual(['id', 'title']);
  });

  it('/api/life-path 四个 scenario 均返回完整结构化传导链路', async () => {
    for (const { id } of SCENARIOS) {
      const out = await getLifePath({ scenario: id, deps: { getQuotes: withQuotes([]) } });
      expect(out.ok, id).toBe(true);
      expect(out.id, id).toBe(id);
      expect(out.title, id).toBeTruthy();
      expect(out.headline, id).toContain('没有明显方向');
      expect(out.steps.length, id).toBeGreaterThanOrEqual(4);
      expect(out.steps[0].lagNote, id).toBeNull();
      for (const st of out.steps.slice(1)) expect(st.lagNote, id).toContain('不按固定比例');
      expect(out.gaps.length, id).toBeGreaterThan(1);
      expect(out.disclaimer, id).toContain('不预测');
      expect(out.needsLocalData, id).toBe(true);
      expect(out.availableScenarios, id).toHaveLength(4);
    }
  });

  it('不传 scenario 默认 fuel-cost；未知 id 给 UNKNOWN_SCENARIO + 清单', async () => {
    const def = await getLifePath({ deps: { getQuotes: withQuotes([]) } });
    expect(def.id).toBe('fuel-cost');
    const bad = await getLifePath({ scenario: 'nope', deps: { getQuotes: withQuotes([]) } });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('UNKNOWN_SCENARIO');
    expect(bad.availableScenarios).toHaveLength(4);
  });

  it('四个场景的文本都不越界（不预测、不给买卖建议、不碰个人财务）', () => {
    for (const { id } of SCENARIOS) {
      const text = JSON.stringify(buildLifePath({ id, upstream: { changePct: 5 } }));
      for (const word of ['明天', '一定', '必然', '肯定', '买入', '卖出', '加仓', '抄底', '收入', '持仓', '月薪', '资产规模']) {
        expect(text, `${id} 不该出现 ${word}`).not.toContain(word);
      }
    }
  });
});

describe('场景切换胶囊 UI', () => {
  const path = (id) => getLifePath({ scenario: id, deps: { getQuotes: withQuotes([]) } });

  it('scenarioTabsHTML 渲染 4 个 [data-life-scenario]，当前项 aria-pressed=true', () => {
    const html = scenarioTabsHTML(SCENARIOS, 'gold-saving');
    expect((html.match(/data-life-scenario=/g) ?? []).length).toBe(4);
    expect(html).toContain('data-life-scenario="gold-saving"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('role="tablist"');
  });

  it('空清单不渲染切换条；标题转义防注入', () => {
    expect(scenarioTabsHTML([])).toBe('');
    expect(scenarioTabsHTML([{ id: 'x', title: '<script>' }], 'x')).not.toContain('<script>');
  });

  it('lifePathHTML 带切换条 + 主体，缺口仍不折叠隐藏', async () => {
    const el = document.createElement('div');
    el.innerHTML = lifePathHTML(await path('fx-tuition'));
    expect(el.querySelectorAll('[data-life-scenario]')).toHaveLength(4);
    expect(el.querySelector('.lp-gaps')).not.toBeNull();
    expect(el.querySelector('details')).toBeNull();
    expect(el.querySelector('.lp-card').dataset.lifeScenarioActive).toBe('fx-tuition');
  });

  it('lifePathBodyHTML 渲染标题 / 头条 / 链条 / 缺口 / 结论', async () => {
    const el = document.createElement('div');
    el.innerHTML = lifePathBodyHTML(await path('tech-valuation'));
    expect(el.querySelectorAll('.lp-step')).toHaveLength(5);
    expect(el.textContent).toContain('美债利率与科技股波动');
    expect(el.textContent).toContain('不给幅度与预测');
  });

  it('ok=false / null 给可读空态，不抛', () => {
    expect(lifePathHTML({ ok: false })).toContain('data-state="unavailable"');
    expect(() => lifePathHTML(null)).not.toThrow();
  });
});

describe('mountLifePathSwitcher：异步切换', () => {
  const fetchLifePath = vi.fn(async ({ scenario }) => ({
    ok: true, id: scenario, title: `场景-${scenario}`, plain: 'p', headline: `头条-${scenario}`,
    steps: [{ label: '新步骤', basis: 'mechanism', basisText: '机制可解释', note: 'n' }],
    gaps: ['缺口'], disclaimer: '不预测', needsLocalData: true,
  }));

  const mount = async (scenario = 'fuel-cost', over = {}) => {
    const p = await getLifePath({ scenario, deps: { getQuotes: withQuotes([]) } });
    document.body.innerHTML = lifePathHTML(p);
    return mountLifePathSwitcher({ fetchLifePath, ...over });
  };

  it('点别的场景 → 拉取对应场景并原位替换卡片内容', async () => {
    const off = await mount();
    const card = document.querySelector('.lp-card');
    document.querySelector('[data-life-scenario="gold-saving"]').click();
    await vi.waitFor(() => expect(card.querySelector('.lp-body').textContent).toContain('场景-gold-saving'));
    expect(fetchLifePath).toHaveBeenCalledWith(expect.objectContaining({ scenario: 'gold-saving' }));
    expect(card.dataset.lifeScenarioActive).toBe('gold-saving');
    expect(card.querySelector('[data-life-scenario="gold-saving"]').getAttribute('aria-pressed')).toBe('true');
    expect(card.querySelector('[data-life-scenario="fuel-cost"]').getAttribute('aria-pressed')).toBe('false');
    off();
  });

  it('点当前场景不重复请求', async () => {
    fetchLifePath.mockClear();
    const off = await mount('fuel-cost');
    document.querySelector('[data-life-scenario="fuel-cost"]').click();
    await Promise.resolve();
    expect(fetchLifePath).not.toHaveBeenCalled();
    off();
  });

  it('取数失败 / ok=false 时保留当前场景并给可重试提示', async () => {
    const off = await mount('fuel-cost', {
      fetchLifePath: vi.fn(async () => { throw new Error('502'); }),
    });
    const card = document.querySelector('.lp-card');
    document.querySelector('[data-life-scenario="fx-tuition"]').click();
    await vi.waitFor(() => expect(card.querySelector('.lp-switch-err')).not.toBeNull());
    expect(card.dataset.lifeScenarioActive).toBe('fuel-cost');
    expect(card.dataset.loading).toBeUndefined();
    expect(card.querySelector('.lp-body').textContent).toContain('油价与出行成本');
    off();
  });

  it('解绑后点击不再发请求', async () => {
    fetchLifePath.mockClear();
    const off = await mount();
    off();
    document.querySelector('[data-life-scenario="gold-saving"]').click();
    await Promise.resolve();
    expect(fetchLifePath).not.toHaveBeenCalled();
  });
});

/* ------------------------------ 边 → 解释卡 ------------------------------ */

describe('resolveEdgeExplanationLink：18 条边全覆盖', () => {
  it('每条边都有 explainAssetId 与 mechanismHint', () => {
    for (const e of MACRO_TRANSMISSION_EDGES) {
      expect(e.explainAssetId, e.id).toBeTruthy();
      expect(e.mechanismHint, e.id).toBeTruthy();
    }
  });

  it('每条边都映射到 { assetId, href: "#/d/<assetId>" }，且 assetId 可解释', () => {
    const explainable = new Set([
      'gold-intl', 'gold-cn', 'oil', 'brent', 'dxy', 'us10y', 'usdcny', 'btc',
      'sp500', 'ndx100', 'sh000001', 'vix', 'vxn',
    ]);
    for (const e of MACRO_TRANSMISSION_EDGES) {
      const link = resolveEdgeExplanationLink(e);
      expect(link, e.id).not.toBeNull();
      expect(link.href, e.id).toBe(`#/d/${link.assetId}`);
      expect(link.assetId, e.id).toBe(e.explainAssetId);
      expect(explainable.has(link.assetId), e.id).toBe(true);
    }
  });

  it('簇内联动边映射到宿主卡（E16→gold-intl，E18→oil）', () => {
    expect(resolveEdgeExplanationLink(EDGE_BY_ID.get('E16')).assetId).toBe('gold-intl');
    expect(resolveEdgeExplanationLink(EDGE_BY_ID.get('E18')).assetId).toBe('oil');
  });

  it('没登记时按 to / from 回退，同源子标的走 SUB_HOST 映射', () => {
    expect(resolveEdgeExplanationLink({ to: 'gold-cn' }).assetId).toBe('gold-intl');
    expect(resolveEdgeExplanationLink({ to: 'vxn' }).assetId).toBe('vix');
    expect(resolveEdgeExplanationLink({ from: 'brent' }).assetId).toBe('oil');
    expect(SUB_HOST.get('gold-cn')).toBe('gold-intl');
  });

  it('空 / 坏输入返回 null（不造死链）', () => {
    expect(resolveEdgeExplanationLink(null)).toBeNull();
    expect(resolveEdgeExplanationLink({})).toBeNull();
    expect(resolveEdgeExplanationLink({ to: '  ' })).toBeNull();
    expect(resolveEdgeExplanationLink('E01')).toBeNull();
  });

  it('机理卡真的渲染出可点击的解释卡链接', () => {
    const html = edgeCard(
      { universe: [{ id: 'dxy', short: '美元' }, { id: 'gold-intl', short: '黄金' }] },
      EDGE_BY_ID.get('E01'), new Map(), { pair: ['dxy', 'gold-intl'] },
    );
    expect(html).toContain('href="#/d/gold-intl"');
    expect(html).toContain('data-edge-explain="gold-intl"');
  });
});
