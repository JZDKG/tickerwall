// @vitest-environment jsdom
/* ================================================================== *
 * 生活场景卡（产品 2.6 界面）
 *
 * 最要紧的一条：缺口**不能折叠隐藏**——把「本页没有本地价格数据」
 * 收进 details 里，等于把最重要的免责说明变成看不见的东西。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { lifePathEntryHTML, lifePathHTML, stepRowHTML } from '../src/client/views/life-path.js';
import { buildLifePath, listScenarios } from '../src/server/domain/life-path.js';

const mount = (s) => {
  const el = document.createElement('div');
  el.innerHTML = s;
  return el;
};

describe('链条', () => {
  const path = buildLifePath({ id: 'fuel-cost', upstream: { changePct: 2 } });

  it('每一步带上依据类型的措辞', () => {
    const el = mount(lifePathHTML(path));
    expect(el.querySelectorAll('.lp-step').length).toBe(path.steps.length);
    expect(el.textContent).toContain('取决于当地规则');
  });

  it('第一步没有滞后说明，后面的都有', () => {
    const el = mount(lifePathHTML(path));
    const rows = [...el.querySelectorAll('.lp-step')];
    expect(rows[0].querySelector('.lp-lag')).toBeNull();
    expect(rows[1].querySelector('.lp-lag')).not.toBeNull();
  });

  it('依据类型决定类名（徽章颜色）', () => {
    expect(mount(stepRowHTML({ basis: 'mechanism', basisText: '机制可解释', label: 'x' }, 0))
      .querySelector('.lp-basis').className).toContain('pos');
    expect(mount(stepRowHTML({ basis: 'policy', basisText: '取决于当地规则', label: 'x' }, 1))
      .querySelector('.lp-basis').className).toContain('dim');
  });
});

describe('缺口必须可见', () => {
  it('缺口块直接出现在卡片里，**没有包在 details 里**', () => {
    const el = mount(lifePathHTML(buildLifePath({ id: 'fuel-cost' })));
    expect(el.querySelector('.lp-gaps')).not.toBeNull();
    expect(el.querySelector('details')).toBeNull();
  });

  it('缺口条数写出来', () => {
    const path = buildLifePath({ id: 'fuel-cost' });
    const el = mount(lifePathHTML(path));
    expect(el.querySelector('.lp-gaps').textContent).toContain(`${path.gaps.length} 条`);
  });

  it('写清「缺本地价格数据，因此不给幅度」', () => {
    const el = mount(lifePathHTML(buildLifePath({ id: 'fuel-cost' })));
    expect(el.textContent).toContain('不给幅度与预测');
  });

  it('结论段在卡片里，不是小字浮层', () => {
    const el = mount(lifePathHTML(buildLifePath({ id: 'fuel-cost' })));
    expect(el.querySelector('.lp-disclaimer').textContent).toContain('不预测');
  });
});

describe('头条只说上游', () => {
  it('卡片头条来自 path.headline，不额外加工', () => {
    const path = buildLifePath({ id: 'fuel-cost', upstream: { changePct: 3 } });
    const el = mount(lifePathHTML(path));
    expect(el.querySelector('.lp-headline').textContent).toBe(path.headline);
  });

  it('整页不出现「明天」「一定」（把机制说成预测）', () => {
    const html = lifePathHTML(buildLifePath({ id: 'fuel-cost', upstream: { changePct: 5 } }));
    for (const word of ['明天', '一定', '必然']) expect(html).not.toContain(word);
  });
});

describe('异常与入口', () => {
  it('未知场景给可读空态，不抛', () => {
    const el = mount(lifePathHTML({ ok: false }));
    expect(el.querySelector('.lp-card').dataset.state).toBe('unavailable');
  });

  it('传 null 也不抛', () => {
    expect(() => lifePathHTML(null)).not.toThrow();
  });

  it('入口只列有 id 的项', () => {
    const el = mount(lifePathEntryHTML([{ id: 'a', title: 'T', plain: 'P' }, { title: '无 id' }]));
    expect(el.querySelectorAll('.lp-open')).toHaveLength(1);
  });

  it('没有可列项时整块不渲染（空入口比没有入口更糟）', () => {
    expect(lifePathEntryHTML([])).toBe('');
    expect(lifePathEntryHTML(null)).toBe('');
  });

  it('入口来自 domain 的清单', () => {
    const el = mount(lifePathEntryHTML(listScenarios()));
    expect(el.querySelector('.lp-open').dataset.scenario).toBe('fuel-cost');
  });
});
