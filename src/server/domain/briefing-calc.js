/* ================================================================== *
 * 隔夜复盘的计算部分
 *
 * 从 services/quotes.service.js 拆出来（那边原本 1503 行，混了 6 种职责）。
 * 这里只有纯计算 + 一次读快照，没有 HTTP、没有缓存、没有模块状态。
 *
 * 为什么值得单独一层：这套逻辑的判断依据全是「时间怎么切」，而时间恰恰
 * 是最容易算错又最难发现的东西 —— 15:00 边界、跨时区、Invalid Date、
 * 跨源口径错位，任何一条错都是「数字看着正常但是错的」。独立成模块才能
 * 密集测它。
 * ================================================================== */

import { readSnapshots } from '../db/index.js';
import { MOVE_SUSPECT_PCT } from './instruments.js';

/**
 * 快照读多少条。
 *
 * 一天 15 秒一条约 5760 条；这里留 20_000 是为了覆盖「周末 + 长周末」
 * 之后第一次打开页面的情形 —— 基准可能落在三四天前。
 */
export const BRIEFING_MAX_LINES = 20_000;

/** 按 Asia/Shanghai 切自然日，返回 'YYYY-MM-DD'；非法日期返回 null */
export function shanghaiDay(iso) {
  try {
    const d = new Date(iso);
    // toLocaleDateString 对 Invalid Date 不抛错，而是返回字符串 "Invalid Date"。
    // 只靠 try/catch 会把它当成合法日期，隔夜复盘的基准切分就会算错。
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  } catch {
    return null;
  }
}

/** 北京时间的「当日第几分钟」，用来切 15:00 这个收盘边界 */
export function shanghaiMinuteOfDay(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const t = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false });
    const [h, m] = t.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  } catch {
    return null;
  }
}

export async function buildBriefing() {
  const snaps = await readSnapshots(BRIEFING_MAX_LINES);
  if (snaps.length < 2) {
    return { ok: true, status: 'collecting', samples: snaps.length, items: [] };
  }
  const latest = snaps[snaps.length - 1];
  /**
   * 基准取「最近一个已过的 A 股收盘 15:00」之前的最后一条快照。
   *
   * 原来取的是上一个自然日 23:59，会把 15:00–24:00 整段漏掉 —— 而这段正好包含
   * 欧盘全程、20:30 美东重磅数据、21:30 美股开盘上半场，正是隔夜最该复盘的部分；
   * 同时日经/A股这些在 23:59 早已收盘的品种会显示 0.00%。
   */
  const CLOSE_MIN = 15 * 60;
  const today = shanghaiDay(latest.at);
  const nowMin = shanghaiMinuteOfDay(latest.at);
  const yesterday = shanghaiDay(new Date(new Date(latest.at).getTime() - 86_400_000).toISOString());
  // 若今天还没到 15:00，边界就落在昨天 15:00
  const cutDay = nowMin != null && nowMin >= CLOSE_MIN ? today : yesterday;

  let baseline = null;
  let crossedDay = false;
  for (let i = snaps.length - 1; i >= 0; i -= 1) {
    const d = shanghaiDay(snaps[i].at);
    const m = shanghaiMinuteOfDay(snaps[i].at);
    if (!d || m == null) continue;
    if (d < cutDay || (d === cutDay && m <= CLOSE_MIN)) {
      baseline = snaps[i];
      crossedDay = true;
      break;
    }
  }
  if (!baseline) {
    // 还没跨过任何 15:00：退回最早一条，标注为「今日开盘以来」而不是「隔夜」
    baseline = snaps[0];
  }
  const baseMap = new Map(baseline.quotes.map((q) => [q.id, q]));
  const items = [];
  const dropped = [];
  for (const q of latest.quotes) {
    const b = baseMap.get(q.id);
    if (!b || !(b.price > 0) || !(q.price > 0)) continue;
    const move = q.price - b.price;
    const movePct = (move / b.price) * 100;
    if (!Number.isFinite(movePct)) continue;

    /**
     * 跨源口径错位过滤：基准与最新刻度若来自不同上游（典型是新浪停更的
     * sina:int_* 僵尸价 vs 东财实时价），差值不是「隔夜涨跌」而是一条脏数据。
     * 阈值复用报价层的 MOVE_SUSPECT_PCT —— 同一套「这个品种一天能动多少」的认知，
     * 不另立一套。宁可少一行，也不给用户看 +40% 这种假信号。
     */
    const suspect = MOVE_SUSPECT_PCT[q.id] ?? 12;
    if (Math.abs(movePct) > suspect) {
      dropped.push({ id: q.id, movePct: Number(movePct.toFixed(2)), limit: suspect });
      continue;
    }
    items.push({
      id: q.id,
      name: q.name,
      from: b.price,
      to: q.price,
      move,
      movePct,
      changePctNow: q.changePct ?? null,
    });
  }
  items.sort((a, b) => Math.abs(b.movePct) - Math.abs(a.movePct));
  return {
    ok: true,
    status: crossedDay ? 'overnight' : 'intraday',
    dropped,
    cutLabel: '15:00 A股收盘',
    baselineAt: baseline.at,
    latestAt: latest.at,
    samples: snaps.length,
    items,
  };
}
