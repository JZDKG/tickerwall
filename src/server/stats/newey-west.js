/* ================================================================== *
 * Newey-West (Bartlett 核) HAC 稳健标准误
 *
 * 两个变体，别混用：
 *   · olsNeoeyWest —— 把相关系数看成 y 对 x 的 OLS 斜率，带宽固定 maxLag（默认 4，
 *     且不超过 n/20）。给 corrStats() 的 250 期矩阵用。
 *   · nwCorrT —— 带宽用 Newey-West 经验式 floor(4·(n/100)^(2/9))，返回 t/p/n，
 *     给领先滞后扫描用（每个滞后要重算，样本长度随平移变化）。
 * 两者口径不同、输出的 t 值也不完全等价，这是历史行为，抽离时保持原样。
 * ================================================================== */

import { pFromT } from './distribution.js';

/**
 * Newey-West HAC 标准误
 * 把相关系数看成 y 对 x 的 OLS 斜率，用 Bartlett 核加权残差自协方差，
 * 得到对自相关和异方差稳健的标准误。
 */
export function olsNeoeyWest(xs, ys, maxLag = 4) {
  const n = xs.length;
  if (n < 30) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const dx = xs.map((v) => v - mx);
  const dy = ys.map((v) => v - my);
  const sxx = dx.reduce((a, v) => a + v * v, 0);
  if (!(sxx > 0)) return null;
  const b = dx.reduce((a, v, i) => a + v * dy[i], 0) / sxx;
  const resid = dy.map((v, i) => v - b * dx[i]);

  let S = 0;
  for (let i = 0; i < n; i += 1) S += resid[i] * resid[i] * dx[i] * dx[i];
  const L = Math.min(maxLag, Math.floor(n / 20));
  for (let l = 1; l <= L; l += 1) {
    const w = 1 - l / (L + 1);
    let g = 0;
    for (let i = l; i < n; i += 1) g += resid[i] * resid[i - l] * dx[i] * dx[i - l];
    S += 2 * w * g;
  }
  const varB = S / (sxx * sxx);
  if (!(varB > 0)) return null;
  return { slope: b, se: Math.sqrt(varB) };
}

/**
 * 带 Newey-West 修正的相关系数 t 统计量。
 *
 * 普通 t = r·sqrt((n-2)/(1-r²)) 假设样本独立同分布，但日频金融序列存在波动率聚集，
 * 残差自相关会把 t 值系统性放大。这里对回归斜率做 HAC 方差估计，L 用 Newey-West
 * 经验带宽 floor(4·(n/100)^(2/9))，Bartlett 权重保证半正定。
 */
export function nwCorrT(xs, ys) {
  const n = xs.length;
  if (n < 20) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  const xc = new Array(n);
  const yc = new Array(n);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    xc[i] = xs[i] - mx;
    yc[i] = ys[i] - my;
    sxx += xc[i] * xc[i];
    syy += yc[i] * yc[i];
    sxy += xc[i] * yc[i];
  }
  if (!(sxx > 0) || !(syy > 0)) return null;
  const corr = sxy / Math.sqrt(sxx * syy);
  const beta = sxy / sxx;
  const e = new Array(n);
  for (let i = 0; i < n; i += 1) e[i] = yc[i] - beta * xc[i];
  const L = Math.max(1, Math.floor(4 * (n / 100) ** (2 / 9)));
  let s2 = 0;
  for (let i = 0; i < n; i += 1) s2 += e[i] * e[i] * xc[i] * xc[i];
  for (let k = 1; k <= L; k += 1) {
    let acc = 0;
    for (let i = k; i < n; i += 1) acc += e[i] * e[i - k] * xc[i] * xc[i - k];
    s2 += 2 * (1 - k / (L + 1)) * acc;
  }
  const varBeta = s2 / (sxx * sxx);
  const se = varBeta > 0 ? Math.sqrt(varBeta) : null;
  const tNW = se ? beta / se : null;
  return {
    corr,
    tNW,
    pNW: tNW == null ? null : pFromT(tNW, n - 2),
    n,
    bandwidth: L,
  };
}
