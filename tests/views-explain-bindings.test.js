// @vitest-environment jsdom
/* ================================================================== *
 * 解释卡的点击绑定（views/explanations/state.js bindExplainInteractions）
 *
 * 这段把点击映射成 action。断言的是「点哪个元素 → 派发哪个 action」，
 * 以及几个必须的容错：重复绑定、非元素目标、没有 handlers。
 * 纯状态机在 views-explanations.test.js 里验（那边不需要 DOM）。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { bindExplainInteractions } from '../src/client/views/explanations/state.js';

/* ================================================================== *
 * 交互绑定（bindExplainInteractions）
 *
 * 这段把点击映射成 action。断言的是「点哪个元素 → 派发哪个 action」，
 * 以及几个必须的容错：重复绑定、非元素目标、没有 getState。
 * ================================================================== */
describe('交互绑定', () => {
  const mount = (html) => {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  };

  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  it('切窗口派发 window，并带上目标窗口', () => {
    const root = mount('<button data-explain-window="5d">5日</button>');
    const events = [];
    bindExplainInteractions(root, () => ({ windowKey: 'session' }), { onChange: (s, a, p) => events.push([a, p]) });
    click(root.querySelector('[data-explain-window]'));
    expect(events).toEqual([['window', undefined]]);
    expect(events.length).toBe(1);
  });

  it('切版本派发 version 并带 versionId（回放是只读动作）', () => {
    const root = mount('<button data-explain-version="exp_1">v1</button>');
    const events = [];
    bindExplainInteractions(root, () => ({}), { onChange: (s, a, p) => events.push([a, p]) });
    click(root.querySelector('[data-explain-version]'));
    expect(events[0][0]).toBe('version');
    expect(events[0][1]).toEqual({ versionId: 'exp_1' });
  });

  it('回到当前派发 current，且状态已从回放切回', () => {
    const root = mount('<button data-explain-current="1">回到当前</button>');
    const events = [];
    bindExplainInteractions(root, () => ({ replay: { id: 'x' } }), { onChange: (s, a) => events.push([a, s]) });
    click(root.querySelector('[data-explain-current]'));
    expect(events[0][0]).toBe('current');
    expect(events[0][1].replay).toBeNull();
  });

  it('展开渠道派发 toggle 并翻转该渠道', () => {
    const root = mount('<button data-explain-toggle="f1">展开</button>');
    const events = [];
    bindExplainInteractions(root, () => ({ openFactors: new Set() }), { onChange: (s, a) => events.push([a, s]) });
    click(root.querySelector('[data-explain-toggle]'));
    expect(events[0][0]).toBe('toggle');
    expect(events[0][1].openFactors.has('f1')).toBe(true);
  });

  it('重试派发 refresh（不是重新生成一个版本）', () => {
    const root = mount('<button data-explain-retry="1">重试</button>');
    const events = [];
    bindExplainInteractions(root, () => ({ phase: 'error' }), { onChange: (s, a) => events.push([a, s]) });
    click(root.querySelector('[data-explain-retry]'));
    expect(events[0][0]).toBe('refresh');
  });

  it('点空白处不派发任何 action', () => {
    const root = mount('<div class="plain">文字</div>');
    const events = [];
    bindExplainInteractions(root, () => ({}), { onChange: (s, a) => events.push(a) });
    click(root.querySelector('.plain'));
    expect(events).toEqual([]);
  });

  it('重复绑定只生效一次（否则一次点击会派发两次）', () => {
    const root = mount('<button data-explain-window="5d">5日</button>');
    const events = [];
    bindExplainInteractions(root, () => ({}), { onChange: (s, a) => events.push(a) });
    bindExplainInteractions(root, () => ({}), { onChange: (s, a) => events.push(a) });
    click(root.querySelector('[data-explain-window]'));
    expect(events.length).toBe(1);
  });

  it('没有 root 或没有 handlers 时安全（绑定是可选的）', () => {
    expect(() => bindExplainInteractions(null, () => ({}), {})).not.toThrow();
    const root = mount('<button data-explain-window="5d">5日</button>');
    expect(() => click(root.querySelector('button'))).not.toThrow();
  });
});
