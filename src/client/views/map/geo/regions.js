/* ================================================================== *
 * 赛区地理：锚点、国家 → 赛区、国家中文名
 *
 * **唯一口径是后端 `src/server/domain/news-lexicon.js` 的 `REGION_WORDS`。**
 * 某国的事件在后端会被归到哪个赛区，地图上就归到哪个赛区 —— 否则会出现
 * 「事件流说这条属于中东，地图上伊朗却是灰色、点了没反应」这种自相矛盾。
 *
 * 所以每条映射都带一个 `lexicon` 字段：它是该国在对应赛区词表里
 * **确实存在**的那个词形。`tests/worldmap-geo.test.js` 拿它去查后端词表，
 * 两边不一致就报错，词表一改测试立刻提示同步。
 *
 * 与 v2 计划书的两处修正（以词表为准）：
 *   · 俄罗斯 → eu（`REGION_WORDS.eu` 里就有 Russia / Russland / Россия / Moscow）
 *   · 澳大利亚 → asia（`REGION_WORDS.asia` 里就有 Australia / Australien）
 *   计划书把它们列在「未归属」，但后端词表明确收录，按「以词表为准」改过来。
 * ================================================================== */

/**
 * 赛区的语义类别（方案 §3.5 / A5）。
 *
 * 「地理分区」「经济组织」「交易地」是三件不同的事，不能共用一个标签：
 *   · eu 是**地理**欧洲，包含俄罗斯、瑞士、挪威、波兰等非欧元区国家；
 *   · asia 是**地理**亚太其他地区，包含澳大利亚、印度等，不是「东南亚」；
 *   · 欧元区（eurozone）、欧盟（EU）是经济组织；上期所、CME 是交易地。
 * 把地理赛区叫成「欧元区」会让「俄罗斯属于欧元区」这种明显错误看起来合理。
 */
export const REGION_SEMANTICS = {
  kind: 'geographic',
  geographic: true,
  /** 经济组织不是赛区，界面要单独表达（目前只在文案里出现，不参与分区） */
  economicOrganizations: ['欧元区（eurozone）', '欧盟（EU）', '东盟（ASEAN）', 'OPEC+'],
  /** 交易地同样不是赛区：同一地区可以有多个交易所、不同交易时段 */
  tradingVenuesNote: '交易地（交易所 / 交易时段）与事件发生地分开计算，不能互相代替',
};

/**
 * 赛区锚点（经纬度）。
 * `global` 没有地理起点 —— 付费用事件不该凭空钉在格陵兰外海，
 * 所以地图上不为它画锚点，只在播报台标注「全球」，靶点城市照常高亮。
 *
 * 标签用**地理**口径（2026-10-28 A5）：
 *   eu   = 欧洲（含非欧元区国家）
 *   asia = 亚太（含澳大利亚、印度等，不等于东南亚）
 */
export const REGION_ANCHORS = {
  us: { lon: -98, lat: 39, label: '北美' },
  cn: { lon: 105, lat: 34, label: '中国' },
  eu: { lon: 10, lat: 50, label: '欧洲' },
  uk: { lon: -3, lat: 55, label: '英国' },
  jp: { lon: 138, lat: 36.5, label: '日本' },
  me: { lon: 45, lat: 29, label: '中东' },
  asia: { lon: 106, lat: 14, label: '亚太' },
  latam: { lon: -60, lat: -15, label: '拉美' },
  africa: { lon: 20, lat: 5, label: '非洲' },
  global: { lon: -30, lat: 62, label: '全球', noAnchor: true },
};

/** 赛区的展示顺序（与后端词表的优先级一致：具体 → 宽泛） */
export const REGION_ORDER = ['me', 'latam', 'africa', 'asia', 'jp', 'uk', 'eu', 'us', 'cn'];

/**
 * 国家表：ISO 3166-1 数字码（world-atlas 用字符串）→ 中文名 / 赛区 / 词表证据。
 *
 *   cn       中文名，悬停 tooltip 与图例用
 *   region   赛区；null 表示悬停只显示国名，不可点击
 *   lexicon  该国在 REGION_WORDS[region] 里确实存在的词形（不外文则用中文）
 */
export const COUNTRY_META = {
  // ---- 北美 ----
  840: { cn: '美国', region: 'us', lexicon: 'United States' },
  124: { cn: '加拿大', region: 'us', lexicon: '加拿大' },

  // ---- 中国 ----
  156: { cn: '中国', region: 'cn', lexicon: '中国' },
  // 香港/澳门在 110m 底图里没有独立多边形，由城市节点（hkg）承担

  // ---- 欧洲（地理口径；含词表收录的俄罗斯、瑞士、挪威等非欧元区国家）----
  276: { cn: '德国', region: 'eu', lexicon: '德国' },
  250: { cn: '法国', region: 'eu', lexicon: '法国' },
  380: { cn: '意大利', region: 'eu', lexicon: '意大利' },
  724: { cn: '西班牙', region: 'eu', lexicon: '西班牙' },
  528: { cn: '荷兰', region: 'eu', lexicon: '荷兰' },
  56: { cn: '比利时', region: 'eu', lexicon: '比利时' },
  40: { cn: '奥地利', region: 'eu', lexicon: '奥地利' },
  620: { cn: '葡萄牙', region: 'eu', lexicon: '葡萄牙' },
  372: { cn: '爱尔兰', region: 'eu', lexicon: '爱尔兰' },
  300: { cn: '希腊', region: 'eu', lexicon: '希腊' },
  246: { cn: '芬兰', region: 'eu', lexicon: '芬兰' },
  756: { cn: '瑞士', region: 'eu', lexicon: '瑞士' },
  752: { cn: '瑞典', region: 'eu', lexicon: '瑞典' },
  578: { cn: '挪威', region: 'eu', lexicon: '挪威' },
  208: { cn: '丹麦', region: 'eu', lexicon: '丹麦' },
  616: { cn: '波兰', region: 'eu', lexicon: '波兰' },
  203: { cn: '捷克', region: 'eu', lexicon: '捷克' },
  348: { cn: '匈牙利', region: 'eu', lexicon: '匈牙利' },
  643: { cn: '俄罗斯', region: 'eu', lexicon: 'Russia' },

  // ---- 英国 ----
  826: { cn: '英国', region: 'uk', lexicon: '英国' },

  // ---- 日本 ----
  392: { cn: '日本', region: 'jp', lexicon: '日本' },

  // ---- 中东（词表里的 Turkey 也在 me）----
  364: { cn: '伊朗', region: 'me', lexicon: '伊朗' },
  376: { cn: '以色列', region: 'me', lexicon: '以色列' },
  682: { cn: '沙特阿拉伯', region: 'me', lexicon: '沙特' },
  887: { cn: '也门', region: 'me', lexicon: '也门' },
  784: { cn: '阿联酋', region: 'me', lexicon: '阿联酋' },
  368: { cn: '伊拉克', region: 'me', lexicon: '伊拉克' },
  634: { cn: '卡塔尔', region: 'me', lexicon: '卡塔尔' },
  760: { cn: '叙利亚', region: 'me', lexicon: '叙利亚' },
  792: { cn: '土耳其', region: 'me', lexicon: '土耳其' },
  4: { cn: '阿富汗', region: 'me', lexicon: '阿富汗' },
  422: { cn: '黎巴嫩', region: 'me', lexicon: '黎巴嫩' },
  400: { cn: '约旦', region: 'me', lexicon: '约旦' },
  414: { cn: '科威特', region: 'me', lexicon: '科威特' },
  512: { cn: '阿曼', region: 'me', lexicon: '阿曼' },
  275: { cn: '巴勒斯坦', region: 'me', lexicon: '加沙' },

  // ---- 亚太（地理口径；词表把 Australia / India 也算进 asia，不等于东南亚）----
  410: { cn: '韩国', region: 'asia', lexicon: '韩国' },
  356: { cn: '印度', region: 'asia', lexicon: '印度' },
  704: { cn: '越南', region: 'asia', lexicon: '越南' },
  764: { cn: '泰国', region: 'asia', lexicon: '泰国' },
  360: { cn: '印度尼西亚', region: 'asia', lexicon: '印尼' },
  458: { cn: '马来西亚', region: 'asia', lexicon: '马来西亚' },
  608: { cn: '菲律宾', region: 'asia', lexicon: '菲律宾' },
  158: { cn: '台湾', region: 'asia', lexicon: '台湾' },
  586: { cn: '巴基斯坦', region: 'asia', lexicon: '巴基斯坦' },
  50: { cn: '孟加拉', region: 'asia', lexicon: '孟加拉' },
  144: { cn: '斯里兰卡', region: 'asia', lexicon: '斯里兰卡' },
  104: { cn: '缅甸', region: 'asia', lexicon: '缅甸' },
  116: { cn: '柬埔寨', region: 'asia', lexicon: '柬埔寨' },
  36: { cn: '澳大利亚', region: 'asia', lexicon: 'Australia' },

  // ---- 拉美 ----
  76: { cn: '巴西', region: 'latam', lexicon: '巴西' },
  32: { cn: '阿根廷', region: 'latam', lexicon: '阿根廷' },
  484: { cn: '墨西哥', region: 'latam', lexicon: '墨西哥' },
  152: { cn: '智利', region: 'latam', lexicon: '智利' },
  862: { cn: '委内瑞拉', region: 'latam', lexicon: '委内瑞拉' },
  170: { cn: '哥伦比亚', region: 'latam', lexicon: '哥伦比亚' },
  604: { cn: '秘鲁', region: 'latam', lexicon: '秘鲁' },
  858: { cn: '乌拉圭', region: 'latam', lexicon: '乌拉圭' },
  218: { cn: '厄瓜多尔', region: 'latam', lexicon: '厄瓜多尔' },
  68: { cn: '玻利维亚', region: 'latam', lexicon: '玻利维亚' },

  // ---- 非洲 ----
  710: { cn: '南非', region: 'africa', lexicon: '南非' },
  818: { cn: '埃及', region: 'africa', lexicon: '埃及' },
  566: { cn: '尼日利亚', region: 'africa', lexicon: '尼日利亚' },
  404: { cn: '肯尼亚', region: 'africa', lexicon: '肯尼亚' },
  504: { cn: '摩洛哥', region: 'africa', lexicon: '摩洛哥' },
  288: { cn: '加纳', region: 'africa', lexicon: '加纳' },
  231: { cn: '埃塞俄比亚', region: 'africa', lexicon: '埃塞俄比亚' },
  834: { cn: '坦桑尼亚', region: 'africa', lexicon: '坦桑尼亚' },
  12: { cn: '阿尔及利亚', region: 'africa', lexicon: '阿尔及利亚' },
};

/** ISO → 赛区；未收录返回 null（地图上仍然可选，但不可点） */
export function regionOfCountry(iso) {
  const key = normalizeIso(iso);
  return COUNTRY_META[key]?.region ?? null;
}

/** ISO → 中文名；未收录退回 undefined，由调用方用底图自带的英文名 */
export function countryNameCn(iso) {
  return COUNTRY_META[normalizeIso(iso)]?.cn;
}

/**
 * ISO 规范化。world-atlas 给的是字符串、可能带前导零（'004'），
 * 而对象字面量的数字键是 '4' —— 两边都要能对上，所以统一成无前导零的形式。
 */
export function normalizeIso(iso) {
  if (iso == null) return null;
  const s = String(iso);
  if (!/^\d+$/.test(s)) return s;
  return String(Number(s));
}

/** 每个赛区包含哪些 ISO（建图例、做赛区聚焦时用） */
export function countriesByRegion() {
  const out = new Map();
  for (const [iso, meta] of Object.entries(COUNTRY_META)) {
    if (!meta.region) continue;
    if (!out.has(meta.region)) out.set(meta.region, []);
    out.get(meta.region).push(iso);
  }
  return out;
}
