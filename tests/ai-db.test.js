/* ================================================================== *
 * AI 问财持久层：模型脱敏、唯一默认、会话与消息
 *
 * 全部使用 :memory: 库，不碰仓库 data/。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useDatabase,
  closeDb,
  getDb,
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
  touchAiSession,
  deleteAiSession,
  appendAiMessage,
} from '../src/server/db/index.js';

const BASE = {
  name: 'OpenAI',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1/',
  apiKey: 'sk-1234567890abcdef',
  model: 'gpt-4o-mini',
};

beforeEach(() => {
  useDatabase(':memory:');
});

afterEach(() => {
  closeDb();
  vi.useRealTimers();
});

describe('maskApiKey', () => {
  it('空值返回空串，短 key 只留圆点', () => {
    expect(maskApiKey('')).toBe('');
    expect(maskApiKey(null)).toBe('');
    expect(maskApiKey(undefined)).toBe('');
    expect(maskApiKey('short')).toBe('••••');
    expect(maskApiKey('12345678')).toBe('••••');
  });

  it('长 key 保留前 3 位与后 4 位', () => {
    expect(maskApiKey('123456789')).toBe('123••••6789');
    expect(maskApiKey('sk-1234567890abcdef')).toBe('sk-••••cdef');
  });
});

describe('模型配置', () => {
  it('首条模型自动成为默认，列表绝不带明文 apiKey', () => {
    const created = upsertAiModel(BASE);
    expect(created).toMatchObject({
      name: 'OpenAI',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      supportsTools: true,
      isDefault: true,
      hasApiKey: true,
      apiKeyMasked: 'sk-••••cdef',
    });
    expect(created).not.toHaveProperty('apiKey');

    const listed = listAiModels();
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('apiKey');
    expect(JSON.stringify(listed)).not.toContain('1234567890abcdef');
  });

  it('getAiModelSecret 才返回明文，缺失时都是 null', () => {
    const created = upsertAiModel(BASE);
    expect(getAiModelSecret(created.id).apiKey).toBe(BASE.apiKey);
    expect(getAiModelSecret('nope')).toBeNull();
    expect(getAiModel('nope')).toBeNull();
  });

  it('校验名称、协议、URL 与模型标识', () => {
    expect(() => upsertAiModel({ ...BASE, name: '  ' })).toThrow('模型名称不能为空');
    expect(() => upsertAiModel({ ...BASE, protocol: 'gemini' })).toThrow('openai 或 anthropic');
    expect(() => upsertAiModel({ ...BASE, baseUrl: '' })).toThrow('baseUrl 不能为空');
    expect(() => upsertAiModel({ ...BASE, baseUrl: 'not a url' })).toThrow('不是合法的 URL');
    expect(() => upsertAiModel({ ...BASE, baseUrl: 'ftp://example.com' })).toThrow('只支持 http/https');
    expect(() => upsertAiModel({ ...BASE, model: '' })).toThrow('模型标识不能为空');
    expect(() => upsertAiModel({ ...BASE, temperature: 'hot' })).toThrow('temperature 必须是数字');
    expect(() => upsertAiModel({ ...BASE, maxTokens: 0 })).toThrow('maxTokens 必须是正整数');
    expect(() => upsertAiModel({ ...BASE, maxTokens: 1.5 })).toThrow('maxTokens 必须是正整数');
  });

  it('协议大小写与末尾斜杠会被规范化，数值字段可清空', () => {
    const created = upsertAiModel({
      ...BASE,
      protocol: 'OPENAI',
      baseUrl: 'http://127.0.0.1:3425/v1///',
      temperature: 0.2,
      maxTokens: 512,
      supportsTools: false,
    });
    expect(created.protocol).toBe('openai');
    expect(created.baseUrl).toBe('http://127.0.0.1:3425/v1');
    expect(created.temperature).toBe(0.2);
    expect(created.maxTokens).toBe(512);
    expect(created.supportsTools).toBe(false);

    const cleared = upsertAiModel({ ...created, temperature: null, maxTokens: null });
    expect(cleared.temperature).toBeNull();
    expect(cleared.maxTokens).toBeNull();
  });

  it('更新时 apiKey 省略/null 保留旧值，空串清空', () => {
    const created = upsertAiModel(BASE);
    const renamed = upsertAiModel({ ...created, name: '改名' });
    expect(renamed.name).toBe('改名');
    expect(getAiModelSecret(created.id).apiKey).toBe(BASE.apiKey);

    const kept = upsertAiModel({ ...created, apiKey: null });
    expect(getAiModelSecret(kept.id).apiKey).toBe(BASE.apiKey);

    const cleared = upsertAiModel({ ...created, apiKey: '' });
    expect(cleared.hasApiKey).toBe(false);
    expect(cleared.apiKeyMasked).toBe('');
    expect(getAiModelSecret(cleared.id).apiKey).toBe('');
  });

  it('isDefault=true 抢占唯一默认，显式 false 只取消当前这条', () => {
    const a = upsertAiModel({ ...BASE, name: 'A' });
    const b = upsertAiModel({ ...BASE, name: 'B', isDefault: true });
    expect(getAiModel(a.id).isDefault).toBe(false);
    expect(getAiModel(b.id).isDefault).toBe(true);
    expect(listAiModels().filter((m) => m.isDefault)).toHaveLength(1);

    upsertAiModel({ ...b, isDefault: false });
    expect(listAiModels().filter((m) => m.isDefault)).toHaveLength(0);

    expect(setDefaultAiModel(a.id)).toBe(true);
    expect(getAiModel(a.id).isDefault).toBe(true);
    expect(getAiModel(b.id).isDefault).toBe(false);
  });

  it('顺序为默认优先、最近更新优先、id 兜底', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const a = upsertAiModel({ ...BASE, id: 'a', name: 'A' });
    vi.setSystemTime(2_000);
    const b = upsertAiModel({ ...BASE, id: 'b', name: 'B' });
    vi.setSystemTime(3_000);
    const c = upsertAiModel({ ...BASE, id: 'c', name: 'C' });
    expect(listAiModels().map((m) => m.id)).toEqual([a.id, c.id, b.id]);

    // 同毫秒时按 id 升序
    vi.setSystemTime(3_000);
    upsertAiModel({ ...BASE, id: 'a2', name: 'A2' });
    expect(listAiModels().map((m) => m.id)).toEqual(['a', 'a2', 'c', 'b']);
  });

  it('setDefaultAiModel 对不存在的 id 返回 false 且不动现有默认', () => {
    const a = upsertAiModel(BASE);
    expect(setDefaultAiModel('missing')).toBe(false);
    expect(getAiModel(a.id).isDefault).toBe(true);
  });

  it('删除默认模型后把最近更新的剩余模型补为默认', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const a = upsertAiModel({ ...BASE, id: 'a' });
    vi.setSystemTime(2_000);
    const b = upsertAiModel({ ...BASE, id: 'b' });
    vi.setSystemTime(3_000);
    const c = upsertAiModel({ ...BASE, id: 'c' });

    expect(deleteAiModel(a.id)).toBe(true);
    expect(getAiModel(a.id)).toBeNull();
    expect(getAiModel(c.id).isDefault).toBe(true);
    expect(getAiModel(b.id).isDefault).toBe(false);

    expect(deleteAiModel('missing')).toBe(false);
    expect(deleteAiModel(c.id)).toBe(true);
    expect(getAiModel(b.id).isDefault).toBe(true);
  });
});

describe('会话与消息', () => {
  it('创建会话：标题为空用默认名，modelId 可为空', () => {
    const s = createAiSession({ title: '   ' });
    expect(s.title).toBe('新对话');
    expect(s.modelId).toBeNull();
    expect(s.messages).toEqual([]);

    const named = createAiSession({ title: '  黄金怎么看  ', modelId: 'm1' });
    expect(named.title).toBe('黄金怎么看');
    expect(named.modelId).toBe('m1');
    expect(getAiSession('missing')).toBeNull();
  });

  it('列表按最近活跃倒序，并遵守 limit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const a = createAiSession({ title: 'A' });
    vi.setSystemTime(2_000);
    const b = createAiSession({ title: 'B' });
    expect(listAiSessions().map((s) => s.id)).toEqual([b.id, a.id]);

    vi.setSystemTime(3_000);
    touchAiSession(a.id, { title: 'A2' });
    expect(listAiSessions().map((s) => s.id)).toEqual([a.id, b.id]);
    expect(listAiSessions({ limit: 1 }).map((s) => s.id)).toEqual([a.id]);
    expect(listAiSessions({ limit: 0 })).toEqual([]);
    expect(listAiSessions({ limit: 'bad' })).toHaveLength(2);
  });

  it('消息按升序回放，toolTrace 安全解析', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const s = createAiSession({ title: 'S' });
    vi.setSystemTime(11_000);
    const first = appendAiMessage({
      sessionId: s.id,
      role: 'user',
      content: '黄金现在多少？',
      modelLabel: 'gpt-4o-mini',
    });
    vi.setSystemTime(12_000);
    const second = appendAiMessage({
      sessionId: s.id,
      role: 'assistant',
      content: '约 2650。',
      toolTrace: [{ tool: 'getQuote', ok: true }],
    });
    expect(first.createdAt).toBeLessThan(second.createdAt);

    const loaded = getAiSession(s.id);
    expect(loaded.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(loaded.messages[0].modelLabel).toBe('gpt-4o-mini');
    expect(loaded.messages[1].toolTrace).toEqual([{ tool: 'getQuote', ok: true }]);
    expect(loaded.updatedAt).toBeGreaterThanOrEqual(s.updatedAt);

    // 直接写入半截 JSON：读取时降级为 null，而不是整个会话报错
    getDb()
      .prepare(
        `INSERT INTO ai_messages (id, session_id, role, content, tool_trace_json, model_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('broken', s.id, 'assistant', 'x', '{oops', null, Date.now() + 1);
    const again = getAiSession(s.id);
    expect(again.messages.find((m) => m.id === 'broken').toolTrace).toBeNull();
  });

  it('同一毫秒内连续追加仍按写入顺序回放', () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const s = createAiSession({ title: 'S' });
    const first = appendAiMessage({ sessionId: s.id, role: 'user', content: '问' });
    const second = appendAiMessage({ sessionId: s.id, role: 'assistant', content: '答' });

    expect(second.createdAt).toBe(first.createdAt + 1);
    expect(getAiSession(s.id).messages.map((m) => m.content)).toEqual(['问', '答']);
    expect(getAiSession(s.id).updatedAt).toBe(second.createdAt);
  });

  it('appendAiMessage 校验 role / sessionId，并在事务里推进会话时间', () => {
    const s = createAiSession({ title: 'S' });
    expect(() => appendAiMessage({ sessionId: s.id, role: 'system', content: 'x' })).toThrow(
      'role 必须是 user 或 assistant',
    );
    expect(() => appendAiMessage({ sessionId: '', role: 'user', content: 'x' })).toThrow(
      'sessionId 不能为空',
    );
    expect(() => appendAiMessage({ sessionId: 'missing', role: 'user', content: 'x' })).toThrow(
      '会话不存在',
    );

    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    const msg = appendAiMessage({ sessionId: s.id, role: 'user', content: 123 });
    expect(msg.content).toBe('123');
    expect(getAiSession(s.id).updatedAt).toBe(5_000);
  });

  it('touch 更新标题/模型，空标题不覆盖，modelId=null 解绑', () => {
    const s = createAiSession({ title: '旧标题', modelId: 'm1' });
    const touched = touchAiSession(s.id, { title: '   ', modelId: null });
    expect(touched.title).toBe('旧标题');
    expect(touched.modelId).toBeNull();

    const renamed = touchAiSession(s.id, { title: '新标题', modelId: 'm2' });
    expect(renamed.title).toBe('新标题');
    expect(renamed.modelId).toBe('m2');
    expect(touchAiSession('missing', { title: 'x' })).toBeNull();
  });

  it('删除会话级联删除消息', () => {
    const s = createAiSession({ title: 'S' });
    appendAiMessage({ sessionId: s.id, role: 'user', content: 'hi' });
    expect(deleteAiSession(s.id)).toBe(true);
    expect(deleteAiSession(s.id)).toBe(false);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM ai_messages WHERE session_id = ?').get(s.id).n).toBe(0);
  });
});
