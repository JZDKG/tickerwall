// @vitest-environment jsdom
/* ================================================================== *
 * AI 问财（Milestone 3）
 *
 * 三层各自可单测，不靠「起浏览器点点看」：
 *   · markdown.js —— 先转义再拼标签，任何输入都不能产生可执行 HTML；
 *   · ask-models.js —— 表单校验与弹窗动作（测试连接 / 保存 / 默认 / 删除）；
 *   · ask.js —— SSE 帧解析、流式渲染、取数轨迹折叠、IME 回车与中断。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { safeMarkdownHref, markdownToSafeHtml } from '../src/client/shared/markdown.js';

const asText = (v) => String(v);

document.body.innerHTML = '<section id="ask" hidden></section>';

describe('safeMarkdownHref：只放行 http(s) 与站内安全路由', () => {
  it('http / https 原样放行并规范化', () => {
    expect(safeMarkdownHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeMarkdownHref('http://example.com')).toBe('http://example.com/');
  });

  it('站内安全 hash 路由放行', () => {
    for (const href of ['#/d/gold-intl', '#/macro', '#/events', '#/map', '#/watch', '#/ask']) {
      expect(safeMarkdownHref(href)).toBe(href);
    }
  });

  it('javascript: / data: / 相对路径 / 未知路由一律返回空串', () => {
    for (const href of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/api/ai/models',
      'api/x',
      '#/nope',
      '#/d/',
      '#/d/a b',
      '#/ask?x=1',
      '',
      '   ',
      null,
      undefined,
    ]) {
      expect(safeMarkdownHref(href)).toBe('');
    }
  });
});

describe('markdownToSafeHtml：转义优先', () => {
  it('HTML 标签整体转义，不产生可执行节点', () => {
    const out = asText(markdownToSafeHtml('<script>alert(1)</script>'));
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('加粗与行内代码里的标签也只转义一次', () => {
    const out = asText(markdownToSafeHtml('**<img src=x onerror=alert(1)>** 和 `<b>x</b>`'));
    expect(out).toContain('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>');
    expect(out).toContain('<code>&lt;b&gt;x&lt;/b&gt;</code>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('&amp;lt;');
  });

  it('javascript: 链接不渲染成 <a>，只保留文字', () => {
    const out = asText(markdownToSafeHtml('[点我](javascript:alert(1))'));
    expect(out).not.toContain('<a');
    expect(out).toContain('点我');
  });

  it('表格单元格与链接文字都先转义', () => {
    const out = asText(markdownToSafeHtml('| 名称 |\n| --- |\n| <b>x</b> |'));
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(out).not.toContain('<b>x</b>');
  });

  it('空输入返回空串（不是 null / undefined）', () => {
    expect(asText(markdownToSafeHtml(''))).toBe('');
    expect(asText(markdownToSafeHtml(null))).toBe('');
    expect(asText(markdownToSafeHtml(undefined))).toBe('');
    expect(asText(markdownToSafeHtml('   \n\n  '))).toBe('');
  });
});

describe('markdownToSafeHtml：块级结构', () => {
  it('段落之间空行分段，段内换行变 <br>', () => {
    const out = asText(markdownToSafeHtml('第一段\n第二行\n\n第二段'));
    expect(out).toContain('<p>第一段<br>第二行</p>');
    expect(out).toContain('<p>第二段</p>');
  });

  it('h2 / h3 / h4 标题', () => {
    const out = asText(markdownToSafeHtml('## 二级\n### 三级\n#### 四级'));
    expect(out).toContain('<h2>二级</h2>');
    expect(out).toContain('<h3>三级</h3>');
    expect(out).toContain('<h4>四级</h4>');
  });

  it('无序列表与有序列表', () => {
    const ul = asText(markdownToSafeHtml('- 一\n* 二\n+ 三'));
    expect(ul).toBe('<ul><li>一</li><li>二</li><li>三</li></ul>');
    const ol = asText(markdownToSafeHtml('1. 一\n2) 二'));
    expect(ol).toBe('<ol><li>一</li><li>二</li></ol>');
  });

  it('引用块保留内部行内格式', () => {
    const out = asText(markdownToSafeHtml('> 引用 **重点**\n> 第二行'));
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<strong>重点</strong>');
    expect(out).toContain('第二行');
  });

  it('围栏代码块原样保留（内部 Markdown 不再解析）', () => {
    const out = asText(markdownToSafeHtml('```js\nconst x = "<b>";\n**不是加粗**\n```'));
    expect(out).toContain('<pre class="md-code"><code>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('**不是加粗**');
    expect(out).not.toContain('<strong>');
  });

  it('未闭合的围栏也渲染到文末，不吞掉内容', () => {
    const out = asText(markdownToSafeHtml('```\n没收尾'));
    expect(out).toContain('<pre class="md-code"><code>没收尾</code></pre>');
  });

  it('分隔线渲染为 <hr>', () => {
    expect(asText(markdownToSafeHtml('---'))).toContain('<hr>');
  });

  it('段落后面紧跟块级元素（没有空行）也能正确断开', () => {
    const out = asText(markdownToSafeHtml('前言\n## 标题\n正文\n> 引用\n后文\n- 列表\n尾\n1. 有序\n结尾\n---\n末'));
    for (const piece of ['<p>前言</p>', '<h2>标题</h2>', '<blockquote>', '<ul><li>列表</li></ul>', '<ol><li>有序</li></ol>', '<hr>', '<p>末</p>']) {
      expect(out).toContain(piece);
    }
    expect(asText(markdownToSafeHtml('文字\n```\ncode\n```'))).toContain('<pre class="md-code"><code>code</code></pre>');
  });

  it('列表遇到非列表行就收束，后面的文字仍是段落', () => {
    const out = asText(markdownToSafeHtml('- 一\n- 二\n普通段落'));
    expect(out).toContain('<ul><li>一</li><li>二</li></ul>');
    expect(out).toContain('<p>普通段落</p>');
  });
});

describe('markdownToSafeHtml：链接', () => {
  it('外链带 target 与 rel，href 只转义一次', () => {
    const out = asText(markdownToSafeHtml('[详情](https://example.com/x?a=1&b=2)'));
    expect(out).toContain('href="https://example.com/x?a=1&amp;b=2"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('站内 hash 链接不加 target（同一标签页内跳转）', () => {
    const out = asText(markdownToSafeHtml('[问问 AI](#/ask)'));
    expect(out).toContain('href="#/ask"');
    expect(out).not.toContain('target="_blank"');
  });

  it('链接文字里的加粗/代码仍然生效', () => {
    const out = asText(markdownToSafeHtml('[**重点** 与 `code`](https://example.com)'));
    expect(out).toContain('<strong>重点</strong>');
    expect(out).toContain('<code>code</code>');
  });
});

describe('markdownToSafeHtml：GFM 表格', () => {
  const table = [
    '| 指标 | 数值 | 变化 |',
    '| :--- | ---: | :---: |',
    '| 国际金价 | 2,400 | +1.2% |',
    '| 美元指数 | 104.2 | -0.3% |',
  ].join('\n');

  it('渲染表头与表体，数值列右对齐并等宽', () => {
    const out = asText(markdownToSafeHtml(table));
    expect(out).toContain('<div class="md-table-wrap"><table class="md-table">');
    expect(out).toContain('<th class="is-left">指标</th>');
    expect(out).toContain('<th class="is-right is-num">数值</th>');
    expect(out).toContain('<th class="is-center is-num">变化</th>');
    expect(out).toContain('<td class="is-right is-num">2,400</td>');
    expect(out).toContain('<td class="is-center is-num">+1.2%</td>');
  });

  it('缺失单元格补空，不把行拼错位', () => {
    const out = asText(markdownToSafeHtml('| a | b |\n| --- | --- |\n| 1 |'));
    expect(out).toContain('<td class="is-num">1</td>');
    expect(out).toContain('<td class=""></td>');
  });

  it('分隔行不合法时按普通段落处理（不误判表格）', () => {
    const out = asText(markdownToSafeHtml('| 不是表格\n| 普通文本'));
    expect(out).not.toContain('<table');
    expect(out).toContain('<p>');
  });

  it('表格可以不写首尾竖线；下一行没有竖线时不算表格', () => {
    const out = asText(markdownToSafeHtml('指标 | 数值\n--- | ---\n金价 | 2400'));
    expect(out).toContain('<table class="md-table">');
    expect(out).toContain('<td class="is-num">2400</td>');
    expect(asText(markdownToSafeHtml('a | b\n不是分隔行'))).not.toContain('<table');
  });

  it('表体比表头多一列时也能补出对齐类', () => {
    const out = asText(markdownToSafeHtml('| a | b |\n| --- | --- |\n| 1 | 2 | 3 |'));
    expect(out).toContain('<td class="is-num">3</td>');
  });

  it('段落后面直接接表格（无空行）仍识别为表格', () => {
    const out = asText(markdownToSafeHtml('说明\nA | B\n--- | ---\n1 | 2'));
    expect(out).toContain('<p>说明</p>');
    expect(out).toContain('<table class="md-table">');
  });
});

/* ------------------------------------------------------------------ *
 * ask-models.js —— 模型配置弹窗
 * ------------------------------------------------------------------ */

let askModels = null;
beforeAll(async () => {
  askModels = await import('../src/client/views/ask-models.js');
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeFakeApi(initialModels = []) {
  const state = { models: initialModels.slice(), envPreset: null };
  const calls = [];
  const api = {
    async get(path) {
      calls.push(['get', path]);
      return { data: { ok: true, models: state.models, envPreset: state.envPreset }, status: 200, fetchedAt: 0 };
    },
    async post(path, body) {
      calls.push(['post', path, body]);
      if (body.action === 'test') {
        return { data: { ok: true, result: { ok: true, latencyMs: 42, model: body.model, reply: 'pong' } }, status: 200, fetchedAt: 0 };
      }
      if (body.action === 'set_default') {
        state.models = state.models.map((m) => ({ ...m, isDefault: m.id === body.id }));
        return { data: { ok: true, updated: true }, status: 200, fetchedAt: 0 };
      }
      if (body.action === 'delete') {
        state.models = state.models.filter((m) => m.id !== body.id);
        return { data: { ok: true, deleted: true }, status: 200, fetchedAt: 0 };
      }
      const saved = { ...body, id: body.id || `m${state.models.length + 1}`, isDefault: false, hasApiKey: true, apiKeyMasked: 'sk-…' };
      state.models = body.id
        ? state.models.map((m) => (m.id === body.id ? { ...m, ...saved } : m))
        : [...state.models, saved];
      return { data: { ok: true, model: saved }, status: 200, fetchedAt: 0 };
    },
  };
  return { api, state, calls };
}

const MODEL_A = {
  id: 'm1', name: '主模型', protocol: 'openai', baseUrl: 'https://api.example.com/v1',
  model: 'gpt-test', supportsTools: true, temperature: 0.3, maxTokens: 1200,
  isDefault: true, hasApiKey: true, apiKeyMasked: 'sk-…abcd',
};

function openDialog(api, extra = {}) {
  return askModels.openModelsDialog({ api, currentModelId: 'm1', onChanged: extra.onChanged ?? (() => {}), document, ...extra });
}

async function fill(el, values) {
  for (const [name, value] of Object.entries(values)) {
    const input = el.querySelector(`[name="${name}"]`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

describe('modelsDialogHTML：只读列表与渐进披露表单', () => {
  it('列出已配置模型：协议中文名、脱敏密钥、默认标记与行操作', () => {
    const out = asText(askModels.modelsDialogHTML({ models: [MODEL_A], currentModelId: 'm1' }));
    expect(out).toContain('主模型');
    expect(out).toContain('OpenAI 兼容');
    expect(out).toContain('sk-…abcd');
    expect(out).toContain('默认');
    expect(out).toContain('data-model-act="edit"');
    expect(out).toContain('data-model-act="delete"');
    expect(out).not.toContain('data-model-act="default" data-id="m1"');
  });

  it('.env 预设是只读行，不能编辑或删除', () => {
    const out = asText(askModels.modelsDialogHTML({
      models: [], envPreset: { id: 'env:default', name: '环境变量默认 (.env)', protocol: 'openai', baseUrl: 'https://env.example.com', model: 'env-model', hasApiKey: true, apiKeyMasked: 'sk-…env', isDefault: true, readOnly: true },
    }));
    expect(out).toContain('环境变量默认 (.env)');
    expect(out).toContain('只读');
    expect(out).toContain('env-model');
    expect(out).not.toContain('data-model-act="delete" data-id="env:default"');
  });

  it('表单每个字段都有 label；API Key 是密码框且编辑时提示留空保留', () => {
    const out = asText(askModels.modelsDialogHTML({ models: [MODEL_A], editing: MODEL_A, draft: { ...MODEL_A, apiKey: '' } }));
    for (const label of ['名称', '协议', 'Base URL', 'API Key', '模型 ID']) expect(out).toContain(`>${label}</label>`);
    expect(out).toContain('type="password"');
    expect(out).toContain('留空保留原密钥');
  });

  it('高级参数默认折叠在 <details> 内', () => {
    const out = asText(askModels.modelsDialogHTML({ models: [], draft: { protocol: 'openai', supportsTools: true } }));
    expect(out).toContain('<details class="ask-advanced">');
    expect(out).not.toMatch(/<details class="ask-advanced"[^>]*\bopen\b/);
    expect(out).toContain('name="supportsTools"');
    expect(out).toContain('name="temperature"');
    expect(out).toContain('name="maxTokens"');
  });

  it('没有任何模型且没有 .env 预设时给出空状态', () => {
    const out = asText(askModels.modelsDialogHTML({ models: [], envPreset: null }));
    expect(out).toContain('尚未配置模型');
  });
});

describe('validateModelDraft：必填与数值边界', () => {
  it('合法草稿通过', () => {
    const r = askModels.validateModelDraft({ name: 'A', protocol: 'openai', baseUrl: 'https://x.test/v1', model: 'gpt', temperature: '0.7', maxTokens: '800' });
    expect(r.ok).toBe(true);
  });

  it('缺名称 / 缺 Base URL / 缺模型 ID 分别报错', () => {
    const r = askModels.validateModelDraft({ name: ' ', protocol: 'openai', baseUrl: '', model: '' });
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeTruthy();
    expect(r.errors.baseUrl).toBeTruthy();
    expect(r.errors.model).toBeTruthy();
  });

  it('Base URL 必须是 http(s)', () => {
    const r = askModels.validateModelDraft({ name: 'A', protocol: 'openai', baseUrl: 'api.example.com', model: 'gpt' });
    expect(r.errors.baseUrl).toContain('http');
  });

  it('temperature 限 0–2，maxTokens 必须正整数', () => {
    const r = askModels.validateModelDraft({ name: 'A', protocol: 'openai', baseUrl: 'https://x.test', model: 'gpt', temperature: '2.1', maxTokens: '1.5' });
    expect(r.errors.temperature).toBeTruthy();
    expect(r.errors.maxTokens).toBeTruthy();
  });
});

describe('openModelsDialog：动作与局部反馈', () => {
  let dialog = null;

  afterEach(() => {
    dialog?.remove();
    dialog = null;
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  });

  it('打开后拉取列表，关闭按钮移除弹窗', async () => {
    const { api } = makeFakeApi([MODEL_A]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('主模型');

    dialog.querySelector('[data-dialog-act="close"]').click();
    expect(document.querySelector('dialog.ask-models-dialog')).toBeNull();
  });

  it('Esc 或轻触取消引发原生 close 事件时也会从 DOM 摘除弹窗，避免残留死节点', async () => {
    const { api } = makeFakeApi([MODEL_A]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    expect(dialog).toBeTruthy();

    dialog.dispatchEvent(new Event('close'));
    await flush();
    expect(document.querySelector('dialog.ask-models-dialog')).toBeNull();
  });

  it('测试连接可直接用未保存草稿，成功延迟显示在弹窗内', async () => {
    const { api, calls } = makeFakeApi([]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    await fill(dialog, { baseUrl: 'https://draft.test/v1', model: 'draft-model', apiKey: 'sk-draft' });
    dialog.querySelector('[data-form-act="test"]').click();
    await flush();

    const test = calls.find((c) => c[1] === 'api/ai/models' && c[2]?.action === 'test');
    expect(test).toBeTruthy();
    expect(test[2]).toMatchObject({ baseUrl: 'https://draft.test/v1', model: 'draft-model', apiKey: 'sk-draft' });
    expect(dialog.textContent).toContain('连接成功');
    expect(dialog.textContent).toContain('42ms');
  });

  it('测试连接失败时显示具体错误原因', async () => {
    const { api } = makeFakeApi([]);
    api.post = async (path, body) => ({ data: { ok: true, result: { ok: false, latencyMs: 10, model: body.model, error: '401 未授权' } }, status: 200, fetchedAt: 0 });
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    await fill(dialog, { baseUrl: 'https://draft.test', model: 'bad' });
    dialog.querySelector('[data-form-act="test"]').click();
    await flush();
    expect(dialog.textContent).toContain('401 未授权');
  });

  it('保存新模型后刷新列表并回调 onChanged', async () => {
    const { api, calls, state } = makeFakeApi([]);
    const onChanged = vi.fn();
    openDialog(api, { onChanged });
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    await fill(dialog, { name: '新模型', baseUrl: 'https://new.test/v1', model: 'new-model', apiKey: 'sk-new' });
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const save = calls.find((c) => c[1] === 'api/ai/models' && c[2]?.name === '新模型');
    expect(save[2]).toMatchObject({ name: '新模型', baseUrl: 'https://new.test/v1', model: 'new-model', apiKey: 'sk-new' });
    expect(state.models.some((m) => m.name === '新模型')).toBe(true);
    expect(onChanged).toHaveBeenCalled();
    expect(dialog.textContent).toContain('新模型');
  });

  it('编辑已有模型时密钥留空则不提交 apiKey', async () => {
    const { api, calls } = makeFakeApi([MODEL_A]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    dialog.querySelector('[data-model-act="edit"]').click();
    await flush();
    expect(dialog.querySelector('[name="name"]').value).toBe('主模型');
    expect(dialog.querySelector('[name="apiKey"]').value).toBe('');
    await fill(dialog, { name: '主模型改名' });
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const save = calls.find((c) => c[1] === 'api/ai/models' && c[2]?.name === '主模型改名');
    expect(save[2].id).toBe('m1');
    expect('apiKey' in save[2]).toBe(false);
  });

  it('编辑已有模型并清空 temperature / maxTokens 时显式提交 null 清除旧值', async () => {
    const { api, calls } = makeFakeApi([MODEL_A]);
    openDialog(api, { currentModelId: 'm1' });
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    expect(dialog.querySelector('[data-row-id="m1"]')?.classList.contains('is-current')).toBe(true);

    dialog.querySelector('[data-model-act="edit"]').click();
    await flush();
    await fill(dialog, { temperature: '', maxTokens: '' });
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const save = calls.find((c) => c[1] === 'api/ai/models' && c[2]?.id === 'm1');
    expect(save[2].temperature).toBeNull();
    expect(save[2].maxTokens).toBeNull();
  });

  it('表单校验失败时在字段旁显示错误且不发请求', async () => {
    const { api, calls } = makeFakeApi([]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(dialog.textContent).toContain('请填写名称');
    expect(calls.some((c) => c[1] === 'api/ai/models' && c[0] === 'post')).toBe(false);
  });

  it('设为默认与两步确认删除都会回调 onChanged', async () => {
    const m2 = { ...MODEL_A, id: 'm2', name: '备用模型', isDefault: false };
    const { api, calls, state } = makeFakeApi([MODEL_A, m2]);
    const onChanged = vi.fn();
    openDialog(api, { onChanged });
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');

    dialog.querySelector('[data-model-act="default"][data-id="m2"]').click();
    await flush();
    expect(calls.find((c) => c[2]?.action === 'set_default')?.[2]).toMatchObject({ action: 'set_default', id: 'm2' });

    dialog.querySelector('[data-model-act="delete"][data-id="m2"]').click();
    await flush();
    const confirm = dialog.querySelector('[data-model-act="confirm-delete"][data-id="m2"]');
    expect(confirm).toBeTruthy();
    confirm.click();
    await flush();
    expect(calls.find((c) => c[2]?.action === 'delete')?.[2]).toMatchObject({ action: 'delete', id: 'm2' });
    expect(state.models.some((m) => m.id === 'm2')).toBe(false);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('列表加载失败显示可重试错误态', async () => {
    let fail = true;
    const { api } = makeFakeApi([MODEL_A]);
    api.get = async (path) => {
      if (fail) throw new Error('网络错误');
      return { data: { ok: true, models: [MODEL_A], envPreset: null }, status: 200, fetchedAt: 0 };
    };
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    expect(dialog.textContent).toContain('加载失败');

    fail = false;
    dialog.querySelector('[data-dialog-act="reload"]').click();
    await flush();
    expect(dialog.textContent).toContain('主模型');
  });
});

/* ------------------------------------------------------------------ *
 * ask.js —— 纯函数、SSE 解析与工作区生命周期
 * ------------------------------------------------------------------ */

let askView = null;
beforeAll(async () => {
  askView = await import('../src/client/views/ask.js');
});

describe('parseAskHashQuery / buildStarterPrompts', () => {
  it('解析 router 传进来的 query 串，兼容带 ? 与整段 hash', () => {
    expect(askView.parseAskHashQuery('asset=gold-intl&q=%E5%88%86%E6%9E%90')).toEqual({ assetId: 'gold-intl', question: '分析' });
    expect(askView.parseAskHashQuery('?q=a+b')).toEqual({ assetId: '', question: 'a b' });
    expect(askView.parseAskHashQuery('#/ask?asset=x&q=y')).toEqual({ assetId: 'x', question: 'y' });
    expect(askView.parseAskHashQuery(null)).toEqual({ assetId: '', question: '' });
    expect(askView.parseAskHashQuery('q=%20%20')).toEqual({ assetId: '', question: '' });
  });

  it('动态芯片取涨跌幅绝对值前二，再补静态场景，4–6 条且不重复', () => {
    const prompts = askView.buildStarterPrompts([
      { id: 'a', name: '国际金价', changePct: 2.4, ok: true },
      { id: 'b', name: '纳指', changePct: -1.8, ok: true },
      { id: 'c', name: '原油', changePct: 0.2, ok: true },
    ]);
    expect(prompts.length).toBeGreaterThanOrEqual(4);
    expect(prompts.length).toBeLessThanOrEqual(6);
    expect(prompts[0]).toContain('国际金价');
    expect(prompts[1]).toContain('纳指');
    expect(new Set(prompts).size).toBe(prompts.length);
    expect(askView.buildStarterPrompts([])).toHaveLength(4);
  });

  it('坏报价被跳过，不生成 undefined 芯片', () => {
    const prompts = askView.buildStarterPrompts([null, { id: 'x' }, { id: 'y', name: '黄金', changePct: 1, ok: false }]);
    expect(prompts.some((p) => p.includes('undefined'))).toBe(false);
    expect(prompts).toHaveLength(4);
  });
});

describe('SSE 帧解析', () => {
  it('兼容 CRLF、无 event 名与空帧；没有 data 的帧丢弃', () => {
    const { events } = askView.parseSSEFrames('\r\n\r\ndata: {"a":1}\r\n\r\nevent: delta\n\ndata: [1,2]\n\n');
    expect(events).toEqual([
      { type: 'message', data: { a: 1 } },
      { type: 'message', data: [1, 2] },
    ]);
    expect(askView.parseSSEFrames('').events).toEqual([]);
  });

  it('响应没有可读流时明确报错', async () => {
    await expect(askView.consumeAskResponse({}, () => {})).rejects.toThrow('响应不支持流式读取');
  });

  it('响应结束时把最后一条没有空行结尾的帧也消费掉', async () => {
    const enc = new TextEncoder();
    const response = {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(enc.encode('event: delta\ndata: {"text":"尾帧"}'));
          controller.close();
        },
      }),
    };
    const seen = [];
    await askView.consumeAskResponse(response, (ev) => seen.push(ev));
    expect(seen).toEqual([{ type: 'delta', data: { text: '尾帧' } }]);
  });

  it('解析多个完整帧，保留跨 chunk 的残帧', () => {
    const { events, rest } = askView.parseSSEFrames(
      'event: delta\ndata: {"text":"你"}\n\nevent: done\ndata: {"sessionId":"s1"}\n\nevent: delta\ndata: {"text":"半',
    );
    expect(events).toEqual([
      { type: 'delta', data: { text: '你' } },
      { type: 'done', data: { sessionId: 's1' } },
    ]);
    expect(rest).toContain('"半');
  });

  it('忽略坏 JSON 与空帧', () => {
    const { events } = askView.parseSSEFrames('\n\nevent: delta\ndata: not-json\n\nevent: delta\ndata: {"text":"ok"}\n\n');
    expect(events).toEqual([{ type: 'delta', data: { text: 'ok' } }]);
  });

  it('consumeAskResponse 处理一帧被拆到两个 chunk 的情况', async () => {
    const enc = new TextEncoder();
    const chunks = [
      enc.encode('event: delta\ndata: {"text":"你'),
      enc.encode('好"}\n\nevent: done\ndata: {"sessionId":"s1"}\n\n'),
    ];
    const response = {
      body: new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      }),
    };
    const seen = [];
    await askView.consumeAskResponse(response, (ev) => seen.push(ev));
    expect(seen).toEqual([
      { type: 'delta', data: { text: '你好' } },
      { type: 'done', data: { sessionId: 's1' } },
    ]);
  });
});

describe('renderAskAnswerHTML：正文与取数轨迹', () => {
  it('安全渲染 Markdown，并把轨迹折进 details（默认关闭）', () => {
    const out = asText(askView.renderAskAnswerHTML({
      content: '**结论**：金价走强',
      modelLabel: 'gpt-test',
      toolTrace: [
        { tool: 'get_a_share_quotes', args: { ids: ['600519'] }, ok: true, source: 'sina', asOf: '2026-11-16T10:00:00+08:00', stale: true, durationMs: 12, summary: '3 条' },
        { tool: 'search_news', ok: false, error: '上游超时' },
      ],
    }));
    expect(out).toContain('<strong>结论</strong>');
    expect(out).toContain('<details class="ask-trace">');
    expect(out).not.toMatch(/<details class="ask-trace"[^>]*\bopen\b/);
    expect(out).toContain('数据来源 · 2 次查询 · gpt-test · 含过期数据');
    expect(out).toContain('get_a_share_quotes');
    expect(out).toContain('sina');
    expect(out).toContain('2026-11-16T10:00:00+08:00');
    expect(out).toContain('过期');
    expect(out).toContain('上游超时');
  });

  it('工具名与参数里的 HTML 被转义', () => {
    const out = asText(askView.renderAskAnswerHTML({
      content: '',
      toolTrace: [{ tool: '<img src=x onerror=alert(1)>', args: { q: '<script>' }, ok: true }],
    }));
    expect(out).not.toContain('<img src=x');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;img');
  });

  it('参数支持字符串、空对象、超长截断与无法序列化', () => {
    const long = 'x'.repeat(120);
    const circular = {};
    circular.self = circular;
    const out = asText(askView.renderAskAnswerHTML({
      content: 'ok',
      toolTrace: [
        { tool: 'a', args: long, ok: true },
        { tool: 'b', args: {}, ok: true },
        { tool: 'c', args: circular, ok: true },
      ],
    }));
    expect(out).toContain('参数 xxx');
    expect(out).toContain('…');
    expect(out).toContain('[object Object]');
    expect(out).toContain('数据来源 · 3 次查询');
    expect(out).not.toContain('含过期数据');
  });

  it('错误、停止与空内容各有明确占位，不渲染空轨迹', () => {
    const failed = asText(askView.renderAskAnswerHTML({ content: '', error: '上游 500', stopped: true }));
    expect(failed).toContain('回答失败：上游 500');
    expect(failed).toContain('已停止生成');
    expect(failed).not.toContain('ask-trace');

    const streaming = asText(askView.renderAskAnswerHTML({ content: '', streaming: true }));
    expect(streaming).toContain('正在生成…');

    const empty = asText(askView.renderAskAnswerHTML({ content: '' }));
    expect(empty).toContain('没有返回内容');
    expect(empty).toContain('data-role="assistant"');
  });
});

function fakeAskApi({ models = [], sessions = [], sessionDetail = null, onAsk = null } = {}) {
  const calls = { get: [], post: [], ask: [] };
  const api = {
    async get(path) {
      calls.get.push(path);
      if (path === 'api/ai/models') return { data: { ok: true, models, envPreset: null }, status: 200, fetchedAt: 0 };
      if (path === 'api/ai/sessions') return { data: { ok: true, sessions }, status: 200, fetchedAt: 0 };
      if (path.startsWith('api/ai/sessions/')) return { data: { ok: true, session: sessionDetail }, status: 200, fetchedAt: 0 };
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path, body) {
      calls.post.push({ path, body });
      if (path === 'api/ai/sessions') return { data: { ok: true, deleted: true }, status: 200, fetchedAt: 0 };
      return { data: { ok: true }, status: 200, fetchedAt: 0 };
    },
    async postStream(path, body, opts = {}) {
      calls.ask.push({ path, body, opts });
      if (onAsk) return onAsk(body, opts);
      return sseResponse([
        { type: 'session', data: { session: { id: 's-new', title: body.question } } },
        { type: 'delta', data: { text: '**结论**' } },
        { type: 'done', data: { sessionId: 's-new', message: { role: 'assistant', content: '**结论**', toolTrace: [], modelLabel: 'gpt-test' } } },
      ]);
    },
  };
  return { api, calls };
}

function sseResponse(events) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(enc.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data ?? {})}\n\n`));
      }
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream };
}

function manualSSE() {
  const enc = new TextEncoder();
  let controller = null;
  const stream = new ReadableStream({ start(c) { controller = c; } });
  return {
    response: { ok: true, status: 200, body: stream },
    push(type, data) { controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)); },
    close() { controller.close(); },
  };
}

function abortAwareAsk() {
  return (body, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
}

const MODEL = {
  id: 'm1', name: '主模型', protocol: 'openai', baseUrl: 'https://api.example.com/v1',
  model: 'gpt-test', supportsTools: true, isDefault: true, hasApiKey: true, apiKeyMasked: 'sk-…',
};

async function waitFor(fn, timeout = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('waitFor timeout');
}

describe('mountAsk：工作区、流式渲染与生命周期', () => {
  const quotes = [
    { id: 'gold-intl', name: '国际金价', changePct: 2.4, ok: true },
    { id: 'nasdaq', name: '纳指', changePct: -1.8, ok: true },
  ];
  const getAsk = () => document.getElementById('ask');
  const $ = (sel) => getAsk().querySelector(sel);

  afterEach(() => {
    askView.unmountAsk();
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  });

  it('解析 URL 预填问题，并渲染模型下拉与动态芯片', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('asset=gold-intl&q=%E5%88%86%E6%9E%90%E9%BB%84%E9%87%91', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    expect(getAsk().hidden).toBe(false);
    expect($('#ask-input').value).toBe('分析黄金');
    expect($('#ask-model-select').value).toBe('m1');
    expect(getAsk().textContent).toContain('国际金价');
    expect($$('#ask-messages [data-starter]').length).toBeGreaterThanOrEqual(4);
  });

  it('报价广播到达后补上动态提问芯片，卸载后不再响应', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    const dynamicChip = () => $$('#ask-messages [data-starter]')
      .map((el) => el.dataset.starter)
      .find((text) => text.startsWith('分析 国际金价'));
    expect(dynamicChip()).toBeUndefined();

    const { emit } = await import('../src/client/shared/bus.js');
    emit('quotes', { items: quotes });
    await waitFor(() => dynamicChip());

    askView.unmountAsk();
    expect(() => emit('quotes', { items: [] })).not.toThrow();
    expect(dynamicChip()).toBeUndefined();
  });

  it('无模型时只给「配置接入模型」主按钮', async () => {
    const { api } = fakeAskApi({ models: [] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('[data-ask-act="configure"]'));
    expect($('#ask-model-select').disabled).toBe(true);
    expect($('[data-ask-act="configure"]').textContent).toContain('配置接入模型');
  });

  it('发送时带 asset 上下文；流式进度、正文与取数轨迹依次出现', async () => {
    const manual = manualSSE();
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('asset=gold-intl&q=%E5%88%86%E6%9E%90%E9%BB%84%E9%87%91', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);

    expect(calls.ask[0].body).toMatchObject({ question: '分析黄金', context: { assetId: 'gold-intl' }, modelId: 'm1' });
    expect($('#ask-send').textContent).toBe('停止');

    manual.push('tool_start', { round: 1, id: 't1', tool: 'get_a_share_quotes', args: { ids: ['600519'] } });
    await waitFor(() => $('.ask-progress')?.textContent.includes('正在查询 get_a_share_quotes'));

    manual.push('tool_result', { round: 1, id: 't1', tool: 'get_a_share_quotes', ok: true, source: 'sina', asOf: '2026-11-16T10:00:00+08:00', stale: true, durationMs: 8, summary: '3 条' });
    await waitFor(() => $('.ask-progress')?.textContent.includes('已完成 1 项系统查询'));

    manual.push('delta', { text: '**结论**：走强' });
    await waitFor(() => $('.ask-answer')?.innerHTML.includes('<strong>结论</strong>'));

    manual.push('done', {
      sessionId: 's-new',
      message: {
        role: 'assistant', content: '**结论**：走强', modelLabel: 'gpt-test',
        toolTrace: [{ tool: 'get_a_share_quotes', args: { ids: ['600519'] }, ok: true, source: 'sina', asOf: '2026-11-16T10:00:00+08:00', stale: true, durationMs: 8, summary: '3 条' }],
      },
    });
    manual.close();
    await waitFor(() => $('#ask-send').textContent === '发送');

    expect($('.ask-trace')).toBeTruthy();
    expect($('.ask-trace').open).toBe(false);
    expect($('.ask-trace summary').textContent).toContain('数据来源 · 1 次查询 · gpt-test · 含过期数据');
    expect($('.ask-trace').textContent).toContain('sina');
    expect($('.ask-answer').textContent).toContain('结论');
  });

  it('中文输入法 Enter 不发送；keyCode 229 也不发送；普通 Enter 发送', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    const input = $('#ask-input');
    input.value = '测试问题';

    const composing = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(composing, 'isComposing', { value: true });
    input.dispatchEvent(composing);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.ask).toHaveLength(0);

    const ime = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(ime, 'keyCode', { value: 229 });
    input.dispatchEvent(ime);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.ask).toHaveLength(0);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    expect(calls.ask[0].body.question).toBe('测试问题');
  });

  it('unmountAsk 立即中断进行中的 SSE 并清空视图', async () => {
    const manual = manualSSE();
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '写一半的问题';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);

    askView.unmountAsk();
    expect(calls.ask[0].opts.signal.aborted).toBe(true);
    expect(getAsk().hidden).toBe(true);
    expect(getAsk().childNodes.length).toBe(0);
  });

  it('模型列表加载失败显示重试，重试后恢复', async () => {
    let fail = true;
    const { api } = fakeAskApi({ models: [MODEL] });
    const originalGet = api.get;
    api.get = async (path) => {
      if (path === 'api/ai/models' && fail) throw new Error('网络错误');
      return originalGet(path);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('[data-ask-act="retry-load"]'));
    expect(getAsk().textContent).toContain('模型加载失败');

    fail = false;
    $('[data-ask-act="retry-load"]').click();
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    expect($('#ask-model-select').disabled).toBe(false);
  });

  it('历史会话常驻左侧，可恢复与一键删除', async () => {
    const session = {
      id: 's1', title: '黄金分析', updatedAt: Date.now(),
      messages: [
        { id: 'x1', role: 'user', content: '黄金怎么看？' },
        { id: 'x2', role: 'assistant', content: '**看多**', toolTrace: [], modelLabel: 'gpt-test' },
      ],
    };
    const { api, calls } = fakeAskApi({ models: [MODEL], sessions: [{ id: 's1', title: '黄金分析', updatedAt: Date.now() }], sessionDetail: session });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));

    expect($('#ask-history-btn')).toBeNull();
    expect($('#ask-history').hidden).toBe(false);
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('黄金怎么看？'));
    expect($('#ask-messages').innerHTML).toContain('<strong>看多</strong>');

    $('#ask-history [data-session-delete="s1"]').click();
    await waitFor(() => calls.post.length === 1);
    expect(calls.post[0]).toMatchObject({ path: 'api/ai/sessions', body: { action: 'delete', id: 's1' } });
  });

  it('点击「模型配置」打开原生 dialog', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-models-btn').click();
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
    expect(document.querySelector('dialog.ask-models-dialog').textContent).toContain('模型配置');
    // 再点一次只保留一个弹窗（旧实例先关掉）
    $('#ask-models-btn').click();
    await waitFor(() => document.querySelectorAll('dialog.ask-models-dialog').length === 1);
  });

  it('只配置了 .env 预设时也能选中并发问', async () => {
    const envPreset = { id: 'env:default', name: '环境变量默认 (.env)', hasApiKey: true, isDefault: true, model: 'env-model' };
    const { api, calls } = fakeAskApi({ models: [] });
    const originalGet = api.get;
    api.get = async (path) => (path === 'api/ai/models'
      ? { data: { ok: true, models: [], envPreset }, status: 200, fetchedAt: 0 }
      : originalGet(path));
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="env:default"]'));
    expect($('#ask-model-select').value).toBe('env:default');

    $('#ask-input').value = '今天金价怎么看';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    expect(calls.ask[0].body.modelId).toBe('env:default');
  });

  it('切换模型下拉后，请求带上新模型', async () => {
    const second = { ...MODEL, id: 'm2', name: '备选模型', isDefault: false };
    const { api, calls } = fakeAskApi({ models: [MODEL, second] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m2"]'));
    const select = $('#ask-model-select');
    select.value = 'm2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    $('#ask-input').value = '对比两个模型';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    expect(calls.ask[0].body.modelId).toBe('m2');
  });

  it('没有任何模型时发送会直接打开模型配置', async () => {
    const { api, calls } = fakeAskApi({ models: [] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('[data-ask-act="configure"]'));
    $('#ask-input').value = '没有模型也要能发';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
    expect(calls.ask).toHaveLength(0);
  });

  it('点提问芯片直接发送该问题', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    const chip = $('[data-starter]');
    chip.click();
    await waitFor(() => calls.ask.length === 1);
    expect(calls.ask[0].body.question).toBe(chip.dataset.starter);
  });

  it('流式生成中再提交表单 = 停止，且信号被 abort', async () => {
    const manual = manualSSE();
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '查新闻';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    manual.push('tool_start', { id: 't1', tool: 'search_news' });
    await waitFor(() => $('.ask-progress')?.textContent.includes('正在查询 search_news'));
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(calls.ask[0].opts.signal.aborted).toBe(true);
  });

  it('error 帧在网络错误时都把原因显示在回答里', async () => {
    const withErrorFrame = fakeAskApi({
      models: [MODEL],
      onAsk: () => sseResponse([{ type: 'error', data: { error: '模型超时' } }]),
    });
    askView.mountAsk('', { api: withErrorFrame.api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '触发错误帧';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => $('.ask-error')?.textContent.includes('模型超时'));
    askView.unmountAsk();

    const networkFail = fakeAskApi({
      models: [MODEL],
      onAsk: async () => { throw Object.assign(new Error('网络断了'), { kind: 'network' }); },
    });
    askView.mountAsk('', { api: networkFail.api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '触发网络错误';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => $('.ask-error')?.textContent.includes('网络断了'));
  });

  it('历史会话常驻且加载失败可重试，空列表显示正常', async () => {
    const { api } = fakeAskApi({ models: [MODEL], sessions: [] });
    const originalGet = api.get;
    let fail = true;
    api.get = async (path) => {
      if (path === 'api/ai/sessions' && fail) throw new Error('会话网络错误');
      return originalGet(path);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    expect($('#ask-history').hidden).toBe(false);
    await waitFor(() => $('#ask-history [data-history-act="retry"]'));

    fail = false;
    $('#ask-history [data-history-act="retry"]').click();
    await waitFor(() => $('#ask-history-list')?.textContent.includes('暂无历史会话'));
    expect($('#ask-history').hidden).toBe(false);
  });

  it('恢复会话时过滤非对话角色、补默认字段并同步模型', async () => {
    const session = {
      id: 's1', title: '', modelId: 'm1', createdAt: Date.now(),
      messages: [
        { role: 'user', content: null },
        { role: 'system', content: '不该出现' },
        { role: 'assistant', content: '**回答**', toolTrace: null, modelLabel: null },
      ],
    };
    const { api } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 's1', title: '', createdAt: Date.now() }],
      sessionDetail: session,
    });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    expect($('#ask-history').textContent).toContain('未命名会话');
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('回答'));
    expect($('#ask-messages').textContent).not.toContain('不该出现');
    expect($('#ask-model-select').value).toBe('m1');
  });

  it('会话读取失败与删除失败都显示可重试错误，不崩溃', async () => {
    const { api } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 's1', title: '黄金分析' }],
      sessionDetail: { id: 's1', messages: [] },
    });
    const originalGet = api.get;
    const originalPost = api.post;
    api.get = async (path) => {
      if (path.startsWith('api/ai/sessions/')) throw new Error('会话读取失败');
      return originalGet(path);
    };
    api.post = async (path, body) => {
      if (path === 'api/ai/sessions' && body.action === 'delete') throw new Error('删除失败');
      return originalPost(path, body);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-history').textContent.includes('会话加载失败'));

    $('#ask-history [data-history-act="retry"]').click();
    await waitFor(() => $('#ask-history [data-session-delete="s1"]'));
    $('#ask-history [data-session-delete="s1"]').click();
    await waitFor(() => $('#ask-history').textContent.includes('会话加载失败'));
  });

  it('删除当前会话会清空消息区回到空状态', async () => {
    const session = {
      id: 's1', title: '黄金分析', messages: [{ role: 'user', content: '你好' }],
    };
    const { api, calls } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 's1', title: '黄金分析' }],
      sessionDetail: session,
    });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('你好'));
    $('#ask-history [data-session-delete="s1"]').click();
    await waitFor(() => $('#ask-messages [data-starter]'));
    expect(calls.post.at(-1).body).toEqual({ action: 'delete', id: 's1' });
  });

  it('新对话清空当前会话与消息，并取消历史侧栏高亮', async () => {
    const { api } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 's1', title: '黄金分析' }],
      sessionDetail: { id: 's1', messages: [{ role: 'user', content: '旧问题' }] },
    });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('旧问题'));
    expect($('.ask-history-item.is-active')).not.toBeNull();
    $('#ask-new-btn').click();
    expect($('#ask-messages').textContent).not.toContain('旧问题');
    expect($$('#ask-messages [data-starter]').length).toBeGreaterThanOrEqual(4);
    expect($('.ask-history-item.is-active')).toBeNull();
    expect($('#ask-history').hidden).toBe(false);
  });

  it('模型配置保存后 onChanged 会重新拉取模型列表', async () => {
    let models = [MODEL];
    const { api } = fakeAskApi({ models: [MODEL] });
    const originalGet = api.get;
    api.get = async (path) => {
      if (path === 'api/ai/models') return { data: { ok: true, models, envPreset: null }, status: 200, fetchedAt: 0 };
      return originalGet(path);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-models-btn').click();
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
    const dialog = document.querySelector('dialog.ask-models-dialog');
    await waitFor(() => dialog.querySelector('[data-model-act="edit"]'));
    models = [MODEL, { ...MODEL, id: 'm9', name: '新模型', isDefault: false }];
    dialog.querySelector('[data-model-act="edit"]').click();
    dialog.querySelector('[name="name"]').value = '改名';
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => $('#ask-model-select option[value="m9"]'));
  });

  it('卸载时清掉尚未触发的正文重绘定时器', async () => {
    const manual = manualSSE();
    const timers = [];
    const fakeWin = {
      setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
      clearTimeout: vi.fn(),
    };
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window: fakeWin, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '流式测试';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    manual.push('delta', { text: '流式中' });
    await waitFor(() => timers.length > 0);
    askView.unmountAsk();
    expect(fakeWin.clearTimeout).toHaveBeenCalled();
  });

  it('空输入、Shift+Enter 与生成中的 Enter 都不会发起请求', async () => {
    const manual = manualSSE();
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));

    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    $('#ask-input').dispatchEvent(Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter', shiftKey: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.ask).toHaveLength(0);

    $('#ask-input').value = '第一问';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    $('#ask-input').dispatchEvent(Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.ask).toHaveLength(1);
  });

  it('空状态主按钮打开模型配置弹窗', async () => {
    const { api } = fakeAskApi({ models: [] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('[data-ask-act="configure"]'));
    $('[data-ask-act="configure"]').click();
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
  });

  it('停止后 onAsk 拒绝 AbortError，回答标记为已停止并可开新对话', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: abortAwareAsk() });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '慢慢答';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    await waitFor(() => $('#ask-send').textContent === '停止');
    $('#ask-send').click();
    await waitFor(() => $('#ask-messages').textContent.includes('已停止生成'));
    expect($('#ask-send').textContent).toBe('发送');

    $('#ask-new-btn').click();
    expect($('#ask-messages').textContent).not.toContain('已停止生成');
  });

  it('生成中开新对话会中止请求并回到空状态', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: abortAwareAsk() });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '第一问';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    $('#ask-new-btn').click();
    await waitFor(() => $('#ask-send').textContent === '发送');
    expect($$('#ask-messages [data-starter]').length).toBeGreaterThanOrEqual(4);
  });

  it('会话详情缺失时在历史栏显示会话不存在', async () => {
    const { api } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 'gone', title: '已删除' }],
      sessionDetail: null,
    });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="gone"]'));
    $('#ask-history [data-session-id="gone"]').click();
    await waitFor(() => $('#ask-history').textContent.includes('会话加载失败'));
  });

  it('生成结束后刷新历史失败会显示可重试提示', async () => {
    let sessionCalls = 0;
    const { api } = fakeAskApi({ models: [MODEL] });
    const originalGet = api.get;
    api.get = async (path) => {
      if (path === 'api/ai/sessions') {
        sessionCalls += 1;
        if (sessionCalls > 1) throw new Error('sessions down');
      }
      return originalGet(path);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '刷新历史';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => $('#ask-messages').textContent.includes('结论'));
    await waitFor(() => $('#ask-history').textContent.includes('会话加载失败'));
  });

  it('连续 delta 只排一次重绘，卸载时清掉定时器', async () => {
    const manual = manualSSE();
    const timers = [];
    const fakeWin = {
      setTimeout: (fn) => { timers.push(fn); return timers.length; },
      clearTimeout: vi.fn(),
    };
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window: fakeWin, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '连发';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    manual.push('delta', { text: '一' });
    manual.push('delta', { text: '二' });
    await waitFor(() => timers.length > 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(timers).toHaveLength(1);
  });

  it('重复 mount 会先卸载上一份实例', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    expect($$('#ask-model-select')).toHaveLength(1);
  });
});

function $$(sel) {
  return Array.from(document.querySelectorAll(sel));
}
