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

/* ------------------------------------------------------------------ *
 * 带转义的标签模板
 *
 * 为什么要有它：全站有几十处 `innerHTML = \`…${x}…\``，而转义靠人手写
 * `esc()`。漏一处就是一个注入口，而「漏了」在代码里看起来完全正常 ——
 * 没有类型错误、没有测试红灯、UI 也照常显示。
 *
 * 用法：
 *   el.innerHTML = html`<b>${userInput}</b>`;        // 自动转义
 *   el.innerHTML = html`<b>${raw(safeSnippet)}</b>`; // 显式放行
 *
 * 注意 html 的返回值不是普通字符串，而是一个 marked 对象 —— 这样嵌套时
 * 内层结果不会被再转一次（否则 `<ul>${items.map(x => html`<li>${x}</li>`)}`
 * 会得到 `&amp;lt;li&amp;gt;`）。普通字符串、数字一律转义。
 * ------------------------------------------------------------------ */

/** 已转义（或由 raw 显式放行）的片段。对外只暴露 toString。 */
export class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

/**
 * 显式放行一段原样 HTML。
 *
 * 这是个「我知道自己在做什么」的出口，所以只允许出现在白名单文件里
 * （tests/html-template.test.js 守着），否则它就变成绕过转义的后门。
 */
export function raw(value) {
  return new SafeHtml(String(value ?? ''));
}

/** 值 → HTML 串。数组递归拼接，null/undefined/false 输出空。 */
function renderValue(value) {
  if (value == null || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  return esc(String(value));
}

/**
 * 扫描到末尾时，是否停在某个引号**内部**。
 *
 * 必须逐个字符走状态机，不能用「数引号奇偶」或正则回看：
 *   · 数奇偶会被 `title="it's"` 里的撇号骗（它在双引号内是字面字符）
 *   · 正则回看会被 `<button class="btn" onclick=` 骗 ——
 *     从 `"btn"` 的**闭合**引号开始也能匹配上「引号 + 非引号字符 + =」，
 *     于是「已闭合」被当成「在引号内」，整个校验被绕过。
 *
 * 这不是理论问题：那条正则在 v1 里真的放行了
 * `html`<button class="btn" onclick=${'alert(1)'}>` —— 直接渲染出
 * `onclick=alert(1)`。
 */
function quoteStateOf(text) {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inDouble) {
      if (c === '"') inDouble = false;
    } else if (inSingle) {
      if (c === "'") inSingle = false;
    } else if (c === '"') {
      inDouble = true;
    } else if (c === "'") {
      inSingle = true;
    }
  }
  return inDouble || inSingle;
}

/**
 * 未加引号的属性插值检测。
 *
 * `<a href=${x}>` 靠 HTML 转义防不住 —— 空格会把 `javascript:alert(1) foo`
 * 拆成两个属性，转义后的 `&quot;` 在无引号语境里也不还原。这类写法一律
 * 拒绝，逼调用方写成 `<a href="${x}">`（或干脆用 attrHref）。
 *
 * 判据：插值紧跟在 `=` 之后，且到那个 `=` 为止**不在任何引号内**。
 */
function assertQuotedAttribute(built) {
  const eq = built.lastIndexOf('=');
  if (eq < 0 || !/^\s*$/.test(built.slice(eq + 1))) return;
  // 引号状态要从模板开头累积看，不能只看紧邻的那一段：
  // `<a href="x?a=${1}&b=${2}">` 的第二个插值前后文是 `&b=`，局部看不出
  // 它其实还在 href 的双引号里。
  if (quoteStateOf(built)) return;

  throw new Error(
    `html\`\` 不允许未加引号的属性插值：...${built.slice(-24)}\${…}。` +
      '请写成 attr="…"，或用 attrHref()。',
  );
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    // 用「已经拼好的前文」判断，而不是 strings[i] —— 引号可能开在前面的
    // 静态片段里，也可能跨过已渲染的值
    assertQuotedAttribute(out);
    out += renderValue(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

/**
 * href/src 专用：转义之外还要过 safeHref。
 *
 * 两件事是正交的 —— 转义只防 HTML 注入，挡不住 `javascript:` 协议。
 * 被拒时返回空串，调用方据此整段不渲染（不要退化成空的 href=""）。
 */
export function attrHref(rawUrl) {
  const href = safeHref(rawUrl);
  return href ? esc(href) : '';
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
