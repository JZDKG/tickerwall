/* ================================================================== *
 * Benjamini-Hochberg 多重比较校正
 *
 * 12×13 的相关矩阵有 78 对、领先滞后再乘 11 个滞后 —— 约 850 个检验，
 * 5% 显著性下纯随机也会跑出 40 来个「显著」。这里控制的是 FDR（错误发现率），
 * 不是 FWER，所以比 Bonferroni 宽松、比不校正严格。
 *
 * 返回：
 *   reject[i] —— 第 i 个原假设是否被拒绝（顺序与入参一致）
 *   qvals[i]  —— 单调化后的校正 p 值
 * ================================================================== */

export function benjaminiHochberg(pvals, alpha = 0.05) {
  const m = pvals.length;
  if (!m) return { reject: [], qvals: [] };
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let kmax = -1;
  for (let k = 0; k < m; k += 1) {
    if (order[k].p <= ((k + 1) / m) * alpha) kmax = k;
  }
  const reject = new Array(m).fill(false);
  for (let k = 0; k <= kmax; k += 1) reject[order[k].i] = true;

  // q 值（单调化后的校正 p 值）
  const qvals = new Array(m).fill(1);
  let running = 1;
  for (let k = m - 1; k >= 0; k -= 1) {
    const q = Math.min(running, (order[k].p * m) / (k + 1));
    qvals[order[k].i] = q;
    running = q;
  }
  return { reject, qvals };
}
