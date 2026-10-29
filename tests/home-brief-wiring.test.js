// @vitest-environment jsdom
/* ================================================================== *
 * 关注简报接进启动流程（产品 2.3 收尾）
 *
 * 这一段的时序错了不会抛异常，只会让条目悄悄消失：
 *   · lastSeen 必须在**渲染成功之后**才推进；
 *   · 没关注项时不拉简报（省上游，也不凑数）；
 *   · 两块各自失败。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { fetchBrief, openPicker, refreshHomeBrief } from '../src/client/views/home-brief-wiring.js';
import { readWatched, writeWatched } from '../src/client/shared/watchlist.js';
import { LAST_SEEN_KEY } from '../src/client/views/watch-brief.js';

const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    _m: m,
  };
};

const host = () => {
  const el = document.createElement('section');
  el.id = 'home-brief';
  document.body.appendChild(el);
  return el;
};

describe('拉简报', () => {
  it('没关注项时不发请求，直接 NO_WATCH', async () => {
    const spy = vi.fn();
    const out = await fetchBrief({ watched: [], sinceMs: null, fetchJson: spy });
    expect(spy).not.toHaveBeenCalled();
    expect(out.reason).toBe('NO_WATCH');
  });

  it('有专注项时带上 assets 与 keys', async () => {
    let received = null;
    const out = await fetchBrief({
      watched: ['gold-gap'],
      sinceMs: 1234,
      fetchJson: async (p, params) => { received = { p, params }; return { ok: true, items: [], empty: true }; },
    });
    expect(received.p).toBe('api/brief');
    expect(received.params.assets).toContain('gold-intl');
    expect(received.params.since).toBe('1234');
    expect(out.ok).toBe(true);
  });

  it('没有 lastSeen 时不带 since（让服务端用自己的默认窗口）', async () => {
    let params = null;
    await fetchBrief({
      watched: ['gold-gap'],
      sinceMs: null,
      fetchJson: async (p, p2) => { params = p2; return { ok: true }; },
    });
    expect(params.since).toBeUndefined();
  });

  it('取数失败 → unavailable，而不是「没有变化」', async () => {
    const out = await fetchBrief({
      watched: ['gold-gap'],
      sinceMs: null,
      fetchJson: async () => { throw new Error('502'); },
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('502');
  });
});

describe('刷新首页', () => {
  it('渲染两块，并在成功后推进 lastSeen', async () => {
    const el = host();
    const s = memory();
    writeWatched(s, ['gold-gap']);
    const before = readWatched(s);
    expect(before).toEqual(['gold-gap']);

    const out = await refreshHomeBrief({
      host: el,
      storage: s,
      nowMs: 5_000_000,
      fetchJson: async (p) => (p === 'api/brief'
        ? { ok: true, reason: 'NO_CHANGES', items: [], empty: true, count: 0 }
        : { ok: true, total: 0, released: [], pending: [], deviated: [] }),
    });
    expect(out.brief.reason).toBe('NO_CHANGES');
    expect(s.getItem(LAST_SEEN_KEY)).toBe('5000000');
    el.remove();
  });

  it('简报取不到时**不推进** lastSeen（否则这次没看到的条目永远消失）', async () => {
    const el = host();
    const s = memory();
    writeWatched(s, ['gold-gap']);
    await refreshHomeBrief({
      host: el,
      storage: s,
      nowMs: 7_000_000,
      fetchJson: async (p) => {
        if (p === 'api/brief') throw new Error('502');
        return { ok: true, total: 0, released: [], pending: [], deviated: [] };
      },
    });
    expect(s.getItem(LAST_SEEN_KEY)).toBeNull();
    el.remove();
  });

  it('简报挂了台账照常显示（两块独立）', async () => {
    const el = host();
    const s = memory();
    writeWatched(s, ['gold-gap']);
    await refreshHomeBrief({
      host: el,
      storage: s,
      fetchJson: async (p) => {
        if (p === 'api/brief') throw new Error('502');
        return { ok: true, total: 1, released: [{ title: 'CPI', verdict: 'above', label: '高于预期', gap: 0.3 }], pending: [], deviated: [] };
      },
    });
    expect(el.textContent).toContain('502');
    expect(el.textContent).toContain('预期与实际');
    el.remove();
  });

  it('没关注项时不拉简报、但台账照拉', async () => {
    const el = host();
    const s = memory();
    const calls = [];
    await refreshHomeBrief({
      host: el,
      storage: s,
      nowMs: 1,
      fetchJson: async (p) => {
        calls.push(p);
        return p === 'api/brief'
          ? { ok: true, reason: 'NO_WATCH', items: [], empty: true }
          : { ok: true, total: 1, released: [], pending: [], deviated: [] };
      },
    });
    expect(calls).toContain('api/expectations');
    expect(calls).not.toContain('api/brief');
    el.remove();
  });
});

describe('选择面板', () => {
  it('列出全部问题，已选打勾', async () => {
    const el = host();
    const s = memory();
    writeWatched(s, ['gold-gap']);
    await openPicker({ host: el, storage: s, fetchJson: async () => ({ ok: true, total: 0, items: [] }) });
    expect(el.querySelectorAll('[data-watch]').length).toBeGreaterThan(1);
    expect(el.querySelector('[data-watch="gold-gap"]').checked).toBe(true);
    el.remove();
  });

  it('勾选后写本地并重拉简报', async () => {
    const el = host();
    const s = memory();
    const calls = [];
    await openPicker({
      host: el,
      storage: s,
      fetchJson: async (p) => {
        calls.push(p);
        return p === 'api/brief'
          ? { ok: true, reason: 'NO_WATCH', items: [], empty: true }
          : { ok: true, total: 0, released: [], pending: [], deviated: [] };
      },
    });
    const input = el.querySelector('[data-watch="gold-gap"]');
    input.checked = true;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(readWatched(s)).toContain('gold-gap');
    expect(calls).toContain('api/brief');
    el.remove();
  });

  it('已满三个时再勾不会写进去（拒绝而不是静默顶掉）', async () => {
    const el = host();
    const s = memory();
    writeWatched(s, ['gold-gap', 'fx-cost', 'oil-cost']);
    await openPicker({ host: el, storage: s, fetchJson: async (p) => (p === 'api/brief' ? { ok: true, items: [] } : { ok: true, total: 0 }) });
    const extra = el.querySelector('[data-watch="real-yield"]');
    if (extra && !extra.disabled) {
      extra.checked = true;
      extra.dispatchEvent(new window.Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(readWatched(s)).toHaveLength(3);
    expect(readWatched(s)).not.toContain('real-yield');
    el.remove();
  });

  it('没有容器时安全返回 null', async () => {
    expect(await openPicker({ host: null, storage: memory() })).toBeNull();
  });
});

describe('生活场景接进同一屏', () => {
  const routes = (over = {}) => async (p) => {
    if (p.startsWith('api/brief')) return { ok: true, reason: 'NO_CHANGES', items: [], empty: true, count: 0 };
    if (p.startsWith('api/life-path')) return over.life ?? { ok: true, title: '油价与出行成本', headline: '上行', steps: [], gaps: [], disclaimer: '不预测' };
    return { ok: true, total: 0, released: [], pending: [], deviated: [] };
  };

  it('三块一起渲染', async () => {
    const el = host();
    const s = memory();
    writeWatched(s, ['oil-cost']);
    await refreshHomeBrief({ host: el, storage: s, nowMs: 1, fetchJson: routes() });
    // 场景卡的标题来自 path.title；「与生活的连接」只出现在入口清单里
    expect(el.textContent).toContain('油价与出行成本');
    el.remove();
  });

  it('生活场景取数失败不影响其它两块（它是额外一块）', async () => {
    const el = host();
    const s = memory();
    writeWatched(s, ['oil-cost']);
    await refreshHomeBrief({
      host: el,
      storage: s,
      nowMs: 1,
      fetchJson: async (p) => {
        if (p.startsWith('api/life-path')) throw new Error('502');
        return routes()(p);
      },
    });
    expect(el.textContent).not.toContain('502');
    el.remove();
  });
});

describe('启动时真的会拉（不是只有函数定义）', () => {
  it('main.js 在启动流程里调用了 refreshHomeBriefSafe 与 scheduleHomeBrief', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/client/main.js', 'utf8'));
    // 必须有**调用**（带括号），不能只有定义
    expect(src).toMatch(/refreshHomeBriefSafe\s*\(/);
    expect(src).toMatch(/^\s*scheduleHomeBrief\s*\(/m);
    expect(src).toMatch(/void refreshHomeBriefSafe\(\)/);
  });
});

describe('首页先看这三个问题（产品 §3 的挂载）', () => {
  it('刷首页时把关注项清单传给渲染层', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/client/views/home-brief-wiring.js', 'utf8'));
    expect(src).toMatch(/questions:\s*\{\s*list:\s*WATCH_QUESTIONS/);
    expect(src).toMatch(/chosen:\s*watched/);
  });
});
