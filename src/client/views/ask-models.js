/* ================================================================== *
 * AI 问财 · 模型配置弹窗
 *
 * 列表是 L1（谁可用、谁是默认），表单是 L2，工具调用/采样参数是 L3，
 * 折在原生 <details> 里；密钥只显示后端给的脱敏串，输入框留空即保留原值。
 * ================================================================== */

import { html } from '../shared/format.js';
import { openModalDialog } from '../shared/modal-dialog.js';

const MODELS_PATH = 'api/ai/models';
const PROTOCOLS = ['openai', 'anthropic'];

export const PROTOCOL_LABELS = {
  openai: 'OpenAI 兼容',
  anthropic: 'Anthropic 原生',
};

export function protocolLabel(protocol) {
  return PROTOCOL_LABELS[protocol] ?? PROTOCOL_LABELS.openai;
}

export function normalizeModelDraft(source = {}) {
  return {
    name: source.name ?? '',
    protocol: source.protocol === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: source.baseUrl ?? '',
    apiKey: '',
    model: source.model ?? '',
    supportsTools: source.supportsTools !== false,
    temperature: source.temperature == null || source.temperature === '' ? '' : String(source.temperature),
    maxTokens: source.maxTokens == null || source.maxTokens === '' ? '' : String(source.maxTokens),
  };
}

/**
 * 表单校验。返回按字段分组的中文错误，调用方直接贴到对应 label 下方。
 */
export function validateModelDraft(draft = {}) {
  const errors = {};
  const name = String(draft.name ?? '').trim();
  const baseUrl = String(draft.baseUrl ?? '').trim();
  const model = String(draft.model ?? '').trim();
  const protocol = draft.protocol ?? 'openai';

  if (!name) errors.name = '请填写名称';
  if (!PROTOCOLS.includes(protocol)) errors.protocol = '请选择协议';
  if (!baseUrl) errors.baseUrl = '请填写 Base URL';
  else if (!/^https?:\/\/\S+$/i.test(baseUrl)) errors.baseUrl = 'Base URL 需要以 http:// 或 https:// 开头';
  if (!model) errors.model = '请填写模型 ID';

  if (draft.temperature !== '' && draft.temperature != null) {
    const n = Number(draft.temperature);
    if (!Number.isFinite(n) || n < 0 || n > 2) errors.temperature = 'temperature 需在 0–2 之间';
  }
  if (draft.maxTokens !== '' && draft.maxTokens != null) {
    const n = Number(draft.maxTokens);
    if (!Number.isInteger(n) || n <= 0) errors.maxTokens = 'maxTokens 需为正整数';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

function fieldError(errors, key) {
  return errors[key] ? html`<span class="ask-field-error" role="alert">${errors[key]}</span>` : '';
}

function keyText(model) {
  if (model.apiKeyMasked) return model.apiKeyMasked;
  return model.hasApiKey ? '已配置密钥' : '未配置密钥';
}

function modelRowHTML(model, state) {
  const isDefault = Boolean(model.isDefault);
  const isCurrent = Boolean(state.currentModelId) && state.currentModelId === model.id;
  const pendingDelete = state.pendingDeleteId === model.id;
  return html`<li class="ask-model-item${isCurrent ? ' is-current' : ''}" data-row-id="${model.id}">
    <div class="ask-model-main">
      <span class="ask-model-name">${model.name}${isDefault ? html`<span class="ask-model-default">默认</span>` : ''}</span>
      <span class="ask-model-meta">${protocolLabel(model.protocol)} · ${model.model}</span>
      <span class="ask-model-key">${keyText(model)}</span>
    </div>
    <div class="ask-model-actions">
      ${isDefault ? '' : html`<button type="button" class="ask-link-btn" data-model-act="default" data-id="${model.id}">设为默认</button>`}
      <button type="button" class="ask-link-btn" data-model-act="edit" data-id="${model.id}">编辑</button>
      ${pendingDelete
        ? html`<button type="button" class="ask-link-btn is-danger" data-model-act="confirm-delete" data-id="${model.id}">确认删除</button>
            <button type="button" class="ask-link-btn" data-model-act="cancel-delete" data-id="${model.id}">取消</button>`
        : html`<button type="button" class="ask-link-btn is-danger" data-model-act="delete" data-id="${model.id}">删除</button>`}
    </div>
  </li>`;
}

function envPresetRowHTML(envPreset, state) {
  const isCurrent = Boolean(state.currentModelId) && state.currentModelId === envPreset.id;
  return html`<li class="ask-model-item is-env${isCurrent ? ' is-current' : ''}">
    <div class="ask-model-main">
      <span class="ask-model-name">${envPreset.name}${envPreset.isDefault ? html`<span class="ask-model-default">默认</span>` : ''}</span>
      <span class="ask-model-meta">${protocolLabel(envPreset.protocol)} · ${envPreset.model}</span>
      <span class="ask-model-key">${keyText(envPreset)}</span>
      <span class="ask-env-badge">只读</span>
    </div>
  </li>`;
}

function testResultHTML(result) {
  if (!result) return '';
  if (result.ok) {
    const reply = result.reply ? ` · ${result.reply}` : '';
    return html`<p class="ask-test-result is-ok" role="status">连接成功 · ${result.latencyMs}ms${reply}</p>`;
  }
  return html`<p class="ask-test-result is-error" role="alert">连接失败：${result.error ?? '未知错误'}</p>`;
}

function formHTML(state, draft, editing) {
  const errors = state.errors ?? {};
  const busy = Boolean(state.busy);
  const busyAttr = busy ? html` disabled` : '';
  const protocolOptions = PROTOCOLS.map((p) => (p === draft.protocol
    ? html`<option value="${p}" selected>${PROTOCOL_LABELS[p]}</option>`
    : html`<option value="${p}">${PROTOCOL_LABELS[p]}</option>`));
  const toolsInput = draft.supportsTools
    ? html`<input type="checkbox" id="ask-model-tools" name="supportsTools" checked>`
    : html`<input type="checkbox" id="ask-model-tools" name="supportsTools">`;

  return html`<form class="ask-model-form" data-model-form novalidate>
    <div class="ask-form-head">
      <h3>${editing ? '编辑模型' : '新增模型'}</h3>
      ${editing ? html`<button type="button" class="ask-link-btn" data-model-act="cancel-edit">取消编辑</button>` : ''}
    </div>

    <div class="ask-field">
      <label for="ask-model-name">名称</label>
      <input id="ask-model-name" name="name" type="text" value="${draft.name}" autocomplete="off">
      ${fieldError(errors, 'name')}
    </div>

    <div class="ask-field">
      <label for="ask-model-protocol">协议</label>
      <select id="ask-model-protocol" name="protocol">${protocolOptions}</select>
      ${fieldError(errors, 'protocol')}
    </div>

    <div class="ask-field">
      <label for="ask-model-base-url">Base URL</label>
      <input id="ask-model-base-url" name="baseUrl" type="url" value="${draft.baseUrl}" autocomplete="off" spellcheck="false">
      ${fieldError(errors, 'baseUrl')}
    </div>

    <div class="ask-field">
      <label for="ask-model-api-key">API Key</label>
      <input id="ask-model-api-key" name="apiKey" type="password" value="" autocomplete="new-password">
      ${editing
        ? html`<span class="ask-field-hint">留空保留原密钥（当前 ${keyText(editing)}）</span>`
        : html`<span class="ask-field-hint">只保存在本机数据目录，不会回显。</span>`}
      ${fieldError(errors, 'apiKey')}
    </div>

    <div class="ask-field">
      <label for="ask-model-id">模型 ID</label>
      <input id="ask-model-id" name="model" type="text" value="${draft.model}" autocomplete="off" spellcheck="false">
      ${fieldError(errors, 'model')}
    </div>

    <details class="ask-advanced">
      <summary>高级参数</summary>
      <div class="ask-advanced-body">
        <label class="ask-check" for="ask-model-tools">${toolsInput}<span>工具调用模式</span></label>
        <p class="ask-field-hint">关闭后模型不能主动查询行情数据。</p>

        <div class="ask-field">
          <label for="ask-model-temperature">temperature</label>
          <input id="ask-model-temperature" name="temperature" type="number" min="0" max="2" step="0.1" value="${draft.temperature}">
          ${fieldError(errors, 'temperature')}
        </div>

        <div class="ask-field">
          <label for="ask-model-max-tokens">maxTokens</label>
          <input id="ask-model-max-tokens" name="maxTokens" type="number" min="1" step="1" value="${draft.maxTokens}">
          ${fieldError(errors, 'maxTokens')}
        </div>
      </div>
    </details>

    ${testResultHTML(state.testResult)}

    <div class="ask-form-actions">
      <button type="button" class="ask-btn" data-form-act="test"${busyAttr}>测试连接</button>
      <button type="submit" class="ask-btn is-primary"${busyAttr}>保存模型</button>
    </div>
  </form>`;
}

/**
 * 纯渲染：弹窗的全部 DOM 都从这里产出，测试不需要真的打开模态。
 */
export function modelsDialogHTML(state = {}) {
  const models = Array.isArray(state.models) ? state.models : [];
  const envPreset = state.envPreset ?? null;
  const editing = state.editing ?? (state.editingId ? models.find((m) => m.id === state.editingId) : null);
  const draft = normalizeModelDraft(state.draft ?? editing ?? {});
  const errors = state.errors ?? {};
  const loading = Boolean(state.loading);
  const loadError = state.loadError ?? '';

  const list = html`<ul class="ask-model-list">
    ${models.map((m) => modelRowHTML(m, state))}
    ${envPreset ? envPresetRowHTML(envPreset, state) : ''}
  </ul>
  ${!models.length && !envPreset ? html`<p class="ask-models-empty">尚未配置模型，在下方填写接入信息。</p>` : ''}`;

  const body = loading
    ? html`<p class="ask-loading" role="status">正在读取模型…</p>`
    : loadError
      ? html`<div class="ask-load-error" role="alert">
          <p>加载失败：${loadError}</p>
          <button type="button" class="ask-btn" data-dialog-act="reload">重试</button>
        </div>`
      : html`${list}${formHTML(state, draft, editing)}`;

  return html`<div class="ask-models">
    <header class="ask-models-head">
      <h2 id="ask-models-title">模型配置</h2>
      <button type="button" class="ask-icon-btn" data-dialog-act="close" aria-label="关闭">×</button>
    </header>
    <div class="ask-models-body">
      ${state.error ? html`<p class="ask-alert is-error" role="alert">${state.error}</p>` : ''}
      ${state.notice ? html`<p class="ask-notice" role="status">${state.notice}</p>` : ''}
      ${body}
    </div>
  </div>`;
}

function readDraft(root, fallback) {
  const form = root.querySelector('[data-model-form]');
  if (!form) return fallback;
  const field = (name) => form.querySelector(`[name="${name}"]`);
  const value = (name) => field(name)?.value ?? '';
  const tools = field('supportsTools');
  return {
    name: value('name'),
    protocol: value('protocol') || 'openai',
    baseUrl: value('baseUrl'),
    apiKey: value('apiKey'),
    model: value('model'),
    supportsTools: tools ? Boolean(tools.checked) : Boolean(fallback.supportsTools),
    temperature: value('temperature'),
    maxTokens: value('maxTokens'),
  };
}

/**
 * 打开模型配置弹窗。
 * @returns {() => void} 关闭函数（幂等）
 */
export function openModelsDialog({
  api,
  currentModelId = '',
  onChanged = null,
  document: doc = null,
} = {}) {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!targetDoc || !api || typeof targetDoc.createElement !== 'function') return () => {};

  const dialog = targetDoc.createElement('dialog');
  dialog.className = 'ask-models-dialog';
  dialog.setAttribute('closedby', 'any');
  dialog.setAttribute('aria-labelledby', 'ask-models-title');
  targetDoc.body.appendChild(dialog);

  const state = {
    models: [],
    envPreset: null,
    editingId: null,
    draft: normalizeModelDraft({}),
    errors: {},
    busy: false,
    loading: true,
    loadError: '',
    error: '',
    notice: '',
    testResult: null,
    pendingDeleteId: null,
    currentModelId,
  };
  let disposed = false;
  let closeDialog = () => {};

  const render = () => {
    if (disposed) return;
    dialog.innerHTML = modelsDialogHTML({
      ...state,
      editing: state.editingId ? state.models.find((m) => m.id === state.editingId) ?? null : null,
    });
  };

  const readModels = async () => {
    const { data } = await api.get(MODELS_PATH);
    state.models = Array.isArray(data?.models) ? data.models : [];
    state.envPreset = data?.envPreset ?? null;
  };

  const refreshModels = async () => {
    try {
      await readModels();
    } catch (err) {
      state.loadError = err?.message || '网络错误';
    }
    render();
  };

  const load = async () => {
    state.loading = true;
    state.loadError = '';
    render();
    try {
      await readModels();
    } catch (err) {
      state.loadError = err?.message || '网络错误';
    }
    state.loading = false;
    render();
  };

  const resetForm = () => {
    state.editingId = null;
    state.draft = normalizeModelDraft({});
    state.errors = {};
    state.testResult = null;
    state.pendingDeleteId = null;
  };

  const fail = (err) => {
    state.error = err?.message || '请求失败';
    render();
  };

  const onTest = async () => {
    const draft = readDraft(dialog, state.draft);
    state.draft = draft;
    const check = validateModelDraft({ ...draft, name: draft.name || 'draft' });
    const errors = { ...check.errors };
    delete errors.name;
    state.errors = errors;
    if (Object.keys(errors).length) {
      render();
      return;
    }

    state.busy = true;
    state.error = '';
    state.testResult = null;
    render();
    const payload = {
      action: 'test',
      protocol: draft.protocol,
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      supportsTools: draft.supportsTools,
    };
    if (state.editingId) payload.id = state.editingId;
    if (draft.apiKey) payload.apiKey = draft.apiKey;

    try {
      const { data } = await api.post(MODELS_PATH, payload);
      state.testResult = data?.result ?? { ok: false, error: '接口没有返回测试结果' };
    } catch (err) {
      state.testResult = { ok: false, error: err?.message || '连接失败' };
    }
    state.busy = false;
    render();
  };

  const onSave = async () => {
    const draft = readDraft(dialog, state.draft);
    state.draft = draft;
    const check = validateModelDraft(draft);
    state.errors = check.errors;
    if (!check.ok) {
      render();
      return;
    }

    state.busy = true;
    state.error = '';
    render();
    const payload = {
      name: draft.name.trim(),
      protocol: draft.protocol,
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      supportsTools: draft.supportsTools,
    };
    if (state.editingId) payload.id = state.editingId;
    if (draft.temperature !== '') payload.temperature = Number(draft.temperature);
    else if (state.editingId) payload.temperature = null;
    if (draft.maxTokens !== '') payload.maxTokens = Number(draft.maxTokens);
    else if (state.editingId) payload.maxTokens = null;
    if (draft.apiKey) payload.apiKey = draft.apiKey;

    try {
      await api.post(MODELS_PATH, payload);
      state.busy = false;
      resetForm();
      state.notice = '已保存';
      await refreshModels();
      onChanged?.();
    } catch (err) {
      state.busy = false;
      fail(err);
    }
  };

  const onModelAction = async (act, id) => {
    if (act === 'edit') {
      const model = state.models.find((m) => m.id === id);
      if (!model) return;
      state.editingId = id;
      state.draft = normalizeModelDraft(model);
      state.errors = {};
      state.testResult = null;
      state.pendingDeleteId = null;
      state.notice = '';
      state.error = '';
      render();
      return;
    }
    if (act === 'cancel-edit') {
      resetForm();
      render();
      return;
    }
    if (act === 'delete') {
      state.pendingDeleteId = id;
      render();
      return;
    }
    if (act === 'cancel-delete') {
      state.pendingDeleteId = null;
      render();
      return;
    }
    if (act === 'confirm-delete') {
      state.busy = true;
      render();
      try {
        await api.post(MODELS_PATH, { action: 'delete', id });
        state.busy = false;
        state.pendingDeleteId = null;
        state.notice = '已删除';
        if (state.editingId === id) resetForm();
        await refreshModels();
        onChanged?.();
      } catch (err) {
        state.busy = false;
        fail(err);
      }
      return;
    }
    if (act === 'default') {
      state.busy = true;
      render();
      try {
        await api.post(MODELS_PATH, { action: 'set_default', id });
        state.busy = false;
        state.notice = '已设为默认';
        await refreshModels();
        onChanged?.();
      } catch (err) {
        state.busy = false;
        fail(err);
      }
    }
  };

  dialog.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-dialog-act], [data-model-act], [data-form-act]');
    if (!target || !dialog.contains(target)) return;
    if (target.dataset.dialogAct === 'close') {
      closeDialog();
      return;
    }
    if (target.dataset.dialogAct === 'reload') {
      load();
      return;
    }
    if (target.dataset.formAct === 'test') {
      onTest();
      return;
    }
    if (target.dataset.modelAct) {
      onModelAction(target.dataset.modelAct, target.dataset.id).catch(fail);
    }
  });

  dialog.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.busy) return;
    onSave();
  });

  render();
  closeDialog = openModalDialog(dialog, {
    doc: targetDoc,
    opener: targetDoc.activeElement,
    onClose: () => { disposed = true; },
  });
  load();

  return () => {
    disposed = true;
    closeDialog();
  };
}
