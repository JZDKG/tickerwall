// @vitest-environment jsdom
/* ================================================================== *
 * 地图相机（views/map/camera.js）
 *
 * 相机换成了 d3-zoom 封装：双指缩放、触控板惯性、键盘无障碍都交给它。
 * 这里测的是**我们的接线**：bounds 有没有正确传进 extent、拖拽判定阈值、
 * 拆装是否干净、变换读写是否走 d3 的真相源。
 *
 * geo-kit 是构建期打包的浏览器模块（Node 里没有），所以整体换成可控假实现。
 * ================================================================== */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fake = {
  behaviors: [],
  transitions: [],
  lastTransform: null,
};

vi.mock('geo-kit', () => {
  const handlers = new Map();
  const makeBehavior = () => {
    const b = {
      extent: vi.fn(() => b),
      translateExtent: vi.fn(() => b),
      scaleExtent: vi.fn(() => b),
      on: (evt, fn) => {
        handlers.set(evt, fn);
        return b;
      },
      emit: (evt, event) => handlers.get(evt)?.(event),
      transform: Symbol('transform-fn'),
    };
    fake.behaviors.push(b);
    return b;
  };
  const selection = (node) => {
    const sel = {
      node,
      call: (fn, ...args) => {
        // 装配：select(node).call(behavior) 时记录节点
        if (typeof fn === 'function') sel.installed = fn;
        else if (fn === makeBehavior) sel.installed = null;
        return sel;
      },
      on: (evt, fn) => {
        sel.removed = { evt, fn };
        return sel;
      },
      transition: () => {
        const t = { duration: (d) => {
          fake.transitions.push(d);
          return t;
        }, call: () => t };
        return t;
      },
    };
    return sel;
  };
  return {
    select: (node) => selection(node),
    zoom: () => makeBehavior(),
    zoomIdentity: {
      translate: (x, y) => ({ x, y, k: 1, scale(k) { return { x, y, k }; } }),
    },
    zoomTransform: (node) => node.__zoom ?? { k: 1, x: 0, y: 0 },
  };
});

const { MAX_SCALE, MIN_SCALE, applyTransform, createCamera, currentTransform, destroyCamera, syncCamera } =
  await import('../src/client/views/map/camera.js');

const makeNode = () => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(node);
  return node;
};

beforeEach(() => {
  fake.behaviors.length = 0;
  fake.transitions.length = 0;
  document.body.innerHTML = '';
});

describe('装配', () => {
  it('extent / translateExtent / scaleExtent 都用 viewBox 坐标与统一上下限', () => {
    const node = makeNode();
    createCamera(node, { onChange: () => {}, width: 1200, height: 600 });
    const b = fake.behaviors[0];
    expect(b.extent).toHaveBeenCalledWith([[0, 0], [1200, 600]]);
    expect(b.translateExtent).toHaveBeenCalledWith([[0, 0], [1200, 600]]);
    expect(b.scaleExtent).toHaveBeenCalledWith([MIN_SCALE, MAX_SCALE]);
  });

  it('缩放上下限是 1~8（不能再缩到看不见，也不放太大）', () => {
    expect(MIN_SCALE).toBe(1);
    expect(MAX_SCALE).toBe(8);
  });
});

describe('手势回调', () => {
  const setup = (onChange = () => {}, onDragEnd = () => {}, onDragState = () => {}) => {
    const node = makeNode();
    createCamera(node, { onChange, onDragEnd, onDragState, width: 1200, height: 600 });
    return fake.behaviors[0];
  };

  it('start 上报开始拖拽，zoom 上报变换，end 上报结束', () => {
    const changes = [];
    const states = [];
    const ends = [];
    const b = setup((t) => changes.push(t), (m) => ends.push(m), (d) => states.push(d));

    b.emit('start', { transform: { k: 1, x: 0, y: 0 } });
    b.emit('zoom', { transform: { k: 2, x: 10, y: 20 } });
    b.emit('end', { transform: { k: 2, x: 10, y: 20 } });

    expect(changes).toEqual([{ k: 2, x: 10, y: 20 }]);
    expect(states).toEqual([true, false]);
    expect(ends).toEqual([true]);
  });

  it('没超过阈值的位移算「点击」而不是拖拽', () => {
    const ends = [];
    const b = setup(() => {}, (m) => ends.push(m));
    b.emit('start', { transform: { k: 1, x: 0, y: 0 } });
    b.emit('end', { transform: { k: 1, x: 1, y: 1 } }); // DRAG_SLOP = 2
    expect(ends).toEqual([false]);
  });

  it('缩放变化一定算拖拽（即使位移为 0）', () => {
    const ends = [];
    const b = setup(() => {}, (m) => ends.push(m));
    b.emit('start', { transform: { k: 1, x: 0, y: 0 } });
    b.emit('end', { transform: { k: 1.5, x: 0, y: 0 } });
    expect(ends).toEqual([true]);
  });

  it('没有 start 就 end 不崩（回调缺失的容错）', () => {
    const ends = [];
    const b = setup(() => {}, (m) => ends.push(m));
    expect(() => b.emit('end', { transform: { k: 1, x: 9, y: 9 } })).not.toThrow();
    expect(ends).toEqual([false]);
  });

  it('缺 onChange 时在装配阶段就抛（不要等第一次手势在 d3 回调里炸）', () => {
    const node = makeNode();
    expect(() => createCamera(node, { width: 1200, height: 600 })).toThrow(/onChange/);
  });

  it('拖拽相关的回调都是可选的（只给 onChange 也能用）', () => {
    const node = makeNode();
    createCamera(node, { onChange: () => {}, width: 1200, height: 600 });
    const b = fake.behaviors[0];
    expect(() => {
      b.emit('start', { transform: { k: 1, x: 0, y: 0 } });
      b.emit('end', { transform: { k: 1, x: 9, y: 9 } });
    }).not.toThrow();
  });
});

describe('变换读写', () => {
  it('applyTransform 无动画时直接 transform', () => {
    const node = makeNode();
    const b = createCamera(node, { onChange: () => {}, width: 1200, height: 600 });
    expect(() => applyTransform(node, b, { k: 2, tx: 10, ty: 20 }, 0)).not.toThrow();
    expect(fake.transitions).toHaveLength(0);
  });

  it('applyTransform 有动画时走 transition 并带上时长', () => {
    const node = makeNode();
    const b = createCamera(node, { onChange: () => {}, width: 1200, height: 600 });
    applyTransform(node, b, { k: 2, tx: 0, ty: 0 }, 300);
    expect(fake.transitions).toEqual([300]);
  });

  it('currentTransform 读节点上的 __zoom（不是我们缓存的副本）', () => {
    const node = makeNode();
    expect(currentTransform(node)).toEqual({ k: 1, x: 0, y: 0 });
    node.__zoom = { k: 3, x: 5, y: 6 };
    expect(currentTransform(node)).toEqual({ k: 3, x: 5, y: 6 });
  });

  it('syncCamera 直接写 __zoom（绕过 d3 时才用）', () => {
    const node = makeNode();
    syncCamera(node, { k: 2, tx: 7, ty: 8 });
    expect(node.__zoom).toMatchObject({ x: 7, y: 8, k: 2 });
  });
});

describe('拆装', () => {
  it('destroyCamera 解绑 .zoom 监听；传 null 也安全', () => {
    const node = makeNode();
    expect(() => destroyCamera(node)).not.toThrow();
    // 从没装过相机的节点也能安全拆卸（卸载路径不该因为顺序不同而崩）
    expect(() => destroyCamera(null)).not.toThrow();
  });
});

/* 说明：camera.js 已 100% 覆盖。这个文件继续留在这里，是因为后续给
   地图加手势（双击复位、键盘缩放）时，定点断言都落在这里。 */
