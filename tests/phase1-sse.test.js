/* ================================================================== *
 * Phase 1 / P1-T3：SSE /api/stream 实时流与前端降级
 *
 * 验收：
 *   · GET /api/stream 返回 text/event-stream + no-cache + keep-alive；
 *   · 建连即发 connected 与最新 quotes 快照，每 25s 一个 heartbeat；
 *   · broadcast('quotes' | 'events' | 'explanation') 推给所有在线客户端；
 *   · 断开后自动清理，不再写；
 *   · 前端 SSE OPEN 时轮询降频到 60s，断开恢复 15s。
 * ================================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createSseHub, SSE_HEARTBEAT_MS } from '../src/server/realtime/sse-hub.js';
import { createApp } from '../src/server/app.js';
import { startCollector } from '../src/server/jobs/collector.js';

/** 记录写入帧的 res 桩（SSE 用 write 而非 end） */
function streamRes() {
  const chunks = [];
  const res = {
    statusCode: 200,
    headers: {},
    chunks,
    closed: false,
    listeners: {},
    writeHead(code, headers = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    write(text) {
      chunks.push(text);
      return true;
    },
    end() {
      this.closed = true;
    },
    on(event, fn) {
      this.listeners[event] = fn;
      return this;
    },
  };
  return res;
}

const frames = (res) => res.chunks.join('');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SSE 广播总线', () => {
  it('建连即写响应头 + connected 事件 + 最新报价快照', () => {
    const hub = createSseHub({ getLatestQuotes: () => ({ quotes: [{ id: 'gold-intl' }] }) });
    const res = streamRes();
    hub.handle({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toContain('no-cache');
    expect(res.headers.connection).toBe('keep-alive');
    expect(frames(res)).toContain('event: connected');
    expect(frames(res)).toContain('event: quotes');
    expect(frames(res)).toContain('gold-intl');
    expect(hub.clientCount()).toBe(1);
  });

  it('没有快照时只发 connected，不发空 quotes', () => {
    const hub = createSseHub({ getLatestQuotes: () => null });
    const res = streamRes();
    hub.handle({ method: 'GET' }, res);
    expect(frames(res)).toContain('event: connected');
    expect(frames(res)).not.toContain('event: quotes');
  });

  it('每 25s 发一次 : heartbeat 保活（SSE_HEARTBEAT_MS = 25000）', () => {
    expect(SSE_HEARTBEAT_MS).toBe(25_000);
    const hub = createSseHub();
    const res = streamRes();
    hub.handle({ method: 'GET' }, res);
    const before = res.chunks.length;
    vi.advanceTimersByTime(25_000);
    expect(res.chunks.length).toBeGreaterThan(before);
    expect(res.chunks.slice(before).join('')).toContain(': heartbeat');
  });

  it('broadcast 把三类事件推给所有在线客户端', () => {
    const hub = createSseHub();
    const a = streamRes();
    const b = streamRes();
    hub.handle({ method: 'GET' }, a);
    hub.handle({ method: 'GET' }, b);
    hub.broadcast('quotes', { quotes: [{ id: 'oil' }], ttlMs: 15_000 });
    hub.broadcast('events', { at: 123, count: 7 });
    hub.broadcast('explanation', { asset: 'btc', windowKey: 'session', snapshotId: 's1' });
    for (const res of [a, b]) {
      const text = frames(res);
      expect(text).toContain('event: quotes');
      expect(text).toContain('"oil"');
      expect(text).toContain('event: events');
      expect(text).toContain('event: explanation');
      expect(text).toContain('"snapshotId":"s1"');
    }
    expect(hub.stats()).toMatchObject({ quotes: 1, events: 1, explanation: 1 });
  });

  it('客户端断开后从在线列表移除，且心跳不再写', () => {
    const hub = createSseHub();
    const res = streamRes();
    hub.handle({ method: 'GET' }, res);
    res.listeners.close();
    expect(hub.clientCount()).toBe(0);
    const before = res.chunks.length;
    vi.advanceTimersByTime(75_000);
    expect(res.chunks.length).toBe(before);
  });

  it('写失败（客户端已断开）时自动摘除，不抛', () => {
    const hub = createSseHub();
    const res = streamRes();
    res.write = () => { throw new Error('socket gone'); };
    expect(() => hub.handle({ method: 'GET' }, res)).not.toThrow();
    expect(hub.clientCount()).toBe(0);
  });
});

describe('GET /api/stream 挂载到应用', () => {
  it('/api/stream 走 SSE 而不是 JSON（不受 405/静态兜底影响）', async () => {
    const hub = createSseHub();
    const app = createApp({ sseHub: hub, ttlMs: 15_000 });
    const res = streamRes();
    await app({ method: 'GET', url: '/api/stream', headers: { host: 'localhost' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(frames(res)).toContain('event: connected');
  });
});

describe('collector 成功后广播', () => {
  it('quotes / events / explanations 任务成功各推一次对应事件', async () => {
    const hub = createSseHub({ getLatestQuotes: () => ({ quotes: [] }) });
    const res = streamRes();
    hub.handle({ method: 'GET' }, res);
    const jobs = [
      { key: 'quotes', run: async () => ({ quotes: [{ id: 'gold-intl' }] }), intervalMs: 1000 },
      { key: 'events', run: async () => ({ items: [], at: 1 }), intervalMs: 1000 },
      { key: 'explanations', run: async () => ({ asset: 'btc', windowKey: 'session', snapshotId: 'snap' }), intervalMs: 1000 },
    ];
    const collector = startCollector({ jobs, everyMs: 1000, sseHub: hub });
    await collector.collector.tick({ force: true });
    const text = frames(res);
    expect(text).toContain('event: quotes');
    expect(text).toContain('event: events');
    expect(text).toContain('event: explanation');
    collector.stop();
  });
});
