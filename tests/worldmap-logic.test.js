/* ================================================================== *
 * 地图纯逻辑层
 *
 * 这层之所以能测，是因为时间从参数传进来（不用假定时器）、地理依赖由调用方
 * 注入（不用造地图数据）。重点覆盖三类容易错的东西：
 *
 *   · 与后端口径的一致性 —— 滤镜的 topic key、赛区、日历字段；
 *   · 状态机的时序 —— 20 秒无交互恢复、队列刷新不打断当前播放；
 *   · 边界值 —— 空数组、单点、横盘、除零、跨日界线。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

import {
  TOPIC_FILTERS, FILTER_BY_KEY, topicKeysOf, matchFilter, filterMapEvents, dominantTopic,
} from '../src/client/views/map/logic/filters.js';
import { sparklinePath, sparklineChange } from '../src/client/views/map/logic/sparkline.js';
import {
  bucketEvents24h, eventsUpTo, normalizedHeights, eventTimeMs, LEVEL_COLOR,
} from '../src/client/views/map/logic/timeline.js';
import {
  upcomingCalendarAlerts, formatCountdown, beijingHm, easternHm, ALERT_ANCHOR,
} from '../src/client/views/map/logic/calendar.js';
import {
  MODES, IDLE_RESUME_MS, QUEUE_HIGH_LIMIT, STEP_MS,
  createSpotlightState, buildSpotlightQueue, breakTopicRuns,
  spotlightReducer, currentSpotlightEvent, needsIdleTimer,
} from '../src/client/views/map/logic/spotlight.js';

import { COMPILED_TOPICS, REGION_WORDS } from '../src/server/domain/news-lexicon.js';

/* ------------------------------------------------------------------ *
 * 造数据
 * ------------------------------------------------------------------ */

const ev = (over = {}) => ({
  id: 'e1',
  time: '2026-10-27 12:00:00',
  title: 't',
  level: 'mid',
  region: 'us',
  score: 10,
  symbols: ['sp500'],
  topics: [{ key: 'equities', label: '权益市场', strong: true }],
  ...over,
});

const HOUR = 3600e3;

/* ------------------------------------------------------------------ *
 * 滤镜
 * ------------------------------------------------------------------ */

describe('主题滤镜', () => {
  it('六个滤镜，key 唯一，第一个是「全部」', () => {
    expect(TOPIC_FILTERS).toHaveLength(6);
    expect(TOPIC_FILTERS[0].key).toBe('all');
    expect(new Set(TOPIC_FILTERS.map((f) => f.key)).size).toBe(6);
    for (const f of TOPIC_FILTERS) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.icon.length).toBeGreaterThan(0);
    }
  });

  it('滤镜引用的 topic key 全部存在于后端 COMPILED_TOPICS', () => {
    const valid = new Set(COMPILED_TOPICS.map((t) => t.key));
    const used = [...new Set(TOPIC_FILTERS.flatMap((f) => f.topics ?? []))];
    const bad = used.filter((k) => !valid.has(k));
    expect(bad, `后端没有这些 topic key：${bad.join(', ')}`).toEqual([]);
  });

  it('「全部」放行一切，「重要」只看 level', () => {
    expect(matchFilter(ev({ level: 'low' }), 'all')).toBe(true);
    expect(matchFilter(ev({ level: 'low' }), 'high')).toBe(false);
    expect(matchFilter(ev({ level: 'high' }), 'high')).toBe(true);
  });

  it('主题滤镜按 key 命中，不要求 strong', () => {
    const e = ev({ topics: [{ key: 'energy', label: '能源', strong: false }] });
    expect(matchFilter(e, 'geo')).toBe(true);
    expect(matchFilter(e, 'fed')).toBe(false);
  });

  it('一个事件命中多个 topic 时，任意一个匹配即可（并集）', () => {
    const e = ev({
      topics: [
        { key: 'fed', label: '货币政策', strong: false },
        { key: 'energy', label: '能源', strong: true },
      ],
    });
    expect(matchFilter(e, 'fed')).toBe(true);
    expect(matchFilter(e, 'geo')).toBe(true);
    expect(matchFilter(e, 'china')).toBe(false);
  });

  it('贵金属不含 crypto —— v1 把加密当避险是错的', () => {
    const crypto = ev({ topics: [{ key: 'crypto', label: '加密资产', strong: true }] });
    expect(matchFilter(crypto, 'precious')).toBe(false);
    expect(matchFilter(crypto, 'all')).toBe(true);
  });

  it('未知滤镜 / 缺 topics 不抛异常', () => {
    expect(matchFilter(ev(), 'nope')).toBe(true);
    expect(matchFilter({ id: 'x' }, 'fed')).toBe(false);
    expect(topicKeysOf(undefined).size).toBe(0);
  });

  it('赛区与滤镜是「与」关系', () => {
    const items = [
      ev({ id: 'a', region: 'me', topics: [{ key: 'geopolitics', label: '地缘', strong: true }] }),
      ev({ id: 'b', region: 'us', topics: [{ key: 'geopolitics', label: '地缘', strong: true }] }),
      ev({ id: 'c', region: 'me', topics: [{ key: 'china', label: '中国政策', strong: true }] }),
    ];
    expect(filterMapEvents(items, { filterKey: 'geo', region: 'me' }).map((x) => x.id)).toEqual(['a']);
    expect(filterMapEvents(items, { filterKey: 'all', region: 'me' }).map((x) => x.id)).toEqual(['a', 'c']);
    expect(filterMapEvents(items, { filterKey: 'geo' })).toHaveLength(2);
  });

  it('非法输入返回空数组而不是抛', () => {
    expect(filterMapEvents(null)).toEqual([]);
    expect(filterMapEvents(undefined, {})).toEqual([]);
  });

  it('dominantTopic 优先取 strong', () => {
    expect(dominantTopic(ev({
      topics: [
        { key: 'rates', label: '债市', strong: false },
        { key: 'fed', label: '货币政策', strong: true },
      ],
    })).key).toBe('fed');
    expect(dominantTopic(ev({ topics: [{ key: 'fx', label: '汇率' }] })).key).toBe('fx');
    expect(dominantTopic(ev({ topics: [] }))).toBeNull();
    expect(dominantTopic(undefined)).toBeNull();
  });

  it('FILTER_BY_KEY 覆盖全部滤镜', () => {
    expect(FILTER_BY_KEY.size).toBe(TOPIC_FILTERS.length);
    for (const f of TOPIC_FILTERS) expect(FILTER_BY_KEY.get(f.key)).toBe(f);
  });
});

/* ------------------------------------------------------------------ *
 * Sparkline
 * ------------------------------------------------------------------ */

describe('Sparkline', () => {
  it('正常序列生成折线与面积，端点落在留白内', () => {
    const r = sparklinePath([{ p: 10 }, { p: 12 }, { p: 11 }], 56, 18, 1.5);
    // 三个点 → 两条 L 指令
    expect(r.line.match(/L/g)).toHaveLength(2);
    expect(r.line.startsWith('M1.50,')).toBe(true);
    expect(r.area.endsWith('Z')).toBe(true);
    expect(r.min).toBe(10);
    expect(r.max).toBe(12);
  });

  it('最高价贴顶、最低价贴底（都在留白内）', () => {
    const r = sparklinePath([{ p: 0 }, { p: 100 }], 56, 18, 1.5);
    const ys = [...r.line.matchAll(/,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeCloseTo(1.5, 2);
    expect(Math.max(...ys)).toBeCloseTo(16.5, 2);
  });

  it('横盘画中线，不除零', () => {
    const r = sparklinePath([{ p: 5 }, { p: 5 }, { p: 5 }]);
    expect(r.line).not.toContain('NaN');
    const ys = [...r.line.matchAll(/,([\d.]+)/g)].map((m) => Number(m[1]));
    for (const y of ys) expect(y).toBeCloseTo(9, 2);
  });

  it('空、单点、全无效值返回 null', () => {
    expect(sparklinePath([])).toBeNull();
    expect(sparklinePath([{ p: 5 }])).toBeNull();
    expect(sparklinePath([{ p: null }, { p: undefined }])).toBeNull();
    expect(sparklinePath(null)).toBeNull();
  });

  it('夹着 null 的点被跳过，剩余点仍能画', () => {
    const r = sparklinePath([{ p: 10 }, { p: null }, { p: 20 }]);
    expect(r).not.toBeNull();
    expect(r.line.match(/L/g)).toHaveLength(1);
  });

  it('首尾涨跌幅', () => {
    expect(sparklineChange([{ p: 100 }, { p: 110 }])).toBeCloseTo(10, 6);
    expect(sparklineChange([{ p: 0 }, { p: 10 }])).toBeNull();
    expect(sparklineChange([{ p: 5 }])).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 24h 分桶
 * ------------------------------------------------------------------ */

describe('24h 时间轴分桶', () => {
  const NOW = Date.parse('2026-10-27T12:00:00Z');

  it('固定 24 个桶，覆盖 now 前 24 小时', () => {
    const r = bucketEvents24h([], NOW);
    expect(r.buckets).toHaveLength(24);
    expect(r.to).toBe(NOW);
    expect(r.from).toBe(NOW - 24 * HOUR);
    for (let i = 1; i < 24; i += 1) {
      expect(r.buckets[i].start).toBe(r.buckets[i - 1].end);
    }
  });

  it('事件落到正确的小时桶（按北京墙钟解析）', () => {
    // 北京时间 = UTC+8。NOW = 2026-10-27 20:00 北京
    // 一条 19:00 北京的事件应落在最后一个桶
    const items = [ev({ time: '2026-10-27 19:00:00' })];
    const r = bucketEvents24h(items, NOW);
    expect(r.buckets[23].count).toBe(1);
    expect(r.total).toBe(1);
  });

  it('超出 24h 或未来时间的事件被排除', () => {
    const items = [
      ev({ time: '2026-10-27 19:00:00' }), // 在窗口内
      ev({ time: '2026-10-25 10:00:00' }), // 太旧
      ev({ time: '2026-10-28 10:00:00' }), // 未来
    ];
    const r = bucketEvents24h(items, NOW);
    expect(r.total).toBe(1);
  });

  it('桶色取桶内最高等级', () => {
    const items = [
      ev({ time: '2026-10-27 19:00:00', level: 'low' }),
      ev({ time: '2026-10-27 19:30:00', level: 'high' }),
    ];
    const r = bucketEvents24h(items, NOW);
    expect(r.buckets[23].level).toBe('high');
    expect(r.buckets[23].color).toBe(LEVEL_COLOR.high);
    expect(r.buckets[23].count).toBe(2);
  });

  it('数据覆盖不足 24h 时如实给出 coveredFrom', () => {
    const items = [ev({ time: '2026-10-27 19:00:00' })];
    const r = bucketEvents24h(items, NOW);
    expect(r.coveredFrom).not.toBeNull();
    expect(r.coveredFrom).toBeGreaterThan(r.from);
    expect(bucketEvents24h([], NOW).coveredFrom).toBeNull();
  });

  it('高度归一化到 0..1，空数据全 0', () => {
    const r = bucketEvents24h([ev({ time: '2026-10-27 19:00:00' })], NOW);
    const h = normalizedHeights(r.buckets);
    expect(Math.max(...h)).toBe(1);
    expect(normalizedHeights(bucketEvents24h([], NOW).buckets).every((x) => x === 0)).toBe(true);
  });

  it('eventsUpTo 按时刻截断', () => {
    const a = ev({ id: 'a', time: '2026-10-27 10:00:00' });
    const b = ev({ id: 'b', time: '2026-10-27 19:00:00' });
    expect(eventsUpTo([a, b], eventTimeMs(a)).map((x) => x.id)).toEqual(['a']);
  });

  it('非法时间返回 null 而不是 NaN', () => {
    expect(eventTimeMs({ time: 'nope' })).toBeNull();
    expect(eventTimeMs({})).toBeNull();
    expect(eventTimeMs(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 48h 日历信标
 * ------------------------------------------------------------------ */

describe('48h 日历信标', () => {
  /** 真实格式：后端给的 releaseAt 是 UTC ISO */
  const mk = (releaseAt, importance = 3, kind = 'cpi') => ({ kind, title: kind, releaseAt, importance, symbols: [] });
  const NOW = Date.parse('2026-10-27T11:00:00Z');

  it('只挑未来 48h 内、importance ≥ 2 的', () => {
    const cal = {
      upcoming: [
        mk('2026-10-28T12:30:00.000Z', 3), // 25.5h 后 ✓
        mk('2026-10-30T12:30:00.000Z', 3), // 73.5h 后 ✗
        mk('2026-10-28T12:30:00.000Z', 1), // 等级不够 ✗
        mk('2026-10-26T12:30:00.000Z', 3), // 已过去 ✗
      ],
    };
    const out = upcomingCalendarAlerts(cal, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].hoursLeft).toBeCloseTo(25.5, 1);
  });

  it('按发布时间升序', () => {
    const cal = { upcoming: [mk('2026-10-29T01:00:00.000Z'), mk('2026-10-27T20:00:00.000Z')] };
    const out = upcomingCalendarAlerts(cal, NOW);
    expect(out.map((a) => a.releaseAt)).toEqual([...out.map((a) => a.releaseAt)].sort((x, y) => x - y));
  });

  it('缺 releaseAt 的跳过 —— 不拿 date + time 去猜', () => {
    const cal = {
      upcoming: [
        { kind: 'cpi', date: '2026-10-28', time: '20:30', importance: 3 },
        mk('2026-10-28T12:30:00.000Z'),
      ],
    };
    expect(upcomingCalendarAlerts(cal, NOW)).toHaveLength(1);
  });

  it('边界：正好 48h 内保留，正好过期剔除', () => {
    const cal = {
      upcoming: [
        mk(new Date(NOW + 48 * HOUR).toISOString()),
        mk(new Date(NOW - 1000).toISOString()),
      ],
    };
    const out = upcomingCalendarAlerts(cal, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].msLeft).toBe(48 * HOUR);
  });

  it('窗口与等级可调', () => {
    const cal = { upcoming: [mk('2026-10-28T12:30:00.000Z', 1)] };
    expect(upcomingCalendarAlerts(cal, NOW, { minImportance: 1 })).toHaveLength(1);
    expect(upcomingCalendarAlerts(cal, NOW, { windowHours: 1 })).toHaveLength(0);
  });

  it('空 / 非法输入返回空数组', () => {
    expect(upcomingCalendarAlerts(null, NOW)).toEqual([]);
    expect(upcomingCalendarAlerts({}, NOW)).toEqual([]);
    expect(upcomingCalendarAlerts({ upcoming: [] }, NOW)).toEqual([]);
  });

  it('倒计时文本：秒 / 分 / 天三档', () => {
    expect(formatCountdown(0)).toBe('已发布');
    expect(formatCountdown(-5)).toBe('已发布');
    expect(formatCountdown(1000)).toBe('00:00:01');
    expect(formatCountdown(61 * 60e3 + 5000)).toBe('01:01:05');
    expect(formatCountdown(90000e3)).toBe('1d 01:00');
    expect(formatCountdown(NaN)).toBe('—');
  });

  it('北京 / 美东墙钟按真实时区换算（冬夏令时各一例）', () => {
    // 冬令时：美东 EST = UTC-5，14:00 ET = 19:00Z = 北京次日 03:00
    const winter = Date.parse('2026-01-28T19:00:00Z');
    expect(easternHm(winter)).toBe('14:00');
    expect(beijingHm(winter)).toBe('03:00');
    // 夏令时：美东 EDT = UTC-4，14:00 ET = 18:00Z = 北京次日 02:00
    const summer = Date.parse('2026-07-29T18:00:00Z');
    expect(easternHm(summer)).toBe('14:00');
    expect(beijingHm(summer)).toBe('02:00');
  });

  it('信标锚点在华盛顿', () => {
    expect(ALERT_ANCHOR.lon).toBeCloseTo(-77, 1);
    expect(ALERT_ANCHOR.lat).toBeCloseTo(38.9, 1);
  });
});

/* ------------------------------------------------------------------ *
 * 巡航队列
 * ------------------------------------------------------------------ */

describe('巡航队列', () => {
  const many = (n, over = {}) => Array.from({ length: n }, (_, i) => ev({
    id: `h${i}`,
    time: `2026-10-27 ${String(19 - i).padStart(2, '0')}:00:00`,
    level: 'high',
    score: 50,
    ...over,
  }));

  it('优先取高优事件，按时间倒序', () => {
    const items = [
      ...many(3),
      ev({ id: 'm1', level: 'mid', time: '2026-10-27 18:30:00', score: 99 }),
    ];
    const q = buildSpotlightQueue(items, {});
    expect(q[0].level).toBe('high');
    expect(q.map((e) => e.id).slice(0, 3)).toEqual(['h0', 'h1', 'h2']);
  });

  it('高优不足时用 mid 按 score 补位', () => {
    const items = [
      ev({ id: 'h1', level: 'high', time: '2026-10-27 19:00:00' }),
      ev({ id: 'm1', level: 'mid', score: 30, time: '2026-10-27 18:00:00' }),
      ev({ id: 'm2', level: 'mid', score: 90, time: '2026-10-27 17:00:00' }),
    ];
    const q = buildSpotlightQueue(items, { highLimit: 3 });
    expect(q).toHaveLength(3);
    // 补位按 score 降序：m2(90) 在 m1(30) 前
    expect(q.map((e) => e.id)).toEqual(['h1', 'm2', 'm1']);
  });

  it('low 级不进队列', () => {
    const items = [ev({ id: 'l1', level: 'low', score: 100 })];
    expect(buildSpotlightQueue(items, {})).toHaveLength(0);
  });

  it('hasTargets 为 false 的事件被剔除（没有靶点的没法连线）', () => {
    const items = [
      ev({ id: 'a', level: 'high', symbols: ['sp500'] }),
      ev({ id: 'b', level: 'high', symbols: [] }),
    ];
    const q = buildSpotlightQueue(items, { hasTargets: (e) => (e.symbols ?? []).length > 0 });
    expect(q.map((e) => e.id)).toEqual(['a']);
  });

  it('同时受滤镜与赛区约束', () => {
    const items = [
      ev({ id: 'geo-me', level: 'high', region: 'me', topics: [{ key: 'geopolitics', label: '地缘', strong: true }] }),
      ev({ id: 'fed-us', level: 'high', region: 'us', topics: [{ key: 'fed', label: '货币政策', strong: true }] }),
    ];
    expect(buildSpotlightQueue(items, { filterKey: 'geo' }).map((e) => e.id)).toEqual(['geo-me']);
    expect(buildSpotlightQueue(items, { region: 'us' }).map((e) => e.id)).toEqual(['fed-us']);
  });

  it('连续三条同主题会被打散', () => {
    const same = (id, key = 'energy') => ev({ id, level: 'high', topics: [{ key, label: key, strong: true }] });
    const list = [same('a'), same('b'), same('c'), same('d', 'china'), same('e')];
    const out = breakTopicRuns(list, 3);
    // 第 3 条（index 2）原来与前后同主题，应与后面的 china 交换
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'd', 'c', 'e']);
    // 长度与元素集合不变
    expect(out).toHaveLength(5);
    expect(new Set(out.map((e) => e.id)).size).toBe(5);
  });

  it('全员同主题时保持原序（没有可交换的对象）', () => {
    const same = (id) => ev({ id, level: 'high', topics: [{ key: 'energy', label: '能源', strong: true }] });
    const out = breakTopicRuns([same('a'), same('b'), same('c'), same('d')], 3);
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('无 topic 的事件不参与打散，也不报错', () => {
    const out = breakTopicRuns([ev({ id: 'a', topics: [] }), ev({ id: 'b', topics: [] }), ev({ id: 'c', topics: [] })], 3);
    expect(out).toHaveLength(3);
  });

  it('空输入返回空数组', () => {
    expect(buildSpotlightQueue(null)).toEqual([]);
    expect(buildSpotlightQueue([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 巡航状态机
 * ------------------------------------------------------------------ */

describe('巡航状态机', () => {
  const queue = [
    ev({ id: 'a', level: 'high' }),
    ev({ id: 'b', level: 'high' }),
    ev({ id: 'c', level: 'high' }),
  ];

  const withQueue = () => spotlightReducer(createSpotlightState(), { type: 'setQueue', queue });

  it('初始是 Auto、可见、停在第 0 条', () => {
    const s = createSpotlightState();
    expect(s.mode).toBe(MODES.AUTO);
    expect(s.index).toBe(0);
    expect(s.playing).toBe(true);
    expect(currentSpotlightEvent(s)).toBeNull(); // 队列还空
  });

  it('Auto 下 tick 循环推进', () => {
    let s = withQueue();
    expect(currentSpotlightEvent(s).id).toBe('a');
    s = spotlightReducer(s, { type: 'tick' });
    expect(currentSpotlightEvent(s).id).toBe('b');
    s = spotlightReducer(s, { type: 'tick' });
    s = spotlightReducer(s, { type: 'tick' });
    expect(currentSpotlightEvent(s).id).toBe('a'); // 回到首条
  });

  it('暂停后 tick 不推进', () => {
    let s = spotlightReducer(withQueue(), { type: 'setPlaying', playing: false });
    s = spotlightReducer(s, { type: 'tick' });
    expect(s.index).toBe(0);
  });

  it('悬停进入 Preview，移出回到 Auto', () => {
    let s = spotlightReducer(withQueue(), { type: 'hover', id: 'c', now: 1000 });
    expect(s.mode).toBe(MODES.PREVIEW);
    expect(currentSpotlightEvent(s).id).toBe('c');
    expect(s.returnTo).toBe(MODES.AUTO);
    s = spotlightReducer(s, { type: 'unhover', now: 2000 });
    expect(s.mode).toBe(MODES.AUTO);
    expect(s.previewId).toBeNull();
  });

  it('Preview 期间 tick 不推进', () => {
    let s = spotlightReducer(withQueue(), { type: 'hover', id: 'b', now: 0 });
    const before = s.index;
    s = spotlightReducer(s, { type: 'tick' });
    expect(s.index).toBe(before);
  });

  it('Preview 中点击 → Locked，并定位到那条', () => {
    let s = spotlightReducer(withQueue(), { type: 'hover', id: 'c', now: 0 });
    s = spotlightReducer(s, { type: 'click', id: 'c', now: 10 });
    expect(s.mode).toBe(MODES.LOCKED);
    expect(s.lockedId).toBe('c');
    expect(s.previewId).toBeNull();
    expect(currentSpotlightEvent(s).id).toBe('c');
  });

  it('Locked 期间悬停只换预览，不解除锁定', () => {
    let s = spotlightReducer(withQueue(), { type: 'click', id: 'a', now: 0 });
    s = spotlightReducer(s, { type: 'hover', id: 'b', now: 10 });
    expect(s.mode).toBe(MODES.LOCKED);
    expect(s.lockedId).toBe('a');
    expect(currentSpotlightEvent(s).id).toBe('b'); // 预览优先显示
    s = spotlightReducer(s, { type: 'unhover', now: 20 });
    expect(currentSpotlightEvent(s).id).toBe('a'); // 回到锁定那条
  });

  it('无交互 20 秒自动恢复（19 秒不动）', () => {
    const clickedAt = 1_000_000;
    let s = spotlightReducer(withQueue(), { type: 'click', id: 'a', now: clickedAt });
    expect(s.mode).toBe(MODES.LOCKED);

    s = spotlightReducer(s, { type: 'idle', now: clickedAt + IDLE_RESUME_MS - 1000 });
    expect(s.mode, '差 1 秒不该恢复').toBe(MODES.LOCKED);

    s = spotlightReducer(s, { type: 'idle', now: clickedAt + IDLE_RESUME_MS });
    expect(s.mode).toBe(MODES.AUTO);
    expect(s.lockedId).toBeNull();
  });

  it('恢复按钮立即回 Auto；空格走同一 action', () => {
    let s = spotlightReducer(withQueue(), { type: 'click', id: 'b', now: 0 });
    s = spotlightReducer(s, { type: 'resume', now: 5 });
    expect(s.mode).toBe(MODES.AUTO);
    expect(currentSpotlightEvent(s).id).toBe('b'); // 索引停在原地
  });

  it('刷新队列时正在播的那条不中断', () => {
    let s = withQueue();
    s = spotlightReducer(s, { type: 'tick' }); // 播到 b
    expect(currentSpotlightEvent(s).id).toBe('b');
    // 新队列里 b 仍在，但位置变了
    s = spotlightReducer(s, { type: 'setQueue', queue: [ev({ id: 'x' }), ...queue] });
    expect(currentSpotlightEvent(s).id).toBe('b');
    expect(s.queue).toHaveLength(4);
  });

  it('正在播的那条消失了，索引钳制到合法范围', () => {
    let s = withQueue();
    s = spotlightReducer(s, { type: 'tick' });
    s = spotlightReducer(s, { type: 'tick' }); // 播到 c
    s = spotlightReducer(s, { type: 'setQueue', queue: [ev({ id: 'n1' })] });
    expect(s.index).toBe(0);
    expect(currentSpotlightEvent(s).id).toBe('n1');
  });

  it('队列空了不越界', () => {
    let s = withQueue();
    s = spotlightReducer(s, { type: 'setQueue', queue: [] });
    expect(s.index).toBe(0);
    expect(currentSpotlightEvent(s)).toBeNull();
    expect(spotlightReducer(s, { type: 'tick' }).index).toBe(0);
  });

  it('回放结束回 Auto', () => {
    let s = spotlightReducer(withQueue(), { type: 'replay', now: 0 });
    expect(s.mode).toBe(MODES.REPLAY);
    expect(currentSpotlightEvent(s)).toBeNull();
    s = spotlightReducer(s, { type: 'replayEnd', now: 10 });
    expect(s.mode).toBe(MODES.AUTO);
  });

  it('未知 action 返回原状态引用（便于 React 式短路）', () => {
    const s = withQueue();
    expect(spotlightReducer(s, { type: 'wat' })).toBe(s);
    expect(spotlightReducer(s, null)).toBe(s);
  });

  it('needsIdleTimer 给出剩余毫秒', () => {
    const clickedAt = 5000;
    const s = spotlightReducer(withQueue(), { type: 'click', id: 'a', now: clickedAt });
    expect(needsIdleTimer(s, clickedAt)).toBe(IDLE_RESUME_MS);
    expect(needsIdleTimer(s, clickedAt + 15000)).toBe(IDLE_RESUME_MS - 15000);
    expect(needsIdleTimer(s, clickedAt + IDLE_RESUME_MS + 1)).toBe(0);
    expect(needsIdleTimer(createSpotlightState(), 0)).toBe(0);
  });

  it('常量与计划一致：6s 一步、20s 恢复、12 条上限、3 条去连续', () => {
    expect(STEP_MS).toBe(6000);
    expect(IDLE_RESUME_MS).toBe(20000);
    expect(QUEUE_HIGH_LIMIT).toBe(12);
    expect(REGIONSANITY()).toBe(true);
    function REGIONSANITY() {
      // 赛区词表只用来确认本文件没误用别处的常量
      return Array.isArray(REGION_WORDS) && REGION_WORDS.length > 0;
    }
  });
});
