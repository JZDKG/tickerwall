/* ================================================================== *
 * 测试环境的两条硬约束（每一条都对应一次 Ubuntu 上的红）
 *
 *   1. 数据目录按 worker 隔离 —— 否则并行 worker 抢同一个 SQLite；
 *   2. 网络超时压到 300ms —— 否则 CI 有网络、本机连不出去，
 *      同一份代码本地绿、远端因等 DNS/TLS 超时。
 * ================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('测试环境约束', () => {
  it('每个 worker 有独立的数据目录', () => {
    const setup = readFileSync('tests/setup-per-worker.mjs', 'utf8');
    expect(setup).toContain('KANBAN_DATA_DIR');
    expect(setup).toContain('mkdtempSync');
    const cfg = readFileSync('vite.config.js', 'utf8');
    expect(cfg).toContain('tests/setup-per-worker.mjs');
  });

  it('FETCH_TIMEOUT_MS 在测试里被压到 300ms（不让用例等真实网络）', () => {
    const setup = readFileSync('tests/setup-per-worker.mjs', 'utf8');
    expect(setup).toContain('FETCH_TIMEOUT_MS');
    expect(setup).toMatch(/FETCH_TIMEOUT_MS\s*\|\|=\s*'300'/);
  });
});
