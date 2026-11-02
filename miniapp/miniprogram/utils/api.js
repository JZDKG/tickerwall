/* ================================================================== *
 * 数据访问层：云函数优先，本机 web 服务次之，内置快照兜底
 *
 * 为什么要三层：
 *   · 生产环境走云开发（wx.cloud.callFunction），这是「接口使用云开发」的正解；
 *   · 开发期在开发者工具里，直接读本机 `node server.mjs`（127.0.0.1:8787），
 *     省掉每次改后端都要重新部署云函数；
 *   · 两个都不可用时（游客 AppID、断网、云环境未授权）用内置快照渲染，
 *     这样界面永远不是白屏 —— 但会在页面上明确标「演示数据」，不假装实时。
 *
 * 失败会记一个 60 秒冷却，避免每一轮轮询都先去撞一次必然失败的通道。
 * ================================================================== */

const config = require('../config');

/* 失败冷却：25 秒。
   原来 60 秒太长 —— 云函数冷启动偶尔超时一次，接下来三分钟都看不到实时数据，
   用户会以为「坏了」。25 秒刚好跨过一次 15 秒轮询，下一个周期就重试。 */
const DOWN_COOLDOWN_MS = 25_000;
const downUntil = { cloud: 0, local: 0 };
let lastMode = null;

function canUse(mode) {
  return Date.now() > downUntil[mode];
}

function markDown(mode) {
  downUntil[mode] = Date.now() + DOWN_COOLDOWN_MS;
}

/** 云函数调用 */
function callCloud(path, params) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
      return reject(new Error('当前基础库不支持云开发'));
    }
    wx.cloud.callFunction({
      name: config.cloudFn,
      data: { path, params: params || {} },
      success(res) {
        const r = (res && res.result) || {};
        if (r.ok === false) return reject(new Error(r.error || '接口返回失败'));
        resolve(r);
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '云函数调用失败'));
      },
    });
  });
}

/** 本机 web 服务（仅开发期；真机上 127.0.0.1 指向手机自己） */
function callLocal(path, params) {
  const map = {
    quotes: '/api/quotes',
    detail: `/api/detail/${encodeURIComponent((params && params.id) || '')}`,
    events: `/api/events?limit=${(params && params.limit) || 60}`,
  };
  const url = map[path];
  if (!url) return Promise.reject(new Error(`本机服务不支持 ${path}`));
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.localBase}${url}`,
      timeout: 8000,
      success(res) {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const data = res.data || {};
        if (data.ok === false) return reject(new Error(data.error || '接口返回失败'));
        resolve(data);
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '本机服务不可达'));
      },
    });
  });
}

/** 内置快照（离线演示） */
function callMock(path, params) {
  return new Promise((resolve, reject) => {
    let mock;
    try {
      mock = require('./mock');
    } catch (e) {
      return reject(new Error('缺少演示数据'));
    }
    const fn = mock[path];
    if (typeof fn !== 'function') return reject(new Error(`演示数据不含 ${path}`));
    try {
      resolve(fn(params || {}));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 取一份数据。
 * @param {'quotes'|'detail'|'events'} path
 * @param {object} [params]
 * @returns {Promise<{data:object, mode:'cloud'|'local'|'mock'}>}
 */
async function call(path, params) {
  const chain = [];
  if (canUse('cloud')) chain.push('cloud');
  if (config.allowLocal && canUse('local')) chain.push('local');

  // 每道通道的失败原因都留着：只报最后一个会掩盖真正该修的那个
  // （比如云环境没绑 AppID，但本机服务恰好也没开）
  const errs = [];
  for (const mode of chain) {
    try {
      const data = mode === 'cloud' ? await callCloud(path, params) : await callLocal(path, params);
      lastMode = mode;
      return { data, mode };
    } catch (err) {
      errs.push({ mode, message: String((err && (err.message || err.errMsg)) || err) });
      markDown(mode);
    }
  }

  // 全部通道不可用：给快照，并把 mode 标出来（页面据此显示「演示数据」）
  const data = await callMock(path, params);
  lastMode = 'mock';
  return {
    data,
    mode: 'mock',
    error: errs.length ? errs.map((e) => `${e.mode}: ${e.message}`).join(' | ') : null,
  };
}

/** 首屏前预热一下云环境（失败不抛，等真正调用时再记冷却） */
function warmup() {
  if (!wx.cloud || !config.envId) return;
  try {
    wx.cloud.init({ env: config.envId, traceUser: false });
  } catch (e) {
    markDown('cloud');
  }
}

/** 手动重试：清空冷却，让下一轮重新探测 */
function resetChannels() {
  downUntil.cloud = 0;
  downUntil.local = 0;
}

function currentMode() {
  return lastMode;
}

module.exports = { call, warmup, resetChannels, currentMode };
