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
