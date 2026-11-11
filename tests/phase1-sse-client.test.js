// @vitest-environment jsdom
/* ================================================================== *
 * Phase 1 / P1-T3：客户端 EventSource 优先 + 轮询优雅降级
 *
 * 验收：
 *   · 支持 EventSource 时连 /api/stream，收到 quotes 直接更新 store 并 emit bus；
 *   · OPEN 时轮询从 15s 降频到 60s；断开（error/CLOSED）恢复 15s；
 *   · 不支持 EventSource 时保持原轮询，不报错。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** 可控的 EventSource 桩 */
class FakeEventSource {
  static instances = [];
  static OPEN = 1;
  static CLOSED = 2;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = {};
    FakeEventSource.instances.push(this);
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
  open() {
    this.readyState = FakeEventSource.OPEN;
    this.listeners.open?.({});
  }
  emit(type, data) {
    this.listeners[type]?.({ data: JSON.stringify(data) });
  }
  fail() {
    this.readyState = FakeEventSource.CLOSED;
    this.listeners.error?.({});
  }
}

const { createRealtime, POLL_FAST_MS, POLL_SLOW_MS } = await import('../src/client/shared/realtime.js');

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('轮询节奏', () => {
  it('常量：快 15s / 慢 60s', () => {
    expect(POLL_FAST_MS).toBe(15_000);
    expect(POLL_SLOW_MS).toBe(60_000);
  });

  it('SSE OPEN 时用 60s，断开后立刻回到 15s', () => {
    const store = { quotes: null };
    const rt = createRealtime({ store, EventSourceImpl: FakeEventSource, fetchQuotes: async () => ({}) });
    rt.connect();
    expect(rt.pollIntervalMs()).toBe(POLL_FAST_MS);
    const es = FakeEventSource.instances[0];
    es.open();
    expect(rt.pollIntervalMs()).toBe(POLL_SLOW_MS);
    expect(rt.isOpen()).toBe(true);
    es.fail();
    expect(rt.pollIntervalMs()).toBe(POLL_FAST_MS);
    expect(rt.isOpen()).toBe(false);
    rt.disconnect();
  });
});

describe('quotes 事件', () => {
  it('收到 quotes 直接写 store 并通过 bus 广播局部刷新', () => {
    const store = { quotes: null };
    const emitted = [];
    const rt = createRealtime({
      store,
      EventSourceImpl: FakeEventSource,
      bus: { emit: (e, p) => emitted.push([e, p]) },
      fetchQuotes: async () => ({}),
    });
    rt.connect();
    const es = FakeEventSource.instances[0];
    es.open();
    const payload = { quotes: [{ id: 'gold-intl', price: 4050 }], ttlMs: 15000 };
    es.emit('quotes', payload);
    expect(store.quotes).toEqual(payload.quotes);
    expect(emitted.some(([e]) => e === 'quotes')).toBe(true);
    rt.disconnect();
  });

  it('坏 JSON 帧被忽略，不打断连接', () => {
    const store = { quotes: 'keep' };
    const rt = createRealtime({ store, EventSourceImpl: FakeEventSource, fetchQuotes: async () => ({}) });
    rt.connect();
    const es = FakeEventSource.instances[0];
    es.open();
    es.listeners.quotes({ data: '{not json' });
    expect(store.quotes).toBe('keep');
    expect(rt.isOpen()).toBe(true);
    rt.disconnect();
  });

  it('不支持 EventSource 时不连、保持快轮询（优雅降级）', () => {
    const store = { quotes: null };
    const rt = createRealtime({ store, EventSourceImpl: null, fetchQuotes: async () => ({}) });
    expect(() => rt.connect()).not.toThrow();
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(rt.pollIntervalMs()).toBe(POLL_FAST_MS);
    rt.disconnect();
  });

  it('连接路径是 /api/stream', () => {
    const rt = createRealtime({ store: {}, EventSourceImpl: FakeEventSource, fetchQuotes: async () => ({}) });
    rt.connect();
    expect(FakeEventSource.instances[0].url).toBe('/api/stream');
    rt.disconnect();
  });
});
