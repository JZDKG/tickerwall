/* ================================================================== *
 * 持久层契约测试（src/server/db/）
 *
 * 全部跑在 ':memory:' 库与临时目录里 —— 毫秒级，且绝不会碰生产 data/kanban.db。
 * 覆盖四张表各自的语义，以及「坏数据不该毁掉整份缓存」这条底线。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getDb,
  useDatabase,
  closeDb,
  currentDatabaseFile,
  openDatabase,
  kvGet,
  kvSet,
  kvGetJson,
  kvSetJson,
  readDailyCache,
  writeDailyCache,
  isDailyCacheFresh,
  DAILY_FRESH_MS,
  takeSnapshot,
  readSnapshots,
  snapshotCount,
  resetSnapshotGuard,
  SNAPSHOT_ANCHOR_WINDOW,
  writeJsonAtomic,
  readJson,
  appendJsonl,
  readJsonl,
  readJsonlField,
  writeHistoryFile,
  readHistoryFile,
} from '../src/server/db/index.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));

const BAR = (date, close, extra = {}) => ({
  date,
  open: close - 1,
  close,
  high: close + 1,
  low: close - 2,
  volume: 1000,
  ...extra,
});

beforeEach(() => {
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
});

/* ================================================================== *
 * sqlite 基础
 * ================================================================== */

describe('sqlite：连接与建表', () => {
  it('建出四张表（daily_bars / daily_meta / snapshots / kv）', () => {
    const names = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(names).toEqual(['daily_bars', 'daily_meta', 'kv', 'snapshots']);
  });

  it('useDatabase(":memory:") 之后 currentDatabaseFile 反映的是内存库', () => {
    expect(currentDatabaseFile()).toBe(':memory:');
  });

  it('同一个连接被复用（getDb 是单例）', () => {
    expect(getDb()).toBe(getDb());
  });

  it('openDatabase 每次返回独立连接，互不共享数据', () => {
    const a = openDatabase(':memory:');
    const b = openDatabase(':memory:');
    a.prepare("INSERT INTO kv (k, v, at) VALUES ('x', '1', 0)").run();
    expect(a.prepare('SELECT COUNT(*) AS n FROM kv').get().n).toBe(1);
    expect(b.prepare('SELECT COUNT(*) AS n FROM kv').get().n).toBe(0);
    a.close();
    b.close();
  });

  it('内存库隔离：不会写到生产 data/kanban.db', () => {
    expect(currentDatabaseFile()).not.toContain(path.join('data', 'kanban.db'));
  });
});

describe('kv 表', () => {
  it('读写往返 + 覆盖', () => {
    expect(kvGet('k1')).toBeNull();
    kvSet('k1', 'v1');
    expect(kvGet('k1')).toBe('v1');
    kvSet('k1', 'v2');
    expect(kvGet('k1')).toBe('v2');
  });

  it('JSON 便捷读写', () => {
    kvSetJson('llm', { a: { at: 1 }, b: { at: 2 } });
    expect(kvGetJson('llm')).toEqual({ a: { at: 1 }, b: { at: 2 } });
  });

  it('坏 JSON 返回 null 而不是抛错', () => {
    kvSet('bad', '{not json');
    expect(kvGetJson('bad')).toBeNull();
  });

  it('缺失键返回 fallback', () => {
    expect(kvGet('nope', 'fallback')).toBe('fallback');
    expect(kvGetJson('nope')).toBeNull();
  });
});

/* ================================================================== *
 * 日线缓存
 * ================================================================== */

describe('日线缓存：写入与读回', () => {
  it('往返：行内容、来源、区间、条数都对得上', async () => {
    await writeDailyCache('btc', 'binance', [BAR('2026-10-25', 100), BAR('2026-10-26', 110)]);
    const c = await readDailyCache('btc');
    expect(c).not.toBeNull();
    expect(c.id).toBe('btc');
    expect(c.source).toBe('binance');
    expect(c.count).toBe(2);
    expect(c.startDate).toBe('2026-10-25');
    expect(c.endDate).toBe('2026-10-26');
    expect(c.rows).toEqual([
      { date: '2026-10-25', open: 99, close: 100, high: 101, low: 98, volume: 1000 },
      { date: '2026-10-26', open: 109, close: 110, high: 111, low: 108, volume: 1000 },
    ]);
  });

  it('按日期升序返回，与写入顺序无关', async () => {
    await writeDailyCache('x', 's', [BAR('2026-10-26', 2), BAR('2026-10-24', 1), BAR('2026-10-25', 3)]);
    const c = await readDailyCache('x');
    expect(c.rows.map((r) => r.date)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });

  it('不足 2 条视为无缓存（画不出图）', async () => {
    await writeDailyCache('y', 's', [BAR('2026-10-25', 100)]);
    expect(await readDailyCache('y')).toBeNull();
  });

  it('完全没写过的标的返回 null', async () => {
    expect(await readDailyCache('never')).toBeNull();
  });

  it('整段替换：第二次写入不会残留旧行', async () => {
    await writeDailyCache('z', 'a', [BAR('2026-10-24', 10), BAR('2026-10-25', 11), BAR('2026-10-26', 12)]);
    // 源回补后只返回后两天
    await writeDailyCache('z', 'b', [BAR('2026-10-25', 20), BAR('2026-10-26', 21)]);
    const c = await readDailyCache('z');
    expect(c.rows.map((r) => r.close)).toEqual([20, 21]);
    expect(c.source).toBe('b');
    expect(c.count).toBe(2);
  });

  it('脏行被丢弃：缺日期、收盘 <= 0、收盘非数字', async () => {
    await writeDailyCache('d', 's', [
      BAR('2026-10-25', 100),
      { date: '', close: 5 },
      { date: '2026-10-26', close: 0 },
      { date: '2026-10-27', close: -1 },
      { date: '2026-10-28', close: 'abc' },
      BAR('2026-10-29', 120),
    ]);
    const c = await readDailyCache('d');
    expect(c.rows.map((r) => r.date)).toEqual(['2026-10-25', '2026-10-29']);
  });

  it('同一日期重复写入按主键覆盖（INSERT OR REPLACE）', async () => {
    await writeDailyCache('r', 's', [BAR('2026-10-25', 100), BAR('2026-10-26', 110)]);
    await writeDailyCache('r', 's', [BAR('2026-10-25', 999), BAR('2026-10-26', 110)]);
    const c = await readDailyCache('r');
    expect(c.rows.map((r) => r.close)).toEqual([999, 110]);
    expect(c.rows).toHaveLength(2);
  });

  it('rows 非数组或为空时直接返回，不写库', async () => {
    expect(await writeDailyCache('n', 's', null)).toBeUndefined();
    expect(await writeDailyCache('n', 's', [])).toBeUndefined();
    expect(await readDailyCache('n')).toBeNull();
  });

  it('多标的互不干扰', async () => {
    await writeDailyCache('a', 's', [BAR('2026-10-25', 1), BAR('2026-10-26', 2)]);
    await writeDailyCache('b', 's', [BAR('2026-10-25', 10), BAR('2026-10-26', 20)]);
    expect((await readDailyCache('a')).rows.map((r) => r.close)).toEqual([1, 2]);
    expect((await readDailyCache('b')).rows.map((r) => r.close)).toEqual([10, 20]);
  });
});

describe('日线缓存：新鲜度判定', () => {
  it('8 小时内算新鲜，边界外算过期', async () => {
    await writeDailyCache('f', 's', [BAR('2026-10-25', 1), BAR('2026-10-26', 2)]);
    const c = await readDailyCache('f');
    expect(DAILY_FRESH_MS).toBe(8 * 3600_000);
    expect(isDailyCacheFresh(c, c.savedAt + 1)).toBe(true);
    expect(isDailyCacheFresh(c, c.savedAt + DAILY_FRESH_MS - 1)).toBe(true);
    expect(isDailyCacheFresh(c, c.savedAt + DAILY_FRESH_MS)).toBe(false);
  });

  it('null 缓存永远不新鲜', () => {
    expect(isDailyCacheFresh(null)).toBe(false);
  });
});

/* ================================================================== *
 * 快照
 * ================================================================== */

describe('快照：写入与读回', () => {
  const Q = (id, price, ok = true) => ({ id, name: id.toUpperCase(), price, changePct: 1.5, ok });

  it('按时间刻度分组，组内保留全部标的', async () => {
    await takeSnapshot([Q('btc', 79000), Q('gold-cn', 762)], { at: '2026-10-27T00:00:00.000Z' });
    await takeSnapshot([Q('btc', 79100), Q('gold-cn', 763)], { at: '2026-10-27T00:05:00.000Z' });
    const snaps = await readSnapshots();
    expect(snaps).toHaveLength(2);
    expect(snaps.map((s) => s.at)).toEqual(['2026-10-27T00:00:00.000Z', '2026-10-27T00:05:00.000Z']);
    expect(snaps[0].quotes.map((q) => q.id)).toEqual(['btc', 'gold-cn']);
    expect(snaps[1].quotes.find((q) => q.id === 'btc').price).toBe(79100);
  });

  it('过滤掉 !ok、price <= 0、以及空数据', async () => {
    expect(await takeSnapshot([])).toBe(0);
    expect(await takeSnapshot([Q('a', 0), Q('b', -1), { id: 'c', price: 5, ok: false }])).toBe(0);
    expect(await readSnapshots()).toEqual([]);
  });

  it('changePct 缺省落 null（不是 0）', async () => {
    await takeSnapshot([{ id: 'x', name: 'X', price: 10, ok: true }], { at: '2026-10-27T01:00:00.000Z' });
    const snaps = await readSnapshots();
    expect(snaps[0].quotes[0].changePct).toBeNull();
  });

  it('同一刻度重复写入按主键覆盖', async () => {
    const at = '2026-10-27T02:00:00.000Z';
    await takeSnapshot([Q('btc', 100)], { at });
    await takeSnapshot([Q('btc', 200)], { at });
    const snaps = await readSnapshots();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].quotes[0].price).toBe(200);
  });

  it('limit 生效：只回最近 N 个刻度', async () => {
    for (let i = 0; i < 6; i += 1) {
      await takeSnapshot([Q('btc', 100 + i)], { at: `2026-10-27T0${i}:00:00.000Z` });
    }
    expect(await readSnapshots({ limit: 3 })).toHaveLength(3);
    expect(snapshotCount()).toBe(6);
  });

  it('时间刻度按字符串升序（ISO 定长，字典序即时间序）', async () => {
    // 价格保持在同一量级：单步 +100% 会被跳变护栏正当拦下（见下方护栏测试）
    await takeSnapshot([Q('a', 1)], { at: '2026-10-27T10:00:00.000Z' });
    await takeSnapshot([Q('a', 1.05)], { at: '2026-10-27T09:00:00.000Z' });
    const snaps = await readSnapshots();
    expect(snaps.map((s) => s.at)).toEqual(['2026-10-27T09:00:00.000Z', '2026-10-27T10:00:00.000Z']);
  });
});

/* ================================================================== *
 * 文件 I/O
 * ================================================================== */

describe('data/ 文件 I/O', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kanban-db-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writeJsonAtomic 先写 .tmp 再改名，留下的是完整 JSON', async () => {
    const f = path.join(dir, 'a.json');
    await writeJsonAtomic(f, { x: 1 });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ x: 1 });
  });

  it('readJson 对不存在 / 坏内容都返回 null', async () => {
    expect(await readJson(path.join(dir, 'nope.json'))).toBeNull();
    const f = path.join(dir, 'bad.json');
    await writeJsonAtomic(f, {});
    const { writeFileSync } = await import('node:fs');
    writeFileSync(f, '{oops');
    expect(await readJson(f)).toBeNull();
  });

  it('appendJsonl 追加 + readJsonl 读回，坏行跳过', async () => {
    const f = path.join(dir, 'events.jsonl');
    await appendJsonl(f, [{ id: 'a' }, { id: 'b' }]);
    await appendJsonl(f, [{ id: 'c' }]);
    expect((await readJsonl(f)).map((r) => r.id)).toEqual(['a', 'b', 'c']);

    const { appendFileSync } = await import('node:fs');
    appendFileSync(f, 'this is not json\n\n{"id":"d"}\n');
    expect((await readJsonl(f)).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('readJsonl 文件不存在返回空数组', async () => {
    expect(await readJsonl(path.join(dir, 'none.jsonl'))).toEqual([]);
  });

  it('readJsonlField 建「已归档 id」集合', async () => {
    const f = path.join(dir, 'e.jsonl');
    await appendJsonl(f, [{ id: 'a' }, { id: 'b' }, { nope: 1 }, { id: 'a' }]);
    const set = await readJsonlField(f, 'id');
    expect([...set].sort()).toEqual(['a', 'b']);
  });

  it('历史文件往返：history 与 notes 都保留', async () => {
    const f = path.join(dir, 'history.json');
    await writeHistoryFile(f, {
      notes: { 'gold-intl': { note: '期货形态兜底', at: 123 } },
      history: { btc: [{ t: 1, p: 100 }, { t: 2, p: 101 }] },
    });
    const obj = await readHistoryFile(f);
    expect(obj.notes['gold-intl']).toEqual({ note: '期货形态兜底', at: 123 });
    expect(obj.history.btc).toHaveLength(2);
  });

  it('readHistoryFile 结构容错：缺字段给空对象，坏文件也给空对象', async () => {
    const f = path.join(dir, 'h2.json');
    await writeJsonAtomic(f, {});
    expect(await readHistoryFile(f)).toEqual({ notes: {}, history: {} });
    expect(await readHistoryFile(path.join(dir, 'none.json'))).toEqual({ notes: {}, history: {} });
  });
});

/* ================================================================== *
 * 分层纪律
 * ================================================================== */

describe('分层：db/ 不能反向依赖上层', () => {
  it('db/ 之下不 import providers / services / domain', () => {
    const files = ['sqlite.js', 'daily-cache.js', 'snapshots.js', 'files.js', 'index.js'];
    const bad = [];
    for (const f of files) {
      const code = readFileSync(path.join(REPO, 'src/server/db', f), 'utf8');
      for (const m of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        if (/providers|services|domain|server\.mjs/.test(spec)) bad.push(`${f} → ${spec}`);
      }
    }
    expect(bad, 'db 层必须能被 providers 单向依赖，不能反向').toEqual([]);
  });
});


/* ================================================================== *
 * 快照跳变护栏
 *
 * 真实事故：sina:int_nikkei / int_ftse / int_dji 长期停更，但接口仍返回
 * 一年前的僵尸价（日经 44946.64、富时 9284.83、道指 46247.29，涨跌幅的小数
 * 点后 16 位永恒不变）。每当东财偶发断连降级到这些源，僵尸价就被写进快照，
 * 隔夜复盘随即出现 +40% 这种离谱值。
 *
 * 实测：`curl hq.sinajs.cn/list=int_nikkei` 现在返回的就是 44946.64。
 * ================================================================== */

describe('快照跳变护栏', () => {
  const Q = (id, price) => [{ id, name: id.toUpperCase(), price, ok: true }];
  const at = (m) => `2026-10-27T06:${String(m).padStart(2, '0')}:00.000Z`;

  beforeEach(() => {
    resetSnapshotGuard();
  });

  it('正常序列不受影响，逐条写入', async () => {
    for (const m of [0, 5, 10, 15, 20, 25]) {
      expect(await takeSnapshot(Q('n225', 63260 + m), { at: at(m) })).toBe(1);
    }
    expect(snapshotCount()).toBe(6);
  });

  it('中间夹一个僵尸价会被拦下，后续正常刻度继续写', async () => {
    for (const m of [0, 5, 10, 15, 20, 25]) await takeSnapshot(Q('n225', 63260 + m), { at: at(m) });

    const skips = [];
    const written = await takeSnapshot(Q('n225', 44946.64), { at: at(30), onSkip: (s) => skips.push(s) });

    expect(written, '僵尸价不该写进快照').toBe(0);
    expect(skips).toHaveLength(1);
    expect(skips[0]).toMatchObject({ id: 'n225', reason: 'jump-pending' });
    expect(snapshotCount()).toBe(6);

    // 真实行情回来，继续正常写入
    expect(await takeSnapshot(Q('n225', 63270), { at: at(35) })).toBe(1);
    const snaps = await readSnapshots();
    expect(snaps.at(-1).quotes[0].price).toBe(63270);
  });

  it('脏锚点死锁：库里最新已是僵尸价时，真实行情必须能恢复写入', async () => {
    // 先造一个「最新刻度是僵尸价」的库（模拟护栏上线前的既有脏数据）
    for (const m of [0, 5, 10, 15, 20, 25]) await takeSnapshot(Q('n225', 44946.64), { at: at(m) });
    expect((await readSnapshots()).at(-1).quotes[0].price).toBe(44946.64);

    // 真实行情第一次出现：相对 4 万多的锚点是 +40%，先挂起
    const skips = [];
    expect(await takeSnapshot(Q('n225', 63268.37), { at: at(30), onSkip: (s) => skips.push(s) })).toBe(0);
    expect(skips[0].reason).toBe('jump-pending');

    // 第二次仍然停在新价位 → 认定真的换挡，放行（否则会永久锁死）
    expect(await takeSnapshot(Q('n225', 63270.1), { at: at(35) })).toBe(1);
    expect((await readSnapshots()).at(-1).quotes[0].price).toBe(63270.1);
  });

  it('按品种传阈值：指数 10% 太松时可用业务阈值收紧', async () => {
    for (const m of [0, 5, 10, 15, 20, 25]) await takeSnapshot(Q('usdcny', 7.1), { at: at(m) });
    // 7.1 → 7.5 是 +5.6%：默认 10% 放行，按品种 3% 则拦下
    expect(await takeSnapshot(Q('usdcny', 7.5), { at: at(30) })).toBe(1);
    resetSnapshotGuard();
    const skips = [];
    expect(
      await takeSnapshot(Q('usdcny', 7.5), { at: at(35), maxJumpPctById: { usdcny: 3 }, onSkip: (s) => skips.push(s) }),
    ).toBe(0);
    expect(skips[0].reason).toBe('jump-pending');
  });

  it('待定状态落库：跨进程（新连接）也能完成第二次确认', async () => {
    for (const m of [0, 5, 10, 15, 20, 25]) await takeSnapshot(Q('n225', 44946.64), { at: at(m) });
    // 第一次遇到真实价 → 挂起，且状态必须落库而非只在内存
    expect(await takeSnapshot(Q('n225', 63268.37), { at: at(30) })).toBe(0);
    const pend = getDb().prepare("SELECT COUNT(*) n FROM kv WHERE k = 'snapshot:pending:n225' AND v <> 'null'").get();
    expect(pend.n, '待定状态应落 kv，否则重启即清零、永远等不到第二次确认').toBe(1);
    // 模拟另一个进程（同一份库）：状态仍在 → 第二次确认放行
    expect(await takeSnapshot(Q('n225', 63270.1), { at: at(35) })).toBe(1);
    const cleared = getDb().prepare("SELECT COUNT(*) n FROM kv WHERE k = 'snapshot:pending:n225' AND v <> 'null'").get();
    expect(cleared.n, '确认后应清空待定').toBe(0);
  });

  it('锚点窗口是最近 6 个刻度', () => {
    expect(SNAPSHOT_ANCHOR_WINDOW).toBe(6);
  });

  it('首次写入没有锚点时不做跳变判断', async () => {
    expect(await takeSnapshot(Q('brand-new', 12345), { at: at(0) })).toBe(1);
  });

  it('多标的各自独立判断：一个被拦不影响另一个', async () => {
    for (const m of [0, 5, 10, 15, 20, 25]) {
      await takeSnapshot([{ id: 'a', name: 'A', price: 100, ok: true }, { id: 'b', name: 'B', price: 200, ok: true }], { at: at(m) });
    }
    const written = await takeSnapshot(
      [{ id: 'a', name: 'A', price: 100.5, ok: true }, { id: 'b', name: 'B', price: 900, ok: true }],
      { at: at(30) },
    );
    expect(written).toBe(1); // 只有 a 写入
    const last = (await readSnapshots()).at(-1);
    expect(last.quotes.map((q) => q.id)).toEqual(['a']);
  });
});
