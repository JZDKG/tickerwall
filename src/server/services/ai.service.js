/* ================================================================== *
 * AI 问财编排服务（Milestone 2）
 *
 * 职责：
 *   · 模型配置的读写与连通性测试（明文密钥只在服务内部流转，出参一律脱敏）；
 *   · 会话与消息落库；
 *   · ask() 的自主多轮取数：原生 tools 优先，不支持时自动降级 ReAct JSON。
 *
 * 事实边界写在 system prompt 里，但真正的保证来自工具信封：
 * source / asOf / stale / staleReason 会随 tool_result 一起交给模型，
 * 模型被要求原样转述，前端也能从 toolTrace 里复核。
 * ================================================================== */

import {
  maskApiKey,
  listAiModels,
  getAiModel,
  getAiModelSecret,
  upsertAiModel,
  deleteAiModel,
  setDefaultAiModel,
  createAiSession,
  listAiSessions,
  getAiSession,
  deleteAiSession,
  appendAiMessage,
  touchAiSession,
} from '../db/ai.js';
import { readDshLlmConfig } from '../providers/llm.js';
import { streamChatCompletion, testModelConnection, isToolUnsupportedError } from '../providers/ai-client.js';
import { INSTRUMENTS, DETAIL_ONLY_INSTRUMENTS, findInstrument } from '../providers/instruments.js';
import { createAiToolRegistry } from './ai-tools.service.js';

const MAX_TOOL_ROUNDS = 6;

const objectOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const strOf = (v) => (typeof v === 'string' ? v.trim() : '');

function serviceError(message, { statusCode = 400, code = null } = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function abortError() {
  return serviceError('已取消', { statusCode: 499, code: 'ABORTED' });
}

function modelNotConfigured() {
  return serviceError('尚未配置可用的 AI 模型，请先在设置中添加模型或配置 .env', {
    statusCode: 400,
    code: 'MODEL_NOT_CONFIGURED',
  });
}

function readOnlyEnv() {
  return serviceError('环境变量默认模型是只读的，请通过 .env 修改', {
    statusCode: 400,
    code: 'MODEL_READ_ONLY',
  });
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 跨工具轮次续写文本时补齐空行，避免上轮过渡语粘到下轮 Markdown 标题前缀 */
function roundBoundaryGap(existing, next) {
  if (!existing || /^\n/.test(next)) return '';
  if (existing.endsWith('\n\n')) return '';
  return existing.endsWith('\n') ? '\n' : '\n\n';
}

/**
 * 从模型输出里解析 ReAct 工具动作。
 * 只认 ```json 代码块（或整段就是 JSON）里的 {"tool":"…","args":{…}} / 数组。
 * 返回 calls 与去掉动作块后的自然语言，避免把中间 JSON 当答案发给前端。
 */
export function parseReactToolCalls(text) {
  const raw = typeof text === 'string' ? text : '';
  const calls = [];
  let cleaned = raw;

  const collect = (items) => {
    for (const item of Array.isArray(items) ? items : [items]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const name = strOf(item.tool) || strOf(item.name);
      if (!name) continue;
      calls.push({
        id: `react_${calls.length + 1}`,
        name,
        arguments: objectOf(item.args ?? item.arguments),
      });
    }
  };

  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fence.exec(raw))) {
    const parsed = tryJson(match[1].trim());
    if (!parsed) continue;
    const before = calls.length;
    collect(parsed);
    if (calls.length > before) cleaned = cleaned.replace(match[0], '');
  }

  if (!calls.length) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = tryJson(trimmed);
      if (parsed) {
        collect(parsed);
        if (calls.length) cleaned = '';
      }
    }
  }

  return { calls, cleanedText: cleaned.trim() };
}

function summarizeResult(result) {
  if (!result?.ok) return result?.error ?? '调用失败';
  if (result.note) return result.note;
  const data = result.data;
  if (Array.isArray(data)) return `${data.length} 条记录`;
  if (data && typeof data === 'object') {
    for (const key of ['quotes', 'events', 'rows', 'pairs', 'results', 'rules', 'synthetics']) {
      if (Array.isArray(data[key])) return `${key} ${data[key].length} 条`;
    }
  }
  return '已返回';
}

function pickSession(session) {
  return {
    id: session.id,
    title: session.title,
    modelId: session.modelId ?? null,
    createdAt: session.createdAt ?? null,
    updatedAt: session.updatedAt ?? null,
  };
}

/**
 * @param {object} deps 可注入 db / tools / streamChat / testConnection / readEnvConfig / now
 */
export function createAiService(deps = {}) {
  const store = {
    maskApiKey,
    listAiModels,
    getAiModel,
    getAiModelSecret,
    upsertAiModel,
    deleteAiModel,
    setDefaultAiModel,
    createAiSession,
    listAiSessions,
    getAiSession,
    deleteAiSession,
    appendAiMessage,
    touchAiSession,
    ...(deps.db ?? {}),
  };
  const tools =
    deps.tools ??
    createAiToolRegistry({
      alertsService: deps.alertsService ?? null,
      ...(deps.toolDeps ?? {}),
    });
  const streamChat = deps.streamChat ?? streamChatCompletion;
  const testConnection = deps.testConnection ?? testModelConnection;
  const readEnvConfig = deps.readEnvConfig ?? readDshLlmConfig;
  const now = deps.now ?? (() => Date.now());

  function envConfig() {
    const cfg = objectOf(readEnvConfig());
    const baseUrl = strOf(cfg.baseURL ?? cfg.baseUrl);
    const model = strOf(cfg.model);
    if (!baseUrl || !model) return null;
    return {
      id: 'env:default',
      name: '环境变量默认 (.env)',
      label: '环境变量默认 (.env)',
      protocol: 'openai',
      baseUrl,
      apiKey: typeof cfg.apiKey === 'string' ? cfg.apiKey : '',
      model,
      supportsTools: true,
      temperature: null,
      maxTokens: null,
      isEnv: true,
    };
  }

  function buildEnvPreset(models) {
    const cfg = envConfig();
    if (!cfg) return null;
    return {
      id: 'env:default',
      name: '环境变量默认 (.env)',
      protocol: 'openai',
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      hasApiKey: Boolean(cfg.apiKey),
      apiKeyMasked: store.maskApiKey(cfg.apiKey),
      isDefault: models.length === 0,
      readOnly: true,
    };
  }

  function listModels() {
    const models = store.listAiModels() ?? [];
    return { models, envPreset: buildEnvPreset(models) };
  }

  function saveModel(input) {
    const body = objectOf(input);
    if (body.id === 'env:default') throw readOnlyEnv();
    return store.upsertAiModel(body);
  }

  function removeModel(id) {
    if (id === 'env:default') throw readOnlyEnv();
    return store.deleteAiModel(id);
  }

  function setDefaultModel(id) {
    if (id === 'env:default') throw readOnlyEnv();
    return store.setDefaultAiModel(id);
  }

  function configOfRow(row) {
    return {
      id: row.id,
      name: row.name,
      label: row.name || row.model,
      protocol: row.protocol,
      baseUrl: row.baseUrl,
      apiKey: row.apiKey ?? '',
      model: row.model,
      supportsTools: row.supportsTools !== false,
      temperature: row.temperature ?? null,
      maxTokens: row.maxTokens ?? null,
      isEnv: false,
    };
  }

  function resolveModel(modelId) {
    if (modelId === 'env:default') {
      const env = envConfig();
      if (env) return env;
      throw modelNotConfigured();
    }
    if (modelId) {
      const row = store.getAiModelSecret(modelId);
      if (!row) throw serviceError('模型不存在', { statusCode: 404, code: 'MODEL_NOT_FOUND' });
      return configOfRow(row);
    }
    const models = store.listAiModels() ?? [];
    const preset = models.find((m) => m.isDefault) ?? models[0];
    if (preset) {
      const row = store.getAiModelSecret(preset.id) ?? preset;
      return configOfRow(row);
    }
    const env = envConfig();
    if (env) return env;
    throw modelNotConfigured();
  }

  function buildSystemPrompt({ reactMode, context } = {}) {
    const nowMs = now();
    const bj = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(nowMs));
    const ids = [...INSTRUMENTS, ...DETAIL_ONLY_INSTRUMENTS].map((inst) => `${inst.id}=${inst.name}`).join('、');
    const assetId = strOf(context?.assetId);
    const inst = assetId ? findInstrument(assetId) : null;
    const contextLine = assetId
      ? `当前前端上下文：用户正在查看 ${inst ? `${inst.id}（${inst.name}）` : assetId}。`
      : '';

    const lines = [
      '你是 Tickerwall 的行情研究助手，面向专业用户，用中文回答。',
      `当前北京时间：${bj}（ISO：${new Date(nowMs).toISOString()}）。`,
      `Tickerwall 标的 ID 速查：${ids}。`,
      '事实边界（硬性要求）：',
      '1. 先查工具再用实数：任何价格、涨跌幅、相关性、统计值都必须来自工具返回；没有取到就说没有，不要凭记忆补。',
      '2. 注明来源与时间：引用数字时带上 source 与 asOf；过期或延迟要说明。',
      '3. 不掩饰异常：工具返回 ok:false、stale:true 或 data 为空时，必须如实告知并说明 staleReason，不能把旧值当现值。',
      '4. 未覆盖的维度明确拒答：工具没有覆盖的资产、指标或时间范围，直接说 Tickerwall 没有这项数据，不要推测。',
      '图表可视化（前端可直接渲染 ```chart JSON 块，禁止伪造 OHLC 数值）：',
      '· 分析日 K / 区间走势且拿到真实 K 线数据时，可附带 {"type":"kline","title":"...","unit":"...","data":[{"date":"MM-DD","open":...,"high":...,"low":...,"close":...}]}。',
      '· 分析因果传导、事件冲击或跨资产联动链路时，可附带 {"type":"graph","title":"...","nodes":[{"id":"n1","label":"...","detail":"...","tone":"up|down|warn|accent|neutral"}],"edges":[{"from":"n1","to":"n2","label":"..."}]}。',
      '· 对比资金流或涨跌幅时，可附带 {"type":"bar","title":"...","unit":"...","data":[{"label":"...","value":...}]} 或 {"type":"line","title":"...","series":[{"name":"...","data":[{"label":"...","value":...}]}]}。',
    ];
    if (contextLine) lines.push(contextLine);
    if (reactMode) {
      lines.push(
        '取数模式（当前模型不支持原生工具调用）：',
        '需要数据时，只输出一个 ```json 代码块，内容为 {"tool":"工具名","args":{...}}，或工具数组 [{"tool":"工具名","args":{...}}]。',
        '信息足够时直接用 Markdown 回答，不要再输出工具调用。',
        '可用工具：',
        tools.promptSummary(),
      );
    }
    return lines.filter(Boolean).join('\n');
  }

  function buildMessages(session, question) {
    const history = Array.isArray(session?.messages)
      ? session.messages
          .filter((m) => m?.role === 'user' || m?.role === 'assistant')
          .slice(-24)
          .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
      : [];
    return [...history, { role: 'user', content: question }];
  }

  async function testModel(input = {}) {
    const body = objectOf(input);
    let config;
    if (body.id === 'env:default') {
      const env = envConfig();
      if (!env) {
        throw serviceError('环境变量未配置 LLM_BASE_URL / LLM_MODEL', {
          statusCode: 400,
          code: 'MODEL_NOT_CONFIGURED',
        });
      }
      config = env;
    } else if (body.id) {
      const row = store.getAiModelSecret(body.id);
      if (!row) throw serviceError('模型不存在', { statusCode: 404, code: 'MODEL_NOT_FOUND' });
      config = configOfRow(row);
      // 编辑已有模型但没改密码：空 apiKey 继续用库里的密钥。
      if (strOf(body.baseUrl)) config.baseUrl = strOf(body.baseUrl);
      if (strOf(body.protocol)) config.protocol = strOf(body.protocol);
      if (strOf(body.model)) config.model = strOf(body.model);
      if (strOf(body.apiKey)) config.apiKey = strOf(body.apiKey);
      if (body.supportsTools !== undefined) config.supportsTools = body.supportsTools !== false;
    } else {
      config = {
        protocol: body.protocol === 'anthropic' ? 'anthropic' : 'openai',
        baseUrl: strOf(body.baseUrl),
        apiKey: typeof body.apiKey === 'string' ? body.apiKey : '',
        model: strOf(body.model),
        supportsTools: body.supportsTools !== false,
      };
      if (!config.baseUrl || !config.model) {
        throw serviceError('baseUrl 与 model 不能为空', { statusCode: 400, code: 'INVALID_MODEL' });
      }
    }
    return testConnection(config, { timeoutMs: 15_000 });
  }

  function listSessions() {
    return store.listAiSessions();
  }

  function getSession(id) {
    return store.getAiSession(id);
  }

  function createSession(input = {}) {
    const body = objectOf(input);
    return store.createAiSession({ title: body.title, modelId: body.modelId ?? null });
  }

  function removeSession(id) {
    return store.deleteAiSession(id);
  }

  async function ask({ sessionId = null, modelId = null, question, context = null, signal = null } = {}, emit = () => {}) {
    const q = strOf(question);
    if (!q) throw serviceError('问题不能为空', { statusCode: 400, code: 'INVALID_QUESTION' });
    if (signal?.aborted) throw abortError();

    const model = resolveModel(modelId);

    let session = null;
    if (sessionId) {
      session = store.getAiSession(sessionId);
      if (!session) throw serviceError('会话不存在', { statusCode: 404, code: 'SESSION_NOT_FOUND' });
    } else {
      session = store.createAiSession({
        title: q.slice(0, 24),
        modelId: model.isEnv ? null : model.id,
      });
    }

    const messages = buildMessages(session, q);
    store.appendAiMessage({ sessionId: session.id, role: 'user', content: q });
    emit({ type: 'session', session: pickSession(session) });

    const toolTrace = [];
    let reactMode = model.supportsTools === false;
    let emittedDelta = false;
    let finalText = '';
    let usage = null;
    let round = 0;
    let completed = false;

    while (round < MAX_TOOL_ROUNDS && !completed) {
      round += 1;
      if (signal?.aborted) throw abortError();

      const useNative = !reactMode;
      let text = '';
      let roundEmitted = false;
      const calls = [];

      try {
        const stream = streamChat(model, {
          messages,
          system: buildSystemPrompt({ reactMode, context }),
          ...(useNative ? { tools: tools.definitions, toolChoice: 'auto' } : {}),
          signal,
        });
        for await (const ev of stream) {
          if (ev?.type === 'delta' && ev.text) {
            text += ev.text;
            if (useNative) {
              if (!roundEmitted) {
                const gap = roundBoundaryGap(finalText, ev.text);
                if (gap) {
                  finalText += gap;
                  emit({ type: 'delta', text: gap });
                }
              }
              roundEmitted = true;
              finalText += ev.text;
              emittedDelta = true;
              emit({ type: 'delta', text: ev.text });
            }
          } else if (ev?.type === 'tool_calls' && Array.isArray(ev.calls)) {
            calls.push(...ev.calls);
          } else if (ev?.type === 'done') {
            usage = ev.usage ?? usage;
          }
        }
      } catch (err) {
        if (signal?.aborted) throw abortError();
        if (useNative && !emittedDelta && isToolUnsupportedError(err)) {
          reactMode = true;
          round -= 1; // 当前轮不算数，用降级模式重试
          continue;
        }
        throw err;
      }

      if (!useNative) {
        const parsed = parseReactToolCalls(text);
        if (!parsed.calls.length) {
          const answer = parsed.cleanedText || text.trim();
          if (answer) {
            finalText += answer;
            emit({ type: 'delta', text: answer });
          }
          completed = true;
          break;
        }
        calls.push(...parsed.calls);
      } else if (!calls.length) {
        completed = true;
        break;
      }

      const normalizedCalls = calls.map((call, index) => ({
        id: call?.id ?? `call_${round}_${index}`,
        name: strOf(call?.name) || strOf(call?.tool),
        arguments: objectOf(call?.arguments ?? call?.args),
      }));

      // 原生模式需要把 assistant 的 tool_calls 与 tool 消息按规范回填；
      // ReAct 模式面向「不支持原生工具的模型/网关」，如果回填 toolCalls / role:'tool'
      // 在无 tools 参数的下一轮请求里会被 OpenAI/Anthropic 网关直接 400 拒绝，
      // 因此降级模式一律改用纯文本 assistant + user 观察消息。
      if (useNative) {
        messages.push({ role: 'assistant', content: text, toolCalls: normalizedCalls });
      } else {
        messages.push({ role: 'assistant', content: text });
      }

      const results = await Promise.all(
        normalizedCalls.map(async (call) => {
          const startedAt = Date.now();
          emit({ type: 'tool_start', round, id: call.id, tool: call.name, args: call.arguments });
          const result = await tools.execute(call.name, call.arguments, { signal });
          const durationMs = Date.now() - startedAt;
          const summary = summarizeResult(result);
          emit({
            type: 'tool_result',
            round,
            id: call.id,
            tool: call.name,
            ok: Boolean(result?.ok),
            source: result?.source ?? null,
            asOf: result?.asOf ?? null,
            stale: Boolean(result?.stale),
            durationMs,
            summary,
            error: result?.error ?? null,
          });
          return { call, result, durationMs, summary };
        }),
      );

      if (useNative) {
        for (const { call, result } of results) {
          messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result) });
        }
      } else {
        const observations = results
          .map(({ call, result }) => `[工具 ${call.name} 返回]\n${JSON.stringify(result)}`)
          .join('\n\n');
        messages.push({
          role: 'user',
          content: `${observations}\n\n请基于以上工具结果继续查缺或直接用 Markdown 回答；信息不足时明确说明缺什么。`,
        });
      }

      for (const { call, result, durationMs, summary } of results) {
        toolTrace.push({
          round,
          tool: call.name,
          args: call.arguments,
          ok: Boolean(result?.ok),
          source: result?.source ?? null,
          asOf: result?.asOf ?? null,
          stale: Boolean(result?.stale),
          durationMs,
          summary,
          error: result?.error ?? null,
        });
      }

      if (signal?.aborted) throw abortError();
    }

    if (!completed) {
      if (signal?.aborted) throw abortError();
      const limitNote =
        '已达到工具取数轮次上限。请基于上面已经拿到的结果直接作答，不要再请求任何工具；信息不足就明确说明缺什么。';
      try {
        for await (const ev of streamChat(model, {
          messages: [...messages, { role: 'user', content: limitNote }],
          system: buildSystemPrompt({ reactMode: false, context }),
          tools: [],
          toolChoice: 'none',
          signal,
        })) {
          if (ev?.type === 'delta' && ev.text) {
            finalText += ev.text;
            emit({ type: 'delta', text: ev.text });
          } else if (ev?.type === 'done') {
            usage = ev.usage ?? usage;
          }
        }
      } catch (err) {
        if (signal?.aborted) throw abortError();
        throw err;
      }
    }

    const content = finalText.trim();
    if (!content) throw serviceError('模型没有返回内容', { statusCode: 502, code: 'EMPTY_ANSWER' });

    const message = store.appendAiMessage({
      sessionId: session.id,
      role: 'assistant',
      content,
      toolTrace: toolTrace.length ? toolTrace : null,
      modelLabel: model.label ?? model.name ?? model.model,
    });
    emit({ type: 'done', sessionId: session.id, message, usage });
    return { sessionId: session.id, message, usage };
  }

  return {
    listModels,
    saveModel,
    removeModel,
    setDefaultModel,
    testModel,
    listSessions,
    getSession,
    createSession,
    removeSession,
    ask,
  };
}
