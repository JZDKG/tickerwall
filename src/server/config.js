/* ================================================================== *
 * 服务端运行配置（唯一来源）
 *
 * PORT / HOST 曾经在 server.mjs 和 macro.service.js 各写一份 —— 两份默认值
 * 一致所以没出事，但这种一致靠人记。改端口时只改一处、另一处悄悄不一致，
 * 排查起来很难看。收敛到这里，谁要谁 import。
 * ================================================================== */

export const PORT = Number(process.env.PORT || 8787);
export const HOST = process.env.HOST || '127.0.0.1';

/**
 * 调试端点（/api/_market 之类）的开关。
 * 默认关闭：它会把内部市场配置整份吐出来，不该在生产暴露。
 */
export const DEBUG_API = process.env.ENABLE_DEBUG_API === '1';

/**
 * 关掉后台抓取（定时器 + 首轮请求）。
 * 集成测试用：不碰外网、不起定时器，进程能干净退出。
 * 断网环境下也算有用（页面能起，只是没有数据）。
 */
export const DISABLE_BACKGROUND = process.env.DISABLE_BACKGROUND === '1';
