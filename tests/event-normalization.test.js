/* ================================================================== *
 * 事件规范化与聚合（A4 验收）
 *
 * 对应方案 §10.1 的三行：
 *   · AI 明确无关或返回成功空数组 → 清除旧错误标签，失败结果另行处理；
 *   · 中国国债与美国国债消息 → 实体区分，无主题到资产的强制误配；
 *   · 同一发言多来源报道 → 一个事件、多条来源，转载不重复计证据。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import {
  filterSymbolsByEvidence,
  mentionedEntities,
  normalizeLlmRow,
  LLM_ROW_STATE,
  SYMBOL_ENTITY_RULES,
} from '../src/server/domain/events/normalize.js';
import {
  normalizeTitle,
  titleTokens,
  similarity,
  clusterEvents,
  dedupeByUrl,
  isRepostOf,
  actionOf,
} from '../src/server/domain/events/cluster.js';
import { REGION_ANCHORS, REGION_SEMANTICS, COUNTRY_META } from '../src/client/views/map/geo/regions.js';
import { REGION_WORDS } from '../src/server/domain/news-lexicon.js';

/* --------------------------- 实体 vs 影响 --------------------------- */

describe('标的标签必须有实体证据', () => {
  it('中国国债期货消息不会被标成美国 10 年期国债', () => {
    const text = '中国国债期货午后拉升，10 年期主力合约涨 0.15%';
    const out = filterSymbolsByEvidence(['us10y'], text);
    expect(out.kept).toEqual([]);
    expect(out.dropped[0].reason).toMatch(/DENIED_BY_ENTITY/);
  });

  it('只提到「债市」「收益率」而没有美国指向，同样不算美债', () => {
    const out = filterSymbolsByEvidence(['us10y'], '债市情绪回暖，收益率小幅下行');
    expect(out.kept).toEqual([]);
    expect(out.dropped[0].reason).toBe('NO_ENTITY_MENTION');
  });

  it('提到美联储 / 美债时保留 us10y', () => {
    expect(filterSymbolsByEvidence(['us10y'], '美联储宣布降息 25 个基点').kept).toEqual(['us10y']);
    expect(filterSymbolsByEvidence(['us10y'], '美债收益率曲线倒挂加深').kept).toEqual(['us10y']);
  });

  it('日本 / 英国 / 德国国债也不会误标成美债', () => {
    for (const text of ['日本国债收益率走高', '英国国债拍卖需求疲弱', '德国国债收益率上行']) {
      expect(filterSymbolsByEvidence(['us10y'], text).kept).toEqual([]);
    }
  });

  it('模型给的「影响候选」只拦实体冲突，不要求正文提及', () => {
    // 美联储降息确实可能影响原油，但正文没有「原油」二字
    const model = filterSymbolsByEvidence(['oil'], '美联储宣布降息', { requireMention: false });
    expect(model.kept).toEqual(['oil']);
    expect(model.hypothesis).toEqual(['oil']);
    // 实体冲突仍然要拦：讲的是中国国债，就不能标美债
    const conflict = filterSymbolsByEvidence(['us10y'], '中国国债期货上涨', { requireMention: false });
    expect(conflict.kept).toEqual([]);
  });

  it('没有登记规则的标的不会被静默丢掉', () => {
    expect(filterSymbolsByEvidence(['new-instrument'], '任意文本').kept).toEqual(['new-instrument']);
  });

  it('mentionedEntities 只报「提到过」的实体，不做推理', () => {
    const out = mentionedEntities('OPEC 减产，油价上涨');
    expect(out).toContain('oil');
    expect(out).not.toContain('us10y');
  });

  it('每个登记标的都带 require 与可读 label（配置本身可测）', () => {
    for (const [id, rule] of Object.entries(SYMBOL_ENTITY_RULES)) {
      expect(rule.require.length, id).toBeGreaterThan(0);
      expect(rule.label.length, id).toBeGreaterThan(0);
    }
  });
});

/* ----------------------------- 四态 ----------------------------- */

/** 主题归一与产品代码同形：别名 → 内部 key */
const topicKey = (t) => ({ key: getAlias(t), label: String(t), strong: true });

const adapters = {
  normalizeTopic: topicKey,
  normalizeSymbol: (v) => (String(v) === 'xx' ? null : String(getAlias(v))),
  regions: ['us', 'cn', 'eu', 'uk', 'jp', 'me', 'asia', 'latam', 'africa', 'global'],
};

function getAlias(v) {
  const map = { wti: 'oil', 美债: 'us10y', 比特币: 'btc', 原油供应: 'energy' };
  return map[String(v)] ?? v;
}


describe('LLM 输出四态：无关可清标签，失败不能伪装成无关', () => {
  it('classified：有主题即使用', () => {
    const r = normalizeLlmRow({ topics: ['原油供应'], level: 'mid', symbols: ['wti'] }, adapters);
    expect(r.state).toBe(LLM_ROW_STATE.classified);
    expect(r.symbols).toEqual(['oil']);
  });

  it('irrelevant：只有「无关」一个信号 → 可以清除旧标签', () => {
    const r = normalizeLlmRow({ topics: ['无关'], level: 'low', symbols: [] }, adapters);
    expect(r.state).toBe(LLM_ROW_STATE.irrelevant);
    expect(r.topics).toEqual([]);
    expect(r.symbols).toEqual([]);
  });

  it('irrelevant 与有效主题同时出现 → 按有主题处理（模型自相矛盾时不误删新闻）', () => {
    const r = normalizeLlmRow({ topics: ['原油供应', '无关'], level: 'mid', symbols: [] }, adapters);
    expect(r.state).toBe(LLM_ROW_STATE.classified);
    expect(r.topics.map((t) => t.key)).toEqual(['energy']);
  });

  it('uncertain：空数组 / 只有 low 等级 → 保留未知，不升级成有影响', () => {
    expect(normalizeLlmRow({ topics: [], symbols: [], level: 'low' }, adapters).state).toBe(LLM_ROW_STATE.uncertain);
    expect(normalizeLlmRow({ topics: [], symbols: [], level: 'high' }, adapters).reason).toBe('EMPTY_RESULT');
  });

  it('invalid：结构不合法 → 明确失败，不会被当成「无关」', () => {
    expect(normalizeLlmRow(null, adapters).state).toBe(LLM_ROW_STATE.invalid);
    expect(normalizeLlmRow({ level: 'high' }, adapters).state).toBe(LLM_ROW_STATE.invalid);
    expect(normalizeLlmRow({ topics: 'x' }, adapters).state).toBe(LLM_ROW_STATE.invalid);
  });

  it('越界 region 被丢弃，但不影响主题判定', () => {
    const r = normalizeLlmRow({ topics: ['货币政策'], level: 'high', region: 'emea' }, adapters);
    expect(r.state).toBe(LLM_ROW_STATE.classified);
    expect(r.region).toBeNull();
  });
});

/* ----------------------------- 聚合 ----------------------------- */

describe('事件聚合：同一事件一张卡，不同事件不合并', () => {
  const base = {
    publisher: '金十数据',
    publishedAt: '2026-10-26T10:00:00Z',
  };

  it('同一发言被多源转载 → 一个簇，来源全部保留', () => {
    const items = [
      { id: 'a1', title: '新西兰联储主席：利率将在更长时间内保持高位', ...base, url: 'https://a.test/1' },
      { id: 'a2', title: '新西兰联储主席称利率将在更长时间内保持高位', ...base, publisher: '华尔街见闻', publishedAt: '2026-10-26T10:20:00Z', url: 'https://b.test/2' },
      { id: 'a3', title: '新西兰联储主席: 利率将在更长时间内保持高位', ...base, publisher: '路透', publishedAt: '2026-10-26T11:00:00Z', url: 'https://c.test/3' },
    ];
    const clusters = clusterEvents(items);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].articleCount).toBe(3);
    expect(clusters[0].independentPublisherCount).toBe(3);
    expect(clusters[0].sources.map((s) => s.publisher)).toEqual(['金十数据', '华尔街见闻', '路透']);
    // 主稿是最早发布的那条
    expect(clusters[0].primary.id).toBe('a1');
  });

  it('同主题但时间相隔一天 → 不合并（政策修订是不同事件）', () => {
    const items = [
      { id: 'b1', title: '某国央行宣布降息 25 个基点', ...base, url: 'https://a.test/1' },
      { id: 'b2', title: '某国央行宣布降息 25 个基点', ...base, publishedAt: '2026-10-27T10:00:00Z', url: 'https://b.test/2' },
    ];
    expect(clusterEvents(items)).toHaveLength(2);
  });

  it('同主题但动作不同 → 不合并', () => {
    const items = [
      { id: 'c1', title: 'OPEC 讨论减产 100 万桶', ...base, url: 'https://a.test/1' },
      { id: 'c2', title: 'OPEC 讨论增产 100 万桶', ...base, publishedAt: '2026-10-26T10:10:00Z', url: 'https://b.test/2' },
    ];
    expect(clusterEvents(items)).toHaveLength(2);
  });

  it('URL 去重：同一链接多次抓取只留一条，旧 id 记在 duplicates', () => {
    const items = [
      { id: 'd1', url: 'https://a.test/1', title: '同一条新闻' },
      { id: 'd2', url: 'https://a.test/1', title: '同一条新闻（重抓）' },
    ];
    const kept = dedupeByUrl(items);
    expect(kept).toHaveLength(1);
    expect(kept[0].duplicates).toEqual(['d2']);
  });

  it('转载判定：同链接 / 同内容哈希 / 近乎相同标题都算', () => {
    expect(isRepostOf({ url: 'u', title: 'x' }, { url: 'u', title: 'y' })).toBe(true);
    expect(isRepostOf({ contentHash: 'h', title: 'x' }, { contentHash: 'h', title: 'y' })).toBe(true);
    const t = '新西兰联储主席：利率将在更长时间内保持高位';
    expect(isRepostOf({ title: t }, { title: t })).toBe(true);
    expect(isRepostOf({ title: t }, { title: 'OPEC 减产' })).toBe(false);
  });

  it('标题归一化把标点/空白/来源后缀去掉', () => {
    expect(normalizeTitle('美联储  降息，25 个基点！')).toBe('美联储降息25个基点');
    expect(similarity(titleTokens('美联储降息25个基点'), titleTokens('美联储宣布降息25个基点'))).toBeGreaterThan(0.5);
    expect(actionOf('OPEC 达成减产协议')).toBe('减产');
  });
});

/* --------------------------- 地理口径（A5） --------------------------- */

describe('地理口径：赛区、经济组织与交易地不共用标签', () => {
  it('欧洲不叫「欧元区」、亚太不叫「东南亚」', () => {
    expect(REGION_ANCHORS.eu.label).toBe('欧洲');
    expect(REGION_ANCHORS.asia.label).toBe('亚太');
    expect(REGION_ANCHORS.eu.label).not.toContain('欧元区');
    expect(REGION_ANCHORS.asia.label).not.toContain('东南亚');
  });

  it('俄罗斯属于地理欧洲，但欧洲不等于欧元区', () => {
    expect(COUNTRY_META[643].region).toBe('eu');
    expect(REGION_SEMANTICS.kind).toBe('geographic');
    expect(REGION_SEMANTICS.economicOrganizations.join(' ')).toContain('欧元区');
    // 词表里「欧元区」仍然是 eu 的触发词（它是事件来源的写作习惯），
    // 但赛区标签与说明必须用地理口径，不能反过来说「俄罗斯属于欧元区」
    const euWords = REGION_WORDS.find(([r]) => r === 'eu')[1];
    expect(euWords.join(' ')).toContain('欧元区');
    // 俄罗斯确实在 eu 词表里（地理口径），这正是「欧洲 ≠ 欧元区」的由来
    expect(euWords.join(' ')).toMatch(/Russia|Россия/);
  });

  it('澳大利亚归到亚太而不是「东南亚」', () => {
    expect(COUNTRY_META[36].region).toBe('asia');
    expect(COUNTRY_META[36].cn).toBe('澳大利亚');
  });

  it('交易地与事件发生地分开表达', () => {
    expect(REGION_SEMANTICS.tradingVenuesNote).toContain('交易地');
    expect(REGION_SEMANTICS.geographic).toBe(true);
  });
});
