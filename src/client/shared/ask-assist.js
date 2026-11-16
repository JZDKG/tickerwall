/* ================================================================== *
 * ask-assist.js —— AI 回答内交互辅助（延伸追问提取/兜底、Markdown 复制）
 *
 * 纯函数与轻量无障碍反馈辅助：
 *   · copyIconHtml        —— 1.5px 描边 copy 线性图标（避免改动 vendor 图依赖链）
 *   · extractFollowups    —— 识别并剥离闭合或流式未闭合的 ```followups 代码块
 *   · resolveFollowups    —— 优先采用模型显式追问，缺失时按成功 toolTrace 兜底
 *   · formatAnswerForCopy —— 产出适合粘贴至笔记软件的干净 Markdown + 来源脚注
 *   · copyTextWithFeedback —— Clipboard API + textarea 降级 + 屏幕阅读器重播
 *
 * 全模块严禁使用 raw()，所有 HTML 均由 html`` 标签模板构造。
 * ================================================================== */

import { html } from './format.js';

const FENCE_RE = /^\s*```/;
const MAX_FOLLOWUPS = 3;
const MAX_FOLLOWUP_LEN = 56;
const COPY_RESET_MS = 2000;

const activeTimers = new Map();
const lastAnnouncedByTip = new WeakMap();

// icons.js 被 views/macro/panels.js 引用并打入 public/vendor/macro-flow.js；
// 将问财专用的 copy 图标放在 ask-assist.js 可保证 vendor 构建摘要零变化。
export function copyIconHtml(size = 13, className = '') {
  const px = Number.isFinite(size) && size > 0 ? Math.round(size) : 13;
  const cls = className ? `ui-ico ${className}` : 'ui-ico';
  return html`<svg class="${cls}" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
}

function pushFollowup(list, item) {
  if (list.length >= MAX_FOLLOWUPS || typeof item !== 'string') return;
  const text = item.trim();
  if (!text || text.length > MAX_FOLLOWUP_LEN || list.includes(text)) return;
  list.push(text);
}

function parseFollowupBody(rawBody, target) {
  const trimmed = rawBody.trim();
  if (!trimmed) return;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      for (const item of parsed) pushFollowup(target, item);
      return;
    }
  } catch {
    // 非 JSON 数组时降级按 Markdown 列表逐行提取
  }
  for (const rawLine of trimmed.split('\n')) {
    const cleaned = rawLine
      .trim()
      .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/,+$/, '')
      .trim()
      .replace(/^["']|["']$/g, '');
    pushFollowup(target, cleaned);
  }
}

export function extractFollowups(rawText) {
  if (typeof rawText !== 'string' || !rawText) {
    return { markdown: '', followups: [] };
  }
  const normalized = rawText.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const kept = [];
  const followups = [];
  let stripped = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      const lang = line.trim().slice(3).trim().split(/\s+/)[0].toLowerCase();
      const openLine = line;
      i += 1;
      const body = [];
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      const closed = i < lines.length;
      const closeLine = closed ? lines[i] : '';
      if (closed) i += 1;

      if (lang === 'followups' || lang === 'followup') {
        stripped = true;
        if (closed) parseFollowupBody(body.join('\n'), followups);
        continue;
      }

      kept.push(openLine, ...body);
      if (closed) kept.push(closeLine);
      continue;
    }
    kept.push(line);
    i += 1;
  }

  const joined = kept.join('\n');
  return {
    markdown: stripped ? joined.replace(/\s+$/, '') : joined,
    followups,
  };
}

function candidatesForTool(entry) {
  const tool = entry.tool;
  const args = entry.args && typeof entry.args === 'object' ? entry.args : {};

  if (tool === 'get_a_share_pool') {
    if (args.kind === 'yzt') {
      return ['查询今日A股涨停池与连板梯队', '查询今日炸板池与封板率'];
    }
    return ['查询昨日涨停今日溢价表现', '查询今日炸板池与封板率'];
  }
  if (tool === 'get_a_share_kline') {
    const code = typeof args.code === 'string' && args.code.trim() ? args.code.trim() : '';
    return code
      ? [`查询 ${code} 当日主力资金流向`, `查询 ${code} 最新估值与盘口报价`]
      : ['查询该股当日主力与北向资金流向', '查询今日A股涨停池与连板梯队'];
  }
  if (tool === 'get_a_share_quotes') {
    const firstCode = Array.isArray(args.codes) && typeof args.codes[0] === 'string' ? args.codes[0].trim() : '';
    return firstCode
      ? [`查看 ${firstCode} 近期日K线与量价走势`, `查询 ${firstCode} 当日主力资金流向`]
      : ['查看目标个股近期日K线走势', '查询今日北向与主力资金流向'];
  }
  if (tool === 'get_a_share_fund_flow') {
    const code = typeof args.code === 'string' && args.code.trim() ? args.code.trim() : '';
    return code
      ? [`查看 ${code} 近期日K线与量价走势`, `查询 ${code} 最新实时报价与估值`]
      : ['查询今日A股涨停池与连板梯队', '对比上证指数与离岸人民币联动'];
  }
  if (tool === 'search_a_share') {
    return ['查看匹配个股最新报价与估值', '查看匹配个股近期日K线走势'];
  }
  if (tool === 'get_global_quotes') {
    return ['对比美元指数与美债10Y收益率联动', '查询近24小时高影响宏观快讯'];
  }
  if (tool === 'get_asset_detail') {
    const id = typeof args.id === 'string' && args.id.trim() ? args.id.trim() : '';
    return id
      ? [`分析 ${id} 近期驱动解释与跨市场背离`, `检索 ${id} 相关最新宏观快讯`]
      : ['查看该标的近期驱动解释与关联背离', '查询近24小时高影响宏观快讯'];
  }
  if (tool === 'get_gold_comparison') {
    return ['分析内外盘金价价差与离岸人民币联动', '查看国际金价近30日K线走势'];
  }
  if (tool === 'get_macro_correlations') {
    return ['查看跨资产相关性显著性与领先滞后', '查询近24小时高影响宏观快讯'];
  }
  if (tool === 'get_asset_explanation') {
    return ['查看该标的与核心宏观因子的相关性', '检索相关高影响宏观事件与日程'];
  }
  if (tool === 'search_events_and_news') {
    return ['对照全球核心资产当前实时报价', '查看近期宏观日历重磅日程'];
  }
  if (tool === 'get_macro_calendar_and_study') {
    return ['对比全球大类资产最新涨跌与异动', '检索近24小时高影响实时快讯'];
  }
  if (tool === 'get_overnight_briefing_and_alerts') {
    return ['对比全球核心资产实时报价与价差', '查看今日重磅宏观日历事件'];
  }
  return ['对比全球核心资产实时报价', '查询近24小时高影响宏观快讯'];
}

export function resolveFollowups(content, toolTrace) {
  const explicit = extractFollowups(content).followups;
  if (explicit.length) return explicit;

  const okTraces = (Array.isArray(toolTrace) ? toolTrace : []).filter(
    (t) => Boolean(t && t.ok !== false && typeof t.tool === 'string' && t.tool.trim()),
  );
  if (!okTraces.length) return [];

  const out = [];
  for (const entry of okTraces) {
    for (const candidate of candidatesForTool(entry)) {
      pushFollowup(out, candidate);
    }
  }
  return out;
}

export function formatAnswerForCopy(msg) {
  const body = extractFollowups(msg?.content).markdown.trim();
  if (!body) return '';

  const okTraces = (Array.isArray(msg?.toolTrace) ? msg.toolTrace : []).filter(
    (t) => Boolean(t && t.ok !== false && typeof t.tool === 'string' && t.tool.trim()),
  );
  if (!okTraces.length) return body;

  const citations = [];
  for (const t of okTraces) {
    const meta = [t.source, t.asOf].filter(Boolean).join(' · ');
    const item = meta ? `${t.tool}(${meta})` : t.tool;
    if (!citations.includes(item)) citations.push(item);
  }
  return `${body}\n\n> 数据来源：${citations.join('；')}`;
}

function legacyCopy(text, doc) {
  const field = doc.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0;pointer-events:none';
  doc.body.append(field);
  field.select();
  try {
    return typeof doc.execCommand === 'function' && Boolean(doc.execCommand('copy'));
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

function announceStatus(tipEl, message) {
  const prev = lastAnnouncedByTip.get(tipEl);
  const next = prev === message ? `${message} ` : message;
  lastAnnouncedByTip.set(tipEl, next);
  tipEl.textContent = next;
}

export function clearCopyFeedbackTimers() {
  for (const { timerId, win } of activeTimers.values()) {
    win.clearTimeout(timerId);
  }
  activeTimers.clear();
}

export async function copyTextWithFeedback(button, text, { tipEl, navigatorObj, doc, win }) {
  const payload = String(text);
  let ok = false;

  if (navigatorObj && navigatorObj.clipboard && typeof navigatorObj.clipboard.writeText === 'function') {
    try {
      await navigatorObj.clipboard.writeText(payload);
      ok = true;
    } catch {
      ok = legacyCopy(payload, doc);
    }
  } else {
    ok = legacyCopy(payload, doc);
  }

  const prev = activeTimers.get(button);
  if (prev) {
    prev.win.clearTimeout(prev.timerId);
    activeTimers.delete(button);
  }

  if (ok) {
    delete button.dataset.failed;
    button.dataset.copied = '';
    announceStatus(tipEl, '已复制');
  } else {
    delete button.dataset.copied;
    button.dataset.failed = '';
    announceStatus(tipEl, '复制失败');
  }

  const timerId = win.setTimeout(() => {
    delete button.dataset.copied;
    delete button.dataset.failed;
    tipEl.textContent = '';
    activeTimers.delete(button);
  }, COPY_RESET_MS);
  activeTimers.set(button, { timerId, win });

  return ok;
}
