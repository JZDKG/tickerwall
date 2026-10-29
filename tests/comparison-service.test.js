/* ================================================================== *
 * 内外金对照的取数与对齐（产品 2.1）
 *
 * 域层的数学在 domain-comparison.test.js 里验过。这里验的是**取数纪律**：
 * 三个序列必须对齐到同一天，缺一个就明确说缺，不用相邻值顶替。
 * ================================================================== */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  COMPARISON_WINDOWS,
  buildComparison,
  commonCutoff,
  commonWindow,
  getGoldComparison,
  sliceWindow,
} from '../src/server/services/comparison.service.js';

/** 造日线：dates 显式给，便于制造「不同市场休市日不同」 */
const series = (pairs) => pairs.map(([date, close]) => ({ date, close }));

const depsWith = (map, { fresh = true } = {}) => ({
  readDailyCache: async (id) => (map[id] ? { rows: map[id] } : null),
  isDailyCacheFresh: () => ({ fresh }),
  now: () => Date.parse('2026-10-28T12:00:00Z'),
});

describe('窗口切片', () => {
  it('取最后 N 个交易日', () => {
    const rows = series([
      ['2026-10-20', 100],
      ['2026-10-21', 101],
      ['2026-10-22', 102],
      ['2026-10-23', 103],
      ['2026-10-24', 104],
    ]);
    const w = sliceWindow(rows, 2);
    expect(w.end).toBe(104);
    expect(w.start).toBe(102);
    expect(w.endDate).toBe('2026-10-24');
  });

  it('cutoff 之后的行情被排除（不能拿未来数据对齐）', () => {
    const rows = series([
      ['2026-10-20', 100],
      ['2026-10-21', 101],
      ['2026-10-22', 102],
    ]);
    const w = sliceWindow(rows, 1, '2026-10-21');
    expect(w.endDate).toBe('2026-10-21');
    expect(w.end).toBe(101);
  });

  it('不足两行返回 null（一个点算不出变化）', () => {
    expect(sliceWindow(series([['2026-10-20', 100]]), 1)).toBeNull();
    expect(sliceWindow([], 1)).toBeNull();
    expect(sliceWindow(null, 1)).toBeNull();
  });

  it('跳过非正价格（0 会把变化率算成 -100%）', () => {
    const rows = series([
      ['2026-10-20', 100],
      ['2026-10-21', 0],
      ['2026-10-22', 102],
    ]);
    const w = sliceWindow(rows, 1);
    expect(w.end).toBe(102);
    expect(w.start).toBe(100);
  });
});

describe('共同截止日', () => {
  it('取最早的那个「最后一根」', () => {
    const c = commonCutoff({ endDate: '2026-10-24' }, { endDate: '2026-10-21' }, { endDate: '2026-10-24' });
    expect(c).toBe('2026-10-21');
  });

  it('任一序列缺失就没有共同截止日', () => {
    expect(commonCutoff({ endDate: '2026-10-24' }, null, { endDate: '2026-10-24' })).toBeNull();
  });
});

describe('三序列对齐', () => {
  const intl = series([
    ['2026-10-20', 2000],
    ['2026-10-21', 2010],
    ['2026-10-22', 1990],
    ['2026-10-23', 1980],
  ]);
  const domestic = series([
    ['2026-10-20', 450],
    ['2026-10-21', 452],
    // 国内 22 日休市，最后一根停在 21 日
  ]);
  const fx = series([
    ['2026-10-20', 7.1],
    ['2026-10-21', 7.2],
    ['2026-10-22', 7.25],
    ['2026-10-23', 7.3],
  ]);

  it('对齐到三序列共同覆盖的最后一个交易日', async () => {
    const out = await buildComparison({ windowKey: '5d', deps: depsWith({ 'gold-intl': intl, 'gold-cn': domestic, usdcny: fx }) });
    expect(out.cutoff).toBe('2026-10-21');
    expect(out.alignedEndDates).toEqual({ intl: '2026-10-21', domestic: '2026-10-21', fx: '2026-10-21' });
    expect(out.decomposition).not.toBeNull();
    expect(out.comparable).toBe(true);
  });

  it('缺一个序列 → status=unknown 并点名缺谁，不给分解', async () => {
    const out = await buildComparison({ windowKey: '5d', deps: depsWith({ 'gold-intl': intl, 'gold-cn': domestic }) });
    expect(out.status).toBe('unknown');
    expect(out.missing).toEqual(['usdcny']);
    expect(out.decomposition).toBeNull();
    expect(out.reasonText.join(' ')).toContain('采集');
  });

  it('缓存过期时给出警告，但仍然给出相对变化（相对变化不受实时性影响）', async () => {
    const out = await buildComparison({
      windowKey: '5d',
      deps: depsWith({ 'gold-intl': intl, 'gold-cn': domestic, usdcny: fx }, { fresh: false }),
    });
    expect(out.status).toBe('ok');
    expect(out.dataAgeWarning).toContain('已过期');
  });

  it('缓存新鲜时不出现警告（别制造噪声）', async () => {
    const out = await buildComparison({ windowKey: '5d', deps: depsWith({ 'gold-intl': intl, 'gold-cn': domestic, usdcny: fx }) });
    expect(out.dataAgeWarning).toBeNull();
  });

  it('窗口标签跟着参数走', async () => {
    const deps = depsWith({ 'gold-intl': intl, 'gold-cn': domestic, usdcny: fx });
    expect((await buildComparison({ windowKey: 'session', deps })).windowLabel).toBe(COMPARISON_WINDOWS.session.label);
    expect((await buildComparison({ windowKey: '20d', deps })).windowLabel).toBe(COMPARISON_WINDOWS['20d'].label);
  });

  it('未知窗口退回默认（不抛，界面上不至于白屏）', async () => {
    const out = await buildComparison({ windowKey: 'nope', deps: depsWith({ 'gold-intl': intl, 'gold-cn': domestic, usdcny: fx }) });
    expect(out.windowLabel).toBe(COMPARISON_WINDOWS.session.label);
  });
});

describe('带同键合并的入口', () => {
  it('同一窗口并发只算一次（复用同一次取数）', async () => {
    const readDailyCache = vi.fn(async (id) => ({
      rows: series([
        ['2026-10-20', id === 'gold-intl' ? 2000 : id === 'gold-cn' ? 450 : 7.1],
        ['2026-10-21', id === 'gold-intl' ? 2010 : id === 'gold-cn' ? 452 : 7.2],
      ]),
    }));
    const deps = { readDailyCache, isDailyCacheFresh: () => ({ fresh: true }) };
    const [a, b] = await Promise.all([
      getGoldComparison({ windowKey: 'session', force: true, deps }),
      getGoldComparison({ windowKey: 'session', force: true, deps }),
    ]);
    expect(a).toEqual(b);
    expect(a.decomposition).not.toBeNull();
  });
});

/**
 * 这个服务默认会读真库的日线缓存。测试必须把它挡在外面：
 * 曾经因为漏了这一步，别的测试文件把用户真实的 data/kanban.db 写脏了
 * （tests/http-integration.test.js 会校验那个文件的摘要没变）。
 */
describe('不碰真实数据目录', () => {
  it('入口带 deps 时不读默认存储', async () => {
    const readDailyCache = vi.fn(async () => null);
    const out = await getGoldComparison({ windowKey: '20d', force: true, deps: { readDailyCache } });
    expect(readDailyCache).toHaveBeenCalled();
    expect(out.status).toBe('unknown');
  });
});

/* ================================================================== *
 * 共同窗口：必须在**日期交集**上取，不能各切各的（审阅复现的 bug）
 *
 * 故障形态：`commonCutoff` 只对齐末端。国内金缺一天时，它的起点比国际金早
 * 一天 → 即使两天的境内外溢价都为 0，也会算出一个非零的「溢价变化」。
 * ================================================================== */
describe('共同窗口（日期交集）', () => {
  it('某条序列缺一天时，起点取交集上的同一天', () => {
    const rows = (dates) => dates.map((d, i) => ({ date: d, close: 100 + i }));
    const intl = rows(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    const dom = rows(['2026-10-20', '2026-10-22', '2026-10-23']); // 缺 10-21
    const fx = rows(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    const shared = commonWindow([intl, dom, fx], 2);
    expect(shared).not.toBeNull();
    expect(shared.endDate).toBe('2026-10-23');
    // 交集是 20/22/23；跨 2 个交易日 → 起点 20 号，而不是让某条自己往前挪
    expect(shared.startDate).toBe('2026-10-20');
    expect(shared.at(dom).startDate).toBe(shared.at(intl).startDate);
  });

  it('交集不足两天时返回 null（调用方据此判不可比，不输出分解）', () => {
    const rows = (dates) => dates.map((d, i) => ({ date: d, close: 100 + i }));
    expect(commonWindow([rows(['2026-10-20']), rows(['2026-10-21'])], 1)).toBeNull();
  });

  it('没有交集（完全不同的日期）时返回 null', () => {
    const rows = (dates) => dates.map((d, i) => ({ date: d, close: 100 + i }));
    expect(commonWindow([rows(['2026-10-20', '2026-10-21']), rows(['2026-11-01', '2026-11-02'])], 1)).toBeNull();
  });

  it('at() 在某条序列缺窗口端点时返回 null（不做「就近取」）', () => {
    const rows = (dates) => dates.map((d, i) => ({ date: d, close: 100 + i }));
    const a = rows(['2026-10-20', '2026-10-21', '2026-10-22']);
    const b = rows(['2026-10-20', '2026-10-22']);
    const shared = commonWindow([a, b], 2);
    // 交集 20/22，跨度 2 → 只有两个点，起点 20
    expect(shared.at(b)).not.toBeNull();
    // 人为构造「缺端点」的序列：交集里有 20/22，但这条没有 20
    expect(shared.at(rows(['2026-10-22']))).toBeNull();
  });
});

/* ================================================================== *
 * 端到端：国内金缺一天时，溢价分解仍必须自洽（审阅复现）
 *
 * 构造：国际金与汇率都上涨，国内金按恒等式定价（溢价恒为 0），
 * 但国内金**缺中间一天**。旧实现各切各的窗口 → 起点不同 → 算出一个非零的
 * 「溢价变化」。现在先在日期交集上取窗口，所以溢价变化必须约等于 0。
 * ================================================================== */
describe('缺一天时报出的溢价变化仍自洽', () => {
  const conv = (usd, fxr) => (usd / 31.1034768) * fxr;

  it('溢价两天都为 0 时，分解出的溢价变化约等于 0', async () => {
    const intl = series([['2026-10-21', 2000], ['2026-10-22', 2010], ['2026-10-23', 2020]]);
    // 缺 10-22
    const domestic = series([
      ['2026-10-21', conv(2000, 7.2)],
      ['2026-10-23', conv(2020, 7.2)],
    ]);
    const fx = series([['2026-10-21', 7.2], ['2026-10-22', 7.2], ['2026-10-23', 7.2]]);
    const out = await buildComparison({ windowKey: 'session', deps: depsWith({ 'gold-intl': intl, 'gold-cn': domestic, usdcny: fx }) });

    expect(out.status).toBe('ok');
    expect(out.decomposition).not.toBeNull();
    // 分解形状：{ terms:[{key}], premiumPct, residualPct, ... }
    const premium = out.decomposition.terms.find((t) => t.key === 'premium');
    const pct = premium?.changePct ?? Number.NaN;
    expect(Math.abs(pct)).toBeLessThan(0.01);
    // 恒等式必须成立（残差是浮点误差量级），否则说明三项根本不在同一窗口
    expect(Math.abs(out.decomposition.residualPct)).toBeLessThan(0.01);
  });

  it('三条序列没有共同日期时明确不可比，不给分解', async () => {
    const intl = series([['2026-10-20', 2000], ['2026-10-21', 2001]]);
    const domestic = series([['2026-11-01', 460], ['2026-11-02', 461]]);
    const fx = series([['2026-12-01', 7.2], ['2026-12-02', 7.21]]);
    const out = await buildComparison({ windowKey: 'session', deps: depsWith({ 'gold-intl': intl, 'gold-cn': domestic, usdcny: fx }) });
    expect(out.status).toBe('unknown');
    expect(out.comparable).toBe(false);
    expect(out.decomposition).toBeNull();
    expect(out.reasonText.join(' ')).toContain('共同交易日');
  });
});
