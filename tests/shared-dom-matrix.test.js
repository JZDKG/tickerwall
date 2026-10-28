/* ================================================================== *
 * 骨架 DOM 引用 + 矩阵边界
 *
 * dom.js 在 import 时就要 document，所以单独一个文件先搭桩再动态 import。
 * matrix.js 的退化矩阵 / 位移不变式在这里补边界：这些分支在正常视口走不到，
 * 但一旦 getScreenCTM 返回 null 或缩放为 0，走错就是地图整体漂移。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

/* ------------------------------ dom.js ------------------------------ */

const ids = ['rows', 'updated', 'countdown', 'refresh', 'detail', 'macro', 'events', 'map'];
const stubs = new Map(ids.map((id) => [id, { id, hidden: true }]));

globalThis.document = {
  getElementById: (id) => stubs.get(id) ?? null,
};

const dom = await import('../src/client/shared/dom.js');

describe('shared/dom：骨架元素只取一次', () => {
  it('每个 id 都拿到 index.html 里对应的节点', () => {
    expect(dom.rowsEl).toBe(stubs.get('rows'));
    expect(dom.updatedEl).toBe(stubs.get('updated'));
    expect(dom.countdownEl).toBe(stubs.get('countdown'));
    expect(dom.refreshBtn).toBe(stubs.get('refresh'));
    expect(dom.detailEl).toBe(stubs.get('detail'));
    expect(dom.macroEl).toBe(stubs.get('macro'));
    expect(dom.eventsEl).toBe(stubs.get('events'));
    expect(dom.mapEl).toBe(stubs.get('map'));
  });

  it('列表容器与 rowsEl 是同一个节点（不是另取一份）', () => {
    expect(dom.listEl).toBe(dom.rowsEl);
  });
});

/* ------------------------------ matrix.js ------------------------------ */

const { invertMatrix, applyInverseDelta, isUsableMatrix, applyMatrix } = await import(
  '../src/client/shared/matrix.js'
);

describe('shared/matrix：退化与位移', () => {
  it('isUsableMatrix 对 null / 缺字段 / NaN 一律 false', () => {
    expect(isUsableMatrix(null)).toBe(false);
    expect(isUsableMatrix({})).toBe(false);
    expect(isUsableMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0 })).toBe(false);
    expect(isUsableMatrix({ a: 1, b: 0, c: 0, d: Number.NaN, e: 0, f: 0 })).toBe(false);
    expect(isUsableMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBe(true);
  });

  it('invertMatrix 对不可用矩阵与退化矩阵都返回 null', () => {
    expect(invertMatrix(null)).toBeNull();
    expect(invertMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, g: 0 })).not.toBeNull();
    expect(invertMatrix({ a: 2, b: 0, c: 0, d: 0, e: 5, f: 5 })).toBeNull();
  });

  it('applyInverseDelta：平移项在差值里抵消，只留缩放', () => {
    const m = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 200 };
    expect(applyInverseDelta(m, 6, 4)).toEqual([3, 2]);
    // 旋转 90°：屏幕位移映射回用户坐标也要跟着转
    const rot = { a: 0, b: 1, c: -1, d: 0, e: 10, f: 20 };
    const [ux, uy] = applyInverseDelta(rot, 5, 0);
    expect(ux).toBeCloseTo(0, 12);
    expect(uy).toBeCloseTo(-5, 12);
  });

  it('applyInverseDelta：退化矩阵返回 null，不返回 NaN', () => {
    expect(applyInverseDelta({ a: 0, b: 0, c: 0, d: 0, e: 1, f: 1 }, 10, 10)).toBeNull();
    expect(applyInverseDelta(null, 10, 10)).toBeNull();
  });

  it('applyMatrix 与 invert 互逆', () => {
    const m = { a: 1.5, b: 0.2, c: -0.3, d: 1.1, e: 12, f: -7 };
    const [x, y] = applyMatrix(m, 33, 44);
    const inv = invertMatrix(m);
    const [bx, by] = applyMatrix(inv, x, y);
    expect(bx).toBeCloseTo(33, 10);
    expect(by).toBeCloseTo(44, 10);
  });
});
