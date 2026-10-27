/* ================================================================== *
 * 盘面接力带 + 宏观胶囊
 *
 * 接力带回答一个问题：**现在地球上有人在交易吗，接下来轮到谁。**
 * 三大盘面各一枚胶囊，任一市场开着就写「交易中」，否则写最早的下次开盘
 * 还剩多久（「待开盘 · 2h13m」——刻意不叫「盘前」，我们没有盘前数据）。
 *
 * 宏观胶囊是背景色：VIX / VRP / 风险偏好灯 + 黄金·原油·比特币快照。
 * 它依赖 /api/macro（要拉 13 个市场全量日线，冷启动好几秒），所以地图
 * 首屏渲染完之后才懒加载，加载失败就整块不渲染 —— 不能因为一个可选面板
 * 让地图跟着报错。
 * ================================================================== */

import { esc } from '../../../shared/format.js';
import { upcomingCalendarAlerts, formatCountdown, beijingHm, easternHm, ALERT_ANCHOR } from '../logic/calendar.js';

/** 三大盘面的成分（顺序即展示顺序） */
export const SESSION_GROUPS = [
  { key: 'asia', label: '亚太', anchor: 'asia', ids: ['n225', 'kospi', 'sh000001', 'gold-cn', 'hsi', 'twii', 'asx', 'nifty'] },
  { key: 'eu', label: '欧洲', anchor: 'eu', ids: ['ftse', 'gold-intl', 'dax', 'cac'] },
  { key: 'us', label: '美洲', anchor: 'us', ids: ['sp500', 'ndx100', 'dji', 'vix', 'oil', 'tsx', 'bvsp'] },
];

/** '2h13m' / '43m' / '3d2h' —— 接力带用紧凑写法 */
export function formatOpenIn(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const total = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

/**
 * 一个盘面的汇总。
 *
 * 温度用等权平均 —— 各指数的点位量级差几个数量级，只能比涨跌百分比。
 * 缺涨跌幅的标的不进分母（不是当 0 算）。
 */
export function summarizeSession(group, quotesById, nowMs = Date.now()) {
  const members = group.ids.map((id) => quotesById.get(id)).filter((q) => q && q.ok);

  let openCount = 0;
  let nextOpenMs = null;
  let sum = 0;
  let n = 0;

  for (const q of members) {
    const st = q.marketStatus ?? {};
    if (st.open) openCount += 1;
    if (st.nextOpenAt) {
      const t = new Date(st.nextOpenAt).getTime();
      if (Number.isFinite(t) && (nextOpenMs == null || t < nextOpenMs)) nextOpenMs = t;
    }
    if (q.changePct != null && Number.isFinite(q.changePct)) {
      sum += q.changePct;
      n += 1;
    }
  }

  const anyOpen = openCount > 0;
  const pretext = !anyOpen && nextOpenMs != null ? Math.max(0, nextOpenMs - nowMs) : null;

  return {
    key: group.key,
    label: group.label,
    anchor: group.anchor,
    count: members.length,
    openCount,
    anyOpen,
    // 任意一个开着就是「交易中」；否则报最早的下次开盘
    statusText: anyOpen ? '交易中' : pretext != null ? `待开盘 · ${formatOpenIn(pretext)}` : '休市',
    nextOpenAt: nextOpenMs != null ? new Date(nextOpenMs).toISOString() : null,
    nextOpenInMs: pretext,
    avgPct: n ? sum / n : null,
  };
}

const pctText = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const dirClass = (v) => (v == null ? 'flat' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

/** 接力带 HTML。点击胶囊会 flyTo 到该大洲（由 bindMapEvents 绑） */
export function relayBandHtml(quotesById, nowMs = Date.now()) {
  const rows = SESSION_GROUPS.map((g) => summarizeSession(g, quotesById, nowMs));
  return rows
    .map((r) => `<button type="button" class="relay-chip${r.anyOpen ? ' on' : ''}" data-anchor="${esc(r.anchor)}">`
      + `<span class="rc-name">${esc(r.label)}</span>`
      + `<span class="rc-state">${esc(r.statusText)}</span>`
      + `<span class="rc-pct ${dirClass(r.avgPct)}">${pctText(r.avgPct)}</span>`
      + '</button>')
    .join('');
}

/** 风险偏好灯的颜色：偏好上行偏红（风险资产涨），下行偏绿 */
const riskClass = (label) => {
  const s = String(label ?? '');
  if (/偏多|risk-on|偏好上行|进攻/.test(s)) return 'up';
  if (/偏空|risk-off|偏好下行|防守/.test(s)) return 'down';
  return 'flat';
};

/**
 * 宏观胶囊。`macro` 是 { data, at }；data 缺失就返回空串（整块不渲染）。
 * quotes 用来取金/油/币三个快照。
 */
export function macroCapsuleHtml(macro, quotesById) {
  const d = macro?.data;
  if (!d) return '';
  const risk = d.riskAppetite;
  if (!risk && !d.vrp) return '';

  const vix = quotesById.get('vix');
  const vrp = d.vrp;
  const pick = (id) => {
    const q = quotesById.get(id);
    if (!q || !q.ok) return '';
    return `<span class="mc-item">${esc(q.name ?? id)} <b class="${dirClass(q.changePct)}">${pctText(q.changePct)}</b></span>`;
  };

  const riskHtml = risk?.label
    ? `<span class="mc-risk ${riskClass(risk.label)}">${esc(risk.label)}</span>`
    : '';

  const vixHtml = vix
    ? `<span class="mc-vix">VIX <b>${vix.price == null ? '—' : Number(vix.price).toFixed(1)}</b>`
      + (vrp?.vrp != null ? ` · VRP <b class="${dirClass(Number(vrp.vrp))}">${Number(vrp.vrp) >= 0 ? '+' : ''}${Number(vrp.vrp).toFixed(1)}</b>` : '')
      + '</span>'
    : '';

  return riskHtml + vixHtml + pick('gold-intl') + pick('oil') + pick('btc');
}

/* ------------------------------------------------------------------ *
 * 华盛顿 48h 日历倒计时
 *
 * 目前的数据源（Fed / BLS）都在美国，统一挂在华盛顿（ALERT_ANCHOR）。
 * 只认 releaseAt 这个 UTC ISO —— 前端不再自己拼 date + time，也不读服务端
 * 的 today，那两样都是「按某个时区算的今天」，跨时区必错。
 * ------------------------------------------------------------------ */

/** 信标胶囊文本：「⚡ 美国 CPI · 20:30 · 03:21:14」 */
export function alertChipHtml(alert) {
  if (!alert) return '';
  const { ev, releaseAt, msLeft } = alert;
  const title = ev?.title ?? '事件';
  // 标题常常一长串（「美国9月CPI同比」），只留前半句做标签
  const short = title.length > 14 ? `${title.slice(0, 14)}…` : title;
  return `<span class="cal-bolt">⚡</span>`
    + `<span class="cal-name">${esc(short)}</span>`
    + `<span class="cal-when">${esc(beijingHm(releaseAt))}</span>`
    + `<span class="cal-left">${esc(formatCountdown(msLeft))}</span>`;
}

/**
 * 悬停/点击预览卡的内容：北京时间 + 美东时间 + 关联标的现价。
 * 两边时间都写，是因为这类数据源的原生说法是美东 08:30，而读者在北京。
 */
export function alertCardHtml(alert, quotesById) {
  if (!alert) return '';
  const { ev, releaseAt } = alert;
  const syms = (ev?.symbols ?? [])
    .map((id) => quotesById.get(id))
    .filter((q) => q && q.ok)
    .map((q) => `<span class="ac-sym">${esc(q.name ?? q.id)} <b>${q.price == null ? '—' : Number(q.price).toFixed(q.decimals ?? 2)}</b></span>`)
    .join('');

  return `<div class="ac-head">${esc(ev?.title ?? '事件')}</div>`
    + `<div class="ac-row"><i>北京</i><span>${esc(beijingHm(releaseAt))}</span></div>`
    + `<div class="ac-row"><i>美东</i><span>${esc(easternHm(releaseAt))}</span></div>`
    + (ev?.source ? `<div class="ac-row"><i>来源</i><span>${esc(ev.source)}</span></div>` : '')
    + (syms ? `<div class="ac-syms">${syms}</div>` : '')
    + `<div class="ac-left">${esc(formatCountdown(alert.msLeft))}</div>`;
}

/** 48h 内最近的几条（信标只挂一条，其余进悬停列表） */
export function alertsNow(cal, nowMs = Date.now()) {
  return upcomingCalendarAlerts(cal, nowMs);
}

export { ALERT_ANCHOR };
