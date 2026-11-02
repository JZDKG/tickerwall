/* ================================================================== *
 * A 股取数适配器（providers/a-share.js）的离线测试
 *
 * 全部是纯函数，喂固定串 —— 字段下标错一位不会报错、只会把昨收当现价，
 * 所以每条都断言到具体字段，不做「长度大于 0」这种假断言。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  SH_INDEX_CODES,
  TENCENT_FIELD,
  aShareSymbol,
  emSecid,
  parseTencentBatchQuotes,
  parseTencentKline,
  parseTencentTickPage,
  parseTencentSnapshot,
  parseEmPool,
} from '../src/server/providers/a-share.js';

/** 造一条腾讯 88 字段响应行（索引与线上一致，改一处就能复现某字段错位） */
function tencentLine(sym, overrides = {}) {
  const f = new Array(88).fill('');
  f[1] = '贵州茅台';
  f[3] = '1354.00';
  f[4] = '1330.75';
  f[5] = '1349.99';
  f[30] = '20261029161457';
  f[31] = '23.25';
  f[32] = '1.75';
  f[33] = '1356.00';
  f[34] = '1330.01';
  f[35] = '1354.00/42992/5797980334';
  f[37] = '579798';
  f[38] = '0.34';
  f[39] = '20.79';
  f[43] = '1.95';
  f[44] = '16926.10';
  f[45] = '16926.10';
  f[46] = '6.74';
  f[47] = '1463.83';
  f[48] = '1197.68';
  f[49] = '0.98';
  f[52] = '19.01';
  f[58] = '162.4800';
  for (const [k, v] of Object.entries(overrides)) f[Number(k)] = v;
  return `v_${sym}="${f.join('~')}";`;
}

describe('代码路由', () => {
  it('沪市指数白名单先于 9x/6x 判断（000001 是上证指数，不是深市个股）', () => {
    expect(aShareSymbol('000001')).toBe('sh000001');
    expect(aShareSymbol('000300')).toBe('sh000300');
    expect(aShareSymbol('000905')).toBe('sh000905');
    expect([...SH_INDEX_CODES]).toContain('000300');
  });

  it('920 号段必须在 9x 判断之前，否则北交所新股会落到 sh', () => {
    expect(aShareSymbol('920021')).toBe('bj920021');
    expect(aShareSymbol('832982')).toBe('bj832982');
    expect(aShareSymbol('430047')).toBe('bj430047');
  });

  it('显式前缀原样透传：sh000001 与 sz000001 是两只不同的标的', () => {
    expect(aShareSymbol('sh000001')).toBe('sh000001');
    expect(aShareSymbol('SZ000001')).toBe('sz000001');
    expect(aShareSymbol('sz000001')).not.toBe(aShareSymbol('000001'));
  });

  it('沪 ETF / 科创板走 sh，创业板走 sz', () => {
    expect(aShareSymbol('510300')).toBe('sh510300');
    expect(aShareSymbol('588000')).toBe('sh588000');
    expect(aShareSymbol('688017')).toBe('sh688017');
    expect(aShareSymbol('399006')).toBe('sz399006');
    expect(aShareSymbol('300750')).toBe('sz300750');
  });

  it('解析不出 6 位代码要抛错，不能静默当某只票', () => {
    expect(() => aShareSymbol('6005190')).toThrow(/代码解析失败/);
    expect(() => aShareSymbol('')).toThrow();
  });

  it('东财 secid：1=沪，0=深/北（ETF 与 B 股不能靠 startswith(6) 判市）', () => {
    expect(emSecid('600519')).toBe('1.600519');
    expect(emSecid('510300')).toBe('1.510300');
    expect(emSecid('000001')).toBe('1.000001');
    expect(emSecid('300750')).toBe('0.300750');
    expect(emSecid('920021')).toBe('0.920021');
  });
});

describe('腾讯批量行情解析', () => {
  it('按实测下标取值：43 是振幅、44 流通市值、45 总市值、46 PB', () => {
    const map = parseTencentBatchQuotes(tencentLine('sh600519'));
    const q = map.sh600519;
    expect(q.name).toBe('贵州茅台');
    expect(q.price).toBe(1354);
    expect(q.prevClose).toBe(1330.75);
    expect(q.changePct).toBe(1.75); // 已是百分数，不再除 100
    expect(q.peTtm).toBe(20.79);
    expect(q.peStatic).toBe(19.01);
    expect(q.pb).toBe(6.74);
    expect(q.amplitudePct).toBe(1.95);
    expect(q.floatMcapYi).toBe(16926.1);
    expect(q.mcapYi).toBe(16926.1);
    expect(q.limitUp).toBe(1463.83);
    expect(q.isStale).toBe(false);
    expect(TENCENT_FIELD.pb).toBe(46);
  });

  it('键用调用方原始写法：同时传 sh000001 / sz000001 不会互相覆盖', () => {
    const keyOf = new Map([
      ['sh000001', 'sh000001'],
      ['sz000001', 'sz000001'],
    ]);
    const text = tencentLine('sh000001', { 1: '上证指数', 3: '3651.43' }) + tencentLine('sz000001', { 1: '平安银行', 3: '11.50' });
    const map = parseTencentBatchQuotes(text, keyOf);
    expect(map.sh000001.price).toBe(3651.43);
    expect(map.sz000001.price).toBe(11.5);
    expect(Object.keys(map)).toHaveLength(2);
  });

  it('僵尸报价：成交量为 0 且现价==昨收 → isStale，且北交所老号段给出迁移提示', () => {
    const old = parseTencentBatchQuotes(tencentLine('bj832982', { 1: '贝特瑞', 3: '112.60', 4: '112.60', 37: '0' }));
    expect(old.bj832982.isStale).toBe(true);
    expect(old.bj832982.staleReason).toMatch(/920xxx/);
    const halted = parseTencentBatchQuotes(tencentLine('sz000002', { 3: '8.00', 4: '8.00', 37: '0' }));
    expect(halted.sz000002.isStale).toBe(true);
    expect(halted.sz000002.staleReason).toMatch(/成交量为 0/);
  });

  it('字段不足 53 的行（错误页 / 空壳）直接丢弃，不产出半截报价', () => {
    expect(parseTencentBatchQuotes('v_sh600519="1~贵州茅台~600519";')).toEqual({});
    expect(parseTencentBatchQuotes('')).toEqual({});
  });
});

describe('腾讯 K 线解析', () => {
  it('行顺序是 [日期开收高低量]，要映射成 ohlc', () => {
    const json = { data: { sh600519: { qfqday: [['2026-10-28', '1325.4', '1349.98', '1350', '1324.7', '39102']] } } };
    const { rows } = parseTencentKline(json, 'sh600519', 'day', 'qfq');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ datetime: '2026-10-28', open: 1325.4, high: 1350, low: 1324.7, close: 1349.98, volume: 39102 });
  });

  it('hfq 与不复权各取各的键；不复权回退 day', () => {
    const json = { data: { sh600519: { hfqday: [['2026-10-28', '1', '2', '3', '1', '10']], day: [['2026-10-28', '9', '9.5', '10', '8', '7']] } } };
    expect(parseTencentKline(json, 'sh600519', 'day', 'hfq').rows[0].close).toBe(2);
    expect(parseTencentKline(json, 'sh600519', 'day', '').rows[0].close).toBe(9.5);
  });

  it('等差前复权把早年价格减成 ≤0 时，该行丢弃而不是产出负价', () => {
    const json = { data: { sh600519: { qfqday: [['2015-01-05', '-118.6', '-117.6', '-110', '-120', '1000'], ['2026-10-28', '1325.4', '1349.98', '1350', '1324.7', '39102']] } } };
    const { rows } = parseTencentKline(json, 'sh600519', 'day', 'qfq');
    expect(rows).toHaveLength(1);
    expect(rows[0].datetime).toBe('2026-10-28');
  });

  it('分钟线按 period 取键，且没有「无该标的」这类静默空表', () => {
    const json = { data: { sz300750: { m5: [['202610291500', '229.4', '229.07', '229.5', '228.73', '15534']] } } };
    expect(parseTencentKline(json, 'sz300750', 'm5', '').rows[0].close).toBe(229.07);
    expect(() => parseTencentKline({ data: {} }, 'sz300750', 'm5', '')).toThrow(/无该标的/);
    expect(() => parseTencentKline({ data: { sz300750: { m5: [] } } }, 'sz300750', 'm5', '')).toThrow(/无历史数据/);
  });
});

describe('腾讯逐笔解析', () => {
  const page0 = 'v_detail_data_sh600519=[0,"0/09:25:01/1349.99/0.00/1486/200608514/M|1/09:30:01/1338.65/-11.34/54/7239484/S"];';

  it('解析出序号/时间/价/量/额/方向', () => {
    const rows = parseTencentTickPage(page0, 'sh600519', 0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ seq: 0, time: '09:25:01', price: 1349.99, change: 0, volume: 1486, amount: 200608514, side: 'M' });
    expect(rows[1].side).toBe('S');
  });

  it('翻过最后一页返回空内容 → null（这是正常结束，不是错误）', () => {
    expect(parseTencentTickPage('', 'sh600519', 9)).toBeNull();
    expect(parseTencentTickPage('v_detail_data_sh600519=[9,""];', 'sh600519', 9)).toBeNull();
  });

  it('页码字段不符 / 记录字段数不对 → 抛错（源格式变了，不能当空页）', () => {
    expect(() => parseTencentTickPage(page0, 'sh600519', 3)).toThrow(/页码字段/);
    expect(() => parseTencentTickPage('v_detail_data_sh600519=[0,"1/09:30:01/1.00/0/1"];', 'sh600519', 0)).toThrow(/字段数/);
    expect(() => parseTencentTickPage('garbage', 'sh600519', 0)).toThrow(/格式异常/);
  });
});

describe('腾讯快照（逐笔完整性核对用）', () => {
  it('拆出交易日、时刻、当日成交额与盘后定价成交额', () => {
    const s = parseTencentSnapshot(tencentLine('sh600519'), 'sh600519');
    expect(s.date).toBe('2026-10-29');
    expect(s.clock).toBe('161457');
    expect(s.amount).toBe(5797980334);
    expect(s.afterHoursAmount).toBeCloseTo(1624800, 0);
    expect(s.closed).toBe(true);
  });

  it('代码不存在 / 字段数不足 / 价量额不是三段 → 抛错', () => {
    expect(() => parseTencentSnapshot('v_pv_none_match="1";', 'sh999999')).toThrow(/没有 sh999999/);
    expect(() => parseTencentSnapshot('v_sh600519="1~贵州茅台";', 'sh600519')).toThrow(/格式变了/);
    expect(() => parseTencentSnapshot(tencentLine('sh600519', { 35: '1354.00/42992' }), 'sh600519')).toThrow(/量价额/);
  });
});

describe('涨停板四池解析', () => {
  const zt = { c: '001219', n: '青岛食品', p: 18130, zdp: 10.0121, amount: 54276760, ltsz: 3448280675, hs: 1.574, lbc: 4, fbt: 92500, lbt: 92500, fund: 165299295, zbc: 0, hybk: '休闲食品', zttj: { days: 4, ct: 4 } };

  it('涨停池：价格 ÷1000、封板时间补成 HH:MM:SS、N天M板拼好', () => {
    const [row] = parseEmPool('zt', [zt]);
    expect(row.price).toBe(18.13);
    expect(row.limitDays).toBe(4);
    expect(row.firstSeal).toBe('09:25:00');
    expect(row.sealFund).toBe(165299295);
    expect(row.ztStat).toBe('4天4板');
    expect(row.industry).toBe('休闲食品');
  });

  it('跌停池字段与涨停池不同（封单资金看 fund、连续跌停看 days）', () => {
    const [row] = parseEmPool('dt', [{ c: '600000', n: '浦发银行', p: 8000, zdp: -10.02, hs: 0.5, fund: 1234, lbt: 143000, fba: 999, days: 3, oc: 2, hybk: '银行' }]);
    expect(row.price).toBe(8);
    expect(row.sealFund).toBe(1234);
    expect(row.dtDays).toBe(3);
    expect(row.openTimes).toBe(2);
    expect(row.lastSeal).toBe('14:30:00');
    expect(row.limitDays).toBeUndefined();
  });

  it('空池 / data 为 null 都返回行数组，不抛错（非交易日是正常情况）', () => {
    expect(parseEmPool('zt', null)).toEqual([]);
    expect(parseEmPool('zb', [])).toEqual([]);
  });
});
