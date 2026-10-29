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
