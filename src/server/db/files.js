/* ================================================================== *
 * data/ 下的文件 I/O（JSON / JSONL）
 *
 * 只做「读写字节 → 结构化数据」这一件事，不持有任何内存状态：
 * 历史环形缓冲、LLM 缓存的 Map、已归档 id 集合都留在 server.mjs，
 * 这里只负责把它们落盘 / 读回来。这样单测可以随便给临时目录。
 *
 * 三种格式的容错取向不同：
 *   · history.json —— 整体覆盖写，坏文件当「没有」处理（历史可以重建）
 *   · *.jsonl      —— 逐行追加，坏行跳过（一行坏了不该毁掉整天的归档）
 *   · llm-cache.json —— 只读一次做迁移，坏文件当「没有」
 * ================================================================== */

import fsp from 'node:fs/promises';
import path from 'node:path';

/** 原子写：先写 .tmp 再 rename，避免进程被杀时留下半个 JSON */
export async function writeJsonAtomic(file, obj) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj), 'utf8');
  await fsp.rename(tmp, file);
}

/** 读 JSON；文件不存在或内容坏掉都返回 null（不抛） */
export async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** 追加一组对象为 JSONL（每行一个） */
export async function appendJsonl(file, records) {
  const list = Array.isArray(records) ? records : [records];
  if (!list.length) return 0;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const body = list.map((r) => JSON.stringify(r)).join('\n');
  await fsp.appendFile(file, `${body}\n`, 'utf8');
  return list.length;
}

/** 读 JSONL；坏行跳过，空行跳过，文件不存在返回 [] */
export async function readJsonl(file) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const out = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        /* 跳过坏行 */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** 读 JSONL 并只取某个字段，用来快速建「已处理 id」集合 */
export async function readJsonlField(file, field = 'id') {
  const rows = await readJsonl(file);
  const set = new Set();
  for (const r of rows) if (r && r[field] != null) set.add(r[field]);
  return set;
}

/** 写历史文件：{ savedAt, notes, history } */
export async function writeHistoryFile(file, { notes, history }) {
  await writeJsonAtomic(file, {
    savedAt: new Date().toISOString(),
    notes: notes ?? {},
    history: history ?? {},
  });
}

/** 读历史文件，返回 { notes, history }（缺失字段给空对象） */
export async function readHistoryFile(file) {
  const obj = await readJson(file);
  if (!obj || typeof obj !== 'object') return { notes: {}, history: {} };
  return {
    notes: obj.notes && typeof obj.notes === 'object' ? obj.notes : {},
    history: obj.history && typeof obj.history === 'object' ? obj.history : {},
  };
}
