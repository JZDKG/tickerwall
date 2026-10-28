/* ================================================================== *
 * 事件聚合：同一事件一张卡，转载与修订分开
 *
 * 目标（方案 §3.4 / §7.2）：
 *   · 先按 URL 与内容去重，再按「实体 + 动作 + 时间接近」聚成候选事件；
 *   · 疑似同一发言的报道合并展示，但保留每个来源和发布时间；
 *   · 不同时间的政策修订、同主题不同事件**不能**合并；
 *   · 转载不重复计入独立证据（证据层只用 eventId + revision 引用）。
 *
 * 纯函数：不读时钟（now 由调用方传）、不发请求。
 * ================================================================== */

/** 归一化标题：去标点、空白、来源后缀，转小写 */
export function normalizeTitle(s) {
  return String(s ?? '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？；：、""''（）()【】\[\]《》…·—\-_/\\|]/g, '')
    .replace(/[-–—|丨].*(网|社|报|台|频道|资讯|客户端)$/u, '')
    .toLowerCase();
}

/** 粗分词：中文按 2 字滑窗，拉丁按词 —— 只为相似度服务，不做语言处理 */
export function titleTokens(s) {
  const t = normalizeTitle(s);
  const out = new Set();
  for (const word of t.match(/[a-z0-9]+/g) ?? []) out.add(word);
  const cjk = t.replace(/[a-z0-9]+/g, '');
  for (let i = 0; i + 2 <= cjk.length; i += 1) out.add(cjk.slice(i, i + 2));
  return out;
}

/** Jaccard 相似度（0~1） */
export function similarity(a, b) {
  const A = a instanceof Set ? a : titleTokens(a);
  const B = b instanceof Set ? b : titleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function tsOf(v) {
  const t = typeof v === 'number' ? v : Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? t : null;
}

/** 动作词：同一实体 + 同一动作 + 时间接近才算同一事件 */
const ACTION_WORDS = [
  ['降息', '降准', '加息', '维持利率', '按兵不动'],
  ['讲话', '发言', '表示', '称', '表态'],
  ['减产', '增产', '限产'],
  ['制裁', '关税', '谈判', '协议'],
  ['发布', '公布', '数据'],
];

export function actionOf(text) {
  const s = String(text ?? '');
  for (const group of ACTION_WORDS) {
    for (const w of group) if (s.includes(w)) return w;
  }
  return null;
}

/**
 * 按 URL / 内容哈希去重（同一篇原文的多次抓取）。
 * 保留最新抓到的原件，并把旧 id 记在 `duplicates` 里便于追溯。
 */
export function dedupeByUrl(items) {
  const seen = new Map();
  const kept = [];
  for (const it of items ?? []) {
    const key = it.url ? `url:${it.url}` : `hash:${it.contentHash ?? it.id}`;
    if (seen.has(key)) {
      const prev = seen.get(key);
      prev.duplicates = [...(prev.duplicates ?? []), it.id];
      continue;
    }
    seen.set(key, it);
    kept.push(it);
  }
  return kept;
}

/**
 * 聚合成候选事件簇。
 *
 * 合并条件（全部满足）：
 *   · 标题相似度 ≥ threshold（默认 0.62）；
 *   · 动作一致（都识别出动作且相同，或都没识别出动作）；
 *   · 时间差 ≤ windowMs（默认 6 小时）—— 同主题但隔天的政策修订不算同一事件。
 *
 * @param {Array<{id,title,url,publisher,publishedAt,fetchedAt,body?}>} items
 * @param {{ windowMs?:number, threshold?:number }} opts
 */
export function clusterEvents(items, opts = {}) {
  const windowMs = opts.windowMs ?? 6 * 3600_000;
  const threshold = opts.threshold ?? 0.62;
  const list = (items ?? []).filter((it) => it && it.id);
  const clusters = [];

  for (const it of list) {
    const tokens = titleTokens(it.title);
    const action = actionOf(`${it.title ?? ''} ${it.body ?? ''}`);
    const ts = tsOf(it.publishedAt) ?? tsOf(it.fetchedAt) ?? 0;
    let target = null;
    for (const c of clusters) {
      if (Math.abs(c.ts - ts) > windowMs) continue;
      /**
       * 动作一致才算同一事件，但「没识别出动作」不能当成一个动作：
       * 同一段发言被不同媒体写成「：利率将…」「称利率将…」，前者识别不到动作词。
       * 所以只在**双方都识别出动作**时要求相同；否则交给标题相似度判断。
       * 减产 / 增产 这类方向相反的动作都非空，仍然不会合并。
       */
      if (c.action != null && action != null && c.action !== action) continue;
      if (similarity(c.tokens, tokens) < threshold) continue;
      target = c;
      break;
    }
    if (target) {
      target.items.push(it);
      // 主稿取最早发布的那条（最接近原始报道），其余按时间排
      target.items.sort((a, b) => (tsOf(a.publishedAt) ?? 0) - (tsOf(b.publishedAt) ?? 0));
      target.primary = target.items[0];
      target.tokens = titleTokens(target.primary.title);
      // 聚簇一旦确定了动作，后续条目要跟它一致，避免「同一事件」越滚越大
      if (target.action == null) target.action = action;
    } else {
      clusters.push({
        key: `evt:${it.id}`,
        primary: it,
        items: [it],
        ts,
        action,
        tokens,
      });
    }
  }

  return clusters.map((c, i) => ({
    eventId: c.key,
    revision: 1,
    // 一张卡 = 一个事件；卡内保留不同来源与发布时间
    sources: c.items.map((x) => ({ id: x.id, publisher: x.publisher ?? null, publishedAt: x.publishedAt ?? null, url: x.url ?? null })),
    // 转载不重复计入证据：只报「独立来源数」与「报道数」
    articleCount: c.items.length,
    independentPublisherCount: new Set(c.items.map((x) => x.publisher ?? x.id)).size,
    primary: c.primary,
    items: c.items,
    order: i,
  }));
}

/**
 * 判定两条报道是否只是转载关系（同一原文）。
 * 用于证据层：转载不能被算成两条独立证据。
 */
export function isRepostOf(a, b, { threshold = 0.9 } = {}) {
  if (!a || !b) return false;
  if (a.url && b.url && a.url === b.url) return true;
  if (a.contentHash && b.contentHash && a.contentHash === b.contentHash) return true;
  return similarity(a.title, b.title) >= threshold;
}
