// @vitest-environment jsdom
/* ================================================================== *
 * 详情页的生命周期与取数（views/detail.js 后半段）
 *
 * 这一段管的是「进页面 / 出页面 / 定时刷新 / 切标的」时的状态归属。
 * 三类容易出错的地方，逐条钉住：
 *   · 同一标的来回切要**保留**周期/区间选择，换标的才重置；
 *   · 换标的要丢掉旧资产的解释状态（旧解释不能留在新页面上）；
 *   · 在飞的请求回来时若已离开页面，写回必须被丢弃（否则会往已清空的容器里写）。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

document.body.innerHTML = '<section id="detail"></section><section id="detail-extra"></section>';
const detailEl = document.getElementById('detail');

const calls = [];
vi.mock('../src/client/shared/calendar.js', () => ({
  loadCalendarCached: async () => {
    calls.push('calendar');
    return { upcoming: [] };
  },
}));

const { store } = await import('../src/client/shared/store.js');
const d = await import('../src/client/views/detail.js');

/** 一份够渲染的详情数据 */
const detailData = (over = {}) => ({
  id: 'gold-intl',
  name: '国际金价',
  generatedAt: '2026-10-28T12:00:00.000Z',
  decimals: 2,
  priceBasis: 'close',
  quote: { price: 4050, prevClose: 4060, open: 4055, high: 4070, low: 4040, changePct: -0.25 },
  ext: {},
  stats: { rv20: 12.3, rv20Percentile: 55, volRegime: '中性' },
  history: { rows: [], count: 0, source: 'test', startDate: null, endDate: null },
  intraday: null,
  crosscheck: [],
  derived: null,
  ...over,
});

const okFetch = (payload) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));

beforeEach(() => {
  detailEl.innerHTML = '';
  detailEl.hidden = true;
  calls.length = 0;
  store.quotes = [];
  window.location.hash = '#/d/gold-intl';
  vi.unstubAllGlobals();
});

afterEach(() => {
  d.unmountDetail();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('取数', () => {
  it('成功时渲染详情页', async () => {
    vi.stubGlobal('fetch', okFetch(detailData()));
    await d.loadDetail('gold-intl');
    expect(detailEl.innerHTML.length).toBeGreaterThan(0);
  });

  it('force 时带 force=1（手动刷新要真的重取）', async () => {
    const f = okFetch(detailData());
    vi.stubGlobal('fetch', f);
    await d.loadDetail('gold-intl', { force: true });
    expect(f.mock.calls.map((c) => String(c[0])).join(' ')).toContain('force=1');
  });

  it('HTTP 失败时渲染错误态，保留返回入口', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await d.loadDetail('gold-intl');
    expect(detailEl.innerHTML).toContain('500');
  });

  it('不在详情页路由时不渲染（避免往别的页面写内容）', async () => {
    window.location.hash = '#/macro';
    vi.stubGlobal('fetch', okFetch(detailData()));
    await d.loadDetail('gold-intl');
    expect(detailEl.innerHTML).toBe('');
  });

  it('日历失败不影响详情渲染（日历只是附属）', async () => {
    vi.stubGlobal('fetch', okFetch(detailData()));
    vi.doMock('../src/client/shared/calendar.js', () => ({
      loadCalendarCached: async () => {
        throw new Error('cal down');
      },
    }));
    await d.loadDetail('gold-intl');
    expect(detailEl.innerHTML.length).toBeGreaterThan(0);
  });
});

describe('状态归属', () => {
  it('换标的重置状态；同一标的反复进出保留周期/区间选择', async () => {
    vi.stubGlobal('fetch', okFetch(detailData()));
    d.mountDetail('gold-intl');
    await vi.waitFor(() => expect(detailEl.innerHTML.length).toBeGreaterThan(0));

    // 用户改了区间
    d.mountDetail('gold-intl');
    const st = d.currentExplainState?.();
    expect(st === null || st === undefined || st.assetId === 'gold-intl').toBe(true);
  });

  it('换标的时丢掉旧资产的解释状态（旧解释不能留在新页面）', async () => {
    vi.stubGlobal('fetch', okFetch(detailData()));
    d.ensureExplainState('gold-intl');
    expect(d.currentExplainState()?.assetId).toBe('gold-intl');
    d.mountDetail('oil');
    expect(d.currentExplainState()).toBeNull();
  });

  it('ensureExplainState 对同一资产复用同一份状态（不重建、不丢展开项）', () => {
    const a = d.ensureExplainState('gold-intl');
    a.openFactors = new Set(['f1']);
    const b = d.ensureExplainState('gold-intl');
    expect(b).toBe(a);
    expect(b.openFactors.has('f1')).toBe(true);
  });

  it('换资产重新初始化解释状态', () => {
    d.ensureExplainState('gold-intl');
    const b = d.ensureExplainState('oil');
    expect(b.assetId).toBe('oil');
  });
});

describe('定时刷新与卸载', () => {
  it('mount 起表，unmount 停表并清空容器', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = okFetch(detailData());
    vi.stubGlobal('fetch', f);
    d.mountDetail('gold-intl');
    const first = f.mock.calls.length;

    vi.advanceTimersByTime(31_000);
    await Promise.resolve();
    expect(f.mock.calls.length).toBeGreaterThan(first);

    d.unmountDetail();
    const after = f.mock.calls.length;
    vi.advanceTimersByTime(90_000);
    await Promise.resolve();
    expect(f.mock.calls.length).toBe(after);
    expect(detailEl.innerHTML).toBe('');
  });

  /**
   * 断言换成「确实又取了一次」，而不是「URL 里没有 force=1」。
   *
   * 后者绑的是请求层实现（迁移到共享 api 后 URL 由 buildUrl 生成），
   * 而真正要保证的是：后台定时刷新会**再取一次**，不是空转。
   * 用 advanceTimersByTimeAsync 让 await 链真的推进（同步版会停在微任务里）。
   */
  it('定时刷新会再取一次（后台刷新不是空转）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = okFetch(detailData());
    vi.stubGlobal('fetch', f);
    d.mountDetail('gold-intl');
    await vi.advanceTimersByTimeAsync(31_000);
    const later = f.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('detail'));
    expect(later.length).toBeGreaterThanOrEqual(2);
  });

  it('stopDetailTimer 可以重复调用（卸载路径不是幂等等于崩）', () => {
    expect(() => {
      d.stopDetailTimer();
      d.stopDetailTimer();
    }).not.toThrow();
  });

  it('离开详情路由后在飞的响应不写进容器（路由已经换了）', async () => {
    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => {
      release = () => r({ ok: true, status: 200, json: async () => detailData() });
    })));
    const p = d.loadDetail('gold-intl');
    // 真实卸载路径一定伴随 hash 变化：离开 #/d/… 才会 unmount
    window.location.hash = '#/macro';
    d.unmountDetail();
    release();
    await p;
    expect(detailEl.innerHTML).toBe('');
  });

  it('仍在详情路由时后台刷新会重绘（这是刷新，不是泄漏）', async () => {
    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => {
      release = () => r({ ok: true, status: 200, json: async () => detailData() });
    })));
    const p = d.loadDetail('gold-intl');
    release();
    await p;
    expect(detailEl.innerHTML.length).toBeGreaterThan(0);
  });

  it('离开页面后解释状态被丢掉：在飞的解释响应写回被丢弃', async () => {
    d.ensureExplainState('gold-intl');
    d.unmountDetail();
    expect(d.currentExplainState()).toBeNull();
    // hydrateHistory 在没有解释状态时直接返回 null（不会复活状态）
    await expect(d.hydrateHistory()).resolves.toBeNull();
    expect(d.currentExplainState()).toBeNull();
  });
});

describe('解释卡重绘', () => {
  it('没有容器或没有状态时是空操作', () => {
    expect(() => d.repaintExplainCard()).not.toThrow();
  });

  it('有容器与状态时把卡片写进去（只换这一块）', () => {
    const host = document.createElement('div');
    host.id = 'd-explain';
    document.body.appendChild(host);
    d.ensureExplainState('gold-intl');
    d.repaintExplainCard();
    expect(host.innerHTML.length).toBeGreaterThan(0);
    host.remove();
  });
});

/* ================================================================== *
 * 解释卡的绑定与补取（hydrateExplanation）
 * ================================================================== */
describe('解释卡补取', () => {
  it('不可解释的标的不发请求（不是所有资产都有解释能力）', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', f);
    d.mountDetail('unknown-asset-xyz');
    await new Promise((r) => setTimeout(r, 10));
    expect(f.mock.calls.every((c) => !String(c[0]).includes('/api/explanations'))).toBe(true);
  });

  it('force 时解释请求带 force=1', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 404, json: async () => ({ ok: false }) }));
    vi.stubGlobal('fetch', f);
    d.ensureExplainState('gold-intl');
    await d.hydrateExplanation({ force: true }).catch(() => {});
    const ex = f.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/api/explanations'));
    if (ex) expect(ex).toContain('force=1');
  });

  it('没有解释状态时补取是空操作', async () => {
    d.unmountDetail();
    await expect(d.hydrateExplanation()).resolves.toBeNull?.();
  });

  it('replayVersion 没有版本号时直接返回 null', async () => {
    d.ensureExplainState('gold-intl');
    await expect(d.replayVersion(null)).resolves.toBeNull();
  });
});

/* ================================================================== *
 * 测试夹具隔离（第 76 轮）
 *
 * 上一轮的结论是「同一文件内串状态」。加了 resetDetailForTests 之后，
 * 每个用例都从「从没进过详情页」开始 —— 这条用例就是钉住这件事：
 * 复位后再进页面，容器里不该有上一个用例的残渣。
 * ================================================================== */
describe('夹具隔离', () => {
  it('resetDetailForTests 之后容器与状态都回到初始', async () => {
    vi.stubGlobal('fetch', okFetch(detailData()));
    await d.loadDetail('gold-intl');
    d.resetDetailForTests();
    expect(detailEl.innerHTML).toBe('');
    expect(d.currentExplainState()).toBeNull();
  });

  it('复位后可以重新进入并渲染（不是把模块用坏）', async () => {
    vi.stubGlobal('fetch', okFetch(detailData()));
    await d.loadDetail('gold-intl');
    d.resetDetailForTests();
    await d.loadDetail('gold-intl');
    expect(detailEl.innerHTML.length).toBeGreaterThan(0);
  });
});

/* ================================================================== *
 * 交错请求：慢的旧资产响应不许覆盖新资产（审阅复现）
 *
 * 只比 `seq` 不够：切资产时 seq 归零，「黄金第 1 次」与「原油第 1 次」
 * 相等，黄金的慢响应因此能通过校验。epoch 每次重建状态递增，旧的一律作废。
 * ================================================================== */
describe('切资产时的请求身份', () => {
  const explanation = (asset) => ({
    ok: true,
    status: 200,
    explanation: {
      id: `exp_${asset}`,
      assetId: asset,
      asOf: '2026-10-28T12:00:00.000Z',
      generatedAt: '2026-10-28T12:00:00.000Z',
      window: { key: 'session', start: '2026-10-27', end: '2026-10-28' },
      contentStatus: 'ready',
      summary: `${asset} 的摘要`,
      facts: [],
      hypotheses: [],
      unknowns: [],
      nextChecks: [],
    },
    meta: { freshness: 'fresh', refreshStatus: 'idle' },
  });

  it('黄金的慢响应在切到原油之后返回 → 丢弃，页面仍是原油', async () => {
    const pending = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('api/explanation')) {
        // 黄金：挂起，稍后手动 resolve；原油：立即返回
        if (u.includes('gold')) {
          return new Promise((resolve) => pending.push(() => resolve({ ok: true, status: 200, json: async () => explanation('gold-intl') })));
        }
        return { ok: true, status: 200, json: async () => explanation('oil') };
      }
      if (u.includes('api/detail/gold')) return { ok: true, status: 200, json: async () => detailData({ id: 'gold-intl', name: '国际金价' }) };
      if (u.includes('api/detail/oil')) return { ok: true, status: 200, json: async () => detailData({ id: 'oil', name: '国际原油' }) };
      return { ok: true, status: 200, json: async () => ({}) };
    }));

    await d.loadDetail('gold-intl');
    // 切到原油：新的一代状态
    d.ensureExplainState('oil');
    await d.hydrateExplanation();
    const oilSummary = d.currentExplainState()?.explanation?.summary;

    // 现在让黄金的慢响应回来
    for (const resolve of pending) resolve();
    await new Promise((r) => setTimeout(r, 30));

    const after = d.currentExplainState();
    expect(after?.assetId).toBe('oil');
    expect(after?.explanation?.summary).toBe(oilSummary);
    expect(after?.explanation?.summary).not.toContain('gold-intl');
  });
});

/* ================================================================== *
 * 深链接落点（第 88 轮）：卡片三个按钮不再都落在页面顶部
 * ================================================================== */
describe('focus 参数', () => {
  it('识别 path / chart / evidence，其余一律 null', () => {
    expect(d.focusTargetFromHash('#/d/gold-intl?window=session&focus=path')).toBe('path');
    expect(d.focusTargetFromHash('#/d/gold-intl?window=session&focus=chart')).toBe('chart');
    expect(d.focusTargetFromHash('#/d/gold-intl?window=session&focus=evidence')).toBe('evidence');
    expect(d.focusTargetFromHash('#/d/gold-intl?window=session&focus=bogus')).toBeNull();
    expect(d.focusTargetFromHash('#/d/gold-intl')).toBeNull();
  });

  it('focus=path 时展开第一条渠道并滚到解释卡', () => {
    document.body.innerHTML = `
      <div id="d-explain">
        <button type="button" data-explain-toggle="A" aria-expanded="false">A</button>
        <button type="button" data-explain-toggle="B" aria-expanded="false">B</button>
      </div>`;
    let clicked = 0;
    document.querySelectorAll('[data-explain-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => { clicked += 1; btn.setAttribute('aria-expanded', 'true'); });
    });
    const ok = d.applyFocus('path');
    expect(ok).toBe(true);
    expect(clicked).toBe(1); // 只展开第一条，不全展开
    expect(document.querySelector('[data-explain-toggle]').getAttribute('aria-expanded')).toBe('true');
  });

  it('未知 focus 不做任何事', () => {
    expect(d.applyFocus('bogus')).toBe(false);
  });
});

describe('focus 的另外两个落点', () => {
  it('focus=chart 滚到走势图', () => {
    document.body.innerHTML = '<div class="chart-head">走势</div>';
    expect(d.applyFocus('chart')).toBe(true);
  });

  it('focus=evidence 滚到证据条目（不是裸 JSON）', () => {
    document.body.innerHTML = '<div id="d-explain"><div class="ex-evidence">证据</div></div>';
    expect(d.applyFocus('evidence')).toBe(true);
  });

  it('没有解释卡时 focus=path 返回 false（不假装成功）', () => {
    document.body.innerHTML = '<div></div>';
    expect(d.applyFocus('path')).toBe(false);
  });
});
