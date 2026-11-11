/* ================================================================== *
 * 桌面能力桥接层（Phase 3 / P3-T1）
 *
 * Web 端与 Tauri 桌面端共享 100% 视图代码：这里只做「运行时探测 + 能力适配」，
 * 浏览器里没有 Tauri 时所有 invoke 都不发生，页面行为与纯 Web 完全一致。
 *
 * 三块能力：
 *   1. 菜单栏实时报价条 —— 报价一到就格式化紧凑文本，Tauri 下推给托盘，
 *      同时更新 document.title（浏览器标签页也受益）；
 *   2. 副屏画中画 —— dataset.pip 驱动 CSS 紧凑布局，Tauri 下同步窗口置顶；
 *   3. 统一入口 mountDesktopBridge —— 订阅 bus 的 quotes 事件，返回解绑函数。
 * ================================================================== */

import { fmtPct } from './format.js';
import { readPinnedAssets } from './watchlist.js';

/** 无置顶自选时的兜底顺序：贵金属 / 加密 / 股指各取一个 */
export const MENU_BAR_FALLBACK_IDS = ['gold-intl', 'btc', 'sp500'];
export const PIP_DATASET_KEY = 'pip';
export const MAX_MENU_BAR_ITEMS = 3;

/** Tauri v2 把 invoke 挂在 __TAURI_INTERNALS__；v1 与部分 webview 用 __TAURI__ */
export function isTauriRuntime(root = typeof window === 'undefined' ? null : window) {
  if (!root) return false;
  return Boolean(root.__TAURI_INTERNALS__ || root.__TAURI__);
}

/** 从 window 里取 invoke；没有就是 null（绝不抛，浏览器里走降级路径） */
function tauriInvoke(root) {
  return root?.__TAURI_INTERNALS__?.invoke ?? root?.__TAURI__?.invoke ?? null;
}

/** 价格展示：保留最多两位小数并去掉末尾零，不插千分位（菜单栏要紧凑） */
function displayPrice(item) {
  const v = item?.price;
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return String(Math.round(v * 100) / 100);
}

function validQuote(item) {
  return Boolean(item) && item.ok !== false
    && typeof item.price === 'number' && Number.isFinite(item.price);
}

/**
 * 生成菜单栏紧凑文本：`国际金 2745.2 +0.82% · BTC 91200 +2.10%`
 *
 * 置顶自选优先（保持用户点击顺序），不足三个时用默认品种补齐；
 * 名称与价格转义在文本层做一次 —— 系统托盘不解析 HTML，但 document.title
 * 与后续可能的内嵌渲染不该拿到原始标签。
 */
export function formatMenuBarTicker(quotes, pinnedIds = [], { max = MAX_MENU_BAR_ITEMS } = {}) {
  const byId = new Map();
  for (const q of Array.isArray(quotes) ? quotes : []) {
    if (validQuote(q) && !byId.has(q.id)) byId.set(q.id, q);
  }
  const picked = [];
  const seen = new Set();
  for (const id of [...(Array.isArray(pinnedIds) ? pinnedIds : []), ...MENU_BAR_FALLBACK_IDS]) {
    if (picked.length >= max) break;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const item = byId.get(id);
    if (!item) continue;
    picked.push(item);
  }
  if (!picked.length) return '';
  const escText = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return picked.map((item) => {
    const name = escText(item.name || item.id);
    const price = displayPrice(item);
    const pct = Number.isFinite(Number(item.changePct)) ? fmtPct(Number(item.changePct)) : '—';
    return `${name} ${price} ${pct}`;
  }).join(' · ');
}

/**
 * 报价更新时同步菜单栏与 document.title。
 * opts 全部可注入（单测不依赖真实 Tauri 运行时）。
 */
export function updateTrayTicker(quotes, pinnedIds, opts = {}) {
  const root = opts.root ?? (typeof window === 'undefined' ? null : window);
  const doc = opts.document ?? (typeof document === 'undefined' ? null : document);
  const invoke = opts.invoke ?? tauriInvoke(root);
  const tauri = opts.isTauri ?? isTauriRuntime(root);
  const text = formatMenuBarTicker(quotes, pinnedIds);
  if (!text) return null;
  if (doc?.title != null) doc.title = text;
  if (tauri && typeof invoke === 'function') {
    try {
      invoke('update_tray_ticker', { text });
    } catch {
      // 托盘命令失败不该影响页面刷新：桌面壳可能还在启动
    }
  }
  return text;
}

/**
 * 切换画中画模式。
 * @returns {'1'|'0'} 切换后的状态
 */
export function togglePipMode(root, opts = {}) {
  const el = root ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (!el?.dataset) return '0';
  const next = opts.force === '1' || opts.force === 1 ? '1'
    : opts.force === '0' || opts.force === 0 ? '0'
      : (el.dataset.pip === '1' ? '0' : '1');
  const changed = el.dataset.pip !== next;
  el.dataset.pip = next;
  const win = opts.root ?? (typeof window === 'undefined' ? null : window);
  const invoke = opts.invoke ?? tauriInvoke(win);
  const tauri = opts.isTauri ?? isTauriRuntime(win);
  if (changed && tauri && typeof invoke === 'function') {
    try {
      invoke('set_always_on_top', { enabled: next === '1' });
    } catch {
      // 同上：窗口命令失败只影响置顶，不影响紧凑布局
    }
  }
  return next;
}

/**
 * 接进现有应用：订阅 bus 的 quotes 事件刷新菜单栏。
 * 返回解绑函数（视图生命周期 / 测试用）。
 */
export function mountDesktopBridge(opts = {}) {
  const bus = opts.bus ?? null;
  const storage = opts.storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  const invoke = opts.invoke ?? null;
  const onQuotes = (payload) => {
    const quotes = payload?.quotes ?? payload;
    updateTrayTicker(Array.isArray(quotes) ? quotes : [], readPinnedAssets(storage), { invoke });
  };
  // bus.js 用的是 on/off 而不是 addEventListener：兼容两种形态
  const unsubscribe = bus?.on?.('quotes', onQuotes) ?? bus?.subscribe?.('quotes', onQuotes) ?? null;
  return () => {
    if (typeof unsubscribe === 'function') unsubscribe();
    else bus?.off?.('quotes', onQuotes);
  };
}
