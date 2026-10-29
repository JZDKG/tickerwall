/* ================================================================== *
 * 浏览器回归脚本的自检（tools/browser-check.mjs）
 *
 * 脚本本身要真起 Chrome，所以这里只做静态与结构层面的守卫：
 *   · 它必须**真的断言**那些曾经出过 bug 的点（不是只截图）；
 *   · 找不到 Chrome 必须显式失败，不能静默跳过（否则 CI 又会全绿）；
 *   · 必须往隔离数据目录起服务，不能污染工作区；
 *   · CI 里必须真的调它。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('tools/browser-check.mjs', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('断言覆盖了曾经出过 bug 的点', () => {
  const must = [
    ['未捕获异常', 'Runtime.exceptionThrown'],
    ['快照不是克隆', 'snapshotIds'],
    ['涨跌幅各异', 'changes'],
    ['行情进首屏', 'rowsTop'],
    ['导航样式生效', 'navGap'],
    ['今天重点非空', 'today-focus-slot'],
    ['解释卡 ready', 'phase'],
    ['四层标注', 'layers'],
  ];
  for (const [name, token] of must) {
    it(`断言里有「${name}」`, () => {
      expect(src).toContain(token);
    });
  }
});

describe('失败必须显式', () => {
  it('找不到 Chrome 时退出码非 0（不静默跳过）', () => {
    expect(src).toMatch(/找不到 Chrome[\s\S]{0,80}process\.exit\(1\)/);
  });

  it('有断言失败时退出码非 0', () => {
    expect(src).toMatch(/failed\.length[\s\S]{0,200}process\.exit\(1\)/);
  });

  it('成功才 exit(0)', () => {
    expect(src).toContain('process.exit(0)');
  });
});

describe('不许用固定 sleep 当同步手段（会偶发闪红）', () => {
  it('有超时轮询器，且三处页面断言都用它等条件', () => {
    expect(src).toContain('waitForCondition');
    expect(src).toContain('timeoutMs');
    // 首页 / 事件中心 / 详情 三处都要轮询
    expect((src.match(/await waitForCondition\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('页面等待不再依赖 6/8 秒这种魔法数字', () => {
    expect(src).not.toContain('await sleep(6000)');
    expect(src).not.toContain('await sleep(8000)');
  });

  it('轮询有上限，不会无限挂住 CI', () => {
    const m = /timeoutMs = (\d+)/.exec(src);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThan(0);
    expect(Number(m[1])).toBeLessThanOrEqual(30000);
  });
});

describe('收尾不许把检查拖红（Ubuntu 上的 ENOTEMPTY）', () => {
  it('先等进程退出再删目录（不假设信号立即生效）', () => {
    expect(src).toContain('waitExit');
    expect(src).toMatch(/await Promise\.all\(\[waitExit/);
  });

  it('删目录带重试退避，且失败只打印不抛', () => {
    expect(src).toContain('maxRetries');
    expect(src).toMatch(/removeDir[\s\S]{0,200}catch/);
  });

  it('cleanup 是 async 且被 await（收尾不阻塞结论但是有序的）', () => {
    expect(src).toContain('const cleanup = async');
    expect(src).toContain('await cleanup()');
  });
});

describe('隔离与清理', () => {
  it('服务用 KANBAN_DATA_DIR 指向临时目录', () => {
    expect(src).toContain('KANBAN_DATA_DIR: dataDir');
    expect(src).toContain('mkdtempSync');
  });

  it('关掉后台采集（不联网、不确定性地写库）', () => {
    expect(src).toContain('DISABLE_BACKGROUND');
  });

  it('结束时会清理进程与临时目录', () => {
    // 清理走 removeDir 包装（带重试、失败不抛），不是裸 rmSync
    expect(src).toContain('removeDir(dataDir)');
    expect(src).toContain('removeDir(profile)');
    expect(src).toContain("kill('SIGKILL')");
  });
});

describe('接线', () => {
  it('package.json 有 test:browser', () => {
    expect(pkg.scripts['test:browser']).toContain('browser-check.mjs');
  });

  it('CI 里真的跑了它', () => {
    expect(ci).toContain('npm run test:browser');
  });
});
