// @vitest-environment jsdom
/* ================================================================== *
 * 变化记录按钮真的能点开（产品 2.2 的挂载点）
 *
 * 之前的故障：`diffToggleHTML` 渲染了「和上一版差在哪？」和空插槽，
 * 但**没有任何人给插槽填内容** —— 用户点了什么都不会发生。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindExplainInteractions, fetchExplanationDiff } from '../src/client/views/explanations/state.js';

const state = { assetId: 'gold-intl', windowKey: 'session', explanation: { id: 'exp_2' }, history: [{ id: 'a' }, { id: 'b' }] };

const mount = () => {
  document.body.innerHTML = `
    <div id="root">
      <button type="button" data-explain-diff="exp_2" aria-expanded="false">和上一版差在哪？</button>
      <div data-explain-diff-slot="1"></div>
    </div>`;
  return document.getElementById('root');
};

const okFetch = async () => ({
  status: 200,
  json: async () => ({
    ok: true,
    status: 'ok',
    from: { id: 'exp_1' },
    to: { id: 'exp_2' },
    changes: [{ kind: 'verdict', label: '结论变了', from: 'consistent', to: 'mixed' }],
  }),
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('点开变化记录', () => {
  it('点一次取数并填进插槽（不是空壳）', async () => {
    const root = mount();
    bindExplainInteractions(root, () => state, { fetchImpl: okFetch, onChange: () => {} });
    const btn = root.querySelector('[data-explain-diff]');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    const slot = root.querySelector('[data-explain-diff-slot]');
    expect(slot.innerHTML).not.toBe('');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('再点一次收起，且插槽清空', async () => {
    const root = mount();
    bindExplainInteractions(root, () => state, { fetchImpl: okFetch, onChange: () => {} });
    const btn = root.querySelector('[data-explain-diff]');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(root.querySelector('[data-explain-diff-slot]').innerHTML).toBe('');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('收起后再点会重新取数（内容不会一直空着）', async () => {
    const root = mount();
    let calls = 0;
    const counting = async (...args) => { calls += 1; return okFetch(...args); };
    bindExplainInteractions(root, () => state, { fetchImpl: counting, onChange: () => {} });
    const btn = root.querySelector('[data-explain-diff]');
    for (let i = 0; i < 3; i += 1) {
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(calls).toBe(2); // 开、关、再开
  });

  it('取数失败时插槽里是可读说明，不是空白', async () => {
    const root = mount();
    bindExplainInteractions(root, () => state, {
      fetchImpl: async () => { throw new Error('502'); },
      onChange: () => {},
    });
    root.querySelector('[data-explain-diff]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(root.querySelector('[data-explain-diff-slot]').textContent.length).toBeGreaterThan(2);
  });

  it('没有插槽时点击不抛（卡片可能被部分渲染）', () => {
    document.body.innerHTML = '<div id="root"><button type="button" data-explain-diff="exp_2">x</button></div>';
    const root = document.getElementById('root');
    bindExplainInteractions(root, () => state, { fetchImpl: okFetch, onChange: () => {} });
    expect(() => root.querySelector('[data-explain-diff]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))).not.toThrow();
  });
});

describe('取数层', () => {
  it('缺 id 给 400', async () => {
    expect((await fetchExplanationDiff(null, { fetchImpl: okFetch })).status).toBe(400);
  });

  it('没有 fetch 给 503（不当成空数据）', async () => {
    const saved = globalThis.fetch;
    globalThis.fetch = undefined;
    const out = await fetchExplanationDiff('exp_1', {});
    globalThis.fetch = saved;
    expect(out.status).toBe(503);
  });

  it('带 with 参数时拼进查询串（对比指定版本）', async () => {
    let seen = null;
    await fetchExplanationDiff('exp_2', {
      withId: 'exp_1',
      fetchImpl: async (url) => { seen = url; return { status: 200, json: async () => ({}) }; },
    });
    expect(seen).toContain('with=exp_1');
  });
});

/* ================================================================== *
 * B3 回归：点击「和上一版差在哪？」要渲染 body，不是包一层的 {status, body}
 *
 * 故障形态：fetchExplanationDiff 返回 { status, body }，点击处理器却把
 * { status, body } 整个交给 diffPanelHTML —— 它期望的是 body 本身，于是
 * payload.status 恒为 200、payload.diff 恒为 undefined，任何响应都渲染成
 * 「变化记录暂时不可用」。这里从真实点击链路验两种响应。
 * ================================================================== */
describe('B3：点击后按 body 渲染（不再把 {status, body} 传给面板）', () => {
  const withFetch = (body) => async () => ({ status: 200, json: async () => body });

  it('status: no-previous 渲染「第一版」，不是「暂时不可用」', async () => {
    const root = mount();
    bindExplainInteractions(root, () => state, {
      fetchImpl: withFetch({ ok: true, status: 'no-previous', diff: null }),
      onChange: () => {},
    });
    root.querySelector('[data-explain-diff]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    const slot = root.querySelector('[data-explain-diff-slot]');
    expect(slot.querySelector('.dfd-panel--first')).toBeTruthy();
    expect(slot.textContent).toContain('第一版');
    expect(slot.textContent).not.toContain('变化记录暂时不可用');
  });

  it('带 diff 的响应渲染变化内容，不是「暂时不可用」', async () => {
    const root = mount();
    const body = {
      ok: true,
      status: 'ok',
      summary: '1 项数据事实变了',
      diff: {
        hasChanges: true,
        rulesChangedFlag: false,
        contentStatusChanged: null,
        hypotheses: [],
        facts: [{ kind: 'changed', key: 'TARGET_CHANGE', label: '本窗口变化', before: -0.13, after: -0.42 }],
        counts: { hypothesesChanged: 0, factsChanged: 1 },
      },
    };
    bindExplainInteractions(root, () => state, { fetchImpl: withFetch(body), onChange: () => {} });
    root.querySelector('[data-explain-diff]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    const slot = root.querySelector('[data-explain-diff-slot]');
    expect(slot.textContent).toContain('本窗口变化');
    expect(slot.textContent).toContain('1 项数据事实变了');
    expect(slot.textContent).not.toContain('变化记录暂时不可用');
  });

  it('接口失败时把 body 里的 error 显示出来（不再被 {status, body} 包住）', async () => {
    const root = mount();
    bindExplainInteractions(root, () => state, {
      fetchImpl: async () => { throw new Error('接口 503'); },
      onChange: () => {},
    });
    root.querySelector('[data-explain-diff]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    const slot = root.querySelector('[data-explain-diff-slot]');
    expect(slot.textContent).toContain('接口 503');
    expect(slot.textContent).not.toContain('变化记录暂时不可用');
  });
});
