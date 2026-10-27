/* ================================================================== *
 * 上游抓取的公共底座：数值清洗、解码、带超时的 fetch
 *
 * 之所以单独一层：各源的解析逻辑（新浪逗号串、CNBC 带 % 的收益率、CBOE/FRED
 * 的 CSV）都只依赖「一段原始文本」，把 fetch 与 parse 拆开之后，测试可以直接
 * 喂录制下来的响应文本，彻底摆脱外网波动与限流。
 *
 * fetch 也可以整体替换（setFetcher），用于无网络的确定性回放。
 * ================================================================== */

/** 服务端伪装成浏览器的统一 UA */
export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
export const SINA_REFERER = 'https://finance.sina.com.cn';

/** 默认超时；单次调用可覆盖 */
export const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);

/**
 * 宽松数值清洗：去掉千分位逗号，空串 / 单个减号 / 双横线都当「无值」。
 * 注意它**不**去百分号 —— 那些源用 cnbcNum。
 */
export function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '' || s === '-' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 可替换的 fetch 实现（测试注入回放用） */
let fetcher = (...args) => fetch(...args);
export function setFetcher(fn) {
  fetcher = fn ?? ((...args) => fetch(...args));
}

// 进程级回放/录制：由环境变量开启，便于在「上游冻结」的前提下比对实现差异
if (process.env.PROVIDER_REPLAY || process.env.PROVIDER_RECORD) {
  const { makeReplayFetcher } = await import('./replay.js');
  fetcher = makeReplayFetcher({
    replay: process.env.PROVIDER_REPLAY || null,
    record: process.env.PROVIDER_RECORD || null,
  });
  const mode = process.env.PROVIDER_REPLAY ? `回放 ${process.env.PROVIDER_REPLAY}` : `录制 ${process.env.PROVIDER_RECORD}`;
  console.log(`[providers] ${mode}`);
}

/**
 * 带超时与统一头部的文本抓取。
 * @param {string} url
 * @param {object} opts headers / encoding / method / body / timeoutMs / omitUa
 * @returns {Promise<string>}
 */
export async function fetchRaw(
  url,
  { headers = {}, encoding = 'utf-8', method = 'GET', body = null, timeoutMs = null, omitUa = false } = {},
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetcher(url, {
      method,
      ...(body != null ? { body } : {}),
      // omitUa：部分站点（如 FRED）会对伪装成浏览器的 UA 直接挂起连接，
      // 用 Node 默认 UA 反而 1 秒返回。这种源要显式退出统一 UA。
      headers: { ...(omitUa ? {} : { 'User-Agent': UA }), Accept: '*/*', ...headers },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (encoding === 'gb18030') return new TextDecoder('gb18030').decode(buf);
    return buf.toString('utf8');
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('请求超时');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 取出 var hq_str_xxx="a,b,c"; 里的字段数组；不是这个形状返回 null */
export function splitSina(text) {
  const m = /="([\s\S]*)"/.exec(text ?? '');
  if (!m) return null;
  return m[1].split(',');
}

/** 新浪「竖线分隔」串（部分接口用 | 而不是 ,） */
export function splitSinaPipe(text) {
  const m = /="([\s\S]*)"/.exec(text ?? '');
  if (!m) return null;
  return m[1].split('|');
}
