/* ================================================================== *
 * 客户端请求层（方案 E07 / §8）
 *
 * 在这之前，十个视图各自写 `fetch(...)`：参数编码、超时、取消、错误文案、
 * 状态码判断各一份，行为早就分叉了（有的读 `res.ok`，有的只看 JSON 里
 * 有没有 error）。这里把四件事收口：
 *
 *   1. **参数编码**：统一走 `URLSearchParams`，不手拼 `?a=1&b=`。
 *   2. **超时与取消**：`AbortController` + 外层超时；上层换资产时调用
 *      `cancel()`，旧响应绝不会覆盖新选择。
 *   3. **错误归一**：网络错误 / 超时 / HTTP 状态 / 业务错误码，全部变成
 *      带 `kind` 的 `ApiError`，视图只需要判断 kind，不用记各种形状。
 *   4. **同一时刻一个请求**：同 URL 并发调用复用一个 Promise（与服务端同键
 *      合并对称，避免「切来切去把上游打爆」）。
 *
 * 刻意不做：不在这里放业务判断（哪个接口需要 force、哪个要缓存多久）。
 * 那是 query-cache 与视图的事。
 * ================================================================== */

/** 错误类别。视图按 kind 决定文案与是否可重试 */
export const ApiErrorKind = {
  network: 'network',   // DNS / 断网 / 连接被拒
  timeout: 'timeout',   // {{timeoutMs}} 内没回来
  http: 'http',         // 非 2xx
  parse: 'parse',       // 响应不是 JSON（例如被网关改写）
  aborted: 'aborted',   // 主动取消（切资产/卸载视图）
  business: 'business', // 200 但 body.ok === false
};

export class ApiError extends Error {
  constructor(kind, message, { status = null, code = null, body = null, url = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.body = body;
    this.url = url;
    this.cause = cause;
  }

  /** 可重试的类别：业务错误码通常不该自动重试 */
  get retryable() {
    return this.kind === ApiErrorKind.network || this.kind === ApiErrorKind.timeout || (this.kind === ApiErrorKind.http && this.status >= 500);
  }
}

/**
 * 把一个 URL + 参数拼成字符串（参数值 null/undefined 自动跳过）。
 *
 * 两个细节必须保住，否则调用方拼出的路径会悄悄变形：
 *   · `api/x` 不能变成 `/api/x` —— 页面在子路径下时语义不同；
 *   · 空格编码成 `%20` 而不是 `+` —— `+` 只在表单编码里有「空格」的含义，
 *     放进查询串里容易被下游当成字面加号。
 */
export function buildUrl(base, params = null) {
  const raw = String(base);
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const hadLeadingSlash = raw.startsWith('/');
  const url = new URL(raw, 'http://local.invalid');

  const search = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString().replace(/\+/g, '%20');

  if (isAbsolute) return `${url.origin}${url.pathname}${qs ? `?${qs}` : ''}`;
  const pathname = hadLeadingSlash ? url.pathname : url.pathname.replace(/^\//, '');
  return `${pathname}${qs ? `?${qs}` : ''}`;
}

/**
 * 创建请求客户端。
 *
 * @param {object} [opts]
 * @param {string} [opts.base] 前缀（默认当前页，兼容 ./api 的写法）
 * @param {number} [opts.timeoutMs] 单请求超时
 * @param {Function} [opts.fetchImpl] 注入 fetch（测试用）
 * @param {() => number} [opts.now]
 */
export function createApi({ base = './', timeoutMs = 20_000, fetchImpl = null, now = () => Date.now() } = {}) {
  const doFetch = fetchImpl ?? ((...args) => fetch(...args));
  /** 进行中的请求：url → { promise, controller } */
  const inflight = new Map();

  function makeSignal(controller, ms) {
    const signal = controller.signal;
    let timer = null;
    if (Number.isFinite(ms) && ms > 0) timer = setTimeout(() => controller.abort('timeout'), ms);
    return { signal, clear: () => timer && clearTimeout(timer) };
  }

  /**
   * 一次 GET。
   *
   * @param {string} path 例如 'api/detail/gold-intl'
   * @param {object} [options]
   * @param {object} [options.params] 查询参数
   * @param {boolean} [options.json] 是否按 JSON 解析（默认 true）
   * @param {number} [options.timeoutMs]
   * @param {boolean} [options.dedupe] 同 URL 并发是否合并（默认 true）
   * @returns {Promise<{data:any, status:number, fetchedAt:number}>}
   */
  async function get(path, { params = null, json = true, timeoutMs: perRequest, dedupe = true } = {}) {
    const url = buildUrl(path.startsWith('http') ? path : `${base}${path}`, params);

    if (dedupe && inflight.has(url)) return inflight.get(url).promise;

    const controller = new AbortController();
    const { signal, clear } = makeSignal(controller, perRequest ?? timeoutMs);
    const startedAt = now();

    const promise = (async () => {
      let res;
      try {
        res = await doFetch(url, { signal, cache: 'no-store' });
      } catch (err) {
        clear();
        if (signal.aborted) {
          const timedOut = controller.signal.reason === 'timeout';
          throw new ApiError(timedOut ? ApiErrorKind.timeout : ApiErrorKind.aborted, timedOut ? `请求超时（${perRequest ?? timeoutMs}ms）` : '请求已取消', { url, cause: err });
        }
        throw new ApiError(ApiErrorKind.network, `网络错误：${err?.message ?? err}`, { url, cause: err });
      }
      clear();

      if (!res.ok) {
        throw new ApiError(ApiErrorKind.http, `HTTP ${res.status}`, { status: res.status, url });
      }
      if (!json) return { data: await res.text(), status: res.status, fetchedAt: startedAt };

      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new ApiError(ApiErrorKind.parse, '响应不是合法 JSON', { status: res.status, url, cause: err });
      }
      // 200 但业务失败：接口约定 body.ok === false
      if (data && data.ok === false) {
        throw new ApiError(ApiErrorKind.business, String(data.error ?? '接口返回失败'), {
          status: res.status,
          code: data.code ?? null,
          body: data,
          url,
        });
      }
      return { data, status: res.status, fetchedAt: startedAt };
    })().finally(() => {
      if (inflight.get(url)?.promise === promise) inflight.delete(url);
    });

    if (dedupe) inflight.set(url, { promise, controller });
    return promise;
  }

  /** 取消：不传 url 时取消全部（视图卸载时用） */
  function cancel(url = null) {
    if (url == null) {
      for (const { controller } of inflight.values()) controller.abort('cancel');
      inflight.clear();
      return;
    }
    const key = buildUrl(url.startsWith('http') ? url : `${base}${url}`);
    const entry = inflight.get(key);
    if (entry) {
      entry.controller.abort('cancel');
      inflight.delete(key);
    }
  }

  return { get, cancel, inflightSize: () => inflight.size, base, timeoutMs };
}
