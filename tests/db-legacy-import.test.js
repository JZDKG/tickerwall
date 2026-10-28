/* ================================================================== *
 * 旧数据导入台账（方案 E05 / §9.1）
 *
 * 原来的实现只有一个 kv 标记，于是「文件不存在 / 文件坏了 / 导了一半」
 * 在库里长得一模一样。这里钉住四种状态与重试规则。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { closeDb, getDb, kvGet, kvSet, useDatabase } from '../src/server/db/index.js';
import {
  LEGACY_DONE_KEY,
  importLedger,
  pendingImports,
  recordImport,
  runLegacyImport,
} from '../src/server/db/legacy-import.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'legacy-'));
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

const dailyFile = (id, rows) => {
  mkdirSync(path.join(dir, 'daily'), { recursive: true });
  writeFileSync(path.join(dir, 'daily', `${id}.json`), JSON.stringify({ id, source: 'test', rows }));
};
const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({ d: `2026-09-${String(i + 1).padStart(2, '0')}`, c: 100 + i, o: 99 + i, h: 101 + i, l: 98 + i }));

describe('四种状态', () => {
  it('没有旧文件 → 三个来源都记 absent，且写总体完成标记', async () => {
    const out = await runLegacyImport({ dataDir: dir });
    expect(out.skipped).toBe(false);
    expect(out.results.map((r) => `${r.source}=${r.status}`)).toEqual([
      'daily=absent',
      'snapshots=absent',
      'llm-cache=absent',
    ]);
    expect(pendingImports()).toEqual([]);
    expect(kvGet(LEGACY_DONE_KEY)).toBeTruthy();
  });

  it('正常文件 → ok，行数被记录', async () => {
    dailyFile('btc', rows(5));
    writeFileSync(path.join(dir, 'snapshots.jsonl'), `${JSON.stringify({ at: '2026-10-01T00:00:00Z', quotes: [{ id: 'btc', price: 100 }] })}\n`);
    writeFileSync(path.join(dir, 'llm-cache.json'), JSON.stringify({ h1: { tag: 'x' } }));

    const out = await runLegacyImport({ dataDir: dir });
    const by = new Map(out.results.map((r) => [r.source, r]));
    expect(by.get('daily').status).toBe('ok');
    expect(by.get('daily').rows).toBe(5);
    expect(by.get('snapshots').status).toBe('ok');
    expect(by.get('snapshots').rows).toBe(1);
    expect(by.get('llm-cache').status).toBe('ok');
    expect(by.get('llm-cache').rows).toBe(1);
  });

  it('坏文件 → failed，并记下原因；总体完成标记不写', async () => {
    mkdirSync(path.join(dir, 'daily'), { recursive: true });
    writeFileSync(path.join(dir, 'daily', 'broken.json'), '{ not json');
    const out = await runLegacyImport({ dataDir: dir });
    const daily = out.results.find((r) => r.source === 'daily');
    expect(daily.status).toBe('failed');
    expect(daily.error).toContain('broken.json');
    expect(kvGet(LEGACY_DONE_KEY)).toBeNull();
    expect(pendingImports().map((r) => r.source)).toContain('daily');
  });

  it('部分坏 → partial（好的导进去，坏的记下来）', async () => {
    dailyFile('btc', rows(3));
    writeFileSync(path.join(dir, 'daily', 'bad.json'), '{ nope');
    const out = await runLegacyImport({ dataDir: dir });
    const daily = out.results.find((r) => r.source === 'daily');
    expect(daily.status).toBe('partial');
    expect(daily.rows).toBe(3);
    expect(daily.error).toContain('bad.json');
    expect(pendingImports()).toHaveLength(1);
  });

  it('快照全是不完整行 → failed；有一半能读 → partial', async () => {
    writeFileSync(path.join(dir, 'snapshots.jsonl'), '{ half\n{ half\n');
    let out = await runLegacyImport({ dataDir: dir });
    expect(out.results.find((r) => r.source === 'snapshots').status).toBe('failed');

    useDatabase(':memory:');
    writeFileSync(
      path.join(dir, 'snapshots.jsonl'),
      `${JSON.stringify({ at: '2026-10-01T00:00:00Z', quotes: [{ id: 'btc', price: 1 }] })}\n{ half\n`,
    );
    out = await runLegacyImport({ dataDir: dir, force: true });
    const snap = out.results.find((r) => r.source === 'snapshots');
    expect(snap.status).toBe('partial');
    expect(snap.rows).toBe(1);
  });

  it('llm-cache 解析失败单独记 failed，不影响别的来源', async () => {
    writeFileSync(path.join(dir, 'llm-cache.json'), '{oops');
    dailyFile('btc', rows(2));
    const out = await runLegacyImport({ dataDir: dir });
    expect(out.results.find((r) => r.source === 'llm-cache').status).toBe('failed');
    expect(out.results.find((r) => r.source === 'daily').status).toBe('ok');
  });
});

describe('重跑与跳过', () => {
  it('成功后再次运行直接 skipped，不重复导入', async () => {
    dailyFile('btc', rows(2));
    await runLegacyImport({ dataDir: dir });
    const again = await runLegacyImport({ dataDir: dir });
    expect(again.skipped).toBe(true);
  });

  it('有失败项时再次运行会重试，成功后清掉待重试列表', async () => {
    mkdirSync(path.join(dir, 'daily'), { recursive: true });
    writeFileSync(path.join(dir, 'daily', 'bad.json'), '{ nope');
    await runLegacyImport({ dataDir: dir });
    expect(pendingImports()).toHaveLength(1);

    // 修好文件后重跑：这次应当成功并写完成标记
    writeFileSync(path.join(dir, 'daily', 'bad.json'), JSON.stringify({ id: 'btc', source: 'test', rows: rows(2) }));
    const out = await runLegacyImport({ dataDir: dir });
    expect(out.results.find((r) => r.source === 'daily').status).toBe('ok');
    expect(pendingImports()).toEqual([]);
    expect(kvGet(LEGACY_DONE_KEY)).toBeTruthy();
  });

  it('force=true 时忽略完成标记，全部重跑', async () => {
    dailyFile('btc', rows(2));
    await runLegacyImport({ dataDir: dir });
    const out = await runLegacyImport({ dataDir: dir, force: true });
    expect(out.skipped).toBe(false);
    expect(out.results.filter((r) => r.status === 'ok').length).toBeGreaterThanOrEqual(1);
  });

  it('台账里记了文件校验和，便于比对「导的是哪一份」', async () => {
    dailyFile('btc', rows(2));
    await runLegacyImport({ dataDir: dir });
    const row = importLedger().find((r) => r.source === 'daily');
    expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isFinite(Date.parse(row.attempted_at))).toBe(true);
  });
});

describe('台账读写', () => {
  it('recordImport 同来源覆盖，不产生重复行', () => {
    recordImport('x', { status: 'failed', error: 'boom' });
    recordImport('x', { status: 'ok', rows: 3 });
    const rowsX = importLedger().filter((r) => r.source === 'x');
    expect(rowsX).toHaveLength(1);
    expect(rowsX[0].status).toBe('ok');
    expect(rowsX[0].rows).toBe(3);
    expect(rowsX[0].error).toBeNull();
  });

  it('pendingImports 只挑 failed / partial', () => {
    recordImport('a', { status: 'ok' });
    recordImport('b', { status: 'absent' });
    recordImport('c', { status: 'failed', error: 'x' });
    recordImport('d', { status: 'partial', error: 'y' });
    expect(pendingImports().map((r) => r.source)).toEqual(['c', 'd']);
  });

  it('老库只有 kv 标记时视作已完成（兼容上一版）', async () => {
    kvSet(LEGACY_DONE_KEY, JSON.stringify({ at: '2026-01-01T00:00:00Z' }));
    const out = await runLegacyImport({ dataDir: dir });
    expect(out.skipped).toBe(true);
    expect(getDb()).toBeTruthy();
  });
});
