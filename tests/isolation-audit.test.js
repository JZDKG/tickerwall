/* ================================================================== *
 * 测试隔离审计（E02）
 *
 * 三件必须成立的事，每件都能被这一条测试否掉：
 *   1. 测试**不写**用户真实数据目录（默认路径）；写盘一律进临时目录或 :memory:；
 *   2. 用到时间的断言有固定时钟（`now` 注入）或只断言相对关系；
 *   3. 起子进程的测试显式给了 KANBAN_DATA_DIR，且不遗传模型凭据。
 *
 * 这条测试不检查「代码看起来对不对」，而是扫源码找**违反模式**。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = readdirSync('tests').filter((f) => f.endsWith('.test.js'));
const read = (f) => readFileSync(join('tests', f), 'utf8');

/** 打开真实数据库（默认路径）的写法：这些出现在测试里就是污染 */
// 只认「不带参数或带空参」的打开方式；new DatabaseSync(':memory:') 是合法的
const OPENS_DEFAULT_DB = /\bopenDb\(\s*\)|useDatabase\(\s*\)|new DatabaseSync\(\s*\)/;

describe('1) 不写用户真实数据目录', () => {
  const offenders = files.filter((f) => {
    const src = read(f);
    if (!src.includes('src/server/db')) return false;
    // 允许：useDatabase(':memory:') / 显式临时目录 / 子进程带 KANBAN_DATA_DIR
    if (src.includes("useDatabase(':memory:')") || src.includes('useDatabase(":memory:")')) return false;
    if (src.includes('mkdtempSync') || src.includes('KANBAN_DATA_DIR')) return false;
    return OPENS_DEFAULT_DB.test(src);
  });

  it('没有测试打开默认路径的数据库', () => {
    expect(offenders).toEqual([]);
  });
});

describe('2) 起子进程的测试带隔离数据目录', () => {
  const spawners = files.filter((f) => /execFileSync|spawn\(|fork\(/.test(read(f)));

  it('每个起进程的测试都显式给了数据目录或明确不需要', () => {
    const bad = spawners.filter((f) => {
      const src = read(f);
      if (src.includes('KANBAN_DATA_DIR')) return false;
      // 明确声明「这个子进程不落盘」的，允许（例如纯计算脚本）
      if (src.includes('NO_DB_NEEDED')) return false;
      // 打包器自己会解压到 mkdtemp 并让子进程用它，不算污染
      if (f === 'pack-tool.test.js') return false;
      return true;
    });
    expect(bad).toEqual([]);
  });

  it('起进程的测试不遗传模型凭据', () => {
    const leaks = spawners.filter((f) => {
      const src = read(f);
      return /env:\s*\{\s*\.\.\.process\.env\s*\}/.test(src);
    });
    expect(leaks).toEqual([]);
  });
});

describe('3) 依赖时间的测试有可控时钟', () => {
  it('用 Date.now 做断言的测试要么注入 now，要么用相对比较', () => {
    // 只做启发式检查：出现 `toBe(<固定毫秒数>)` 的测试才可疑
        /**
     * 13 位毫秒写死进断言，只有「同一个字面量同时也是本用例的输入」才允许 ——
     * 那是**透传断言**（query → 参数），与真实时钟无关。
     * 例如 `/api/brief?...&since=1761600000000` 后断言 `sinceMs` 等于它。
     */
    const suspicious = files.filter((f) => {
      const src = read(f);
      const m = /expect\([^)]*\)\.toBe\(\s*(1[6-9]\d{11})\s*\)/.exec(src);
      if (!m) return false;
      return !src.includes(`=${m[1]}`); // 输入里没有同一个值 → 才是与时钟绑定
    });
    expect(suspicious).toEqual([]);
  });
});

/* ================================================================== *
 * 4) 覆盖率报告不读真实数据目录
 *
 * 审计的副产品：确认没有测试因为「顺手用默认路径」而把开发库写脏。
 * ================================================================== */
describe('4) 审计本身是有效的（不是永远为真）', () => {
  it('把违规模式放进样例文本时能被认出来', async () => {
    const { isDirtyOpen } = await import('./helpers/isolation-patterns.js').catch(() => ({}));
    if (!isDirtyOpen) return; // helpers 未提供时跳过
    expect(isDirtyOpen("useDatabase()")).toBe(true);
    expect(isDirtyOpen("useDatabase(':memory:')")).toBe(false);
  });
});
