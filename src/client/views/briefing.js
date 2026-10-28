/* ================================================================== *
 * briefing.js —— 隔夜复盘浮层。
 *
 * 来源：public/app.js（原 3655 行单体）L3568-3655，整段搬运，逻辑未改写。
 * ================================================================== */
import { esc, fmtPrice, html } from '../shared/format.js';


/* ------------------------------------------------------------------ *
 * 隔夜复盘浮层
 *
 * A股 15:00 收盘后，美股/美债/美元/黄金/原油还在走。第二天开盘前
 * 最想知道「昨晚这些各走了多少」。数据来自服务端自己落的快照差分，
 * 不依赖外部源，所以不会因为限流而失效；样本不足时如实说「还在积累」。
 * ------------------------------------------------------------------ */
export const briefingBtn = document.getElementById('briefing-btn');
export let briefingOpen = false;

export function closeBriefing() {
  briefingOpen = false;
  document.getElementById('briefing-panel')?.remove();
  briefingBtn?.classList.remove('on');
}

export function briefingRows(items) {
  if (!items.length) return html`<p class="briefing-empty">还没有足够的快照样本。</p>`;
  const rows = items.map((it) => {
    const dir = it.movePct > 0 ? 'up' : it.movePct < 0 ? 'down' : 'flat';
    return html`<div class="briefing-row">
        <span class="briefing-name">${it.name}</span>
        <span class="briefing-px">${fmtPrice(it.to, 2)}</span>
        <span class="briefing-move ${dir}">${it.movePct >= 0 ? '+' : ''}${it.movePct.toFixed(2)}%</span>
      </div>`;
  });
  return html`<div class="briefing-list">${rows}</div>`;
}

export async function openBriefing() {
  if (briefingOpen) return closeBriefing();
  briefingOpen = true;
  briefingBtn?.classList.add('on');
  const panel = document.createElement('div');
  panel.id = 'briefing-panel';
  panel.className = 'briefing-panel';
  panel.innerHTML = html`<div class="briefing-head"><h3>隔夜复盘</h3><p class="briefing-sub">载入中…</p></div>`.toString();
  document.body.appendChild(panel);

  try {
    const res = await fetch('./api/briefing', { cache: 'no-store' });
    const data = await res.json();
    if (!briefingOpen) return;
    // 快照时间是 ISO/UTC，直接切片会显示成 UTC 钟点，要转成本机时间
    const hhmm = (iso) => {
      const dt = new Date(iso);
      return Number.isNaN(dt.getTime())
        ? '—'
        : `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    };
    const dayLabel = (iso) => {
      const dt = new Date(iso);
      return Number.isNaN(dt.getTime()) ? '—' : `${dt.getMonth() + 1}/${dt.getDate()}`;
    };
    const sub =
      data.status === 'collecting'
        ? `快照样本不足（${data.samples ?? 0} 条），服务端每 5 分钟落一版，跨日后即可复盘`
        : data.status === 'intraday'
          ? `今日开盘以来 · 基准 ${hhmm(data.baselineAt)}`
          : `隔夜 · 距 ${data.cutLabel ?? '15:00'}（${dayLabel(data.baselineAt)} ${hhmm(data.baselineAt)}）→ ${hhmm(data.latestAt)}`;
    panel.innerHTML = html`
      <div class="briefing-head">
        <div>
          <h3>隔夜复盘</h3>
          <p class="briefing-sub">${sub}</p>
        </div>
        <button type="button" class="briefing-close" aria-label="关闭">×</button>
      </div>
      ${briefingRows(data.items ?? [])}
      <p class="briefing-foot">按变动幅度排序 · 数据来自本机快照</p>`.toString();
    panel.querySelector('.briefing-close')?.addEventListener('click', closeBriefing);
  } catch (err) {
    if (briefingOpen) {
      panel.innerHTML = html`<div class="briefing-head"><h3>隔夜复盘</h3></div>
        <p class="briefing-empty">读取失败：${err?.message ?? String(err)}</p>`.toString();
    }
  }
}

briefingBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  openBriefing();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && briefingOpen) closeBriefing();
});
