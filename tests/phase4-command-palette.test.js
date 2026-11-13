// @vitest-environment jsdom
/* ================================================================== *
 * Phase 4 / P4-T1：全局命令面板（Cmd/Ctrl+K）
 *
 * 验收：filterCommandItems 对标的 / 视图 / 工作台动作检索准确；
 *      挂载、快捷键、Esc、上下键、回车执行、动作 patch 全部可验证。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  filterCommandItems, commandItemHTML, commandResultsHTML, commandPaletteHTML,
  mountCommandPalette, CMD_PALETTE_MODAL_ID, CMD_PALETTE_BTN_ID,
  COMMAND_VIEWS, COMMAND_ACTIONS,
} from '../src/client/views/command-palette.js';
import { PLACEHOLDER } from '../src/client/shared/store.js';

const quotes = [
  { id: 'gold-intl', name: '国际金价', sub: '伦敦金 XAU/USD 现货' },
  { id: 'oil', name: '国际原油', sub: 'WTI 纽约原油' },
];

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('filterCommandItems：纯函数检索', () => {
  it('空 query 返回全部：5 视图 + 9 动作 + 标的（默认 23 个）', () => {
    const all = filterCommandItems('');
    expect(all.filter((x) => x.category === 'view')).toHaveLength(COMMAND_VIEWS.length);
    expect(all.filter((x) => x.category === 'action')).toHaveLength(COMMAND_ACTIONS.length);
    expect(all.filter((x) => x.category === 'asset')).toHaveLength(PLACEHOLDER.length);
  });

  it('按中文名检索标的，直达 #/d/<id>', () => {
    const hit = filterCommandItems('国际金价', { quotes });
    expect(hit).toHaveLength(1);
    expect(hit[0].hash).toBe('#/d/gold-intl');
    expect(hit[0].category).toBe('asset');
  });

  it('按 id 与副标题检索标的', () => {
    expect(filterCommandItems('gold-intl', { quotes }).map((x) => x.id)).toContain('asset:gold-intl');
    expect(filterCommandItems('伦敦金', { quotes }).map((x) => x.id)).toContain('asset:gold-intl');
    expect(filterCommandItems('WTI', { quotes }).map((x) => x.id)).toContain('asset:oil');
  });

  it('检索视图与工作台动作，且带上正确的 hash / patch', () => {
    const map = filterCommandItems('地图');
    expect(map.map((x) => x.hash)).toContain('#/map');
    const wall = filterCommandItems('磁贴墙');
    expect(wall[0].patch).toEqual({ density: 'wall' });
    const oled = filterCommandItems('OLED');
    expect(oled[0].patch).toEqual({ theme: 'oled' });
    const brief = filterCommandItems('隔夜');
    expect(brief[0].action).toBe('briefing');
    expect(filterCommandItems('预警')[0].action).toBe('alerts');
  });

  it('多个词是「且」语义，大小写不敏感，无匹配返回空数组', () => {
    expect(filterCommandItems('金价 国际', { quotes })).toHaveLength(1);
    expect(filterCommandItems('GOLD-INTL', { quotes })).toHaveLength(1);
    expect(filterCommandItems('不存在的命令xyz')).toEqual([]);
  });

  it('没有实时报价时回退到 23 个静态标的（面板永远可用）', () => {
    const all = filterCommandItems('', { quotes: [] });
    expect(all.filter((x) => x.category === 'asset')).toHaveLength(23);
    expect(all.find((x) => x.id === 'asset:ndx100').hash).toBe('#/d/ndx100');
  });

  it('运行时报价优先；synthetics 可检索且不造死链', () => {
    expect(() => filterCommandItems('油价', { quotes, synthetics: [{ id: 'gold-oil-ratio', name: '金油比' }], preferences: { theme: 'light' } })).not.toThrow();
    expect(filterCommandItems('', { quotes }).filter((x) => x.category === 'asset')).toHaveLength(2);
    const syn = filterCommandItems('金油比', { quotes: [], synthetics: [{ id: 'gold-oil-ratio', name: '金油比' }] });
    expect(syn).toHaveLength(1);
    // 合成比价没有详情页，统一落到关联分析而不是 #/d/xxx 死链
    expect(syn[0].hash).toBe('#/macro');
    expect(filterCommandItems('gold-oil-ratio', { synthetics: [{ id: 'gold-oil-ratio' }] })).toHaveLength(1);
  });

  it('坏 synthetics 输入被跳过，不影响其它结果', () => {
    const items = filterCommandItems('地图', { synthetics: [null, {}, 42, { id: '' }] });
    expect(items.every((x) => x.category !== 'synthetic')).toBe(true);
  });
});

describe('渲染：转义与选中态', () => {
  it('标的名里的 HTML 被转义，不产生注入', () => {
    const out = commandItemHTML({ id: 'x', label: '<img src=x onerror=alert(1)>', hint: '<script>', category: 'asset' }, 0);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('href 项渲染成 <a>，动作项渲染成 <button>', () => {
    expect(commandItemHTML({ label: '地图', hash: '#/map', category: 'view' }, 0)).toContain('href="#/map"');
    expect(commandItemHTML({ label: '深色', patch: { theme: 'dark' }, category: 'action' }, 0)).toContain('<button');
  });

  it('active 项带 is-active 与 aria-selected', () => {
    expect(commandItemHTML({ label: 'x', hash: '#', category: 'view' }, 2, true)).toContain('class="cp-item is-active"');
    expect(commandItemHTML({ label: 'x', hash: '#', category: 'view' }, 2, true)).toContain('aria-selected="true"');
  });

  it('空结果给可读空态，非空结果带 listbox', () => {
    expect(commandResultsHTML([])).toContain('cp-empty');
    expect(commandResultsHTML(filterCommandItems('地图'))).toContain('role="listbox"');
  });

  it('模态骨架带 combobox 输入框、结果容器与关闭按钮', () => {
    expect(commandPaletteHTML()).toContain('id="cmd-palette-input"');
    expect(commandPaletteHTML()).toContain('role="combobox"');
    expect(commandPaletteHTML()).toContain('data-cp-dismiss="1"');
  });
});

describe('mountCommandPalette：快捷键与交互', () => {
  const setup = (extra = {}) => {
    document.body.innerHTML = `<button id="${CMD_PALETTE_BTN_ID}">⌘K</button>`;
    const patch = vi.fn();
    const action = vi.fn();
    const navigate = vi.fn();
    const off = mountCommandPalette({
      getQuotes: () => quotes, onPatch: patch, onAction: action, onNavigate: navigate, ...extra,
    });
    return { patch, action, navigate, off };
  };
  const key = (init) => document.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, ...init }));

  it('Cmd+K 打开、再按一次关闭；Ctrl+K 同样生效', () => {
    setup();
    key({ key: 'k', metaKey: true });
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).not.toBeNull();
    key({ key: 'K', metaKey: true });
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
    key({ key: 'k', ctrlKey: true });
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).not.toBeNull();
    key({ key: 'Escape' });
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
  });

  it('点顶栏按钮打开；点背景关闭', () => {
    setup();
    document.getElementById(CMD_PALETTE_BTN_ID).click();
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).not.toBeNull();
    document.querySelector('[data-cp-dismiss]').click();
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
  });

  it('输入过滤结果，回车执行第一条（视图项走 onNavigate）', () => {
    const { navigate } = setup();
    key({ key: 'k', metaKey: true });
    const input = document.getElementById('cmd-palette-input');
    input.value = '地图';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.querySelectorAll('[data-cmd-index]')).toHaveLength(1);
    key({ key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('#/map');
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
  });

  it('上下键切换选中项，回车执行动作项发 patch', () => {
    const { patch } = setup();
    key({ key: 'k', metaKey: true });
    const input = document.getElementById('cmd-palette-input');
    input.value = '主题';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.querySelector('.cp-item.is-active').textContent).toContain('深色');
    key({ key: 'ArrowDown' });
    expect(document.querySelector('.cp-item.is-active').textContent).toContain('OLED');
    key({ key: 'ArrowUp' });
    key({ key: 'Enter' });
    expect(patch).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('点击结果项执行；无 onNavigate 时改 location.hash', () => {
    const { off } = setup();
    document.getElementById(CMD_PALETTE_BTN_ID).click();
    const input = document.getElementById('cmd-palette-input');
    input.value = '事件中心';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.querySelector('[data-cmd-index]').click();
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
    off();
  });

  it('动作项交给 onAction（隔夜复盘 / 预警中心）', () => {
    const { action } = setup();
    key({ key: 'k', metaKey: true });
    const input = document.getElementById('cmd-palette-input');
    input.value = '隔夜复盘';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    key({ key: 'Enter' });
    expect(action).toHaveBeenCalledWith('briefing');
  });

  it('解绑后快捷键与按钮都不再生效', () => {
    const { off } = setup();
    off();
    key({ key: 'k', metaKey: true });
    document.getElementById(CMD_PALETTE_BTN_ID).click();
    expect(document.getElementById(CMD_PALETTE_MODAL_ID)).toBeNull();
  });
});
