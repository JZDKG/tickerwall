/* ================================================================== *
 * 地图的「发生地 / 影响范围 / 不表示什么」（方案 §3.5 / C4）
 *
 * 三件事必须分开表达：
 *   1. 发生地是**地理赛区**，不是经济组织、也不是交易地；
 *   2. 影响范围来自与解释卡**同一份**渠道状态；
 *   3. 地图不表示资金流、贸易量或价格幅度 —— 这句话必须出现在界面上。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { REGION_POLICY_NOTES, regionPolicyNote } from '../src/client/views/map/geo/regions.js';
import {
  originLine,
  leadChannelOf,
  impactLine,
  impactBlockHtml,
  IMPACT_DISCLAIMER,
  policyNoteOf,
  arcTagText,
} from '../src/client/views/explanations/impact.js';

const EXP = {
  id: 'exp_gold-intl_session_1',
  assetId: 'gold-intl',
  hypotheses: [
    { mechanismId: 'M-GOLD-CN-CONVERSION', relationType: 'valuation-conversion', label: '内外盘折算', status: 'consistent' },
    { mechanismId: 'M-GOLD-RISK', relationType: 'mechanism', label: '避险需求', status: 'mixed' },
    { mechanismId: 'M-GOLD-REAL-YIELD', relationType: 'mechanism', label: '实际收益率', status: 'untested' },
  ],
};

describe('发生地口径', () => {
  it('亚洲赛区用「亚太」，不写成东南亚', () => {
    const line = originLine('asia');
    expect(line.text).toContain('亚太');
    expect(line.text).not.toContain('东南亚');
  });

  it('明确写「地理赛区」，避免被读成欧元区', () => {
    expect(originLine('eu').text).toContain('地理赛区');
  });

  it('全球事件不落锚点，并说明原因', () => {
    const line = originLine('global');
    expect(line.isGlobal).toBe(true);
    expect(line.text).toContain('没有指向具体国家');
  });
});

describe('影响范围取渠道状态', () => {
  it('只在方向性机制里挑，且优先报有信息量的状态', () => {
    const lead = leadChannelOf(EXP);
    // 计价换算 consistent 不参与挑选；方向性里 mixed 优先于 untested
    expect(lead.mechanismId).toBe('M-GOLD-RISK');
    expect(lead.statusText).toBe('证据并存');
  });

  it('没有方向性机制 → null（不硬凑）', () => {
    expect(leadChannelOf({ hypotheses: [EXP.hypotheses[0]] })).toBeNull();
  });

  it('资产解释还没取到 → 明说「尚未生成」，不显示一致', () => {
    const line = impactLine({ symbols: ['gold-intl'] }, new Map([['gold-intl', null]]), new Map([['gold-intl', '黄金']]));
    expect(line.text).toContain('解释尚未生成');
    expect(line.text).not.toContain('观测一致');
    expect(line.tone).toBe('dim');
  });

  it('事件里没有可解释资产 → null（地图不编影响范围）', () => {
    expect(impactLine({ symbols: ['btc'] }, new Map(), new Map())).toBeNull();
  });

  it('渲染块把三段都写出来', () => {
    const html = impactBlockHtml({
      origin: originLine('eu'),
      impact: impactLine({ symbols: ['gold-intl'] }, new Map([['gold-intl', EXP]]), new Map([['gold-intl', '黄金']])),
    });
    expect(html).toContain('地理赛区');
    expect(html).toContain('影响范围：黄金：避险需求 · 证据并存');
    // 短注常驻，完整免责放 title
    expect(html).toContain('不是资金流或价格变化幅度');
    expect(html).toContain('交易地');
  });

  it('免责句固定，不随事件变化', () => {
    expect(IMPACT_DISCLAIMER).toContain('不是资金流、贸易量或价格变化幅度');
    expect(IMPACT_DISCLAIMER).toContain('交易地');
  });
});

/* ================================================================== *
 * C4 后半：制度条件与「把解释带到地图上」
 * ================================================================== */
describe('制度与政策条件', () => {
  it('按地区给出制度条件，不编未知地区', () => {
    expect(policyNoteOf('me') ?? regionPolicyNote('me')).toContain('美元挂钩');
    expect(regionPolicyNote('cn')).toContain('调价机制');
    expect(regionPolicyNote('eu')).toContain('美元结算');
  });

  it('未知地区返回 null', () => {
    expect(regionPolicyNote('atlantis')).toBeNull();
    expect(policyNoteOf('atlantis')).toBeNull();
  });

  it('条件说明只讲前提，不给方向或幅度', () => {
    const texts = Object.values(REGION_POLICY_NOTES).join(' ');
    expect(texts).not.toMatch(/概率|将上涨|将下跌|目标价/);
  });

  it('渲染块里制度条件单独一行', () => {
    const html = impactBlockHtml({
      origin: originLine('me'),
      impact: impactLine({ symbols: ['oil'] }, new Map([['oil', EXP]]), new Map([['oil', '原油']])),
      policyNote: regionPolicyNote('me'),
    });
    expect(html).toContain('制度条件：');
    expect(html).toContain('美元挂钩');
  });
});

describe('弧顶标签带上解释渠道', () => {
  it('有渠道状态时：主题 · 渠道 · 状态', () => {
    const impact = impactLine({ symbols: ['oil'] }, new Map([['oil', EXP]]), new Map([['oil', '原油']]));
    const label = arcTagText({ topic: '能源', impact });
    expect(label).toContain('能源');
    expect(label).toContain('避险需求');
    expect(label).toContain('证据并存');
  });

  it('没有解释时退回主题，不编渠道', () => {
    expect(arcTagText({ topic: '能源', impact: null })).toBe('能源');
    expect(arcTagText({ topic: '', impact: null })).toBe('');
  });
});
