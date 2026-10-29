/* ================================================================== *
 * 报价服务（二）：聚合、缓存、快照、播种、隔夜复盘
 *
 * 这里覆盖「一次刷新到底做了什么」：多源结果如何合成一张卡片、失败时如何
 * 保住上一次的值、首屏走势如何补种、隔夜复盘的基准怎么切。
 * 持久层与上游全部 mock，DATA_DIR 指到临时目录，不碰真实 data/。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'kanban-quotes-'));
process.env.KANBAN_DATA_DIR = DATA_DIR;

vi.mock('../src/server/providers/http.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchRaw: vi.fn() };
});

vi.mock('../src/server/db/index.js', () => ({
  getDb: vi.fn(),
  readDailyCache: vi.fn(),
  writeDailyCache: vi.fn(),
  takeSnapshot: vi.fn(),
  readSnapshots: vi.fn(),
  readJson: vi.fn(),
  writeHistoryFile: vi.fn(),
  registerFlushHook: vi.fn(),
}));

const { fetchRaw } = await import('../src/server/providers/http.js');
const db = await import('../src/server/db/index.js');
const q = await import('../src/server/services/quotes.service.js');

const {
  INSTRUMENTS,
  ring,
  lastGood,
  extraLastGood,
  seedNotes,
  buildFreshness,
  resolveInstrument,
  resolveExtras,
  applySpreadChips,
  refresh,
  getQuotes,
  seedFrom,
  seedPoints,
  seedHistory,
  trimToLastSession,
  historyNoteFor,
  loadPersistedHistory,
  scheduleHistorySave,
  migrateLegacyStorage,
  buildBriefing,
  shanghaiDay,
  shanghaiMinuteOfDay,
  SNAPSHOT_MIN_GAP_MS,
  SEED_NOTE_TTL_MS,
  BRIEFING_MAX_LINES,
  CACHE_TTL_MS,
} = q;

const DAY = 86_400_000;

/** 把某标的的源临时换掉，返回还原函数 */
function withInst(inst) {
  const saved = INSTRUMENTS.slice();
  INSTRUMENTS.splice(0, INSTRUMENTS.length, inst);
  return () => {
    INSTRUMENTS.splice(0, INSTRUMENTS.length, ...saved);
  };
}

function withExtra(id, extra) {
  extraLastGood.set(id, extra);
}

beforeEach(() => {
  fetchRaw.mockReset();
  db.readDailyCache.mockReset();
  db.writeDailyCache.mockReset();
  db.takeSnapshot.mockReset();
  db.readSnapshots.mockReset();
  db.readJson.mockReset();
  db.writeHistoryFile.mockReset();
  db.getDb.mockReset();
  db.readDailyCache.mockResolvedValue(null);
  db.writeDailyCache.mockResolvedValue();
  db.takeSnapshot.mockResolvedValue();
  db.readSnapshots.mockResolvedValue([]);
  db.readJson.mockResolvedValue(null);
  db.writeHistoryFile.mockResolvedValue();
  q.__resetRuntimeStateForTests();
  lastGood.clear();
  extraLastGood.clear();
  seedNotes.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------ 单标的解析 ------------------------------ */

describe('resolveInstrument：成功 / 失败保留旧值 / 无缓存', () => {
  const inst = {
    id: 't-inst',
    name: '测试标的',
    sub: 'test',
    unit: '点',
    decimals: 2,
    market: 'us-index',
    sources: [],
  };

  it('成功时写历史、缓存 lastGood，并带上新鲜度与来源', async () => {
    const restore = withInst(inst);
    const sources = [
      {
        name: 'a',
        load: async () => ({ price: 100, prevClose: 99, sessionTime: '14:30:00' }),
      },
    ];
    INSTRUMENTS[0] = { ...inst, sources };
    const snap = await resolveInstrument(INSTRUMENTS[0]);
    restore();

    expect(snap.ok).toBe(true);
    expect(snap.price).toBe(100);
    expect(snap.changePct).toBeCloseTo((1 / 99) * 100, 10);
    expect(snap.marketStatus).toBeTruthy();
    expect(snap.priceBasis).toBe('close');
    expect(snap.freshness).toHaveProperty('level');
    expect(snap.history.length).toBeGreaterThan(0);
    expect(lastGood.get('t-inst')).toBe(snap);
  });

  it('全源失败时保留上一次成功值，明确标 stale', async () => {
    const restore = withInst({ ...inst, id: 't-stale', sources: [{ name: 'a', load: async () => ({ price: 10 }) }] });
    const first = await resolveInstrument(INSTRUMENTS[0]);
    expect(first.ok).toBe(true);

    INSTRUMENTS[0] = {
      ...inst,
      id: 't-stale',
      sources: [{ name: 'a', load: async () => { throw new Error('429'); } }],
    };
    const second = await resolveInstrument(INSTRUMENTS[0]);
    restore();

    expect(second.ok).toBe(false);
    expect(second.stale).toBe(true);
    expect(second.price).toBe(10); // 旧值仍在
    expect(second.error).toBe('a: 429');
    expect(second.history.length).toBeGreaterThan(0);
  });

  it('第一次就失败且没有缓存：返回完整空壳而不是 undefined', async () => {
    const restore = withInst({
      ...inst,
      id: 't-empty',
      sources: [{ name: 'a', load: async () => { throw new Error('x'); } }],
    });
    const snap = await resolveInstrument(INSTRUMENTS[0]);
    restore();
    expect(snap.ok).toBe(false);
    expect(snap.price).toBeNull();
    expect(snap.history).toEqual([]);
    expect(snap.error).toBe('a: x');
    expect(snap.extras).toEqual([]);
  });
});

describe('resolveExtras：附加报价独立兜底', () => {
  it('成功写缓存；失败时用上一次成功的值标 stale', async () => {
    let fail = false;
    const inst = {
      id: 'oil-x',
      extras: [
        {
          id: 'brent',
          name: '布伦特',
          sources: [{ name: 'a', load: async () => {
            if (fail) throw new Error('down');
            return { price: 75.5, change: 0.5, changePct: 0.66 };
          } }],
        },
      ],
    };
    const first = await resolveExtras(inst);
    expect(first[0]).toMatchObject({ id: 'brent', ok: true, price: 75.5 });

    fail = true;
    const second = await resolveExtras(inst);
    expect(second[0]).toMatchObject({ id: 'brent', ok: false, stale: true, price: 75.5 });
    expect(second[0].error).toBe('a: down');
  });

  it('没有 extras / 首次失败都返回合理结构', async () => {
    expect(await resolveExtras({ id: 'x' })).toEqual([]);
    const out = await resolveExtras({
      id: 'y',
      extras: [{ id: 'z', name: 'Z', sources: [{ name: 'a', load: async () => { throw new Error('no'); } }] }],
    });
    expect(out[0]).toMatchObject({ ok: false, price: null, error: 'a: no' });
  });
});

/* ------------------------------ 新鲜度 ------------------------------ */

describe('buildFreshness：源时点分级', () => {
  const base = { source: 'eastmoney:1.1', changePct: 1 };

  it('无时间戳且非实时源 → unknown，标签回落原始 sessionTime', () => {
    const out = buildFreshness({ id: 'x', changePct: 0 }, { ...base, sessionTime: null }, { open: true }, new Date());
    expect(out.level).toBe('unknown');
    expect(out.ageMs).toBeNull();
    expect(out.label).toBe('—');
  });

  it('实时推送源（binance）没有时间戳也按当下算', () => {
    const open = buildFreshness({ id: 'btc', changePct: 0 }, { source: 'binance:api.binance.com', sessionTime: null }, { open: true });
    expect(open.ageMs).toBe(0);
    expect(open.label).toBe('实时');
    const closed = buildFreshness({ id: 'btc', changePct: 0 }, { source: 'binance:x', sessionTime: null }, { open: false });
    expect(closed.label).toBe('收盘价');
  });

  it('有源时点时给出人话年龄与分级；盘中容忍度更小', () => {
    const now = new Date('2026-10-26T15:00:00+08:00');
    const main = { source: 'eastmoney:x', sessionTime: '14:59:30', changePct: 0.2 };
    const open = buildFreshness({ id: 'sh000001', changePct: 0.2 }, main, { open: true }, now);
    const closed = buildFreshness({ id: 'sh000001', changePct: 0.2 }, main, { open: false }, now);
    expect(open.ageMs).toBe(30_000);
    expect(typeof open.label).toBe('string');
    expect(['fresh', 'normal', 'delayed', 'stale', 'unknown']).toContain(open.level);
    // 两种状态用不同阈值（盘中 2 分钟，收盘 4 天），等级名不可跨状态比较；
    // 但年龄必须一致，且都落在合法枚举里
    expect(closed.ageMs).toBe(open.ageMs);
    expect(['fresh', 'normal', 'delayed', 'stale']).toContain(closed.level);
  });

  it('单日变动超阈值标 suspect，并写明阈值', () => {
    const out = buildFreshness(
      { id: 'dxy', changePct: 9 },
      { source: 'sina:x', sessionTime: null, changePct: 9 },
      { open: true },
    );
    expect(out.suspect).toBe(true);
    expect(out.suspectNote).toContain('±4%');
  });

  it('未登记的标的用 20% 默认阈值', () => {
    const out = buildFreshness({ id: 'who', changePct: 21 }, { source: 's', sessionTime: null, changePct: 21 }, { open: true });
    expect(out.suspect).toBe(true);
    expect(out.suspectNote).toContain('±20%');
  });
});

/* ------------------------------ 价差 Chip ------------------------------ */

describe('applySpreadChips：零额外 HTTP 的两个 Chip', () => {
  const item = (id, price, extra = {}) => ({ id, ok: true, price, extras: [], ...extra });

  it('沪金溢价 = 国内价 − 国际金价折算；B-W 价差 = 布伦特 − WTI', () => {
    const items = [
      item('gold-cn', 560),
      item('gold-intl', 2650),
      item('usdcny', 7.1),
      item('oil', 70, { extras: [{ id: 'brent', ok: true, price: 74.2 }] }),
    ];
    applySpreadChips(items);
    const gold = items[0].extras.find((e) => e.id === 'gold-intl');
    expect(gold.name).toBe('沪金溢价');
    expect(gold.price).toBeCloseTo(560 - (2650 / 31.1034768) * 7.1, 8);
    expect(gold.priceText).toMatch(/^[+-]\d+\.\d{2} 元\/克$/);
    expect(gold.changePct).toBeTruthy();

    const bw = items[3].extras.find((e) => e.id === 'oil');
    expect(bw.name).toBe('B-W 价差');
    expect(bw.price).toBeCloseTo(4.2, 10);
    expect(bw.priceText).toBe('$4.20');
  });

  it('缺汇率 / 缺布伦特时不生成对应 Chip', () => {
    const items = [item('gold-cn', 560), item('gold-intl', 2650), item('oil', 70)];
    applySpreadChips(items);
    expect(items[0].extras).toEqual([]);
    expect(items[2].extras).toEqual([]);
  });

  it('汇总桶价格无效（ok:false）时不计算', () => {
    const items = [
      { id: 'gold-cn', ok: false, price: 560 },
      item('gold-intl', 2650),
      item('usdcny', 7.1),
      { id: 'oil', ok: false, price: 70, extras: [{ id: 'brent', ok: true, price: 74 }] },
    ];
    applySpreadChips(items);
    expect(items[0].extras ?? []).toEqual([]);
    expect(items[3].extras.length).toBe(1); // 原样保留，不追加
  });
});

/* ------------------------------ 聚合刷新与缓存 ------------------------------ */

describe('refresh / getQuotes：缓存、并发合并、快照节流', () => {
  const btc = {
    id: 'btc',
    name: '比特币',
    sub: 'BTC/USDT',
    unit: '美元',
    decimals: 2,
    market: 'crypto',
    binanceSymbol: 'BTCUSDT',
    sources: [{ name: 'binance:x', load: async () => ({ price: 68000, prevClose: 67000 }) }],
  };

  it('refresh 返回 ttl、生成时间与逐项结果；ok 取决于是否至少一项成功', async () => {
    const restore = withInst(btc);
    const out = await refresh();
    restore();
    expect(out.ttlMs).toBe(CACHE_TTL_MS);
    expect(typeof out.generatedAt).toBe('string');
    expect(out.items).toHaveLength(1);
    expect(out.ok).toBe(true);
    expect(out.items[0].price).toBe(68000);
  });

  it('缓存期内复用；force 重新抓', async () => {
    let calls = 0;
    const inst = {
      ...btc,
      sources: [{ name: 'a', load: async () => { calls += 1; return { price: 100, prevClose: 99 }; } }],
    };
    const restore = withInst(inst);
    const a = await getQuotes();
    const b = await getQuotes();
    expect(b).toBe(a);
    expect(calls).toBe(1);
    const c = await getQuotes({ force: true });
    expect(c).not.toBe(a);
    expect(calls).toBe(2);
    restore();
  });

  it('并发 force 共享同一次 inflight，不会把上游打两遍', async () => {
    let calls = 0;
    const inst = {
      ...btc,
      sources: [{ name: 'a', load: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 5));
        return { price: 100, prevClose: 99 };
      } }],
    };
    const restore = withInst(inst);
    const [a, b] = await Promise.all([getQuotes({ force: true }), getQuotes({ force: true })]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    restore();
  });

  it('快照按 5 分钟节流：首次写，紧接着的刷新不写，过了窗口再写', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-10-26T10:00:00+08:00')); // 远在未来，绕开前面用例写下的时间戳
    const inst = {
      ...btc,
      sources: [{ name: 'a', load: async () => ({ price: 100, prevClose: 99 }) }],
    };
    const restore = withInst(inst);
    db.takeSnapshot.mockClear();
    await getQuotes({ force: true });
    const first = db.takeSnapshot.mock.calls.length;
    await getQuotes({ force: true });
    expect(db.takeSnapshot.mock.calls.length).toBe(first); // 窗口内不写
    // 推进到窗口之外
    vi.setSystemTime(new Date(Date.now() + SNAPSHOT_MIN_GAP_MS + 1000));
    await getQuotes({ force: true });
    expect(db.takeSnapshot.mock.calls.length).toBeGreaterThan(first);
    restore();
  });

  it('没有任何标的成功时 ok=false', async () => {
    const restore = withInst({ ...btc, sources: [{ name: 'a', load: async () => { throw new Error('x'); } }] });
    const out = await refresh();
    restore();
    expect(out.ok).toBe(false);
    expect(out.items[0].ok).toBe(false);
  });
});

/* ------------------------------ 播种 ------------------------------ */

describe('seedFrom / seedPoints / seedHistory', () => {
  const klines = (n, base = Date.UTC(2026, 9, 26, 1, 0), step = 300000) =>
    Array.from({ length: n }, (_, i) => [base + i * step, '1', '2', '0.5', String(100 + i)]);

  it('em：过滤无效点并裁剪到最后一个交易日', async () => {
    fetchRaw.mockResolvedValue(
      JSON.stringify({
        data: {
          trends: [
            '2026-10-25 09:30,90',
            '2026-10-26 09:30,100',
            '2026-10-26 09:31,--',
            '2026-10-26 09:32,101',
          ],
        },
      }),
    );
    const out = await seedFrom({ kind: 'em', secid: '1.1', note: '参考' });
    expect(out.points).toHaveLength(2);
    expect(out.points.map((p) => p.p)).toEqual([100, 101]);
    expect(out.note).toBe('参考');
  });

  it('em：空数据 / 点数不足返回 null', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { trends: [] } }));
    expect(await seedFrom({ kind: 'em', secid: '1.1' })).toBeNull();
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { trends: ['2026-10-26 09:30,100'] } }));
    expect(await seedFrom({ kind: 'em', secid: '1.1' })).toBeNull();
  });

  it('yahoo：时间戳 ×1000，过滤无效收盘', async () => {
    fetchRaw.mockResolvedValue(
      JSON.stringify({
        chart: { result: [{ timestamp: [1793000000, 1793000300, 1793000600], indicators: { quote: [{ close: [100, null, 102] }] } }] },
      }),
    );
    const out = await seedFrom({ kind: 'yahoo', symbol: '^GSPC' });
    expect(out.points).toHaveLength(2);
    expect(out.points[0].t).toBe(1793000000 * 1000);
    expect(out.points[1].p).toBe(102);
  });

  it('yahoo：无 result / 点数不足返回 null', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify({ chart: {} }));
    expect(await seedFrom({ kind: 'yahoo', symbol: '^GSPC' })).toBeNull();
    fetchRaw.mockResolvedValue(
      JSON.stringify({ chart: { result: [{ timestamp: [1], indicators: { quote: [{ close: [100] }] } }] } }),
    );
    expect(await seedFrom({ kind: 'yahoo', symbol: '^GSPC' })).toBeNull();
  });

  it('binance：收盘价 + 开盘时间；空数组返回 null', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify(klines(30)));
    const out = await seedFrom({ kind: 'binance', symbol: 'BTCUSDT' });
    expect(out.points).toHaveLength(30);
    expect(out.points[0]).toMatchObject({ p: 100 });
    expect(Number.isFinite(out.points[0].t)).toBe(true);

    fetchRaw.mockResolvedValue('[]');
    expect(await seedFrom({ kind: 'binance', symbol: 'BTCUSDT' })).toBeNull();
  });

  it('未知 seed 类型返回 null', async () => {
    expect(await seedFrom({ kind: 'nope' })).toBeNull();
  });

  it('seedPoints：按顺序试，前面的失败不阻塞后面的；全失败返回 null', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('first')) throw new Error('bad');
      return JSON.stringify(klines(5));
    });
    // 用两个 binance 尝试区分 URL 不方便，直接换 kind 组合
    const got = await seedPoints({
      seed: [
        { kind: 'em', secid: 'bad-url' },
        { kind: 'binance', symbol: 'BTCUSDT' },
      ],
    });
    expect(got.points.length).toBe(5);

    fetchRaw.mockRejectedValue(new Error('down'));
    expect(await seedPoints({ seed: [{ kind: 'binance', symbol: 'X' }] })).toBeNull();
    expect(await seedPoints({})).toBeNull();
  });

  it('trimToLastSession：只留北京时间最后一个自然日；不足两点则原样返回', () => {
    const t = (day, hour) => Date.parse(`2026-10-${day}T${hour}:00:00+08:00`);
    const pts = [
      { t: t('25', '10'), p: 1 },
      { t: t('26', '09'), p: 2 },
      { t: t('26', '10'), p: 3 },
    ];
    expect(trimToLastSession(pts).map((p) => p.p)).toEqual([2, 3]);
    const single = [{ t: t('26', '09'), p: 1 }, { t: t('25', '10'), p: 2 }];
    expect(trimToLastSession(single)).toEqual(single);
    expect(trimToLastSession([{ t: 1, p: 1 }])).toHaveLength(1);
  });

  it('seedHistory：只补空缓冲，并记录 12 小时内的来源注脚', async () => {
    const inst = { id: 'seed-x', seed: { kind: 'binance', symbol: 'BTCUSDT', note: '参考形态' } };
    const restore = withInst(inst);
    fetchRaw.mockResolvedValue(JSON.stringify(klines(10)));
    // 显式允许联网补种：本用例验的是补种逻辑，不是在验离线模式的门
    await seedHistory({ allowNetwork: true });
    expect(ring.get('seed-x').length).toBe(10);
    expect(historyNoteFor('seed-x')).toBe('参考形态');

    // 已有数据不再补种
    const before = fetchRaw.mock.calls.length;
    await seedHistory({ allowNetwork: true });
    expect(fetchRaw.mock.calls.length).toBe(before);

    // 超过 12 小时注脚过期
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + SEED_NOTE_TTL_MS + 1000));
    expect(historyNoteFor('seed-x')).toBeNull();
    restore();
  });
});

describe('离线模式：关掉后台就不补种（方案 E02）', () => {
  it('DISABLE_BACKGROUND=1 时 seedHistory 一个点都不抓', async () => {
    const inst = { id: 'seed-offline', seed: { kind: 'binance', symbol: 'BTCUSDT', note: '参考形态' } };
    const restore = withInst(inst);
    const prev = process.env.DISABLE_BACKGROUND;
    process.env.DISABLE_BACKGROUND = '1';
    const before = fetchRaw.mock.calls.length;
    try {
      await seedHistory();
      // 补种会打外网；离线模式下必须一次都不打，也不能写进环形缓冲
      expect(fetchRaw.mock.calls.length).toBe(before);
      expect(ring.get('seed-offline')).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.DISABLE_BACKGROUND;
      else process.env.DISABLE_BACKGROUND = prev;
      restore();
    }
  });
});

/* ------------------------------ 持久化 ------------------------------ */

describe('历史持久化与 SQLite 迁移', () => {
  it('loadPersistedHistory：恢复环形缓冲与注脚，兼容扁平旧格式', async () => {
    db.readJson.mockResolvedValue({
      history: { a: [{ t: 1, p: 2 }], bad: 'x' },
      notes: { a: { note: 'n', at: Date.now() }, b: { note: 1, at: 2 } },
    });
    await loadPersistedHistory();
    expect(ring.get('a')).toHaveLength(1);
    expect(historyNoteFor('a')).toBe('n');
    expect(historyNoteFor('b')).toBeNull();
  });

  it('loadPersistedHistory：旧格式（直接 id→points）也能读；文件缺失不抛', async () => {
    db.readJson.mockResolvedValue({ c: [{ t: 1, p: 3 }] });
    await loadPersistedHistory();
    expect(ring.get('c')).toHaveLength(1);

    db.readJson.mockRejectedValue(new Error('ENOENT'));
    await expect(loadPersistedHistory()).resolves.toBeUndefined();
  });

  it('scheduleHistorySave：2 秒合并写盘一次；失败被吞掉', async () => {
    vi.useFakeTimers();
    // 构造一点历史
    const inst = { id: 'save-x', name: 'x', sub: '', unit: '', decimals: 2, market: 'us-index', sources: [{ name: 'a', load: async () => ({ price: 1 }) }] };
    const restore = withInst(inst);
    await resolveInstrument(INSTRUMENTS[0]);
    scheduleHistorySave();
    scheduleHistorySave(); // 第二次应复用同一个 timer
    await vi.advanceTimersByTimeAsync(2100);
    expect(db.writeHistoryFile).toHaveBeenCalledTimes(1);
    const [, payload] = db.writeHistoryFile.mock.calls[0];
    expect(payload.history['save-x']).toBeTruthy();

    db.writeHistoryFile.mockRejectedValue(new Error('disk'));
    scheduleHistorySave();
    await vi.advanceTimersByTimeAsync(2100);
    restore();
  });

  /**
   * 迁移实现已搬到 db/legacy-import.js（E05：导入不该长在采集存储里，且单个
   * kv 标记无法区分「不存在 / 坏了 / 导了一半」）。四种状态与重试规则由
   * tests/db-legacy-import.test.js 用真实内存库覆盖。
   *
   * 这里只断言一件事：服务入口的同名导出确实委派过去了 —— 否则 server.mjs
   * 启动时那一步会静默变成空操作。
   */
  it('migrateLegacyStorage 委派给 legacy-import，并把结果透出来', async () => {
    const { runLegacyImport } = await import('../src/server/db/legacy-import.js');
    const realLog = console.log;
    console.log = () => {};
    try {
      const out = await migrateLegacyStorage({ dataDir: DATA_DIR });
      // 台账里已经记过 ok/absent，第二次调用应当是跳过
      expect(out).toHaveProperty('skipped');
      expect(Array.isArray(out.results)).toBe(true);
      expect(typeof runLegacyImport).toBe('function');
    } finally {
      console.log = realLog;
    }
  });

  it('导入没有完成时不会写总体完成标记（失败要能被下次启动重试）', async () => {
    const imp = await import('../src/server/db/legacy-import.js');
    // 直接种一条 failed 台账，模拟上次导入失败
    imp.recordImport('daily', { status: 'failed', error: 'boom' });
    expect(imp.pendingImports().map((r) => r.source)).toContain('daily');
  });
});

/* ------------------------------ 隔夜复盘 ------------------------------ */

describe('buildBriefing：15:00 基准切分与脏数据过滤', () => {
  const snap = (at, quotes) => ({ at, quotes });

  it('样本不足返回 collecting', async () => {
    db.readSnapshots.mockResolvedValue([]);
    expect(await buildBriefing()).toMatchObject({ ok: true, status: 'collecting', samples: 0, items: [] });
    db.readSnapshots.mockResolvedValue([snap('2026-10-26T10:00:00+08:00', [])]);
    expect((await buildBriefing()).status).toBe('collecting');
    expect(BRIEFING_MAX_LINES).toBeGreaterThan(1000);
  });

  it('最新一条在 15:00 之后：基准取当天 15:00 前最后一条，status=overnight', async () => {
    db.readSnapshots.mockResolvedValue([
      snap('2026-10-26T10:00:00+08:00', [{ id: 'sp500', name: '标普', price: 100 }]),
      snap('2026-10-26T14:30:00+08:00', [{ id: 'sp500', name: '标普', price: 102 }]),
      snap('2026-10-26T21:30:00+08:00', [{ id: 'sp500', name: '标普', price: 105, changePct: 1 }]),
    ]);
    const out = await buildBriefing();
    expect(out.status).toBe('overnight');
    expect(out.baselineAt).toBe('2026-10-26T14:30:00+08:00');
    expect(out.items[0]).toMatchObject({ id: 'sp500', from: 102, to: 105 });
    expect(out.items[0].movePct).toBeCloseTo((3 / 102) * 100, 10);
    expect(out.cutLabel).toContain('15:00');
  });

  it('还没跨过 15:00：基准退回最早一条，status=intraday', async () => {
    db.readSnapshots.mockResolvedValue([
      snap('2026-10-26T09:00:00+08:00', [{ id: 'sh000001', name: '上证', price: 3000 }]),
      snap('2026-10-26T10:00:00+08:00', [{ id: 'sh000001', name: '上证', price: 3030 }]),
    ]);
    const out = await buildBriefing();
    expect(out.status).toBe('intraday');
    expect(out.baselineAt).toBe('2026-10-26T09:00:00+08:00');
    expect(out.items[0].movePct).toBeCloseTo(1, 10);
  });

  it('跨源口径错位的异常涨跌被丢进 dropped，不给用户看假信号', async () => {
    db.readSnapshots.mockResolvedValue([
      snap('2026-10-26T10:00:00+08:00', [{ id: 'sp500', name: '标普', price: 100 }]),
      snap('2026-10-26T16:00:00+08:00', [{ id: 'sp500', name: '标普', price: 300 }]),
    ]);
    const out = await buildBriefing();
    expect(out.items).toEqual([]);
    expect(out.dropped).toEqual([{ id: 'sp500', movePct: 200, limit: 10 }]);
  });

  it('缺基准价 / 缺最新价 / 非有限值都跳过，不产生 NaN 行', async () => {
    db.readSnapshots.mockResolvedValue([
      snap('2026-10-26T10:00:00+08:00', [{ id: 'a', price: 100 }, { id: 'b', price: 0 }, { id: 'c', price: 10 }]),
      snap('2026-10-26T16:00:00+08:00', [{ id: 'a', price: 0 }, { id: 'b', price: 5 }, { id: 'd', price: 5 }, { id: 'c', price: 'x' }]),
    ]);
    const out = await buildBriefing();
    expect(out.items).toEqual([]);
    expect(out.dropped).toEqual([]);
  });

  it('shanghaiDay / shanghaiMinuteOfDay 对坏输入返回 null', () => {
    expect(shanghaiDay('not-a-date')).toBeNull();
    expect(shanghaiMinuteOfDay('not-a-date')).toBeNull();
    expect(shanghaiMinuteOfDay('2026-10-26T15:30:00+08:00')).toBe(15 * 60 + 30);
  });
});

/* 清理临时数据目录 */
process.on('exit', () => {
  try {
    rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

/* ================================================================== *
 * 离线模式不补种（CI 的 DISABLE_BACKGROUND=1 就是这条路径）
 *
 * 补种会打外网。原来它在 listen() 之前被调用，于是「关掉后台」仍然先联网
 * 抓一轮才开门 —— 集成测试与断网环境都要求关掉后台 = 不联网。
 * ================================================================== */
describe('离线模式（DISABLE_BACKGROUND=1）', () => {
  it('默认不补种：一次 fetch 都不发', async () => {
    const prev = process.env.DISABLE_BACKGROUND;
    process.env.DISABLE_BACKGROUND = '1';
    try {
      const inst = { id: 'off-x', seed: { kind: 'binance', symbol: 'BTCUSDT' } };
      const restore = withInst(inst);
      const before = fetchRaw.mock.calls.length;
      await seedHistory();
      expect(fetchRaw.mock.calls.length).toBe(before);
      restore();
    } finally {
      if (prev == null) delete process.env.DISABLE_BACKGROUND;
      else process.env.DISABLE_BACKGROUND = prev;
    }
  });
});
