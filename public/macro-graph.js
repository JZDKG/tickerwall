/* ================================================================== *
 * 金融产品传导图谱与宏观逻辑沙盘
 *
 * 纯函数模块：只产出 HTML/SVG 字符串，不碰 DOM、不发请求。
 * app.js 负责把它挂到 #/macro 顶部并绑定事件（局部重绘，不重新请求 /api/macro）。
 *
 * 数据分工：
 *   定性 —— MACRO_TRANSMISSION_EDGES（18 条因果边，写死的金融常识）
 *   定量 —— /api/macro 的 matrix / recent.changes（实测相关与最新涨跌）
 * 两者交叉的地方就是 evaluateEdgeReality()：拿实测去检验理论。
 * ================================================================== */

export const GRAPH_SIZE = { width: 860, height: 540 };

const POS = '#f5455c'; // 正向：暖红（与 --up 同色，但语义是「同向」不是「上涨」）
const NEG = '#5b9cf8'; // 负向：冷蓝
const DIV = '#f59e0b'; // 背离：琥珀
const kinds = { pos: POS, neg: NEG, div: DIV };

/* ------------------------------------------------------------------ *
 * 1. 生态位坐标（画布 860 × 540）
 *
 * 13 个宏观标的按「在宏观链条里的功能」钉死在四个生态位，不做力导向乱飞。
 * 同源标的（WTI↔布伦特、国际金↔沪金、VIX↔VXN）在全局视图里合并成一张卡，
 * 主画布核心节点 10 个 —— 18 条边里 E16/E18 属于「簇内联动」，
 * 只在单点导图里画，否则全局图会出现两条几乎重合的平行短线。
 * ------------------------------------------------------------------ */
const node = (id, x, y, w, h, sub) => ({ id, x, y, w, h, sub: sub ?? null });

export const MACRO_GRAPH_NODES = [
  // ① 全球定价之锚（顶层中枢）
  node('dxy', 300, 86, 114, 56),
  node('us10y', 588, 86, 114, 56),
  // ② 通胀与实体之源（左翼）
  node('oil', 142, 236, 118, 70, 'brent'),
  node('copper', 142, 368, 118, 56),
  // ③ 终极避险与波动温度计（右翼）
  node('gold-intl', 718, 236, 118, 70, 'gold-cn'),
  node('vix', 718, 368, 118, 70, 'vxn'),
  // ④ 全球权益与高 Beta（底层）
  // 顺序不是随手排的：把上证放最左（紧邻铜，E12 中国需求映射才短）、标普与纳指相邻
  // （E17 美股共振直接连）、纳指与 BTC 相邻（E13 科技与流动性直接连）。
  // 这样 3 条权重 3 的强相关边都不必为了绕开中间节点而拱出画布，
  // 全图只剩 E04（美元→BTC）和 E14（标普→VIX）两条长对角线。
  // 横向拉到 118~742（间距 208、净空 96px）：现成 4~6 字胶囊最宽 83px，
  // 净空不到 96 就得靠引线把胶囊挑出线外，那个「挑出来再连回去」的引线在相邻节点之间很难看。
  node('sh000001', 118, 470, 112, 56),
  node('sp500', 326, 470, 112, 56),
  node('ndx100', 534, 470, 112, 56),
  node('btc', 742, 470, 112, 56),
];

export const ZONE_LABELS = [
  { text: '① 全球定价之锚 · 流动性总阀', x: 16, y: 20, anchor: 'start', tone: 'anchor' },
  // ②③ 的 y 从 176 提到 164：簇内边锚点挂在 y=187（节点顶 201 上方 14px），
  // 176 的基线会让两者只剩半像素净空，1280 宽度下看起来像贴在一起。
  { text: '② 通胀与实体之源', x: 16, y: 164, anchor: 'start', tone: 'commodity' },
  { text: '③ 终极避险 · 波动温度计', x: 844, y: 164, anchor: 'end', tone: 'hedge' },
  { text: '④ 全球权益与高 Beta', x: 16, y: 528, anchor: 'start', tone: 'risk' },
];

/* ------------------------------------------------------------------ *
 * 2. 18 条核心因果传导边
 *
 * sign: +1 同向 / -1 反向；weight 1~3 只影响线宽与默认不透明度（纯视觉）。
 * bend: 二次贝塞尔控制点沿法线的偏移（px），手工调过，用来把平行边掰开、
 *       并绕开会挡路的中转节点（E10 从原油到标普必须绕开铜，E13 必须绕开上证）。
 * pill: 胶囊位置微调，短边（E11 只有 62px 落差）胶囊放不下才需要挪。
 * ------------------------------------------------------------------ */
export const MACRO_TRANSMISSION_EDGES = [
  {
    id: 'E01', from: 'dxy', to: 'gold-intl', sign: -1, weight: 3, label: '计价压制',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '国际黄金以美元计价。美元走强一方面抬高非美买家的本币成本，另一方面说明美元信用相对走强，两者共同压制金价。',
    divergence: '地缘危机 / 主权债务担忧：爆发战争或市场担忧美债信用时，资金同时涌入美元与黄金避险，出现罕见的「同涨」。',
  },
  {
    id: 'E02', from: 'dxy', to: 'oil', sign: -1, weight: 2, label: '计价效应',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '原油贸易以美元结算（石油美元）。美元升值直接削弱新兴市场与欧洲的原油进口购买力，压制以美元计价的油价。',
    divergence: '供给端强冲击：OPEC+ 大幅减产或中东航道受阻时，供给短缺压倒汇率计价，油价与美元同时走强。',
  },
  {
    id: 'E03', from: 'dxy', to: 'copper', sign: -1, weight: 2, label: '计价与流动性',
    bend: -56, pill: { t: 0.54, dx: 0, dy: 0, lead: false },
    mechanism: '美元走强往往伴随全球美元流动性收紧，抑制工业金属的投机需求与非美制造业的原料采购。',
    divergence: '中美制造业共振复苏：全球工业补库需求极强时，基本面拉动铜价无视美元走强。',
  },
  {
    id: 'E04', from: 'dxy', to: 'btc', sign: -1, weight: 2, label: '流动性虹吸',
    bend: 8, pill: { t: 0.48, dx: 0, dy: 0, lead: false },
    mechanism: '美元指数走强代表全球风险资金回流美元现金资产。高风险、高 Beta 的加密资产首当其冲失血。',
    divergence: '加密原生叙事 / ETF 资金流入：现货 ETF 大规模净流入或监管利好期间，BTC 可走出独立行情。',
  },
  {
    id: 'E05', from: 'us10y', to: 'gold-intl', sign: -1, weight: 3, label: '机会成本',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '黄金是零息资产，美债收益率就是持有黄金的直接机会成本。美债利率上行（尤其实际利率上行）对金价构成强压制。',
    divergence: '去美元化与央行购金：全球央行战略性增持黄金、或市场担忧财政赤字货币化时，金价经常顶着高美债利率创新高。',
  },
  {
    id: 'E06', from: 'us10y', to: 'ndx100', sign: -1, weight: 3, label: '估值折现',
    bend: 8, pill: { t: 0.32, dx: 0, dy: 0, lead: false },
    mechanism: '美债 10Y 是全球风险资产定价的「分母」。科技成长股远期现金流占比高（长久期），对利率上行极其敏感。',
    divergence: '经济强劲复苏 / AI 盈利爆发：利率温和上行源于经济繁荣、企业盈利（分子端）增速远超利率涨幅时，纳指可与利率同涨。',
  },
  {
    id: 'E07', from: 'us10y', to: 'dxy', sign: 1, weight: 3, label: '利差吸引',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '美债收益率上升扩大了美元对欧元、日元、人民币的利差优势，吸引全球套息与配置资金流入美元。',
    divergence: '美国财政可持续性危机：美债遭抛售（收益率飙升）若源于市场质疑财政纪律，美元反而可能随美债价格一同下跌（股债汇三杀）。',
  },
  {
    id: 'E08', from: 'oil', to: 'gold-intl', sign: 1, weight: 2, label: '通胀驱动',
    bend: 0, pill: { t: 0.48, dx: 0, dy: 0, lead: false },
    mechanism: '原油是「通胀之母」。油价上涨直接推升 CPI 与通胀预期，激发黄金作为硬通货的抗通胀保值需求。',
    divergence: '衰退型油价下跌 / 紧缩抢跑：衰退担忧升温时原油因需求坍塌暴跌，而黄金因避险与降息预期反而上涨（金油比飙升）。',
  },
  {
    id: 'E09', from: 'oil', to: 'us10y', sign: 1, weight: 2, label: '通胀与加息',
    bend: 0, pill: { t: 0.42, dx: 0, dy: 0, lead: false },
    mechanism: '油价大涨推升全面通胀预期，迫使美联储推迟降息甚至维持高利率；债券投资者要求更高的通胀补偿，推升美债收益率。',
    divergence: '地缘恐慌下的避险买债：油价暴涨若由突发战争引起，避险资金短期涌入美债，反而压低美债收益率。',
  },
  {
    id: 'E10', from: 'oil', to: 'sp500', sign: -1, weight: 1, label: '能源成本税',
    bend: -16, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '高油价相当于对全社会企业和居民征收「能源税」，挤压航空、物流、制造利润并削弱消费能力（能源板块除外）。',
    divergence: '需求驱动型温和上涨：经济复苏早期需求回暖带动油价与股市同步温和上涨，此时油价反映的是景气而非供给冲击。',
  },
  {
    id: 'E11', from: 'copper', to: 'sp500', sign: 1, weight: 2, label: '经济晴雨表',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '铜广泛用于电力、建筑、新能源与制造业，被称为「铜博士」。铜价走强验证全球实体需求扩张，利好企业盈利。',
    divergence: '供给侧矿端罢工 / 逼仓：铜价暴涨若纯由矿山停产或期货逼仓导致，并不代表实体需求好转。',
  },
  {
    id: 'E12', from: 'copper', to: 'sh000001', sign: 1, weight: 2, label: '中国需求映射',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '中国消耗全球约一半的精炼铜。地产基建与制造业景气度同时驱动铜价与 A 股周期 / 顺周期板块。',
    divergence: '国内纯流动性 / 题材行情：A 股由微盘股或科技主题驱动、而宏观总需求偏弱时，两者相关性明显减弱。',
  },
  {
    id: 'E13', from: 'ndx100', to: 'btc', sign: 1, weight: 3, label: '科技与流动性',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '两者同属全球美元流动性与风险偏好的最前沿晴雨表，机构投资者画像高度重叠，呈显著正相关。',
    divergence: '加密行业独立黑天鹅：交易所暴雷或专属监管事件会导致 BTC 脱离美股独立剧烈波动。',
  },
  {
    id: 'E14', from: 'sp500', to: 'vix', sign: -1, weight: 3, label: '恐慌期权对冲',
    bend: 0, pill: { t: 0.38, dx: 0, dy: 0, lead: false },
    mechanism: '标普 500 下跌时机构恐慌性抢购看跌期权（Put）做尾部保护，直接推升隐含波动率 VIX（实测相关性约 −0.75）。',
    divergence: '极少失效（结构性负相关）：仅在极端逼空行情中，可能出现股指暴涨而看涨期权隐含波动率短暂抬升。',
  },
  {
    id: 'E15', from: 'vix', to: 'gold-intl', sign: 1, weight: 2, label: '避险买盘',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: 'VIX 飙升、全球风险资产剧烈动荡时，避险资金从股市撤出并配置黄金，以对冲尾部风险。',
    divergence: '流动性枯竭危机（Cash is King）：极端崩盘初期（如 2020 年 3 月熔断），机构为补交保证金无差别抛售黄金换现金，黄金随股市短暂同跌。',
  },
  {
    id: 'E16', from: 'gold-intl', to: 'gold-cn', sign: 1, weight: 3, label: '内外盘折算', cluster: true,
    bend: 0, pill: null,
    mechanism: '沪金由伦敦金通过「÷ 31.1035 × 美元兑人民币汇率」传导定价，长周期周频相关性在 +0.72 以上。',
    divergence: '人民币汇率大幅波动 / 境内外溢价：人民币单日大幅波动，或国内春节购金旺季、进口配额收紧时，内外盘出现明显价差偏离。',
  },
  {
    id: 'E17', from: 'sp500', to: 'ndx100', sign: 1, weight: 3, label: '美股共振',
    bend: 0, pill: { t: 0.5, dx: 0, dy: 0, lead: false },
    mechanism: '纳指 100 权重股（科技七巨头）同时占标普 500 近三成权重，两者同受美国宏观与企业盈利驱动（相关性 > +0.92）。',
    divergence: '风格高低切换（价值 vs 成长）：利率急升引发科技股杀估值、资金轮动去能源 / 金融 / 道指时，纳指显著弱于标普。',
  },
  {
    id: 'E18', from: 'oil', to: 'brent', sign: 1, weight: 3, label: '全球原油双锚', cluster: true,
    bend: 0, pill: null,
    mechanism: '同受全球原油供需与 OPEC+ 政策驱动（相关性 > +0.92）。WTI 偏重美国内陆供需，布伦特偏重欧洲与中东海运。',
    divergence: '美湾库欣交割库拥堵 / 地缘航运割裂：地缘冲突封锁红海或霍尔木兹海峡时，布伦特溢价会显著扩大。',
  },
];

export const EDGE_BY_ID = new Map(MACRO_TRANSMISSION_EDGES.map((e) => [e.id, e]));

/** 全局视图只画主干边：簇内联动（E16/E18）留到单点导图 */
export const CORE_EDGES = MACRO_TRANSMISSION_EDGES.filter((e) => !e.cluster);

/* ------------------------------------------------------------------ *
 * 3. 5 大经典宏观剧本
 *
 * edges  = 顺链条走、用高对比流光点亮
 * breaks = 该剧本里「被打破」的常规边（例如地缘危机下美元与黄金同涨），
 *          单独渲染成琥珀色，比单纯隐藏更有信息量。
 * ------------------------------------------------------------------ */
export const MACRO_PLAYBOOKS = [
  {
    id: 'dollar-tide',
    name: '① 美元潮汐',
    sub: '鹰派加息冲击',
    edges: ['E07', 'E06', 'E01', 'E02', 'E03', 'E04'],
    breaks: [],
    steps: [
      ['美联储收紧或通胀超预期', '10Y ↑'],
      ['利差吸引全球套息资金', '美元 ↑'],
      ['分母端折现率抬升 + 流动性收紧', '黄金 / 原油 / 铜 / BTC ↓'],
      ['长久期成长股杀估值', '纳指 ↓'],
    ],
    note: '「万物皆跌」型冲击：利率与美元同向走强，风险资产与大宗同时承压。',
  },
  {
    id: 'oil-spiral',
    name: '② 石油通胀螺旋',
    sub: '滞胀魅影',
    edges: ['E08', 'E09', 'E06', 'E10'],
    breaks: [],
    steps: [
      ['地缘减产或供给危机引爆油价', '原油 ↑'],
      ['通胀预期抬头，抗通胀买盘进场', '黄金 ↑（一阶）'],
      ['顽固通胀倒逼利率走高', '10Y ↑'],
      ['高估值科技股与消费股承压', '纳指 ↓ / 标普 ↓'],
    ],
    note: '黄金先跟涨、股市后挨打 —— 一阶交易通胀，二阶交易紧缩，节奏差是关键。',
  },
  {
    id: 'geo-crisis',
    name: '③ 地缘危机',
    sub: '黄金美元罕见同涨',
    edges: ['E14', 'E15', 'E09'],
    breaks: ['E01', 'E02'],
    steps: [
      ['战乱或重大地缘冲突爆发', '标普 ↓ → VIX ↑'],
      ['避险资金涌入黄金', '黄金 ↑'],
      ['同时抢购原油防断供、抢美元要流动性', '原油 ↑ / 美元 ↑'],
      ['平时「美元涨→黄金跌」的跷跷板被打破', '美元 ↑ 与 黄金 ↑ 同涨'],
    ],
    note: '这条剧本的意义在于：它专门用来解释背离。看到 E01 / E02 变琥珀色，就该切到这个剧本。',
  },
  {
    id: 'recession',
    name: '④ 衰退恐慌交易',
    sub: '铜油跌、债金涨',
    edges: ['E11', 'E14', 'E05'],
    breaks: ['E10'],
    steps: [
      ['非农 / 制造业数据暴雷', '铜 ↓ / 原油 ↓'],
      ['对实体需求最敏感的铜博士率先下跌', '标普 ↓'],
      ['押注央行大幅降息，美债收益率跳水', '10Y ↓'],
      ['持有成本下降 + 避险需求', '黄金 ↑（独立走强）'],
    ],
    note: '注意 E10「能源成本税」在这里失效：油价跌本该利多股市，但需求坍塌压倒成本利好 —— 所以标为打破。',
  },
  {
    id: 'risk-on',
    name: '⑤ 流动性狂欢',
    sub: 'Risk-On 降息交易',
    edges: ['E07', 'E06', 'E01', 'E02', 'E03', 'E04', 'E13', 'E14'],
    breaks: [],
    steps: [
      ['宽松周期开启', '10Y ↓'],
      ['利差优势收窄，美元回落', '美元 ↓'],
      ['廉价资金涌入高 Beta 与实物资产', 'BTC ↑ / 纳指 ↑'],
      ['计价压制反转 + 工业需求预期改善', '黄金 ↑ / 铜 ↑ / 原油 ↑'],
      ['波动率被压平', 'VIX ↓'],
    ],
    note: '与①完全镜像：利率与美元同步下行时，几乎所有风险资产与大宗同涨。',
  },
];

/* ------------------------------------------------------------------ *
 * 4. 小工具
 * ------------------------------------------------------------------ */

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** 估算文本宽度（不依赖 canvas / getComputedTextLength，服务端也能算） */
function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) w += CJK.test(ch) ? size : size * 0.58;
  return w;
}

function signChar(sign) {
  return sign > 0 ? '+' : '−';
}

function fmtPrice(u) {
  const v = u?.last;
  if (v == null || !Number.isFinite(v)) return '—';
  const d = Number.isFinite(u?.decimals) ? u.decimals : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** 变动值 → 可读文本。价格类是对数收益率（转成 %），利率类是百分点差（转成 bp）。 */
export function fmtChg(v, kind) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kind === 'rate') {
    const bp = v * 100;
    return `${bp >= 0 ? '+' : '−'}${Math.abs(bp).toFixed(1)}bp`;
  }
  const p = (Math.exp(v) - 1) * 100;
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}%`;
}

export function findLastValid(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] != null && Number.isFinite(arr[i])) return arr[i];
  return null;
}

export function calcStd(arr) {
  const v = (arr ?? []).filter((x) => x != null && Number.isFinite(x));
  if (v.length < 3) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const ss = v.reduce((a, b) => a + (b - m) ** 2, 0);
  const s = Math.sqrt(ss / (v.length - 1));
  return s > 0 ? s : null;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/**
 * 最近 win 期滚动相关。
 *
 * 口径是「最近 win 个**共同**交易日」，不是「最近 win 条日对齐记录」——
 * /api/macro 的 recent.dates 是各市场交易日的并集，单看 oil 与 brent 这种同日历的
 * 组合，最后 20 条里也只有 10 条两边都有值（跨时区休市造成的空洞），
 * 按位置截窗口会直接把样本数打到阈值以下、整条边的 20 期相关恒为 null。
 * 先取成对非空、再截尾 win 个，才是与后端 pairwise 一致的做法。
 */
export function lastRollingCorr(a, b, win = 20) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const xs = [];
  const ys = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  const tail = Math.max(0, xs.length - win);
  const px = xs.slice(tail);
  const py = ys.slice(tail);
  return px.length >= Math.max(6, Math.floor(win * 0.6)) ? pearson(px, py) : null;
}

export function getMatrixCorr(matrix, a, b) {
  if (!matrix?.ids) return null;
  const i = matrix.ids.indexOf(a);
  const j = matrix.ids.indexOf(b);
  if (i < 0 || j < 0) return null;
  const v = matrix.corr?.[i]?.[j];
  return Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ *
 * 5. 背离检测器：拿实盘去检验理论
 *
 * 与文档第四节一致，但把「显著异动」的阈值做成按边可覆盖的常量，
 * 并且额外透出 n / roll20 / longCorr，右侧卡片要用。
 * ------------------------------------------------------------------ */
const SIG_MOVE_K = 0.5; // 单期波动超过 0.5σ 才算「剧烈异动」
const TREND_DIVERGE_ABS = 0.35; // 20 期滚动相关与理论反号且 |ρ20| ≥ 0.35（需 60 期同向反号二次确认）
const TREND_DIVERGE_STRONG = 0.45; // 20 期样本下 |ρ20| ≥ 0.45 对应 |t| > 2.13 (p < 0.05)，无需等 60 期翻转即判强背离
const TREND_ALIGN_ABS = 0.25; // 与理论同号且 |ρ| ≥ 0.25 → 逻辑兑现
const MIN_SAMPLES = 20;

export function evaluateEdgeReality(edge, macroData) {
  const changes = macroData?.recent?.changes ?? {};
  const a = changes[edge.from];
  const b = changes[edge.to];
  const empty = {
    status: 'neutral',
    badge: '○ 数据不足',
    lastA: null,
    lastB: null,
    roll20: null,
    roll60: null,
    longCorr: null,
    n: 0,
  };
  if (!Array.isArray(a) || !Array.isArray(b)) return empty;
  if (a.length < MIN_SAMPLES || b.length < MIN_SAMPLES) return empty;

  const lastA = findLastValid(a);
  const lastB = findLastValid(b);
  const stdA = calcStd(a.slice(-60));
  const stdB = calcStd(b.slice(-60));
  const roll20 = lastRollingCorr(a, b, 20);
  const roll60 = lastRollingCorr(a, b, 60);
  const longCorr = getMatrixCorr(macroData.matrix, edge.from, edge.to);
  const n = Math.max(a.length, b.length);

  const bigMove =
    lastA != null && lastB != null && stdA != null && stdB != null &&
    Math.abs(lastA) > SIG_MOVE_K * stdA && Math.abs(lastB) > SIG_MOVE_K * stdB;
  const prodSign = lastA != null && lastB != null ? Math.sign(lastA * lastB) : 0;
  const dayDiverged = bigMove && prodSign !== 0 && prodSign !== edge.sign;

  // 20 样本 Pearson 标准误约 0.24：门槛收紧到 0.35 并要求 60 期滚动也同向反号（持续性确认），
  // 或 20 期单窗达到 0.45（|t|>2.13, p<0.05 显著反转），滤掉单月随机游走噪声。
  const opp20 = roll20 != null && Math.sign(roll20) !== edge.sign;
  const opp60 = roll60 != null && Math.sign(roll60) !== edge.sign;
  const trendDiverged =
    opp20 &&
    (Math.abs(roll20) >= TREND_DIVERGE_STRONG || (Math.abs(roll20) >= TREND_DIVERGE_ABS && opp60));

  if (dayDiverged || trendDiverged) {
    let badge = '⚡ 逻辑背离';
    if (edge.sign === -1 && lastA > 0 && lastB > 0) badge = '⚡ 罕见同涨';
    else if (edge.sign === -1 && lastA < 0 && lastB < 0) badge = '⚡ 罕见同跌';
    return { status: 'diverged', badge, lastA, lastB, roll20, roll60, longCorr, n, dayDiverged, trendDiverged, bigMove };
  }

  const aligned =
    (bigMove && prodSign === edge.sign) ||
    (roll20 != null && Math.sign(roll20) === edge.sign && Math.abs(roll20) >= TREND_ALIGN_ABS);

  return {
    status: aligned ? 'aligned' : 'neutral',
    badge: aligned ? '✓ 逻辑兑现' : '○ 常态波动',
    lastA, lastB, roll20, roll60, longCorr, n, dayDiverged, trendDiverged, bigMove,
  };
}

/** 全部核心边的实盘状态；同一次渲染只算一遍，避免每个节点各算一次 */
export function evaluateAll(macroData, edges = MACRO_TRANSMISSION_EDGES) {
  return new Map(edges.map((e) => [e.id, evaluateEdgeReality(e, macroData)]));
}

export function findEdge(a, b) {
  if (!a || !b) return null;
  return (
    MACRO_TRANSMISSION_EDGES.find((e) => e.from === a && e.to === b) ??
    MACRO_TRANSMISSION_EDGES.find((e) => e.from === b && e.to === a) ??
    null
  );
}

/** 挑一条最值得提醒的背离边（权重高优先，其次 |ρ20| 大） */
function pickAlert(edges, reality) {
  const div = edges
    .map((e) => ({ e, r: reality.get(e.id) }))
    .filter((x) => x.r?.status === 'diverged')
    .sort((x, y) => y.e.weight - x.e.weight || Math.abs(y.r.roll20 ?? 0) - Math.abs(x.r.roll20 ?? 0));
  return div[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * 6. 几何：把节点框剪到边，并算胶囊落点
 * ------------------------------------------------------------------ */

function rectExit(n, toward) {
  const dx = toward.x - n.x;
  const dy = toward.y - n.y;
  if (!dx && !dy) return { x: n.x, y: n.y };
  const hw = n.w / 2 + 6;
  const hh = n.h / 2 + 6;
  const tx = dx ? hw / Math.abs(dx) : Infinity;
  const ty = dy ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: n.x + dx * t, y: n.y + dy * t };
}

function qPoint(p0, c, p1, t) {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

function edgeGeom(edge, pos) {
  const a = pos.get(edge.from);
  const b = pos.get(edge.to);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = edge.bend ?? 0;
  const ctrl = { x: (a.x + b.x) / 2 + (-dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend };
  // 用「指向控制点」的方向切框，与曲线在端点的切线一致，箭头才不会歪
  const s = rectExit(a, ctrl);
  const e = rectExit(b, ctrl);
  const t = edge.pill?.t ?? 0.5;
  const mid0 = qPoint(s, ctrl, e, t);
  const mid = { x: mid0.x + (edge.pill?.dx ?? 0), y: mid0.y + (edge.pill?.dy ?? 0) };
  // 短边的胶囊必然比两节点间距还宽（纳指→BTC 只有 66px，胶囊 83px），
  // 硬贴线一定压住节点。允许挑到线外再拉一根引线连回曲线 —— 制图里的标准做法。
  const lead = Boolean(edge.pill?.lead) && ((edge.pill?.dx ?? 0) !== 0 || (edge.pill?.dy ?? 0) !== 0);
  return {
    s, c: ctrl, e, mid, mid0, lead,
    d: `M${s.x.toFixed(1)},${s.y.toFixed(1)} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${e.x.toFixed(1)},${e.y.toFixed(1)}`,
  };
}

/**
 * 供离线排版求解器使用的几何探针 —— 与 renderCompass 完全同一套坐标与度量，
 * 否则「求解器说没撞、渲染出来撞了」这种偏差就又回来了。
 */
export function layoutProbe(edges = CORE_EDGES) {
  const pos = new Map(MACRO_GRAPH_NODES.map((n) => [n.id, n]));
  const pills = [];
  for (const e of edges) {
    if (!e.label) continue;
    const g = edgeGeom(e, pos);
    if (!g) continue;
    const samples = [];
    for (let i = 1; i < 24; i += 1) samples.push(qPoint(g.s, g.c, g.e, i / 24));
    pills.push({
      id: e.id,
      from: e.from,
      to: e.to,
      weight: e.weight,
      bend: e.bend ?? 0,
      cx: g.mid.x,
      cy: g.mid.y,
      w: textWidth(`${signChar(e.sign)} ${e.label}`, 9.5) + 15,
      h: 17,
      samples,
    });
  }
  const nodes = MACRO_GRAPH_NODES.map((n) => ({ id: n.id, x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h }));
  const collisions = { pillNode: [], pillPill: [], curveNode: [], curvePill: [] };
  for (const p of pills) {
    for (const n of nodes) {
      if (Math.abs(p.cx - (n.x + n.w / 2)) < (p.w + n.w) / 2 && Math.abs(p.cy - (n.y + n.h / 2)) < (p.h + n.h) / 2) {
        collisions.pillNode.push(`${p.id}@${n.id}`);
      }
      if (n.id !== p.from && n.id !== p.to) {
        for (const pt of p.samples) {
          if (pt.x >= n.x && pt.x <= n.x + n.w && pt.y >= n.y && pt.y <= n.y + n.h) {
            collisions.curveNode.push(`${p.id}->${n.id}`);
            break;
          }
        }
      }
    }
    for (const o of pills) {
      if (o.id === p.id) continue;
      if (p.id < o.id && Math.abs(p.cx - o.cx) < (p.w + o.w) / 2 && Math.abs(p.cy - o.cy) < (p.h + o.h) / 2) {
        collisions.pillPill.push(`${p.id}~${o.id}`);
      }
      for (const pt of o.samples) {
        if (Math.abs(pt.x - p.cx) < p.w / 2 + 2 && Math.abs(pt.y - p.cy) < p.h / 2 + 2) {
          collisions.curvePill.push(`${o.id}->pill(${p.id})`);
          break;
        }
      }
    }
  }
  return { pills, nodes, size: GRAPH_SIZE, collisions };
}

/* ------------------------------------------------------------------ *
 * 7. 全局罗盘视图
 * ------------------------------------------------------------------ */

function nodeBox(data, id, x, y, w, h, opts = {}) {
  const u = data.universe.find((v) => v.id === id);
  if (!u) return '';
  const subU = opts.subId ? data.universe.find((v) => v.id === opts.subId) : null;
  const chg = findLastValid(data.recent?.changes?.[id]);
  const dir = chg == null ? '' : chg > 0 ? 'up' : chg < 0 ? 'down' : '';
  const lines = [];
  lines.push(`<text class="mg-node-name" x="${x}" y="${(y - (subU ? 15 : 6)).toFixed(1)}" text-anchor="middle">${esc(u.short)}</text>`);
  lines.push(`<text class="mg-node-val ${dir}" x="${x}" y="${(y + (subU ? 2 : 11)).toFixed(1)}" text-anchor="middle">${esc(fmtPrice(u))}</text>`);
  if (subU) {
    const sc = findLastValid(data.recent?.changes?.[subU.id]);
    const sdir = sc == null ? '' : sc > 0 ? 'up' : sc < 0 ? 'down' : '';
    lines.push(
      `<text class="mg-node-sub" x="${x}" y="${(y + 19).toFixed(1)}" text-anchor="middle">${esc(subU.short)} ${esc(fmtPrice(subU))}<tspan class="${sdir}"> ${esc(fmtChg(sc, subU.kind))}</tspan></text>`,
    );
  }
  const cls = ['mg-node', `zone-${opts.zone ?? 'anchor'}`, opts.cls ?? ''].filter(Boolean).join(' ');
  return `<g class="${cls}" data-node="${esc(id)}" tabindex="0" role="button"
      aria-label="${esc(u.name)} ${esc(fmtPrice(u))} ${esc(fmtChg(chg, u.kind))}">
      <rect class="mg-node-box" x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="13" />
      ${lines.join('')}
    </g>`;
}

function badgeSVG(x, y, text, tone) {
  const w = textWidth(text, 9) + 12;
  const h = 15;
  return `<g class="mg-tag ${tone}"><rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}"/><text x="${x.toFixed(1)}" y="${(y + 3.2).toFixed(1)}" text-anchor="middle">${esc(text)}</text></g>`;
}

function edgeSVG(edge, geom, reality, opts) {
  const r = reality.get(edge.id);
  const isDiv = r?.status === 'diverged';
  const tone = isDiv ? 'div' : edge.sign > 0 ? 'pos' : 'neg';
  const color = kinds[tone] ?? POS;
  const sw = 1 + edge.weight * 0.42;
  const active = opts.activeEdges ? opts.activeEdges.has(edge.id) : true;
  const dim = opts.hasFocus && !active ? ' is-dim' : '';
  const hot = opts.hotEdge === edge.id ? ' is-hot' : '';
  const broken = opts.brokenEdges?.has(edge.id) ? ' is-broken' : '';
  const dash = tone === 'neg' ? ' stroke-dasharray="6 4"' : isDiv ? ' stroke-dasharray="2 4"' : '';

  let pill = '';
  // 被压暗的边不画胶囊：剧本/沙盘模式下它们只是背景细线，
  // 16 个 14% 透明度的胶囊堆在节点标签附近纯属噪点。
  if (edge.label && !dim) {
    const text = `${signChar(edge.sign)} ${edge.label}`;
    const w = textWidth(text, 9.5) + 15;
    const ph = 17;
    const leadLine = geom.lead
      ? `<line class="mg-pill-lead" x1="${geom.mid0.x.toFixed(1)}" y1="${geom.mid0.y.toFixed(1)}" x2="${geom.mid.x.toFixed(1)}" y2="${geom.mid.y.toFixed(1)}" stroke="${color}" />`
      : '';
    pill = `${leadLine}<g class="mg-pill ${tone}${dim}${hot}" data-edge="${esc(edge.id)}">
        <rect x="${(geom.mid.x - w / 2).toFixed(1)}" y="${(geom.mid.y - ph / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${ph}" rx="${ph / 2}" />
        <text x="${geom.mid.x.toFixed(1)}" y="${(geom.mid.y + 3.3).toFixed(1)}" text-anchor="middle">${esc(text)}</text>
      </g>`;
  }

  const line = `<g class="mg-edge tone-${tone}${dim}${hot}${broken}" data-edge="${esc(edge.id)}"
      data-from="${esc(edge.from)}" data-to="${esc(edge.to)}">
      <path class="mg-edge-hit" d="${geom.d}" />
      <path class="mg-edge-line" d="${geom.d}" stroke="${color}" stroke-width="${sw.toFixed(2)}"${dash} marker-end="url(#mg-arrow-${tone}-${opts.uid})" />
      <path class="mg-edge-flow" d="${geom.d}" stroke="${color}" stroke-width="${(sw * 0.9).toFixed(2)}" />
    </g>`;
  return { line, pill };
}

function defsSVG(uid, tones) {
  const mk = (tone) =>
    `<marker id="mg-arrow-${tone}-${uid}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
      <path d="M0,1.4 L9,5 L0,8.6 Z" fill="${kinds[tone]}" />
    </marker>`;
  return `<defs>${tones.map(mk).join('')}
    <radialGradient id="mg-glow-${uid}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f8b64a" stop-opacity="0.34" />
      <stop offset="100%" stop-color="#f8b64a" stop-opacity="0" />
    </radialGradient>
  </defs>`;
}

function renderCompass(data, state, reality) {
  const uid = 'g';
  const pos = new Map(MACRO_GRAPH_NODES.map((n) => [n.id, n]));
  const playbook = state.playbook ? MACRO_PLAYBOOKS.find((p) => p.id === state.playbook) : null;
  const activeEdges = playbook ? new Set([...playbook.edges, ...playbook.breaks]) : null;
  const brokenEdges = playbook ? new Set(playbook.breaks) : null;
  const pairEdge = findEdge(state.pair?.[0], state.pair?.[1]);
  const hotEdge = playbook ? null : pairEdge?.id ?? null;

  const edgeParts = CORE_EDGES.map((e) => {
    const g = edgeGeom(e, pos);
    if (!g) return null;
    return edgeSVG(e, g, reality, { uid, activeEdges, hasFocus: Boolean(playbook), hotEdge, brokenEdges });
  }).filter(Boolean);
  const edges = edgeParts.map((x) => x.line).join('');
  const pills = edgeParts.map((x) => x.pill).join('');

  const zoneCls = (id) => {
    if (id === 'dxy' || id === 'us10y') return 'anchor';
    if (id === 'oil' || id === 'copper') return 'commodity';
    if (id === 'gold-intl' || id === 'vix') return 'hedge';
    return 'risk';
  };

  const nodes = MACRO_GRAPH_NODES.map((n) => {
    const focusCls = state.graphFocus === n.id ? ' is-focus' : '';
    const isPair = pairEdge && (pairEdge.from === n.id || pairEdge.to === n.id);
    const pairCls = isPair ? ' is-pair' : '';
    const box = nodeBox(data, n.id, n.x, n.y, n.w, n.h, { zone: zoneCls(n.id), subId: n.sub, cls: `${focusCls}${pairCls}` });
    // E16/E18 是簇内边（国际金→沪金、WTI→布伦特），罗盘上不画线 —— 那两条线只在导图里有位置。
    // 但用户在矩阵里点「黄金~沪金」「WTI~布伦特」时会停在罗盘，画布上就没有任何指向。
    // 所以被选中时在宿主卡（沪金挂在黄金卡里、布伦特挂在 WTI 卡里）头顶补一枚机理锚点，
    // 既保住「点横幅必回罗盘 + 右侧必出 edgeCard」的一致性，又不给簇内边分叉一条新视图。
    if (isPair && pairEdge.cluster && !playbook) {
      const r = reality.get(pairEdge.id);
      const tone = r?.status === 'diverged' ? 'mix' : pairEdge.sign > 0 ? 'pos' : 'cold';
      return `${box}${badgeSVG(n.x, n.y - n.h / 2 - 14, `${signChar(pairEdge.sign)} ${pairEdge.label}`, tone)}`;
    }
    return box;
  }).join('');

  const zones = ZONE_LABELS.map(
    (z) => `<text class="mg-zone-label ${z.tone}" x="${z.x}" y="${z.y}" text-anchor="${z.anchor}">${esc(z.text)}</text>`,
  ).join('');

  return `<svg viewBox="0 0 ${GRAPH_SIZE.width} ${GRAPH_SIZE.height}" class="mg-svg" role="img"
      aria-label="金融传导图谱：四象限生态位与 16 条主干因果连线">
    ${defsSVG(uid, ['pos', 'neg', 'div'])}
    ${zones}
    <g class="mg-edges">${edges}</g>
    <g class="mg-pills">${pills}</g>
    <g class="mg-nodes">${nodes}</g>
  </svg>`;
}

/* ------------------------------------------------------------------ *
 * 8. 单点聚焦思维导图
 * ------------------------------------------------------------------ */

const MIND = {
  left: { x: 118, w: 190, h: 60 },
  center: { x: 430, w: 216, h: 92 },
  right: { x: 742, w: 190, h: 60 },
  colH: 300,
};

function mindCard(data, id, x, y, w, h, tone) {
  const u = data.universe.find((v) => v.id === id);
  if (!u) return '';
  const chg = findLastValid(data.recent?.changes?.[id]);
  const dir = chg == null ? '' : chg > 0 ? 'up' : chg < 0 ? 'down' : '';
  return `<g class="mg-mcard ${tone}" data-node="${esc(id)}" tabindex="0" role="button">
    <rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="11" />
    <text class="mg-mcard-name" x="${(x - w / 2 + 12).toFixed(1)}" y="${(y - 6).toFixed(1)}">${esc(u.short)}</text>
    <text class="mg-mcard-val ${dir}" x="${(x - w / 2 + 12).toFixed(1)}" y="${(y + 12).toFixed(1)}">${esc(fmtPrice(u))}<tspan class="mg-mcard-chg ${dir}"> ${esc(fmtChg(chg, u.kind))}</tspan></text>
  </g>`;
}

/** 三次贝塞尔 t=0.5 的点。胶囊要落在这条曲线上，不能按固定偏移摆 —— 否则会飘在线外。 */
function cubicMid(p0, c1, c2, p1) {
  return { x: (p0.x + 3 * c1.x + 3 * c2.x + p1.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p1.y) / 8 };
}

function mindEdgeLabel(edge, at, tone, sign) {
  const text = `${signChar(sign)} ${edge.label}`;
  const w = textWidth(text, 9) + 14;
  return `<g class="mg-pill ${tone}">
    <rect x="${(at.x - w / 2).toFixed(1)}" y="${(at.y - 8.5).toFixed(1)}" width="${w.toFixed(1)}" height="17" rx="8.5" />
    <text x="${at.x.toFixed(1)}" y="${(at.y + 3.3).toFixed(1)}" text-anchor="middle">${esc(text)}</text>
  </g>`;
}

/** 比值信号卡（金油比 / 金铜比）：设计稿里的 D2 节点，不是标的，是派生指标 */
function ratioCard(data, x, y, w, h) {
  const pick = (id) => data.universe.find((u) => u.id === id);
  const g = pick('gold-intl');
  const rows = [
    ['金油比', 'oil'],
    ['金铜比', 'copper'],
  ]
    .map(([name, id]) => {
      const b = pick(id);
      if (!g?.last || !b?.last) return null;
      const ratio = g.last / b.last;
      const rg = findLastValid(data.recent?.changes?.['gold-intl']);
      const rb = findLastValid(data.recent?.changes?.[id]);
      // 比值收益 ≈ 分子收益 − 分母收益（对数收益之差，转成简单收益后直接显示，
      // 不能再丢给 fmtChg —— 那边是按对数收益做 exp 还原的，会二次换算）
      const chg = rg == null || rb == null ? null : Math.exp(rg - rb) - 1;
      return { name, ratio, chg };
    })
    .filter(Boolean);
  if (!rows.length) return '';
  const inner = rows
    .map(
      (r, i) =>
        `<text class="mg-msig-row" x="${(x - w / 2 + 12).toFixed(1)}" y="${(y - 4 + i * 15).toFixed(1)}">${esc(r.name)} ${r.ratio.toFixed(2)}<tspan class="${r.chg > 0 ? 'up' : r.chg < 0 ? 'down' : ''}"> ${esc(r.chg == null ? '—' : `${r.chg >= 0 ? '+' : '−'}${Math.abs(r.chg * 100).toFixed(2)}%`)}</tspan></text>`,
    )
    .join('');
  return `<g class="mg-msig" data-node="signal">
    <rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="11" />
    <text class="mg-msig-title" x="${(x - w / 2 + 12).toFixed(1)}" y="${(y - h / 2 + 15).toFixed(1)}">宏观信号</text>
    ${inner}
  </g>`;
}

function renderMindmap(data, state, reality) {
  const uid = 'm';
  const focus = state.graphFocus ?? 'gold-intl';
  const up = MACRO_TRANSMISSION_EDGES.filter((e) => e.to === focus);
  const down = MACRO_TRANSMISSION_EDGES.filter((e) => e.from === focus);
  const fu = data.universe.find((v) => v.id === focus);
  const fchg = findLastValid(data.recent?.changes?.[focus]);
  const fdir = fchg == null ? '' : fchg > 0 ? 'up' : fchg < 0 ? 'down' : '';
  // 右侧比左侧多一张派生指标卡（金油比 / 金铜比），列高按较大的一侧算，整体才垂直居中
  const withSignal = focus === 'gold-intl';
  const rightCount = down.length + (withSignal ? 1 : 0);
  const rowH = MIND.left.h;
  const gap = 14;
  const colH = Math.max(up.length, rightCount);
  const totalH = colH * rowH + (colH - 1) * gap;
  const cy = 46 + Math.max(232, Math.min(330, totalH / 2 + 22));
  const topY = cy - (colH * rowH + (colH - 1) * gap) / 2 + rowH / 2;

  const colYs = (n) => {
    if (!n) return [];
    const top = cy - (n * rowH + (n - 1) * gap) / 2 + rowH / 2;
    return Array.from({ length: n }, (_, i) => top + i * (rowH + gap));
  };
  void topY;

  const edges = [];
  const cards = [];
  const labels = [];

  // 先算中心卡左右边界，曲线两端要用
  const cLeft = MIND.center.x - MIND.center.w / 2;
  const cRight = MIND.center.x + MIND.center.w / 2;
  const lRight = MIND.left.x + MIND.left.w / 2;
  const rLeft = MIND.right.x - MIND.right.w / 2;

  const bezier = (x0, y0, x1, y1) => {
    const c1 = { x: x0 + (x1 - x0) * 0.55, y: y0 };
    const c2 = { x: x0 + (x1 - x0) * 0.45, y: y1 };
    return {
      d: `M${x0.toFixed(1)},${y0.toFixed(1)} C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`,
      mid: cubicMid({ x: x0, y: y0 }, c1, c2, { x: x1, y: y1 }),
    };
  };

  for (const [i, e] of up.entries()) {
    const y = colYs(up.length)[i];
    cards.push(mindCard(data, e.from, MIND.left.x, y, MIND.left.w, rowH, e.sign > 0 ? 'pos' : 'neg'));
    const { d, mid } = bezier(lRight + 3, y, cLeft - 4, cy);
    const tone = reality.get(e.id)?.status === 'diverged' ? 'div' : e.sign > 0 ? 'pos' : 'neg';
    edges.push(`<g class="mg-edge tone-${tone}" data-edge="${esc(e.id)}">
      <path class="mg-edge-hit" d="${d}" />
      <path class="mg-edge-line" d="${d}" stroke="${kinds[tone]}" stroke-width="${(1 + e.weight * 0.4).toFixed(2)}" marker-end="url(#mg-arrow-${tone}-${uid})" />
      <path class="mg-edge-flow" d="${d}" stroke="${kinds[tone]}" stroke-width="1.3" />
    </g>`);
    labels.push(mindEdgeLabel(e, mid, tone, e.sign));
  }

  const rys = colYs(rightCount);
  down.forEach((e, i) => {
    const y = rys[i];
    cards.push(mindCard(data, e.to, MIND.right.x, y, MIND.right.w, rowH, e.sign > 0 ? 'pos' : 'neg'));
    const { d, mid } = bezier(cRight + 4, cy, rLeft - 3, y);
    const tone = reality.get(e.id)?.status === 'diverged' ? 'div' : e.sign > 0 ? 'pos' : 'neg';
    edges.push(`<g class="mg-edge tone-${tone}" data-edge="${esc(e.id)}">
      <path class="mg-edge-hit" d="${d}" />
      <path class="mg-edge-line" d="${d}" stroke="${kinds[tone]}" stroke-width="${(1 + e.weight * 0.4).toFixed(2)}" marker-end="url(#mg-arrow-${tone}-${uid})" />
      <path class="mg-edge-flow" d="${d}" stroke="${kinds[tone]}" stroke-width="1.3" />
    </g>`);
    labels.push(mindEdgeLabel(e, mid, tone, e.sign));
  });

  if (withSignal) {
    const y = rys[down.length];
    cards.push(ratioCard(data, MIND.right.x, y, MIND.right.w, rowH));
    const { d } = bezier(cRight + 4, cy, rLeft - 3, y);
    edges.push(
      `<g class="mg-edge tone-div is-signal"><path class="mg-edge-line" d="${d}" stroke="${DIV}" stroke-width="1.2" stroke-dasharray="2 4" marker-end="url(#mg-arrow-div-${uid})" /></g>`,
    );
  }

  const cx = MIND.center.x;
  const centerCard = `<g class="mg-focus" data-node="${esc(focus)}">
    <rect x="${cLeft.toFixed(1)}" y="${(cy - MIND.center.h / 2).toFixed(1)}" width="${MIND.center.w}" height="${MIND.center.h}" rx="16" />
    <text class="mg-focus-name" x="${cx}" y="${(cy - 22).toFixed(1)}" text-anchor="middle">${esc(fu?.name ?? focus)}</text>
    <text class="mg-focus-val ${fdir}" x="${cx}" y="${(cy + 3).toFixed(1)}" text-anchor="middle">${esc(fmtPrice(fu))}</text>
    <text class="mg-focus-chg ${fdir}" x="${cx}" y="${(cy + 22).toFixed(1)}" text-anchor="middle">${esc(fmtChg(fchg, fu?.kind))}</text>
    <text class="mg-focus-unit" x="${cx}" y="${(cy + 38).toFixed(1)}" text-anchor="middle">${esc(fu?.unit ?? '')}</text>
  </g>`;

  const colTitle = (text, x, anchor) =>
    `<text class="mg-col-title" x="${x}" y="26" text-anchor="${anchor}">${esc(text)}</text>`;
  const emptySide = (text, x, y) => `<text class="mg-empty" x="${x}" y="${y}" text-anchor="middle">${esc(text)}</text>`;

  // VXN 这类「同族但没登记独立因果边」的标的，两侧都空 —— 光写「没有上游/没有下游」
  // 会让人以为图坏了，补一句它为什么不在图谱里。
  const TRIBUTARY = {
    vxn: 'VXN 与 VIX 同族（纳指 / 标普的隐含波动率），本图谱把 VIX 当作波动率生态位的代表节点，VXN 只作为 VIX 卡片里的子行出现。',
  };
  const orphan = up.length || rightCount ? '' : TRIBUTARY[focus] ?? '这个标的目前没有登记任何理论传导边。';

  // 导图内容通常只有 300~460 高，用固定 540 的 viewBox 会在下方留一大片空白，
  // 直接把画布拉到内容底部 + 40 的呼吸位，页面也少滚一屏。
  const viewH = Math.round(
    Math.max(cy + (colH * rowH + (colH - 1) * gap) / 2 + 42, orphan ? cy + 150 : 300),
  );
  return `<svg viewBox="0 0 ${GRAPH_SIZE.width} ${viewH}" class="mg-svg" role="img"
      aria-label="单点聚焦思维导图：${esc(fu?.name ?? focus)} 的上游驱动与下游传导">
    ${defsSVG(uid, ['pos', 'neg', 'div'])}
    ${colTitle(`⬅ 上游：谁在驱动它（${up.length}）`, 20, 'start')}
    ${colTitle(`下游：它影响谁（${down.length}${withSignal ? ' + 1 信号' : ''}）➡`, 840, 'end')}
    <g class="mg-edges">${edges.join('')}</g>
    ${labels.join('')}
    ${cards.join('')}
    ${centerCard}
    ${up.length ? '' : emptySide('没有已登记的理论上游', MIND.left.x, cy)}
    ${rightCount ? '' : emptySide('没有已登记的理论下游', MIND.right.x, cy)}
    ${
      orphan
        ? `<foreignObject x="140" y="${(cy + 70).toFixed(0)}" width="580" height="70">
             <div xmlns="http://www.w3.org/1999/xhtml" class="mg-orphan">${esc(orphan)}</div>
           </foreignObject>`
        : ''
    }
  </svg>`;
}

/* ------------------------------------------------------------------ *
 * 9. 沙盘推演
 * ------------------------------------------------------------------ */

const SHOCK_SOURCES = ['oil', 'dxy', 'us10y', 'vix', 'copper', 'ndx100'];

export function propagateShock(sourceId, dir, maxHop = 2) {
  const paths = [];
  const walk = (nodeId, d, hop, trail) => {
    for (const e of CORE_EDGES) {
      if (e.from !== nodeId) continue;
      if (trail.includes(e.to)) continue;
      const nd = d * e.sign;
      paths.push({ target: e.to, dir: nd, hop: hop + 1, trail: [...trail, e.to], edges: e.id, chain: trail.map((x) => ({ id: x })) });
      if (hop + 1 < maxHop) walk(e.to, nd, hop + 1, [...trail, e.to]);
    }
  };
  walk(sourceId, dir, 0, [sourceId]);

  const byNode = new Map();
  for (const p of paths) {
    if (!byNode.has(p.target)) byNode.set(p.target, []);
    byNode.get(p.target).push(p);
  }
  const state = new Map();
  for (const [id, list] of byNode) {
    const dirs = new Set(list.map((p) => p.dir));
    state.set(id, {
      dirs,
      conflict: dirs.size > 1,
      hop: Math.min(...list.map((p) => p.hop)),
      paths: list,
    });
  }
  return state;
}

function renderSandbox(data, state, reality) {
  const uid = 's';
  const pos = new Map(MACRO_GRAPH_NODES.map((n) => [n.id, n]));
  const shock = state.shock;
  const prop = shock ? propagateShock(shock.id, shock.dir) : new Map();

  const touchedEdges = new Set();
  for (const p of prop.values()) for (const q of p.paths) touchedEdges.add(q.edges);
  const edgeParts = CORE_EDGES.map((e) => {
    const g = edgeGeom(e, pos);
    if (!g) return null;
    const touched = touchedEdges.has(e.id);
    return edgeSVG(e, g, reality, {
      uid,
      activeEdges: touchedEdges,
      hasFocus: Boolean(shock),
      hotEdge: touched ? e.id : null,
    });
  }).filter(Boolean);
  const edges = edgeParts.map((x) => x.line).join('');
  const pills = edgeParts.map((x) => x.pill).join('');

  const zoneCls = (id) => {
    if (id === 'dxy' || id === 'us10y') return 'anchor';
    if (id === 'oil' || id === 'copper') return 'commodity';
    if (id === 'gold-intl' || id === 'vix') return 'hedge';
    return 'risk';
  };

  let nodes = '';
  for (const n of MACRO_GRAPH_NODES) {
    const p = prop.get(n.id);
    let cls = '';
    let tag = '';
    // 底排节点的正上方就是 E14/E17 的胶囊落点，标签压上去会叠成一坨。
    // 底排统一挂到节点下方（标签底边 516 < 画布 540），其余仍在正上方。
    const tagY = n.y > 440 ? n.y + n.h / 2 + 12 : n.y - n.h / 2 - 16;
    if (shock && n.id === shock.id) {
      cls = ' is-source';
      tag = badgeSVG(n.x, tagY, shock.dir > 0 ? '假设大涨 ↑' : '假设大跌 ↓', 'src');
    } else if (p) {
      cls = p.conflict ? ' is-mixed' : p.hop === 1 ? (p.dirs.has(1) ? ' hop-up' : ' hop-down') : p.dirs.has(1) ? ' is-hop2-up' : ' is-hop2-down';
      tag = badgeSVG(
        n.x,
        tagY,
        p.conflict ? '多空交织' : `${p.hop === 1 ? '一阶' : '二阶'}${p.dirs.has(1) ? '利多 ↑' : '利空 ↓'}`,
        p.conflict ? 'mix' : p.dirs.has(1) ? 'src' : 'cold',
      );
    }
    nodes += nodeBox(data, n.id, n.x, n.y, n.w, n.h, { zone: zoneCls(n.id), subId: n.sub, cls });
    nodes += tag;
  }

  const glow = shock
    ? `<circle class="mg-source-glow" cx="${pos.get(shock.id).x}" cy="${pos.get(shock.id).y}" r="86" fill="url(#mg-glow-${uid})" />`
    : '';

  return `<svg viewBox="0 0 ${GRAPH_SIZE.width} ${GRAPH_SIZE.height}" class="mg-svg" role="img"
      aria-label="沙盘推演：一阶二阶传导与多空交织识别">
    ${defsSVG(uid, ['pos', 'neg', 'div'])}
    ${glow}
    <g class="mg-edges">${edges}</g>
    <g class="mg-pills">${pills}</g>
    <g class="mg-nodes">${nodes}</g>
  </svg>`;
}

/* ------------------------------------------------------------------ *
 * 10. 右侧机理卡 / 状态卡
 * ------------------------------------------------------------------ */

function pctCls(v) {
  if (v == null) return '';
  return v > 0 ? 'up' : v < 0 ? 'down' : '';
}

function corrTone(c) {
  if (c == null) return 'dim';
  // 色相只由正负决定（红=正相关 / 蓝=负相关），强弱交给 faint 降透明度。
  // 之前按 |ρ| 阈值在正负之间跳档，会出现「-0.47 显示成琥珀色」这种误导。
  return `${c > 0 ? 'up' : 'cold'}${Math.abs(c) < 0.3 ? ' faint' : ''}`;
}

/**
 * 选中的一对标的如果没有登记的理论边（例如「沪金 ~ VIX」），
 * 不要退回一句泛泛的提示 —— 直接给纯实测卡：
 * 250 期相关、20 期滚动、以及「为什么可能间接相关」。
 * 矩阵里 13×13=169 格里只有 34 格有理论边，这个分支会被点到很多次。
 */
function noEdgeCard(data, a, b) {
  const A = data.universe.find((u) => u.id === a);
  const B = data.universe.find((u) => u.id === b);
  const long = getMatrixCorr(data.matrix, a, b);
  const roll60 = lastRollingCorr(data.recent?.changes?.[a], data.recent?.changes?.[b], 60);
  const roll = lastRollingCorr(data.recent?.changes?.[a], data.recent?.changes?.[b], 20);
  const ca = findLastValid(data.recent?.changes?.[a]);
  const cb = findLastValid(data.recent?.changes?.[b]);
  const row = (k, v, cls = '') => `<div class="mg-kv ${cls}"><span>${esc(k)}</span><b>${v}</b></div>`;
  return `<div class="mg-card-head">
      <span class="mg-addr">${esc(B?.short ?? b)}</span>
      <span class="mg-arrowsign dim">⋯</span>
      <span class="mg-addr">${esc(A?.short ?? a)}</span>
      <span class="mg-badge neg">无理论直连</span>
    </div>
    <p class="mg-lead">这两个标的之间没有登记的因果边，下面只有实测数字。</p>
    <div class="mg-sect"><i class="dot"></i><h4>实测相关性</h4>
      ${row(`${A?.short ?? a} 最新`, `<span class="${pctCls(ca)}">${esc(fmtChg(ca, A?.kind))}</span>`)}
      ${row(`${B?.short ?? b} 最新`, `<span class="${pctCls(cb)}">${esc(fmtChg(cb, B?.kind))}</span>`)}
      ${row('250 期相关系数', `<span class="${corrTone(long)}">${long == null ? '—' : (long >= 0 ? '+' : '') + long.toFixed(2)}</span>`)}
      ${row('60 期滚动', `<span class="${corrTone(roll60)}">${roll60 == null ? '—' : (roll60 >= 0 ? '+' : '') + roll60.toFixed(2)}</span>`)}
      ${row('20 期滚动', `<span class="${corrTone(roll)}">${roll == null ? '—' : (roll >= 0 ? '+' : '') + roll.toFixed(2)}</span>`)}
    </div>
    <div class="mg-sect"><i class="dot warn"></i><h4>为什么还会同涨同跌</h4>
      <p>没有直连不等于没有关系。两者常通过共同的上游被间接驱动 —— 例如美元流动性、美债利率、或同一个风险偏好开关。想知道链条，就把焦点切到它们各自的上游看一遍。</p>
    </div>
    <button type="button" class="mg-jump" data-jump="${esc(a)}|${esc(b)}">↓ 跳到下方滚动相关性</button>`;
}

function edgeCard(data, edge, reality, state) {
  if (!edge) {
    const [a, b] = state?.pair ?? [];
    if (a && b) return noEdgeCard(data, a, b);
    return `<div class="mg-card-empty">点画布上的任意一条连线，或点下方矩阵里的格子 —— 这里会显示这条传导关系的机理、实测验证与失效条件。</div>`;
  }
  const r = reality.get(edge.id);
  const A = data.universe.find((u) => u.id === edge.from);
  const B = data.universe.find((u) => u.id === edge.to);
  const tone = r?.status === 'diverged' ? 'div' : edge.sign > 0 ? 'pos' : 'neg';
  const arrow = edge.sign > 0 ? '+' : '−';

  const row = (k, v, cls = '') => `<div class="mg-kv ${cls}"><span>${esc(k)}</span><b>${v}</b></div>`;

  const rollTxt = r?.roll20 == null ? '—' : `${r.roll20 >= 0 ? '+' : ''}${r.roll20.toFixed(2)}`;
  const roll60Txt = r?.roll60 == null ? '—' : `${r.roll60 >= 0 ? '+' : ''}${r.roll60.toFixed(2)}`;
  const longTxt = r?.longCorr == null ? '—' : `${r.longCorr >= 0 ? '+' : ''}${r.longCorr.toFixed(2)}`;
  const rollFit =
    r?.roll20 == null
      ? ''
      : Math.sign(r.roll20) === edge.sign
        ? '<em class="ok">逻辑吻合</em>'
        : r?.trendDiverged
          ? '<em class="warn">正在背离</em>'
          : '<em class="dim">反号偏弱</em>';

  return `<div class="mg-card-head">
      <span class="mg-addr">${esc(B?.short ?? edge.to)}</span>
      <span class="mg-arrowsign ${tone}">◄──[${arrow}]──</span>
      <span class="mg-addr">${esc(A?.short ?? edge.from)}</span>
      <span class="mg-badge ${tone}">${esc(r?.badge ?? '')}</span>
    </div>
    <p class="mg-lead"><b>${esc(edge.label)}</b>　${esc(edge.id)}　权重 ${edge.weight}/3</p>

    <div class="mg-sect"><i class="dot"></i><h4>核心机理</h4>
      <p>${esc(edge.mechanism)}</p>
    </div>

    <div class="mg-sect"><i class="dot"></i><h4>实盘数据验证</h4>
      ${row(`${A?.short ?? edge.from} 最新（${A?.lastDate ?? '—'}）`, `<span class="${pctCls(r?.lastA)}">${esc(fmtChg(r?.lastA, A?.kind))}</span>`)}
      ${row(`${B?.short ?? edge.to} 最新（${B?.lastDate ?? '—'}）`, `<span class="${pctCls(r?.lastB)}">${esc(fmtChg(r?.lastB, B?.kind))}</span>`)}
      ${row('250 期相关系数', `<span class="${corrTone(r?.longCorr)}">${longTxt}</span>`)}
      ${row('60 期滚动', `<span class="${corrTone(r?.roll60)}">${roll60Txt}</span>`)}
      ${row('20 期滚动', `<span class="${corrTone(r?.roll20)}">${rollTxt}</span> ${rollFit}`)}
      ${row('理论方向', `<span class="${edge.sign > 0 ? 'up' : 'cold'}">${arrow} ${edge.sign > 0 ? '同向联动' : '反向压制'}</span>`)}
      ${row('样本', `${r?.n ?? 0} 期`)}
    </div>

    <div class="mg-sect"><i class="dot warn"></i><h4>何时失效（背离条件）</h4>
      <p>${esc(edge.divergence)}</p>
    </div>

    <button type="button" class="mg-jump" data-jump="${esc(edge.from)}|${esc(edge.to)}">↓ 跳到下方滚动相关性</button>`;
}

function mindCardPanel(data, focusId, reality) {
  const up = MACRO_TRANSMISSION_EDGES.filter((e) => e.to === focusId);
  const down = MACRO_TRANSMISSION_EDGES.filter((e) => e.from === focusId);
  const f = data.universe.find((u) => u.id === focusId);
  const line = (e, other, dir) => {
    const r = reality.get(e.id);
    const tone = r?.status === 'diverged' ? 'div' : e.sign > 0 ? 'pos' : 'neg';
    return `<li class="mg-mini" data-edge="${esc(e.id)}">
      <span class="mg-mini-dir ${tone}">${dir === 'up' ? `${signChar(e.sign)}▶` : `${signChar(e.sign)}▶`}</span>
      <span class="mg-mini-name">${esc(other)}</span>
      <span class="mg-mini-tag">${esc(e.label)}</span>
      <span class="mg-mini-roll ${corrTone(r?.roll20)}">${r?.roll20 == null ? '—' : `${r.roll20 >= 0 ? '+' : ''}${r.roll20.toFixed(2)}`}</span>
    </li>`;
  };
  return `<div class="mg-card-head"><span class="mg-addr big">${esc(f?.name ?? focusId)}</span>
      <span class="mg-badge ${f ? 'pos' : 'neg'}">焦点</span></div>
    <p class="mg-lead">上游 ${up.length} 条驱动 · 下游 ${down.length} 条传导。右侧数字是近 20 期实测相关。</p>
    <div class="mg-sect"><i class="dot"></i><h4>⬅ 谁在驱动它</h4>
      <ul class="mg-mini-list">${
        up.map((e) => line(e, data.universe.find((u) => u.id === e.from)?.short ?? e.from, 'up')).join('') || '<li class="mg-mini empty">无已登记上游</li>'
      }</ul>
    </div>
    <div class="mg-sect"><i class="dot"></i><h4>它影响谁 ➡</h4>
      <ul class="mg-mini-list">${
        down.map((e) => line(e, data.universe.find((u) => u.id === e.to)?.short ?? e.to, 'down')).join('') || '<li class="mg-mini empty">无已登记下游</li>'
      }</ul>
    </div>
    <p class="mg-foot-note">点左侧/右侧任意卡片，焦点会带过渡切过去 —— 顺着因果链一路追查。</p>`;
}

function sandboxPanel(data, state) {
  const shock = state.shock;
  if (!shock) {
    return `<div class="mg-card-empty">选一个变量当震源，再点「模拟大涨 ↑」或「模拟大跌 ↓」。一阶、二阶会逐层点亮，两条路径方向打架的标的会标成琥珀色「多空交织」。</div>`;
  }
  const src = data.universe.find((u) => u.id === shock.id);
  const prop = propagateShock(shock.id, shock.dir);

  // 优先解剖「多空交织」的标的，否则挑被击中路径最多的
  const rows = [...prop.entries()].sort(
    (a, b) => Number(b[1].conflict) - Number(a[1].conflict) || b[1].paths.length - a[1].paths.length,
  );
  const target = rows[0];
  const nameOf = (id) => data.universe.find((u) => u.id === id)?.short ?? id;

  const chainHTML = (p) => {
    const parts = p.trail.map((id) => `<span class="mg-chain-node">${esc(nameOf(id))}</span>`);
    const edgeIds = p.edges.split('|');
    void edgeIds;
    return parts.join('<span class="mg-chain-sep">→</span>');
  };

  const conflictBlock = target && target[1].conflict
    ? `<div class="mg-sect"><i class="dot warn"></i><h4>⚡ 多空交织拆解：${esc(nameOf(target[0]))}</h4>
        <ul class="mg-path-list">${target[1].paths
          .filter((p) => p.hop <= 2)
          .map((p) => {
            const e = EDGE_BY_ID.get(p.edges);
            const hopCls = p.dir > 0 ? 'up' : 'cold';
            return `<li class="mg-path">
              <span class="mg-path-hop">${p.hop === 1 ? '一阶' : '二阶'}</span>
              <span class="mg-path-chain">${chainHTML(p)}</span>
              <span class="mg-path-sign ${hopCls}">${e ? `${signChar(e.sign)} ${esc(e.label)}` : ''} ⇒ ${p.dir > 0 ? '利多 ↑' : '利空 ↓'}</span>
            </li>`;
          })
          .join('')}</ul>
        <p class="mg-conclusion">同一个标的通过两条方向相反的路径被击中：短期通常交易<b>一阶</b>逻辑，中期若二阶链条兑现则反向。<b>看到琥珀色就该知道「方向还没定」，而不是「一定涨/跌」。</b></p>
      </div>`
    : '';

  const summary = `<div class="mg-sect"><i class="dot"></i><h4>冲击结果</h4>
      <div class="mg-hopbins">
        <span class="bin up"><b>${[...prop.values()].filter((p) => !p.conflict && p.dirs.has(1)).length}</b>利多</span>
        <span class="bin cold"><b>${[...prop.values()].filter((p) => !p.conflict && p.dirs.has(-1)).length}</b>利空</span>
        <span class="bin mix"><b>${[...prop.values()].filter((p) => p.conflict).length}</b>多空交织</span>
      </div>
    </div>
    <div class="mg-sect"><i class="dot"></i><h4>一阶命中（${[...prop.entries()].filter(([, p]) => p.hop === 1).length}）</h4>
      <ul class="mg-mini-list">${[...prop.entries()]
        .filter(([, p]) => p.hop === 1)
        .map(([id, p]) => {
          const e = EDGE_BY_ID.get(p.paths.find((x) => x.hop === 1)?.edges);
          return `<li class="mg-mini"><span class="mg-mini-dir ${p.dirs.has(1) ? 'pos' : 'neg'}">${p.dirs.has(1) ? '+▶' : '−▶'}</span>
            <span class="mg-mini-name">${esc(nameOf(id))}</span>
            <span class="mg-mini-tag">${esc(e?.label ?? '')}</span>
            <span class="mg-mini-roll ${p.dirs.has(1) ? 'up' : 'cold'}">${p.dirs.has(1) ? '利多' : '利空'}</span></li>`;
        })
        .join('')}</ul>
    </div>`;

  return `<div class="mg-card-head">
      <span class="mg-addr big">${esc(src?.name ?? shock.id)}</span>
      <span class="mg-arrowsign ${shock.dir > 0 ? 'pos' : 'neg'}">${shock.dir > 0 ? '假设大涨 ↑' : '假设大跌 ↓'}</span>
    </div>
    <p class="mg-lead">沿 ${CORE_EDGES.length} 条主干边做两跳传播，方向 = 冲击方向 × 边符号连乘。</p>
    ${summary}
    ${conflictBlock}`;
}

/* ------------------------------------------------------------------ *
 * 11. 顶层区块
 * ------------------------------------------------------------------ */

const MODES = [
  ['compass', '🌐 全局罗盘'],
  ['mindmap', '🌿 单点思维导图'],
  ['sandbox', '⚡ 沙盘推演'],
];

const FOCUS_PILLS = [
  ['gold-intl', '黄金'],
  ['oil', '原油'],
  ['dxy', '美元'],
  ['us10y', '美债10Y'],
  ['ndx100', '纳指'],
  ['sp500', '标普'],
  ['copper', '铜'],
  ['btc', 'BTC'],
  ['vix', 'VIX'],
  ['sh000001', '上证'],
  ['gold-cn', '沪金'],
  ['brent', '布伦特'],
  ['vxn', 'VXN'],
];

export function macroGraphSectionHTML(data, state) {
  const mode = state.graphMode ?? 'compass';
  const reality = evaluateAll(data);
  // 横幅必须和右上角「背离 N/18」扫同一个集合 —— 否则 E16/E18 这两条簇内边一旦背离，
  // 徽章会显示「背离 1/18」却永远没有对应横幅可点。E16/E18 还是 weight 3 的同源定价锚，
  // 它们背离意味着汇率异动 / 航运割裂这类极端行情，恰恰最该置顶。
  const alert = pickAlert(MACRO_TRANSMISSION_EDGES, reality);

  const pairEdge = findEdge(state.pair?.[0], state.pair?.[1]);
  const playbook = state.playbook ? MACRO_PLAYBOOKS.find((p) => p.id === state.playbook) : null;

  let svg = '';
  let panel = '';
  if (mode === 'compass') {
    svg = renderCompass(data, state, reality);
    panel = playbook ? playbookPanel(playbook, data, reality) : edgeCard(data, pairEdge, reality, state);
  } else if (mode === 'mindmap') {
    svg = renderMindmap(data, state, reality);
    panel = mindCardPanel(data, state.graphFocus ?? 'gold-intl', reality);
  } else {
    svg = renderSandbox(data, state, reality);
    panel = sandboxPanel(data, state);
  }

  const alerts = [];
  if (alert) {
    const A = data.universe.find((u) => u.id === alert.e.from);
    const B = data.universe.find((u) => u.id === alert.e.to);
    alerts.push(`<button type="button" class="mg-alert" data-alert="${esc(alert.e.id)}">
      <span class="mg-alert-ico">⚡</span>
      <span class="mg-alert-text">实时背离：<b>${esc(A?.name ?? alert.e.from)} ↔ ${esc(B?.name ?? alert.e.to)}</b>
        ${esc(alert.r.badge.replace('⚡ ', ''))}，近 20 期滚动相关 ${alert.r.roll20 >= 0 ? '+' : ''}${alert.r.roll20.toFixed(2)}
        （理论 ${signChar(alert.e.sign)}），可能是「${esc(alert.e.divergence.split('：')[0])}」逻辑压过了「${esc(alert.e.label)}」</span>
      <span class="mg-alert-go">查看</span>
    </button>`);
  }
  const divCount = [...reality.values()].filter((r) => r.status === 'diverged').length;

  const sub =
    mode === 'compass'
      ? '四象限生态位 · 光点方向＝因果方向 · 胶囊＝4 字机理'
      : mode === 'mindmap'
        ? '上游驱动 → 焦点 → 下游传导，零交叉'
        : '选震源 → 一阶 / 二阶逐层点亮 → 自动拆解多空交织';

  return `<section class="d-block macro-graph-section">
    <div class="mg-head">
      <h3>金融传导图谱与宏观逻辑沙盘
        <span class="h3-note">上半场定性：为什么动　·　下半场定量：动了多少</span>
      </h3>
      <div class="seg mg-modes">${MODES.map(
        ([m, label]) => `<button type="button" class="mg-mode ${mode === m ? 'on' : ''}" data-mode="${m}">${label}</button>`,
      ).join('')}</div>
    </div>

    <div class="mg-tools">
      ${
        mode === 'compass'
          ? `<div class="mg-playbooks">
        <button type="button" class="mg-pb ${playbook ? '' : 'on'}" data-pb="">全部关系</button>
        ${MACRO_PLAYBOOKS.map(
          (p) => `<button type="button" class="mg-pb ${playbook?.id === p.id ? 'on' : ''}" data-pb="${p.id}" title="${esc(p.sub)}">${esc(p.name)}</button>`,
        ).join('')}
      </div>`
          : '<span class="mg-tools-hint">剧本压暗只在「全局罗盘」里生效</span>'
      }
      <span class="mg-divcount ${divCount ? 'has' : ''}" title="18 条传导边中，当前实盘与理论方向相反的条数">
        背离 ${divCount}/18
      </span>
    </div>

    ${alerts.join('')}

    ${
      mode === 'mindmap'
        ? `<div class="mg-focusbar">${FOCUS_PILLS.map(
            ([id, label]) =>
              `<button type="button" class="mg-fpill ${(state.graphFocus ?? 'gold-intl') === id ? 'on' : ''}" data-focus="${id}">${label}</button>`,
          ).join('')}</div>`
        : ''
    }
    ${
      mode === 'sandbox'
        ? `<div class="mg-shockbar">
            <span class="mg-shock-label">震源</span>
            ${SHOCK_SOURCES.map(
              (id) =>
                `<button type="button" class="mg-spick ${state.shock?.id === id ? 'on' : ''}" data-shock="${id}">${
                  data.universe.find((u) => u.id === id)?.short ?? id
                }</button>`,
            ).join('')}
            <span class="mg-shock-sep"></span>
            <button type="button" class="mg-sgo up ${state.shock?.dir > 0 ? 'on' : ''}" data-dir="1">模拟大涨 ↑</button>
            <button type="button" class="mg-sgo down ${state.shock?.dir < 0 ? 'on' : ''}" data-dir="-1">模拟大跌 ↓</button>
            <button type="button" class="mg-sclear" data-clear="1">清除</button>
          </div>`
        : ''
    }

    <div class="graph-stage">
      <div class="graph-canvas">
        ${svg}
        <div class="mg-legend">
          <span class="lg"><svg width="34" height="8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="${POS}" stroke-width="2" marker-end="url(#lg-a)" /><defs><marker id="lg-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1.4 L9,5 L0,8.6 Z" fill="${POS}" /></marker></defs></svg>正向推升</span>
          <span class="lg"><svg width="34" height="8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="${NEG}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#lg-b)" /><defs><marker id="lg-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1.4 L9,5 L0,8.6 Z" fill="${NEG}" /></marker></defs></svg>负向压制</span>
          <span class="lg"><svg width="34" height="8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="${DIV}" stroke-width="2" stroke-dasharray="2 4" marker-end="url(#lg-c)" /><defs><marker id="lg-c" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1.4 L9,5 L0,8.6 Z" fill="${DIV}" /></marker></defs></svg>实盘背离</span>
          <span class="lg note">光点流向 = 因 → 果　·　${sub}</span>
        </div>
      </div>
      <aside class="graph-card">${panel}</aside>
    </div>
  </section>`;
}

function playbookPanel(pb, data, reality) {
  const nameOf = (id) => data.universe.find((u) => u.id === id)?.short ?? id;
  const lit = [...pb.edges, ...pb.breaks]
    .map((id) => EDGE_BY_ID.get(id))
    .filter(Boolean)
    .map((e) => {
      const r = reality.get(e.id);
      const tone = pb.breaks.includes(e.id) ? 'div' : r?.status === 'diverged' ? 'div' : e.sign > 0 ? 'pos' : 'neg';
      return `<li class="mg-mini" data-edge="${esc(e.id)}">
        <span class="mg-mini-dir ${tone}">${pb.breaks.includes(e.id) ? '⚡' : signChar(e.sign) + '▶'}</span>
        <span class="mg-mini-name">${esc(nameOf(e.from))}→${esc(nameOf(e.to))}</span>
        <span class="mg-mini-tag">${esc(e.label)}${pb.breaks.includes(e.id) ? ' · 被打破' : ''}</span>
        <span class="mg-mini-roll ${corrTone(r?.roll20)}">${r?.roll20 == null ? '—' : `${r.roll20 >= 0 ? '+' : ''}${r.roll20.toFixed(2)}`}</span>
      </li>`;
    })
    .join('');

  return `<div class="mg-card-head"><span class="mg-addr big">${esc(pb.name)}</span>
      <span class="mg-badge pos">${esc(pb.sub)}</span></div>
    <ol class="mg-steps">${pb.steps.map(([t, v]) => `<li><span>${esc(t)}</span><b>${esc(v)}</b></li>`).join('')}</ol>
    <div class="mg-sect"><i class="dot"></i><h4>点亮链路（${pb.edges.length + pb.breaks.length}）</h4>
      <ul class="mg-mini-list">${lit}</ul>
    </div>
    <p class="mg-conclusion">${esc(pb.note)}</p>`;
}
