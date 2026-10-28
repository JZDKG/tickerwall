/* ================================================================== *
 * 实盘背离检测引擎的契约测试
 *
 * 被测：src/client/views/macro/divergence-engine.js（纯函数，无 DOM / 无请求）
 * 运行：npm test
 *
 * 分三层：
 *   1. 判定规则的边界 —— 用可解析出精确 ρ 的合成序列，专打 0.35 / 0.45 两条线的两侧；
 *   2. 真实载荷回归 —— tests/fixtures/macro-snapshot.json 是 /api/macro 的裁剪快照，
 *      钉死 E06（单窗强背离）/ E08（噪声被滤）/ E15（持续确认）三个线上真实场景；
 *   3. 派生产物 —— pickAlert 的优先级、propagateShock 的两跳多空交织。
 *
 * 为什么不用「期望值 = 引擎自己的输出」这种写法：那样改坏了测试也跟着改，等于没测。
 * 所以 ρ 一律在测试里用独立实现的 Pearson 现算，判定结果按文档写死的规则再推一遍。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TREND_DIVERGE_ABS,
  TREND_DIVERGE_STRONG,
  TREND_ALIGN_ABS,
  SIG_MOVE_K,
  evaluateEdgeReality,
  evaluateAll,
  findEdge,
  findLastValid,
  lastCommonIndex,
  calcStd,
  lastRollingCorr,
  fmtChg,
  pickAlert,
  propagateShock,
} from '../src/client/views/macro/divergence-engine.js';
import {
  MACRO_TRANSMISSION_EDGES,
  CORE_EDGES,
  SHOCK_CONDITIONS,
  SHOCK_CONDITION_SETS,
  shockConditionSet,
} from '../src/client/views/macro/knowledge-base.js';

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/macro-snapshot.json', import.meta.url)), 'utf8'),
);

/* ------------------------------------------------------------------ *
 * 独立实现的 Pearson（故意与引擎里的那份分开写，避免自证）
 * ------------------------------------------------------------------ */
function refPearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
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
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

/** 独立实现的「最近 win 个共同观测」滚动相关（先成对剔空、再截尾） */
function refRolling(a, b, win) {
  const xs = [];
  const ys = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] != null && b[i] != null && Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      xs.push(a[i]);
      ys.push(b[i]);
    }
  }
  const px = xs.slice(-win);
  const py = ys.slice(-win);
  if (px.length < Math.max(6, Math.floor(win * 0.6))) return null;
  return refPearson(px, py);
}

/**
 * 造一对相关系数精确可控的序列。
 *
 * b = cosθ·a + sinθ·z，其中 a 是方波、z 是相位错开 90° 的方波 —— 两者零均值且正交，
 * 所以 per-segment 的 ρ(a, b) 正好是 cosθ。
 *
 * 末尾一条置 0：evaluateEdgeReality 的 dayDiverged 要求「最新一期两端都在剧烈异动」，
 * 把末值按平就关掉这条支路，才能单独验证趋势判定那两条腿。
 */
function synth(segments, { amp = 0.01 } = {}) {
  const waveA = (i) => (Math.floor(i / 1) % 2 === 0 ? 1 : -1);
  const waveZ = (i) => (Math.floor(i / 2) % 2 === 0 ? 1 : -1);
  const a = [];
  const b = [];
  for (const { len, rho } of segments) {
    const cos = rho;
    const sin = Math.sqrt(Math.max(1 - rho * rho, 0));
    for (let k = 0; k < len; k += 1) {
      const i = a.length;
      const va = waveA(i);
      const vz = waveZ(i);
      a.push(va * amp);
      b.push((cos * va + sin * vz) * amp);
    }
  }
  a[a.length - 1] = 0;
  b[b.length - 1] = 0;
  return { a, b };
}

const mkData = (a, b) => ({ recent: { dates: a.map((_, i) => `d${i}`), changes: { X: a, Y: b } } });
const mkEdge = (sign = 1) => ({ id: 'T1', from: 'X', to: 'Y', sign, weight: 2, label: '测试' });

/** 按 docs 里写死的规则独立推导状态，用来和引擎对齐 */
function expectedStatus(edge, a, b) {
  const r20 = refRolling(a, b, 20);
  const r60 = refRolling(a, b, 60);
  const lastA = findLastValid(a);
  const lastB = findLastValid(b);
  const stdA = calcStd(a.slice(-60));
  const stdB = calcStd(b.slice(-60));
  const bigMove =
    lastA != null && lastB != null && stdA && stdB &&
    Math.abs(lastA) > SIG_MOVE_K * stdA && Math.abs(lastB) > SIG_MOVE_K * stdB;
  const prodSign = lastA != null && lastB != null ? Math.sign(lastA * lastB) : 0;
  const dayDiverged = bigMove && prodSign !== 0 && prodSign !== edge.sign;
  const opp20 = r20 != null && Math.sign(r20) !== edge.sign;
  const opp60 = r60 != null && Math.sign(r60) !== edge.sign;
  const trendDiverged =
    opp20 && (Math.abs(r20) >= TREND_DIVERGE_STRONG || (Math.abs(r20) >= TREND_DIVERGE_ABS && opp60));
  const aligned =
    (bigMove && prodSign === edge.sign) ||
    (r20 != null && Math.sign(r20) === edge.sign && Math.abs(r20) >= TREND_ALIGN_ABS);
  return {
    status: dayDiverged || trendDiverged ? 'diverged' : aligned ? 'aligned' : 'neutral',
    r20,
    r60,
    dayDiverged,
    trendDiverged,
    aligned,
  };
}

/* ================================================================== *
 * 1. 判定规则边界
 * ================================================================== */

describe('趋势背离：0.35 / 0.45 两条线', () => {
  it('单窗强背离：|ρ20| ≥ 0.45 且反号即成立，不要求 ρ60 同向（E06 形态）', () => {
    // 前 40 期与理论同号（+0.5），近 20 期强烈反号 → ρ60 被前段拉回同号
    const { a, b } = synth([{ len: 40, rho: 0.5 }, { len: 20, rho: -0.55 }]);
    const edge = mkEdge(1);
    const r = evaluateEdgeReality(edge, mkData(a, b));
    const exp = expectedStatus(edge, a, b);

    expect(r.roll20).toBeCloseTo(exp.r20, 10);
    expect(Math.abs(r.roll20)).toBeGreaterThanOrEqual(TREND_DIVERGE_STRONG);
    expect(Math.sign(r.roll60)).toBe(1); // 60 期仍与理论同号
    expect(r.trendDiverged).toBe(true);
    expect(r.status).toBe('diverged');
  });

  it('持续确认：0.35 ≤ |ρ20| < 0.45 且 ρ60 也反号才成立（E15 形态）', () => {
    const { a, b } = synth([{ len: 40, rho: -0.5 }, { len: 20, rho: -0.4 }]);
    const edge = mkEdge(1);
    const r = evaluateEdgeReality(edge, mkData(a, b));
    const exp = expectedStatus(edge, a, b);

    expect(Math.abs(r.roll20)).toBeGreaterThanOrEqual(TREND_DIVERGE_ABS);
    expect(Math.abs(r.roll20)).toBeLessThan(TREND_DIVERGE_STRONG);
    expect(Math.sign(r.roll60)).toBe(-1);
    expect(r.trendDiverged).toBe(true);
    expect(r.status).toBe('diverged');
    expect(exp.status).toBe('diverged');
  });

  it('缺 60 期确认时压回 neutral：0.35 ≤ |ρ20| < 0.45 但 ρ60 与理论同号', () => {
    const { a, b } = synth([{ len: 40, rho: 0.5 }, { len: 20, rho: -0.4 }]);
    const edge = mkEdge(1);
    const r = evaluateEdgeReality(edge, mkData(a, b));

    expect(Math.abs(r.roll20)).toBeGreaterThanOrEqual(TREND_DIVERGE_ABS);
    expect(Math.abs(r.roll20)).toBeLessThan(TREND_DIVERGE_STRONG);
    expect(Math.sign(r.roll60)).toBe(1);
    expect(r.trendDiverged).toBe(false);
    expect(r.status).toBe('neutral');
  });

  it('低于 0.35 地板一律 neutral：反号但只到 0.28', () => {
    const { a, b } = synth([{ len: 40, rho: -0.2 }, { len: 20, rho: -0.28 }]);
    const edge = mkEdge(1);
    const r = evaluateEdgeReality(edge, mkData(a, b));

    expect(Math.abs(r.roll20)).toBeLessThan(TREND_DIVERGE_ABS);
    expect(r.trendDiverged).toBe(false);
    expect(r.status).toBe('neutral');
  });

  it('走势与机制一致：同号且 |ρ20| ≥ 0.25', () => {
    const { a, b } = synth([{ len: 40, rho: 0.45 }, { len: 20, rho: 0.4 }]);
    const edge = mkEdge(1);
    const r = evaluateEdgeReality(edge, mkData(a, b));

    expect(r.roll20).toBeGreaterThanOrEqual(TREND_ALIGN_ABS);
    expect(r.status).toBe('aligned');
    // 2026-10-28 文案迁移：只表达观测一致性，不再说「兑现」（暗示因果被证实）
    expect(r.badge).toBe('✓ 走势与机制一致');
  });

  it('同号但太弱（0.2）仍然 neutral，不冒充兑现', () => {
    const { a, b } = synth([{ len: 40, rho: 0.2 }, { len: 20, rho: 0.2 }]);
    const r = evaluateEdgeReality(mkEdge(1), mkData(a, b));
    expect(Math.abs(r.roll20)).toBeLessThan(TREND_ALIGN_ABS);
    expect(r.status).toBe('neutral');
    expect(r.badge).toBe('○ 未见明显偏离');
  });
});

/* ================================================================== *
 * 共同日期配对（方案 §2 第 1 条 / §10.1 第一行）
 *
 * 旧实现分别取双方「最后一条非空值」。只要两个市场的最后交易日不同
 * （跨时区、休市、数据晚到），就会把不同日期的变化当成当期同涨同跌。
 * 这一组用例钉住新口径：只用双方都有的那一天，并把这个日期一起返回。
 * ================================================================== */
describe('共同日期配对：错位的「最新值」不能当成当期', () => {
  /** 60 期平稳序列，末尾按数组下标各自加空值，模拟「一方还没更新」 */
  function padded(a, b, { tailA = 0, tailB = 0 } = {}) {
    const aa = a.concat(Array.from({ length: tailA }, () => null));
    const bb = b.concat(Array.from({ length: tailB }, () => null));
    const len = Math.max(aa.length, bb.length);
    return {
      a: aa.concat(Array.from({ length: len - aa.length }, () => null)),
      b: bb.concat(Array.from({ length: len - bb.length }, () => null)),
    };
  }

  it('A 最新为周二、B 最新为周一 → 用共同日期，并标 unaligned', () => {
    const base = synth([{ len: 60, rho: 0.5 }]);
    // A 多一个交易时段（周日历还没更新）：A 长度 61 且末值有数，B 末值为空
    const a = base.a.concat([0.001]);
    const b = base.b.concat([null]);
    const data = mkData(a, b);
    const r = evaluateEdgeReality(mkEdge(1), data);

    const commonIdx = lastCommonIndex(a, b);
    expect(commonIdx).toBe(59);
    expect(r.lastA).toBe(a[commonIdx]);
    expect(r.lastB).toBe(b[commonIdx]);
    // 显示的日期必须是共同日期，不能是 A 的更晚日期
    expect(r.asOf).toBe(`d${commonIdx}`);
    expect(r.unaligned).toBe(true);
  });

  it('两端最新值方向相反但共同日期方向相同 → 判定以共同日期为准', () => {
    const base = synth([{ len: 60, rho: 0.05 }]);
    const a = base.a.slice();
    const b = base.b.slice();
    // 共同日期那天：两端都是 +0.9σ（同向异动）
    const stdA = calcStd(a.slice(-60));
    const stdB = calcStd(b.slice(-60));
    a[a.length - 1] = stdA * 0.9;
    b[b.length - 1] = stdB * 0.9;
    // 再给 A 补一个「更新的反向值」—— 旧实现会拿它和 B 的旧值配对
    const data = mkData(a.concat([-stdA * 3]), b);
    const r = evaluateEdgeReality(mkEdge(-1), data);

    expect(r.asOf).toBe(`d${a.length - 1}`);
    expect(r.lastA).toBeCloseTo(stdA * 0.9, 12);
    expect(r.unaligned).toBe(true);
    expect(r.bigMove).toBe(true);
    // 共同日期上两端同涨 + 负相关边 → 同窗口同涨（而不是被 A 的新值带成异向）
    expect(r.badge).toBe('⚡ 同窗口同涨');
  });

  it('没有共同观测时不给当期判定，只报数据不足', () => {
    const a = Array.from({ length: 60 }, (_, i) => Math.sin(i / 5));
    const b = Array.from({ length: 60 }, () => null);
    const r = evaluateEdgeReality(mkEdge(1), mkData(a, b));
    expect(r.status).toBe('neutral');
    expect(r.badge).toBe('○ 数据不足');
  });

  it('n 报的是有效配对数，不是数组长度', () => {
    const base = synth([{ len: 60, rho: 0.4 }]);
    const { a, b } = padded(base.a, base.b, { tailA: 2, tailB: 1 });
    const r = evaluateEdgeReality(mkEdge(1), mkData(a, b));
    let expected = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      if (a[i] != null && b[i] != null) expected += 1;
    }
    expect(r.n).toBe(expected);
    expect(r.n).toBeLessThan(a.length);
  });
});

describe('单期异动分支（dayDiverged）', () => {
  /** 造一段平稳序列，然后把末值换成 want 指定的冲击 */
  function withShock(base, lastA, lastB) {
    const a = base.a.slice();
    const b = base.b.slice();
    a[a.length - 1] = lastA;
    b[b.length - 1] = lastB;
    return { a, b };
  }

  it('两端同向剧烈异动 + 负相关边 → 同窗口同涨（不再用「罕见」）', () => {
    const base = synth([{ len: 60, rho: 0.05 }]);
    const std = calcStd(base.a.slice(-60));
    const { a, b } = withShock(base, std * 2, std * 2);
    const r = evaluateEdgeReality(mkEdge(-1), mkData(a, b));

    expect(r.bigMove).toBe(true);
    expect(r.dayDiverged).toBe(true);
    expect(r.status).toBe('diverged');
    // 未计算历史频率就不能说「罕见」，只描述这个窗口里的事实
    expect(r.badge).toBe('⚡ 同窗口同涨');
  });

  it('两端同向剧烈下跌 + 负相关边 → 同窗口同跌', () => {
    const base = synth([{ len: 60, rho: 0.05 }]);
    const std = calcStd(base.a.slice(-60));
    const { a, b } = withShock(base, -std * 2, -std * 2);
    const r = evaluateEdgeReality(mkEdge(-1), mkData(a, b));

    expect(r.dayDiverged).toBe(true);
    expect(r.badge).toBe('⚡ 同窗口同跌');
  });

  it('只有一端异动不算 dayDiverged（异动要求两端同时）', () => {
    const base = synth([{ len: 60, rho: 0.05 }]);
    const std = calcStd(base.a.slice(-60));
    const { a, b } = withShock(base, std * 2, 0);
    const r = evaluateEdgeReality(mkEdge(-1), mkData(a, b));

    expect(r.bigMove).toBe(false);
    expect(r.dayDiverged).toBe(false);
  });

  it('未达 0.5σ 的大幅波动不算异动', () => {
    const base = synth([{ len: 60, rho: 0.05 }]);
    const std = calcStd(base.a.slice(-60));
    const { a, b } = withShock(base, std * 0.4, std * 0.4);
    const r = evaluateEdgeReality(mkEdge(-1), mkData(a, b));
    expect(r.bigMove).toBe(false);
  });
});

/* ================================================================== *
 * 2. 真实载荷回归
 * ================================================================== */

describe('真实载荷快照回归（2026-10 抓的 /api/macro）', () => {
  const all = evaluateAll(FIXTURE);

  it('快照结构完整：13 个市场、342 期', () => {
    expect(FIXTURE.matrix.ids).toHaveLength(13);
    expect(FIXTURE.matrix.corr).toHaveLength(13);
    expect(FIXTURE.recent.changes.oil.length).toBeGreaterThanOrEqual(250);
  });

  it('E06（10Y → 纳指，负相关边）：ρ20 强反号 + ρ60 同号 → 单窗分支命中', () => {
    const edge = MACRO_TRANSMISSION_EDGES.find((e) => e.id === 'E06');
    const r = all.get('E06');
    const exp = expectedStatus(edge, FIXTURE.recent.changes[edge.from], FIXTURE.recent.changes[edge.to]);

    expect(edge.sign).toBe(-1);
    expect(r.roll20).toBeCloseTo(exp.r20, 10);
    expect(r.roll20).toBeGreaterThanOrEqual(TREND_DIVERGE_STRONG);
    expect(r.roll60).toBeLessThan(0); // 60 期与 20 期反号 —— 正是单窗分支存在的理由
    expect(r.status).toBe('diverged');
    expect(r.badge).toBe('⚡ 观测方向不同');
  });

  it('E15（VIX → 黄金，正相关边）：ρ20 −0.41 / ρ60 −0.51 → 持续确认分支命中', () => {
    const edge = MACRO_TRANSMISSION_EDGES.find((e) => e.id === 'E15');
    const r = all.get('E15');

    expect(edge.sign).toBe(1);
    expect(r.roll20).toBeLessThan(0);
    expect(r.roll60).toBeLessThan(0);
    expect(Math.abs(r.roll20)).toBeGreaterThanOrEqual(TREND_DIVERGE_ABS);
    expect(Math.abs(r.roll20)).toBeLessThan(TREND_DIVERGE_STRONG);
    expect(r.status).toBe('diverged');
  });

  it('E08（油 → 黄金）：ρ20 −0.34 卡在 0.35 地板下方 → 被噪声过滤压回 neutral', () => {
    const edge = MACRO_TRANSMISSION_EDGES.find((e) => e.id === 'E08');
    const r = all.get('E08');

    expect(edge.sign).toBe(1);
    expect(r.roll20).toBeLessThan(0); // 反号
    expect(Math.abs(r.roll20)).toBeLessThan(TREND_DIVERGE_ABS); // 但没够 0.35
    expect(r.trendDiverged).toBe(false);
    expect(r.status).toBe('neutral');
  });

  it('每条边都给出 longCorr（矩阵里登记的 78 对全覆盖，簇内边允许 null）', () => {
    for (const e of MACRO_TRANSMISSION_EDGES) {
      const r = all.get(e.id);
      expect(r, `缺少 ${e.id}`).toBeTruthy();
      if (CORE_EDGES.some((c) => c.id === e.id)) {
        expect(typeof r.longCorr, `${e.id} 的 longCorr 应为有限数`).toBe('number');
        expect(Number.isFinite(r.longCorr)).toBe(true);
      }
    }
    expect(all.size).toBe(18);
  });
});

/* ================================================================== *
 * 3. 派生产物：告警挑选 / 沙盘传播
 * ================================================================== */

describe('pickAlert', () => {
  const fakeReality = (map) => new Map(Object.entries(map));

  it('簇内边 E18 背离时也能命中（不被 CORE 过滤掉）', () => {
    const reality = fakeReality({
      E18: { status: 'diverged', badge: '⚡ 逻辑背离', roll20: -0.5 },
    });
    const hit = pickAlert(MACRO_TRANSMISSION_EDGES, reality);
    expect(hit?.e.id).toBe('E18');
  });

  it('多条背离时权重优先，同权重再看 |ρ20|', () => {
    const reality = fakeReality({
      E10: { status: 'diverged', badge: 'x', roll20: -0.9 }, // 权重 1
      E01: { status: 'diverged', badge: 'x', roll20: -0.4 }, // 权重 3
      E05: { status: 'diverged', badge: 'x', roll20: -0.5 }, // 权重 3
      E02: { status: 'aligned', badge: 'x', roll20: 0.6 },
    });
    const hit = pickAlert(MACRO_TRANSMISSION_EDGES, reality);
    expect(hit?.e.id).toBe('E05'); // 同权重 3 里 |ρ20| 更大
    expect(hit?.e.weight).toBe(3);
  });

  it('没有背离时返回 null，不硬凑一条', () => {
    const reality = fakeReality({ E01: { status: 'aligned', badge: 'x', roll20: 0.5 } });
    expect(pickAlert(MACRO_TRANSMISSION_EDGES, reality)).toBeNull();
  });

  it('真实快照下命中的确实是 E06（权重 3 + 最强的 20 期反号）', () => {
    const hit = pickAlert(MACRO_TRANSMISSION_EDGES, evaluateAll(FIXTURE));
    expect(hit?.e.id).toBe('E06');
  });
});

describe('propagateShock（沙盘两跳）', () => {
  it('原油大涨：黄金同时被一阶利多与二阶利空击中 → conflict', () => {
    const state = propagateShock('oil', 1);
    const gold = state.get('gold-intl');

    expect(gold).toBeTruthy();
    expect(gold.conflict).toBe(true);
    expect([...gold.dirs].sort()).toEqual([-1, 1]);
    // 一阶：油→金 通胀驱动（+1）；二阶：油→10Y→金 机会成本（+1 × −1 = −1）
    const first = gold.paths.filter((p) => p.hop === 1);
    const second = gold.paths.filter((p) => p.hop === 2);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(first.every((p) => p.dir === 1)).toBe(true);
    expect(second.some((p) => p.dir === -1)).toBe(true);
  });

  it('默认只走两跳，不会无限展开', () => {
    const state = propagateShock('oil', 1);
    for (const [, v] of state) expect(v.hop).toBeLessThanOrEqual(2);
    expect(state.has('oil')).toBe(false); // 震源自身不在结果里（视图层单独点亮）
  });

  it('方向随边符号连乘：跌向冲击得到镜像结果', () => {
    const up = propagateShock('oil', 1);
    const down = propagateShock('oil', -1);
    expect([...up.keys()].sort()).toEqual([...down.keys()].sort());
    for (const [id, v] of up) {
      const mirror = down.get(id);
      expect([...mirror.dirs].sort()).toEqual([...v.dirs].map((d) => -d).sort());
    }
  });

  it('簇内边（E16/E18）不参与传播 —— CORE 只有 16 条', () => {
    expect(CORE_EDGES).toHaveLength(16);
    expect(MACRO_TRANSMISSION_EDGES).toHaveLength(18);
    // 油 → 布伦特 是 E18（簇内），两跳内不该出现 brent
    expect(propagateShock('oil', 1).has('brent')).toBe(false);
  });
});

/* ================================================================== *
 * 4. 工具函数
 * ================================================================== */

describe('工具函数契约', () => {
  it('lastRollingCorr 先成对剔空再截尾，不按位置硬切', () => {
    // 模拟跨时区休市：最后 20 条里只有 10 条两边都有值
    const a = [];
    const b = [];
    for (let i = 0; i < 60; i += 1) {
      a.push(i % 2 === 0 ? Math.sin(i) : null);
      b.push(i % 2 === 0 ? Math.sin(i) * 2 : null);
    }
    const r = lastRollingCorr(a, b, 20);
    expect(r).toBeCloseTo(1, 6); // 完全线性相关，剔空后仍成立
    expect(refRolling(a, b, 20)).toBeCloseTo(r, 10);
  });

  it('lastRollingCorr 样本不足时返回 null（20 期窗口要求至少 12 个共同点）', () => {
    const a = Array.from({ length: 20 }, (_, i) => (i < 11 ? i : null));
    const b = Array.from({ length: 20 }, (_, i) => (i < 11 ? i : null));
    expect(lastRollingCorr(a, b, 20)).toBeNull();
  });

  it('findLastValid 跳过 null / NaN 但保留 0', () => {
    expect(findLastValid([1, 2, null, NaN, 0])).toBe(0);
    expect(findLastValid([1, 2, null])).toBe(2);
    expect(findLastValid([null, null])).toBeNull();
    expect(findLastValid('nope')).toBeNull();
  });

  it('calcStd 用样本标准差（n−1），常数序列返回 null', () => {
    expect(calcStd([1, 2, 3, 4])).toBeCloseTo(1.2909944487358056, 12);
    expect(calcStd([5, 5, 5, 5])).toBeNull();
    expect(calcStd([1, 2])).toBeNull(); // 少于 3 个有效点
  });

  it('fmtChg：价格类按对数收益率还原百分比，利率类转 bp', () => {
    expect(fmtChg(Math.log(1.01), 'price')).toBe('+1.00%');
    // 注意：这是对数收益率口径，exp(log 0.99) − 1 = −1.00%，不是简单收益率的 −1.01%
    expect(fmtChg(Math.log(0.99), 'price')).toBe('−1.00%');
    expect(fmtChg(0.045, 'rate')).toBe('+4.5bp');
    expect(fmtChg(-0.012, 'rate')).toBe('−1.2bp');
    expect(fmtChg(null, 'price')).toBe('—');
    expect(fmtChg(NaN, 'rate')).toBe('—');
  });

  it('findEdge 双向都认，未知组合返回 null', () => {
    expect(findEdge('dxy', 'gold-intl')?.id).toBe('E01');
    expect(findEdge('gold-intl', 'dxy')?.id).toBe('E01');
    expect(findEdge('btc', 'sh000001')).toBeNull();
    expect(findEdge(null, 'oil')).toBeNull();
  });

  it('数据不足时不抛错，退化成 neutral + 数据不足', () => {
    const r = evaluateEdgeReality(mkEdge(1), { recent: { changes: { X: [1, 2], Y: [1, 2] } } });
    expect(r.status).toBe('neutral');
    expect(r.badge).toBe('○ 数据不足');
    expect(r.n).toBe(0);
  });
});

/* ================================================================== *
 * 条件化沙盘（方案 §5.4 / C2）
 *
 * 同一「原油大涨」在不同原因下走的渠道不同。这里钉住三件事：
 *   · 供给受阻时成本与通胀渠道参与，需求渠道被排除并给出原因；
 *   · 需求增强时通胀与避险渠道不自动生效；
 *   · 原因未知时不筛边，但明确说明「只是结构预览」。
 * 不产出概率与先后顺序 —— 断言里也不允许出现这类措辞。
 * ================================================================== */
describe('条件化沙盘：按冲击原因筛边', () => {
  it('供给受阻：成本/通胀渠道参与，需求共振渠道被排除并说明原因', () => {
    const set = shockConditionSet('oil', 'supply');
    expect(set.enabled).toContain('E08');
    expect(set.enabled).toContain('E09');
    expect(set.suppressed.E10).toContain('成本冲击');
    expect(set.requires).toContain('SHOCK_TYPE_CLASSIFIED');
  });

  it('需求增强：通胀与避险渠道不自动生效', () => {
    const set = shockConditionSet('oil', 'demand');
    expect(set.enabled).not.toContain('E09');
    expect(set.suppressed.E09).toContain('通胀证据');
    expect(set.requires).toContain('DEMAND_EVIDENCE');
  });

  it('原因未知：不筛边（enabled null），但条件本身有说明', () => {
    const set = shockConditionSet('oil', 'unknown');
    expect(set.enabled).toBeNull();
    expect(set.conditionKey).toBe('unknown');
    const label = SHOCK_CONDITIONS.find((c) => c.key === 'unknown');
    expect(label.note).toContain('结构');
  });

  it('条件筛选真的改变传播结果：供给受阻时不把股市下跌当作需求共振', () => {
    const all = propagateShock('oil', 1, 2);
    const supply = shockConditionSet('oil', 'supply');
    const filtered = propagateShock('oil', 1, 2, { activeEdges: new Set(supply.enabled) });
    // 未筛选时应该有 sp500 这条路径（E10）
    expect(all.has('sp500')).toBe(true);
    // 筛掉 E10 之后就没有了
    expect(filtered.has('sp500')).toBe(false);
    // 但通胀渠道（us10y）仍在
    expect(filtered.has('us10y')).toBe(true);
  });

  it('未知震源不报错，退化为全部参与', () => {
    const set = shockConditionSet('not-a-node', 'supply');
    expect(set.enabled).toBeNull();
  });

  it('文案不出现概率或先后顺序', () => {
    const text = JSON.stringify(SHOCK_CONDITIONS) + JSON.stringify(SHOCK_CONDITION_SETS);
    // 不出现概率、百分比或时间先后。
    // 注意「先有需求证据」是条件语，不是时间顺序，所以不拦单独的「先」。
    expect(text).not.toMatch(/概率|大概率|随后|之后|一周内|下周|%/);
  });
});
