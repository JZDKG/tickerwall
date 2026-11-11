/* ================================================================== *
 * 与生活和行业的连接（产品 2.6）
 *
 * 这一层的风险全在「多说一句」：把机制说成预测、把缺口藏起来、
 * 或者替读者算一个他没有的数据。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  LIFE_SCENARIOS,
  STEP_BASIS,
  buildLifePath,
  listScenarios,
  scenarioOf,
  scenariosForAsset,
} from '../src/server/domain/life-path.js';

describe('场景定义', () => {
  it('Phase 4：4 大民生场景，fuel-cost 保持默认第一项，全部为 cn 地区', () => {
    expect(LIFE_SCENARIOS.map((s) => s.id)).toEqual([
      'fuel-cost', 'gold-saving', 'fx-tuition', 'tech-valuation',
    ]);
    for (const s of LIFE_SCENARIOS) expect(s.region).toBe('cn');
  });

  it('每个场景都有完整传导链：≥4 步、每步 basis 合法、note 有内容', () => {
    for (const s of LIFE_SCENARIOS) {
      expect(s.steps.length).toBeGreaterThanOrEqual(4);
      for (const st of s.steps) {
        expect(Object.keys(STEP_BASIS)).toContain(st.basis);
        expect(st.note.length).toBeGreaterThan(4);
      }
    }
  });

  it('新场景的 chain 覆盖规格书要求的资产节点', () => {
    const byId = Object.fromEntries(LIFE_SCENARIOS.map((s) => [s.id, s]));
    expect(byId['gold-saving'].chain).toEqual(['gold-intl', 'usdcny', 'gold-cn']);
    expect(byId['fx-tuition'].chain).toEqual(['us10y', 'dxy', 'usdcny']);
    expect(byId['tech-valuation'].chain).toEqual(['us10y', 'dfii10', 'ndx100', 'sp500']);
  });

  it('每条链都有「取决于当地规则」或「取决于合同」的步骤（不是假装实时传导）', () => {
    for (const s of LIFE_SCENARIOS) {
      const bases = s.steps.map((x) => x.basis);
      expect(bases.includes('policy') || bases.includes('contract'), s.id).toBe(true);
    }
  });

  it('每个场景的缺口清单不为空，且明确写出「没有本地数据，所以不给数字」', () => {
    for (const s of LIFE_SCENARIOS) {
      expect(s.gaps.length).toBeGreaterThan(1);
      expect(s.gaps.join('')).toContain('本页没有');
    }
  });
});

describe('路径组装', () => {
  it('上游上行时头条说上行，但只说上游', () => {
    const p = buildLifePath({ id: 'fuel-cost', upstream: { changePct: 3.2 } });
    expect(p.headline).toContain('上行');
    expect(p.headline).not.toContain('你会');
  });

  it('上游下行时说下行', () => {
    expect(buildLifePath({ id: 'fuel-cost', upstream: { changePct: -1.5 } }).headline).toContain('下行');
  });

  it('上游几乎没动时说「没有明显方向」，不硬给一个方向', () => {
    const p = buildLifePath({ id: 'fuel-cost', upstream: { changePct: 0 } });
    expect(p.headline).toContain('没有明显方向');
  });

  it('没有上游数据时也不猜方向', () => {
    const p = buildLifePath({ id: 'fuel-cost', upstream: null });
    expect(p.headline).toContain('没有明显方向');
  });

  it('除第一步外，每一步都带「有滞后，且不按固定比例传导」', () => {
    const p = buildLifePath({ id: 'fuel-cost', upstream: { changePct: 1 } });
    expect(p.steps[0].lagNote).toBeNull();
    for (const st of p.steps.slice(1)) expect(st.lagNote).toContain('不按固定比例');
  });

  it('结论段固定：只讲机制与缺口，不预测、不给建议', () => {
    const p = buildLifePath({ id: 'fuel-cost' });
    expect(p.disclaimer).toContain('不预测');
    expect(p.disclaimer).toContain('不构成任何建议');
  });

  it('标记还需要本地数据（首版没接本地价格源）', () => {
    expect(buildLifePath({ id: 'fuel-cost' }).needsLocalData).toBe(true);
  });

  it('未知场景返回 ok=false，而不是一个空路径', () => {
    const p = buildLifePath({ id: 'nope' });
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('UNKNOWN_SCENARIO');
  });
});

describe('不越界', () => {
  it('整条路径里不出现「明天」「一定」「必然」（把机制说成预测）', () => {
    const p = buildLifePath({ id: 'fuel-cost', upstream: { changePct: 5 } });
    const text = JSON.stringify(p);
    for (const word of ['明天', '一定', '必然', '肯定']) expect(text).not.toContain(word);
  });

  it('不出现买卖建议', () => {
    const p = buildLifePath({ id: 'fuel-cost' });
    for (const word of ['买入', '卖出', '加仓', '抄底']) expect(JSON.stringify(p)).not.toContain(word);
  });

  it('不要求任何个人财务信息（不碰收入、持仓）', () => {
    const text = JSON.stringify(listScenarios()) + JSON.stringify(buildLifePath({ id: 'fuel-cost' }));
    for (const word of ['收入', '持仓', '月薪', '资产规模']) expect(text).not.toContain(word);
  });
});

describe('入口清单', () => {
  it('列出场景与上游资产', () => {
    const list = listScenarios();
    expect(list[0].id).toBe('fuel-cost');
    expect(list[0].upstream).toBe('oil');
    expect(list[0].stepCount).toBeGreaterThan(3);
  });

  it('按上游资产反查场景（含链路中间节点；只回「有关系」，不回幅度）', () => {
    expect(scenariosForAsset('oil').map((s) => s.id)).toEqual(['fuel-cost']);
    expect(scenariosForAsset('gold-intl').map((s) => s.id)).toEqual(['gold-saving']);
    expect(scenariosForAsset('us10y').map((s) => s.id)).toEqual(['fx-tuition', 'tech-valuation']);
    expect(scenariosForAsset('usdcny').map((s) => s.id)).toEqual(['gold-saving', 'fx-tuition']);
    expect(scenariosForAsset('不存在的资产')).toEqual([]);
  });

  it('scenarioOf 认 4 个已知 id，未知给 null', () => {
    for (const id of ['fuel-cost', 'gold-saving', 'fx-tuition', 'tech-valuation']) {
      expect(scenarioOf(id)?.id).toBe(id);
    }
    expect(scenarioOf('nope')).toBeNull();
  });
});
