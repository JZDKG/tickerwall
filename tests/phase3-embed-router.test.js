// @vitest-environment jsdom
/* ================================================================== *
 * Phase 3 / P3-T3：router 的 embed=1 行为（真实 hashchange 路径）
 *
 * 与 client-router.test.js 分开文件：那边 mock 了四个视图并用同一份模块实例，
 * 这里用 resetModules 拿一份干净的 router，专测「参数剥离 + dataset + 视图解析」。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = [];
vi.mock('../src/client/views/detail.js', () => ({
  mountDetail: (id) => calls.push(['mount', 'detail', id]),
  unmountDetail: () => calls.push(['unmount', 'detail']),
}));
vi.mock('../src/client/views/map.js', () => ({ mountMap: () => calls.push(['mount', 'map']), unmountMap: () => {} }));
vi.mock('../src/client/views/events.js', () => ({ mountEvents: () => calls.push(['mount', 'events']), unmountEvents: () => {} }));
vi.mock('../src/client/views/macro.js', () => ({ mountMacro: () => calls.push(['mount', 'macro']), unmountMacro: () => {} }));

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  document.documentElement.removeAttribute('data-embed');
  document.body.innerHTML = `
    <section id="rows"></section><section id="detail"></section>
    <section id="map"></section><section id="events"></section><section id="macro"></section>
    <nav id="tasks"></nav>`;
  // jsdom 的 location 不能直接赋值 href；用 history.replaceState 造场景
  history.replaceState(null, '', '/');
  location.hash = '';
});

describe('embed=1 路由行为', () => {
  it('hash 内 ?embed=1 激活 dataset.embed，剥参数后详情 id 解析正确', async () => {
    location.hash = '#/d/gold-intl?embed=1';
    const { route, currentView, resetMountedForTests } = await import('../src/client/router.js');
    resetMountedForTests();
    route();
    expect(document.documentElement.dataset.embed).toBe('1');
    expect(currentView()).toBe('detail');
    expect(calls).toContainEqual(['mount', 'detail', 'gold-intl']);
    // 参数已从地址栏剥离，用户复制链接不会把嵌入模式带出去
    expect(location.hash).not.toContain('embed');
  });

  it('query 里的 ?embed=1 也能激活，且其它参数保留', async () => {
    history.replaceState(null, '', '/?embed=1&theme=light');
    location.hash = '#/map';
    const { route, currentView, resetMountedForTests } = await import('../src/client/router.js');
    resetMountedForTests();
    route();
    expect(document.documentElement.dataset.embed).toBe('1');
    expect(currentView()).toBe('map');
    expect(location.search).toContain('theme=light');
    expect(location.search).not.toContain('embed');
  });

  it('嵌入模式是粘性的；显式 resetEmbedMode 才退出', async () => {
    const { resetMountedForTests, applyEmbedFromLocation } = await import('../src/client/router.js');
    const { resetEmbedMode } = await import('../src/client/shared/share-card.js');
    resetMountedForTests();
    history.replaceState(null, '', '/?embed=1');
    applyEmbedFromLocation();
    expect(document.documentElement.dataset.embed).toBe('1');
    history.replaceState(null, '', '/');
    // 参数被剥掉后再调用：挂件仍应保持，不能突然长回顶栏
    expect(applyEmbedFromLocation()).toBe(true);
    expect(document.documentElement.dataset.embed).toBe('1');
    resetEmbedMode(document.documentElement);
    expect(document.documentElement.dataset.embed).toBeUndefined();
  });
});
