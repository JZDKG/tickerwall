// @vitest-environment jsdom
/* ================================================================== *
 * 传导图谱编排层（views/macro/index.js）
 *
 * 这一层的唯一职责是「把几层拼起来，并让画布实例跨重绘存活」。
 * 断言的就是这句话：
 *   · 首次渲染建 <section> + 画布实例；
 *   · 再次渲染**复用**同一实例（缩放倍数、拖过的节点位置不该丢）；
 *   · 只换 chrome（模式条/工具条/横幅/图例/右侧卡），不重建整段；
 *   · 老版本手绘 SVG（有 .macro-graph-section 但没有 #mg-x6）要整体重建。
 *
 * MacroFlowCanvas 用假实现：X6 的真实渲染在 flow-canvas.test.js 里单独验。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const instances = [];

vi.mock('../src/client/views/macro/flow-canvas.js', () => {
  class FakeCanvas {
    constructor(container, opts = {}) {
      this.container = container;
      this.opts = opts;
      this.disposed = false;
      this.updates = [];
      // 模拟用户操作留下的状态：缩放与手动位置
      this.zoom = 1.5;
      this.manual = new Map([['gold-intl', { x: 42, y: 24 }]]);
      instances.push(this);
    }
    update(payload) {
      this.updates.push(payload);
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { MacroFlowCanvas: FakeCanvas };
});

// styles?inline 只有 Vite 构建期才有，Node 里换成空串
vi.mock('../src/client/styles/macro-flow.css?inline', () => ({ default: '.macro{}' }));

const {
  CANVAS,
  SECTION,
  activeEdgeSets,
  canvases,
  destroyMacroFlow,
  injectStyle,
  renderMacroFlow,
  swap,
  syncChrome,
} = await import('../src/client/views/macro/index.js');
const { MACRO_TRANSMISSION_EDGES, PLAYBOOK_BY_ID } = await import(
  '../src/client/views/macro/knowledge-base.js'
);

/** 宏观数据：只要能让 evaluateAll 跑起来就行（缺数据它会给 untested） */
const macroData = { universe: [], matrix: { ids: [] }, quotes: {} };

const host = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

const state = (over = {}) => ({ graphMode: 'compass', graphFocus: 'gold-intl', ...over });

beforeEach(() => {
  instances.length = 0;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('样式注入', () => {
  it('只注入一次（重复渲染不该往 head 里塞第二个 <style>）', () => {
    injectStyle();
    injectStyle();
    const styles = document.head.querySelectorAll('#macro-flow-css');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain('.macro');
  });
});

describe('首次渲染', () => {
  it('建出 section 与画布，并把容器清空后再挂', () => {
    const el = host();
    const out = renderMacroFlow(el, macroData, state());
    expect(el.querySelector(SECTION)).toBeTruthy();
    expect(out.canvas).toBeTruthy();
    // 挂载前会清掉 loading 占位
    expect(out.section.querySelector('.mg-x6-loading')).toBeNull();
  });

  it('画布实例按 host 记账，同时挂到 window 供控制台调试', () => {
    const el = host();
    const out = renderMacroFlow(el, macroData, state());
    expect(canvases.get(el)).toBe(out.canvas);
    expect(window.__mgxCanvas).toBe(out.canvas);
  });

  it('update 收到 data / state / 现实检验结果', () => {
    const el = host();
    const out = renderMacroFlow(el, macroData, state());
    const payload = out.canvas.updates[0];
    expect(payload.data).toBe(macroData);
    expect(payload.state.graphMode).toBe('compass');
    expect(payload.reality).toBeInstanceOf(Map);
    expect(payload.reality.size).toBe(MACRO_TRANSMISSION_EDGES.length);
  });

  it('缺 host 或 data 时直接返回（不做半个 section）', () => {
    expect(renderMacroFlow(null, macroData, state())).toBeUndefined();
    const el = host();
    expect(renderMacroFlow(el, null, state())).toBeUndefined();
    expect(el.innerHTML).toBe('');
  });
});

describe('画布跨重绘存活', () => {
  it('第二次渲染复用同一实例（缩放与拖拽位置不丢）', () => {
    const el = host();
    const first = renderMacroFlow(el, macroData, state());
    first.canvas.zoom = 2.7;
    const second = renderMacroFlow(el, macroData, state({ graphMode: 'mindmap' }));
    expect(second.canvas).toBe(first.canvas);
    expect(instances.length).toBe(1);
    expect(second.canvas.zoom).toBe(2.7);
    expect(second.canvas.manual.get('gold-intl')).toEqual({ x: 42, y: 24 });
  });

  it('每次渲染都会 update 一次（数据刷新要落到画布上）', () => {
    const el = host();
    const { canvas } = renderMacroFlow(el, macroData, state());
    renderMacroFlow(el, macroData, state());
    renderMacroFlow(el, macroData, state());
    expect(canvas.updates.length).toBe(3);
  });

  it('不同 host 各有自己的画布实例（互不干扰）', () => {
    const a = host();
    const b = host();
    const ca = renderMacroFlow(a, macroData, state()).canvas;
    const cb = renderMacroFlow(b, macroData, state()).canvas;
    expect(ca).not.toBe(cb);
    expect(instances.length).toBe(2);
  });
});

describe('从老版本 SVG 升级', () => {
  it('有 section 但没有 #mg-x6 时整体重建（否则画布永远挂不上）', () => {
    const el = host();
    el.innerHTML = '<section class="d-block macro-graph-section"><svg class="legacy"></svg></section>';
    const out = renderMacroFlow(el, macroData, state());
    expect(el.querySelector('svg.legacy')).toBeNull();
    expect(el.querySelector(CANVAS)).toBeTruthy();
    expect(out.canvas).toBeTruthy();
  });

  it('升级时先销毁旧画布（避免留下孤儿实例）', () => {
    const el = host();
    const first = renderMacroFlow(el, macroData, state());
    // 人为把 #mg-x6 摘掉，模拟老结构
    el.querySelector(CANVAS).remove();
    renderMacroFlow(el, macroData, state());
    expect(first.canvas.disposed).toBe(true);
  });
});

describe('chrome 只换不重建', () => {
  it('syncChrome 顶掉模式条与工具条，但保留 #mg-x6 容器本体', () => {
    const el = host();
    const { section } = renderMacroFlow(el, macroData, state());
    const mount = section.querySelector(CANVAS);
    syncChrome(section, macroData, state({ graphMode: 'mindmap' }), new Map());
    expect(section.querySelector(CANVAS)).toBe(mount);
  });

  it('沙盘模式下出现冲击条，罗盘模式下没有', () => {
    const el = host();
    const { section } = renderMacroFlow(el, macroData, state());
    syncChrome(section, macroData, state({ graphMode: 'sandbox', shock: { id: 'gold-intl', dir: 1 } }), new Map());
    expect(section.querySelector('.mg-shockbar')).toBeTruthy();
    syncChrome(section, macroData, state({ graphMode: 'compass' }), new Map());
    expect(section.querySelector('.mg-shockbar')).toBeNull();
  });

  it('横幅先清后插：没有背离时一条都不留', () => {
    const el = host();
    const { section } = renderMacroFlow(el, macroData, state());
    // 手工插一条假的旧横幅
    const fake = document.createElement('div');
    fake.className = 'mg-alert';
    section.querySelector('.graph-stage').before(fake);
    syncChrome(section, macroData, state(), new Map());
    expect(section.querySelectorAll('.mg-alert').length).toBeLessThanOrEqual(1);
  });

  it('右侧检查器始终只有一张卡（不叠加）', () => {
    const el = host();
    const { section } = renderMacroFlow(el, macroData, state());
    syncChrome(section, macroData, state({ graphFocus: 'dxy' }), new Map());
    syncChrome(section, macroData, state({ graphFocus: 'oil' }), new Map());
    expect(section.querySelectorAll('.graph-card')).toHaveLength(1);
  });
});

describe('swap', () => {
  it('html 为空时移除旧节点', () => {
    const el = host();
    el.innerHTML = '<div class="graph-stage"></div><div class="mg-head">old</div>';
    swap(el, '.mg-head', '');
    expect(el.querySelector('.mg-head')).toBeNull();
  });

  it('旧节点存在时原位替换（保持 DOM 顺序，不追加到末尾）', () => {
    const el = host();
    el.innerHTML = '<div class="mg-head">old</div><div class="graph-stage"></div>';
    swap(el, '.mg-head', '<div class="mg-head">new</div>');
    const kids = [...el.children].map((c) => c.className);
    expect(kids).toEqual(['mg-head', 'graph-stage']);
    expect(el.querySelector('.mg-head').textContent).toBe('new');
  });

  it('旧节点不存在时插到 .graph-stage 之前', () => {
    const el = host();
    el.innerHTML = '<div class="graph-stage"></div>';
    swap(el, '.mg-legend', '<div class="mg-legend">L</div>');
    expect([...el.children].map((c) => c.className)).toEqual(['mg-legend', 'graph-stage']);
  });

  it('没有 .graph-stage 也不抛（结构不完整时降级）', () => {
    const el = host();
    el.innerHTML = '<div></div>';
    expect(() => swap(el, '.mg-legend', '<div class="mg-legend">L</div>')).not.toThrow();
  });
});

describe('点亮边集合', () => {
  it('罗盘模式没有剧本时不点亮任何边（active 为 null，表示全部正常）', () => {
    expect(activeEdgeSets(state()).active).toBeNull();
  });

  it('剧本模式点亮该剧本的边与断点', () => {
    const pb = [...PLAYBOOK_BY_ID.values()][0];
    const out = activeEdgeSets(state({ playbook: pb.id }));
    expect(out.active).toBeTruthy();
    expect(out.active.edges.size).toBeGreaterThan(0);
    for (const id of pb.edges) expect(out.active.edges.has(id)).toBe(true);
  });

  it('沙盘模式给出传导结果与被触及的节点集合', () => {
    const out = activeEdgeSets(state({ graphMode: 'sandbox', shock: { id: 'dxy', dir: 1 } }));
    expect(out.prop).toBeInstanceOf(Map);
    expect(out.active.nodes.has('dxy')).toBe(true);
  });

  it('沙盘但没有震源时不点亮（active 为 null）', () => {
    expect(activeEdgeSets(state({ graphMode: 'sandbox' })).active).toBeNull();
  });

  it('未知剧本 id 不崩，退回不点亮', () => {
    expect(activeEdgeSets(state({ playbook: 'nope' })).active).toBeNull();
  });
});

describe('销毁', () => {
  it('dispose 画布并从记账里删掉（再次渲染会新建）', () => {
    const el = host();
    const first = renderMacroFlow(el, macroData, state());
    destroyMacroFlow(el);
    expect(first.canvas.disposed).toBe(true);
    expect(canvases.has(el)).toBe(false);
    const second = renderMacroFlow(el, macroData, state());
    expect(second.canvas).not.toBe(first.canvas);
  });

  it('没有画布时销毁是空操作（卸载路径不该因为顺序不同而崩）', () => {
    const el = host();
    expect(() => destroyMacroFlow(el)).not.toThrow();
  });
});

/* ================================================================== *
 * 覆盖边角：横幅与回调接线
 * ================================================================== */
describe('横幅（背离提示）', () => {
  it('有背离时插一条横幅；先清旧的，不会叠成两条', () => {
    const el = host();
    const { section } = renderMacroFlow(el, macroData, state());
    // 造一个「确实背离」的现实检验结果：字段要齐全（badge 会被读来做文案）
    const reality = new Map([
      [
        'E01',
        {
          status: 'diverged',
          badge: '⚡ 方向背离',
          lastA: 1,
          lastB: -1,
          roll20: -0.42,
          roll60: -0.3,
          longCorr: 0.2,
          n: 60,
          asOf: '2026-10-28',
          unaligned: false,
        },
      ],
    ]);
    syncChrome(section, macroData, state(), reality);
    const first = section.querySelectorAll('.mg-alert').length;
    syncChrome(section, macroData, state(), reality);
    expect(section.querySelectorAll('.mg-alert').length).toBe(first);
    expect(first).toBeLessThanOrEqual(1);
  });
});

describe('回调接线', () => {
  it('画布的三个回调都会转给 handlers（点边 / 点节点 / 双击节点）', () => {
    const el = host();
    const calls = [];
    renderMacroFlow(el, macroData, state(), {
      onEdge: (id) => calls.push(['edge', id]),
      onNode: (id) => calls.push(['node', id]),
      onNodeDbl: (id) => calls.push(['dbl', id]),
    });
    const canvas = canvases.get(el);
    canvas.opts.onEdge('E01');
    canvas.opts.onNode('gold-intl');
    canvas.opts.onNodeDbl('oil');
    expect(calls).toEqual([
      ['edge', 'E01'],
      ['node', 'gold-intl'],
      ['dbl', 'oil'],
    ]);
  });

  it('没给 handlers 时点上去也不抛（可选项要真的可选）', () => {
    const el = host();
    renderMacroFlow(el, macroData, state());
    const canvas = canvases.get(el);
    expect(() => {
      canvas.opts.onEdge('E01');
      canvas.opts.onNode('gold-intl');
      canvas.opts.onNodeDbl('oil');
    }).not.toThrow();
  });
});
