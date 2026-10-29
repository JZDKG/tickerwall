// @vitest-environment jsdom
/* ================================================================== *
 * 内外金对照卡片（产品 2.1）
 *
 * 断言的是**界面纪律**：亏损项照常显示、不可比时不显示分解、溢价标注残差、
 * 对齐日期写出来。这些比「函数返回了字符串」重要得多。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  comparisonCardHTML,
  comparisonCompactHTML,
  dirOf,
  pctText,
  termRowHTML,
} from '../src/client/views/comparison.js';

const DECOMP = {
  status: 'ok',
  domesticChangePct: 1.42,
  convertedChangePct: 0.95,
  terms: [
    { key: 'intl', label: '国际金价（美元计价）', changePct: -0.82, contributionPct: -0.82 },
    { key: 'fx', label: '美元兑人民币', changePct: 0.35, contributionPct: 0.35 },
    { key: 'premium', label: '境内外溢价', changePct: 1.9, contributionPct: 1.89 },
  ],
  premiumPct: { start: 0.8, end: 2.7 },
  convertedPerGram: { start: 452.31, end: 456.61 },
  residualPct: 0,
};

const OK = {
  ok: true,
  status: 'ok',
  windowKey: 'session',
  windowLabel: '今日',
  cutoff: '2026-10-27',
  comparable: true,
  reasons: [],
  reasonText: [],
  decomposition: DECOMP,
  notes: ['国内金价 = 国际金价 ÷ 31.1035 × 美元兑人民币 × (1 + 境内外溢价)。三项贡献按对数分解，可加。', '「境内外溢价」是残差：由国内价与折算价的偏离倒推，说明不了它为什么变。'],
  premiumIsResidual: true,
  dataAgeWarning: null,
};

const mount = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('格式化', () => {
  it('百分比带符号，非法值给破折号（不显示 NaN）', () => {
    expect(pctText(1.234)).toBe('+1.23%');
    expect(pctText(-0.5)).toBe('-0.50%');
    expect(pctText(0)).toBe('0.00%');
    expect(pctText(null)).toBe('—');
    expect(pctText(undefined)).toBe('—');
  });

  it('方向类名：涨跌平三种，零与非法值都算平', () => {
    expect(dirOf(1)).toBe('up');
    expect(dirOf(-1)).toBe('down');
    expect(dirOf(0)).toBe('flat');
    expect(dirOf(NaN)).toBe('flat');
  });
});

describe('单个贡献行', () => {
  it('方向和数值都写进结构（不只靠颜色）', () => {
    const el = mount(termRowHTML(DECOMP.terms[0]));
    const change = el.querySelector('.cmp-term-change');
    expect(change.className).toContain('down');
    expect(change.textContent).toContain('-0.82%');
    expect(el.textContent).toContain('国际金价');
  });

  it('残差项被标注', () => {
    const el = mount(termRowHTML(DECOMP.terms[2], { residual: true }));
    expect(el.querySelector('.cmp-residual')).toBeTruthy();
    expect(el.textContent).toContain('残差');
  });
});

describe('完整卡片', () => {
  it('三项全部列出，跌的那项也在（不给一个总分数掩盖对立证据）', () => {
    const el = mount(comparisonCardHTML(OK));
    const terms = el.querySelectorAll('.cmp-term');
    expect(terms).toHaveLength(3);
    expect(el.querySelector('[data-term="intl"]').className).toContain('cmp-term');
    // 国际金是跌的，必须显示负号
    expect(el.querySelector('[data-term="intl"]').textContent).toContain('-0.82%');
    // 国内金总变化是涨的
    expect(el.querySelector('.cmp-total-value').className).toContain('up');
    expect(el.querySelector('.cmp-total-value').textContent).toContain('+1.42%');
  });

  it('写出对齐到的交易日与折算价', () => {
    const el = mount(comparisonCardHTML(OK));
    expect(el.textContent).toContain('2026-10-27');
    expect(el.textContent).toContain('452.31');
    expect(el.textContent).toContain('456.61');
  });

  it('溢价那一项带「残差」标记，口径说明可展开', () => {
    const el = mount(comparisonCardHTML(OK));
    expect(el.querySelector('[data-term="premium"] .cmp-residual')).toBeTruthy();
    expect(el.querySelector('.cmp-notes')).toBeTruthy();
    expect(el.textContent).toContain('对数分解');
  });

  it('数据过期时给出警告（相对变化仍可用，但不是实时价）', () => {
    const el = mount(comparisonCardHTML({ ...OK, dataAgeWarning: '日线缓存已过期' }));
    expect(el.querySelector('.cmp-warn').textContent).toContain('已过期');
  });

  it('新鲜时不出现警告（别制造噪声）', () => {
    expect(mount(comparisonCardHTML(OK)).querySelector('.cmp-warn')).toBeNull();
  });
});

describe('不可比 / 缺数据', () => {
  it('不可比 → 只给原因，不给任何百分比', () => {
    const el = mount(comparisonCardHTML({
      ...OK,
      status: 'unknown',
      comparable: false,
      decomposition: null,
      reasonText: ['两边最新观测不是同一天：同屏红绿不同不代表真实背离'],
    }));
    expect(el.querySelector('.cmp-reasons')).toBeTruthy();
    expect(el.textContent).toContain('不是同一天');
    // 没有分解区块
    expect(el.querySelector('.cmp-terms')).toBeNull();
    expect(el.textContent).not.toContain('+1.42%');
  });

  it('缺数据时点名缺了哪个序列', () => {
    const el = mount(comparisonCardHTML({
      ok: true,
      status: 'unknown',
      decomposition: null,
      reasonText: ['缺少日线数据：usdcny。请等采集完成再对照。'],
    }));
    expect(el.textContent).toContain('usdcny');
  });

  it('连 reason 都没有时也有兜底文案（不渲染空白卡片）', () => {
    const el = mount(comparisonCardHTML({ ok: true, decomposition: null, reasonText: [] }));
    expect(el.textContent).toContain('数据还不足');
  });

  it('接口失败 → 明确错误态', () => {
    const el = mount(comparisonCardHTML({ ok: false, error: '未知窗口: x' }));
    expect(el.querySelector('.cmp-card--error')).toBeTruthy();
    expect(el.textContent).toContain('未知窗口');
  });

  it('null 输入不抛错', () => {
    expect(() => comparisonCardHTML(null)).not.toThrow();
    expect(mount(comparisonCardHTML(null)).textContent).toContain('不可用');
  });
});

describe('紧凑版（详情页侧栏）', () => {
  it('四项关键数字在一行里', () => {
    const el = mount(comparisonCompactHTML(OK));
    expect(el.querySelectorAll('.cmp-compact-item')).toHaveLength(3);
    expect(el.textContent).toContain('国际');
    expect(el.textContent).toContain('汇率');
    expect(el.textContent).toContain('溢价');
  });

  it('没有分解时返回空串（不占位）', () => {
    expect(comparisonCompactHTML({ decomposition: null })).toBe('');
    expect(comparisonCompactHTML(null)).toBe('');
  });
});

/* ================================================================== *
 * 详情页的入口（产品 2.1 的「原位」位置）
 *
 * 对照不能只做成一个独立页面：用户是在详情页看到「内外盘对照」才产生疑问的，
 * 按钮就该在那里，点开在同一个位置展开。
 * ================================================================== */
describe('详情页接入', () => {
  it('内外盘对照块里有「为什么不同步？」按钮与卡片槽位', async () => {
    const { goldSpreadBlock } = await import('../src/client/views/detail.js');
    const html = goldSpreadBlock(
      { convertedPerGram: 452.31, xauUsd: 2000, usdCny: 7.2, domesticPrice: 455, gramsPerOunce: 31.1035, premiumPct: 0.59 },
      2,
    );
    const el = mount(String(html.value ?? html));
    expect(el.querySelector('[data-cmp-open]')).toBeTruthy();
    expect(el.querySelector('[data-cmp-slot]')).toBeTruthy();
    expect(el.textContent).toContain('为什么不同步');
  });

  it('没有折算价时不渲染这个块（不给一个空壳）', async () => {
    const { goldSpreadBlock } = await import('../src/client/views/detail.js');
    expect(goldSpreadBlock(null, 2)).toBe('');
    expect(goldSpreadBlock({ convertedPerGram: 0 }, 2)).toBe('');
  });
});

describe('取数（经统一请求层）', () => {
  it('成功时返回接口载荷', async () => {
    const { loadGoldComparison } = await import('../src/client/views/detail.js');
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => OK });
    try {
      const data = await loadGoldComparison({ windowKey: '20d', force: true });
      expect(data.ok).toBe(true);
      expect(data.decomposition).toBeTruthy();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('失败时返回可读错误（不是抛异常让页面白屏）', async () => {
    const { loadGoldComparison } = await import('../src/client/views/detail.js');
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    try {
      const data = await loadGoldComparison({ windowKey: 'session', force: true });
      expect(data.ok).toBe(false);
      expect(data.error).toContain('503');
    } finally {
      globalThis.fetch = original;
    }
  });
});

/* ================================================================== *
 * 第 87 轮：副标题必须写真实起止日期与缓存状态
 *
 * 外部走查的错：标题写「近 5 日」，数据实际截至 10-23 且缓存过期 ——
 * 只写窗口名会让读者以为覆盖到今天。
 * ================================================================== */
describe('对照卡的窗口说明', () => {
  it('有 windowRange 时写「窗口名 · 起 → 止」', async () => {
    const { comparisonWindowText } = await import('../src/client/views/comparison.js');
    const text = comparisonWindowText({ windowLabel: '近 5 日', windowRange: { start: '2026-10-17', end: '2026-10-23' } });
    expect(text).toBe('近 5 日 · 2026-10-17 → 2026-10-23');
  });

  it('缓存过期时在副标题里明说不是实时价', async () => {
    const { comparisonWindowText } = await import('../src/client/views/comparison.js');
    const text = comparisonWindowText({
      windowLabel: '近 5 日',
      windowRange: { start: '2026-10-17', end: '2026-10-23' },
      dataAgeWarning: '日线缓存已过期',
    });
    expect(text).toContain('不是实时价');
  });

  it('没有 windowRange 时退回 cutoff，不编日期', async () => {
    const { comparisonWindowText } = await import('../src/client/views/comparison.js');
    expect(comparisonWindowText({ windowLabel: '近 5 日', cutoff: '2026-10-23' })).toBe('近 5 日 · 对齐到 2026-10-23');
  });
});

/* ================================================================== *
 * 第 87 轮：内外盘对照要排在走势/分时/指标**之前**
 *
 * 外部走查：入口位于走势、分时、指标之后，要翻两屏才找得到。
 * 它是「为什么和别处不同步」的直接追问，应该紧跟解释卡。
 * ================================================================== */
describe('在详情页里的位置', () => {
  it('对照块排在「历史走势」与「关键指标」之前', async () => {
    // 页面顺序由 renderDetail 的模板决定：读源码确认四段先后
    // （goldSpreadBlock 依赖 DOM 引用，单元里只查模板顺序）
    const src = (await import('node:fs')).readFileSync('src/client/views/detail.js', 'utf8');
    const iExplain = src.indexOf('id="d-explain"');
    const iCmp = src.indexOf('goldSpreadBlock(data.derived, d)');
    // 注意用**唯一**的锚点：'历史走势' 也出现在 SVG 的 aria-label 里（第 321 行）
    const iChart = src.indexOf('<h3>历史走势');
    const iMetrics = src.indexOf('<h3>关键指标</h3>');
    expect(iExplain).toBeGreaterThan(0);
    expect(iCmp).toBeGreaterThan(iExplain);
    expect(iCmp).toBeLessThan(iChart);
    expect(iCmp).toBeLessThan(iMetrics);
  });
});
