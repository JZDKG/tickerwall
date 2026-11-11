/* ================================================================== *
 * Phase 1 / P1-T2：BLS Public Data API v2 适配器
 *
 * 官方 v2 端点：POST https://api.bls.gov/publicAPI/v2/timeseries/data/
 * 匿名可用（限额更低），配置 BLS_API_KEY 时作为 registrationKey 注入。
 *
 * 只做一件事：把一条序列的最近两期数值整理成 { latest, previous }，
 * 供日历给「预期与实际」台账填 actual / previous。不在这里判超预期 ——
 * 判定口径只在 domain/expectation-sources.js 一处。
 * ================================================================== */

import { fetchRaw } from '../providers/http.js';

export const BLS_API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

/** 四个核心序列：CPI、核心 CPI、非农就业、失业率 */
export const BLS_SERIES = {
  CUUR0000SA0: { kind: 'cpi', title: 'CPI 同比', unit: '%', decimals: 1 },
  CUUR0000SA0L1E: { kind: 'core-cpi', title: '核心 CPI 同比', unit: '%', decimals: 1 },
  CES0000000001: { kind: 'nfp', title: '非农就业', unit: '千人', decimals: 0 },
  LNS14000000: { kind: 'unemployment', title: '失业率', unit: '%', decimals: 1 },
};

/**
 * 拉一条序列最近两期数值。
 *
 * @param {string} seriesId
 * @param {{ limit?:number, startYear?:string, endYear?:string, fetcher?:Function }} [opts]
 * @returns {Promise<{seriesId:string, latest:number|null, previous:number|null, values:number[]}>}
 */
export async function fetchBlsSeries(seriesId, opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || 2);
  const nowYear = new Date().getUTCFullYear();
  const body = {
    seriesid: [seriesId],
    startyear: String(opts.startYear ?? nowYear - 1),
    endyear: String(opts.endYear ?? nowYear),
  };
  const key = String(process.env.BLS_API_KEY ?? '').trim();
  if (key) body.registrationKey = key;

  const fetcher = opts.fetcher ?? fetchRaw;
  const text = await fetcher(BLS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 25_000,
  });
  let payload;
  try {
    payload = JSON.parse(String(text ?? ''));
  } catch {
    throw new Error('BLS v2 JSON 解析失败');
  }
  if (payload?.status && payload.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS v2 返回 ${payload.status}：${(payload.message ?? []).join('；')}`);
  }
  const data = payload?.Results?.series?.[0]?.data ?? [];
  // v2 的 data 是最新在前；value 可能是 "."（尚未发布）
  const values = data
    .map((d) => Number(String(d?.value ?? '').replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
    .slice(0, Math.max(2, limit));
  return {
    seriesId,
    latest: values[0] ?? null,
    previous: values[1] ?? null,
    values,
  };
}

/**
 * 一次性把四个核心序列 + FRED DFF/DFEDTARU 的最新值整理成 kind → 数值表。
 * 单个源失败不影响其他源，用 Promise.allSettled 逐条降级。
 */
export async function fetchReleaseNumbers({ fetcher = fetchRaw, fredFetch = null } = {}) {
  const out = {};
  const jobs = [
    ...Object.entries(BLS_SERIES).map(async ([id, def]) => {
      const got = await fetchBlsSeries(id, { fetcher });
      if (got.latest == null) return;
      out[def.kind] = {
        actual: got.latest,
        previous: got.previous,
        unit: def.unit,
        source: `bls:${id}`,
      };
    }),
  ];
  // FRED 的联邦基金利率与目标上限：优先官方 JSON API（有 Key 时），无 Key 回退 CSV
  if (fredFetch) {
    for (const [id, kind] of [['DFF', 'fed-funds'], ['DFEDTARU', 'fed-target']]) {
      jobs.push(
        fredFetch(id, { limit: 3, fetcher })
          .then((parsed) => {
            const rows = parsed?.rows ?? [];
            const last = rows[rows.length - 1]?.close;
            if (!Number.isFinite(last)) return;
            out[kind] = {
              actual: last,
              previous: rows[rows.length - 2]?.close ?? null,
              unit: '%',
              source: `fred:${id}`,
            };
          })
          .catch(() => {}),
      );
    }
  }
  await Promise.allSettled(jobs);
  return out;
}
