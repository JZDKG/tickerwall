/* ================================================================== *
 * B6/安全回归：Docker 环境变量模板与依赖说明
 *
 * 这些不是「文档润色」：注释说「生产依赖为空」会让人真的跳过 npm ci，
 * 而 ajv 是服务端契约校验的运行时依赖；.env.example 缺 LLM_* 会让部署
 * 者不知道怎么启用/跳过 LLM 复核。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('B6：.env.example 模板', () => {
  it('存在且包含全部要求的变量', () => {
    expect(existsSync(fileURLToPath(new URL('../.env.example', import.meta.url)))).toBe(true);
    const text = read('.env.example');
    for (const key of ['PORT', 'KANBAN_DATA_DIR', 'FRED_API_KEY', 'BLS_API_KEY', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL']) {
      expect(text, key).toContain(key);
    }
  });

  it('说明本地回退与 dsh 都必须显式开启（不是默认行为）', () => {
    const text = read('.env.example');
    expect(text).toContain('LLM_ALLOW_LOCAL_DEFAULT=0');
    expect(text).toContain('LLM_CONFIG_SOURCE=env');
    expect(text).toContain('别入库');
  });
});

describe('B6：过时的「生产依赖为空」注释已修正', () => {
  it('package.json 的策略注释点名 ajv / ajv-formats', () => {
    const text = read('package.json');
    expect(text).toContain('ajv');
    expect(text).toContain('ajv-formats');
    expect(text).not.toContain('现在一个都没有');
  });

  it('Dockerfile 不再声称 dependencies 为空', () => {
    const text = read('Dockerfile');
    expect(text).toContain('ajv');
    expect(text).not.toContain('生产依赖为空');
    expect(text).not.toContain('当前 dependencies 为空');
    // 运行时依赖必须真的被装上，否则容器里契约校验直接崩
    expect(text).toContain('npm ci --omit=dev');
  });
});
