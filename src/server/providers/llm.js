/* ================================================================== *
 * LLM 网关配置解析
 *
 * 从 services/events.service.js 拆出来。这里只做一件事：**算出该用哪个
 * 网关、哪个密钥、哪个模型**，不做任何 HTTP 调用，也不碰 KV 缓存。
 *
 * 为什么不和「调用 LLM」放一起：配置解析是确定性的纯逻辑（可单测、无 IO
 * 副作用，只在缺字段时才读一次文件），而调用是网络 + 重试 + 结果校验。
 * 混在一起时，改一个重试策略要碰凭据解析，风险不对等。
 *
 * 凭据来源优先级（逐字段回落，不是整体覆盖）：
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 环境变量
 *     ↓ 缺哪个补哪个
 *   内置默认网关（本机 magpie，见下方 BUILTIN_* 常量）
 *     ↓ 仅 LLM_CONFIG_SOURCE=dsh 时才插在两者之间
 *   ~/.dsh/profiles/web/cordis.patch.yml 里的 cline 配置（显式 opt-in）
 * ================================================================== */

import { readFileSync } from 'node:fs';

const ENV_LLM = { baseURL: 'LLM_BASE_URL', apiKey: 'LLM_API_KEY', model: 'LLM_MODEL' };

/**
 * 内置默认网关：本机 magpie 代理（OpenAI 兼容 Chat Completions）。
 * 网关信任回环请求，密钥是公共占位值（非机密），写死在代码里不构成泄露。
 *
 * 三种模式（LLM_CONFIG_SOURCE）：
 *   auto（默认）  env 逐字段 → builtin。不再读任何外部文件 —— dsh 那条
 *                回落从「默认行为」降级为显式选用，默认链路永远不碰它。
 *   env          只认环境变量，缺字段就是 null。部署隔离与测试都用它
 *                （严格语义是有意的：说「只用 env」就必须真的什么都不补）。
 *   dsh          env 逐字段 → ~/.dsh 的 cline 配置 → builtin 兜底。
 */
const BUILTIN_BASE_URL = 'http://127.0.0.1:3425/v1';
const BUILTIN_API_KEY = 'magpie';
const BUILTIN_MODEL = 'qoder/qfmodel';

export function readDshConfig() {
  const home = process.env.DSH_HOME || `${process.env.HOME}/.dsh`;
  const out = { baseURL: null, apiKeyEnv: 'CLINE_API_KEY', models: [], apiKey: null, source: null };

  try {
    const patch = readFileSync(`${home}/profiles/web/cordis.patch.yml`, 'utf8');
    const idx = patch.indexOf('cline:');
    if (idx >= 0) {
      const seg = patch.slice(idx, idx + 2500);
      out.baseURL = /baseURL:\s*(\S+)/.exec(seg)?.[1] ?? null;
      out.apiKeyEnv = /apiKeyEnv:\s*(\S+)/.exec(seg)?.[1] ?? 'CLINE_API_KEY';
      out.models = [...seg.matchAll(/-\s*id:\s*(cline-pass\/[A-Za-z0-9._-]+)/g)].map((m) => m[1]);
      out.source = 'dsh:profiles/web';
    }
  } catch {
    /* 读不到就算了 */
  }

  out.apiKey = process.env[out.apiKeyEnv] || null;
  if (!out.apiKey) {
    try {
      const cred = readFileSync(`${home}/.credentials.yaml`, 'utf8');
      out.apiKey = new RegExp(`${out.apiKeyEnv}:\\s*(\\S+)`).exec(cred)?.[1] ?? null;
      if (out.apiKey) out.source = `${out.source ?? 'dsh'}:credentials.yaml`;
    } catch {
      /* 无凭据 */
    }
  }
  return out;
}

export function readDshLlmConfig() {
  const mode = String(process.env.LLM_CONFIG_SOURCE ?? 'auto').toLowerCase();
  const envOnly = mode === 'env';
  const useDsh = mode === 'dsh';

  const envBase = process.env[ENV_LLM.baseURL] || null;
  const envKey = process.env[ENV_LLM.apiKey] || null;
  const envModel = process.env[ENV_LLM.model] || null;

  // 三个字段都在环境变量里给全了，就没有任何理由再碰外部文件 ——
  // 少一次 IO，也少一处凭据暴露面。builtin 同理：用不上就不进 source。
  const envComplete = Boolean(envBase && envKey && envModel);
  const dsh = useDsh && !envComplete ? readDshConfig() : null;

  // dsh 模式沿用原有的模型偏好链；其他模式没有中间层
  let dshModel = null;
  if (dsh && !envModel) {
    const models = dsh?.models ?? [];
    const preferred = ['cline-pass/deepseek-v4.1-flash-1017', 'cline-pass/glm-5.3-flash'];
    dshModel = preferred.find((m) => models.includes(m)) ?? models[0] ?? null;
  }

  // 逐字段：env → dsh（仅显式启用）→ builtin（env 模式不补，缺就是 null）
  const apiKey = envKey ?? dsh?.apiKey ?? (envOnly ? null : BUILTIN_API_KEY);
  // baseURL 取决于**有没有密钥**，而不是「有没有配置」：
  // 有 key 却没网关地址，请求根本发不出去 —— 这比「用默认地址」更难排查。
  // 反过来没有 key 时给 null，让配置一眼看出「压根没配」。
  const baseURL = envBase ?? dsh?.baseURL ?? (envOnly || !apiKey ? null : BUILTIN_BASE_URL);
  const model = envModel ?? dshModel ?? (envOnly ? null : BUILTIN_MODEL);
  const models = envModel
    ? [envModel]
    : dsh?.models?.length
      ? dsh.models
      : envOnly
        ? []
        : [BUILTIN_MODEL];

  const from = [];
  if (envBase || envKey || envModel) from.push('env');
  if (dsh?.source) from.push(dsh.source);
  // builtin 只在**实际有字段落到内置值**时才标注 —— dsh 配置完备时把
  // builtin 也写进 source 是虚标，排查「到底用的哪个网关」会被误导
  const usedBuiltinKey = !envOnly && envKey == null && dsh?.apiKey == null;
  const usedBuiltinBase = !envOnly && envBase == null && dsh?.baseURL == null && apiKey;
  const usedBuiltinModel = !envOnly && envModel == null && !dshModel;
  if (usedBuiltinKey || usedBuiltinBase || usedBuiltinModel) from.push('builtin:magpie');

  return {
    baseURL,
    apiKey,
    apiKeyEnv: dsh?.apiKeyEnv ?? 'CLINE_API_KEY',
    models,
    model,
    source: from.length ? from.join('+') : (envOnly ? 'env:missing' : 'builtin:magpie'),
  };
}

/**
 * LLM 输出的 JSON 偶尔会被截断（reasoning 吃掉预算）或带多余字符，
 * 先标准解析，失败就逐个抠出完整的 {...} 对象，尽量不浪费这一批请求。
 */
export function parseLooseJsonArray(text) {
  const bracket = /\[[\s\S]*\]/.exec(text);
  if (bracket) {
    try {
      const arr = JSON.parse(bracket[0]);
      if (Array.isArray(arr)) return arr;
    } catch {
      /* 落到逐个解析 */
    }
  }
  const out = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj && obj.i != null) out.push(obj);
    } catch {
      /* 跳过坏片段 */
    }
  }
  return out;
}