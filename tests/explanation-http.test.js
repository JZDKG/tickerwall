/* ================================================================== *
 * 解释接口的进程级集成测试
 *
 * 静态断言证明不了「202 / 200 / 400 / 404 / 503 到底谁会出现」，所以这里
 * 真起一个进程、真发请求。
 *
 * 为了不依赖外网，先用 writeDailyCache 往临时库里写好目标资产与驱动的
 * 日线（8 小时内算新鲜，fetchMacroSeries 不会去打上游；FRED 指标 1 小时内
 * 也算新鲜）。这样这条用例在断网环境下同样成立。
 * ================================================================== */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, writeDailyCache, closeDb } from '../src/server/db/index.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let child;
let base;
let dataDir;
let dbFile;

function waitForListen(proc, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`启动超时：\n${buf}`)), timeoutMs);
    const onData = (d) => {
      buf += d.toString();
      const m = /^LISTENING (\d+)$/m.exec(buf);
      if (m) {
        clearTimeout(timer);
        proc.stdout.off('data', onData);
        proc.stderr.off('data', onData);
        proc.off('exit', onExit);
        resolve({ host: '127.0.0.1', port: Number(m[1]) });
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    const onExit = (code) => {
      clearTimeout(timer);
      reject(new Error(`子进程提前退出 ${code}：\n${buf}`));
    };
    proc.on('exit', onExit);
  });
}

/** 造一段截止到今天的日线（价格口径为正，利率允许负） */
function bars(n, from, to) {
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const step = (to - from) / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(today - (n - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { date, open: null, close: Number((from + step * i).toFixed(6)), high: null, low: null, volume: null };
  });
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'kanban-explain-'));
  dbFile = path.join(dataDir, 'kanban.db');

  // 先把缓存写好：目标资产 + 四个驱动 + 两个 FRED 利率指标
  const db = openDatabase(dbFile);
  const prev = process.env.KANBAN_DB;
  process.env.KANBAN_DB = dbFile;
  try {
    // openDatabase 返回的连接与 writeDailyCache 里的单例不同，这里直接用单例写
    process.env.KANBAN_DB = dbFile;
    const { getDb } = await import('../src/server/db/index.js');
    expect(getDb()).toBeTruthy();
    await writeDailyCache('gold-intl', 'test', bars(40, 4000, 3960));
    await writeDailyCache('dxy', 'test', bars(40, 104, 104.4));
    await writeDailyCache('us10y', 'test', bars(40, 4.2, 4.34));
    await writeDailyCache('oil', 'test', bars(40, 70, 70.6));
    await writeDailyCache('vix', 'test', bars(40, 16, 16.4));
    // 实际收益率跨零且为负也要能写进去（signed 值域）
    await writeDailyCache('dfii10', 'test', bars(40, -0.42, -0.10), { valueDomain: 'signed' });
    await writeDailyCache('t10yie', 'test', bars(40, 2.2, 2.26));
  } finally {
    closeDb();
    if (prev == null) delete process.env.KANBAN_DB;
    else process.env.KANBAN_DB = prev;
    try {
      db.close();
    } catch {
      /* 已关闭 */
    }
  }

  child = spawn(process.execPath, ['server.mjs'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      KANBAN_DATA_DIR: dataDir,
      KANBAN_DB: dbFile,
      LLM_CONFIG_SOURCE: 'env',
      // 集成测试不跑后台采集：请求路径本身就能建快照
      DISABLE_BACKGROUND: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { host, port } = await waitForListen(child);
  base = `http://${host}:${port}`;
}, 40000);

afterAll(async () => {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    await new Promise((r) => {
      const t = setTimeout(r, 3000);
      child.on('exit', () => {
        clearTimeout(t);
        r();
      });
    });
  }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/explanations', () => {
  it('黄金 + session → 200，返回不可变快照与读取元数据', async () => {
    const res = await fetch(`${base}/api/explanations?asset=gold-intl&window=session`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.explanation.assetId).toBe('gold-intl');
    expect(['ready', 'partial', 'insufficient']).toContain(body.explanation.contentStatus);
    expect(body.explanation.window.key).toBe('session');
    // 元数据与内容状态分开表达
    expect(['fresh', 'stale', 'unavailable']).toContain(body.meta.freshness);
    expect(body.meta.evaluatedAt).toBeTruthy();
    // 事实必须带观测引用，才能「点开依据」
    for (const f of body.explanation.facts) {
      expect(Array.isArray(f.observationIds)).toBe(true);
      expect(f.observationIds.length).toBe(2);
    }
  });

  it('实际收益率为负也参与解释（signed 值域贯穿链路）', async () => {
    const res = await fetch(`${base}/api/explanations?asset=gold-intl&window=5d`);
    const body = await res.json();
    const fact = (body.explanation.facts ?? []).find((f) => f.instrumentId === 'dfii10');
    expect(fact).toBeTruthy();
    // -0.42 → -0.10 是上行 32bp（百分点差 ×100）
    expect(fact.change.unit).toBe('bp');
    expect(fact.change.value).toBeGreaterThan(0);
    expect(fact.level.from).toBeLessThan(0);
  });

  it('同一输入重复请求返回同一 id（不重复生成版本）', async () => {
    const a = await (await fetch(`${base}/api/explanations?asset=gold-intl&window=1m`)).json();
    const b = await (await fetch(`${base}/api/explanations?asset=gold-intl&window=1m`)).json();
    expect(a.explanation.id).toBe(b.explanation.id);
  });

  it('按 id 读回固定版本，标 historical', async () => {
    const first = await (await fetch(`${base}/api/explanations?asset=gold-intl&window=session`)).json();
    const res = await fetch(`${base}/api/explanations/${first.explanation.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.explanation.summary).toBe(first.explanation.summary);
    expect(body.meta.historical).toBe(true);
  });

  it('不支持的资产/窗口 → 400', async () => {
    expect((await fetch(`${base}/api/explanations?asset=unknown&window=session`)).status).toBe(400);
    expect((await fetch(`${base}/api/explanations?asset=gold-intl&window=1y`)).status).toBe(400);
  });

  it('未知解释版本 → 404', async () => {
    expect((await fetch(`${base}/api/explanations/exp-does-not-exist`)).status).toBe(404);
  });

  it('meta 资产清单列出可解释资产与能力开关', async () => {
    const body = await (await fetch(`${base}/api/explanations/meta/assets`)).json();
    expect(body.enabled).toContain('gold-intl');
    expect(body.assets[0].assetId).toBe('gold-intl');
  });
});

describe('事件版本接口', () => {
  it('未知事件 → 404（不会假装有修订）', async () => {
    expect((await fetch(`${base}/api/events/no-such-event/revisions`)).status).toBe(404);
    expect((await fetch(`${base}/api/events/no-such-event/revisions/1`)).status).toBe(404);
  });
});

describe('/api/health 暴露调度状态', () => {
  it('返回 jobs 数组（禁用后台时为空，但字段必须在）', async () => {
    const body = await (await fetch(`${base}/api/health`)).json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.jobs)).toBe(true);
  });
});

/* ================================================================== *
 * 历史快照列表（C3）
 *
 * 回放要能列出「有过哪几版」。这里钉住三件事：路由不被 :id 吃掉、
 * 只列该资产该窗口、参数不合法返回 400。
 * ================================================================== */
describe('GET /api/explanations/history', () => {
  it('返回该资产 + 窗口的版本列表（按时间倒序）', async () => {
    const res = await fetch(`${base}/api/explanations/history?asset=gold-intl&window=session`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assetId).toBe('gold-intl');
    expect(body.windowKey).toBe('session');
    // 上面那条用例刚生成过快照，这里至少有一版
    expect(body.items.length).toBeGreaterThan(0);
    for (const it of body.items) expect(it.id.startsWith('exp_gold-intl_session_')).toBe(true);
  });

  it('不存在的资产 / 窗口 → 400，而不是空列表', async () => {
    const bad = await fetch(`${base}/api/explanations/history?asset=btc&window=session`);
    expect(bad.status).toBe(400);
    const badWin = await fetch(`${base}/api/explanations/history?asset=gold-intl&window=2y`);
    expect(badWin.status).toBe(400);
  });

  it('limit 受服务端夹取（1..50）', async () => {
    const res = await fetch(`${base}/api/explanations/history?asset=gold-intl&window=session&limit=999`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeLessThanOrEqual(50);
  });
});
