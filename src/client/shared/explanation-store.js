/* ================================================================== *
 * 解释快照的共享注册表（方案 E07 / §8）
 *
 * 要解决的具体问题：首页问题卡、详情页解释卡、图谱焦点、地图影响面板各自
 * 取一次 `/api/explanations`。它们几乎同时打开，于是：
 *
 *   · 同一份解释被请求三次（服务端已同键合并，但客户端仍在各自等待）；
 *   · 三个面板可能显示**不同批次**的快照 —— 用户在图谱上看到「利率渠道
 *     supported」，而详情页还是上一版的 mixed，谁也不知道自己旧了。
 *
 * 这里按 `assetId@windowKey` 保存当前快照，并广播 `explanationId`：
 * 任何视图读到的都是同一个 id，切版本时所有视图一起变。
 *
 * 两条纪律：
 *   1. **旧快照不许覆盖新快照**（按 generatedAt + id 判新旧）：慢响应晚到时
 *      直接丢弃，而不是把界面退回去。
 *   2. 广播的是**不可变引用**：视图拿去渲染，不会因为后续更新悄悄变掉。
 * ================================================================== */

/** @typedef {{explanationId:string, assetId:string, windowKey:string, generatedAt:string|null, envelope:object}} Snapshot */

const REGISTRY = new Map(); // `${assetId}@${windowKey}` → Snapshot
const LISTENERS = new Map(); // key → Set<fn>

export const keyOf = (assetId, windowKey = 'session') => `${assetId}@${windowKey}`;

/** 时间戳比较：generatedAt 缺失时退化为「没有时间」，不参与新旧判断 */
function generatedMs(snapshot) {
  const t = Date.parse(snapshot?.generatedAt ?? '');
  return Number.isFinite(t) ? t : null;
}

/**
 * 这份快照是否比现有的更新。
 *
 * 判据顺序：两者都有 generatedAt 就比时间；时间相同或缺失时，同一个 id
 * 视为同一份（不重复广播），不同 id 视为新版本（宁可刷新，也不要卡住）。
 */
export function isNewer(incoming, existing) {
  if (!existing) return true;
  if (incoming?.explanationId && incoming.explanationId === existing.explanationId) return false;
  const a = generatedMs(incoming);
  const b = generatedMs(existing);
  if (a != null && b != null) return a > b;
  return true;
}

/**
 * 发布一份快照。返回 {accepted, snapshot}：
 *   accepted=false 表示这次是旧快照/同一份，已丢弃（调用方据此决定要不要提示）。
 *
 * @param {{assetId:string, windowKey?:string, envelope:object}} input
 */
export function publishExplanation({ assetId, windowKey = 'session', envelope } = {}) {
  const explanation = envelope?.explanation ?? envelope;
  const snapshot = {
    explanationId: explanation?.id ?? null,
    assetId,
    windowKey,
    generatedAt: explanation?.generatedAt ?? envelope?.meta?.generatedAt ?? null,
    envelope,
  };
  const key = keyOf(assetId, windowKey);
  const existing = REGISTRY.get(key) ?? null;
  if (!snapshot.explanationId) return { accepted: false, snapshot: existing, reason: 'no-id' };
  if (!isNewer(snapshot, existing)) return { accepted: false, snapshot: existing, reason: 'stale' };

  REGISTRY.set(key, snapshot);
  for (const fn of LISTENERS.get(key) ?? []) fn(snapshot);
  return { accepted: true, snapshot };
}

/** 读当前快照（不发请求） */
export function currentExplanation(assetId, windowKey = 'session') {
  return REGISTRY.get(keyOf(assetId, windowKey)) ?? null;
}

/** 所有视图共享的那个 id（没有快照时为 null） */
export function currentExplanationId(assetId, windowKey = 'session') {
  return currentExplanation(assetId, windowKey)?.explanationId ?? null;
}

/** 订阅：立即收到当前值，之后每次新版本都会通知 */
export function subscribeExplanation(assetId, windowKey, fn) {
  const key = keyOf(assetId, windowKey);
  if (!LISTENERS.has(key)) LISTENERS.set(key, new Set());
  LISTENERS.get(key).add(fn);
  fn(REGISTRY.get(key) ?? null);
  return () => LISTENERS.get(key)?.delete(fn);
}

/** 只读快照列表（诊断与测试） */
export function allExplanations() {
  return [...REGISTRY.values()];
}

/** 清空（测试用） */
export function resetExplainStore() {
  REGISTRY.clear();
  LISTENERS.clear();
}
