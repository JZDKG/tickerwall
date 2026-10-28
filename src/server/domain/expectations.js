/* ================================================================== *
 * 预期与实际（产品 2.4）
 *
 * 现在的产品只能回答「发生了什么」。「预期落空」这件事没人看得见 ——
 * 而它恰恰是读者最想知道的：我原本以为会怎样，实际怎样。
 *
 * 这一层只做一件事：把「一条预期」与「一个实际变化」对起来，给一个
 * **可核对的判定**。它不做预测，也不解释原因。
 *
 * 四条约束（与方案 §4.3 的内容边界一致）：
 *   1. 两侧缺任何一侧 → verdict = 'undetermined'，不给猜测结论；
 *   2. 判定只用符号与量级，**不涉及因果**：符合方向不等于「因为 X 所以 Y」；
 *   3. 量级不够时给 'weaker'，不说「符合」（差一个数量级也叫符合是误导）；
 *   4. 每条判定都带 basis，写明它是拿什么和什么比的。
 * ================================================================== */

/** 判定词汇。emitted 到界面上，不要在别处另造同义词。 */
export const VERDICT = {
  matched: '方向符合',
  opposite: '方向相反',
  weaker: '方向符合但幅度不足',
  flat: '几乎没有变化',
  undetermined: '无法判定',
};

/** 默认「幅度不足」的门限：实际变化不足预期的一半即视为幅度不够 */
export const WEAKER_RATIO = 0.5;

const finite = (v) => Number.isFinite(Number(v)) && v !== null && v !== '';

const signOf = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * 对一条预期与实际做判定。
 *
 * @param {{
 *   expectation?: { direction?: number|string, magnitudePct?: number, label?: string, asOf?: string },
 *   actual?: { changePct?: number, windowKey?: string, asOf?: string },
 *   weakerRatio?: number,
 * }} input
 * @returns {{ verdict: string, label: string, basis: string, reason: string|null }}
 */
export function compareExpectation({ expectation, actual, weakerRatio = WEAKER_RATIO } = {}) {
  const dirRaw = expectation?.direction;
  // 方向允许写 1/-1，也允许写 up/down（上游两种都有）
  const expectedDir =
    dirRaw === 'up' ? 1 : dirRaw === 'down' ? -1 : finite(dirRaw) ? signOf(Number(dirRaw)) : null;

  if (expectedDir == null || expectedDir === 0) {
    return {
      verdict: 'undetermined',
      label: VERDICT.undetermined,
      basis: '缺少可核对的预期方向',
      reason: 'NO_EXPECTATION',
    };
  }
  if (!finite(actual?.changePct)) {
    return {
      verdict: 'undetermined',
      label: VERDICT.undetermined,
      basis: '缺少实际变化数据',
      reason: 'NO_ACTUAL',
    };
  }

  const change = Number(actual.changePct);
  const actualDir = signOf(change);
  const basis = `预期${expectedDir > 0 ? '上行' : '下行'} vs 实际 ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

  if (actualDir === 0) {
    return { verdict: 'flat', label: VERDICT.flat, basis, reason: 'NO_MOVE' };
  }
  if (actualDir !== expectedDir) {
    return { verdict: 'opposite', label: VERDICT.opposite, basis, reason: 'OPPOSITE_SIGN' };
  }

  /**
   * 方向对了还要看量级。magnitudePct 缺省时不判幅度 —— 没有预期量级就
   * 没有「够不够」这个标准，硬判会把「方向对」说成「符合」。
   */
  const mag = expectation?.magnitudePct;
  if (!finite(mag)) {
    return { verdict: 'matched', label: VERDICT.matched, basis, reason: null };
  }
  const need = Math.abs(Number(mag)) * weakerRatio;
  if (Math.abs(change) < need) {
    return { verdict: 'weaker', label: VERDICT.weaker, basis, reason: 'MAGNITUDE_SHORT' };
  }
  return { verdict: 'matched', label: VERDICT.matched, basis, reason: null };
}

/**
 * 批量判定，并给出汇总。
 *
 * 汇总**只数条数**，不给一个「命中率 68%」的合成分数 —— 一个总分会把
 * 相反的证据藏起来，而读者真正要看的是「哪几条反了」。
 */
export function summarizeExpectations(list = []) {
  const items = (list ?? []).map((x) => ({ ...x, result: compareExpectation(x) }));
  const counts = { matched: 0, weaker: 0, opposite: 0, flat: 0, undetermined: 0 };
  for (const it of items) counts[it.result.verdict] += 1;
  return {
    items,
    counts,
    total: items.length,
    /** 可以拿出来说事的那几条（方向相反最值得看，其次幅度不足） */
    notable: items.filter((it) => it.result.verdict === 'opposite' || it.result.verdict === 'weaker'),
  };
}
