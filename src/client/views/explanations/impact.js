/* ================================================================== *
 * 地图上的「影响范围」：与解释卡同一份快照
 *
 * 方案 §3.5 / C4 要求把三件事分开表达，不能混成一张示意图：
 *   1. **事件发生地** —— 地理赛区（欧洲不是欧元区、亚太不是东南亚）；
 *   2. **影响范围** —— 受影响资产与它们的解释渠道状态；
 *   3. **不表示**什么 —— 地图不代表资金流、贸易量或价格变化幅度。
 *
 * 这里只做纯函数：地图视图把「当前这条播报事件 + 相关资产的解释快照」传进来，
 * 得到一行可读文字。取不到解释就明说「尚未生成」，不猜。
 * ================================================================== */

import { REGION_ANCHORS, REGION_SEMANTICS } from '../map/geo/regions.js';

const STATUS_TEXT = {
  consistent: '观测一致',
  mixed: '证据并存',
  not_supported: '证据不支持',
  untested: '尚未确认',
};

/** 渠道状态的优先级：先报最有信息量的那个 */
const STATUS_RANK = { consistent: 0, mixed: 1, not_supported: 2, untested: 3 };

/**
 * 事件发生地的一句话说明（地理口径）。
 *
 * @param {string} region
 * @returns {{label:string, text:string, isGlobal:boolean}}
 */
export function originLine(region) {
  const anchor = REGION_ANCHORS[region] ?? REGION_ANCHORS.global;
  if (!region || region === 'global' || anchor.noAnchor) {
    return {
      label: anchor.label,
      text: '全球性事件：没有指向具体国家，地图上不落锚点',
      isGlobal: true,
    };
  }
  return {
    label: anchor.label,
    // 明确「这是地理赛区」：欧洲包含非欧元区国家，亚太不等于东南亚
    text: `事件发生地（地理赛区）：${anchor.label}`,
    isGlobal: false,
  };
}

/**
 * 取一个资产里「最值得说」的渠道状态。
 *
 * 只看方向性机制：计价换算与历史相关不是当期判断，放在这里会误导。
 */
export function leadChannelOf(explanation) {
  const list = (explanation?.hypotheses ?? []).filter((h) => h.relationType === 'mechanism');
  if (!list.length) return null;
  const sorted = [...list].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  );
  const h = sorted[0];
  return {
    mechanismId: h.mechanismId,
    label: h.label ?? h.mechanismId,
    status: h.status,
    statusText: STATUS_TEXT[h.status] ?? h.status,
  };
}

/**
 * 影响范围一行文字。
 *
 * @param {{symbols?:string[]}} event
 * @param {Map<string, object|null>} explanationsByAsset 资产 → 解释快照（或 null）
 * @param {Map<string,string>} nameOf 资产 → 中文短名
 * @returns {{text:string, tone:string, assets:Array<object>}|null}
 */
export function impactLine(event, explanationsByAsset, nameOf = new Map()) {
  const symbols = (event?.symbols ?? []).filter((id) => explanationsByAsset.has(id));
  if (!symbols.length) return null;
  const assets = symbols.slice(0, 2).map((id) => {
    const ex = explanationsByAsset.get(id);
    const lead = ex ? leadChannelOf(ex) : null;
    return {
      assetId: id,
      name: nameOf.get(id) ?? id,
      status: lead?.status ?? null,
      text: lead ? `${lead.label} · ${lead.statusText}` : '解释尚未生成',
    };
  });
  const worst = assets.some((a) => a.status === null)
    ? 'dim'
    : assets.some((a) => a.status === 'consistent')
      ? 'ok'
      : assets.some((a) => a.status === 'mixed')
        ? 'warn'
        : 'dim';
  return {
    text: assets.map((a) => `${a.name}：${a.text}`).join('；'),
    tone: worst,
    assets,
  };
}

/** 固定免责：地图表达的是「地点 + 方向」，不是流量或幅度 */
export const IMPACT_DISCLAIMER = `${REGION_SEMANTICS.tradingVenuesNote}；弧线表示受影响资产的定价中心，不是资金流、贸易量或价格变化幅度。`;

/** 播报台里那一行短注（完整说明放 title，避免每 6 秒刷一长句） */
export const IMPACT_SHORT_NOTE = '弧线＝定价中心，不是资金流或价格变化幅度';

/**
 * 拼成播报台里那段小型说明。
 *
 * @param {{origin:object, impact:object|null, disclaimer?:boolean}} parts
 */
export function impactBlockHtml({ origin, impact, shortNote = true }) {
  const rows = [`<div class="bc-origin">${escapeHtml(origin.text)}</div>`];
  if (impact) rows.push(`<div class="bc-impact ${impact.tone}">影响范围：${escapeHtml(impact.text)}</div>`);
  else rows.push('<div class="bc-impact dim">影响范围：受影响资产还没有可用的解释</div>');
  // 短注常驻、完整说明放 title：既说清"不是什么"，也不把播报台撑成一段免责声明
  if (shortNote) rows.push(`<div class="bc-note" title="${escapeHtml(IMPACT_DISCLAIMER)}">${escapeHtml(IMPACT_SHORT_NOTE)}</div>`);
  return rows.join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
