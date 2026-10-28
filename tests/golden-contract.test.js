/* ================================================================== *
 * 端点契约：金标准快照里不许出现「静默降级」的痕迹
 *
 * 这一层不比对实时数值（那由 .scratch 的四层冻结金标准负责），只钉住
 * 「结构完整」与「没有 ReferenceError 被 try/catch 吞掉」这两件事 ——
 * 后者是拆服务时最典型的伤害：服务照常起、页面照常渲染，只是某几个
 * 标的/字段默默变空。
 *
 * 快照来自仓库内 `tests/fixtures/golden/`（见该目录 README），不是 /tmp：
 * 缺文件直接失败 —— 静默跳过会让「本机通过」被误当成「干净 checkout 通过」。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const DIR = process.env.GOLDEN_DIR || new URL('./fixtures/golden', import.meta.url).pathname;

const load = (name) => {
  const f = `${DIR}/${name}.json`;
  if (!existsSync(f)) {
    throw new Error(`缺少冻结快照 ${f}（契约测试不允许静默跳过，见 tests/fixtures/golden/README.md）`);
  }
  return JSON.parse(readFileSync(f, 'utf8'));
};

describe('端点契约：冻结快照本身可用', () => {
  it('tests/fixtures/golden 下有 quotes.json，且带录制时间', () => {
    const data = load('quotes');
    expect(Array.isArray(data.items)).toBe(true);
    expect(Number.isFinite(Date.parse(data.generatedAt))).toBe(true);
  });
});

describe('端点契约：/api/quotes', () => {
  const data = load('quotes');

  it('23 个标的全部 ok，且没有 ReferenceError 的痕迹', () => {
    expect(data.items).toHaveLength(23);
    const bad = data.items.filter((i) => !i.ok);
    expect(bad.map((i) => `${i.id}: ${i.error}`)).toEqual([]);
  });

  it('全球股指走活源：不得回落到停更的 sina:int_*', () => {
    const byId = new Map(data.items.map((i) => [i.id, i]));
    // hsi 走腾讯（东财断连时它才是活的那条腿）；其余四个走 CNBC
    expect(byId.get('hsi').source).toBe('tencent:hkHSI');
    for (const id of ['n225', 'ftse', 'dji', 'bvsp']) {
      expect(byId.get(id).source, `${id} 应走 cnbc`).toMatch(/^cnbc:/);
    }
    const zombie = data.items.filter((i) => /sina:int_/.test(String(i.source)));
    expect(zombie.map((i) => i.id), '这些源已停更一年，返回值是僵尸价').toEqual([]);
  });

  it('日经价格落在真实区间（僵尸价 44946.64 与真实价 6.3 万差 40%）', () => {
    const n225 = data.items.find((i) => i.id === 'n225');
    expect(n225.price).toBeGreaterThan(50_000);
    expect(n225.price).toBeLessThan(80_000);
  });

  it('每个标的都有来源与分时序列', () => {
    for (const it of data.items) {
      expect(it.source, `${it.id} 缺 source`).toBeTruthy();
      expect(Array.isArray(it.history), `${it.id} 缺 history`).toBe(true);
      expect(it.history.length, `${it.id} 分时为空`).toBeGreaterThan(0);
    }
  });
});

describe('端点契约：/api/detail/*', () => {
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

describe('端点契约：/api/macro', () => {
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

describe('端点契约：/api/calendar 与 /api/eventstudy', () => {
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

describe('端点契约：/api/briefing', () => {
  it('隔夜复盘有真实基准与条目（不是 collecting 兜底）', () => {
    const b = load('briefing');
    expect(b.ok).toBe(true);
    expect(b.status).not.toBe('collecting');
    expect(b.items.length).toBeGreaterThan(5);
    // 跨源口径错位的行会被拦下并登记原因，而不是当成「隔夜涨跌」展示
    expect(Array.isArray(b.dropped)).toBe(true);
    for (const d of b.dropped) {
      expect(d.id, 'dropped 里每行都要能指名是哪个标的').toBeTruthy();
      expect(Math.abs(d.movePct)).toBeGreaterThan(d.limit);
    }
    for (const it of b.items) {
      expect(it.id).toBeTruthy();
      expect(Number.isFinite(it.from)).toBe(true);
      expect(Number.isFinite(it.to)).toBe(true);
    }
  });
});
