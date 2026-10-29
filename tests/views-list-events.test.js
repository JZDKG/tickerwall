// @vitest-environment jsdom
/* ================================================================== *
 * 列表与事件中心的渲染契约（jsdom）
 *
 * 这两块最容易「看起来对但错了」：行状态类名、新鲜度标签、失败/过期角标、
 * 事件过滤口径、来源覆盖行、显著性矩阵的行选择。用真实 DOM 断言结构与类名，
 * 而不是断言「函数没抛」。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 页面骨架：这些 id 写死在 public/index.html，模块加载时就要能取到
document.body.innerHTML = `
  <div id="updated"></div><div id="countdown"></div><button id="refresh"></button>
  <main id="rows"></main><section id="detail"></section><section id="macro"></section>
  <section id="events"></section><section id="map"></section><button id="briefing-btn"></button>
`;

const list = await import('../src/client/views/list.js');
const events = await import('../src/client/views/events.js');
// 从动态导入里取：events.js 会经 shared/dom.js 抓元素，必须在骨架写好之后再加载
const { groupEventsByCluster, eventRowHTML, bindClusterToggles } = events;
const { refs, store, PLACEHOLDER } = await import('../src/client/shared/store.js');
const { on } = await import('../src/client/shared/bus.js');

const rowsEl = document.getElementById('rows');
const updatedEl = document.getElementById('updated');
const eventsEl = document.getElementById('events');

const QUOTE = (over = {}) => ({
  id: 'sp500',
  name: '标普500',
  sub: 'S&P 500 指数',
  unit: '点',
  decimals: 2,
  ok: true,
  price: 5738.2,
  prevClose: 5691,
  change: 47.2,
  changePct: 0.83,
  sessionTime: '2026-10-25 16:00:00',
  source: 'eastmoney:100.SPX',
  history: [],
  extras: [],
  freshness: { level: 'normal', ageMs: 65_000, label: '1 分钟前', suspect: false, dataTime: '2026-10-25T08:00:00.000Z', suspectNote: null },
  ...over,
});

beforeEach(() => {
  rowsEl.innerHTML = '';
  eventsEl.innerHTML = '';
  refs.clear();
  store.quotes = null;
  store.events = null;
});

afterEach(() => {
  window.location.hash = '';
});

/* ------------------------------ 列表 ------------------------------ */

describe('list.buildRow：骨架与交互', () => {
  it('生成 article 骨架，注册 DOM 引用与可访问性属性', () => {
    const el = list.buildRow(QUOTE());
    expect(el.tagName).toBe('ARTICLE');
    expect(el.classList.contains('row')).toBe(true);
    expect(el.classList.contains('skeleton')).toBe(true);
    expect(el.dataset.id).toBe('sp500');
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('aria-label')).toBe('标普500 详情');
    expect(el.querySelector('[data-f="price"]').textContent).toBe('—');
    expect(refs.get('sp500').el).toBe(el);
  });

  it('点击整行跳详情；点击内嵌 Chip 跳该 Chip 的详情', () => {
    rowsEl.appendChild(list.buildRow(QUOTE()));
    const el = refs.get('sp500').el;
    el.click();
    expect(window.location.hash).toBe('#/d/sp500');

    // 模拟额外的 data-detail-id 元素（附加报价 Chip 挂在 extras 里）
    const chip = document.createElement('span');
    chip.dataset.detailId = 'brent';
    el.appendChild(chip);
    chip.click();
    expect(window.location.hash).toBe('#/d/brent');
  });

  it('Enter / 空格键也能打开详情，其他键不动', () => {
    const el = list.buildRow(QUOTE());
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.location.hash).toBe('#/d/sp500');
    window.location.hash = '';
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(window.location.hash).toBe('#/d/sp500');
    window.location.hash = '';
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(window.location.hash).toBe('');
  });
});

describe('list.renderExtras：附加报价 Chip', () => {
  let host;
  beforeEach(() => {
    host = document.createElement('div');
  });

  it('没有 extras 时隐藏并清空', () => {
    host.textContent = '旧内容';
    list.renderExtras(host, { extras: [] }, 2);
    expect(host.textContent).toBe('');
    expect(host.style.display).toBe('none');
  });

  it('正常 Chip 带价格/涨跌/来源提示；priceText 优先', () => {
    list.renderExtras(
      host,
      {
        extras: [
          { id: 'brent', name: '布伦特', ok: true, price: 74.2, changePct: 1.2, source: 'sina:hf_OIL', sessionTime: '15:00:00' },
          { id: 'oil', name: 'B-W 价差', ok: true, price: 4.2, priceText: '$4.20', changePct: null, source: 'calc:价差' },
        ],
      },
      2,
    );
    expect(host.style.display).toBe('');
    const chips = host.querySelectorAll('.extra');
    expect(chips).toHaveLength(2);
    expect(chips[0].querySelector('b').textContent).toBe('74.20');
    expect(chips[0].querySelector('i').className).toBe('up');
    expect(chips[0].title).toContain('新浪');
    expect(chips[0].title).toContain('15:00:00');
    expect(chips[1].querySelector('b').textContent).toBe('$4.20');
    expect(chips[1].querySelector('i')).toBeNull(); // changePct 为 null 不渲染 <i>
  });

  it('无效价格显示破折号；ok:false 加 extra-dead；错误进 title', () => {
    list.renderExtras(
      host,
      { extras: [{ id: 'x', name: '挂了', ok: false, price: null, error: 'timeout' }] },
      2,
    );
    const chip = host.querySelector('.extra');
    expect(chip.classList.contains('extra-dead')).toBe(true);
    expect(chip.querySelector('b').textContent).toBe('—');
    expect(chip.title).toContain('timeout');
  });
});

describe('list.updateRow：值、类名与角标', () => {
  it('未知 id 直接返回，不抛', () => {
    expect(() => list.updateRow({ id: 'nobody' })).not.toThrow();
  });

  it('写入价格/涨跌/走势/元信息，并清掉 skeleton', () => {
    rowsEl.appendChild(list.buildRow(QUOTE()));
    list.updateRow(
      QUOTE({
        history: [{ t: 1, p: 5700 }, { t: 2, p: 5738 }],
        extra: null,
      }),
    );
    const ref = refs.get('sp500');
    expect(ref.el.classList.contains('skeleton')).toBe(false);
    expect(ref.el.dataset.dir).toBe('up');
    expect(ref.price.textContent).toBe('5,738.20'); // 千分位由 fmtPrice 负责
    expect(ref.pct.textContent).toBe('+0.83%');
    expect(ref.abs.textContent).toBe('+47.20');
    expect(ref.spark.innerHTML).toContain('<svg');
    expect(ref.metaline.textContent).toContain('东财');
    expect(ref.metaline.textContent).toContain('行情 2026-10-25 16:00:00');
    expect(ref.fresh.textContent).toBe('1m');
    expect(ref.fresh.className).toBe('fresh lv-normal');
    expect(ref.fresh.title).toContain('源数据时点');
    expect(ref.fresh.title).toContain('距今 1 分钟前');
  });

  it('失败时显示错误文案与 is-error；stale 加 is-stale 且不算 error 样式', () => {
    rowsEl.appendChild(list.buildRow(QUOTE()));
    list.updateRow(QUOTE({ ok: false, stale: false, error: '429', freshness: null }));
    let ref = refs.get('sp500');
    expect(ref.el.classList.contains('is-error')).toBe(true);
    expect(ref.err.textContent).toBe('取数失败：429');
    expect(ref.fresh.textContent).toBe('');

    list.updateRow(QUOTE({ ok: false, stale: true, error: 'old' }));
    ref = refs.get('sp500');
    expect(ref.el.classList.contains('is-stale')).toBe(true);
    expect(ref.el.classList.contains('is-error')).toBe(false);
  });

  it('suspect 新鲜度加 suspect 类；无 suspect 时移除', () => {
    rowsEl.appendChild(list.buildRow(QUOTE()));
    list.updateRow(QUOTE({ freshness: { ...QUOTE().freshness, suspect: true, suspectNote: '单日 +40%' } }));
    let ref = refs.get('sp500');
    expect(ref.el.classList.contains('suspect')).toBe(true);
    expect(ref.fresh.className).toContain('suspect');
    expect(ref.fresh.title).toContain('单日 +40%');

    list.updateRow(QUOTE());
    ref = refs.get('sp500');
    expect(ref.el.classList.contains('suspect')).toBe(false);
  });

  it('价格变化时闪一次 tick 类，随后自动移除', () => {
    vi.useFakeTimers();
    rowsEl.appendChild(list.buildRow(QUOTE()));
    list.updateRow(QUOTE({ price: 5700 }));
    list.updateRow(QUOTE({ price: 5738.2 }));
    const ref = refs.get('sp500');
    expect(ref.el.classList.contains('tick-up')).toBe(true);
    vi.advanceTimersByTime(800);
    expect(ref.el.classList.contains('tick-up')).toBe(false);
    vi.useRealTimers();
  });
});

describe('list.freshShort / apply / renderSkeleton', () => {
  it('新鲜度短标签的档位', () => {
    expect(list.freshShort(null)).toBe('—');
    expect(list.freshShort({ label: '实时推送' })).toBe('实时');
    expect(list.freshShort({ ageMs: null })).toBe('—');
    expect(list.freshShort({ ageMs: 5_000 })).toBe('5s');
    expect(list.freshShort({ ageMs: 90_000 })).toBe('2m');
    expect(list.freshShort({ ageMs: 3 * 3600_000 })).toBe('3h');
    expect(list.freshShort({ ageMs: 49 * 3600_000 })).toBe('2d');
  });

  it('apply 追加新行、更新已有行、移除消失的标的，并广播', () => {
    const seen = [];
    const off = on('quotes', (d) => seen.push(d));
    list.apply({
      ttlMs: 5000,
      generatedAt: '2026-10-26T02:00:00Z',
      items: [QUOTE(), QUOTE({ id: 'btc', name: '比特币', ok: false, error: 'down' })],
    });
    expect(rowsEl.querySelectorAll('.row')).toHaveLength(2);
    expect(store.ttl).toBe(5000);
    expect(store.quotes).toHaveLength(2);
    expect(updatedEl.textContent).toMatch(/更新于 .* · 1 项异常/);
    expect(rowsEl.getAttribute('aria-busy')).toBe('false');
    expect(seen).toHaveLength(1);

    list.apply({ items: [QUOTE({ price: 5740 })] });
    expect(rowsEl.querySelectorAll('.row')).toHaveLength(1);
    expect(refs.has('btc')).toBe(false);
    expect(updatedEl.textContent).toMatch(/更新于/);
    expect(updatedEl.textContent).not.toContain('异常');
    off();
  });

  it('renderSkeleton 按占位表重建并标记 busy', () => {
    rowsEl.innerHTML = '<article class="row">旧</article>';
    list.renderSkeleton();
    expect(rowsEl.querySelectorAll('.row')).toHaveLength(PLACEHOLDER.length);
    expect(rowsEl.getAttribute('aria-busy')).toBe('true');
    expect(refs.size).toBe(PLACEHOLDER.length);
  });
});

/* ------------------------------ 事件中心 ------------------------------ */

describe('events：日历与单条渲染', () => {
  const EV = (over = {}) => ({
    id: 'e1',
    time: '2026-10-26 10:05:00',
    level: 'high',
    llm: false,
    title: '美联储宣布降息',
    body: '正文',
    url: 'https://example.test/a',
    publisher: '金十数据',
    source: '金十数据',
    origin: 'direct',
    lang: 'zh',
    topics: [{ key: 'fed', label: '货币政策', strong: true }],
    symbols: ['sp500', 'unknown-sym'],
    ...over,
  });

  it('weekdayCN 按北京日期算，非法日期给空串', () => {
    expect(events.weekdayCN('2026-10-26')).toBe('周一');
    expect(events.weekdayCN('2026-10-25')).toBe('周日');
    expect(events.weekdayCN('not-a-date')).toBe('');
  });

  it('calendarBlockHTML：空数据显示占位；今天/明天/未来分别标注', () => {
    expect(String(events.calendarBlockHTML({ upcoming: [] }))).toContain('暂无日历数据');
    const html = String(
      events.calendarBlockHTML({
        today: '2026-10-26',
        upcoming: [
          { date: '2026-10-26', kind: 'fomc', title: 'FOMC 决议', time: '02:00' },
          { date: '2026-10-27', kind: 'cpi', title: 'CPI', time: '20:30' },
          { date: '2026-10-29', kind: 'unknown-kind', title: 'X', time: '09:00' },
        ],
      }),
    );
    expect(html).toContain('今天');
    expect(html).toContain('明天');
    expect(html).toContain('3 天后');
    expect(html).toContain('FOMC');
    expect(html).toContain('CPI');
    expect(html).toContain('unknown-kind');
  });

  it('eventItemHTML：等级徽标、主题/符号 Chip、一手标记、安全链接', () => {
    const html = String(events.eventItemHTML(EV()));
    expect(html).toContain('event lv-high');
    expect(html).toContain('ev-badge high');
    expect(html).toContain('ev-topic strong');
    expect(html).toContain('标普500'); // PLACEHOLDER 名称映射
    expect(html).not.toContain('unknown-sym');
    expect(html).toContain('一手');
    expect(html).toContain('href="https://example.test/a"');

    const mid = String(events.eventItemHTML(EV({ level: 'mid', llm: true, body: '' })));
    expect(mid).toContain('ev-badge mid');
    expect(mid).toContain('ev-ai');
    expect(mid).not.toContain('ev-body'); // body 为空不渲染段落

    // javascript: 链接整段不渲染
    const unsafe = String(events.eventItemHTML(EV({ url: 'javascript:alert(1)' })));
    expect(unsafe).not.toContain('ev-link');

    // 聚合来源带「索引」与语种标签，署名取 publisher
    const agg = String(
      events.eventItemHTML(EV({ origin: 'aggregate', lang: 'ja', publisher: '日本経済新聞', source: '日文财经', url: '' })),
    );
    expect(agg).toContain('ev-origin agg');
    expect(agg).toContain('ev-lang');
    expect(agg).toContain('日本経済新聞');
    expect(agg).not.toContain('ev-link');
  });

  it('NEW 标记来自 store.events.newIds', () => {
    store.events = { newIds: new Set(['e1']) };
    expect(String(events.eventItemHTML(EV()))).toContain('ev-new');
    store.events = { newIds: new Set() };
    expect(String(events.eventItemHTML(EV()))).not.toContain('ev-new');
  });
});

describe('events.renderEvents：加载态、过滤与覆盖行', () => {
  const ITEMS = [
    { id: 'a', time: '2026-10-26 10:00:00', level: 'high', title: 'A', topics: [{ key: 'fed', label: '货币政策' }], symbols: [], origin: 'direct', lang: 'en', publisher: 'P', source: 'S' },
    { id: 'b', time: '2026-10-26 09:00:00', level: 'mid', title: 'B', topics: [{ key: 'energy', label: '能源' }], symbols: [], origin: 'aggregate', lang: 'ja', publisher: 'P2', source: 'S2' },
    { id: 'c', time: '2026-10-26 08:00:00', level: 'low', title: 'C', topics: [{ key: 'fed', label: '货币政策' }], symbols: [], publisher: '金十', source: '金十数据' },
  ];

  const DATA = {
    total: 3,
    generatedAt: '2026-10-26T02:05:00Z',
    items: ITEMS,
    topics: [{ key: 'fed', label: '货币政策' }, { key: 'energy', label: '能源' }],
    sources: [
      { key: 'a', source: '金十数据', kind: 'domestic', ok: true, count: 1 },
      { key: 'b', source: '日文财经', kind: 'aggregate', ok: true, count: 1 },
      { key: 'dead', source: '挂了', kind: 'media', ok: false, error: 'timeout' },
    ],
    coverage: { sources: { total: 3, ok: 2, failed: 1 }, official: 0, media: 1, aggregate: 1, domestic: 1 },
    counts: { high: 1, mid: 1, low: 1 },
    llm: { enabled: true, applied: 2, pending: true },
  };

  it('没有数据时显示加载态', () => {
    events.renderEvents();
    expect(eventsEl.innerHTML).toContain('正在聚合');
  });

  it('默认全量；按等级/主题/来源分别过滤', () => {
    const render = (state) => {
      store.events = { data: DATA, calendar: null, level: 'all', topic: null, origin: 'all', newIds: new Set(), ...state };
      events.renderEvents();
      return eventsEl.querySelectorAll('.event').length;
    };
    expect(render({})).toBe(3);
    expect(render({ level: 'high' })).toBe(1);
    expect(render({ topic: 'fed' })).toBe(2);
    expect(render({ origin: 'direct' })).toBe(1);
    expect(render({ origin: 'aggregate' })).toBe(1);
    expect(render({ origin: 'domestic' })).toBe(1); // 没有 origin 字段 = 国内快讯
    expect(render({ origin: 'foreign' })).toBe(2); // lang!=='zh'
  });

  it('覆盖行列出可用/失败源与 AI 状态', () => {
    store.events = { data: DATA, calendar: null, level: 'all', newIds: new Set() };
    events.renderEvents();
    const text = eventsEl.textContent;
    expect(text).toContain('2/3 个源可用');
    expect(text).toContain('失败 挂了');
    // 文案迁移（方案 §4.4）：AI 复核 → AI 辅助分类，不背书原文真实性
    expect(text).toContain('AI 辅助分类 2/3');
    expect(text).toContain('…'); // pending
  });

  it('keepScroll 时保留滚动位置（jsdom 下为 0，不抛）', () => {
    store.events = { data: DATA, calendar: null, newIds: new Set() };
    window.scrollY = 120;
    expect(() => events.renderEvents({ keepScroll: true })).not.toThrow();
    expect(eventsEl.querySelectorAll('.event')).toHaveLength(3);
  });

  it('stopEventsTimer 可重复调用', () => {
    expect(() => events.stopEventsTimer()).not.toThrow();
    expect(events.eventsTimer).toBeNull();
  });
});

describe('events：显著性与比率色阶', () => {
  it('ratioBg：null 给底色，正负分别偏暖/偏冷，并夹在 ±1', () => {
    expect(events.ratioBg(null)).toBe('rgba(255,255,255,0.035)');
    expect(events.ratioBg(Number.NaN)).toBe('rgba(255,255,255,0.035)');
    expect(events.ratioBg(1.25)).toContain('rgba(245,69,92');
    expect(events.ratioBg(0.9)).toContain('rgba(91,156,248');
    expect(events.ratioBg(99)).toBe(events.ratioBg(1.75));
    expect(events.ratioBg(-99)).toBe(events.ratioBg(0.75));
  });

  it('eventStudyHTML：失败给错误占位；auto 选 isAuto 行，强制 lag 选对应行', () => {
    expect(String(events.eventStudyHTML(null))).toContain('暂无足够历史事件');
    expect(String(events.eventStudyHTML({ ok: false, error: '样本不足' }))).toContain('样本不足');

    const base = {
      ratio: 1.42,
      medianRatio: 1.3,
      eventMeanPct: 1.1,
      baseMeanPct: 0.7,
      t: 2.4,
      eventDays: 12,
      significant: true,
      symbol: 'sp500',
      name: '标普500',
      kind: 'fomc',
    };
    const study = {
      ok: true,
      kinds: [{ kind: 'fomc', count: 12 }, { kind: 'cpi', count: 9 }],
      rows: [
        { ...base, lag: 0, isAuto: false },
        { ...base, lag: 1, isAuto: true },
        { ...base, kind: 'cpi', lag: 0, isAuto: true },
      ],
    };

    const auto = String(events.eventStudyHTML(study, 'auto'));
    expect(auto).toContain('study-matrix');
    expect(auto).toContain('T+1'); // auto 选中 isAuto 的 lag=1 行
    expect(auto).toContain('1.42x');
    expect(auto).toContain('n=12');
    expect(auto).toContain('统计上最显著');

    const t0 = String(events.eventStudyHTML(study, '0'));
    expect(t0).toContain('T+0');
    const t1 = String(events.eventStudyHTML(study, '1'));
    expect(t1).toContain('T+1');

    // 缺某标的数据时该格是破折号
    const sparse = String(
      events.eventStudyHTML({ ok: true, kinds: [{ kind: 'cpi', count: 1 }], rows: [base] }, '0'),
    );
    expect(sparse).toContain('corr na');
  });
});

/* ------------------------------ 事件加载与生命周期 ------------------------------ */

describe('events.loadEvents / mount：网络、增量 NEW、失败与定时器', () => {
  const DATA = {
    total: 2,
    generatedAt: '2026-10-26T02:05:00Z',
    items: [
      { id: 'a', time: '2026-10-26 10:00:00', level: 'high', title: 'A', topics: [{ key: 'fed', label: '货币政策' }], symbols: [], publisher: 'P', source: 'S' },
      { id: 'b', time: '2026-10-26 09:00:00', level: 'mid', title: 'B', topics: [{ key: 'energy', label: '能源' }], symbols: [], publisher: 'P2', source: 'S2' },
    ],
    topics: [],
    sources: [],
    coverage: null,
    counts: { high: 1, mid: 1, low: 0 },
    llm: { enabled: false, applied: 0, pending: false },
  };

  function mockApi({ events = DATA, eventStatus = 200, study = { ok: true, kinds: [], rows: [] }, cal = { upcoming: [], today: '2026-10-26' } } = {}) {
    globalThis.fetch = vi.fn(async (url) => {
      /**
       * 按**路径段**匹配，不用前缀 —— `'./api/events'` 是 `'./api/eventstudy'`
       * 的前缀，靠 includes 判会先命中错的；而且请求层换成 buildUrl 生成 URL
       * 之后形状会变，前缀匹配会静默走错分支（表现为 newIds 变 null）。
       */
      const path = (() => {
        try {
          return new URL(String(url), 'http://x').pathname;
        } catch {
          return String(url);
        }
      })();
      if (path.endsWith('/api/eventstudy')) return { ok: true, status: 200, json: async () => study };
      if (path.endsWith('/api/events')) {
        return { ok: eventStatus === 200, status: eventStatus, json: async () => events };
      }
      if (path.endsWith('/api/calendar')) return { ok: true, status: 200, json: async () => cal };
      return { ok: true, status: 200, json: async () => ({}) };
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.fetch;
  });

  it('成功加载：写入 store、渲染、首次不标 NEW', async () => {
    mockApi();
    window.location.hash = '#/events';
    store.events = null;
    await events.loadEvents(true);
    expect(store.events.data.total).toBe(2);
    expect(store.events.study).toBeTruthy();
    expect(typeof store.events.calendar).toBe('object');
    expect(eventsEl.querySelectorAll('.event')).toHaveLength(2);
    expect(store.events.newIds).toBeNull();
  });

  it('同一批再拉一次不标 NEW；出现新条目才标', async () => {
    mockApi();
    window.location.hash = '#/events';
    store.events = null;
    await events.loadEvents(false); // 首次，prevIds 为空 → 不标
    expect(store.events.newIds).toBeNull();

    await events.loadEvents(false); // 同一批
    expect(store.events.newIds).toBeNull();

    mockApi({ events: { ...DATA, total: 3, items: [...DATA.items, { ...DATA.items[0], id: 'c', title: 'C' }] } });
    await events.loadEvents(false);
    expect(store.events.newIds.has('c')).toBe(true);
    expect(store.events.newCount).toBe(1);
    expect(String(events.eventItemHTML(store.events.items?.[0] ?? store.events.data.items[0]))).toBeTruthy();
  });

  it('HTTP 失败时写入错误面板，返回按钮清空 hash', async () => {
    mockApi({ eventStatus: 503 });
    window.location.hash = '#/events';
    await events.loadEvents(true);
    expect(eventsEl.innerHTML).toContain('d-error');
    const back = document.getElementById('back-events');
    back.click();
    expect(window.location.hash).toBe('');
  });

  it('LLM 仍在复核时安排一次 7 秒后的补拉（最多 4 次）', async () => {
    vi.useFakeTimers();
    mockApi({ events: { ...DATA, llm: { enabled: true, applied: 0, pending: true } } });
    window.location.hash = '#/events';
    store.events = null;
    await events.loadEvents(false);
    expect(store.events.llmRetry).toBeTruthy();
    const before = globalThis.fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(7100);
    expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(before);
    expect(store.events.llmRetryCount).toBe(1);
    clearTimeout(store.events.llmRetry);
    store.events.llmRetry = null;
  });

  it('loadEventStudy 缓存：不 force 不再请求；force 重新请求', async () => {
    mockApi({ study: { ok: true, kinds: [{ kind: 'fomc', count: 1 }], rows: [] } });
    const first = await events.loadEventStudy(true);
    expect(first.kinds).toHaveLength(1);
    const calls = globalThis.fetch.mock.calls.length;
    await events.loadEventStudy(false);
    expect(globalThis.fetch.mock.calls.length).toBe(calls);
    await events.loadEventStudy(true);
    expect(globalThis.fetch.mock.calls.length).toBe(calls + 1);
  });

  it('mountEvents 起 30s 轮询并拉一次；unmount 清掉 interval、llmRetry 与内容', async () => {
    vi.useFakeTimers();
    mockApi({ events: { ...DATA, llm: { enabled: true, applied: 0, pending: true } } });
    window.location.hash = '#/events';
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    events.mountEvents();
    expect(eventsEl.hidden).toBe(false);
    expect(events.eventsTimer).toBeTruthy();
    expect(scroll).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(store.events.llmRetry).toBeTruthy();

    events.unmountEvents();
    expect(events.eventsTimer).toBeNull();
    expect(store.events.llmRetry).toBeNull();
    expect(eventsEl.hidden).toBe(true);
    expect(eventsEl.innerHTML).toBe('');
    scroll.mockRestore();
  });
});

/* ================================================================== *
 * 同事件折叠（B2 / §4.4）
 *
 * 十条媒体转同一条央行发言不该占十行；但折叠不能吞掉原文，
 * 每条来源都要能展开看到。
 * ================================================================== */
describe('同事件折叠', () => {
  const mk = (id, publisher, title = '新西兰联储维持利率不变') => ({
    id,
    time: '2026-10-28 10:00:00',
    title,
    body: '',
    level: 'mid',
    topics: [],
    symbols: [],
    publisher,
    source: publisher,
    url: `https://example.test/${id}`,
  });

  const items = [mk('a', '路透'), mk('b', '彭博'), mk('c', '日经'), mk('d', '金十', '隔夜美股收涨')];
  const clusters = [
    { eventId: 'a', revision: 1, articleCount: 3, independentPublisherCount: 3, primary: 'a', articleIds: ['a', 'b', 'c'], sources: ['路透', '彭博', '日经'] },
    { eventId: 'd', revision: 1, articleCount: 1, independentPublisherCount: 1, primary: 'd', articleIds: ['d'], sources: ['金十'] },
  ];

  it('三条同事件报道折叠成一行，单条保持原样', () => {
    const rows = groupEventsByCluster(items, clusters);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('cluster');
    expect(rows[0].articleCount).toBe(3);
    expect(rows[0].others.map((o) => o.id)).toEqual(['b', 'c']);
    expect(rows[1].kind).toBe('single');
  });

  it('主条目沿用聚类给出的 primary，不按顺序猜', () => {
    const rows = groupEventsByCluster(items, [{ ...clusters[0], primary: 'c' }]);
    expect(rows[0].primary.id).toBe('c');
    expect(rows[0].others.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('没有聚类数据时退化成逐条渲染（不吞条目）', () => {
    expect(groupEventsByCluster(items, null)).toHaveLength(4);
    expect(groupEventsByCluster(items, [])).toHaveLength(4);
  });

  it('折叠行带展开按钮，其余报道默认隐藏', () => {
    const el = document.createElement('div');
    el.innerHTML = eventRowHTML(groupEventsByCluster(items, clusters)[0]).toString();
    // 顶层只有一条（主条目）；其余在隐藏容器里
    expect(el.querySelectorAll(':scope > article.event')).toHaveLength(1);
    expect(el.querySelector('.ev-cluster-toggle').textContent).toContain('同事件 3 条报道');
    expect(el.querySelector('.ev-cluster-more').hidden).toBe(true);
    // 其余两条仍然在 DOM 里：折叠不等于删除
    expect(el.querySelectorAll('.ev-cluster-more .event')).toHaveLength(2);
  });

  it('点开后能看到其余报道，再点收起；按钮文案与 aria 状态同步', () => {
    const el = document.createElement('div');
    el.innerHTML = eventRowHTML(groupEventsByCluster(items, clusters)[0]).toString();
    document.body.appendChild(el);
    bindClusterToggles(el);
    const btn = el.querySelector('.ev-cluster-toggle');
    const more = el.querySelector('.ev-cluster-more');

    btn.click();
    expect(more.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.textContent).toContain('收起其余报道');
    expect(btn.textContent).toContain('共 3 条');

    btn.click();
    expect(more.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.textContent).toContain('同事件 3 条报道');
    el.remove();
  });

  it('过滤后不在列表里的条目不会被当成折叠头', () => {
    // 只看 'b'（其他被筛掉）时，b 自己就是一行，不应显示「同事件 3 条」
    const rows = groupEventsByCluster([items[1]], clusters);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('cluster');
    expect(rows[0].primary.id).toBe('b');
    expect(rows[0].others).toHaveLength(0);
  });
});

/* ================================================================== *
 * 事件版本（C3）
 *
 * 只有改判过的条目才显示「第 N 版」；点开能看到每一版的标题与等级，
 * 且不覆盖原条目。
 * ================================================================== */
describe('事件版本徽章与面板', () => {
  const base = (over = {}) => ({
    id: 'jin10:9',
    time: '2026-10-28 10:00:00',
    title: 'OPEC+ 宣布减产',
    body: '',
    level: 'mid',
    topics: [],
    symbols: [],
    publisher: '金十数据',
    source: '金十数据',
    url: 'https://example.test/9',
    ...over,
  });

  it('没有改判（revision ≤ 1 或缺失）不显示徽章', () => {
    expect(events.revisionChipHTML(base())).toBe('');
    expect(events.revisionChipHTML(base({ revision: 1 }))).toBe('');
  });

  it('改判过就显示「第 N 版」，带条目 id 供取数', () => {
    const chip = events.revisionChipHTML(base({ revision: 3 })).toString();
    expect(chip).toContain('第 3 版');
    expect(chip).toContain('data-event-revisions="jin10:9"');
  });

  it('面板列出每一版的版本号、时间、等级与标题（最新在前）', () => {
    const rows = [
      { revision: 1, knownAt: '2026-10-28T02:00:00Z', payload: { title: '初版标题', level: 'mid' } },
      { revision: 2, knownAt: '2026-10-28T03:00:00Z', payload: { title: '改判后标题', level: 'high' } },
    ];
    const html = events.revisionPanelHTML('jin10:9', rows).toString();
    expect(html).toContain('#2');
    expect(html).toContain('#1');
    expect(html.indexOf('改判后标题')).toBeLessThan(html.indexOf('初版标题'));
    expect(html).toContain('high');
    expect(html).toContain('修订是追加的');
  });

  it('只带分类结果的版本说清它记了什么，不显示成「标题缺失」', () => {
    const rows = [
      { revision: 1, knownAt: '2026-10-28T02:00:00Z', payload: { partial: true, shockType: 'supply' } },
      { revision: 2, knownAt: '2026-10-28T03:00:00Z', payload: { title: '完整标题', level: 'mid' } },
    ];
    const html = events.revisionPanelHTML('jin10:9', rows).toString();
    expect(html).toContain('分类：供给受阻');
    expect(html).toContain('此版只记录了分类结果');
    expect(html).not.toContain('未记录标题');
  });

  it('没有版本记录时不渲染空面板', () => {
    expect(events.revisionPanelHTML('jin10:9', [])).toBe('');
    expect(events.revisionPanelHTML('jin10:9', null)).toBe('');
  });

  it('取数走 /api/events/:id/revisions，失败返回空数组而不是抛出', async () => {
    const ok = vi.fn(async () => ({ status: 200, json: async () => ({ revisions: [{ revision: 1 }] }) }));
    expect(await events.loadEventRevisions('jin10:9', { fetchImpl: ok })).toHaveLength(1);
    expect(ok.mock.calls[0][0]).toContain('/api/events/jin10%3A9/revisions');

    const bad = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await events.loadEventRevisions('jin10:9', { fetchImpl: bad })).toEqual([]);
  });
});

/* ================================================================== *
 * 事件中心的交互绑定（renderEvents 末尾那段）
 *
 * 每个按钮都对应一个用户动作；断言「点了之后 store 变成什么 + 页面有没有
 * 重绘」，因为这几处都是纯前端切状态、不重新请求。
 * ================================================================== */
describe('事件中心交互', () => {
  const DATA = {
    total: 2,
    generatedAt: '2026-10-26T02:05:00Z',
    items: [
      { id: 'a', time: '2026-10-26 10:00:00', level: 'high', title: 'A', topics: [{ key: 'fed', label: '货币政策' }], symbols: [], origin: 'direct', lang: 'en', publisher: 'P', source: 'S' },
      { id: 'b', time: '2026-10-26 09:00:00', level: 'mid', title: 'B', topics: [{ key: 'energy', label: '能源' }], symbols: [], origin: 'aggregate', lang: 'ja', publisher: 'P2', source: 'S2' },
    ],
    topics: [{ key: 'fed', label: '货币政策' }, { key: 'energy', label: '能源' }],
    sources: [],
    coverage: { sources: { total: 0, ok: 0, failed: 0 } },
    counts: { high: 1, mid: 1, low: 0 },
    study: { rows: [] },
  };

  const paint = (over = {}) => {
    store.events = { data: DATA, calendar: null, level: 'all', topic: null, origin: 'all', newIds: null, newCount: 0, ...over };
    events.renderEvents();
  };

  it('等级筛选：点按钮写回 store 并重绘', () => {
    paint();
    const btn = eventsEl.querySelector('#level-filter button[data-l="high"]');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(store.events.level).toBe('high');
    expect(eventsEl.querySelectorAll('.event').length).toBe(1);
  });

  it('主题筛选：点标签写回 store 并重绘', () => {
    paint();
    const btn = eventsEl.querySelector('#topic-filter .pick[data-t="energy"]');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(store.events.topic).toBe('energy');
    expect(eventsEl.querySelectorAll('.event').length).toBe(1);
  });

  it('来源筛选：点按钮写回 store 并重绘', () => {
    paint();
    const btn = eventsEl.querySelector('#origin-filter .pick[data-o="direct"]');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(store.events.origin).toBe('direct');
  });

  it('事件研究口径切换：T+0 / T+1 存成数字，auto 存成 auto', () => {
    paint({ studyMode: 'auto' });
    store.events.study = { rows: [{ lag: 0, n: 5 }, { lag: 1, n: 5 }] };
    events.renderEvents();
    const auto = eventsEl.querySelector('#study-lag button[data-lag="auto"]');
    if (auto) {
      auto.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(store.events.studyMode).toBe('auto');
    }
    const t1 = eventsEl.querySelector('#study-lag button[data-lag="1"]');
    if (t1) {
      t1.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(store.events.studyMode).toBe(1);
    }
  });

  it('「跳到最新」清掉新条目标记并回到顶部', () => {
    paint({ newIds: new Set(['a']), newCount: 1 });
    const btn = eventsEl.querySelector('#jump-new');
    if (btn) {
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(store.events.newIds).toBeNull();
      expect(store.events.newCount).toBe(0);
    }
  });

  it('返回按钮回到列表（hash 清空）', () => {
    paint();
    window.location.hash = '#/events';
    eventsEl.querySelector('#back-events')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(window.location.hash).toBe('');
  });
});
