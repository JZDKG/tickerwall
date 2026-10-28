/* ================================================================== *
 * 宏观关联服务：13 个品种的相关性矩阵 · 领先滞后 · 周频聚合 · 传导图谱数据
 *
 * 从 server.mjs 整段搬出（L127–L560），逻辑一字未改。
 * 零同层依赖：日线源适配器已下沉到 providers/daily.js，统计全在 stats/。
 * ================================================================== */

import { alignSeries, pairwiseCorr, nwCorrT, benjaminiHochberg } from '../stats/index.js';
import { readDailyCache, writeDailyCache, DAILY_FRESH_MS } from '../db/index.js';
import { historySourcesFor } from '../providers/index.js';

/** 关联分析的标的池：覆盖股 / 债 / 汇 / 商品 / 加密 / 波动率 */
export const MACRO_UNIVERSE = [
  { id: 'gold-intl', name: '国际金价', short: '黄金', group: 'metal', em: '122.XAU', sinaFutures: 'XAU', unit: '美元/盎司', decimals: 2, cat: '避险' },
  { id: 'gold-cn', name: '国内金价', short: '沪金', group: 'metal', em: '118.AU9999', sinaInner: 'AU0', unit: '元/克', decimals: 2, cat: '避险' },
  { id: 'copper', name: 'COMEX 铜', short: '铜', group: 'metal', em: '101.HG00Y', sinaFutures: 'HG', unit: '美元/磅', decimals: 4, cat: '工业' },
  { id: 'oil', name: 'WTI 原油', short: 'WTI', group: 'energy', em: '102.CL00Y', sinaFutures: 'CL', fred: 'DCOILWTICO', unit: '美元/桶', decimals: 2, cat: '工业' },
  { id: 'brent', name: '布伦特原油', short: '布伦特', group: 'energy', em: '112.B00Y', sinaFutures: 'OIL', fred: 'DCOILBRENTEU', unit: '美元/桶', decimals: 2, cat: '工业' },
  { id: 'sp500', name: '标普500', short: '标普', group: 'equity', em: '100.SPX', fred: 'SP500', yahoo: '^GSPC', unit: '点', decimals: 2, cat: '风险' },
  { id: 'ndx100', name: '纳斯达克100', short: '纳指', group: 'equity', em: '100.NDX100', nasdaq: 'NDX', yahoo: '^NDX', unit: '点', decimals: 2, cat: '风险' },
  { id: 'sh000001', name: '上证指数', short: '上证', group: 'equity', em: '1.000001', tx: 'sh000001', unit: '点', decimals: 2, cat: '风险' },
  { id: 'btc', name: '比特币', short: 'BTC', group: 'crypto', binance: 'BTCUSDT', unit: '美元', decimals: 2, cat: '风险' },
  { id: 'dxy', name: '美元指数', short: '美元', group: 'fx', em: '100.UDI', sinaForex: 'DINIW', unit: '点', decimals: 2, cat: '美元' },
  { id: 'us10y', name: '美债10年期', short: '10Y', group: 'rate', em: '171.US10Y', fred: 'DGS10', unit: '%', decimals: 3, cat: '利率', kind: 'rate' },
  { id: 'vix', name: 'VIX 恐慌指数', short: 'VIX', group: 'vol', cboe: 'VIX', yahoo: '^VIX', unit: '点', decimals: 2, cat: '风险' },
  { id: 'vxn', name: 'VXN 纳指波动率', short: 'VXN', group: 'vol', cboe: 'VXN', unit: '点', decimals: 2, cat: '风险' },
];

// 从唯一来源再导出：直接在这里定义会和 server.mjs 各写一份默认值
export { PORT, HOST } from '../config.js';

export const MACRO_CACHE_TTL_MS = 120_000;
export const macroCache = new Map();


/** 取单个标的的日收盘序列（按来源分流） */
/**
 * 按标的配置拼出历史源任务列表。
 * 详情页与宏观页/事件研究共用这一套，否则两边的降级行为会分叉 ——
 * 之前宏观页就只硬编码了东财一个源，东财一挂宏观与事件研究直接缺 10 个品种。
 */


export async function fetchMacroSeries(def) {
  // 1) 8 小时内的库缓存直接复用 —— 宏观页 2 分钟一过期就重拉 13 个品种数千条日线太浪费
  const cached = await readDailyCache(def.id);
  if (cached && Date.now() - cached.savedAt < DAILY_FRESH_MS) {
    return { rows: cached.rows, meta: { source: cached.source, name: def.name, code: def.id } };
  }

  // 2) 打源，取条数最多的一份
  const jobs = historySourcesFor(def);
  const errors = [];
  let best = null;
  for (const job of jobs) {
    try {
      const r = await job();
      if (r?.rows?.length && (!best || r.rows.length > best.rows.length)) best = r;
      if (best && best.rows.length >= 500) break;
    } catch (err) {
      errors.push(`${job.sourceName}: ${err?.message ?? err}`);
    }
  }

  if (best) {
    // 只在「不比库里少」时覆盖，避免宏观页用 500 条的短序列把详情页 5000 条的历史冲掉
    if (!cached || best.rows.length >= cached.rows.length) {
      await writeDailyCache(def.id, best.meta.source, best.rows);
    }
    return best;
  }

  // 3) 源全挂才退回旧缓存
  if (cached) {
    return { rows: cached.rows, meta: { source: cached.source, name: def.name, code: def.id } };
  }
  throw new Error(errors.join(' / ') || '无可用来源');
}

/** 收盘序列 → 日变化序列（利率用百分点差，其余用对数收益率） */
export function toChanges(rows, kind) {
  const dates = [];
  const values = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    const cur = rows[i].close;
    if (!(prev > 0) || !(cur > 0)) continue;
    dates.push(rows[i].date);
    values.push(kind === 'rate' ? cur - prev : Math.log(cur / prev));
  }
  return { dates, values };
}

/**
 * 把日线聚合成周线（按 ISO 周，保留每周最后一个交易日）。
 * 跨时区标的（国际金 vs 沪金）的日收益率会因「交易日切分点不同」而错位，
 * 实测同一标的日频相关仅 0.48、周频 0.79，所以周频矩阵是必要的对照口径。
 */
export function aggregateWeekly(rows) {
  const weeks = new Map();
  for (const r of rows) {
    const ts = Date.parse(r.date);
    if (!Number.isFinite(ts)) continue;
    // 分桶口径：周一 ~ 周日（周日必须归入**前一个**周一开的周）。
    // 原来写成 floor((d+4)/7) 实际是「周日 ~ 周六」分桶：美股周五与 BTC 周日
    // 会落进相邻两个桶，标签永远对不上，BTC 整行相关全是 null —— 与注释里
    // 「统一用该周周一」的意图相反。这里改成 +3，桶边界落在周一。
    const key = Math.floor((ts / 86400000 + 3) / 7);
    // 关键：标签统一用「该周周一」。
    // 若沿用原始交易日日期，美股（周五收）与加密（周日收）的标签会不同，
    // 跨标的配对时会全部错开——之前 BTC 整行都算不出相关性就是这个原因。
    const monday = new Date((key * 7 - 3) * 86400000).toISOString().slice(0, 10);
    weeks.set(key, { ...r, date: monday });
  }
  return [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

/** 按窗口截取最近 N 个观测 */
export function tailWindow(series, win) {
  if (!win || win <= 0) return series;
  return {
    dates: series.dates.slice(-win),
    values: series.values.slice(-win),
  };
}

/** 两两相关性：用两者共同交易日（pairwise），比强行取全体交集保留更多样本 */

/* ------------------------------------------------------------------ *
 * 统计严谨性
 * 之前只给了相关系数点估计。12x12 矩阵有 66 对、领先滞后再乘 11 个滞后，
 * 约 700 个检验 —— 5% 显著性下纯随机也会跑出 35 个「显著」。
 * 所以补：Fisher z 置信区间、Newey-West 标准误、Benjamini-Hochberg 校正、样本内外验证。
 * ------------------------------------------------------------------ */

/**
 * 单个相关对的完整统计
 * 同时给样本内（前 70%）与样本外（后 30%）的系数，符号一致才算稳定
 */
/** 把两个序列对齐到共同交易日 */
/**
 * 领先滞后：只在「共同交易日」序列上做索引平移（lag 单位 = 交易日）。
 * lag > 0 表示 A 的当日在预测 B 的 lag 个交易日之后 → A 领先 B。
 */
/**
 * 双向领先滞后扫描。
 * lag > 0 表示 a 领先 b，lag < 0 表示 b 领先 a。
 *
 * 原来只扫 lag = 1..maxLag 单向（a→b），而 MACRO_UNIVERSE 里 dxy 排第 10、us10y 排第 11，
 * 于是「美元/美债领先黄金、原油、铜、美股」这类最核心的宏观规律 100% 扫不到。
 * 改成每个滞后同时检验两个方向后，所有配对的方向都被覆盖。
 */
export function leadLagScan(a, b, maxLag = 5) {
  const { xs, ys } = alignSeries(a, b);
  if (xs.length < 30) return null;
  const base = nwCorrT(xs, ys);
  const lags = [];
  for (let lag = 1; lag <= maxLag; lag += 1) {
    const lx = [];
    const ly = [];
    for (let i = 0; i < xs.length - lag; i += 1) {
      lx.push(xs[i]);
      ly.push(ys[i + lag]);
    }
    const fwd = nwCorrT(lx, ly);
    if (fwd?.pNW != null) lags.push({ lag, ...fwd });

    const rx = [];
    const ry = [];
    for (let i = 0; i < xs.length - lag; i += 1) {
      rx.push(ys[i]);
      ry.push(xs[i + lag]);
    }
    const bwd = nwCorrT(rx, ry);
    if (bwd?.pNW != null) lags.push({ lag: -lag, ...bwd });
  }
  return { base, lags, n: xs.length };
}

export async function buildMacro(windowSize = 250, freq = 'day') {
  const results = await Promise.allSettled(MACRO_UNIVERSE.map((d) => fetchMacroSeries(d)));

  const universe = [];
  const series = new Map();
  const zSeries = new Map();

  results.forEach((r, i) => {
    const def = MACRO_UNIVERSE[i];
    if (r.status !== 'fulfilled') {
      universe.push({ ...def, ok: false, error: String(r.reason?.message ?? r.reason) });
      return;
    }
    const rawRows = r.value.rows;
    const rows = freq === 'week' ? aggregateWeekly(rawRows) : rawRows;
    const chg = toChanges(rows, def.kind);
    series.set(def.id, tailWindow(chg, windowSize));
    // zOf 需要至少 40 期样本估波动率，而 series 里存的是被 windowSize 截断后的序列。
    // 前端切「20日」时 windowSize=20，zOf 会全部返回 null、整个 Risk-On 指标消失。
    // 所以单独留一份近 65 期原始变动给 z-Score 专用，不受窗口影响。
    zSeries.set(def.id, {
      dates: (chg.dates ?? []).slice(-65),
      values: (chg.values ?? []).slice(-65),
    });
    universe.push({
      id: def.id,
      // kind 必须透出去：前端要靠 rate 标记把利率折算成债券价格，否则会按普通资产算 exp()
      kind: def.kind ?? 'price',
      name: def.name,
      short: def.short,
      group: def.group,
      cat: def.cat,
      unit: def.unit,
      decimals: def.decimals,
      ok: true,
      last: rows[rows.length - 1]?.close ?? null,
      lastDate: rows[rows.length - 1]?.date ?? null,
      samples: chg.dates.length,
      start: chg.dates[0] ?? null,
      end: chg.dates[chg.dates.length - 1] ?? null,
      source: r.value.meta?.source ?? null,
    });
  });

  const ids = universe.filter((u) => u.ok).map((u) => u.id);
  const corr = [];
  const counts = [];
  const pairStats = [];
  for (let i = 0; i < ids.length; i += 1) {
    corr.push([]);
    counts.push([]);
  }
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i; j < ids.length; j += 1) {
      if (i === j) {
        corr[i][j] = 1;
        counts[i][j] = series.get(ids[i]).dates.length;
        continue;
      }
      const st = pairwiseCorr(series.get(ids[i]), series.get(ids[j]));
      const c = st.corr;
      corr[i][j] = c;
      corr[j][i] = c;
      pairStats.push({ i, j, ...st });
      counts[i][j] = st.n;
      counts[j][i] = st.n;
    }
  }

  // 多重比较校正：66 个相关对一起做 BH，避免「纯随机也显著」被当成发现
  const pList = pairStats.map((r) => (r.pNW != null ? r.pNW : 1));
  const { reject, qvals } = benjaminiHochberg(pList, 0.05);
  const matrixStats = pairStats.map((r, k) => ({
    a: ids[r.i],
    b: ids[r.j],
    corr: r.corr,
    n: r.n,
    ci: r.ci,
    t: r.t,
    p: r.p,
    tNW: r.tNW,
    pNW: r.pNW,
    q: qvals[k],
    significantBH: reject[k],
    inR: r.inR,
    outR: r.outR,
    stable: r.stable,
  }));

  const sigCount = matrixStats.filter((r) => r.significantBH).length;
  const stableCount = matrixStats.filter((r) => r.significantBH && r.stable).length;

  /**
   * 领先滞后。
   *
   * 两个统计口径的修正：
   * 1) 全检验族校正。原来是先按 gain>=0.04 与 |corr|>=0.15 筛剩几个配对，再对这几个做 BH。
   *    这是错的 —— 被筛掉的假设也参与了「碰巧显著」的机会，不纳入族里会让 q 值偏小。
   *    现在先把 C(13,2)×2方向×5滞后 的 780 个假设全部算出来一起做 BH，再筛展示。
   * 2) Newey-West t。滞后相关的残差有自相关，普通 t 会系统性高估显著性。
   */
  const llHypotheses = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const r = leadLagScan(series.get(ids[i]), series.get(ids[j]));
      if (!r?.base || !r.lags.length) continue;
      for (const L of r.lags) {
        llHypotheses.push({
          i,
          j,
          lag: L.lag,
          corr: L.corr,
          tNW: L.tNW,
          p: L.pNW,
          n: L.n,
          base: r.base.corr,
        });
      }
    }
  }
  const llBH = benjaminiHochberg(
    llHypotheses.map((h) => (h.p == null ? 1 : h.p)),
    0.05,
  );
  llHypotheses.forEach((h, k) => {
    h.q = llBH.qvals[k];
    h.significantBH = llBH.reject[k];
  });

  // 每个配对只保留绝对相关最强的那一个滞后方向
  const bestByPair = new Map();
  for (const h of llHypotheses) {
    const key = `${h.i}-${h.j}`;
    const cur = bestByPair.get(key);
    if (!cur || Math.abs(h.corr) > Math.abs(cur.corr)) bestByPair.set(key, h);
  }

  const leadLag = [];
  for (const h of bestByPair.values()) {
    if (h.lag === 0) continue;
    const gain = Math.abs(h.corr) - Math.abs(h.base);
    if (gain < 0.04) continue; // 提升不明显就按同期联动处理
    if (Math.abs(h.corr) < 0.15) continue; // 太弱的关系不列出，避免误导
    const aLeads = h.lag > 0;
    leadLag.push({
      leader: aLeads ? ids[h.i] : ids[h.j],
      follower: aLeads ? ids[h.j] : ids[h.i],
      lag: Math.abs(h.lag),
      corr: h.corr,
      sameDay: h.base,
      n: h.n,
      tNW: h.tNW,
      p: h.p,
      q: h.q,
      significantBH: h.significantBH,
      pool: llHypotheses.length,
    });
  }

  leadLag.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));

  /**
   * 风险偏好（Risk-On / Risk-Off）。
   * 不能把各资产收益率简单等权：BTC 日波动约 3.5%，美元指数只有 0.35%，
   * 等权相加后这个指标基本等于「BTC + 原油指标」，标普和美元的信号被噪声淹掉。
   * 所以先按各自波动率标准化（z = r / σ60），再取均值，让每个资产贡献一个「标准差单位」。
   *
   * 篮子里也不放原油：供给冲击下油涨、股跌是典型滞胀型 Risk-Off，
   * 把原油算进风险端会把方向判反。改用 COMEX 铜（工业需求代理）。
   * 避险端用 VIX + 美元，美债按「债券价格」口径计入（收益率上行 = 债券跌 = 避险走弱，故取反）。
   */
  const zOf = (id, invert = false) => {
    const s = zSeries.get(id);
    const vals = s?.values;
    if (!vals || vals.length < 40) return null;
    // 用前 60 期估波动率，把当期剔出去，否则当期极值会同时污染分子和分母
    const look = vals.slice(-61, -1);
    if (look.length < 20) return null;
    const mean = look.reduce((a, b) => a + b, 0) / look.length;
    const sd = Math.sqrt(look.reduce((a, b) => a + (b - mean) ** 2, 0) / (look.length - 1));
    if (!(sd > 0)) return null;
    const cur = vals[vals.length - 1];
    if (!Number.isFinite(cur)) return null;
    const z = (cur - mean) / sd;
    return { z: invert ? -z : z, sigma: sd, date: s.dates[s.dates.length - 1] };
  };
  const zBasket = (specs) => {
    const items = specs.map(([id, inv]) => [id, zOf(id, inv)]).filter(([, v]) => v);
    if (!items.length) return null;
    const z = items.reduce((a, [, v]) => a + v.z, 0) / items.length;
    // 成员日期不一致说明有市场还停在上一交易日（BTC 周末交易、时区错位）
    const dates = [...new Set(items.map(([, v]) => v.date))].sort();
    return { z, n: items.length, members: items.map(([id]) => id), dates, aligned: dates.length === 1 };
  };
  const riskBasket = zBasket([['sp500', false], ['ndx100', false], ['copper', false], ['btc', false]]);
  const hedgeBasket = zBasket([['vix', false], ['dxy', false], ['us10y', true]]);
  const risk = riskBasket?.z ?? null;
  const hedge = hedgeBasket?.z ?? null;
  const spread = risk != null && hedge != null ? risk - hedge : null;

  /**
   * 波动率风险溢价 VRP = VIX − 标普 20 日实现波动率。
   * 隐含波动率长期高于实现波动率（期权卖方要报酬），溢价被压到极低说明保护便宜、
   * 市场自满；溢价飙升说明大家在抢着买保护。
   */
  const vrp = (() => {
    const vixU = universe.find((u) => u.id === 'vix');
    // 用 zSeries（固定 65 期）而不是受 windowSize 截断的 series，
    // 否则切 周频+20日 时样本不足 20，VRP 会整个消失
    const spx = zSeries.get('sp500');
    if (!vixU?.ok || vixU.last == null || !spx || spx.values.length < 20) return null;
    const sl = spx.values.slice(-20);
    const m = sl.reduce((a, b) => a + b, 0) / sl.length;
    const sd = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / (sl.length - 1));
    const rv20 = sd * Math.sqrt(252) * 100;
    return {
      vix: vixU.last,
      rv20,
      vrp: vixU.last - rv20,
      ratio: rv20 > 0 ? vixU.last / rv20 : null,
      asOf: spx.dates[spx.dates.length - 1] ?? null,
    };
  })();

  // 最近 400 个共同观测，供前端画归一化对比与滚动相关性
  const allDates = new Set();
  for (const s of series.values()) s.dates.slice(-400).forEach((d) => allDates.add(d));
  const recentDates = [...allDates].sort().slice(-400);
  const recent = {};
  for (const [id, s] of series) {
    const map = new Map();
    s.dates.forEach((d, i) => map.set(d, s.values[i]));
    recent[id] = recentDates.map((d) => (map.has(d) ? map.get(d) : null));
  }

  return {
    ok: ids.length >= 2,
    generatedAt: new Date().toISOString(),
    windowSize,
    freq,
    universe,
    matrix: { ids, corr, counts, stats: matrixStats },
    leadLag: leadLag.slice(0, 20),
    riskAppetite: {
      risk,
      hedge,
      spread,
      label:
        // 阈值按 σ 定：±0.2σ 只覆盖正态中间 16%，几乎天天触发；±0.5σ 才算显著偏离
        spread == null ? null : spread > 0.5 ? 'Risk-On' : spread < -0.5 ? 'Risk-Off' : '中性',
      unit: 'sigma',
      riskMembers: riskBasket?.members ?? [],
      hedgeMembers: hedgeBasket?.members ?? [],
      aligned: riskBasket?.aligned && hedgeBasket?.aligned ? true : false,
      memberDates: [...new Set([...(riskBasket?.dates ?? []), ...(hedgeBasket?.dates ?? [])])].sort(),
      asOf: recentDates[recentDates.length - 1] ?? null,
    },
    vrp,
    recent: { dates: recentDates, changes: recent },
  };
}

export async function getMacro(windowSize, freq = 'day', { force = false } = {}) {
  const key = `${freq}:${windowSize}`;
  const cached = macroCache.get(key);
  if (!force && cached && Date.now() - cached.at < MACRO_CACHE_TTL_MS) return cached.data;
  const data = await buildMacro(windowSize, freq);
  macroCache.set(key, { at: Date.now(), data });
  return data;
}
