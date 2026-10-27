/* ================================================================== *
 * 金融传导图谱 · 右侧机理卡 + 区块骨架（纯 HTML 字符串，零 DOM）
 *
 * 这里只生产字符串：
 *   - 右侧 inspector：机理卡 edgeCard / 无向实测卡 noEdgeCard /
 *     导图焦点卡 mindCardPanel / 沙盘卡 sandboxPanel / 剧本卡 playbookPanel
 *   - 区块骨架 sectionShell：模式切换、剧本按钮、震源条、图例、aside 挂载位
 *   - 背离横幅 alertBannerHTML、副标题 graphSubtitle、背离计数 divergenceCount
 *
 * 全程不碰 document / window / fetch，入参进、字符串出 —— SSR 与浏览器同构。
 * 画布本体（X6 实例、节点、连线、光点动效）在 flow-canvas.js；这里只输出
 * <div class="mg-x6" id="mg-x6"> 这个挂载点，由调用方在插入 DOM 后接管渲染。
 *
 * 数据分工：定性（机理 / 何时失效）来自 knowledge-base.js；
 * 定量（250 期相关、20/60 期滚动、背离状态）由 divergence-engine.js 的
 * evaluateAll() 统一算好，以 Map<edgeId, row> 传进来，这里不重复计算。
 * ================================================================== */

import {
  MACRO_TRANSMISSION_EDGES,
  CORE_EDGES,
  EDGE_BY_ID,
  MACRO_PLAYBOOKS,
  MODES,
  FOCUS_PILLS,
  SHOCK_SOURCES,
  POS,
  NEG,
  DIV,
  esc,
  signChar,
} from './knowledge-base.js';
import {
  findLastValid,
  lastRollingCorr,
  getMatrixCorr,
  fmtChg,
  evaluateAll,
  findEdge,
  pickAlert,
  propagateShock,
} from './divergence-engine.js';

/* ------------------------------------------------------------------ *
 * 1. 小工具：涨跌着色 / 相关系数着色
 * ------------------------------------------------------------------ */

export function pctCls(v) {
  if (v == null) return '';
  return v > 0 ? 'up' : v < 0 ? 'down' : '';
}

export function corrTone(c) {
  if (c == null) return 'dim';
  // 色相只由正负决定（红=正相关 / 蓝=负相关），强弱交给 faint 降透明度。
  // 之前按 |ρ| 阈值在正负之间跳档，会出现「-0.47 显示成琥珀色」这种误导。
  return `${c > 0 ? 'up' : 'cold'}${Math.abs(c) < 0.3 ? ' faint' : ''}`;
}

/* ------------------------------------------------------------------ *
 * 2. 无理论边的一对标的：只给实测数字
 * ------------------------------------------------------------------ */

/**
 * 选中的一对标的如果没有登记的理论边（例如「沪金 ~ VIX」），
 * 不要退回一句泛泛的提示 —— 直接给纯实测卡：
 * 250 期相关、20 期滚动、以及「为什么可能间接相关」。
 * 矩阵里 13×13=169 格里只有 34 格有理论边，这个分支会被点到很多次。
 */
export function noEdgeCard(data, a, b) {
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

/* ------------------------------------------------------------------ *
 * 3. 机理卡：一条边 = 机理 + 实盘验证 + 何时失效
 * ------------------------------------------------------------------ */

export function edgeCard(data, edge, reality, state) {
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

/* ------------------------------------------------------------------ *
 * 4. 导图焦点卡：上游驱动 / 下游传导
 * ------------------------------------------------------------------ */

export function mindCardPanel(data, focusId, reality) {
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

/* ------------------------------------------------------------------ *
 * 5. 沙盘卡：一阶 / 二阶传播 + 多空交织拆解
 * ------------------------------------------------------------------ */

export function sandboxPanel(data, state) {
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
 * 6. 剧本卡：四步叙事 + 点亮 / 打破的边
 * ------------------------------------------------------------------ */

export function playbookPanel(pb, data, reality) {
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

/* ------------------------------------------------------------------ *
 * 7. 区块骨架
 * ------------------------------------------------------------------ */

export function graphSubtitle(mode) {
  return mode === 'compass'
    ? '四象限生态位 · 光点方向＝因果方向 · 胶囊＝4 字机理'
    : mode === 'mindmap'
      ? '上游驱动 → 焦点 → 下游传导，零交叉'
      : '选震源 → 一阶 / 二阶逐层点亮 → 自动拆解多空交织';
}

export function divergenceCount(reality) {
  return [...reality.values()].filter((r) => r.status === 'diverged').length;
}

/**
 * 背离置顶横幅。必须和右上角「背离 N/18」扫同一个集合（全部 18 条边）——
 * 否则 E16/E18 这两条簇内边一旦背离，徽章会显示「背离 1/18」却永远没有横幅可点。
 * E16/E18 还是 weight 3 的同源定价锚，它们背离意味着汇率异动 / 航运割裂这类极端行情，
 * 恰恰最该置顶。
 */
export function alertBannerHTML(data, reality) {
  const alert = pickAlert(MACRO_TRANSMISSION_EDGES, reality);
  if (!alert) return '';
  const A = data.universe.find((u) => u.id === alert.e.from);
  const B = data.universe.find((u) => u.id === alert.e.to);
  return `<button type="button" class="mg-alert" data-alert="${esc(alert.e.id)}">
      <span class="mg-alert-ico">⚡</span>
      <span class="mg-alert-text">实时背离：<b>${esc(A?.name ?? alert.e.from)} ↔ ${esc(B?.name ?? alert.e.to)}</b>
        ${esc(alert.r.badge.replace('⚡ ', ''))}，近 20 期滚动相关 ${
          alert.r.roll20 == null ? '样本不足' : `${alert.r.roll20 >= 0 ? '+' : ''}${alert.r.roll20.toFixed(2)}`
        }
        （理论 ${signChar(alert.e.sign)}），可能是「${esc(alert.e.divergence.split('：')[0])}」逻辑压过了「${esc(alert.e.label)}」</span>
      <span class="mg-alert-go">查看</span>
    </button>`;
}

/**
 * 右侧挂载位之外的 inspector 分发：罗盘看剧本/机理卡，导图看焦点卡，沙盘看传播卡。
 * 返回值直接塞进 <aside class="graph-card">。
 */
export function inspectorHTML(data, state, reality) {
  const mode = state.graphMode ?? 'compass';
  if (mode === 'compass') {
    const pairEdge = findEdge(state.pair?.[0], state.pair?.[1]);
    const playbook = state.playbook ? MACRO_PLAYBOOKS.find((p) => p.id === state.playbook) : null;
    return playbook ? playbookPanel(playbook, data, reality) : edgeCard(data, pairEdge, reality, state);
  }
  if (mode === 'mindmap') return mindCardPanel(data, state.graphFocus ?? 'gold-intl', reality);
  return sandboxPanel(data, state);
}

/* 每次渲染重新计数：<defs><marker id> 是全局 id，重渲染必须换 id，否则旧 marker 残留会串色 */
export let legendSeq = 0;

export function legendSwatch(id, color, dash, label) {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<span class="lg"><svg width="34" height="8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="${color}" stroke-width="2"${dashAttr} marker-end="url(#${id})" /><defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1.4 L9,5 L0,8.6 Z" fill="${color}" /></marker></defs></svg>${label}</span>`;
}

export function legendHTML(mode) {
  const seq = ++legendSeq;
  return `<div class="mg-legend">
          ${legendSwatch(`lg-a-${seq}`, POS, '', '正向推升')}
          ${legendSwatch(`lg-b-${seq}`, NEG, '6 4', '负向压制')}
          ${legendSwatch(`lg-c-${seq}`, DIV, '2 4', '实盘背离')}
          <span class="lg note">光点流向 = 因 → 果　·　${graphSubtitle(mode)}</span>
        </div>`;
}

/**
 * 区块脚手架：头部 / 工具条 / 横幅 / 焦点条 / 震源条 / 图例 / aside。
 *
 * 故意 **不** 输出 <svg> —— 画布由 flow-canvas.js 在插入 DOM 后接管
 * #mg-x6 这个容器，这里只留挂载点与 loading 占位。
 * opts.legend = false 时不渲染图例（调用方自己画图例时用）。
 */
/* ------------------------------------------------------------------ *
 * 区块骨架：拆成四个可独立替换的片段
 *
 * index.js 每次重绘只换这几段的 outerHTML，#mg-x6 画布容器原地保留 ——
 * 否则每点一次模式就把用户拖过的节点位置和缩放倍数全清空。
 * ------------------------------------------------------------------ */

export function headHTML(state) {
  const mode = state.graphMode ?? 'compass';
  return `<div class="mg-head">
      <h3>金融传导图谱与宏观逻辑沙盘
        <span class="h3-note">上半场定性：为什么动　·　下半场定量：动了多少</span>
      </h3>
      <div class="seg mg-modes">${MODES.map(
        ([m, label]) => `<button type="button" class="mg-mode ${mode === m ? 'on' : ''}" data-mode="${esc(m)}">${label}</button>`,
      ).join('')}</div>
    </div>`;
}

export function toolsHTML(data, state, reality) {
  const mode = state.graphMode ?? 'compass';
  const playbook = state.playbook ? MACRO_PLAYBOOKS.find((p) => p.id === state.playbook) : null;
  const divCount = reality ? divergenceCount(reality) : 0;
  return `<div class="mg-tools">
      ${
        mode === 'compass'
          ? `<div class="mg-playbooks">
        <button type="button" class="mg-pb ${playbook ? '' : 'on'}" data-pb="">全部关系</button>
        ${MACRO_PLAYBOOKS.map(
          (p) => `<button type="button" class="mg-pb ${playbook?.id === p.id ? 'on' : ''}" data-pb="${esc(p.id)}" title="${esc(p.sub)}">${esc(p.name)}</button>`,
        ).join('')}
      </div>`
          : '<span class="mg-tools-hint">剧本压暗只在「全局罗盘」里生效</span>'
      }
      <span class="mg-divcount ${divCount ? 'has' : ''}" title="${MACRO_TRANSMISSION_EDGES.length} 条传导边中，当前实盘与理论方向相反的条数">
        背离 ${divCount}/${MACRO_TRANSMISSION_EDGES.length}
      </span>
    </div>`;
}

export function barsHTML(data, state) {
  const mode = state.graphMode ?? 'compass';
  if (mode === 'mindmap') {
    return `<div class="mg-focusbar">${FOCUS_PILLS.map(
      ([id, label]) =>
        `<button type="button" class="mg-fpill ${(state.graphFocus ?? 'gold-intl') === id ? 'on' : ''}" data-focus="${esc(id)}">${esc(label)}</button>`,
    ).join('')}</div>`;
  }
  if (mode === 'sandbox') {
    return `<div class="mg-shockbar">
            <span class="mg-shock-label">震源</span>
            ${SHOCK_SOURCES.map(
              (id) =>
                `<button type="button" class="mg-spick ${state.shock?.id === id ? 'on' : ''}" data-shock="${esc(id)}">${esc(
                  data.universe.find((u) => u.id === id)?.short ?? id,
                )}</button>`,
            ).join('')}
            <span class="mg-shock-sep"></span>
            <button type="button" class="mg-sgo up ${state.shock?.dir > 0 ? 'on' : ''}" data-dir="1">模拟大涨 ↑</button>
            <button type="button" class="mg-sgo down ${state.shock?.dir < 0 ? 'on' : ''}" data-dir="-1">模拟大跌 ↓</button>
            <button type="button" class="mg-sclear" data-clear="1">清除</button>
          </div>`;
  }
  return '';
}

export function sectionShell(data, state, { legend = true } = {}) {
  const mode = state.graphMode ?? 'compass';
  const reality = evaluateAll(data);
  return `<section class="d-block macro-graph-section">
    ${headHTML(state)}
    ${toolsHTML(data, state, reality)}
    ${alertBannerHTML(data, reality)}
    ${barsHTML(data, state)}
    <div class="graph-stage">
      <div class="graph-canvas"><div class="mg-x6" id="mg-x6"><div class="mg-x6-loading">正在初始化流程图画布…</div></div>${legend ? legendHTML(mode) : ''}</div>
      <aside class="graph-card">${inspectorHTML(data, state, reality)}</aside>
    </div>
  </section>`;
}
