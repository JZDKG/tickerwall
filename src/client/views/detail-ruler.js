/* ================================================================== *
 * 区间涨跌测算尺的 DOM 接线（P2-T5）
 *
 * 与 bindChartCrosshair 分开：那条只管悬停读数，这条管「点两点锁一段」。
 * 计算本身在 detail-chart-tools.js 的 measureRange（纯函数，单独单测）。
 * ================================================================== */

import { html } from '../shared/format.js';
import { measureRange } from './detail-chart-tools.js';

/** 屏幕 x → 最近的序列索引（与 bindChartCrosshair 的换算口径一致） */
function indexAt(svg, clientX, geom, n) {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !n) return null;
  const scale = rect.width / geom.width;
  const svgX = (clientX - rect.left) / scale;
  const ratio = (svgX - geom.padL) / Math.max(1, geom.innerW);
  const idx = Math.round(ratio * (n - 1));
  if (!Number.isFinite(idx)) return null;
  return Math.max(0, Math.min(n - 1, idx));
}

function fmtMeasure(m) {
  if (!m.ok) return html`<span class="measure-hint">点击图上两点锁定区间</span>`;
  const sign = m.change >= 0 ? '+' : '';
  const vol = m.annualizedVol == null ? '—' : `${m.annualizedVol.toFixed(1)}%`;
  return html`<span class="measure-range">区间 ${m.startDate} → ${m.endDate} · ${m.days == null ? '—' : m.days} 天</span>
    <span class="measure-change">${sign}${m.change.toFixed(2)}</span>
    <span class="measure-pct">${sign}${m.changePct.toFixed(2)}%</span>
    <span class="measure-vol">年化波动 ${vol}</span>`;
}

/**
 * 绑定主图的点击测算：第一次点起点，第二次点终点出读数，第三次重新起一段。
 * 返回清理函数。
 */
export function bindChartRangeRuler(host, payload) {
  const svg = host.querySelector('svg.chart-svg');
  const info = host.querySelector('#measure-info') ?? document.getElementById('measure-info');
  if (!svg || !info) return () => {};
  const geom = payload.geom;
  const n = payload.series.length;

  let startIdx = null;
  const clearShade = () => host.querySelectorAll('.measure-shade').forEach((el) => el.remove());

  const paint = (m) => {
    info.innerHTML = fmtMeasure(m).toString();
    clearShade();
    if (!m.ok) return;
    const x0 = geom.x(m.startIdx);
    const x1 = geom.x(m.endIdx);
    const scale = (svg.getBoundingClientRect().width || geom.width) / geom.width;
    const shade = document.createElement('div');
    shade.className = 'measure-shade';
    shade.style.left = `${Math.min(x0, x1) * scale}px`;
    shade.style.width = `${Math.abs(x1 - x0) * scale}px`;
    host.appendChild(shade);
  };

  const onClick = (e) => {
    const idx = indexAt(svg, e.clientX, geom, n);
    if (idx == null) return;
    if (startIdx == null || startIdx === idx) {
      startIdx = idx;
      paint({ ok: false });
      return;
    }
    paint(measureRange(payload.series, startIdx, idx));
    startIdx = null;
  };

  svg.addEventListener('click', onClick);
  return () => { svg.removeEventListener('click', onClick); clearShade(); };
}
