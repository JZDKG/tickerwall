/* ================================================================== *
 * AI 问财编排服务（src/server/services/ai.service.js）
 *
 * 模型、会话、密钥全部用假 DB；streamChat 用脚本化异步生成器。
 * 覆盖：模型解析、env 预设脱敏、原生 tools 循环、ReAct JSON 降级、
 * 轮次上限、取消、会话落库与 toolTrace。
 * ================================================================== */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAiService, parseReactToolCalls } from '../src/server/services/ai.service.js';

const AS_OF = '2026-11-16T04:00:00.000Z';
const BJD = '2026-11-16T12:00:00+08:00';

function makeModel(overrides = {}) {
  return {
    id: 'm1',
    name: '本地模型',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen3',
    supportsTools: true,
    temperature: null,
    maxTokens: null,
    isDefault: true,
    hasApiKey: true,
    apiKeyMasked: 'sk-••••7890',
    createdAt: AS_OF,
    updatedAt: AS_OF,
    ...overrides,
  };
}

function makeDb({ models = [makeModel()], sessions = [] } = {}) {
  const state = { models: [...models], sessions: [...sessions], seq: 0 };
  const secrets = new Map(
    state.models.map((m) => [m.id, { ...m, apiKey: m.id === 'm1' ? 'sk-1234567890' : '' }]),
  );
  const db = {
    listAiModels: vi.fn(() => state.models.map((m) => ({ ...m, apiKey: undefined }))),
    getAiModelSecret: vi.fn((id) => secrets.get(id) ?? null),
    upsertAiModel: vi.fn((input) => {
      const existing = state.models.find((m) => m.id === input.id);
      const next = existing ? { ...existing, ...input } : { ...makeModel({ id: input.id ?? `m${++state.seq}`, isDefault: state.models.length === 0 }), ...input };
      if (existing) Object.assign(existing, next);
      else state.models.push(next);
      if (input.isDefault) for (const m of state.models) m.isDefault = m.id === next.id;
      return { ...next, apiKey: undefined };
    }),
    deleteAiModel: vi.fn((id) => {
      const i = state.models.findIndex((m) => m.id === id);
      if (i < 0) return false;
      state.models.splice(i, 1);
      return true;
    }),
    setDefaultAiModel: vi.fn((id) => {
      const target = state.models.find((m) => m.id === id);
      if (!target) return false;
      for (const m of state.models) m.isDefault = m.id === id;
      return true;
    }),
    createAiSession: vi.fn(({ title = '', modelId = null } = {}) => {
      const session = {
        id: `s${++state.seq}`,
        title: String(title || '').trim() || '新对话',
        modelId,
        createdAt: AS_OF,
        updatedAt: AS_OF,
        messages: [],
      };
      state.sessions.push(session);
      return { ...session, messages: [] };
    }),
    listAiSessions: vi.fn(() => state.sessions.map(({ messages, ...s }) => s)),
    getAiSession: vi.fn((id) => state.sessions.find((s) => s.id === id) ?? null),
    deleteAiSession: vi.fn((id) => {
      const i = state.sessions.findIndex((s) => s.id === id);
      if (i < 0) return false;
      state.sessions.splice(i, 1);
      return true;
    }),
    appendAiMessage: vi.fn(({ sessionId, role, content = '', toolTrace = null, modelLabel = null }) => {
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!session) throw new Error('会话不存在');
      const message = {
        id: `msg${++state.seq}`,
        sessionId,
        role,
        content,
        toolTrace,
        modelLabel,
        createdAt: AS_OF,
      };
      session.messages.push(message);
      return message;
    }),
    touchAiSession: vi.fn((id, patch = {}) => {
      const session = state.sessions.find((s) => s.id === id);
      if (!session) return null;
      if (patch.title) session.title = patch.title;
      if ('modelId' in patch) session.modelId = patch.modelId;
      return session;
    }),
    __state: state,
  };
  return db;
}

function makeTools(overrides = {}) {
  return {
    definitions: [
      { name: 'get_global_quotes', description: '报价', parameters: { type: 'object', properties: {} } },
      { name: 'get_asset_detail', description: '详情', parameters: { type: 'object', properties: {} } },
    ],
    promptSummary: vi.fn(() => 'get_global_quotes: 取全球报价\nget_asset_detail: 取资产详情'),
    execute: vi.fn(async () => ({
      ok: true,
      source: 'quotes.service',
      asOf: AS_OF,
      stale: false,
      staleReason: null,
      data: { quotes: [{ id: 'gold-intl', price: 2400 }] },
      note: null,
    })),
    ...overrides,
  };
}

/** 脚本化 streamChat：每次调用取一个事件数组；元素为 Error 时抛出 */
function makeStream(scripts) {
  const calls = [];
  const fn = vi.fn((config, opts) => {
    calls.push({ config, opts });
    const script = scripts.length > 1 ? scripts.shift() : scripts[0];
    return (async function* () {
      for (const item of script ?? []) {
        if (item instanceof Error) throw item;
        yield item;
      }
    })();
  });
  fn.calls = calls;
  return fn;
}

function makeService({ db = makeDb(), tools = makeTools(), streamChat, testConnection, readEnvConfig, now } = {}) {
  return createAiService({
    db,
    tools,
    streamChat: streamChat ?? makeStream([[{ type: 'delta', text: '默认回答' }, { type: 'done', usage: null }]]),
    testConnection: testConnection ?? vi.fn(async (config) => ({ ok: true, latencyMs: 5, model: config.model, reply: 'pong' })),
    readEnvConfig: readEnvConfig ?? vi.fn(() => ({ baseURL: '', apiKey: '', model: '', source: 'env' })),
    now: now ?? (() => Date.parse(BJD)),
  });
}

const collect = () => {
  const events = [];
  const emit = vi.fn((ev) => events.push(ev));
  return { events, emit };
};

const eventTypes = (events) => events.map((e) => e.type);

describe('模型管理', () => {
  it('listModels 返回脱敏的 env 预设，绝不泄露明文密钥', () => {
    const readEnvConfig = vi.fn(() => ({
      baseURL: 'http://env.local/v1',
      apiKey: 'sk-env-secret-123456',
      model: 'env-model',
      source: 'env',
    }));
    const svc = makeService({ db: makeDb({ models: [] }), readEnvConfig });
    const { models, envPreset } = svc.listModels();
    expect(models).toEqual([]);
    expect(envPreset).toEqual({
      id: 'env:default',
      name: '环境变量默认 (.env)',
      protocol: 'openai',
      baseUrl: 'http://env.local/v1',
      model: 'env-model',
      hasApiKey: true,
      apiKeyMasked: 'sk-••••3456',
      isDefault: true,
      readOnly: true,
    });
    expect(JSON.stringify(envPreset)).not.toContain('sk-env-secret');
  });

  it('没有 .env 配置时不返回 env 预设', () => {
    const svc = makeService({ db: makeDb({ models: [] }) });
    expect(svc.listModels().envPreset).toBeNull();
  });

  it('已有库模型时 env 预设不是默认', () => {
    const readEnvConfig = vi.fn(() => ({ baseURL: 'http://env.local/v1', apiKey: 'k', model: 'env-model' }));
    const svc = makeService({ readEnvConfig });
    expect(svc.listModels().envPreset.isDefault).toBe(false);
  });

  it('env:default 只读，保存/删除/设默认都拒绝', () => {
    const svc = makeService();
    expect(() => svc.saveModel({ id: 'env:default', name: 'x' })).toThrow(/只读/);
    expect(() => svc.removeModel('env:default')).toThrow(/只读/);
    expect(() => svc.setDefaultModel('env:default')).toThrow(/只读/);
  });

  it('saveModel / removeModel / setDefaultModel 委托给 DB', () => {
    const db = makeDb();
    const svc = makeService({ db });
    const saved = svc.saveModel({ name: '新模型', protocol: 'openai', baseUrl: 'http://x/v1', model: 'm' });
    expect(saved.name).toBe('新模型');
    expect(db.upsertAiModel).toHaveBeenCalled();
    expect(svc.setDefaultModel('m1')).toBe(true);
    expect(svc.removeModel('m2')).toBe(false);
    expect(svc.removeModel('m1')).toBe(true);
  });

  it('testModel 用库内密钥（空 apiKey 时补回）', async () => {
    const db = makeDb();
    const testConnection = vi.fn(async (config) => ({ ok: true, latencyMs: 1, model: config.model, reply: 'pong' }));
    const svc = makeService({ db, testConnection });
    const result = await svc.testModel({ id: 'm1', apiKey: '' });
    expect(result.ok).toBe(true);
    expect(testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen3', apiKey: 'sk-1234567890' }),
      expect.anything(),
    );
  });

  it('testModel 支持草稿直接测试与 env:default', async () => {
    const testConnection = vi.fn(async (config) => ({ ok: true, latencyMs: 1, model: config.model }));
    const readEnvConfig = vi.fn(() => ({ baseURL: 'http://env.local/v1', apiKey: 'env-key', model: 'env-model' }));
    const svc = makeService({ testConnection, readEnvConfig });
    await svc.testModel({ protocol: 'anthropic', baseUrl: 'http://draft/v1', apiKey: 'draft-key', model: 'draft-model' });
    expect(testConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({ protocol: 'anthropic', baseUrl: 'http://draft/v1', apiKey: 'draft-key', model: 'draft-model' }),
      expect.anything(),
    );
    await svc.testModel({ id: 'env:default' });
    expect(testConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseUrl: 'http://env.local/v1', apiKey: 'env-key', model: 'env-model' }),
      expect.anything(),
    );
  });

  it('testModel 在 env 未配置或草稿缺字段时明确报错', async () => {
    const svc = makeService();
    await expect(svc.testModel({ id: 'env:default' })).rejects.toMatchObject({ code: 'MODEL_NOT_CONFIGURED' });
    await expect(svc.testModel({ protocol: 'openai' })).rejects.toMatchObject({ code: 'INVALID_MODEL' });
  });
});

describe('会话管理', () => {
  it('增删查会话', () => {
    const db = makeDb();
    const svc = makeService({ db });
    const session = svc.createSession({ title: '黄金怎么看' });
    expect(session.title).toBe('黄金怎么看');
    expect(svc.listSessions().sessions ?? svc.listSessions()).toHaveLength(1);
    expect(svc.getSession(session.id).id).toBe(session.id);
    expect(svc.removeSession(session.id)).toBe(true);
    expect(svc.removeSession('nope')).toBe(false);
  });
});

describe('ask：原生 tools 循环', () => {
  beforeEach(() => vi.clearAllMocks());

  it('问题为空直接拒绝', async () => {
    const svc = makeService();
    await expect(svc.ask({ question: '   ' })).rejects.toThrow('问题不能为空');
  });

  it('无模型配置时抛 MODEL_NOT_CONFIGURED', async () => {
    const db = makeDb({ models: [] });
    const svc = makeService({ db });
    await expect(svc.ask({ question: '黄金怎么看' })).rejects.toMatchObject({ code: 'MODEL_NOT_CONFIGURED' });
  });

  it('显式 modelId 走库内模型，不存在时报 MODEL_NOT_FOUND', async () => {
    const db = makeDb();
    const streamChat = makeStream([[{ type: 'delta', text: '好' }, { type: 'done' }]]);
    const svc = makeService({ db, streamChat });
    await svc.ask({ question: '黄金', modelId: 'm1' }, () => {});
    expect(db.getAiModelSecret).toHaveBeenCalledWith('m1');
    expect(streamChat).toHaveBeenCalledTimes(1);

    await expect(svc.ask({ question: '黄金', modelId: 'nope' }, () => {})).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    });
  });

  it('显式 modelId=env:default 时用环境变量，未配置则 MODEL_NOT_CONFIGURED', async () => {
    const readEnvConfig = vi.fn(() => ({ baseURL: 'http://env.local/v1', apiKey: 'env-key', model: 'env-model' }));
    const db = makeDb({ models: [] });
    const streamChat = makeStream([[{ type: 'delta', text: '好' }, { type: 'done' }]]);
    const svc = makeService({ db, streamChat, readEnvConfig });
    const { events, emit } = collect();
    await svc.ask({ question: '黄金', modelId: 'env:default' }, emit);
    expect(db.createAiSession).toHaveBeenCalledWith(expect.objectContaining({ modelId: null }));
    expect(events.at(-1).message.modelLabel).toBe('环境变量默认 (.env)');

    const noEnv = makeService({ db: makeDb({ models: [] }) });
    await expect(noEnv.ask({ question: '黄金', modelId: 'env:default' }, () => {})).rejects.toMatchObject({
      code: 'MODEL_NOT_CONFIGURED',
    });
  });

  it('已有会话会带上历史消息，不存在时报 SESSION_NOT_FOUND', async () => {
    const history = [
      { id: 'h1', role: 'user', content: '上一问' },
      { id: 'h2', role: 'assistant', content: '上一答' },
      { id: 'h3', role: 'system', content: '不应带入' },
    ];
    const db = makeDb({
      sessions: [{ id: 's9', title: '旧对话', modelId: 'm1', createdAt: AS_OF, updatedAt: AS_OF, messages: history }],
    });
    const streamChat = makeStream([[{ type: 'delta', text: '继续' }, { type: 'done' }]]);
    const svc = makeService({ db, streamChat });
    await svc.ask({ question: '继续问', sessionId: 's9' }, () => {});
    const messages = streamChat.calls[0].opts.messages;
    expect(messages.slice(0, 2)).toEqual([
      { role: 'user', content: '上一问' },
      { role: 'assistant', content: '上一答' },
    ]);
    expect(messages.at(-1)).toEqual({ role: 'user', content: '继续问' });

    await expect(svc.ask({ question: '继续问', sessionId: 'nope' }, () => {})).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });

  it('自动建会话、落库 user、流式回答并落库 assistant', async () => {
    const db = makeDb();
    const streamChat = makeStream([[
      { type: 'delta', text: '黄金' },
      { type: 'delta', text: '偏强。' },
      { type: 'done', usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 } },
    ]]);
    const svc = makeService({ db, streamChat });
    const { events, emit } = collect();
    const result = await svc.ask({ question: '黄金怎么看？今天有什么驱动？' }, emit);

    expect(result.sessionId).toBe('s1');
    expect(db.createAiSession).toHaveBeenCalledWith(expect.objectContaining({ title: '黄金怎么看？今天有什么驱动？' }));
    expect(db.appendAiMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ role: 'user', content: '黄金怎么看？今天有什么驱动？' }));
    expect(db.appendAiMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ role: 'assistant', content: '黄金偏强。', modelLabel: '本地模型' }));
    expect(eventTypes(events)).toEqual(['session', 'delta', 'delta', 'done']);
    expect(events.at(-1).usage.totalTokens).toBe(13);

    const sys = streamChat.calls[0].opts.system;
    expect(sys).toContain('2026-11-16');
    expect(sys).toContain('gold-intl');
    expect(sys).toContain('先查工具');
    expect(streamChat.calls[0].opts.tools).toHaveLength(2);
  });

  it('前端上下文里的 assetId 写入 system prompt', async () => {
    const streamChat = makeStream([[{ type: 'delta', text: '好' }, { type: 'done' }]]);
    const svc = makeService({ streamChat });
    await svc.ask({ question: '这个怎么样', context: { assetId: 'gold-intl' } }, () => {});
    expect(streamChat.calls[0].opts.system).toContain('gold-intl');
    expect(streamChat.calls[0].opts.system).toContain('国际金价');
  });

  it('并行执行 tool_calls，发 tool_start/tool_result，回填 observation 后继续', async () => {
    const tools = makeTools({
      execute: vi.fn(async (name) => ({
        ok: true,
        source: 'test',
        asOf: AS_OF,
        stale: false,
        staleReason: null,
        data: { tool: name },
        note: null,
      })),
    });
    const streamChat = makeStream([
      [
        { type: 'tool_calls', calls: [
          { id: 'c1', name: 'get_global_quotes', arguments: { ids: ['gold-intl'] } },
          { id: 'c2', name: 'get_asset_detail', arguments: { id: 'gold-intl' } },
        ] },
        { type: 'done', usage: null },
      ],
      [{ type: 'delta', text: '结论：偏强。' }, { type: 'done', usage: { totalTokens: 20 } }],
    ]);
    const svc = makeService({ tools, streamChat });
    const { events, emit } = collect();
    await svc.ask({ question: '黄金怎么看' }, emit);

    expect(tools.execute).toHaveBeenCalledTimes(2);
    expect(tools.execute).toHaveBeenCalledWith('get_global_quotes', { ids: ['gold-intl'] }, expect.objectContaining({ signal: null }));
    const types = eventTypes(events);
    expect(types.filter((t) => t === 'tool_start')).toHaveLength(2);
    expect(types.filter((t) => t === 'tool_result')).toHaveLength(2);
    expect(events.find((e) => e.type === 'tool_start')).toMatchObject({ round: 1, id: 'c1', tool: 'get_global_quotes' });
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ id: 'c1', ok: true, source: 'test' });
    expect(events.at(-1).type).toBe('done');

    const secondMessages = streamChat.calls[1].opts.messages;
    expect(secondMessages.some((m) => m.role === 'assistant' && m.toolCalls?.length === 2)).toBe(true);
    expect(secondMessages.filter((m) => m.role === 'tool')).toHaveLength(2);
  });

  it('原生模式不支持 tools 时自动降级 ReAct 并重试当前轮', async () => {
    const unsupported = Object.assign(new Error('tools are not supported by this model'), { status: 400 });
    const streamChat = makeStream([
      [unsupported],
      [{ type: 'delta', text: '直接回答。' }, { type: 'done' }],
    ]);
    const svc = makeService({ streamChat });
    const { events, emit } = collect();
    await svc.ask({ question: '黄金怎么看' }, emit);
    expect(streamChat).toHaveBeenCalledTimes(2);
    expect(streamChat.calls[0].opts.tools).toHaveLength(2);
    expect(streamChat.calls[1].opts.tools).toBeUndefined();
    expect(streamChat.calls[1].opts.system).toContain('get_global_quotes');
    expect(eventTypes(events)).toEqual(['session', 'delta', 'done']);
    expect(events.at(-1).message.content).toBe('直接回答。');
  });
});

describe('ask：ReAct JSON 降级', () => {
  it('supportsTools=false 时解析 JSON 工具调用，不把动作当 delta 发出', async () => {
    const db = makeDb({ models: [makeModel({ supportsTools: false })] });
    const tools = makeTools();
    const streamChat = makeStream([
      [{ type: 'delta', text: '```json\n{"tool":"get_global_quotes","args":{"ids":["gold-intl"]}}\n```' }, { type: 'done' }],
      [{ type: 'delta', text: '金价 2400 美元。' }, { type: 'done' }],
    ]);
    const svc = makeService({ db, tools, streamChat });
    const { events, emit } = collect();
    await svc.ask({ question: '金价多少' }, emit);

    expect(streamChat.calls[0].opts.tools).toBeUndefined();
    expect(tools.execute).toHaveBeenCalledWith('get_global_quotes', { ids: ['gold-intl'] }, expect.anything());
    const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text);
    expect(deltas).toEqual(['金价 2400 美元。']);
    expect(deltas.join('')).not.toContain('"tool"');
    expect(eventTypes(events)).toContain('tool_result');
    expect(events.at(-1).type).toBe('done');
    // ReAct 下一轮不得携带原生 toolCalls 或 role:'tool'，否则不支持工具的网关会 400
    const secondMessages = streamChat.calls[1].opts.messages;
    expect(secondMessages.some((m) => m.role === 'tool' || m.toolCalls)).toBe(false);
    expect(secondMessages.at(-1)).toMatchObject({ role: 'user' });
    expect(secondMessages.at(-1).content).toContain('get_global_quotes');
  });

  it('parseReactToolCalls 支持单个对象、数组与纯文本', () => {
    expect(parseReactToolCalls('```json\n{"tool":"a","args":{"x":1}}\n```').calls).toEqual([
      { id: 'react_1', name: 'a', arguments: { x: 1 } },
    ]);
    const multi = parseReactToolCalls('先查两个\n```json\n[{"tool":"a","args":{}},{"name":"b","args":{"y":2}}]\n```');
    expect(multi.calls.map((c) => c.name)).toEqual(['a', 'b']);
    expect(multi.cleanedText).toBe('先查两个');
    expect(parseReactToolCalls('这就是答案。').calls).toEqual([]);
    expect(parseReactToolCalls('```json\n{"foo":1}\n```').calls).toEqual([]);
  });

  it('parseReactToolCalls 支持未加 fence 的整段 JSON，并忽略坏 JSON', () => {
    expect(parseReactToolCalls('{"tool":"c","args":{"n":2}}').calls).toEqual([
      { id: 'react_1', name: 'c', arguments: { n: 2 } },
    ]);
    expect(parseReactToolCalls('[{"tool":"d"},{"name":"e","arguments":{}}]').calls.map((c) => c.name)).toEqual(['d', 'e']);
    expect(parseReactToolCalls('```json\n{not json}\n```').calls).toEqual([]);
  });

  it('达到轮次上限后强制总结一轮且不再执行工具', async () => {
    const tools = makeTools();
    const toolCallScript = [{
      type: 'tool_calls',
      calls: [{ id: 'c1', name: 'get_global_quotes', arguments: {} }],
    }, { type: 'done' }];
    const summaryScript = [{ type: 'delta', text: '基于已有结果总结。' }, { type: 'done' }];
    const streamChat = makeStream([toolCallScript, toolCallScript, toolCallScript, toolCallScript, toolCallScript, toolCallScript, summaryScript]);
    const svc = makeService({ tools, streamChat });
    const { events, emit } = collect();
    await svc.ask({ question: '反复取数' }, emit);

    expect(tools.execute).toHaveBeenCalledTimes(6);
    expect(streamChat).toHaveBeenCalledTimes(7);
    expect(streamChat.calls[6].opts.tools).toEqual([]);
    expect(eventTypes(events).at(-1)).toBe('done');
    expect(events.at(-1).message.content).toBe('基于已有结果总结。');
  });

  it('已取消的 signal 不发起模型请求', async () => {
    const streamChat = vi.fn();
    const svc = makeService({ streamChat });
    const controller = new AbortController();
    controller.abort();
    await expect(svc.ask({ question: '黄金' , signal: controller.signal }, () => {})).rejects.toMatchObject({ code: 'ABORTED' });
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('原生模式遇到非工具错误直接抛出，不降级重试', async () => {
    const streamChat = makeStream([[Object.assign(new Error('Unauthorized'), { status: 401 })]]);
    const svc = makeService({ streamChat });
    await expect(svc.ask({ question: '黄金' }, () => {})).rejects.toThrow('Unauthorized');
    expect(streamChat).toHaveBeenCalledTimes(1);
  });

  it('强制总结轮失败时向上抛出', async () => {
    const toolCallScript = [
      { type: 'tool_calls', calls: [{ id: 'c1', name: 'get_global_quotes', arguments: {} }] },
      { type: 'done' },
    ];
    const streamChat = makeStream([
      toolCallScript,
      toolCallScript,
      toolCallScript,
      toolCallScript,
      toolCallScript,
      toolCallScript,
      [new Error('summary failed')],
    ]);
    const svc = makeService({ streamChat });
    await expect(svc.ask({ question: '反复取数' }, () => {})).rejects.toThrow('summary failed');
  });
});
