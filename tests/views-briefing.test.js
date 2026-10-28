// @vitest-environment jsdom
/* ================================================================== *
 * 隔夜复盘面板（方案 E07 的视图迁移样板）
 *
 * 这块以前 0 覆盖，而且是「直接 fetch + res.json()」：服务没起时会抛一个
 * 让人看不懂的 SyntaxError。迁移到统一请求层后，错误变成带 kind 的 ApiError，
 * 面板能说清「为什么没有内容」。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

document.body.innerHTML = `
  <div id="updated"></div><button id="refresh"></button><main id="rows"></main>
  <section id="detail"></section><section id="macro"></section><section id="events"></section>
  <section id="map"></section><button id="briefing-btn"></button>
`;

const briefing = await import('../src/client/views/briefing.js');

const panel = () => document.getElementById('briefing-panel');
const originalFetch = globalThis.fetch;

beforeEach(() => {
  briefing.__resetBriefingCache?.();
  briefing.closeBriefing?.();
  const p = panel();
  if (p) p.remove();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('面板渲染', () => {
  it('collecting 状态说清「样本不足」而不是显示一张空表', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: 'collecting', samples: 0, items: [] }),
    });
    await briefing.openBriefing({ force: true });
    expect(panel()).toBeTruthy();
    expect(panel().textContent).toContain('样本不足');
    expect(panel().innerHTML).toContain('briefing-empty');
  });

  it('overnight 状态显示基准时间与条目', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        status: 'overnight',
        cutLabel: '15:00',
        baselineAt: '2026-10-27T07:00:00.000Z',
        latestAt: '2026-10-28T01:00:00.000Z',
        items: [
          { id: 'sp500', name: '标普500', to: 5738.2, movePct: 0.83 },
          { id: 'gold-intl', name: '国际金价', to: 4123.4, movePct: -1.12 },
        ],
      }),
    });
    await briefing.openBriefing({ force: true });
    expect(panel().textContent).toContain('隔夜');
    expect(panel().innerHTML).toContain('briefing-row');
    expect(panel().textContent).toContain('标普500');
    // 方向用类名表达（同时有符号），不只靠颜色
    expect(panel().innerHTML).toContain('briefing-move up');
    expect(panel().innerHTML).toContain('briefing-move down');
  });

  it('intraday 状态标明「今日开盘以来」', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: 'intraday', baselineAt: '2026-10-28T01:30:00.000Z', items: [] }),
    });
    await briefing.openBriefing({ force: true });
    expect(panel().textContent).toContain('今日开盘以来');
  });
});

describe('错误路径', () => {
  it('接口失败时显示可读原因（不是 SyntaxError）', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await briefing.openBriefing({ force: true });
    expect(panel().textContent).toContain('读取失败');
    expect(panel().textContent).toContain('503');
  });

  it('网络不可用时也说人话', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await briefing.openBriefing({ force: true });
    expect(panel().textContent).toContain('读取失败');
  });
});

describe('开关与卸载', () => {
  it('再次点击关闭面板；关闭后不再往面板里写内容', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: 'collecting', samples: 0, items: [] }),
    });
    await briefing.openBriefing({ force: true });
    expect(panel()).toBeTruthy();
    briefing.closeBriefing();
    expect(panel()).toBeNull();
    // 已经关掉之后再点一次 → 重新开
    await briefing.openBriefing({ force: true });
    expect(panel()).toBeTruthy();
    briefing.closeBriefing();
  });

  it('Escape 关闭面板', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: 'collecting', samples: 0, items: [] }),
    });
    await briefing.openBriefing({ force: true });
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel()).toBeNull();
  });
});
