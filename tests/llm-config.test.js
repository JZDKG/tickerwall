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
  for (const k of ['HOME', 'DSH_HOME', 'LLM_CONFIG_SOURCE', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_ALLOW_LOCAL_DEFAULT', 'CLINE_API_KEY', 'EVIL_KEY']) {
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

  it('默认模式：环境变量缺失时不再回落内置 magpie（容器里没有这个端口）', () => {
    const cfg = readDshLlmConfig();
    expect(cfg.source).toBe('env:missing');
    expect(cfg.baseURL).toBeNull();
    expect(cfg.apiKey).toBeNull();
    expect(cfg.model).toBeNull();
    // 假 HOME 里的 dsh 配置在默认模式下绝不被读取
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
    expect(JSON.stringify(cfg)).not.toContain('evil.example');
  });

  it('LLM_CONFIG_SOURCE=dsh：显式 opt-in 后才回落读 dsh 配置', () => {
    process.env.LLM_CONFIG_SOURCE = 'dsh';
    const cfg = readDshLlmConfig();
    expect(cfg.source).toContain('dsh');
    expect(cfg.baseURL).toBe('https://evil.example/v1');
    expect(cfg.model).toBe('cline-pass/evil-model');
    expect(cfg.apiKey).toBe('sk-STOLEN');
  });

  it('dsh 配置完备时不虚标 builtin：source 不含 builtin:magpie', () => {
    process.env.LLM_CONFIG_SOURCE = 'dsh';
    const cfg = readDshLlmConfig();
    // dsh 三字段齐全，没有任何字段落到内置值 —— 标 builtin 就是误导
    expect(cfg.source).not.toContain('builtin');
  });

  it('显式开启本地回退且部分字段来自 env 时，source 标 builtin', () => {
    process.env.LLM_ALLOW_LOCAL_DEFAULT = '1';
    process.env.LLM_API_KEY = 'sk-mine';
    const cfg = readDshLlmConfig();
    // key 来自 env，但 baseURL/model 落到内置值 —— 标 builtin 是准确的
    expect(cfg.source).toBe('env+builtin:magpie');
    expect(cfg.baseURL).toBe('http://127.0.0.1:3425/v1');
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
 * 每个字段各自回落（dsh 模式下回落到 dsh，其余字段回落到 builtin）。
 * ================================================================== */
describe('环境变量与 dsh 配置逐字段合并', () => {
  it('dsh 模式下只设 LLM_MODEL 时，密钥仍从 dsh 补上（最初的真 bug 形态）', () => {
    process.env.LLM_CONFIG_SOURCE = 'dsh';
    process.env.LLM_MODEL = 'my-model';
    const cfg = readDshLlmConfig();
    expect(cfg.model).toBe('my-model');
    // 关键：密钥必须仍然拿得到
    expect(cfg.apiKey).toBe('sk-STOLEN'); // 假 HOME 里的密钥，证明回落生效
    expect(cfg.source).toContain('env');
    expect(cfg.source).toContain('dsh');
  });

  it('dsh 模式下只设 LLM_BASE_URL 时，密钥与模型都回落到 dsh', () => {
    process.env.LLM_CONFIG_SOURCE = 'dsh';
    process.env.LLM_BASE_URL = 'https://mine.example/v1';
    const cfg = readDshLlmConfig();
    expect(cfg.baseURL).toBe('https://mine.example/v1');
    expect(cfg.apiKey).toBe('sk-STOLEN');
    expect(cfg.model).toBe('cline-pass/evil-model');
  });

  it('环境变量齐全时全部采用，不再走 dsh / builtin', () => {
    process.env.LLM_BASE_URL = 'https://mine.example/v1';
    process.env.LLM_API_KEY = 'sk-mine';
    process.env.LLM_MODEL = 'my-model';
    const cfg = readDshLlmConfig();
    expect(cfg).toMatchObject({ baseURL: 'https://mine.example/v1', apiKey: 'sk-mine', model: 'my-model' });
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
    expect(cfg.source).toBe('env');
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

  it('默认模式只设 LLM_API_KEY 时地址仍为 null（不再盲打不存在的本机端口）', () => {
    process.env.LLM_API_KEY = 'sk-mine';
    process.env.DSH_HOME = '/nonexistent-dsh-home-for-this-test';
    const cfg = readDshLlmConfig();
    expect(cfg.apiKey).toBe('sk-mine');
    // 没开本地回退就不补地址：服务层看到 !baseURL 会直接跳过 LLM 调用
    expect(cfg.baseURL).toBeNull();
    expect(cfg.model).toBeNull();
  });

  it('显式开启本地回退后，只设 LLM_API_KEY 也能补出内置网关', () => {
    process.env.LLM_ALLOW_LOCAL_DEFAULT = '1';
    process.env.LLM_API_KEY = 'sk-mine';
    const cfg = readDshLlmConfig();
    expect(cfg.apiKey).toBe('sk-mine');
    expect(cfg.baseURL).toBe('http://127.0.0.1:3425/v1');
    expect(cfg.model).toBe('qoder/qfmodel');
  });

  it('LLM_CONFIG_SOURCE=env 时即使只设模型也不读文件、不落内置网关（无法回落）', () => {
    process.env.LLM_CONFIG_SOURCE = 'env';
    process.env.LLM_MODEL = 'my-model';
    const cfg = readDshLlmConfig();
    expect(cfg.model).toBe('my-model');
    expect(cfg.apiKey).toBeNull(); // 明说了只用环境变量，就不给密钥
    expect(cfg.baseURL).toBeNull();
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
  });
});

/* ================================================================== *
 * B6/安全回归：生产/Docker 默认不读 ~/.dsh、不盲打本机 127.0.0.1:3425
 *
 * 故障形态：默认 auto 会回落到内置本机 magpie 网关，容器里根本没有这个
 * 端口，每次快讯分类都先超时一轮；dsh 的私有 YAML 读取逻辑也还挂在代码里。
 * 新契约：默认只认 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL；没配就优雅跳过
 * （三个字段均为 null），只有显式 LLM_ALLOW_LOCAL_DEFAULT=1 或
 * LLM_CONFIG_SOURCE=dsh 才允许别的来源。
 * ================================================================== */
describe('B6：Docker 环境变量模式（默认零宿主文件访问、零本地端口）', () => {
  it('没有任何 LLM_* 环境变量时，baseURL / apiKey / model 全为 null', () => {
    const cfg = readDshLlmConfig();
    expect(cfg.baseURL).toBeNull();
    expect(cfg.apiKey).toBeNull();
    expect(cfg.model).toBeNull();
    expect(cfg.source).toBe('env:missing');
  });

  it('默认模式即使假 HOME 里有 dsh 配置，也绝不读取（不出现 sk-STOLEN / evil.example）', () => {
    const cfg = readDshLlmConfig();
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
    expect(JSON.stringify(cfg)).not.toContain('evil.example');
    expect(cfg.source).not.toContain('dsh');
  });

  it('默认模式不盲打 127.0.0.1:3425（内置网关只在显式 opt-in 时出现）', () => {
    const cfg = readDshLlmConfig();
    expect(JSON.stringify(cfg)).not.toContain('127.0.0.1:3425');
    expect(cfg.source).not.toContain('magpie');
  });

  it('三个 LLM_* 环境变量齐全时直接采用（标准部署路径）', () => {
    process.env.LLM_BASE_URL = 'https://llm.example/v1';
    process.env.LLM_API_KEY = 'sk-prod';
    process.env.LLM_MODEL = 'prod-model';
    const cfg = readDshLlmConfig();
    expect(cfg).toMatchObject({
      baseURL: 'https://llm.example/v1',
      apiKey: 'sk-prod',
      model: 'prod-model',
      source: 'env',
    });
  });

  it('LLM_ALLOW_LOCAL_DEFAULT=1 才启用本机开发回退（显式 opt-in）', () => {
    process.env.LLM_ALLOW_LOCAL_DEFAULT = '1';
    const cfg = readDshLlmConfig();
    expect(cfg.baseURL).toBe('http://127.0.0.1:3425/v1');
    expect(cfg.apiKey).toBe('magpie');
    expect(cfg.model).toBe('qoder/qfmodel');
    expect(cfg.source).toContain('builtin:magpie');
  });

  it('显式 opt-in 本地回退时仍然不读 ~/.dsh 私有文件', () => {
    process.env.LLM_ALLOW_LOCAL_DEFAULT = '1';
    const cfg = readDshLlmConfig();
    expect(JSON.stringify(cfg)).not.toContain('sk-STOLEN');
    expect(JSON.stringify(cfg)).not.toContain('evil.example');
  });

  it('LLM_CONFIG_SOURCE=env 与默认等价（严格只用环境变量）', () => {
    process.env.LLM_CONFIG_SOURCE = 'env';
    process.env.LLM_API_KEY = 'sk-env-only';
    const cfg = readDshLlmConfig();
    expect(cfg.apiKey).toBe('sk-env-only');
    expect(cfg.baseURL).toBeNull();
    expect(cfg.model).toBeNull();
  });
});
