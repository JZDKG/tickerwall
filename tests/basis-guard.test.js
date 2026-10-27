/* ================================================================== *
 * 分时环形缓冲 + 写入护栏的契约测试
 *
 * 被测：src/server/domain/history-ring.js（纯内存，零 I/O）
 *
 * 这两条护栏的存在意义只有一个：**分时图上不能出现断崖针**。
 * 一旦混写，图上会留下一根永久的脉冲（因为历史点只追加、不回溯修正），
 * 所以这里的断言全部围绕「该拒的必须拒、该写的必须写」。
 *
 * 真实场景：gold-intl 主源是新浪现货 hf_XAU，失败时降级到 COMEX 期货 hf_GC，
 * 两者常态差 $15–30（≈1%），混写就是一根针。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { createHistoryRing, historyWriteVerdict, BASIS_JUMP_LIMIT } from '../src/server/domain/history-ring.js';

const SPOT = 2650;        // hf_XAU 现货价
const FUTURES = 2677.3;   // hf_GC 期货价，比现货高约 1.03%

/* ================================================================== *
 * 护栏 1：跨合约代理源
 * ================================================================== */

describe('护栏 1：meta.basisProxy 的代理源在已有现货底子时拒写', () => {
  it('已有的现货分时序列被期货兜底价「污染」时，必须拒写', () => {
    const ring = createHistoryRing({ limit: 240 });
    expect(ring.push('gold-intl', SPOT, 1000, 2, { source: 'sina:hf_XAU' })).toBe(true);

    // 期货兜底，且标了 basisProxy → 无论价差多少都拒
    expect(ring.push('gold-intl', FUTURES, 2000, 2, { source: 'sina:hf_GC', basisProxy: true })).toBe(false);
    // 甚至同价也拒（护栏 1 在判重之前）
    expect(ring.push('gold-intl', SPOT, 3000, 2, { source: 'sina:hf_GC', basisProxy: true })).toBe(false);

    expect(ring.get('gold-intl')).toEqual([{ t: 1000, p: SPOT }]);
  });

  it('序列为空时允许写入（首次建底子不拦）', () => {
    const ring = createHistoryRing({ limit: 240 });
    expect(ring.push('gold-intl', FUTURES, 1000, 2, { source: 'sina:hf_GC', basisProxy: true })).toBe(true);
  });

  it('真实故障切换序列：现货 → 期货兜底三连 → 现货恢复，全程只有现货点', () => {
    const ring = createHistoryRing({ limit: 240 });
    const writes = [];
    writes.push(ring.push('gold-intl', 2648, 1000, 2, { source: 'sina:hf_XAU' }));
    writes.push(ring.push('gold-intl', 2649, 2000, 2, { source: 'sina:hf_XAU' }));
    // 主源挂了，连续三轮走期货兜底
    writes.push(ring.push('gold-intl', FUTURES, 3000, 2, { source: 'sina:hf_GC', basisProxy: true }));
    writes.push(ring.push('gold-intl', FUTURES + 2, 4000, 2, { source: 'sina:hf_GC', basisProxy: true }));
    writes.push(ring.push('gold-intl', FUTURES + 5, 5000, 2, { source: 'sina:hf_GC', basisProxy: true }));
    // 主源恢复
    writes.push(ring.push('gold-intl', 2650, 6000, 2, { source: 'sina:hf_XAU' }));

    expect(writes).toEqual([true, true, false, false, false, true]);
    const series = ring.get('gold-intl');
    expect(series.map((x) => x.p)).toEqual([2648, 2649, 2650]);
    // 关键：没有一个 ~2677 的点，图上不会出现断崖针
    expect(series.some((x) => x.p > 2700 || x.p === FUTURES)).toBe(false);
  });

  it('来源仍然是期货时，上一次写入的 source 不会被代理源覆盖', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('gold-intl', SPOT, 1000, 2, { source: 'sina:hf_XAU' });
    ring.push('gold-intl', FUTURES, 2000, 2, { source: 'sina:hf_GC', basisProxy: true });
    expect(ring.source('gold-intl')).toBe('sina:hf_XAU');
  });
});

/* ================================================================== *
 * 护栏 2：跨源跳变
 * ================================================================== */

describe('护栏 2：源切换 + 单步跳变 > 0.25% 拦截', () => {
  it('阈值就是 0.25%', () => {
    expect(BASIS_JUMP_LIMIT).toBe(0.0025);
  });

  it('跨源且跳变 1.03% → 拒写', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('gold-intl', SPOT, 1000, 2, { source: 'sina:hf_XAU' });
    expect(ring.push('gold-intl', FUTURES, 2000, 2, { source: 'sina:hf_GC' })).toBe(false);
  });

  it('跨源但跳变 0.1% → 允许（同一合约换源，不是基差）', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('gold-intl', 2650, 1000, 2, { source: 'sina:hf_XAU' });
    expect(ring.push('gold-intl', 2652.65, 2000, 2, { source: 'goldapi:XAU' })).toBe(true);
  });

  it('同源跳变 5% 不拦（那是行情本身，拦了会漏掉真实暴涨）', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('usdcny', 7.1, 1000, 4, { source: 'sina:fx_susdcny' });
    expect(ring.push('usdcny', 7.455, 2000, 4, { source: 'sina:fx_susdcny' })).toBe(true);
  });

  it('恰好落在阈值边界上：等于 0.25% 放行，略超拒写', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('x', 100, 1000, 4, { source: 'a' });
    expect(ring.push('x', 100.25, 2000, 4, { source: 'b' })).toBe(true);  // 正好 0.25% → 不 > 阈值
    const ring2 = createHistoryRing({ limit: 10 });
    ring2.push('y', 100, 1000, 4, { source: 'a' });
    expect(ring2.push('y', 100.26, 2000, 4, { source: 'b' })).toBe(false); // 0.26% → 拒
  });

  it('首笔没有 prev 时不做跨源判断', () => {
    const ring = createHistoryRing({ limit: 10 });
    expect(ring.push('x', 100, 1000, 4, { source: 'b' })).toBe(true);
  });

  it('没有 source 元数据时不触发跨源判断', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('x', 100, 1000, 4, { source: 'a' });
    expect(ring.push('x', 200, 2000, 4, {})).toBe(true); // 无 source → 只看判重
  });
});

/* ================================================================== *
 * 判重
 * ================================================================== */

describe('按显示精度判重', () => {
  it('同精度同值 → 不写，且不改动上一笔的时间戳', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('gold-cn', 762.34, 1000, 2, { source: 'sina' });
    expect(ring.push('gold-cn', 762.34, 9000, 2, { source: 'sina' })).toBe(false);
    // 时间戳仍是第一笔的 1000：休市期间不会把最后一个点拖到现在
    expect(ring.get('gold-cn')).toEqual([{ t: 1000, p: 762.34 }]);
  });

  it('浮点尾差被精度抹平后算重复（7623.68017 vs 7623.6802）', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('ndx100', 7623.68017, 1000, 2, { source: 'sina' });
    expect(ring.push('ndx100', 7623.6802, 2000, 2, { source: 'sina' })).toBe(false);
  });

  it('精度更高的序列能分辨同样的差值', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('us10y', 4.2317, 1000, 4, { source: 'fred' });
    expect(ring.push('us10y', 4.2318, 2000, 4, { source: 'fred' })).toBe(true);
  });

  it('价格真的动了就写', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('btc', 79740.01, 1000, 2, { source: 'binance' });
    expect(ring.push('btc', 79741.02, 2000, 2, { source: 'binance' })).toBe(true);
    expect(ring.get('btc')).toHaveLength(2);
  });
});

/* ================================================================== *
 * 环形裁剪与整体操作
 * ================================================================== */

describe('环形缓冲本身', () => {
  it('超过 limit 从头丢，保留最新的 limit 条', () => {
    const ring = createHistoryRing({ limit: 3 });
    for (let i = 1; i <= 6; i += 1) ring.push('s', 100 + i, i, 2, { source: 'a' });
    expect(ring.get('s')).toEqual([
      { t: 4, p: 104 },
      { t: 5, p: 105 },
      { t: 6, p: 106 },
    ]);
  });

  it('默认 limit 是 240（与服务端的 HISTORY_LIMIT 一致）', () => {
    const ring = createHistoryRing();
    expect(ring.limit).toBe(240);
    for (let i = 0; i < 300; i += 1) ring.push('s', 100 + i / 100, i, 2, { source: 'a' });
    expect(ring.get('s')).toHaveLength(240);
  });

  it('每个标的分开存，互不影响', () => {
    const ring = createHistoryRing({ limit: 10 });
    ring.push('a', 1, 1, 2, { source: 'x' });
    ring.push('b', 2, 1, 2, { source: 'y' });
    expect(ring.get('a')).toHaveLength(1);
    expect(ring.get('b')).toHaveLength(1);
    expect(ring.size).toBe(2);
    expect(ring.has('c')).toBe(false);
    expect(ring.get('c')).toBeUndefined();
  });

  it('set / restore 整体替换，也受 limit 约束', () => {
    const ring = createHistoryRing({ limit: 2 });
    ring.set('s', [{ t: 1, p: 1 }, { t: 2, p: 2 }, { t: 3, p: 3 }]);
    expect(ring.get('s')).toEqual([{ t: 2, p: 2 }, { t: 3, p: 3 }]);

    ring.restore({ a: [{ t: 1, p: 10 }], b: [{ t: 2, p: 20 }, { t: 3, p: 21 }] });
    expect(ring.get('a')).toHaveLength(1);
    expect(ring.get('b')).toHaveLength(2);
    expect([...ring.entries()].map(([k]) => k)).toEqual(['s', 'a', 'b']);
  });

  it('restore 对空值/非数组容错', () => {
    const ring = createHistoryRing({ limit: 5 });
    ring.restore({ a: [], b: null, c: 'x', d: [{ t: 1, p: 1 }] });
    expect(ring.has('a')).toBe(false);
    expect(ring.has('d')).toBe(true);
    ring.restore(null);
  });

  it('set 空数组不会把已有序列抹掉', () => {
    const ring = createHistoryRing({ limit: 5 });
    ring.push('s', 1, 1, 2, { source: 'a' });
    ring.set('s', []);
    expect(ring.get('s')).toHaveLength(1);
  });
});

/* ================================================================== *
 * 裁决函数（护栏逻辑的纯形式）
 * ================================================================== */

describe('historyWriteVerdict 直接裁决', () => {
  const prev = { t: 1, p: 100 };

  it('无 prev → 写', () => {
    expect(historyWriteVerdict({ prev: undefined, price: 1 })).toEqual({ write: true });
  });

  it('basisProxy → 拒，理由是 basis-proxy（且优先于判重）', () => {
    expect(historyWriteVerdict({ prev, price: 100, meta: { basisProxy: true } }))
      .toEqual({ write: false, reason: 'basis-proxy' });
  });

  it('跨源大跳 → 拒，理由是 cross-source-jump', () => {
    expect(historyWriteVerdict({ prev, prevSource: 'a', price: 101, meta: { source: 'b' } }))
      .toEqual({ write: false, reason: 'cross-source-jump' });
  });

  it('同精度同值 → 拒，理由是 duplicate', () => {
    expect(historyWriteVerdict({ prev, prevSource: 'a', price: 100, decimals: 2, meta: { source: 'a' } }))
      .toEqual({ write: false, reason: 'duplicate' });
  });

  it('正常推进 → 写', () => {
    expect(historyWriteVerdict({ prev, prevSource: 'a', price: 100.5, decimals: 2, meta: { source: 'a' } }))
      .toEqual({ write: true });
  });
});
