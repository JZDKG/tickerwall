/* ================================================================== *
 * 场景取数的统一出口（E07 收口的最后一层）
 *
 * 为什么需要它：不少模块为了可测性留了 `fetchImpl ?? fetch` 的写法 ——
 * 测试好写，但**生产路径绕过了 shared/api.js**，于是超时、取消、错误分类、
 * 跨视图去重全部失效。这类「伪消除」用 `grep 'fetch('` 甚至搜不到。
 *
 * 这个模块把两条路径合成一条出口：
 *   · 传了 `fetchImpl` → 用它（测试注入，保持 `${'./'}api/x?...` 的旧 URL 形状）；
 *   · 没传 → 走 `api.get()`（生产路径，拿到共享单例的全部能力）。
 * 两条路径的**失败语义一致**：返回 null，不抛。
 * ================================================================== */

import { api } from './api.js';

/** 用注入的 fetch 取 JSON：失败返回 null（与调用方原来的 catch 语义一致） */
async function viaInjected(fetchImpl, url) {
  try {
    const res = await fetchImpl(url, { cache: 'no-store' });
    if (!res) return null;
    if (res.ok === false) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 取一段 JSON。
 *
 * @param {string} path 不带前导 `./`，例如 `api/today-focus`
 * @param {{params?: object|null, fetchImpl?: Function|null, query?: string}} [opts]
 *   `query` 用于需要保留**原始拼接顺序**的调用方（与旧 URL 形状逐字节一致）。
 * @returns {Promise<any|null>}
 */
/** 把 `a=1&b=2` 这样的 query 串解析成参数对象（生产路径要用它调 api.get） */
function paramsOf(query, params) {
  if (params) return params;
  if (!query) return null;
  const out = {};
  for (const [k, v] of new URLSearchParams(query)) out[k] = v;
  return out;
}

export async function getJson(path, { params = null, fetchImpl = null, query = '' } = {}) {
  const qs = query || (params ? new URLSearchParams(params).toString() : '');
  if (fetchImpl) return viaInjected(fetchImpl, `./${path}${qs ? `?${qs}` : ''}`);
  try {
    /**
     * **`query` 必须参与生产路径**。
     *
     * 这里曾经写成 `api.get(path, { params })` —— 而调用方大多传的是
     * `query`（为了与旧 URL 逐字节一致），于是 params 恒为 null，
     * 请求退化成 `GET /api/explanations`（无任何参数）。服务端默认回退到
     * gold-intl，再加上 api 的并发合并，首屏三张问题卡全成了黄金的克隆：
     * 跌幅都是 0.14%，来源快照 id 都是 exp_gold-intl_session_…。
     * 这类「参数在注入路径生效、在生产路径丢失」的错，jsdom 测不出来
     * （测试都走注入路径），只有真实浏览器会暴露。
     */
    const { data } = await api.get(path, { params: paramsOf(query, params) });
    return data ?? null;
  } catch {
    return null;
  }
}

/** 需要同时拿到 HTTP 状态码时用这个（解释接口对外暴露 status） */
export async function getJsonWithStatus(path, { params = null, fetchImpl = null, query = '' } = {}) {
  if (fetchImpl) {
    const qs = query || (params ? new URLSearchParams(params).toString() : '');
    try {
      const res = await fetchImpl(`./${path}${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body: body ?? {} };
    } catch (err) {
      return { status: 503, body: { ok: false, error: String(err?.message ?? err) } };
    }
  }
  try {
    const { data, status } = await api.get(path, { params: paramsOf(query, params) });
    return { status, body: data ?? {} };
  } catch (err) {
    const status = err?.status ?? 503;
    return { status, body: { ok: false, error: String(err?.message ?? err) } };
  }
}
