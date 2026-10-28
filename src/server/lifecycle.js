/* ================================================================== *
 * 进程生命周期：启动排序与优雅退出（方案 E08 / §9.3）
 *
 * 两个职责：
 *
 *   1. **启动顺序**（不能换）：恢复中断任务 → 载入落盘状态 → 补种 → 监听。
 *      补种会打外网，放在监听后会让首屏等它；放在监听前又要能被打断，
 *      所以它自己看 DISABLE_BACKGROUND（见 db/quotes-storage.js）。
 *
 *   2. **退出**：SIGTERM/SIGINT 时 停止调度 → 不再接新连接 → 限时排空 →
 *      flush（分时/注脚 + WAL）→ closeDb → 退出。
 *      不做这一步的后果很具体：容器被 kill 时最后 2 秒的走势与队列状态
 *      直接丢，而日志里什么都没有。
 *
 * 排空有上限：长连接不会让进程永远不退，到点强制关闭（并记一条 warn）。
 * ================================================================== */

import { closeDb, flush } from './db/index.js';
import { logger } from './observability/log.js';

/** 退出时最多等多久（毫秒） */
export const DEFAULT_DRAIN_MS = 5_000;

/**
 * 安装信号处理。返回 { shutdown } 便于测试直接调用。
 *
 * @param {object} opts
 * @param {import('node:http').Server} opts.server
 * @param {() => void} [opts.stopBackground] 停止调度器
 * @param {number} [opts.drainMs]
 * @param {(code:number)=>void} [opts.exit] 测试注入
 * @param {object} [opts.log]
 */
export function installShutdown({ server, stopBackground, drainMs = DEFAULT_DRAIN_MS, exit = (code) => process.exit(code), log = logger }) {
  let shuttingDown = false;

  async function shutdown(reason = 'SIGTERM') {
    if (shuttingDown) return { alreadyRunning: true };
    shuttingDown = true;
    const startedAt = Date.now();
    log.info('process.shutdown.start', { reason });

    // 1) 停止调度：不再产生新的采集与落盘
    try {
      stopBackground?.();
    } catch (err) {
      log.warn('process.shutdown.stopBackgroundFailed', { error: String(err?.message ?? err) });
    }

    // 2) 不再接新请求，并限时等待现有请求结束
    const closed = new Promise((resolve) => {
      if (!server?.listening) return resolve('not-listening');
      server.close(() => resolve('closed'));
      // 到点就放弃等待（长连接不该让进程永远不退）
      setTimeout(() => resolve('timeout'), drainMs).unref?.();
    });
    const closeResult = await closed;

    // 3) 排空缓冲并关库：分时/注脚在这里才真正落盘
    let flushResult = null;
    try {
      flushResult = await flush();
    } catch (err) {
      log.warn('process.shutdown.flushFailed', { error: String(err?.message ?? err) });
    }
    try {
      closeDb();
    } catch {
      /* 已关闭 */
    }

    log.info('process.shutdown.done', {
      reason,
      closeResult,
      durationMs: Date.now() - startedAt,
      flushHooks: flushResult?.hooks ?? 0,
      flushErrors: flushResult?.hookErrors?.length ?? 0,
    });
    // 排空超时说明有连接没放手，退出码仍给 0：进程管理器不该因为「有人开着页面」重启
    exit(0);
    return { closeResult, flushResult };
  }

  const onSignal = (signal) => {
    void shutdown(signal);
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);

  return {
    shutdown,
    get shuttingDown() {
      return shuttingDown;
    },
    remove() {
      process.removeListener('SIGTERM', onSignal);
      process.removeListener('SIGINT', onSignal);
    },
  };
}
