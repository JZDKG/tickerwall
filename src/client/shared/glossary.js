/* ================================================================== *
 * 原位术语（产品 2.5）
 *
 * 界面里到处是「实际收益率」「期限溢价」「实现波动率」「分位」这些词。
 * 用户不查词典就看不懂，但要他去别处查，等于把他从行情页赶走。
 *
 * 这里做的是**原位**解释：词条出现在句子里，悬停或键盘聚焦就出定义，
 * 关掉就回到阅读。
 *
 * 三条纪律：
 *   1. **定义要能被验证**：只说该词的含义与它在哪用，不夹带观点、不给数字。
 *      术语表不是投资建议的藏身处。
 *   2. **一条短句 + 一条展开**：短句用于第一条提示，展开说清「怎么算/边界」。
 *   3. **可键盘操作**：术语是可聚焦的按钮，Enter/空格打开，Esc 关闭 ——
 *      只用 hover 的实现等于对键盘用户隐形。
 *
 * 与解释卡的关系：解释卡的 `plain` 字段是「这句话什么意思」，
 * 这里是「这个词什么意思」。两者共用同一套措辞纪律，但不互相复述。
 * ================================================================== */

/**
 * 词条表。
 *
 * `short`：一句话，出现在提示里。
 * `detail`：2–3 句，说清口径与边界（**不**出现「所以应该买/卖」这类话）。
 * `aliases`：界面里可能出现的其他写法，用于自动识别。
 */
export const TERMS = {
  realYield: {
    id: 'realYield',
    term: '实际收益率',
    aliases: ['实际利率', '实际收益率（DFII10）'],
    short: '扣掉预期通胀之后的债券回报。',
    detail:
      '通常用通胀指数国债（TIPS）收益率衡量。黄金不付利息，所以实际收益率上升意味着持有无息资产的机会成本变高。这个渠道只描述机会成本，不能单独用来推断金价方向。',
  },
  nominalYield: {
    id: 'nominalYield',
    term: '名义收益率',
    aliases: ['名义利率'],
    short: '没有扣掉通胀的债券回报。',
    detail:
      '名义收益率 = 实际收益率 + 通胀补偿（大致）。只看名义收益率会漏掉通胀那一半，所以「名义上行但实际没动」时不能当作机会成本上升。',
  },
  termPremium: {
    id: 'termPremium',
    term: '期限溢价',
    aliases: ['期限利差'],
    short: '为了拿长债而不是短债，市场额外要求的补偿。',
    detail:
      '它不是直接观测值，通常由收益率曲线模型估算，不同模型结果会差一截。看期限溢价时要说明用的是哪个模型，否则「溢价上升」这句话没有可比性。',
  },
  realizedVol: {
    id: 'realizedVol',
    term: '实现波动率',
    aliases: ['实际波动率', 'RV', '20 日实现波动率'],
    short: '用过去一段时间的日收益算出来的波动。',
    detail:
      '本看板固定用日线计算（20 日窗口），切换日/周视图不会改变它。它描述的是「已经发生的波动」，与隐含波动率（市场对未来波动的定价）是两回事。',
  },
  impliedVol: {
    id: 'impliedVol',
    term: '隐含波动率',
    aliases: ['IV', 'VIX'],
    short: '从期权价格反推出来的、市场对未来波动的定价。',
    detail:
      '它反映的是期权市场愿意为波动付多少钱，不是预测值。VIX 是标普 500 的 30 天隐含波动率指数，换成别的标的要看对应的指数或期权链。',
  },
  percentile: {
    id: 'percentile',
    term: '分位',
    aliases: ['分位数', '百分位'],
    short: '当前值在历史里排在百分之几的位置。',
    detail:
      '分位 80% 意味着历史上有 80% 的时间比现在低。它只说明「相对历史的高低」，不说明会回落还是继续走高；样本区间换了，分位也会变。',
  },
  maxDrawdown: {
    id: 'maxDrawdown',
    term: '最大回撤',
    aliases: ['回撤'],
    short: '从历史高点到之后最低点的最大跌幅。',
    detail:
      '统计的是所选窗口内的峰谷跌幅，不是「最坏能跌多少」。窗口变了（近 1 年 / 全部历史）结论会不同，看的时候要确认区间。',
  },
  basis: {
    id: 'basis',
    term: '基差',
    aliases: ['价差', '内外盘价差'],
    short: '同一标的在两个市场的价格差。',
    detail:
      '基差受运输、关税、交割规则与两地供需影响，短期可以长期存在。跨国比较时还要注意两边报价的时点与单位是否一致，否则看到的「基差」可能只是时段错位。',
  },
  premium: {
    id: 'premium',
    term: '境内外溢价',
    aliases: ['溢价'],
    short: '国内金价相对「国际金折算价」高出的部分。',
    detail:
      '由国内价与折算价的偏离倒推，是一个**残差**：它能告诉你偏离有多大，但说明不了偏离为什么发生。进口配额、季节性购金、汇率预期都可能影响它，需要单独的证据。',
  },
  policyRate: {
    id: 'policyRate',
    term: '政策利率',
    aliases: ['联邦基金利率', '加息', '降息'],
    short: '央行直接设定的短期利率目标。',
    detail:
      '它是政策工具，不是市场成交出来的价格；市场预期变化往往先反映在长端收益率与期货上。看到「加息/降息」时要注意区分「已经发生」与「市场预期」。',
  },
  correlation: {
    id: 'correlation',
    term: '相关系数',
    aliases: ['相关性'],
    short: '两个序列同向变动的程度，范围 −1 到 +1。',
    detail:
      '相关不等于因果，也不稳定：窗口变短、样本变少时相关系数波动很大。本看板给出的相关性都带窗口与样本量，不要拿一个数字当长期规律。',
  },
};

/** 别名 → 词条 id（长别名优先匹配，避免「溢价」抢掉「境内外溢价」） */
export const ALIAS_INDEX = (() => {
  const pairs = [];
  for (const t of Object.values(TERMS)) {
    for (const alias of [t.term, ...(t.aliases ?? [])]) pairs.push([alias, t.id]);
  }
  // 长字符串先匹配
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
})();

/** 按 id 或任意别名找词条；找不到返回自然为 null（界面据此什么都不显示） */
export function findTerm(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (!raw) return null;
  if (TERMS[raw]) return TERMS[raw];
  const hit = ALIAS_INDEX.find(([alias]) => alias === raw);
  return hit ? TERMS[hit[1]] : null;
}

/** 词条表（顺序稳定，供「术语速查」面板用） */
export function termList() {
  return Object.values(TERMS);
}

/** 术语按钮：可聚焦、带 aria 说明，鼠标悬停与键盘聚焦都能出提示 */
export function termHTML(name, { label = null } = {}) {
  const t = findTerm(name);
  if (!t) return escText(label ?? name ?? '');
  const text = label ?? t.term;
  return `<button type="button" class="gl-term" data-gl-term="${t.id}" aria-describedby="gl-tip-${t.id}" tabindex="0">${escText(text)}</button>
    <span class="gl-tip" id="gl-tip-${t.id}" role="tooltip" hidden><b>${escText(t.term)}</b>${escText(t.short)}</span>`;
}

/** 提示内容（可单独渲染，便于测试与自定义位置） */
export function termTipHTML(name) {
  const t = findTerm(name);
  if (!t) return '';
  return `<b class="gl-tip-term">${escText(t.term)}</b><span class="gl-tip-short">${escText(t.short)}</span><span class="gl-tip-detail">${escText(t.detail)}</span>`;
}

/** 只转义必要的字符：这些词条是我们自己写的，但仍按外部输入对待 */
function escText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 绑一次委托监听：hover / focus 显示，blur / Esc / 点击别处 隐藏。
 *
 * 为什么用委托而不是给每个术语单独绑：术语会随卡片重渲染频繁重建，
 * 逐个绑定既是性能问题，也会在重建后失效（点击没反应）。
 *
 * @param {Document|HTMLElement} root
 * @returns {() => void} 解绑
 */
export function attachGlossary(root = document) {
  const show = (btn) => {
    const tip = btn.parentElement?.querySelector(`#${btn.getAttribute('aria-describedby')}`);
    if (tip) tip.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  };
  const hide = (btn) => {
    const tip = btn.parentElement?.querySelector(`#${btn.getAttribute('aria-describedby')}`);
    if (tip) tip.hidden = true;
    btn.removeAttribute('aria-expanded');
  };
  const hideAll = () => {
    root.querySelectorAll?.('.gl-term[aria-expanded]').forEach(hide);
  };

  const onOver = (e) => {
    const btn = e.target?.closest?.('.gl-term');
    if (btn) show(btn);
  };
  const onOut = (e) => {
    const btn = e.target?.closest?.('.gl-term');
    if (btn) hide(btn);
  };
  const onFocusIn = (e) => {
    const btn = e.target?.closest?.('.gl-term');
    if (btn) show(btn);
  };
  const onFocusOut = (e) => {
    const btn = e.target?.closest?.('.gl-term');
    if (btn) hide(btn);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') hideAll();
  };

  root.addEventListener('mouseover', onOver);
  root.addEventListener('mouseout', onOut);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  root.addEventListener('keydown', onKey);

  return () => {
    root.removeEventListener('mouseover', onOver);
    root.removeEventListener('mouseout', onOut);
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('focusout', onFocusOut);
    root.removeEventListener('keydown', onKey);
  };
}
