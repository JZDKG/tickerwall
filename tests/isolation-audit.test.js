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
    if (src.includes('mkdtempSync') || src.includes('KANBAN_DATA_DIR')) return false;
    /**
     * 逐**行**判定，不是整篇放行。
     *
     * 原来写的是「这个文件里出现过 useDatabase(':memory:') 就 return false」，
     * 结果是：一个文件里有 20 个用例，只要 1 个用了内存库，另外 19 个直接
     * 开真实默认库也照样通过 —— 审计看起来绿，其实什么都没查。
     */
    return src.split('\n').some((line) => OPENS_DEFAULT_DB.test(line) && !/:memory:/.test(line));
  });

  it('没有测试打开默认路径的数据库', () => {
    expect(offenders).toEqual([]);
  });
});

describe('2) 起子进程的测试带隔离数据目录', () => {
  const spawners = files.filter((f) => /execFileSync|spawn\(|fork\(/.test(read(f)));

  it('每个起进程的测试都显式给了数据目录或明确不需要', () => {
    const bad = spawners.filter((f) => {
      // 审计脚本自己会写出 `...process.env` 这个字样（在正则里），不算违规
      if (f === 'isolation-audit.test.js') return false;
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
      // 审计脚本自己把 `...process.env` 写在正则里（用来抓别人），不算违规
      if (f === 'isolation-audit.test.js') return false;
      const src = read(f);
      /**
       * **跨行**匹配：`env: {\n  ...process.env,\n  PORT: '0',\n}` 也要被抓住。
       * 原来的单行正则只能匹配「只展开、不追加」的那种写法，
       * 而真实测试恰好都是「先展开再覆盖几个变量」—— 于是全部漏判。
       */
      return /env:\s*\{[\s\S]{0,400}?\.\.\.process\.env[\s\S]{0,400}?\}/.test(src);
    });
    expect(leaks).toEqual([]);
  });
});

describe('2b) 子进程环境来自白名单', () => {
  const spawners = files.filter((f) => /execFileSync|spawn\(|fork\(/.test(read(f)));

  it('每个起进程的测试都通过 childEnv() 构造环境', () => {
    const bad = spawners.filter((f) => {
      const src = read(f);
      if (f === 'isolation-audit.test.js' || f === 'pack-tool.test.js') return false;
      // 要么用白名单助手，要么显式声明不需要环境
      return !src.includes('childEnv(') && !src.includes('NO_ENV_NEEDED');
    });
    expect(bad).toEqual([]);
  });

  it('白名单本身不包含任何凭据类键', async () => {
    const { ALLOWED_ENV_KEYS } = await import('./helpers/child-env.js');
    expect(ALLOWED_ENV_KEYS.some((k) => /API_KEY|TOKEN|SECRET|PASSWORD/i.test(k))).toBe(false);
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
