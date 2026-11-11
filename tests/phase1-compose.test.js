/* ================================================================== *
 * Phase 1 / P1-T5：docker-compose.yml 一键编排
 *
 * 验收：配置合法（能被解析成对象）、服务字段齐全、端口与卷、五个环境变量
 * 透传、restart 策略与 healthcheck 都在。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../docker-compose.yml', import.meta.url));
const read = () => readFileSync(file, 'utf8');

describe('docker-compose.yml', () => {
  it('文件存在', () => {
    expect(existsSync(file)).toBe(true);
  });

  it('定义 tickerwall 服务，构建自 ./Dockerfile', () => {
    const text = read();
    expect(text).toMatch(/^\s{2}tickerwall:\s*$/m);
    expect(text).toMatch(/build:\s*\n?\s*context:\s*\.\s*$/m);
    expect(text).toContain('dockerfile: Dockerfile');
  });

  it('映射端口 ${PORT:-8787}:8787', () => {
    expect(read()).toContain('${PORT:-8787}:8787');
  });

  it('挂载 ./data:/app/data 或命名卷', () => {
    const text = read();
    expect(text).toMatch(/\.\/data:\/app\/data|data:/);
    expect(text).toContain('volumes:');
  });

  it('透传五个官方数据源 / LLM 环境变量', () => {
    const text = read();
    for (const key of ['FRED_API_KEY', 'BLS_API_KEY', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL']) {
      expect(text, key).toContain(key);
    }
  });

  it('配置 restart: unless-stopped 与内置 healthcheck', () => {
    const text = read();
    expect(text).toContain('restart: unless-stopped');
    expect(text).toContain('healthcheck:');
    expect(text).toMatch(/test:\s*\[/);
  });

  it('没有把真实密钥写进文件（只引用变量名）', () => {
    const text = read();
    expect(text).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(text).not.toMatch(/api_key\s*=\s*[a-z0-9]{20,}/i);
  });
});
