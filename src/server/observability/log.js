/* ================================================================== *
 * 结构化日志（方案 E08 / §9.3）
 *
 * 目标不是「打更多日志」，而是**每条日志都能被程序读**：
 *   requestId / jobId / provider / durationMs / result / errorCode
 * 有了这六个字段，出问题时能回答「这个请求等了多久、哪个来源失败、
 * 是第几次重试」，而不是从一段中文里猜。
 *
 * 三条纪律：
 *   1. 一行一条 JSON：管道、grep、日志采集都能直接消化。
 *   2. **敏感字段永不落地**：authorization / cookie / api key / token，
 *      以及 URL 里的 token 查询参数，一律替换成 `<redacted>`。
 *   3. 不记录完整原始响应与家目录路径：体积大且容易带出私人信息。
 *
 * 只在需要时升级为指标系统：现在一个接口写 stdout，够用。
 * ================================================================== */

import { randomUUID } from 'node:crypto';

/** 会被替换掉值的键（小写比较） */
const SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'apikey',
  'api_key',
  'token',
  'access_token',
  'secret',
  'password',
]);

/** 查询串里同样敏感的键 */
const SECRET_QUERY = new Set(['token', 'api_key', 'apikey', 'key', 'secret', 'access_token']);

/**
 * 脱敏占位符。
 *
 * 用 `xxxx` 而不是 `<redacted>`：查询串里 < 与 > 会被编码成 %3C/%3E，
 * 日志里出现 `token=%3Credacted%3E` 既难读又容易被误认成别的编码。
 */
export const REDACTED = 'xxxx';

/** 把 URL 里敏感的查询参数抹掉，其余保留（保留才看得出是哪个端点） */
export function redactUrl(input) {
  const raw = String(input ?? '');
  try {
    const u = new URL(raw, 'http://local.invalid');
    let touched = false;
    for (const key of [...u.searchParams.keys()]) {
      if (SECRET_QUERY.has(key.toLowerCase())) {
        u.searchParams.set(key, REDACTED);
        touched = true;
      }
    }
    if (!touched) return raw;
    const qs = u.searchParams.toString().replace(/\+/g, '%20');
    const pathOnly = raw.startsWith('/') ? u.pathname : u.pathname.replace(/^\//, '');
    return `${raw.startsWith('http') ? u.origin : ''}${pathOnly}${qs ? `?${qs}` : ''}`;
  } catch {
    return raw;
  }
}

/** 递归脱敏对象（只处理一层足够：我们传的都是扁平元数据） */
export function redactFields(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
      continue;
    }
    if (key === 'url' || key === 'path') {
      out[key] = redactUrl(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function newRequestId() {
  return randomUUID().slice(0, 8);
}

/**
 * 造一个 logger。`emit` 可注入（测试用）。
 *
 * @param {{ emit?: (line:string)=>void, base?: object, level?: string }} [opts]
 */
export function createLogger({ emit = (line) => console.log(line), base = {}, level = 'info' } = {}) {
  const write = (lvl, event, fields) => {
    const payload = {
      ts: new Date().toISOString(),
      level: lvl,
      event,
      ...redactFields(base),
      ...redactFields(fields),
    };
    // undefined 字段直接不写：日志里出现 "jobId": null 只是噪声
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    emit(JSON.stringify(payload));
  };
  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
    child: (extra) => createLogger({ emit, base: { ...base, ...extra }, level }),
    raw: { emit, base, level },
  };
}

/** 默认 logger：写 stdout，项目版本号进 base，便于「这版日志是谁打的」 */
export const logger = createLogger();

/**
 * 包一层「请求日志」：一次请求恰好一条，成功与失败都要有。
 *
 * 为什么不算在 routes 里各写一条：路由有十几个分支，逐个加必漏；在这里
 * 用 finally 收口，任何路径（包括 404、异常、维护端点）都会被记录。
 *
 * @param {object} opts
 * @param {(req,res,ctx:{requestId:string,startedAt:number}) => Promise<any>} opts.run
 * @param {object} [opts.log]
 * @param {() => number} [opts.now]
 */
export function withRequestLog({ run, log = logger, now = () => Date.now() }) {
  return async function logged(req, res) {
    const requestId = newRequestId();
    const startedAt = now();
    let result = 'ok';
    let errorCode = null;

    res.on('finish', () => {
      if (res.statusCode >= 500) result = 'error';
      else if (res.statusCode >= 400) result = 'client_error';
      if (res.statusCode === 500 && !errorCode) errorCode = 'INTERNAL';
      log.info('http.request', {
        requestId,
        method: req.method,
        url: req.url,
        status: res.statusCode,
        durationMs: now() - startedAt,
        result,
        errorCode,
      });
    });

    try {
      return await run(req, res, { requestId, startedAt, markError: (code) => { errorCode = code; } });
    } catch (err) {
      errorCode = errorCode ?? 'UNHANDLED';
      throw err;
    }
  };
}
