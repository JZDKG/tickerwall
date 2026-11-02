/* ================================================================== *
 * 隔夜复盘
 *
 * 一句话定位：睡了一夜，哪些东西动了。
 *
 * 口径必须写在页面上：这里是各标的「当日涨跌幅」的分组横向对比，没有做
 * 时区对齐 —— A 股收盘时美股还没开盘，两者不是同一段时间。把它当「隔夜
 * 收益」会系统性误读，所以宁可多写一行说明。
 * ================================================================== */

const api = require('../../utils/api');
const store = require('../../utils/store');
const { buildRecap } = require('../../utils/analysis');
const { fmtPct, fmtPrice, dirOf, clockText } = require('../../utils/format');

Page({
  data: {
    groups: [],
    best: [],
    worst: [],
    upCount: 0,
    downCount: 0,
    total: 0,
    updatedText: '',
    loading: true,
    demo: false,
    error: '',
  },

  onLoad() {
    const cached = store.loadQuotes();
    if (cached) {
      this.render(cached.items, cached.generatedAt);
      this.setData({ loading: false });
    }
    this.load();
  },

  onPullDownRefresh() {
    api.resetChannels();
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  async load(force) {
    if (this._busy) return;
    this._busy = true;
    if (force) this.setData({ loading: true });
    try {
      const { data, mode } = await api.call('quotes');
      this.render(data.items || [], data.generatedAt);
      this.setData({ loading: false, error: '', demo: mode === 'mock' || !!data.demo });
    } catch (err) {
      this.setData({ loading: false, error: String((err && err.message) || '取数失败') });
    } finally {
      this._busy = false;
    }
  },

  render(items, generatedAt) {
    const { groups, best, worst, upCount, downCount, total } = buildRecap(items);

    const decorate = (r) => ({
      id: r.id,
      name: r.name,
      group: r.group,
      pct: fmtPct(r.changePct),
      dir: dirOf(r.changePct),
      price: fmtPrice(r.price, r.decimals),
      unit: r.unit,
    });

    this.setData({
      groups: groups.map((g) => ({
        key: g.key,
        label: g.label,
        avg: fmtPct(g.avg),
        avgDir: g.avgDir,
        up: g.up,
        down: g.down,
        total: g.total,
        rows: g.rows.map((r) => ({
          id: r.id,
          name: r.name,
          pct: fmtPct(r.changePct),
          dir: dirOf(r.changePct),
        })),
      })),
      best: best.map(decorate),
      worst: worst.map(decorate),
      upCount,
      downCount,
      total,
      updatedText: generatedAt ? `行情 ${clockText(generatedAt)}` : '',
    });
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` });
  },

  onRetry() {
    api.resetChannels();
    this.setData({ error: '', loading: true });
    this.load(true);
  },
});
