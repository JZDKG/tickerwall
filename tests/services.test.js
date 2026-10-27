/* ================================================================== *
 * 服务层契约测试
 *
 * 两件事：
 *   1. 上游回放层（providers/replay.js）本身要可靠 —— 它是全部等价性验收的地基，
 *      地基不稳，「拆分前后一致」就没有意义。
 *   2. services/ 的分层纪律：不得反向 import server.mjs，且服务之间无环。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFixtures, makeReplayFetcher } from '../src/server/providers/replay.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));

let dir;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'kanban-replay-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const writeFixture = (file, records) => {
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
};
const b64 = (s) => Buffer.from(s).toString('base64');

describe('上游回放：录制文件读取', () => {
  it('按「方法 + URL」建索引，坏行跳过', () => {
    const f = path.join(dir, 'fx.jsonl');
    writeFileSync(
      f,
      [
        JSON.stringify({ key: 'GET https://a.test/1', url: 'https://a.test/1', status: 200, b64: b64('x') }),
        'not json',
        '',
        JSON.stringify({ key: 'GET https://a.test/2', url: 'https://a.test/2', status: 200, b64: b64('y') }),
      ].join('\n'),
      'utf8',
    );
    const m = loadFixtures(f);
    expect([...m.keys()]).toEqual(['GET https://a.test/1', 'GET https://a.test/2']);
  });

  it('文件不存在返回空 Map（不抛）', () => {
    expect(loadFixtures(path.join(dir, 'nope.jsonl')).size).toBe(0);
    expect(loadFixtures(null).size).toBe(0);
  });
});

describe('上游回放：fetcher 行为', () => {
  it('命中时返回录制内容，且能正确解码二进制（gb18030 不被破坏）', async () => {
    const f = path.join(dir, 'fx.jsonl');
    writeFixture(f, [
      { key: 'GET https://a.test/gbk', url: 'https://a.test/gbk', status: 200, b64: Buffer.from([0xc2, 0xd7, 0xb6, 0xd8, 0xbd, 0xf0]).toString('base64') },
    ]);
    const fetcher = makeReplayFetcher({ replay: f });
    const res = await fetcher('https://a.test/gbk');
    expect(res.ok).toBe(true);
    expect(new TextDecoder('gb18030').decode(await res.arrayBuffer())).toBe('伦敦金');
  });

  it('未命中直接抛错，绝不偷偷联网', async () => {
    const f = path.join(dir, 'fx.jsonl');
    writeFixture(f, []);
    let called = false;
    const fetcher = makeReplayFetcher({ replay: f, fallback: async () => { called = true; } });
    await expect(fetcher('https://a.test/missing')).rejects.toThrow('回放缺少响应');
    expect(called, '回放模式不得回退真实网络').toBe(false);
  });

  it('非 2xx 录制也能还原成 ok=false + status', async () => {
    const f = path.join(dir, 'fx.jsonl');
    writeFixture(f, [{ key: 'GET https://a.test/429', url: 'https://a.test/429', status: 429, b64: b64('slow down') }]);
    const res = await makeReplayFetcher({ replay: f })('https://a.test/429');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(await res.text()).toBe('slow down');
  });

  it('录制模式：真实抓取后落盘，且把同样的字节返回给调用方', async () => {
    const f = path.join(dir, 'rec.jsonl');
    const fetcher = makeReplayFetcher({
      record: f,
      fallback: async () => ({
        ok: true,
        status: 200,
        text: async () => 'body',
        arrayBuffer: async () => Buffer.from('body'),
      }),
    });
    const res = await fetcher('https://a.test/rec');
    expect(await res.text()).toBe('body');
    expect(existsSync(f)).toBe(true);
    const fixtures = loadFixtures(f);
    expect(fixtures.get('GET https://a.test/rec').b64).toBe(b64('body'));
    expect(fetcher.stats.recorded).toBe(1);
  });

  it('POST 的键含 body 长度，避免同名不同体互相覆盖', async () => {
    const f = path.join(dir, 'fx2.jsonl');
    writeFixture(f, [
      { key: 'POST https://a.test/p #4', url: 'https://a.test/p', status: 200, b64: b64('short') },
      { key: 'POST https://a.test/p #20', url: 'https://a.test/p', status: 200, b64: b64('longer body here') },
    ]);
    const fetcher = makeReplayFetcher({ replay: f });
    expect(await (await fetcher('https://a.test/p', { method: 'POST', body: 'abcd' })).text()).toBe('short');
    expect(await (await fetcher('https://a.test/p', { method: 'POST', body: 'x'.repeat(20) })).text()).toBe('longer body here');
  });
});

describe('分层：providers/ 的分层纪律', () => {
  const readP = (f) => require('node:fs').readFileSync(path.join(REPO, 'src/server/providers', f), 'utf8');
  const specsP = (code) => [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

  it('providers 不得 import services / server.mjs', () => {
    const bad = [];
    for (const f of ['http.js', 'sina.js', 'cboe.js', 'cnbc.js', 'fred.js', 'daily.js', 'replay.js', 'index.js']) {
      for (const s of specsP(readP(f))) {
        if (/services|server\.mjs|\.\.\/\.\.\/server/.test(s)) bad.push(`${f} → ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('daily.js 零 db 依赖（只抓 + 解析，缓存与落库归调用方）', () => {
    const deps = specsP(readP('daily.js'));
    expect(deps.some((d) => /db\//.test(d)), 'daily.js 不应依赖 db/').toBe(false);
  });

  it('cboe.js 提供运行时适配（cboeIndex 等在模块加载期就会被 INSTRUMENTS 调用）', () => {
    const code = readP('cboe.js');
    for (const name of ['cboeIndexRows', 'cboeIndex', 'fetchCboeIndexDetail', 'fetchCboeVix']) {
      expect(code, `缺 ${name}`).toMatch(new RegExp(`export (async )?function ${name}\\(`));
    }
  });

  it('daily.js 导出 12 个日线源适配器', () => {
    const code = readP('daily.js');
    const names = [...code.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
    expect(names).toHaveLength(12);
    expect(names).toContain('historySourcesFor');
    expect(names).toContain('fetchSinaForexDaily');
  });

  it('搬动过的模块里，用到的 Node 内置符号必须有 import（防静默降级）', () => {
    for (const f of ['daily.js', 'cboe.js', 'replay.js']) {
      const code = readP(f);
      if (code.includes('readFileSync(')) expect(code).toMatch(/import \{[^}]*readFileSync[^}]*\} from 'node:fs'/);
      if (code.includes('appendFileSync(')) expect(code).toMatch(/import \{[^}]*appendFileSync[^}]*\} from 'node:fs'/);
      if (code.includes('path.join(')) expect(code).toMatch(/import path from 'node:path'/);
    }
  });
});

describe('分层：services/ 的依赖纪律', () => {
  const read = (f) => require('node:fs').readFileSync(path.join(REPO, 'src/server/services', f), 'utf8');
  const specs = (code) => [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

  it('服务不得 import server.mjs，也不得 import 前端目录', () => {
    const bad = [];
    for (const f of ['events.service.js']) {
      for (const s of specs(read(f))) {
        if (/server\.mjs|src\/client|\.\.\/\.\.\/public/.test(s)) bad.push(`${f} → ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('events.service 只依赖 providers / db / paths（无服务间循环）', () => {
    const deps = specs(read('events.service.js')).filter((s) => s.startsWith('.'));
    for (const d of deps) {
      expect(d).not.toMatch(/quotes\.service|detail\.service|macro\.service|calendar\.service/);
    }
  });

  it('quotes.service 零同层依赖（服务层的最底层）', () => {
    const deps = specs(read('quotes.service.js')).filter((s) => s.startsWith('.'));
    for (const d of deps) {
      expect(d, 'quotes 是 DAG 的底，不能依赖任何其他服务').not.toMatch(/\w+\.service/);
    }
    expect(deps.some((d) => /domain\/|db\/|providers\/|paths/.test(d))).toBe(true);
  });

  it('服务模块被搬动后仍引用到全部需要的 Node 内置（防止漏 import 被 try/catch 吞掉）', () => {
    for (const f of ['events.service.js', 'quotes.service.js']) {
      const code = read(f);
      if (code.includes('readFileSync(')) expect(code, f).toMatch(/import \{[^}]*readFileSync[^}]*\} from 'node:fs'/);
      if (code.includes('fsp.')) expect(code, f).toMatch(/import fsp from 'node:fs\/promises'/);
      if (code.includes('path.join(') || code.includes('path.dirname(')) expect(code, f).toMatch(/import path from 'node:path'/);
    }
    const code = read('events.service.js');
    // 这几个曾经漏过：漏了不报错，只让 LLM 静默关闭 / 归档静默失败
    if (code.includes('readFileSync(')) expect(code).toMatch(/import \{[^}]*readFileSync[^}]*\} from 'node:fs'/);
    if (code.includes('fsp.')) expect(code).toMatch(/import fsp from 'node:fs\/promises'/);
    if (code.includes('path.join(')) expect(code).toMatch(/import path from 'node:path'/);
  });
});


describe('分层：跨层符号必须导入（防静默降级）', () => {
  const fs = require('node:fs');
  const pathMod = require('node:path');
  const SERVICES = ['events.service.js', 'quotes.service.js', 'detail.service.js', 'macro.service.js', 'calendar.service.js'];

  const exportsOf = (file) => {
    const code = fs.readFileSync(pathMod.join(REPO, file), 'utf8');
    return new Set([
      ...code.matchAll(/export (?:async )?function (\w+)/g),
      ...code.matchAll(/export (?:const|let) (\w+)/g),
    ].map((m) => m[1]));
  };

  const LAYERS = [
    'src/server/domain/market-hours.js',
    'src/server/domain/history-ring.js',
    'src/server/domain/news-lexicon.js',
    'src/server/domain/clock.js',
    'src/server/db/sqlite.js',
    'src/server/db/daily-cache.js',
    'src/server/db/snapshots.js',
    'src/server/db/files.js',
    'src/server/providers/http.js',
    'src/server/providers/sina.js',
    'src/server/providers/cboe.js',
    'src/server/providers/cnbc.js',
    'src/server/providers/fred.js',
    'src/server/providers/daily.js',
    'src/server/providers/news-feeds.js',
    'src/server/stats/distribution.js',
    'src/server/stats/correlation.js',
    'src/server/stats/newey-west.js',
    'src/server/stats/fdr.js',
    'src/server/services/quotes.service.js',
    'src/server/services/macro.service.js',
  ];

  /** 去掉字符串与注释，避免 'eastmoney:xxx' / `cache: x` 这类字面量与对象键造成假阳性 */
  const stripNoise = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');

  it('服务里用到的下层导出符号都出现在 import 列表里', () => {
    const problems = [];
    for (const svc of SERVICES) {
      const raw = fs.readFileSync(pathMod.join(REPO, 'src/server/services', svc), 'utf8');
      const code = stripNoise(raw);

      // 下层符号表：排除目标文件自身（自引用不算缺 import）
      const filePath = `src/server/services/${svc}`;
      const known = new Map();
      for (const f of LAYERS) {
        if (f === filePath) continue;
        for (const n of exportsOf(f)) if (!known.has(n)) known.set(n, f);
      }

      // 本文件自己声明的顶层符号也不算缺 import
      const local = new Set([
        ...[...raw.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)].map((m) => m[1]),
        ...[...raw.matchAll(/^(?:export )?(?:const|let|var) (\w+)/gm)].map((m) => m[1]),
      ]);

      const imported = new Set();
      for (const m of code.matchAll(/import \{([\s\S]*?)\} from/g)) {
        for (const part of m[1].split(',')) {
          const n = part.trim().split(' as ')[0].trim();
          if (n) imported.add(n);
        }
      }

      for (const [name, src] of known) {
        if (imported.has(name) || local.has(name)) continue;
        // 只认变量位置：前面不是 `.`，后面不是 `:`（对象键）
        if (new RegExp(`(^|[^.\\w$])${name}\\b(?!\\s*:)`, 'm').test(code)) {
          problems.push(`${svc}: 用了 ${name}（${src.split('/').pop()}）却没 import`);
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});


describe('分层：五个服务齐全且拓扑单向', () => {
  const fs = require('node:fs');
  const pathMod = require('node:path');
  const read = (f) => fs.readFileSync(pathMod.join(REPO, 'src/server/services', f), 'utf8');
  const deps = (f) => [...read(f).matchAll(/from\s+['"]\.\/([\w.]+)['"]/g)].map((m) => m[1]);

  it('五个服务模块都在', () => {
    for (const f of ['events', 'quotes', 'detail', 'macro', 'calendar']) {
      expect(fs.existsSync(pathMod.join(REPO, 'src/server/services', `${f}.service.js`))).toBe(true);
    }
  });

  it('同层依赖只有两条：detail→quotes、calendar→macro', () => {
    const edges = {
      'events.service.js': [],
      'quotes.service.js': [],
      'detail.service.js': ['quotes.service.js'],
      'macro.service.js': [],
      'calendar.service.js': ['macro.service.js'],
    };
    for (const [f, want] of Object.entries(edges)) {
      expect(deps(f).sort(), `${f} 的同层依赖`).toEqual(want.sort());
    }
  });

  it('500 响应不把 err.message 发给客户端，但必须在服务端留日志', () => {
    const code = fs.readFileSync(pathMod.join(REPO, 'server.mjs'), 'utf8');
    // 对外只能是通用文案
    expect(code).not.toMatch(/sendJson\(res,\s*500,\s*\{[^}]*error:\s*err\?\.message/);
    expect(code).toContain('服务器内部错误');
    // 但不能静默——完整错误得进日志，否则线上无从排查
    expect(code).toMatch(/console\.error\(\s*'\[http\]/);
    // 后台刷新同理：长期失败必须留痕
    expect(code).toMatch(/console\.error\(\s*'\[bg\]/);
  });

  it('入口 server.mjs 收敛成薄壳（< 200 行），只做路由与静态映射', () => {
    const code = fs.readFileSync(pathMod.join(REPO, 'server.mjs'), 'utf8');
    const lines = code.split('\n').length;
    expect(lines).toBeLessThan(200);
    // 业务实现不应再留在入口
    for (const banned of ['function buildDetail', 'function buildMacro', 'function getQuotes(', 'function buildEventStudy']) {
      expect(code.includes(banned), `入口里还有 ${banned}`).toBe(false);
    }
  });
});
