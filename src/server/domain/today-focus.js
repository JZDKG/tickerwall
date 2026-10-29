/* ================================================================== *
 * 今天重点三件 + 下一件关键发布（产品 §3 事件中心顶部）
 *
 * 事件中心默认不该是一长串消息流。顶部先回答两件事：
 *   1. 今天值得知道的三件事（最多三件，**可以少于三件**）；
 *   2. 下一件关键发布是什么、还有多久。
 *
 * 排序规则必须**可解释**（方案 §3 的要求），所以每条都带 `why`：
 *   · 等级 high 优先；
 *   · 其次「带可解释标的」（能连到解释的才算「值得知道」，不是热闹）；
 *   · 再次「今天」优先（同一等级下，今天发布的比昨天的更该现在看）；
 *   · 同一事件的转载合并（按标题指纹），只占一个位置。
 *
 * 三条不越界：
 *   · 不足三件就说「今天只有 N 件」——**不凑数**；
 *   · 不排序「影响程度」（没有校准依据），只排「先看哪个」；
 *   · 关键发布只报事实（时间、还有多久），不预测它会不会超预期。
 * ================================================================== */

export const FOCUS_LIMIT = 3;

/** 与 watch-brief 共用同一套指纹规则的口径（但要能独立调用，不互相依赖） */
export function titleKey(title) {
  return String(title ?? '')
    .replace(/^(【[^】]*】|\[[^\]]*\])\s*/g, '')
    .replace(/^(快讯|独家|重磅|快报)[：:]\s*/g, '')
    .replace(/[\s\u3000，。、；：！？,.;:!?'"“”‘’（）()【】\[\]—-]/g, '')
    .toLowerCase();
}

const EXPLAINABLE = new Set(['gold-intl', 'gold-cn', 'oil', 'us10y', 'dxy', 'usdcny', 'sp500', 'vix']);

/**
 * 内部代码 → 读者看得懂的名字。
 *
 * `why` 里曾经直接印 `关联可解释标的（us10y）` —— 内部字段漏到了界面。
 */
export const ASSET_LABEL = {
  'gold-intl': '国际金价',
  'gold-cn': '国内金价',
  oil: '国际原油',
  us10y: '美国 10 年期国债收益率',
  dxy: '美元指数',
  usdcny: '美元兑人民币',
  sp500: '标普 500',
  vix: 'VIX 波动率',
};

/** 文字体系：只用来提示「这条是原文」，不做机器翻译（翻了就成了我编的内容） */
export function scriptOf(text) {
  const s = String(text ?? '');
  if (/[\u4e00-\u9fff]/.test(s)) return 'han';
  if (/[\uac00-\ud7af]/.test(s)) return 'hangul';
  if (/[\u0400-\u04ff]/.test(s)) return 'cyrillic';
  if (/[a-zA-Z]/.test(s)) return 'latin';
  return 'other';
}

const dayOf = (time) => String(time ?? '').slice(0, 10);

/**
 * @param {{ items: object[], day: string, explainable?: Set<string>, limit?: number }} input
 */
export function pickTodayFocus({ items = [], day, explainable = EXPLAINABLE, limit = FOCUS_LIMIT } = {}) {
  const rows = [];
  const seen = new Map();

  for (const ev of items ?? []) {
    if (!ev?.title || dayOf(ev.time) !== day) continue;

    const key = titleKey(ev.title);
    if (!key) continue;
    if (seen.has(key)) {
      // 转载合并：只占一个位置，但记下「几家在报」
      seen.get(key).sources += 1;
      continue;
    }

    const hits = (ev.symbols ?? []).filter((id) => explainable.has(id));
    const row = {
      id: ev.id ?? null,
      title: ev.title,
      time: ev.time,
      level: ev.level ?? null,
      symbols: hits,
      sources: 1,
      /** 排序依据的文字化（读者能看懂为什么它在前面） */
      why: null,
    };
    row.why = [
      ev.level === 'high' ? '高等级' : null,
      hits.length ? `关联到${hits.map((id) => ASSET_LABEL[id] ?? id).join('、')}` : null,
    ].filter(Boolean).join(' · ') || '当天事件';
    // 原文提示：非中文报道不在界面上冒充「已翻译」，只标出来
    row.script = scriptOf(ev.title);
    seen.set(key, row);
    rows.push(row);
  }

  /**
   * 排序第三项是**语言**：同一等级下优先中文报道。
   *
   * 理由很实际：今天重点只有三格，读者点进来是要读懂的。把德语、韩语、
   * 意大利语的标题放在这里，等于占了位置又读不了（外部走查拍到的就是这个）。
   * 非中文不是剔除 —— 中文不够时它们仍然会进来，并标出「原文」。
   */
  const rank = (r) =>
    (r.level === 'high' ? 0 : 1) * 10 + (r.symbols.length ? 0 : 1) * 2 + (r.script === 'han' ? 0 : 1);
  rows.sort((a, b) => rank(a) - rank(b) || String(b.time).localeCompare(String(a.time)));

  return rows.slice(0, limit);
}

/**
 * 下一件关键发布。
 *
 * 只报「什么时候、还有多久」，不预测结果 —— 这一条是方案里最容易被写成
 * 「即将公布，市场预期…」的地方，所以刻意只留事实。
 */
/**
 * 重要性有两套词表：日历服务给的是**数字** 1..3，别处给的是 high/medium/low。
 * 这里统一成数字档位 —— 只认一套会在真实数据上把所有条目过滤掉（曾经就是这样：
 * next 永远是 null，界面一直显示「日历里暂时没有」，而其实有 16 条待发布）。
 */
const IMPORTANCE_RANK = { high: 0, medium: 1, low: 2, 3: 0, 2: 1, 1: 2 };

function rankOf(value) {
  if (typeof value === 'number') {
    if (value >= 3) return 0;
    if (value === 2) return 1;
    return 2;
  }
  return IMPORTANCE_RANK[value] ?? 2;
}

/** UTC 毫秒 → 北京时间的两段字符串（界面要显示、也要能标注时区） */
export function beijingParts(ms) {
  if (!Number.isFinite(Number(ms))) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(Number(ms))).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, zone: 'Asia/Shanghai' };
}

export function nextKeyRelease({ calendar, nowMs = Date.now(), minImportance = 'medium' } = {}) {
  const upcoming = Array.isArray(calendar?.upcoming) ? calendar.upcoming : [];
  const floor = rankOf(minImportance);

  const candidates = [];
  for (const ev of upcoming) {
    const at = Date.parse(String(ev?.releaseAt ?? ''));
    if (!Number.isFinite(at) || at < nowMs) continue;
    if (rankOf(ev.importance) > floor) continue;
    if (!ev.title) continue;
    candidates.push({
      id: ev.id ?? null,
      title: ev.title,
      country: ev.country ?? null,
      importance: ev.importance ?? null,
      releaseAt: ev.releaseAt,
      // 日历给的是 UTC ISO；界面直接用会显示成 UTC 时间（13:30 而非 21:30）
      releaseLocal: beijingParts(at),
      inMs: at - nowMs,
    });
  }
  candidates.sort((a, b) => a.inMs - b.inMs);
  return candidates[0] ?? null;
}

/**
 * 整块顶部结构。
 *
 * `short: true` 表示今天不足三件 —— 界面据此说「今天只有 N 件」，
 * 而不是留两个空位或用低等级事件填满。
 */
export function buildTodayFocus({ items = [], calendar = null, day, nowMs = Date.now(), explainable, limit = FOCUS_LIMIT } = {}) {
  const focus = pickTodayFocus({ items, day, nowMs, ...(explainable ? { explainable } : {}), limit });
  const next = nextKeyRelease({ calendar, nowMs });
  return {
    day: day ?? null,
    focus,
    count: focus.length,
    short: focus.length < limit,
    next,
    /** 说明「为什么是这几件」，把排序规则摊开给读者 */
    rule: '按「高等级 → 关联可解释标的 → 时间新」排序；同一件事的转载只占一位',
  };
}
