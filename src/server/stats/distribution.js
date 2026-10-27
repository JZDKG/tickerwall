/* ================================================================== *
 * 分布工具：标准正态 CDF 与双尾 p 值
 *
 * 单独一个文件是为了让 correlation / newey-west 都能引用它而不互相 import ——
 * 抽离统计层时保持所有原函数签名不变，server.mjs 的调用点一行都不用改。
 * ================================================================== */

/** 标准正态 CDF（Abramowitz-Stegun 近似，误差 < 1e-7） */
export function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/**
 * 双尾 p 值。
 * df 参数保留只为与旧实现签名一致（大样本下用正态近似，与 t 分布差别可忽略；
 * 这也是原实现的既有口径，改动会改变历史数字，所以不动）。
 */
export function pFromT(t, df) {
  void df;
  if (!Number.isFinite(t)) return 1;
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(t)))));
}
