/* ================================================================== *
 * 自选
 *
 * 两层存储：
 *   · 本机（wx.storage）永远是第一落点 —— 未登录也能用，点击立刻生效；
 *   · 云端（WorkBuddy 云服务）只在登录后参与，负责跨设备同步。
 *
 * 同步策略：登录时以云端为准（云端为空则把本地推上去）；之后每次增删
 * 先改本地再写云端，失败就在状态条上如实显示，不假装已同步。
 *
 * 交互选型：编辑态 + 行内「移除」，而不是左滑。左滑在小程序里要
 * t-swipe-cell 包一层，卡片本身的点击（进详情）和滑动手势会互相抢，
 * 而自选是个低频操作，多一步「编辑」反而更不容易误删。
 * ================================================================== */

const api = require('../../utils/api');
const store = require('../../utils/store');
const sync = require('../../utils/sync');
const { fmtPct, dirOf } = require('../../utils/format');

/** a@b.com → a***@b.com，界面上不显示完整邮箱 */
function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at <= 0) return s;
  return `${s.slice(0, 1)}***${s.slice(at)}`;
}

Page({
  data: {
    rows: [],
    all: [],
    watching: 0,
    summary: { avg: '—', dir: 'flat', up: 0, down: 0 },
    editing: false,
    loading: true,
    demo: false,
    error: '',
    // 添加面板
    showAdd: false,
    keyword: '',
    candidates: [],
    // 云同步
    showLogin: false,
    cloudReady: false,
    signedIn: false,
    account: '',
    syncState: 'off', // off | on | error | busy
    syncText: '',
  },

  onLoad() {
    this._quotes = [];
    this.setData({ cloudReady: sync.isReady() });
    const cached = store.loadQuotes();
    if (cached) {
      this._quotes = cached.items || [];
      this.compose();
      this.setData({ loading: false });
    }
    this.load();
    this.bootstrapAuth();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.compose();
  },

  onPullDownRefresh() {
    api.resetChannels();
    Promise.all([this.load(true), this.refreshFromCloud()]).finally(() => wx.stopPullDownRefresh());
  },

  async load(force) {
    if (this._busy) return;
    this._busy = true;
    if (force && !this._quotes.length) this.setData({ loading: true });
    try {
      const { data, mode } = await api.call('quotes');
      this._quotes = data.items || [];
      store.saveQuotes(data);
      this.compose();
      this.setData({ loading: false, error: '', demo: mode === 'mock' || !!data.demo });
    } catch (err) {
      this.setData({ loading: false, error: String((err && err.message) || '取数失败') });
    } finally {
      this._busy = false;
    }
  },

  compose() {
    const ids = store.getWatch();
    const map = {};
    for (const q of this._quotes) map[q.id] = q;

    const rows = ids.map((id) => map[id]).filter(Boolean);

    const valid = rows.filter((r) => Number.isFinite(r.changePct));
    const avg = valid.length ? valid.reduce((s, r) => s + r.changePct, 0) / valid.length : null;

    this.setData({
      rows,
      all: this._quotes,
      watching: ids.length,
      summary: {
        avg: avg === null ? '—' : fmtPct(avg),
        dir: dirOf(avg),
        up: valid.filter((r) => r.changePct > 0).length,
        down: valid.filter((r) => r.changePct < 0).length,
      },
    });
  },

  /* ---------------- 登录与同步 ---------------- */

  async bootstrapAuth() {
    if (!sync.isReady()) {
      this.setData({ syncState: 'off', syncText: '云服务未初始化，自选只存本机' });
      return;
    }
    const { session, error } = await sync.getSession();
    if (error) {
      this.setData({ syncState: 'error', syncText: `登录状态读取失败：${error}` });
      return;
    }
    if (!session) {
      this.setData({ signedIn: false, account: '', syncState: 'off', syncText: '未登录 · 自选只存本机' });
      return;
    }
    this.setData({ signedIn: true, account: maskEmail(session.user && session.user.email) });
    this.mergeWithCloud();
  },

  /** 登录态下把本地和云端对齐：云端有数据以云端为准，云端为空则把本地推上去 */
  async mergeWithCloud() {
    this.setData({ syncState: 'busy', syncText: '正在同步…' });
    const local = store.getWatch();
    const { ids, error, pushed } = await sync.syncOnLogin(local);
    if (error) {
      this.setData({ syncState: 'error', syncText: `同步失败：${error}` });
      return;
    }
    store.setWatch(ids);
    this.compose();
    const text = pushed ? `已同步 · ${ids.length} 个标的上传完成` : `已同步 · 云端 ${ids.length} 个标的`;
    this.setData({ syncState: 'on', syncText: text });
  },

  /**
   * 下拉刷新：正常情况以云端为准 —— 换设备后靠这一步把自选拉回来。
   *
   * 两种例外不能拉，否则会丢数据：
   *   · 上一次推送失败：本地有改动还没上云，拉一次就把它抹了，改成重推；
   *   · 云端为空但本地有货：这是新账号（或换了 AppID 的库），拉会把自选清空。
   */
  async refreshFromCloud() {
    if (!this.data.signedIn) return;
    if (this.data.syncState === 'error') {
      this.pushToCloud();
      return;
    }
    try {
      const ids = await sync.pullWatchlist();
      if (!ids.length && store.getWatch().length) {
        this.pushToCloud();
        return;
      }
      store.setWatch(ids);
      this.compose();
      this.setData({ syncState: 'on', syncText: `已同步 · 云端 ${ids.length} 个标的` });
    } catch (err) {
      this.setData({ syncState: 'error', syncText: `同步失败：${(err && err.message) || err}` });
    }
  },

  /** 本地改完立刻写云端；失败只影响同步状态，不回滚本地操作 */
  async pushToCloud() {
    if (!this.data.signedIn) return;
    const ids = store.getWatch();
    try {
      await sync.pushWatchlist(ids);
      this.setData({ syncState: 'on', syncText: `已同步 · 云端 ${ids.length} 个标的` });
    } catch (err) {
      this.setData({ syncState: 'error', syncText: `同步失败：${(err && err.message) || err}` });
    }
  },

  openLogin() {
    if (!sync.isReady()) {
      wx.showModal({
        title: '云服务未初始化',
        content: '小程序包里没有找到云服务 SDK，请重新构建 npm 后再试。',
        showCancel: false,
      });
      return;
    }
    this.setData({ showLogin: true });
  },

  closeLogin() {
    this.setData({ showLogin: false });
  },

  onLoginPopupVisible(e) {
    const visible = e && e.detail ? e.detail.visible : false;
    if (!visible) this.setData({ showLogin: false });
  },

  async onSignedIn() {
    const { session } = await sync.getSession();
    this.setData({
      showLogin: false,
      signedIn: !!session,
      account: maskEmail(session && session.user ? session.user.email : ''),
    });
    if (!session) {
      this.setData({ syncState: 'error', syncText: '登录已完成但没取到会话，请重试' });
      return;
    }
    wx.showToast({ title: '已登录', icon: 'none' });
    this.mergeWithCloud();
  },

  onSignOut() {
    wx.showModal({
      title: '退出登录',
      content: '退出后自选仍会保留在本机，只是不再同步到云端。',
      confirmText: '退出',
      success: async (res) => {
        if (!res.confirm) return;
        const { error } = await sync.signOut();
        if (error) {
          this.setData({ syncState: 'error', syncText: `退出失败：${error}` });
          return;
        }
        this.setData({ signedIn: false, account: '', syncState: 'off', syncText: '未登录 · 自选只存本机' });
        wx.showToast({ title: '已退出', icon: 'none' });
      },
    });
  },

  onSyncRetry() {
    if (this.data.signedIn) this.mergeWithCloud();
    else this.bootstrapAuth();
  },

  /* ---------------- 列表 ---------------- */

  onOpen(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` });
  },

  toggleEdit() {
    this.setData({ editing: !this.data.editing });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '移出自选',
      content: '该标的会从自选列表移除，随时可以再加回来。',
      confirmText: '移除',
      confirmColor: '#f5455c',
      success: (res) => {
        if (!res.confirm) return;
        store.toggleWatch(id);
        this.compose();
        this.pushToCloud();
        wx.showToast({ title: '已移除', icon: 'none' });
      },
    });
  },

  /* ---------------- 添加面板 ---------------- */

  openAdd() {
    this.setData({ showAdd: true, keyword: '' }, () => this.filterCandidates(''));
  },

  closeAdd() {
    this.setData({ showAdd: false });
  },

  onPopupVisible(e) {
    const visible = e && e.detail ? e.detail.visible : false;
    if (!visible) this.setData({ showAdd: false });
  },

  onSearch(e) {
    const keyword = (e.detail && e.detail.value) || '';
    this.setData({ keyword });
    this.filterCandidates(keyword);
  },

  filterCandidates(keyword) {
    const kw = String(keyword || '').trim().toLowerCase();
    const ids = store.getWatch();
    const list = (this._quotes || [])
      .filter((q) => {
        if (!kw) return true;
        return (
          String(q.name).toLowerCase().indexOf(kw) >= 0 ||
          String(q.sub).toLowerCase().indexOf(kw) >= 0 ||
          String(q.id).toLowerCase().indexOf(kw) >= 0
        );
      })
      .map((q) => ({
        id: q.id,
        name: q.name,
        sub: q.sub,
        watched: ids.indexOf(q.id) >= 0,
        pct: fmtPct(q.changePct),
        dir: dirOf(q.changePct),
      }));
    this.setData({ candidates: list });
  },

  onToggleWatch(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const added = store.toggleWatch(id);
    this.filterCandidates(this.data.keyword);
    this.compose();
    this.pushToCloud();
    wx.showToast({ title: added ? '已加入自选' : '已移除', icon: 'none' });
  },

  onRetry() {
    api.resetChannels();
    this.setData({ error: '', loading: true });
    this.load(true);
  },
});
