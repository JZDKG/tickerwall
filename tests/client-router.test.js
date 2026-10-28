// @vitest-environment jsdom
/* ================================================================== *
 * 客户端路由（src/client/router.js）
 *
 * 这一段以前 0 覆盖，但它是「泄漏点」的守门人：原来 route() 是 88 行 if-else
 * 阶梯，每加一个视图都要在每个分支补一遍清理，漏一句就漏一个定时器。
 *
 * 断言的是契约：
 *   · 切视图时**其余视图全部 unmount**（不是只挂目标）；
 *   · 列表页离场只隐藏、不清空（返回时不该重新拉一次报价才有内容）；
 *   · 详情路由解析并解码 id（URL 编码的标的名要还原）；
 *   · 未知 hash 落回列表；
 *   · Esc 在任一全屏视图打开时回到列表。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 列表页在页面骨架里的 id 是 rows（不是 list）：shared/dom.js 里 listEl = rowsEl
document.body.innerHTML = `
  <section id="rows"></section>
  <section id="detail"></section>
  <section id="map"></section>
  <section id="events"></section>
  <section id="macro"></section>
`;

// 五个视图的生命周期都换成可观测的假实现：router 只该负责「谁上谁下」
const calls = [];
vi.mock('../src/client/views/detail.js', () => ({
  mountDetail: (id) => calls.push(['mount', 'detail', id]),
  unmountDetail: () => calls.push(['unmount', 'detail']),
}));
vi.mock('../src/client/views/map.js', () => ({
  mountMap: () => calls.push(['mount', 'map']),
  unmountMap: () => calls.push(['unmount', 'map']),
}));
vi.mock('../src/client/views/events.js', () => ({
  mountEvents: () => calls.push(['mount', 'events']),
  unmountEvents: () => calls.push(['unmount', 'events']),
}));
vi.mock('../src/client/views/macro.js', () => ({
  mountMacro: () => calls.push(['mount', 'macro']),
  unmountMacro: () => calls.push(['unmount', 'macro']),
}));

const { route, currentView } = await import('../src/client/router.js');
const els = {
  list: document.getElementById('rows'),
  detail: document.getElementById('detail'),
  map: document.getElementById('map'),
  events: document.getElementById('events'),
  macro: document.getElementById('macro'),
};

const go = (hash) => {
  location.hash = hash;
  calls.length = 0;
  route();
};

beforeEach(() => {
  location.hash = '';
  calls.length = 0;
  for (const el of Object.values(els)) el.hidden = true;
});

describe('路由解析', () => {
  it('空 hash 落回列表，并把它显示出来', () => {
    go('');
    expect(currentView()).toBe('list');
    expect(els.list.hidden).toBe(false);
  });

  it('#/map → 地图', () => {
    go('#/map');
    expect(currentView()).toBe('map');
  });

  it('#/events → 事件中心', () => {
    go('#/events');
    expect(currentView()).toBe('events');
  });

  it('#/macro → 宏观页', () => {
    go('#/macro');
    expect(currentView()).toBe('macro');
  });

  it('#/d/<id> → 详情，并把 id 解出来传给 mount', () => {
    go('#/d/gold-intl');
    expect(currentView()).toBe('detail');
    expect(calls).toContainEqual(['mount', 'detail', 'gold-intl']);
  });

  it('URL 编码的 id 被解码（标的名里有需要转义的字符）', () => {
    go(`#/d/${encodeURIComponent('黄金 主力')}`);
    expect(calls).toContainEqual(['mount', 'detail', '黄金 主力']);
  });

  it('未知 hash 落回列表（不留在空白页）', () => {
    go('#/nope');
    expect(currentView()).toBe('list');
  });

  it('#/map 后面带参数也认（前缀匹配）', () => {
    go('#/map?region=us');
    expect(currentView()).toBe('map');
  });
});

describe('生命周期契约', () => {
  it('切视图时**其余视图全部 unmount**（不是只挂目标）', () => {
    go('#/map');
    calls.length = 0;
    go('#/events');
    const unmounted = calls.filter((c) => c[0] === 'unmount').map((c) => c[1]).sort();
    expect(unmounted).toEqual(['detail', 'macro', 'map']);
    expect(calls).toContainEqual(['mount', 'events']);
  });

  it('进详情页时列表被隐藏（不能「详情页下面压着整个列表」）', () => {
    go('#/d/gold-intl');
    expect(els.list.hidden).toBe(true);
  });

  it('列表离场只隐藏、不清空（返回时不该重新拉一次报价才有内容）', () => {
    els.list.innerHTML = '<div class="row">已有内容</div>';
    go('#/d/gold-intl');
    expect(els.list.hidden).toBe(true);
    expect(els.list.innerHTML).toContain('已有内容');
  });

  it('回到列表时把它重新显示出来', () => {
    go('#/map');
    els.list.hidden = true;
    go('');
    expect(els.list.hidden).toBe(false);
  });

  it('mount 的参数在每次 hashchange 都传（同一路由再进也要刷新）', () => {
    go('#/d/gold-intl');
    go('#/d/gold-intl');
    expect(calls.filter((c) => c[0] === 'mount' && c[1] === 'detail')).toHaveLength(1);
  });
});

describe('键盘', () => {
  it('全屏视图打开时 Esc 回到列表', () => {
    go('#/map');
    // 视图的 mount 在真实实现里负责 hidden=false；这里手置以模拟「已打开」
    els.map.hidden = false;
    location.hash = '#/map';
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(location.hash).toBe('');
  });

  it('已经在列表时 Esc 不动（不制造一次无意义的跳转）', () => {
    go('');
    location.hash = '';
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(location.hash).toBe('');
  });

  it('其他按键不影响路由', () => {
    go('#/map');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(currentView()).toBe('map');
  });
});
