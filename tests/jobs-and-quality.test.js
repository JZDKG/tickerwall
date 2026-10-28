/* ================================================================== *
 * 默认采集任务表 + 观测质量判定（方案 E06 前置 / 覆盖率补齐）
 *
 * 任务表的价值不在「有没有五个任务」，而在周期与触发关系对得上：
 *   · 日频指标不能跟着 15 秒轮询跑；
 *   · 报价成功要触发解释重建（否则页面上的解释会一直落后于行情）；
 *   · 解释自己有兜底周期（读的时候还会重算新鲜度）。
 * ================================================================== */

import { describe, it, expect, vi } from 'vitest';
import { buildDefaultJobs } from '../src/server/jobs/index.js';
import {
  assessObservationQuality,
  assessExplanationFreshness,
  assessWindowUsability,
} from '../src/server/domain/explanations/quality.js';

describe('默认任务表', () => {
  it('五个任务齐全且 key 唯一', () => {
    const jobs = buildDefaultJobs();
    const keys = jobs.map((j) => j.key);
    expect(keys).toEqual(['quotes', 'events', 'calendar', 'daily-series', 'explanations']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('每个任务都有周期、退避上下限与可调用的 run', () => {
    for (const j of buildDefaultJobs()) {
      expect(j.intervalMs).toBeGreaterThan(0);
      expect(j.backoffBaseMs).toBeGreaterThan(0);
      expect(j.maxBackoffMs).toBeGreaterThanOrEqual(j.backoffBaseMs);
      expect(typeof j.run).toBe('function');
    }
  });

  it('日频指标不跟秒级轮询：daily-series 的周期明显长于 quotes', () => {
    const byKey = new Map(buildDefaultJobs().map((j) => [j.key, j]));
    expect(byKey.get('daily-series').intervalMs).toBeGreaterThan(byKey.get('quotes').intervalMs * 10);
    expect(byKey.get('daily-series').intervalMs).toBe(60 * 60_000);
  });

  it('报价与日频成功后触发解释重建，其余不触发', () => {
    const byKey = new Map(buildDefaultJobs().map((j) => [j.key, j]));
    expect(byKey.get('quotes').triggers).toEqual(['explanations']);
    expect(byKey.get('daily-series').triggers).toEqual(['explanations']);
    expect(byKey.get('events').triggers).toBeUndefined();
    expect(byKey.get('calendar').triggers).toBeUndefined();
  });

  it('overrides 能替换全部 run —— 测试与调度验证都靠它', async () => {
    const calls = [];
    const mark = (name) => () => {
      calls.push(name);
      return Promise.resolve();
    };
    const jobs = buildDefaultJobs({
      quotes: mark('quotes'),
      events: mark('events'),
      calendar: mark('calendar'),
      observations: mark('observations'),
      explain: mark('explain'),
    });
    for (const j of jobs) await j.run();
    expect(calls).toEqual(['quotes', 'events', 'calendar', 'observations', 'explain']);
  });

  it('默认 run 真正调用服务（用 spy 断言一次调用即可，不联网）', async () => {
    const jobs = buildDefaultJobs({
      quotes: vi.fn(async () => ({ ok: true })),
    });
    const quotes = jobs.find((j) => j.key === 'quotes');
    await quotes.run();
    expect(jobs.find((j) => j.key === 'quotes').run).toHaveBeenCalledTimes(1);
  });
});

describe('观测质量：三态与两条原因', () => {
  const NOW = Date.parse('2026-10-28T00:00:00Z');

  it('没有观测时间 → unavailable（不是 fresh 也不是 stale）', () => {
    const q = assessObservationQuality({ instrumentId: 'gold-intl', lastObservedAt: null });
    expect(q.status).toBe('unavailable');
    expect(q.ageDays).toBeNull();
    expect(q.reasons).toEqual(['NO_OBSERVATION']);
    expect(q.notRealtime).toBe(true);
  });

  it('周期内 → fresh，且日频会标注「不是实时」', () => {
    const q = assessObservationQuality({ instrumentId: 'gold-intl', lastObservedAt: '2026-10-27', frequency: 'daily' }, { now: NOW });
    expect(q.status).toBe('fresh');
    expect(q.reasons).toEqual(['DAILY_NATURAL_LAG']);
    expect(q.notRealtime).toBe(true);
  });

  it('超过容错天数 → stale，并给出 BEYOND_UPDATE_CYCLE', () => {
    const q = assessObservationQuality({ instrumentId: 'oil', lastObservedAt: '2026-10-01', frequency: 'daily' }, { now: NOW });
    expect(q.status).toBe('stale');
    expect(q.reasons).toContain('BEYOND_UPDATE_CYCLE');
  });

  it('回落到缓存也算一条原因（数据是被沿用的）', () => {
    const q = assessObservationQuality(
      { instrumentId: 'oil', lastObservedAt: '2026-10-27', frequency: 'daily', quality: { fellBack: true } },
      { now: NOW },
    );
    expect(q.reasons).toContain('FALLBACK_TO_CACHE');
  });

  it('盘中频率不写「日频正常滞后」', () => {
    const q = assessObservationQuality({ instrumentId: 'btc', lastObservedAt: '2026-10-27', frequency: 'intraday' }, { now: NOW });
    expect(q.reasons).toEqual([]);
    expect(q.notRealtime).toBe(false);
  });

  it('未来时间不会算出负年龄', () => {
    const q = assessObservationQuality({ instrumentId: 'x', lastObservedAt: '2026-12-01' }, { now: NOW });
    expect(q.ageDays).toBe(0);
  });
});

describe('整张解释的读取新鲜度', () => {
  it('没有任何观测 → unavailable', () => {
    expect(assessExplanationFreshness({ observations: [] }).freshness).toBe('unavailable');
    expect(assessExplanationFreshness({}).freshnessReasons).toEqual(['NO_OBSERVATION']);
  });

  it('全部不可用 → unavailable', () => {
    const r = assessExplanationFreshness({ observations: [{ instrumentId: 'a', lastObservedAt: null }] });
    expect(r.freshness).toBe('unavailable');
  });

  it('一条过期就整体 stale，并汇总原因', () => {
    const r = assessExplanationFreshness({
      observations: [
        { instrumentId: 'a', lastObservedAt: '2026-10-27' },
        { instrumentId: 'b', lastObservedAt: '2026-09-01' },
      ],
      now: Date.parse('2026-10-28T00:00:00Z'),
    });
    expect(r.freshness).toBe('stale');
    expect(r.freshnessReasons).toContain('BEYOND_UPDATE_CYCLE');
    expect(r.details).toHaveLength(2);
  });

  it('都在周期内 → fresh', () => {
    const r = assessExplanationFreshness({
      observations: [{ instrumentId: 'a', lastObservedAt: '2026-10-27' }],
      now: Date.parse('2026-10-28T00:00:00Z'),
    });
    expect(r.freshness).toBe('fresh');
    expect(r.freshnessReasons).toEqual([]);
  });
});

describe('窗口可用性', () => {
  it('不可比 → usable=false，reason 透传', () => {
    const r = assessWindowUsability({ paired: { comparable: false, reasons: ['UNALIGNED_WINDOW'] }, windowKey: 'session' });
    expect(r.usable).toBe(false);
    expect(r.reasons).toEqual(['UNALIGNED_WINDOW']);
  });

  it('不可比且没给原因 → 用默认的 UNALIGNED_WINDOW（不留空）', () => {
    const r = assessWindowUsability({ paired: { comparable: false }, windowKey: 'session' });
    expect(r.reasons).toEqual(['UNALIGNED_WINDOW']);
  });

  it('session 窗口共同日期不足 2 个 → 不可用', () => {
    const r = assessWindowUsability({ paired: { comparable: true, n: 1 }, windowKey: 'session' });
    expect(r.usable).toBe(false);
    expect(r.reasons).toContain('INSUFFICIENT_COMMON_DATES');
  });

  it('更长的窗口允许 n=1（周/月本来就少点）', () => {
    const r = assessWindowUsability({ paired: { comparable: true, n: 1 }, windowKey: '1m' });
    expect(r.usable).toBe(true);
  });

  it('驱动缺失/过期被点名，但不单独让窗口不可用', () => {
    const r = assessWindowUsability({
      paired: { comparable: true, n: 5 },
      windowKey: 'session',
      drivers: [
        { instrumentId: 'us10y', status: 'unavailable' },
        { instrumentId: 'oil', status: 'stale' },
      ],
    });
    expect(r.usable).toBe(true);
    expect(r.unavailableDrivers).toEqual(['us10y']);
    expect(r.staleDrivers).toEqual(['oil']);
  });
});
