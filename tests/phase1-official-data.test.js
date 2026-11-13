/* ================================================================== *
 * Phase 1 / P1-T2：官方 API 与「预期与实际」台账
 *
 * 验收：
 *   · 代码库里彻底没有 r.jina.ai；
 *   · FRED_API_KEY 非空时走官方 JSON API，未配置时回退 CSV；
 *   · 日历项带 expected / actual / previous / tolerance；
 *   · getExpectationLedger() 对已公布事件产出 above / below / inLine；
 *   · 官方源全挂时确定性种子表保底，日历不空。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FRED_JSON = JSON.stringify({
  observations: [
    { date: '2026-10-27', value: '4.25' },
    { date: '2026-10-24', value: '4.20' },
    { date: '2026-10-23', value: '.' },
    { date: '2026-10-22', value: '4.18' },
  ],
});

vi.mock('../src/server/providers/http.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchRaw: vi.fn() };
});

const { fetchRaw } = await import('../src/server/providers/http.js');
const fred = await import('../src/server/providers/fred.js');
const cal = await import('../src/server/services/calendar.service.js');
const bls = await import('../src/server/services/bls-series.service.js');
const { getExpectationLedger } = await import('../src/server/services/expectations.service.js');

beforeEach(() => {
  fetchRaw.mockReset();
  cal.calCache.clear();
  delete process.env.FRED_API_KEY;
  delete process.env.BLS_API_KEY;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.FRED_API_KEY;
  delete process.env.BLS_API_KEY;
});

describe('r.jina.ai 已从代码库移除', () => {
  it('src/ 下没有任何 r.jina.ai 字符串', () => {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
    const files = walk(path.join(ROOT, 'src'));
    const offenders = files.filter((f) => /r\.jina\.ai/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('FRED 官方 JSON API 优先', () => {
  it('配置 FRED_API_KEY 时请求 api.stlouisfed.org 的 observations 端点', async () => {
    process.env.FRED_API_KEY = 'test-key-123';
    fetchRaw.mockResolvedValue(FRED_JSON);
    const out = await fred.fetchFredObservations('DGS10', { limit: 4 });
    const url = fetchRaw.mock.calls[0][0];
    expect(url).toContain('https://api.stlouisfed.org/fred/series/observations');
    expect(url).toContain('series_id=DGS10');
    expect(url).toContain('api_key=test-key-123');
    expect(url).toContain('file_type=json');
    expect(url).toContain('sort_order=desc');
    expect(url).toContain('limit=4');
    expect(out.rows.map((r) => r.date)).toEqual(['2026-10-22', '2026-10-24', '2026-10-27']);
    expect(out.rows.map((r) => r.close)).toEqual([4.18, 4.2, 4.25]);
    expect(out.meta.source).toBe('fred:DGS10');
  });

  it('未配置 Key 时回退 CSV，且解析结果一致', async () => {
    fetchRaw.mockResolvedValue(
      ['observation_date,DGS10', '2026-10-22,4.18', '2026-10-24,4.20', '2026-10-27,4.25'].join('\n'),
    );
    const out = await fred.fetchFredObservations('DGS10', { limit: 4 });
    expect(fetchRaw.mock.calls[0][0]).toContain('fredgraph.csv');
    expect(out.rows.map((r) => r.close)).toEqual([4.18, 4.2, 4.25]);
  });

  it('官方 JSON 返回缺值/坏值时跳过，不把 "." 补成 0', async () => {
    process.env.FRED_API_KEY = 'k';
    fetchRaw.mockResolvedValue(FRED_JSON);
    const out = await fred.fetchFredObservations('DGS10');
    expect(out.rows.every((r) => Number.isFinite(r.close))).toBe(true);
    expect(out.rows).toHaveLength(3);
  });
});

describe('BLS Public Data API v2 适配器', () => {
  const V2 = (values) => JSON.stringify({
    status: 'REQUEST_SUCCEEDED',
    Results: {
      series: [{ seriesID: 'CUUR0000SA0', data: values }],
    },
  });

  it('POST 到 /api/public/data/v2/timeseries/data/ 并带上 registrations', async () => {
    process.env.BLS_API_KEY = 'bls-key';
    fetchRaw.mockResolvedValue(V2([
      { year: '2026', period: 'M10', value: '3.2', periodName: 'October' },
      { year: '2026', period: 'M09', value: '3.0', periodName: 'September' },
    ]));
    const out = await bls.fetchBlsSeries('CUUR0000SA0', { limit: 2 });
    const [url, opts] = fetchRaw.mock.calls[0];
    expect(url).toContain('https://api.bls.gov/publicAPI/v2/timeseries/data/');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.seriesid).toContain('CUUR0000SA0');
    expect(body.registrationKey).toBe('bls-key');
    expect(out.latest).toBe(3.2);
    expect(out.previous).toBe(3);
  });

  it('没有 Key 也能用（v2 匿名限额）', async () => {
    fetchRaw.mockResolvedValue(V2([{ year: '2026', period: 'M10', value: '2.9' }]));
    const out = await bls.fetchBlsSeries('CUUR0000SA0');
    const body = JSON.parse(fetchRaw.mock.calls[0][1].body);
    expect(body.registrationKey).toBeUndefined();
    expect(out.latest).toBe(2.9);
  });

  it('四个核心序列都在注册表里', () => {
    for (const id of ['CUUR0000SA0', 'CUUR0000SA0L1E', 'CES0000000001', 'LNS14000000']) {
      expect(bls.BLS_SERIES[id]).toBeTruthy();
    }
  });
});

describe('确定性种子表：外网全挂也不空白', () => {
  it('FOMC_SEED / BLS_SEED 存在且带 releaseAt 与北京时间', () => {
    expect(cal.FOMC_SEED.length).toBeGreaterThan(0);
    expect(cal.BLS_SEED.length).toBeGreaterThan(0);
    for (const e of [...cal.FOMC_SEED, ...cal.BLS_SEED]) {
      expect(e.releaseAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('所有源失败时日历仍返回种子事件（ok=true）', async () => {
    fetchRaw.mockRejectedValue(new Error('offline'));
    const out = await cal.getCalendar({ force: true });
    expect(out.events.length).toBeGreaterThan(0);
    expect(out.ok).toBe(true);
  });

  it('fomcSeedForYear 对非 2026 年份按对应年份展开并显式标记 estimated', () => {
    const seed2027 = cal.fomcSeedForYear(2027);
    expect(seed2027.length).toBe(8);
    expect(seed2027.every((e) => e.date.startsWith('2027-') && e.estimated === true)).toBe(true);
    expect(seed2027[0].note).toContain('2026 会议节奏估算');
    expect(cal.FOMC_SEED.every((e) => e.estimated === false)).toBe(true);
  });
});

describe('已公布事件补齐结构化 actual / expected / previous', () => {
  it('attachReleaseNumbers 按 kind 挂上四个字段与容差', () => {
    const ev = { kind: 'cpi', releaseAt: '2026-10-13T12:30:00.000Z' };
    const out = cal.attachReleaseNumbers(ev, {
      cpi: { actual: 3.2, previous: 3.0, expected: 3.1, tolerance: 0.01 },
    });
    expect(out).toMatchObject({ actual: 3.2, previous: 3.0, expected: 3.1, tolerance: 0.01 });
  });

  it('未公布的事件不挂 actual（不能提前泄露结果）', () => {
    const out = cal.attachReleaseNumbers(
      { kind: 'cpi', releaseAt: '2099-01-01T12:30:00.000Z' },
      { cpi: { actual: 3.2, previous: 3.0, expected: 3.1 } },
      { nowMs: Date.parse('2026-11-11T00:00:00Z') },
    );
    expect(out.actual).toBeUndefined();
    expect(out.expected).toBe(3.1);
  });
});

describe('getExpectationLedger：真实产出 above / below / inLine', () => {
  const NOW = Date.parse('2026-11-11T12:00:00.000Z');
  const calWith = (events) => async () => ({ ok: true, upcoming: events, fetchedAt: new Date(NOW).toISOString() });

  it('above：实际高于预期', async () => {
    const ledger = await getExpectationLedger({
      nowMs: NOW,
      deps: { getCalendar: calWith([{
        title: '美国 CPI 消费者物价指数', kind: 'cpi',
        releaseAt: new Date(NOW - 3600_000).toISOString(),
        expected: 3.1, actual: 3.2, previous: 3.0, unit: '%',
      }]) },
    });
    expect(ledger.released[0].verdict).toBe('above');
    expect(ledger.counts.above).toBe(1);
  });

  it('below：实际低于预期', async () => {
    const ledger = await getExpectationLedger({
      nowMs: NOW,
      deps: { getCalendar: calWith([{
        title: '美国非农就业报告', kind: 'nfp',
        releaseAt: new Date(NOW - 3600_000).toISOString(),
        expected: 180, actual: 120, previous: 175, unit: '千人',
      }]) },
    });
    expect(ledger.released[0].verdict).toBe('below');
  });

  it('inLine：容差内基本符合预期', async () => {
    const ledger = await getExpectationLedger({
      nowMs: NOW,
      deps: { getCalendar: calWith([{
        title: '美国 CPI 消费者物价指数', kind: 'cpi',
        releaseAt: new Date(NOW - 3600_000).toISOString(),
        expected: 3.1, actual: 3.105, previous: 3.0, unit: '%',
      }]) },
    });
    expect(ledger.released[0].verdict).toBe('inLine');
  });
});
