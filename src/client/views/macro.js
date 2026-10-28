/* ================================================================== *
 * macro.js —— #/macro：相关性矩阵 / 领先滞后 / 滚动相关 / 归一化对比 / 传导图谱（X6 懒加载）。
 *
 * 来源：public/app.js（原 3655 行单体）L1593-2373，整段搬运，逻辑未改写。
 * ================================================================== */

/* ================================================================== *
 * 宏观关联看板：相关性矩阵 / 领先滞后 / 滚动相关性 / 归一化对比
 * ================================================================== */

import { macroEl } from '../shared/dom.js';
import { store } from '../shared/store.js';
import { clockText, dirOf, esc, html, raw } from '../shared/format.js';
import { macroGraphSectionHTML, findEdge, EDGE_BY_ID } from '/macro-graph.js';
// 图谱消费「同一份解释」：取数与状态判断在 explanations/graph.js（纯函数 + 60s 缓存）。
// 注意不能放回 views/macro/：那是构建期子树，主入口不许直接加载它。
import { loadGraphExplanation } from './explanations/graph.js';
import { isExplainable } from './explanations/state.js';

/* ------------------------------------------------------------------ *
 * 传导图谱画布：X6 版按需加载，失败就退回手绘 SVG
 *
 * public/vendor/macro-flow.js 是 `npm run build` 由 src/client/views/macro/ 打出来的
 * 单文件 ES 模块（X6 + dagre，约 860KB / gzip 224KB）。只有进 #/macro 才会 import，
 * 首页零成本。仓库里带着产物，所以 clone 下来不装依赖也能跑。
 * 加载失败（文件被删 / 老浏览器）时 macroFlowMod 保持 null，refreshGraph()
 * 走 macroGraphSectionHTML 那条老路，功能不缺，只是没有拖拽缩放。
 * ------------------------------------------------------------------ */
export let macroFlowMod = null;
export let macroFlowPromise = null;
export let macroFlowFailed = false;

export function ensureMacroFlow() {
  if (macroFlowMod || macroFlowFailed) return Promise.resolve(macroFlowMod);
  if (!macroFlowPromise) {
    macroFlowPromise = import('/vendor/macro-flow.js')
      .then((m) => {
        macroFlowMod = m;
        return m;
      })
      .catch((err) => {
        macroFlowFailed = true;
        console.warn('[macro-flow] 画布模块加载失败，回退到手绘 SVG 视图：', err?.message ?? err);
        return null;
      });
  }
  return macroFlowPromise;
}

// graphMode: 'compass' | 'mindmap' | 'sandbox'
// graphFocus: 单点导图的中心标的；playbook: 当前剧本 id 或 null；shock: { id, dir } 沙盘震源
export let macroState = null; // { data, window, freq, pair, picked, robustOnly, graphMode, graphFocus, playbook, shock }

/** 前端用的 Pearson（与后端同口径） */
export function pearsonJS(xs, ys) {
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

/** 相关系数 → 背景色（正值暖色 / 负值冷色，与涨跌红绿区分开） */
export function corrBg(c) {
  if (c == null || !Number.isFinite(c)) return 'rgba(255,255,255,0.035)';
  const a = Math.min(1, Math.abs(c));
  const alpha = (a * 0.7 + 0.05).toFixed(3);
  return c >= 0 ? `rgba(245,69,92,${alpha})` : `rgba(91,156,248,${alpha})`;
}

export function corrCellClass(c) {
  if (c == null) return 'na';
  return Math.abs(c) >= 0.6 ? 'strong' : Math.abs(c) >= 0.3 ? 'mid' : 'weak';
}

export function rollingCorrJS(a, b, win = 40) {
  const out = [];
  for (let i = 0; i < a.length; i += 1) {
    if (i < win - 1) {
      out.push(null);
      continue;
    }
    const xs = [];
    const ys = [];
    for (let k = i - win + 1; k <= i; k += 1) {
      if (a[k] != null && b[k] != null) {
        xs.push(a[k]);
        ys.push(b[k]);
      }
    }
    out.push(xs.length >= Math.max(12, Math.floor(win * 0.6)) ? pearsonJS(xs, ys) : null);
  }
  return out;
}

/** 收益率累乘 → 归一化到 100 的走势 */
/** 10Y 美债修正久期：把收益率基点变动折算成债券价格的近似百分比变动 */
export const BOND_DURATION_10Y = 8;

/**
 * 收益率变动 → 可与其他资产同轴比较的「价格收益率」。
 * 利率类标的给的是百分点差（0.05 = 5bps），不能直接 exp()：
 * 一是量纲差 100 倍（累计上行 100bps 会变成 +171.8%，把其他曲线全压扁），
 * 二是方向反了（收益率上行 = 债券价格下跌）。
 * 按久期近似 ΔP/P ≈ −D·Δy 折算，利率上行就画成下跌。
 */
export function changeToReturn(c, kind) {
  if (kind === 'rate') return (-BOND_DURATION_10Y * c) / 100;
  return c;
}

/** 收益率累乘 → 归一化到 100 的走势 */
export function normalizeTo100(changes, kind = 'price') {
  let v = 100;
  let started = false;
  return changes.map((c) => {
    // 序列开头还没有有效值时才留 null（那条线确实还没开始）
    if (!started) {
      if (c == null || !Number.isFinite(c)) return null;
      started = true;
      v *= Math.exp(changeToReturn(c, kind));
      return v;
    }
    // 中途的 null 来自各市场交易日历不一致（A 股休市、美股开市）。
    // 直接返回 null 会让 multiLineSVG 把线切成几十段，所以休市日保持前值，
    // 这也是归一化对比的标准做法：没有新收益 = 曲线不动。
    if (c == null || !Number.isFinite(c)) return v;
    v *= Math.exp(changeToReturn(c, kind));
    return v;
  });
}

/** 多线图：共用 y 轴（已归一化），支持 null 断点 */
export function multiLineSVG(series, opts = {}) {
  const { width = 920, height = 240, labels = [] } = opts;
  const valid = series.filter((s) => s.values.some((v) => v != null));
  if (!valid.length) return '<div class="chart-empty">暂无数据</div>';

  const padL = 6;
  const padR = 56;
  const padT = 14;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const all = valid.flatMap((s) => s.values.filter((v) => v != null));
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (max === min) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.06;
  min -= pad;
  max += pad;
  const span = max - min || 1;

  const n = Math.max(...valid.map((s) => s.values.length));
  const x = (i) => padL + (i / Math.max(1, n - 1)) * innerW;
  const y = (v) => padT + innerH - ((v - min) / span) * innerH;

  let grid = '';
  for (let i = 0; i <= 4; i += 1) {
    const v = min + (span * i) / 4;
    const gy = y(v).toFixed(2);
    grid += `<line x1="${padL}" y1="${gy}" x2="${padL + innerW}" y2="${gy}" class="grid-line" />`;
    grid += `<text x="${width - 6}" y="${gy}" class="axis-text" text-anchor="end" dominant-baseline="middle">${v.toFixed(0)}</text>`;
  }

  let paths = '';
  for (const s of valid) {
    let d = '';
    let started = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        started = false;
        return;
      }
      d += `${started ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
      started = true;
    });
    if (d) paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-linejoin="round" />`;
  }

  let xlabels = '';
  const count = Math.min(4, labels.length);
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round((i / Math.max(1, count - 1)) * (labels.length - 1));
    const anchor = i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle';
    xlabels += `<text x="${x(idx).toFixed(2)}" y="${height - 7}" class="axis-text" text-anchor="${anchor}">${esc(labels[idx] ?? '')}</text>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="归一化走势对比">
    ${grid}${paths}${xlabels}
  </svg>`;
}

export const LINE_COLORS = ['#f5455c', '#5b9cf8', '#e0a83c', '#0ecb81', '#a78bfa', '#22d3ee'];

export function macroMatrixHTML(data) {
  const { ids, corr, counts, stats } = data.matrix;
  const meta = new Map(data.universe.map((u) => [u.id, u]));
  const pair = macroState?.pair;
  const robustOnly = Boolean(macroState?.robustOnly);

  // 统计索引：a|b → 该对的完整检验结果
  const stMap = new Map();
  for (const r of stats ?? []) {
    stMap.set(`${r.a}|${r.b}`, r);
    stMap.set(`${r.b}|${r.a}`, r);
  }

  // 单行写：与迁移前逐字节一致，避免无谓的空白差异
  const headCells = ids.map((id) => {
    const m = meta.get(id);
    return html`<th title="${m?.name ?? id}"><span>${m?.short ?? id}</span></th>`;
  });
  const head = html`<tr><th class="corner">标的</th>${headCells}</tr>`;

  const bodyRows = ids.map((rid, i) => {
    const rm = meta.get(rid);
    const cells = ids.map((cid, j) => {
      const c = corr[i][j];
      const n = counts[i][j];
      const st = stMap.get(`${rid}|${cid}`);
      const isSelf = rid === cid;
      const active = pair && ((pair[0] === rid && pair[1] === cid) || (pair[0] === cid && pair[1] === rid));

      // 「仅稳健」模式下，把通不过 BH 校正或样本内外翻转的格子压暗
      const dim = robustOnly && !isSelf && st && !(st.significantBH && st.stable);

      const text = c == null ? '—' : c.toFixed(2);
      // 星号必须是 SafeHtml —— 普通字符串会被转义成 &lt;i&gt;
      const star = !isSelf && st?.significantBH ? html`<i class="sig">*</i>` : '';
      const ci = st?.ci ? `95%CI [${st.ci.lo.toFixed(2)}, ${st.ci.hi.toFixed(2)}]` : '';
      const tip = isSelf
        ? `${rm?.short ?? rid}（n=${n ?? '—'}）`
        : [
            `${rm?.short ?? rid} ~ ${meta.get(cid)?.short ?? cid}：${text}`,
            `n=${n ?? '—'}`,
            ci,
            st ? `朴素 p=${(st.p ?? 1).toFixed(4)}` : '',
            st ? `NW p=${(st.pNW ?? 1).toFixed(4)}` : '',
            st ? `BH q=${(st.q ?? 1).toFixed(4)}${st.significantBH ? ' ✓' : ' ✗'}` : '',
            st && st.inR != null ? `样本内 ${st.inR.toFixed(2)} / 外 ${st.outR.toFixed(2)}${st.stable ? ' 同号' : ' 翻转'}` : '',
          ]
            .filter(Boolean)
            .join('\n');

      return html`<td class="corr ${corrCellClass(c)}${active ? ' active' : ''}${dim ? ' dim' : ''}"
        style="background:${corrBg(c)}"
        data-a="${rid}" data-b="${cid}"
        title="${tip}">${text}${star}</td>`;
    });
    return html`<tr><th class="row-head" title="${rm?.name ?? rid}">${rm?.short ?? rid}</th>${cells}</tr>`;
  });

  const sig = (stats ?? []).filter((r) => r.significantBH).length;
  const stable = (stats ?? []).filter((r) => r.significantBH && r.stable).length;
  const total = (stats ?? []).length;

  // q&lt;0.05 改回字面 q<0.05：模板会转义一次，写实体就成了双转义
  return html`<div class="matrix-wrap">
    <table class="corr-matrix"><thead>${head}</thead><tbody>${bodyRows}</tbody></table>
  </div>
  <div class="stat-bar">
    <span class="stat-note">
      <b>*</b> 通过 Benjamini-Hochberg 多重比较校正（q<0.05）：<b>${sig}/${total}</b> 对，
      其中样本内外同号 <b>${stable}</b> 对
    </span>
    <label class="stat-toggle">
      <input type="checkbox" id="robust-only" ${robustOnly ? 'checked' : ''} />
      <span>只看统计稳健</span>
    </label>
  </div>`;
}

export function macroLeadLagHTML(data) {
  const meta = new Map(data.universe.map((u) => [u.id, u]));
  const unit = data.freq === 'week' ? '周' : '日';
  const rows = (data.leadLag ?? []).slice(0, 12);
  if (!rows.length) return html`<div class="chart-empty">当前窗口没有明显的领先滞后关系</div>`;
  const body = rows.map(
    (r) => html`<tr>
      <td>${meta.get(r.leader)?.short ?? r.leader}</td>
      <td>${meta.get(r.follower)?.short ?? r.follower}</td>
      <td class="mono num">${r.lag} ${unit}</td>
      <td class="mono num ${r.corr >= 0 ? 'corr-pos' : 'corr-neg'}">${r.corr.toFixed(3)}${r.significantBH ? html`<i class="sig">*</i>` : ''}</td>
      <td class="mono num dim">${r.sameDay?.toFixed(3) ?? '—'}</td>
      <td class="mono num dim">${r.q != null ? r.q.toFixed(3) : '—'}</td>
      <td class="mono num dim">${r.n}</td>
    </tr>`,
  );
  return html`<table class="d-table">
    <thead><tr><th>领先方</th><th>跟随方</th><th class="num">滞后</th><th class="num">滞后相关</th><th class="num">同期相关</th><th class="num" title="Benjamini-Hochberg 校正后的 q 值">BH q</th><th class="num">样本</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

export function macroPairSection(data) {
  const changes = data.recent?.changes ?? {};
  const dates = data.recent?.dates ?? [];
  const pair = macroState?.pair;
  if (!pair || !changes[pair[0]] || !changes[pair[1]]) {
    return html`<div class="chart-empty">点上方矩阵里的任意格子，查看这两个标的的滚动相关性</div>`;
  }
  const meta = new Map(data.universe.map((u) => [u.id, u]));
  const a = changes[pair[0]];
  const b = changes[pair[1]];
  const roll = rollingCorrJS(a, b, 40);
  const points = roll.map((v, i) => ({ v, label: dates[i] })).filter((p) => p.v != null);
  const current = points[points.length - 1]?.v;

  const chartW = Math.max(300, Math.round(macroEl.clientWidth - 40));
  const chartH = Math.round(Math.min(260, Math.max(150, chartW * 0.22)));

  const span = data.freq === 'week' ? '周' : '日';
  return html`<div class="pair-head">
      <span class="pair-name">${meta.get(pair[0])?.name ?? pair[0]} ~ ${meta.get(pair[1])?.name ?? pair[1]}</span>
      ${current != null ? html`<span class="pair-now ${dirOf(current)}">当前 40 ${span}滚动相关性 ${current.toFixed(3)}</span>` : ''}
    </div>
    <div class="chart-legend"><span><i style="background:${current != null && current > 0 ? 'var(--up)' : '#5b9cf8'}"></i>40 ${span}滚动相关性（-1 ~ +1）</span></div>
    ${raw(richRollingSVG(points, { width: chartW, height: chartH }))}`;
}

/** 滚动相关性折线：以 0 为中线，正负分色 */
export function richRollingSVG(points, opts = {}) {
  const { width = 900, height = 200 } = opts;
  if (points.length < 2) return '<div class="chart-empty">样本不足</div>';
  const padL = 6;
  const padR = 52;
  const padT = 12;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const x = (i) => padL + (i / (points.length - 1)) * innerW;
  const y = (v) => padT + innerH / 2 - (v / 1) * (innerH / 2);

  let grid = '';
  for (const v of [1, 0.5, 0, -0.5, -1]) {
    const gy = y(v).toFixed(2);
    grid += `<line x1="${padL}" y1="${gy}" x2="${padL + innerW}" y2="${gy}" class="${v === 0 ? 'base-line' : 'grid-line'}" />`;
    grid += `<text x="${width - 6}" y="${gy}" class="axis-text" text-anchor="end" dominant-baseline="middle">${v > 0 ? '+' : ''}${v.toFixed(1)}</text>`;
  }

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  const last = points[points.length - 1];
  const stroke = last.v >= 0 ? 'var(--up)' : '#5b9cf8';

  let labels = '';
  const cnt = Math.min(4, points.length);
  for (let i = 0; i < cnt; i += 1) {
    const idx = Math.round((i / Math.max(1, cnt - 1)) * (points.length - 1));
    const anchor = i === 0 ? 'start' : i === cnt - 1 ? 'end' : 'middle';
    labels += `<text x="${x(idx).toFixed(2)}" y="${height - 6}" class="axis-text" text-anchor="${anchor}">${esc(points[idx].label ?? '')}</text>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="滚动相关性">
    ${grid}
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" />
    <circle cx="${x(points.length - 1).toFixed(2)}" cy="${y(last.v).toFixed(2)}" r="2.6" fill="${stroke}" />
    ${labels}
  </svg>`;
}

export function macroCompareHTML(data) {
  const changes = data.recent?.changes ?? {};
  const dates = data.recent?.dates ?? [];
  // macroState 由 renderMacro 赋值；渲染函数单独被调用（测试、异常路径）时
  // 它可能还是 null，不该因此崩掉
  const picked = [...(macroState?.picked ?? [])];
  if (!picked.length) return html`<div class="chart-empty">勾选上面的标的后看归一化对比</div>`;
  const meta = new Map(data.universe.map((u) => [u.id, u]));
  const series = picked.slice(0, LINE_COLORS.length).map((id, i) => {
    const u = meta.get(id);
    return {
      id,
      name: u?.short ?? id,
      color: LINE_COLORS[i],
      kind: u?.kind ?? 'price',
      values: normalizeTo100(changes[id] ?? [], u?.kind ?? 'price'),
    };
  });
  const hasRate = series.some((s) => s.kind === 'rate');
  const chartW = Math.max(300, Math.round(macroEl.clientWidth - 40));
  const chartH = Math.round(Math.min(300, Math.max(170, chartW * 0.26)));
  const chips = series.map(
    (s) =>
      html`<span><i style="background:${s.color}"></i>${s.name}${
        s.kind === 'rate' ? html`<em class="legend-badge">久期折算</em>` : ''
      }</span>`,
  );
  return html`<div class="chart-legend">${chips}<span class="legend-note">起点归一化为 100${
    hasRate ? `　·　利率按 ${BOND_DURATION_10Y} 年修正久期折算成债券价格（收益率上行＝曲线下跌）` : ''
  }</span></div>
    ${raw(multiLineSVG(series, { width: chartW, height: chartH, labels: dates }))}`;
}

/* ------------------------------------------------------------------ *
 * 传导图谱 ↔ 下方定量模块的双向联动
 *
 * 关键约束：切图谱模式、点连线、换剧本、推演，都只重绘 #macro-graph-host
 * 与联动的那两张图，**不重新请求 /api/macro**（那份数据 2 分钟才过期，
 * 每次点一下重拉 13 个品种数千条日线毫无必要，而且会闪）。
 * 事件用 onclick/ondblclick 赋值而不是 addEventListener —— host 每次只换
 * innerHTML 不换元素本身，addEventListener 会重复叠加。
 * ------------------------------------------------------------------ */

/** 只刷新「选中对」相关的几处 UI，不重建整页 */
export function syncPairUI() {
  const data = macroState?.data;
  if (!data) return;
  const [a, b] = macroState.pair ?? [];

  document.querySelectorAll('.corr-matrix td.corr').forEach((td) => {
    const on =
      Boolean(a && b) &&
      ((td.dataset.a === a && td.dataset.b === b) || (td.dataset.a === b && td.dataset.b === a));
    td.classList.toggle('active', on);
  });

  document.querySelectorAll('#macro-picks .pick').forEach((btn) => {
    btn.classList.toggle('on', macroState.picked.has(btn.dataset.pick));
  });

  const pairHost = document.getElementById('macro-pair-host');
  if (pairHost) pairHost.innerHTML = macroPairSection(data);
  const cmpHost = document.getElementById('macro-compare-host');
  if (cmpHost) cmpHost.innerHTML = macroCompareHTML(data);

  refreshGraph();
}

/**
 * 当前该取哪份解释（方案 §3.3）。
 *
 *   导图 → 焦点标的
 *   罗盘 → 选中那一对里「可解释」的那一端
 *   沙盘 → 震源自身
 */
export function graphFocusAsset() {
  if (!macroState) return null;
  const mode = macroState.graphMode ?? 'compass';
  if (mode === 'mindmap') return macroState.graphFocus ?? null;
  if (mode === 'sandbox') return macroState.shock?.id ?? null;
  const pair = macroState.pair ?? [];
  return pair.find((id) => isExplainable(id)) ?? null;
}

let explainPending = null;

/**
 * 取「同一份解释」并写回 macroState。
 *
 * 只在这一份确实变化时重绘一次，避免 refreshGraph ↔ hydrate 互相触发。
 */
export async function hydrateGraphExplanation() {
  const asset = graphFocusAsset();
  if (!asset || !isExplainable(asset)) {
    if (macroState?.explanation) {
      macroState.explanation = null;
      macroState.explanationAsset = null;
      refreshGraph();
    }
    return;
  }
  if (macroState.explanationAsset === asset && macroState.explanation) return;
  if (explainPending === asset) return;
  explainPending = asset;
  try {
    const ex = await loadGraphExplanation(asset);
    macroState.explanation = ex;
    macroState.explanationAsset = asset;
  } catch {
    macroState.explanation = null;
    macroState.explanationAsset = asset;
  } finally {
    explainPending = null;
  }
  refreshGraph();
}

export function refreshGraph() {
  const host = document.getElementById('macro-graph-host');
  if (!host || !macroState?.data) return;

  // 图的解释状态跟着当前焦点走：切了资产就重新取一份同一接口的快照
  if (macroState.explanationAsset !== graphFocusAsset()) void hydrateGraphExplanation();

  if (macroFlowMod) {
    // X6 画布：只换 chrome（模式条 / 横幅 / 右侧卡），#mg-x6 与画布实例原地复用，
    // 用户拖过的节点位置与缩放倍数不会被一次点击清掉。
    macroFlowMod.renderMacroFlow(host, macroState.data, macroState, {
      onEdge: (id) => handleEdgePick(id),
      onNode: (id) => handleNodePick(id),
      onNodeDbl: (id) => {
        macroState.graphFocus = id;
        macroState.graphMode = 'mindmap';
        refreshGraph();
      },
    });
    bindGraph();
    return;
  }

  host.innerHTML = macroGraphSectionHTML(macroState.data, macroState);
  bindGraph();
}

/** 选中一对标的：图谱高亮那条边 + 矩阵高亮那一格 + 下方两张图重绘 */
export function selectPair(a, b) {
  if (!a || !b || a === b) return;
  macroState.pair = [a, b];
  macroState.picked = new Set([a, b]);
  syncPairUI();
}

export function bindGraph() {
  const host = document.getElementById('macro-graph-host');
  if (!host) return;
  host.onclick = (e) => onGraphClick(e, host);
  host.ondblclick = (e) => onGraphDblClick(e, host);
}

export function onGraphClick(e, host) {
  const hit = e.target.closest(
    '[data-mode],[data-pb],[data-focus],[data-shock],[data-dir],[data-shock-condition],[data-clear],[data-alert],[data-jump],[data-edge],[data-node]',
  );
  if (!hit || !host.contains(hit)) return;

  // 模式切换
  if (hit.dataset.mode) {
    macroState.graphMode = hit.dataset.mode;
    refreshGraph();
    return;
  }
  // 剧本
  if (hit.dataset.pb !== undefined && hit.classList.contains('mg-pb')) {
    macroState.playbook = hit.dataset.pb || null;
    refreshGraph();
    return;
  }
  // 导图焦点
  if (hit.dataset.focus) {
    macroState.graphFocus = hit.dataset.focus;
    refreshGraph();
    return;
  }
  // 沙盘震源 / 方向 / 清除
  if (hit.dataset.shock) {
    const id = hit.dataset.shock;
    macroState.shock = { id, dir: macroState.shock?.dir ?? 1 };
    refreshGraph();
    return;
  }
  if (hit.dataset.dir) {
    const dir = Number(hit.dataset.dir);
    macroState.shock = { id: macroState.shock?.id ?? 'oil', dir };
    refreshGraph();
    return;
  }
  // 冲击条件：同一涨价在不同条件下走的渠道不同（方案 §5.4）
  if (hit.dataset.shockCondition) {
    macroState.shockCondition = hit.dataset.shockCondition;
    refreshGraph();
    return;
  }
  if (hit.dataset.clear) {
    macroState.shock = null;
    macroState.shockCondition = null;
    refreshGraph();
    return;
  }
  // 背离横幅 → 直接选中那条边
  if (hit.dataset.alert) {
    const edge = EDGE_BY_ID.get(hit.dataset.alert);
    if (edge) {
      // 横幅扫的是全部 18 条边（含 E16/E18 簇内边），落点必须保证右侧出现的是 edgeCard
      // 而不是剧本叙事：清掉剧本、并切回罗盘（导图/沙盘里没有这条边的画布位置）。
      macroState.playbook = null;
      if (macroState.graphMode !== 'compass') macroState.graphMode = 'compass';
      selectPair(edge.from, edge.to);
    }
    return;
  }
  // 「跳到下方滚动相关性」
  if (hit.dataset.jump) {
    const [a, b] = hit.dataset.jump.split('|');
    selectPair(a, b);
    document.getElementById('macro-pair-host')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  // 连线 / 右侧胶囊 / 右侧链路条目 → 选中
  if (hit.dataset.edge) {
    handleEdgePick(hit.dataset.edge);
    return;
  }
  // 节点：单点聚焦 + 顺带选中与当前对最相关的那条边
  if (hit.dataset.node && hit.dataset.node !== 'signal') {
    handleNodePick(hit.dataset.node);
  }
}

/** 点一条边 → 选中它两端（矩阵高亮 + 下方两图重绘 + 右侧出机理卡） */
export function handleEdgePick(edgeId) {
  const edge = EDGE_BY_ID.get(edgeId);
  if (edge) selectPair(edge.from, edge.to);
}

/** 点一个节点 → 聚焦它；若当前 pair 与它无关，顺带换成它权重最高的那条边 */
export function handleNodePick(id) {
  if (!id || id === 'signal') return;
  const prev = macroState.pair ?? [];
  // 只有当前 pair 与这个节点无关时才换对，否则点节点会把用户刚选的连线冲掉
  if (!prev.includes(id)) {
    const candidate = (macroState.data?.matrix?.ids ?? [])
      .map((other) => (other === id ? null : findEdge(id, other)))
      .filter(Boolean)
      .sort((x, y) => y.weight - x.weight)[0];
    macroState.graphFocus = id;
    if (candidate) {
      macroState.pair = [candidate.from, candidate.to];
      macroState.picked = new Set(macroState.pair);
    }
    syncPairUI();
    return;
  }
  macroState.graphFocus = id;
  refreshGraph();
}

/** 双击节点 → 切到单点思维导图 */
export function onGraphDblClick(e, host) {
  const node = e.target.closest('[data-node]');
  if (!node || !host.contains(node) || node.dataset.node === 'signal') return;
  macroState.graphFocus = node.dataset.node;
  macroState.graphMode = 'mindmap';
  refreshGraph();
}

export function renderMacro() {
  const data = macroState.data;
  if (!data) {
    macroEl.innerHTML = html`<div class="d-loading">正在采集 13 个市场的历史数据…</div>`.toString();
    return;
  }
  const ra = data.riskAppetite ?? {};
  const windows = [
    [20, '20日'],
    [60, '60日'],
    [120, '120日'],
    [250, '250日'],
    [0, '全部'],
  ];

  macroEl.innerHTML = html`
    <div class="d-top">
      <button type="button" class="back-btn" id="back-macro">← 返回列表</button>
      <div class="d-id">
        <h2>世界经济关联 · 传导图谱与统计检验</h2>
        <p>股 / 债 / 汇 / 商品 / 加密 / 波动率 · ${data.matrix.ids.length} 个市场 · 上半场定性沙盘 / 下半场${data.freq === 'week' ? '周' : '日'}频统计</p>
      </div>
      <div class="macro-status">
        ${
          ra.label
            ? html`<span class="risk-badge ${ra.label === 'Risk-On' ? 'on' : ra.label === 'Risk-Off' ? 'off' : 'neutral'}">${ra.label}</span>
               <span class="risk-note" title="风险篮子（${(ra.riskMembers ?? []).join(' / ')}）与避险篮子（${(ra.hedgeMembers ?? []).join(' / ')}，美债按债券价格口径）各自按 60 期波动率标准化后的 Z 值均值之差。单位是标准差，不是百分比；${
                 ra.aligned ? '成员已对齐到同一交易日' : `成员日期不一致（${(ra.memberDates ?? []).join(' / ')}），存在跨日错位`
               }">风险端 ${ra.risk == null ? '—' : `${ra.risk >= 0 ? '+' : ''}${ra.risk.toFixed(2)}σ`} · 避险端 ${
                 ra.hedge == null ? '—' : `${ra.hedge >= 0 ? '+' : ''}${ra.hedge.toFixed(2)}σ`
               }${ra.aligned === false ? ' · 跨日错位' : ''}</span>
               <span class="risk-note" title="隐含波动率减实现波动率（VIX − 标普 500 的 20 日实现年化波动率）。这是「隐含减实现」的波动率差，不是精确分解出来的方差风险溢价；RV 固定用日线算，切日/周不会变。">${
                 data.vrp
                   ? `隐含−实现 ${data.vrp.vrp >= 0 ? '+' : ''}${data.vrp.vrp.toFixed(2)} · VIX ${data.vrp.vix.toFixed(2)} − RV20 ${data.vrp.rv20.toFixed(2)}${
                       data.vrp.asOf ? `（RV 截至 ${data.vrp.asOf}）` : ''
                     }`
                   : ''
               }</span>`
            : ''
        }
      </div>
    </div>

    <div id="macro-graph-host"></div>

    <section class="d-block">
      <div class="chart-head">
        <h3>相关性矩阵 <span class="h3-note">红色=正相关，蓝色=负相关；越深越强</span></h3>
        <div class="seg" id="macro-freq">
          <button type="button" data-f="day" class="${(data.freq ?? 'day') === 'day' ? 'on' : ''}">日频</button>
          <button type="button" data-f="week" class="${data.freq === 'week' ? 'on' : ''}">周频</button>
        </div>
        <div class="seg" id="macro-window">
          ${windows.map(
            ([w, label]) =>
              html`<button type="button" data-w="${w}" class="${data.windowSize === w ? 'on' : ''}">${label}</button>`,
          )}
        </div>
      </div>
      ${macroMatrixHTML(data)}
      <p class="macro-hint">
        点任意格子 → 下方看这两个标的的滚动相关性与走势对比。样本量按两两共同${data.freq === 'week' ? '周' : '交易日'}计算（pairwise）。
        ${
          data.freq === 'week'
            ? '周频能消除跨时区交易日切分的影响（例如国际金 ~ 沪金 日频仅 0.48，周频 0.79）。'
            : '注意：国际金 / 沪金这类跨时区标的，日频会因交易日切分点不同而低估相关性，可切「周频」对照。'
        }
      </p>
    </section>

    <section class="d-block">
      <h3>历史领先滞后关系 <span class="h3-note">滞后相关明显强于同期相关才计入（<b>统计结果，不是因果</b>）· <b>*</b> 表示通过 BH 校正（约 1700 个滞后组合一起校正）· 单位=${data.freq === 'week' ? '周' : '交易日'}</span></h3>
      ${macroLeadLagHTML(data)}
    </section>

    <section class="d-block">
      <h3>滚动相关性 <span class="h3-note">40 ${data.freq === 'week' ? '周' : '交易日'}窗口</span></h3>
      <div id="macro-pair-host">${macroPairSection(data)}</div>
    </section>

    <section class="d-block">
      <h3>归一化走势对比 <span class="h3-note">近 ${data.recent?.dates?.length ?? 0} ${data.freq === 'week' ? '周' : '交易日'}</span></h3>
      <div class="pick-row" id="macro-picks">
        ${data.universe
          .filter((u) => u.ok)
          .map(
            (u) =>
              html`<button type="button" class="pick ${macroState.picked.has(u.id) ? 'on' : ''}" data-pick="${u.id}">${u.short}</button>`,
          )}
      </div>
      <div id="macro-compare-host">${macroCompareHTML(data)}</div>
    </section>

    <footer class="d-foot">
      <span>收益率口径：对数收益率（美债10年期用百分点差，展示换算为 bp）· 相关性按两两共同${data.freq === 'week' ? '周' : '交易日'}计算 · 相关不等于因果</span>
      <span>生成于 ${clockText(new Date(data.generatedAt))}</span>
    </footer>
  `.toString();

  // 图谱默认先走手绘 SVG（同步、无等待），X6 画布模块到位后再原地升级一次。
  refreshGraph();
  ensureMacroFlow().then((m) => {
    if (m && !macroEl.hidden) refreshGraph();
  });

  document.getElementById('back-macro')?.addEventListener('click', () => {
    location.hash = '';
  });

  document.querySelectorAll('#macro-freq button').forEach((btn) => {
    btn.addEventListener('click', () => {
      macroState.freq = btn.dataset.f;
      macroState.pair = null;
      loadMacro(macroState.window ?? 250, true);
    });
  });

  document.querySelectorAll('#macro-window button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const w = Number(btn.dataset.w);
      loadMacro(w, true);
    });
  });

  document.getElementById('robust-only')?.addEventListener('change', (e) => {
    macroState.robustOnly = e.target.checked;
    renderMacro();
  });

  document.querySelectorAll('.corr-matrix td.corr').forEach((td) => {
    td.addEventListener('click', () => {
      const a = td.dataset.a;
      const b = td.dataset.b;
      if (!a || !b || a === b) return;
      selectPair(a, b);
    });
  });

  document.querySelectorAll('#macro-picks .pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.pick;
      if (macroState.picked.has(id)) macroState.picked.delete(id);
      else if (macroState.picked.size < LINE_COLORS.length) macroState.picked.add(id);
      syncPairUI();
    });
  });

  bindGraph();
}

export async function loadMacro(windowSize = 250, force = false) {
  macroEl.innerHTML = html`<div class="d-loading">正在采集 13 个市场的历史数据…</div>`.toString();
  try {
    const freq = macroState?.freq ?? 'day';
    const res = await fetch(
      `./api/macro?window=${windowSize}&freq=${freq}${force ? '&force=1' : ''}`,
      { cache: 'no-store' },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!macroState) {
      macroState = {
        data,
        window: windowSize,
        freq: 'day',
        pair: null,
        picked: new Set(),
        graphMode: 'compass',
        graphFocus: 'gold-intl',
        playbook: null,
        shock: null,
        // 冲击条件：原因未分类 / 供给受阻 / 需求增强（方案 §5.4）
        shockCondition: null,
        // 与详情页同源的解释快照（方案 §3.3 / B5）
        explanation: null,
        explanationAsset: null,
      };
    }
    macroState.data = data;
    macroState.window = windowSize;
    macroState.freq = data.freq ?? 'day';
    // 同步进共享 store：地图的宏观胶囊用的是同一份，不必再拉一次
    store.macro = { data, at: Date.now() };
    if (!macroState.pair && data.matrix.ids.length >= 2) {
      // 默认选中「黄金 ~ 美元」这组最常被问到的关系
      const has = (x) => data.matrix.ids.includes(x);
      macroState.pair = has('gold-intl') && has('dxy') ? ['gold-intl', 'dxy'] : [data.matrix.ids[0], data.matrix.ids[1]];
      macroState.picked = new Set(macroState.pair);
    }
    renderMacro();
  } catch (err) {
    macroEl.innerHTML = html`<div class="d-top"><button type="button" class="back-btn" id="back-macro">← 返回列表</button><div class="d-id"><h2>世界经济关联</h2><p>加载失败</p></div></div><div class="d-error">${err?.message ?? String(err)}</div>`.toString();
    document.getElementById('back-macro')?.addEventListener('click', () => {
      location.hash = '';
    });
  }
}

/* ------------------------------------------------------------------ *
 * 生命周期（由 router 调用）
 *
 * unmount 里必须显式 dispose X6 画布：原来 route() 只做 macroEl.innerHTML = ''，
 * 容器虽然从 DOM 摘掉，但 ResizeObserver 与 X6 实例仍然挂在 module 级 WeakMap 上，
 * 反复进出 #/macro 会越积越多。
 * ------------------------------------------------------------------ */
export function mountMacro() {
  macroEl.hidden = false;
  window.scrollTo({ top: 0 });
  loadMacro(macroState?.window ?? 250, true);
}

export function unmountMacro() {
  // 画布模块是懒加载的，没进过 #/macro 时为 null
  if (macroFlowMod?.destroyMacroFlow) {
    try {
      // 画布实例是挂在 #macro-graph-host 上的（不是 macroEl 本身），
      // 必须用同一个元素做 key 才能从 WeakMap 里取回来，否则 dispose 静默空转。
      const host = macroEl.querySelector('#macro-graph-host') ?? macroEl;
      macroFlowMod.destroyMacroFlow(host);
    } catch (err) {
      console.warn('[macro] 画布回收失败：', err);
    }
  }
  macroEl.hidden = true;
  macroEl.innerHTML = '';
}

/** 画布模块是否已就位（供调试/测试观察懒加载状态） */
export function macroFlowLoaded() {
  return Boolean(macroFlowMod);
}
