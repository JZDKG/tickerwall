/* ================================================================== *
 * 事件按日归档（JSONL）
 *
 * 从 services/events.service.js 拆出来。这里只管磁盘：
 * 追加写 `data/events/${YYYY-MM-DD}.jsonl`、按天取回、跨天读时间窗。
 *
 * 零业务依赖 —— 不 import 任何 service，也不碰实时快照。这一条是硬约束：
 * `getEventHistory` 需要「先读归档、再取实时、最后合并」，但那一步留在
 * 服务层，因为取实时要用 getEvents()，搬进来就成了 db → service 反向依赖。
 *
 * 按天分文件而不是单个大文件：一天一个 jsonl 可以整文件读、可以按日期
 * 直接定位，坏一天不会毁掉全部历史。
 * ================================================================== */

import path from 'node:path';
import fsp from 'node:fs/promises';

import { appendJsonl, readJsonl, readJsonlField } from './index.js';
import { sanitizeUrl } from '../domain/news-lexicon.js';
import { DATA_DIR } from '../paths.js';

export const EVENTS_DIR = path.join(DATA_DIR, 'events');

export let archivedIds = new Set();
export let archivedDay = null;

export async function ensureDataDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(EVENTS_DIR, { recursive: true });
}

export function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function loadArchivedIds(day) {
  if (archivedDay === day) return;
  archivedDay = day;
  archivedIds = new Set();
  archivedIds = await readJsonlField(path.join(EVENTS_DIR, `${day}.jsonl`), 'id');
}

/** 把本轮事件追加归档（按天分文件，同一天内按 id 去重） */
export async function archiveEvents(items) {
  try {
    const day = todayKey();
    await loadArchivedIds(day);
    const fresh = items.filter((it) => !archivedIds.has(it.id));
    if (!fresh.length) return;
    await ensureDataDirs();
    await appendJsonl(
      path.join(EVENTS_DIR, `${day}.jsonl`),
      fresh.map((it) => ({
        id: it.id,
        time: it.time,
        source: it.source,
        title: it.title,
        body: it.body?.slice(0, 300) ?? '',
        url: sanitizeUrl(it.url),
        level: it.level,
        topics: it.topics?.map((t) => t.label) ?? [],
        symbols: it.symbols ?? [],
        region: it.region ?? null,
        llm: Boolean(it.llm),
      })),
    );
    fresh.forEach((it) => archivedIds.add(it.id));
  } catch (err) {
    console.error('事件归档失败:', err?.message ?? err);
  }
}

/**
 * 读北京时间时间窗覆盖的所有归档行。
 *
 * 跨天边界按北京算（+8h 后取日期），和 todayKey() 的归档命名保持一致 ——
 * 用 UTC 算会导致 0–8 点的归档查不到。
 */
export async function readArchiveRowsForSpan({ sinceMs, nowMs }) {
  const dayOf = (ms) => new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const files = [...new Set([dayOf(sinceMs), dayOf(nowMs)])].map((d) =>
    path.join(EVENTS_DIR, `${d}.jsonl`),
  );
  const rows = [];
  for (const f of files) rows.push(...(await readJsonl(f)));
  return rows;
}
