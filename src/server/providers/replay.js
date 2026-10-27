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

/** 按方法 + URL 归一化键；body 参与哈希以避免同名不同体 */
function keyOf(method, url, body) {
  const m = String(method ?? 'GET').toUpperCase();
  return body == null ? `${m} ${url}` : `${m} ${url} #${String(body).length}`;
}

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
  const fixtures = loadFixtures(replay);
  const real = fallback ?? ((...args) => fetch(...args));
  const stats = { hit: 0, miss: 0, recorded: 0 };

  const fetcher = async (url, opts = {}) => {
    const key = keyOf(opts.method, url, opts.body);

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
        `${JSON.stringify({ key, method: opts.method ?? 'GET', url, status: res.status, b64: buf.toString('base64') })}\n`,
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
