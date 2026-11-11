/* ================================================================== *
 * Phase 1 / P1-T3：SSE 广播总线（GET /api/stream）
 *
 * 单进程、内存态的发布订阅：不持久化、不跨进程。这个阶段是单机 Docker
 * 容器，一个进程服务所有连接，所以不需要 Redis 之类的外部总线。
 *
 * 三条护栏：
 *   · 建连立刻发一帧（connected + 最新报价快照），否则代理/浏览器会认为
 *     连接挂起，前端一直等不到第一个字节；
 *   · 每 25s 一个注释帧保活，穿过中间代理的空闲超时；
 *   · 写失败（对端已断）立刻摘除客户端，不让一个死连接拖住每次广播。
 * ================================================================== */

/** 心跳间隔：比常见反向代理 30s 空闲超时略短 */
export const SSE_HEARTBEAT_MS = 25_000;

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
};

/** 帧格式：event + data 两行，结尾空行 */
export function sseFrame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * @param {{ getLatestQuotes?:Function, now?:()=>number, heartbeatMs?:number }} [opts]
 */
export function createSseHub(opts = {}) {
  const clients = new Set();
  const getLatestQuotes = opts.getLatestQuotes ?? (() => null);
  const now = opts.now ?? (() => Date.now());
  const heartbeatMs = opts.heartbeatMs ?? SSE_HEARTBEAT_MS;
  const stats = { quotes: 0, events: 0, explanation: 0, connections: 0 };

  function safeWrite(client, text) {
    try {
      client.res.write(text);
      return true;
    } catch {
      detach(client);
      return false;
    }
  }

  function detach(client) {
    if (!clients.delete(client)) return;
    clearInterval(client.heartbeat);
  }

  /** 向所有在线客户端广播一帧 */
  function broadcast(event, payload) {
    if (stats[event] != null) stats[event] += 1;
    const frame = sseFrame(event, payload);
    for (const client of [...clients]) safeWrite(client, frame);
    return clients.size;
  }

  /**
   * 处理 GET /api/stream。返回 true 表示这个请求已被接管（响应保持打开）。
   * @param {{ method?:string }} req
   * @param {any} res Node ServerResponse
   */
  function handle(req, res) {
    res.writeHead(200, SSE_HEADERS);
    stats.connections += 1;
    const client = { res, heartbeat: null };

    // 先发一帧 connected，把响应头真正推到 socket 上
    if (!safeWrite(client, sseFrame('connected', { at: new Date(now()).toISOString() }))) return true;
    clients.add(client);

    const latest = (() => {
      try {
        return getLatestQuotes();
      } catch {
        return null;
      }
    })();
    if (latest) safeWrite(client, sseFrame('quotes', latest));

    client.heartbeat = setInterval(() => {
      safeWrite(client, ': heartbeat\n\n');
    }, Math.max(1000, heartbeatMs));
    client.heartbeat.unref?.();

    res.on?.('close', () => detach(client));
    return true;
  }

  /** 采集完成后由 jobs/collector.js 调用 */
  function publishJobResult(key, result) {
    if (key === 'quotes') {
      const payload = result?.quotes ? result : getLatestQuotes();
      return broadcast('quotes', payload ?? { at: new Date(now()).toISOString() });
    }
    if (key === 'events') {
      return broadcast('events', {
        at: result?.at ?? result?.generatedAt ?? new Date(now()).toISOString(),
        count: Array.isArray(result?.items) ? result.items.length : (result?.count ?? null),
      });
    }
    if (key === 'explanations' || key === 'explanation-rebuild') {
      return broadcast('explanation', {
        asset: result?.asset ?? null,
        windowKey: result?.windowKey ?? null,
        snapshotId: result?.snapshotId ?? result?.body?.explanation?.id ?? null,
      });
    }
    return 0;
  }

  function close() {
    for (const client of [...clients]) {
      detach(client);
      try {
        client.res.end();
      } catch {
        /* 对端已断 */
      }
    }
  }

  return {
    handle,
    broadcast,
    publishJobResult,
    clientCount: () => clients.size,
    stats: () => ({ ...stats }),
    close,
  };
}
