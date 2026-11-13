/* ================================================================== *
 * 工作台控制条（P2-T2）
 *
 * 四组开关：视图密度 / 涨跌时间基准 / 红绿配色 / 主题。渲染用 html`` 自动
 * 转义，事件用委托绑在容器上（容器会被列表重绘复用，逐按钮 addEventListener
 * 会叠起来）。每次变更统一走 workspace.setState，CSS 变量由 dataset 切换。
 * ================================================================== */

import { html, SafeHtml } from '../shared/format.js';
import { getWorkspaceStore } from '../shared/workspace-store.js';

const GROUPS = [
  {
    key: 'density', attr: 'density', label: '视图',
    options: [
      ['wall', '磁贴墙'], ['grouped', '分组列表'], ['flat', '全部平铺'],
    ],
  },
  {
    key: 'anchorClock', attr: 'anchor', label: '涨跌基准',
    options: [
      ['default', '日常涨跌'], ['ashare_close', 'A股收盘'], ['intraday_open', '自今日起点'],
    ],
  },
  {
    key: 'colorScheme', attr: 'scheme', label: '配色',
    options: [
      ['cn', '红涨绿跌'], ['intl', '绿涨红跌'], ['cb', '色盲友好'],
    ],
  },
  {
    key: 'theme', attr: 'theme', label: '主题',
    options: [
      ['dark', '深色'], ['oled', 'OLED'], ['light', '浅色'],
    ],
  },
];

/**
 * 按组生成一段已转义的按钮 HTML。data-ws-* 的属性名固定，值都来自上面的常量表，
 * 不需要 raw() 绕过转义 —— 这正是 html`` 默认就该赢的场景。
 */
function groupButtons(g, prefs) {
  const on = (v) => (prefs[g.key] === v ? 'true' : 'false');
  const htmlOf = {
    density: (v, label) => html`<button type="button" data-ws-density="${v}" aria-pressed="${on(v)}" title="视图：${label}">${label}</button>`,
    anchor: (v, label) => html`<button type="button" data-ws-anchor="${v}" aria-pressed="${on(v)}" title="涨跌基准：${label}">${label}</button>`,
    scheme: (v, label) => html`<button type="button" data-ws-scheme="${v}" aria-pressed="${on(v)}" title="配色：${label}">${label}</button>`,
    theme: (v, label) => html`<button type="button" data-ws-theme="${v}" aria-pressed="${on(v)}" title="主题：${label}">${label}</button>`,
  }[g.attr];
  return new SafeHtml(g.options.map(([v, label]) => htmlOf(v, label).toString()).join(''));
}

function labelOf(group, value) {
  return group.options.find(([v]) => v === value)?.[1] ?? '';
}

function renderGroup(group, prefs) {
  return html`<div class="ws-group" data-ws-group="${group.attr}">
    <span class="ws-label">${group.label}</span>
    <div class="ws-seg">${groupButtons(group, prefs)}</div>
  </div>`;
}

function sessionGroupHTML(sessionFilter = 'all', counts = null) {
  const countLabel = (key) => (counts && Number.isFinite(counts[key]) ? ` (${counts[key]})` : '');
  const btn = (val, label) =>
    html`<button type="button" data-ws-session="${val}" aria-pressed="${sessionFilter === val ? 'true' : 'false'}" title="交易状态筛选：${label}">${label}${countLabel(val)}</button>`;
  return html`<div class="ws-group" role="group" aria-label="交易状态筛选" data-ws-group="session">
    <span class="ws-label">状态</span>
    <div class="ws-seg">
      ${btn('all', '全部')}
      ${btn('open', '交易中')}
      ${btn('closed', '已收盘')}
    </div>
  </div>`;
}

/** 生成工作台控制条的 HTML；暴露核心「视图」与「交易状态筛选」，次级偏好收敛在展开面板中（渐进披露）。 */
export function workspaceBarHTML(prefs, { sessionFilter = 'all', counts = null } = {}) {
  const densityGroup = GROUPS[0];
  const secondaryGroups = GROUPS.slice(1);
  const summaryText = secondaryGroups.map((g) => labelOf(g, prefs[g.key])).filter(Boolean).join(' · ');
  return html`<div class="ws-bar" role="toolbar" focusgroup="toolbar wrap" aria-label="工作台控制条">
    ${renderGroup(densityGroup, prefs)}
    ${sessionGroupHTML(sessionFilter, counts)}
    <details class="ws-prefs-disclosure">
      <summary class="ws-prefs-trigger">显示设置${summaryText ? html`<span class="ws-prefs-summary">${summaryText}</span>` : ''}</summary>
      <div class="ws-prefs-body">
        ${secondaryGroups.map((g) => renderGroup(g, prefs))}
        <div class="ws-group ws-desktop">
          <button type="button" data-action="toggle-pip" title="切换画中画盯盘（桌面端置顶）">画中画</button>
        </div>
      </div>
    </details>
  </div>`;
}

export function mountWorkspaceBar(host, { workspace = getWorkspaceStore(), onChange, getSessionState, onSessionFilter } = {}) {
  if (!host) return () => {};
  const sessionOpts = () => (typeof getSessionState === 'function' ? getSessionState() : {});
  host.innerHTML = workspaceBarHTML(workspace.getState(), sessionOpts()).toString();

  const onClick = (e) => {
    const sessBtn = e.target?.closest?.('button[data-ws-session]');
    if (sessBtn && host.contains(sessBtn)) {
      const nextMode = sessBtn.getAttribute('data-ws-session');
      if (nextMode === 'all' || nextMode === 'open' || nextMode === 'closed') {
        host.querySelectorAll('button[data-ws-session]').forEach((b) => {
          b.setAttribute('aria-pressed', b === sessBtn ? 'true' : 'false');
        });
        if (onSessionFilter) onSessionFilter(nextMode);
      }
      return;
    }

    const btn = e.target?.closest?.('button[data-ws-density],button[data-ws-anchor],button[data-ws-scheme],button[data-ws-theme]');
    if (!btn || !host.contains(btn)) return;
    let patch = null;
    for (const g of GROUPS) {
      const v = btn.getAttribute(`data-ws-${g.attr}`);
      if (v != null) { patch = { [g.key]: v }; break; }
    }
    if (!patch) return;
    // 非法值被 normalize 过滤时 setState 不 publish，订阅自然不会误触发重绘回调
    workspace.setState(patch);
  };

  const unsubscribe = workspace.subscribe((next) => {
    const wasOpen = Boolean(host.querySelector('.ws-prefs-disclosure')?.open);
    host.innerHTML = workspaceBarHTML(next, sessionOpts()).toString();
    const details = host.querySelector('.ws-prefs-disclosure');
    if (details && wasOpen) details.open = true;
    if (onChange) onChange(next);
  });

  host.addEventListener('click', onClick);
  return () => {
    host.removeEventListener('click', onClick);
    unsubscribe();
  };
}
