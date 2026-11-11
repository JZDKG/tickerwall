/* ================================================================== *
 * LLM 网关配置解析
 *
 * 从 services/events.service.js 拆出来。这里只做一件事：**算出该用哪个
 * 网关、哪个密钥、哪个模型**，不做任何 HTTP 调用，也不碰 KV 缓存。
 *
 * 为什么不和「调用 LLM」放一起：配置解析是确定性的纯逻辑（可单测、无 IO
 * 副作用），而调用是网络 + 重试 + 结果校验。混在一起时，改一个重试策略
 * 要碰凭据解析，风险不对等。
 *
 * 部署契约（Docker / 生产优先）：
 *   · 默认只认标准环境变量 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL；
 *     没配齐就是 null —— 服务层据此优雅跳过 LLM 调用（不报错、不重试、
 *     不显示「AI 辅助分类」徽章），不会向不存在的本机端口发起连接。
 *   · 不读 ~/.dsh 等宿主机私有文件；只有显式 LLM_CONFIG_SOURCE=dsh
 *     才允许调用那段读取逻辑（本地开发兼容）。
 *   · 内置本机 magpie 网关只在显式 LLM_ALLOW_LOCAL_DEFAULT=1 时启用。
 *     容器化环境里没有这个端口，默认回落会拖垮每次快讯分类。
 *
 * 凭据来源优先级（逐字段回落，不是整体覆盖）：
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 环境变量
 *     ↓ 缺哪个补哪个（仅显式 opt-in 的中间层）
 *   LLM_CONFIG_SOURCE=dsh → ~/.dsh/profiles/web/cordis.patch.yml 的 cline 配置
 *     ↓ 缺哪个补哪个
 *   LLM_ALLOW_LOCAL_DEFAULT=1 → 内置本机 magpie 网关
 *     ↓ 都没开
 *   null（优雅跳过 LLM 调用）
 * ================================================================== */

import { readFileSync } from 'node:fs';

const ENV_LLM = { baseURL: 'LLM_BASE_URL', apiKey: 'LLM_API_KEY', model: 'LLM_MODEL' };

/**
 * 内置默认网关：本机 magpie 代理（OpenAI 兼容 Chat Completions）。
 * 网关信任回环请求，密钥是公共占位值（非机密），写死在代码里不构成泄露。
 * 但它是**开发便利**，不是生产默认：见文件头「部署契约」。
 */
const BUILTIN_BASE_URL = 'http://127.0.0.1:3425/v1';
const BUILTIN_API_KEY = 'magpie';
const BUILTIN_MODEL = 'qoder/qfmodel';

/**
 * 读取另一个工具（dsh）的私有 YAML 与明文凭据。
 *
 * 只在 LLM_CONFIG_SOURCE=dsh 时被调用 —— 正常启动路径永远不会碰宿主机文件。
 * 保留它只是为了本地开发能显式复用旧配置，且这段逻辑与默认链路完全隔离。
 */
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
  const mode = String(process.env.LLM_CONFIG_SOURCE ?? 'env').toLowerCase();
  const useDsh = mode === 'dsh';
  // 本机开发回退必须显式开；容器/生产默认绝不盲打 127.0.0.1:3425
  const allowLocalDefault = process.env.LLM_ALLOW_LOCAL_DEFAULT === '1';

  const envBase = process.env[ENV_LLM.baseURL] || null;
  const envKey = process.env[ENV_LLM.apiKey] || null;
  const envModel = process.env[ENV_LLM.model] || null;

  // 三个字段都在环境变量里给全了，就没有任何理由再碰外部文件或内置值。
  const envComplete = Boolean(envBase && envKey && envModel);
  const dsh = useDsh && !envComplete ? readDshConfig() : null;

  // dsh 模式沿用原有的模型偏好链；其他模式没有中间层
  let dshModel = null;
  if (dsh && !envModel) {
    const models = dsh?.models ?? [];
    const preferred = ['cline-pass/deepseek-v4.1-flash-1017', 'cline-pass/glm-5.3-flash'];
    dshModel = preferred.find((m) => models.includes(m)) ?? models[0] ?? null;
  }

  const local = (builtin) => (allowLocalDefault ? builtin : null);
  // 逐字段：env → dsh（仅显式启用）→ 内置本机网关（仅显式启用）→ null
  const apiKey = envKey ?? dsh?.apiKey ?? local(BUILTIN_API_KEY);
  // 有 key 却没网关地址，请求根本发不出去；没有 key 时一律给 null，
  // 让配置一眼看出「压根没配」，服务层据此直接跳过调用。
  const baseURL = envBase ?? dsh?.baseURL ?? (apiKey ? local(BUILTIN_BASE_URL) : null);
  const model = envModel ?? dshModel ?? local(BUILTIN_MODEL);
  const models = envModel
    ? [envModel]
    : dsh?.models?.length
      ? dsh.models
      : allowLocalDefault && model
        ? [BUILTIN_MODEL]
        : [];

  const from = [];
  if (envBase || envKey || envModel) from.push('env');
  if (dsh?.source) from.push(dsh.source);
  const usedBuiltinKey = envKey == null && dsh?.apiKey == null && apiKey === BUILTIN_API_KEY;
  const usedBuiltinBase = envBase == null && dsh?.baseURL == null && baseURL === BUILTIN_BASE_URL;
  const usedBuiltinModel = envModel == null && !dshModel && model === BUILTIN_MODEL;
  if (usedBuiltinKey || usedBuiltinBase || usedBuiltinModel) from.push('builtin:magpie');

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
