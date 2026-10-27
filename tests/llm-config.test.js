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
