/* ================================================================== *
 * LLM 网关适配器：URL 规范化、SSE 解析、工具调用拼装与错误边界
 *
 * 所有请求都通过 setFetcher 回放，零真实网络。
 * ================================================================== */

import { describe, it, expect, afterEach } from 'vitest';
import {
  normalizeOpenAiUrl,
  normalizeAnthropicUrl,
  isToolUnsupportedError,
  streamChatCompletion,
  collectChatCompletion,
  testModelConnection,
} from '../src/server/providers/ai-client.js';
import { fetchResponse, setFetcher, UA } from '../src/server/providers/http.js';

afterEach(() => setFetcher(null));

function sseResponse(events, status = 200) {
  const body = `${events.map((e) => (typeof e === 'string' ? e : `data: ${JSON.stringify(e)}`)).join('\n\n')}\n\n`;
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function collectEvents(config, opts) {
  const events = [];
  for await (const event of streamChatCompletion(config, opts)) events.push(event);
  return events;
}

const OPENAI = {
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1/',
  apiKey: 'sk-test-123456',
  model: 'gpt-4o-mini',
};

const ANTHROPIC = {
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'ak-test-123456',
  model: 'claude-sonnet-5-5',
};

/* ------------------------------ URL ------------------------------ */

describe('URL 规范化', () => {
  it('OpenAI：补 /chat/completions，已带则不重复', () => {
    expect(normalizeOpenAiUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(normalizeOpenAiUrl('https://api.openai.com/v1///')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(normalizeOpenAiUrl('http://127.0.0.1:3425/v1/chat/completions/')).toBe(
      'http://127.0.0.1:3425/v1/chat/completions',
    );
  });

  it('Anthropic：根地址补 /v1/messages，已带 /v1 或 /messages 不重复', () => {
    expect(normalizeAnthropicUrl('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(normalizeAnthropicUrl('https://api.anthropic.com/v1/')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(normalizeAnthropicUrl('https://proxy.local/anthropic/v1/messages/')).toBe(
      'https://proxy.local/anthropic/v1/messages',
    );
  });

  it('空值、非法 URL、非 http(s) 都抛出可读错误', () => {
    for (const bad of ['', null, 'not a url']) {
      expect(() => normalizeOpenAiUrl(bad)).toThrow(/baseUrl/);
      expect(() => normalizeAnthropicUrl(bad)).toThrow(/baseUrl/);
    }
    expect(() => normalizeOpenAiUrl('ftp://example.com')).toThrow('只支持 http/https');
    expect(() => normalizeAnthropicUrl('file:///tmp/x')).toThrow('只支持 http/https');
  });
});

/* ------------------------------ 错误识别 ------------------------------ */

describe('isToolUnsupportedError', () => {
  it('识别 400/422 的工具不支持错误', () => {
    const err = new Error('HTTP 400: {"error":{"message":"tools is not supported"}}');
    err.status = 400;
    expect(isToolUnsupportedError(err)).toBe(true);

    const err422 = new Error('HTTP 422: tool_choice is not supported by this model');
    err422.status = 422;
    expect(isToolUnsupportedError(err422)).toBe(true);
  });

  it('不带状态码但文案明确时也识别', () => {
    expect(isToolUnsupportedError(new Error('This model does not support tools'))).toBe(true);
    expect(isToolUnsupportedError(new Error('function calling is not allowed'))).toBe(true);
  });

  it('网络错误、鉴权错误、普通 400 不误判', () => {
    expect(isToolUnsupportedError(null)).toBe(false);
    expect(isToolUnsupportedError(new Error('请求超时'))).toBe(false);
    const auth = new Error('HTTP 401: invalid api key');
    auth.status = 401;
    expect(isToolUnsupportedError(auth)).toBe(false);
    const badTemp = new Error('HTTP 400: temperature must be <= 2');
    badTemp.status = 400;
    expect(isToolUnsupportedError(badTemp)).toBe(false);
    const server = new Error('HTTP 500: tool execution failed');
    server.status = 500;
    expect(isToolUnsupportedError(server)).toBe(false);
  });
});

/* ------------------------------ OpenAI ------------------------------ */

describe('OpenAI 兼容协议', () => {
  it('流式：文本增量、分片工具参数、结束原因与用量', async () => {
    let captured;
    setFetcher(async (url, init) => {
      captured = { url, init };
      return sseResponse([
        { choices: [{ delta: { content: '你' } }] },
        { choices: [{ delta: { content: '好' }, finish_reason: null }] },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_1', function: { name: 'get_quote', arguments: '{"sym' } },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: 'bol":"btc"}' } }],
              },
            },
          ],
        },
        {
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
        },
        '[DONE]',
      ]);
    });

    const events = await collectEvents(OPENAI, {
      messages: [
        { role: 'system', content: '你在看行情' },
        { role: 'user', content: 'BTC 多少？' },
      ],
      temperature: 0.2,
      maxTokens: 128,
      tools: [{ name: 'get_quote', description: '查价', parameters: { type: 'object', properties: {} } }],
    });

    expect(captured.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(captured.init.headers.Authorization).toBe('Bearer sk-test-123456');
    const body = JSON.parse(captured.init.body);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(128);
    expect(body.messages[0]).toEqual({ role: 'system', content: '你在看行情' });
    expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'get_quote' } });

    expect(events).toEqual([
      { type: 'delta', text: '你' },
      { type: 'delta', text: '好' },
      {
        type: 'tool_calls',
        calls: [{ id: 'call_1', name: 'get_quote', arguments: { symbol: 'btc' } }],
      },
      {
        type: 'done',
        finishReason: 'tool_calls',
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      },
    ]);
  });

  it('非流式 JSON 兜底产出同一套事件', async () => {
    setFetcher(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '答案',
              tool_calls: [
                { id: 'call_9', function: { name: 'get_quote', arguments: '{"symbol":"gold"}' } },
              ],
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    );

    const events = await collectEvents(OPENAI, { messages: [{ role: 'user', content: 'hi' }] });
    expect(events).toEqual([
      { type: 'delta', text: '答案' },
      { type: 'tool_calls', calls: [{ id: 'call_9', name: 'get_quote', arguments: { symbol: 'gold' } }] },
      {
        type: 'done',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ]);
  });

  it('没有 apiKey 时不发空 Authorization，非 JSON 行被跳过', async () => {
    let captured;
    setFetcher(async (url, init) => {
      captured = init;
      return sseResponse([
        ': keep-alive',
        'data: not-json',
        { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
        '[DONE]',
      ]);
    });
    const events = await collectEvents({ ...OPENAI, apiKey: '' }, {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(captured.headers.Authorization).toBeUndefined();
    expect(events[0]).toEqual({ type: 'delta', text: 'ok' });
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'stop', usage: null });
  });

  it('SSE 分块跨越 UTF-8 与 JSON 边界时仍正确解析，且不要求末尾空行', async () => {
    const event = { choices: [{ delta: { content: '行情' }, finish_reason: 'stop' }] };
    const bytes = new TextEncoder().encode(
      `data: ${JSON.stringify(event)}\r\n\r\ndata: [DONE]`,
    );
    // 3 字节一刀：必然切进中文字符与 JSON 内部，同时覆盖 CRLF
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 3) chunks.push(bytes.slice(i, i + 3));
    setFetcher(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk);
              controller.close();
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );

    const events = await collectEvents(OPENAI, { messages: [{ role: 'user', content: 'hi' }] });
    expect(events).toEqual([
      { type: 'delta', text: '行情' },
      { type: 'done', finishReason: 'stop', usage: null },
    ]);
  });

  it('流内 error 事件与 HTTP 错误都会抛出', async () => {
    setFetcher(async () => sseResponse([{ error: { message: 'boom' } }]));
    await expect(
      collectChatCompletion(OPENAI, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('OpenAI 错误：boom');

    setFetcher(async () => new Response('unauthorized', { status: 401 }));
    await expect(
      collectChatCompletion(OPENAI, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/HTTP 401/);
  });

  it('声明 JSON 但响应不是 JSON 时给出可读错误', async () => {
    setFetcher(
      async () =>
        new Response('oops', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await expect(
      collectChatCompletion(OPENAI, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('OpenAI 响应不是合法 JSON');
  });

  it('消息转换：assistant toolCalls 与 tool 结果使用 OpenAI 字段', async () => {
    let body;
    setFetcher(async (url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
    });
    await collectChatCompletion(OPENAI, {
      messages: [
        { role: 'user', content: '查价' },
        { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'get_quote', arguments: { symbol: 'btc' } }] },
        { role: 'tool', toolCallId: 't1', content: '{"price":1}' },
      ],
    });
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 't1', type: 'function', function: { name: 'get_quote', arguments: '{"symbol":"btc"}' } },
      ],
    });
    expect(body.messages[2]).toEqual({ role: 'tool', tool_call_id: 't1', content: '{"price":1}' });
  });

  it('空 messages 与未知协议在发请求前就拒绝', async () => {
    setFetcher(async () => {
      throw new Error('不该发请求');
    });
    await expect(collectChatCompletion(OPENAI, { messages: [] })).rejects.toThrow('messages 不能为空');
    await expect(
      collectChatCompletion({ ...OPENAI, protocol: 'gemini' }, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('协议必须是 openai 或 anthropic');
  });
});

/* ------------------------------ Anthropic ------------------------------ */

describe('Anthropic 原生协议', () => {
  it('流式：system 外提、工具块增量解析、usage 合并', async () => {
    let captured;
    setFetcher(async (url, init) => {
      captured = { url, init };
      return sseResponse([
        {
          type: 'message_start',
          message: { usage: { input_tokens: 7, output_tokens: 1 } },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: '黄金' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: ' 2650' },
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_quote', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"symbol":' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '"gold"}' },
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 9 },
        },
        { type: 'message_stop' },
      ]);
    });

    const events = await collectEvents(ANTHROPIC, {
      system: '只回答行情',
      messages: [
        { role: 'system', content: '不要编造' },
        { role: 'user', content: '黄金多少？' },
        { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'f', arguments: { a: 1 } }] },
        { role: 'tool', toolCallId: 't1', content: '{"ok":true}' },
        { role: 'tool', toolCallId: 't2', content: 'x' },
      ],
      maxTokens: 256,
      tools: [{ name: 'get_quote', description: '查价', parameters: { type: 'object', properties: {} } }],
    });

    expect(captured.url).toBe('https://api.anthropic.com/v1/messages');
    expect(captured.init.headers['x-api-key']).toBe('ak-test-123456');
    expect(captured.init.headers['anthropic-version']).toBe('2023-06-01');
    expect(captured.init.headers.Authorization).toBeUndefined();

    const body = JSON.parse(captured.init.body);
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(256);
    expect(body.system).toBe('只回答行情\n\n不要编造');
    expect(body.messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: '黄金多少？' }] });
    expect(body.messages[1].content).toEqual([
      { type: 'tool_use', id: 't1', name: 'f', input: { a: 1 } },
    ]);
    expect(body.messages[2].role).toBe('user');
    expect(body.messages[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' },
      { type: 'tool_result', tool_use_id: 't2', content: 'x' },
    ]);
    expect(body.tools[0]).toEqual({
      name: 'get_quote',
      description: '查价',
      input_schema: { type: 'object', properties: {} },
    });

    expect(events).toEqual([
      { type: 'delta', text: '黄金' },
      { type: 'delta', text: ' 2650' },
      {
        type: 'tool_calls',
        calls: [{ id: 'toolu_1', name: 'get_quote', arguments: { symbol: 'gold' } }],
      },
      {
        type: 'done',
        finishReason: 'tool_use',
        usage: { inputTokens: 7, outputTokens: 9, totalTokens: 16 },
      },
    ]);
  });

  it('非流式 JSON 兜底：text / tool_use / usage', async () => {
    setFetcher(async () =>
      jsonResponse({
        content: [
          { type: 'text', text: 'hi' },
          { type: 'tool_use', id: 'toolu_2', name: 'f', input: { a: 1 } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 2, output_tokens: 3 },
      }),
    );
    const result = await collectChatCompletion(ANTHROPIC, {
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    });
    expect(result).toEqual({
      text: 'hi',
      toolCalls: [{ id: 'toolu_2', name: 'f', arguments: { a: 1 } }],
      finishReason: 'tool_use',
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    });
  });

  it('流内 error 事件向上抛出', async () => {
    setFetcher(async () =>
      sseResponse([{ type: 'error', error: { message: 'overloaded' } }]),
    );
    await expect(
      collectChatCompletion(ANTHROPIC, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('Anthropic 错误：overloaded');
  });

  it('Anthropic 空消息（只有 system）在发请求前拒绝', async () => {
    setFetcher(async () => {
      throw new Error('不该发请求');
    });
    await expect(
      collectChatCompletion(ANTHROPIC, {
        system: 'x',
        messages: [{ role: 'system', content: 'y' }],
      }),
    ).rejects.toThrow('messages 不能为空');
  });
});

/* ------------------------------ 协议边界与降级 ------------------------------ */

describe('协议边界与降级', () => {
  it('OpenAI：supportsTools=false 不带 tools，toolChoice 透传，数组 content 拍平', async () => {
    const bodies = [];
    setFetcher(async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
    });

    await collectChatCompletion(
      { ...OPENAI, supportsTools: false },
      {
        messages: [{ role: 'user', content: [{ type: 'text', text: '甲' }, '乙'] }],
        tools: [{ name: 'get_quote' }],
      },
    );
    expect(bodies[0].tools).toBeUndefined();
    expect(bodies[0].messages[0]).toEqual({ role: 'user', content: '甲乙' });

    await collectChatCompletion(OPENAI, {
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'get_quote' }],
      toolChoice: 'auto',
    });
    expect(bodies[1].tools[0]).toMatchObject({ type: 'function', function: { name: 'get_quote' } });
    expect(bodies[1].tool_choice).toBe('auto');
  });

  it('Anthropic：已是 content blocks 的用户消息原样透传', async () => {
    let body;
    setFetcher(async (url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' });
    });
    const block = { type: 'text', text: '看图' };
    await collectChatCompletion(ANTHROPIC, {
      messages: [{ role: 'user', content: [block] }],
    });
    expect(body.messages).toEqual([{ role: 'user', content: [block] }]);
  });

  it('缺少 model 时在发请求前拒绝', async () => {
    await expect(
      collectChatCompletion({ ...OPENAI, model: '  ' }, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('模型标识不能为空');
  });

  it('OpenAI 非流式 JSON 里的 error 字段会抛出', async () => {
    setFetcher(async () => jsonResponse({ error: { message: 'bad key' } }));
    await expect(
      collectChatCompletion(OPENAI, { messages: [{ role: 'user', content: 'hi' }], stream: false }),
    ).rejects.toThrow('OpenAI 错误：bad key');
  });

  it('SSE 中无 choices 的用量帧仍被保留；空 body 降级为 done', async () => {
    let call = 0;
    setFetcher(async () => {
      call += 1;
      if (call === 1) return sseResponse([{ usage: { prompt_tokens: 4 } }, '[DONE]']);
      return new Response(null, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });

    const withUsage = await collectChatCompletion(OPENAI, {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(withUsage.usage).toEqual({ inputTokens: 4, outputTokens: null, totalTokens: 4 });

    const empty = await collectChatCompletion(OPENAI, { messages: [{ role: 'user', content: 'hi' }] });
    expect(empty).toEqual({ text: '', toolCalls: [], finishReason: null, usage: null });
  });

  it('Anthropic 跳过非 JSON 心跳行后继续解析', async () => {
    setFetcher(async () =>
      sseResponse([
        'data: not-json',
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      ]),
    );
    const events = await collectEvents(ANTHROPIC, { messages: [{ role: 'user', content: 'hi' }] });
    expect(events).toEqual([
      { type: 'delta', text: 'ok' },
      { type: 'done', finishReason: 'end_turn', usage: null },
    ]);
  });
});

/* ------------------------------ 连接测试 ------------------------------ */

describe('testModelConnection', () => {
  it('成功时返回 ok/latency/reply，并使用最小请求', async () => {
    let body;
    setFetcher(async (url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse({ choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }] });
    });
    const result = await testModelConnection(OPENAI);
    expect(result.ok).toBe(true);
    expect(result.reply).toBe('pong');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(16);
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
  });

  it('失败时不抛错，返回可展示的 error', async () => {
    setFetcher(async () => new Response('down', { status: 500 }));
    const result = await testModelConnection(OPENAI);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HTTP 500/);
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('配置非法同样转成失败结果', async () => {
    const result = await testModelConnection({ ...OPENAI, baseUrl: 'ftp://x' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/http/);
  });
});

/* ------------------------------ Response 底座 ------------------------------ */

describe('fetchResponse', () => {
  it('2xx 返回原始 Response，保留自定义头与 UA 策略', async () => {
    let captured;
    setFetcher(async (url, init) => {
      captured = { url, init };
      return new Response('{"ok":true}', { status: 200 });
    });

    const res = await fetchResponse('https://example.com/x', {
      method: 'POST',
      body: '{"a":1}',
      headers: { 'X-Test': '1' },
    });
    expect(await res.json()).toEqual({ ok: true });
    expect(captured.init.method).toBe('POST');
    expect(captured.init.body).toBe('{"a":1}');
    expect(captured.init.headers['User-Agent']).toBe(UA);
    expect(captured.init.headers['X-Test']).toBe('1');

    await fetchResponse('https://example.com/y', { omitUa: true });
    expect(captured.init.headers['User-Agent']).toBeUndefined();
    expect(captured.init.headers.Accept).toBe('*/*');
  });

  it('非 2xx 抛错并附带 status 与错误片段', async () => {
    setFetcher(async () => new Response('x'.repeat(300), { status: 418 }));
    let caught;
    try {
      await fetchResponse('https://example.com/x');
    } catch (err) {
      caught = err;
    }
    expect(caught.message).toMatch(/^HTTP 418: x+/);
    expect(caught.message.length).toBeLessThan(180);
    expect(caught.status).toBe(418);
  });

  it('超时与外部 AbortSignal 都转成可读错误', async () => {
    setFetcher(
      async (url, init) =>
        new Promise((_, reject) => {
          if (init.signal.aborted) {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            return;
          }
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    await expect(fetchResponse('https://example.com/slow', { timeoutMs: 5 })).rejects.toThrow(
      '请求超时',
    );

    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      fetchResponse('https://example.com/slow', { signal: ctrl.signal, timeoutMs: 1000 }),
    ).rejects.toThrow('请求已取消');
  });

  it('响应头返回后进入流式读取期间，外部 AbortSignal 仍能中止底层请求', async () => {
    let innerSignal;
    setFetcher(async (_url, init) => {
      innerSignal = init.signal;
      return new Response('ok', { status: 200 });
    });
    const ctrl = new AbortController();
    await fetchResponse('https://example.com/stream', { signal: ctrl.signal, timeoutMs: 1000 });
    expect(innerSignal.aborted).toBe(false);
    ctrl.abort();
    expect(innerSignal.aborted).toBe(true);
  });
});
