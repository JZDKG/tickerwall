/* ================================================================== *
 * 小程序入口：只做三件事 —— 量一下安全区、预热云环境、暴露全局状态。
 * 业务全部在页面里，不做全局 store（这个体量用不着）。
 * ================================================================== */

const api = require('./utils/api');

App({
  globalData: {
    // 状态栏 / 导航栏 / 底部安全区（自定义导航用）
    statusBarHeight: 20,
    navBarHeight: 44,
    safeBottom: 0,
    // 最近一次行情（页面间共享，避免来回切 tab 都重新拉）
    quotes: null,
    quotesAt: 0,
    // 数据通道：cloud / local / mock
    mode: null,
  },

  onLaunch() {
    this.measure();
    api.warmup();
  },

  /** 量安全区：自定义导航栏必须自己算，否则刘海屏会压字 */
  measure() {
    let info = {};
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) {
      info = {};
    }
    const statusBarHeight = info.statusBarHeight || 20;
    let navBarHeight = 44;
    try {
      const capsule = wx.getMenuButtonBoundingClientRect();
      if (capsule && capsule.height) {
        // 胶囊上下留白相等 → 导航栏高度 = 上留白×2 + 胶囊高
        navBarHeight = (capsule.top - statusBarHeight) * 2 + capsule.height;
      }
    } catch (e) {
      /* 取不到就用 44 */
    }
    const safeArea = info.safeArea || null;
    const screenHeight = info.screenHeight || 0;
    this.globalData.statusBarHeight = statusBarHeight;
    this.globalData.navBarHeight = Math.round(navBarHeight);
    this.globalData.safeBottom = safeArea && screenHeight ? Math.max(0, screenHeight - safeArea.bottom) : 0;
  },
});
