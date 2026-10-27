/* ================================================================== *
 * 全球新闻通道：媒体/机构的 RSS·Atom 直连 + Google News 多语种聚合
 *
 * 两条腿，各有各的理由：
 *
 *   1. DIRECT_FEEDS —— 媒体或机构自己发布的 feed。这是真正的「一手」：
 *      链接直达原文域名，标题未经二次编辑。央行公告、统计局数据发布、
 *      通讯社稿件都在这一层。缺点是覆盖面受限于「谁愿意开 RSS」：
 *      Reuters / AP / AFP 早在 2020 年前后就关停了公开 feed，
 *      日经、韩国朝鲜日报、法德多家的站点则挂在 Akamai/Cloudflare 后面，
 *      对任何非浏览器的请求直接 403 —— 实测过，补齐 Sec-Fetch-* 全套头也没用。
 *
 *   2. GOOGLE_FEEDS —— 按语种订阅 Google News 的 topic feed。一条 feed 里
 *      混着几十家不同媒体的稿件，`<source>` 节点带原始媒体名与域名，
 *      等于替我们把「关停 RSS 的通讯社」「挡爬虫的站点」都代理了回来。
 *      实测 14 个语种合计约 830 条、去重 390 家媒体，Reuters/AP 在 en-WORLD 里，
 *      日经在 ja 里，Les Echos 在 fr 里（直连 403，这里全须全尾）。
 *      代价：link 是 news.google.com 的跳转，不是原文直链；标题带「 - 媒体名」
 *      后缀。这两点都在解析时显式处理，不假装它是原生 feed。
 *
 * 解析器是手写的正则扫描，不用 XML 库：项目零依赖，而这些 feed 的形状足够稳
 * （RSS2.0 / Atom / RDF 三种，字段名就那几个）。真正的风险不是「解析不了」，
 * 而是「静默解析成空」—— 所以每个源都回传自己的状态，缺一条就能看见。
 * ================================================================== */

import { fetchRaw } from './http.js';

/** feed 里超过这个年龄的条目丢掉：Google News 会混进 2008/2019 年的陈货 */
export const DEFAULT_MAX_AGE_HOURS = 36;

/**
 * 官方机构的发布节奏是「周」不是「小时」：美联储最近一条公告距今 11 天、
 * 世贸组织 10 天、美国经济分析局 3 周。用 36 小时窗口会把**最有价值的一手
 * 公告全部过滤掉**，而且表现得完全像个死源（扫描到 20 条、出来 0 条）。
 * 所以按来源类型分开：公告看两周，新闻看两天。
 */
export const OFFICIAL_MAX_AGE_HOURS = 24 * 14;
export const DEFAULT_CONCURRENCY = 10;
export const DEFAULT_PER_SOURCE = 12;

/* ------------------------------------------------------------------ *
 * 直连目录
 *
 * kind: official = 机构自己的公告（一手性最高，也是 Google 聚合里最容易被
 *                    埋在「新闻」下面的那类），media = 媒体原创报道。
 * lang: 用于多语言关键词匹配前的语种提示，也用于前端标注。
 * enc:  少数站点仍用 ISO-8859-1，按 utf-8 解会得到一串问号。
 * ------------------------------------------------------------------ */
export const DIRECT_FEEDS = [
  // ---- 货币当局与监管（一手公告）----
  { key: 'fed', name: '美联储', url: 'https://www.federalreserve.gov/feeds/press_all.xml', lang: 'en', region: 'us', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'ecb', name: '欧洲央行', url: 'https://www.ecb.europa.eu/rss/press.html', lang: 'en', region: 'eu', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'boj', name: '日本央行', url: 'https://www.boj.or.jp/en/rss/whatsnew.xml', lang: 'en', region: 'jp', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'boc', name: '加拿大央行', url: 'https://www.bankofcanada.ca/feed/', lang: 'en', region: 'us', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'rbi', name: '印度储备银行', url: 'https://www.rbi.org.in/pressreleases_rss.xml', lang: 'en', region: 'asia', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'sec', name: '美国证监会', url: 'https://www.sec.gov/news/pressreleases.rss', lang: 'en', region: 'us', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'bls', name: '美国劳工统计局', url: 'https://www.bls.gov/feed/bls_latest.rss', lang: 'en', region: 'us', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'bea', name: '美国经济分析局', url: 'https://apps.bea.gov/rss/rss.xml', lang: 'en', region: 'us', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'bis', name: '国际清算银行', url: 'https://www.bis.org/doclist/all_pressrels.rss', lang: 'en', region: 'global', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },
  { key: 'wto', name: '世贸组织', url: 'https://www.wto.org/library/rss/latest_news_e.xml', lang: 'en', region: 'global', kind: 'official', maxAgeHours: OFFICIAL_MAX_AGE_HOURS },

  // ---- 媒体原创（RSS 尚开，拿到的是原文直链）----
  { key: 'cnbc', name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', lang: 'en', region: 'us', kind: 'media' },
  { key: 'ft', name: '金融时报', url: 'https://www.ft.com/markets?format=rss', lang: 'en', region: 'uk', kind: 'media' },
  { key: 'bbc', name: 'BBC 商业', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', lang: 'en', region: 'uk', kind: 'media' },
  { key: 'spiegel', name: '明镜周刊', url: 'https://www.spiegel.de/wirtschaft/index.rss', lang: 'de', region: 'eu', kind: 'media' },
  { key: 'faz', name: '法兰克福汇报', url: 'https://www.faz.net/rss/aktuell/wirtschaft/', lang: 'de', region: 'eu', kind: 'media' },
  { key: 'lemonde', name: '世界报', url: 'https://www.lemonde.fr/economie/rss_full.xml', lang: 'fr', region: 'eu', kind: 'media' },
  { key: 'yonhap', name: '韩联社', url: 'https://en.yna.co.kr/RSS/news.xml', lang: 'en', region: 'asia', kind: 'media' },
  { key: 'scmp', name: '南华早报', url: 'https://www.scmp.com/rss/92/feed', lang: 'en', region: 'cn', kind: 'media' },
  { key: 'oilprice', name: 'OilPrice', url: 'https://oilprice.com/rss/main', lang: 'en', region: 'global', kind: 'media' },
  { key: 'coindesk', name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', lang: 'en', region: 'global', kind: 'media' },

  // ---- 区域性媒体（补充 Google 聚合覆盖较薄的区域）----
  { key: 'arabnews', name: '阿拉伯新闻', url: 'https://www.arabnews.com/rss.xml', lang: 'en', region: 'me', kind: 'media' },
  // 安纳多卢的 TLS 层会对高频请求直接拒绝握手（ERR_SSL_ALERT_HANDSHAKE_FAILURE）：
  // 探测阶段连续几轮之后必挂，隔久一点重试又能通。保留它是因为安纳多卢是土耳其
  // 一手的官方通讯社；即便偶发失败，土耳其方向还有 gn-tr 语种聚合兜着
  // （NTV / Bloomberght / Habertürk 等 27 家），不会出现覆盖空洞。
  { key: 'anadolu', name: '安纳多卢通讯社', url: 'https://www.aa.com.tr/en/rss/default?cat=economy', lang: 'en', region: 'me', kind: 'media' },
  { key: 'folha', name: '圣保罗页报', url: 'https://feeds.folha.uol.com.br/mercado/rss.xml', lang: 'pt', region: 'latam', kind: 'media', enc: 'latin1' },
  { key: 'bday-ng', name: '尼日利亚商业日报', url: 'https://businessday.ng/feed/', lang: 'en', region: 'africa', kind: 'media' },
];

/* ------------------------------------------------------------------ *
 * Google News 多语种聚合
 *
 * 一条 feed 覆盖几十家媒体，是「全球各主流媒体」这个要求在工程上真正可行的
 * 那一半。语种按「该语种对应的主要经济体」选，不用全上：
 * 这 14 个已经覆盖 G20 的全部成员 + 中东主要产油国。
 * ------------------------------------------------------------------ */
export const GOOGLE_FEEDS = [
  { key: 'gn-en-biz', name: '全球商业', lang: 'en', region: 'global', qs: '?hl=en-US&gl=US&ceid=US:en', section: 'topic/BUSINESS' },
  { key: 'gn-en-world', name: '全球要闻', lang: 'en', region: 'global', qs: '?hl=en-US&gl=US&ceid=US:en', section: 'topic/WORLD' },
  { key: 'gn-zh', name: '中文财经', lang: 'zh', region: 'cn', qs: '?hl=zh-CN&gl=CN&ceid=CN:zh-Hans', section: 'topic/BUSINESS' },
  { key: 'gn-ja', name: '日文财经', lang: 'ja', region: 'jp', qs: '?hl=ja&gl=JP&ceid=JP:ja', section: 'topic/BUSINESS' },
  { key: 'gn-ko', name: '韩文财经', lang: 'ko', region: 'asia', qs: '?hl=ko&gl=KR&ceid=KR:ko', section: 'topic/BUSINESS' },
  { key: 'gn-de', name: '德文财经', lang: 'de', region: 'eu', qs: '?hl=de&gl=DE&ceid=DE:de', section: 'topic/BUSINESS' },
  { key: 'gn-fr', name: '法文财经', lang: 'fr', region: 'eu', qs: '?hl=fr&gl=FR&ceid=FR:fr', section: 'topic/BUSINESS' },
  { key: 'gn-it', name: '意文财经', lang: 'it', region: 'eu', qs: '?hl=it&gl=IT&ceid=IT:it', section: 'topic/BUSINESS' },
  { key: 'gn-es', name: '西文财经', lang: 'es', region: 'latam', qs: '?hl=es-419&gl=MX&ceid=MX:es', section: 'topic/BUSINESS' },
  { key: 'gn-pt', name: '葡文财经', lang: 'pt', region: 'latam', qs: '?hl=pt-BR&gl=BR&ceid=BR:pt-419', section: 'topic/BUSINESS' },
  { key: 'gn-ru', name: '俄文财经', lang: 'ru', region: 'eu', qs: '?hl=ru&gl=RU&ceid=RU:ru', section: 'topic/BUSINESS' },
  { key: 'gn-ar', name: '阿拉伯文财经', lang: 'ar', region: 'me', qs: '?hl=ar&gl=AE&ceid=AE:ar', section: 'topic/BUSINESS' },
  { key: 'gn-tr', name: '土文财经', lang: 'tr', region: 'me', qs: '?hl=tr&gl=TR&ceid=TR:tr', section: 'topic/BUSINESS' },
  { key: 'gn-hi', name: '印地文财经', lang: 'hi', region: 'asia', qs: '?hl=hi&gl=IN&ceid=IN:hi', section: 'topic/BUSINESS' },
];

export function googleFeedUrl(src) {
  return `https://news.google.com/rss/headlines/section/${src.section}${src.qs}`;
}

/* ------------------------------------------------------------------ *
 * 解析
 * ------------------------------------------------------------------ */

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#39': "'", '#39;': "'", hellip: '…', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•',
};

/** 实体解码：命名实体查表，数字实体按码点。未识别的原样保留，不猜。 */
export function decodeEntities(input) {
  return String(input ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const hit = NAMED[body];
    return hit === undefined ? whole : hit;
  });
}

/** 去 CDATA 包裹并解实体 */
function unmark(raw) {
  let s = String(raw ?? '');
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(s);
}

/** 去标签、压缩空白。feed 的 description 常带整段 HTML。 */
export function stripFeedHtml(html) {
  return unmark(String(html ?? '').replace(/<br\s*\/?>/gi, ' '))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 在块里按候选标签名取第一个非空值 */
function pick(block, tags) {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
    const m = re.exec(block);
    if (m && m[1].trim()) return unmark(m[1]).trim();
  }
  return '';
}

/** 链接：RSS 用 <link>文本</link>，Atom 用 <link href="..."/>，两种都要 */
function pickLink(block) {
  const atomAlternate = /<link[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i.exec(block);
  if (atomAlternate) return decodeEntities(atomAlternate[1]).trim();
  const atomAny = /<link[^>]*\bhref=["']([^"']+)["']/i.exec(block);
  if (atomAny) return decodeEntities(atomAny[1]).trim();
  const rss = /<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i.exec(block);
  if (rss) {
    const v = unmark(rss[1]).trim();
    if (/^https?:\/\//i.test(v)) return v;
  }
  const guid = /<guid(?:\s[^>]*)?>([\s\S]*?)<\/guid>/i.exec(block);
  if (guid) {
    const v = unmark(guid[1]).trim();
    if (/^https?:\/\//i.test(v)) return v;
  }
  return '';
}

/**
 * 时间：RSS 的 RFC822（Fri, 16 Oct 2026 15:00:00 GMT）、
 * Atom 的 ISO8601、以及少数 feed 的 `2026-10-27 09:05:30` 都交给 Date。
 * 解析不出来的返回 null —— 宁可丢一条，也不拿抓取时刻冒充发布时间
 * （那会让没有 pubDate 的源永远霸占榜首）。
 *
 * 例外：巴西圣保罗页报整份 feed 没有 pubDate，时间只编码在 guid 里
 * （`202610270400` = 2026-10-27 04:00）。这种 12 位纯数字 guid 按 UTC 解，
 * 与该国实际时区最多差 3 小时 —— 在「两天 / 两周」这种窗口里无实质影响，
 * 但足以让这 25 条不再被当成死源。
 */
function pickDate(block) {
  const raw = pick(block, ['pubDate', 'published', 'updated', 'dc:date', 'date', 'issued']);
  if (raw) {
    const d = new Date(raw.trim().replace(/\s+/g, ' '));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const guid = pick(block, ['guid', 'id']).trim();
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(guid);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Google News 的标题是「标题 - 媒体名」，用 <source> 的名字精确剥掉后缀 */
export function splitPublisher(title, publisher) {
  const t = String(title ?? '').trim();
  const p = String(publisher ?? '').trim();
  if (!p || !t) return { title: t, publisher: p || null };
  // 后缀分隔符：英文习惯用 " - "，" – " / " — " 也见过；日文常是 " - "
  const tail = new RegExp(`\\s+[-–—]\\s+${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  if (tail.test(t)) return { title: t.replace(tail, '').trim(), publisher: p };
  return { title: t, publisher: p };
}

/**
 * 解析一份 feed。返回 { items, itemCount }：
 *   itemCount 是 feed 里实际扫到的条目数（用于区分「源挂了」和「源活着但都是陈货」）
 */
export function parseFeed(xml, { now = Date.now(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  const text = String(xml ?? '');
  const blocks = [
    ...text.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...text.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ].map((m) => m[1]);

  const cutoff = now - maxAgeHours * 3600_000;
  const items = [];
  for (const block of blocks) {
    const rawTitle = pick(block, ['title']);
    const title = stripFeedHtml(rawTitle);
    if (!title) continue;
    const at = pickDate(block);
    if (!at || at.getTime() < cutoff) continue;

    const sourceName = pick(block, ['source']);
    const split = splitPublisher(title, sourceName);
    const body = stripFeedHtml(
      pick(block, ['description', 'summary', 'content:encoded', 'content']),
    );
    const link = pickLink(block);

    items.push({
      title: split.title,
      publisher: split.publisher,
      body: body && body !== title ? body : '',
      url: link || null,
      at,
      // guid 在 Google News 上是 base64 串，做去重键比标题可靠
      guid: pick(block, ['guid', 'id']) || link || title,
      categories: [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
        .map((m) => stripFeedHtml(m[1]))
        .filter(Boolean)
        .slice(0, 4),
    });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { items, itemCount: blocks.length };
}

/* ------------------------------------------------------------------ *
 * 抓取
 * ------------------------------------------------------------------ */

/** 手写的并发池：源之间互相独立，某个源卡住不该拖住整轮 */
async function pool(tasks, concurrency) {
  const out = new Array(tasks.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (i < tasks.length) {
        const k = i++;
        out[k] = await tasks[k]();
      }
    }),
  );
  return out;
}

async function pullOne(src, { now, maxAgeHours, perSource, timeoutMs }) {
  const url = src.url ?? googleFeedUrl(src);
  try {
    const xml = await fetchRaw(url, {
      ...(src.enc ? { encoding: src.enc } : {}),
      timeoutMs,
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!/<rss|<feed|<rdf:RDF/i.test(xml.slice(0, 800))) {
      throw new Error('响应不是 feed（可能被 WAF 换成了 HTML）');
    }
    const { items, itemCount } = parseFeed(xml, { now, maxAgeHours: src.maxAgeHours ?? maxAgeHours });
    return {
      source: src,
      ok: true,
      itemCount,
      items: items.slice(0, perSource),
      error: null,
    };
  } catch (err) {
    // Node 的 fetch 只会说 'fetch failed'，真正原因藏在 err.cause 里
    // （ENOTFOUND / ECONNRESET / 证书错误 / UND_ERR_CONNECT_TIMEOUT）。
    // 不把 cause 带出来，「这个源失败了」就是一句无法排查的话。
    const cause = err?.cause?.code ?? err?.cause?.message ?? '';
    const error = `${err?.message ?? err}${cause ? `（${cause}）` : ''}`;
    return { source: src, ok: false, itemCount: 0, items: [], error };
  }
}

/**
 * 并发抓一整个目录，返回逐源状态 + 拍平后的事件。
 * 逐源状态是这套东西唯一的可观测面：某个源静默变空，只能从这里看出来。
 */
export async function fetchFeedCatalog(
  sources,
  { now = Date.now(), maxAgeHours = DEFAULT_MAX_AGE_HOURS, perSource = DEFAULT_PER_SOURCE, concurrency = DEFAULT_CONCURRENCY, timeoutMs = 9000 } = {},
) {
  const results = await pool(sources.map((src) => () => pullOne(src, { now, maxAgeHours, perSource, timeoutMs })), concurrency);
  const items = [];
  const status = [];
  for (const r of results) {
    status.push({
      key: r.source.key,
      source: r.source.name,
      lang: r.source.lang,
      region: r.source.region,
      kind: r.source.kind ?? 'aggregate',
      ok: r.ok,
      count: r.items.length,
      scanned: r.itemCount,
      ...(r.error ? { error: r.error } : {}),
    });
    for (const it of r.items) {
      items.push({
        ...it,
        // 直连 feed 的条目没有 <source> 节点，媒体名就是目录里的名字
        publisher: it.publisher || r.source.name,
        sourceKey: r.source.key,
        source: r.source.name,
        lang: r.source.lang,
        sourceRegion: r.source.region,
        sourceKind: r.source.kind ?? 'aggregate',
        origin: r.source.url ? 'direct' : 'aggregate',
      });
    }
  }
  return { items, status };
}
