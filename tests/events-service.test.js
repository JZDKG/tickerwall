/* ================================================================== *
 * 事件服务（events.service）
 *
 * 三个国内源 + 两条全球 feed 的抓取编排、噪声/例行稿过滤、主题打分、
 * 标题去重、归档与 24h 回放、LLM 复核的覆盖语义。
 *
 * 全部通过 mock 上游与持久层驱动，不联网、不写真实 data/。
 * 关注的是「哪些稿子会进事件流、以什么等级进、去重方向对不对」。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/server/providers/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchRaw: vi.fn() };
});

vi.mock('../src/server/providers/news-feeds.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchFeedCatalog: vi.fn() };
});

vi.mock('../src/server/db/index.js', () => ({
  kvGetJson: vi.fn(),
  kvSetJson: vi.fn(),
  appendJsonl: vi.fn(),
  readJsonl: vi.fn(),
  readJsonlField: vi.fn(),
  // 事件修订（C3）：这里只关心接口不被打破，具体写入行为在 db 层单测
  writeEventRevision: vi.fn(),
  nextEventRevision: vi.fn(() => 1),
  eventRevisionCounts: vi.fn(() => new Map()),
}));

const { fetchRaw } = await import('../src/server/providers/index.js');
const { fetchFeedCatalog } = await import('../src/server/providers/news-feeds.js');
const { kvGetJson, kvSetJson, appendJsonl, readJsonl, readJsonlField } = await import(
  '../src/server/db/index.js'
);
const events = await import('../src/server/services/events.service.js');

const { loadLlmStore, archiveEvents, eventTimeMs, mergeHistoryRows, getEventHistory, getEvents } =
  events;

/* ------------------------------ 上游响应夹具 ------------------------------ */

const jin10 = (items) => JSON.stringify({ data: items });
const sinaFeed = (list) => JSON.stringify({ result: { data: { feed: { list } } } });
const wscn = (items) => JSON.stringify({ data: { items } });

/** 默认：三个国内源各一条，全球源空 */
function primeDomestic() {
  fetchRaw.mockImplementation(async (url) => {
    if (url.includes('jin10')) {
      return jin10([
        {
          id: 'j1',
          time: '2026-10-26 10:00:00',
          important: 1,
          data: { title: '美联储宣布降息25个基点', content: '<p>联邦基金利率下调</p>', source_link: 'https://x.test/a' },
        },
      ]);
    }
    if (url.includes('zhibo.sina')) {
      if (url.includes('page=2')) return sinaFeed([]);
      return sinaFeed([
        {
          id: 's1',
          rich_text: '【中国央行宣布降准】释放长期资金约一万亿元',
          create_time: '2026-10-26 10:01:00',
          docurl: 'https://x.test/b',
          top_value: 0,
        },
      ]);
    }
    if (url.includes('wallstcn')) {
      return wscn([
        { id: 'w1', title: '比特币突破十万美元', content: '加密市场情绪高涨', display_time: 1793000000, uri: 'https://x.test/c', score: 1 },
      ]);
    }
    throw new Error(`unexpected url ${url}`);
  });
  fetchFeedCatalog.mockResolvedValue({ items: [], status: [] });
}

beforeEach(() => {
  fetchRaw.mockReset();
  fetchFeedCatalog.mockReset();
  kvGetJson.mockReset();
  kvSetJson.mockReset();
  appendJsonl.mockReset();
  readJsonl.mockReset();
  readJsonlField.mockReset();

  kvGetJson.mockReturnValue(null);
  kvSetJson.mockReturnValue();
  appendJsonl.mockResolvedValue();
  readJsonl.mockResolvedValue([]);
  readJsonlField.mockResolvedValue(new Set());

  // 不读 ~/.dsh：避免测试依赖机器上的凭据
  process.env.LLM_CONFIG_SOURCE = 'env';
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;

  primeDomestic();
});

afterEach(() => {
  delete process.env.LLM_CONFIG_SOURCE;
  vi.useRealTimers();
});

/* ------------------------------ 抓取与映射 ------------------------------ */

describe('getEvents：三源映射', () => {
  it('金十/新浪/见闻都映射成同一形状，并给出源状态', async () => {
    const out = await getEvents({ force: true });
    expect(out.ok).toBe(true);
    expect(out.sources.map((s) => [s.key, s.ok, s.count])).toEqual([
      ['jin10', true, 1],
      ['sina', true, 1],
      ['wscn', true, 1],
    ]);
    const ids = out.items.map((i) => i.id).sort();
    expect(ids).toEqual(['jin10:j1', 'sina:s1', 'wscn:w1']);
    const j = out.items.find((i) => i.id === 'jin10:j1');
    expect(j.source).toBe('金十数据');
    expect(j.title).toBe('美联储宣布降息25个基点');
    expect(j.url).toBe('https://x.test/a');
    expect(j.level).toBe('high'); // important=1 直接判高
    expect(j.topics.map((t) => t.key)).toContain('fed');
    expect(j.symbols).toContain('us10y');

    const s = out.items.find((i) => i.id === 'sina:s1');
    expect(s.title).toBe('中国央行宣布降准');
    expect(s.bodyOnly ?? s.body).toBeTruthy();
    expect(s.topics.map((t) => t.key)).toContain('china');
    // top_value=0 → 不因重要标记升级
    expect(s.level).not.toBe('high');

    const w = out.items.find((i) => i.id === 'wscn:w1');
    expect(w.url).toBe('https://x.test/c');
    expect(w.topics.map((t) => t.key)).toContain('crypto');
  });

  it('单个源失败只记该源 ok:false，不影响其他源', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) throw new Error('502 bad gateway');
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([{ id: 'w1', title: '美联储降息', content: '', display_time: 1793000000, score: 1 }]);
    });
    const out = await getEvents({ force: true });
    expect(out.sources.find((s) => s.key === 'jin10')).toMatchObject({ ok: false, error: '502 bad gateway' });
    expect(out.ok).toBe(true);
    expect(out.coverage.sources).toEqual({ total: 3, ok: 2, failed: 1 });
  });

  it('标题/正文超长会截断，避免撑爆页面', async () => {
    const long = '美联储'.repeat(200);
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) {
        return jin10([{ id: 'j1', time: '2026-10-26 10:00:00', data: { title: long, content: long } }]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    const out = await getEvents({ force: true });
    const it = out.items[0];
    expect(it.title.length).toBe(91); // 90 + …
    expect(it.title.endsWith('…')).toBe(true);
    expect(it.body.length).toBe(401);
  });

  it('缺少 time 或 title 的条目被丢弃', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) {
        return jin10([
          { id: 'a', time: '', data: { title: '美联储降息' } },
          { id: 'b', time: '2026-10-26 10:00:00', data: { title: '' } },
          { id: 'c', time: '2026-10-26 10:00:00', data: { title: '美联储降息' } },
        ]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    const out = await getEvents({ force: true });
    expect(out.items.map((i) => i.id)).toEqual(['jin10:c']);
  });
});

describe('getEvents：过滤与去重', () => {
  it('汇总/营销稿、例行官方稿、弱相关稿都不进事件流', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) {
        return jin10([
          { id: 'noise', time: '2026-10-26 10:00:00', data: { title: '本周市场表现汇总' } },
          { id: 'weak', time: '2026-10-26 10:00:00', data: { title: '某公司发布新款手机' } },
          { id: 'keep', time: '2026-10-26 10:00:00', data: { title: '美联储宣布降息' } },
        ]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    let feedCall = 0;
    fetchFeedCatalog.mockImplementation(async () => {
      feedCall += 1;
      if (feedCall > 1) return { items: [], status: [] };
      return {
      items: [
        {
          sourceKey: 'official-x', source: '官方', publisher: 'Fed', lang: 'en', origin: 'direct',
          sourceKind: 'official', sourceRegion: 'us', at: Date.UTC(2026, 9, 26, 2), guid: 'g1',
          title: 'Speech: Policy outlook', body: '', url: 'https://x.test/o',
        },
        {
          sourceKey: 'official-y', source: '官方', publisher: 'Fed', lang: 'en', origin: 'direct',
          sourceKind: 'official', sourceRegion: 'us', at: Date.UTC(2026, 9, 26, 3), guid: 'g2',
          title: 'Federal Reserve announces emergency rate cut', body: '与 Bank of England 联合行动', url: 'https://x.test/p',
        },
      ],
      status: [
        { key: 'official-x', source: '官方', kind: 'official', ok: true, lang: 'en', region: 'us' },
        { key: 'official-y', source: '官方', kind: 'official', ok: true, lang: 'en', region: 'us' },
      ],
      };
    });

    const out = await getEvents({ force: true });
    const ids = out.items.map((i) => i.id);
    expect(ids.some((id) => id.includes('noise'))).toBe(false);
    expect(ids.some((id) => id.includes('weak'))).toBe(false);
    expect(ids).toContain('jin10:keep');
    // 官方例行稿被过滤，但「紧急降息」这种真新闻保留
    expect(out.items.some((i) => i.title.includes('Speech'))).toBe(false);
    const fed = out.items.find((i) => i.title.includes('emergency'));
    expect(fed).toBeTruthy();
    // 官方源只看标题：正文里的 Bank of England 不得把地区判成 uk
    expect(fed.region).toBe('us');
    expect(out.coverage.official).toBe(2);
  });

  it('不同源转发同一标题只保留一条（标题归一化后去重）', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) {
        return jin10([{ id: 'a', time: '2026-10-26 10:00:00', data: { title: '美联储宣布降息 25 个基点' } }]);
      }
      if (url.includes('zhibo.sina')) {
        return sinaFeed([{ id: 'b', rich_text: '【美联储宣布降息 25 个基点】', create_time: '2026-10-26 10:00:30' }]);
      }
      return wscn([]);
    });
    const out = await getEvents({ force: true });
    expect(out.items.filter((i) => /美联储宣布降息/.test(i.title))).toHaveLength(1);
  });

  it('全球源按 origin 统计一手/聚合，并汇总语种与地区', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) return jin10([]);
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    let feedCall = 0;
    fetchFeedCatalog.mockImplementation(async () => {
      feedCall += 1;
      if (feedCall > 1) return { items: [], status: [] };
      return {
      items: [
        {
          sourceKey: 'reuters', source: '英文财经', publisher: 'Reuters', lang: 'en', origin: 'direct',
          sourceKind: 'media', sourceRegion: 'global', at: Date.UTC(2026, 9, 26, 2), guid: 'a'.repeat(40),
          title: 'OPEC cuts oil supply, crude jumps', body: '', url: 'https://x.test/r',
        },
        {
          sourceKey: 'google-ja', source: '日文财经', publisher: '日経', lang: 'ja', origin: 'aggregate',
          sourceKind: 'aggregate', sourceRegion: 'jp', at: Date.UTC(2026, 9, 26, 3), guid: 'b'.repeat(40),
          title: '日銀が利上げを決定', body: '', url: 'javascript:alert(1)',
        },
      ],
      status: [
        { key: 'reuters', source: '英文财经', kind: 'media', ok: true, lang: 'en', region: 'global' },
        { key: 'google-ja', source: '日文财经', kind: 'aggregate', ok: true, lang: 'ja', region: 'jp' },
        { key: 'dead', source: '挂了', kind: 'media', ok: false, lang: 'fr', region: 'eu', error: 'timeout' },
      ],
      };
    });

    const out = await getEvents({ force: true });
    expect(out.coverage.origins).toEqual({ direct: 1, aggregate: 1 });
    expect(out.coverage.languages).toEqual(['en', 'ja']);
    expect(out.coverage.regions).toContain('jp');
    const ja = out.items.find((i) => i.lang === 'ja');
    // 外部链接只放行 http(s)
    expect(ja.url).toBeNull();
    expect(out.coverage.sources).toEqual({ total: 6, ok: 5, failed: 1 });
  });

  it('limit 只截断返回条目，total/counts 反映完整集合', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      time: `2026-10-26 10:0${i}:00`,
      data: { title: `美联储官员讲话${i}号` },
    }));
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) return jin10(many);
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    const out = await getEvents({ force: true, limit: 2 });
    expect(out.items).toHaveLength(2);
    expect(out.total).toBeGreaterThanOrEqual(2);
    expect(out.items[0].time >= out.items[1].time).toBe(true);
  });

  it('一条都没抓到时 ok=false，但结构完整', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) return jin10([]);
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    const out = await getEvents({ force: true });
    expect(out.ok).toBe(false);
    expect(out.total).toBe(0);
    expect(out.items).toEqual([]);
    expect(out.topics.length).toBeGreaterThan(5);
    expect(out.counts).toEqual({ high: 0, mid: 0, low: 0 });
  });
});

/* ------------------------------ 缓存与 LLM ------------------------------ */

describe('getEvents：缓存与 LLM 复核', () => {
  it('缓存期内不重抓；force 才重抓', async () => {
    const a = await getEvents({ force: true });
    const calls = fetchRaw.mock.calls.length;
    const b = await getEvents();
    expect(b).toBe(a);
    expect(fetchRaw.mock.calls.length).toBe(calls);
    const c = await getEvents({ force: true });
    expect(c).not.toBe(a);
  });

  it('未配置凭据时 llm.enabled=false，事件仍正常返回', async () => {
    const out = await getEvents({ force: true });
    expect(out.llm.enabled).toBe(false);
  });

  it('配置凭据后后台复核结果会在下一次轮询覆盖关键词判定', async () => {
    process.env.LLM_API_KEY = 'k-test';
    process.env.LLM_BASE_URL = 'https://llm.test/v1';
    process.env.LLM_MODEL = 'm-test';
    fetchRaw.mockImplementation(async (url, opts) => {
      if (url.endsWith('/chat/completions')) {
        const content = JSON.stringify([
          { i: 1, topics: ['货币政策'], level: 'high', symbols: ['wti', '美债'], region: 'us' },
        ]);
        return JSON.stringify({ data: { choices: [{ message: { content } }] } });
      }
      if (url.includes('jin10')) {
        return jin10([{ id: 'j1', time: '2026-10-26 10:00:00', data: { title: '美联储宣布降息', content: '利率下调' } }]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });

    vi.useFakeTimers();
    const first = await getEvents({ force: true });
    expect(first.llm.enabled).toBe(true);
    // 后台分类 + 3 秒 debounce 落盘，一次推进把两者都冲掉
    await vi.advanceTimersByTimeAsync(3200);

    const second = await getEvents();
    expect(second.llm.applied).toBe(1);
    const it = second.items[0];
    expect(it.llm).toBe(true);
    expect(it.level).toBe('high');
    // 别名归一：wti → oil，美债 → us10y
    expect(it.symbols).toEqual(expect.arrayContaining(['oil', 'us10y']));
    expect(it.region).toBe('us');
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20));
  });
});

/* ------------------------------ 分类与 LLM 细化 ------------------------------ */

describe('classify：主/次主题与影响词加权', () => {
  it('一条稿命中多个主题时主主题取权重最大者，其余按 0.35 计入 rawScore', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) {
        return jin10([
          { id: 'multi', time: '2026-10-26 10:00:00', important: 1, data: { title: '美联储降息，原油价格大涨' } },
        ]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    const out = await getEvents({ force: true });
    const it = out.items[0];
    expect(it.topics.map((t) => t.key)).toEqual(expect.arrayContaining(['fed', 'energy']));
    // 主主题（货币政策，权重 3）在标题里，另有次主题与影响词 → 分数高于单独主主题
    expect(it.score).toBeGreaterThan(3);
    expect(it.level).toBe('high');
  });

  it('只在正文命中时权重打七折，等级降到 mid', async () => {
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) {
        return jin10([
          { id: 'body', time: '2026-10-26 10:00:00', data: { title: '隔夜市场动态', content: '美联储宣布降息' } },
        ]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    const out = await getEvents({ force: true });
    const it = out.items[0];
    expect(it.topics[0]).toMatchObject({ key: 'fed', strong: false });
    expect(it.level).toBe('mid');
  });
});

describe('LLM 复核：别名归一、坏输出兜底与落盘', () => {
  it('别名/无关主题/越界索引都被安全处理，debounce 后写入 kv', async () => {
    vi.useFakeTimers();
    process.env.LLM_API_KEY = 'k-test';
    process.env.LLM_BASE_URL = 'https://llm.test/v1';
    process.env.LLM_MODEL = 'm-test';

    fetchRaw.mockImplementation(async (url) => {
      if (url.endsWith('/chat/completions')) {
        const content = JSON.stringify([
          { i: 1, topics: ['原油供应', '不存在主题', '无关'], level: 'mid', symbols: ['比特币', 'xx'], region: 'emea' },
          { i: 99, topics: ['货币政策'], level: 'high' },
          { i: 'x', topics: ['货币政策'], level: 'high' },
        ]);
        return JSON.stringify({ choices: [{ message: { content } }] });
      }
      if (url.includes('jin10')) {
        return jin10([{ id: 'l1', time: '2026-10-26 10:00:00', data: { title: '美联储降息' } }]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });

    const first = await getEvents({ force: true });
    expect(first.llm.enabled).toBe(true);
    // 后台分类 + 3 秒 debounce 落盘
    await vi.advanceTimersByTimeAsync(4000);
    expect(kvSetJson).toHaveBeenCalledWith('llm-cache', expect.any(Object));

    const second = await getEvents();
    const it = second.items[0];
    expect(it.llm).toBe(true);
    expect(it.level).toBe('mid'); // 非法 region 被丢弃，但等级来自 LLM
    // 原油供应 → energy；不存在主题/无关丢弃；比特币 → btc；xx 丢弃
    expect(it.topics.map((t) => t.key)).toEqual(['energy']);
    expect(it.symbols).toEqual(expect.arrayContaining(['btc']));
    expect(it.region).not.toBe('emea');
    // 越界/非整数索引不影响整批：只写入 1 条
    expect(second.llm.applied).toBe(1);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20)); // 冲掉未 await 的归档
  });

  it('不可解析的输出会重试一次（1.5s 退避），全部失败时记 lastError', async () => {
    vi.useFakeTimers();
    process.env.LLM_API_KEY = 'k-test';
    process.env.LLM_BASE_URL = 'https://llm.test/v1';
    process.env.LLM_MODEL = 'm-test';

    let chatCalls = 0;
    fetchRaw.mockImplementation(async (url) => {
      if (url.endsWith('/chat/completions')) {
        chatCalls += 1;
        if (chatCalls === 1) return JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] });
        // 第二次仍然坏：没有数组、也抠不出对象 → 抛出可读错误
        return JSON.stringify({ choices: [{ message: { content: 'still bad' } }] });
      }
      if (url.includes('jin10')) {
        return jin10([{ id: 'bad1', time: '2026-10-26 10:05:00', data: { title: '美联储降息' } }]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });

    await getEvents({ force: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(chatCalls).toBe(2);
    const after = await getEvents();
    expect(after.llm.lastError).toMatch(/LLM 未返回可解析的 JSON/);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20));
  });

  it('数组被截断时逐个抠出完整对象，不浪费这一批请求', async () => {
    vi.useFakeTimers();
    process.env.LLM_API_KEY = 'k-test';
    process.env.LLM_BASE_URL = 'https://llm.test/v1';
    process.env.LLM_MODEL = 'm-test';

    fetchRaw.mockImplementation(async (url) => {
      if (url.endsWith('/chat/completions')) {
        // 没有外层 []，只有两个独立对象
        const content = '说明 {"i":1,"topics":["货币政策"],"level":"high"} 还有 {"i":2,"topics":["能源"],"level":"low"}';
        return JSON.stringify({ data: { choices: [{ message: { content } }] } });
      }
      if (url.includes('jin10')) {
        return jin10([
          { id: 'p1', time: '2026-10-26 10:06:00', data: { title: '美联储降息' } },
          { id: 'p2', time: '2026-10-26 10:07:00', data: { title: 'OPEC 减产' } },
        ]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });

    await getEvents({ force: true });
    await vi.advanceTimersByTimeAsync(100);
    const second = await getEvents();
    expect(second.llm.applied).toBe(2);
    expect(second.items.map((i) => i.llm)).toEqual([true, true]);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20));
  });

  it('全球源在 3 分钟窗口内复用缓存（即使事件缓存已过期）', async () => {
    vi.useFakeTimers();
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) return jin10([]);
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    fetchFeedCatalog.mockResolvedValue({ items: [], status: [] });

    await getEvents({ force: true });
    const before = fetchFeedCatalog.mock.calls.length;
    // 25 秒事件缓存过期，但全球源 180 秒缓存仍有效
    await vi.advanceTimersByTimeAsync(30_000);
    await getEvents();
    expect(fetchFeedCatalog.mock.calls.length).toBe(before);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20));
  });
});

/* ------------------------------ 归档 ------------------------------ */

describe('archiveEvents：按天追加、同日去重、失败不影响主流程', () => {
  const item = (id, extra = {}) => ({
    id,
    time: '2026-10-26 10:00:00',
    source: '金十数据',
    title: `事件${id}`,
    body: '正文',
    url: 'https://x.test/a',
    level: 'high',
    topics: [{ key: 'fed', label: '货币政策' }],
    symbols: ['us10y'],
    region: 'us',
    ...extra,
  });

  it('只追加当天未见过的 id，并清洗 url / 截断正文', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-05T10:00:00+08:00'));
    readJsonlField.mockResolvedValue(new Set(['old']));
    await archiveEvents([item('old'), item('new', { body: 'x'.repeat(500), url: 'javascript:alert(1)' })]);
    expect(appendJsonl).toHaveBeenCalledTimes(1);
    const [file, rows] = appendJsonl.mock.calls[0];
    expect(file.endsWith('.jsonl')).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'new', url: null, level: 'high', topics: ['货币政策'] });
    expect(rows[0].body).toHaveLength(300);
  });

  it('没有新 id 时不写盘', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-06T10:00:00+08:00'));
    readJsonlField.mockResolvedValue(new Set(['a']));
    await archiveEvents([item('a')]);
    expect(appendJsonl).not.toHaveBeenCalled();
  });

  it('写盘失败只记日志，不抛给调用方', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-07T10:00:00+08:00'));
    readJsonlField.mockResolvedValue(new Set());
    appendJsonl.mockRejectedValue(new Error('disk full'));
    const realError = console.error;
    const logs = [];
    console.error = (...a) => logs.push(a.join(' '));
    await expect(archiveEvents([item('a')])).resolves.toBeUndefined();
    console.error = realError;
    expect(logs.join('\n')).toMatch(/事件归档失败.*disk full/);
  });
});

describe('loadLlmStore：重启后恢复 7 天内的分类缓存', () => {
  it('丢弃过期与非对象条目，并打日志', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-26T00:00:00Z'));
    kvGetJson.mockReturnValue({
      fresh: { topics: [], level: 'high', at: Date.parse('2026-10-25T00:00:00Z') },
      stale: { topics: [], level: 'high', at: Date.parse('2026-10-01T00:00:00Z') },
      bad: 'nope',
    });
    const logs = [];
    const realLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    await loadLlmStore();
    console.log = realLog;
    nowSpy.mockRestore();
    expect(logs.join('\n')).toMatch(/恢复 1 条/);
  });

  it('没有缓存 / 读取异常都不抛', async () => {
    kvGetJson.mockReturnValue(null);
    await expect(loadLlmStore()).resolves.toBeUndefined();
    kvGetJson.mockImplementation(() => {
      throw new Error('db closed');
    });
    const realWarn = console.warn;
    const warns = [];
    console.warn = (...a) => warns.push(a.join(' '));
    await expect(loadLlmStore()).resolves.toBeUndefined();
    console.warn = realWarn;
    expect(warns.join('\n')).toMatch(/LLM 缓存恢复失败.*db closed/);
  });
});

/* ------------------------------ 24h 回放 ------------------------------ */

describe('getEventHistory：归档 + 实时合并', () => {
  it('读两份按北京日期命名的归档，hours 夹在 1~72', async () => {
    const now = Date.parse('2026-10-26T12:00:00+08:00');
    readJsonl.mockResolvedValue([
      { id: 'a', time: '2026-10-26 10:00:00', title: '美联储降息', level: 'high', topics: ['货币政策'], symbols: [], region: 'us' },
      { id: 'b', time: '2026-10-25 23:00:00', title: '原油上涨', level: 'mid', topics: ['能源'], symbols: [] },
    ]);
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) return jin10([]);
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });

    await getEvents({ force: true }); // 先把实时快照刷成空，避免上一条用例的缓存混进来
    const out = await getEventHistory({ hours: 999, nowMs: now });
    expect(out.ok).toBe(true);
    expect(out.hours).toBe(72);
    expect(readJsonl).toHaveBeenCalledTimes(2);
    expect(out.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(out.count).toBe(2);
    expect(out.coverageFrom).toBe(new Date(eventTimeMs('2026-10-25 23:00:00')).toISOString());
    // 归档 topics 还原成 {key,label}
    expect(out.items.find((i) => i.id === 'a').topics[0]).toEqual({ key: 'fed', label: '货币政策', strong: false });
  });

  it('实时快照与归档按 id 合并，实时那份覆盖归档', async () => {
    const now = Date.parse('2026-10-26T12:00:00+08:00');
    readJsonl.mockResolvedValue([
      { id: 'jin10:same', time: '2026-10-26 09:00:00', title: '旧标题', level: 'low', topics: ['能源'], symbols: [] },
    ]);
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) {
        return jin10([{ id: 'same', time: '2026-10-26 09:00:00', important: 1, data: { title: '美联储宣布降息' } }]);
      }
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    await getEvents({ force: true });
    const out = await getEventHistory({ hours: 24, nowMs: now });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ id: 'jin10:same', title: '美联储宣布降息', level: 'high' });
  });

  it('hours 非法时按 24 小时处理', async () => {
    const now = Date.parse('2026-10-26T12:00:00+08:00');
    readJsonl.mockResolvedValue([]);
    fetchRaw.mockImplementation(async (url) => {
      if (url.includes('jin10')) return jin10([]);
      if (url.includes('zhibo.sina')) return sinaFeed([]);
      return wscn([]);
    });
    await getEvents({ force: true });
    const out = await getEventHistory({ hours: 'nope', nowMs: now });
    expect(out.hours).toBe(24);
    expect(out.count).toBe(0);
    expect(out.coverageFrom).toBeNull();
  });
});
