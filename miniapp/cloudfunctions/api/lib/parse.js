/* ================================================================== *
 * 上游响应解析（纯函数）
 *
 * 全部照搬 web 端 src/server/providers/{sina,quotes}.js 的字段下标 ——
 * 这些接口只按位置给值，写错一个下标不会报错，只会把昨收当现价。
 * 所以每个解析器都单独导出、单独可测（tests/ 里有一份对照用例）。
 * ================================================================== */

/** 宽松数值清洗：去千分位，空串 / '-' / '--' 都当无值 */
function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '' || s === '-' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 新浪批量：一次 list=a,b,c 会回多行 var hq_str_a="..."; 
 * 返回 Map<code, fields[]>
 */
function parseSinaBatch(text) {
  const map = new Map();
  const re = /var hq_str_([A-Za-z0-9_$]+)="([\s\S]*?)";/g;
  let m;
  while ((m = re.exec(text || ''))) {
    const code = m[1];
    const body = m[2];
    if (!body) continue; // 新浪对不存在的代码返回空串
    map.set(code, body.split(','));
  }
  return map;
}

/**
 * 现货 / 场内品种：gds_AU9999、hf_XAU、hf_CL、hf_OIL
 * 0 现价 · 4 最高 · 5 最低 · 6 时间 · 7 昨收 · 8 今开 · 13 备注
 */
function parseSinaSpot(f) {
  if (!f) return null;
  const price = toNum(f[0]);
  if (!(price > 0)) return null;
  return {
    price,
    prevClose: toNum(f[7]),
    open: toNum(f[8]),
    high: toNum(f[4]),
    low: toNum(f[5]),
    sessionTime: f[6] || null,
    note: f[13] || null,
  };
}

/**
 * 新浪美股指数：gb_$inx / gb_$ndx
 * 1 最新价 · 2 涨跌幅% · 3 时间 · 4 涨跌额 · 5 开盘 · 6 最高 · 7 最低 · 26 昨收
 */
function parseSinaGlobal(f) {
  if (!f) return null;
  const price = toNum(f[1]);
  if (!(price > 0)) return null;
  const change = toNum(f[4]);
  let prevClose = toNum(f[26]);
  if (prevClose == null && change != null) prevClose = price - change;
  return {
    price,
    prevClose,
    change,
    changePct: toNum(f[2]),
    open: toNum(f[5]),
    high: toNum(f[6]),
    low: toNum(f[7]),
    sessionTime: f[3] ? String(f[3]).slice(-8) : null,
  };
}

/** 新浪 A 股指数完整格式 sh000001：1 开 · 2 昨收 · 3 现价 · 4 高 · 5 低 · 31 时间 */
function parseSinaIndexFull(f) {
  if (!f) return null;
  const price = toNum(f[3]);
  if (!(price > 0)) return null;
  return {
    price,
    prevClose: toNum(f[2]),
    open: toNum(f[1]),
    high: toNum(f[4]),
    low: toNum(f[5]),
    sessionTime: f[31] || null,
  };
}

/** 新浪外汇 DINIW / fx_susdcnh：0 时间 · 3 昨收 · 5 今开 · 6 高 · 7 低 · 8 现价 */
function parseSinaForex(f) {
  if (!f) return null;
  const price = toNum(f[8]) != null ? toNum(f[8]) : toNum(f[1]);
  if (!(price > 0)) return null;
  return {
    price,
    prevClose: toNum(f[3]),
    open: toNum(f[5]),
    high: toNum(f[6]),
    low: toNum(f[7]),
    sessionTime: f[0] || null,
  };
}

/** 新浪国内期货 nf_AU0：1 时间 · 2 开 · 3 高 · 4 低 · 8 最新 · 10 昨结算 */
function parseSinaFutures(f) {
  if (!f) return null;
  const price = toNum(f[8]) != null ? toNum(f[8]) : toNum(f[6]);
  if (!(price > 0)) return null;
  const hhmmss = String(f[1] || '').padStart(6, '0');
  return {
    price,
    prevClose: toNum(f[10]),
    open: toNum(f[2]),
    high: toNum(f[3]),
    low: toNum(f[4]),
    sessionTime: /^\d{6}$/.test(hhmmss) ? `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}` : null,
  };
}

/**
 * 东方财富批量报价 ulist.np。
 * fltt=2 时 f2 现价 / f3 涨跌幅% / f4 涨跌额 / f15 高 / f16 低 / f17 开 / f18 昨收
 * 都是已换算的小数，不需要再除 10^n。返回 Map<"市场.代码", quote>
 */
function parseEastmoneyBatch(json) {
  const map = new Map();
  const diff = json && json.data && json.data.diff;
  if (!Array.isArray(diff)) return map;
  for (const d of diff) {
    if (!d) continue;
    const key = `${d.f13}.${d.f12}`;
    const price = toNum(d.f2);
    if (!(price > 0)) continue;
    map.set(key, {
      price,
      prevClose: toNum(d.f18),
      change: toNum(d.f4),
      changePct: toNum(d.f3),
      open: toNum(d.f17),
      high: toNum(d.f15),
      low: toNum(d.f16),
      sessionTime: null,
      note: d.f14 || null,
    });
  }
  return map;
}

/** 腾讯行情 qt.gtimg.cn：3 现价 · 4 昨收 · 31 涨跌额 · 32 涨跌幅% · 30 时间 */
function parseTencentBatch(text) {
  const map = new Map();
  const re = /v_([A-Za-z0-9_]+)="([\s\S]*?)";/g;
  let m;
  while ((m = re.exec(text || ''))) {
    const body = m[2];
    if (!body || !body.trim()) continue;
    const f = body.split('~');
    const price = toNum(f[3]);
    if (!(price > 0)) continue;
    const prev = toNum(f[4]);
    map.set(m[1], {
      price,
      prevClose: prev > 0 ? prev : null,
      change: toNum(f[31]),
      changePct: toNum(f[32]),
      sessionTime: f[30] || null,
      note: f[1] || null,
    });
  }
  return map;
}

/** CBOE 延迟报价 JSON（VIX / VXN） */
function parseCboe(json) {
  const d = json && json.data;
  if (!d) return null;
  const price = toNum(d.current_price);
  if (!(price > 0)) return null;
  return {
    price,
    prevClose: toNum(d.prev_day_close),
    change: toNum(d.price_change),
    changePct: toNum(d.price_change_percent),
    open: toNum(d.open),
    high: toNum(d.high),
    low: toNum(d.low),
    sessionTime: d.last_trade_time ? String(d.last_trade_time).slice(11) : null,
  };
}

/** Binance 24h ticker */
function parseBinance24h(j) {
  const price = toNum(j && j.lastPrice);
  if (!(price > 0)) return null;
  return {
    price,
    prevClose: toNum(j.prevClosePrice),
    change: toNum(j.priceChange),
    changePct: toNum(j.priceChangePercent),
    open: toNum(j.openPrice),
    high: toNum(j.highPrice),
    low: toNum(j.lowPrice),
    sessionTime: null,
  };
}

/** gold-api.com 现货（只有价格，按昨天同时点算不出涨跌，因此只做兜底） */
function parseGoldApi(j) {
  const price = toNum(j && j.price);
  return price > 0 ? { price } : null;
}

/** Coinbase 现货价（只有价格） */
function parseCoinbase(j) {
  const price = toNum(j && j.data && j.data.amount);
  return price > 0 ? { price } : null;
}

/**
 * 新浪加密：btc_btcbtcusd
 * 0 时间 · 3 最新价 · 5 买一 · 6 最高 · 7 最低 · 8 昨收 · 9 名称 · 11 日期
 *
 * 这是新浪自有的一套字段（既不是现货的也不是美股的），只能按位置取。
 * 昨收做了一次合理性校验：加密单日 ±20% 已经极端，超过这个范围说明
 * 这个下标不是昨收（新浪改过字段），宁可不给涨跌幅，也不要给一个错方向。
 */
function parseSinaBtc(f) {
  if (!f) return null;
  const price = toNum(f[3]);
  if (!(price > 0)) return null;
  let prevClose = toNum(f[8]);
  if (prevClose != null && (!(prevClose > 0) || price / prevClose > 1.25 || price / prevClose < 0.8)) {
    prevClose = null;
  }
  return {
    price,
    prevClose,
    high: toNum(f[6]),
    low: toNum(f[7]),
    sessionTime: f[0] || null,
  };
}

module.exports = {
  toNum,
  parseSinaBatch,
  parseSinaSpot,
  parseSinaGlobal,
  parseSinaIndexFull,
  parseSinaForex,
  parseSinaFutures,
  parseSinaBtc,
  parseEastmoneyBatch,
  parseTencentBatch,
  parseCboe,
  parseBinance24h,
  parseGoldApi,
  parseCoinbase,
};
