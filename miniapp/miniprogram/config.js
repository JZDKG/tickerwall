/* ================================================================== *
 * 运行时配置
 *
 * envId 是云开发环境 ID；如果不填或云函数不可用，小程序会依次退到
 * 「本机 web 服务」和「内置演示快照」，保证 UI 始终能跑起来（见 utils/api.js）。
 * ================================================================== */

module.exports = {
  // 云开发环境（与 cloudfunctions/api 部署的环境一致）
  // 注意：必须用**属于本小程序 AppID 的环境**。wx9db9849343b6e407 名下只有 cloud1-…，
  // 之前填的 tianfu-… 是账号级 CloudBase 环境，wx.cloud 会报 -501000 Environment not found。
  envId: 'cloud1-d7g244bj346acc1ac',
  cloudFn: 'api',

  // 开发期兜底：本机跑着 web 版（node server.mjs）时可以直接读它的接口。
  // 真机上 127.0.0.1 指向手机自己，连不上，会自动跳过。
  localBase: 'http://127.0.0.1:8787',
  allowLocal: true,

  // 行情轮询间隔（web 端是 15s，跟着保持一致）
  pollMs: 15000,
  // 切到后台多久后回来要强制刷新
  staleOnResumeMs: 30000,
};
