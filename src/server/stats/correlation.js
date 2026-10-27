import { pFromT } from './distribution.js';
import { olsNeoeyWest } from './newey-west.js';

/* ================================================================== *
 * 相关系数统计：Pearson、Fisher z 区间、样本内外切分
 *
 * 从 server.mjs 抽出来的第一批纯函数 —— 没有 I/O、没有时钟、没有全局状态，
 * 只吃数字数组、吐数字对象。这样 Vitest 能直接 import 测，不用起 HTTP 服务。
 *
 * 口径说明（这几条是刻意的，改之前先看 docs 里的统计严谨性章节）：
 *   · 相关系数只在「两两共同观测」上算（pairwise deletion），不强行取全体交集，
 *     否则最短的那条序列会把所有配对拖到没有样本。
 *   · Fisher z 的 95% 区间用 1.96·se，se = 1/√(n−3)；n ≤ 3 或 |r| ≥ 1 返回 null。
 *   · 样本内 / 样本外按 70% / 30% 切，符号一致才算 stable。
 * ================================================================== */

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** Fisher z 变换的 95% 置信区间 */
export function fisherCI(r, n) {
  if (!(n > 3) || r == null || Math.abs(r) >= 1) return null;
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  return {
    z,
    lo: Math.tanh(z - 1.96 * se),
    hi: Math.tanh(z + 1.96 * se),
  };
}

/**
 * 单个相关对的完整统计
 * 同时给样本内（前 70%）与样本外（后 30%）的系数，符号一致才算稳定
 */
export function corrStats(xs, ys) {
  const n = xs.length;
  const corr = pearson(xs, ys);
  const ci = fisherCI(corr, n);
  const nw = olsNeoeyWest(xs, ys, 4);

  // 朴素 t（假设独立同分布，通常过于乐观）
  const tPlain = n > 2 && corr != null ? corr * Math.sqrt((n - 2) / Math.max(1e-12, 1 - corr * corr)) : null;
  const pPlain = tPlain != null ? pFromT(tPlain, n - 2) : null;

  // Newey-West 稳健 t（斜率换算回相关尺度：对同一回归 t 值不变）
  let tNW = null;
  let pNW = null;
  if (nw && nw.se > 0) {
    tNW = nw.slope / nw.se;
    pNW = pFromT(tNW, n - 2);
  }

  // 样本内外
  const cut = Math.floor(n * 0.7);
  let inR = null;
  let outR = null;
  if (cut > 30 && n - cut > 10) {
    inR = pearson(xs.slice(0, cut), ys.slice(0, cut));
    outR = pearson(xs.slice(cut), ys.slice(cut));
  }
  const stable = inR != null && outR != null ? Math.sign(inR) === Math.sign(outR) && inR !== 0 : null;

  return {
    corr,
    n,
    ci: ci ? { lo: ci.lo, hi: ci.hi } : null,
    t: tPlain,
    p: pPlain,
    tNW,
    pNW,
    inR,
    outR,
    stable,
  };
}

/** 两个 { dates, values } 序列对齐到共同交易日 */
export function alignSeries(a, b) {
  const mapB = new Map();
  b.dates.forEach((d, i) => mapB.set(d, b.values[i]));
  const xs = [];
  const ys = [];
  a.dates.forEach((d, i) => {
    if (mapB.has(d)) {
      xs.push(a.values[i]);
      ys.push(mapB.get(d));
    }
  });
  return { xs, ys };
}

export function pairwiseCorr(a, b) {
  const { xs, ys } = alignSeries(a, b);
  return corrStats(xs, ys);
}
