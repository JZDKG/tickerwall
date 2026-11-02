/* ================================================================== *
 * 交易时段与数据新鲜度
 *
 * 逻辑与 web 端 src/server/domain/market-hours.js 一致（含各市场本地时区，
 * 不写成北京时间）—— 那一层是全站「现在算不算盘中」的唯一判据，判错了会
 * 连带把新鲜度分级、涨跌着色一起带偏，所以这里不重新发明，只做裁剪：
 * 去掉日历用的 zonedTimeToUtc 细节，保留 localClock / isMarketOpen / 相位。
 * ================================================================== */

const GLOBEX_ET = [
  { days: [0], from: '18:00', to: '24:00' },
  { days: [1, 2, 3, 4], from: '00:00', to: '17:00' },
  { days: [1, 2, 3, 4], from: '18:00', to: '24:00' },
  { days: [5], from: '00:00', to: '17:00' },
];

const MARKET_PROFILES = {
  'cn-spot': {
    label: '上金所',
    tz: 'Asia/Shanghai',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: [
      { days: [1, 2, 3, 4, 5], from: '09:00', to: '11:30' },
      { days: [1, 2, 3, 4, 5], from: '13:30', to: '15:30' },
      { days: [1, 2, 3, 4], from: '20:00', to: '24:00' },
      { days: [2, 3, 4, 5], from: '00:00', to: '02:30' },
    ],
  },
  'cn-index': {
    label: 'A股',
    tz: 'Asia/Shanghai',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: [
      { days: [1, 2, 3, 4, 5], from: '09:30', to: '11:30' },
      { days: [1, 2, 3, 4, 5], from: '13:00', to: '15:00' },
    ],
  },
  'us-index': {
    label: '美股',
    tz: 'America/New_York',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: [{ days: [1, 2, 3, 4, 5], from: '09:30', to: '16:00' }],
  },
  'us-rate': { label: '美债', tz: 'America/New_York', priceBasis: 'close', daysPerYear: 252, ranges: GLOBEX_ET },
  fx: { label: '外汇', tz: 'America/New_York', priceBasis: 'close', daysPerYear: 252, ranges: GLOBEX_ET },
  'intl-futures': { label: '国际期货', tz: 'America/New_York', priceBasis: 'settle', daysPerYear: 252, ranges: GLOBEX_ET },
  crypto: { label: '加密', tz: 'UTC', priceBasis: 'close', daysPerYear: 365, ranges: [] },
  'jp-index': { label: '东京', tz: 'Asia/Tokyo', priceBasis: 'close', daysPerYear: 245, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '15:30' }] },
  'hk-index': { label: '港股', tz: 'Asia/Hong_Kong', priceBasis: 'close', daysPerYear: 245, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:30', to: '16:00' }] },
  'eu-index': { label: '欧股', tz: 'Europe/Berlin', priceBasis: 'close', daysPerYear: 252, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '17:30' }] },
  'uk-index': { label: '英股', tz: 'Europe/London', priceBasis: 'close', daysPerYear: 252, ranges: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '16:30' }] },
  'br-index': { label: '巴西', tz: 'America/Sao_Paulo', priceBasis: 'close', daysPerYear: 250, ranges: [{ days: [1, 2, 3, 4, 5], from: '10:00', to: '17:00' }] },
  'in-index': { label: '印度', tz: 'Asia/Kolkata', priceBasis: 'close', daysPerYear: 250, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:15', to: '15:30' }] },
  'kr-index': { label: '韩股', tz: 'Asia/Seoul', priceBasis: 'close', daysPerYear: 245, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '15:30' }] },
  'au-index': { label: '澳股', tz: 'Australia/Sydney', priceBasis: 'close', daysPerYear: 252, ranges: [{ days: [1, 2, 3, 4, 5], from: '10:00', to: '16:00' }] },
  'ca-index': { label: '加股', tz: 'America/Toronto', priceBasis: 'close', daysPerYear: 252, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:30', to: '16:00' }] },
  'tw-index': { label: '台股', tz: 'Asia/Taipei', priceBasis: 'close', daysPerYear: 245, ranges: [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '13:30' }] },
};

const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const dtfCache = new Map();

/** 取某时区的「当地周几 + 当日第几分钟」（hourCycle 必须 h23，否则午夜会出 24:15） */
function localClock(tz, now) {
  let fmt = dtfCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    dtfCache.set(tz, fmt);
  }
  let day = 0;
  let h = 0;
  let m = 0;
  for (const p of fmt.formatToParts(now)) {
    if (p.type === 'weekday') day = WEEKDAY_MAP[p.value] ?? 0;
    else if (p.type === 'hour') h = Number(p.value) % 24;
    else if (p.type === 'minute') m = Number(p.value);
  }
  return { day, minutes: h * 60 + m };
}

function hhmmToMin(v) {
  const [h, m] = String(v).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** 该时区当前相对 UTC 的偏移（毫秒） */
function tzOffsetMs(tz, atMs) {
  const d = new Date(atMs);
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(atMs / 1000) * 1000;
}

function isMarketOpen(profile, now) {
  if (!profile) return null;
  if (!profile.ranges.length) return true;
  const { day, minutes } = localClock(profile.tz, now);
  for (const r of profile.ranges) {
    if (r.days && !r.days.includes(day)) continue;
    const start = hhmmToMin(r.from);
    const end = hhmmToMin(r.to);
    const hit = end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    if (hit) return true;
  }
  return false;
}

const PRE_WINDOW_MS = 3 * 60 * 60 * 1000;

/** 未来 8 天内最近的一个开盘时刻（毫秒）。逐日按当地日历推，不用本地时区加法 */
function nextOpenMs(profile, now) {
  const nowMs = now.getTime();
  const tz = profile.tz;
  // 用当地日期作为锚点逐日试探，最多 8 天（跨周末 3 天足够，留足余量）
  const anchor = new Date(nowMs + tzOffsetMs(tz, nowMs));
  for (let d = 0; d <= 8; d += 1) {
    const dayTs = anchor.getTime() + d * 86400000;
    const probe = new Date(dayTs);
    const weekday = new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), probe.getUTCDate())).getUTCDay();
    for (const r of profile.ranges) {
      if (r.days && !r.days.includes(weekday)) continue;
      const fromMin = hhmmToMin(r.from);
      const y = probe.getUTCFullYear();
      const mo = probe.getUTCMonth() + 1;
      const da = probe.getUTCDate();
      // 当地时间 → UTC：先按当前偏移猜，再用该时刻的真实偏移校正一次
      const guessLocal = Date.UTC(y, mo - 1, da, Math.floor(fromMin / 60), fromMin % 60);
      let ts = guessLocal - tzOffsetMs(tz, nowMs);
      ts = guessLocal - tzOffsetMs(tz, ts);
      if (ts > nowMs + 60_000) return ts;
    }
  }
  return null;
}

/** 交易相位 + 给界面看的短标签 */
function marketStatusOf(inst, now) {
  const profile = MARKET_PROFILES[inst.market];
  if (!profile) return null;
  const open = isMarketOpen(profile, now);
  if (!profile.ranges.length) {
    return { market: profile.label, open: true, label: '24×7', phase: '24x7', nextOpenAt: null };
  }
  const next = open ? null : nextOpenMs(profile, now);
  const phase = open ? 'open' : next && next - now.getTime() <= PRE_WINDOW_MS ? 'pre' : 'closed';
  return {
    market: profile.label,
    open: !!open,
    label: open ? '交易中' : phase === 'pre' ? '待开盘' : '已收盘',
    phase,
    nextOpenAt: next ? new Date(next).toISOString() : null,
  };
}

/**
 * 源给出的行情时间 → 绝对时间。
 * 同一份代码同时在 web 与云函数跑，口径必须一致：没有时区的「HH:MM:SS」
 * 一律按北京时间理解；比现在还晚超过 1 小时说明是昨天的。
 *
 * 注意「今天」不能用 Intl 的 en-CA 简写推 —— 不同 ICU 版本给出的格式不一样
 * （完整版是 2026-10-30，精简版会退化成 10/30/2026），拼进 ISO 串就解析失败，
 * 表现为所有行的新鲜度都变成「源未提供时间」。这里显式取年月日分量。
 */
function beijingDate(now) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = {};
  for (const part of f.formatToParts(now)) p[part.type] = part.value;
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function parseDataTime(sessionTime, now) {
  if (!sessionTime) return null;
  const s = String(sessionTime).trim();

  // 2026-10-29 18:31:19 / 2026/10/29 18:31:19 / 2026-10-29T18:31
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const d = new Date(
      `${beijingDate(now)}T${String(m[1]).padStart(2, '0')}:${m[2]}:${m[3] || '00'}+08:00`,
    );
    if (Number.isNaN(d.getTime())) return null;
    // 源时间比现在还晚，说明是昨天的（跨零点）
    if (d.getTime() > now.getTime() + 3600_000) d.setDate(d.getDate() - 1);
    return d;
  }

  m = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(s);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** 数据新鲜度分级：盘中按分钟苛刻，收盘后按天宽松 */
function gradeFreshness(ageMs, isOpen) {
  const min = ageMs / 60_000;
  if (isOpen) {
    if (min <= 2) return 'fresh';
    if (min <= 15) return 'normal';
    if (min <= 60) return 'delayed';
    return 'stale';
  }
  if (min <= 4 * 24 * 60) return 'normal';
  return 'stale';
}

function ageLabel(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

function freshnessOf(sessionTime, status, now) {
  const dataTime = parseDataTime(sessionTime, now);
  if (!dataTime) return { dataTime: null, ageMs: null, label: '源未提供时间', level: 'normal', suspect: false };
  const ageMs = Math.max(0, now.getTime() - dataTime.getTime());
  const level = gradeFreshness(ageMs, !!(status && status.open));
  return {
    dataTime: dataTime.toISOString(),
    ageMs,
    label: ageLabel(ageMs),
    level,
    suspect: level === 'stale' && !!(status && status.open),
    suspectNote: level === 'stale' && status && status.open ? '盘中但数据已超过 1 小时未更新' : null,
  };
}

module.exports = {
  MARKET_PROFILES,
  marketStatusOf,
  parseDataTime,
  gradeFreshness,
  freshnessOf,
  isMarketOpen,
  localClock,
};
