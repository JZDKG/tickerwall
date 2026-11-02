/* ================================================================== *
 * 事件中心
 *
 * 数据来自云函数 /api/events（三源快讯聚合 + 主题打标 + 重要度分级）。
 * 版式对应 web 的 #/events：顶部「今日重点」三条，下面按时间倒序的事件流。
 * 手机上的差异：事件卡改成左侧时间轴（时间竖排 + 圆点 + 竖线），
 * 一屏能连续读 5~6 条，比 web 的横排三列更省横向空间。
 * ================================================================== */

const api = require('../../utils/api');
const llm = require('../../utils/llm');
const translate = require('../../utils/translate');
const { clockText } = require('../../utils/format');

const LEVEL_TEXT = { high: '重要', mid: '关注', low: '快讯' };

/** 摘要按天缓存：事件流每 45 秒就变，跟着变会让模型一天被调几百次 */
const AI_CACHE_PREFIX = 'ai:events:';

function bjDateKey() {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

const LEVEL_RANK = { high: 3, mid: 2, low: 1 };
function levelRank(lv) {
  return LEVEL_RANK[lv] || 0;
}

Page({
  data: {
    filters: [
      { key: 'all', label: '全部' },
      { key: 'high', label: '重要' },
      { key: 'mid', label: '关注' },
    ],
    filter: 'all',
    focus: [],
    items: [],
    counts: { high: 0, mid: 0, low: 0, total: 0 },
    updatedText: '',
    loading: true,
    demo: false,
    error: '',
    expanded: {},
    // AI 摘要：idle | loading | done | error | off
    ai: { state: 'idle', text: '', model: '', error: '' },
    // 外文翻译：count 是当前可见、还没译的条数；有值才显示翻一条
    tr: { state: 'idle', count: 0, model: '', error: '' },
  },

  onLoad() {
    this._all = [];
    this.load();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // 事件 45 秒一刷就够（云函数侧缓存也是 45 秒）
    if (this._fetchedAt && Date.now() - this._fetchedAt > 45000) this.load();
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
      const { data, mode } = await api.call('events', { limit: 60 });
      this._fetchedAt = Date.now();
      const list = (data.items || []).map((ev) => this.decorate(ev));
      this._all = list;
      this.setData({
        loading: false,
        error: '',
        demo: mode === 'mock' || !!data.demo,
        updatedText: data.generatedAt ? `更新于 ${clockText(data.generatedAt)}` : '',
        counts: {
          high: list.filter((e) => e.level === 'high').length,
          mid: list.filter((e) => e.level === 'mid').length,
          low: list.filter((e) => e.level === 'low').length,
          total: list.length,
        },
      });
      this.applyFilter();
      this.maybeSummarize();
    } catch (err) {
      this.setData({ loading: false, error: String((err && err.message) || '取数失败') });
    } finally {
      this._busy = false;
    }
  },

  /** 时间字段在三个数据源里的形态不一致，统一成 HH:MM / MM-DD */
  decorate(ev) {
    const time = String(ev.time || '');
    const hhmm = ev.hhmm || (time.length >= 16 ? time.slice(11, 16) : '');
    const date = ev.date || (time.length >= 10 ? time.slice(5, 10) : '');
    // 语种判定纯本地算，不花模型；译文优先取缓存，刷新页面不用重译
    const foreign = translate.isForeign(ev.title);
    // 服务端 LLM 复核已带中文摘要（zh 字段）时直接用，省掉一次翻译调用；
    // 没有才走本地缓存/批量翻译兜底
    const zh = ev.zh || (foreign ? translate.lookup(ev.title) : '');
    // 副行（原标题）只在有独立信息量时显示：外文恒显示（读者读不了原文）；
    // 中文条目的摘要若被原标题包含（纯压缩），双行冗余，隐藏副行
    const origLine = Boolean(zh) && (foreign || (ev.title !== zh && !ev.title.includes(zh)));
    return {
      id: ev.id,
      title: ev.title,
      body: ev.body || '',
      level: ev.level || 'low',
      levelText: LEVEL_TEXT[ev.level] || '快讯',
      topics: (ev.topics || []).slice(0, 3),
      source: ev.source || '',
      url: ev.url || '',
      hhmm,
      date,
      long: (ev.body || '').length > 60,
      foreign,
      zh,
      origLine,
    };
  },

  applyFilter() {
    const key = this.data.filter;
    // 今日重点：取重要级前 3 条（没有重要级就退到关注级）
    const highs = this._all.filter((e) => e.level === 'high');
    const focus = (highs.length ? highs : this._all.filter((e) => e.level === 'mid')).slice(0, 3);
    const focusIds = focus.map((e) => e.id);

    // 重点区已经展示过的事件不再出现在下方流水里 —— 手机一屏只放得下 4 条，
    // 同一条重复出现两次会被当成 bug（web 端信息密度高，重复不明显）
    const rest = this._all.filter((e) => focusIds.indexOf(e.id) < 0);
    const items = (key === 'all' ? rest : rest.filter((e) => e.level === key)).slice(0, 60);

    // 只统计「当前看得见、且还没译」的外文，按钮上的数字才对得上屏幕
    const visible = focus.concat(items);
    const pending = visible.filter((e) => e.foreign && !e.zh).length;

    this.setData({ items, focus, 'tr.count': pending });
  },

  /**
   * 翻译当前可见的外文条目。
   * 一次批量调用（≤20 条），译文按标题缓存；失败只提示，不会把原文弄丢。
   */
  async onTranslate() {
    if (this.data.tr.state === 'loading') return;
    const seen = {};
    const targets = [];
    this.data.focus.concat(this.data.items).forEach((e) => {
      if (!e.foreign || e.zh || seen[e.id]) return;
      seen[e.id] = 1;
      targets.push(e);
    });
    if (!targets.length) return;

    this.setData({ 'tr.state': 'loading', 'tr.error': '' });
    try {
      const { pairs, model } = await translate.translateBatch(targets.map((e) => e.title));
      const map = {};
      pairs.forEach((p) => {
        map[p.title] = p.zh;
      });
      this._all = this._all.map((e) => (map[e.title] ? Object.assign({}, e, { zh: map[e.title] }) : e));
      this.applyFilter();
      this.setData({ 'tr.state': 'done', 'tr.model': model });
    } catch (err) {
      const msg = String((err && err.message) || err || '翻译失败');
      if (/abort|cancel/i.test(msg)) return;
      this.setData({ 'tr.state': 'error', 'tr.error': msg.slice(0, 60) });
    }
  },

  /* ---------------- AI 摘要 ---------------- */

  /**
   * 什么时候生成：
   *   · 当天已有缓存 → 直接显示（事件流一直在变，但摘要按天算，否则模型会被
   *     每 45 秒调一次）；
   *   · 快照数据不喂模型 —— 拿隔夜旧闻生成的摘要比没有更糟；
   *   · 其余情况首次进页面自动生成一次，之后靠「重写」按钮。
   */
  async maybeSummarize() {
    if (!llm.isReady()) {
      this.setData({ 'ai.state': 'off' });
      return;
    }
    if (this.data.demo || !this._all.length) {
      this.setData({ 'ai.state': 'off' });
      return;
    }

    const cached = wx.getStorageSync(AI_CACHE_PREFIX + bjDateKey());
    if (cached && cached.text) {
      this.setData({
        ai: { state: 'done', text: cached.text, model: cached.model || '', error: '' },
      });
      return;
    }
    this.generateSummary();
  },

  onRegenerate() {
    if (this.data.ai.state === 'loading') return;
    wx.removeStorageSync(AI_CACHE_PREFIX + bjDateKey());
    this.setData({ ai: { state: 'idle', text: '', model: '', error: '' } });
    this.generateSummary();
  },

  async generateSummary() {
    if (this._aiBusy) return;
    this._aiBusy = true;
    this.setData({ 'ai.state': 'loading', 'ai.text': '', 'ai.error': '' });

    // 只把「重要 → 关注」的前 6 条标题给模型，正文和链接都不发：
    // 既省 token，也避免把可能过时的长文当成事实喂进去
    const picked = this._all
      .slice()
      .sort((a, b) => levelRank(b.level) - levelRank(a.level))
      .slice(0, 6);

    // 流式吐字不能一个 token 一次 setData：80ms 合并一次
    let buffer = '';
    let timer = null;
    const flush = () => {
      timer = null;
      if (buffer && this.data.ai.text !== buffer) this.setData({ 'ai.text': buffer });
    };

    let controller = null;
    try {
      controller = typeof AbortController === 'function' ? new AbortController() : null;
      this._aiAbort = controller;

      const { text, model } = await llm.summarize({
        events: picked,
        dateLabel: '今天',
        signal: controller ? controller.signal : undefined,
        onChunk: (full) => {
          buffer = full;
          if (!timer) timer = setTimeout(flush, 80);
        },
      });

      if (timer) clearTimeout(timer);
      wx.setStorageSync(AI_CACHE_PREFIX + bjDateKey(), { text, model, at: Date.now() });
      this.setData({ ai: { state: 'done', text, model, error: '' } });
    } catch (err) {
      if (timer) clearTimeout(timer);
      const msg = String((err && (err.message || err.errMsg)) || err || '生成失败');
      // 切页面时主动 abort 不算失败
      if (/abort|cancel/i.test(msg)) return;
      this.setData({
        ai: { state: 'error', text: buffer, model: '', error: msg.slice(0, 80) },
      });
    } finally {
      this._aiBusy = false;
      this._aiAbort = null;
    }
  },

  onUnload() {
    if (this._aiAbort) {
      try {
        this._aiAbort.abort();
      } catch (err) {
        /* ignore */
      }
    }
  },

  onFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.filter) return;
    this.setData({ filter: key }, () => this.applyFilter());
  },

  /** 长正文点开看全文（默认两行截断，避免一条事件占半屏） */
  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const expanded = { ...this.data.expanded };
    expanded[id] = !expanded[id];
    this.setData({ expanded });
  },

  onCopy(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '原文链接已复制', icon: 'none' }),
    });
  },

  onRetry() {
    api.resetChannels();
    this.setData({ error: '', loading: true });
    this.load(true);
  },
});
