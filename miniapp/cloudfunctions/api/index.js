/* ================================================================== *
 * 云函数入口：一个函数，按 path 分发
 *
 * 只有三个接口：quotes / detail / events。
 *
 * 「关联分析」和「隔夜复盘」两块**故意不在这里** —— 它们完全由行情派生，
 * 在小程序侧算（utils/analysis.js）即可：少一次网络往返，而且行情有本地
 * 快照兜底时，这两页照样能算出来，不会出现「有价格但关联页空白」的割裂。
 * 同一份机制库放两处维护，迟早会分叉。
 *
 * 约定：永远返回 200 语义的对象，失败时 { ok:false, error }，由前端决定文案。
 * 云函数抛异常会让小程序拿到 errMsg 而拿不到业务错误码，排查更费劲。
 * ================================================================== */

const { getQuotes } = require('./lib/quotes');
const { getDetail } = require('./lib/detail');
const { getEvents } = require('./lib/events');

const ROUTES = {
  // 定时预热（每分钟）走这条路：允许它慢慢把真分时抓满并写进缓存，
  // 用户请求则只用缓存/环形缓冲，首屏不等上游
  quotes: (p, ev) => getQuotes({ force: !!p.force || isTimerEvent(ev), warm: isTimerEvent(ev) }),
  detail: (p) => getDetail(p.id),
  events: (p) => getEvents({ limit: p.limit }),
};

/** 定时触发器的事件长这样：{ Type: 'Timer', TriggerName: 'warm-quotes' } */
function isTimerEvent(ev) {
  return !!(ev && (ev.Type === 'Timer' || ev.TriggerName || ev.type === 'timer'));
}

exports.main = async (event = {}) => {
  const started = Date.now();
  const path = String(event.path || 'quotes').replace(/^\/+|\/+$/g, '');
  const handler = ROUTES[path];
  if (!handler) return { ok: false, error: `未知接口: ${path}`, allowed: Object.keys(ROUTES) };

  try {
    const data = await handler(event.params || {}, event);
    return { ...data, ok: data && data.ok !== false, tookMs: Date.now() - started };
  } catch (err) {
    console.error('[api]', path, err && err.stack ? err.stack : err);
    return {
      ok: false,
      error: String((err && err.message) || err || '未知错误'),
      path,
      tookMs: Date.now() - started,
    };
  }
};
