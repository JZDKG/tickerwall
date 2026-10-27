/* ================================================================== *
 * 时钟与时区：把「某地墙钟时间」换成绝对时间戳，再投影成北京时间
 *
 * 为什么需要这一层：日历里的发布时间天然是「发布方所在地的墙钟时间」——
 * FOMC 是美东 14:00、BLS 是美东 08:30——而界面要显示的是北京时间。
 * 这中间的换算偏偏有两个坑：
 *
 *   1. 美国夏令时不是「3 月到 10 月」，而是 3 月第二个周日 2:00 到
 *      11 月第一个周日 2:00。用月份粗判，3 月上旬和 11 月初最多 13 天
 *      会差 1 小时，而 BLS 的 3 月非农恰好落在这个窗口里。
 *   2. 深夜跨日：美东 14:00 换成北京时间是「次日」凌晨，日期要一起动。
 *
 * 所以这里不手算偏移，交给 ICU（Intl 自带完整 tzdb），本层只做两件事：
 * 反解（墙钟 → UTC）与投影（UTC → 北京时间）。纯函数，无 IO，可单测。
 * ================================================================== */

export const BEIJING_TZ = 'Asia/Shanghai';
export const EASTERN_TZ = 'America/New_York';

/** ICS/Outlook 里常见的是 Windows 时区名，Intl 只认 IANA */
const TZ_ALIAS = new Map([
  ['eastern standard time', EASTERN_TZ],
  ['us eastern standard time', EASTERN_TZ],
  ['central standard time', 'America/Chicago'],
  ['mountain standard time', 'America/Denver'],
  ['pacific standard time', 'America/Los_Angeles'],
  ['gmt standard time', 'Europe/London'],
  ['greenwich standard time', 'UTC'],
  ['coordinated universal time', 'UTC'],
  ['utc', 'UTC'],
  ['gmt', 'UTC'],
]);

const FMT_CACHE = new Map();
const TZ_OK = new Map();

function formatterOf(timeZone) {
  let f = FMT_CACHE.get(timeZone);
  if (f) return f;
  f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  FMT_CACHE.set(timeZone, f);
  return f;
}

/** 该时区名能不能被 ICU 解析（缓存结果，避免每次构造异常对象） */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  const hit = TZ_OK.get(timeZone);
  if (hit !== undefined) return hit;
  let ok = true;
  try {
    formatterOf(timeZone);
  } catch {
    ok = false;
  }
  TZ_OK.set(timeZone, ok);
  return ok;
}

/**
 * 把 ICS / 配置里给的时区标识规整成 ICU 认得的 IANA 名。
 * 认不出来就退回 fallback —— 宁可差几小时也好过整条事件被丢掉。
 */
export function normalizeTimeZone(raw, fallback = 'UTC') {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  if (isValidTimeZone(s)) return s;
  const alias = TZ_ALIAS.get(s.toLowerCase());
  if (alias && isValidTimeZone(alias)) return alias;
  return fallback;
}

/** 某个 UTC 瞬间在指定时区的墙钟读数；时区非法返回 null */
export function zonedParts(utcMs, timeZone) {
  if (!Number.isFinite(utcMs) || !isValidTimeZone(timeZone)) return null;
  const out = {};
  for (const p of formatterOf(timeZone).formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  // en-US + hour12:false 在午夜可能给 24（ICU 的历史行为），归一到 0
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour % 24,
    minute: out.minute,
    second: out.second,
  };
}

/**
 * 墙钟 → UTC 毫秒。
 *
 * 时区偏移本身依赖时间点（夏令时），所以反过来求解要迭代：先按 UTC 猜一次，
 * 读出该时刻的真实墙钟，用差值校正，两三轮即收敛。这也是 date-fns-tz 一类
 * 库的做法，不需要额外的 tz 数据表。
 *
 * 落在「春季跳表」那个不存在的钟点（如 3 月第二个周日 02:30）时，结果会落到
 * 跳表后的等价时刻；夏季重复的钟点取先出现的那一次。历法事件只用整点发布，
 * 不会踩到这两处。
 */
export function zonedTimeToUtc(year, month, day, hour = 0, minute = 0, timeZone = 'UTC') {
  if (!isValidTimeZone(timeZone)) return null;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(target)) return null;
  let ts = target;
  for (let i = 0; i < 3; i += 1) {
    const p = zonedParts(ts, timeZone);
    if (!p) return null;
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = target - seen;
    if (delta === 0) break;
    ts += delta;
  }
  return ts;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** UTC 毫秒 → 指定时区的本地日期 'YYYY-MM-DD' */
export function localDate(utcMs, timeZone) {
  const p = zonedParts(utcMs, timeZone);
  return p ? `${p.year}-${pad2(p.month)}-${pad2(p.day)}` : null;
}

/** UTC 毫秒 → 北京日期 'YYYY-MM-DD' */
export function beijingDate(utcMs) {
  return localDate(utcMs, BEIJING_TZ);
}

/** UTC 毫秒 → 北京时刻 'HH:MM' */
export function beijingClock(utcMs) {
  const p = zonedParts(utcMs, BEIJING_TZ);
  return p ? `${pad2(p.hour)}:${pad2(p.minute)}` : null;
}

/**
 * 「今天」必须按北京时间算。
 * 之前用 `new Date().toISOString().slice(0,10)` 取的是 UTC 日期，
 * 北京 00:00–08:00 之间它还是昨天，日历会把昨天的事件当成「即将发布」。
 */
export function beijingToday(nowMs = Date.now()) {
  return beijingDate(nowMs);
}

/**
 * 一次算出日历事件需要的那几个字段。
 * `date`/`time` 是北京口径（界面直接显示），`releaseAt` 是绝对时间戳
 * （倒计时、跨时区对齐都靠它，别再从字符串反推）。
 */
export function toBeijingRelease(utcMs) {
  if (!Number.isFinite(utcMs)) return null;
  const date = beijingDate(utcMs);
  const time = beijingClock(utcMs);
  if (!date || !time) return null;
  return { date, time, releaseAt: new Date(utcMs).toISOString() };
}
