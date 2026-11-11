// @vitest-environment jsdom
/* ================================================================== *
 * Phase 3 / P3-T2：预警横幅与系统通知（客户端展示层）
 *
 * 验收：alert 事件到达 → 顶部横幅显示转义后的标题/正文 → 可关闭；
 *      Notification 已授权才发系统通知，未授权不主动索要权限。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mountAlertBanner, bannerHTML, ALERT_BANNER_ID, ALERT_BANNER_MS,
} from '../src/client/shared/alert-banner.js';

function fakeBus() {
  const handlers = new Map();
  return {
    on: (ev, fn) => { handlers.set(ev, fn); return () => handlers.delete(ev); },
    off: (ev) => handlers.delete(ev),
    emit: (ev, payload) => handlers.get(ev)?.(payload),
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('bannerHTML：转义安全', () => {
  it('标题与正文里的 HTML 被转义（防 XSS 注入）', () => {
    const html = bannerHTML({ title: '<img src=x onerror=alert(1)>', message: '<script>bad()</script>' });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('空命中给默认文案且不抛', () => {
    expect(bannerHTML(null)).toContain('宏观预警');
  });

  it('常量：横幅 id 与 8s 自动消失', () => {
    expect(ALERT_BANNER_ID).toBe('tw-alert-banner');
    expect(ALERT_BANNER_MS).toBe(8000);
  });
});

describe('mountAlertBanner：bus 订阅与 DOM', () => {
  it('alert 事件显示横幅，点击关闭后隐藏', () => {
    const bus = fakeBus();
    const unmount = mountAlertBanner({ bus, setTimeout: () => 0 });
    bus.emit('alert', { ruleId: 'r1', title: '金价预警', message: '越过 2750' });
    const host = document.getElementById(ALERT_BANNER_ID);
    expect(host.hidden).toBe(false);
    expect(host.textContent).toContain('金价预警');
    expect(host.textContent).toContain('越过 2750');
    host.querySelector('[data-action="dismiss-alert"]').click();
    expect(host.hidden).toBe(true);
    unmount();
  });

  it('解绑后不再响应 alert', () => {
    const bus = fakeBus();
    const unmount = mountAlertBanner({ bus, setTimeout: () => 0 });
    unmount();
    bus.emit('alert', { title: '晚到', message: '' });
    expect(document.getElementById(ALERT_BANNER_ID).hidden).toBe(true);
  });

  it('自动消失定时器按 ALERT_BANNER_MS 安排', () => {
    const bus = fakeBus();
    const schedule = vi.fn();
    mountAlertBanner({ bus, setTimeout: schedule });
    bus.emit('alert', { title: 't', message: 'm' });
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), ALERT_BANNER_MS);
  });

  it('Notification 已授权时发系统通知；未授权不发、不请求权限', () => {
    const bus = fakeBus();
    class Granted {
      static permission = 'granted';
      constructor(title, opts) { Granted.calls.push([title, opts]); }
    }
    Granted.calls = [];
    mountAlertBanner({ bus, NotificationImpl: Granted, setTimeout: () => 0 });
    bus.emit('alert', { ruleId: 'r1', title: '金价预警', message: '越过阈值' });
    expect(Granted.calls).toEqual([['金价预警', { body: '越过阈值', tag: 'r1' }]]);

    class Denied {
      static permission = 'denied';
      static requestPermission = vi.fn();
      constructor() { Denied.calls.push(1); }
    }
    Denied.calls = [];
    mountAlertBanner({ bus, NotificationImpl: Denied, setTimeout: () => 0 });
    bus.emit('alert', { title: 'x', message: '' });
    expect(Denied.calls).toHaveLength(0);
    expect(Denied.requestPermission).not.toHaveBeenCalled();
  });
});
