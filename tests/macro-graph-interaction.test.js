// @vitest-environment jsdom
/* ================================================================== *
 * 图谱点击 → 状态变化（views/macro.js onGraphClick / handleNodePick）
 *
 * 这一大段 if 阶梯里每条分支都对应一个用户动作，而且改的是**同一个**
 * macroState。断言的是「点了之后状态变成什么」——因为图谱每次只重绘
 * 局部，状态错一位，右侧卡就会显示别人的内容。
 *
 * 关键约束（源码注释里写明的）：
 *   · 点节点时若当前 pair 已包含它，**不要换对**（否则用户刚选的连线被冲掉）；
 *   · 点背离横幅要清掉剧本并切回罗盘（导图/沙盘里没有这条边的画布位置）。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

document.body.innerHTML = '<section id="macro"></section>';
const macroEl = document.getElementById('macro');

vi.mock('../src/client/views/macro/flow-canvas.js', () => ({ MacroFlowCanvas: class {} }));
vi.mock('/vendor/macro-flow.js', () => ({ renderMacroFlow: () => ({}), destroyMacroFlow: () => {} }));

const m = await import('../src/client/views/macro.js');

const data = () => ({
  freq: 'day',
  universe: [
    { id: 'gold-intl', name: '国际金价', short: '黄金', ok: true, kind: 'price' },
    { id: 'dxy', name: '美元指数', short: '美元', ok: true, kind: 'price' },
    { id: 'oil', name: '原油', short: '原油', ok: true, kind: 'price' },
  ],
  matrix: { ids: ['gold-intl', 'dxy', 'oil'], corr: [[1, -0.4, 0.2], [-0.4, 1, -0.1], [0.2, -0.1, 1]], counts: [[9, 9, 9], [9, 9, 9], [9, 9, 9]], stats: [] },
  recent: { dates: ['d1', 'd2', 'd3'], changes: { 'gold-intl': [0.01, 0.02, 0.03], dxy: [0.01, -0.01, 0.02], oil: [0.02, 0.01, -0.01] } },
});

/** 造一个 host，把点击目标塞进去（onGraphClick 要求 host.contains(hit)） */
const host = () => {
  const el = document.createElement('div');
  el.id = 'macro-graph-host';
  macroEl.innerHTML = '';
  macroEl.appendChild(el);
  return el;
};

const click = (el) => ({ target: el });

beforeEach(async () => {
  // macroState 是模块级单例，只有 loadMacro 会创建它
  const payload = data();
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/api/explanations')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => payload };
  }));
  const el = host();
  await m.loadMacro(250);
  m.renderMacro();
  m.macroState.graphMode = 'compass';
  m.macroState.graphFocus = 'gold-intl';
  m.macroState.playbook = null;
  m.macroState.shock = null;
  m.macroState.shockCondition = null;
  m.macroState.pair = ['gold-intl', 'dxy'];
  m.macroState.picked = new Set(['gold-intl', 'dxy']);
  el.id = 'macro-graph-host';
  // 让 refreshGraph 能找到 host
  m.macroState.data = data();
});

const make = (attrs = {}, tag = 'button') => {
  const b = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  document.getElementById('macro-graph-host').appendChild(b);
  return b;
};

describe('模式切换与剧本', () => {
  it('点模式按钮切 graphMode', () => {
    const el = make({ 'data-mode': 'sandbox' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.graphMode).toBe('sandbox');
  });

  it('点剧本按钮写入 playbook；空值表示回到无剧本', () => {
    const pb = make({ 'data-pb': 'pb-1' });
    pb.classList.add('mg-pb');
    m.onGraphClick(click(pb), document.getElementById('macro-graph-host'));
    expect(m.macroState.playbook).toBe('pb-1');

    const empty = make({ 'data-pb': '' });
    empty.classList.add('mg-pb');
    m.onGraphClick(click(empty), document.getElementById('macro-graph-host'));
    expect(m.macroState.playbook).toBeNull();
  });

  it('带 data-pb 但不是剧本按钮时忽略（别把别的按钮当剧本）', () => {
    const b = make({ 'data-pb': 'x' });
    m.onGraphClick(click(b), document.getElementById('macro-graph-host'));
    expect(m.macroState.playbook).toBeNull();
  });

  it('点焦点按钮切 graphFocus', () => {
    const el = make({ 'data-focus': 'oil' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.graphFocus).toBe('oil');
  });
});

describe('沙盘震源与条件', () => {
  it('点震源：保留当前方向（同一涨价/跌价条件下换标的）', () => {
    m.macroState.shock = { id: 'dxy', dir: -1 };
    const el = make({ 'data-shock': 'oil' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.shock).toEqual({ id: 'oil', dir: -1 });
  });

  it('点方向：没有震源时默认原油（不让画布停在空状态）', () => {
    const el = make({ 'data-dir': '-1' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.shock).toEqual({ id: 'oil', dir: -1 });
  });

  it('点冲击条件写入 shockCondition', () => {
    const el = make({ 'data-shock-condition': 'supply' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.shockCondition).toBe('supply');
  });

  it('点清除同时清掉震源与条件（回到无冲击）', () => {
    m.macroState.shock = { id: 'oil', dir: 1 };
    m.macroState.shockCondition = 'supply';
    const el = make({ 'data-clear': '1' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.shock).toBeNull();
    expect(m.macroState.shockCondition).toBeNull();
  });
});

describe('背离横幅', () => {
  it('点横幅：清剧本、切回罗盘、选中那条边的两端', () => {
    m.macroState.graphMode = 'sandbox';
    m.macroState.playbook = 'pb-1';
    const el = make({ 'data-alert': 'E01' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.playbook).toBeNull();
    expect(m.macroState.graphMode).toBe('compass');
  });

  it('横幅指向不存在的边时不动状态（脏 id 不该改视图）', () => {
    const before = m.macroState.graphMode;
    const el = make({ 'data-alert': 'NOPE' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.graphMode).toBe(before);
  });
});

describe('跳到下方配对图', () => {
  it('data-jump 用 a|b 形式指定成对', () => {
    // jsdom 没有 scrollIntoView：补在原型上（元素随重绘重建，挂具体节点会丢）
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    const el = make({ 'data-jump': 'gold-intl|oil' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.pair).toEqual(['gold-intl', 'oil']);
  });
});

describe('点节点', () => {
  it('当前对已包含该节点时不换对（否则用户刚选的连线被冲掉）', () => {
    m.macroState.pair = ['gold-intl', 'dxy'];
    m.handleNodePick('dxy');
    expect(m.macroState.pair).toEqual(['gold-intl', 'dxy']);
    expect(m.macroState.graphFocus).toBe('dxy');
  });

  it('当前对与该节点无关时换成它权重最高的那条边', () => {
    m.macroState.pair = ['gold-intl'];
    m.handleNodePick('oil');
    expect(m.macroState.pair).toHaveLength(2);
    expect(m.macroState.pair).toContain('oil');
    expect(m.macroState.graphFocus).toBe('oil');
  });

  it('信号源与空 id 不算节点', () => {
    const before = [...m.macroState.pair];
    m.handleNodePick('signal');
    m.handleNodePick('');
    expect(m.macroState.pair).toEqual(before);
  });
});

describe('点连线与双击', () => {
  it('data-edge 选中该边两端', () => {
    const el = make({ 'data-edge': 'E02' });
    m.onGraphClick(click(el), document.getElementById('macro-graph-host'));
    expect(m.macroState.pair).toHaveLength(2);
  });

  it('双击节点切到单点导图并聚焦它', () => {
    const el = make({ 'data-node': 'oil' });
    m.onGraphDblClick({ target: el }, document.getElementById('macro-graph-host'));
    expect(m.macroState.graphMode).toBe('mindmap');
    expect(m.macroState.graphFocus).toBe('oil');
  });

  it('双击信号源不切模式（它不是一个真实标的）', () => {
    const el = make({ 'data-node': 'signal' });
    m.macroState.graphMode = 'compass';
    m.onGraphDblClick({ target: el }, document.getElementById('macro-graph-host'));
    expect(m.macroState.graphMode).toBe('compass');
  });

  it('点在 host 外的元素上不处理（事件冒泡上来的无关点击）', () => {
    const outside = document.createElement('div');
    outside.setAttribute('data-mode', 'sandbox');
    document.body.appendChild(outside);
    m.macroState.graphMode = 'compass';
    m.onGraphClick(click(outside), document.getElementById('macro-graph-host'));
    expect(m.macroState.graphMode).toBe('compass');
    outside.remove();
  });
});
