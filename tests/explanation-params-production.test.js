/* ================================================================== *
 * 解释取数：参数在生产路径必须真的发出去（真实浏览器暴露过的克隆 bug）
 *
 * 故障形态：`state.js` 用 `query` 传参（与旧 URL 逐字节一致），
 * 而 `fetch-json.js` 的生产分支只用了 `params` —— 于是浏览器发出的是
 * 无参数的 `GET /api/explanations`，服务端默认回落 gold-intl，
 * 再加上 api 的并发合并，首屏三张问题卡全成了黄金的克隆：
 *   跌幅都 0.14%、来源快照 id 都是 exp_gold-intl_session_…
 *
 * 单元测试全走注入路径（fetchImpl），所以一条都挡不住。
 * 这里专门断言**生产路径**的 URL。
 * ================================================================== */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchExplanation, fetchExplanationDiff } from '../src/client/views/explanations/state.js';
import { loadExplanationHistory, loadExplanationVersion } from '../src/client/views/explanations/history.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const stub = () => {
  const seen = [];
  vi.stubGlobal('fetch', vi.fn(async (u) => {
    seen.push(String(u));
    return { ok: true, status: 200, json: async () => ({ ok: true, items: [] }) };
  }));
  return seen;
};

describe('解释取数的生产 URL', () => {
  it('fetchExplanation 带上 asset 与 window（不是裸 /api/explanations）', async () => {
    const seen = stub();
    await fetchExplanation({ assetId: 'oil', windowKey: 'session' });
    expect(seen[0]).toContain('asset=oil');
    expect(seen[0]).toContain('window=session');
  });

  it('两个不同资产发出的 URL 不同（否则一定会拿到同一个快照）', async () => {
    const seen = stub();
    await fetchExplanation({ assetId: 'oil', windowKey: 'session' });
    await fetchExplanation({ assetId: 'dxy', windowKey: 'session' });
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('fetchExplanation 的 force 会变成 force=1', async () => {
    const seen = stub();
    await fetchExplanation({ assetId: 'gold-intl', windowKey: 'session', force: true });
    expect(seen[0]).toContain('force=1');
  });

  it('fetchExplanationDiff 带 with 参数', async () => {
    const seen = stub();
    await fetchExplanationDiff('exp_1', { withId: 'exp_0' });
    expect(seen[0]).toContain('with=exp_0');
  });

  it('loadExplanationHistory 带 asset / window / limit', async () => {
    const seen = stub();
    await loadExplanationHistory({ assetId: 'oil', windowKey: '5d', limit: 3 });
    expect(seen[0]).toContain('asset=oil');
    expect(seen[0]).toContain('window=5d');
    expect(seen[0]).toContain('limit=3');
  });

  it('loadExplanationVersion 指向具体快照 id', async () => {
    const seen = stub();
    await loadExplanationVersion('exp_oil_session_abc');
    expect(seen[0]).toContain('exp_oil_session_abc');
  });
});
