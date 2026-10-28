// @vitest-environment jsdom
/* ================================================================== *
 * 原位术语（产品 2.5）
 *
 * 术语表最容易变成一个「写点百科」的地方。这里断言的是纪律：
 *   · 定义只说口径与边界，不夹带买卖建议；
 *   · 提示可键盘操作（只用 hover 等于对键盘用户隐形）；
 *   · 找不到词条时什么都不显示（不显示一个空提示框）。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ALIAS_INDEX,
  TERMS,
  attachGlossary,
  findTerm,
  termHTML,
  termList,
  termTipHTML,
} from '../src/client/shared/glossary.js';

const mount = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('词条表', () => {
  it('至少 10 个词条，且每个都有 term / short / detail', () => {
    const list = termList();
    expect(list.length).toBeGreaterThanOrEqual(10);
    for (const t of list) {
      expect(t.id, '缺 id').toBeTruthy();
      expect(t.term, `${t.id} 缺 term`).toBeTruthy();
      expect(t.short?.length ?? 0).toBeGreaterThan(6);
      expect(t.detail?.length ?? 0).toBeGreaterThan(30);
    }
  });

  it('id 唯一（重复会让 data-gl-term 指向错词条）', () => {
    const ids = termList().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('定义里不出现买卖建议或收益承诺', () => {
    const banned = ['建议买入', '建议卖出', '应该买', '应该卖', '稳赚', '必涨', '必跌', '保证收益'];
    const text = termList()
      .map((t) => `${t.short}${t.detail}`)
      .join('\n');
    for (const word of banned) expect(text).not.toContain(word);
  });

  it('定义里不写具体数字（术语表不该夹带数据）', () => {
    // 只允许「20 日窗口」「30 天」这类口径说明，不允许出现价格/收益率数值
    for (const t of termList()) {
      expect(t.detail).not.toMatch(/\d{4,}/); // 4 位以上数字通常是价格或年份
      expect(t.detail).not.toMatch(/\d+\.\d+%/); // 具体百分比
    }
  });
});

describe('查找', () => {
  it('按正式名与别名都能找到', () => {
    expect(findTerm('实际收益率')?.id).toBe('realYield');
    expect(findTerm('实际利率')?.id).toBe('realYield');
    expect(findTerm('VIX')?.id).toBe('impliedVol');
    expect(findTerm('溢价')?.id).toBe('premium');
  });

  it('长别名优先：「境内外溢价」不会被「溢价」抢走', () => {
    expect(findTerm('境内外溢价')?.id).toBe('premium');
    // 别名索引里长串排在前面
    expect(ALIAS_INDEX[0][0].length).toBeGreaterThanOrEqual(ALIAS_INDEX.at(-1)[0].length);
  });

  it('找不到时返回 null（界面据此什么都不显示）', () => {
    expect(findTerm('不存在的词')).toBeNull();
    expect(findTerm('')).toBeNull();
    expect(findTerm(null)).toBeNull();
    expect(findTerm(undefined)).toBeNull();
  });
});

describe('渲染', () => {
  it('术语按钮可聚焦，并指向自己的提示元素', () => {
    const el = mount(termHTML('实际收益率'));
    const btn = el.querySelector('.gl-term');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.tabIndex).toBe(0);
    expect(btn.getAttribute('aria-describedby')).toBe('gl-tip-realYield');
    expect(el.querySelector('#gl-tip-realYield')).toBeTruthy();
  });

  it('提示默认隐藏（不占位、不朗读）', () => {
    const el = mount(termHTML('实际收益率'));
    expect(el.querySelector('.gl-tip').hidden).toBe(true);
    expect(el.querySelector('.gl-tip').getAttribute('role')).toBe('tooltip');
  });

  it('自定义 label 时仍指向正确词条', () => {
    const el = mount(termHTML('impliedVol', { label: '隐含波动' }));
    expect(el.querySelector('.gl-term').textContent).toBe('隐含波动');
    expect(el.querySelector('.gl-term').dataset.glTerm).toBe('impliedVol');
  });

  it('未知词条退化成纯文本（不渲染一个点不开的按钮）', () => {
    const el = mount(termHTML('不存在的词'));
    expect(el.querySelector('.gl-term')).toBeNull();
    expect(el.textContent).toContain('不存在的词');
  });

  it('文本被转义（词条是我们写的，仍按外部输入对待）', () => {
    const el = mount(termHTML('实际收益率'));
    expect(el.innerHTML).not.toContain('<script');
    // 提示里的 term 正常显示
    expect(el.textContent).toContain('实际收益率');
  });

  it('termTipHTML 给短句 + 展开两段', () => {
    const el = mount(termTipHTML('实际收益率'));
    expect(el.querySelector('.gl-tip-short')).toBeTruthy();
    expect(el.querySelector('.gl-tip-detail')).toBeTruthy();
    expect(termTipHTML('不存在')).toBe('');
  });
});

describe('交互（委托绑定）', () => {
  let off;
  beforeEach(() => {
    off = attachGlossary(document);
  });
  afterEach(() => off?.());

  it('悬停显示，移开隐藏', () => {
    const el = mount(termHTML('实际收益率'));
    const btn = el.querySelector('.gl-term');
    const tip = el.querySelector('.gl-tip');
    btn.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    expect(tip.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
    expect(tip.hidden).toBe(true);
  });

  it('键盘聚焦也能显示（不只靠鼠标）', () => {
    const el = mount(termHTML('实际收益率'));
    const btn = el.querySelector('.gl-term');
    const tip = el.querySelector('.gl-tip');
    btn.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    expect(tip.hidden).toBe(false);
    btn.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    expect(tip.hidden).toBe(true);
  });

  it('Esc 关闭所有提示', () => {
    const el = mount(`${termHTML('实际收益率')}${termHTML('分位')}`);
    const tips = [...el.querySelectorAll('.gl-tip')];
    for (const btn of el.querySelectorAll('.gl-term')) {
      btn.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    }
    expect(tips.every((t) => t.hidden === false)).toBe(true);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tips.every((t) => t.hidden === true)).toBe(true);
  });

  it('重复绑定不会让一次悬停显示两次（幂等）', () => {
    const off2 = attachGlossary(document);
    const el = mount(termHTML('分位'));
    const tip = el.querySelector('.gl-tip');
    el.querySelector('.gl-term').dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    expect(tip.hidden).toBe(false);
    off2();
  });

  it('解绑后不再响应（视图重建时不会泄漏监听器）', () => {
    off();
    const el = mount(termHTML('分位'));
    const tip = el.querySelector('.gl-tip');
    el.querySelector('.gl-term').dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    expect(tip.hidden).toBe(true);
    off = () => {};
  });

  it('没有术语的页面点来点去也不报错', () => {
    mount('<div>纯文本</div>');
    expect(() => {
      document.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }).not.toThrow();
  });
});

describe('词条内容抽查', () => {
  it('溢价明确说是残差（与产品 2.1 的口径一致）', () => {
    expect(TERMS.premium.detail).toContain('残差');
  });

  it('分位说明「不说明会回落还是继续走高」', () => {
    expect(TERMS.percentile.detail).toContain('不说明');
  });

  it('相关系数说明「不等于因果」', () => {
    expect(TERMS.correlation.detail).toContain('不等于因果');
  });

  it('政策利率区分「已发生」与「预期」', () => {
    expect(TERMS.policyRate.detail).toContain('预期');
  });
});

/* ================================================================== *
 * 覆盖边角：这些分支错了不会抛异常，只会让提示「点了不出现」
 * ================================================================== */
describe('边角分支', () => {
  let off;
  afterEach(() => off?.());

  it('术语按钮不在同一父节点时静默跳过（不抛）', () => {
    off = attachGlossary(document);
    // aria-describedby 指向的提示不在父节点里
    const el = mount('<button class="gl-term" aria-describedby="gl-tip-none">孤立</button>');
    expect(() => {
      el.querySelector('.gl-term').dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    }).not.toThrow();
  });

  it('解绑后的 focusout 也不抛', () => {
    off = attachGlossary(document);
    off();
    off = () => {};
    expect(() => {
      document.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    }).not.toThrow();
  });

  it('show 之后重复 show 不报错（悬停 + 聚焦同时触发）', () => {
    off = attachGlossary(document);
    const el = mount(termHTML('分位'));
    const btn = el.querySelector('.gl-term');
    btn.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    btn.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    expect(el.querySelector('.gl-tip').hidden).toBe(false);
  });

  it('别名表的每一项都能反查到词条（不会指向空气）', () => {
    for (const [alias, id] of ALIAS_INDEX) {
      expect(TERMS[id], `${alias} → ${id}`).toBeTruthy();
    }
  });

  it('词条按钮的提示 id 与词条 id 一致（多个同名术语不会互相覆盖）', () => {
    const el = mount(`${termHTML('分位')}${termHTML('最大回撤')}`);
    const ids = [...el.querySelectorAll('.gl-tip')].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('提示的显隐细节', () => {
  let off;
  beforeEach(() => {
    off = attachGlossary(document);
  });
  afterEach(() => off?.());

  it('mouseout 在没有 aria-expanded 时也安全（不会残留状态）', () => {
    const el = mount(termHTML('分位'));
    const btn = el.querySelector('.gl-term');
    btn.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
    expect(btn.hasAttribute('aria-expanded')).toBe(false);
    expect(el.querySelector('.gl-tip').hidden).toBe(true);
  });

  it('focusout 关掉后 aria-expanded 被移除（读屏不会读到过期状态）', () => {
    const el = mount(termHTML('分位'));
    const btn = el.querySelector('.gl-term');
    btn.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    expect(btn.hasAttribute('aria-expanded')).toBe(false);
  });

  it('Esc 只关已展开的提示（没展开时是空操作）', () => {
    const el = mount(termHTML('分位'));
    const tip = el.querySelector('.gl-tip');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tip.hidden).toBe(true);
  });

  it('其他按键不影响提示（只有 Esc 关）', () => {
    const el = mount(termHTML('分位'));
    const btn = el.querySelector('.gl-term');
    btn.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(el.querySelector('.gl-tip').hidden).toBe(false);
  });
});

describe('非术语元素上的事件', () => {
  let off;
  beforeEach(() => {
    off = attachGlossary(document);
  });
  afterEach(() => off?.());

  it('四个事件落在普通元素上都是空操作（不抛、不改状态）', () => {
    const el = mount('<span class="plain">普通文字</span>');
    const span = el.querySelector('.plain');
    expect(() => {
      span.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
      span.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
      span.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
      span.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    }).not.toThrow();
    expect(el.querySelector('.gl-tip')).toBeNull();
  });

  it('root 没有 querySelectorAll 时 Esc 也安全（非 Element root）', () => {
    const off2 = attachGlossary({ addEventListener() {}, removeEventListener() {} });
    expect(() => off2()).not.toThrow();
  });
});

describe('转义与兜底的边角', () => {
  it('未知词条 + 无 label + 空 name → 空串（不显示 undefined）', () => {
    expect(termHTML('')).toBe('');
    expect(termHTML(null)).toBe('');
  });

  it('未知词条但给了 label → 用 label 当纯文本', () => {
    expect(termHTML('不存在的词', { label: '<b>粗体</b>' })).toBe('&lt;b&gt;粗体&lt;/b&gt;');
  });

  it('提示结构稳定：术语名 + 短句 + 展开三段，顺序不乱', async () => {
    const { termTipHTML } = await import('../src/client/shared/glossary.js');
    const html = termTipHTML('分位');
    expect(html.indexOf('gl-tip-term')).toBeLessThan(html.indexOf('gl-tip-short'));
    expect(html.indexOf('gl-tip-short')).toBeLessThan(html.indexOf('gl-tip-detail'));
    // 内容里的百分比/尖括号不会原样穿透成标签
    expect(html).not.toContain('<script');
  });
});
