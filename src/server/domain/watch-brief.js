/* ================================================================== *
 * 关注问题简报（产品 2.3 的第二块：从「自上次查看以来」里挑出实质变化）
 *
 * 四条约束，每条都是「不要为了填满版面而说」：
 *   1. 简报**可以为空**。没有实质变化就说「暂无重要更新」，不抓新闻凑数。
 *   2. 只看与所关注问题相关的事件（按资产命中），不是全站事件流。
 *   3. **同一事件的转载不重复提醒**：按指纹（标题归一 + 主体）去重，
 *      而不是按 id —— 转载方会给新 id。
 *   4. 时间窗是「上次查看之后」，不是「最近 24 小时」：用户三天没来，
 *      三天前那件事仍然是「新变化」。
 * ================================================================== */

/** 标题归一化：去掉空白、标点、常见转载前缀，只留可比较的骨架 */
export function titleFingerprint(title) {
  return String(title ?? '')
    .replace(/^(【[^】]*】|\[[^\]]*\])\s*/g, '')
    .replace(/^(快讯|独家|重磅|快报)[：:]\s*/g, '')
    .replace(/[\s\u3000，。、；：！？,.;:!?'"“”‘’（）()【】\[\]—-]/g, '')
    .toLowerCase();
}

const finite = (v) => Number.isFinite(Number(v));

/**
 * 简报条目。
 *
 * @param {{ items: object[], watchedAssets: Set<string>, sinceMs: number, nowMs?: number, limit?: number }} input
 */
export function buildWatchBrief({ items = [], watchedAssets = new Set(), sinceMs = 0, nowMs = Date.now(), limit = 6 } = {}) {
  const out = [];
  const seen = new Map(); // 指纹 → 已收条数

  for (const ev of items ?? []) {
    const at = Date.parse(String(ev?.time ?? '').replace(' ', 'T'));
    if (!finite(at) || at < sinceMs || at > nowMs) continue;

    // 只有命中「所关注问题绑定的资产」的事件才进简报
    const hits = (ev?.symbols ?? []).filter((id) => watchedAssets.has(id));
    if (!hits.length) continue;

    const fp = titleFingerprint(ev?.title);
    if (!fp) continue;

    /**
     * 转载去重：同一个指纹只留一条，但把「还有几家也在报」记下来 ——
     * 读者需要知道这不是孤例，同时不该看到同一句话排三行。
     */
    const prev = seen.get(fp);
    if (prev) {
      prev.sources = (prev.sources ?? 1) + 1;
      continue;
    }
    const row = {
      id: ev.id ?? null,
      title: ev.title,
      time: ev.time,
      level: ev.level ?? null,
      assets: hits,
      sources: 1,
      fingerprint: fp,
    };
    seen.set(fp, row);
    out.push(row);
  }

  // 重要的排前面，其次按时间
  out.sort((a, b) => (b.level === 'high' ? 1 : 0) - (a.level === 'high' ? 1 : 0) || String(b.time).localeCompare(String(a.time)));
  return out.slice(0, limit);
}

/**
 * 整份简报：条目 + 说明。
 *
 * `empty` 是**正常状态**，不是错误。界面据此说「暂无重要更新」。
 */
export function summarizeBrief({ items = [], watchedKeys = [], sinceMs, nowMs = Date.now() } = {}) {
  const hasWatch = (watchedKeys ?? []).length > 0;
  return {
    hasWatch,
    sinceMs: sinceMs ?? null,
    checkedAt: new Date(nowMs).toISOString(),
    items,
    count: items.length,
    empty: items.length === 0,
    /**
     * 没选关注问题时不能说「暂无重要更新」——那是「你不关注任何东西」，
     * 两句话对读者完全不同，界面据此给「选择你关心的问题」的入口。
     */
    reason: !hasWatch ? 'NO_WATCH' : items.length ? 'HAS_ITEMS' : 'NO_CHANGES',
  };
}
