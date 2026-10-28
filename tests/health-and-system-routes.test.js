/* ================================================================== *
 * 健康状态与系统自检路由（方案 E08 / §9.3）
 *
 * 健康接口必须能回答三个不同的问题：活着吗、能服务吗、数据/契约有没有坏。
 * 一个 `{ok:true}` 把三者混在一起，就是「进程活着但采集早就死了」的来源。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHealth, checkReadiness } from '../src/server/observability/health.js';
import { handleSystemRoutes } from '../src/server/routes/system.js';

/** 极简 res 桩：记录状态码与 JSON body */
function fakeRes() {
  const out = { status: null, body: null };
  return {
    ...out,
    writeHead(code) {
      this.status = code;
      return this;
    },
    end(text) {
      try {
        this.body = JSON.parse(text);
      } catch {
        this.body = text;
      }
      return this;
    },
    setHeader() {},
  };
}

const call = (pathname, search = '', deps = { ttlMs: 15_000, jobs: () => [{ key: 'quotes', ok: true }] }, method = 'GET') => {
  const res = fakeRes();
  const handled = handleSystemRoutes(new URL(`http://127.0.0.1:8787${pathname}${search}`), res, { ...deps, method });
  return { handled, res };
};

describe('健康状态：三种状态分开', () => {
  it('就绪检查通过时报 ready=true 且没有原因', () => {
    const r = checkReadiness({ dataDir: mkdtempSync(path.join(tmpdir(), 'health-')) });
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('数据目录不可写 → 不就绪，并说清路径', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'health-')), 'not-a-dir');
    writeFileSync(file, 'x');
    const r = checkReadiness({ dataDir: path.join(file, 'sub') });
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toContain('数据目录不可写');
  });

  it('buildHealth 保留旧字段，同时新增就绪 / 契约 / 来源', () => {
    const h = buildHealth({ uptime: 42, ttlMs: 15_000, jobs: [{ key: 'quotes' }], env: {} });
    expect(h.uptime).toBe(42);
    expect(h.ttlMs).toBe(15_000);
    expect(h.jobs).toHaveLength(1);
    // ok 现在表达「就绪」，不是「进程活着」
    expect(typeof h.ok).toBe('boolean');
    expect(h.readiness).toBeDefined();
    expect(h.contracts.compiled).toBeGreaterThanOrEqual(3);
    expect(h.sources.registered).toBeGreaterThan(10);
  });

  it('缺凭据的来源在健康接口里被点名，而不是静默缺席', () => {
    const h = buildHealth({ uptime: 1, ttlMs: 1, jobs: [], env: {} });
    expect(h.sources.unavailable.map((s) => s.id)).toContain('goldapi');
    expect(h.sources.unavailable.find((s) => s.id === 'goldapi').reason).toContain('GOLDAPI_KEY');
  });

  it('凭据配好后该来源不再出现在不可用列表', () => {
    const h = buildHealth({ uptime: 1, ttlMs: 1, jobs: [], env: { GOLDAPI_KEY: 'k' } });
    expect(h.sources.unavailable.map((s) => s.id)).not.toContain('goldapi');
  });
});

describe('系统路由', () => {
  it('/api/health 返回 200 且带就绪与来源信息', () => {
    const { handled, res } = call('/api/health');
    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    expect(res.body.readiness).toBeDefined();
    expect(res.body.jobs).toHaveLength(1);
  });

  it('/api/_market 默认关闭（调试端点不该在生产暴露）', () => {
    const { handled, res } = call('/api/_market');
    expect(handled).toBe(true);
    expect(res.status).toBe(404);
  });

  it('不是它负责的路径返回 false，交回入口继续走静态资源', () => {
    expect(call('/api/quotes').handled).toBe(false);
    expect(call('/vendor/geo-kit.js').handled).toBe(false);
  });
});

describe('调试端点开启时（debug=true）', () => {
  it('给出该市场的时区、本地时间与开市状态', () => {
    const res = fakeRes();
    const handled = handleSystemRoutes(
      new URL('http://x/api/_market?m=us-index&t=2026-10-28T14:30:00Z'),
      res,
      { ttlMs: 1, jobs: () => [], debug: true },
    );
    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    expect(res.body.m).toBe('us-index');
    expect(res.body.tz).toBeTruthy();
    expect(typeof res.body.open).toBe('boolean');
  });

  it('未知市场代号不编造：tz / local / open 一律 null（不是 false）', () => {
    const res = fakeRes();
    handleSystemRoutes(new URL('http://x/api/_market?m=nope'), res, { ttlMs: 1, jobs: () => [], debug: true });
    expect(res.body.tz).toBeNull();
    expect(res.body.local).toBeNull();
    // 「不知道开没开」和「确定没开」是两件事，未注册的市场只能是前者
    expect(res.body.open).toBeNull();
  });
});

/* ================================================================== *
 * 启动脚本与 doctor 的顺序契约（真实踩到的坑）
 *
 * doctor 把「声明了运行时依赖但没装」判为 error；如果启动脚本先跑 doctor
 * 再装依赖，新机器会永远卡在「环境预检未通过」——这个顺序必须钉住。
 * ================================================================== */
describe('启动脚本：依赖安装必须先于 doctor', () => {
  // 用 fileURLToPath 解码中文文件名（URL.pathname 会给百分号编码）
  const script = () => readFileSync(fileURLToPath(new URL('../启动看板.command', import.meta.url)), 'utf8');

  it('npm ci 出现在 doctor 之前', () => {
    const text = script();
    const installAt = text.indexOf('npm ci --omit=dev');
    const doctorAt = text.indexOf('node tools/doctor.mjs');
    expect(installAt).toBeGreaterThan(-1);
    expect(doctorAt).toBeGreaterThan(-1);
    expect(installAt).toBeLessThan(doctorAt);
  });

  it('提示的 Node 大版本与 .nvmrc 一致（不是过期的 20）', () => {
    const text = script();
    const nvmrc = readFileSync(fileURLToPath(new URL('../.nvmrc', import.meta.url)), 'utf8').trim();
    const major = nvmrc.split('.')[0];
    expect(text).toContain(`Node.js ${major}`);
    expect(text).not.toContain('Node.js 20');
  });

  it('doctor 的警告（exit 2）不会拦住启动', () => {
    expect(script()).toMatch(/-ne 0.+\n?.*-ne 2/);
  });
});

/* ================================================================== *
 * 维护端点（方案 E05 / §9.2）
 *
 * 默认关闭；开放后只认 POST —— GET 触发整份备份会被浏览器预取或爬虫误触。
 * 这条路径也是唯一允许 POST 的 API（入口的 405 守卫对它开了口子）。
 * ================================================================== */
describe('维护备份端点', () => {
  it('默认关闭时返回 404（不是一个谁都能点的按钮）', () => {
    const { handled, res } = call('/api/maintenance/backup', '', undefined, 'POST');
    expect(handled).toBe(true);
    expect(res.status).toBe(404);
  });

  it('开放后 GET 被拒：会写盘的操作用 POST', () => {
    const { res } = call('/api/maintenance/backup', '', { ttlMs: 1, jobs: () => [], maintenance: true }, 'GET');
    expect(res.status).toBe(405);
    expect(res.body.error).toContain('POST');
  });

  it('入口只在 /api/maintenance/ 前缀放行 POST，其它路径仍然 405', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath: toPath } = await import('node:url');
    const src = readFileSync(toPath(new URL('../server.mjs', import.meta.url)), 'utf8');
    expect(src).toContain("url.pathname.startsWith('/api/maintenance/')");
  });
});
