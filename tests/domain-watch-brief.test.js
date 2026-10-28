/* ================================================================== *
 * 关注问题简报（产品 2.3）
 *
 * 每条约束都是「不要为了填满版面而说」：
 *   · 简报可以为空，不抓新闻凑数；
 *   · 只看与所关注问题相关的事件；
 *   · 同一事件的转载不重复提醒（按标题指纹，不按 id —— 转载方给新 id）；
 *   · 时间窗是「上次查看之后」，不是「最近 24 小时」。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { buildWatchBrief, summarizeBrief, titleFingerprint } from '../src/server/domain/watch-brief.js';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const DAY = 24 * 3600_000;

const ev = (over = {}) => ({
  id: 'e1',
  time: '2026-10-28 10:00:00',
  title: '美联储官员称通胀仍高于目标',
  level: 'mid',
  symbols: ['gold-intl'],
  ...over,
});

describe('标题指纹', () => {
  it('去掉转载前缀与标点后一致', () => {
    const a = titleFingerprint('【快讯】美联储官员称通胀仍高于目标');
    const b = titleFingerprint('快讯: 美联储官员称，通胀仍高于目标。');
    expect(a).toBe(b);
  });

  it('不同内容不会被归一成同一个（否则会误吞真新闻）', () => {
    expect(titleFingerprint('金价上涨')).not.toBe(titleFingerprint('金价下跌'));
  });

  it('空标题给空串', () => {
    expect(titleFingerprint(null)).toBe('');
  });
});

describe('筛选：只看关注的问题', () => {
  it('只收命中关注资产的事件', () => {
    const items = buildWatchBrief({
      items: [ev(), ev({ id: 'e2', symbols: ['oil'], title: '原油库存下降' })],
      watchedAssets: new Set(['gold-intl']),
      sinceMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('e1');
  });

  it('命中多个关注资产时都记下来', () => {
    const items = buildWatchBrief({
      items: [ev({ symbols: ['gold-intl', 'gold-cn'] })],
      watchedAssets: new Set(['gold-intl', 'gold-cn']),
      sinceMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(items[0].assets).toEqual(['gold-intl', 'gold-cn']);
  });

  it('没有关注任何资产时简报必然为空（这是正常状态，不是故障）', () => {
    const items = buildWatchBrief({ items: [ev()], watchedAssets: new Set(), sinceMs: NOW - DAY, nowMs: NOW });
    expect(items).toEqual([]);
  });
});

describe('时间窗是「上次查看之后」', () => {
  it('上次查看之前的事件不算新变化', () => {
    const items = buildWatchBrief({
      items: [ev({ time: '2026-10-26 10:00:00' })],
      watchedAssets: new Set(['gold-intl']),
      sinceMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(items).toEqual([]);
  });

  it('三天没来，三天前那件事仍然是新变化', () => {
    const items = buildWatchBrief({
      items: [ev({ time: '2026-10-25 10:00:00' })],
      watchedAssets: new Set(['gold-intl']),
      sinceMs: NOW - 4 * DAY,
      nowMs: NOW,
    });
    expect(items).toHaveLength(1);
  });

  it('未来时间的事件被上界挡住', () => {
    const items = buildWatchBrief({
      items: [ev({ time: '2026-11-05 10:00:00' })],
      watchedAssets: new Set(['gold-intl']),
      sinceMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(items).toEqual([]);
  });
});

describe('转载去重', () => {
  it('同一件事三家都在报，只出一条，并记下条数', () => {
    const items = buildWatchBrief({
      items: [
        ev({ id: 'a' }),
        ev({ id: 'b', title: '【转载】美联储官员称通胀仍高于目标' }),
        ev({ id: 'c', title: '快讯：美联储官员称，通胀仍高于目标。' }),
      ],
      watchedAssets: new Set(['gold-intl']),
      sinceMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(items).toHaveLength(1);
    expect(items[0].sources).toBe(3);
  });

  it('不同的事不会被并掉', () => {
    const items = buildWatchBrief({
      items: [ev({ id: 'a' }), ev({ id: 'b', title: '美联储官员称通胀已回落' })],
      watchedAssets: new Set(['gold-intl']),
      sinceMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(items).toHaveLength(2);
  });
});

describe('排序与上限', () => {
  it('high 排前面，其次按时间倒序', () => {
    const items = buildWatchBrief({
      items: [
        ev({ id: 'a', level: 'mid', time: '2026-10-28 11:00:00', title: 'A' }),
        ev({ id: 'b', level: 'high', time: '2026-10-28 09:00:00', title: 'B' }),
      ],
      watchedAssets: new Set(['gold-intl']),
      sinceMs: NOW - DAY,
      nowMs: NOW,
    });
    expect(items[0].id).toBe('b');
  });

  it('limit 生效（简报不该变成第二份事件流）', () => {
    const many = Array.from({ length: 20 }, (_, i) => ev({ id: `e${i}`, title: `标题 ${i}` }));
    expect(buildWatchBrief({
      items: many, watchedAssets: new Set(['gold-intl']), sinceMs: NOW - DAY, nowMs: NOW, limit: 4,
    })).toHaveLength(4);
  });
});

describe('汇总：空是正常状态', () => {
  it('没选关注问题 → NO_WATCH（不是「暂无重要更新」）', () => {
    const s = summarizeBrief({ items: [], watchedKeys: [], sinceMs: NOW - DAY, nowMs: NOW });
    expect(s.reason).toBe('NO_WATCH');
    expect(s.empty).toBe(true);
    expect(s.hasWatch).toBe(false);
  });

  it('选了但没有变化 → NO_CHANGES', () => {
    const s = summarizeBrief({ items: [], watchedKeys: ['gold-gap'], sinceMs: NOW - DAY, nowMs: NOW });
    expect(s.reason).toBe('NO_CHANGES');
    expect(s.empty).toBe(true);
  });

  it('有变化 → HAS_ITEMS 并给条数', () => {
    const s = summarizeBrief({ items: [ev()], watchedKeys: ['gold-gap'], sinceMs: NOW - DAY, nowMs: NOW });
    expect(s.reason).toBe('HAS_ITEMS');
    expect(s.count).toBe(1);
    expect(s.empty).toBe(false);
  });

  it('带上 sinceMs 与检查时刻（读者要知道「自上次查看」是什么时候）', () => {
    const s = summarizeBrief({ items: [], watchedKeys: ['k'], sinceMs: 123, nowMs: NOW });
    expect(s.sinceMs).toBe(123);
    expect(s.checkedAt).toBe(new Date(NOW).toISOString());
  });
});
