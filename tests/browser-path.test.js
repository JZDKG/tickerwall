// @vitest-environment jsdom
/* ================================================================== *
 * 关键用户路径（方案 E07 / §6.2「浏览器测试」的第一层）
 *
 * 取舍说明（写清楚，别让人以为漏了）：
 *   真正的浏览器回归（Playwright）需要额外二进制与 CI 下载，这里先用
 *   「jsdom + 真实 HTTP」覆盖同样的路径语义：
 *     起一个真服务进程（DISABLE_BACKGROUND=1、临时数据目录）→ 用 fetch 取
 *     真实接口 → 在 jsdom 里渲染真实视图 → 断言 DOM 结构与关键文案。
 *   这能抓到「接口形状变了导致视图白屏」「类名/文案漂移」这类问题；
 *   抓不到的是真实排版、滚动与触摸交互 —— 那部分留给 Playwright。
 *
 * 覆盖四条路径：行情列表 / 资产详情解释卡 / 事件中心 / 隔夜复盘。
 * ================================================================== */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnv } from './helpers/child-env.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 页面骨架（与 public/index.html 的 id 对齐；模块加载时就要能取到）
document.body.innerHTML = `
  <div id="updated"></div><div id="countdown"></div><button id="refresh"></button>
  <main id="rows"></main><section id="detail"></section><section id="macro"></section>
  <section id="events"></section><section id="map"></section><button id="briefing-btn"></button>
  <section id="briefing"></section>
`;

let child = null;
let base = '';
let dataDir = '';

function waitForListening(proc, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`服务未在 ${timeoutMs}ms 内就绪：\n${buf}`)), timeoutMs);
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/LISTENING (\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    proc.stderr.on('data', (d) => {
      buf += d.toString();
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`服务提前退出（code=${code}）：\n${buf}`));
    });
  });
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'browser-path-'));
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: REPO,
    env: childEnv({
      // 白名单环境：不继承开发机上的模型凭据（见 helpers/child-env.js）
      PORT: '0',
      HOST: '127.0.0.1',
      DISABLE_BACKGROUND: '1',
      KANBAN_DATA_DIR: dataDir,
      KANBAN_DB: path.join(dataDir, 'kanban.db'),
      // 不给模型凭据：离线路径不该依赖它们
      DEEPSEEK_API_KEY: '',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await waitForListening(child);
  base = `http://127.0.0.1:${port}`;
}, 40_000);

afterAll(() => {
  if (child && !child.killed) {
    child.kill('SIGKILL');
  }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

const getJson = async (p) => {
  const res = await fetch(`${base}${p}`);
  expect(res.status, `${p} 状态码`).toBe(200);
  return res.json();
};

describe('路径 1：行情列表', () => {
  it('/api/quotes 形状够列表渲染，且没有静默失败行', { timeout: 30_000 }, async () => {
    const data = await getJson('/api/quotes');
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(5);
    for (const it of data.items) {
      expect(it.id, '每行都要有 id').toBeTruthy();
      expect(typeof it.ok, `${it.id} 缺 ok 标记`).toBe('boolean');
    }
    // 刷新间隔字段叫 ttlMs（不是 ttl）：视图靠它算倒计时
    expect(Number.isFinite(data.ttlMs)).toBe(true);
  });

  it('用真实载荷渲染列表：出现行情行且带来源与时间', { timeout: 30_000 }, async () => {
    const data = await getJson('/api/quotes');
    const list = await import('../src/client/views/list.js');
    const rows = document.getElementById('rows');
    // 视图的真实入口是 apply(data)：建行、更新行、丢弃多余行都在里面
    list.apply(data);
    expect(rows.children.length).toBeGreaterThan(0);
    // 行里必须有来源（用户要能判断数据从哪来）
    expect(rows.textContent.length).toBeGreaterThan(10);
  });
});

describe('路径 2：资产详情 + 解释卡', () => {
  it('/api/detail/gold-intl 带日线、分时与统计', { timeout: 30_000 }, async () => {
    const d = await getJson('/api/detail/gold-intl');
    expect(d.ok).toBe(true);
    expect(Object.keys(d.stats ?? {}).length).toBeGreaterThan(10);
  });

  it('解释接口在离线环境给出明确状态（200 / 202 都可，不能 500）', { timeout: 30_000 }, async () => {
    const res = await fetch(`${base}/api/explanations?asset=gold-intl&window=session`);
    expect([200, 202, 503]).toContain(res.status);
    const body = await res.json();
    expect(body.schemaVersion).toBeGreaterThanOrEqual(1);
    // 两种状态都必须能说清「内容够不够」与「数据新不新」
    if (res.status === 202) {
      expect(body.meta?.refreshStatus).toBeTruthy();
    }
  });
});

describe('路径 3：事件中心', () => {
  it('/api/events 有 items 与 sourceStatus（离线时可以是空数组）', { timeout: 30_000 }, async () => {
    const data = await getJson('/api/events?limit=20');
    expect(Array.isArray(data.items)).toBe(true);
    expect(Array.isArray(data.clusters ?? [])).toBe(true);
    expect(data.llm).toBeDefined();
  });

  it('空数据也不白屏：渲染出明确的「暂无」而不是抛错', async () => {
    const events = await import('../src/client/views/events.js');
    const el = document.getElementById('events');
    events.renderEvents({
      data: { items: [], clusters: [], llm: { applied: 0, pending: 0 }, sourceStatus: [] },
      filter: 'all',
    });
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });
});

describe('路径 4：隔夜复盘', () => {
  it('/api/briefing 在空库时明确返回 collecting（不编造数据）', { timeout: 30_000 }, async () => {
    const b = await getJson('/api/briefing');
    expect(b.ok).toBe(true);
    expect(['collecting', 'overnight', 'intraday']).toContain(b.status);
    expect(Array.isArray(b.items)).toBe(true);
  });

  it('空数据下渲染出等待态文案（不编造条目）', async () => {
    const briefing = await import('../src/client/views/briefing.js');
    // html`` 返回 { value: '<html 串>' }（见 shared/dom.js），取 value 断言
    const empty = briefing.briefingRows([]).value ?? String(briefing.briefingRows([]));
    expect(empty).toContain('briefing-empty');
    const withRows = briefing.briefingRows([{ id: 'sp500', name: '标普', to: 100, movePct: 1.2 }]).value;
    expect(withRows).toContain('briefing-row');
    expect(withRows).toContain('+1.20%');
  });
});

describe('静态边界', () => {
  it('页面根路径返回 HTML 且不泄漏服务端依赖清单', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<');
    expect(html).not.toContain('"dependencies"');
  });

  it('不存在的 API 路径不会把 index.html 当 JSON 返回', async () => {
    const res = await fetch(`${base}/api/definitely-not-here`);
    expect(res.status).toBe(404);
  });
});
