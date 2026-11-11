/* ================================================================== *
 * Phase 3 / P3-T2：SQLite v5 四维智能预警引擎 + REST + SSE 告警推送
 *
 * 验收（规格书 §3.2）：
 *   · Migration v5 建 alert_rules / alert_events，SCHEMA_VERSION = 5；
 *   · evaluateAlertRules 覆盖 price / change_pct / spread / divergence 四类
 *     条件与 cooldown_ms 冷却去重；
 *   · GET /api/alerts 与 POST /api/alerts（创建/更新/删除/手动评估）端到端；
 *   · SSE 广播 `alert` 事件帧，客户端 bus.emit('alert', payload)；
 *   · 采集完成后自动评估规则并推送。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS, SCHEMA_VERSION, migrateDatabase } from '../src/server/db/migrations.js';
import {
  evaluateAlertRules,
  ALERT_KINDS,
  OPERATORS,
} from '../src/server/domain/alerts.js';
import { createAlertsService } from '../src/server/services/alerts.service.js';
import { createSseHub } from '../src/server/realtime/sse-hub.js';
import { createApp } from '../src/server/app.js';
import { startCollector } from '../src/server/jobs/collector.js';

/* ------------------------------ 迁移 ------------------------------ */

describe('Migration v5：预警表', () => {
  it('SCHEMA_VERSION = 5，且末尾迁移名为 alerts-engine', () => {
    expect(SCHEMA_VERSION).toBe(5);
    expect(MIGRATIONS[MIGRATIONS.length - 1]).toMatchObject({ version: 5, name: 'alerts-engine' });
  });

  it('在空库上建出 alert_rules / alert_events 及索引', () => {
    const db = new DatabaseSync(':memory:');
    const out = migrateDatabase(db);
    expect(out.to).toBe(5);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    expect(tables).toContain('alert_rules');
    expect(tables).toContain('alert_events');
    const cols = db.prepare('PRAGMA table_info(alert_rules)').all().map((r) => r.name);
    expect(cols).toEqual([
      'id', 'name', 'kind', 'target_id', 'operator', 'threshold',
      'enabled', 'cooldown_ms', 'last_triggered_at', 'created_at',
    ]);
    db.close();
  });

  it('重复迁移幂等，不报错、不重复建表', () => {
    const db = new DatabaseSync(':memory:');
    migrateDatabase(db);
    expect(() => migrateDatabase(db)).not.toThrow();
    const rows = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='alert_rules'").get();
    expect(rows.n).toBe(1);
    db.close();
  });
});

/* -------------------------- 纯函数评估器 -------------------------- */

const QUOTES = [
  { id: 'gold-intl', price: 2800, changePct: 2.4 },
  { id: 'btc', price: 95000, changePct: -3.1 },
  { id: 'sp500', price: 5900, changePct: 0.2 },
];
const SYNTHEtics = [
  { id: 'gold-silver-ratio', ok: true, value: 88.5 },
  { id: 'us-cn-10y-spread', ok: true, value: -1.8 },
];
const DIVERGENCES = [
  { edge: 'us10y->gold-intl', significant: true, score: 0.8 },
  { edge: 'dxy->oil', significant: false, score: 0.1 },
];

describe('evaluateAlertRules：四维条件', () => {
  it('导出四种 kind 与四个比较运算符', () => {
    expect(ALERT_KINDS).toEqual(['price', 'change_pct', 'spread', 'divergence']);
    expect(OPERATORS).toEqual(['>', '>=', '<', '<=']);
  });

  it('price：> 越界触发，未越界不触发', () => {
    const rules = [{ id: 'r1', name: '金价破位', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 2750 }];
    const hits = evaluateAlertRules(rules, { quotes: QUOTES }, { nowMs: 1000 });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ ruleId: 'r1', kind: 'price', observedValue: 2800 });
    expect(hits[0].title).toContain('金价破位');
    expect(hits[0].message).toContain('2800');
    expect(evaluateAlertRules(rules, { quotes: QUOTES.map((q) => ({ ...q, price: 2700 })) }, { nowMs: 1000 })).toHaveLength(0);
  });

  it('price 支持 >= / < / <= 三种运算符', () => {
    const mk = (operator, threshold) => [{ id: 'r', name: 'r', kind: 'price', target_id: 'gold-intl', operator, threshold }];
    expect(evaluateAlertRules(mk('>=', 2800), { quotes: QUOTES }, { nowMs: 1 })).toHaveLength(1);
    expect(evaluateAlertRules(mk('<', 2900), { quotes: QUOTES }, { nowMs: 1 })).toHaveLength(1);
    expect(evaluateAlertRules(mk('<=', 2800), { quotes: QUOTES }, { nowMs: 1 })).toHaveLength(1);
    expect(evaluateAlertRules(mk('<', 2700), { quotes: QUOTES }, { nowMs: 1 })).toHaveLength(0);
  });

  it('change_pct：默认按带符号涨跌幅；abs_pct 按绝对值', () => {
    const signed = [{ id: 'a', name: 'a', kind: 'change_pct', target_id: 'btc', operator: '<', threshold: -2 }];
    expect(evaluateAlertRules(signed, { quotes: QUOTES }, { nowMs: 1 })).toHaveLength(1);
    const abs = [{ id: 'b', name: 'b', kind: 'change_pct', target_id: 'btc', operator: '>', threshold: 3, mode: 'abs_pct' }];
    expect(evaluateAlertRules(abs, { quotes: QUOTES }, { nowMs: 1 })).toHaveLength(1);
  });

  it('spread：读取合成指标（含内嵌 gold-premium / bw-spread）', () => {
    const ctx = { quotes: QUOTES, synthetics: [...SYNTHEtics, { id: 'gold-premium', ok: true, value: 12 }, { id: 'bw-spread', ok: true, value: 3 }] };
    const mk = (id, threshold) => [{ id: 's', name: 's', kind: 'spread', target_id: id, operator: '>', threshold }];
    expect(evaluateAlertRules(mk('gold-silver-ratio', 80), ctx, { nowMs: 1 })).toHaveLength(1);
    expect(evaluateAlertRules(mk('gold-premium', 10), ctx, { nowMs: 1 })).toHaveLength(1);
    expect(evaluateAlertRules(mk('bw-spread', 5), ctx, { nowMs: 1 })).toHaveLength(0);
    expect(evaluateAlertRules(mk('gold-silver-ratio', 100), ctx, { nowMs: 1 })).toHaveLength(0);
  });

  it('divergence：目标边显著背离时触发；target_id=any 时任意核心边触发', () => {
    const mk = (target) => [{ id: 'd', name: 'd', kind: 'divergence', target_id: target, operator: '>', threshold: 0 }];
    expect(evaluateAlertRules(mk('us10y->gold-intl'), { quotes: QUOTES, divergences: DIVERGENCES }, { nowMs: 1 })).toHaveLength(1);
    expect(evaluateAlertRules(mk('dxy->oil'), { quotes: QUOTES, divergences: DIVERGENCES }, { nowMs: 1 })).toHaveLength(0);
    expect(evaluateAlertRules(mk('any'), { quotes: QUOTES, divergences: DIVERGENCES }, { nowMs: 1 })).toHaveLength(1);
  });

  it('cooldown_ms：冷却期内跳过，冷却期外再次触发', () => {
    const rules = [{ id: 'r1', name: 'r', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1, cooldown_ms: 300_000, last_triggered_at: 1000 }];
    expect(evaluateAlertRules(rules, { quotes: QUOTES }, { nowMs: 1000 + 299_999 })).toHaveLength(0);
    expect(evaluateAlertRules(rules, { quotes: QUOTES }, { nowMs: 1000 + 300_000 })).toHaveLength(1);
  });

  it('disabled 规则与非法数据不触发；坏规则不拖垮整批评估', () => {
    const rules = [
      { id: 'off', name: 'off', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1, enabled: 0 },
      { id: 'bad', name: 'bad', kind: 'nope', target_id: 'x', operator: '>', threshold: 1 },
      { id: 'nan', name: 'nan', kind: 'price', target_id: 'missing', operator: '>', threshold: 1 },
      { id: 'ok', name: 'ok', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1 },
    ];
    const hits = evaluateAlertRules(rules, { quotes: QUOTES }, { nowMs: 1 });
    expect(hits.map((h) => h.ruleId)).toEqual(['ok']);
  });

  it('触发帧带 triggeredAt / observedValue / title / message', () => {
    const hits = evaluateAlertRules(
      [{ id: 'r', name: 'n', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1 }],
      { quotes: QUOTES }, { nowMs: 12345 },
    );
    expect(hits[0]).toMatchObject({ triggeredAt: 12345, observedValue: 2800 });
    expect(typeof hits[0].title).toBe('string');
    expect(typeof hits[0].message).toBe('string');
  });
});

/* --------------------------- CRUD 服务 --------------------------- */

function memoryDb() {
  const db = new DatabaseSync(':memory:');
  migrateDatabase(db);
  return db;
}
function baseService(opts = {}) {
  return createAlertsService({ db: memoryDb(), now: () => 1000, ...opts });
}

describe('alerts.service：CRUD 与持久化', () => {
  it('listRules 初始为空；createRule 生成 id/created_at 并可查回', () => {
    const svc = baseService();
    expect(svc.listRules()).toEqual([]);
    const rule = svc.createRule({ name: '金价', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 2750 });
    expect(rule.id).toBeTruthy();
    expect(rule.created_at).toBe(1000);
    expect(svc.listRules()).toHaveLength(1);
    expect(svc.listRules()[0]).toMatchObject({ name: '金价', enabled: 1, cooldown_ms: 300_000 });
  });

  it('createRule 拒绝非法 kind / operator / 缺字段', () => {
    const svc = baseService();
    expect(() => svc.createRule({ name: 'x', kind: 'nope', target_id: 'a', operator: '>', threshold: 1 })).toThrow(/kind/);
    expect(() => svc.createRule({ name: 'x', kind: 'price', target_id: 'a', operator: '??', threshold: 1 })).toThrow(/operator/);
    expect(() => svc.createRule({ name: '', kind: 'price', target_id: 'a', operator: '>', threshold: 1 })).toThrow(/name/);
  });

  it('updateRule 按 id 改字段；deleteRule 删除；不存在返回 null/false', () => {
    const svc = baseService();
    const r = svc.createRule({ name: 'a', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1 });
    const updated = svc.updateRule(r.id, { threshold: 999, enabled: 0 });
    expect(updated.threshold).toBe(999);
    expect(updated.enabled).toBe(0);
    expect(svc.updateRule('nope', { threshold: 1 })).toBe(null);
    expect(svc.deleteRule(r.id)).toBe(true);
    expect(svc.deleteRule('nope')).toBe(false);
    expect(svc.listRules()).toHaveLength(0);
  });

  it('evaluate 写 alert_events、更新 last_triggered_at、遵守冷却', () => {
    const svc = baseService({ now: () => 1000 });
    svc.createRule({ id: 'r1', name: '金价预警', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1, cooldown_ms: 300_000 });
    const first = svc.evaluate({ quotes: QUOTES });
    expect(first).toHaveLength(1);
    expect(svc.listEvents()).toHaveLength(1);
    expect(svc.listRules()[0].last_triggered_at).toBe(1000);
    const second = svc.evaluate({ quotes: QUOTES });
    expect(second).toHaveLength(0);
    expect(svc.listEvents()).toHaveLength(1);
  });

  it('SSE 广播：evaluate 命中时推 alert 帧并更新 hub.stats', () => {
    const hub = createSseHub();
    const res = {
      writeHead() { return this; }, write() { return true; }, end() {}, on() { return this; },
    };
    hub.handle({ method: 'GET' }, res);
    const svc = baseService({ sseHub: hub });
    svc.createRule({ id: 'r1', name: 'r', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1 });
    svc.evaluate({ quotes: QUOTES });
    expect(hub.stats().alert).toBe(1);
    hub.close();
  });
});

/* --------------------------- REST 路由 --------------------------- */

function jsonRes() {
  return {
    statusCode: 0, body: '', headers: {},
    writeHead(code, headers = {}) { this.statusCode = code; Object.assign(this.headers, headers); return this; },
    end(buf) { this.body = String(buf ?? ''); },
  };
}
const parse = (res) => JSON.parse(res.body);

describe('GET/POST /api/alerts', () => {
  function appWith(overrides = {}) {
    const service = overrides.service ?? baseService();
    const app = createApp({
      sseHub: overrides.sseHub ?? createSseHub(),
      ttlMs: 15_000,
      alertsService: service,
    });
    return { app, service };
  }

  it('GET 返回 { ok:true, rules, recentEvents }', async () => {
    const { app, service } = appWith();
    service.createRule({ name: 'r', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1 });
    const res = jsonRes();
    await app({ method: 'GET', url: '/api/alerts', headers: { host: 'localhost' } }, res);
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toMatchObject({ ok: true });
    expect(parse(res).rules).toHaveLength(1);
    expect(Array.isArray(parse(res).recentEvents)).toBe(true);
  });

  it('POST 创建规则；action=delete 删除；action=evaluate 手动评估', async () => {
    const { app } = appWith();
    const post = async (body) => {
      const res = jsonRes();
      await app({
        method: 'POST', url: '/api/alerts', headers: { host: 'localhost', 'content-type': 'application/json' },
        body,
      }, res);
      return { res, data: parse(res) };
    };
    const created = await post({ name: '金价', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1 });
    expect(created.res.statusCode).toBe(200);
    expect(created.data.ok).toBe(true);
    const id = created.data.rule.id;
    const evaluated = await post({ action: 'evaluate', context: { quotes: QUOTES } });
    expect(evaluated.data.triggered).toHaveLength(1);
    const deleted = await post({ action: 'delete', id });
    expect(deleted.data.ok).toBe(true);
    const listed = jsonRes();
    await app({ method: 'GET', url: '/api/alerts', headers: { host: 'localhost' } }, listed);
    expect(parse(listed).rules).toHaveLength(0);
  });

  it('POST 非法 body 返回 400；服务未注入时 503', async () => {
    const { app } = appWith();
    const bad = jsonRes();
    await app({ method: 'POST', url: '/api/alerts', headers: { host: 'localhost' }, body: 'not json' }, bad);
    expect(bad.statusCode).toBe(400);
    const noSvc = createApp({ sseHub: createSseHub(), ttlMs: 1000 });
    const res = jsonRes();
    await noSvc({ method: 'GET', url: '/api/alerts', headers: { host: 'localhost' } }, res);
    expect(res.statusCode).toBe(503);
  });

  it('POST 完全没有 body 时按空对象处理，不因不可迭代的 req 变成 500', async () => {
    const { app } = appWith();
    const res = jsonRes();
    await app({ method: 'POST', url: '/api/alerts', headers: { host: 'localhost' } }, res);
    expect(res.statusCode).toBe(400);
    expect(parse(res).error).toMatch(/name/);
  });

  it('其他未知 POST 路径仍然 405（白名单只放行 /api/alerts 与 maintenance）', async () => {
    const { app } = appWith();
    const res = jsonRes();
    await app({ method: 'POST', url: '/api/quotes', headers: { host: 'localhost' } }, res);
    expect(res.statusCode).toBe(405);
  });
});

/* --------------------- 客户端 alert 监听 --------------------- */

// jsdom 无关：createRealtime 的 alert 监听只依赖注入的 EventSource 桩
class FakeEventSource {
  static instances = [];
  static OPEN = 1;
  constructor(url) { this.url = url; this.readyState = 0; this.listeners = {}; FakeEventSource.instances.push(this); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  close() { this.readyState = 2; }
  open() { this.readyState = 1; this.listeners.open?.({}); }
  emit(type, data) { this.listeners[type]?.({ data: JSON.stringify(data) }); }
}

describe('客户端 SSE alert 帧', () => {
  it('收到 alert 帧时 bus.emit("alert", payload)', async () => {
    const { createRealtime } = await import('../src/client/shared/realtime.js');
    const emitted = [];
    const rt = createRealtime({ store: {}, EventSourceImpl: FakeEventSource, bus: { emit: (e, p) => emitted.push([e, p]) } });
    rt.connect();
    const es = FakeEventSource.instances.at(-1);
    es.open();
    es.emit('alert', { ruleId: 'r1', title: '金价预警', observedValue: 2800 });
    expect(emitted).toEqual([['alert', { ruleId: 'r1', title: '金价预警', observedValue: 2800 }]]);
    rt.disconnect();
  });
});

/* --------------------- collector 评估钩子 --------------------- */

describe('采集完成后自动评估', () => {
  it('quotes 任务成功后调用 alertsService.evaluate 并推 SSE alert', async () => {
    const hub = createSseHub();
    const res = { writeHead() { return this; }, write() { return true; }, end() {}, on() { return this; } };
    hub.handle({ method: 'GET' }, res);
    const svc = baseService({ sseHub: hub });
    svc.createRule({ id: 'r1', name: 'r', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1 });
    const collector = startCollector({
      jobs: [{ key: 'quotes', run: async () => ({ quotes: QUOTES, synthetics: SYNTHEtics, divergences: DIVERGENCES }), intervalMs: 1000 }],
      everyMs: 1000, sseHub: hub, alertsService: svc,
    });
    await collector.collector.tick({ force: true });
    expect(svc.listEvents()).toHaveLength(1);
    expect(hub.stats().alert).toBe(1);
    collector.stop();
    hub.close();
  });
});
