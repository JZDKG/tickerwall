/* ================================================================== *
 * main.js —— 启动与首屏轮询：拉报价、渲染、倒计时、刷新按钮、快捷键。
 *
 * 来源：public/app.js（原 3655 行单体）L3501-3567，整段搬运，逻辑未改写。
 * ================================================================== */
import { route } from './router.js';
import { countdownEl, refreshBtn, updatedEl } from './shared/dom.js';
import { store } from './shared/store.js';
import { apply, renderSkeleton } from './views/list.js';


/* ------------------------------ 取数 / 循环 ------------------------------ */

export let timer = null;

export function scheduleNext(delay) {
  clearTimeout(timer);
  const wait = delay ?? store.ttl + 1000;
  store.nextAt = Date.now() + wait;
  timer = setTimeout(() => loadQuotes(false), wait);
}

export function paintCountdown() {
  if (store.loading) {
    countdownEl.textContent = '刷新中…';
    return;
  }
  const left = Math.max(0, Math.round((store.nextAt - Date.now()) / 1000));
  countdownEl.textContent = `${left}s 后刷新`;
}

export async function loadQuotes(force = false) {
  if (store.loading) return;
  store.loading = true;
  refreshBtn.disabled = true;
  paintCountdown();
  try {
    const res = await fetch(`./api/quotes${force ? '?force=1' : ''}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    apply(await res.json());
  } catch (err) {
    updatedEl.textContent = `连接失败：${err?.message ?? err}`;
  } finally {
    store.loading = false;
    refreshBtn.disabled = false;
    scheduleNext();
    paintCountdown();
  }
}

refreshBtn.addEventListener('click', () => loadQuotes(true));

document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    loadQuotes(true);
  }
});

// 标签页隐藏时停止轮询，回来立即拉一次
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(timer);
  } else {
    loadQuotes(false);
  }
});

setInterval(paintCountdown, 250);

renderSkeleton();
// 每次打开页面都强制向数据源拉一次最新值，而不是命中服务端缓存
loadQuotes(true);
route();
