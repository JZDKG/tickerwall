/* ================================================================== *
 * WorkBuddy 云服务客户端（唯一实例）
 *
 * 这里只有「应用可见的公共配置」：endpoint / publishableKey 不含任何权限，
 * 服务端按 Origin + 会话鉴权，所以可以随包发布。真正的密钥与环境 ID 都在
 * 服务端，永远不会出现在小程序代码里。
 *
 * 三个注意点：
 *   1. 必须传 endpoint —— 小程序没有 location.origin，SDK 的同源回落不存在；
 *   2. 必须用 /miniprogram 子路径的工厂，不要自己拼 createMiniProgramFetch
 *      那一套（顺序错了会「构造成功、第一次请求必崩」）；
 *   3. wx 走诊断包一层，失败请求会打一行 [WorkBuddy Cloud] request failed，
 *      真机上开 vConsole 就能看见，成功请求不刷屏。
 *
 * 初始化失败（例如 miniprogram_npm 没构建出来）不能让整个小程序白屏：
 * 这里降级成 cloud = null，页面按「云同步不可用」处理，行情等功能照常。
 * ================================================================== */

const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');

/** 来自 workbuddy_cloud_service 的 publicConfig，可安全下发到前端 */
const publicConfig = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_bCqtHLwCYTJNGfcRh5f4AZ_bYxXLfcc5G8gCYc2AZ6auz27TQactLQa',
  workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_bCqtHLwCYTJNGfcRh5f4AZ',
};

let cloud = null;
let initError = '';

try {
  cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    workBuddyOAuthClientId: publicConfig.workBuddyOAuthClientId,
    wx: createDiagnosticWx(wx),
  });
} catch (err) {
  initError = String((err && err.message) || err);
  console.error('[WorkBuddy Cloud] init failed', JSON.stringify({ message: initError }));
}

module.exports = { cloud, publicConfig, initError };
