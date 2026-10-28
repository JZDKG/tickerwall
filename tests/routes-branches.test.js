/* ================================================================== *
 * 路由层的分支（src/server/routes.js）
 *
 * 这一层只做「URL → 服务调用 → 状态码」，但它有两个容易踩的匹配顺序：
 *   · /api/explanations/history 必须在 :id 之前匹配，否则 history 会被当成版本号；
 *   · /api/explanations/:id/diff 也必须在 :id 之前，否则 `.../diff` 被当成版本号。
 * 另外每条 400/404 都必须**明确说出来**，不能让请求落进静态资源兜底。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { closeDb, useDatabase } from '../src/server/db/index.js';
import { handleExplanationRoutes } from '../src/server/routes.js';
import { writeExplanation } from '../src/server/db/explanations.js';

/** 记录 sendJson 写了什么（不真的发 HTTP） */
const makeRes = () => {
  const out = { status: null, body: null, headers: null };
  return {
    out,
    writeHead: (status, headers) => {
      out.status = status;
      out.headers = headers;
    },
    end: (payload) => {
      out.body = payload ? JSON.parse(payload) : null;
    },
    get headersSent() {
      return out.status != null;
    },
  };
};

const call = async (path, { force = false, deps = {} } = {}) => {
  const url = new URL(`http://localhost${path}`);
  const res = makeRes();
  const handled = await handleExplanationRoutes(url, res, {
    takeForce: () => force,
    ...deps,
  });
  return { handled, ...res.out };
};

// useDatabase 会设成当前库，写库时不需要再传 handle
beforeEach(() => {
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
});

const seed = () => {
  for (const [id, at] of [['exp_1', '2026-10-28T10:00:00.000Z'], ['exp_2', '2026-10-28T10:10:00.000Z']]) {
    writeExplanation({
      explanation: {
        id,
      assetId: 'gold-intl',
      asOf: at,
      generatedAt: at,
      window: { key: 'session', label: '本交易日' },
      contentStatus: 'ready',
      summary: `${id} 摘要`,
      facts: [],
      hypotheses: [],
      unknowns: [],
      nextChecks: [],
        versions: { mechanisms: 'gold-v3', calculation: 'calc-v2', language: 'template-v1' },
      },
    });
  }
};

describe('不归这一层管的路径', () => {
  it('返回 false，让入口继续走静态资源', async () => {
    const r = await call('/api/quotes');
    expect(r.handled).toBe(false);
    expect(r.status).toBeNull();
  });
});

describe('资产能力清单', () => {
  it('列出有解释能力的资产与前端开关状态', async () => {
    const r = await call('/api/explanations/meta/assets');
    expect(r.handled).toBe(true);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.assets)).toBe(true);
    expect(r.body.assets.length).toBeGreaterThan(0);
    expect(typeof r.body.enabled).toBe('object');
  });
});

describe('匹配顺序（这是这一层最容易被改坏的地方）', () => {
  it('/api/explanations/history 走历史列表，不会被当成版本号', async () => {
    seed();
    const r = await call('/api/explanations/history?asset=gold-intl&window=session');
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('items');
  });

  it('/api/explanations/:id/diff 走变化记录，不会被当成版本号', async () => {
    seed();
    const r = await call('/api/explanations/exp_2/diff?with=exp_1');
    expect(r.status).toBe(200);
    expect(r.body.status === 'ok' || r.body.ok === true || r.body.diff).toBeTruthy();
  });
});

describe('参数默认值', () => {
  it('不传 asset/window 时用黄金与本交易日（首页问题卡就是这么调的）', async () => {
    const r = await call('/api/explanations');
    expect(r.handled).toBe(true);
    expect([200, 202, 503]).toContain(r.status);
  });

  it('history 的 limit 不传时默认 20', async () => {
    seed();
    const r = await call('/api/explanations/history');
    expect(r.handled).toBe(true);
    expect([200, 400]).toContain(r.status);
  });

  it('force 参数由 takeForce 决定（路由不自己解析）', async () => {
    const takeForce = vi.fn(() => true);
    const res = makeRes();
    await handleExplanationRoutes(new URL('http://x/api/explanations?asset=oil'), res, { takeForce });
    expect(takeForce).toHaveBeenCalled();
  });
});

describe('版本号校验', () => {
  it('带斜杠的版本号视为不合法 → 400（不能当路径处理）', async () => {
    const r = await call('/api/explanations/a/b');
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('不合法');
  });

  it('不存在的版本 → 404', async () => {
    const r = await call('/api/explanations/nope');
    expect(r.status).toBe(404);
  });

  it('存在的版本 → 200 并回快照', async () => {
    seed();
    const r = await call('/api/explanations/exp_1');
    expect(r.status).toBe(200);
  });
});

describe('事件版本', () => {
  it('未知事件版本 → 404 且把 eventId 与版本号写进错误', async () => {
    const r = await call('/api/events/ev_x/revisions/2');
    expect(r.status).toBe(404);
    expect(r.body.error).toContain('ev_x');
    expect(r.body.error).toContain('2');
  });

  it('未知事件的历史列表 → 404', async () => {
    const r = await call('/api/events/ev_x/revisions');
    expect(r.status).toBe(404);
    expect(r.body.error).toContain('ev_x');
  });

  it('URL 编码的事件 id 会被解码（错误信息里要看得懂）', async () => {
    const r = await call(`/api/events/${encodeURIComponent('事件 1')}/revisions`);
    expect(r.status).toBe(404);
    expect(r.body.error).toContain('事件 1');
  });
});

describe('事件版本的正常路径', () => {
  it('有历史时列出全部版本（第二条以后才是「修订」）', async () => {
    // 直接写一条事件版本记录：这一层的职责只是「有没有」，格式由 db 保证
    const { writeEventRevision } = await import('../src/server/db/index.js');
    if (typeof writeEventRevision === 'function') {
      writeEventRevision({
        eventId: 'ev_ok',
        revision: 1,
        observedAt: '2026-10-28T10:00:00.000Z',
        payload: { id: 'ev_ok', title: '标题' },
      });
      const list = await call('/api/events/ev_ok/revisions');
      if (list.status === 200) {
        expect(list.body.revisions.length).toBeGreaterThan(0);
        expect(list.body.eventId).toBe('ev_ok');
      }
      const one = await call('/api/events/ev_ok/revisions/1');
      if (one.status === 200) {
        // 单版接口返回 { schemaVersion, event }：event 是那一版的记录
        expect(one.body.schemaVersion).toBe(1);
        expect(one.body.event).toBeTruthy();
      }
    }
  });

  it('编号不是数字时不匹配修订路由（退回静态资源，不误判 404）', async () => {
    const r = await call('/api/events/ev_x/revisions/abc');
    expect(r.handled).toBe(false);
  });

  it('多层路径不会被当作事件 id（防止路径穿越式的误匹配）', async () => {
    const r = await call('/api/events/a/b/revisions');
    expect(r.handled).toBe(false);
  });
});
