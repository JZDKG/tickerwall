/* ================================================================== *
 * 关联分析：机制库 + 当日观测
 *
 * 这一页最容易写成「今天为什么涨」的归因，从而变成编故事。所以严格按
 * web 端的设计：只陈述「一般机制」+「当日两端是否同向」，状态词用
 * 「当日一致 / 当日相反」，并且每条都摆出「什么会推翻它」。
 *
 * 数据由行情派生（utils/analysis.js），不再单独请求接口 —— 行情在，这页就在。
 * ================================================================== */

const api = require('../../utils/api');
const store = require('../../utils/store');
const { buildMacro } = require('../../utils/analysis');
const { clockText, fmtPct, fmtPrice } = require('../../utils/format');

Page({
  data: {
    items: [],
    counts: { consistent: 0, opposite: 0, untested: 0 },
    updatedText: '',
    loading: true,
    demo: false,
    error: '',
    expanded: {},
  },

  onLoad() {
    const cached = store.loadQuotes();
    if (cached) {
      this.render(cached.items);
      this.setData({ loading: false, updatedText: `依据 ${clockText(cached.generatedAt)} 的行情` });
    }
    this.load();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onPullDownRefresh() {
    api.resetChannels();
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  async load(force) {
    if (this._busy) return;
    this._busy = true;
    if (force && !this.data.items.length) this.setData({ loading: true });
    try {
      const { data, mode } = await api.call('quotes');
      this.render(data.items || []);
      this.setData({
        loading: false,
        error: '',
        demo: mode === 'mock' || !!data.demo,
        updatedText: `依据 ${clockText(data.generatedAt || Date.now())} 的行情`,
      });
    } catch (err) {
      this.setData({ loading: false, error: String((err && err.message) || '取数失败') });
    } finally {
      this._busy = false;
    }
  },

  render(quoteItems) {
    const { items, counts } = buildMacro(quoteItems);
    const view = items.map((m) => {
      const from = m.from;
      const to = m.to;
      return {
        id: m.id,
        label: m.label,
        signText: m.signText,
        sign: m.sign,
        plain: m.plain,
        mechanism: m.mechanism,
        condition: m.condition,
        exclusions: m.exclusions,
        status: m.status,
        fromName: from ? from.name : '—',
        fromText: from ? `${fmtPrice(from.price, from.decimals)}${from.unit === '%' ? '%' : ''}` : '—',
        fromPct: from ? fmtPct(from.changePct) : '',
        fromDir: from ? from.dir : 'flat',
        toName: to ? to.name : '—',
        toText: to ? `${fmtPrice(to.price, to.decimals)}${to.unit === '%' ? '%' : ''}` : '—',
        toPct: to ? fmtPct(to.changePct) : '',
        toDir: to ? to.dir : 'flat',
        missing: !from || !to,
      };
    });
    this.setData({ items: view, counts });
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const expanded = { ...this.data.expanded };
    expanded[id] = !expanded[id];
    this.setData({ expanded });
  },

  onRetry() {
    api.resetChannels();
    this.setData({ error: '', loading: true });
    this.load(true);
  },
});
