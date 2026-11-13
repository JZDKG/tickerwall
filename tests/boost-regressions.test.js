// @vitest-environment jsdom
/* ================================================================== *
 * 回归防线：主题对比度、原生 <dialog> 语义、UI 状态与交互修复
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@antv/x6', () => ({ Graph: class {}, Shape: {} }));

import { mountCommandPalette, CMD_PALETTE_MODAL_ID, CMD_PALETTE_BTN_ID } from '../src/client/views/command-palette.js';
import { mountAlertsPanel, ALERTS_PANEL_ID, ALERT_TOAST_ID, ALERTS_BTN_ID, ALERT_UNREAD_ID, ALERT_TOAST_MS } from '../src/client/views/alerts-panel.js';
import { mountAlertBanner, ALERT_BANNER_ID, ALERT_BANNER_MS } from '../src/client/shared/alert-banner.js';
import { mountShareCard, SHARE_PREVIEW_ID } from '../src/client/shared/share-card-ui.js';
import { openBriefing, closeBriefing, __resetBriefingCache } from '../src/client/views/briefing.js';
import { revisionPanelHTML, bindRevisionChips } from '../src/client/views/events.js';
import { buildRow } from '../src/client/views/list.js';
import { termHTML, attachGlossary } from '../src/client/shared/glossary.js';
import { syncChrome } from '../src/client/views/macro/index.js';
import { MACRO_TRANSMISSION_EDGES } from '../src/client/views/macro/knowledge-base.js';
import { macroLeadLagHTML, macroMatrixHTML } from '../src/client/views/macro.js';
import { crossCheckTable, historyTable } from '../src/client/views/detail.js';
import { openModalDialog } from '../src/client/shared/modal-dialog.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

function fakeBus() {
  const handlers = new Map();
  return {
    on: (ev, fn) => { handlers.set(ev, fn); return () => handlers.delete(ev); },
    off: (ev) => handlers.delete(ev),
    emit: (ev, payload) => handlers.get(ev)?.(payload),
  };
}

describe('样式与主题完整性', () => {
  it('不再引用未定义的 --fg，且浅色主题与模态遮罩声明规范', () => {
    const appCss = read('public/app.css');
    const expCss = read('public/styles/explanations.css');
    const tokensCss = read('public/styles/tokens.css');
    const wsCss = read('public/styles/workspace.css');
    const recapCss = read('public/styles/recap.css');
    const eventsCss = read('public/styles/events.css');
    const indexHtml = read('public/index.html');

    expect(appCss).not.toMatch(/var\(--fg\b/);
    expect(expCss).not.toMatch(/var\(--fg\b/);
    expect(indexHtml).toContain('<meta name="color-scheme" content="light dark" />');
    expect(tokensCss).toContain('color-scheme: light;');
    expect(tokensCss).toContain('color-scheme: dark;');
    expect(tokensCss).not.toContain('html:has(dialog:modal)');
    expect(tokensCss).toContain('dialog:modal');
    expect(tokensCss).toContain('dialog::backdrop');
    expect(tokensCss).toContain('--muted-2: #788597;');
    expect(tokensCss).toContain('--cold:');
    expect(tokensCss).toContain('--surface-elev:');
    expect(tokensCss).toContain('--up: #991b1b;');
    expect(tokensCss).toContain('--down: #065f46;');
    expect(tokensCss).toContain('--cold: #1e40af;');
    expect(tokensCss).toContain('--warn: #78350f;');
    expect(tokensCss).toContain('--down: #7c2d12;');
    expect(tokensCss).toContain(':root[data-theme="light"]:not([data-pip="1"]) body');
    expect(tokensCss).toContain('@media (forced-colors: active)');

    // 浅色主题在表面、浅色底纹（--*-bg）、叠加容器与顶部渐变上的小标签对比度均须 >= 4.5:1（WCAG AA）
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const blend = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
    const lum = ([r, g, b]) => {
      const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a, b) => {
      const l1 = lum(a); const l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const parseRgba = (s) => {
      const m = s.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
      return m ? { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) } : null;
    };
    const blockOf = (sel) => {
      const i = tokensCss.indexOf(`${sel} {`);
      if (i < 0) return '';
      return tokensCss.slice(i + sel.length + 2, tokensCss.indexOf('}', i));
    };
    const lightBase = blockOf(':root[data-theme="light"]');
    const lightIntl = blockOf(':root[data-theme="light"][data-color-scheme="intl"]');
    const lightCb = blockOf(':root[data-theme="light"][data-color-scheme="cb"]');
    const lightBody = blockOf(':root[data-theme="light"]:not([data-pip="1"]) body');
    const varVal = (blk, name) => blk.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    const bg = hexRgb(varVal(lightBase, '--bg'));
    const gradSpec = parseRgba(lightBody);
    const gradBg = gradSpec ? blend(gradSpec.rgb, gradSpec.a, bg) : bg;
    const panel2Spec = parseRgba(varVal(lightBase, '--panel-2'));
    const panel2 = blend(panel2Spec.rgb, panel2Spec.a, bg);
    const gradPanel2 = blend(panel2Spec.rgb, panel2Spec.a, gradBg);
    const pairs = [
      [lightBase, '--up', '--up-bg'],
      [lightBase, '--down', '--down-bg'],
      [lightBase, '--cold', '--cold-bg'],
      [lightBase, '--warn', '--warn-bg'],
      [lightIntl, '--up', '--up-bg'],
      [lightIntl, '--down', '--down-bg'],
      [lightCb, '--up', '--up-bg'],
      [lightCb, '--down', '--down-bg'],
    ];
    for (const [blk, fgVar, bgVar] of pairs) {
      const fg = hexRgb(varVal(blk, fgVar));
      const tint = parseRgba(varVal(blk, bgVar));
      const tintOnBg = blend(tint.rgb, tint.a, bg);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, tintOnBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, blend(tint.rgb, tint.a, panel2))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, blend(tint.rgb, tint.a, gradPanel2))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, blend(tint.rgb, tint.a, tintOnBg))).toBeGreaterThanOrEqual(4.5);
    }
    const tickerCss = read('public/styles/ticker-list.css');
    const matrixCss = read('public/styles/macro-matrix.css');
    const macroGraphCss = read('public/styles/macro-graph.css');
    expect(tickerCss).toContain('background: var(--up-bg);');
    expect(tickerCss).toContain('background: var(--down-bg);');
    expect(tickerCss).toContain('.rows[data-density="wall"] .row[data-dir="up"] .pct');
    expect(matrixCss).toContain('background: var(--up-bg);');
    expect(matrixCss).toContain('background: var(--down-bg);');
    expect(macroGraphCss).toContain('--mg-pos: #991b1b;');
    expect(macroGraphCss).toContain('--mg-div: #78350f;');
    expect(macroGraphCss).toContain(':root[data-theme="light"] .mg-badge.pos');
    expect(eventsCss).toContain(':root[data-theme="light"] .fresh.lv-fresh');
    expect(eventsCss).toContain(':root[data-theme="light"] .fresh.lv-stale');
    expect(read('src/client/styles/macro-flow.css')).toContain(':root[data-theme="light"]');
    expect(read('public/styles/base.css')).toContain('#refresh:hover:not(:disabled)');
    expect(wsCss).toContain('.cp-dialog[open]');
    expect(wsCss).not.toMatch(/\.cp-dialog\s*\{[^}]*display:\s*flex/);
    expect(recapCss).toContain('background: var(--bg-elev');
    expect(eventsCss).toContain('.ev-rev-close');
  });
});

describe('原生 <dialog> 与 light-dismiss', () => {
  it('openModalDialog 支持 pointerdown/pointerup 外部轻触关闭且不因站内拖拽关闭', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const dlg = document.createElement('dialog');
    dlg.getBoundingClientRect = () => ({ left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200 });
    document.body.appendChild(dlg);

    const closeFn = openModalDialog(dlg, { doc: document, opener });
    expect(dlg.hasAttribute('open')).toBe(true);

    // 内部按下拖到外面放开：不应误关
    dlg.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 150, clientY: 150 }));
    dlg.dispatchEvent(new window.MouseEvent('pointerup', { clientX: 10, clientY: 10 }));
    expect(document.body.contains(dlg)).toBe(true);

    // 外部按下 + 外部放开：关闭且返还焦点给 opener
    dlg.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 10, clientY: 10 }));
    dlg.dispatchEvent(new window.MouseEvent('pointerup', { clientX: 12, clientY: 12 }));
    expect(document.body.contains(dlg)).toBe(false);
    expect(document.activeElement).toBe(opener);
    closeFn();
  });

  it('覆盖 showModal 成功/失败降级、原生 close 事件、null 参数与各模态原生关闭回调', () => {
    expect(() => openModalDialog(null)()).not.toThrow();

    // showModal 成功并在 close() 时调用 native dialog.close()
    const dlgOk = document.createElement('dialog');
    dlgOk.open = false;
    dlgOk.showModal = vi.fn(() => { dlgOk.open = true; });
    dlgOk.close = vi.fn(() => { dlgOk.open = false; dlgOk.dispatchEvent(new window.Event('close')); });
    document.body.appendChild(dlgOk);
    const closeOk = openModalDialog(dlgOk, { doc: document });
    expect(dlgOk.showModal).toHaveBeenCalledTimes(1);
    closeOk();
    expect(dlgOk.close).toHaveBeenCalledTimes(1);

    // showModal 抛异常时优雅降级 open 属性，且触发原生 close 事件回调 onClose
    const dlgErr = document.createElement('dialog');
    dlgErr.showModal = vi.fn(() => { throw new Error('not connected'); });
    const onClose = vi.fn();
    openModalDialog(dlgErr, { doc: document, onClose });
    expect(dlgErr.hasAttribute('open')).toBe(true);
    dlgErr.dispatchEvent(new window.Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    // 幂等再触发一次 close 不重复调用
    dlgErr.dispatchEvent(new window.Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    // 分享卡、命令面板、预警面板触发原生 dialog close 事件均可干净卸载
    const offShare = mountShareCard();
    document.body.innerHTML = '<button data-action="share-card">share</button>';
    document.querySelector('[data-action="share-card"]').click();
    document.getElementById(SHARE_PREVIEW_ID).dispatchEvent(new window.Event('close'));
    expect(document.getElementById(SHARE_PREVIEW_ID)).toBeNull();
    offShare();

    document.body.innerHTML = `<button id="${CMD_PALETTE_BTN_ID}">cmd</button><button id="${ALERTS_BTN_ID}">alt</button>`;
    const offCp = mountCommandPalette({ getQuotes: () => [] });
    document.getElementById(CMD_PALETTE_BTN_ID).click();
    document.getElementById(CMD_PALETTE_MODAL_ID).dispatchEvent(new window.Event('close'));
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
    offCp();

    const offAl = mountAlertsPanel({ api: { list: async () => ({ rules: [], recentEvents: [] }), create: async () => ({}), remove: async () => ({}) } });
    document.getElementById(ALERTS_BTN_ID).click();
    document.getElementById(ALERTS_PANEL_ID).dispatchEvent(new window.Event('close'));
    expect(document.getElementById(ALERTS_PANEL_ID)).toBeNull();
    offAl();
  });
});

describe('命令面板：增量高亮与原生 <dialog>', () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="${CMD_PALETTE_BTN_ID}">⌘K</button>`;
  });

  it('ArrowDown / ArrowUp 不重建列表 DOM，且更新 aria-activedescendant', () => {
    const off = mountCommandPalette({ getQuotes: () => [] });
    document.getElementById(CMD_PALETTE_BTN_ID).click();
    const dlg = document.getElementById(CMD_PALETTE_MODAL_ID);
    expect(dlg.tagName).toBe('DIALOG');
    expect(dlg.getAttribute('closedby')).toBe('any');

    const firstBefore = dlg.querySelector('[data-cmd-index="0"]');
    const secondBefore = dlg.querySelector('[data-cmd-index="1"]');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(dlg.querySelector('[data-cmd-index="0"]')).toBe(firstBefore);
    expect(dlg.querySelector('[data-cmd-index="1"]')).toBe(secondBefore);
    expect(secondBefore.classList.contains('is-active')).toBe(true);
    expect(document.getElementById('cmd-palette-input').getAttribute('aria-activedescendant')).toBe('cp-opt-1');
    off();
  });
});

describe('预警中心：错误态保留现场 / 口径切换 / 启停 / 单横幅', () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="${ALERTS_BTN_ID}"><span id="${ALERT_UNREAD_ID}" hidden></span></button>`;
  });

  it('保存失败保留已加载规则与表单草稿，且支持停用/启用与 abs_pct 口径', async () => {
    const rules = [{ id: 'r1', name: 'BTC 剧震', kind: 'change_pct', mode: 'abs_pct', target_id: 'btc', operator: '>', threshold: 3, enabled: 1 }];
    const api = {
      list: vi.fn(async () => ({ ok: true, rules, recentEvents: [{ id: 1, title: '命中', message: '3.2%', triggered_at: 1730000000000 }] })),
      create: vi.fn(async (body) => {
        if (body.target_id === 'bad-id') throw new Error('boom');
        return { ok: true, rule: body };
      }),
      remove: vi.fn(async () => ({ ok: true })),
    };
    const off = mountAlertsPanel({ bus: fakeBus(), api, setTimeout: () => 0 });
    document.getElementById(ALERTS_BTN_ID).click();
    await Promise.resolve();
    await Promise.resolve();

    const dlg = document.getElementById(ALERTS_PANEL_ID);
    expect(dlg.tagName).toBe('DIALOG');
    expect(dlg.textContent).toContain('绝对幅度');

    // 先填一段表单再触发校验失败与服务端失败
    const form = dlg.querySelector('[data-alert-form]');
    form.querySelector('[name="kind"]').value = 'change_pct';
    form.querySelector('[name="mode"]').value = 'abs_pct';
    form.querySelector('[name="target_id"]').value = 'bad-id';
    form.querySelector('[name="threshold"]').value = '4';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(dlg.querySelector('.al-error').textContent).toContain('boom');
    // 列表与表单草稿没有被清空
    expect(dlg.querySelector('[data-alert-rule="r1"]')).not.toBeNull();
    expect(dlg.querySelector('.al-event')).not.toBeNull();
    expect(dlg.querySelector('[name="target_id"]').value).toBe('bad-id');
    expect(dlg.querySelector('[name="mode"]').value).toBe('abs_pct');

    // 停用规则发送 { id: 'r1', enabled: 0 }，失败时保留并报可读错误
    dlg.querySelector('[data-toggle-alert="r1"]').click();
    await Promise.resolve();
    expect(api.create).toHaveBeenCalledWith({ id: 'r1', enabled: 0 });

    // 删除与切换失败也显示可读错误，不把列表清掉
    api.remove.mockRejectedValueOnce(new Error('del err'));
    dlg.querySelector('[data-delete-alert="r1"]').click();
    await Promise.resolve();
    expect(dlg.querySelector('.al-error').textContent).toContain('del err');

    api.create.mockRejectedValueOnce(new Error('tog err'));
    dlg.querySelector('[data-toggle-alert="r1"]').click();
    await Promise.resolve();
    expect(dlg.querySelector('.al-error').textContent).toContain('tog err');
    off();
  });

  it('toast 默认启用时连续告警取消旧计时并在焦点在内时延后消失', () => {
    const bus = fakeBus();
    let seq = 1;
    const cbs = new Map();
    const cleared = [];
    const off = mountAlertsPanel({
      bus,
      api: { list: async () => ({ rules: [], recentEvents: [] }), create: async () => ({}), remove: async () => ({}) },
      setTimeout: (fn, ms) => { const id = seq++; cbs.set(id, { fn, ms }); return id; },
      clearTimeout: (id) => { cleared.push(id); cbs.delete(id); },
    });
    bus.emit('alert', { title: 'A', message: '1' });
    bus.emit('alert', { title: 'B', message: '2' });
    expect(cleared).toContain(1);
    const btn = document.querySelector('[data-alert-toast-dismiss]');
    btn.focus();
    cbs.get(2).fn();
    expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(false);
    btn.blur();
    cbs.get(3).fn();
    expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(true);
    off();
  });

  it('toast: false 只更新未读徽章，不弹出重复横幅', () => {
    const bus = fakeBus();
    const off = mountAlertsPanel({ bus, toast: false, api: { list: async () => ({ rules: [], recentEvents: [] }), create: async () => ({}), remove: async () => ({}) } });
    bus.emit('alert', { ruleId: 'r1', title: '金价异动', message: '2800' });
    expect(document.getElementById(ALERT_TOAST_ID)).toBeNull();
    expect(document.getElementById(ALERT_UNREAD_ID).textContent).toBe('1');
    off();
  });
});

describe('alert-banner：连续告警取消旧定时器，焦点在内时延后消失', () => {
  it('连续两条告警取消前一条的定时关闭；聚焦关闭按钮时不立即收起并在失焦后重启', () => {
    const bus = fakeBus();
    let nextId = 1;
    const callbacks = new Map();
    const cleared = [];
    const setTimeoutStub = (fn, ms) => {
      const id = nextId++;
      callbacks.set(id, { fn, ms });
      return id;
    };
    const clearTimeoutStub = (id) => {
      cleared.push(id);
      callbacks.delete(id);
    };

    const off = mountAlertBanner({ bus, document, setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub });
    bus.emit('alert', { title: 'A', message: '1' });
    bus.emit('alert', { title: 'B', message: '2' });
    expect(cleared).toContain(1);
    expect(callbacks.has(1)).toBe(false);
    expect(callbacks.get(2).ms).toBe(ALERT_BANNER_MS);

    // 焦点在横幅按钮上时，定时器触发不关闭；focusout 后重新排期并在到期后收起
    const host = document.getElementById(ALERT_BANNER_ID);
    const btn = document.querySelector('[data-action="dismiss-alert"]');
    btn.focus();
    callbacks.get(2).fn();
    expect(host.hidden).toBe(false);
    expect(callbacks.size).toBe(1);
    btn.blur();
    host.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    expect(callbacks.size).toBe(2);
    expect(callbacks.get(3).ms).toBe(ALERT_BANNER_MS);
    callbacks.get(3).fn();
    expect(host.hidden).toBe(true);
    off();
  });
});

describe('briefing：错误态可点关闭 & 点击面板外关闭', () => {
  afterEach(() => {
    closeBriefing();
    __resetBriefingCache();
    vi.unstubAllGlobals();
  });

  it('拉取失败时也带 .briefing-close 且支持点外部关闭', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await openBriefing({ force: true });
    const closeBtn = document.querySelector('#briefing-panel .briefing-close');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(document.getElementById('briefing-panel')).toBeNull();

    await openBriefing({ force: true });
    expect(document.getElementById('briefing-panel')).not.toBeNull();
    document.body.click();
    expect(document.getElementById('briefing-panel')).toBeNull();
  });
});

describe('events 版本面板关闭钮 & 异常容错', () => {
  it('revisionPanelHTML 自带 .ev-rev-close，bindRevisionChips 请求异常时仍渲染带关闭钮的空态面板', async () => {
    const html = revisionPanelHTML('e1', [{ revision: 1, title: '测试', ts: 1730000000000 }]).toString();
    expect(html).toContain('class="ev-rev-close"');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fail'); }));
    document.body.innerHTML = `<article class="event"><button data-event-revisions="e1" aria-expanded="false">2版</button></article>`;
    bindRevisionChips(document);
    const btn = document.querySelector('[data-event-revisions="e1"]');
    btn.click();
    await new Promise((r) => setTimeout(r, 0));

    const panel = document.querySelector('.ev-rev-panel');
    expect(panel).not.toBeNull();
    const close = panel.querySelector('.ev-rev-close');
    expect(close).not.toBeNull();
    close.click();
    expect(document.querySelector('.ev-rev-panel')).toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    vi.unstubAllGlobals();
  });
});

describe('list 行内星标键盘事件不误导航', () => {
  it('焦点在 [data-pin] 上按 Enter/Space 不跳转详情，在卡片本体按 Enter 跳转', () => {
    location.hash = '';
    const el = buildRow({ id: 'gold-intl', name: '国际金', sub: 'COMEX', category: 'commodity', decimals: 2, group: 'gold', unit: '' });
    document.body.appendChild(el);
    const pin = el.querySelector('[data-pin]');
    pin.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(location.hash).toBe('');
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(location.hash).toBe('#/d/gold-intl');
  });
});

describe('glossary：同名术语多处出现时不发生 ID 碰撞且支持点击切换', () => {
  it('同一父节点下渲染两次同名术语时自动去重 id 与 aria-describedby，并支持点击展开/关闭与空白处收起', () => {
    const off = attachGlossary(document);
    document.body.innerHTML = `<div class="wrap">${termHTML('实际收益率')}${termHTML('实际收益率')}<span id="outside">外</span></div>`;
    const btns = [...document.querySelectorAll('.gl-term')];
    const tips = [...document.querySelectorAll('.gl-tip')];
    btns[1].dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    expect(tips[0].hidden).toBe(true);
    expect(tips[1].hidden).toBe(false);
    expect(tips[0].id).not.toBe(tips[1].id);
    expect(btns[1].getAttribute('aria-describedby')).toBe(tips[1].id);
    btns[1].dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
    expect(tips[1].hidden).toBe(true);

    // 触屏/点击切换与外部点击全收起
    btns[0].click();
    expect(tips[0].hidden).toBe(false);
    btns[0].click();
    expect(tips[0].hidden).toBe(true);
    btns[0].click();
    expect(tips[0].hidden).toBe(false);
    document.getElementById('outside').click();
    expect(tips[0].hidden).toBe(true);
    off();
  });
});

describe('macro syncChrome 与表格无障碍属性', () => {
  it('缺少 .graph-stage 时 syncChrome 优雅退化且不抛 TypeError', () => {
    const section = document.createElement('section');
    section.innerHTML = '<div class="mg-head"></div><div class="mg-tools"></div>';
    const edge = MACRO_TRANSMISSION_EDGES[0];
    const reality = new Map([[edge.id, { status: 'diverged', badge: '⚡ 与机制相反', roll20: 0.72, severity: 3 }]]);
    expect(() => syncChrome(
      section,
      { universe: [{ id: edge.from, short: edge.from, name: edge.from, group: 'rates' }, { id: edge.to, short: edge.to, name: edge.to, group: 'gold' }] },
      { graphMode: 'compass' },
      reality,
    )).not.toThrow();
    expect(section.querySelector('.mg-alert')).not.toBeNull();
  });

  it('数据表格具备 scope="col"/"row" 与可聚焦滚动区域', () => {
    const ll = String(macroLeadLagHTML({
      freq: 'day',
      universe: [{ id: 'a', short: 'A' }, { id: 'b', short: 'B' }],
      leadLag: [{ leader: 'a', follower: 'b', lag: 1, corr: 0.5, significantBH: true, sameDay: 0.2, q: 0.01, n: 100 }],
    }));
    expect(ll).toContain('tabindex="0" role="region"');
    expect(ll).toContain('<th scope="col">领先方</th>');

    const cm = String(macroMatrixHTML({
      universe: [{ id: 'a', short: 'A', name: 'A' }, { id: 'b', short: 'B', name: 'B' }],
      matrix: {
        ids: ['a', 'b'],
        corr: [[1, 0.5], [0.5, 1]],
        counts: [[10, 10], [10, 10]],
        stats: [],
      },
    }));
    expect(cm).toContain('<th scope="col" class="corner">');
    expect(cm).toContain('<th scope="row" class="row-head"');

    const src = String(crossCheckTable([{ source: 'okx', price: 100 }, { source: 'binance', price: 101 }], 2));
    expect(src).toContain('tabindex="0" role="region" aria-label="多源对照"');
    expect(src).toContain('<th scope="col">数据源</th>');

    const hist = String(historyTable([[ '2026-01-01', 1, 2, 3, 0.5, 100, 0, 1.5 ]], 2, 10));
    expect(hist).toContain('tabindex="0" role="region" aria-label="历史日线"');
    expect(hist).toContain('<th scope="col">日期</th>');
  });
});

describe('交互、焦点恢复、模态联动与无障碍回归防线', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('openModalDialog 先关闭模态顶层再返还焦点给 opener，且原生 showModal 下不绑多余 document Escape', () => {
    const order = [];
    let dlg = null;
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    const origFocus = opener.focus.bind(opener);
    opener.focus = (...args) => {
      order.push(`focus:open=${dlg?.open}`);
      return origFocus(...args);
    };
    opener.focus();
    order.length = 0;

    dlg = document.createElement('dialog');
    dlg.open = false;
    dlg.showModal = vi.fn(() => {
      dlg.open = true;
      dlg.setAttribute('open', '');
    });
    dlg.close = vi.fn(() => {
      order.push('close');
      dlg.open = false;
      dlg.removeAttribute('open');
      dlg.dispatchEvent(new window.Event('close'));
    });
    const inner = document.createElement('input');
    dlg.appendChild(inner);
    document.body.appendChild(dlg);

    const onClose = vi.fn();
    const closeFn = openModalDialog(dlg, { doc: document, opener, onClose });
    expect(dlg.showModal).toHaveBeenCalledTimes(1);
    inner.focus();
    expect(document.activeElement).toBe(inner);

    // 原生 showModal 成功后，document keydown Escape 不应越俎代庖
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    closeFn();
    expect(order).toEqual(['close', 'focus:open=false']);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it('command-palette 正确关联 aria-controls 与 listbox、option 设 tabindex=-1，且关闭按钮 Enter 不触发导航', async () => {
    const onNavigate = vi.fn();
    const btn = document.createElement('button');
    btn.id = CMD_PALETTE_BTN_ID;
    document.body.appendChild(btn);

    const off = mountCommandPalette({
      assets: [{ id: 'gold-intl', name: '国际金价', symbol: 'XAU', group: 'commodities' }],
      events: [],
      onNavigate,
    });

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    const dialog = document.getElementById(CMD_PALETTE_MODAL_ID);
    expect(dialog).not.toBeNull();
    const input = dialog.querySelector('[role="combobox"]');
    const listbox = dialog.querySelector('[role="listbox"]');
    expect(listbox.id).toBe('cmd-palette-listbox');
    expect(input.getAttribute('aria-controls')).toBe('cmd-palette-listbox');
    const firstOpt = listbox.querySelector('.cp-item');
    expect(firstOpt?.getAttribute('tabindex')).toBe('-1');
    expect(input.getAttribute('aria-expanded')).toBe('true');

    // 空结果时不应保留悬空的 aria-controls 或声称 aria-expanded="true"
    input.value = '不存在的命令xyz';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(dialog.querySelector('#cmd-palette-listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-controls')).toBe(false);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);

    // 清空恢复匹配结果时重新挂载 listbox 与 ARIA 引用
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(dialog.querySelector('#cmd-palette-listbox')).not.toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe('cmd-palette-listbox');
    expect(input.getAttribute('aria-activedescendant')).toBe('cp-opt-0');

    const closeBtn = dialog.querySelector('.cp-close');
    closeBtn.focus();
    closeBtn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onNavigate).not.toHaveBeenCalled();
    off();
  });

  it('alerts-panel 按 kind 显隐 mode 与禁用 divergence 字段，并在异步 load 后保持表单焦点', async () => {
    const btn = document.createElement('button');
    btn.id = ALERTS_BTN_ID;
    document.body.appendChild(btn);

    let resolveList;
    const fetchMock = vi.fn(() => new Promise((r) => {
      resolveList = () => r(new Response(JSON.stringify({ ok: true, rules: [], events: [], unreadCount: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const off = mountAlertsPanel({ bus: fakeBus(), toast: false });
    btn.click();

    const panel = document.getElementById(ALERTS_PANEL_ID);
    expect(panel).not.toBeNull();
    // 正在 load 期间用户已把焦点放在名称输入框，load 返回重建表单后应保持聚焦
    panel.querySelector('[name="name"]').focus();
    expect(document.activeElement?.getAttribute('name')).toBe('name');
    resolveList();
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement?.getAttribute('name')).toBe('name');

    const kindEl = panel.querySelector('[name="kind"]');
    const modeWrap = panel.querySelector('[data-al-field="mode"]');
    const targetEl = panel.querySelector('[name="target_id"]');
    const opEl = panel.querySelector('[name="operator"]');
    const threshEl = panel.querySelector('[name="threshold"]');

    // 默认 price 时 mode 隐藏；切到 change_pct 显示；切到 divergence 禁用阈值三件套
    expect(modeWrap.hidden).toBe(true);
    kindEl.value = 'change_pct';
    kindEl.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(modeWrap.hidden).toBe(false);

    kindEl.value = 'divergence';
    kindEl.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(targetEl.disabled).toBe(true);
    expect(opEl.disabled).toBe(true);
    expect(threshEl.disabled).toBe(true);
    off();
  });

  it('alert-banner 在模态 dialog 打开期间延后展示，关闭模态后补发且站内 focusout 不误计时关闭', () => {
    vi.useFakeTimers();
    const bus = fakeBus();
    const off = mountAlertBanner({ bus });

    const modal = document.createElement('dialog');
    modal.setAttribute('open', '');
    modal.open = true;
    document.body.appendChild(modal);

    bus.emit('alert', { title: '延迟提醒', message: '模态关闭后再展示' });
    const banner = document.getElementById(ALERT_BANNER_ID);
    expect(banner.hidden).toBe(true);

    modal.open = false;
    modal.removeAttribute('open');
    modal.dispatchEvent(new window.Event('close'));
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('延迟提醒');

    // 焦点从 banner 移至内部 close 按钮不应提前收起横幅
    const closeBtn = banner.querySelector('[data-action="dismiss-alert"]');
    closeBtn.focus();
    banner.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: closeBtn }));
    vi.advanceTimersByTime(ALERT_BANNER_MS + 100);
    expect(banner.hidden).toBe(false);
    off();
  });

  it('briefing 打开时把焦点移入面板并同步 aria-expanded，关闭后归还给按钮', async () => {
    __resetBriefingCache();
    const btn = document.createElement('button');
    btn.id = 'briefing-btn';
    btn.setAttribute('aria-expanded', 'false');
    document.body.appendChild(btn);
    btn.focus();

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      status: 'overnight',
      cutLabel: '15:00',
      baselineAt: '2026-11-12T07:00:00.000Z',
      latestAt: '2026-11-13T01:00:00.000Z',
      items: [{ id: 'gold-intl', name: '国际金价', to: 4123.4, movePct: 1.25 }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await openBriefing();
    const panel = document.getElementById('briefing-panel');
    expect(panel).not.toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(panel);

    closeBriefing();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(btn);
  });

  it('glossary 在挂载时即主动为同名术语去重 id，无需等待 hover', () => {
    document.body.innerHTML = `<div class="wrap">${termHTML('实际收益率')}${termHTML('实际收益率')}</div>`;
    const off = attachGlossary(document);
    const tips = [...document.querySelectorAll('.gl-tip')];
    const btns = [...document.querySelectorAll('.gl-term')];
    expect(tips).toHaveLength(2);
    expect(tips[0].id).not.toBe(tips[1].id);
    expect(btns[0].getAttribute('aria-describedby')).toBe(tips[0].id);
    expect(btns[1].getAttribute('aria-describedby')).toBe(tips[1].id);
    off();
  });

  it('openModalDialog 与 alert-banner 边界分支覆盖（零尺寸矩形、已移除 opener、重复 close、多弹窗排队）', () => {
    vi.useFakeTimers();

    // 1. 不传 doc/opener 且 fallbackOpener 后来被移除；0x0 矩形不误触发 light-dismiss；重复 close 幂等
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    const d1 = document.createElement('dialog');
    d1.open = true; // 模拟预先 open：跳过 showModal()
    d1.showModal = vi.fn();
    d1.close = vi.fn(() => { d1.open = false; });
    d1.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
    document.body.appendChild(d1);
    const onClose1 = vi.fn();
    const close1 = openModalDialog(d1, { onClose: onClose1 });
    expect(d1.showModal).not.toHaveBeenCalled();
    d1.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 50, clientY: 50 }));
    d1.dispatchEvent(new window.MouseEvent('pointerup', { clientX: 50, clientY: 50 }));
    expect(document.body.contains(d1)).toBe(true);
    btn.remove(); // opener 已脱文档
    close1();
    close1(); // 二次调用幂等
    expect(onClose1).toHaveBeenCalledTimes(1);

    // 2. alert-banner：无 pendingHit 时 dialog close 安全忽略；双 dialog 仅第二个关闭后展示；失焦外移后收起
    const bus = fakeBus();
    const off = mountAlertBanner({ bus });
    const m1 = document.createElement('dialog');
    const m2 = document.createElement('dialog');
    m1.open = true; m1.setAttribute('open', '');
    m2.open = true; m2.setAttribute('open', '');
    document.body.append(m1, m2);

    // 无 pendingHit 触发 close
    m1.dispatchEvent(new window.Event('close'));
    const banner = document.getElementById(ALERT_BANNER_ID);
    expect(banner.hidden).toBe(true);

    // 排队告警：关闭 m1 时 m2 仍开 -> 继续延后；关闭 m2 -> 展示
    bus.emit('alert', { title: '双弹窗排队', message: '第二个关了才弹' });
    m1.open = false; m1.removeAttribute('open');
    m1.dispatchEvent(new window.Event('close'));
    expect(banner.hidden).toBe(true);
    m2.open = false; m2.removeAttribute('open');
    m2.dispatchEvent(new window.Event('close'));
    expect(banner.hidden).toBe(false);

    // 焦点停在内部导致首次到期不关 -> 离开 banner 触发 focusout 重启计时并在再次到期时隐藏
    const closeBtn = banner.querySelector('[data-action="dismiss-alert"]');
    closeBtn.focus();
    vi.advanceTimersByTime(ALERT_BANNER_MS + 10);
    expect(banner.hidden).toBe(false);
    const outBtn = document.createElement('button');
    document.body.appendChild(outBtn);
    outBtn.focus();
    banner.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: outBtn }));
    // timer 已激活时重复 focusout 不重复覆盖
    banner.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: outBtn }));
    vi.advanceTimersByTime(ALERT_BANNER_MS + 10);
    expect(banner.hidden).toBe(true);
    // hidden 态下 focusout 直接忽略
    banner.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: outBtn }));
    off();
  });

  it('真实浏览器异步 close、无原生事件降级关闭及跨弹窗关闭时均能立刻清除 DOM 并补发延迟告警', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="${CMD_PALETTE_BTN_ID}">cmd</button>
      <button id="${ALERTS_BTN_ID}"><span id="${ALERT_UNREAD_ID}" hidden></span></button>
      <button data-action="share-card">share</button>
    `;

    const listeners = new Map();
    const bus = {
      on: (ev, fn) => {
        if (!listeners.has(ev)) listeners.set(ev, new Set());
        listeners.get(ev).add(fn);
        return () => listeners.get(ev)?.delete(fn);
      },
      off: (ev, fn) => listeners.get(ev)?.delete(fn),
      emit: (ev, payload) => {
        for (const fn of listeners.get(ev) || []) fn(payload);
      },
    };
    const offBanner = mountAlertBanner({ bus });
    const offCp = mountCommandPalette({ getQuotes: () => [], onNavigate: vi.fn() });
    const offAl = mountAlertsPanel({
      bus,
      toast: true,
      api: { list: async () => ({ rules: [], recentEvents: [] }), create: async () => ({}), remove: async () => ({}) },
    });
    const offShare = mountShareCard();

    // 模拟真实浏览器 HTMLDialogElement：close() 同步清除 open，异步排队派发 'close'（此时已 remove() 离文档）
    const origShowModal = window.HTMLDialogElement.prototype.showModal;
    const origClose = window.HTMLDialogElement.prototype.close;
    window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.removeAttribute('open');
      setTimeout(() => {
        this.dispatchEvent(new window.Event('close'));
      }, 0);
    };

    try {
      const banner = document.getElementById(ALERT_BANNER_ID);

      // 1) 命令面板点 .cp-close 程序化关闭
      document.getElementById(CMD_PALETTE_BTN_ID).click();
      bus.emit('alert', { title: '命令面板延迟1', message: '点关闭钮' });
      expect(banner.hidden).toBe(true);
      expect(document.getElementById(ALERT_TOAST_ID)).toBeNull();
      document.querySelector(`#${CMD_PALETTE_MODAL_ID} .cp-close`).click();
      expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('命令面板延迟1');
      expect(document.getElementById(ALERT_TOAST_ID)?.hidden).toBe(false);
      expect(document.getElementById(ALERT_TOAST_ID)?.textContent).toContain('命令面板延迟1');
      vi.advanceTimersByTime(0); // 队列里的异步 close 在离文档节点上触发不应报错

      // 2) 命令面板选中条目关闭
      banner.querySelector('[data-action="dismiss-alert"]').click();
      document.querySelector('[data-alert-toast-dismiss]').click();
      document.getElementById(CMD_PALETTE_BTN_ID).click();
      bus.emit('alert', { title: '命令面板延迟2', message: '选中条目' });
      expect(banner.hidden).toBe(true);
      expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(true);
      document.querySelector(`#${CMD_PALETTE_MODAL_ID} [data-cmd-index="0"]`).click();
      expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('命令面板延迟2');
      expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(false);
      expect(document.getElementById(ALERT_TOAST_ID).textContent).toContain('命令面板延迟2');

      // 3) 分享卡点 [data-share-dismiss] 关闭（跨弹窗触发 alert-banner 与 alerts-panel pendingToast）
      banner.querySelector('[data-action="dismiss-alert"]').click();
      document.querySelector('[data-alert-toast-dismiss]').click();
      document.querySelector('[data-action="share-card"]').click();
      bus.emit('alert', { title: '分享卡延迟', message: 'cross-modal' });
      expect(banner.hidden).toBe(true);
      expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(true);
      document.querySelector(`#${SHARE_PREVIEW_ID} [data-share-dismiss]`).click();
      expect(document.getElementById(SHARE_PREVIEW_ID)).toBeNull();
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('分享卡延迟');
      expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(false);
      expect(document.getElementById(ALERT_TOAST_ID).textContent).toContain('分享卡延迟');

      // 4) 预警面板点 [data-alerts-dismiss] 关闭
      banner.querySelector('[data-action="dismiss-alert"]').click();
      document.querySelector('[data-alert-toast-dismiss]').click();
      document.getElementById(ALERTS_BTN_ID).click();
      bus.emit('alert', { title: '预警面板延迟', message: 'dismiss' });
      expect(banner.hidden).toBe(true);
      expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(true);
      document.querySelector(`#${ALERTS_PANEL_ID} [data-alerts-dismiss]`).click();
      expect(document.getElementById(ALERTS_PANEL_ID)).toBeNull();
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('预警面板延迟');
      expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(false);
      expect(document.getElementById(ALERT_TOAST_ID).textContent).toContain('预警面板延迟');

      // 5) 多弹窗堆叠：关闭内层后外层仍开时继续延后，外层关闭后再展示
      banner.querySelector('[data-action="dismiss-alert"]').click();
      document.querySelector('[data-alert-toast-dismiss]').click();
      document.getElementById(ALERTS_BTN_ID).click();
      document.querySelector('[data-action="share-card"]').click();
      bus.emit('alert', { title: '双层延迟', message: '外层还在' });
      document.querySelector(`#${SHARE_PREVIEW_ID} [data-share-dismiss]`).click();
      expect(banner.hidden).toBe(true);
      expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(true);
      document.querySelector(`#${ALERTS_PANEL_ID} [data-alerts-dismiss]`).click();
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('双层延迟');
      expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(false);
      expect(document.getElementById(ALERT_TOAST_ID).textContent).toContain('双层延迟');
      vi.advanceTimersByTime(0);
    } finally {
      window.HTMLDialogElement.prototype.showModal = origShowModal;
      window.HTMLDialogElement.prototype.close = origClose;
    }

    // 6) 非 showModal / 无 native close 事件的降级路径（Esc 与外部点击）+ 无 defaultView 的最小 doc
    const banner = document.getElementById(ALERT_BANNER_ID);
    banner.querySelector('[data-action="dismiss-alert"]').click();
    document.querySelector('[data-alert-toast-dismiss]').click();
    document.getElementById(CMD_PALETTE_BTN_ID).click();
    bus.emit('alert', { title: '降级Esc延迟', message: 'no native close' });
    expect(banner.hidden).toBe(true);
    expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(true);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('降级Esc延迟');
    expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(false);
    expect(document.getElementById(ALERT_TOAST_ID).textContent).toContain('降级Esc延迟');

    // 无 defaultView 的自定义 doc 桩
    const dispatched = [];
    const customDoc = {
      activeElement: null,
      body: { contains: () => false },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: (ev) => dispatched.push(ev.type),
    };
    const stubDlg = {
      open: false,
      attributes: new Set(),
      setAttribute(k) { this.attributes.add(k); this.open = true; },
      removeAttribute(k) { this.attributes.delete(k); this.open = false; },
      addEventListener: () => {},
      removeEventListener: () => {},
      remove: () => {},
    };
    const closeStub = openModalDialog(stubDlg, { doc: customDoc });
    closeStub();
    expect(dispatched).toEqual(['tw:modal-close']);

    offShare();
    offAl();
    offCp();
    offBanner();
  });

  it('command-palette 在输入法合成期间（isComposing / keyCode 229）不误执行或关闭', () => {
    const onNavigate = vi.fn();
    const btn = document.createElement('button');
    btn.id = CMD_PALETTE_BTN_ID;
    document.body.appendChild(btn);

    const off = mountCommandPalette({
      assets: [{ id: 'gold-intl', name: '国际金价', symbol: 'XAU', group: 'commodities' }],
      events: [],
      onNavigate,
    });

    btn.click();
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).not.toBeNull();

    // 合成期内按下 Enter / 方向键不得触发导航或关闭面板
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).not.toBeNull();

    const imeKeyCode229 = new window.KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true });
    document.dispatchEvent(imeKeyCode229);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).not.toBeNull();

    // 非合成期 Enter 才执行选中项并收起面板
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', isComposing: false, bubbles: true }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();

    off();
  });

  it('alerts-panel 表单显式绑定 label[for]/id、去掉冗余副标题，并用 inputmode="decimal" 替代 number', async () => {
    const btn = document.createElement('button');
    btn.id = ALERTS_BTN_ID;
    document.body.appendChild(btn);

    const off = mountAlertsPanel({
      bus: fakeBus(),
      toast: false,
      api: {
        list: async () => ({ rules: [], events: [], unreadCount: 0 }),
        create: async () => ({}),
        toggle: async () => ({}),
        remove: async () => ({}),
        markRead: async () => ({}),
      },
    });
    btn.click();
    await Promise.resolve();

    const dlg = document.getElementById(ALERTS_PANEL_ID);
    expect(dlg.querySelector('.al-sub')).toBeNull();
    expect(dlg.querySelector('h2#alerts-panel-title')).not.toBeNull();

    const form = dlg.querySelector('[data-alert-form="1"]');
    const controls = [...form.querySelectorAll('input, select')];
    expect(controls.length).toBe(6);
    for (const ctrl of controls) {
      expect(ctrl.id).toBeTruthy();
      const lbl = form.querySelector(`label[for="${ctrl.id}"]`);
      expect(lbl).not.toBeNull();
      // label 在控件之前，且不再把控件嵌套在 label 内
      expect(lbl.contains(ctrl)).toBe(false);
    }

    const thresholdInput = form.querySelector('[name="threshold"]');
    expect(thresholdInput.getAttribute('type')).toBe('text');
    expect(thresholdInput.getAttribute('inputmode')).toBe('decimal');

    const modeField = form.querySelector('[data-al-field="mode"]');
    expect(modeField.hidden).toBe(true);

    // 校验样式层显式保住 .al-field[hidden] 与最小点击热区
    const wsCss = readFileSync(resolve('public/styles/workspace.css'), 'utf8');
    expect(wsCss).toContain('.al-form .al-field[hidden] { display: none; }');
    expect(wsCss).toContain('min-width: 24px;\n  min-height: 24px;');
    expect(wsCss).toContain('color: var(--warn, #e0a83c);');

    off();
  });

  it('原生 <dialog> 仅派发 toggle(newState=closed) 或 cancel 而吞掉 close 事件时仍能清理并触发 tw:modal-close', () => {
    vi.useFakeTimers();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const closedEvents = [];
    const onModalClose = (e) => closedEvents.push(e.detail?.dialog?.id);
    document.addEventListener('tw:modal-close', onModalClose);

    // 1) toggle(newState=closed) 兜底（模拟 Chromium 跳过 close 事件时）
    const d1 = document.createElement('dialog');
    d1.id = 'dlg-toggle-fallback';
    d1.showModal = () => { d1.open = true; d1.setAttribute('open', ''); };
    d1.close = () => { d1.open = false; d1.removeAttribute('open'); };
    document.body.appendChild(d1);
    const onClose1 = vi.fn(() => d1.remove());
    openModalDialog(d1, { doc: document, opener, onClose: onClose1 });
    d1.open = false;
    const toggleEv = new window.Event('toggle');
    toggleEv.newState = 'closed';
    d1.dispatchEvent(toggleEv);
    expect(onClose1).toHaveBeenCalledTimes(1);
    expect(document.getElementById('dlg-toggle-fallback')).toBeNull();
    expect(closedEvents).toContain('dlg-toggle-fallback');

    // 2) cancel 事件后宏任务兜底（既无 close 也无 toggle 时）
    const d2 = document.createElement('dialog');
    d2.id = 'dlg-cancel-fallback';
    d2.showModal = () => { d2.open = true; d2.setAttribute('open', ''); };
    d2.close = () => { d2.open = false; d2.removeAttribute('open'); };
    document.body.appendChild(d2);
    const onClose2 = vi.fn(() => d2.remove());
    openModalDialog(d2, { doc: document, opener, onClose: onClose2 });
    d2.open = false;
    d2.dispatchEvent(new window.Event('cancel', { cancelable: true }));
    expect(onClose2).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(document.getElementById('dlg-cancel-fallback')).toBeNull();
    expect(closedEvents).toContain('dlg-cancel-fallback');

    document.removeEventListener('tw:modal-close', onModalClose);
  });
});
