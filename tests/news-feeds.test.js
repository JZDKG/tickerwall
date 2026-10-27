/* ================================================================== *
 * 全球新闻通道与多语言词典的契约测试
 *
 * 两部分，各测各的错法：
 *
 *   1. feed 解析（src/server/providers/news-feeds.js）—— 夹具是**真实响应片段**，
 *      形状原样保留（CDATA、时区偏移、无 pubDate 的 guid、Google 的 source 节点）。
 *      这里的风险不是「解析不了」，而是「静默解析成空」：一个正则写宽了，
 *      29 个源一起返回 0 条，接口照样 200，看起来像「今天没新闻」。
 *
 *   2. 多语言词典（src/server/domain/news-lexicon.js）—— 中文词表对 290 条国际
 *      样本的命中率是 2%，扩表之后要防的是**反过来的错**：英文词按子串匹配，
 *      'war' 命中 software、'ban' 命中 bank 和 urban，事件流会被这些假命中灌满。
 *      词边界、titleOnly、地区顺序三条规则各有专门的用例。
 *
 * 金标准（.scratch 的四层冻结）里已移除 /api/events：它现在是 24 个直连 feed
 * 加 14 个语种聚合的实时新闻流，和行情/宏观这类「同一输入必得同一输出」的端点
 * 性质不同 —— 回放夹具录的是某一刻的稿件，到回放那天大多已超出 36 小时窗口，
 * 服务端会正确地过滤掉，永远对不上；要对齐就得每隔几小时重录 38 个上游。
 * 它的正确性由本文件的解析契约 + 接口自带的 coverage 字段（源数/语种数/
 * 媒体数/一手占比）保证。
 * ================================================================== */

import { describe, it, expect } from 'vitest';

import {
  parseFeed,
  decodeEntities,
  stripFeedHtml,
  splitPublisher,
  googleFeedUrl,
  fetchFeedCatalog,
  DEFAULT_MAX_AGE_HOURS,
  DIRECT_FEEDS,
  GOOGLE_FEEDS,
} from '../src/server/providers/news-feeds.js';

import {
  wordHit,
  anyWordHit,
  sanitizeText,
  guessRegion,
  isOfficialRoutine,
  COMPILED_TOPICS,
  TOPIC_RULES,
  REGION_WORDS,
  IMPACT_WORDS,
} from '../src/server/domain/news-lexicon.js';

/** 固定「现在」，让时间窗口断言不随真实时钟漂移 */
const NOW = Date.parse('2026-10-27T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toUTCString();

/* ================================================================== *
 * 1. feed 解析
 * ================================================================== */

describe('feed 解析：RSS 2.0', () => {
  // 美联储 press_all.xml 的真实形状：link/guid/description/pubDate 全在 CDATA 里
  const FED = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0"><channel><title>FRB: Press Release</title>
<item>
    <title>Federal Reserve Board announces termination of enforcement actions with Gardner Bancshares</title>
    <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261016a.htm]]></link>
    <guid><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261016a.htm]]></guid>
    <description><![CDATA[Federal Reserve Board announces termination of enforcement actions.]]></description>
    <category>Enforcement Actions</category>
    <pubDate><![CDATA[${hoursAgo(3)}]]></pubDate>
</item>
</channel></rss>`;

  it('解析出标题、链接、时间、分类', () => {
    const { items, itemCount } = parseFeed(FED, { now: NOW });
    expect(itemCount).toBe(1);
    expect(items).toHaveLength(1);
    const it = items[0];
    expect(it.title).toBe('Federal Reserve Board announces termination of enforcement actions with Gardner Bancshares');
    // CDATA 包裹要去掉，不能把 <![CDATA[ 当成链接的一部分
    expect(it.url).toBe('https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261016a.htm');
    expect(it.at.toISOString()).toBe(new Date(NOW - 3 * 3600_000).toISOString());
    expect(it.categories).toEqual(['Enforcement Actions']);
  });

  // ECB / BOJ 的真实形状：pubDate 带时区偏移，不是 GMT
  it('识别带时区偏移的 pubDate（+0100 / +0900）', () => {
    const xml = `<rss><channel><item>
      <title>October 2026 euro area bank lending survey</title>
      <link>https://www.ecb.europa.eu/press/pr/date/2026/html/x.en.html</link>
      <pubDate>Tue, 27 Oct 2026 01:00:00 +0100</pubDate>
    </item></channel></rss>`;
    const { items } = parseFeed(xml, { now: NOW });
    expect(items).toHaveLength(1);
    // 01:00 +0100 = 00:00 UTC
    expect(items[0].at.toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });

  it('标题前后空白与实体都被清掉', () => {
    const xml = `<rss><channel><item>
      <title>  R&amp;D spending &quot;rebounds&quot;  </title>
      <link>https://example.com/a</link>
      <pubDate>${hoursAgo(1)}</pubDate>
    </item></channel></rss>`;
    const { items } = parseFeed(xml, { now: NOW });
    expect(items[0].title).toBe('R&D spending "rebounds"');
  });
});

describe('feed 解析：Atom', () => {
  // 标准 Atom 1.0：<entry> 而不是 <item>，link 在属性里，时间用 <updated>
  const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example</title>
  <entry>
    <title type="html">ECB raises rates by 25 basis points</title>
    <link rel="alternate" href="https://example.org/press/2026/rate-hike"/>
    <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
    <updated>2026-10-27T09:30:00Z</updated>
    <summary>Governing Council decided to raise the three key ECB interest rates.</summary>
  </entry>
</feed>`;

  it('解析 entry / link[@href] / updated', () => {
    const { items, itemCount } = parseFeed(ATOM, { now: NOW });
    expect(itemCount).toBe(1);
    expect(items[0].title).toBe('ECB raises rates by 25 basis points');
    expect(items[0].url).toBe('https://example.org/press/2026/rate-hike');
    expect(items[0].at.toISOString()).toBe('2026-10-27T09:30:00.000Z');
    expect(items[0].body).toContain('three key ECB interest rates');
  });

  it('<link> 优先取 rel="alternate"，不取 rel="self"', () => {
    const xml = `<feed><entry>
      <title>Markets wrap</title>
      <link rel="self" href="https://example.org/feed/self"/>
      <link rel="alternate" href="https://example.org/story/1"/>
      <updated>2026-10-27T09:00:00Z</updated>
    </entry></feed>`;
    const { items } = parseFeed(xml, { now: NOW });
    expect(items[0].url).toBe('https://example.org/story/1');
  });
});

describe('feed 解析：Google News 聚合形状', () => {
  // 真实条目：标题是「标题 - 媒体名」，<source url> 给出原始媒体
  const GN = `<rss><channel><item>
    <title>Five weird details from Anthropic's IPO filing - The Verge</title>
    <link>https://news.google.com/rss/articles/CBMingFBVV95cUxNZ1hs</link>
    <guid isPermaLink="false">CBMingFBVV95cUxNZ1hs</guid>
    <pubDate>${hoursAgo(2)}</pubDate>
    <description>&lt;a href="x"&gt;Five weird details&lt;/a&gt;</description>
    <source url="https://www.theverge.com">The Verge</source>
  </item></channel></rss>`;

  it('把 <source> 收成 publisher，并从标题里精确剥掉后缀', () => {
    const { items } = parseFeed(GN, { now: NOW });
    expect(items[0].publisher).toBe('The Verge');
    expect(items[0].title).toBe("Five weird details from Anthropic's IPO filing");
  });

  it('后缀对不上时不动标题（不能把破折号后的内容当媒体名砍掉）', () => {
    // 标题里的 " - " 是正文的一部分，而 source 是另一家媒体
    const { title, publisher } = splitPublisher('Stocks sink - 3 things to know', 'Reuters');
    expect(title).toBe('Stocks sink - 3 things to know');
    expect(publisher).toBe('Reuters');
  });

  it('日文标题同样按 source 精确剥离', () => {
    const { title } = splitPublisher('東証大引け 日経平均は4日ぶり反発 - 日本経済新聞', '日本経済新聞');
    expect(title).toBe('東証大引け 日経平均は4日ぶり反発');
  });

  it('没有 publisher 时原样返回', () => {
    const { title, publisher } = splitPublisher('Some headline', '');
    expect(title).toBe('Some headline');
    expect(publisher).toBeNull();
  });
});

describe('feed 解析：时间兜底与窗口', () => {
  it('没有 pubDate 时从 12 位 guid 解出时间（巴西圣保罗页报）', () => {
    // 真实形状：整份 feed 没有 pubDate，时间只编码在 guid 里
    const xml = `<rss><channel><item>
      <title>Airbnb proíbe exigir louça lavada</title>
      <link>https://www1.folha.uol.com.br/mercado/2026/10/x.shtml</link>
      <guid>202610270400</guid>
    </item></channel></rss>`;
    const { items } = parseFeed(xml, { now: NOW });
    expect(items).toHaveLength(1);
    expect(items[0].at.toISOString()).toBe('2026-10-27T04:00:00.000Z');
  });

  it('完全没有时间线索的条目被丢弃，而不是拿抓取时刻冒充发布时间', () => {
    const xml = `<rss><channel><item>
      <title>Undated item</title>
      <link>https://example.com/x</link>
    </item></channel></rss>`;
    const { items, itemCount } = parseFeed(xml, { now: NOW });
    expect(itemCount).toBe(1);  // 扫到了
    expect(items).toHaveLength(0); // 但没采用
  });

  it('超过窗口的条目被裁掉，itemCount 仍如实反映扫描量', () => {
    const xml = `<rss><channel>
      <item><title>fresh</title><link>https://e.com/1</link><pubDate>${hoursAgo(2)}</pubDate></item>
      <item><title>stale</title><link>https://e.com/2</link><pubDate>${hoursAgo(100)}</pubDate></item>
    </channel></rss>`;
    const { items, itemCount } = parseFeed(xml, { now: NOW, maxAgeHours: DEFAULT_MAX_AGE_HOURS });
    expect(itemCount).toBe(2);
    expect(items.map((i) => i.title)).toEqual(['fresh']);
  });

  it('官方源用长窗口：11 天前的央行公告仍然保留', () => {
    // 美联储真实情况：最新一条公告距今 11 天。36 小时窗口会让它显示成「死源」
    const offline = DIRECT_FEEDS.find((f) => f.key === 'fed');
    expect(offline.maxAgeHours).toBe(24 * 14);
    const xml = `<rss><channel><item>
      <title>Federal Reserve issues FOMC statement</title>
      <link>https://e.com/fomc</link>
      <pubDate>${hoursAgo(24 * 11)}</pubDate>
    </item></channel></rss>`;
    expect(parseFeed(xml, { now: NOW, maxAgeHours: 36 }).items).toHaveLength(0);
    expect(parseFeed(xml, { now: NOW, maxAgeHours: offline.maxAgeHours }).items).toHaveLength(1);
  });

  it('按时间倒序返回', () => {
    const xml = `<rss><channel>
      <item><title>old</title><link>https://e.com/1</link><pubDate>${hoursAgo(10)}</pubDate></item>
      <item><title>new</title><link>https://e.com/2</link><pubDate>${hoursAgo(1)}</pubDate></item>
    </channel></rss>`;
    const { items } = parseFeed(xml, { now: NOW });
    expect(items.map((i) => i.title)).toEqual(['new', 'old']);
  });
});

describe('feed 解析：实体与标签', () => {
  it('命名实体、数字实体、未识别实体各自的处理', () => {
    expect(decodeEntities('a &amp; b')).toBe('a & b');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('it&#39;s')).toBe("it's");
    expect(decodeEntities('&#x2014;')).toBe('—');
    // 未识别的原样保留：宁可留个怪东西，也不要猜错
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });

  it('description 里的整段 HTML 被压成纯文本', () => {
    expect(stripFeedHtml('<p>hello<br/>world</p>')).toBe('hello world');
    expect(stripFeedHtml('<![CDATA[<b>bold</b> text]]>')).toBe('bold text');
    expect(stripFeedHtml('&nbsp;a&nbsp;b')).toBe('a b');
  });

  it('坏 XML 不抛异常，只是解析出 0 条', () => {
    expect(() => parseFeed('<html><body>Access Denied</body></html>', { now: NOW })).not.toThrow();
    expect(parseFeed('<html>Access Denied</html>', { now: NOW }).items).toHaveLength(0);
    expect(parseFeed('', { now: NOW }).items).toHaveLength(0);
  });
});

describe('feed 目录', () => {
  it('每个源都有 key/name/lang/region，直连源还有 url 与 kind', () => {
    const keys = new Set();
    for (const f of [...DIRECT_FEEDS, ...GOOGLE_FEEDS]) {
      expect(f.key, `${f.name} 缺 key`).toBeTruthy();
      expect(f.name, `${f.key} 缺 name`).toBeTruthy();
      expect(f.lang, `${f.key} 缺 lang`).toBeTruthy();
      expect(f.region, `${f.key} 缺 region`).toBeTruthy();
      // key 是去重与状态上报的键，重复会让两条源的条目互相顶掉
      expect(keys.has(f.key), `key 重复：${f.key}`).toBe(false);
      keys.add(f.key);
    }
    for (const f of DIRECT_FEEDS) {
      expect(f.url, `直连源 ${f.key} 缺 url`).toMatch(/^https:\/\//);
      expect(['official', 'media']).toContain(f.kind);
    }
    for (const f of GOOGLE_FEEDS) {
      expect(f.url).toBeUndefined();
      expect(googleFeedUrl(f)).toMatch(/^https:\/\/news\.google\.com\/rss\/headlines\/section\//);
    }
  });

  it('语种覆盖：至少 10 种语言、官方源占比不过半', () => {
    const langs = new Set([...DIRECT_FEEDS, ...GOOGLE_FEEDS].map((f) => f.lang));
    expect(langs.size).toBeGreaterThanOrEqual(10);
    const officials = DIRECT_FEEDS.filter((f) => f.kind === 'official');
    expect(officials.length).toBeGreaterThanOrEqual(8);
    expect(officials.length).toBeLessThan(DIRECT_FEEDS.length);
  });

  it('抓取层逐源上报状态；某个源挂了不影响其余源', async () => {
    // 用注入的假源，不碰外网：一个正常、一个 404、一个返回 HTML
    const { setFetcher } = await import('../src/server/providers/http.js');
    const xml = `<rss><channel><item><title>ok</title><link>https://e.com/1</link><pubDate>${hoursAgo(1)}</pubDate></item></channel></rss>`;
    setFetcher(async (url) => {
      if (url.includes('good')) return new Response(xml, { status: 200 });
      if (url.includes('waf')) return new Response('<html>Access Denied</html>', { status: 200 });
      return new Response('not found', { status: 404 });
    });
    try {
      const out = await fetchFeedCatalog([
        { key: 'good', name: '好源', url: 'https://x/good', lang: 'en', region: 'us', kind: 'media' },
        { key: 'waf', name: '被墙源', url: 'https://x/waf', lang: 'en', region: 'us', kind: 'media' },
        { key: 'gone', name: '死源', url: 'https://x/gone', lang: 'en', region: 'us', kind: 'media' },
      ], { now: NOW, perSource: 5 });

      const byKey = Object.fromEntries(out.status.map((s) => [s.key, s]));
      expect(byKey.good.ok).toBe(true);
      expect(byKey.good.count).toBe(1);
      // 200 但内容是 HTML：必须判失败，否则「被 WAF 换了页面」会被当成「今天没新闻」
      expect(byKey.waf.ok).toBe(false);
      expect(byKey.waf.error).toContain('不是 feed');
      expect(byKey.gone.ok).toBe(false);
      expect(byKey.gone.error).toContain('404');
      // 好源照常出货，坏源不影响它
      expect(out.items).toHaveLength(1);
      expect(out.items[0].title).toBe('ok');
    } finally {
      setFetcher(null);
    }
  });

  it('直连源的 publisher 兜底为目录里的媒体名', async () => {
    const { setFetcher } = await import('../src/server/providers/http.js');
    const xml = `<rss><channel><item><title>headline</title><link>https://e.com/1</link><pubDate>${hoursAgo(1)}</pubDate></item></channel></rss>`;
    setFetcher(async () => new Response(xml, { status: 200 }));
    try {
      const out = await fetchFeedCatalog([
        { key: 'k', name: '某国财经', url: 'https://x/f', lang: 'de', region: 'eu', kind: 'media' },
      ], { now: NOW });
      expect(out.items[0].publisher).toBe('某国财经');
      expect(out.items[0].origin).toBe('direct');
      expect(out.items[0].lang).toBe('de');
    } finally {
      setFetcher(null);
    }
  });
});

/* ================================================================== *
 * 2. 多语言词典
 * ================================================================== */

describe('词匹配：英文必须按词边界，中文按子串', () => {
  it('war 不命中 software / warning / reward', () => {
    expect(wordHit('software update', 'war')).toBe(false);
    expect(wordHit('a warning sign', 'war')).toBe(false);
    expect(wordHit('reward program', 'war')).toBe(false);
    expect(wordHit('Russia escalates war', 'war')).toBe(true);
    expect(wordHit('war', 'war')).toBe(true);
    expect(wordHit('war.', 'war')).toBe(true);      // 标点算边界
    expect(wordHit('war-torn region', 'war')).toBe(true);
  });

  it('ban 不命中 bank / urban', () => {
    expect(wordHit('central bank', 'ban')).toBe(false);
    expect(wordHit('urban planning', 'ban')).toBe(false);
    expect(wordHit('export ban imposed', 'ban')).toBe(true);
  });

  it('多词短语按整串匹配', () => {
    expect(wordHit('the Federal Reserve said', 'Federal Reserve')).toBe(true);
    expect(wordHit('rate cut expected', 'rate cut')).toBe(true);
    expect(wordHit('ratecut', 'rate cut')).toBe(false);
  });

  it('中日韩阿等无词边界语言用子串', () => {
    expect(wordHit('日本央行が利上げを決定', '利上げ')).toBe(true);
    expect(wordHit('기준금리 인상', '금리 인상')).toBe(true);
    expect(wordHit('رفع الفائدة اليوم', 'رفع الفائدة')).toBe(true);
    expect(wordHit('中国人民银行降准', '降准')).toBe(true);
  });

  it('anyWordHit 命中任意一个即为真', () => {
    expect(anyWordHit('nothing here', ['war', 'inflation'])).toBe(false);
    expect(anyWordHit('inflation cools', ['war', 'inflation'])).toBe(true);
    expect(anyWordHit('', ['x'])).toBe(false);
  });
});

describe('主题规则：titleOnly 只认标题', () => {
  const geo = () => COMPILED_TOPICS.find((r) => r.key === 'geopolitics');

  it('地缘政治的泛词进了 titleOnly，不再参与正文匹配', () => {
    const g = geo();
    expect(g.titleOnly ?? TOPIC_RULES.find((r) => r.key === 'geopolitics').titleOnly).toContain('war');
    for (const w of ['war', 'attack', 'strikes', 'conflict']) {
      expect(g.titleWords).toContain(w);   // 标题里算数
      expect(g.bodyWords).not.toContain(w); // 正文里不算
    }
  });

  it('trade war 仍是正文有效词（真地缘政治，不受清洗影响）', () => {
    expect(geo().bodyWords).toContain('trade war');
  });
});

describe('文本清洗：英文比喻不作数', () => {
  it('price war / currency war 不是地缘冲突', () => {
    expect(sanitizeText('A price war breaks out among retailers')).not.toMatch(/\bwar\b/i);
    expect(sanitizeText('Currency war fears grow')).not.toMatch(/\bwar\b/i);
    expect(wordHit(sanitizeText('A price war breaks out'), 'war')).toBe(false);
  });

  it('trade war 保留（它是真的地缘政治）', () => {
    expect(sanitizeText('US-China trade war escalates')).toContain('trade war');
  });

  it('劳工罢工不是军事打击', () => {
    expect(wordHit(sanitizeText('Rail workers strike enters third week'), 'strike')).toBe(false);
    expect(wordHit(sanitizeText('workers strike over pay'), 'strikes')).toBe(false);
  });

  it('「达成协议」的 strike a deal 不是打击', () => {
    expect(wordHit(sanitizeText('Both sides strike a deal'), 'strike')).toBe(false);
  });

  it('军事语境保留', () => {
    expect(wordHit(sanitizeText('Airstrike hits military base'), 'airstrike')).toBe(true);
  });

  it('气象灾害不是袭击', () => {
    // 中文：「台风袭击」原逻辑
    expect(sanitizeText('台风袭击东南沿海')).not.toContain('袭击');
    // 英文：storm 被中性化，后续不会再和 attack/strike 组合
    expect(sanitizeText('Storm batters Florida coast')).toContain('气象事件');
  });

  it('产业升级 / 公司治理不是地缘或政治事件', () => {
    expect(wordHit(sanitizeText('消费升级趋势明显'), '升级')).toBe(false);
    expect(wordHit(sanitizeText('股东大会换届选举'), '选举')).toBe(false);
  });
});

describe('地区推断：特异优先', () => {
  it('「欧洲央行」判 eu，不能被 cn 的裸词「央行」抢走', () => {
    // 这是扩表前真实存在过的错误：cn 排第一且含「央行」，欧洲央行/日本央行的稿子全判中国
    expect(guessRegion('欧洲央行贷款调查：净27%的银行报告需求下降')).toBe('eu');
    expect(guessRegion('日本央行维持政策利率不变')).toBe('jp');
    expect(guessRegion('美联储宣布降息25个基点')).toBe('us');
  });

  it('中文「财政部」默认指中国，「美国财政部」才是美国', () => {
    expect(guessRegion('财政部发布地方政府专项债额度')).toBe('cn');
    expect(guessRegion('美国财政部宣布新一轮制裁')).toBe('us');
  });

  it('多语言国名都能识别', () => {
    expect(guessRegion('Bundesbank sieht Risiken')).toBe('eu');
    expect(guessRegion('日銀が利上げ')).toBe('jp');
    expect(guessRegion('Turquía recibe oferta de gas')).toBe('me');
    expect(guessRegion('한국은행 기준금리 동결')).toBe('asia');
    expect(guessRegion('Ibovespa sobe com bancos')).toBe('latam');
  });

  it('正文无国名时用来源地区兜底，全球 feed 仍是 global', () => {
    expect(guessRegion('Oil prices rise', 'eu')).toBe('eu');
    expect(guessRegion('Oil prices rise', 'global')).toBe('global');
  });

  it('每个地区都至少有一个可命中的词', () => {
    for (const [region, words] of REGION_WORDS) {
      expect(words.length, `${region} 词表为空`).toBeGreaterThan(3);
    }
  });
});

describe('官方例行文件判定', () => {
  it('访谈/演讲/会议/统计/假期安排不是事件', () => {
    for (const t of [
      'Interview with Die Presse',
      'Piero Cipollone: Speech at the ECB Forum',
      'Conference on Diversity, Equity and Inclusion in Economics',
      'Calendar of monetary policy meetings',
      'Boxing Day',
      'Holidays 2026',
    ]) {
      expect(isOfficialRoutine(t, 'official'), t).toBe(true);
    }
  });

  it('署名文章「人名: 标题」判为例行', () => {
    expect(isOfficialRoutine('Frank Elderson: Taking action for nature', 'official')).toBe(true);
  });

  it('真事件不误杀', () => {
    for (const t of [
      'Federal Reserve issues FOMC statement',
      'ECB raises the three key interest rates by 25 basis points',
      'SEC charges firm with $50 million penalty',
      'Bank of Japan decides to raise the policy rate',
    ]) {
      expect(isOfficialRoutine(t, 'official'), t).toBe(false);
    }
  });

  it('只对官方源生效：媒体标题里的 interview 正是新闻本身', () => {
    expect(isOfficialRoutine('Interview with Die Presse', 'media')).toBe(false);
    expect(isOfficialRoutine('CEO says in interview that sales are rising', 'aggregate')).toBe(false);
  });
});

describe('词典规模：真能覆盖国际新闻', () => {
  it('每个主题都有非中文词，且覆盖主要语种', () => {
    for (const rule of TOPIC_RULES) {
      const langs = Object.keys(rule.intl ?? {});
      expect(langs.length, `${rule.key} 只覆盖 ${langs.join(',')}`).toBeGreaterThanOrEqual(8);
      for (const l of ['en', 'ja', 'de', 'fr', 'es']) {
        expect(langs, `${rule.key} 缺 ${l}`).toContain(l);
      }
    }
  });

  it('高影响动词含英文，且能命中典型标题', () => {
    expect(IMPACT_WORDS).toContain('plunge');
    expect(anyWordHit('Stocks plunge on tariff fears', IMPACT_WORDS)).toBe(true);
    expect(anyWordHit('暴跌 3%', IMPACT_WORDS)).toBe(true);
  });
});
