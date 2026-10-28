/* ================================================================== *
 * 服务端运行配置（唯一来源）
 *
 * PORT / HOST 曾经在 server.mjs 和 macro.service.js 各写一份 —— 两份默认值
 * 一致所以没出事，但这种一致靠人记。改端口时只改一处、另一处悄悄不一致，
 * 排查起来很难看。收敛到这里，谁要谁 import。
 * ================================================================== */

/**
 * 运行时版本守卫（方案 E01）。
 *
 * 写在这里而不是 server.mjs：入口已经贴着 200 行上限，而「不支持的环境直接
 * 报错」属于配置层的事 —— 谁 import 配置，谁就先过这道门。
 *
 * 判据用 node:sqlite 的真实可用性，而不是只比版本号：发行版可能裁剪模块，
 * 版本号满足但模块不在的情况只能靠试。
 */
export const MIN_NODE_MAJOR = 24;

{
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    console.error(
      `[boot] 需要 Node >= ${MIN_NODE_MAJOR}（当前 ${process.versions.node}）：项目用 node:sqlite，`
        + '低版本没有这个模块。请 `nvm use`（见 .nvmrc）后重试，或运行 `npm run doctor` 查看环境。',
    );
    process.exit(78);
  }
}

export const PORT = Number(process.env.PORT || 8787);
export const HOST = process.env.HOST || '127.0.0.1';

/**
 * 调试端点（/api/_market 之类）的开关。
 * 默认关闭：它会把内部市场配置整份吐出来，不该在生产暴露。
 */
export const DEBUG_API = process.env.ENABLE_DEBUG_API === '1';

/**
 * 维护端点（/api/maintenance/backup）的开关。
 *
 * 默认关闭，理由与 DEBUG_API 相同：它会进入维护窗口（停写）并生成整份数据
 * 副本，不该是一个「谁都能点」的按钮。本地用的时候显式 `ENABLE_MAINTENANCE_API=1`。
 */
export const MAINTENANCE_API = process.env.ENABLE_MAINTENANCE_API === '1';

/**
 * 关掉后台抓取（定时器 + 首轮请求）。
 * 集成测试用：不碰外网、不起定时器，进程能干净退出。
 * 断网环境下也算有用（页面能起，只是没有数据）。
 */
export const DISABLE_BACKGROUND = process.env.DISABLE_BACKGROUND === '1';
