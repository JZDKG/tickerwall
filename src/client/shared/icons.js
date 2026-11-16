/* ================================================================== *
 * icons.js —— 全站统一内联线性 SVG 图标库（1.5px 描边，24x24 视图框）。
 *
 * 替代散落各视图的 Emoji 符号（⚡ / ★ / 💡 / 🌐 / 🧭 等），
 * 保持专业数据终端的克制一致质感；零外部依赖，离线可用。
 * ================================================================== */

import { SafeHtml, esc } from './format.js';

export const ICON_PATHS = Object.freeze({
  star: '<polygon points="12 2.5 14.9 8.4 21.4 9.3 16.7 13.9 17.8 20.4 12 17.3 6.2 20.4 7.3 13.9 2.6 9.3 9.1 8.4 12 2.5"/>',
  'star-filled':
    '<polygon points="12 2.5 14.9 8.4 21.4 9.3 16.7 13.9 17.8 20.4 12 17.3 6.2 20.4 7.3 13.9 2.6 9.3 9.1 8.4 12 2.5" fill="currentColor"/>',
  bolt: '<path d="M13 2 4.5 13.5h6L9 22l9.5-11.5h-6L13 2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><ellipse cx="12" cy="12" rx="4" ry="9"/>',
  flame: '<path d="M12 2.5c.3 3.4-4 5.4-4 9.2a4.5 4.5 0 0 0 9 0c0-2.3-1.2-4.2-2.2-5.5-.4 1.3-1.3 2.1-1.9 2.1-.2-1.8-.3-3.7-.9-5.8z"/>',
  landmark: '<path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18M12 3l9 5H3l9-5z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><polygon points="15.5 8.5 13.7 13.7 8.5 15.5 10.3 10.3 15.5 8.5"/>',
  flag: '<path d="M5 21V4m0 1h12l-2 4 2 4H5"/>',
  coins: '<ellipse cx="10" cy="8" rx="6" ry="2.5"/><path d="M4 8v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V8M8 14.5V18c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4c0-1.1-1.7-2-4-2.3"/>',
  network:
    '<circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="m7 10.8 3-3.4M7 13.2l3 3.4M14 7.4l3 3.4M14 16.6l3-3.4"/>',
  'play-step': '<polygon points="6 5 15 12 6 19 6 5"/><path d="M18 5v14"/>',
  'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5m6-6-6 6 6 6"/>',
  maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.8c.7.6 1 1.4 1.1 2.2h4.8c.1-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  circle: '<circle cx="12" cy="12" r="5"/>',
  alert: '<path d="M12 3.5 21 19.5H3L12 3.5zM12 10v4M12 16.8h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
});

/**
 * 返回内联 SVG 字符串，供字符串拼接型视图模板使用。
 * @param {string} name ICON_PATHS 中的图标名
 * @param {number} [size=14] 边长（px）
 * @param {string} [className] 附加 CSS 类名
 * @returns {string}
 */
export function iconStr(name, size = 14, className = '') {
  const body = ICON_PATHS[name];
  if (!body) return '';
  const px = Number.isFinite(size) && size > 0 ? Math.round(size) : 14;
  const cls = className ? `ui-ico ${esc(className)}` : 'ui-ico';
  return `<svg class="${cls}" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/**
 * 返回 SafeHtml 包装后的内联 SVG，供 `html\`...\`` 标签模板安全嵌入。
 * @param {string} name
 * @param {number} [size=14]
 * @param {string} [className]
 * @returns {SafeHtml}
 */
export function iconHtml(name, size = 14, className = '') {
  return new SafeHtml(iconStr(name, size, className));
}
