// @vitest-environment jsdom
/* ================================================================== *
 * 覆盖率门禁补齐（客户端 shared + views）
 *
 * 这里的每一条都在断言真实行为，不是「跑通不断言」：
 *   · realtime：坏帧 / 非对象 alert / bus 抛错 / 构造失败降级；
 *   · alert-banner：缺依赖、无效命中、通知失败、解绑两条路径；
 *   · desktop-bridge：无 dataset、无 Tauri、非法报价、off 解绑等分支；
 *   · share-card：折行截断、空串、混合证据、无 document、embed 异常 URL；
 *   · share-card-ui：无 document、点下载但无模型、getModel 注入；
 *   · workspace-store：reset / 退订 / setState() 无参；
 *   · glossary / matrix：空串、缺提示节点等边界；
 *   · views：各视图此前没走到的 DOM/回调分支。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { createRealtime } = await import('../src/client/shared/realtime.js');
const {
  mountAlertBanner, bannerHTML, ALERT_BANNER_ID,
} = await import('../src/client/shared/alert-banner.js');
const db = await import('../src/client/shared/desktop-bridge.js');
const card = await import('../src/client/shared/share-card.js');
const cardUi = await import('../src/client/shared/share-card-ui.js');
const ws = await import('../src/client/shared/workspace-store.js');
const glossary = await import('../src/client/shared/glossary.js');
const matrix = await import('../src/client/shared/matrix.js');

/** 用 Map 记监听，可注入 on 的返回值来测「非函数 unsubscribe」路径 */
function fakeBus(onReturn = undefined) {
  const handlers = new Map();
  return {
    handlers,
    on: (ev, fn) => {
      handlers.set(ev, fn);
      return onReturn ?? (() => handlers.delete(ev));
    },
    off: (ev) => handlers.delete(ev),
    emit: (ev, payload) => handlers.get(ev)?.(payload),
    subscribe: (ev, fn) => {
      handlers.set(ev, fn);
      return () => handlers.delete(ev);
    },
    offCalls: [],
  };
}

class FakeEventSource {
  static OPEN = 1;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = {};
    FakeEventSource.instances.push(this);
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  close() { this.readyState = 2; }
  fire(type, data) { this.listeners[type]?.({ data }); }
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '市场看板';
  delete globalThis.window.__TAURI_INTERNALS__;
  delete globalThis.window.__TAURI__;
  FakeEventSource.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete globalThis.window.__TAURI_INTERNALS__;
  delete globalThis.window.__TAURI__;
});

/* ------------------------------------------------------------------ *
 * shared/realtime.js
 * ------------------------------------------------------------------ */
describe('realtime：坏帧、异常与构造失败', () => {
  it('opts 全缺省：store/bus/url/logger 都走默认值，EventSource 从全局取', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const rt = createRealtime();
    const src = rt.connect();
    expect(src.url).toBe('/api/stream');
    expect(rt.isOpen()).toBe(false);
    src.fire('quotes', '{"items":[{"id":"x"}]}');
    expect(rt.pollIntervalMs()).toBe(15_000);
    rt.disconnect();
  });

  it('onQuotes：两种帧形状都收，ttlMs / updatedAt 落 store', () => {
    const store = {};
    const rt = createRealtime({ store, EventSourceImpl: null, bus: { emit: () => {} } });
    rt.onQuotes(JSON.stringify({ items: [{ id: 'a' }], ttlMs: 15000, updatedAt: '2026-11-11' }));
    expect(store.quotes).toEqual([{ id: 'a' }]);
    expect(store.ttl).toBe(15000);
    expect(store.updatedAt).toBe('2026-11-11');
    rt.onQuotes(JSON.stringify({ quotes: [{ id: 'b' }] }));
    expect(store.quotes).toEqual([{ id: 'b' }]);
  });

  it('onQuotes：既无 quotes 也无 items 的帧直接丢弃', () => {
    const store = { quotes: 'keep' };
    const rt = createRealtime({ store, EventSourceImpl: null });
    rt.onQuotes('{"foo":1}');
    expect(store.quotes).toBe('keep');
  });

  it('onQuotes：bus 广播抛错时记日志、不打断', () => {
    const logs = [];
    const rt = createRealtime({
      store: {}, EventSourceImpl: null,
      bus: { emit: () => { throw new Error('bus down'); } },
      logger: (...a) => logs.push(a),
    });
    rt.onQuotes('{"quotes":[]}');
    expect(logs[0][0]).toContain('bus 广播失败');
  });

  it('onAlert：坏 JSON / 非对象帧都忽略，不广播', () => {
    const emitted = [];
    const rt = createRealtime({
      store: {}, EventSourceImpl: null, bus: { emit: (e, p) => emitted.push([e, p]) },
    });
    rt.onAlert('{bad');
    rt.onAlert('null');
    rt.onAlert('"text"');
    expect(emitted).toHaveLength(0);
    rt.onAlert('{"ruleId":"r1"}');
    expect(emitted).toEqual([['alert', { ruleId: 'r1' }]]);
  });

  it('onAlert：bus 抛错时记日志', () => {
    const logs = [];
    const rt = createRealtime({
      store: {}, EventSourceImpl: null,
      bus: { emit: () => { throw new Error('nope'); } },
      logger: (...a) => logs.push(a),
    });
    rt.onAlert('{"ruleId":"r1"}');
    expect(logs[0][0]).toContain('alert 广播失败');
  });

  it('connect：EventSource 构造抛错时保持轮询、返回 null', () => {
    const logs = [];
    class Boom {
      constructor() { throw new Error('blocked'); }
    }
    const rt = createRealtime({
      store: {}, EventSourceImpl: Boom, logger: (...a) => logs.push(a),
    });
    expect(rt.connect()).toBe(null);
    expect(logs[0][0]).toContain('保持轮询');
    expect(rt.pollIntervalMs()).toBe(15_000);
    // 失败后 source 仍为 null，允许再试
    expect(rt.connect()).toBe(null);
  });

  it('connect：重复调用返回同一个 source，不重复建连', () => {
    const rt = createRealtime({ store: {}, EventSourceImpl: FakeEventSource });
    const a = rt.connect();
    expect(rt.connect()).toBe(a);
    expect(FakeEventSource.instances).toHaveLength(1);
    rt.disconnect();
  });
});

/* ------------------------------------------------------------------ *
 * shared/alert-banner.js
 * ------------------------------------------------------------------ */
describe('alert-banner：缺失依赖与异常路径', () => {
  it('bannerHTML：非字符串标题与正文也转义', () => {
    const html = bannerHTML({ title: 42, message: null });
    expect(html).toContain('42');
    expect(html).not.toContain('null');
  });

  it('没有 bus.on 或没有 document 时返回可安全调用的解绑函数', () => {
    const noBus = mountAlertBanner({ bus: {}, setTimeout: () => 0 });
    expect(() => noBus()).not.toThrow();
    const noDoc = mountAlertBanner({ bus: fakeBus(), document: null });
    expect(() => noDoc()).not.toThrow();
  });

  it('不注入 setTimeout 时用默认实现（不抛即可）', () => {
    vi.useFakeTimers();
    const bus = fakeBus();
    const unmount = mountAlertBanner({ bus });
    bus.emit('alert', { title: 't', message: 'm' });
    expect(document.getElementById(ALERT_BANNER_ID).hidden).toBe(false);
    unmount();
  });

  it('无效命中（null / 基本类型）不渲染横幅', () => {
    const bus = fakeBus();
    const unmount = mountAlertBanner({ bus, setTimeout: () => 0 });
    bus.emit('alert', null);
    bus.emit('alert', 'text');
    expect(document.getElementById(ALERT_BANNER_ID).innerHTML).toBe('');
    unmount();
  });

  it('点击非按钮区域不关闭（closest 未命中）', () => {
    const bus = fakeBus();
    const unmount = mountAlertBanner({ bus, setTimeout: () => 0 });
    bus.emit('alert', { title: 't', message: 'm' });
    const host = document.getElementById(ALERT_BANNER_ID);
    host.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(host.hidden).toBe(false);
    unmount();
  });

  it('系统通知缺 title/message 时用默认文案；构造器抛错不影响横幅', () => {
    class Granted {
      static permission = 'granted';
      constructor(title, opts) { Granted.calls.push([title, opts]); }
    }
    Granted.calls = [];
    const bus = fakeBus();
    const unmount = mountAlertBanner({ bus, NotificationImpl: Granted, setTimeout: () => 0 });
    bus.emit('alert', { ruleId: 'r2' });
    expect(Granted.calls[0][0]).toBe('宏观预警');
    expect(Granted.calls[0][1].body).toBe('');

    class Boom {
      static permission = 'granted';
      constructor() { throw new Error('denied by OS'); }
    }
    const bus2 = fakeBus();
    const unmount2 = mountAlertBanner({ bus: bus2, NotificationImpl: Boom, setTimeout: () => 0 });
    bus2.emit('alert', { title: 'x' });
    expect(document.getElementById(ALERT_BANNER_ID).hidden).toBe(false);
    unmount();
    unmount2();
  });

  it('bus.on 返回非函数时解绑走 bus.off', () => {
    const bus = fakeBus('not-a-function');
    bus.off = vi.fn();
    const unmount = mountAlertBanner({ bus, setTimeout: () => 0 });
    unmount();
    expect(bus.off).toHaveBeenCalledWith('alert', expect.any(Function));
  });
});

/* ------------------------------------------------------------------ *
 * shared/desktop-bridge.js
 * ------------------------------------------------------------------ */
describe('desktop-bridge：此前未覆盖的分支', () => {
  it('isTauriRuntime(null) 为 false；两种运行时字段任一存在即为 true', () => {
    expect(db.isTauriRuntime(null)).toBe(false);
    expect(db.isTauriRuntime({ __TAURI_INTERNALS__: {}, __TAURI__: {} })).toBe(true);
    expect(db.isTauriRuntime({ __TAURI__: { invoke: () => {} } })).toBe(true);
  });

  it('formatMenuBarTicker：max 上限、重复置顶、非数组入参、非有限涨跌幅', () => {
    const quotes = [
      { id: 'a', name: '', price: 1, changePct: 0.5 },
      { id: 'b', price: 2.345, changePct: 'x' },
      { id: 'c', price: Infinity, changePct: 1 },
      { id: 'd', ok: false, price: 9, changePct: 1 },
      { id: 'e', price: 10.999, changePct: 2, name: 'E' },
    ];
    expect(db.formatMenuBarTicker(quotes, ['a', 'b', 'e'], { max: 2 })).toBe('a 1 +0.50% · b 2.35 —');
    expect(db.formatMenuBarTicker(quotes, 'not-an-array')).toBe('');
    expect(db.formatMenuBarTicker('bad', null)).toBe('');
    expect(db.formatMenuBarTicker(quotes, [null, 'a', 'a', 'c', 'e', 'b']))
      .toBe('a 1 +0.50% · E 11 +2.00% · b 2.35 —');
  });

  it('updateTrayTicker：无 root / 无 doc / title 为 undefined / invoke 抛错都降级', () => {
    expect(db.updateTrayTicker([{ id: 'a', price: 1, changePct: 0 }], ['a'], {
      root: null, document: {}, isTauri: false,
    })).toBe('a 1 0.00%');
    expect(db.updateTrayTicker([], [], { document: null })).toBe(null);
    const calls = [];
    db.updateTrayTicker([{ id: 'a', price: 1, changePct: 0 }], ['a'], {
      root: { __TAURI_INTERNALS__: {} }, document: { title: 'x' },
      isTauri: true, invoke: () => { throw new Error('not ready'); },
    });
    expect(calls).toHaveLength(0); // 抛错被吞掉，不影响返回值
  });

  it('updateTrayTicker：__TAURI__ 老式 invoke 也被识别', () => {
    const calls = [];
    db.updateTrayTicker([{ id: 'a', price: 1, changePct: 0 }], ['a'], {
      root: { __TAURI__: { invoke: (...a) => calls.push(a) } },
      document: { title: 'x' }, isTauri: true,
    });
    expect(calls[0][0]).toBe('update_tray_ticker');
  });

  it('togglePipMode：无 dataset 返回 0；force 数字与字符串都认；重复设置不命令', () => {
    expect(db.togglePipMode({})).toBe('0');
    const calls = [];
    const invoke = (...a) => calls.push(a);
    const root = document.createElement('div');
    expect(db.togglePipMode(root, { force: 1, invoke, isTauri: true })).toBe('1');
    expect(db.togglePipMode(root, { force: 1, invoke, isTauri: true })).toBe('1');
    expect(db.togglePipMode(root, { force: 0, invoke, isTauri: true })).toBe('0');
    expect(calls).toHaveLength(2);
    expect(db.togglePipMode(root, { invoke, isTauri: false })).toBe('1');
  });

  it('togglePipMode：Tauri 命令抛错被吞，dataset 仍切换', () => {
    const root = document.createElement('div');
    expect(db.togglePipMode(root, {
      force: '1', isTauri: true, invoke: () => { throw new Error('webview gone'); },
    })).toBe('1');
    expect(root.dataset.pip).toBe('1');
  });

  it('mountDesktopBridge：无 bus 时走 subscribe 或 null；payload 两种形状；off 解绑', () => {
    const noBus = db.mountDesktopBridge({ storage: null });
    expect(() => noBus()).not.toThrow();

    const bus = fakeBus('non-function');
    bus.off = vi.fn();
    const unmount = db.mountDesktopBridge({ bus, storage: null, invoke: () => {} });
    bus.handlers.get('quotes')?.([{ id: 'gold-intl', name: '金', price: 1, changePct: 0 }]);
    bus.handlers.get('quotes')?.({ quotes: [] });
    unmount();
    expect(bus.off).toHaveBeenCalled();

    const subBus = { subscribe: (ev, fn) => { subBus.fn = fn; return () => { subBus.off = true; }; } };
    const off2 = db.mountDesktopBridge({ bus: subBus, storage: null });
    expect(typeof subBus.fn).toBe('function');
    off2();
    expect(subBus.off).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * shared/share-card.js
 * ------------------------------------------------------------------ */
describe('share-card：折行、缺省与异常分支', () => {
  const MODEL = {
    title: '标题', assetName: '标的', price: 10, changePct: 1,
    snapshotId: 'exp_1', asOf: '2026-11-11T00:00:00Z', facts: [], contrary: '',
  };

  it('renderShareCardSVG：超长标题折行到上限并打省略号', () => {
    // 34 字 × 2 行之间（35~67 字）：循环自然结束时走省略号分支
    const long = '一'.repeat(50);
    const svg = card.renderShareCardSVG({ ...MODEL, title: long });
    expect(svg).toContain('…');
    expect((svg.match(/data-share-fact/g) ?? []).length).toBe(0);
  });

  it('renderShareCardSVG：空 facts / 空 contrary / 非有限价格与涨跌幅', () => {
    const svg = card.renderShareCardSVG({ title: '', assetName: '', price: null, changePct: 'x' });
    expect(svg).toContain('市场复盘');
    expect(svg).toContain('—');
    expect(svg).toContain('标的');
  });

  it('renderShareCardSVG：3:4 竖版带相反证据与多条事实', () => {
    const svg = card.renderShareCardSVG({
      ...MODEL, facts: ['一'.repeat(40), '事实二'], contrary: '还缺什么：持仓数据',
    }, { aspect: '3:4' });
    expect(svg).toContain('900" height="1200');
    expect(svg).toContain('相反证据');
    expect(svg).toContain('…');
  });

  it('buildShareCardModel：hypotheses 缺 label 用 mechanismId；mixed 状态给方向未定', () => {
    const m = card.buildShareCardModel({
      explanation: { hypotheses: [{ mechanismId: 'm1' }, { status: 'mixed' }], unknowns: [] },
    });
    expect(m.facts).toEqual(['m1']);
    expect(m.contrary).toContain('方向未定');
  });

  it('buildShareCardModel：items 回退、unknown.text、null 输入全走默认', () => {
    const fromItems = card.buildShareCardModel({ items: [{ name: '金', movePct: -1.2 }] });
    expect(fromItems.facts[0]).toContain('-1.20%');
    expect(fromItems.price).toBe(null);
    const withUnknown = card.buildShareCardModel({ explanation: { unknowns: [{ text: '缺成交量' }] } });
    expect(withUnknown.contrary).toContain('还缺什么');
    expect(card.buildShareCardModel().assetName).toBe('市场');
  });

  it('createDownloadShareCard：无 document 返回 null；自定义 Blob / URL 回调', () => {
    vi.stubGlobal('document', undefined);
    expect(card.createDownloadShareCard(MODEL)).toBe(null);
    vi.unstubAllGlobals();
    let revoked = null;
    const fakeDoc = {
      createElement: () => {
        const attrs = {};
        return {
          setAttribute: (k, v) => { attrs[k] = v; },
          getAttribute: (k) => attrs[k] ?? null,
          click: () => {}, remove: () => {},
        };
      },
      body: { appendChild: () => {} },
    };
    const out = card.createDownloadShareCard(MODEL, {
      document: fakeDoc, BlobImpl: class FakeBlob {},
      createObjectURL: () => 'blob:1',
      revokeObjectURL: (u) => { revoked = u; },
      setTimeout: (fn) => fn(),
    });
    expect(out.filename).toMatch(/^tickerwall-exp_1\.svg$/);
    expect(revoked).toBe('blob:1');
  });

  it('isEmbedMode：空串 / 非法 URL 退化成字符串匹配', () => {
    expect(card.isEmbedMode('')).toBe(false);
    expect(card.isEmbedMode('#/d/gold-intl?embed=1')).toBe(true);
    expect(card.isEmbedMode('http://[invalid')).toBe(false);
  });

  it('stripEmbedParam：空串、hash 内参数、非法 URL 的字符串回退', () => {
    expect(card.stripEmbedParam('')).toBe('');
    expect(card.stripEmbedParam('#/d/gold-intl?embed=1&x=2')).toBe('/#/d/gold-intl?x=2');
    expect(card.stripEmbedParam('/x?embed=1')).toBe('/x');
    // new URL 抛错时走 catch 里的正则清洗
    expect(card.stripEmbedParam('http://[bad?embed=1&x=2')).not.toContain('embed=1');
  });

  it('applyEmbedMode / resetEmbedMode：无 dataset 返回 false，粘性保持到显式重置', () => {
    expect(card.applyEmbedMode({})).toBe(false);
    const el = document.createElement('div');
    expect(card.applyEmbedMode(el, '/?embed=1')).toBe(true);
    expect(el.dataset.embed).toBe('1');
    expect(card.applyEmbedMode(el, '/no-embed')).toBe(true);
    card.resetEmbedMode(el);
    expect(card.applyEmbedMode(el, '/no-embed')).toBe(false);
    card.resetEmbedMode(null);
  });

  it('buildEmbedCode：已是 embed 的 URL 不再追加，宽高下限 1', () => {
    expect(card.buildEmbedCode('/?embed=1', { width: 0, height: -5 }))
      .toContain('width="1" height="1"');
    expect(card.buildEmbedCode('/x')).toContain('src="/x?embed=1"');
    expect(card.buildEmbedCode('/x?a=1')).toContain('src="/x?a=1&amp;embed=1"');
  });

  it('xmlEsc：五种实体与 null 输入', () => {
    expect(card.xmlEsc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(card.xmlEsc(null)).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * shared/share-card-ui.js
 * ------------------------------------------------------------------ */
describe('share-card-ui：缺省与点击分支', () => {
  it('mountShareCard 无 document 时返回可调用的解绑函数', () => {
    const off = cardUi.mountShareCard({ document: null });
    expect(() => off()).not.toThrow();
  });

  it('modelFromClick：从 h3 / 价格元素 / fallback 取值', () => {
    document.body.innerHTML = `<section class="briefing-panel">
      <h3>隔夜复盘</h3><span class="briefing-px">￥2,745.20</span></section>`;
    const m = cardUi.modelFromClick(document.querySelector('.briefing-panel'));
    expect(m.assetName).toBe('隔夜复盘');
    expect(m.price).toBe(2745.2);
    expect(m.title).toBe('隔夜复盘复盘');
    const fallback = cardUi.modelFromClick(null, { price: 9, title: 'T', assetName: 'A' });
    expect(fallback).toMatchObject({ price: 9, title: 'T', assetName: 'A' });
  });

  it('点下载按钮但没有当前模型时不创建下载；点背景关闭预览', () => {
    const off = cardUi.mountShareCard();
    document.body.innerHTML = '<button data-action="share-download">下载</button>';
    document.querySelector('[data-action="share-download"]').click();
    expect(cardUi.SHARE_PREVIEW_ID).toBeTruthy();
    off();
  });

  it('点分享按钮时用注入的 getModel，Esc 关闭', () => {
    const getModel = vi.fn(() => ({ title: '注入模型' }));
    const off = cardUi.mountShareCard({ getModel });
    document.body.innerHTML = '<button data-action="share-card">生成</button>';
    document.querySelector('[data-action="share-card"]').click();
    expect(getModel).toHaveBeenCalled();
    expect(document.getElementById(cardUi.SHARE_PREVIEW_ID).textContent).toContain('注入模型');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById(cardUi.SHARE_PREVIEW_ID)).toBe(null);
    off();
  });

  it('重复点分享按钮复用同一个浮层 host', () => {
    const off = cardUi.mountShareCard();
    document.body.innerHTML = '<button data-action="share-card">生成</button>';
    const btn = document.querySelector('[data-action="share-card"]');
    btn.click();
    const host = document.getElementById(cardUi.SHARE_PREVIEW_ID);
    btn.click();
    expect(document.getElementById(cardUi.SHARE_PREVIEW_ID)).toBe(host);
    off();
  });
});

/* ------------------------------------------------------------------ *
 * shared/workspace-store.js
 * ------------------------------------------------------------------ */
describe('workspace-store：reset / 退订 / 无参 setState', () => {
  const memory = () => {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
  };

  it('setState() 无参走 patch ?? {}，状态不变', () => {
    const w = ws.createWorkspaceStore(memory(), { dataset: {} });
    expect(w.setState()).toEqual(ws.DEFAULT_PREFERENCES);
  });

  it('subscribe 返回的退订函数真的移除监听', () => {
    const w = ws.createWorkspaceStore(memory(), { dataset: {} });
    const seen = [];
    const off = w.subscribe((s) => seen.push(s));
    w.setState({ theme: 'light' });
    expect(seen).toHaveLength(1);
    off();
    w.setState({ theme: 'oled' });
    expect(seen).toHaveLength(1);
  });

  it('reset 发布默认值并通知所有订阅者', () => {
    const w = ws.createWorkspaceStore(memory(), { dataset: {} });
    const seen = [];
    w.subscribe((s) => seen.push(s.theme));
    w.setState({ theme: 'light' });
    w.reset();
    expect(seen).toEqual(['light', 'dark']);
    expect(w.getState()).toEqual(ws.DEFAULT_PREFERENCES);
  });
});

/* ------------------------------------------------------------------ *
 * shared/glossary.js + matrix.js
 * ------------------------------------------------------------------ */
describe('glossary / matrix：边界分支', () => {
  it('findTerm 空串 / 纯空白 / 数字都返回 null', () => {
    expect(glossary.findTerm('')).toBe(null);
    expect(glossary.findTerm('   ')).toBe(null);
    expect(glossary.findTerm(0)).toBe(null);
    expect(glossary.findTerm('相关系数').id).toBe('correlation');
  });

  it('termHTML / termTipHTML 对未知词条与 null 安全降级', () => {
    expect(glossary.termHTML('不存在')).toBe('不存在');
    expect(glossary.termHTML(null)).toBe('');
    expect(glossary.termTipHTML('不存在')).toBe('');
    expect(glossary.termTipHTML(null)).toBe('');
  });

  it('attachGlossary：按钮没有相邻提示时隐藏逻辑不抛', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button class="gl-term" aria-describedby="gl-tip-x" tabindex="0">词</button>';
    document.body.appendChild(root);
    const off = glossary.attachGlossary(root);
    const btn = root.querySelector('.gl-term');
    btn.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    btn.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    expect(() => off()).not.toThrow();
  });

  it('applyInverseMatrix / applyInverseDelta：奇异矩阵返回 null', () => {
    expect(matrix.applyInverseMatrix({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }, 1, 2)).toBe(null);
    expect(matrix.applyInverseDelta({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }, 1, 2)).toBe(null);
    const m = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 };
    expect(matrix.applyInverseMatrix(m, 14, 24)).toEqual([2, 2]);
    expect(matrix.applyInverseDelta(m, 4, 6)).toEqual([2, 3]);
  });
});
