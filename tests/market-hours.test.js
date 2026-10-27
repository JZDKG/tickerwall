/* ================================================================== *
 * 市场时段 / 新鲜度 / 时间解析的契约测试
 *
 * 被测：src/server/domain/market-hours.js（纯函数，零 I/O）
 *
 * 这一层的所有坑都是「时区」和「跨午夜」，而且错了不会报错 —— 只会让某个市场
 * 的开市灯常年亮错、新鲜度常年判成 stale。所以断言全部写成**具体时刻 + 期望布尔**，
 * 不用「大概对」的写法。
 *
 * 时区事实（2026）：
 *   · 欧盟夏令时结束 = 10 月最后一个周日 2026-10-25
 *   · 美国夏令时结束 = 11 月第一个周日 2026-11-01
 *   · 于是 10-26 ～ 10-31 这一周，欧盟已冬令时、美国还在夏令时 —— 两国错开
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  MARKET_PROFILES,
  GLOBEX_ET,
  localClock,
  hhmmToMin,
  isMarketOpen,
  marketStatusOf,
  parseDataTime,
  gradeFreshness,
  humanAge,
} from '../src/server/domain/market-hours.js';

const at = (iso) => new Date(iso);
const open = (name, iso) => isMarketOpen(MARKET_PROFILES[name], at(iso));

/* ================================================================== *
 * 本地时钟
 * ================================================================== */

describe('localClock：按交易所本地时区取「周几 + 当日第几分钟」', () => {
  it('上海时间与 UTC 差 8 小时', () => {
    expect(localClock('Asia/Shanghai', at('2026-10-27T00:00:00Z'))).toEqual({ day: 2, minutes: 480 });
    expect(localClock('UTC', at('2026-10-27T00:00:00Z'))).toEqual({ day: 2, minutes: 0 });
  });

  it('午夜返回 0 而不是 1440（en-US 默认会格式化成 "24:15"）', () => {
    const c = localClock('America/New_York', at('2026-10-27T04:00:00Z')); // 00:00 EDT
    expect(c.minutes).toBe(0);
    expect(c.day).toBe(2);
  });

  it('跨时区同刻换日：UTC 周一 23:00 → 上海已是周二 07:00', () => {
    expect(localClock('UTC', at('2026-10-26T23:00:00Z'))).toEqual({ day: 1, minutes: 1380 });
    expect(localClock('Asia/Shanghai', at('2026-10-26T23:00:00Z'))).toEqual({ day: 2, minutes: 420 });
  });

  it('hhmmToMin 容错：非法值当 0', () => {
    expect(hhmmToMin('09:30')).toBe(570);
    expect(hhmmToMin('24:00')).toBe(1440);
    expect(hhmmToMin('bad')).toBe(0);
  });
});

/* ================================================================== *
 * 美股：夏令时 / 冬令时
 * ================================================================== */

describe('美股时段随时令切换', () => {
  it('夏令时（EDT, UTC−4）：09:30 开盘 = 13:30Z', () => {
    expect(open('us-index', '2026-10-28T13:29:00Z')).toBe(false);
    expect(open('us-index', '2026-10-28T13:30:00Z')).toBe(true);
    expect(open('us-index', '2026-10-28T19:59:00Z')).toBe(true);
    expect(open('us-index', '2026-10-28T20:00:00Z')).toBe(false); // 16:00 收盘，右开区间
  });

  it('冬令时（EST, UTC−5）：同一个 13:30Z 已变成 08:30，未开盘', () => {
    expect(open('us-index', '2026-11-03T13:30:00Z')).toBe(false);
    expect(open('us-index', '2026-11-03T14:30:00Z')).toBe(true); // 09:30 EST
    expect(open('us-index', '2026-11-03T21:00:00Z')).toBe(false); // 16:00 EST
  });

  it('切换周前后同一个绝对时刻结论翻转（证明不是写死北京时间）', () => {
    expect(open('us-index', '2026-10-30T13:30:00Z')).toBe(true);  // 周五 09:30 EDT
    expect(open('us-index', '2026-11-02T13:30:00Z')).toBe(false); // 周一 08:30 EST
  });
});

/* ================================================================== *
 * 美欧错周
 * ================================================================== */

describe('美欧错周切冬令时（10-26 ~ 10-31）', () => {
  it('欧盟已在冬令时：07:30Z 从「已开盘」变成「还没开」', () => {
    // 10-22 仍 CEST（UTC+2）→ 09:30 柏林，已开盘
    expect(open('eu-index', '2026-10-22T07:30:00Z')).toBe(true);
    // 10-28 已切 CET（UTC+1）→ 08:30 柏林，未开盘
    expect(open('eu-index', '2026-10-28T07:30:00Z')).toBe(false);
    expect(open('eu-index', '2026-10-28T08:00:00Z')).toBe(true); // 09:00 CET
  });

  it('同一周美国还在夏令时，结论不变 —— 这就是「错周」', () => {
    // 18:00Z = 纽约 14:00 EDT（盘中），柏林 19:00 CET（已收盘 17:30）
    expect(open('us-index', '2026-10-28T18:00:00Z')).toBe(true);
    expect(open('eu-index', '2026-10-28T18:00:00Z')).toBe(false);
    // 欧盟收盘（16:30Z）后美股还有 3.5 小时 —— 这段窗口只有美国在交易
    expect(open('eu-index', '2026-10-28T16:30:00Z')).toBe(false);
    expect(open('us-index', '2026-10-28T16:30:00Z')).toBe(true);
  });
});

/* ================================================================== *
 * 跨午夜的周几归属
 * ================================================================== */

describe('北京时间凌晨的美股归属（原先写死北京时间必错）', () => {
  it('北京时间周六 02:00 = 美东周五 14:00 → 盘中', () => {
    expect(open('us-index', '2026-10-31T02:00:00+08:00')).toBe(true);
  });

  it('北京时间周一 02:00 = 美东周日 14:00 → 休市', () => {
    expect(open('us-index', '2026-11-02T02:00:00+08:00')).toBe(false);
  });

  it('同一把尺子：北京时间周五 22:00（美东周五 10:00）也是盘中', () => {
    expect(open('us-index', '2026-10-30T22:00:00+08:00')).toBe(true);
  });
});

/* ================================================================== *
 * Globex 结算窗
 * ================================================================== */

describe('Globex 每日 17:00–18:00（ET）结算窗', () => {
  const PROFILE = ['us-rate', 'fx', 'intl-futures'];

  it('夏令时下 21:00Z–21:59Z 三分钟粒度都对：关闭', () => {
    for (const name of PROFILE) {
      expect(open(name, '2026-10-27T20:59:00Z'), `${name} 16:59 ET 应开`).toBe(true);
      expect(open(name, '2026-10-27T21:00:00Z'), `${name} 17:00 ET 应关`).toBe(false);
      expect(open(name, '2026-10-27T21:30:00Z'), `${name} 17:30 ET 应关`).toBe(false);
      expect(open(name, '2026-10-27T21:59:00Z'), `${name} 17:59 ET 应关`).toBe(false);
      expect(open(name, '2026-10-27T22:00:00Z'), `${name} 18:00 ET 应开`).toBe(true);
    }
  });

  it('冬令时窗口整体后移一小时（22:00Z–22:59Z）', () => {
    expect(open('us-rate', '2026-11-03T21:30:00Z')).toBe(true);  // 16:30 EST
    expect(open('us-rate', '2026-11-03T22:30:00Z')).toBe(false); // 17:30 EST
    expect(open('us-rate', '2026-11-03T23:00:00Z')).toBe(true);  // 18:00 EST
  });

  it('周日晚 18:00 开盘、周五 17:00 收盘后到周日 18:00 之间休市', () => {
    expect(open('us-rate', '2026-10-30T21:00:00Z')).toBe(false); // 周五 17:00 ET 已收
    expect(open('us-rate', '2026-11-01T22:00:00Z')).toBe(false); // 周日 17:00 EST 还没开
    expect(open('us-rate', '2026-11-01T23:00:00Z')).toBe(true);  // 周日 18:00 EST 开
  });

  it('GLOBEX_ET 本身的结构：四个区间、无跨午夜', () => {
    expect(GLOBEX_ET).toHaveLength(4);
    for (const r of GLOBEX_ET) {
      expect(hhmmToMin(r.to)).toBeGreaterThanOrEqual(hhmmToMin(r.from));
    }
  });
});

/* ================================================================== *
 * 上金所跨午夜夜盘
 * ================================================================== */

describe('上金所夜盘跨午夜（拆上下半场，不靠跨日判断）', () => {
  it('夜盘上半场 20:00 开、19:59 还没开', () => {
    expect(open('cn-spot', '2026-10-28T19:59:00+08:00')).toBe(false);
    expect(open('cn-spot', '2026-10-28T20:00:00+08:00')).toBe(true);
    expect(open('cn-spot', '2026-10-28T23:59:00+08:00')).toBe(true);
  });

  it('夜盘下半场跨到次日 02:30，左闭右开', () => {
    expect(open('cn-spot', '2026-10-28T01:00:00+08:00')).toBe(true);
    expect(open('cn-spot', '2026-10-28T02:29:00+08:00')).toBe(true);
    expect(open('cn-spot', '2026-10-28T02:30:00+08:00')).toBe(false);
  });

  it('日盘三段：09:00–11:30 / 13:30–15:30', () => {
    expect(open('cn-spot', '2026-10-28T08:59:00+08:00')).toBe(false);
    expect(open('cn-spot', '2026-10-28T09:00:00+08:00')).toBe(true);
    expect(open('cn-spot', '2026-10-28T11:30:00+08:00')).toBe(false); // 午休
    expect(open('cn-spot', '2026-10-28T13:30:00+08:00')).toBe(true);
    expect(open('cn-spot', '2026-10-28T15:30:00+08:00')).toBe(false);
  });

  it('周末不开：周六凌晨与周六晚上都休市', () => {
    expect(open('cn-spot', '2026-10-31T01:00:00+08:00')).toBe(false);
    expect(open('cn-spot', '2026-10-31T21:00:00+08:00')).toBe(false);
  });

  it('已知边界：夜盘上半场只登记到周四，所以周五晚不开', () => {
    // ranges 里上半场是 [1,2,3,4]（周一～周四）20:00–24:00，下半场是 [2,3,4,5] 00:00–02:30。
    // 合起来就是：周一到周四晚间各开一场，跨到次日凌晨 02:30 收。
    // 换言之「周五夜盘」在配置里不存在，周五 20:00 之后即判休市。
    // 这里如实钉住当前行为 —— 改动它属于交易时段的业务决策，不在抽离范围内。
    expect(open('cn-spot', '2026-10-29T23:59:00+08:00')).toBe(true);  // 周四晚
    expect(open('cn-spot', '2026-10-30T01:00:00+08:00')).toBe(true);  // 周五凌晨（周四场下半场）
    expect(open('cn-spot', '2026-10-30T23:59:00+08:00')).toBe(false); // 周五晚，配置里没有
    expect(open('cn-spot', '2026-10-31T00:30:00+08:00')).toBe(false); // 周六凌晨
  });
});

/* ================================================================== *
 * 24×7 与缺失配置
 * ================================================================== */

describe('crypto 与缺失配置', () => {
  it('ranges 为空 = 24×7，任何时刻都开', () => {
    for (const iso of ['2026-10-31T03:00:00Z', '2026-11-01T12:00:00Z', '2026-10-27T00:00:00Z']) {
      expect(isMarketOpen(MARKET_PROFILES.crypto, at(iso))).toBe(true);
    }
  });

  it('profile 为 null 返回 null（不是 false）—— 调用方据此区分「未知」与「已收盘」', () => {
    expect(isMarketOpen(null, at('2026-10-27T12:00:00Z'))).toBeNull();
    expect(marketStatusOf({ market: 'not-exist' })).toBeNull();
  });

  it('marketStatusOf 的文案三态', () => {
    expect(marketStatusOf({ market: 'crypto' })).toMatchObject({ label: '24×7', open: true });
    expect(marketStatusOf({ market: 'us-index' })).toHaveProperty('label');
    const s = marketStatusOf({ market: 'us-index' });
    expect(['交易中', '已收盘']).toContain(s.label);
    expect(s.market).toBe('美股');
  });

  it('17 个市场配置都带齐 tz / priceBasis / daysPerYear', () => {
    expect(Object.keys(MARKET_PROFILES)).toHaveLength(17);
    for (const [key, p] of Object.entries(MARKET_PROFILES)) {
      expect(p.tz, `${key} 缺 tz`).toBeTruthy();
      expect(['close', 'settle'], `${key} priceBasis 异常`).toContain(p.priceBasis);
      expect(p.daysPerYear, `${key} daysPerYear 异常`).toBeGreaterThan(200);
    }
  });
});

/* ================================================================== *
 * parseDataTime
 * ================================================================== */

describe('parseDataTime：源给的时间戳格式不止一种', () => {
  const now = at('2026-10-27T06:40:00Z'); // 北京 14:40

  it('完整日期时间按北京时间解析', () => {
    const d = parseDataTime('2026-10-27 14:37:43', now);
    expect(d.toISOString()).toBe('2026-10-27T06:37:43.000Z');
  });

  it('只有时分秒 → 补成北京时间当天', () => {
    const d = parseDataTime('14:37:43', now);
    expect(d.toISOString()).toBe('2026-10-27T06:37:43.000Z');
  });

  it('时分秒比现在还晚一小时以上 → 判为昨天（跨零点）', () => {
    const d = parseDataTime('23:50:00', now); // 北京 23:50 > 14:40
    expect(d.toISOString()).toBe('2026-10-26T15:50:00.000Z');
  });

  it('刚刚过去的时分秒不会被误判成昨天', () => {
    const d = parseDataTime('14:39:00', now); // 只早 1 分钟，不触发回退
    expect(d.toISOString()).toBe('2026-10-27T06:39:00.000Z');
  });

  it('只有日期 → 当天 00:00（北京时间）', () => {
    expect(parseDataTime('2026-10-27', now).toISOString()).toBe('2026-10-26T16:00:00.000Z');
  });

  it('空值 / 无法识别 → null', () => {
    for (const v of [null, undefined, '', 'not a time', '2026/10/27']) {
      expect(parseDataTime(v, now)).toBeNull();
    }
  });
});

/* ================================================================== *
 * gradeFreshness / humanAge
 * ================================================================== */

describe('gradeFreshness：交易中与已收盘用两套容忍度', () => {
  const m = (n) => n * 60_000;

  it('交易中：2 / 15 / 60 分钟三档 + stale', () => {
    expect(gradeFreshness(m(0), true)).toBe('fresh');
    expect(gradeFreshness(m(2), true)).toBe('fresh');
    expect(gradeFreshness(m(2.01), true)).toBe('normal');
    expect(gradeFreshness(m(15), true)).toBe('normal');
    expect(gradeFreshness(m(15.01), true)).toBe('delayed');
    expect(gradeFreshness(m(60), true)).toBe('delayed');
    expect(gradeFreshness(m(60.01), true)).toBe('stale');
  });

  it('已收盘：4 天内都算正常（收盘价本来就不动）', () => {
    expect(gradeFreshness(m(24 * 60), false)).toBe('normal');
    expect(gradeFreshness(m(3 * 24 * 60), false)).toBe('normal');
    expect(gradeFreshness(m(4 * 24 * 60), false)).toBe('normal');
    expect(gradeFreshness(m(4 * 24 * 60 + 1), false)).toBe('stale');
  });

  it('同样的 3 小时：交易中已 stale，收盘后仍是 normal', () => {
    const threeHours = m(180);
    expect(gradeFreshness(threeHours, true)).toBe('stale');
    expect(gradeFreshness(threeHours, false)).toBe('normal');
  });
});

describe('humanAge', () => {
  it('秒 / 分 / 小时 / 天 四档', () => {
    expect(humanAge(12_000)).toBe('12 秒前');
    expect(humanAge(59_000)).toBe('59 秒前');
    expect(humanAge(60_000)).toBe('1 分钟前');
    expect(humanAge(35 * 60_000)).toBe('35 分钟前');
    expect(humanAge(3600_000)).toBe('1 小时前');
    expect(humanAge(47 * 3600_000)).toBe('47 小时前');
    expect(humanAge(48 * 3600_000)).toBe('2 天前');
  });

  it('负值不出现「-N 秒前」', () => {
    expect(humanAge(-5000)).toBe('0 秒前');
  });
});
