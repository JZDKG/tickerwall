/* ================================================================== *
 * 市场交易时段 / 数据新鲜度（纯函数，零 I/O、零全局可变状态）
 *
 * 从 server.mjs 抽出来的原因：这一层是「现在到底算不算盘中」的唯一判据，
 * 它错了会连带把新鲜度分级、开市呼吸灯、涨跌着色全带偏；而它本身完全可判，
 * 给定 (profile, now) 就有确定答案，最适合直接单测。
 *
 * 全部按**交易所本地时区**判断，理由见 MARKET_PROFILES 上方那段注释。
 * ================================================================== */

export const GLOBEX_ET = [
  { days: [0], from: '18:00', to: '24:00' },
  { days: [1, 2, 3, 4], from: '00:00', to: '17:00' },
  { days: [1, 2, 3, 4], from: '18:00', to: '24:00' },
  { days: [5], from: '00:00', to: '17:00' },
];

/**
 * 各市场交易时段一律按**交易所本地时区**定义。
 *
 * 之前全部写死成北京时间，有两个必然出错的地方：
 * 1) 夏令时。美股冬令时北京时间 22:30 开盘、夏令时 21:30，写死一个值一年错半年；
 *    欧洲 10 月最后一个周日切冬令时、美国要等到 11 月第一个周日，这周两国是错开的。
 * 2) 跨午夜的周几归属。北京时间周六 02:00 其实是美东周五 14:00（盘中），
 *    而北京时间周一 02:00 是美东周日 14:00（休市）。按北京时间的 day 判断两个都错。
 *
 * 换成交易所本地时区后，股票时段都不跨午夜，上面两个问题同时消失。
 */
export const MARKET_PROFILES = {
  'cn-spot': {
    label: '上金所',
    tz: 'Asia/Shanghai',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: [
      { days: [1, 2, 3, 4, 5], from: '09:00', to: '11:30' },
      { days: [1, 2, 3, 4, 5], from: '13:30', to: '15:30' },
      // 夜盘拆上下半场，避免跨午夜还要判断「这个 day 是周几」
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
  'us-rate': {
    label: '美债',
    tz: 'America/New_York',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: GLOBEX_ET,
  },
  fx: {
    label: '外汇',
    tz: 'America/New_York',
    priceBasis: 'close',
    daysPerYear: 252,
    ranges: GLOBEX_ET,
  },
  'intl-futures': {
    label: '国际期货',
    tz: 'America/New_York',
    priceBasis: 'settle',
    daysPerYear: 252,
    ranges: GLOBEX_ET,
  },
  crypto: {
    label: '加密',
    tz: 'UTC',
    priceBasis: 'close',
    daysPerYear: 365,
    ranges: [],
  },
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

export const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const dtfCache = new Map();

/**
 * 取某时区的「当地周几 + 当日第几分钟」。
 * hourCycle 必须显式给 'h23'：en-US 默认在午夜会格式化成 "24:15"，会解析出 1455 分钟。
 */
export function localClock(tz = 'Asia/Shanghai', now = new Date()) {
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

export function hhmmToMin(v) {
  const [h, m] = String(v).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function isMarketOpen(profile, now = new Date()) {
  if (!profile) return null;
  if (!Array.isArray(profile.ranges) || !profile.ranges.length) return true;
  const { day, minutes } = localClock(profile.tz ?? 'Asia/Shanghai', now);
  for (const r of profile.ranges) {
    if (r.days && !r.days.includes(day)) continue;
    const start = hhmmToMin(r.from);
    const end = hhmmToMin(r.to);
    const hit = end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    if (hit) return true;
  }
  return false;
}

export function marketStatusOf(inst) {
  const profile = MARKET_PROFILES[inst.market];
  if (!profile) return null;
  const open = isMarketOpen(profile);
  return {
    market: profile.label,
    open,
    label: !profile.ranges.length ? '24×7' : open ? '交易中' : '已收盘',
  };
}

/**
 * 各源给的 sessionTime 格式不统一：
 *   黄金CN "14:30:00" ｜ 新浪 "2026-10-26 14:30:00" ｜ CBOE "2026-10-23"
 * 统一解析成绝对时间，解析不了就返回 null（前端只显示"取数时刻"）。
 */
export function parseDataTime(sessionTime, now = new Date()) {
  if (!sessionTime) return null;
  const s = String(sessionTime).trim();

  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const bj = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const d = new Date(`${bj}T${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}+08:00`);
    // 源时间比现在还晚，说明是昨天的（跨零点）
    if (d.getTime() > now.getTime() + 3600_000) d.setDate(d.getDate() - 1);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(`${s}T00:00:00+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export function gradeFreshness(ageMs, isOpen) {
  const min = ageMs / 60_000;
  if (isOpen) {
    if (min <= 2) return 'fresh';
    if (min <= 15) return 'normal';
    if (min <= 60) return 'delayed';
    return 'stale';
  }
  // 已收盘 / 休市：数据不该频繁变，超过 4 天才算异常
  if (min <= 4 * 24 * 60) return 'normal';
  return 'stale';
}

export function humanAge(ageMs) {
  const s = Math.max(0, Math.round(ageMs / 1000));
  if (s < 60) return `${s} 秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

