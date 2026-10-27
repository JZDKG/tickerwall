/* ================================================================== *
 * 48h 日历信标
 *
 * 只认 `releaseAt`（UTC ISO），不读 `date` + `time` —— 后者是北京墙钟的
 * 字符串拼装，自己再拼一次就要重犯「时区算错一天」的老毛病。
 * 后端已经把发布会时刻算成绝对时间，这里只做减法。
 * ================================================================== */

/** 目前的数据源（Fed / BLS）都在华盛顿 */
export const ALERT_ANCHOR = { lon: -77.0, lat: 38.9, label: '华盛顿' };

export const DEFAULT_WINDOW_HOURS = 48;
export const DEFAULT_MIN_IMPORTANCE = 2;

/**
 * 从日历里挑出未来 windowHours 内、importance ≥ minImportance 的事件。
 * 按发布时间升序；releaseAt 缺失或无法解析的直接跳过（不猜）。
 *
 * @returns {Array<{ev, releaseAt, msLeft, hoursLeft}>}
 */
export function upcomingCalendarAlerts(cal, nowMs, {
  windowHours = DEFAULT_WINDOW_HOURS,
  minImportance = DEFAULT_MIN_IMPORTANCE,
} = {}) {
  const list = Array.isArray(cal?.upcoming) ? cal.upcoming : [];
  const horizon = nowMs + windowHours * 3600e3;
  const out = [];
  for (const ev of list) {
    const ts = Date.parse(ev?.releaseAt ?? '');
    if (!Number.isFinite(ts)) continue;
    if (ts < nowMs || ts > horizon) continue;
    if ((ev.importance ?? 0) < minImportance) continue;
    out.push({
      ev,
      releaseAt: ts,
      msLeft: ts - nowMs,
      hoursLeft: (ts - nowMs) / 3600e3,
    });
  }
  out.sort((a, b) => a.releaseAt - b.releaseAt);
  return out;
}

/**
 * 倒计时文本。超过一天用「Nd HH:MM」，否则「HH:MM:SS」。
 * 负数（已发布）返回 '已发布'。
 */
export function formatCountdown(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return '已发布';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${p2(h)}:${p2(m)}`;
  return `${p2(h)}:${p2(m)}:${p2(s)}`;
}

/** 北京时间墙钟 'HH:MM'（日历卡片上除了倒计时还要显示几点公布） */
export function beijingHm(utcMs) {
  if (!Number.isFinite(utcMs)) return '—';
  const d = new Date(utcMs + 8 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** 美东时间（EST/EDT 由 Intl 判，不手算偏移） */
export function easternHm(utcMs) {
  if (!Number.isFinite(utcMs)) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(utcMs));
  } catch {
    return '—';
  }
}
