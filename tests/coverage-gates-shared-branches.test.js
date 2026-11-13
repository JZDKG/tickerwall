// @vitest-environment jsdom
/* ================================================================== *
 * 覆盖率门禁补齐：shared 模块剩余分支
 *
 * 全是「可注入依赖的缺省侧」与「边界输入」，每条都断言真实结果。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { createApi } = await import('../src/client/shared/api.js');
const { getJson, getJsonWithStatus } = await import('../src/client/shared/fetch-json.js');
const { html } = await import('../src/client/shared/format.js');
const { createQueryCache, describeRefresh } = await import('../src/client/shared/query-cache.js');
const { createRealtime } = await import('../src/client/shared/realtime.js');
const { mountAlertBanner } = await import('../src/client/shared/alert-banner.js');
const db = await import('../src/client/shared/desktop-bridge.js');
const card = await import('../src/client/shared/share-card.js');
const cardUi = await import('../src/client/shared/share-card-ui.js');

const okRes = (data) => ({ ok: true, status: 200, json: async () => data });

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '市场看板';
  delete globalThis.window.__TAURI_INTERNALS__;
  delete globalThis.window.__TAURI__;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.window.__TAURI_INTERNALS__;
  delete globalThis.window.__TAURI__;
});

/* ------------------------------------------------------------------ *
 * api.js：绝对 URL 不走 base 前缀
 * ------------------------------------------------------------------ */
describe('createApi：绝对路径分支', () => {
  it('path 以 http 开头时原样请求，不拼 base', async () => {
    const f = vi.fn(async () => okRes({ ok: true }));
    const api = createApi({ base: './', fetchImpl: f });
    const out = await api.get('http://127.0.0.1:8787/api/quotes');
    expect(out.data).toEqual({ ok: true });
    expect(String(f.mock.calls[0][0])).toBe('http://127.0.0.1:8787/api/quotes');
  });
});

/* ------------------------------------------------------------------ *
 * fetch-json.js：paramsOf 早退 / 无 message 的错误
 * ------------------------------------------------------------------ */
describe('fetch-json：params 优先与错误信息边界', () => {
  it('getJson 传 params 时 paramsOf 直接返回，不解析 query', async () => {
    const f = vi.fn(async () => okRes({ v: 1 }));
    vi.stubGlobal('fetch', f);
    // 生产路径用 fetch-json.js 自己的全局 api（默认 fetchImpl 走全局 fetch）
    const out = await getJson('api/thing', { params: { a: 1 } });
    expect(out).toEqual({ v: 1 });
    expect(String(f.mock.calls[0][0])).toContain('a=1');
  });

  it('getJsonWithStatus 注入路径：错误对象没有 message 时回退到 err 本身', async () => {
    const err = new Error();
    err.message = '';
    const out = await getJsonWithStatus('api/x', {
      fetchImpl: async () => { throw { toString: () => 'plain-object-error' }; },
    });
    expect(out.status).toBe(503);
    expect(out.body.error).toContain('plain-object-error');
  });

  it('getJsonWithStatus 生产路径：上游非 2xx 时把 HTTP 状态码透出', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    vi.stubGlobal('fetch', f);
    const out = await getJsonWithStatus('api/x');
    expect(out.status).toBe(429);
    expect(out.body.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * format.js：attributeStateOf 的单引号闭合
 * ------------------------------------------------------------------ */
describe('html``：单引号属性状态机', () => {
  it('单引号内的撇号正确闭合，未加引号的插值仍被拦下', () => {
    // built = "<a x='y' ="：单引号开 → 闭，命中 attributeStateOf 的 inSingle 分支
    expect(() => html`<a x='y' =${1}>`).toThrow(/不允许未加引号的属性插值/);
  });
});

/* ------------------------------------------------------------------ *
 * query-cache.js：重复订阅与错误描述
 * ------------------------------------------------------------------ */
describe('query-cache：重复订阅与错误文案', () => {
  const makeCache = () => {
    const api = {
      get: vi.fn(async () => ({ data: { ok: true }, status: 200 })),
    };
    return createQueryCache({ api, now: () => 1000 });
  };

  it('同一个 key 订阅两次不再新建 Set（走 has 为 true 的分支）', () => {
    const cache = makeCache();
    const seen = [];
    const off1 = cache.subscribe('k', (s) => seen.push(s));
    const off2 = cache.subscribe('k', (s) => seen.push(s));
    expect(seen).toHaveLength(2);
    off1();
    off2();
  });

  it('刷新失败且错误没有 message 时仍能产出文案', async () => {
    const api = {
      get: vi.fn(async () => { throw { toString: () => 'socket closed' }; }),
    };
    const cache = createQueryCache({ api, now: () => 1000 });
    const snap = await cache.fetchKey('k', { path: 'api/x' });
    expect(snap.refreshStatus).toBe('failed');
    expect(snap.error.message).toContain('socket closed');
  });

  it('business 类型错误没有 message 时用默认文案', () => {
    const text = describeRefresh({
      refreshStatus: 'failed',
      error: { kind: 'business', message: undefined },
      fetchedAt: null, now: 1000,
    });
    expect(text.text).toContain('接口返回失败');
  });
});

/* ------------------------------------------------------------------ *
 * realtime.js：无全局 EventSource、无注入时的缺省侧
 * ------------------------------------------------------------------ */
describe('realtime：EventSource 缺省链', () => {
  it('没有全局 EventSource 也没有注入时保持轮询', () => {
    vi.stubGlobal('EventSource', undefined);
    const rt = createRealtime();
    expect(() => rt.connect()).not.toThrow();
    expect(rt.pollIntervalMs()).toBe(15_000);
    rt.disconnect();
  });
});

/* ------------------------------------------------------------------ *
 * alert-banner.js：缺省依赖链
 * ------------------------------------------------------------------ */
describe('alert-banner：全部走默认注入', () => {
  it('不传 opts 时 bus/document/NotificationImpl 都取默认值', () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('Notification', undefined);
    const off = mountAlertBanner();
    expect(() => off()).not.toThrow();
    vi.unstubAllGlobals();
  });
});

/* ------------------------------------------------------------------ *
 * desktop-bridge.js：可注入项的缺省侧
 * ------------------------------------------------------------------ */
describe('desktop-bridge：注入项两条路径', () => {
  it('isTauriRuntime 显式传 root 且只有 __TAURI__ 时也返回 true', () => {
    expect(db.isTauriRuntime({ __TAURI_INTERNALS__: null, __TAURI__: {} })).toBe(true);
    expect(db.isTauriRuntime({ __TAURI_INTERNALS__: {}, __TAURI__: null })).toBe(true);
  });

  it('updateTrayTicker：显式传 root/document/invoke/isTauri 与全缺省两种形态', () => {
    const q = [{ id: 'gold-intl', name: '国际金', price: 2745.2, changePct: 0.82 }];
    const injected = db.updateTrayTicker(q, ['gold-intl'], {
      root: { __TAURI_INTERNALS__: {} }, document: { title: '' },
      invoke: () => {}, isTauri: true,
    });
    expect(injected).toContain('国际金');
    // 全缺省：document 从全局取、root 从 window 取、isTauri 自己探测
    const defaulted = db.updateTrayTicker(q, ['gold-intl']);
    expect(defaulted).toContain('国际金');
    expect(document.title).toContain('国际金');
  });

  it('togglePipMode：root/force/window/invoke/isTauri 的缺省侧', () => {
    const el = document.createElement('div');
    // el 有 dataset、无 opts.root → win 默认取 window
    expect(db.togglePipMode(el, { force: undefined })).toBe('1');
    expect(db.togglePipMode(el, { force: undefined })).toBe('0');
    // 无 dataset 的 root + 无 window 时也不抛
    expect(db.togglePipMode({}, { root: null, invoke: null, isTauri: false })).toBe('0');
  });

  it('mountDesktopBridge：bus/storage/invoke 全缺省', () => {
    vi.stubGlobal('localStorage', undefined);
    const off = db.mountDesktopBridge();
    expect(() => off()).not.toThrow();
    vi.unstubAllGlobals();
  });
});

/* ------------------------------------------------------------------ *
 * share-card.js：wrap / 模型 / URL 的缺省侧
 * ------------------------------------------------------------------ */
describe('share-card：折行与 URL 的剩余分支', () => {
  const MODEL = { title: 'T', assetName: 'A', price: 1, changePct: 1, facts: [], contrary: '' };

  it('空标题 / 空白事实走 wrap 的空串早退', () => {
    const svg = card.renderShareCardSVG({ ...MODEL, title: '   ', facts: ['   ', null, ''] });
    expect(svg).toContain('viewBox="0 0 1600 900"');
    // wrap('   ') 返回空数组：标题与空白事实都不产生 <text> 行
    expect((svg.match(/data-share-fact/g) ?? []).length).toBe(0);
  });

  it('标题恰好一行（不触发 break）与恰好两行（cur 为空）', () => {
    expect(card.renderShareCardSVG({ ...MODEL, title: '一'.repeat(34) })).not.toContain('…');
    expect(card.renderShareCardSVG({ ...MODEL, title: '一'.repeat(68) })).not.toContain('…');
  });

  it('buildShareCardModel：items 无 name/id、ex.summary 存在', () => {
    const m = card.buildShareCardModel({
      items: [{ to: 9, movePct: 2 }],
      explanation: { summary: '一句话摘要', hypotheses: [] },
    });
    expect(m.facts[0]).toContain('标的');
    expect(m.title).toBe('一句话摘要');
    expect(m.price).toBe(9);
  });

  it('createDownloadShareCard：无全局 document、模型无 snapshotId', () => {
    vi.stubGlobal('document', undefined);
    expect(card.createDownloadShareCard(MODEL)).toBe(null);
    vi.unstubAllGlobals();
    const fakeDoc = {
      createElement: () => {
        const attrs = {};
        return { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] ?? null,
          click: () => {}, remove: () => {} };
      },
      body: { appendChild: () => {} },
    };
    const out = card.createDownloadShareCard({}, {
      document: fakeDoc, createObjectURL: () => 'blob:x', revokeObjectURL: () => {},
      setTimeout: (fn) => fn(),
    });
    expect(out.filename).toBe('tickerwall-exp_snapshot.svg');
  });

  it('isEmbedMode / stripEmbedParam / buildEmbedCode 传 null', () => {
    expect(card.isEmbedMode(null)).toBe(false);
    expect(card.stripEmbedParam(null)).toBe('');
    expect(card.buildEmbedCode(null)).toContain('embed=1');
  });

  it('resetEmbedMode / applyEmbedMode：无 dataset 与无 root 的缺省侧', () => {
    vi.stubGlobal('document', undefined);
    card.resetEmbedMode();
    expect(card.applyEmbedMode(null)).toBe(false);
    vi.unstubAllGlobals();
    card.resetEmbedMode({});
    expect(card.applyEmbedMode({}, '/?embed=1')).toBe(false);
    expect(card.applyEmbedMode(null, '/no-embed')).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * share-card-ui.js：无 document / 关闭 / 非分享按钮
 * ------------------------------------------------------------------ */
describe('share-card-ui：缺省与点击分支', () => {
  it('无全局 document 时返回可调用的解绑函数', () => {
    vi.stubGlobal('document', undefined);
    const off = cardUi.mountShareCard();
    expect(() => off()).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('点背景 / 关闭按钮会移除预览浮层', () => {
    const off = cardUi.mountShareCard();
    document.body.innerHTML = '<button data-action="share-card">生成</button>';
    document.querySelector('[data-action="share-card"]').click();
    expect(document.getElementById(cardUi.SHARE_PREVIEW_ID)).toBeTruthy();
    document.querySelector('[data-share-dismiss]').click();
    expect(document.getElementById(cardUi.SHARE_PREVIEW_ID)).toBe(null);

    document.querySelector('[data-action="share-card"]').click();
    const dlg = document.getElementById(cardUi.SHARE_PREVIEW_ID);
    expect(dlg).toBeTruthy();
    dlg.getBoundingClientRect = () => ({ left: 100, top: 100, right: 400, bottom: 400, width: 300, height: 300 });
    dlg.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 10, clientY: 10 }));
    dlg.dispatchEvent(new window.MouseEvent('pointerup', { clientX: 12, clientY: 12 }));
    expect(document.getElementById(cardUi.SHARE_PREVIEW_ID)).toBe(null);
    off();
  });

  it('点既非关闭也非下载也非分享的区域不做事', () => {
    const off = cardUi.mountShareCard();
    document.body.innerHTML = '<button id="other">别的按钮</button>';
    document.getElementById('other').click();
    expect(document.getElementById(cardUi.SHARE_PREVIEW_ID)).toBe(null);
    off();
  });
});
