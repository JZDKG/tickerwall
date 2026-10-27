/* ================================================================== *
 * 日历服务：FOMC（美联储 ICS/官网）+ BLS 发布日程 + 事件研究（Welch t）
 *
 * 从 server.mjs 两块连续区段搬出（L129–L404 与 L420–L557），逻辑一字未改。
 * 同层依赖只有一条：macro.service（取品种池、日线序列与收益率变换）。
 * ================================================================== */

import { fetchRaw } from '../providers/index.js';
import { MACRO_UNIVERSE, fetchMacroSeries, toChanges } from './macro.service.js';

/* ------------------------------------------------------------------ *
 * 宏观日历：FOMC（美联储官网）+ BLS 数据发布日程（CPI/非农/PPI/GDP）
 * —— FOMC 直接解析美联储官网；BLS 页面有反爬，走文本代理读取官方页
 * ------------------------------------------------------------------ */


export const CAL_CACHE_TTL_MS = 6 * 3600_000; // 日历半年内不会变，缓存 6 小时
export const calCache = new Map();

export const MONTH_IDX = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** 美东 08:30 发布 → 北京时间（夏令时 20:30 / 冬令时 21:30），这里给个近似值并标注时区 */
export function blsReleaseBeijingTime(month) {
  // 美国夏令时 3 月第二个周日 ~ 11 月第一个周日
  const dst = month >= 3 && month <= 10;
  return dst ? '20:30' : '21:30';
}

/**
 * FOMC 会议日期。
 * 美联储官网的 HTML 对「已开 / 未开」会议用了不同结构，直接解析会漏一半（每年只抓到 4 次），
 * 所以走文本代理读成 markdown：月份是 `**January**`、日期是紧跟的 `27-28*`，按行号就近配对最稳。
 */
export async function fetchFomcMeetings() {
  const text = await fetchRaw(
    'https://r.jina.ai/https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  );
  const lines = text.split('\n').map((l) => l.trim());
  const out = [];
  const pad = (n) => String(n).padStart(2, '0');
  let year = null;

  for (let i = 0; i < lines.length; i += 1) {
    const ym = /^#+\s*\[?(\d{4}) FOMC Meetings/.exec(lines[i]);
    if (ym) {
      year = Number(ym[1]);
      continue;
    }
    const mm = /^\*\*([A-Za-z]+)\*\*$/.exec(lines[i]);
    if (!mm || !year) continue;
    const month = MONTH_IDX[mm[1].toLowerCase()];
    if (!month) continue;

    // 月份后 1~6 行内找第一条 "27-28" / "17-18*" 形式的日期
    let days = null;
    let isProjection = false; // 带 * 的会议会同时发布经济预测摘要（SEP）与点阵图
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j += 1) {
      const dm = /^(\d{1,2})\s*[-–]\s*(\d{1,2})(\*?)$/.exec(lines[j]);
      if (dm) {
        days = [Number(dm[1]), Number(dm[2])];
        isProjection = dm[3] === '*';
        break;
      }
      if (/^\*\*[A-Za-z]+\*\*$/.test(lines[j])) break; // 撞到下个月，放弃
    }
    if (!days) continue;

    const startDay = days[0];
    const endDay = days[1];
    // 跨月会议（如 "31-1"）按结束日落到下个月
    let endMonth = month;
    let endYear = year;
    if (endDay < startDay) {
      endMonth += 1;
      if (endMonth > 12) {
        endMonth = 1;
        endYear += 1;
      }
    }
    out.push({
      date: `${endYear}-${pad(endMonth)}-${pad(endDay)}`,
      startDate: `${year}-${pad(month)}-${pad(startDay)}`,
      time: '02:00',
      kind: 'fomc',
      title: `美联储 FOMC 利率决议（${startDay}-${endDay} 日会议）`,
      note: isProjection ? '含经济预测摘要 SEP 与点阵图' : null,
      importance: 3,
      source: 'Federal Reserve',
      symbols: ['us10y', 'dxy', 'sp500', 'ndx100', 'gold-intl', 'btc'],
    });
  }
  return out;
}


/**
 * BLS 官方 ICS 日历：含 2007 年至今全部数据发布日（313 个事件）。
 * 比抓月度日程页好得多——月度页只有未来几个月，做不了历史事件研究。
 * BLS 对直连有反爬（403），走文本代理读。
 */
export async function fetchBlsIcsEvents() {
  const text = await fetchRaw('https://r.jina.ai/https://www.bls.gov/schedule/news_release/bls.ics', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const ICS_KINDS = [
    { re: /^Consumer Price Index$/i, kind: 'cpi', title: '美国 CPI 消费者物价指数', importance: 3, symbols: ['us10y', 'gold-intl', 'dxy', 'sp500'] },
    { re: /^Employment Situation$/i, kind: 'nfp', title: '美国非农就业报告', importance: 3, symbols: ['us10y', 'dxy', 'sp500', 'ndx100'] },
    { re: /^Producer Price Index$/i, kind: 'ppi', title: '美国 PPI 生产者物价指数', importance: 2, symbols: ['us10y', 'gold-intl'] },
    { re: /^Personal Income and Outlays$/i, kind: 'pce', title: '美国 PCE 物价指数', importance: 3, symbols: ['us10y', 'gold-intl', 'dxy'] },
    { re: /^Gross Domestic Product$/i, kind: 'gdp', title: '美国 GDP', importance: 2, symbols: ['sp500', 'dxy'] },
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const out = [];

  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const summary = /SUMMARY:(.+)/.exec(body)?.[1]?.trim();
    const m = /DTSTART(?:;TZID=([^:]+))?:(\d{8})T(\d{6})/.exec(body);
    if (!summary || !m) continue;

    const kind = ICS_KINDS.find((k) => k.re.test(summary));
    if (!kind) continue;

    const [, tzid, dateStr, timeStr] = m;
    const y = Number(dateStr.slice(0, 4));
    const mo = Number(dateStr.slice(4, 6));
    const d = Number(dateStr.slice(6, 8));
    const hh = Number(timeStr.slice(0, 2));
    const mi = Number(timeStr.slice(2, 4));

    // 美东 → 北京：夏令时 +12、冬令时 +13
    const isEastern = !tzid || /Eastern/i.test(tzid);
    const dst = isEastern && mo >= 3 && mo <= 10;
    const shift = isEastern ? (dst ? 12 : 13) : 8;
    let bh = hh + shift;
    let dayShift = 0;
    while (bh >= 24) {
      bh -= 24;
      dayShift += 1;
    }

    const dt = new Date(Date.UTC(y, mo - 1, d + dayShift));
    const bjDate = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

    // 同一天同一指标可能重复（如完整版/初值），保留第一条
    if (out.some((e) => e.date === bjDate && e.kind === kind.kind)) continue;

    out.push({
      date: bjDate,
      time: `${pad(bh)}:${pad(mi)}`,
      kind: kind.kind,
      title: kind.title,
      importance: kind.importance,
      source: 'U.S. BLS (ICS)',
      symbols: kind.symbols,
    });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}
/** BLS 月度日程：解析日历表格里带 CPI / Employment Situation / PPI 的格子 */
export async function fetchBlsMonth(year, month) {
  const pad = String(month).padStart(2, '0');
  const target = `https://www.bls.gov/schedule/${year}/${pad}_sched.htm`;
  const text = await fetchRaw(`https://r.jina.ai/${target}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const out = [];
  const KINDS = [
    { re: /Consumer Price Index/i, kind: 'cpi', title: '美国 CPI 消费者物价指数', importance: 3, symbols: ['us10y', 'gold-intl', 'dxy', 'sp500'] },
    { re: /Employment Situation/i, kind: 'nfp', title: '美国非农就业报告', importance: 3, symbols: ['us10y', 'dxy', 'sp500', 'ndx100'] },
    { re: /Producer Price Index/i, kind: 'ppi', title: '美国 PPI 生产者物价指数', importance: 2, symbols: ['us10y', 'gold-intl'] },
    { re: /Personal Income and Outlays/i, kind: 'pce', title: '美国 PCE 物价指数', importance: 3, symbols: ['us10y', 'gold-intl', 'dxy'] },
    { re: /Gross Domestic Product/i, kind: 'gdp', title: '美国 GDP', importance: 2, symbols: ['sp500', 'dxy'] },
    { re: /Retail Trade/i, kind: 'retail', title: '美国零售销售', importance: 2, symbols: ['sp500', 'us10y'] },
  ];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    // BLS 日历表格最后一行会跨到下个月（| 30 | 1 | 2 | 3 | 4 ... |），
    // 日期一旦回退就说明月份翻页了，否则会把「12 月 4 日非农」算成「11 月 4 日」
    let curMonth = month;
    let curYear = year;
    let prevDay = 0;
    for (const cell of cells) {
      const dayMatch = /^(\s*)(\d{1,2})\b/.exec(cell);
      if (!dayMatch) continue;
      const day = parseInt(dayMatch[2], 10);
      if (day < 1 || day > 31) continue;
      if (prevDay && day < prevDay) {
        curMonth += 1;
        if (curMonth > 12) {
          curMonth = 1;
          curYear += 1;
        }
      }
      prevDay = day;
      for (const k of KINDS) {
        if (!k.re.test(cell)) continue;
        const date = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (out.some((e) => e.date === date && e.kind === k.kind)) continue;
        // 同一指标一个月可能出现两次（如政府停摆后补发上月数据），
        // 所以把「数据所属月份」写进标题，否则用户会以为是重复条目
        const refMatch = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(cell);
        const refLabel = refMatch ? `${refMatch[2]} 年 ${MONTH_IDX[refMatch[1].toLowerCase()]} 月` : null;
        out.push({
          date,
          time: blsReleaseBeijingTime(curMonth),
          kind: k.kind,
          title: refLabel ? `${k.title}（${refLabel}数据）` : k.title,
          importance: k.importance,
          source: 'U.S. BLS',
          symbols: k.symbols,
        });
      }
    }
  }
  return out;
}

export async function getCalendar({ force = false } = {}) {
  const cached = calCache.get('cal');
  if (!force && cached && Date.now() - cached.at < CAL_CACHE_TTL_MS) return cached.data;

  const now = new Date();
  const bjYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(now));
  const bjMonth = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', month: 'numeric' }).format(now));

  // 抓本月 + 未来 4 个月的 BLS 日程（跨年处理）
  const months = [];
  for (let i = 0; i < 5; i += 1) {
    let m = bjMonth + i;
    let y = bjYear;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    months.push({ year: y, month: m });
  }

  const [fomcRes, icsRes] = await Promise.allSettled([fetchFomcMeetings(), fetchBlsIcsEvents()]);

  const events = [];
  const errors = [];

  if (fomcRes.status === 'fulfilled') events.push(...fomcRes.value);
  else errors.push(`FOMC: ${fomcRes.reason?.message ?? fomcRes.reason}`);

  if (icsRes.status === 'fulfilled') {
    events.push(...icsRes.value);
  } else {
    // ICS 拿不到时退回月度日程页（只有未来几个月，历史事件研究会缺数据）
    errors.push(`BLS ICS: ${icsRes.reason?.message ?? icsRes.reason}`);
    const blsRes = await Promise.allSettled(months.map(({ year, month }) => fetchBlsMonth(year, month)));
    blsRes.forEach((r, i) => {
      if (r.status === 'fulfilled') events.push(...r.value);
      else errors.push(`BLS ${months[i].year}-${months[i].month}: ${r.reason?.message ?? r.reason}`);
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const today = new Date().toISOString().slice(0, 10);

  const data = {
    ok: events.length > 0,
    generatedAt: new Date().toISOString(),
    today,
    events,
    upcoming: events.filter((e) => e.date >= today).slice(0, 30),
    errors,
    coverage: { monthsFetched: months.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}`) },
  };
  calCache.set('cal', { at: Date.now(), data });
  return data;
}

/* ------------------------------------------------------------------ *
 * 事件研究（event study）
 * 回答一个问题：这些日历事件日，市场波动真的比平时大吗？
 * 方法：事件日 |日收益率| vs 非事件日 |日收益率|，Welch t 检验
 * 注意：收益率绝对值厚尾，t 检验偏宽松，所以同时给中位数作稳健参考
 * ------------------------------------------------------------------ */

export const STUDY_CACHE_TTL_MS = 6 * 3600_000;
export const studyCache = new Map();

export function statOf(arr) {
  const n = arr.length;
  if (!n) return { n: 0, mean: null, median: null, var: null };
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const sorted = [...arr].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = n > 1 ? arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, median, var: variance };
}

/** Welch t：两样本均值差（不假设方差相等） */
export function welchT(a, b) {
  const sa = statOf(a);
  const sb = statOf(b);
  if (!sa.n || !sb.n || sa.var == null || sb.var == null) return null;
  const denom = Math.sqrt(sa.var / sa.n + sb.var / sb.n);
  if (!denom) return null;
  return (sa.mean - sb.mean) / denom;
}

/** 在日期数组里偏移 n 个交易日 */
export function shiftDate(dates, i, lag) {
  const j = i + lag;
  return j >= 0 && j < dates.length ? dates[j] : null;
}

/**
 * lag=0：事件日当天
 * lag=1：事件后一个交易日（美股在北京次日收盘，这一步能看出是提前还是滞后反应）
 */
export async function buildEventStudy() {
  const cal = await getCalendar();
  const today = new Date().toISOString().slice(0, 10);

  // 只统计已经发生的事件
  const kindDates = new Map();
  for (const e of cal.events) {
    if (!e.date || e.date > today) continue;
    if (!kindDates.has(e.kind)) kindDates.set(e.kind, new Map());
    const m = kindDates.get(e.kind);
    m.set(e.date, (m.get(e.date) ?? 0) + 1);
  }

  const kinds = [...kindDates.keys()];
  if (!kinds.length) return { ok: false, kinds: [], rows: [], error: '没有历史事件可供统计' };

  const rows = [];
  const coverage = [];

  for (const def of MACRO_UNIVERSE) {
    let series;
    try {
      series = await fetchMacroSeries(def);
    } catch {
      continue;
    }
    const chg = toChanges(series.rows, def.kind);
    if (chg.dates.length < 100) continue;
    coverage.push({ id: def.id, name: def.name, from: chg.dates[0], to: chg.dates[chg.dates.length - 1], n: chg.dates.length });

    const absReturns = chg.values.map((v) => Math.abs(v));

    /**
     * 时区自动对齐：美国宏观数据公布时，北京时间落在凌晨或前夜。
     * FOMC 美东 14:00 公布 ≈ 北京次日 02:00/03:00，A 股次日开盘才交易；
     * CPI/非农美东 08:30 公布 ≈ 北京 20:30/21:30，A 股当日 15:00 已收盘。
     * 所以对上证与沪金，真实反应落在「事件后第一个交易日」，其余资产当日即反应。
     * （沪金标的取上金所 Au99.99，日盘 09:00–15:30，与 A 股同属白盘。）
     */
    const autoLag = def.id === 'sh000001' || def.id === 'gold-cn' ? 1 : 0;

    for (const kind of kinds) {
      const dateSet = kindDates.get(kind);
      for (const lag of [0, 1]) {
        const ev = [];
        const base = [];
        for (let i = 0; i < chg.dates.length; i += 1) {
          // absReturns[i] 属于 dates[i] 这个交易日；
          // lag=1 要看「事件发生在前一个交易日」时当日的反应，所以往前挪 i。
          const eventDay = shiftDate(chg.dates, i, -lag);
          if (!eventDay) continue;
          if (dateSet.has(eventDay)) ev.push(absReturns[i]);
          else base.push(absReturns[i]);
        }
        if (ev.length < 5) continue;

        const se = statOf(ev);
        const sb = statOf(base);
        const t = welchT(ev, base);
        rows.push({
          kind,
          symbol: def.id,
          name: def.short,
          lag,
          isAuto: lag === autoLag,
          eventDays: se.n,
          eventMeanPct: se.mean * 100,
          eventMedianPct: se.median * 100,
          baseMeanPct: sb.mean * 100,
          baseMedianPct: sb.median * 100,
          ratio: sb.mean ? se.mean / sb.mean : null,
          // 中位数口径不受厚尾极值影响，和均值口径一起看才知道结果稳不稳
          medianRatio: sb.median ? se.median / sb.median : null,
          t,
          significant: t != null && Math.abs(t) > 1.96,
        });
      }
    }
  }

  return {
    ok: rows.length > 0,
    generatedAt: new Date().toISOString(),
    today,
    kinds: kinds.map((k) => ({ kind: k, count: kindDates.get(k).size })),
    coverage,
    rows,
    note: '事件日波动通常天然偏高（事件本身就在波动时被关注），这里做的是统计对照，不是因果推断',
  };
}

export async function getEventStudy({ force = false } = {}) {
  const cached = studyCache.get('study');
  if (!force && cached && Date.now() - cached.at < STUDY_CACHE_TTL_MS) return cached.data;
  const data = await buildEventStudy();
  studyCache.set('study', { at: Date.now(), data });
  return data;
}
