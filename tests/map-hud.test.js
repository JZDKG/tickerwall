// @vitest-environment jsdom
/* ================================================================== *
 * 盘面接力带 + 宏观胶囊 + 华盛顿倒计时（views/map/layers/hud.js）
 *
 * 这块回答一个问题：「现在地球上有人在交易吗，接下来轮到谁。」
 * 断言的都是会被用户直接读到的结论，不是「函数返回了字符串」。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  ALERT_ANCHOR,
  SESSION_GROUPS,
  alertCardHtml,
  alertChipHtml,
  alertsNow,
  formatOpenIn,
  macroCapsuleHtml,
  relayBandHtml,
  summarizeSession,
} from '../src/client/views/map/layers/hud.js';

const mount = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

/** 造一个报价表 */
const quotes = (entries) => new Map(entries.map(([id, over]) => [id, { id, ok: true, name: id, ...over }]));

describe('紧凑时长', () => {
  it('分 / 时分 / 天时三种写法', () => {
    expect(formatOpenIn(43 * 60_000)).toBe('43m');
    expect(formatOpenIn((2 * 3600 + 13 * 60) * 1000)).toBe('2h13m');
    expect(formatOpenIn((3 * 86400 + 2 * 3600) * 1000)).toBe('3d2h');
  });

  it('负数与非法值给空串（不显示 -1m 这种鬼东西）', () => {
    expect(formatOpenIn(-5000)).toBe('0m');
    expect(formatOpenIn(null)).toBe('');
    expect(formatOpenIn(NaN)).toBe('');
  });
});

describe('盘面汇总', () => {
  const asia = SESSION_GROUPS.find((g) => g.key === 'asia');
  const now = Date.parse('2026-10-28T02:00:00Z');

  it('任一市场开着就写「交易中」', () => {
    const r = summarizeSession(
      asia,
      quotes([
        ['n225', { marketStatus: { open: true }, changePct: 1.2 }],
        ['sh000001', { marketStatus: { open: false }, changePct: -0.3 }],
      ]),
      now,
    );
    expect(r.anyOpen).toBe(true);
    expect(r.statusText).toBe('交易中');
    expect(r.openCount).toBe(1);
  });

  it('全关时给最早的下次开盘倒计时', () => {
    const r = summarizeSession(
      asia,
      quotes([
        ['n225', { marketStatus: { open: false, nextOpenAt: '2026-10-28T03:00:00Z' } }],
        ['hsi', { marketStatus: { open: false, nextOpenAt: '2026-10-28T01:30:00Z' } }],
      ]),
      now,
    );
    expect(r.anyOpen).toBe(false);
    // 最早的是 01:30Z，但此刻已经 02:00Z → 剩余按 0 算，仍是「待开盘」
    expect(r.statusText).toContain('待开盘');
    expect(r.nextOpenAt).toBe('2026-10-28T01:30:00.000Z');
  });

  it('没有下次开盘时间时写「休市」，不编一个倒计时', () => {
    const r = summarizeSession(asia, quotes([['n225', { marketStatus: { open: false } }]]), now);
    expect(r.statusText).toBe('休市');
    expect(r.nextOpenInMs).toBeNull();
  });

  it('温度是等权平均，缺涨跌幅的不进分母（不是当 0 算）', () => {
    const r = summarizeSession(
      asia,
      quotes([
        ['n225', { changePct: 2 }],
        ['hsi', { changePct: null }],
        ['sh000001', { changePct: -1 }],
      ]),
      now,
    );
    expect(r.avgPct).toBeCloseTo(0.5, 10);
    expect(r.count).toBe(3);
  });

  it('失败的报价不算成员（ok=false 不进统计）', () => {
    const r = summarizeSession(
      asia,
      new Map([
        ['n225', { id: 'n225', ok: false, changePct: 5 }],
        ['hsi', { id: 'hsi', ok: true, changePct: 1 }],
      ]),
      now,
    );
    expect(r.count).toBe(1);
    expect(r.avgPct).toBe(1);
  });

  it('一个成员都没有时 avgPct 是 null（不是 0）', () => {
    const r = summarizeSession(asia, new Map(), now);
    expect(r.avgPct).toBeNull();
    expect(r.count).toBe(0);
    expect(r.statusText).toBe('休市');
  });
});

describe('接力带渲染', () => {
  it('三大盘面各一枚胶囊，带锚点与状态', () => {
    const el = mount(
      relayBandHtml(
        quotes([
          ['n225', { marketStatus: { open: true }, changePct: 1 }],
          ['sp500', { marketStatus: { open: false }, changePct: -0.5 }],
        ]),
      ),
    );
    const chips = el.querySelectorAll('.relay-chip');
    expect(chips).toHaveLength(SESSION_GROUPS.length);
    expect(el.querySelector('[data-anchor="asia"]').className).toContain('on');
    expect(el.querySelector('[data-anchor="us"]').className).not.toContain('on');
    expect(el.textContent).toContain('交易中');
  });

  it('涨跌用类名 + 符号双表达（不只靠颜色）', () => {
    const el = mount(relayBandHtml(quotes([['n225', { changePct: 1.23 }]])));
    const asia = el.querySelector('[data-anchor="asia"] .rc-pct');
    expect(asia.className).toContain('up');
    expect(asia.textContent).toBe('+1.23%');
  });

  it('没有数据时显示破折号而不是 NaN', () => {
    const el = mount(relayBandHtml(new Map()));
    expect(el.textContent).not.toContain('NaN');
    expect(el.textContent).toContain('—');
  });
});

describe('宏观胶囊', () => {
  it('没有 macro 数据时整块不渲染（可选面板不该拖垮地图）', () => {
    expect(macroCapsuleHtml(null, new Map())).toBe('');
    expect(macroCapsuleHtml({ data: null }, new Map())).toBe('');
    expect(macroCapsuleHtml({ data: {} }, new Map())).toBe('');
  });

  it('有风险偏好时给灯，偏多/偏空用不同类名', () => {
    const up = mount(macroCapsuleHtml({ data: { riskAppetite: { label: '风险偏好上行' } } }, new Map()));
    expect(up.querySelector('.mc-risk').className).toContain('up');
    const down = mount(macroCapsuleHtml({ data: { riskAppetite: { label: '风险偏好下行' } } }, new Map()));
    expect(down.querySelector('.mc-risk').className).toContain('down');
  });

  it('VIX 与 VRP 一起显示；VRP 带符号', () => {
    const el = mount(
      macroCapsuleHtml(
        { data: { riskAppetite: { label: '中性' }, vrp: { vrp: -3.4 } } },
        quotes([['vix', { price: 18.23 }]]),
      ),
    );
    expect(el.textContent).toContain('18.2');
    expect(el.textContent).toContain('VRP');
    expect(el.textContent).toContain('-3.4');
  });

  it('金/油/币三个快照各自成项，失败的跳过', () => {
    const el = mount(
      macroCapsuleHtml(
        { data: { riskAppetite: { label: '中性' } } },
        quotes([
          ['gold-intl', { name: '国际金价', changePct: 0.5 }],
          ['oil', { name: '国际原油', changePct: -1.2 }],
          ['btc', { name: '比特币', ok: false }],
        ]),
      ),
    );
    const items = el.querySelectorAll('.mc-item');
    expect(items).toHaveLength(2);
    expect(el.textContent).toContain('国际金价');
    expect(el.textContent).not.toContain('比特币');
  });
});

describe('华盛顿倒计时', () => {
  // 只认 releaseAt 这个 UTC ISO：前端不自己拼 date + time（跨时区必错）
  const cal = {
    upcoming: [
      { title: '美国9月CPI同比', releaseAt: '2026-10-28T12:30:00Z', importance: 3, symbols: ['us10y', 'dxy'], source: 'BLS' },
    ],
  };
  const nowMs = Date.parse('2026-10-28T12:00:00Z'); // 北京 20:00，美东 08:00

  it('anchor 固定为华盛顿（数据源都在美国）', () => {
    expect(ALERT_ANCHOR.label).toBe('华盛顿');
  });

  it('信标胶囊只挂一条最近的，标题过长会截断', () => {
    const [a] = alertsNow(cal, nowMs);
    const el = mount(alertChipHtml(a));
    expect(el.querySelector('.cal-bolt')).toBeTruthy();
    expect(el.textContent).toContain('美国9月CPI同比');
    expect(el.querySelector('.cal-when')).toBeTruthy();
    expect(el.querySelector('.cal-left')).toBeTruthy();
  });

  it('长标题截断后带省略号（不撑破一行）', () => {
    const el = mount(
      alertChipHtml({
        ev: { title: '这是一个非常非常长的经济数据标题超过十四字' },
        releaseAt: Date.parse('2026-10-28T12:30:00Z'),
        msLeft: 1_800_000,
      }),
    );
    expect(el.querySelector('.cal-name').textContent.endsWith('…')).toBe(true);
  });

  it('预览卡同时给北京时间与美东时间（读者在北京，源在美国）', () => {
    const [a] = alertsNow(cal, nowMs);
    const el = mount(alertCardHtml(a, quotes([['us10y', { name: '美债10年期', price: 4.123, decimals: 3 }]])));
    const rows = [...el.querySelectorAll('.ac-row i')].map((i) => i.textContent);
    expect(rows).toContain('北京');
    expect(rows).toContain('美东');
    expect(el.textContent).toContain('4.123');
  });

  it('没有关联标的时只是少一段，不影响其它内容', () => {
    const el = mount(
      alertCardHtml({ ev: { title: 'X' }, releaseAt: Date.parse('2026-10-28T12:30:00Z'), msLeft: 60_000 }, new Map()),
    );
    expect(el.querySelector('.ac-syms')).toBeNull();
    expect(el.textContent).toContain('北京');
  });

  it('null 输入返回空串', () => {
    expect(alertChipHtml(null)).toBe('');
    expect(alertCardHtml(null)).toBe('');
  });

  it('48 小时内只有一条时列表也只有一条', () => {
    expect(alertsNow(cal, nowMs)).toHaveLength(1);
  });

  it('事件已过期则列表为空（不挂一个负倒计时）', () => {
    expect(alertsNow(cal, Date.parse('2026-10-30T00:00:00Z'))).toHaveLength(0);
  });
});

/* ================================================================== *
 * 覆盖边角：这些分支不会抛，只会让某个状态显示错
 * ================================================================== */
describe('边角分支', () => {
  const now = Date.parse('2026-10-28T02:00:00Z');

  it('风险偏好的三种写法都能归类，认不出就按平', () => {
    const cls = (label) => mount(macroCapsuleHtml({ data: { riskAppetite: { label } } }, new Map())).querySelector('.mc-risk')?.className ?? '';
    expect(cls('risk-on')).toContain('up');
    expect(cls('防守')).toContain('down');
    expect(cls('说不清')).toContain('flat');
  });

  it('VIX 没有价格时显示破折号（不是 undefined）', () => {
    const el = mount(macroCapsuleHtml({ data: { riskAppetite: { label: '中性' } } }, quotes([['vix', { price: null }]])));
    expect(el.textContent).toContain('—');
    expect(el.textContent).not.toContain('undefined');
  });

  it('nextOpenAt 非法字符串被忽略（不产生 NaN 倒计时）', () => {
    const asia = SESSION_GROUPS.find((g) => g.key === 'asia');
    const r = summarizeSession(asia, quotes([['n225', { marketStatus: { open: false, nextOpenAt: 'not-a-date' } }]]), now);
    expect(r.nextOpenInMs).toBeNull();
    expect(r.statusText).toBe('休市');
  });

  it('已过期的下次开盘时间按 0 剩余处理（不显示负倒计时）', () => {
    const asia = SESSION_GROUPS.find((g) => g.key === 'asia');
    const r = summarizeSession(asia, quotes([['n225', { marketStatus: { open: false, nextOpenAt: '2026-10-28T01:00:00Z' } }]]), now);
    expect(r.nextOpenInMs).toBe(0);
    expect(r.statusText).toContain('0m');
  });

  it('日历没有 upcoming 字段时返回空数组（不抛）', () => {
    expect(alertsNow(null, now)).toEqual([]);
    expect(alertsNow({}, now)).toEqual([]);
    expect(alertsNow({ upcoming: [] }, now)).toEqual([]);
  });

  it('importance 不足的事件不进列表（不把低优先级事件变成信标）', () => {
    const cal = { upcoming: [{ title: '小数据', releaseAt: '2026-10-28T02:30:00Z', importance: 1 }] };
    expect(alertsNow(cal, now)).toHaveLength(0);
  });

  it('多个事件按发布时间升序（最近的排前面）', () => {
    const cal = {
      upcoming: [
        { title: '晚', releaseAt: '2026-10-28T06:00:00Z', importance: 3 },
        { title: '早', releaseAt: '2026-10-28T03:00:00Z', importance: 3 },
      ],
    };
    expect(alertsNow(cal, now).map((a) => a.ev.title)).toEqual(['早', '晚']);
  });

  it('倒计时正好为 0 时写「已发布」（不是 -0m）', () => {
    const el = mount(alertChipHtml({ ev: { title: 'X' }, releaseAt: now, msLeft: 0 }));
    expect(el.textContent).toContain('已发布');
  });

  it('预览卡没有来源时不渲染来源行', () => {
    const el = mount(alertCardHtml({ ev: { title: 'X' }, releaseAt: now, msLeft: 1000 }, new Map()));
    expect([...el.querySelectorAll('.ac-row i')].map((i) => i.textContent)).not.toContain('来源');
  });
});
