/* ================================================================== *
 * A 股联想搜索：腾讯 smartbox 解析与请求拼装
 *
 * 上游响应是「v_hint="市场~代码~名称~拼音~类型"」，中文用 \uXXXX 转义。
 * 这里用固定样本回放，不访问真实网络。
 * ================================================================== */

import { describe, it, expect, afterEach } from 'vitest';
import { parseTencentSmartbox, searchAShareStock } from '../src/server/providers/a-share.js';
import { setFetcher } from '../src/server/providers/http.js';

const SAMPLE =
  'v_hint="sh~600519~\\u8d35\\u5dde\\u8305\\u53f0~gzmt~GP-A^sz~000001~\\u5e73\\u5b89\\u94f6\\u884c~payh~GP-A^bj~920021~\\u5317\\u4ea4\\u6240~bj~GP-A^hk~00700~\\u817e\\u8baf~tx~GP-HK^sh~60051~bad~x~GP-A^sz~000002~\\u4e07\\u79d1A~wka~GP-A"';

afterEach(() => setFetcher(null));

describe('parseTencentSmartbox', () => {
  it('解码 \\uXXXX 并只保留沪深北 6 位代码', () => {
    const rows = parseTencentSmartbox(SAMPLE);
    expect(rows).toEqual([
      { code: '600519', symbol: 'sh600519', name: '贵州茅台', pinyin: 'gzmt', type: 'GP-A', market: 'sh' },
      { code: '000001', symbol: 'sz000001', name: '平安银行', pinyin: 'payh', type: 'GP-A', market: 'sz' },
      { code: '920021', symbol: 'bj920021', name: '北交所', pinyin: 'bj', type: 'GP-A', market: 'bj' },
      { code: '000002', symbol: 'sz000002', name: '万科A', pinyin: 'wka', type: 'GP-A', market: 'sz' },
    ]);
  });

  it('limit 截断；0 或非法值不抛错', () => {
    expect(parseTencentSmartbox(SAMPLE, { limit: 2 }).map((r) => r.code)).toEqual(['600519', '000001']);
    expect(parseTencentSmartbox(SAMPLE, { limit: 0 })).toEqual([]);
    expect(parseTencentSmartbox(SAMPLE, { limit: 'abc' })).toHaveLength(4);
  });

  it('无结果 / 非预期文本 / 字段不足都返回空数组', () => {
    expect(parseTencentSmartbox('v_hint="N;"')).toEqual([]);
    expect(parseTencentSmartbox('')).toEqual([]);
    expect(parseTencentSmartbox('something else')).toEqual([]);
    expect(parseTencentSmartbox('v_hint="sh~600519~name"')).toEqual([]);
    expect(parseTencentSmartbox(null)).toEqual([]);
  });
});

describe('searchAShareStock', () => {
  it('空查询直接返回，不发请求', async () => {
    let called = 0;
    setFetcher(async () => {
      called += 1;
      return new Response(SAMPLE);
    });
    expect(await searchAShareStock('   ')).toEqual([]);
    expect(await searchAShareStock(null)).toEqual([]);
    expect(called).toBe(0);
  });

  it('正确编码查询并转发 limit', async () => {
    const calls = [];
    setFetcher(async (url, init) => {
      calls.push({ url, init });
      return new Response(SAMPLE);
    });
    const rows = await searchAShareStock('贵州 茅台', { limit: 1 });
    expect(rows.map((r) => r.code)).toEqual(['600519']);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent('贵州 茅台')}&t=gp`,
    );
    expect(calls[0].init.headers.Referer).toBe('https://gu.qq.com/');
  });

  it('上游 HTTP 错误向上抛出可读信息', async () => {
    setFetcher(async () => new Response('busy', { status: 503 }));
    await expect(searchAShareStock('茅台')).rejects.toThrow(/HTTP 503/);
  });
});
