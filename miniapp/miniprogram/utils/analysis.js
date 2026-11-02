/* ================================================================== *
 * 派生分析：传导机制观测 + 隔夜复盘分组
 *
 * 这两块数据放在前端算，而不是再开两个云函数接口，理由是：
 *   · 它们**完全由行情派生**，没有额外上游，多一次网络往返只是变慢；
 *   · 行情本身已经有「快照兜底」，派生放在本地，行情在就一定能算出来，
 *     不会出现「有价格但关联页是空」的割裂状态。
 *
 * 机制库内容与 web 端 src/server/domain/explanations/mechanisms.js 同源。
 * 这里只保留小程序能算出观测的 9 条：依赖实际收益率（dfii10）、铜、盈亏
 * 平衡通胀的那几条没有免费稳定源，宁可不展示，也不要用别的指标顶替。
 *
 * **这一页不做归因**：状态词只写「当日一致 / 当日相反 / 无法检验」，
 * 且每条机制都带「什么情况会推翻它」。
 * ================================================================== */

const { dirOf } = require('./format');

const MECHANISMS = [
  {
    id: 'M-GOLD-USD',
    label: '美元计价',
    sign: -1,
    from: 'dxy',
    to: 'gold-intl',
    plain: '计价效应：黄金以美元报价，美元走强会抬高非美买家的本币成本。',
    mechanism: '黄金以美元计价，美元走强时非美买家用本币买金的成本上升，需求受抑，价格倾向于回落。',
    condition: '同一时间窗口内两端都在交易，且报价口径一致。',
    exclusions: ['美元上涨来自避险买盘，而同一事件也在推升黄金', '央行购金等实物需求压过计价效应'],
  },
  {
    id: 'M-GOLD-NOMINAL-RATE',
    label: '名义利率',
    sign: -1,
    from: 'us10y',
    to: 'gold-intl',
    plain: '名义收益率：没有扣除通胀的债券到期收益率。',
    mechanism: '名义收益率上行常伴随折现率抬升，可能压制金价；但名义收益率同时包含通胀补偿，方向不一定等于实际收益率。',
    condition: '只有名义收益率变化、且没有同时出现通胀预期跳升时才可参考。',
    exclusions: ['收益率上行完全由通胀预期推动，实际收益率持平或下行', '实际收益率数据缺失，无法区分是通胀补偿还是真实回报变化'],
  },
  {
    id: 'M-GOLD-OIL-POLICY',
    label: '油价→政策预期',
    sign: 1,
    from: 'oil',
    to: 'gold-intl',
    plain: '间接渠道：油价先影响通胀与政策预期，再影响金价。',
    mechanism: '油价上行推高通胀预期，实际利率下行，于是利多黄金；但若油价上涨来自需求过热，央行可能转鹰，方向会反转。',
    condition: '需要看到通胀预期同步抬升，否则只是两条独立行情。',
    exclusions: ['油价上涨由供给中断驱动、央行并未改变路径', '通胀预期没动、金价却在涨（说明走的是别的渠道）'],
  },
  {
    id: 'M-GOLD-RISK',
    label: '避险需求',
    sign: 1,
    from: 'vix',
    to: 'gold-intl',
    plain: '避险需求：风险事件期间资金转向被认为更安全的资产。',
    mechanism: 'VIX 抬升代表市场对短期波动的定价变贵，资金往往同时买黄金与美元，两者可能同涨。',
    condition: '需要风险事件可核实；单纯的低波动环境不构成避险叙事。',
    exclusions: ['VIX 上行伴随美元走强、黄金却下跌（流动性紧张时卖金换美元）'],
  },
  {
    id: 'M-GOLD-CN-CONVERSION',
    label: '内外盘折算',
    sign: 1,
    from: 'gold-intl',
    to: 'gold-cn',
    plain: '计价换算：国际金按「÷31.1035 × 汇率」折成人民币/克，再叠加境内外溢价。',
    mechanism: '国内金价 = 国际金价 ÷ 31.1035 × 人民币汇率 + 境内外溢价。折算项是恒等式，溢价项才是需要解释的部分。',
    condition: '汇率与单位换算必须同一时点；溢价本身有涨跌，不保证与折算项同向。',
    exclusions: ['汇率大幅波动抵消了金价变化', '国内溢价快速收敛，折算项涨但国内金价没跟上'],
  },
  {
    id: 'M-OIL-USD',
    label: '原油计价',
    sign: -1,
    from: 'dxy',
    to: 'oil',
    plain: '计价效应：原油以美元报价，美元走强会抬高非美买家的采购成本。',
    mechanism: '与黄金同理，美元走强抑制非美需求，原油价格倾向于回落；但供给冲击可以完全盖过计价效应。',
    condition: '供给端没有同时出现中断事件。',
    exclusions: ['OPEC+ 减产、地缘冲突等供给冲击主导价格'],
  },
  {
    id: 'M-OIL-RISK-APPETITE',
    label: '风险偏好',
    sign: -1,
    from: 'vix',
    to: 'oil',
    plain: '风险偏好：市场恐慌时资金撤离风险资产，原油常被归为风险资产一端。',
    mechanism: 'VIX 快速抬升时，原油作为顺周期资产常被减仓，短期相关性明显为负。',
    condition: '冲击来自金融市场而非实体供需。',
    exclusions: ['同期出现供给中断，油价与 VIX 同涨'],
  },
  {
    id: 'M-DXY-RATE-DIFF',
    label: '利差吸引',
    sign: 1,
    from: 'us10y',
    to: 'dxy',
    plain: '利差：两地利率之差决定了套息与资金流向。',
    mechanism: '美债收益率相对上行会吸引资金流入美元资产，推升美元指数。',
    condition: '需要其他经济体利率没有同幅上行。',
    exclusions: ['全球同步加息，利差没变', '风险事件主导，美元因避险而非利差走强'],
  },
  {
    id: 'M-DXY-RISK',
    label: '避险买美元',
    sign: 1,
    from: 'vix',
    to: 'dxy',
    plain: '避险：全球流动性紧张时，美元常被当作结算与避险货币买进。',
    mechanism: 'VIX 抬升常伴随美元流动性需求上升，美元指数走强。',
    condition: '美国自身不是风险源。',
    exclusions: ['风险源在美国本土（债务上限、评级下调），美元反而走弱'],
  },
];

/** 一端报价的展示切片 */
function leg(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    decimals: item.decimals,
    changePct: item.changePct,
    unit: item.unit,
    ok: item.ok !== false,
    stale: !!item.stale,
    dir: dirOf(item.changePct),
  };
}

/** 当日观测：两端涨跌方向与机制方向是否一致（不构成因果结论） */
function observe(m, map) {
  const from = map[m.from];
  const to = map[m.to];
  if (!from || !to) return { key: 'untested', label: '无法检验', note: '有一端没有报价' };
  const a = from.changePct;
  const b = to.changePct;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) {
    return { key: 'untested', label: '无法检验', note: '当日涨跌为 0 或缺值' };
  }
  const same = Math.sign(a) === Math.sign(b);
  const expected = m.sign > 0 ? same : !same;
  const moveText = same ? `两端当日${a > 0 ? '同涨' : '同跌'}` : '当日一涨一跌';
  return expected
    ? { key: 'consistent', label: '当日一致', note: `${moveText}，与机制方向一致` }
    : { key: 'opposite', label: '当日相反', note: `${moveText}，与该机制预期相反，说明有别的主导因素` };
}

/** 输入 quotes.items，输出关联页要渲染的结构 */
function buildMacro(items) {
  const map = {};
  for (const it of items || []) map[it.id] = it;

  const list = MECHANISMS.map((m) => ({
    id: m.id,
    label: m.label,
    sign: m.sign,
    signText: m.sign > 0 ? '同向' : '反向',
    plain: m.plain,
    mechanism: m.mechanism,
    condition: m.condition,
    exclusions: m.exclusions,
    from: leg(map[m.from]),
    to: leg(map[m.to]),
    status: observe(m, map),
  }));

  return {
    items: list,
    counts: {
      consistent: list.filter((i) => i.status.key === 'consistent').length,
      opposite: list.filter((i) => i.status.key === 'opposite').length,
      untested: list.filter((i) => i.status.key === 'untested').length,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 隔夜复盘：按市场分组看「睡了一夜，哪些东西动了」
 *
 * 口径说明必须跟着数据一起显示：这是各标的「当日涨跌幅」，没有做时区对齐，
 * 不等于隔夜收益（A股收盘后美股才开盘，两者不是同一段时间）。
 * ------------------------------------------------------------------ */

const GROUPS = [
  { key: 'asia', label: '亚太股指', ids: ['hsi', 'n225', 'kospi', 'twii', 'asx', 'nifty'] },
  { key: 'cn', label: 'A股', ids: ['sh000001'] },
  { key: 'eu', label: '欧洲股指', ids: ['dax', 'ftse', 'cac'] },
  { key: 'us', label: '美股', ids: ['sp500', 'ndx100', 'dji'] },
  { key: 'other', label: '美洲其他', ids: ['tsx', 'bvsp'] },
  { key: 'commodity', label: '商品', ids: ['gold-intl', 'gold-cn', 'oil', 'brent'] },
  { key: 'macro', label: '汇率与利率', ids: ['dxy', 'usdcny', 'us10y'] },
  { key: 'vol', label: '波动率', ids: ['vix'] },
  { key: 'crypto', label: '加密', ids: ['btc'] },
];

function avgOf(list) {
  const vals = list.map((i) => i.changePct).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((s, x) => s + x, 0) / vals.length;
}

/** 输入 quotes.items，输出复盘页结构 */
function buildRecap(items) {
  const map = {};
  for (const it of items || []) map[it.id] = it;
  // brent 是原油卡里的 chip，复盘要单独成行
  const oil = map.oil;
  if (oil && Array.isArray(oil.extras)) {
    const brent = oil.extras.find((e) => e.id === 'brent');
    if (brent && brent.ok) {
      map.brent = {
        id: 'brent',
        name: '布伦特原油',
        unit: '美元/桶',
        decimals: 2,
        price: brent.price,
        changePct: brent.changePct,
        ok: true,
      };
    }
  }

  const groups = GROUPS.map((g) => {
    const rows = g.ids
      .map((id) => map[id])
      .filter(Boolean)
      .map((q) => ({
        id: q.id,
        name: q.name,
        price: q.price,
        decimals: q.decimals,
        unit: q.unit,
        changePct: q.changePct,
        dir: dirOf(q.changePct),
        ok: q.ok !== false,
        marketLabel: q.marketStatus ? q.marketStatus.label : '',
      }));
    const valid = rows.filter((r) => Number.isFinite(r.changePct));
    return {
      key: g.key,
      label: g.label,
      rows,
      avg: avgOf(rows),
      avgDir: dirOf(avgOf(rows)),
      up: valid.filter((r) => r.changePct > 0).length,
      down: valid.filter((r) => r.changePct < 0).length,
      total: valid.length,
    };
  }).filter((g) => g.rows.length);

  const flat = [];
  for (const g of groups) for (const r of g.rows) if (Number.isFinite(r.changePct)) flat.push({ ...r, group: g.label });
  const sorted = flat.slice().sort((a, b) => b.changePct - a.changePct);

  return {
    groups,
    best: sorted.slice(0, 3),
    worst: sorted.slice(-3).reverse(),
    upCount: flat.filter((r) => r.changePct > 0).length,
    downCount: flat.filter((r) => r.changePct < 0).length,
    total: flat.length,
  };
}

module.exports = { MECHANISMS, buildMacro, buildRecap };
