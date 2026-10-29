/* ================================================================== *
 * 子进程环境：**白名单**，不是「继承再覆盖」
 *
 * 为什么不能写 `env: { ...process.env, X: 1 }`：
 *   · 开发机上带着 DEEPSEEK_API_KEY / OPENAI_API_KEY 时，子进程会拿着
 *     真实凭据去跑测试 —— 一次意外的外网请求就是账单与数据外泄；
 *   · 反过来，CI 上没有这些变量，测试行为就与本地不同（「我这儿是绿的」）。
 *
 * 白名单只保留跑起来必需的东西：PATH（找 node）、HOME（临时目录约定）、
 * TZ（时间断言稳定）、LANG（中文输出不乱码）。
 * ================================================================== */

const ALLOWED = ['PATH', 'HOME', 'TZ', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT', 'COMSPEC'];

/** 允许被继承的变量名（测试可以断言这份名单没有被放宽） */
export const ALLOWED_ENV_KEYS = [...ALLOWED];

/**
 * 给子进程用的干净环境。
 * @param {Record<string,string>} [overrides] 显式要设置的变量（测试自己负责）
 */
export function childEnv(overrides = {}) {
  const env = {};
  for (const key of ALLOWED) {
    if (process.env[key] != null) env[key] = process.env[key];
  }
  // 默认把时区钉住：涉及日期断言的测试不该受开发机时区影响
  env.TZ = env.TZ || 'UTC';
  return { ...env, ...overrides };
}

/** 便于审计：某个键是否在白名单里 */
export function isAllowedEnvKey(key) {
  return ALLOWED.includes(key);
}
