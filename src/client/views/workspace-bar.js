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
      ['grouped', '分组列表'], ['wall', '磁贴墙'], ['flat', '全部平铺'],
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
  const attr = `data-ws-${g.attr}`;
  const on = (v) => (prefs[g.key] === v ? 'true' : 'false');
  const htmlOf = {
    density: (v, label) => html`<button type="button" data-ws-density="${v}" aria-pressed="${on(v)}" title="视图：${label}">${label}</button>`,
    anchor: (v, label) => html`<button type="button" data-ws-anchor="${v}" aria-pressed="${on(v)}" title="涨跌基准：${label}">${label}</button>`,
    scheme: (v, label) => html`<button type="button" data-ws-scheme="${v}" aria-pressed="${on(v)}" title="配色：${label}">${label}</button>`,
    theme: (v, label) => html`<button type="button" data-ws-theme="${v}" aria-pressed="${on(v)}" title="主题：${label}">${label}</button>`,
  }[g.attr];
  return new SafeHtml(g.options.map(([v, label]) => htmlOf(v, label).toString()).join(''));
}

export function workspaceBarHTML(prefs) {
  return html`<div class="ws-bar" role="toolbar" aria-label="工作台控制条">
    ${GROUPS.map((g) => html`<div class="ws-group" data-ws-group="${g.attr}">
      <span class="ws-label">${g.label}</span>
      <div class="ws-seg">${groupButtons(g, prefs)}</div>
    </div>`)}
    <div class="ws-group ws-desktop">
      <button type="button" data-action="toggle-pip" title="切换画中画盯盘（桌面端置顶）">画中画</button>
    </div>
  </div>`;
}

/**
 * 挂载控制条。host 是常驻容器；onChange 供列表重绘（默认重画控制条自身）。
 * 返回解绑函数。
 *
 * 变更统一走 workspace.setState：控制条内的点击只写 store，重绘与 onChange
 * 全交给下面的订阅，避免「点击直接调一次 + 订阅又调一次」的重复回调。
 * Cmd+K 命令面板等外部入口同样直接 setState，订阅让控制条和列表密度/行内
 * 标注即时跟上，而不只认控制条自己的点击。
 */
export function mountWorkspaceBar(host, { workspace = getWorkspaceStore(), onChange } = {}) {
  if (!host) return () => {};
  host.innerHTML = workspaceBarHTML(workspace.getState()).toString();

  const onClick = (e) => {
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
    host.innerHTML = workspaceBarHTML(next).toString();
    if (onChange) onChange(next);
  });

  host.addEventListener('click', onClick);
  return () => {
    host.removeEventListener('click', onClick);
    unsubscribe();
  };
}
