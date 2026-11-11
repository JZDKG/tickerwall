/* ================================================================== *
 * 覆盖率门禁补齐（服务端）
 *
 * 目标不是「跑通不断言」，而是把此前没走过的真实分支走一遍并断言结果：
 *   · routes/alerts.js：流式请求体 / 400 校验 / 更新既有规则 / 异常映射；
 *   · services/bls-series.service.js：上游错误状态 / 空值降级 / FRED 回填；
 *   · jobs/index.js：buildDefaultJobs 未注入 override 时的默认回调；
 *   · providers/a-share.js：网络出口函数（fetchRaw / emGet 注入回放）。
 *
 * 所有上游都用 vi.mock 替换 fetchRaw，绝不连真网络。
 * ================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// emGet 的最小间隔在模块加载时从 env 读取；测试里不需要真的排队等 1s
process.env.EM_MIN_INTERVAL_MS = '0';

vi.mock('../src/server/providers/http.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchRaw: vi.fn() };
});

const { fetchRaw } = await import('../src/server/providers/http.js');
const { readJsonBody, handleAlertsRoutes } = await import('../src/server/routes/alerts.js');
const bls = await import('../src/server/services/bls-series.service.js');
const aShare = await import('../src/server/providers/a-share.js');

/** 记录 sendJson 写出的状态码与 JSON */
function makeRes() {
  const out = { status: null, body: null };
  return {
    out,
    writeHead: (status) => { out.status = status; },
    end: (payload) => { out.body = payload ? JSON.parse(payload) : null; },
    get headersSent() { return out.status != null; },
  };
}

/** 把字符串/对象数组变成 IncomingMessage 那样的异步可迭代体 */
async function* asStream(chunks) {
  for (const c of chunks) yield typeof c === 'string' ? Buffer.from(c) : c;
}

beforeEach(() => {
  fetchRaw.mockReset();
  delete process.env.BLS_API_KEY;
});

/* ------------------------------------------------------------------ *
 * routes/alerts.js
 * ------------------------------------------------------------------ */
describe('readJsonBody：三种请求体形态', () => {
  it('空字符串体视为空对象，不当成坏 JSON', async () => {
    await expect(readJsonBody({ body: '   ' })).resolves.toEqual({});
  });

  it('没有 body 也没有异步迭代器的普通对象视为空体', async () => {
    await expect(readJsonBody({ method: 'POST' })).resolves.toEqual({});
  });

  it('生产形态：异步流分块读、拼接后解析', async () => {
    const req = { [Symbol.asyncIterator]: () => asStream(['{"action":', '"evaluate"}']) };
    await expect(readJsonBody(req)).resolves.toEqual({ action: 'evaluate' });
  });

  it('纯空白流视为空体', async () => {
    const req = { [Symbol.asyncIterator]: () => asStream(['  \n ']) };
    await expect(readJsonBody(req)).resolves.toEqual({});
  });

  it('超过 64KB 直接抛错，不让内存被无限请求体吃掉', async () => {
    const big = Buffer.alloc(70 * 1024, 'a');
    const req = { [Symbol.asyncIterator]: () => asStream([big]) };
    await expect(readJsonBody(req)).rejects.toThrow(/body too large/);
  });
});

describe('handleAlertsRoutes：此前未覆盖的分支', () => {
  const service = () => ({
    listRules: () => [{ id: 'r1' }],
    listEvents: () => [],
    deleteRule: (id) => ({ id, deleted: true }),
    evaluate: (ctx) => [{ ruleId: ctx?.ruleId ?? 'r1' }],
    getRule: (id) => (id === 'r1' ? { id: 'r1', name: '旧规则' } : null),
    updateRule: (id, body) => ({ id, ...body }),
    createRule: (body) => ({ id: 'r2', ...body }),
  });

  it('没有 service 时 503，不碰 res.body 之外的东西', async () => {
    const res = makeRes();
    await handleAlertsRoutes({ method: 'GET' }, res, {});
    expect(res.out.status).toBe(503);
    expect(res.out.body.ok).toBe(false);
  });

  it('流式请求体：非对象（数组 / null）给 400', async () => {
    const res = makeRes();
    const req = { method: 'POST', [Symbol.asyncIterator]: () => asStream(['[1,2]']) };
    await handleAlertsRoutes(req, res, { service: service() });
    expect(res.out.status).toBe(400);
    expect(res.out.body.error).toContain('JSON 对象');
  });

  it('delete 缺 id 给 400，不调删除', async () => {
    const res = makeRes();
    const svc = service();
    const del = vi.spyOn(svc, 'deleteRule');
    await handleAlertsRoutes({ method: 'POST', body: { action: 'delete' } }, res, { service: svc });
    expect(res.out.status).toBe(400);
    expect(del).not.toHaveBeenCalled();
  });

  it('带已存在的 id 走 updateRule，不是新建', async () => {
    const res = makeRes();
    const svc = service();
    await handleAlertsRoutes({ method: 'POST', body: { id: 'r1', name: '改名' } }, res, { service: svc });
    expect(res.out.status).toBe(200);
    expect(res.out.body.rule).toMatchObject({ id: 'r1', name: '改名' });
  });

  it('坏 JSON 映射到 400，其它异常映射到 500', async () => {
    const bad = makeRes();
    const reqBad = { method: 'POST', [Symbol.asyncIterator]: () => asStream(['{bad json']) };
    await handleAlertsRoutes(reqBad, bad, { service: service() });
    expect(bad.out.status).toBe(400);

    const boom = makeRes();
    const svc = service();
    svc.createRule = () => { throw new Error('磁盘炸了'); };
    await handleAlertsRoutes({ method: 'POST', body: { name: 'x' } }, boom, { service: svc });
    expect(boom.out.status).toBe(500);
    expect(boom.out.body.error).toBe('服务器内部错误');
  });
});

/* ------------------------------------------------------------------ *
 * services/bls-series.service.js
 * ------------------------------------------------------------------ */
describe('fetchBlsSeries / fetchReleaseNumbers：错误与降级分支', () => {
  const V2 = (values, status = 'REQUEST_SUCCEEDED') => JSON.stringify({
    status,
    message: ['上游限流'],
    Results: { series: [{ seriesID: 'CUUR0000SA0', data: values }] },
  });

  it('上游返回非 REQUEST_SUCCEEDED 时把状态与 message 拼进错误', async () => {
    fetchRaw.mockResolvedValue(V2([], 'REQUEST_FAILED'));
    await expect(bls.fetchBlsSeries('CUUR0000SA0', { fetcher: fetchRaw }))
      .rejects.toThrow(/REQUEST_FAILED.*上游限流/);
  });

  it('value 为 "." 或含千分位逗号时正确清洗', async () => {
    fetchRaw.mockResolvedValue(V2([
      { value: '3,200.5' }, { value: '.' }, { value: '3.0' },
    ]));
    const out = await bls.fetchBlsSeries('CUUR0000SA0', { fetcher: fetchRaw });
    expect(out.latest).toBe(3200.5);
    expect(out.previous).toBe(3);
    expect(out.values).toEqual([3200.5, 3]);
  });

  it('fetchReleaseNumbers：某条序列 latest 为 null 时跳过该 kind', async () => {
    fetchRaw.mockResolvedValue(V2([{ value: '.' }]));
    const out = await bls.fetchReleaseNumbers({ fetcher: fetchRaw });
    expect(out.cpi).toBeUndefined();
  });

  it('fetchReleaseNumbers：FRED 回填写 actual/previous，非法行跳过', async () => {
    fetchRaw.mockResolvedValue(V2([{ value: '3.2' }]));
    const fredFetch = vi.fn(async (id) => (id === 'DFF'
      ? { rows: [{ close: 4.1 }, { close: 4.25 }, { close: 4.33 }] }
      : { rows: [{ close: 'x' }] }));
    const out = await bls.fetchReleaseNumbers({ fetcher: fetchRaw, fredFetch });
    expect(out.cpi.actual).toBe(3.2);
    expect(out['fed-funds']).toMatchObject({ actual: 4.33, previous: 4.25, unit: '%', source: 'fred:DFF' });
    expect(out['fed-target']).toBeUndefined();
    expect(fredFetch).toHaveBeenCalledTimes(2);
  });

  it('fetchReleaseNumbers：单源失败不影响其它源（allSettled 降级）', async () => {
    fetchRaw.mockRejectedValue(new Error('offline'));
    const out = await bls.fetchReleaseNumbers({ fetcher: fetchRaw });
    expect(out).toEqual({});
  });
});

/* ------------------------------------------------------------------ *
 * providers/a-share.js：网络出口函数
 * ------------------------------------------------------------------ */
describe('a-share 网络出口（fetchRaw 回放）', () => {
  const tencentLine = (sym, price = '1354.00') => {
    const f = new Array(88).fill('');
    f[1] = '贵州茅台'; f[3] = price; f[4] = '1330.75'; f[30] = '20261029161457';
    f[31] = '23.25'; f[32] = '1.75'; f[35] = '1354.00/42992/5797980334';
    f[37] = '579798'; f[58] = '162.4800';
    return `v_${sym}="${f.join('~')}";`;
  };

  it('fetchTencentBatchQuotes 去重、分批并保留调用方原始键', async () => {
    fetchRaw.mockImplementation(async (url) => {
      const syms = String(url).split('q=')[1]?.split(',') ?? [];
      return syms.map((s) => tencentLine(s)).join('');
    });
    const out = await aShare.fetchTencentBatchQuotes(['sh600519', ' sh600519 ', '', 'sz000001']);
    expect(Object.keys(out)).toEqual(['sh600519', 'sz000001']);
    expect(out.sh600519.price).toBe(1354);
  });

  it('fetchTencentBatchQuotes 空列表直接返回空，不发请求', async () => {
    await expect(aShare.fetchTencentBatchQuotes([])).resolves.toEqual({});
    expect(fetchRaw).not.toHaveBeenCalled();
  });

  it('resetTencentKlineCooldown 清空冷却表', () => {
    expect(() => aShare.resetTencentKlineCooldown()).not.toThrow();
  });

  it('fetchTencentKline 日线走 fqkline，成功后带 host', async () => {
    aShare.resetTencentKlineCooldown();
    fetchRaw.mockResolvedValue(JSON.stringify({
      data: { sh600519: { qfqday: [['2026-10-28', '1325.4', '1349.98', '1350', '1324.7', '39102']] } },
    }));
    const out = await aShare.fetchTencentKline({ code: '600519' });
    expect(out.host).toContain('ifzq.gtimg.cn');
    expect(out.rows[0].close).toBe(1349.98);
    const url = fetchRaw.mock.calls[0][0];
    expect(url).toContain('fqkline/get');
    expect(url).toContain('sh600519');
  });

  it('fetchTencentKline 分钟线走 mkline，param 只有 4 段', async () => {
    aShare.resetTencentKlineCooldown();
    fetchRaw.mockResolvedValue(JSON.stringify({
      data: { sz300750: { m5: [['202610291500', '229.4', '229.07', '229.5', '228.73', '15534']] } },
    }));
    const out = await aShare.fetchTencentKline({ code: '300750', period: 'm5', count: 1000 });
    expect(out.rows[0].close).toBe(229.07);
    expect(out.period).toBe('m5');
    const param = new URL(fetchRaw.mock.calls[0][0]).searchParams.get('param');
    expect(param.split(',')).toHaveLength(4);
    expect(param).toContain(',320');
  });

  it('fetchTencentKline 北交所直接抛错，不发请求', async () => {
    aShare.resetTencentKlineCooldown();
    await expect(aShare.fetchTencentKline({ code: '920021' })).rejects.toThrow(/不支持北交所/);
    expect(fetchRaw).not.toHaveBeenCalled();
  });

  it('fetchTencentKline 三个入口都失败时汇总错误', async () => {
    aShare.resetTencentKlineCooldown();
    fetchRaw.mockRejectedValue(new Error('HTTP 429'));
    await expect(aShare.fetchTencentKline({ code: '600519' })).rejects.toThrow(/三个入口都失败/);
    expect(fetchRaw).toHaveBeenCalledTimes(3);
  });

  it('fetchTencentTicks 成功路径：快照 + 逐笔页 + 金额核对', async () => {
    const tick = '0/09:25:01/1349.99/0.00/1486/5797980334/M';
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('qt.gtimg.cn')) return tencentLine('sh600519');
      const page = Number(new URL(url).searchParams.get('p'));
      if (page === 0) return `v_detail_data_sh600519=[0,"${tick}"];`;
      return '';
    });
    const out = await aShare.fetchTencentTicks('600519', { maxPages: 2 });
    expect(out.rows).toHaveLength(1);
    expect(out.date).toBe('2026-10-29');
    expect(out.checked).toBe(true);
  });

  it('fetchTencentTicks 北交所 / 指数 / 无成交都明确抛错', async () => {
    await expect(aShare.fetchTencentTicks('920021')).rejects.toThrow(/不支持北交所/);
    await expect(aShare.fetchTencentTicks('000001')).rejects.toThrow(/是指数/);
    const noAmount = tencentLine('sh600519');
    fetchRaw.mockImplementation(async (url) => (url.includes('qt.gtimg.cn')
      ? noAmount.replace('5797980334', '0') : ''));
    await expect(aShare.fetchTencentTicks('600519')).rejects.toThrow(/当日没有成交/);
  });

  it('emGet 拼接 query、串行解析 JSON', async () => {
    fetchRaw.mockResolvedValue('{"ok":true}');
    const out = await aShare.emGet('https://x.test/api?a=1', { b: 2 }, { retries: 0 });
    expect(out).toEqual({ ok: true });
    const url = fetchRaw.mock.calls[0][0];
    expect(url).toContain('a=1&b=2');
  });

  it('emGet 403 不重试；429 按退避重试后成功', async () => {
    const err403 = new Error('HTTP 403');
    fetchRaw.mockRejectedValueOnce(err403);
    await expect(aShare.emGet('https://x.test/403', {}, { retries: 3 })).rejects.toThrow(/403/);
    expect(fetchRaw).toHaveBeenCalledTimes(1);

    fetchRaw.mockReset();
    fetchRaw.mockRejectedValueOnce(new Error('HTTP 429')).mockResolvedValueOnce('{"ok":2}');
    await expect(aShare.emGet('https://x.test/429', {}, { retries: 1 })).resolves.toEqual({ ok: 2 });
    expect(fetchRaw).toHaveBeenCalledTimes(2);
  });

  it('eastmoneyDatacenter 缺 reportName 抛错；结构异常也抛错', async () => {
    await expect(aShare.eastmoneyDatacenter({})).rejects.toThrow(/reportName 必填/);
    fetchRaw.mockResolvedValue('{"result":null}');
    await expect(aShare.eastmoneyDatacenter({ reportName: 'RPT_X' }))
      .rejects.toThrow(/无数据或结构变了/);
  });

  it('eastmoneyDatacenter 正常返回 result.data', async () => {
    fetchRaw.mockResolvedValue('{"result":{"data":[{"code":"600519"}]}}');
    await expect(aShare.eastmoneyDatacenter({ reportName: 'RPT_X', pageSize: 5 }))
      .resolves.toEqual([{ code: '600519' }]);
  });

  it('fetchEmPool 校验 kind 与日期格式', async () => {
    await expect(aShare.fetchEmPool('nope', '20261111')).rejects.toThrow(/未知池类型/);
    await expect(aShare.fetchEmPool('zt', '2026-11-11')).rejects.toThrow(/YYYYMMDD/);
  });

  it('fetchEmPool 非交易日 data:null → 空行；有池时解析四池', async () => {
    fetchRaw.mockResolvedValueOnce('{"data":null}');
    await expect(aShare.fetchEmPool('zt', '20261111'))
      .resolves.toMatchObject({ rows: [], total: 0, date: '20261111', kind: 'zt' });

    fetchRaw.mockResolvedValueOnce(JSON.stringify({ data: { tc: 1, pool: [
      { c: '600000', n: '浦发银行', p: 8000, zdp: -10.02, hs: 0.5, fund: 1234, lbt: 143000, fba: 999, days: 3, oc: 2, hybk: '银行' },
    ] } }));
    const out = await aShare.fetchEmPool('dt', '20261111');
    expect(out.total).toBe(1);
    expect(out.rows[0]).toMatchObject({ price: 8, dtDays: 3, lastSeal: '14:30:00' });
  });

  it('fetchEmFundFlowMinute 解析 klines，字段不足的行丢弃', async () => {
    fetchRaw.mockResolvedValue(JSON.stringify({ data: { klines: [
      '09:30,1,2,3,4,5,6', 'bad,row', '09:31,10,20,30,40,50,60',
    ] } }));
    const out = await aShare.fetchEmFundFlowMinute('600519');
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({ time: '09:30', mainNet: 1, superNet: 5 });
    expect(out.code).toBe('600519');
  });

  it('fetchEmFundFlowMinute data 为 null 时返回空行', async () => {
    fetchRaw.mockResolvedValue('{"data":null}');
    await expect(aShare.fetchEmFundFlowMinute('510300')).resolves.toEqual({ rows: [], code: '510300' });
  });

  it('fetchNorthbound 拆出 time/hgt/sgt，缺失字段补空数组', async () => {
    fetchRaw.mockResolvedValue('{"time":["09:30"],"hgt":[1.2]}');
    await expect(aShare.fetchNorthbound()).resolves.toEqual({ time: ['09:30'], hgt: [1.2], sgt: [] });
  });
});
