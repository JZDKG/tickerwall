/* ================================================================== *
 * 标的详情
 *
 * 展示口径：顶部涨跌走实时报价，图表与区间统计走日线/分时。两者不混用
 * （web 端踩过的坑：日线最后一条可能停在前两天，用它算「近 1 日」会差一截）。
 *
 * 统计在前端算，不依赖服务端返回的 stats —— 云函数 / 本机 web 服务 / 演示
 * 快照这三种数据源的 stats 字段形状不完全一样，而日线与报价的形状是一致的。
 * 少一次形状适配，就少一处只在某个环境才暴露的 bug。
 * ================================================================== */

const api = require('../../utils/api');
const {
  fmtPrice,
  fmtPct,
  fmtSigned,
  dirOf,
  prettySource,
  freshShort,
  fmtCompact,
} = require('../../utils/format');

const RANGE_DAYS = [
  { key: 'd5', label: '近 5 日', days: 5 },
  { key: 'd20', label: '近 20 日', days: 20 },
  { key: 'd60', label: '近 60 日', days: 60 },
  { key: 'd250', label: '近一年', days: 250 },
];

Page({
  data: {
    id: '',
    loading: true,
    error: '',
    demo: false,
    name: '',
    sub: '',
    unit: '',
    priceText: '—',
    pctText: '—',
    absText: '',
    dir: 'flat',
    statusLabel: '',
    statusDot: false,
    freshText: '',
    sourceText: '',
    updatedText: '',
    // 图表
    tab: 'intraday',
    tabs: [
      { key: 'intraday', label: '分时' },
      { key: 'daily', label: '日线' },
    ],
    intradayPoints: [],
    dailyCloses: [],
    chartDir: 'flat',
    chartBaseline: null,
    chartHint: '',
    dailyHint: '',
    amountText: '',
    // 统计
    quoteRows: [],
    perfRows: [],
    riskRows: [],
    related: [],
    emptyChart: false,
  },

  onLoad(query) {
    const id = (query && query.id) || 'gold-intl';
    this.setData({ id });
    this.load(id);
  },

  onPullDownRefresh() {
    api.resetChannels();
    this.load(this.data.id, true).finally(() => wx.stopPullDownRefresh());
  },

  async load(id, force) {
    if (this._busy) return;
    this._busy = true;
    if (force) this.setData({ loading: true });
    try {
      const [{ data, mode }, quotes] = await Promise.all([
        api.call('detail', { id }),
        // 相关标的取自行情列表；拿不到不影响主内容
        api.call('quotes').catch(() => ({ data: { items: [] } })),
      ]);
      this.render(data, mode);
      this.renderRelated(id, quotes.data.items || []);
      this.setData({ loading: false, error: '' });
      wx.setNavigationBarTitle({ title: data.name || '标的详情' });
    } catch (err) {
      this.setData({ loading: false, error: String((err && err.message) || '取数失败') });
    } finally {
      this._busy = false;
    }
  },

  /** 把三种数据源的三份形状，压成一份渲染数据 */
  render(data, mode) {
    const quote = data.quote || {};
    const d = Number.isFinite(data.decimals) ? data.decimals : 2;
    const dir = dirOf(quote.changePct);

    // 日线：云函数给 {dates, close, high, low}；web 给 history.daily 行数组
    let dates = [];
    let closes = [];
    let highs = [];
    let lows = [];
    if (data.daily && Array.isArray(data.daily.close)) {
      dates = data.daily.dates || [];
      closes = data.daily.close || [];
      highs = data.daily.high || [];
      lows = data.daily.low || [];
    } else if (data.history && Array.isArray(data.history.daily)) {
      for (const row of data.history.daily) {
        dates.push(row[0]);
        closes.push(row[2]);
        highs.push(row[3]);
        lows.push(row[4]);
      }
    }

    // 分时：云函数给 [[t, p]]；web 给 [{t, p, label}]
    const rawPoints = (data.intraday && data.intraday.points) || [];
    const intraday = rawPoints
      .map((p) => (Array.isArray(p) ? { t: p[0], p: p[1] } : { t: p.t, p: p.p }))
      .filter((p) => Number.isFinite(p.p));

    const prevClose = Number.isFinite(quote.prevClose) ? quote.prevClose : null;

    const quoteRows = [
      { label: '今开', value: fmtPrice(quote.open, d) },
      { label: '最高', value: fmtPrice(quote.high, d) },
      { label: '最低', value: fmtPrice(quote.low, d) },
      { label: quote.priceBasis === 'settle' ? '昨结算' : '昨收', value: fmtPrice(quote.prevClose, d) },
    ];

    // 区间表现：用日线收盘 + 实时价（如果有）算，避免最后一根日线滞后
    const lastLive = Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
    const series = closes.slice();
    if (lastLive) series[series.length - 1] = lastLive;

    const perfRows = RANGE_DAYS.map((r) => {
      const back = r.days;
      let pct = null;
      if (series.length > back) {
        const base = series[series.length - 1 - back];
        if (base) pct = ((series[series.length - 1] - base) / base) * 100;
      }
      return { key: r.key, label: r.label, text: fmtPct(pct), dir: dirOf(pct) };
    });

    const vol = this.annualVol(closes.slice(-250), data.market === 'crypto' ? 365 : 252);
    const mdd = this.maxDrawdown(closes.slice(-250));

    const riskRows = [
      { label: '年化波动率', value: vol === null ? '—' : `${vol.toFixed(1)}%` },
      { label: '近一年最大回撤', value: mdd === null ? '—' : `${mdd.toFixed(1)}%` },
      { label: '近一年最高', value: fmtPrice(highs.length ? Math.max(...highs.slice(-250)) : null, d) },
      { label: '近一年最低', value: fmtPrice(lows.length ? Math.min(...lows.slice(-250)) : null, d) },
    ];

    const status = data.marketStatus || quote.marketStatus || null;
    const fresh = freshShort(quote.freshness);
    // 没有分时（收盘后 / 上游没给）就直接落在日线，别让用户先看到一个空图
    const tab = intraday.length < 2 && closes.length > 1 ? 'daily' : this.data.tab;

    this.setData({
      tab,
      demo: mode === 'mock' || !!data.demo,
      name: data.name || quote.name || '',
      sub: data.sub || quote.sub || '',
      unit: data.unit || quote.unit || '',
      priceText: fmtPrice(quote.price, d),
      pctText: fmtPct(quote.changePct),
      absText: fmtSigned(quote.change, d),
      dir,
      statusLabel: status ? status.label : '',
      statusDot: !!(status && status.open),
      freshText: fresh,
      sourceText: prettySource(quote.source) || '—',
      updatedText: quote.sessionTime ? `行情时间 ${quote.sessionTime}` : '',
      dailyCloses: closes.slice(-250),
      intradayPoints: intraday,
      chartDir: dir,
      chartBaseline: prevClose,
      chartHint: intraday.length ? this.spanText(intraday[0].t, intraday[intraday.length - 1].t) : '',
      dailyHint: dates.length ? `${dates[Math.max(0, dates.length - 250)]} → ${dates[dates.length - 1]}` : '',
      quoteRows,
      perfRows,
      riskRows,
      // 成交额只在有日线成交额时给（云函数日线不带 amount，就不显示空的）
      amountText: Number.isFinite(quote.amount) ? fmtCompact(quote.amount) : '',
    });
  },

  spanText(t1, t2) {
    const fmt = (t) => {
      if (!t) return '';
      const d = new Date(t);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    return t1 && t2 ? `${fmt(t1)} – ${fmt(t2)}` : '';
  },

  annualVol(closes, daysPerYear) {
    if (!closes || closes.length < 20) return null;
    const rets = [];
    for (let i = 1; i < closes.length; i += 1) {
      const a = closes[i - 1];
      const b = closes[i];
      if (a > 0 && b > 0) rets.push(Math.log(b / a));
    }
    if (rets.length < 10) return null;
    const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
    const variance = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
    return Math.sqrt(variance) * Math.sqrt(daysPerYear) * 100;
  },

  maxDrawdown(closes) {
    if (!closes || closes.length < 2) return null;
    let peak = closes[0];
    let mdd = 0;
    for (const c of closes) {
      if (c > peak) peak = c;
      const dd = ((c - peak) / peak) * 100;
      if (dd < mdd) mdd = dd;
    }
    return mdd;
  },

  /** 相关标的：同分类里除自己以外，涨跌幅绝对值最大的 4 个 */
  renderRelated(id, items) {
    const self = items.find((i) => i.id === id);
    const cat = self && self.cat;
    const list = items
      .filter((i) => i.id !== id && (!cat || i.cat === cat))
      .filter((i) => Number.isFinite(i.changePct))
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 4)
      .map((i) => ({
        id: i.id,
        name: i.name,
        pct: fmtPct(i.changePct),
        dir: dirOf(i.changePct),
      }));
    this.setData({ related: list });
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.tab) return;
    this.setData({ tab: key });
  },

  onRelated(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.id) return;
    // redirectTo 而不是 navigateTo：详情之间互跳不该把栈堆起来
    wx.redirectTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` });
  },

  onRetry() {
    api.resetChannels();
    this.setData({ error: '', loading: true });
    this.load(this.data.id, true);
  },
});
