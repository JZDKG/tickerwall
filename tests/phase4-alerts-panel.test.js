// @vitest-environment jsdom
/* ================================================================== *
 * Phase 4 / P4-T1：智能预警中心 UI + SSE 实时告警横幅
 *
 * 验收：规则列表 / 新建表单 / 删除 / 最近触发；
 *      alert 帧 → #alert-toast-banner 横幅 + 未读计数徽章（打开面板时清零）。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeAlertForm, createAlertsApi, alertRuleHTML, alertEventHTML,
  alertsPanelHTML, alertToastHTML, unreadBadgeText, mountAlertsPanel,
  ALERTS_PANEL_ID, ALERT_TOAST_ID, ALERTS_BTN_ID, ALERT_UNREAD_ID, ALERT_TOAST_MS,
} from '../src/client/views/alerts-panel.js';

function fakeBus() {
  const handlers = new Map();
  return {
    on: (ev, fn) => { handlers.set(ev, fn); return () => handlers.delete(ev); },
    off: (ev) => handlers.delete(ev),
    emit: (ev, payload) => handlers.get(ev)?.(payload),
  };
}

const RULES = [{
  id: 'alr_1', name: '金价越界', kind: 'price', target_id: 'gold-intl',
  operator: '>', threshold: 2750, enabled: 1,
}];
const EVENTS = [{
  id: 1, rule_id: 'alr_1', kind: 'price', target_id: 'gold-intl',
  title: '金价越界 · 价格越界', message: '越过 2750', observed_value: 2760,
  triggered_at: 1730000000000,
}];

function apiStub(over = {}) {
  return {
    list: vi.fn(async () => ({ ok: true, rules: RULES, recentEvents: EVENTS })),
    create: vi.fn(async (r) => ({ ok: true, rule: r })),
    remove: vi.fn(async () => ({ ok: true, deleted: true })),
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = `<button id="${ALERTS_BTN_ID}">预警中心<span id="${ALERT_UNREAD_ID}" hidden></span></button>`;
});

describe('normalizeAlertForm：表单 → 请求体', () => {
  it('价格规则按表单透传，名称留空时自动生成', () => {
    const out = normalizeAlertForm({ kind: 'price', target_id: 'gold-intl', operator: '>', threshold: '2750' });
    expect(out).toMatchObject({ kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 2750 });
    expect(out.name).toContain('gold-intl');
  });

  it('非法 kind / operator 回退，空阈值给 null', () => {
    const out = normalizeAlertForm({ kind: 'nope', operator: '?', threshold: '' });
    expect(out.kind).toBe('price');
    expect(out.operator).toBe('>');
    expect(out.threshold).toBeNull();
  });

  it('divergence 固定 >= 1、目标默认 any（布尔型条件）', () => {
    const out = normalizeAlertForm({ kind: 'divergence', target_id: '', operator: '>', threshold: '999' });
    expect(out).toMatchObject({ kind: 'divergence', target_id: 'any', operator: '>=', threshold: 1 });
  });

  it('目标 id 与名称做长度裁剪', () => {
    const out = normalizeAlertForm({ kind: 'price', target_id: 'x'.repeat(500), name: 'y'.repeat(500) });
    expect(out.target_id).toHaveLength(120);
    expect(out.name).toHaveLength(120);
  });
});

describe('createAlertsApi：REST 请求层', () => {
  it('GET 读列表；POST 创建；POST delete 删除', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, rules: [] }) }));
    const api = createAlertsApi({ fetchImpl: f, base: './' });
    await api.list();
    expect(f.mock.calls[0][0]).toBe('./api/alerts');
    expect(f.mock.calls[0][1].method).toBe('GET');
    await api.create({ kind: 'price' });
    expect(f.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ kind: 'price' });
    await api.remove('alr_1');
    expect(JSON.parse(f.mock.calls[2][1].body)).toEqual({ action: 'delete', id: 'alr_1' });
  });

  it('非 2xx 抛错', async () => {
    const api = createAlertsApi({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
    await expect(api.list()).rejects.toThrow('HTTP 503');
  });
});

describe('渲染：转义与结构', () => {
  it('规则行带 [data-delete-alert]，名称转义', () => {
    const out = alertRuleHTML({ ...RULES[0], name: '<img src=x onerror=alert(1)>' });
    expect(out).toContain('data-delete-alert="alr_1"');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('触发记录渲染标题 / 正文 / 时间', () => {
    const out = alertEventHTML(EVENTS[0]);
    expect(out).toContain('金价越界');
    expect(out).toContain('越过 2750');
    expect(out).toContain('<time>');
  });

  it('面板含四种类型、四种操作符、表单与两块列表', () => {
    const out = alertsPanelHTML({ rules: RULES, recentEvents: EVENTS });
    for (const k of ['price', 'change_pct', 'spread', 'divergence']) expect(out).toContain(`value="${k}"`);
    expect(out).toContain('data-alert-form');
    expect(out).toContain('当前规则（1）');
    expect(out).toContain('最近触发');
    expect(out).toContain('role="dialog"');
  });

  it('空列表与错误态给可读文案', () => {
    expect(alertsPanelHTML()).toContain('还没有规则');
    expect(alertsPanelHTML()).toContain('暂无触发记录');
    expect(alertsPanelHTML({ error: '<script>x</script>' })).toContain('&lt;script&gt;');
  });

  it('告警横幅转义标题与正文', () => {
    expect(alertToastHTML({ title: '<b>t</b>', message: '<i>m</i>' })).not.toContain('<b>t</b>');
    expect(alertToastHTML(null)).toContain('宏观预警');
  });

  it('未读计数：0 隐藏、>99 截断成 99+', () => {
    expect(unreadBadgeText(0)).toBe('');
    expect(unreadBadgeText(3)).toBe('3');
    expect(unreadBadgeText(100)).toBe('99+');
    expect(unreadBadgeText(NaN)).toBe('');
  });
});

describe('mountAlertsPanel：交互与告警横幅', () => {
  const setup = (over = {}) => {
    const bus = fakeBus();
    const api = apiStub();
    const off = mountAlertsPanel({ bus, api, setTimeout: () => 0, ...over });
    return { bus, api, off };
  };

  it('点 #alerts-btn 打开面板并加载规则与最近触发', async () => {
    const { api } = setup();
    document.getElementById(ALERTS_BTN_ID).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById(ALERTS_PANEL_ID)).not.toBeNull();
    expect(api.list).toHaveBeenCalled();
    expect(document.querySelector('[data-delete-alert="alr_1"]')).not.toBeNull();
    expect(document.querySelector('.al-event')).not.toBeNull();
  });

  it('Esc / 点背景关闭面板', async () => {
    setup();
    document.getElementById(ALERTS_BTN_ID).click();
    await Promise.resolve();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById(ALERTS_PANEL_ID)).toBeNull();
    document.getElementById(ALERTS_BTN_ID).click();
    document.querySelector('[data-alerts-dismiss]').click();
    expect(document.getElementById(ALERTS_PANEL_ID)).toBeNull();
  });

  it('提交表单走 POST 并刷新列表；空目标有可读报错', async () => {
    const { api } = setup();
    document.getElementById(ALERTS_BTN_ID).click();
    await Promise.resolve();
    const form = document.querySelector('[data-alert-form]');
    form.querySelector('[name="kind"]').value = 'price';
    form.querySelector('[name="target_id"]').value = 'gold-intl';
    form.querySelector('[name="operator"]').value = '>';
    form.querySelector('[name="threshold"]').value = '2750';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'price', target_id: 'gold-intl', threshold: 2750 }));
    expect(api.list.mock.calls.length).toBeGreaterThan(1);
  });

  it('点删除按钮发 POST delete 并重拉', async () => {
    const { api } = setup();
    document.getElementById(ALERTS_BTN_ID).click();
    await Promise.resolve();
    await Promise.resolve();
    document.querySelector('[data-delete-alert="alr_1"]').click();
    await Promise.resolve();
    expect(api.remove).toHaveBeenCalledWith('alr_1');
  });

  it('读取失败给可读错误，不抛到全局', async () => {
    const api = apiStub({ list: vi.fn(async () => { throw new Error('offline'); }) });
    mountAlertsPanel({ bus: fakeBus(), api, setTimeout: () => 0 });
    document.getElementById(ALERTS_BTN_ID).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.al-error').textContent).toContain('offline');
  });

  it('SSE alert 帧 → 横幅 + 未读徽章；打开面板时清零', async () => {
    const { bus } = setup();
    bus.emit('alert', { ruleId: 'alr_1', title: '金价预警', message: '越过 2750' });
    const toast = document.getElementById(ALERT_TOAST_ID);
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toContain('金价预警');
    const badge = document.getElementById(ALERT_UNREAD_ID);
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('1');
    bus.emit('alert', { title: '第二条', message: '' });
    expect(badge.textContent).toBe('2');
    document.getElementById(ALERTS_BTN_ID).click();
    expect(badge.hidden).toBe(true);
  });

  it('自动消失按 ALERT_TOAST_MS 安排；点 × 立即隐藏', () => {
    const schedule = vi.fn();
    const bus = fakeBus();
    mountAlertsPanel({ bus, api: apiStub(), setTimeout: schedule });
    bus.emit('alert', { title: 't', message: 'm' });
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), ALERT_TOAST_MS);
    document.querySelector('[data-alert-toast-dismiss]').click();
    expect(document.getElementById(ALERT_TOAST_ID).hidden).toBe(true);
  });

  it('解绑后 alert 事件不再响应', () => {
    const { bus, off } = setup();
    off();
    bus.emit('alert', { title: '晚到', message: '' });
    expect(document.getElementById(ALERT_TOAST_ID)).toBeNull();
  });
});
