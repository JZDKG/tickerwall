/* ================================================================== *
 * 本地存储：自选列表 + 上一次行情快照
 *
 * 行情快照的存在意义不是「离线可用」，而是**首屏不要空一屏**：
 * 冷启动到云函数返回通常 300ms~3s（冷启动更久），先把上次的数据画出来，
 * 再原地替换 —— 体感差别很大，而代价只有几十 KB 存储。
 * ================================================================== */

const KEY_WATCH = 'tw_watch_v1';
const KEY_QUOTES = 'tw_quotes_v1';

/** 默认自选：一眼能看全宏观定价锚的四项 */
const DEFAULT_WATCH = ['gold-intl', 'btc', 'sh000001', 'dxy'];

function getWatch() {
  try {
    const v = wx.getStorageSync(KEY_WATCH);
    if (Array.isArray(v)) return v;
  } catch (e) {
    /* 读失败就当没有，用默认值 */
  }
  return DEFAULT_WATCH.slice();
}

function setWatch(list) {
  const clean = Array.from(new Set((list || []).filter(Boolean)));
  try {
    wx.setStorageSync(KEY_WATCH, clean);
  } catch (e) {
    /* 存储满了也不该让页面挂 */
  }
  return clean;
}

function isWatched(id) {
  return getWatch().indexOf(id) >= 0;
}

/** 返回是否「加入」（true）或「移除」（false） */
function toggleWatch(id) {
  const list = getWatch();
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
  else list.push(id);
  setWatch(list);
  return at < 0;
}

function saveQuotes(data) {
  if (!data || !Array.isArray(data.items)) return;
  try {
    // 只存渲染需要的字段，历史点压到 32 个，控制体积
    const slim = {
      generatedAt: data.generatedAt,
      items: data.items.map((i) => ({
        id: i.id,
        name: i.name,
        sub: i.sub,
        unit: i.unit,
        decimals: i.decimals,
        cat: i.cat,
        ok: i.ok,
        price: i.price,
        prevClose: i.prevClose,
        change: i.change,
        changePct: i.changePct,
        high: i.high,
        low: i.low,
        open: i.open,
        sessionTime: i.sessionTime,
        marketStatus: i.marketStatus,
        freshness: i.freshness,
        source: i.source,
        stale: i.stale,
        error: i.error,
        extras: i.extras || [],
        history: pickEvery(i.history || [], 32),
      })),
    };
    wx.setStorageSync(KEY_QUOTES, slim);
  } catch (e) {
    /* ignore */
  }
}

function pickEvery(list, n) {
  if (list.length <= n) return list;
  const out = [];
  const step = (list.length - 1) / (n - 1);
  for (let i = 0; i < n; i += 1) out.push(list[Math.round(i * step)]);
  return out;
}

function loadQuotes() {
  try {
    const v = wx.getStorageSync(KEY_QUOTES);
    if (v && Array.isArray(v.items) && v.items.length) return v;
  } catch (e) {
    /* ignore */
  }
  return null;
}

module.exports = {
  getWatch,
  setWatch,
  isWatched,
  toggleWatch,
  saveQuotes,
  loadQuotes,
  DEFAULT_WATCH,
};
