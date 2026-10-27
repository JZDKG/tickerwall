/* ================================================================== *
 * 主题滤镜
 *
 * 六个滤镜按 /api/events 返回的 `topics[].key` 匹配（后端 COMPILED_TOPICS
 * 的 key）。计划里 v1 曾把 crypto 也算进「避险」，语义不对 —— 加密不是避险
 * 资产，而是风险资产，所以「贵金属」只剩 precious，crypto 只在「全部」里出现。
 *
 * 纯函数，不碰 DOM。
 * ================================================================== */

/**
 * `topics` 是**要求命中的 key 列表**，`level` 是另一种筛选依据。
 * 两者互斥使用：`high` 按等级，其余按主题。
 */
export const TOPIC_FILTERS = [
  { key: 'all', label: '全部', icon: '🌐' },
  { key: 'high', label: '重要', icon: '🔥', level: 'high' },
  { key: 'fed', label: '美联储 / 利率', icon: '🏦', topics: ['fed', 'inflation', 'jobs', 'rates'] },
  { key: 'geo', label: '地缘 / 能源', icon: '⚔️', topics: ['geopolitics', 'energy'] },
  { key: 'china', label: '中国政策', icon: '🇨🇳', topics: ['china'] },
  { key: 'precious', label: '贵金属', icon: '🪙', topics: ['precious'] },
];

export const FILTER_BY_KEY = new Map(TOPIC_FILTERS.map((f) => [f.key, f]));

/** 事件命中的 topic key 集合 */
export function topicKeysOf(ev) {
  return new Set((ev?.topics ?? []).map((t) => t?.key).filter(Boolean));
}

/** 单个滤镜是否命中该事件 */
export function matchFilter(ev, filterKey) {
  const f = FILTER_BY_KEY.get(filterKey);
  if (!f || f.key === 'all') return true;
  if (f.level) return ev?.level === f.level;
  if (!f.topics?.length) return true;
  const keys = topicKeysOf(ev);
  for (const t of f.topics) if (keys.has(t)) return true;
  return false;
}

/**
 * 同时应用主题滤镜与赛区聚焦。
 * 两个条件是「与」的关系：赛区聚焦时再点滤镜，应该在该赛区内部继续收窄。
 */
export function filterMapEvents(items, { filterKey = 'all', region = null } = {}) {
  const list = Array.isArray(items) ? items : [];
  return list.filter((ev) => {
    if (region && ev.region !== region) return false;
    return matchFilter(ev, filterKey);
  });
}

/**
 * 某条事件的主主题 —— 巡航播报台与弧顶标签都用它。
 * 优先取后端标了 strong 的那个，否则取第一个；都没有返回 null。
 */
export function dominantTopic(ev) {
  const topics = ev?.topics ?? [];
  const strong = topics.find((t) => t?.strong);
  return strong ?? topics[0] ?? null;
}
