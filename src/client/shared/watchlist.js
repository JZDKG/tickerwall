/* ================================================================== *
 * 关注问题（产品 2.3 的第一块）
 *
 * 「我只关心金价、换汇和出行成本，不想每天翻完所有市场。」
 *
 * 三件事：
 *   1. 一组**固定的**问题清单（不是自由输入）—— 每个问题绑定可解释的资产；
 *      让用户自己写问题，首版既没法验证也没法落实成数据。
 *  2. 最多选三个：选项越多，简报越接近「全部市场」，就退化成现在这样。
 *   3. 存在本地（localStorage），**不要求注册、不接持仓**。
 *
 * 允许跳过：没选就是没选，界面给入口而不是逼人选。简报为空是正常状态。
 * ================================================================== */

/** 可关注的问题。key 稳定（存本地），资产是它依赖的解释对象。 */
export const WATCH_QUESTIONS = [
  {
    key: 'gold-gap',
    question: '国内金为什么与国际金不同步',
    assets: ['gold-intl', 'gold-cn'],
    why: '看境内外价差与汇率这两条腿各自走了多少',
  },
  {
    key: 'fx-cost',
    question: '美元走强会影响我的换汇成本吗',
    assets: ['dxy', 'usdcny'],
    why: '看美元指数与人民币这两端的方向是否一致',
  },
  {
    key: 'oil-cost',
    question: '油价会推高出行与物流成本吗',
    assets: ['oil'],
    why: '看原油的方向与幅度，以及它是否已在成品油端体现',
  },
  {
    key: 'real-yield',
    question: '利率变化对金价意味着什么',
    assets: ['gold-intl', 'us10y'],
    why: '看实际收益率这条主渠道，注意收益率上行对应债券价格下跌',
  },
  {
    key: 'risk-mood',
    question: '现在是避险还是冒险',
    assets: ['sp500', 'vix'],
    why: '看风险篮子与避险篮子的相对强弱，不预测方向',
  },
  {
    key: 'equity-breadth',
    question: '美股这波是普涨还是少数带动',
    assets: ['sp500', 'ndx100'],
    why: '看指数与成分的同步程度，避免把少数权重股当成全市场',
  },
];

export const MAX_WATCHED = 3;
export const WATCH_STORAGE_KEY = 'kanban.watch.v1';

const byKey = new Map(WATCH_QUESTIONS.map((q) => [q.key, q]));

export function questionOf(key) {
  return byKey.get(key) ?? null;
}

/** 只保留已知 key，去重，最多三个 —— 本地数据可能被手改过 */
export function normalizeWatched(keys) {
  const out = [];
  for (const k of Array.isArray(keys) ? keys : []) {
    if (!byKey.has(k) || out.includes(k)) continue;
    out.push(k);
    if (out.length >= MAX_WATCHED) break;
  }
  return out;
}

/** 读取（容错：读不到或损坏都当作没选） */
export function readWatched(storage) {
  try {
    const raw = storage?.getItem?.(WATCH_STORAGE_KEY);
    if (!raw) return [];
    return normalizeWatched(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** 写入；返回实际存下的 key 列表（可能被 normalize 截断） */
export function writeWatched(storage, keys) {
  const next = normalizeWatched(keys);
  try {
    storage?.setItem?.(WATCH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式下 localStorage 会抛：不阻断使用，只是这次没记住
  }
  return next;
}

/** 切换某个问题；已满三个时拒绝新增并说明原因，不静默丢掉用户刚点的那个 */
export function toggleWatched(keys, key) {
  const cur = normalizeWatched(keys);
  if (!byKey.has(key)) return { keys: cur, changed: false, reason: 'UNKNOWN' };
  if (cur.includes(key)) return { keys: cur.filter((k) => k !== key), changed: true, reason: null };
  if (cur.length >= MAX_WATCHED) return { keys: cur, changed: false, reason: 'FULL' };
  return { keys: [...cur, key], changed: true, reason: null };
}

/** 这些问题覆盖到的资产集合（简报据此筛选事件与解释） */
export function assetsOf(keys) {
  const set = new Set();
  for (const k of normalizeWatched(keys)) {
    /**
     * 这里**不写 `?.` / `??`**：normalizeWatched 已经保证 key 都是已知的，
     * 再加一层防御就是不可达分支 —— 不可达的防御会让覆盖率变成一句假话，
     * 也会让后来的读者以为「key 可能不存在」。
     */
    for (const a of byKey.get(k).assets) set.add(a);
  }
  return set;
}
