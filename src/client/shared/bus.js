/* ================================================================== *
 * 极简发布订阅
 *
 * 只为一处解耦而存在：列表每轮拿到新报价后要顺带刷新地图节点
 * （原来 list 里直接 `if (mapEl && !mapEl.hidden) renderMap()`，等于把地图模块
 * 反向依赖进列表）。改成「列表广播、地图在 mount 时订阅」，两个视图互不认识。
 *
 * 语义等价性：原来只在 mapEl 可见时才刷；现在地图只在挂载（=可见）期间订阅，
 * 所以收到的时机完全一致。
 * ================================================================== */

const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  handlers.get(event)?.delete(fn);
}

export function emit(event, payload) {
  const set = handlers.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.warn(`[bus] ${event} 的订阅者抛错：`, err);
    }
  }
}

// main.js 里 `import { bus }` 走的是单例对象（createRealtime、mountDesktopBridge
// 等都把它当依赖传进去）。浏览器原生 ESM 在链接期就会校验具名导出，缺这一个
// 会让整张模块图加载失败 —— 页面停在「连接中…」，#rows 永远是空的。
export const bus = { on, off, emit };
