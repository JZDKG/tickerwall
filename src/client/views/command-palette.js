/* ================================================================== *
 * 全局命令面板（Phase 4 / P4-T1）
 *
 * Cmd/Ctrl+K 或点顶栏 #cmd-palette-btn 打开：一个输入框 + 一份可检索的
 * 命令清单，回车执行第一条。清单里三类东西：
 *   · 标的直达（走运行时 quotes，没有元数据时回退到 23 个标的的静态表）；
 *   · 视图切换（五个深链接，与 nav.js 的任务分组一致）；
 *   · 工作台快捷动作（视图密度 / 配色 / 主题 / 隔夜复盘 / 预警中心）。
 *
 * 刻意把「检索」与「执行」分开：filterCommandItems 是纯函数（同样输入
 * 永远同样输出，可在 Node 里单测），DOM / 跳转 / 偏好写入全在 mount 里。
 * 动作不直接调 workspace.setState：统一发一个 patch，让调用方决定怎么落，
 * 这样测试不必造 localStorage，也不会出现两份偏好状态。
 * ================================================================== */

import { PLACEHOLDER } from '../shared/store.js';
import { esc } from '../shared/format.js';

export const CMD_PALETTE_MODAL_ID = 'cmd-palette-modal';
export const CMD_PALETTE_BTN_ID = 'cmd-palette-btn';

/** 视图切换：hash 与 nav.js 的深链接口径一致（'' 代表列表页） */
export const COMMAND_VIEWS = Object.freeze([
  { id: 'view:home', label: '行情与问题', hint: '首页 · 问题优先 + 23 标的', hash: '', keywords: '行情 问题 首页 list home' },
  { id: 'view:map', label: '全球态势地图', hint: '#/map · 177 国地理态势', hash: '#/map', keywords: '地图 全球 态势 map geo' },
  { id: 'view:macro', label: '跨资产关联分析', hint: '#/macro · 传导图谱与相关矩阵', hash: '#/macro', keywords: '关联 分析 宏观 传导 macro graph' },
  { id: 'view:events', label: '事件中心', hint: '#/events · 发布与冲击', hash: '#/events', keywords: '事件 新闻 日历 events' },
  { id: 'view:watch', label: '我的关注', hint: '#/watch · 关注简报与台账', hash: '#/watch', keywords: '关注 自选 watch brief' },
]);

/** 工作台快捷动作：patch 交给 workspace.setState；panel 由 mount 的 handler 打开 */
export const COMMAND_ACTIONS = Object.freeze([
  { id: 'ws:density:wall', label: '视图：磁贴墙', hint: '工作台 · 密度', patch: { density: 'wall' }, keywords: '视图 磁贴墙 平铺 布局 wall' },
  { id: 'ws:density:grouped', label: '视图：分组列表', hint: '工作台 · 密度', patch: { density: 'grouped' }, keywords: '视图 分组列表 布局 grouped' },
  { id: 'ws:color:cn', label: '配色：红涨绿跌', hint: '工作台 · 配色', patch: { colorScheme: 'cn' }, keywords: '配色 红涨绿跌 颜色 cn' },
  { id: 'ws:color:intl', label: '配色：绿涨红跌', hint: '工作台 · 配色', patch: { colorScheme: 'intl' }, keywords: '配色 绿涨红跌 颜色 intl' },
  { id: 'ws:theme:dark', label: '主题：深色', hint: '工作台 · 主题', patch: { theme: 'dark' }, keywords: '主题 深色 dark' },
  { id: 'ws:theme:oled', label: '主题：OLED', hint: '工作台 · 主题', patch: { theme: 'oled' }, keywords: '主题 纯黑 OLED oled' },
  { id: 'ws:theme:light', label: '主题：浅色', hint: '工作台 · 主题', patch: { theme: 'light' }, keywords: '主题 浅色 研报 light' },
  { id: 'action:briefing', label: '打开隔夜复盘', hint: 'A股收盘后的隔夜走势', action: 'briefing', keywords: '隔夜 复盘 快照 briefing' },
  { id: 'action:alerts', label: '打开预警中心', hint: '规则 / 最近触发', action: 'alerts', keywords: '预警 告警 规则 中心 alerts' },
]);

/** 合成比价指标 → 命令项（Phase 2 的 /api/quotes.synthetics） */
function syntheticItem(s) {
  const id = String(s?.id ?? '');
  if (!id) return null;
  const label = String(s?.name ?? s?.label ?? id);
  return {
    id: `synthetic:${id}`,
    label,
    // 合成比价没有 #/d/:id 详情页（detail 路由只认注册标的），所以统一
    // 落到 #/macro 的跨资产关联分析，不造一条会 404 的死链接。
    hint: `${id} · 合成比价（关联分析）`,
    hash: '#/macro',
    keywords: `${id} ${label} 合成 比价 spread 关联 分析`,
    category: 'synthetic',
  };
}

/** 一行标的 → 一条命令项。副标题也进 keywords，便于按「伦敦金」搜到国际金价 */
function quoteItem(q) {
  const id = String(q?.id ?? '');
  if (!id) return null;
  const name = String(q?.name ?? '');
  const sub = String(q?.sub ?? '');
  return {
    id: `asset:${id}`,
    label: name || id,
    hint: sub ? `${id} · ${sub}` : id,
    hash: `#/d/${encodeURIComponent(id)}`,
    keywords: `${id} ${name} ${sub}`,
    category: 'asset',
  };
}

/**
 * 纯函数：按 query 过滤并排序命令项。
 *
 * 匹配口径：query 按空白切成多个词，每个词都要能在「label + hint + keywords」
 * 里找到（大小写不敏感），这样「金价 国际」也能命中而不是只认前缀。
 * 空 query 返回全部（视图 → 动作 → 标的），便于一打开就看到能力全貌。
 *
 * @param {string} query
 * @param {{quotes?:object[], synthetics?:object[], preferences?:object}} opts
 * @returns {object[]}
 */
export function filterCommandItems(query, { quotes = [], synthetics = [], preferences = {} } = {}) {
  // 标的元数据优先用实时报价；没数据时退回 PLACEHOLDER，保证面板永远有 23 项
  const source = Array.isArray(quotes) && quotes.length ? quotes : PLACEHOLDER;
  const items = [
    ...COMMAND_VIEWS.map((v) => ({ ...v, category: 'view' })),
    ...COMMAND_ACTIONS.map((a) => ({ ...a, category: 'action' })),
    ...source.map(quoteItem).filter(Boolean),
    ...(Array.isArray(synthetics) ? synthetics.map(syntheticItem).filter(Boolean) : []),
  ];

  const tokens = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return items;
  return items.filter((it) => {
    const hay = `${it.label} ${it.hint ?? ''} ${it.keywords ?? ''}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

/** 单行 HTML。href 只给「有 hash 的项」，动作项靠 data-cmd-index 走委托 */
export function commandItemHTML(item, index, active = false) {
  const cls = `cp-item${active ? ' is-active' : ''}`;
  const body = `<span class="cp-cat">${esc(item.category ?? '')}</span>
      <span class="cp-label">${esc(item.label)}</span>
      <span class="cp-hint">${esc(item.hint ?? '')}</span>`;
  if (item.hash != null) {
    return `<a class="${cls}" data-cmd-index="${index}" href="${esc(item.hash)}" role="option" aria-selected="${active ? 'true' : 'false'}">${body}</a>`;
  }
  return `<button type="button" class="${cls}" data-cmd-index="${index}" role="option" aria-selected="${active ? 'true' : 'false'}">${body}</button>`;
}

export function commandResultsHTML(items, activeIndex = 0) {
  if (!items.length) return '<p class="cp-empty">没有匹配的命令或标的</p>';
  // 列表项已由 commandItemHTML 逐字段 esc 过；拼成字符串后再插入 html`` 会
  // 被当普通字符串整体转义（<button> 变成 &lt;button&gt;）。这里直接拼接。
  return `<div class="cp-list" role="listbox" aria-label="命令结果">${
    items.map((it, i) => commandItemHTML(it, i, i === activeIndex)).join('')
  }</div>`;
}

export function commandPaletteHTML() {
  return `<div class="cp-backdrop" data-cp-dismiss="1"></div>
    <div class="cp-dialog" role="dialog" aria-modal="true" aria-label="命令面板">
      <div class="cp-head">
        <span class="cp-kbd">⌘K</span>
        <input id="cmd-palette-input" type="text" class="cp-input" autocomplete="off"
               placeholder="搜索标的、视图、工作台动作…（↑↓ 选择 · 回车执行 · Esc 关闭）" />
      </div>
      <div id="cmd-palette-results" class="cp-results"></div>
    </div>`;
}

/**
 * 挂载命令面板，返回解绑函数。
 *
 * @param {{
 *   document?:Document, bus?:object, getQuotes?:Function, getSynthetics?:Function,
 *   getPreferences?:Function, onPatch?:Function, onAction?:Function,
 *   onNavigate?:Function,
 * }} opts
 */
/** 同一 document 只挂一份：重复 import / 热重载 / 测试里重复 mount 都不叠监听 */
const MOUNTED_DOCS = new WeakSet();

export function mountCommandPalette(opts = {}) {
  const doc = opts.document ?? (typeof document === 'undefined' ? null : document);
  if (!doc) return () => {};
  // 生产里 main.js 只调一次；测试会为每个用例重新 mount，这里先把上一份解绑，
  // 否则 document 上的 keydown 监听会累积，前一个面板拦掉后一个的快捷键。
  if (MOUNTED_DOCS.has(doc)) {
    const prev = doc.__twCommandPaletteOff;
    if (typeof prev === 'function') prev();
  }
  const getQuotes = opts.getQuotes ?? (() => []);
  const getSynthetics = opts.getSynthetics ?? (() => []);
  const getPreferences = opts.getPreferences ?? (() => ({}));

  let host = null;
  let items = [];
  let active = 0;

  const model = () => filterCommandItems(currentQuery(), {
    quotes: getQuotes(), synthetics: getSynthetics(), preferences: getPreferences(),
  });
  const currentQuery = () => doc.getElementById('cmd-palette-input')?.value ?? '';

  function paint() {
    items = model();
    if (active >= items.length) active = 0;
    const box = doc.getElementById('cmd-palette-results');
    if (box) box.innerHTML = commandResultsHTML(items, active);
  }

  function close() {
    host?.remove();
    host = null;
    items = [];
    active = 0;
  }

  function open() {
    if (host) { doc.getElementById('cmd-palette-input')?.focus(); return; }
    host = doc.createElement('div');
    host.id = CMD_PALETTE_MODAL_ID;
    host.className = 'cp-host';
    doc.body?.appendChild?.(host);
    host.innerHTML = commandPaletteHTML();
    active = 0;
    paint();
    doc.getElementById('cmd-palette-input')?.focus();
  }

  /** 执行一条命令：视图项改 hash，动作项发 patch 或交给 handler */
  function run(index) {
    const item = items[index];
    if (!item) return;
    close();
    if (item.hash != null) {
      if (opts.onNavigate) opts.onNavigate(item.hash);
      else if (typeof location !== 'undefined') location.hash = item.hash || '#';
      return;
    }
    if (item.patch) opts.onPatch?.(item.patch);
    if (item.action) opts.onAction?.(item.action);
  }

  const onInput = () => { active = 0; paint(); };
  const onClick = (e) => {
    if (e.target?.closest?.('[data-cp-dismiss]')) return close();
    const btn = doc.getElementById(CMD_PALETTE_BTN_ID);
    if (btn && e.target?.closest?.(`#${CMD_PALETTE_BTN_ID}`)) return open();
    const opt = e.target?.closest?.('[data-cmd-index]');
    if (opt && host?.contains(opt)) {
      e.preventDefault();
      run(Number(opt.getAttribute('data-cmd-index')));
    }
  };
  const onKey = (e) => {
    // 打开快捷键：Cmd/Ctrl+K（在输入框里也生效，方便连续唤起）
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      host ? close() : open();
      return;
    }
    if (!host) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); run(active); }
  };

  doc.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('input', onInput);
  MOUNTED_DOCS.add(doc);
  // 存解绑函数，供下一次 mount 先清场（WeakSet 只记「挂过」，不持有函数）
  doc.__twCommandPaletteOff = () => {
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('input', onInput);
    close();
  };
  return () => {
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('input', onInput);
    if (doc.__twCommandPaletteOff) delete doc.__twCommandPaletteOff;
    MOUNTED_DOCS.delete(doc);
    close();
  };
}
