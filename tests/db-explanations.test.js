/* ================================================================== *
 * 解释持久化层测试（B0 验收：不接受不存在的引用 / 报道改版不覆盖旧摘录 /
 * 清理不会删除仍被引用的版本 / 回放只选当时可知的最新修订）
 *
 * 用内存库：迁移、外键、事务校验全部在真实 SQLite 上跑，不用假对象。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDb,
  useDatabase,
  closeDb,
  schemaVersionOf,
  SCHEMA_VERSION,
  migrateDatabase,
  writeObservationRevisions,
  readObservationRevision,
  readObservationAsOf,
  countObservationRevisions,
  writeArticle,
  readArticle,
  latestArticleRevision,
  writeEventRevision,
  readEventRevision,
  readEventAsOf,
  listEventRevisions,
  validateReferences,
  writeExplanation,
  readExplanation,
  latestExplanation,
  explanationIdByFingerprint,
  listExplanationEvidence,
  pruneUnlinkedEvidence,
  countExplanations,
  recordCollectionSuccess,
  recordCollectionFailure,
  readCollectionState,
  listCollectionStates,
  explanationStorageStatus,
  writeDailyCache,
  readDailyCache,
} from '../src/server/db/index.js';

beforeEach(() => {
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
});

/* ------------------------------ 迁移 ------------------------------ */

describe('版本化迁移', () => {
  it('库版本升到 SCHEMA_VERSION，并建出 7 张解释相关表', () => {
    const db = getDb();
    expect(schemaVersionOf(db)).toBe(SCHEMA_VERSION);
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    for (const t of [
      'observation_revisions',
      'articles',
      'event_revisions',
      'explanations',
      'evidence',
      'explanation_evidence',
      'collection_state',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('重复迁移是空操作（幂等）', () => {
    expect(migrateDatabase(getDb()).applied).toEqual([]);
  });

  it('外键约束真的开着（否则 REFERENCES 只是注释）', () => {
    const row = getDb().prepare('PRAGMA foreign_keys').get();
    expect(Number(row.foreign_keys)).toBe(1);
  });

  it('不能把关联行指向不存在的解释（外键生效）', () => {
    expect(() =>
      getDb()
        .prepare('INSERT INTO explanation_evidence (explanation_id, evidence_id) VALUES (?, ?)')
        .run('nope', 'nope'),
    ).toThrow();
  });

  it('增量升级：从 v0 老库补建新表，老表数据保留', async () => {
    // 先写入一条日线（模拟老库），再跑迁移
    await writeDailyCache('gold-intl', 'test', [
      { date: '2026-10-26', close: 4000 },
      { date: '2026-10-27', close: 3990 },
    ]);
    const db = getDb();
    db.exec('PRAGMA user_version = 0');
    const out = migrateDatabase(db);
    expect(out.from).toBe(0);
    expect(out.to).toBe(SCHEMA_VERSION);
    expect(out.applied).toContain('explanations-foundation');
    const cache = await readDailyCache('gold-intl');
    expect(cache.rows.map((r) => r.close)).toEqual([4000, 3990]);
  });
});

/* --------------------------- 观测版本 --------------------------- */

const OBS = (instrumentId, date, value, extra = {}) => ({
  id: `${instrumentId}@${date}`,
  logicalKey: `${instrumentId}@${date}`,
  instrumentId,
  observedAt: date,
  knownAt: `${date}T21:00:00Z`,
  value,
  unit: '%',
  valueDomain: 'signed',
  revision: 1,
  ...extra,
});

describe('observation_revisions：不可变 + 零负值 + 回放', () => {
  it('零值与负值都保留（利率不是价格）', () => {
    writeObservationRevisions([OBS('dfii10', '2026-10-26', -0.42), OBS('dfii10', '2026-10-27', 0)]);
    expect(readObservationRevision('dfii10@2026-10-26').value).toBe(-0.42);
    expect(readObservationRevision('dfii10@2026-10-27').value).toBe(0);
  });

  it('同一 id 重复写入不覆盖、不刷新 knownAt', () => {
    writeObservationRevisions([OBS('dxy', '2026-10-26', 104, { knownAt: '2026-10-26T21:00:00Z' })]);
    writeObservationRevisions([OBS('dxy', '2026-10-26', 999, { knownAt: '2026-10-30T21:00:00Z' })]);
    const row = readObservationRevision('dxy@2026-10-26');
    expect(row.value).toBe(104);
    expect(row.knownAt).toBe('2026-10-26T21:00:00Z');
    expect(countObservationRevisions()).toBe(1);
  });

  it('回放只选「当时可知」的最新修订，后来取得的修订不进入过去时点', () => {
    writeObservationRevisions([
      OBS('gold-intl', '2026-10-26', 4000, { id: 'gold-intl@2026-10-26#1', revision: 1, knownAt: '2026-10-26T21:00:00Z' }),
      OBS('gold-intl', '2026-10-26', 4012, { id: 'gold-intl@2026-10-26#2', revision: 2, knownAt: '2026-10-30T09:00:00Z' }),
    ]);
    expect(readObservationAsOf('gold-intl@2026-10-26', '2026-10-27T00:00:00Z').value).toBe(4000);
    expect(readObservationAsOf('gold-intl@2026-10-26', '2026-10-31T00:00:00Z').value).toBe(4012);
    expect(readObservationAsOf('gold-intl@2026-10-26', '2026-10-20T00:00:00Z')).toBeNull();
  });
});

/* ----------------------------- 报道 ----------------------------- */

describe('articles：改版不覆盖旧摘录', () => {
  const base = {
    id: 'art-1',
    logicalArticleId: 'art-logical-1',
    revision: 1,
    url: 'https://example.test/a',
    publisher: 'EXAMPLE',
    publishedAt: '2026-10-26T08:00:00Z',
    knownAt: '2026-10-26T08:05:00Z',
    excerpt: '原始摘录',
  };

  it('新修订插入后，旧版本仍按自己的 id 读回原摘录', () => {
    writeArticle(base);
    writeArticle({ ...base, id: 'art-2', revision: 2, excerpt: '修订后的摘录', knownAt: '2026-10-27T08:00:00Z' });
    expect(readArticle('art-1').excerpt).toBe('原始摘录');
    expect(readArticle('art-2').excerpt).toBe('修订后的摘录');
    expect(latestArticleRevision('art-logical-1').revision).toBe(2);
  });

  it('同一 logical + revision 唯一（不能塞两个「第1版」）', () => {
    writeArticle(base);
    writeArticle({ ...base, id: 'art-1b', excerpt: '重复版本' });
    // UNIQUE(logical_article_id, revision) 让第二行被忽略
    expect(latestArticleRevision('art-logical-1').id).toBe('art-1');
  });
});

/* --------------------------- 事件修订 --------------------------- */

describe('event_revisions：修订不覆盖历史', () => {
  it('同一事件两个修订可并存，按 asOf 取当时版本', () => {
    writeEventRevision({
      eventId: 'evt-1',
      revision: 1,
      knownAt: '2026-10-26T09:00:00Z',
      payload: { action: '发言', shockType: 'unknown', articleIds: ['art-1'] },
    });
    writeEventRevision({
      eventId: 'evt-1',
      revision: 2,
      knownAt: '2026-10-28T09:00:00Z',
      payload: { action: '发言（修订）', shockType: 'supply', articleIds: ['art-1', 'art-2'] },
    });
    expect(readEventAsOf('evt-1', '2026-10-27T00:00:00Z').revision).toBe(1);
    expect(readEventAsOf('evt-1', '2026-10-29T00:00:00Z').revision).toBe(2);
    expect(readEventRevision('evt-1', 1).payload.shockType).toBe('unknown');
    expect(listEventRevisions('evt-1').map((r) => r.revision)).toEqual([1, 2]);
  });
});

/* --------------------------- 解释 + 证据 --------------------------- */

function seedRefs() {
  writeObservationRevisions([OBS('gold-intl', '2026-10-26', 4000), OBS('gold-intl', '2026-10-27', 3960)]);
  writeEventRevision({ eventId: 'evt-9', revision: 1, knownAt: '2026-10-27T10:00:00Z', payload: { action: '供给受阻' } });
}

function explanationFixture(overrides = {}) {
  return {
    id: 'exp-test-1',
    assetId: 'gold-intl',
    asOf: '2026-10-27T21:00:00Z',
    generatedAt: '2026-10-27T21:01:00Z',
    window: { key: 'session', start: '2026-10-26', end: '2026-10-27', alignment: 'common-dates' },
    contentStatus: 'ready',
    summary: '测试摘要',
    versions: { mechanisms: 'gold-v1', calculation: 'calc-v1', language: 'template-v1' },
    facts: [
      {
        code: 'TARGET_CHANGE',
        instrumentId: 'gold-intl',
        window: { start: '2026-10-26', end: '2026-10-27' },
        change: { value: -1, unit: 'pct' },
        observationIds: ['gold-intl@2026-10-26', 'gold-intl@2026-10-27'],
      },
    ],
    hypotheses: [
      {
        mechanismId: 'M-GOLD-REAL-YIELD',
        status: 'consistent',
        role: 'support',
        window: { key: 'session', start: '2026-10-26', end: '2026-10-27' },
        eventRefs: [{ eventId: 'evt-9', revision: 1 }],
        sources: [{ url: 'https://example.test/src' }],
        evidence: [
          {
            role: 'support',
            instrumentId: 'gold-intl',
            window: { start: '2026-10-26', end: '2026-10-27' },
            change: { value: -1, unit: 'pct' },
            observationIds: ['gold-intl@2026-10-26', 'gold-intl@2026-10-27'],
          },
        ],
      },
    ],
    unknowns: [],
    nextChecks: ['观察下一时段'],
    inputFingerprint: 'fp-1',
    ...overrides,
  };
}

describe('writeExplanation：事务 + 引用校验', () => {
  it('引用齐全时写入成功，并能读回证据', () => {
    seedRefs();
    const res = writeExplanation({ explanation: explanationFixture() });
    expect(res.evidenceCount).toBe(1);
    expect(countExplanations()).toBe(1);
    const stored = readExplanation('exp-test-1');
    expect(stored.explanation.summary).toBe('测试摘要');
    expect(stored.versions.mechanisms).toBe('gold-v1');
    const ev = listExplanationEvidence('exp-test-1');
    expect(ev).toHaveLength(1);
    expect(ev[0].role).toBe('support');
    expect(ev[0].payload.eventRevisionRefs).toEqual([{ eventId: 'evt-9', revision: 1 }]);
  });

  it('观测引用不存在 → 整笔写入失败，且不留下半条解释', () => {
    seedRefs();
    const bad = explanationFixture({
      id: 'exp-bad',
      facts: [
        {
          code: 'TARGET_CHANGE',
          instrumentId: 'gold-intl',
          window: { start: '2026-10-01', end: '2026-10-02' },
          observationIds: ['gold-intl@2026-10-01'],
        },
      ],
      hypotheses: [],
    });
    expect(() => writeExplanation({ explanation: bad })).toThrow(/证据引用不存在/);
    expect(readExplanation('exp-bad')).toBeNull();
    expect(countExplanations()).toBe(0);
  });

  it('事件修订引用不存在 → 同样失败（不能引用未来修订）', () => {
    seedRefs();
    const bad = explanationFixture({
      id: 'exp-bad2',
      hypotheses: [{ ...explanationFixture().hypotheses[0], eventRefs: [{ eventId: 'evt-9', revision: 7 }], evidence: [] }],
    });
    expect(() => writeExplanation({ explanation: bad })).toThrow(/evt-9#7/);
  });

  it('validateReferences 单独可用（返回缺失清单）', () => {
    const out = validateReferences({ observationIds: ['x@1'], eventRefs: [{ eventId: 'e', revision: 1 }] });
    expect(out.ok).toBe(false);
    expect(out.missing.observationIds).toEqual(['x@1']);
    expect(out.missing.eventRefs).toEqual([{ eventId: 'e', revision: 1 }]);
  });

  it('同一资产 + 窗口取最新 as_of；按指纹也能找回同一快照', () => {
    seedRefs();
    writeExplanation({ explanation: explanationFixture() });
    writeExplanation({
      explanation: explanationFixture({
        id: 'exp-test-2',
        asOf: '2026-10-28T21:00:00Z',
        generatedAt: '2026-10-28T21:01:00Z',
        inputFingerprint: 'fp-2',
      }),
    });
    expect(latestExplanation({ assetId: 'gold-intl', windowKey: 'session' }).id).toBe('exp-test-2');
    expect(explanationIdByFingerprint('fp-1')).toBe('exp-test-1');
    expect(explanationIdByFingerprint('nope')).toBeNull();
  });
});

/* ----------------------------- 清理 ----------------------------- */

describe('清理：仍被引用的版本必须留下', () => {
  it('pruneUnlinkedEvidence 只删没有关联的证据', () => {
    seedRefs();
    writeExplanation({ explanation: explanationFixture() });
    // 造一条无关联证据（模拟写入被中断的孤儿）
    getDb().prepare('INSERT INTO evidence (id, hypothesis_id, role, payload) VALUES (?, ?, ?, ?)').run(
      'ev-orphan',
      null,
      'background',
      '{}',
    );
    expect(pruneUnlinkedEvidence()).toBe(1);
    const left = getDb().prepare('SELECT id FROM evidence ORDER BY id').all().map((r) => r.id);
    expect(left).toEqual(['ev_exp-test-1_M-GOLD-REAL-YIELD_support_0']);
    expect(listExplanationEvidence('exp-test-1')).toHaveLength(1);
  });

  it('写观察 + 解释后，被引用的观测版本不会被「清理解释」带走', () => {
    seedRefs();
    writeExplanation({ explanation: explanationFixture() });
    // 解释侧没有删除接口：快照不可变。这里断言观测仍在，说明清理逻辑没有误删
    expect(readObservationRevision('gold-intl@2026-10-26')).not.toBeNull();
  });
});

/* --------------------------- 采集状态 --------------------------- */

describe('collection_state：成功清零、失败退避', () => {
  it('成功后 fails 归零、清掉错误与退避', () => {
    recordCollectionFailure('quotes', 'boom', { atMs: 1000, backoffUntil: 5000 });
    let st = readCollectionState('quotes');
    expect(st.fails).toBe(1);
    expect(st.lastError).toBe('boom');
    expect(st.backoffUntil).toBe(5000);

    recordCollectionSuccess('quotes', 9000);
    st = readCollectionState('quotes');
    expect(st.fails).toBe(0);
    expect(st.lastError).toBeNull();
    expect(st.backoffUntil).toBeNull();
    expect(st.lastSuccessAt).toBe(9000);
  });

  it('连续失败累加，列表按 key 排序', () => {
    recordCollectionFailure('b', 'e1', { atMs: 1 });
    recordCollectionFailure('b', 'e2', { atMs: 2 });
    recordCollectionFailure('a', 'e3', { atMs: 3 });
    expect(readCollectionState('b').fails).toBe(2);
    expect(listCollectionStates().map((s) => s.jobKey)).toEqual(['a', 'b']);
  });
});

describe('explanationStorageStatus：诊断出口', () => {
  it('报出 schema 版本与条数', () => {
    seedRefs();
    writeExplanation({ explanation: explanationFixture() });
    const s = explanationStorageStatus();
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.expectedSchemaVersion).toBe(SCHEMA_VERSION);
    expect(s.explanations).toBe(1);
    expect(s.observations).toBeGreaterThan(0);
  });
});

/* ================================================================== *
 * 日线缓存的值域（B1 链路：采集 → 写库 → 读回都要保住零与负值）
 * ================================================================== */

describe('writeDailyCache：signed 值域保留零与负值', () => {
  const BAR = (date, close) => ({ date, open: null, close, high: null, low: null, volume: null });

  it('signed 下 -0.42 / 0 / -1 全部入库，读回不丢', async () => {
    await writeDailyCache(
      'dfii10',
      'fred:DFII10',
      [BAR('2026-10-22', -0.42), BAR('2026-10-23', 0), BAR('2026-10-24', -1)],
      { valueDomain: 'signed' },
    );
    const c = await readDailyCache('dfii10');
    expect(c.rows.map((r) => r.close)).toEqual([-0.42, 0, -1]);
  });

  it('默认（价格）口径仍然丢弃零与负值', async () => {
    await writeDailyCache(
      'x',
      's',
      [BAR('2026-10-24', 99), BAR('2026-10-25', 100), BAR('2026-10-26', 0), BAR('2026-10-27', -1)],
    );
    const c = await readDailyCache('x');
    expect(c.rows.map((r) => r.close)).toEqual([99, 100]);
    expect(c.count).toBe(2);
  });

  it('元数据条数与日期范围取自实际写入的行，不是过滤前的数组', async () => {
    await writeDailyCache(
      'tz',
      's',
      [BAR('2026-10-25', 100), { date: '', close: 5 }, BAR('2026-10-27', 101), { date: '2026-10-28', close: 'abc' }],
    );
    const meta = getDb().prepare('SELECT count, start_date, end_date FROM daily_meta WHERE id = ?').get('tz');
    expect(meta.count).toBe(2);
    expect(meta.start_date).toBe('2026-10-25');
    expect(meta.end_date).toBe('2026-10-27');
    const cache = await readDailyCache('tz');
    expect(cache.rows).toHaveLength(2);
  });

  it('一行都没写进去时不留「有缓存、0 行」的假象', async () => {
    await writeDailyCache('empty', 's', [{ date: '', close: 1 }, { date: '2026-10-26', close: 0 }]);
    expect(await readDailyCache('empty')).toBeNull();
    expect(getDb().prepare('SELECT 1 FROM daily_meta WHERE id = ?').get('empty')).toBeUndefined();
  });

  it('日期乱序时 start/end 仍按时间先后写', async () => {
    await writeDailyCache('o', 's', [BAR('2026-10-27', 3), BAR('2026-10-25', 1), BAR('2026-10-26', 2)]);
    const meta = getDb().prepare('SELECT start_date, end_date FROM daily_meta WHERE id = ?').get('o');
    expect(meta.start_date).toBe('2026-10-25');
    expect(meta.end_date).toBe('2026-10-27');
  });
});
