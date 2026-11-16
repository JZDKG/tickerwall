/* ================================================================== *
 * 安全 Markdown 渲染（AI 回答专用）
 *
 * 为什么不用现成库：零新增依赖是硬约束；而 AI 输出是本机模型网关返回的
 * 外部文本，必须当成不可信输入。这里的顺序是固定的：
 *   1. 先把所有文本交给 html``（默认转义）；
 *   2. 再生成结构标签 —— 标签本身全部是代码里的常量；
 *   3. 链接走 safeMarkdownHref：只放行 http(s) 与站内白名单路由。
 * 任何一步都不调用 raw()，因此不存在「绕过转义」的出口。
 *
 * 支持的子集（够 AI 回答用，不追求 CommonMark 完整）：
 *   段落 / h2-h4 / 加粗 / 行内代码 / 围栏代码 / 有序无序列表 /
 *   引用 / GFM 表格 / 链接 / 分隔线。
 * ================================================================== */

import { html, safeHref } from './format.js';
import { isChartFence, renderChartBlock } from './ask-charts.js';

/** 站内链接只认这些路由，避免 `#/javascript:...` 这类伪路由混进来 */
const SAFE_HASH_ROUTE = /^#\/(?:d\/[A-Za-z0-9._-]+|macro|events|map|watch|ask)$/;

export function safeMarkdownHref(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  if (SAFE_HASH_ROUTE.test(raw)) return raw;
  return safeHref(raw);
}

/* ------------------------------------------------------------------ *
 * 行内：代码 / 加粗 / 链接
 *
 * 正则按「代码 → 加粗 → 链接」的优先级从左到右扫描；每一段文字都作为
 * 普通字符串插进 html``，由它统一转义。链接文字里禁止再嵌套链接
 * （嵌套 <a> 是非法 HTML），但加粗与代码仍可生效。
 * ------------------------------------------------------------------ */
const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[([^\]\n]+)\]\(([^)\s]+)\))/g;

function linkHTML(href, label) {
  const text = renderInline(label);
  if (href.startsWith('#')) return html`<a href="${href}">${text}</a>`;
  return html`<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function renderInline(text) {
  const src = String(text);
  const parts = [];
  let last = 0;
  for (const match of src.matchAll(INLINE_RE)) {
    if (match.index > last) parts.push(src.slice(last, match.index));
    if (match[1]) {
      parts.push(html`<code>${match[1].slice(1, -1)}</code>`);
    } else if (match[2]) {
      parts.push(html`<strong>${renderInline(match[2].slice(2, -2))}</strong>`);
    } else {
      const href = safeMarkdownHref(match[5]);
      parts.push(href ? linkHTML(href, match[4]) : match[4]);
    }
    last = match.index + match[0].length;
  }
  if (last < src.length) parts.push(src.slice(last));
  return parts;
}

/* ------------------------------------------------------------------ *
 * 表格
 *
 * 数值列（含千分位、小数、百分号）统一右对齐并启用等宽数字；
 * 显式对齐标记（:--- / ---: / :---:）优先于数值推断。
 * ------------------------------------------------------------------ */
const NUMERIC_RE = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/;

function splitRow(line) {
  let s = String(line).trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
}

function separatorAlign(cell) {
  if (!/^:?-+:?$/.test(cell)) return null;
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

function isTableSeparator(line) {
  const s = String(line).trim();
  if (!s.includes('|')) return false;
  const cells = splitRow(s);
  return cells.length > 0 && cells.every((cell) => separatorAlign(cell) !== null);
}

function cellClass(align, numeric) {
  const classes = [];
  if (align) classes.push(`is-${align}`);
  if (numeric) classes.push('is-num');
  return classes.join(' ');
}

function tableHTML(lines, start) {
  const header = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map(separatorAlign);
  const rows = [];
  let i = start + 2;
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    rows.push(splitRow(lines[i]));
    i += 1;
  }

  const cols = Math.max(header.length, aligns.length, ...rows.map((row) => row.length));
  const cellsOf = (row) => Array.from({ length: cols }, (_, col) => row[col] ?? '');
  const numericCols = Array.from({ length: cols }, (_, col) => {
    const values = rows.map((row) => String(row[col] ?? '').trim()).filter(Boolean);
    return values.length > 0 && values.every((value) => NUMERIC_RE.test(value));
  });
  const classOf = (col) => cellClass(aligns[col] ?? '', numericCols[col]);

  const head = cellsOf(header);
  const body = rows.map((row) => {
    const cells = cellsOf(row);
    return html`<tr>${cells.map((cell, col) => html`<td class="${classOf(col)}">${renderInline(cell)}</td>`)}</tr>`;
  });

  return {
    html: html`<div class="md-table-wrap"><table class="md-table"><thead><tr>${head.map((cell, col) => html`<th class="${classOf(col)}">${renderInline(cell)}</th>`)}</tr></thead><tbody>${body}</tbody></table></div>`,
    next: i,
  };
}

/* ------------------------------------------------------------------ *
 * 块级解析
 * ------------------------------------------------------------------ */
const FENCE_RE = /^\s*```/;
const HEADING_RE = /^(#{2,4})\s+(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/;
const QUOTE_RE = /^\s*>/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;

function isBlockStart(lines, index) {
  const line = lines[index];
  if (FENCE_RE.test(line)) return true;
  if (HEADING_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  if (QUOTE_RE.test(line)) return true;
  if (UL_RE.test(line)) return true;
  if (OL_RE.test(line)) return true;
  return line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1]);
}

function headingHTML(level, text) {
  const inner = renderInline(text);
  if (level === 2) return html`<h2>${inner}</h2>`;
  if (level === 3) return html`<h3>${inner}</h3>`;
  return html`<h4>${inner}</h4>`;
}

function listHTML(lines, start, pattern, ordered) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const match = pattern.exec(lines[i]);
    if (!match) break;
    items.push(match[1]);
    i += 1;
  }
  const body = items.map((item) => html`<li>${renderInline(item)}</li>`);
  return { html: ordered ? html`<ol>${body}</ol>` : html`<ul>${body}</ul>`, next: i };
}

function quoteHTML(lines, start) {
  const body = [];
  let i = start;
  while (i < lines.length && QUOTE_RE.test(lines[i])) {
    body.push(lines[i].replace(/^\s*>\s?/, ''));
    i += 1;
  }
  return { html: html`<blockquote>${body.map((line) => html`<p>${renderInline(line)}</p>`)}</blockquote>`, next: i };
}

export function markdownToSafeHtml(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!src.trim()) return html``;

  const lines = src.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (FENCE_RE.test(line)) {
      const lang = line.trim().slice(3).trim().split(/\s+/)[0].toLowerCase();
      i += 1;
      const code = [];
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      const closed = i < lines.length;
      if (closed) i += 1;
      if (isChartFence(lang)) {
        const chart = renderChartBlock(lang, code.join('\n'), { closed });
        if (chart) {
          blocks.push(chart);
          continue;
        }
      }
      blocks.push(html`<pre class="md-code"><code>${code.join('\n')}</code></pre>`);
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push(headingHTML(heading[1].length, heading[2].trim()));
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push(html`<hr>`);
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const done = quoteHTML(lines, i);
      blocks.push(done.html);
      i = done.next;
      continue;
    }

    const unordered = UL_RE.exec(line);
    if (unordered) {
      const done = listHTML(lines, i, UL_RE, false);
      blocks.push(done.html);
      i = done.next;
      continue;
    }

    const ordered = OL_RE.exec(line);
    if (ordered) {
      const done = listHTML(lines, i, OL_RE, true);
      blocks.push(done.html);
      i = done.next;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const done = tableHTML(lines, i);
      blocks.push(done.html);
      i = done.next;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(html`<p>${paragraph.map((part, index) => (index === 0 ? renderInline(part) : [html`<br>`, renderInline(part)]))}</p>`);
  }

  return html`${blocks}`;
}
