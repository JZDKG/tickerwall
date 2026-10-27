/* ================================================================== *
 * format.js —— 格式化与纯 SVG 工具：价格/涨跌/百分比、转义、方向判定、钟点、迷你走势、来源美化。
 *
 * 来源：public/app.js（原 3655 行单体）L30-157，整段搬运，逻辑未改写。
 * ================================================================== */

/* ------------------------------ 工具 ------------------------------ */

export const nfCache = new Map();
export function numFmt(decimals) {
  const key = String(decimals);
  if (!nfCache.has(key)) {
    nfCache.set(
      key,
      new Intl.NumberFormat('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    );
  }
  return nfCache.get(key);
}

export function fmtPrice(v, decimals) {
  if (v == null || !Number.isFinite(v)) return '—';
  return numFmt(decimals).format(v);
}

export function fmtSigned(v, decimals) {
  if (v == null || !Number.isFinite(v)) return '—';
  const body = numFmt(decimals).format(Math.abs(v));
  if (v > 0) return `+${body}`;
  if (v < 0) return `-${body}`;
  return body;
}

export function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  // 幅度极小时多给一位，避免 -0.004% 被显示成 -0.00%
  const body = abs.toFixed(abs > 0 && abs < 0.01 ? 3 : 2);
  if (v > 0) return `+${body}%`;
  if (v < 0) return `-${body}%`;
  return `${body}%`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * 渲染前的 URL 白名单。
 *
 * 服务端已经用同一个判据清洗过（news-lexicon.sanitizeUrl），这里是第二道 ——
 * 因为 `esc()` 只转义 HTML 实体，对 `javascript:alert(1)` 毫无作用，
 * 而这类值一旦进了 `href` 就是一个点击即执行的洞。纵深防御，两道都要有。
 *
 * 返回 '' 表示不该渲染成链接，调用方据此整段不渲染。
 */
export function safeHref(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s || /[\u0000-\u001f\u007f]/.test(s)) return '';
  try {
    // 不传 base：相对路径在这里就该被拒（服务端也不会给出相对地址），
    // 传 location.href 的话 `/x` 会被解析成同源绝对地址而放行。
    // 也不依赖 location 全局 —— 这个函数在 Node 测试里也要能跑。
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

export function dirOf(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

export function clockText(d = new Date()) {
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

/** 走势迷你图：非等比拉伸，用 non-scaling-stroke 保证线宽不变 */
export function sparklineSVG(points, dir, width = 240, height = 56) {
  const pts = Array.isArray(points) ? points.filter((p) => p && Number.isFinite(p.p)) : [];
  if (pts.length < 2) {
    return '<div class="spark-empty">走势积累中…</div>';
  }

  const values = pts.map((p) => p.p);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    const pad = Math.abs(max) * 0.0005 || 0.5;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const x = (i) => 1.5 + (i / (pts.length - 1)) * (width - 3);
  const y = (v) => height - 5 - ((v - min) / span) * (height - 10);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  const stroke = dir === 'up' ? 'var(--up)' : dir === 'down' ? 'var(--down)' : 'var(--flat)';
  const gid = `g${Math.random().toString(36).slice(2, 9)}`;
  const lastX = x(values.length - 1).toFixed(2);
  const lastY = y(values[values.length - 1]).toFixed(2);

  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="走势">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.30" />
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${gid})" stroke="none" />
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linejoin="round"
          stroke-linecap="round" vector-effect="non-scaling-stroke" />
    <circle cx="${lastX}" cy="${lastY}" r="2.4" fill="${stroke}" vector-effect="non-scaling-stroke" />
  </svg>`;
}

export function metaRange(item) {
  const d = item.decimals ?? 2;
  const parts = [];
  if (Number.isFinite(item.high)) parts.push(`高 ${fmtPrice(item.high, d)}`);
  if (Number.isFinite(item.low)) parts.push(`低 ${fmtPrice(item.low, d)}`);
  if (!parts.length && Number.isFinite(item.prevClose)) {
    parts.push(`${item.priceBasis === 'settle' ? '昨结算' : '昨收'} ${fmtPrice(item.prevClose, d)}`);
  }
  return parts.join(' / ');
}

export function prettySource(src) {
  if (!src) return '—';
  return src
    .replace(/^sina-futures:/, '新浪期货 ')
    .replace(/^sina-forex:/, '新浪外汇 ')
    .replace(/^sina-inner:/, '新浪期货 ')
    .replace(/^sina-us:/, '新浪美股 ')
    .replace(/^sina:/, '新浪 ')
    .replace(/^eastmoney:/, '东财 ')
    .replace(/^binance:/, 'Binance ')
    .replace(/^coinbase:/, 'Coinbase ')
    .replace(/^gold-api:/, 'gold-api ')
    // 2026-10 新增的稳定源，之前裸露成 fred:DGS10 / sina-futures:CL 这种内部标识
    .replace(/^fred:/, 'FRED ')
    .replace(/^nasdaq:/, 'Nasdaq ')
    .replace(/^tencent:/, '腾讯 ')
    .replace(/^cnbc:/, 'CNBC ')
    .replace(/^yahoo:/, 'Yahoo ')
    .replace(/^cboe:/, 'CBOE ')
    // 价差 Chip 是本地折算出来的，不是外部源
    .replace(/^calc:/, '折算·');
}
