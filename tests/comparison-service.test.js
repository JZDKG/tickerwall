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
