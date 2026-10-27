/* ================================================================== *
 * Sparkline：把 quote.history（[{t, p}]）画成折线
 *
 * 画在 SVG 里，坐标是固定的逻辑尺寸（默认 56×18），由调用方决定放在哪。
 * 三条纪律：
 *   · 点数不足（0 或 1）时返回空，不要画一条假线；
 *   · 所有点价格相同（横盘）时画中线，不要除零；
 *   · 涨跌方向由调用方给色，这里只出几何 —— 颜色是主题的事，不是几何的事。
 * ================================================================== */

/**
 * @param {Array<{t:number, p:number}>} history
 * @returns {{line: string, area: string, min: number, max: number} | null}
 */
export function sparklinePath(history, w = 56, h = 18, pad = 1.5) {
  if (!Array.isArray(history) || history.length < 2) return null;

  // 只接受有限数值，历史里偶尔会夹 null（休市、数据缺口）。
  // 必须先判 null 再 Number() —— Number(null) 是 0 而不是 NaN，
  // 直接 Number() + isFinite 会把「没有数据」当成「价格 0」，
  // 画出一条突然插到底的假线。
  const pts = [];
  for (const d of history) {
    const raw = d?.p;
    if (raw == null) continue;
    const p = Number(raw);
    if (Number.isFinite(p)) pts.push(p);
  }
  if (pts.length < 2) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p < min) min = p;
    if (p > max) max = p;
  }

  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);
  const span = max - min;
  // 横盘时 span=0，除零会得到 NaN；直接落到中线
  const yOf = (p) => (span === 0
    ? pad + innerH / 2
    : pad + innerH - ((p - min) / span) * innerH);
  const xOf = (i) => pad + (i / (pts.length - 1)) * innerW;

  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(2)},${yOf(p).toFixed(2)}`)
    .join('');
  const area = `${line}L${xOf(pts.length - 1).toFixed(2)},${(h - pad).toFixed(2)}L${xOf(0).toFixed(2)},${(h - pad).toFixed(2)}Z`;

  return { line, area, min, max };
}

/** 首尾涨跌幅（%），数据不足返回 null */
export function sparklineChange(history) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const first = Number(history[0]?.p);
  const last = Number(history[history.length - 1]?.p);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return ((last - first) / first) * 100;
}
