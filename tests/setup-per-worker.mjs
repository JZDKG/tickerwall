/* ================================================================== *
 * 每个 worker 一个自己的数据目录
 *
 * 为什么不能只在 vite.config.js 的 test.env 里设：那是**整个 run** 一个值，
 * 并行 worker 会共用同一个 SQLite 文件 —— CI 上表现为 `job-queue` 那条任务
 * 在 drainQueue 里被别的 worker 排的队拖到 5s 超时（本地 4 核没触发）。
 * setupFiles 是每个 worker 各跑一次，于是天然隔离。
 * ================================================================== */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.KANBAN_DATA_DIR = mkdtempSync(join(tmpdir(), 'kanban-test-worker-'));

/**
 * 测试不许等真实网络。
 *
 * 事故（Ubuntu CI）：两条解释用例各跑 5.0s 撞上 5s 超时。本地很快，
 * 因为本机连不出去（ECONNREFUSED 立刻返回）；GitHub runner 有网络，
 * 请求会真的发出去，等 DNS/TLS 慢回来 —— 于是同一份代码本地绿、CI 红。
 *
 * 300ms 足够覆盖本地假服务（localhost 毫秒级），又不会让任何一条用例
 * 因为外网慢而超时。需要更长超时的用例可以自己传 timeoutMs。
 */
process.env.FETCH_TIMEOUT_MS ||= '300';
