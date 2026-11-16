/* ================================================================== *
 * LLM 网关适配器：OpenAI 兼容协议与 Anthropic 原生协议
 *
 * 上层（问财服务）不应该关心 SSE 长得什么样，所以这里把两种协议都归一成
 * 同一串事件：
 *   { type:'delta', text }                      文本增量
 *   { type:'tool_calls', calls:[{id,name,arguments}] }  工具调用（arguments 已解析）
 *   { type:'done', finishReason, usage }        结束原因与 token 用量
 *
 * 约定：
 *   · 请求消息用中立形状 { role, content, toolCallId?, toolCalls? }，
 *     既接受 camelCase 也接受 OpenAI 的 snake_case；
 *   · 工具定义接受 { name, description, parameters } 或 OpenAI 的
 *     { type:'function', function:{...} }，内部再转成各家格式；
 *   · 没有 apiKey 时不发空的 Authorization / x-api-key（本地网关常见）。
 * ================================================================== */

import { fetchResponse } from './http.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096;

/* ------------------------------ URL 规范化 ------------------------------ */

function parseBaseUrl(baseUrl) {
  const raw = String(baseUrl ?? '').trim();
  if (!raw) throw new Error('baseUrl 不能为空');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('baseUrl 不是合法的 URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('baseUrl 只支持 http/https');
  }
  return url.toString().replace(/\/+$/, '');
}

/** OpenAI 兼容端点：baseUrl 通常已含 /v1，这里只补 /chat/completions */
export function normalizeOpenAiUrl(baseUrl) {
  const base = parseBaseUrl(baseUrl);
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

/** Anthropic 端点：根地址补 /v1/messages，已带 /v1 的只补 /messages */
export function normalizeAnthropicUrl(baseUrl) {
  const base = parseBaseUrl(baseUrl);
  if (/\/messages$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/* ------------------------------ 错误识别 ------------------------------ */

/**
 * 判断错误是不是「该模型/网关不支持工具调用」。
 * 只认 400/422 或明确写着 unsupported 的文案 —— 网络错误、鉴权错误
 * 不能误判成「关掉工具再试一次」。
 */
export function isToolUnsupportedError(err) {
  if (!err) return false;
  const status = Number(err.status ?? 0);
  const text = `${err.message ?? ''} ${err.body ?? ''}`.toLowerCase();
  if (!/\btools?\b|function[_ ]?call|tool_choice|tool use/.test(text)) return false;
  if (status === 400 || status === 422) return true;
  return /(unsupport|not support|does not support|not allowed|unrecognized|unknown|invalid|不支持)/.test(
    text,
  );
}

/* ------------------------------ 配置与消息 ------------------------------ */

function resolveConfig(config = {}) {
  const protocol = String(config.protocol ?? 'openai').toLowerCase();
  if (protocol !== 'openai' && protocol !== 'anthropic') {
    throw new Error('协议必须是 openai 或 anthropic');
  }
  const model = String(config.model ?? '').trim();
  if (!model) throw new Error('模型标识不能为空');
  return {
    protocol,
    url: protocol === 'openai' ? normalizeOpenAiUrl(config.baseUrl) : normalizeAnthropicUrl(config.baseUrl),
    apiKey: config.apiKey == null ? '' : String(config.apiKey),
    model,
    supportsTools: config.supportsTools !== false,
    temperature: config.temperature ?? null,
    maxTokens: config.maxTokens ?? null,
  };
}

function textOf(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    // 已经是 content blocks 的，尽量提取文本；工具块由 toolCalls 单独处理
    return content.map((b) => (typeof b === 'string' ? b : b?.text ?? '')).join('');
  }
  return String(content);
}

function parseArguments(value) {
  if (value == null || value === '') return {};
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    // 半截 JSON 不抛错：交给调用方决定是重试还是展示原文
    return value;
  }
}

/** 兼容中立 toolCalls 与 OpenAI tool_calls，统一成 { id, name, arguments } */
function toolCallsOf(message) {
  const raw = message.toolCalls ?? message.tool_calls;
  if (!Array.isArray(raw)) return [];
  return raw.map((call, index) => {
    const fn = call.function ?? {};
    return {
      id: call.id ?? call.tool_call_id ?? `call_${index}`,
      name: call.name ?? fn.name ?? '',
      arguments: parseArguments(call.arguments ?? call.input ?? fn.arguments ?? fn.input),
    };
  });
}

function toOpenAiTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return null;
  return tools.map((tool) => {
    if (tool?.type === 'function' && tool.function) return tool;
    return {
      type: 'function',
      function: {
        name: tool.name ?? '',
        description: tool.description ?? '',
        parameters: tool.parameters ?? tool.input_schema ?? { type: 'object', properties: {} },
      },
    };
  });
}

function toAnthropicTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return null;
  return tools
    .map((tool) => ({
      name: tool.name ?? tool.function?.name ?? '',
      description: tool.description ?? tool.function?.description ?? '',
      input_schema:
        tool.input_schema ?? tool.parameters ?? tool.function?.parameters ?? { type: 'object', properties: {} },
    }))
    .filter((tool) => tool.name);
}

function toOpenAiMessages(messages = [], system = '') {
  const out = [];
  if (system) out.push({ role: 'system', content: String(system) });
  for (const message of messages) {
    if (message.role === 'system') {
      out.push({ role: 'system', content: textOf(message.content) });
      continue;
    }
    if (message.role === 'tool' || message.role === 'function') {
      out.push({
        role: 'tool',
        tool_call_id: message.toolCallId ?? message.tool_call_id ?? '',
        content: textOf(message.content),
      });
      continue;
    }
    if (message.role === 'assistant') {
      const calls = toolCallsOf(message);
      const text = textOf(message.content);
      const row = { role: 'assistant', content: calls.length && !text ? null : text };
      if (calls.length) {
        row.tool_calls = calls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments:
              typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? {}),
          },
        }));
      }
      out.push(row);
      continue;
    }
    out.push({ role: 'user', content: textOf(message.content) });
  }
  return out;
}

function systemOf(messages = [], system = '') {
  const parts = [];
  if (system) parts.push(String(system));
  for (const message of messages) {
    if (message.role === 'system' && message.content) parts.push(textOf(message.content));
  }
  return parts.join('\n\n');
}

function toAnthropicMessages(messages = []) {
  const out = [];
  const push = (role, blocks) => {
    if (!blocks.length) return;
    const prev = out[out.length - 1];
    // 连续多个 tool_result 必须合并进同一条 user 消息，否则 Anthropic 会拒绝
    if (
      prev &&
      prev.role === 'user' &&
      role === 'user' &&
      blocks.every((b) => b.type === 'tool_result') &&
      prev.content.every((b) => b.type === 'tool_result')
    ) {
      prev.content.push(...blocks);
      return;
    }
    out.push({ role, content: blocks });
  };

  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'tool' || message.role === 'function') {
      push('user', [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId ?? message.tool_call_id ?? '',
          content: textOf(message.content),
        },
      ]);
      continue;
    }
    if (message.role === 'assistant') {
      const blocks = [];
      const text = textOf(message.content);
      if (text) blocks.push({ type: 'text', text });
      for (const call of toolCallsOf(message)) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.arguments && typeof call.arguments === 'object' ? call.arguments : {},
        });
      }
      push('assistant', blocks);
      continue;
    }
    if (Array.isArray(message.content)) {
      push('user', message.content);
      continue;
    }
    push('user', [{ type: 'text', text: textOf(message.content) }]);
  }
  return out;
}

function temperatureOf(config, opts) {
  const raw = opts.temperature !== undefined ? opts.temperature : config.temperature;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function maxTokensOf(config, opts) {
  const raw = opts.maxTokens !== undefined ? opts.maxTokens : config.maxTokens;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function buildOpenAiPayload(cfg, opts, stream) {
  const payload = {
    model: cfg.model,
    messages: toOpenAiMessages(opts.messages, opts.system),
    stream,
  };
  const tools = cfg.supportsTools ? toOpenAiTools(opts.tools) : null;
  if (tools) {
    payload.tools = tools;
    if (opts.toolChoice !== undefined) payload.tool_choice = opts.toolChoice;
  }
  const temperature = temperatureOf(cfg, opts);
  if (temperature != null) payload.temperature = temperature;
  const maxTokens = maxTokensOf(cfg, opts);
  if (maxTokens != null) payload.max_tokens = maxTokens;
  return payload;
}

function buildAnthropicPayload(cfg, opts, stream) {
  const messages = toAnthropicMessages(opts.messages);
  if (!messages.length) throw new Error('messages 不能为空');
  const payload = {
    model: cfg.model,
    max_tokens: maxTokensOf(cfg, opts) ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
    messages,
    stream,
  };
  const system = systemOf(opts.messages, opts.system);
  if (system) payload.system = system;
  const tools = cfg.supportsTools ? toAnthropicTools(opts.tools) : null;
  if (tools) {
    payload.tools = tools;
    if (opts.toolChoice !== undefined) payload.tool_choice = opts.toolChoice;
  }
  const temperature = temperatureOf(cfg, opts);
  if (temperature != null) payload.temperature = temperature;
  return payload;
}

function requestHeaders(cfg, stream) {
  const headers = {
    'content-type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
  };
  if (cfg.protocol === 'anthropic') {
    if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }
  return headers;
}

/* ------------------------------ SSE 解析 ------------------------------ */

function isEventStream(res) {
  return /text\/event-stream/i.test(res.headers?.get?.('content-type') ?? '');
}

function isJsonResponse(res) {
  return /json/i.test(res.headers?.get?.('content-type') ?? '');
}

/** 从 Response body 里逐块取出 SSE 的 data 字段 */
async function* sseData(res) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
    }
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (;;) {
        const match = /\r?\n\r?\n/.exec(buf);
        if (!match) break;
        const block = buf.slice(0, match.index);
        buf = buf.slice(match.index + match[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
    }
    buf += decoder.decode();
    if (buf.trim()) {
      const data = buf
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
    }
  } finally {
    reader.releaseLock?.();
  }
}

async function readJson(res, label) {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} 响应不是合法 JSON`);
  }
}

/* ------------------------------ 用量归一 ------------------------------ */

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildUsage(inputTokens, outputTokens, totalTokens = null) {
  if (inputTokens == null && outputTokens == null && totalTokens == null) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
  };
}

function openAiUsage(usage) {
  if (!usage) return null;
  const inputTokens = finite(usage.prompt_tokens);
  const outputTokens = finite(usage.completion_tokens);
  const totalTokens = finite(usage.total_tokens);
  return buildUsage(inputTokens, outputTokens, totalTokens);
}

/* ------------------------------ OpenAI ------------------------------ */

function* openAiJsonEvents(json) {
  if (json?.error) throw new Error(`OpenAI 错误：${json.error.message ?? JSON.stringify(json.error)}`);
  const choice = json?.choices?.[0] ?? {};
  const text = choice.message?.content;
  if (typeof text === 'string' && text) yield { type: 'delta', text };
  const rawCalls = choice.message?.tool_calls;
  if (Array.isArray(rawCalls) && rawCalls.length) {
    yield {
      type: 'tool_calls',
      calls: rawCalls.map((call, index) => ({
        id: call.id ?? `call_${index}`,
        name: call.function?.name ?? '',
        arguments: parseArguments(call.function?.arguments),
      })),
    };
  }
  yield {
    type: 'done',
    finishReason: choice.finish_reason ?? null,
    usage: openAiUsage(json?.usage),
  };
}

async function* streamOpenAi(cfg, res, wantsStream) {
  const useSse = isEventStream(res) || (wantsStream && !isJsonResponse(res));
  if (!useSse) {
    yield* openAiJsonEvents(await readJson(res, 'OpenAI'));
    return;
  }

  const toolMap = new Map();
  let finishReason = null;
  let usageRaw = null;

  for await (const data of sseData(res)) {
    if (data.trim() === '[DONE]') break;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      // SSE 心跳 / 注释 / 非 JSON 行直接跳过
      continue;
    }
    if (json?.error) throw new Error(`OpenAI 错误：${json.error.message ?? JSON.stringify(json.error)}`);
    if (json?.usage) usageRaw = { ...(usageRaw ?? {}), ...json.usage };

    const choice = json?.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};
    if (typeof delta.content === 'string' && delta.content) {
      yield { type: 'delta', text: delta.content };
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = Number.isInteger(part.index) ? part.index : toolMap.size;
        const cur = toolMap.get(index) ?? { id: '', name: '', arguments: '' };
        if (part.id) cur.id = part.id;
        if (part.function?.name) cur.name += part.function.name;
        if (part.function?.arguments) cur.arguments += part.function.arguments;
        toolMap.set(index, cur);
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  const calls = [...toolMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, call]) => ({
      id: call.id || `call_${index}`,
      name: call.name,
      arguments: parseArguments(call.arguments),
    }));
  if (calls.length) yield { type: 'tool_calls', calls };
  yield { type: 'done', finishReason, usage: openAiUsage(usageRaw) };
}

/* ------------------------------ Anthropic ------------------------------ */

function* anthropicJsonEvents(json) {
  if (json?.type === 'error' || json?.error) {
    throw new Error(`Anthropic 错误：${json.error?.message ?? JSON.stringify(json.error ?? json)}`);
  }
  const calls = [];
  for (const block of json?.content ?? []) {
    if (block?.type === 'text' && block.text) yield { type: 'delta', text: block.text };
    if (block?.type === 'tool_use') {
      calls.push({ id: block.id ?? '', name: block.name ?? '', arguments: block.input ?? {} });
    }
  }
  if (calls.length) yield { type: 'tool_calls', calls };
  yield {
    type: 'done',
    finishReason: json?.stop_reason ?? null,
    usage: buildUsage(finite(json?.usage?.input_tokens), finite(json?.usage?.output_tokens)),
  };
}

async function* streamAnthropic(cfg, res, wantsStream) {
  const useSse = isEventStream(res) || (wantsStream && !isJsonResponse(res));
  if (!useSse) {
    yield* anthropicJsonEvents(await readJson(res, 'Anthropic'));
    return;
  }

  const toolBlocks = new Map();
  let finishReason = null;
  let inputTokens = null;
  let outputTokens = null;

  for await (const data of sseData(res)) {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    switch (event?.type) {
      case 'message_start':
        inputTokens = finite(event.message?.usage?.input_tokens) ?? inputTokens;
        outputTokens = finite(event.message?.usage?.output_tokens) ?? outputTokens;
        break;
      case 'content_block_start': {
        const block = event.content_block ?? {};
        if (block.type === 'text' && block.text) yield { type: 'delta', text: block.text };
        if (block.type === 'tool_use') {
          const hasInput = block.input && typeof block.input === 'object' && Object.keys(block.input).length;
          toolBlocks.set(event.index ?? toolBlocks.size, {
            id: block.id ?? '',
            name: block.name ?? '',
            arguments: hasInput ? JSON.stringify(block.input) : '',
          });
        }
        break;
      }
      case 'content_block_delta': {
        const delta = event.delta ?? {};
        if (delta.type === 'text_delta' && delta.text) yield { type: 'delta', text: delta.text };
        if (delta.type === 'input_json_delta') {
          const cur = toolBlocks.get(event.index) ?? { id: '', name: '', arguments: '' };
          cur.arguments += delta.partial_json ?? '';
          toolBlocks.set(event.index, cur);
        }
        break;
      }
      case 'message_delta':
        if (event.delta?.stop_reason) finishReason = event.delta.stop_reason;
        inputTokens = finite(event.usage?.input_tokens) ?? inputTokens;
        outputTokens = finite(event.usage?.output_tokens) ?? outputTokens;
        break;
      case 'error':
        throw new Error(`Anthropic 错误：${event.error?.message ?? '未知错误'}`);
      default:
        break;
    }
  }

  const calls = [...toolBlocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, block]) => ({
      id: block.id || `call_${index}`,
      name: block.name,
      arguments: parseArguments(block.arguments),
    }));
  if (calls.length) yield { type: 'tool_calls', calls };
  yield { type: 'done', finishReason, usage: buildUsage(inputTokens, outputTokens) };
}

/* ------------------------------ 对外 API ------------------------------ */

/**
 * 发起一次对话，按增量产出事件。
 * `opts.stream === false` 时请求非流式，但产出的事件形状完全相同，
 * 调用方不需要为两种模式写两套消费逻辑。
 */
export async function* streamChatCompletion(config, opts = {}) {
  const cfg = resolveConfig(config);
  const wantsStream = opts.stream !== false;
  if (!Array.isArray(opts.messages) || !opts.messages.length) throw new Error('messages 不能为空');
  const payload =
    cfg.protocol === 'anthropic'
      ? buildAnthropicPayload(cfg, opts, wantsStream)
      : buildOpenAiPayload(cfg, opts, wantsStream);
  if (cfg.protocol === 'openai' && !payload.messages.length) throw new Error('messages 不能为空');

  const res = await fetchResponse(cfg.url, {
    method: 'POST',
    headers: requestHeaders(cfg, wantsStream),
    body: JSON.stringify(payload),
    timeoutMs: opts.timeoutMs ?? config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: opts.signal ?? null,
  });

  if (cfg.protocol === 'anthropic') yield* streamAnthropic(cfg, res, wantsStream);
  else yield* streamOpenAi(cfg, res, wantsStream);
}

/** 把流事件收成一次性结果，适合后台任务与「先想清楚再一次性返回」的场景 */
export async function collectChatCompletion(config, opts = {}) {
  let text = '';
  const toolCalls = [];
  let finishReason = null;
  let usage = null;
  for await (const event of streamChatCompletion(config, opts)) {
    if (event.type === 'delta') text += event.text;
    else if (event.type === 'tool_calls') toolCalls.push(...event.calls);
    else if (event.type === 'done') {
      finishReason = event.finishReason;
      usage = event.usage;
    }
  }
  return { text, toolCalls, finishReason, usage };
}

/**
 * 设置页的「测试连接」：不抛错，把失败转成可展示的结果。
 * 用极小的 max_tokens，避免测试动作本身产生明显费用。
 */
export async function testModelConnection(config, opts = {}) {
  const startedAt = Date.now();
  const model = config?.model ?? null;
  try {
    const result = await collectChatCompletion(config, {
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 16,
      temperature: 0,
      stream: false,
      timeoutMs: opts.timeoutMs ?? 15_000,
      signal: opts.signal,
    });
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      model,
      reply: result.text.slice(0, 200),
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      model,
      error: err?.message ?? String(err),
    };
  }
}
