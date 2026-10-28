/* ================================================================== *
 * 生活场景服务层（产品 2.6）
 *
 * 上游取不到时**照样返回路径**：机制说明不依赖实时数据，
 * 藏起整页反而更糟。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { getLifePath } from '../src/server/services/life-path.service.js';

const withQuotes = (items) => async () => ({ items });

describe('上游接入', () => {
  it('把原油的方向接到头条上', async () => {
    const out = await getLifePath({ deps: { getQuotes: withQuotes([{ id: 'oil', ok: true, changePct: 2.4 }]) } });
    expect(out.headline).toContain('上行');
    expect(out.upstreamError).toBeNull();
  });

  it('上游下行时说下行', async () => {
    const out = await getLifePath({ deps: { getQuotes: withQuotes([{ id: 'oil', ok: true, changePct: -1 }]) } });
    expect(out.headline).toContain('下行');
  });

  it('上游缺失时路径照常返回，头条说「没有明显方向」', async () => {
    const out = await getLifePath({ deps: { getQuotes: withQuotes([]) } });
    expect(out.ok).toBe(true);
    expect(out.headline).toContain('没有明显方向');
  });

  it('上游标的 ok=false 时不拿它的数字当方向', async () => {
    const out = await getLifePath({ deps: { getQuotes: withQuotes([{ id: 'oil', ok: false, changePct: 9 }]) } });
    expect(out.headline).toContain('没有明显方向');
  });

  it('取数抛错时仍返回机制，并记下 upstreamError（不藏整页）', async () => {
    const out = await getLifePath({ deps: { getQuotes: async () => { throw new Error('502'); } } });
    expect(out.ok).toBe(true);
    expect(out.steps.length).toBeGreaterThan(3);
    expect(out.upstreamError).toContain('502');
  });

  it('payload 直接是数组时也能处理（两种返回形态）', async () => {
    const out = await getLifePath({ deps: { getQuotes: async () => [{ id: 'oil', ok: true, changePct: 1 }] } });
    expect(out.headline).toContain('上行');
  });

  it('未知场景给 ok=false 并带回可用清单', async () => {
    const out = await getLifePath({ scenario: 'nope', deps: { getQuotes: withQuotes([]) } });
    expect(out.ok).toBe(false);
    expect(out.scenarios.length).toBe(1);
  });

  it('回传场景清单（入口据此渲染）', async () => {
    const out = await getLifePath({ deps: { getQuotes: withQuotes([]) } });
    expect(out.scenarios[0].id).toBe('fuel-cost');
  });
});
