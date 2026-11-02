/* ================================================================== *
 * 行情（首页）
 *
 * 与 web 端首屏一一对应：23 个标的、方向色条、涨跌药丸、迷你走势、
 * 高低/来源/新鲜度。区别只在导航形态：web 是顶栏 + 任务分组，
 * 手机上一个横向筛选条就够了（全部 / 核心 / 商品 / 股指 / 外汇 / 加密）。
 *
 * 刷新节奏跟 web 一致（15s 轮询）。首屏先用本地快照渲染，再原地替换 ——
 * 冷启动时白屏 1~3 秒是最容易被感知的「慢」。
 * ================================================================== */

const api = require('../../utils/api');
const store = require('../../utils/store');
const sync = require('../../utils/sync');
const config = require('../../config');
const { clockText, dirOf } = require('../../utils/format');

/**
 * 降级原因说人话。
 * 三级通道全挂时页面会标「演示数据」，但用户看到这四个字并不知道该修哪里 ——
 * 云环境没绑 AppID 和「本机服务没开」是两种完全不同的处理，所以写清楚。
 */
function whyMock(err) {
  const s = String(err || '');
  if (/Environment not found|-501000/i.test(s)) return '云环境未绑定该 AppID';
  if (/cloud\.callFunction|cloud init/i.test(s)) return '云函数调用失败';
  if (/request:fail|timeout|-102/i.test(s)) return '本机服务未启动';
  return s ? s.slice(0, 26) : '';
}

const FILTERS = [
  { key: 'all', label: '全部' },  { key: 'core', label: '核心' },
  { key: 'commodity', label: '商品' },
  { key: 'index', label: '股指' },
  { key: 'fx', label: '外汇' },
  { key: 'crypto', label: '加密' },
];

/** 分类 key → 命中规则（cat 由服务端给，core 是服务端标记） */
const MATCH = {
  all: () => true,
  core: (it) => it.core !== false && CORE_IDS.indexOf(it.id) >= 0,
  commodity: (it) => it.cat === '商品',
  index: (it) => it.cat === '股指',
  fx: (it) => it.cat === '外汇',
  crypto: (it) => it.cat === '加密',
};

/** 与 web 端前 11 项一致：核心跨资产 */
const CORE_IDS = [
  'gold-cn', 'gold-intl', 'oil', 'sp500', 'ndx100', 'sh000001',
  'vix', 'dxy', 'us10y', 'usdcny', 'btc',
];

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    filters: FILTERS.map((f) => ({ ...f, count: 0 })),
    filter: 'all',
    items: [],
    updatedText: '连接中…',
    summary: { up: 0, down: 0, flat: 0, total: 0, upPct: 0, flatPct: 0, downPct: 0 },
    loading: true,
    demo: false,
    demoReason: '',
    mode: '',
    error: '',
    refreshing: false,
    // 页脚文案走云端配置，改文案不用重新发版（读不到就用内置的兜底）
    footerNote: '数据源：新浪财经 · 东方财富 · 腾讯行情 · CBOE',
    disclaimer: '非交易时段显示最近成交/收盘价；带「演示数据」标记时不可用于交易决策',
  },

  onLoad() {
    const app = getApp();
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
    });
    this._all = [];

    // 先画上次的快照，避免白屏
    const cached = store.loadQuotes();
    if (cached) {
      this._all = cached.items.map((it) => ({ ...it, core: CORE_IDS.indexOf(it.id) >= 0 }));
      this.applyItems();
      this.setData({
        loading: false,
        updatedText: `更新于 ${clockText(cached.generatedAt)} · 缓存`,
      });
    }
    this.loadRemoteConfig();
  },

  /**
   * 远程配置：公共只读的文案（数据源说明 / 免责声明）。
   * 读不到就保持内置文案 —— 这是纯展示内容，不该因为它失败而弹错误。
   */
  async loadRemoteConfig() {
    const cfg = await sync.loadRemoteConfig();
    if (!cfg) return;
    const patch = {};
    if (cfg['market.footer_note']) patch.footerNote = cfg['market.footer_note'];
    if (cfg['market.disclaimer']) patch.disclaimer = cfg['market.disclaimer'];
    if (Object.keys(patch).length) this.setData(patch);
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.startPoll();
    const age = Date.now() - (this._fetchedAt || 0);
    if (!this._fetchedAt || age > config.staleOnResumeMs) this.refresh();
  },

  onHide() {
    this.stopPoll();
  },

  onUnload() {
    this.stopPoll();
  },

  onPullDownRefresh() {
    this.refresh(true).finally(() => wx.stopPullDownRefresh());
  },

  startPoll() {
    this.stopPoll();
    this._timer = setInterval(() => this.refresh(), config.pollMs);
  },

  stopPoll() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  /** 拉一次行情；quiet=true 时不显示 loading（轮询用） */
  async refresh(manual) {
    if (this._busy) return;
    this._busy = true;
    if (manual) this.setData({ refreshing: true });
    try {
      const { data, mode, error: modeErr } = await api.call('quotes');
      this._all = (data.items || []).map((it) => ({ ...it, core: CORE_IDS.indexOf(it.id) >= 0 }));
      this._fetchedAt = Date.now();
      store.saveQuotes(data);
      getApp().globalData.quotes = data;
      getApp().globalData.mode = mode;
      this.applyItems();

      const failed = this._all.filter((i) => i.ok === false).length;
      const stamp = clockText(data.generatedAt || Date.now());
      this.setData({
        loading: false,
        error: '',
        mode,
        demo: mode === 'mock' || !!data.demo,
        demoReason: mode === 'mock' ? whyMock(modeErr) : '',
        updatedText: failed ? `更新于 ${stamp} · ${failed} 项异常` : `更新于 ${stamp}`,
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: String((err && err.message) || '取数失败'),
      });
    } finally {
      this._busy = false;
      this.setData({ refreshing: false });
    }
  },

  /** 过滤 + 汇总，一次算完再 setData（避免 WXML 里做逻辑） */
  applyItems() {
    const key = this.data.filter;
    const match = MATCH[key] || MATCH.all;
    const visible = this._all.filter(match);

    const counts = { all: 0, core: 0, commodity: 0, index: 0, fx: 0, crypto: 0 };
    for (const it of this._all) {
      for (const k of Object.keys(MATCH)) {
        if (MATCH[k](it)) counts[k] += 1;
      }
    }

    let up = 0;
    let down = 0;
    let flat = 0;
    for (const it of this._all) {
      if (!Number.isFinite(it.changePct)) continue;
      const d = dirOf(it.changePct);
      if (d === 'up') up += 1;
      else if (d === 'down') down += 1;
      else flat += 1;
    }
    const total = up + down + flat || 1;

    this.setData({
      items: visible,
      filter: key,
      filters: this.data.filters.map((f) => ({ ...f, count: counts[f.key] || 0 })),
      summary: {
        up,
        down,
        flat,
        total: up + down + flat,
        upPct: Math.round((up / total) * 1000) / 10,
        flatPct: Math.round((flat / total) * 1000) / 10,
        downPct: Math.round((down / total) * 1000) / 10,
      },
    });
  },

  onFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.filter) return;
    this.setData({ filter: key }, () => this.applyItems());
  },

  onOpen(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` });
  },

  onRecap() {
    wx.navigateTo({ url: '/pages/recap/recap' });
  },

  onRefreshTap() {
    api.resetChannels();
    this.refresh(true);
  },

  onRetry() {
    api.resetChannels();
    this.setData({ error: '', loading: true });
    this.refresh(true);
  },
});
