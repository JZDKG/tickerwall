// @vitest-environment jsdom
/* ================================================================== *
 * 今天重点三件的界面（产品 §3）
 *
 * 三条约定：不足三件不改口、每条显示排序依据、关键发布只报时间不报预期。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { focusRowHTML, todayFocusHTML, untilText } from '../src/client/views/today-focus.js';

const mount = (s) => {
  const el = document.createElement('div');
  el.innerHTML = s;
  return el;
};

const focus3 = {
  count: 3,
  short: false,
  rule: '按「高等级 → 关联可解释标的 → 时间新」排序；同一件事的转载只占一位',
  focus: [
    { id: 'a', title: 'A', time: '2026-10-28 10:00:00', why: '高等级', sources: 1 },
    { id: 'b', title: 'B', time: '2026-10-28 09:00:00', why: '当天事件', sources: 2 },
    { id: 'c', title: 'C', time: '2026-10-28 08:00:00', why: '当天事件', sources: 1 },
  ],
  next: { title: 'CPI', releaseAt: '2026-10-29T12:00:00.000Z', inMs: 90_000_000 },
};

describe('还有多久', () => {
  it('分钟级', () => {
    expect(untilText(30 * 60_000)).toBe('30 分钟后');
  });

  it('小时级', () => {
    expect(untilText(5 * 3600_000)).toBe('5 小时后');
  });

  it('天级', () => {
    expect(untilText(72 * 3600_000)).toBe('3 天后');
  });

  it('已经过去了说「即将」（不显示负数）', () => {
    expect(untilText(-1000)).toBe('即将');
    expect(untilText(null)).toBe('即将');
  });
});

describe('三件齐全', () => {
  it('标题写「三件」，不写「共 3 件」', () => {
    const el = mount(todayFocusHTML(focus3));
    expect(el.querySelector('h3').textContent).toContain('三件');
  });

  it('列出三条并带序号', () => {
    const el = mount(todayFocusHTML(focus3));
    const rows = [...el.querySelectorAll('.tf-row')];
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('.tf-idx').textContent).toBe('1');
  });

  it('转载条目显示「N 家也在报」', () => {
    const el = mount(todayFocusHTML(focus3));
    expect(el.querySelectorAll('.tf-row')[1].textContent).toContain('2 家也在报');
  });

  it('排序规则摊开写在卡片里', () => {
    const el = mount(todayFocusHTML(focus3));
    expect(el.querySelector('.tf-rule').textContent).toContain('转载只占一位');
  });
});

describe('不足三件不改口', () => {
  const focus1 = { ...focus3, count: 1, short: true, focus: [focus3.focus[0]] };

  it('标题不写「三件」，写「共 1 件」', () => {
    const el = mount(todayFocusHTML(focus1));
    expect(el.querySelector('h3').textContent).toContain('共 1 件');
    expect(el.querySelector('h3').textContent).not.toContain('三件');
  });

  it('明确说「今天只有 1 件」（不拿低等级事件填满）', () => {
    const el = mount(todayFocusHTML(focus1));
    expect(el.querySelector('.tf-short').textContent).toContain('今天只有 1 件');
  });

  it('三件齐全时没有那句「今天只有」', () => {
    expect(mount(todayFocusHTML(focus3)).querySelector('.tf-short')).toBeNull();
  });
});

describe('下一件关键发布', () => {
  it('给标题、时间与倒计时', () => {
    const el = mount(todayFocusHTML(focus3));
    const next = el.querySelector('.tf-next');
    expect(next.textContent).toContain('CPI');
    expect(next.textContent).toContain('后');
  });

  it('没有下一件时说「日历里暂时没有」，不是空白', () => {
    const el = mount(todayFocusHTML({ ...focus3, next: null }));
    expect(el.querySelector('.tf-next').dataset.state).toBe('none');
    expect(el.textContent).toContain('暂时没有');
  });

  it('不显示预期值（没有校准依据的预期只会增加权威感）', () => {
    const el = mount(todayFocusHTML(focus3));
    for (const word of ['预期', '预计', '市场认为']) expect(el.textContent).not.toContain(word);
  });
});

describe('空态与异常', () => {
  it('一件都没有时给空态并保留规则说明', () => {
    const el = mount(todayFocusHTML({ count: 0, rule: '排序规则' }));
    expect(el.querySelector('.tf-card').dataset.state).toBe('empty');
    expect(el.textContent).toContain('排序规则');
  });

  it('传 null 不抛', () => {
    expect(() => todayFocusHTML(null)).not.toThrow();
  });

  it('行里的未知字段不输出 undefined', () => {
    expect(focusRowHTML({}, 0)).not.toContain('undefined');
  });
});

/* ================================================================== *
 * 第 86 轮：事件中心的时区、语言与序号（外部走查）
 *
 * 三个具体错：
 *   1. 「下一件发布」显示 13:30，而日历显示 21:30 —— 因为切的是 UTC ISO 字符；
 *   2. 今天重点里混进德语/韩语/意大利语标题，占位却读不懂；
 *   3. `<ol>` 自带编号 + `.tf-idx` 叠成「1 1」，看起来像重复序号。
 * ================================================================== */
describe('时区与语言', () => {
  it('下一件发布按北京时间显示，并标注时区', async () => {
    const { nextWhenText } = await import('../src/client/views/today-focus.js');
    // 13:30Z = 21:30 北京时间
    expect(nextWhenText({ releaseAt: '2026-11-06T13:30:00.000Z', releaseLocal: { date: '2026-11-06', time: '21:30' } }))
      .toBe('2026-11-06 21:30（北京时间）');
  });

  it('没有 releaseLocal 时按 ISO 换算，不直接切字符', async () => {
    const { nextWhenText } = await import('../src/client/views/today-focus.js');
    const text = nextWhenText({ releaseAt: '2026-11-06T13:30:00.000Z' });
    expect(text).toContain('21:30');
    expect(text).not.toContain('13:30');
    expect(text).toContain('北京时间');
  });

  it('时间无法解析时明说「时间待确认」，不显示空串', async () => {
    const { nextWhenText } = await import('../src/client/views/today-focus.js');
    expect(nextWhenText({ releaseAt: 'nonsense' })).toBe('时间待确认');
  });

  it('非中文报道标「原文」，不冒充译文', async () => {
    const { focusRowHTML } = await import('../src/client/views/today-focus.js');
    const html = focusRowHTML({ id: 'e1', title: 'DAX dürfte zulegen', time: '2026-10-29 14:26:00', script: 'latin', why: '高等级' }, 0);
    expect(html).toContain('原文（非中文）');
    const zh = focusRowHTML({ id: 'e2', title: '美国非农就业报告', time: '2026-10-29 14:26:00', script: 'han', why: '高等级' }, 0);
    expect(zh).not.toContain('原文');
  });

  it('列表用 ul（避免与 .tf-idx 叠成重复序号）', async () => {
    const { todayFocusHTML } = await import('../src/client/views/today-focus.js');
    const html = todayFocusHTML({ count: 1, short: true, focus: [{ id: 'e1', title: 'x', time: '2026-10-29 10:00:00', why: '当天事件' }], rule: 'r' });
    expect(html).toContain('<ul class="tf-list">');
    expect(html).not.toContain('<ol class="tf-list">');
  });

  it('表头标注「时间为北京时间」', async () => {
    const { todayFocusHTML } = await import('../src/client/views/today-focus.js');
    const html = todayFocusHTML({ count: 1, short: true, focus: [{ id: 'e1', title: 'x', time: '2026-10-29 10:00:00', why: '当天事件' }], rule: 'r' });
    expect(html).toContain('北京时间');
  });
});
