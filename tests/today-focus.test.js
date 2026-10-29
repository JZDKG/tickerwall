import { describe, it, expect } from 'vitest';
import { pickTodayFocus } from '../src/server/domain/today-focus.js';


/* ================================================================== *
 * 第 86 轮：why 里不许出现内部代码；同等级下优先中文报道
 * ================================================================== */
describe('读者语言', () => {
  const items = [
    { id: 'a', title: 'Marktbericht: DAX dürfte vor EZB-Zinsentscheid zulegen', time: '2026-10-29 14:00:00', level: 'high', symbols: ['us10y'] },
    { id: 'b', title: '美联储官员称通胀仍有粘性', time: '2026-10-29 13:00:00', level: 'high', symbols: ['us10y'] },
    { id: 'c', title: '油价因供给中断走高', time: '2026-10-29 12:00:00', level: 'low', symbols: ['oil'] },
  ];

  it('why 用中文名，不出现 us10y 这类内部代码', () => {
    const rows = pickTodayFocus({ items, day: '2026-10-29' });
    const why = rows.map((r) => r.why).join(' ');
    expect(why).not.toMatch(/us10y|gold-intl|dxy/);
    expect(why).toContain('美国 10 年期国债收益率');
  });

  it('同等级下中文报道排前面（非中文不剔除，但要靠后）', () => {
    const rows = pickTodayFocus({ items, day: '2026-10-29' });
    const latin = rows.findIndex((r) => r.id === 'a');
    const han = rows.findIndex((r) => r.id === 'b');
    expect(han).toBeLessThan(latin);
  });

  it('每条都带 script，界面据此标「原文」', () => {
    const rows = pickTodayFocus({ items, day: '2026-10-29' });
    expect(rows.find((r) => r.id === 'a').script).toBe('latin');
    expect(rows.find((r) => r.id === 'b').script).toBe('han');
  });
});
