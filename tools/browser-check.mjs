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
      const q = document.getElementById('questions');
      const qDisclosure = q?.querySelector('details.q-disclosure');
      const tasks = document.getElementById('tasks');
      const group = document.querySelector('.task-group');
      const sessionPills = [...document.querySelectorAll('#rows .session-pill')].filter((el) => !el.hidden);
      const sessionBtns = [...document.querySelectorAll('#ws-bar [data-ws-session]')];
      return {
        cardCount: cards.length,
        assets: cards.map((c) => (c.textContent.match(/#?(国际|美元|国内)/) ?? [])[0] ?? ''),
        // 第 88 轮：卡片不再直开 JSON，快照身份改从卡片自身的 data 属性取
        snapshotIds: cards.map((c) => c.getAttribute('data-q-asset')),
        changes: cards.map((c) => (c.textContent.match(/-?\\d+\\.\\d+%/) ?? [])[0] ?? ''),
        rowsTop: rows ? Math.round(rows.getBoundingClientRect().top) : null,
        qTop: q ? Math.round(q.getBoundingClientRect().top) : null,
        density: rows?.dataset?.density ?? null,
        rowsCount: rows ? rows.children.length : 0,
        sessionPillCount: sessionPills.length,
        sessionBtnCount: sessionBtns.length,
        navGap: tasks ? getComputedStyle(tasks).gap : null,
        groupDisplay: group ? getComputedStyle(group).display : null,
        qCollapsed: qDisclosure ? !qDisclosure.open : null,
      };
    })()`);
    const h = home.value ?? {};
    record(h.cardCount === 3, '首页有三张问题卡', `实际 ${h.cardCount}`);
    const uniqSnap = new Set((h.snapshotIds ?? []).filter(Boolean));
    record(uniqSnap.size >= 2, '三张问题卡的快照各不相同（不是同一份克隆）', `${uniqSnap.size} 个不同 id`);
    const uniqChange = new Set((h.changes ?? []).filter(Boolean));
    record(uniqChange.size >= 2, '三张问题卡的涨跌幅各不相同', [...uniqChange].join(' / '));
    record(h.rowsTop != null && h.rowsTop < 450 && h.density === 'wall', '首页首屏直接展示磁贴墙行情', `Y=${h.rowsTop} density=${h.density}`);
    record(h.rowsCount > 10, '行情有预期数量的标的', `${h.rowsCount} 个`);
    record((h.sessionPillCount ?? 0) >= 10 && (h.sessionBtnCount ?? 0) === 3, '首页展示交易状态标签与开闭市筛选', `pills=${h.sessionPillCount} btns=${h.sessionBtnCount}`);
    record(h.qCollapsed === true && (h.qTop ?? 0) > (h.rowsTop ?? 0), '问题解读取代突兀横幅，下沉到行情下方且默认收起', `qCollapsed=${h.qCollapsed} rowsY=${h.rowsTop} qY=${h.qTop}`);
    // gap 可能是 "14px" 或 "8px 14px"（row-gap / column-gap），只要含 14px 即说明 app.css 生效
    const gapOk = String(h.navGap ?? '').includes('14px');
    record(gapOk && h.groupDisplay === 'flex', '导航样式生效（app.css 已加载）', `gap=${h.navGap} display=${h.groupDisplay}`);

    /* ---------------- 独立 #/watch（今天重点）视图 ---------------- */
    await cdp.send('Page.navigate', { url: `${base}/#/watch` });
    await waitForCondition(
      () => cdp.evaluate(`Boolean(document.querySelector('#watch:not([hidden]) .watch-pinned-block') && document.querySelector('#watch-focus-slot .tf-card'))`),
      { timeoutMs: 20000 },
    );
    const watchRes = await cdp.evaluate(`(() => {
      const watch = document.getElementById('watch');
      const rows = document.getElementById('rows');
      const briefDet = document.querySelector('#home-brief details');
      return {
        watchVisible: Boolean(watch && !watch.hidden),
        rowsHidden: Boolean(rows && rows.hidden),
        hasPinnedBlock: Boolean(watch?.querySelector('.watch-pinned-block')),
        hasFocusCard: Boolean(watch?.querySelector('#watch-focus-slot .tf-card')),
        briefOpen: briefDet ? briefDet.open : null,
      };
    })()`);
    const w = watchRes.value ?? {};
    record(w.watchVisible && w.rowsHidden && w.hasPinnedBlock && w.hasFocusCard, '今天重点拥有独立 #/watch 页面', JSON.stringify(w));

    /* ---------------- 事件中心：今天重点 ---------------- */
    await cdp.send('Page.navigate', { url: `${base}/#/events` });
    await waitForCondition(
      () => cdp.evaluate(`Boolean(document.querySelector('#today-focus-slot .tf-card'))`),
      { timeoutMs: 20000 },
    );
    const ev = await cdp.evaluate(`(() => {
      const slot = document.getElementById('today-focus-slot');
      const card = slot?.querySelector('.tf-card');
      const row = slot?.querySelector('.tf-row');
      return {
        hasSlot: Boolean(slot),
        count: card?.dataset?.count ?? null,
        text: (slot?.textContent ?? '').slice(0, 40),
        rowDisplay: row ? getComputedStyle(row).display : null,
        nextWhen: slot?.querySelector('.tf-next-when')?.textContent ?? '',
      };
    })()`);
    record(ev.value?.hasSlot === true, '事件中心有今天重点槽位');
    record(Boolean(ev.value?.count), '今天重点槽位不是空的', `count=${ev.value?.count}`);
    // 第 86 轮：样式必须真的生效（曾经只有类名没有规则，呈现为普通文本列表）
    record(ev.value?.rowDisplay === 'grid', '今天重点的行是排过版的（不是纯文本列表）', `display=${ev.value?.rowDisplay}`);
    // 时区必须标注：下一件发布显示 UTC 会与日历差 8 小时
    record(String(ev.value?.nextWhen ?? '').includes('北京时间'), '下一件发布标注北京时间', String(ev.value?.nextWhen ?? '').slice(0, 40));

    // 浅色主题（默认/国际/色盲）事件中心徽章真实渲染对比度 >= 4.5:1
    const evContrast = await cdp.evaluate(`(() => {
      const parseRgba = (str) => {
        const m = String(str ?? '').match(/rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/i);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
      };
      const blendOver = (fg, bg) => {
        const a = fg[3];
        return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
      };
      const lum = ([r, g, b]) => {
        const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const cr = (fg, bg) => {
        const l1 = lum(fg); const l2 = lum(bg);
        return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
      };
      const effectiveBg = (el) => {
        const layers = [];
        for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
          const bg = parseRgba(getComputedStyle(cur).backgroundColor);
          if (bg && bg[3] > 0) layers.push(bg);
        }
        let base = [245, 247, 250];
        for (let i = layers.length - 1; i >= 0; i -= 1) base = blendOver(layers[i], base);
        return base;
      };
      const prevTheme = document.documentElement.getAttribute('data-theme');
      const prevScheme = document.documentElement.getAttribute('data-color-scheme');
      const results = [];
      for (const scheme of [null, 'intl', 'cb']) {
        document.documentElement.setAttribute('data-theme', 'light');
        if (scheme) document.documentElement.setAttribute('data-color-scheme', scheme);
        else document.documentElement.removeAttribute('data-color-scheme');
        for (const sel of ['.cal-kind.k-fomc', '.cal-kind.k-cpi', '.cal-kind.k-nfp', '.ev-badge.high', '.ev-badge.mid', '.ev-topic.strong']) {
          const el = document.querySelector('#events ' + sel);
          if (!el) continue;
          const fg = parseRgba(getComputedStyle(el).color);
          const bg = effectiveBg(el);
          if (fg) results.push({ scheme: scheme || 'cn', sel, cr: cr(fg, bg) });
        }
      }
      if (prevTheme) document.documentElement.setAttribute('data-theme', prevTheme);
      else document.documentElement.removeAttribute('data-theme');
      if (prevScheme) document.documentElement.setAttribute('data-color-scheme', prevScheme);
      else document.documentElement.removeAttribute('data-color-scheme');
      const minCr = results.reduce((m, r) => Math.min(m, r.cr), Infinity);
      return { count: results.length, minCr, worst: results.find((r) => r.cr === minCr) ?? null };
    })()`);
    record(
      (evContrast.value?.count ?? 0) >= 6 && (evContrast.value?.minCr ?? 0) >= 4.5,
      '浅色主题事件徽章对比度（默认/intl/cb）满足 AA (>=4.5)',
      `n=${evContrast.value?.count} min=${evContrast.value?.minCr} worst=${evContrast.value?.worst?.scheme}:${evContrast.value?.worst?.sel}`,
    );

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

    /* ---------------- 地图页 & 宏观图谱（含浅色对比度） ---------------- */
    await cdp.send('Page.navigate', { url: `${base}/#/map` });
    await waitForCondition(
      () => cdp.evaluate(`(() => { const m = document.getElementById('map'); return Boolean(m && !m.hidden && m.querySelector('svg, canvas') && m.querySelector('.mc-risk')); })()`),
      { timeoutMs: 25000 },
    );
    const mapRes = await cdp.evaluate(`(() => {
      const m = document.getElementById('map');
      const parseRgba = (str) => {
        const x = String(str ?? '').match(/rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/i);
        return x ? [Number(x[1]), Number(x[2]), Number(x[3]), x[4] === undefined ? 1 : Number(x[4])] : null;
      };
      const blendOver = (fg, bg) => {
        const a = fg[3];
        return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
      };
      const lum = ([r, g, b]) => {
        const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const cr = (fg, bg) => {
        const l1 = lum(fg); const l2 = lum(bg);
        return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
      };
      const effectiveBg = (el) => {
        const layers = [];
        for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
          const bg = parseRgba(getComputedStyle(cur).backgroundColor);
          if (bg && bg[3] > 0) layers.push(bg);
        }
        let base = [245, 247, 250];
        for (let i = layers.length - 1; i >= 0; i -= 1) base = blendOver(layers[i], base);
        return base;
      };
      const prevTheme = document.documentElement.getAttribute('data-theme');
      const prevScheme = document.documentElement.getAttribute('data-color-scheme');
      let minRiskCr = Infinity;
      let riskCount = 0;
      const riskEl = m?.querySelector('.mc-risk');
      if (riskEl) {
        const origCls = riskEl.className;
        for (const cls of ['mc-risk up', 'mc-risk down', 'mc-risk flat']) {
          riskEl.className = cls;
          for (const scheme of [null, 'intl', 'cb']) {
            document.documentElement.setAttribute('data-theme', 'light');
            if (scheme) document.documentElement.setAttribute('data-color-scheme', scheme);
            else document.documentElement.removeAttribute('data-color-scheme');
            const fg = parseRgba(getComputedStyle(riskEl).color);
            if (fg) {
              minRiskCr = Math.min(minRiskCr, cr(fg, effectiveBg(riskEl)));
              riskCount += 1;
            }
          }
        }
        riskEl.className = origCls;
      }
      if (prevTheme) document.documentElement.setAttribute('data-theme', prevTheme);
      else document.documentElement.removeAttribute('data-theme');
      if (prevScheme) document.documentElement.setAttribute('data-color-scheme', prevScheme);
      else document.documentElement.removeAttribute('data-color-scheme');
      return {
        visible: Boolean(m && !m.hidden),
        hasCanvasOrSvg: Boolean(m?.querySelector('svg, canvas')),
        pulseRings: m?.querySelectorAll('.city-halo, .rg-pulse').length ?? 0,
        riskCount,
        minRiskCr: Number.isFinite(minRiskCr) ? minRiskCr : null,
      };
    })()`);
    record(Boolean(mapRes.value?.visible && mapRes.value?.hasCanvasOrSvg), '全球冲击地图渲染正常');
    record((mapRes.value?.pulseRings ?? -1) === 0, '全球地图无定时循环红绿脉冲圆环', `pulseRings=${mapRes.value?.pulseRings}`);
    record(
      (mapRes.value?.riskCount ?? 0) >= 3 && (mapRes.value?.minRiskCr ?? 0) >= 4.5,
      '浅色主题地图胶囊 .mc-risk（up/down/flat × cn/intl/cb）满足 AA (>=4.5)',
      `n=${mapRes.value?.riskCount} min=${mapRes.value?.minRiskCr}`,
    );

    await cdp.send('Page.navigate', { url: `${base}/#/macro` });
    await waitForCondition(
      () => cdp.evaluate(`document.querySelectorAll('#macro .mgx-card').length >= 4`),
      { timeoutMs: 25000 },
    );
    const macroRes = await cdp.evaluate(`(() => {
      const parseRgb = (str) => {
        const m = String(str ?? '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
      };
      const lum = ([r, g, b]) => {
        const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const cr = (fg, bg) => {
        const a = parseRgb(fg); const b = parseRgb(bg);
        if (!a || !b) return null;
        const l1 = lum(a); const l2 = lum(b);
        return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
      };
      const measureTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        const bodyCs = getComputedStyle(document.body);
        const mutedProbe = document.querySelector('#macro .mgx-zone, #macro .mgx-sub');
        const card = document.querySelector('#macro .mgx-card');
        return {
          bodyCr: cr(bodyCs.color, bodyCs.backgroundColor),
          mutedCr: mutedProbe && card ? cr(getComputedStyle(mutedProbe).color, getComputedStyle(card).backgroundColor) : null,
        };
      };
      const prev = document.documentElement.getAttribute('data-theme') || 'dark';
      const dark = measureTheme('dark');
      const light = measureTheme('light');
      document.documentElement.setAttribute('data-theme', prev);
      return {
        cards: document.querySelectorAll('#macro .mgx-card').length,
        hasX6: Boolean(document.querySelector('#macro .mg-x6')),
        hasTodayOverview: Boolean(document.querySelector('#macro .macro-today-section')),
        impactCardCount: document.querySelectorAll('#macro .macro-impact-card').length,
        statsCollapsed: (() => { const d = document.querySelector('#macro details.macro-stats-disclosure'); return d ? !d.open : null; })(),
        dark,
        light,
      };
    })()`);
    const m = macroRes.value ?? {};
    record(m.hasX6 && (m.cards ?? 0) >= 4, '宏观图谱 X6 节点挂载完成', `${m.cards ?? 0} 张节点卡`);
    record(m.hasTodayOverview && (m.impactCardCount ?? 0) >= 4 && m.statsCollapsed === true, '关联分析顶部展示通俗联动全景，专业统计四表默认折叠', `impacts=${m.impactCardCount} statsCollapsed=${m.statsCollapsed}`);
    record((m.dark?.bodyCr ?? 0) >= 7 && (m.light?.bodyCr ?? 0) >= 7, '深/浅色正文对比度达到 AAA', `dark=${m.dark?.bodyCr} light=${m.light?.bodyCr}`);
    record((m.dark?.mutedCr ?? 0) >= 4.5 && (m.light?.mutedCr ?? 0) >= 4.5, '深/浅色图谱卡片次级文案满足 AA (>=4.5)', `dark=${m.dark?.mutedCr} light=${m.light?.mutedCr}`);

    /* ---------------- 交互：隔夜复盘、命令面板 <dialog>、预警面板 ---------------- */
    await cdp.send('Page.navigate', { url: `${base}/` });
    await waitForCondition(
      () => cdp.evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('#rows .row[data-dir="up"], #rows .row[data-dir="down"]') && document.getElementById('cmd-palette-btn') && document.getElementById('alerts-btn'))`),
      { timeoutMs: 20000 },
    );

    // 0. 浅色主题（默认/intl/cb）行内涨跌标签与磁贴墙真实对比度 >= 4.5:1
    const homeContrast = await cdp.evaluate(`(() => {
      const parseRgba = (str) => {
        const m = String(str ?? '').match(/rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/i);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
      };
      const blendOver = (fg, bg) => {
        const a = fg[3];
        return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
      };
      const lum = ([r, g, b]) => {
        const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const cr = (fg, bg) => {
        const l1 = lum(fg); const l2 = lum(bg);
        return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
      };
      const effectiveBg = (el) => {
        const layers = [];
        for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
          const bg = parseRgba(getComputedStyle(cur).backgroundColor);
          if (bg && bg[3] > 0) layers.push(bg);
        }
        let base = [245, 247, 250];
        for (let i = layers.length - 1; i >= 0; i -= 1) base = blendOver(layers[i], base);
        return base;
      };
      const rowsEl = document.getElementById('rows');
      const prevTheme = document.documentElement.getAttribute('data-theme');
      const prevScheme = document.documentElement.getAttribute('data-color-scheme');
      const prevDensity = rowsEl?.dataset?.density ?? null;
      const results = [];
      for (const density of ['grouped', 'wall']) {
        if (rowsEl) rowsEl.dataset.density = density;
        for (const scheme of [null, 'intl', 'cb']) {
          document.documentElement.setAttribute('data-theme', 'light');
          if (scheme) document.documentElement.setAttribute('data-color-scheme', scheme);
          else document.documentElement.removeAttribute('data-color-scheme');
          for (const sel of ['.row[data-dir="up"] .pct', '.row[data-dir="down"] .pct', '.fresh.lv-fresh', '.fresh.lv-delayed', '.fresh.lv-stale']) {
            const el = document.querySelector('#rows ' + sel);
            if (!el) continue;
            const fg = parseRgba(getComputedStyle(el).color);
            const bg = effectiveBg(el);
            if (fg) results.push({ density, scheme: scheme || 'cn', sel, cr: cr(fg, bg) });
          }
        }
      }
      if (prevTheme) document.documentElement.setAttribute('data-theme', prevTheme);
      else document.documentElement.removeAttribute('data-theme');
      if (prevScheme) document.documentElement.setAttribute('data-color-scheme', prevScheme);
      else document.documentElement.removeAttribute('data-color-scheme');
      if (rowsEl) {
        if (prevDensity) rowsEl.dataset.density = prevDensity;
        else delete rowsEl.dataset.density;
      }
      const minCr = results.reduce((m, r) => Math.min(m, r.cr), Infinity);
      return { count: results.length, minCr, worst: results.find((r) => r.cr === minCr) ?? null };
    })()`);
    record(
      (homeContrast.value?.count ?? 0) >= 6 && (homeContrast.value?.minCr ?? 0) >= 4.5,
      '浅色主题行情标签与磁贴墙对比度（默认/intl/cb）满足 AA (>=4.5)',
      `n=${homeContrast.value?.count} min=${homeContrast.value?.minCr} worst=${homeContrast.value?.worst?.density}:${homeContrast.value?.worst?.scheme}:${homeContrast.value?.worst?.sel}`,
    );

    // 1. 隔夜复盘：焦点转入面板 + aria-expanded 同步 + 关闭归还按钮
    await cdp.evaluate(`(() => { const b = document.getElementById('briefing-btn'); b?.focus(); b?.click(); })()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('briefing-panel'))`), { timeoutMs: 10000 });
    const brOpen = await cdp.evaluate(`(() => ({
      expanded: document.getElementById('briefing-btn')?.getAttribute('aria-expanded'),
      activeId: document.activeElement?.id ?? '',
    }))()`);
    await cdp.evaluate(`document.querySelector('#briefing-panel .briefing-close')?.click()`);
    const brClosed = await cdp.evaluate(`(() => ({
      panelGone: !document.getElementById('briefing-panel'),
      expanded: document.getElementById('briefing-btn')?.getAttribute('aria-expanded'),
      activeId: document.activeElement?.id ?? '',
    }))()`);
    record(
      brOpen.value?.expanded === 'true' && brOpen.value?.activeId === 'briefing-panel'
      && brClosed.value?.panelGone && brClosed.value?.expanded === 'false' && brClosed.value?.activeId === 'briefing-btn',
      '隔夜复盘面板焦点转入与关闭归还完整',
      `open=${brOpen.value?.activeId} close=${brClosed.value?.activeId}`,
    );

    // 2. 命令面板：原生 showModal() + 无 html:overflow:hidden + ARIA + 键盘导航 + backdrop 轻触 + Esc 焦点返还
    await cdp.evaluate(`(() => { const b = document.getElementById('cmd-palette-btn'); b?.focus(); b?.click(); })()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('cmd-palette-modal')?.open)`), { timeoutMs: 5000 });
    const cpBefore = await cdp.evaluate(`(() => {
      const dlg = document.getElementById('cmd-palette-modal');
      const inp = document.getElementById('cmd-palette-input');
      const lb = document.getElementById('cmd-palette-listbox');
      const firstOpt = lb?.querySelector('.cp-item');
      const r = dlg?.getBoundingClientRect();
      return {
        isModal: dlg?.matches(':modal') ?? false,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        controls: inp?.getAttribute('aria-controls'),
        active0: inp?.getAttribute('aria-activedescendant'),
        optTabIndex: firstOpt?.getAttribute('tabindex'),
        outX: r && r.left > 16 ? Math.floor(r.left / 2) : Math.ceil((r?.right ?? 100) + 16),
        outY: r && r.top > 16 ? Math.floor(r.top / 2) : Math.floor((r?.top ?? 40) + 12),
      };
    })()`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
    const active1 = await cdp.evaluate(`document.getElementById('cmd-palette-input')?.getAttribute('aria-activedescendant')`);

    const emptyAria = await cdp.evaluate(`(() => {
      const inp = document.getElementById('cmd-palette-input');
      if (!inp) return null;
      inp.value = '不存在的命令xyz';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      const emptyState = {
        hasListbox: Boolean(document.getElementById('cmd-palette-listbox')),
        hasEmptyMsg: Boolean(document.querySelector('#cmd-palette-results .cp-empty')),
        expanded: inp.getAttribute('aria-expanded'),
        hasControls: inp.hasAttribute('aria-controls'),
        hasActive: inp.hasAttribute('aria-activedescendant'),
      };
      inp.value = '';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      const restored = {
        hasListbox: Boolean(document.getElementById('cmd-palette-listbox')),
        expanded: inp.getAttribute('aria-expanded'),
        controls: inp.getAttribute('aria-controls'),
        activeDescendant: inp.getAttribute('aria-activedescendant'),
      };
      return { emptyState, restored };
    })()`);
    record(
      emptyAria.value?.emptyState?.hasListbox === false
      && emptyAria.value?.emptyState?.hasEmptyMsg === true
      && emptyAria.value?.emptyState?.expanded === 'false'
      && emptyAria.value?.emptyState?.hasControls === false
      && emptyAria.value?.emptyState?.hasActive === false
      && emptyAria.value?.restored?.hasListbox === true
      && emptyAria.value?.restored?.expanded === 'true'
      && emptyAria.value?.restored?.controls === 'cmd-palette-listbox'
      && emptyAria.value?.restored?.activeDescendant === 'cp-opt-0',
      '命令面板空结果时清理 ARIA 引用与 aria-expanded，清空搜索后恢复',
      `empty=${JSON.stringify(emptyAria.value?.emptyState)} restored=${JSON.stringify(emptyAria.value?.restored)}`,
    );

    // 真实鼠标点击 backdrop 区域轻触关闭（closedby="any"）
    const outX = cpBefore.value?.outX ?? 6;
    const outY = cpBefore.value?.outY ?? 6;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: outX, y: outY, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: outX, y: outY, button: 'left', clickCount: 1 });
    await waitForCondition(() => cdp.evaluate(`!document.getElementById('cmd-palette-modal')`), { timeoutMs: 3000 });
    const afterBackdrop = await cdp.evaluate(`({ gone: !document.getElementById('cmd-palette-modal'), activeId: document.activeElement?.id ?? '' })`);

    // 再打开测原生 Esc 退场
    await cdp.evaluate(`(() => { const b = document.getElementById('cmd-palette-btn'); b?.focus(); b?.click(); })()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('cmd-palette-modal')?.open)`), { timeoutMs: 3000 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await waitForCondition(() => cdp.evaluate(`!document.getElementById('cmd-palette-modal')`), { timeoutMs: 3000 });
    const afterEsc = await cdp.evaluate(`({ gone: !document.getElementById('cmd-palette-modal'), activeId: document.activeElement?.id ?? '' })`);

    record(
      cpBefore.value?.isModal === true
      && cpBefore.value?.htmlOverflow !== 'hidden'
      && cpBefore.value?.controls === 'cmd-palette-listbox'
      && cpBefore.value?.optTabIndex === '-1'
      && Boolean(active1.value) && active1.value !== cpBefore.value?.active0,
      '命令面板原生模态、无全局 overflow:hidden、ARIA 联动与键盘高亮正常',
      `modal=${cpBefore.value?.isModal} active=${cpBefore.value?.active0}->${active1.value}`,
    );
    record(
      afterBackdrop.value?.gone && afterBackdrop.value?.activeId === 'cmd-palette-btn'
      && afterEsc.value?.gone && afterEsc.value?.activeId === 'cmd-palette-btn',
      '命令面板 backdrop 轻触与原生 Esc 退场并归还焦点',
      `backdrop=${afterBackdrop.value?.activeId} esc=${afterEsc.value?.activeId}`,
    );

    // 3. 预警面板：模态打开、mode 条件显隐、关闭归还焦点
    await cdp.evaluate(`(() => { const b = document.getElementById('alerts-btn'); b?.focus(); b?.click(); })()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('alerts-panel')?.open)`), { timeoutMs: 5000 });
    const alState = await cdp.evaluate(`(() => {
      const dlg = document.getElementById('alerts-panel');
      const isModal = dlg?.matches(':modal') ?? false;
      const modeField = dlg?.querySelector('[data-al-field="mode"]');
      const kind = dlg?.querySelector('[name="kind"]');
      const hiddenBefore = modeField?.hidden ?? null;
      if (kind) {
        kind.value = 'change_pct';
        kind.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const hiddenAfter = modeField?.hidden ?? null;
      dlg?.querySelector('[data-alerts-dismiss]')?.click();
      return {
        isModal,
        hiddenBefore,
        hiddenAfter,
        gone: !document.getElementById('alerts-panel'),
        activeId: document.activeElement?.id ?? '',
      };
    })()`);
    record(
      alState.value?.isModal === true
      && alState.value?.hiddenBefore === true
      && alState.value?.hiddenAfter === false
      && alState.value?.gone
      && alState.value?.activeId === 'alerts-btn',
      '预警面板原生模态、mode 按口径显隐与关闭焦点归还正常',
      `mode=${alState.value?.hiddenBefore}->${alState.value?.hiddenAfter} focus=${alState.value?.activeId}`,
    );

    // 4. 真实浏览器多模态关闭（.cp-close / [data-alerts-dismiss] / [data-cmd-index] / 原生 Esc / [data-share-dismiss]）后补发延迟 SSE 告警横幅
    const triggerDeferredAlert = async () => {
      const beforeRes = await cdp.evaluate(`Number(document.getElementById('alerts-unread')?.textContent || 0)`);
      const prev = Number(beforeRes.value ?? 0);
      await cdp.evaluate(`(async () => {
        await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'evaluate', context: { quotes: [{ id: 'gold-intl', price: 9999, changePct: 1 }] } }),
        });
      })()`);
      await waitForCondition(
        () => cdp.evaluate(`Number(document.getElementById('alerts-unread')?.textContent || 0) > ${prev}`),
        { timeoutMs: 5000 },
      );
    };

    await cdp.evaluate(`(async () => {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'chk_defer_cp', name: '模态延迟校验', kind: 'price', target_id: 'gold-intl', operator: '>', threshold: 1, cooldown_ms: 0 }),
      });
      document.getElementById('cmd-palette-btn')?.click();
    })()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('cmd-palette-modal')?.open)`), { timeoutMs: 3000 });
    await triggerDeferredAlert();
    const cpDeferred = await cdp.evaluate(`(() => {
      const banner = document.getElementById('tw-alert-banner');
      const hiddenWhileOpen = banner ? banner.hidden : null;
      document.querySelector('#cmd-palette-modal .cp-close')?.click();
      return {
        hiddenWhileOpen,
        modalGone: !document.getElementById('cmd-palette-modal'),
        shownAfterClose: Boolean(banner && !banner.hidden && banner.textContent?.includes('模态延迟校验')),
      };
    })()`);

    await cdp.evaluate(`(() => {
      document.querySelector('#tw-alert-banner [data-action="dismiss-alert"]')?.click();
      document.getElementById('alerts-btn')?.click();
    })()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('alerts-panel')?.open)`), { timeoutMs: 3000 });
    await triggerDeferredAlert();
    const alDeferred = await cdp.evaluate(`(() => {
      const banner = document.getElementById('tw-alert-banner');
      const hiddenWhileOpen = banner ? banner.hidden : null;
      document.querySelector('#alerts-panel [data-alerts-dismiss]')?.click();
      return {
        hiddenWhileOpen,
        modalGone: !document.getElementById('alerts-panel'),
        shownAfterClose: Boolean(banner && !banner.hidden && banner.textContent?.includes('模态延迟校验')),
      };
    })()`);

    // 选命令项 [data-cmd-index] 关闭命令面板并补发延迟横幅
    await cdp.evaluate(`(() => {
      document.querySelector('#tw-alert-banner [data-action="dismiss-alert"]')?.click();
      document.getElementById('cmd-palette-btn')?.click();
    })()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('cmd-palette-modal')?.open)`), { timeoutMs: 3000 });
    await triggerDeferredAlert();
    const cmdSelectDeferred = await cdp.evaluate(`(() => {
      const banner = document.getElementById('tw-alert-banner');
      const inp = document.getElementById('cmd-palette-input');
      if (inp) {
        inp.value = '深色';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const hiddenWhileOpen = banner ? banner.hidden : null;
      document.querySelector('#cmd-palette-modal [data-cmd-index="0"]')?.click();
      return {
        hiddenWhileOpen,
        modalGone: !document.getElementById('cmd-palette-modal'),
        shownAfterClose: Boolean(banner && !banner.hidden && banner.textContent?.includes('模态延迟校验')),
      };
    })()`);

    // 原生 Escape 关闭模态并补发延迟横幅（真实用户点击唤起，带 userActivation 供 CloseWatcher 解锁）
    await cdp.evaluate(`document.querySelector('#tw-alert-banner [data-action="dismiss-alert"]')?.click()`);
    const cmdBtnRect = await cdp.evaluate(`(() => {
      const r = document.getElementById('cmd-palette-btn')?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    })()`);
    if (cmdBtnRect.value) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cmdBtnRect.value.x, y: cmdBtnRect.value.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cmdBtnRect.value.x, y: cmdBtnRect.value.y, button: 'left', clickCount: 1 });
    }
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('cmd-palette-modal')?.open)`), { timeoutMs: 3000 });
    await triggerDeferredAlert();
    const escBeforeHidden = await cdp.evaluate(`document.getElementById('tw-alert-banner')?.hidden ?? null`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await waitForCondition(() => cdp.evaluate(`!document.getElementById('cmd-palette-modal') && Boolean(document.getElementById('tw-alert-banner') && !document.getElementById('tw-alert-banner').hidden)`), { timeoutMs: 3000 });
    const escDeferred = await cdp.evaluate(`(() => {
      const banner = document.getElementById('tw-alert-banner');
      return {
        hiddenWhileOpen: ${JSON.stringify(escBeforeHidden.value ?? null)},
        modalGone: !document.getElementById('cmd-palette-modal'),
        shownAfterClose: Boolean(banner && !banner.hidden && banner.textContent?.includes('模态延迟校验')),
      };
    })()`);

    // 分享卡预览 #tw-share-preview 点 [data-share-dismiss] 关闭并补发延迟横幅
    await cdp.evaluate(`(() => {
      document.querySelector('#tw-alert-banner [data-action="dismiss-alert"]')?.click();
      document.getElementById('briefing-btn')?.click();
    })()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.querySelector('#briefing-panel [data-action="share-card"]'))`), { timeoutMs: 5000 });
    await cdp.evaluate(`document.querySelector('#briefing-panel [data-action="share-card"]')?.click()`);
    await waitForCondition(() => cdp.evaluate(`Boolean(document.getElementById('tw-share-preview')?.open)`), { timeoutMs: 3000 });
    await triggerDeferredAlert();
    const shareDeferred = await cdp.evaluate(`(() => {
      const banner = document.getElementById('tw-alert-banner');
      const hiddenWhileOpen = banner ? banner.hidden : null;
      document.querySelector('#tw-share-preview [data-share-dismiss]')?.click();
      const res = {
        hiddenWhileOpen,
        modalGone: !document.getElementById('tw-share-preview'),
        shownAfterClose: Boolean(banner && !banner.hidden && banner.textContent?.includes('模态延迟校验')),
      };
      document.querySelector('#briefing-panel .briefing-close')?.click();
      return res;
    })()`);

    record(
      cpDeferred.value?.hiddenWhileOpen === true && cpDeferred.value?.modalGone === true && cpDeferred.value?.shownAfterClose === true
      && alDeferred.value?.hiddenWhileOpen === true && alDeferred.value?.modalGone === true && alDeferred.value?.shownAfterClose === true
      && cmdSelectDeferred.value?.hiddenWhileOpen === true && cmdSelectDeferred.value?.modalGone === true && cmdSelectDeferred.value?.shownAfterClose === true
      && escDeferred.value?.hiddenWhileOpen === true && escDeferred.value?.modalGone === true && escDeferred.value?.shownAfterClose === true
      && shareDeferred.value?.hiddenWhileOpen === true && shareDeferred.value?.modalGone === true && shareDeferred.value?.shownAfterClose === true,
      '命令面板/预警面板/分享卡在按钮关闭、选命令、原生Esc后同步卸载并补发延迟告警横幅',
      `cp=${cpDeferred.value?.shownAfterClose} al=${alDeferred.value?.shownAfterClose} cmd=${cmdSelectDeferred.value?.shownAfterClose} esc=${escDeferred.value?.shownAfterClose ? 'true' : JSON.stringify(escDeferred.value)} share=${shareDeferred.value?.shownAfterClose}`,
    );

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
