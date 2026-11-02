/* ================================================================== *
 * 格式化：数字 / 涨跌 / 来源 / 新鲜度
 *
 * 与 web 端 src/client/shared/format.js 同一套规则（小数位、正负号、
 * 「幅度极小时多给一位」），只在两处做了小程序适配：
 *   1. 不依赖 Intl.NumberFormat —— 小程序 JS 引擎在部分安卓机上是精简 ICU，
 *      toLocaleString 的分组行为不确定，这里手动加千分位；
 *   2. 不返回 HTML（小程序没有 innerHTML），只返回纯文本/数字。
 * ================================================================== */

/** 千分位分组 + 固定小数位 */
function fmtNum(v, decimals) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const d = Number.isFinite(decimals) ? decimals : 2;
  const fixed = Number(v).toFixed(d);
  const neg = fixed.charAt(0) === '-';
  const body = neg ? fixed.slice(1) : fixed;
  const dot = body.indexOf('.');
  const int = dot < 0 ? body : body.slice(0, dot);
  const frac = dot < 0 ? '' : body.slice(dot);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${frac}`;
}

function fmtPrice(v, decimals) {
  return fmtNum(v, decimals);
}

/** 带符号的涨跌额（0 不显示正负） */
function fmtSigned(v, decimals) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const body = fmtNum(Math.abs(v), decimals);
  if (v > 0) return `+${body}`;
  if (v < 0) return `-${body}`;
  return body;
}

/** 百分比：绝对值小于 0.01 时多给一位，避免 -0.004% 被显示成 -0.00% */
function fmtPct(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const abs = Math.abs(v);
  const body = abs.toFixed(abs > 0 && abs < 0.01 ? 3 : 2);
  if (v > 0) return `+${body}%`;
  if (v < 0) return `-${body}%`;
  return `${body}%`;
}

/** 方向：up / down / flat（中国习惯：涨红跌绿） */
function dirOf(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

/** 来源标识 → 人话 */
function prettySource(src) {
  if (!src) return '';
  return String(src)
    .replace(/^sina-futures:/, '新浪期货 ')
    .replace(/^sina-forex:/, '新浪外汇 ')
    .replace(/^sina-inner:/, '新浪期货 ')
    .replace(/^sina-us:/, '新浪美股 ')
    .replace(/^sina:/, '新浪 ')
    .replace(/^eastmoney:/, '东财 ')
    .replace(/^binance:.*$/, 'Binance')
    .replace(/^coinbase:/, 'Coinbase ')
    .replace(/^okx:/, 'OKX ')
    .replace(/^htx:/, 'HTX ')
    .replace(/^kraken:/, 'Kraken ')
    .replace(/^gold-api:/, 'gold-api ')
    .replace(/^fred:/, 'FRED ')
    .replace(/^tencent:/, '腾讯 ')
    .replace(/^cnbc:/, 'CNBC ')
    .replace(/^yahoo:/, 'Yahoo ')
    .replace(/^cboe:/, 'CBOE ')
    .replace(/^calc:/, '折算·');
}

/**
 * 卡片上只显示「哪家源」，不显示具体代码。
 * web 端列表里是「新浪 gds_AU9999」这种带代码的写法，桌面宽度够；手机上一行
 * 只有 40 来个字符，代码会把「高/低」挤掉。完整代码在详情页保留。
 */
const SOURCE_NAMES = {
  sina: '新浪财经',
  'sina-futures': '新浪期货',
  'sina-forex': '新浪外汇',
  eastmoney: '东方财富',
  tencent: '腾讯行情',
  cboe: 'CBOE',
  binance: 'Binance',
  coinbase: 'Coinbase',
  okx: 'OKX',
  htx: 'HTX',
  kraken: 'Kraken',
  'gold-api': 'gold-api',
  fred: 'FRED',
  yahoo: 'Yahoo',
  cnbc: 'CNBC',
  calc: '折算',
};

function sourceLabel(src) {
  if (!src) return '';
  const key = String(src).split(':')[0];
  return SOURCE_NAMES[key] || key;
}

/** 新鲜度短标签：秒/分/时/天，一眼看出数据有多旧 */
function freshShort(f) {
  if (!f) return '';
  if (f.dataTime === null && f.ageMs === null) return '';
  if (f.ageMs === null || f.ageMs === undefined) return '';
  const s = Math.max(0, Math.round(f.ageMs / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** 「高 867.00 / 低 862.50」，没有高低就给昨收 */
function metaRange(item) {
  if (!item) return '';
  const d = Number.isFinite(item.decimals) ? item.decimals : 2;
  const parts = [];
  if (Number.isFinite(item.high)) parts.push(`高 ${fmtPrice(item.high, d)}`);
  if (Number.isFinite(item.low)) parts.push(`低 ${fmtPrice(item.low, d)}`);
  if (!parts.length && Number.isFinite(item.prevClose)) {
    parts.push(`${item.priceBasis === 'settle' ? '昨结算' : '昨收'} ${fmtPrice(item.prevClose, d)}`);
  }
  return parts.join(' / ');
}

/** 时钟文本 HH:MM:SS（北京时间） */
function clockText(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  // 显式转北京时间，避免设备时区不是 CNS 时显示错
  const bj = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
  return `${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}`;
}

/** 成交量/成交额的人话写法（1.23 亿 / 4560 万） */
function fmtCompact(v) {
  if (!Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)} 万亿`;
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(2)} 万`;
  return fmtNum(n, 0);
}

module.exports = {
  fmtNum,
  fmtPrice,
  fmtSigned,
  fmtPct,
  dirOf,
  prettySource,
  sourceLabel,
  freshShort,
  metaRange,
  clockText,
  fmtCompact,
};
