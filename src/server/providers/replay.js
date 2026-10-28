/* ================================================================== *
 * 上游响应录制 / 回放
 *
 * 目的：拆服务层时需要一个「上游冻结」的等价性基准。实时源每 15 秒就变，
 * 拿它比对新旧实现只能看到行情漂移，看不出代码差异。
 *
 * 用法（环境变量，零代码侵入）：
 *   PROVIDER_RECORD=/tmp/fx.jsonl   node server.mjs   # 录制：真实抓取并落盘
 *   PROVIDER_REPLAY=/tmp/fx.jsonl   node server.mjs   # 回放：只读文件，不联网
 *
 * 回放命中不到 URL 时直接抛错而不是回退真实网络 —— 宁可测试挂号，
 * 也不要悄悄联网让「确定性」变成一句空话。
 * ================================================================== */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * 键的三段：`METHOD 规范化URL [b:body摘要] [h:语义头摘要] [a:present]`
 *
 * 为什么不是「body 长度」：长度相同的不同请求体会撞同一个键，回放时把 A 的
 * 响应当成 B 的响应喂回去 —— 这种错不会抛异常，只会让结论悄悄错掉。
 *
 * 为什么不把整个 header 都算进去：`cookie`、`authorization` 这类凭据绝不能进
 * 夹具（会随仓库流出）。所以只把**影响响应内容**的头（accept / content-type /
 * referer / user-agent / x-requested-with）折成摘要，凭据只记「有没有」。
 */

/** 参与语义摘要的请求头（小写）。加新头前先确认它真的会改变响应内容。 */
const SEMANTIC_HEADERS = ['accept', 'content-type', 'referer', 'user-agent', 'x-requested-with'];
/** 只记存在性、绝不记值的凭据头 */
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'x-api-key'];

function sha(s, len = 16) {
  return createHash('sha256').update(s).digest('hex').slice(0, len);
}

/**
 * URL 规范化：去掉 fragment、统一大小写、排序查询串。
 * 不排序的话，同一组参数换个顺序就会变成两次不同请求 —— 回放文件里全是重复样本。
 */
export function canonicalUrl(url) {
  const raw = String(url ?? '');
  try {
    const u = new URL(raw);
    u.hash = '';
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    const pairs = [...u.searchParams.entries()].sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
    const qs = new URLSearchParams(pairs).toString();
    return `${u.origin}${u.pathname}${qs ? `?${qs}` : ''}`;
  } catch {
    // 不是合法 URL（测试里的相对路径等）就原样用，别把键搞炸
    return raw;
  }
}

/** 请求体摘要：字符串、Buffer、URLSearchParams、普通对象都归一成同一串再哈希 */
function bodyDigest(body) {
  if (body == null || body === '') return '';
  let text;
  if (typeof body === 'string') text = body;
  else if (Buffer.isBuffer(body)) text = body.toString('base64');
  else if (body instanceof URLSearchParams) text = body.toString();
  else if (body instanceof ArrayBuffer) text = Buffer.from(body).toString('base64');
  else if (ArrayBuffer.isView(body)) text = Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('base64');
  else {
    try {
      text = JSON.stringify(body);
    } catch {
      text = String(body);
    }
  }
  return sha(text);
}

/** 语义头摘要 + 凭据存在性 */
export function headerSignature(headers) {
  if (!headers) return { digest: '', credential: false };
  const h = headers instanceof Map ? Object.fromEntries(headers) : headers;
  const low = {};
  for (const [k, v] of Object.entries(h ?? {})) low[String(k).toLowerCase()] = String(v);
  const parts = SEMANTIC_HEADERS.filter((k) => low[k] != null && low[k] !== '').map((k) => `${k}=${low[k]}`);
  return {
    digest: parts.length ? sha(parts.join('\n'), 12) : '',
    credential: CREDENTIAL_HEADERS.some((k) => low[k] != null && low[k] !== ''),
  };
}

/**
 * 请求键。无 body、无语义头的 GET 仍是一句 `GET url` —— 夹具保持可读，
 * 老录制文件不用重写。
 */
export function requestKey(method, url, body, headers) {
  const m = String(method ?? 'GET').toUpperCase();
  const parts = [`${m} ${canonicalUrl(url)}`];
  const b = bodyDigest(body);
  if (b) parts.push(`b:${b}`);
  const { digest, credential } = headerSignature(headers);
  if (digest) parts.push(`h:${digest}`);
  if (credential) parts.push('a:present');
  return parts.join(' ');
}

const keyOf = requestKey;

/** 读 JSONL 录制文件 → Map<key, { status, b64 }> */
export function loadFixtures(file) {
  const map = new Map();
  if (!file || !existsSync(file)) return map;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec?.url) map.set(rec.key ?? keyOf(rec.method, rec.url, rec.body), rec);
    } catch {
      /* 跳过坏行 */
    }
  }
  return map;
}

/** 造一个够 fetchRaw 用的小响应对象 */
function makeResponse({ status, b64 }) {
  const buf = Buffer.from(b64 ?? '', 'base64');
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf,
  };
}

/**
 * 装一个回放 / 录制 fetcher。
 * @param {object} opts
 * @param {string} [opts.replay] 回放文件
 * @param {string} [opts.record] 录制输出文件
 * @param {Function} [opts.fallback] 录制模式下的真实 fetch
 */
export function makeReplayFetcher({ replay, record, fallback }) {
  /**
   * 指定了回放文件却读不到 → 立刻失败。
   *
   * 静默变成空 Map 的后果是：跑起来一切正常，直到第一个请求才报「缺响应」，
   * 而那时你已经在看一份看起来跑通的报告了。
   */
  if (replay && !existsSync(replay)) {
    throw new Error(`回放文件不存在：${replay}`);
  }
  const fixtures = loadFixtures(replay);
  const real = fallback ?? ((...args) => fetch(...args));
  const stats = { hit: 0, miss: 0, recorded: 0 };

  const fetcher = async (url, opts = {}) => {
    const key = requestKey(opts.method, url, opts.body, opts.headers);

    if (replay) {
      const hit = fixtures.get(key);
      if (!hit) {
        stats.miss += 1;
        throw new Error(`回放缺少响应：${key}`);
      }
      stats.hit += 1;
      return makeResponse(hit);
    }

    // 录制模式：真实抓取，落盘，并原样返回
    const res = await real(url, opts);
    const buf = Buffer.from(await res.clone ? await res.clone().arrayBuffer() : await res.arrayBuffer());
    if (record) {
      appendFileSync(
        record,
        `${JSON.stringify({
          key,
          method: opts.method ?? 'GET',
          url: canonicalUrl(url),
          bodyDigest: bodyDigest(opts.body) || null,
          headerDigest: headerSignature(opts.headers).digest || null,
          status: res.status,
          b64: buf.toString('base64'),
        })}\n`,
        'utf8',
      );
      stats.recorded += 1;
    }
    return {
      ok: res.ok,
      status: res.status,
      text: async () => buf.toString('utf8'),
      arrayBuffer: async () => buf,
    };
  };

  fetcher.stats = stats;
  fetcher.fixtureCount = fixtures.size;
  return fetcher;
}
