/* ================================================================== *
 * 自定义底部导航
 *
 * 没有直接用 t-tab-bar：它的默认配色是浅色（白底 + 品牌蓝），要改成
 * 深色终端风得覆盖一串内部变量，而这块是全局常驻的骨架，改坏了整站都歪。
 * 这里用 t-icon + 纯布局自己画，颜色直接取 tokens，图标准确可控。
 * ================================================================== */

const TABS = [
  { path: '/pages/market/market', text: '行情', icon: 'chart' },
  { path: '/pages/events/events', text: '事件', icon: 'notification' },
  { path: '/pages/macro/macro', text: '关联', icon: 'app' },
  { path: '/pages/watch/watch', text: '自选', icon: 'star' },
];

Component({
  data: {
    selected: 0,
    list: TABS,
    safeBottom: 0,
  },

  lifetimes: {
    attached() {
      const app = getApp();
      if (app && app.globalData) this.setData({ safeBottom: app.globalData.safeBottom || 0 });
    },
  },

  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      const tab = TABS[index];
      if (!tab) return;
      // 已经在当前页就不重复 switchTab（会闪一下）
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current && `/${current.route}` === tab.path) return;
      wx.switchTab({ url: tab.path });
    },
  },
});
