/* ================================================================== *
 * 数据契约与来源注册表（方案 E04）
 *
 * 这一层钉三件事：
 *   1. schema 真的在校验（不是「编过就算」）：单位、值域、时间格式、缺失标记；
 *   2. 校验失败**不返回空数组**，而是带字段路径的 {ok:false, errors}；
 *   3. 注册表自洽，且每个标的用到的来源都能在注册表里查到。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validateObservation,
  validateDataQuality,
  validateExplanationEnvelope,
  partitionObservations,
  contractInfo,
} from '../src/server/contracts/index.js';
import {
  SOURCES,
  getSource,
  sourcesOfKind,
  sourceAvailability,
  cachePolicyOf,
  validateRegistry,
} from '../src/server/providers/registry.js';

const OBS = {
  id: 'gold-intl@2026-10-20',
  logicalKey: 'gold-intl',
  instrumentId: 'gold-intl',
  observedAt: '2026-10-20',
  publishedAt: null,
  fetchedAt: '2026-10-28T11:00:00.000Z',
  knownAt: '2026-10-28T11:00:00.000Z',
  value: 4123.45,
  unit: '美元/盎司',
  valueDomain: 'positive',
  revision: 1,
  sourceRef: 'fred:DEXUSAL',
};

describe('契约：Observation', () => {
  it('合法观测通过', () => {
    expect(validateObservation(OBS)).toEqual({ ok: true, errors: [] });
  });

  it('利率类允许零与负值（signed）', () => {
    expect(validateObservation({ ...OBS, valueDomain: 'signed', value: -0.42 }).ok).toBe(true);
    expect(validateObservation({ ...OBS, valueDomain: 'signed', value: 0 }).ok).toBe(true);
  });

  it('值域枚举外的写法被判失败', () => {
    const r = validateObservation({ ...OBS, valueDomain: 'zero' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('/valueDomain');
  });

  it('value 不是数字就失败（字符串 "NaN" 也算）', () => {
    for (const value of ['NaN', null, '1.23', undefined]) {
      const r = validateObservation({ ...OBS, value });
      expect(r.ok, `value=${String(value)} 应失败`).toBe(false);
      // undefined 会触发「缺必填」，其余是类型错；两者都要指向 value 这个词
      expect(r.errors.join(' ')).toMatch(/value/);
    }
  });

  it('日期格式必须真的是日期（不是「看着像」）', () => {
    expect(validateObservation({ ...OBS, observedAt: '20/10/2026' }).ok).toBe(false);
    expect(validateObservation({ ...OBS, observedAt: '2026-13-45' }).ok).toBe(false);
    expect(validateObservation({ ...OBS, fetchedAt: 'yesterday' }).ok).toBe(false);
  });

  it('缺必填字段时错误指向具体字段', () => {
    const { sourceRef, ...withoutSource } = OBS;
    const r = validateObservation(withoutSource);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('sourceRef');
    void sourceRef;
  });

  it('多出的字段也被拒绝（防止口径悄悄漂移）', () => {
    const r = validateObservation({ ...OBS, mystery: 1 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('additional');
  });
});

describe('契约：批量校验不丢数据', () => {
  it('partitionObservations 把不合格的单独列出来，不静默过滤', () => {
    const { valid, invalid } = partitionObservations([OBS, { ...OBS, value: 'x' }, { ...OBS, instrumentId: 'oil' }]);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].errors.join(' ')).toContain('/value');
    expect(valid.length + invalid.length).toBe(3);
  });

  it('空列表返回空两组（不是 undefined）', () => {
    expect(partitionObservations()).toEqual({ valid: [], invalid: [] });
  });
});

describe('契约：DataQuality 与解释外壳', () => {
  it('质量对象：status 只能是 fresh / stale / missing', () => {
    expect(validateDataQuality({ instrumentId: 'gold-intl', status: 'fresh', ageDays: 1, toleranceDays: 3, reasons: [] }).ok).toBe(true);
    expect(validateDataQuality({ instrumentId: 'gold-intl', status: 'ok', ageDays: 1, toleranceDays: 3, reasons: [] }).ok).toBe(false);
  });

  it('契约校验结果能挂在质量对象上（ok=false + errors）', () => {
    const r = validateDataQuality({
      instrumentId: 'gold-intl',
      status: 'stale',
      ageDays: 8,
      toleranceDays: 3,
      reasons: ['BEYOND_UPDATE_CYCLE'],
      contract: { ok: false, errors: ['/value: must be number'] },
    });
    expect(r.ok).toBe(true);
  });

  it('解释外壳：contentStatus 与 freshness 各自枚举，互不顶替', () => {
    const env = {
      schemaVersion: 1,
      explanation: { id: 'exp_1', assetId: 'gold-intl', summary: '国际金价本窗口下降 1.00%。', contentStatus: 'ready', facts: [], hypotheses: [] },
      meta: { freshness: 'stale', contentStatus: 'ready', refreshStatus: 'idle', backgroundStale: ['brent'], retryAfterMs: null },
    };
    expect(validateExplanationEnvelope(env).ok).toBe(true);
    expect(validateExplanationEnvelope({ ...env, meta: { ...env.meta, freshness: 'old' } }).ok).toBe(false);
  });

  it('202 场景（没有 explanation）也合法', () => {
    expect(validateExplanationEnvelope({ schemaVersion: 1, explanation: null, meta: { freshness: 'unavailable', refreshStatus: 'pending' } }).ok).toBe(true);
  });
});

describe('契约文件本身', () => {
  it('src/contracts 下每个 schema 都是合法 JSON 且带 $id', () => {
    const dir = path.resolve('src/contracts');
    const files = readdirSync(dir).filter((f) => f.endsWith('.schema.json'));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) {
      const s = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      expect(typeof s.$id, `${f} 缺 $id`).toBe('string');
    }
  });

  it('contractInfo 报出已编译的契约', () => {
    expect(contractInfo().contracts.sort()).toEqual(['dataQuality', 'explanationEnvelope', 'observation']);
  });
});

describe('来源注册表', () => {
  it('自洽：id 与键一致、kinds 合法、时间参数为正、maxServeAge ≥ refresh', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('每个源都有两级时间，且能按 id 取回', () => {
    for (const [key, src] of Object.entries(SOURCES)) {
      expect(getSource(key)).toBe(src);
      expect(src.cache.refreshMs).toBeGreaterThan(0);
      expect(src.cache.maxServeAgeMs).toBeGreaterThanOrEqual(src.cache.refreshMs);
    }
  });

  it('按类型取源', () => {
    const quotes = sourcesOfKind('quote').map((s) => s.id);
    expect(quotes).toContain('sina');
    expect(quotes).toContain('cnbc');
    expect(quotes).not.toContain('fred');
    expect(sourcesOfKind('news').map((s) => s.id)).toContain('google-news');
    expect(sourcesOfKind('econ').map((s) => s.id).sort()).toEqual(['bls', 'fed']);
  });

  it('需要凭据而没配 → unavailable + 说清缺哪个环境变量', () => {
    expect(sourceAvailability('goldapi', {})).toEqual({ available: false, reason: '未配置 GOLDAPI_KEY' });
    expect(sourceAvailability('goldapi', { GOLDAPI_KEY: 'k' }).available).toBe(true);
    expect(sourceAvailability('sina', {}).available).toBe(true);
  });

  it('未注册的来源：availability 失败、缓存策略走最保守默认', () => {
    expect(sourceAvailability('nope').available).toBe(false);
    const p = cachePolicyOf('nope');
    expect(p.unregistered).toBe(true);
    expect(p.maxServeAgeMs).toBeLessThanOrEqual(10 * 60_000);
  });
});

describe('来源注册表 ↔ 标的绑定', () => {
  it('每个标的声明的来源都能在注册表里查到', async () => {
    const { INSTRUMENTS } = await import('../src/server/providers/instruments.js');
    const known = new Set(Object.keys(SOURCES));
    /**
     * 标量的 sources 里，`name` 是「适配器:参数」的形式（`sina:hf_XAU`、
     * `gold-api:XAU`）。注册表按适配器一侧对齐，所以取冒号前的段。
     *
     * 映射表是显式的：加新适配器必须同时加注册表条目，否则这条测试就红 ——
     * 正是 E04 想要的效果（新增来源只写适配器、不声明策略，是不允许的）。
     */
    const ADAPTER_TO_SOURCE = {
      sina: 'sina',
      'sina-forex': 'sina',
      eastmoney: 'eastmoney',
      cnbc: 'cnbc',
      tencent: 'tencent',
      cboe: 'cboe',
      fred: 'fred',
      yahoo: 'yahoo',
      binance: 'binance',
      coinbase: 'coinbase',
      'gold-api': 'goldapi',
    };
    const unmatched = [];
    const usedAdapters = new Set();
    for (const inst of INSTRUMENTS) {
      for (const src of inst.sources ?? []) {
        const adapter = String(src?.name ?? '').split(':')[0];
        usedAdapters.add(adapter);
        const mapped = ADAPTER_TO_SOURCE[adapter];
        if (!mapped) unmatched.push(`${inst.id}: 适配器 ${adapter} 没有对应注册表条目`);
        else if (!known.has(mapped)) unmatched.push(`${inst.id}: ${mapped} 不在注册表`);
      }
    }
    expect(unmatched).toEqual([]);
    // 适配器覆盖面本身也要对得上：新适配器漏映射会在上面那条先红，这里兜底
    expect([...usedAdapters].every((a) => ADAPTER_TO_SOURCE[a])).toBe(true);
  });
});
