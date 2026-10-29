#!/usr/bin/env node
/* ================================================================== *
 * browser-check —— 真实浏览器回归（方案 E07 的第二层，替代 Playwright）
 *
 * 为什么需要它：本项目修掉的 13 个 bug 里，有 9 个只在真实浏览器里出现
 * （innerHTML 覆盖挂载点、裸字符串转义、参数在生产路径丢失、样式表漏引、
 * 标签闭合错误、容器重建后槽位被清空……）。jsdom 与单元测试全部是绿的。
 *
 * 这个脚本自闭环，不依赖任何外部驱动库：
 *   1. 起一个临时端口的 server.mjs（DISABLE_BACKGROUND=1 + 隔离数据目录）；
 *   2. 调起 headless Chrome（--remote-debugging-port），用 Node 内置 WebSocket 连 CDP；
 *   3. 跑断言：无未捕获异常 / 三张问题卡参数各异 / 导航样式生效 /
 *      今天重点非空 / 行情在首屏 / 详情解释卡 ready；
 *   4. 退出时清理进程与临时目录，输出逐条结果与退出码。
 *
 *   node tools/browser-check.mjs            # 跑全部
 *   node tools/browser-check.mjs --keep     # 失败时保留 Chrome 与临时目录便于排查
 *
 * 退出码：0 全部通过（或显式 SKIP）；1 有断言失败。
 * ================================================================== */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEEP = process.argv.includes('--keep');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 找一个可用的 Chrome/Chromium */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** 等一个 http 地址可用 */
async function waitFor(url, { tries = 60, gap = 250 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(gap);
  }
  return false;
}

/** 最小 CDP 客户端（只用 Runtime/Page/Emulation 三个域） */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  const consoleErrors = [];
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text ?? 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      consoleErrors.push((msg.params.args ?? []).map((a) => a.value ?? a.description).join(' '));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, { resolve });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (out.result?.exceptionDetails) return { error: out.result.exceptionDetails.text ?? 'eval failed' };
    return { value: out.result?.result?.value ?? null };
  };
  return { ws, send, evaluate, exceptions, consoleErrors };
}

/**
 * 轮询直到条件成立（带超时）。
 *
 * 为什么不用固定 sleep：干净数据目录要冷拉上游日历与指标，耗时随网络波动，
 * 实测偶发踩在 6~8 秒临界线上 —— 一旦超时就会误判成「0 张卡 / 槽位为空」，
 * 在 CI 上表现为随机闪红（Flaky）。轮询把「等够时间」换成「等到就继续」，
 * 快的时候更快，慢的时候也不会误判。
 */
async function waitForCondition(evaluateFn, { timeoutMs = 15000, gapMs = 250 } = {}) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    const out = await evaluateFn();
    last = out;
    if (out && out.value) return out;
    await sleep(gapMs);
  }
  return last; // 超时返回最后一次观测，交给断言去判定并打印实际值
}

const findings = [];
const record = (ok, name, detail = '') => {
  findings.push({ ok, name, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('找不到 Chrome/Chromium：设置 CHROME_PATH 指向可执行文件');
    process.exit(1);
  }

  const dataDir = mkdtempSync(join(tmpdir(), 'kanban-browser-data-'));
  const profile = mkdtempSync(join(tmpdir(), 'kanban-browser-profile-'));
  const port = 18600 + Math.floor(Math.random() * 200);
  const cdpPort = 19200 + Math.floor(Math.random() * 200);
  const base = `http://127.0.0.1:${port}`;
  let server = null;
  let browser = null;

  /**
   * 收尾：先等进程真的退出，再删目录。
   *
   * 事故（Ubuntu CI）：`kill('SIGKILL')` 之后立刻 `rmSync`，而 Chrome 还在写
   * profile（SingletonLock / Cache）→ `ENOTEMPTY`，把整个检查拖成红。
   * 本地 macOS 上 Chrome 死得快，恰好没撞上。
   *
   * 三条纪律：
   *   1. 等 exit 事件（带超时），不假设信号立即生效；
   *   2. `rmSync` 给重试退避（`maxRetries/retryDelay`）；
   *   3. **收尾失败不改变结论** —— 它是清理，不是断言。
   */
  const waitExit = (child, timeoutMs = 5000) =>
    new Promise((resolve) => {
      if (!child || child.exitCode != null || child.signalCode != null) return resolve(true);
      const timer = setTimeout(() => resolve(false), timeoutMs);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

  const removeDir = (dir) => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      return true;
    } catch (err) {
      console.log(`（收尾）临时目录未能删除：${err?.code ?? err}`);
      return false;
    }
  };

  const cleanup = async () => {
    if (KEEP) return;
    browser?.kill('SIGKILL');
    server?.kill('SIGKILL');
    await Promise.all([waitExit(browser), waitExit(server)]);
    removeDir(dataDir);
    removeDir(profile);
  };

  try {
    server = spawn(process.execPath, ['server.mjs'], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DISABLE_BACKGROUND: '1', KANBAN_DATA_DIR: dataDir },
      stdio: 'ignore',
    });
    if (!(await waitFor(`${base}/api/health`))) throw new Error(`服务没起来（${base}）`);

    browser = spawn(
      chrome,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    if (!(await waitFor(`http://127.0.0.1:${cdpPort}/json/version`))) throw new Error('Chrome 没起来');

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('没有可用的 page target');

    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 800, deviceScaleFactor: 1, mobile: false });

    /* ---------------- 首页 ---------------- */
    await cdp.send('Page.navigate', { url: `${base}/` });
    // 等到行情有内容（干净目录首拉最慢的是上游序列）再取全量快照
    await waitForCondition(
      () => cdp.evaluate(`(() => { const r = document.getElementById('rows'); return Boolean(r && r.children.length > 3); })()`),
      { timeoutMs: 20000 },
    );
    // 问题卡比行情晚一步（要先有报价才谈「为什么」），单独等
    await waitForCondition(
      () => cdp.evaluate(`document.querySelectorAll('#questions .q-card').length >= 3`),
      { timeoutMs: 20000 },
    );

    const home = await cdp.evaluate(`(() => {
      const cards = [...document.querySelectorAll('#questions .q-card')];
      const rows = document.getElementById('rows');
      const tasks = document.getElementById('tasks');
      const group = document.querySelector('.task-group');
      return {
        cardCount: cards.length,
        assets: cards.map((c) => (c.textContent.match(/#?(国际|美元|国内)/) ?? [])[0] ?? ''),
        snapshotIds: [...document.querySelectorAll('#questions a[href*="explanations/exp_"]')].map((a) => a.getAttribute('href')),
        changes: cards.map((c) => (c.textContent.match(/-?\\d+\\.\\d+%/) ?? [])[0] ?? ''),
        rowsTop: rows ? Math.round(rows.getBoundingClientRect().top) : null,
        rowsCount: rows ? rows.children.length : 0,
        navGap: tasks ? getComputedStyle(tasks).gap : null,
        groupDisplay: group ? getComputedStyle(group).display : null,
        briefCollapsed: (() => { const d = document.querySelector('#home-brief details'); return d ? !d.open : null; })(),
      };
    })()`);
    const h = home.value ?? {};
    record(h.cardCount === 3, '首页有三张问题卡', `实际 ${h.cardCount}`);
    const uniqSnap = new Set((h.snapshotIds ?? []).filter(Boolean));
    record(uniqSnap.size >= 2, '三张问题卡的快照各不相同（不是同一份克隆）', `${uniqSnap.size} 个不同 id`);
    const uniqChange = new Set((h.changes ?? []).filter(Boolean));
    record(uniqChange.size >= 2, '三张问题卡的涨跌幅各不相同', [...uniqChange].join(' / '));
    record(h.rowsTop != null && h.rowsTop < 800, '行情列表进入首屏', `Y=${h.rowsTop}`);
    record(h.rowsCount > 10, '行情有预期数量的标的', `${h.rowsCount} 个`);
    // gap 可能是 "14px" 或 "8px 14px"（row-gap / column-gap），只要含 14px 即说明 app.css 生效
    const gapOk = String(h.navGap ?? '').includes('14px');
    record(gapOk && h.groupDisplay === 'flex', '导航样式生效（app.css 已加载）', `gap=${h.navGap} display=${h.groupDisplay}`);
    record(h.briefCollapsed === true, '关注简报默认折叠（只占一行）', `折叠=${h.briefCollapsed}`);

    /* ---------------- 事件中心：今天重点 ---------------- */
    await cdp.send('Page.navigate', { url: `${base}/#/events` });
    await waitForCondition(
      () => cdp.evaluate(`Boolean(document.querySelector('#today-focus-slot .tf-card'))`),
      { timeoutMs: 20000 },
    );
    const ev = await cdp.evaluate(`(() => {
      const slot = document.getElementById('today-focus-slot');
      const card = slot?.querySelector('.tf-card');
      return { hasSlot: Boolean(slot), count: card?.dataset?.count ?? null, text: (slot?.textContent ?? '').slice(0, 40) };
    })()`);
    record(ev.value?.hasSlot === true, '事件中心有今天重点槽位');
    record(Boolean(ev.value?.count), '今天重点槽位不是空的', `count=${ev.value?.count}`);

    /* ---------------- 详情：解释卡 ---------------- */
    await cdp.send('Page.navigate', { url: `${base}/#/d/gold-intl` });
    await waitForCondition(
      () => cdp.evaluate(`document.querySelector('.explain-card')?.dataset?.phase === 'ready'`),
      { timeoutMs: 25000 },
    );
    const detail = await cdp.evaluate(`(() => {
      const card = document.querySelector('.explain-card');
      return {
        phase: card?.dataset?.phase ?? null,
        factors: document.querySelectorAll('[data-explain-toggle]').length,
        layers: [...new Set([...document.querySelectorAll('.explain-layer b')].map((b) => b.textContent))],
        diff: document.querySelectorAll('[data-explain-diff]').length,
      };
    })()`);
    record(detail.value?.phase === 'ready', '详情解释卡到达 ready（不停在加载中）', `phase=${detail.value?.phase}`);
    record((detail.value?.factors ?? 0) > 0, '渠道可展开', `${detail.value?.factors} 个`);
    record((detail.value?.layers ?? []).includes('事实'), '四层标注可见', (detail.value?.layers ?? []).join('|'));

    record(cdp.exceptions.length === 0, '整轮无未捕获异常', `${cdp.exceptions.length} 个`);
    record(cdp.consoleErrors.length === 0, '整轮无 console.error', `${cdp.consoleErrors.length} 条`);

    cdp.ws.close();
  } catch (err) {
    record(false, '执行过程未抛错', String(err?.message ?? err));
  } finally {
    await cleanup();
  }

  const failed = findings.filter((f) => !f.ok);
  console.log(`\n${findings.length - failed.length}/${findings.length} 通过`);
  if (failed.length) {
    console.error(`失败：${failed.map((f) => f.name).join('、')}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
