// @vitest-environment jsdom
/* ================================================================== *
 * Phase 2 / P2-T2：主题变量与列表密度 / 时间基准
 *
 * CSS 变量一旦写死，切配色就是「按钮亮了但图没变」；锚点算错则整列涨跌幅
 * 都是假的。两层都用真实数据与静态样式断言钉住。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

document.body.innerHTML = `
  <div id="updated"></div><div id="countdown"></div><button id="refresh"></button>
  <main id="rows"></main><section id="detail"></section><section id="macro"></section>
  <section id="events"></section><section id="map"></section><button id="briefing-btn"></button>
  <div id="ws-bar"></div>
`;

const list = await import('../src/client/views/list.js');
const { refs, store, PLACEHOLDER } = await import('../src/client/shared/store.js');
const { createWorkspaceStore, getWorkspaceStore } = await import('../src/client/shared/workspace-store.js');
const rowsEl = document.getElementById('rows');

const tokens = readFileSync('public/styles/tokens.css', 'utf8');
const tickerCss = readFileSync('public/styles/ticker-list.css', 'utf8');
const html = readFileSync('public/index.html', 'utf8');

describe('tokens.css：配色与主题变量体系', () => {
  it('intl 绿涨红跌，cb 蓝涨橙跌，都带背景色', () => {
    expect(tokens).toMatch(/:root\[data-color-scheme="intl"\]\s*\{[^}]*--up:\s*#0ecb81/s);
    expect(tokens).toMatch(/:root\[data-color-scheme="intl"\]\s*\{[^}]*--down:\s*#f5455c/s);
    expect(tokens).toMatch(/:root\[data-color-scheme="cb"\]\s*\{[^}]*--up:\s*#3b82f6/s);
    expect(tokens).toMatch(/:root\[data-color-scheme="cb"\]\s*\{[^}]*--down:\s*#f97316/s);
    for (const sel of ['intl', 'cb']) {
      expect(tokens).toMatch(new RegExp(`:root\\[data-color-scheme="${sel}"\\]\\s*\\{[^}]*--up-bg`));
      expect(tokens).toMatch(new RegExp(`:root\\[data-color-scheme="${sel}"\\]\\s*\\{[^}]*--down-bg`));
    }
  });

  it('oled 纯黑防烧屏，light 高对比浅色研报', () => {
    expect(tokens).toMatch(/:root\[data-theme="oled"\]\s*\{[^}]*--bg:\s*#000000/s);
    expect(tokens).toMatch(/:root\[data-theme="oled"\]\s*\{[^}]*--bg-elev:\s*#050505/s);
    expect(tokens).toMatch(/:root\[data-theme="oled"\]\s*\{[^}]*--border:\s*#161616/s);
    expect(tokens).toMatch(/:root\[data-theme="light"\]/);
    expect(tokens).toMatch(/:root\[data-theme="light"\]\s*\{[^}]*--bg:\s*#f[0-9a-f]{5}/s);
  });

  it('workspace.css 被引入且有磁贴墙 / 分组规则', () => {
    expect(html).toContain('styles/workspace.css');
    const css = readFileSync('public/styles/workspace.css', 'utf8');
    expect(css).toContain('[data-ws-density');
    expect(css).toContain('#ws-bar');
    expect(tickerCss).toContain('data-density="wall"');
    expect(tickerCss).toContain('data-density="grouped"');
  });
});

describe('锚点涨跌基准：数值口径', () => {
  const item = (over = {}) => ({
    id: 'sp500', price: 110, prevClose: 100, change: 10, changePct: 10,
    history: [{ t: 1, p: 100 }, { t: 2, p: 105 }, { t: 3, p: 110 }],
    ...over,
  });

  it('default 直接用服务端 changePct', () => {
    expect(list.anchorChangePct(item(), 'default')).toBe(10);
    expect(list.anchorChangePct(item(), null)).toBe(10);
  });

  it('intraday_open 用分时首点做基准（(110-100)/100 = 10%）', () => {
    expect(list.anchorChangePct(item(), 'intraday_open')).toBeCloseTo(10, 6);
    expect(list.anchorChangePct(item({ price: 121 }), 'intraday_open')).toBeCloseTo(21, 6);
  });

  it('ashare_close 也按前收重算，无前收时退回 changePct', () => {
    expect(list.anchorChangePct(item(), 'ashare_close')).toBeCloseTo(10, 6);
    expect(list.anchorChangePct(item({ prevClose: null }), 'ashare_close')).toBe(10);
  });

  it('缺分时 / 零基准 / 坏价格不产生 NaN 或 Infinity', () => {
    expect(list.anchorChangePct(item({ history: [] }), 'intraday_open')).toBe(10);
    expect(list.anchorChangePct(item({ history: [{ t: 1, p: 0 }] }), 'intraday_open')).toBe(10);
    expect(list.anchorChangePct(item({ price: null }), 'intraday_open')).toBe(10);
    expect(list.anchorChangePct({ changePct: null }, 'default')).toBeNull();
  });
});

describe('列表密度与分组', () => {
  beforeEach(() => {
    rowsEl.innerHTML = '';
    refs.clear();
    store.quotes = null;
    getWorkspaceStore().reset();
  });

  afterEach(() => { getWorkspaceStore().reset(); });

  it('renderSkeleton 生成 23 行，并把当前密度写到 rowsEl.dataset', () => {
    getWorkspaceStore().setState({ density: 'wall' });
    list.renderSkeleton();
    expect(rowsEl.querySelectorAll('.row')).toHaveLength(23);
    expect(rowsEl.dataset.density).toBe('wall');
  });

  it('applyDensity 三档都生效，且分组标题只在 grouped 出现', () => {
    list.renderSkeleton();
    list.applyDensity('wall');
    expect(rowsEl.dataset.density).toBe('wall');
    list.applyDensity('flat');
    expect(rowsEl.dataset.density).toBe('flat');
    list.applyDensity('grouped');
    expect(rowsEl.dataset.density).toBe('grouped');
    expect(rowsEl.querySelectorAll('.row-group-head').length).toBeGreaterThan(0);
  });

  it('切换偏好后重绘行内涨跌基准标注', () => {
    list.renderSkeleton();
    const ws = getWorkspaceStore();
    ws.setState({ anchorClock: 'intraday_open' });
    list.apply({ items: [PLACEHOLDER[0], PLACEHOLDER[1]] });
    const row = refs.get('gold-cn').el;
    expect(row.dataset.anchor).toBe('intraday_open');
    ws.reset();
  });

  it('行内渲染交易状态徽章与时段过滤（全部 / 交易中 / 已收盘）', () => {
    list.renderSkeleton();
    const items = [
      { ...PLACEHOLDER[0], marketStatus: { open: true, phase: 'open', continuous: true, label: '24×7' } },
      { ...PLACEHOLDER[1], marketStatus: { open: false, phase: 'closed', label: '已收盘', nextOpenAt: '09:30' } },
      { ...PLACEHOLDER[2], marketStatus: { open: true, phase: 'open', label: '交易中', nextCloseAt: '15:00' } },
    ];
    list.apply({ items });
    const r0 = refs.get(PLACEHOLDER[0].id).el;
    const r1 = refs.get(PLACEHOLDER[1].id).el;
    expect(r0.dataset.open).toBe('1');
    expect(r0.querySelector('.session-pill').textContent).toBe('24×7');
    expect(r1.dataset.open).toBe('0');
    expect(r1.querySelector('.session-pill').textContent).toBe('已收盘');

    expect(list.computeSessionCounts(items)).toEqual({ all: 3, open: 2, closed: 1 });

    list.applySessionFilter('open');
    expect(r0.hidden).toBe(false);
    expect(r1.hidden).toBe(true);

    list.applySessionFilter('closed');
    expect(r0.hidden).toBe(true);
    expect(r1.hidden).toBe(false);

    list.applySessionFilter('all');
    expect(r0.hidden).toBe(false);
    expect(r1.hidden).toBe(false);
  });

  it('grouped 模式下隐藏全闭合分组标题，工具条状态按钮联动筛选', () => {
    getWorkspaceStore().setState({ density: 'grouped' });
    list.renderSkeleton();
    const coreHead = [...rowsEl.querySelectorAll('.row-group-head')][0];
    const items = PLACEHOLDER.map((x, idx) => ({
      ...x,
      marketStatus: idx === 0
        ? { open: true, phase: 'open', label: '交易中' }
        : { open: false, phase: 'closed', label: '已收盘' },
    }));
    list.apply({ items });

    // 通过工作台工具条点击「已收盘」：仅保留 closed 项，第 0 组含 open 项但组内还有其他 closed 项 -> 头仍可见
    const closedBtn = document.querySelector('#ws-bar [data-ws-session="closed"]');
    closedBtn.click();
    expect(store.sessionFilter).toBe('closed');
    expect(refs.get(PLACEHOLDER[0].id).el.hidden).toBe(true);
    expect(coreHead.hidden).toBe(false);

    // 点「交易中」：第 1 组（regional）全员 closed -> 该分组标题应被隐藏
    const openBtn = document.querySelector('#ws-bar [data-ws-session="open"]');
    openBtn.click();
    expect(store.sessionFilter).toBe('open');
    const heads = [...rowsEl.querySelectorAll('.row-group-head')];
    expect(heads[heads.length - 1].hidden).toBe(true);

    document.querySelector('#ws-bar [data-ws-session="all"]').click();
    expect(heads[heads.length - 1].hidden).toBe(false);
  });
});
