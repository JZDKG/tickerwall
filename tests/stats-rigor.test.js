/* ================================================================== *
 * 统计严谨性层的契约测试
 *
 * 被测：src/server/stats/（从 server.mjs 抽出来的纯函数，零 I/O）
 * 运行：npm test
 *
 * 这一层是「矩阵里那些数字能不能拿来用」的地基，所以测的不是「跑通」，
 * 而是几个会改变结论的性质：
 *   · Fisher z 区间在已知点上必须落在解析解上（手算过的常数，不是抄引擎输出）；
 *   · 日频金融序列自相关时，Newey-West SE 必须显著大于朴素 OLS SE（否则「稳健」二字是假的）；
 *   · BH 校正必须真的拦下多重比较假阳性（100 个纯噪声 p 值，朴素 5% 会挑出约 5 个）；
 *   · 样本内 / 样本外符号翻转必须被判 unstable。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  normalCdf,
  pFromT,
  pearson,
  fisherCI,
  corrStats,
  alignSeries,
  pairwiseCorr,
  olsNeoeyWest,
  nwCorrT,
  benjaminiHochberg,
} from '../src/server/stats/index.js';

/** 可复现的伪随机数（mulberry32），避免测试依赖 Math.random */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 标准正态抽样（Box-Muller） */
function gauss(rand) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** AR(1)：y_t = rho·y_{t−1} + e_t，用来制造真实的残差自相关 */
function ar1(n, rho, rand, sigma = 1) {
  const out = [];
  let prev = 0;
  for (let i = 0; i < n; i += 1) {
    prev = rho * prev + sigma * gauss(rand);
    out.push(prev);
  }
  return out;
}

/* ================================================================== *
 * 分布工具
 * ================================================================== */

describe('normalCdf / pFromT', () => {
  it('标准正态 CDF 在关键分位点上正确（近似误差 < 1e-3）', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normalCdf(2.5758)).toBeCloseTo(0.995, 3);
    expect(normalCdf(-3)).toBeCloseTo(0.00135, 4);
  });

  it('对称性：CDF(x) + CDF(−x) = 1', () => {
    for (const x of [0.3, 1.1, 2.4, 4.2]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 12);
    }
  });

  it('双尾 p 值：|t| = 1.96 → 0.05，|t| = 2.58 → 0.01，非有限值 → 1', () => {
    expect(pFromT(1.96, 100)).toBeCloseTo(0.05, 3);
    expect(pFromT(-1.96, 100)).toBeCloseTo(0.05, 3);
    expect(pFromT(2.5758, 100)).toBeCloseTo(0.01, 3);
    expect(pFromT(0, 100)).toBeCloseTo(1, 6);
    expect(pFromT(NaN, 100)).toBe(1);
    expect(pFromT(Infinity, 100)).toBe(1);
  });

  it('p 值永远落在 [0, 1]', () => {
    const rand = rng(7);
    for (let i = 0; i < 200; i += 1) {
      const p = pFromT(gauss(rand) * 6, 30);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

/* ================================================================== *
 * Pearson
 * ================================================================== */

describe('pearson', () => {
  it('完全正 / 负线性相关返回 ±1', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    expect(pearson(xs, xs.map((v) => v * 3 + 7))).toBeCloseTo(1, 12);
    expect(pearson(xs, xs.map((v) => -2 * v + 1))).toBeCloseTo(-1, 12);
  });

  it('手算点校验：xs=[1,2,3,4], ys=[1,3,2,5] → r = 5.5/√43.75 = 0.83152', () => {
    // dx = [-1.5,-0.5,0.5,1.5] (Σdx²=5), dy = [-1.75,0.25,-0.75,2.25] (Σdy²=8.75)
    // Σdxdy = 5.5 → r = 5.5 / √(5 × 8.75)
    expect(pearson([1, 2, 3, 4], [1, 3, 2, 5])).toBeCloseTo(5.5 / Math.sqrt(5 * 8.75), 12);
    expect(pearson([1, 2, 3, 4], [1, 3, 2, 5])).toBeCloseTo(0.8315218406202999, 12);
  });

  it('样本不足 / 零方差返回 null（不是 NaN、不是 0）', () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(pearson([1, 2, 3, 4], [5, 5, 5, 5])).toBeNull();
  });

  it('对线性变换不变（尺度无关）', () => {
    const rand = rng(11);
    const xs = Array.from({ length: 80 }, () => gauss(rand));
    const ys = xs.map((v) => 3 * v + gauss(rand) * 0.4);
    expect(pearson(xs, ys)).toBeCloseTo(pearson(xs.map((v) => v * 100 + 5), ys.map((v) => v * 0.01 - 9)), 10);
  });
});

/* ================================================================== *
 * Fisher z 置信区间
 * ================================================================== */

describe('fisherCI', () => {
  it('已知点：r = 0.5, n = 100 → [0.3366, 0.6341]（解析解手算）', () => {
    const ci = fisherCI(0.5, 100);
    expect(ci.z).toBeCloseTo(0.5493061443340548, 12);
    expect(ci.lo).toBeCloseTo(0.3366400620114324, 10);
    expect(ci.hi).toBeCloseTo(0.6341420270318, 10);
  });

  it('r = 0, n = 50 时区间关于 0 对称', () => {
    const ci = fisherCI(0, 50);
    expect(ci.lo).toBeCloseTo(-0.2783525648965687, 10);
    expect(ci.hi).toBeCloseTo(0.2783525648965687, 10);
  });

  it('样本越大区间越窄', () => {
    const w = (n) => {
      const ci = fisherCI(0.4, n);
      return ci.hi - ci.lo;
    };
    expect(w(50)).toBeGreaterThan(w(200));
    expect(w(200)).toBeGreaterThan(w(2000));
  });

  it('区间必定包住点估计', () => {
    for (const r of [-0.9, -0.5, -0.1, 0, 0.1, 0.5, 0.9]) {
      const ci = fisherCI(r, 120);
      expect(ci.lo).toBeLessThan(r);
      expect(ci.hi).toBeGreaterThan(r);
    }
  });

  it('边界：n ≤ 3 / |r| ≥ 1 / null 一律返回 null', () => {
    expect(fisherCI(0.5, 3)).toBeNull();
    expect(fisherCI(1, 100)).toBeNull();
    expect(fisherCI(-1, 100)).toBeNull();
    expect(fisherCI(null, 100)).toBeNull();
  });
});

/* ================================================================== *
 * Newey-West HAC
 * ================================================================== */

describe('olsNeoeyWest', () => {
  it('n < 30 返回 null（样本太短不硬算稳健标准误）', () => {
    const xs = Array.from({ length: 29 }, (_, i) => i);
    const ys = xs.map((v) => v + 0.5);
    expect(olsNeoeyWest(xs, ys, 4)).toBeNull();
  });

  it('斜率与 OLS 一致', () => {
    const rand = rng(23);
    const xs = Array.from({ length: 200 }, () => gauss(rand));
    const ys = xs.map((v) => 2.5 * v + gauss(rand) * 0.5);
    const nw = olsNeoeyWest(xs, ys, 4);

    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < xs.length; i += 1) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
    }
    expect(nw.slope).toBeCloseTo(sxy / sxx, 10);
    expect(nw.se).toBeGreaterThan(0);
  });

  it('自变量持续 + 残差持续时，NW 标准误显著大于朴素 OLS 标准误', () => {
    // 关键是 x 本身也要有持续性（真实宏观序列都是）：x ~ AR(1) ρ=0.8，误差 ~ AR(1) ρ=0.9。
    // 实测 ratio ≈ 1.72 —— 这正是「稳健」二字存在的场景。
    const rand = rng(2026);
    const n = 300;
    const xs = ar1(n, 0.8, rand, 1);
    const err = ar1(n, 0.9, rand, 0.4);
    const ys = xs.map((v, i) => 1.2 * v + err[i]);

    const nw = olsNeoeyWest(xs, ys, 4);

    // 朴素 OLS 标准误
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      sxx += (xs[i] - mx) ** 2;
      sxy += (xs[i] - mx) * (ys[i] - my);
    }
    const beta = sxy / sxx;
    let sse = 0;
    for (let i = 0; i < n; i += 1) sse += (ys[i] - my - beta * (xs[i] - mx)) ** 2;
    const sePlain = Math.sqrt(sse / (n - 2) / sxx);

    expect(nw.se).toBeGreaterThan(sePlain * 1.5);
  });

  it('x 平稳白噪声 + 残差自相关时 NW 不放大（交叉项期望为 0，不是 bug）', () => {
    // 容易被误当成 bug 的一条：iid 的 x 下，Σ e_i·e_{i−l}·x_i·x_{i−l} 的期望是 0，
    // 所以即便残差是 ρ=0.9 的 AR(1)，β̂ 的方差也不会被放大 —— 实测 ratio ≈ 0.82。
    // 固定住这条性质，避免以后有人用「乘一个放大系数」的方式去「修」它。
    const rand = rng(2027);
    const n = 300;
    const xs = Array.from({ length: n }, () => gauss(rand));
    const err = ar1(n, 0.9, rand, 0.4);
    const ys = xs.map((v, i) => 1.2 * v + err[i]);
    const nw = olsNeoeyWest(xs, ys, 4);

    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      sxx += (xs[i] - mx) ** 2;
      sxy += (xs[i] - mx) * (ys[i] - my);
    }
    const beta = sxy / sxx;
    let sse = 0;
    for (let i = 0; i < n; i += 1) sse += (ys[i] - my - beta * (xs[i] - mx)) ** 2;
    const sePlain = Math.sqrt(sse / (n - 2) / sxx);

    expect(nw.se / sePlain).toBeGreaterThan(0.5);
    expect(nw.se / sePlain).toBeLessThan(1.2);
  });

  it('白噪声残差下 NW 与朴素标准误接近（不会把有效标准误吹大）', () => {
    const rand = rng(4242);
    const n = 400;
    const xs = Array.from({ length: n }, () => gauss(rand));
    const ys = xs.map((v) => 0.8 * v + gauss(rand) * 1);
    const nw = olsNeoeyWest(xs, ys, 4);

    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      sxx += (xs[i] - mx) ** 2;
      sxy += (xs[i] - mx) * (ys[i] - my);
    }
    const beta = sxy / sxx;
    let sse = 0;
    for (let i = 0; i < n; i += 1) sse += (ys[i] - my - beta * (xs[i] - mx)) ** 2;
    const sePlain = Math.sqrt(sse / (n - 2) / sxx);

    expect(nw.se / sePlain).toBeGreaterThan(0.8);
    expect(nw.se / sePlain).toBeLessThan(1.3);
  });
});

describe('nwCorrT', () => {
  it('n < 20 返回 null', () => {
    const xs = Array.from({ length: 19 }, (_, i) => i);
    expect(nwCorrT(xs, xs)).toBeNull();
  });

  it('带宽按 floor(4·(n/100)^(2/9)) 取，随样本增大而非线性增长', () => {
    const rand = rng(31);
    const mk = (n) => {
      const xs = Array.from({ length: n }, () => gauss(rand));
      return nwCorrT(xs, xs.map((v) => v * 2));
    };
    expect(mk(100).bandwidth).toBe(4);
    expect(mk(400).bandwidth).toBe(Math.max(1, Math.floor(4 * (400 / 100) ** (2 / 9))));
    expect(mk(2000).bandwidth).toBeGreaterThan(mk(400).bandwidth);
  });

  it('完全相关时 t 值极大且 p 接近 0', () => {
    const rand = rng(5);
    const xs = Array.from({ length: 200 }, () => gauss(rand));
    const r = nwCorrT(xs, xs.map((v) => 3 * v));
    expect(r.corr).toBeCloseTo(1, 10);
    expect(r.pNW).toBeLessThan(1e-6);
  });

  it('无相关时 |t| 通常落在 2 以内（不制造显著性）', () => {
    const rand = rng(99);
    let big = 0;
    for (let k = 0; k < 30; k += 1) {
      const xs = Array.from({ length: 250 }, () => gauss(rand));
      const ys = Array.from({ length: 250 }, () => gauss(rand));
      const r = nwCorrT(xs, ys);
      if (Math.abs(r.tNW) > 2) big += 1;
    }
    // 30 次纯噪声检验，5% 水平下期望约 1.5 次越界；给到 8 次仍算正常
    expect(big).toBeLessThanOrEqual(8);
  });
});

/* ================================================================== *
 * Benjamini-Hochberg
 * ================================================================== */

describe('benjaminiHochberg', () => {
  it('手算点：[0.001, 0.01, 0.02, 0.9] → 前三个拒绝，q 值单调', () => {
    const { reject, qvals } = benjaminiHochberg([0.001, 0.01, 0.02, 0.9], 0.05);
    expect(reject).toEqual([true, true, true, false]);
    expect(qvals[0]).toBeCloseTo(0.004, 12);
    expect(qvals[1]).toBeCloseTo(0.02, 12);
    expect(qvals[2]).toBeCloseTo(0.02 * (4 / 3), 12);
    expect(qvals[3]).toBeCloseTo(0.9, 12);
  });

  it('q 值是单调不减的（按 p 排序后）', () => {
    const p = [0.04, 0.001, 0.3, 0.02, 0.008, 0.6, 0.15];
    const { qvals } = benjaminiHochberg(p, 0.05);
    const sorted = p.map((v, i) => ({ v, q: qvals[i] })).sort((a, b) => a.v - b.v);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].q).toBeGreaterThanOrEqual(sorted[i - 1].q - 1e-15);
    }
  });

  it('每个 q 值都不小于原 p 值（校正只会更保守）', () => {
    const p = [0.001, 0.013, 0.021, 0.049, 0.5, 0.87];
    const { qvals } = benjaminiHochberg(p, 0.05);
    p.forEach((v, i) => expect(qvals[i]).toBeGreaterThanOrEqual(v - 1e-15));
  });

  it('真的拦下多重比较假阳性：100 个纯噪声 p 值，朴素 5% 会挑出 ~5 个，BH 应基本全拦', () => {
    const rand = rng(20261027);
    const p = Array.from({ length: 100 }, () => rand()); // 均匀分布 = 全部原假设为真
    const naive = p.filter((v) => v < 0.05).length;
    const { reject } = benjaminiHochberg(p, 0.05);

    expect(naive).toBeGreaterThan(0); // 朴素法确实会误报
    expect(reject.filter(Boolean).length).toBe(0); // BH 全部拦下
  });

  it('真有信号时该拒绝的仍然拒绝（不会过度保守）', () => {
    const rand = rng(7);
    const noise = Array.from({ length: 60 }, () => rand() * 0.9 + 0.1);
    const p = [1e-8, 1e-6, 1e-5, ...noise];
    const { reject } = benjaminiHochberg(p, 0.05);
    expect(reject.slice(0, 3)).toEqual([true, true, true]);
  });

  it('空输入安全返回', () => {
    expect(benjaminiHochberg([])).toEqual({ reject: [], qvals: [] });
  });

  it('alpha 越严格，拒绝越少', () => {
    const p = [0.004, 0.012, 0.03, 0.045, 0.2, 0.4];
    const loose = benjaminiHochberg(p, 0.1).reject.filter(Boolean).length;
    const strict = benjaminiHochberg(p, 0.01).reject.filter(Boolean).length;
    expect(loose).toBeGreaterThanOrEqual(strict);
  });
});

/* ================================================================== *
 * corrStats / 样本内外 / 序列对齐
 * ================================================================== */

describe('corrStats', () => {
  it('输出字段齐全，且 n 与入参一致', () => {
    const rand = rng(3);
    const xs = Array.from({ length: 250 }, () => gauss(rand));
    const ys = xs.map((v) => 2 * v + gauss(rand) * 0.6);
    const s = corrStats(xs, ys);

    expect(s.n).toBe(250);
    expect(s.corr).toBeCloseTo(pearson(xs, ys), 12);
    expect(s.ci.lo).toBeLessThan(s.corr);
    expect(s.ci.hi).toBeGreaterThan(s.corr);
    expect(s.t).toBeGreaterThan(0);
    expect(s.p).toBeLessThan(0.01);
    expect(s.tNW).not.toBeNull();
    expect(s.pNW).not.toBeNull();
  });

  it('朴素 t 与公式一致：t = r·√((n−2)/(1−r²))', () => {
    const rand = rng(17);
    const n = 120;
    const xs = Array.from({ length: n }, () => gauss(rand));
    const ys = xs.map((v) => v + gauss(rand));
    const s = corrStats(xs, ys);
    const expectT = s.corr * Math.sqrt((n - 2) / (1 - s.corr * s.corr));
    expect(s.t).toBeCloseTo(expectT, 10);
  });

  it('样本内外符号一致 → stable = true', () => {
    const rand = rng(21);
    const xs = Array.from({ length: 300 }, () => gauss(rand));
    const ys = xs.map((v) => v + gauss(rand) * 0.5);
    const s = corrStats(xs, ys);
    expect(s.stable).toBe(true);
    expect(s.inR).toBeGreaterThan(0);
    expect(s.outR).toBeGreaterThan(0);
  });

  it('后 30% 翻转符号 → stable = false（样本外失效必须被判出来）', () => {
    const rand = rng(1234);
    const n = 300;
    const cut = Math.floor(n * 0.7);
    const xs = Array.from({ length: n }, () => gauss(rand));
    // 前 70% 正相关，后 30% 人为取反 → 负相关
    const ys = xs.map((v, i) => (i < cut ? v + gauss(rand) * 0.2 : -(v + gauss(rand) * 0.2)));
    const s = corrStats(xs, ys);

    expect(s.inR).toBeGreaterThan(0);
    expect(s.outR).toBeLessThan(0);
    expect(s.stable).toBe(false);
  });

  it('样本太短时样本内外留 null，不硬切', () => {
    const xs = Array.from({ length: 40 }, (_, i) => i);
    const s = corrStats(xs, xs);
    expect(s.inR).toBeNull();
    expect(s.outR).toBeNull();
    expect(s.stable).toBeNull();
  });
});

describe('alignSeries / pairwiseCorr', () => {
  it('只保留共同交易日，顺序按 A 的日期', () => {
    const a = { dates: ['d1', 'd2', 'd3', 'd4'], values: [1, 2, 3, 4] };
    const b = { dates: ['d2', 'd4', 'd5'], values: [20, 40, 50] };
    const { xs, ys } = alignSeries(a, b);
    expect(xs).toEqual([2, 4]);
    expect(ys).toEqual([20, 40]);
  });

  it('无交集时返回空数组而不是抛错', () => {
    const a = { dates: ['d1'], values: [1] };
    const b = { dates: ['d9'], values: [9] };
    expect(alignSeries(a, b)).toEqual({ xs: [], ys: [] });
  });

  it('pairwiseCorr 的 n 等于共同交易日数量（不是任一序列长度）', () => {
    const rand = rng(55);
    const datesA = Array.from({ length: 200 }, (_, i) => `d${i}`);
    const datesB = datesA.slice(50); // B 只有后 150 天
    const a = { dates: datesA, values: datesA.map(() => gauss(rand)) };
    const b = { dates: datesB, values: datesB.map(() => gauss(rand)) };

    const s = pairwiseCorr(a, b);
    expect(s.n).toBe(150);
    expect(s.corr).toBe(pearson(a.values.slice(50), b.values));
  });
});
