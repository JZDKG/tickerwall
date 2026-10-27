/* ================================================================== *
 * 端点契约：金标准快照里不许出现「静默降级」的痕迹
 *
 * 这一层不比对实时数值（那由 .scratch 的四层冻结金标准负责），只钉住
 * 「结构完整」与「没有 ReferenceError 被 try/catch 吞掉」这两件事 ——
 * 后者是拆服务时最典型的伤害：服务照常起、页面照常渲染，只是某几个
 * 标的/字段默默变空。
 *
 * 快照缺失时整组跳过（在干净的 checkout 里没有 /tmp 基线是正常的）。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const DIR = process.env.GOLDEN_DIR || '/tmp/golden-baseline';

const load = (name) => {
  const f = `${DIR}/${name}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};

const hasGolden = existsSync(`${DIR}/quotes.json`);
const maybe = hasGolden ? describe : describe.skip;

maybe('端点契约：/api/quotes', () => {
  const data = load('quotes');

  it('23 个标的全部 ok，且没有 ReferenceError 的痕迹', () => {
    expect(data.items).toHaveLength(23);
    const bad = data.items.filter((i) => !i.ok);
    expect(bad.map((i) => `${i.id}: ${i.error}`)).toEqual([]);
  });

  it('每个标的都有来源与分时序列', () => {
    for (const it of data.items) {
      expect(it.source, `${it.id} 缺 source`).toBeTruthy();
      expect(Array.isArray(it.history), `${it.id} 缺 history`).toBe(true);
      expect(it.history.length, `${it.id} 分时为空`).toBeGreaterThan(0);
    }
  });
});

maybe('端点契约：/api/detail/*', () => {
  for (const name of ['detail-btc', 'detail-gold-cn']) {
    it(`${name}：日线、分时、统计都在，且多源错误里没有 ReferenceError`, () => {
      const d = load(name);
      expect(d.ok).toBe(true);
      expect(d.history?.daily?.length ?? 0).toBeGreaterThan(50);
      expect(d.intraday?.points?.length ?? 0).toBeGreaterThan(0);
      expect(Object.keys(d.stats ?? {}).length).toBeGreaterThan(10);

      // 关键：拆服务时漏 import 会把 ReferenceError 塞进这里，其余字段照常
      const errs = [...(d.history?.errors ?? []), ...(d.history?.cache?.errors ?? [])];
      const refErrors = errs.filter((e) => /is not defined|ReferenceError/i.test(e.error ?? ''));
      expect(refErrors, JSON.stringify(refErrors)).toEqual([]);
    });
  }
});

maybe('端点契约：/api/macro', () => {
  const data = load('macro');

  it('13 个品种全部 ok（漏 import 会让某个品种静默失败）', () => {
    expect(data.universe.length).toBeGreaterThanOrEqual(13);
    const bad = data.universe.filter((u) => !u.ok);
    expect(bad.map((u) => `${u.id}: ${u.error}`)).toEqual([]);
  });

  it('相关性矩阵规模与品种数一致', () => {
    const n = data.universe.length;
    expect(data.matrix.ids).toHaveLength(n);
    expect(data.matrix.corr).toHaveLength(n);
    for (const row of data.matrix.corr) expect(row).toHaveLength(n);
  });
});

maybe('端点契约：/api/calendar 与 /api/eventstudy', () => {
  it('日历：FOMC 与 BLS 两类事件都在，且没有源级错误', () => {
    const c = load('calendar');
    expect(c.events.length).toBeGreaterThan(10);
    const kinds = new Set(c.events.map((e) => e.kind));
    expect(kinds.has('fomc'), '缺 FOMC').toBe(true);
    expect([...kinds].some((k) => k !== 'fomc'), '缺 BLS 类事件').toBe(true);
    expect(c.errors ?? []).toEqual([]);
    expect(c.coverage?.monthsFetched?.length ?? 0).toBeGreaterThan(1);
  });

  it('事件研究：每个 kind×symbol 都有样本量与均值（漏 import 会让某组静默为空）', () => {
    const s = load('eventstudy');
    expect(s.ok).toBe(true);
    expect(s.rows.length).toBeGreaterThan(10);
    expect(s.kinds.length).toBeGreaterThan(0);
    for (const r of s.rows) {
      expect(r.eventDays, `${r.kind}/${r.symbol} 无事件日`).toBeGreaterThan(0);
      expect(Number.isFinite(r.eventMeanPct), `${r.kind}/${r.symbol} 缺均值`).toBe(true);
      expect(Number.isFinite(r.baseMeanPct), `${r.kind}/${r.symbol} 缺基准均值`).toBe(true);
    }
  });
});

maybe('端点契约：/api/briefing', () => {
  it('隔夜复盘有真实基准与条目（不是 collecting 兜底）', () => {
    const b = load('briefing');
    expect(b.ok).toBe(true);
    expect(b.status).not.toBe('collecting');
    expect(b.items.length).toBeGreaterThan(5);
    for (const it of b.items) {
      expect(it.id).toBeTruthy();
      expect(Number.isFinite(it.from)).toBe(true);
      expect(Number.isFinite(it.to)).toBe(true);
    }
  });
});
