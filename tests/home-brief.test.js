// @vitest-environment jsdom
/* ================================================================== *
 * 首页问题优先区（产品 2.3 + 2.4 的挂载点）
 *
 * 两条约束：
 *   · 任何一块取不到都不影响另一块；
 *   · 两块都没内容时**整块隐藏**——空白面板比没有面板更糟。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { homeBriefHTML, renderHomeBrief, shouldHideHomeBrief, watchPickerHTML } from '../src/client/views/home-brief.js';

const briefItems = { reason: 'HAS_ITEMS', count: 1, items: [{ id: 'a', time: '2026-10-28 10:00:00', title: '金价回落', sources: 2 }], sinceMs: Date.now() - 3600_000 };
const ledgerOk = {
  ok: true, status: 'ok', total: 1, checkedAt: '2026-10-28T12:00:00.000Z',
  released: [{ title: 'CPI', releaseAt: '2026-10-27T12:00:00.000Z', verdict: 'above', label: '高于预期', gap: 0.3, unit: '%' }],
  pending: [], deviated: [{ title: 'CPI', releaseAt: '2026-10-27T12:00:00.000Z', verdict: 'above', label: '高于预期', gap: 0.3, unit: '%' }],
};

describe('何时隐藏', () => {
  it('两块都空 → 隐藏', () => {
    expect(shouldHideHomeBrief({ reason: 'NO_CHANGES', empty: true }, { total: 0 })).toBe(true);
  });

  it('未选关注 + 台账空 → 隐藏（不拿「去选三个问题」占首屏）', () => {
    expect(shouldHideHomeBrief({ reason: 'NO_WATCH' }, { total: 0 })).toBe(true);
  });

  it('简报有内容 → 显示', () => {
    expect(shouldHideHomeBrief(briefItems, { total: 0 })).toBe(false);
  });

  it('台账有内容 → 显示', () => {
    expect(shouldHideHomeBrief({ reason: 'NO_CHANGES', empty: true }, ledgerOk)).toBe(false);
  });

  it('简报取不到（不是「没有」）→ 显示，让用户知道出了问题', () => {
    expect(shouldHideHomeBrief({ ok: false, reason: '502' }, { total: 0 })).toBe(false);
  });
});

describe('渲染', () => {
  const host = () => {
    const el = document.createElement('section');
    el.id = 'home-brief';
    document.body.appendChild(el);
    return el;
  };

  it('两块都渲染出来', () => {
    const el = host();
    const shown = renderHomeBrief(el, briefItems, ledgerOk);
    expect(shown).toBe(true);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain('关注简报');
    expect(el.textContent).toContain('预期与实际');
    el.remove();
  });

  it('一块取不到不影响另一块', () => {
    const el = host();
    renderHomeBrief(el, { ok: false, reason: '502' }, ledgerOk);
    expect(el.textContent).toContain('502');
    expect(el.textContent).toContain('预期与实际');
    el.remove();
  });

  it('都空时隐藏并清空（不留残留）', () => {
    const el = host();
    el.innerHTML = '<p>旧内容</p>';
    const shown = renderHomeBrief(el, { reason: 'NO_WATCH' }, { total: 0 });
    expect(shown).toBe(false);
    expect(el.hidden).toBe(true);
    expect(el.innerHTML).toBe('');
    el.remove();
  });

  it('点「选择关心的问题」会回调', () => {
    const el = host();
    let picked = 0;
    renderHomeBrief(el, { reason: 'NO_WATCH' }, { total: 0 }, { onPick: () => { picked += 1; } });
    // NO_WATCH + 空台账会隐藏，所以换一个组合让它显示出来
    renderHomeBrief(el, { reason: 'NO_WATCH' }, ledgerOk, { onPick: () => { picked += 1; } });
    el.querySelector('#wb-pick')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(picked).toBe(1);
    el.remove();
  });

  it('没有容器时安全返回', () => {
    expect(renderHomeBrief(null, briefItems, ledgerOk)).toBe(false);
  });

  it('homeBriefHTML 只拼两块，不额外包一层（样式由容器负责）', () => {
    const html = homeBriefHTML(briefItems, ledgerOk);
    expect(html).toContain('wb-card');
    expect(html).toContain('exp-card');
  });
});

describe('选择面板', () => {
  const qs = [
    { key: 'a', question: '问题 A', why: '因为 A' },
    { key: 'b', question: '问题 B', why: '因为 B' },
  ];

  it('已选的打勾，未选的留空', () => {
    const el = document.createElement('div');
    el.innerHTML = watchPickerHTML(qs, ['a']);
    expect(el.querySelector('[data-watch="a"]').checked).toBe(true);
    expect(el.querySelector('[data-watch="b"]').checked).toBe(false);
  });

  it('选满三个时其余的禁用（不让用户点进一个会被拒绝的状态）', () => {
    const el = document.createElement('div');
    el.innerHTML = watchPickerHTML(qs, ['x', 'y', 'z']);
    expect(el.querySelector('[data-watch="b"]').disabled).toBe(true);
  });

  it('说明写清「选多了就退化成全部市场」', () => {
    const el = document.createElement('div');
    el.innerHTML = watchPickerHTML(qs, []);
    expect(el.textContent).toContain('最多选三个');
  });
});

describe('生活场景作为第三块', () => {
  const life = {
    ok: true,
    title: '油价与出行成本',
    plain: '会不会传导到我的加油与出行开销',
    headline: '国际原油价格本窗口上行',
    steps: [{ label: '国际原油价格', basis: 'mechanism', basisText: '机制可解释', note: 'x' }],
    gaps: ['缺本地零售价数据'],
    disclaimer: '只说明机制，不预测',
    needsLocalData: true,
  };

  it('传了生活场景就多渲染一块', () => {
    const el = document.createElement('div');
    el.innerHTML = homeBriefHTML(briefItems, ledgerOk, life);
    expect(el.querySelector('.lp-card')).not.toBeNull();
  });

  it('没传就不渲染（不占位）', () => {
    const el = document.createElement('div');
    el.innerHTML = homeBriefHTML(briefItems, ledgerOk);
    expect(el.querySelector('.lp-card')).toBeNull();
  });

  it('前两块都空但有生活场景时仍然显示（否则这一块永远看不到）', () => {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const shown = renderHomeBrief(host, { reason: 'NO_WATCH' }, { total: 0 }, { lifePath: life });
    expect(shown).toBe(true);
    expect(host.hidden).toBe(false);
    host.remove();
  });

  it('生活场景 ok=false 时不撑开容器', () => {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const shown = renderHomeBrief(host, { reason: 'NO_WATCH' }, { total: 0 }, { lifePath: { ok: false } });
    expect(shown).toBe(false);
    host.remove();
  });
});

/* ================================================================== *
 * 首页问题优先（产品 §3）：最多三个问题，行情在后
 *
 * 这一条之前只是「首页同时有问题卡和行情」。要求是**层级**：
 * 问题在前、最多三个，行情在后。
 * ================================================================== */
describe('问题优先的层级', () => {
  const brief = (n) => ({
    ok: true,
    status: 'ok',
    hasWatch: true,
    items: Array.from({ length: n }, (_, i) => ({
      id: `e${i}`, title: `事件${i}`, time: '2026-10-29 10:00:00', level: 'high', assets: ['gold-intl'], fingerprint: `f${i}`,
    })),
    empty: false,
  });

  it('简报排在行情之后（第 81 轮：不让 23 个标的被挤到两屏外）', () => {
    const html = readFileSync('public/index.html', 'utf8');
    expect(html.indexOf('id="rows"')).toBeLessThan(html.indexOf('id="home-brief"'));
  });

  it('选择面板不会让人选超过三个（第四个 disable）', () => {
    const qs = ['a', 'b', 'c', 'd'].map((k) => ({ key: k, ask: `问题${k}` }));
    const el = document.createElement('div');
    el.innerHTML = watchPickerHTML(qs, ['a', 'b', 'c']).toString();
    const boxes = [...el.querySelectorAll('input[data-watch]')];
    const disabled = boxes.filter((b) => b.disabled).map((b) => b.dataset.watch);
    expect(disabled).toEqual(['d']);
  });

  it('简报条目有上限（最多三条，不铺满首页）', () => {
    const el = document.createElement('div');
    el.innerHTML = homeBriefHTML(brief(9), { total: 0, items: [] });
    const cards = el.querySelectorAll('.wb-card, .wb-item');
    expect(cards.length).toBeLessThanOrEqual(3);
  });
});

describe('选择面板', () => {
  const qs = [
    { key: 'a', question: '问题 A', why: '因为 A' },
    { key: 'b', question: '问题 B', why: '因为 B' },
  ];

  it('已选的打勾，未选的留空', () => {
    const el = document.createElement('div');
    el.innerHTML = watchPickerHTML(qs, ['a']);
    expect(el.querySelector('[data-watch="a"]').checked).toBe(true);
    expect(el.querySelector('[data-watch="b"]').checked).toBe(false);
  });

  it('选满三个时其余的禁用（不让用户点进一个会被拒绝的状态）', () => {
    const el = document.createElement('div');
    el.innerHTML = watchPickerHTML(qs, ['x', 'y', 'z']);
    expect(el.querySelector('[data-watch="b"]').disabled).toBe(true);
  });

  it('说明写清「选多了就退化成全部市场」', () => {
    const el = document.createElement('div');
    el.innerHTML = watchPickerHTML(qs, []);
    expect(el.textContent).toContain('最多选三个');
  });
});

describe('生活场景作为第三块', () => {
  const life = {
    ok: true,
    title: '油价与出行成本',
    plain: '会不会传导到我的加油与出行开销',
    headline: '国际原油价格本窗口上行',
    steps: [{ label: '国际原油价格', basis: 'mechanism', basisText: '机制可解释', note: 'x' }],
    gaps: ['缺本地零售价数据'],
    disclaimer: '只说明机制，不预测',
    needsLocalData: true,
  };

  it('传了生活场景就多渲染一块', () => {
    const el = document.createElement('div');
    el.innerHTML = homeBriefHTML(briefItems, ledgerOk, life);
    expect(el.querySelector('.lp-card')).not.toBeNull();
  });

  it('没传就不渲染（不占位）', () => {
    const el = document.createElement('div');
    el.innerHTML = homeBriefHTML(briefItems, ledgerOk);
    expect(el.querySelector('.lp-card')).toBeNull();
  });

  it('前两块都空但有生活场景时仍然显示（否则这一块永远看不到）', () => {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const shown = renderHomeBrief(host, { reason: 'NO_WATCH' }, { total: 0 }, { lifePath: life });
    expect(shown).toBe(true);
    expect(host.hidden).toBe(false);
    host.remove();
  });

  it('生活场景 ok=false 时不撑开容器', () => {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const shown = renderHomeBrief(host, { reason: 'NO_WATCH' }, { total: 0 }, { lifePath: { ok: false } });
    expect(shown).toBe(false);
    host.remove();
  });
});

/* ================================================================== *
 * 首页问题优先（产品 §3）：最多三个问题，行情在后
 *
 * 这一条之前只是「首页同时有问题卡和行情」。要求是**层级**：
 * 问题在前、最多三个，行情在后。
 * ================================================================== */
describe('问题优先的层级', () => {
  const brief = (n) => ({
    ok: true,
    status: 'ok',
    hasWatch: true,
    items: Array.from({ length: n }, (_, i) => ({
      id: `e${i}`, title: `事件${i}`, time: '2026-10-29 10:00:00', level: 'high', assets: ['gold-intl'], fingerprint: `f${i}`,
    })),
    empty: false,
  });

  it('简报排在行情之后（第 81 轮：不让 23 个标的被挤到两屏外）', () => {
    const html = readFileSync('public/index.html', 'utf8');
    expect(html.indexOf('id="rows"')).toBeLessThan(html.indexOf('id="home-brief"'));
  });

  it('选择面板不会让人选超过三个（第四个 disable）', () => {
    const qs = ['a', 'b', 'c', 'd'].map((k) => ({ key: k, ask: `问题${k}` }));
    const el = document.createElement('div');
    el.innerHTML = watchPickerHTML(qs, ['a', 'b', 'c']).toString();
    const boxes = [...el.querySelectorAll('input[data-watch]')];
    const disabled = boxes.filter((b) => b.disabled).map((b) => b.dataset.watch);
    expect(disabled).toEqual(['d']);
  });

  it('简报条目有上限（最多三条，不铺满首页）', () => {
    const el = document.createElement('div');
    el.innerHTML = homeBriefHTML(brief(9), { total: 0, items: [] });
    const cards = el.querySelectorAll('.wb-card, .wb-item');
    expect(cards.length).toBeLessThanOrEqual(3);
  });
});

const brief_ = (n) => ({
  ok: true, status: 'ok', hasWatch: true, empty: false,
  items: Array.from({ length: n }, (_, i) => ({ id: `e${i}`, title: `事件${i}`, time: '2026-10-29 10:00:00', level: 'high', assets: ['gold-intl'], fingerprint: `f${i}` })),
});

