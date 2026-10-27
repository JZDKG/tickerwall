/* ================================================================== *
 * LLM 配置来源
 *
 * 这段代码会去读另一个工具（dsh）的私有 YAML 和明文凭据。耦合外部私有格式
 * 本身就该有开关，而且必须能证明「说只用环境变量时，真的没去碰那些文件」。
 *
 * 测试手法：造一个假的 HOME，里面放一份「会露馅」的 dsh 配置和一个假密钥。
 * 如果实现偷偷读了，断言就会拿到 sk-STOLEN。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readDshLlmConfig } from '../src/server/services/events.service.js';

let home;
const saved = {};

function fakeDshHome() {
  const dir = mkdtempSync(path.join(tmpdir(), 'llm-cfg-'));
  mkdirSync(path.join(dir, '.dsh/profiles/web'), { recursive: true });
  writeFileSync(
    path.join(dir, '.dsh/profiles/web/cordis.patch.yml'),
    'cline:\n  baseURL: https://evil.example/v1\n  apiKeyEnv: EVIL_KEY\n  models:\n    - id: cline-pass/evil-model\n',
  );
  writeFileSync(path.join(dir, '.dsh/.credentials.yaml'), 'EVIL_KEY: sk-STOLEN\n');
  return dir;
}

beforeEach(() => {
  home = fakeDshHome();
  for (const k of ['HOME', 'DSH_HOME', 'LLM_CONFIG_SOURCE', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL', 'CLINE_API_KEY', 'EVIL_KEY']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.HOME = home;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(home, { recursive: true, force: true });
});

describe('readDshLlmConfig：来源优先级', () => {
  it('LLM_CONFIG_SOURCE=env 且没有环境变量时，绝不读取 dsh 的文件', () => {
    process.env.LLM_CONFIG_SOURCE = 'env';
    const cfg = readDshLlmConfig();
    expect(cfg.source).toBe('env:missing');
    expect(cfg.apiKey).toBeNull();
    expect(cfg.baseURL).toBeNull();
    // 关键：假 HOME 里那份 sk-STOLEN 不能出现在任何字段里
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
    expect(JSON.stringify(cfg)).not.toContain('evil.example');
  });

  it('环境变量齐全时直接采用，不读文件', () => {
    process.env.LLM_BASE_URL = 'https://my.example/v1';
    process.env.LLM_API_KEY = 'sk-mine';
    process.env.LLM_MODEL = 'my-model';
    const cfg = readDshLlmConfig();
    expect(cfg.source).toBe('env');
    expect(cfg.baseURL).toBe('https://my.example/v1');
    expect(cfg.apiKey).toBe('sk-mine');
    expect(cfg.model).toBe('my-model');
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
  });

  it('默认 auto：仅在没有环境变量时才回落读 dsh（兼容现状）', () => {
    const cfg = readDshLlmConfig();
    expect(cfg.source).toContain('dsh');
    expect(cfg.baseURL).toBe('https://evil.example/v1');
    expect(cfg.model).toBe('cline-pass/evil-model');
  });

  it('模型名可以由 LLM_MODEL 覆盖，不再只有硬编码那一个', () => {
    process.env.LLM_MODEL = 'whatever-model';
    process.env.LLM_API_KEY = 'sk-x';
    expect(readDshLlmConfig().model).toBe('whatever-model');
  });
});

/* ================================================================== *
 * 字段级合并（曾经写错成「整体覆盖」）
 *
 * 旧实现只要任何一个 LLM_* 变量存在就提前 return，于是「只想换模型名」的人
 * 连密钥一起丢掉 —— LLM 复核静默失效，而界面上看不出来。这里锁住：
 * 每个字段各自回落。
 * ================================================================== */
describe('环境变量与 dsh 配置逐字段合并', () => {
  it('只设 LLM_MODEL 时，密钥仍从 dsh 补上（这是最初的真 bug）', () => {
    process.env.LLM_MODEL = 'my-model';
    const cfg = readDshLlmConfig();
    expect(cfg.model).toBe('my-model');
    // 关键：密钥必须仍然拿得到
    expect(cfg.apiKey).toBe('sk-STOLEN'); // 假 HOME 里的密钥，证明回落生效
    expect(cfg.source).toContain('env');
    expect(cfg.source).toContain('dsh');
  });

  it('只设 LLM_BASE_URL 时，密钥与模型都回落', () => {
    process.env.LLM_BASE_URL = 'https://mine.example/v1';
    const cfg = readDshLlmConfig();
    expect(cfg.baseURL).toBe('https://mine.example/v1');
    expect(cfg.apiKey).toBe('sk-STOLEN');
    expect(cfg.model).toBe('cline-pass/evil-model');
  });

  it('环境变量齐全时全部采用，不再走 dsh', () => {
    process.env.LLM_BASE_URL = 'https://mine.example/v1';
    process.env.LLM_API_KEY = 'sk-mine';
    process.env.LLM_MODEL = 'my-model';
    const cfg = readDshLlmConfig();
    expect(cfg).toMatchObject({ baseURL: 'https://mine.example/v1', apiKey: 'sk-mine', model: 'my-model' });
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
  });

  it('环境变量齐全时确实没读文件：把 DSH_HOME 指向不存在的目录，结果不变', () => {
    process.env.LLM_BASE_URL = 'https://mine.example/v1';
    process.env.LLM_API_KEY = 'sk-mine';
    process.env.LLM_MODEL = 'my-model';
    process.env.DSH_HOME = '/nonexistent-dsh-home-for-this-test';
    const cfg = readDshLlmConfig();
    // 若实现偷偷读了 dsh，这里会变成 env+dsh:… 或拿到 evil 地址
    expect(cfg.source).toBe('env');
    expect(cfg.baseURL).toBe('https://mine.example/v1');
    expect(cfg.apiKey).toBe('sk-mine');
  });

  it('只设 LLM_API_KEY 时，网关地址回落到默认值（有 key 就必须有地址）', () => {
    process.env.LLM_API_KEY = 'sk-mine';
    process.env.DSH_HOME = '/nonexistent-dsh-home-for-this-test';
    const cfg = readDshLlmConfig();
    expect(cfg.apiKey).toBe('sk-mine');
    // 有密钥却没有 baseURL 会让请求直接失败，所以这里必须是默认网关而不是 null
    expect(cfg.baseURL).toBe('https://api.cline.bot/api/v1');
  });

  it('LLM_CONFIG_SOURCE=env 时即使只设模型也不读文件（无法回落）', () => {
    process.env.LLM_CONFIG_SOURCE = 'env';
    process.env.LLM_MODEL = 'my-model';
    const cfg = readDshLlmConfig();
    expect(cfg.model).toBe('my-model');
    expect(cfg.apiKey).toBeNull(); // 明说了只用环境变量，就不给密钥
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
  });
});
