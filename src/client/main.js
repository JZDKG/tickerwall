/* ================================================================== *
 * main.js —— 启动与首屏轮询：拉报价、渲染、倒计时、刷新按钮、快捷键。
 *
 * 来源：public/app.js（原 3655 行单体）L3501-3567，整段搬运，逻辑未改写。
 * ================================================================== */
import { route } from './router.js';
import { countdownEl, refreshBtn, updatedEl } from './shared/dom.js';
import { store } from './shared/store.js';
import { api } from './shared/api.js';
import { attachGlossary } from './shared/glossary.js';
import { apply, renderSkeleton } from './views/list.js';
import { questionsEl } from './shared/dom.js';
import { loadQuestionCards, questionCardsHTML, selectQuestionAssets } from './views/explanations/questions.js';
// Phase 2 拆分时漏了这一行：briefing.js 顶层挂了「隔夜复盘」按钮的点击监听，
// 没人 import 它，那段代码在浏览器里从来没执行过 —— 按钮点了没反应。
// 副作用式导入，不需要任何导出。
import './views/briefing.js';
import { refreshHomeBrief } from './views/home-brief-wiring.js';
import { applyNavActive } from './nav.js';
import { bus } from './shared/bus.js';
import { createRealtime } from './shared/realtime.js';
import { getWorkspaceStore } from './shared/workspace-store.js';
import { mountDesktopBridge, togglePipMode } from './shared/desktop-bridge.js';
import { mountAlertBanner } from './shared/alert-banner.js';
import { mountShareCard } from './shared/share-card-ui.js';

/** 首页问题优先区（产品 2.3 + 2.4）：容器不存在时整段跳过 */
const homeBriefEl = document.getElementById('home-brief');
export let homeBriefTimer = null;

/**
 * 拉一次「问题优先区」。失败不抛出：这一块是加分项，不能让它挡住行情列表。
 * 关注项与 lastSeen 都在本地，所以每次都要重新读一遍（用户可能刚改过）。
 */
export async function refreshHomeBriefSafe(fetchJson = null) {
  if (!homeBriefEl) return null;
  try {
    return await refreshHomeBrief({ host: homeBriefEl, storage: window.localStorage, fetchJson });
  } catch {
    return null;
  }
}

/** 选择后立刻重拉，并停掉这一轮的定时器避免与主循环打架 */
export function scheduleHomeBrief(delay = 300_000) {
  clearTimeout(homeBriefTimer);
  if (!homeBriefEl) return;
  homeBriefTimer = setTimeout(() => { void refreshHomeBriefSafe(); }, delay);
}


/* ------------------------------ 取数 / 循环 ------------------------------ */

export let timer = null;

/**
 * Phase 1 / P1-T3：SSE 优先。OPEN 时轮询降到 60s 兜底，断开自动回 15s。
 * 声明在 scheduleNext 之前：那个函数每轮都要读当前节奏。
 */
export const realtime = createRealtime({ store, bus });

export function scheduleNext(delay) {
  clearTimeout(timer);
  // SSE 在线时低频兜底；显式 delay 仍优先（首屏强制刷新等场景）
  const wait = delay ?? (realtime.isOpen() ? realtime.pollIntervalMs() : store.ttl + 1000);
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

/* ------------------------------------------------------------------ *
 * 首页问题卡
 *
 * 只读解释快照，不触发上游或模型调用；失败就不显示，行情列表不受影响。
 * 阅读期间不自动重排：每轮只在「有新结果且卡还没被读过」时替换一次。
 * ------------------------------------------------------------------ */
let questionsAt = 0;
export const QUESTIONS_TTL_MS = 120_000;

export async function refreshQuestions({ force = false } = {}) {
  if (!questionsEl) return;
  if (!force && Date.now() - questionsAt < QUESTIONS_TTL_MS) return;
  questionsAt = Date.now();
  try {
    // Phase 1 / P1-T4：不再写死 4 个品种，按当日 σ 显著性动态挑异动最大的
    // 4~6 个可解释品种，再交给问题卡生成「今日最值得搞清楚的 3 件事」。
    const assets = selectQuestionAssets(store.quotes ?? [], { max: 5 });
    const cards = await loadQuestionCards({ assets, max: 3 });
    if (!cards.length) {
      questionsEl.hidden = true;
      questionsEl.innerHTML = '';
      return;
    }
    questionsEl.innerHTML = questionCardsHTML(cards);
    questionsEl.hidden = false;
  } catch {
    // 解释取不到不该影响行情首屏：静默隐藏问题区
    questionsEl.hidden = true;
  }
}

export async function loadQuotes(force = false) {
  if (store.loading) return;
  store.loading = true;
  refreshBtn.disabled = true;
  paintCountdown();
  try {
    // 共享请求层：行情是首屏第一枪，超时/取消/去重都在这里生效
    const { data } = await api.get('api/quotes', { params: force ? { force: 1 } : null });
    apply(data);
    // 行情先落地，再异步补问题卡（慢也不挡首屏）
    void refreshQuestions();
  } catch (err) {
    updatedEl.textContent = `连接失败：${err?.message ?? err}`;
  } finally {
    store.loading = false;
    refreshBtn.disabled = false;
    scheduleNext();
    paintCountdown();
  }
}

/**
 * 原位术语（产品 2.5）：绑一次委托监听。
 *
 * 绑在 document 上而不是各视图里：术语会随卡片、指标、图表重渲染反复重建，
 * 逐个绑定既低效，重建后还会失效（点了没反应）。
 */
attachGlossary(document);

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

// SSE 连接：支持 EventSource 时接管实时推送，轮询自动降频为兜底
realtime.connect();

// P3-T1：桌面桥接。Web 端只是把菜单栏报价写进 document.title；
// Tauri 下额外推给系统托盘。PiP 按钮走事件委托，控制条重绘后依然有效。
mountDesktopBridge({ bus });
// P3-T2：SSE alert 帧 → 顶部横幅 + 已授权时的系统通知
mountAlertBanner({ bus });
// P3-T3：解释卡 / 隔夜复盘里的「生成分享卡」按钮（事件委托，重绘不失效）
mountShareCard();
document.addEventListener('click', (e) => {
  if (e.target?.closest?.('[data-action="toggle-pip"]')) {
    togglePipMode(document.documentElement);
  }
});

// P2-T1：先恢复工作台偏好（dataset 决定 CSS 变量），再画骨架 —— 否则首屏
// 会闪一帧默认深色/红涨绿跌，浅色与 OLED 用户看到的是跳变。
getWorkspaceStore();
renderSkeleton();
// 每次打开页面都强制向数据源拉一次最新值，而不是命中服务端缓存
loadQuotes(true);
/**
 * 问题优先区（产品 2.3 / 2.4 / 2.6）：启动时拉一次，之后按 5 分钟刷新。
 *
 * 这一句之前漏了 —— 两个函数写好了、也有测试，但**没有任何人调用**，
 * 结果 #home-brief 永远是 hidden。真实浏览器自检才照出来。
 */
void refreshHomeBriefSafe();
scheduleHomeBrief();
route();
