/* ================================================================== *
 * 创作者一键分享战报卡（Phase 3 / P3-T3）
 *
 * 一个纯函数渲染器：输入结构化模型，输出自包含、可直接另存为 .svg 的字符串。
 * 没有外部字体、外链图片或脚本 —— 卡要能被 Notion/博客当图片贴，也要能
 * 被创作者下载后在任意编辑器里打开。
 *
 * 安全：模型里的标题、事实、证据、快照 ID 都来自用户输入 / 服务端解释，
 * 一律先做 XML 转义再进 <text>。`&lt;script&gt;` 是文本，不是节点；
 * 测试里用 DOMParser 真解析一遍，断言渲染结果不会长出 script/image 节点。
 * ================================================================== */

export const SHARE_CARD_ASPECTS = Object.freeze({
  '16:9': { width: 1600, height: 900 },
  '3:4': { width: 900, height: 1200 },
});

export const BRAND_WATERMARK = 'TickerWall · Explainable Cross-Asset Terminal';
export const MAX_FACTS = 3;

/** XML 文本与属性通用转义（比 HTML 多一个 ' 的实体，SVG 里同样安全） */
export function xmlEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNumber(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function fmtPct(v) {
  const n = safeNumber(v, NaN);
  if (!Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtPrice(v) {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '—';
}

function shortStamp(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return new Date().toISOString().slice(0, 16).replace('T', ' ');
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** 长文本按字符数硬折行（SVG 没有自动换行；中文按字、英文按词都够用） */
function wrap(text, max = 28, maxLines = 2) {
  const s = String(text ?? '').trim();
  if (!s) return [];
  const lines = [];
  let cur = '';
  for (const ch of s) {
    cur += ch;
    if (cur.length >= max) {
      lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && cur) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`;
  }
  return lines;
}

/** 每行一个 <text>，返回带 data-share-* 标记的片段，便于测试与样式定位 */
function textLines(lines, { x, y, dy, size, fill, weight = 400, marker = '' }) {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * dy}" font-size="${size}" fill="${fill}"
    font-weight="${weight}"${marker ? ` data-share-${marker}="1"` : ''}>${xmlEsc(line)}</text>`).join('\n    ');
}

/**
 * 生成分享卡 SVG。
 *
 * @param {object} model 见 buildShareCardModel 的输出
 * @param {{aspect?:'16:9'|'3:4'}} opts
 * @returns {string} 自包含 SVG
 */
export function renderShareCardSVG(model = {}, opts = {}) {
  const m = model && typeof model === 'object' ? model : {};
  const dims = SHARE_CARD_ASPECTS[opts.aspect] ?? SHARE_CARD_ASPECTS['16:9'];
  const { width: W, height: H } = dims;
  const compact = W < 1000;
  const pad = compact ? 56 : 80;
  const title = String(m.title || `${m.assetName || '市场'}复盘` || '市场复盘');
  const changePct = safeNumber(m.changePct, NaN);
  const up = Number.isFinite(changePct) && changePct >= 0;
  const changeColor = up ? '#f5455c' : '#22b07d';
  const priceColor = '#e8eef6';

  const facts = (Array.isArray(m.facts) ? m.facts : []).filter(Boolean).slice(0, MAX_FACTS);
  const contrary = String(m.contrary ?? '').trim();
  const snapshotId = String(m.snapshotId || `exp_${Date.now().toString(36)}`);
  const stamp = shortStamp(m.asOf);

  // 3:4 竖版把价格区往下压，给归因列表留空间
  const priceY = compact ? 360 : 330;
  const factsStartY = compact ? 520 : 470;

  const factBlocks = facts.map((f, i) => {
    const y = factsStartY + i * (compact ? 108 : 100);
    const lines = wrap(f, compact ? 30 : 46, 2);
    return `<g>
      <circle cx="${pad + 10}" cy="${y - 8}" r="6" fill="#4c8dff" />
      ${textLines(lines, { x: pad + 32, y, dy: 34, size: compact ? 26 : 28, fill: '#dbe5f1', marker: 'fact' })}
    </g>`;
  }).join('\n    ');

  const contraryBlock = contrary
    ? `<g>
      <rect x="${pad - 16}" y="${H - (compact ? 250 : 190)}" width="${W - pad * 2 + 32}" height="${compact ? 92 : 80}" rx="12"
            fill="#2a1c22" stroke="#7a3a44" stroke-width="1" />
      <text x="${pad}" y="${H - (compact ? 220 : 162)}" font-size="${compact ? 22 : 20}" fill="#f0a3ae" font-weight="600">相反证据 / 待核查</text>
      ${textLines(wrap(contrary, compact ? 34 : 60, 2), { x: pad, y: H - (compact ? 186 : 132), dy: 28, size: compact ? 21 : 20, fill: '#d6a9b0' })}
    </g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
       aria-label="${xmlEsc(title)} 分享战报卡">
  <defs>
    <linearGradient id="tw-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1017" />
      <stop offset="55%" stop-color="#131d2b" />
      <stop offset="100%" stop-color="#1a2740" />
    </linearGradient>
    <linearGradient id="tw-accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#4c8dff" />
      <stop offset="100%" stop-color="#7a5cff" />
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#tw-bg)" />
  <rect x="0" y="0" width="${W}" height="8" fill="url(#tw-accent)" />
  <rect x="${pad}" y="${compact ? 76 : 88}" width="${compact ? 4 : 5}" height="${compact ? 66 : 72}" rx="2" fill="#4c8dff" />
  <text x="${pad + 24}" y="${compact ? 112 : 128}" font-size="${compact ? 20 : 22}" fill="#7f93ad" letter-spacing="3">TICKERWALL · 归因战报</text>
  ${textLines(wrap(title, compact ? 22 : 34, 2), { x: pad + 24, y: compact ? 158 : 182, dy: compact ? 34 : 42, size: compact ? 40 : 52, fill: '#f2f6fc', weight: 700 })}
  <text x="${pad}" y="${priceY}" font-size="${compact ? 20 : 22}" fill="#7f93ad">${xmlEsc(m.assetName || '标的')} · 最新价</text>
  <text x="${pad}" y="${priceY + (compact ? 70 : 84)}" font-size="${compact ? 76 : 96}" fill="${priceColor}" font-weight="700">${xmlEsc(fmtPrice(m.price))}</text>
  <text x="${pad + (compact ? 340 : 440)}" y="${priceY + (compact ? 70 : 84)}" font-size="${compact ? 44 : 56}" fill="${changeColor}" font-weight="700">${xmlEsc(fmtPct(changePct))}</text>
  <line x1="${pad}" y1="${factsStartY - 56}" x2="${W - pad}" y2="${factsStartY - 56}" stroke="#26364c" stroke-width="1" />
  <text x="${pad}" y="${factsStartY - 20}" font-size="${compact ? 20 : 22}" fill="#7f93ad" letter-spacing="2">核心归因 · 最多 3 条</text>
    ${factBlocks}
    ${contraryBlock}
  <line x1="${pad}" y1="${H - 76}" x2="${W - pad}" y2="${H - 76}" stroke="#26364c" stroke-width="1" />
  <text x="${pad}" y="${H - 44}" font-size="18" fill="#6f8299">${xmlEsc(stamp)}　·　快照校验 ID ${xmlEsc(snapshotId)}</text>
  <text x="${W - pad}" y="${H - 44}" font-size="18" fill="#6f8299" text-anchor="end">${xmlEsc(BRAND_WATERMARK)}</text>
  <text x="${W - pad}" y="${H - 20}" font-size="14" fill="#4f6178" text-anchor="end">归因是待检验假设，不构成投资建议</text>
</svg>`;
}

/**
 * 把「解释快照」或「隔夜复盘」整理成渲染模型。
 * 两个来源字段不同，统一在这里归一，按钮侧不必各写一套。
 */
export function buildShareCardModel(input = {}) {
  const ex = input.explanation ?? {};
  const quote = input.quote ?? {};
  const items = Array.isArray(input.items) ? input.items : [];
  const hypotheses = Array.isArray(ex.hypotheses) ? ex.hypotheses : [];
  const facts = hypotheses.length
    ? hypotheses.slice(0, MAX_FACTS).map((h) => String(h?.label ?? h?.mechanismId ?? '')).filter(Boolean)
    : items.slice(0, MAX_FACTS).map((it) => `${it.name ?? it.id ?? '标的'} ${it.movePct >= 0 ? '+' : ''}${safeNumber(it.movePct).toFixed(2)}%`);
  const unknown = (Array.isArray(ex.unknowns) ? ex.unknowns : [])[0];
  const contrary = input.contrary ?? (unknown?.text
    ? `还缺什么：${unknown.text}`
    : hypotheses.some((h) => h.status === 'mixed') ? '支持与反向证据同时存在，方向未定' : '');
  const price = input.price ?? quote.price ?? items[0]?.to ?? null;
  const changePct = input.changePct ?? quote.changePct ?? items[0]?.movePct ?? null;
  return {
    title: input.title ?? (ex.summary ? String(ex.summary).slice(0, 60) : `${input.assetName ?? '市场'}复盘`),
    assetName: input.assetName ?? '市场',
    price,
    changePct,
    snapshotId: input.snapshotId ?? ex.id ?? `exp_${Date.now().toString(36)}`,
    asOf: input.asOf ?? ex.asOf ?? ex.generatedAt ?? null,
    facts: facts.slice(0, MAX_FACTS),
    contrary,
  };
}

/* ------------------------------------------------------------------ *
 * 下载：浏览器里生成 Blob → <a download> → 点一下 → 立刻回收 URL。
 * 所有全局都可注入，单测用假 document 就能断言文件名与 MIME。
 * ------------------------------------------------------------------ */

export function createDownloadShareCard(model, opts = {}) {
  const doc = opts.document ?? (typeof document === 'undefined' ? null : document);
  if (!doc) return null;
  const svg = renderShareCardSVG(model, opts);
  const blob = opts.BlobImpl ? new opts.BlobImpl([svg], { type: 'image/svg+xml;charset=utf-8' })
    : new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const makeUrl = opts.createObjectURL ?? ((b) => URL.createObjectURL(b));
  const revoke = opts.revokeObjectURL ?? ((u) => URL.revokeObjectURL(u));
  const url = makeUrl(blob);
  const a = doc.createElement('a');
  const id = String(model?.snapshotId ?? 'exp_snapshot').replace(/[^\w.-]/g, '_');
  a.setAttribute('href', url);
  a.setAttribute('download', `tickerwall-${id}.svg`);
  doc.body?.appendChild?.(a);
  a.click();
  a.remove?.();
  // 立刻 revoke 会让部分浏览器来不及取 blob：下一个宏任务再收
  const later = opts.setTimeout ?? ((fn) => setTimeout(fn, 0));
  later(() => revoke(url), 0);
  return { filename: a.getAttribute?.('download') ?? a.download, url, svg };
}

/* ------------------------------------------------------------------ *
 * Embed 挂件模式
 *
 * embed=1 可能出现在两个位置：
 *   ?embed=1#/d/gold-intl   （query）
 *   #/d/gold-intl?embed=1   （hash 内的 query，Notion 里常这么贴）
 * 两种都要认，且激活后把参数从 URL 里剥掉 —— 否则用户复制地址栏链接
 * 会把嵌入模式也复制走，粘到别处又变成一个无边框页面。
 * ------------------------------------------------------------------ */

export const EMBED_PARAM = 'embed';
export const EMBED_DATASET_KEY = 'embed';

/** 从完整 URL（或 location.href / hash 字符串）判断是否在嵌入模式 */
export function isEmbedMode(rawUrl) {
  const s = String(rawUrl ?? '');
  if (!s) return false;
  try {
    const u = new URL(s, 'http://localhost');
    if (u.searchParams.get(EMBED_PARAM) === '1') return true;
    // hash 里可能自带 ?embed=1
    const q = u.hash.indexOf('?');
    if (q >= 0 && new URLSearchParams(u.hash.slice(q + 1)).get(EMBED_PARAM) === '1') return true;
  } catch {
    /* 非 URL 形态（纯 hash），退化成字符串匹配 */
  }
  return /(?:[?&])embed=1(?:&|#|$)/.test(s);
}

/** 剥掉 embed 参数，保留其它 query / hash 参数与路径 */
export function stripEmbedParam(rawUrl) {
  const s = String(rawUrl ?? '');
  if (!s) return s;
  try {
    const u = new URL(s, 'http://localhost');
    u.searchParams.delete(EMBED_PARAM);
    const hq = u.hash.indexOf('?');
    if (hq >= 0) {
      const params = new URLSearchParams(u.hash.slice(hq + 1));
      params.delete(EMBED_PARAM);
      const rest = params.toString();
      u.hash = u.hash.slice(0, hq) + (rest ? `?${rest}` : '');
    }
    const hadAbsolute = /^[a-z]+:\/\//i.test(s);
    return hadAbsolute ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return s.replace(/([?&])embed=1&?/g, '$1').replace(/[?&]$/, '');
  }
}

/** 显式退出嵌入模式（供测试与「返回完整看板」入口使用） */
export function resetEmbedMode(root) {
  const el = root ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (el?.dataset) delete el.dataset.embed;
}

/**
 * 按当前 URL 设置 documentElement.dataset.embed；返回是否处于嵌入模式。
 *
 * 「粘性」是刻意的：首次加载识别到 embed=1 后会把参数从地址栏剥掉，
 * 之后的 hashchange / route() 再看 URL 已经没有 embed 了。如果那时把
 * dataset 清掉，挂件会在用户点第一个链接后突然长回顶栏 —— 所以一旦
 * 激活就保持，直到显式 resetEmbedMode（tests / 退出挂件）。
 */
export function applyEmbedMode(root, rawUrl) {
  const el = root ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (!el?.dataset) return false;
  const on = isEmbedMode(rawUrl);
  if (on) el.dataset.embed = '1';
  return on || el.dataset.embed === '1';
}

/** 生成 Notion / Substack / 博客用的标准 iframe 代码 */
export function buildEmbedCode(rawUrl, { width = 800, height = 450 } = {}) {
  let src = String(rawUrl ?? '');
  if (!isEmbedMode(src)) {
    src = src.includes('?') ? `${src}&embed=1` : `${src}?embed=1`;
  }
  const w = Math.max(1, Math.floor(safeNumber(width, 800)));
  const h = Math.max(1, Math.floor(safeNumber(height, 450)));
  return `<iframe src="${xmlEsc(src)}" width="${w}" height="${h}" loading="lazy"
  frameborder="0" title="TickerWall 跨资产看板" allowfullscreen></iframe>`;
}
