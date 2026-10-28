/* ================================================================== *
 * 预期的来源：宏观日历（产品 2.4 第二块）
 *
 * 判定层（expectations.js）管「预期方向 vs 实际变化」。这一层管另一种更常见
 * 的「预期」：一条数据公布前市场给的预期值，公布后有了实际值。
 * 两者是不同的判定族，**不能混用**：
 *   · 方向判定回答「我以为会涨，实际涨了没有」；
 *   · 超预期判定回答「我以为会是多少，实际是多少」。
 *
 * 三条约束：
 *   1. 还没到公布时间 → pending（未公布），不是「无法判定」；
 *   2. 已公布但没有实际值 → undetermined，理由写 NO_ACTUAL；
 *   3. 「符合预期」要有容差，且**容差随量级缩放** —— 一个 0.1 的差在
 *      预期 2.0 上算符合，在预期 0.05 上就是翻倍。
 * ================================================================== */

/** 超预期判定词汇。到界面上就用这几个说法，不要另造同义词。 */
export const SURPRISE = {
  above: '高于预期',
  below: '低于预期',
  inLine: '基本符合预期',
  pending: '尚未公布',
  undetermined: '无法判定',
};

/** 默认容差：预期值的 0.5%（相对），且不小于 1e-9 防止除零 */
export const DEFAULT_TOLERANCE = 0.005;

const finite = (v) => v !== null && v !== '' && Number.isFinite(Number(v));

const num = (v) => (finite(v) ? Number(v) : null);

/**
 * 单条：预期值 vs 实际值。
 *
 * @param {{ expected?: number|string, actual?: number|string, releaseAt?: string,
 *           unit?: string, title?: string, tolerance?: number, nowMs?: number }} input
 */
export function judgeRelease({
  expected,
  actual,
  releaseAt = null,
  unit = null,
  title = '',
  tolerance = DEFAULT_TOLERANCE,
  nowMs = Date.now(),
} = {}) {
  const exp = num(expected);
  const act = num(actual);
  const atMs = releaseAt ? Date.parse(String(releaseAt)) : null;
  const released = atMs == null ? true : Number.isFinite(atMs) ? atMs <= nowMs : true;

  const basis = [
    title || null,
    exp == null ? '无预期值' : `预期 ${exp}`,
    act == null ? null : `实际 ${act}`,
    unit || null,
  ].filter(Boolean).join(' · ');

  if (!released) {
    return { verdict: 'pending', label: SURPRISE.pending, basis, reason: 'NOT_RELEASED', gap: null };
  }
  if (exp == null) {
    return { verdict: 'undetermined', label: SURPRISE.undetermined, basis, reason: 'NO_EXPECTATION', gap: null };
  }
  if (act == null) {
    return { verdict: 'undetermined', label: SURPRISE.undetermined, basis, reason: 'NO_ACTUAL', gap: null };
  }

  const gap = act - exp;
  // 容差随量级缩放：预期 2.0 时 0.1 的差算符合，预期 0.05 时 0.1 就是翻倍
  const eps = Math.max(Math.abs(exp) * tolerance, 1e-9);
  if (Math.abs(gap) <= eps) {
    return { verdict: 'inLine', label: SURPRISE.inLine, basis, reason: null, gap };
  }
  return {
    verdict: gap > 0 ? 'above' : 'below',
    label: gap > 0 ? SURPRISE.above : SURPRISE.below,
    basis,
    reason: null,
    gap,
  };
}

/**
 * 从日历的待公布列表里取出可判定的条目。
 *
 * 只保留「有标题且有时间」的条目 —— 取不到时间的条目无法判断是否已公布，
 * 硬塞进列表会让「尚未公布」和「已公布」混在一起。
 */
export function judgeCalendarReleases(calendar, { nowMs = Date.now(), limit = 12, tolerance } = {}) {
  const upcoming = Array.isArray(calendar?.upcoming) ? calendar.upcoming : [];
  const items = [];
  for (const ev of upcoming) {
    const releaseAt = ev?.releaseAt ?? null;
    if (!ev?.title || !releaseAt) continue;
    const atMs = Date.parse(String(releaseAt));
    if (!Number.isFinite(atMs)) continue;
    items.push({
      id: ev.id ?? null,
      title: ev.title,
      country: ev.country ?? null,
      importance: ev.importance ?? null,
      releaseAt,
      unit: ev.unit ?? null,
      ...judgeRelease({ ...ev, releaseAt, nowMs, ...(tolerance != null ? { tolerance } : {}) }),
    });
  }
  // 已公布且与预期有偏差的排前面（那是读者要看的），其余按时间近远
  const rank = (x) => (x.verdict === 'above' || x.verdict === 'below' ? 0 : x.verdict === 'inLine' ? 1 : x.verdict === 'pending' ? 2 : 3);
  items.sort((a, b) => rank(a) - rank(b) || String(a.releaseAt).localeCompare(String(b.releaseAt)));
  return items.slice(0, limit);
}

/**
 * 汇总：只数条数，不给「命中率」。
 *
 * 与 expectations.js 的 summarizeExpectations 同一条原则：一个总分会把
 * 相反的证据藏起来。这里额外给出 deviated（与预期有偏差的那些），
 * 因为「哪几条超预期」就是这一屏的全部意义。
 */
export function summarizeReleases(list = []) {
  const items = list ?? [];
  const counts = { above: 0, below: 0, inLine: 0, pending: 0, undetermined: 0 };
  for (const it of items) if (counts[it?.verdict] != null) counts[it.verdict] += 1;
  return {
    items,
    counts,
    total: items.length,
    deviated: items.filter((it) => it?.verdict === 'above' || it?.verdict === 'below'),
  };
}
