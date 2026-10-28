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
 *   ~/.dsh/profiles/web/cordis.patch.yml 里的 cline 配置
 * ================================================================== */

import { readFileSync } from 'node:fs';

const ENV_LLM = { baseURL: 'LLM_BASE_URL', apiKey: 'LLM_API_KEY', model: 'LLM_MODEL' };
const FALLBACK_BASE_URL = 'https://api.cline.bot/api/v1';
const FALLBACK_MODEL = 'cline-pass/deepseek-v4.1-flash-1017';

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
  const useEnvOnly = String(process.env.LLM_CONFIG_SOURCE ?? 'auto').toLowerCase() === 'env';

  const envBase = process.env[ENV_LLM.baseURL] || null;
  const envKey = process.env[ENV_LLM.apiKey] || null;
  const envModel = process.env[ENV_LLM.model] || null;

  // 三个字段都在环境变量里给全了，就没有任何理由再碰外部文件 ——
  // 少一次 IO，也少一处凭据暴露面。只在缺字段时才回落去读 dsh。
  const envComplete = Boolean(envBase && envKey && envModel);
  const dsh = useEnvOnly || envComplete ? null : readDshConfig();

  // 逐字段：有了就用，没有才回落
  const apiKey = envKey ?? dsh?.apiKey ?? null;
  // baseURL 取决于**有没有密钥**，而不是「有没有配置」：
  // 有 key 却没网关地址，请求根本发不出去 —— 这比「用默认地址」更难排查。
  // 反过来没有 key 时给 null，让 env:missing 一眼看出「压根没配」。
  const baseURL = envBase ?? dsh?.baseURL ?? (apiKey ? FALLBACK_BASE_URL : null);
  const models = envModel ? [envModel] : (dsh?.models ?? []);

  let model = envModel;
  if (!model) {
    const preferred = ['cline-pass/deepseek-v4.1-flash-1017', 'cline-pass/glm-5.3-flash'];
    model = preferred.find((m) => models.includes(m)) ?? models[0] ?? FALLBACK_MODEL;
  }

  const from = [];
  if (envBase || envKey || envModel) from.push('env');
  if (dsh?.source) from.push(dsh.source);

  return {
    baseURL,
    apiKey,
    apiKeyEnv: dsh?.apiKeyEnv ?? 'CLINE_API_KEY',
    models,
    model,
    source: from.length ? from.join('+') : 'env:missing',
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