// @vitest-environment jsdom
/* ================================================================== *
 * Phase 2 / P2-T2：工作台控制条
 *
 * 控件点下去必须真的改偏好、改 dataset（CSS 变量靠它切换）、并触发重绘。
 * 全部走真实 DOM 事件，不测「函数没抛」。
 * ================================================================== */

import { describe, it, expect, beforeEach } from 'vitest';
import { workspaceBarHTML, mountWorkspaceBar } from '../src/client/views/workspace-bar.js';
import { createWorkspaceStore, DEFAULT_PREFERENCES } from '../src/client/shared/workspace-store.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
};

describe('workspaceBarHTML：四组控件', () => {
  it('包含视图密度、时间锚点、配色、主题四组按钮', () => {
    const out = String(workspaceBarHTML(DEFAULT_PREFERENCES));
    for (const key of ['density', 'anchor', 'scheme', 'theme']) {
      expect(out).toContain(`data-ws-${key}`);
    }
    expect(out).toContain('分组列表');
    expect(out).toContain('磁贴墙');
    expect(out).toContain('全部平铺');
    expect(out).toContain('自今日起点');
    expect(out).toContain('绿涨红跌');
    expect(out).toContain('OLED');
  });

  it('当前值带 aria-pressed="true"，其余为 false', () => {
    const out = String(workspaceBarHTML({ ...DEFAULT_PREFERENCES, density: 'wall', theme: 'light' }));
    expect(out).toContain('data-ws-density="wall" aria-pressed="true"');
    expect(out).toContain('data-ws-theme="light" aria-pressed="true"');
    expect(out).toContain('data-ws-density="grouped" aria-pressed="false"');
  });
});

describe('mountWorkspaceBar：点击写回偏好并触发 onChange', () => {
  let host;
  let ws;
  let changes;

  beforeEach(() => {
    document.body.innerHTML = '<div id="ws-bar"></div>';
    host = document.getElementById('ws-bar');
    ws = createWorkspaceStore(memoryStorage(), document.documentElement);
    changes = [];
    mountWorkspaceBar(host, { workspace: ws, onChange: (s) => changes.push(s) });
  });

  it('默认磁贴墙，切到分组列表 → store / dataset / onChange 三处同步', () => {
    expect(ws.getState().density).toBe('wall');
    host.querySelector('[data-ws-density="grouped"]').click();
    expect(ws.getState().density).toBe('grouped');
    expect(document.documentElement.dataset.density).toBe('grouped');
    expect(changes).toHaveLength(1);
    expect(host.querySelector('[data-ws-density="grouped"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('切换配色与主题', () => {
    host.querySelector('[data-ws-scheme="intl"]').click();
    host.querySelector('[data-ws-theme="oled"]').click();
    expect(ws.getState().colorScheme).toBe('intl');
    expect(ws.getState().theme).toBe('oled');
    expect(document.documentElement.dataset.colorScheme).toBe('intl');
    expect(document.documentElement.dataset.theme).toBe('oled');
  });

  it('切换时间锚点', () => {
    host.querySelector('[data-ws-anchor="intraday_open"]').click();
    expect(ws.getState().anchorClock).toBe('intraday_open');
    expect(document.documentElement.dataset.anchorClock).toBe('intraday_open');
  });

  it('点无效值不触发变更；返回的函数可解绑', () => {
    const btn = host.querySelector('[data-ws-density="grouped"]');
    btn.dataset.wsDensity = 'bogus';
    btn.click();
    expect(ws.getState().density).toBe('wall');
    expect(changes).toHaveLength(0);
  });

  it('点市场时段筛选按钮调用 onSessionFilter 并同步 aria-pressed', () => {
    const picked = [];
    mountWorkspaceBar(host, {
      workspace: ws,
      getSessionState: () => ({ sessionFilter: 'all', counts: { all: 23, open: 10, closed: 13 } }),
      onSessionFilter: (mode) => picked.push(mode),
    });
    const openBtn = host.querySelector('[data-ws-session="open"]');
    expect(openBtn.textContent).toContain('交易中');
    expect(openBtn.textContent).toContain('10');
    openBtn.click();
    expect(picked).toEqual(['open']);
    expect(openBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('没有 host 时不抛（容器被别的视图删掉了）', () => {
    expect(() => mountWorkspaceBar(null, { workspace: ws })).not.toThrow();
  });

  it('次级设置收敛在默认折叠的 disclosure 中，且展开后切换偏好仍保持展开', () => {
    const details = host.querySelector('details.ws-prefs-disclosure');
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    expect(details.querySelector('.ws-prefs-trigger')?.textContent).toContain('显示设置');

    details.open = true;
    host.querySelector('[data-ws-theme="oled"]').click();
    const afterDetails = host.querySelector('details.ws-prefs-disclosure');
    expect(afterDetails.open).toBe(true);
    expect(afterDetails.querySelector('.ws-prefs-summary')?.textContent).toContain('OLED');
  });
});
