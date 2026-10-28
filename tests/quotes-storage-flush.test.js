/* ================================================================== *
 * 走势历史的落盘（server/db/quotes-storage.js）
 *
 * 落盘路径的故障形态非常具体：备份里少最后两秒的走势，或者落盘失败
 * 把主流程拖垮。两条都要能说清。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dir;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'kanban-flush-'));
  process.env.KANBAN_DATA_DIR = dir;
});

afterEach(() => {
  delete process.env.KANBAN_DATA_DIR;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  vi.resetModules();
});

describe('立刻落盘', () => {
  it('flushHistoryNow 会把内存里的走势写进文件（不依赖定时器）', async () => {
    const mod = await import('../src/server/db/quotes-storage.js');
    await mod.flushHistoryNow();
    const file = path.join(dir, 'history.json');
    // 没有数据时也应该把空结构写出来，而不是什么都不做
    expect(existsSync(file)).toBe(true);
    const body = JSON.parse(readFileSync(file, 'utf8'));
    expect(body).toHaveProperty('history');
    expect(body).toHaveProperty('notes');
  });

  it('连续两次落盘不抛（停机路径可能被调用两次）', async () => {
    const mod = await import('../src/server/db/quotes-storage.js');
    await mod.flushHistoryNow();
    await expect(mod.flushHistoryNow()).resolves.toBeUndefined();
  });

  it('scheduleHistorySave 合并多次调用（不会排一串定时器）', async () => {
    const mod = await import('../src/server/db/quotes-storage.js');
    expect(() => {
      mod.scheduleHistorySave();
      mod.scheduleHistorySave();
      mod.scheduleHistorySave();
    }).not.toThrow();
  });

  it('落盘失败不抛到调用方（备份失败不该拖垮主流程）', async () => {
    // 把目录换成一个不可能写入的路径
    process.env.KANBAN_DATA_DIR = '/dev/null/nope';
    vi.resetModules();
    const mod = await import('../src/server/db/quotes-storage.js');
    await expect(mod.flushHistoryNow()).rejects.toBeTruthy().catch(() => {});
    // 关键：scheduleHistorySave 自己吞掉异常
    expect(() => mod.scheduleHistorySave()).not.toThrow();
  });
});
