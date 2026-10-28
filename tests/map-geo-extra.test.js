/* ================================================================== *
 * 地图 geo / logic 的边角
 *
 * worldmap-geo/logic 已经覆盖主路径；这里补最后几个「只有特定调用方才会
 * 走到」的导出：晨昏圈几何、弧顶、城市反查、屏幕位移换算、ISO 规范化、
 * 赛区包围盒与滤镜未知键。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

import { terminatorGeometry, wrapLon, sunPosition } from '../src/client/views/map/geo/astro.js';
import { arcApex, citiesOfSymbol } from '../src/client/views/map/geo/cities.js';
import {
  screenDeltaToLogical,
  screenToLogical,
  projection,
  lonLatToLogical,
} from '../src/client/views/map/geo/projection.js';
import { normalizeIso, countriesByRegion } from '../src/client/views/map/geo/regions.js';
import { regionBounds } from '../src/client/views/map/logic/focus.js';
import { matchFilter } from '../src/client/views/map/logic/filters.js';
import {
  spotlightReducer,
  currentSpotlightEvent,
  needsIdleTimer,
  MODES,
} from '../src/client/views/map/logic/spotlight.js';
import { easternHm } from '../src/client/views/map/logic/calendar.js';

describe('astro：晨昏圈几何', () => {
  it('返回不闭合的 LineString，而不是球冠面片', () => {
    const sun = sunPosition(new Date('2026-10-26T12:00:00Z'));
    const geo = terminatorGeometry(sun);
    expect(geo.type).toBe('LineString');
    expect(Array.isArray(geo.coordinates)).toBe(true);
    expect(geo.coordinates.length).toBeGreaterThan(30);
    for (const [lon, lat] of geo.coordinates) {
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90.0001);
    }
  });

  it('半径可调；经度经过 wrap 后仍在 [-180,180)', () => {
    const sun = { lon: 179, decl: 10 };
    const geo = terminatorGeometry(sun, 60);
    for (const [lon] of geo.coordinates) {
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThan(180);
    }
    expect(wrapLon(181)).toBe(-179);
    expect(wrapLon(-181)).toBe(179);
  });
});

describe('cities：弧顶与反查', () => {
  it('弧顶在两点中点下方 lift/2，而不是控制点的 lift', () => {
    expect(arcApex([0, 0], [100, 0], 0.3, 90)).toEqual([50, -(100 * 0.3) / 2]);
    // 距离超过上限时按 maxLift 截断
    expect(arcApex([0, 0], [1000, 0], 0.5, 20)).toEqual([500, -10]);
  });

  it('citiesOfSymbol 未知标的返回空数组而不是 undefined', () => {
    expect(Array.isArray(citiesOfSymbol('sp500'))).toBe(true);
    expect(citiesOfSymbol('__nope__')).toEqual([]);
  });
});

describe('projection：位移换算与逻辑坐标', () => {
  const ctm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const t = { k: 2, x: 10, y: 20 };

  it('屏幕位移只取线性部分，平移项抵消', () => {
    expect(screenDeltaToLogical(ctm, t, 20, 40)).toEqual([10, 20]);
  });

  it('屏幕点换算与 zoom 逆变换一致', () => {
    expect(screenToLogical(ctm, t, 30, 40)).toEqual([10, 10]);
  });

  it('经纬度能投到逻辑画布范围内；越界/不可投影返回 null', () => {
    const p = lonLatToLogical(0, 0);
    expect(p[0]).toBeGreaterThan(0);
    expect(p[0]).toBeLessThan(1200);
    expect(p[1]).toBeGreaterThan(0);
    expect(p[1]).toBeLessThan(600);
    expect(lonLatToLogical(Number.NaN, 0)).toBeNull();
    // 投影对象仍可继续拟合（可替换实例的契约）
    expect(typeof projection.fitExtent).toBe('function');
  });
});

describe('regions：ISO 规范化与赛区分组', () => {
  it('数字 ISO 去前导零，非数字原样，null 原样', () => {
    expect(normalizeIso('004')).toBe('4');
    expect(normalizeIso(4)).toBe('4');
    expect(normalizeIso('US')).toBe('US');
    expect(normalizeIso(null)).toBeNull();
  });

  it('countriesByRegion 只收有 region 的国家，且无重复', () => {
    const map = countriesByRegion();
    expect(map.size).toBeGreaterThan(0);
    for (const [, list] of map) {
      expect(list.length).toBe(new Set(list).size);
    }
  });
});

describe('focus / filters / calendar：边界输入', () => {
  it('regionBounds：空赛区返回 null，已知赛区给出有限包围盒', () => {
    expect(regionBounds(null)).toBeNull();
    expect(regionBounds('__nope__')).toBeNull();
    const b = regionBounds('eu');
    expect(b).toBeTruthy();
    expect(b[0][0]).toBeLessThan(b[1][0]);
    expect(b[0][1]).toBeLessThan(b[1][1]);
  });

  it('matchFilter：未知键放行，按等级/主题各自命中', () => {
    const ev = { level: 'high', topics: [{ key: 'fed', label: '货币政策' }] };
    expect(matchFilter(ev, '__unknown__')).toBe(true);
    expect(matchFilter(ev, 'all')).toBe(true);
    expect(matchFilter(ev, 'high')).toBe(true);
    expect(matchFilter({ level: 'low', topics: [] }, 'high')).toBe(false);
    const topicFilter = [...Array(20).keys()].length ? 'fed' : 'fed';
    expect(matchFilter(ev, topicFilter)).toBe(true);
  });

  it('easternHm：非法时间返回破折号，合法时间给 HH:MM', () => {
    expect(easternHm(Number.NaN)).toBe('—');
    expect(easternHm(Date.UTC(2026, 9, 26, 18, 0))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('spotlight：状态机默认分支', () => {
  const queue = [{ id: 'a' }, { id: 'b' }];

  it('未知 action 原样返回 state（不抛、不重建）', () => {
    const state = { queue, index: 0, mode: MODES.AUTO };
    expect(spotlightReducer(state, { type: 'wat' })).toBe(state);
  });

  it('currentSpotlightEvent：Preview > Locked > Auto', () => {
    expect(currentSpotlightEvent(null)).toBeNull();
    expect(currentSpotlightEvent({ queue, mode: MODES.AUTO, index: 1 })).toEqual({ id: 'b' });
    expect(
      currentSpotlightEvent({ queue, mode: MODES.LOCKED, lockedId: 'a', index: 1 }),
    ).toEqual({ id: 'a' });
    expect(
      currentSpotlightEvent({ queue, mode: MODES.LOCKED, lockedId: 'a', previewId: 'b' }),
    ).toEqual({ id: 'b' });
    // 预览 id 已不在队列里 → 退回 null，而不是崩
    expect(currentSpotlightEvent({ queue, previewId: 'zzz' })).toBeNull();
  });

  it('needsIdleTimer：只在 Locked 下计算，且不为负', () => {
    expect(needsIdleTimer(null, 0)).toBe(0);
    expect(needsIdleTimer({ mode: MODES.AUTO }, 0)).toBe(0);
    expect(needsIdleTimer({ mode: MODES.LOCKED, lastInteractAt: 1000 }, 2000)).toBeGreaterThan(0);
    expect(needsIdleTimer({ mode: MODES.LOCKED, lastInteractAt: 0 }, 10 ** 12)).toBe(0);
  });
});
