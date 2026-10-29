/* ================================================================== *
 * 心智图布局：槽位偏移与连线（client/views/macro/flow-layouts.js）
 *
 * 槽位偏移决定箭头端点落在卡片哪一条边上。单一槽位必须回到中心（0），
 * 否则箭头会偏到边角上。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { layoutMindmap, assignPorts, isNum, countCrossings } from '../src/client/views/macro/flow-layouts.js';

describe('isNum', () => {
  it('只认有限数', () => {
    expect(isNum(1)).toBe(true);
    expect(isNum(NaN)).toBe(false);
    expect(isNum(Infinity)).toBe(false);
    expect(isNum('1')).toBe(false);
  });
});

describe('layoutMindmap', () => {
  it('返回 nodes / links / bands（links 不叫 edges）', () => {
    const out = layoutMindmap({ focusId: 'gold-intl' });
    expect(Array.isArray(out.links)).toBe(true);
    expect(Array.isArray(out.nodes)).toBe(true);
    expect(Array.isArray(out.bands)).toBe(true);
  });

  it('给出中心节点与若干环节点，位置都是有限数', () => {
    const out = layoutMindmap({ focusId: 'gold-intl' });
    expect(out.nodes.length).toBeGreaterThan(0);
    for (const n of out.nodes) {
      expect(isNum(n.x)).toBe(true);
      expect(isNum(n.y)).toBe(true);
    }
  });

  it('只给一条边时两端都落在卡片中心（单槽位不偏移）', () => {
    const out = layoutMindmap({
      focusId: 'gold-intl',
      edges: [{ from: 'gold-intl', to: 'oil', sign: '+', mechanism: 'x' }],
    });
    // assignPorts 返回 { plan, slots, slotOffset }，不是数组
    const { plan, slotOffset } = assignPorts(out.nodes, out.links);
    expect(plan.length).toBe(1);
    // 单槽位：偏移必须是 0，否则箭头会偏到边角
    // 用足够大的卡片：span = 边长 − 52，卡片太小时 usable 会被夹到 0
    expect(slotOffset(plan[0].fromSide, 0, 1, 400, 400)).toBe(0);
    expect(slotOffset(plan[0].fromSide, 0, 3, 400, 400)).toBeLessThan(0);
    expect(slotOffset(plan[0].fromSide, 1, 3, 400, 400)).toBe(0);
    expect(slotOffset(plan[0].fromSide, 2, 3, 400, 400)).toBeGreaterThan(0);
    // 卡片比留白还小时不炸（返回 0，不做负步长）
    expect(slotOffset(plan[0].fromSide, 0, 3, 10, 10)).toBe(0);
  });

});

describe('countCrossings', () => {
  it('没有交叉时为 0，有交叉时大于 0', () => {
    expect(countCrossings([])).toBe(0);
  });
});

describe('多节点多边', () => {
  it('每条边都进 plan，两端槽位都登记', () => {
    const out = layoutMindmap({ focusId: 'gold-intl' });
    if (out.links.length < 2) return;
    const { plan, slots } = assignPorts(out.nodes, out.links);
    expect(plan.length).toBe(out.links.length);
    expect(slots.size).toBeGreaterThan(0);
    for (const [, list] of slots) expect(Array.isArray(list)).toBe(true);
  });
});
