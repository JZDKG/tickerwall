/* ================================================================== *
 * 仓库路径（唯一来源）
 *
 * 之前 DATA_DIR 在 server.mjs 里定义，服务层要用就得把 server.mjs 拖进来 ——
 * 那会让「薄入口」重新变胖。路径属于基础设施，单独放一层，谁都能单向依赖。
 * ================================================================== */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根目录：src/server/paths.js → 上两级 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// KANBAN_DATA_DIR：把整个 data/ 换到别处（等价性验收时用于冻结 history.json /
// events/*.jsonl / 落盘缓存 —— 只冻结 SQLite 是不够的，分时历史是从 json 载入的）
export const DATA_DIR = process.env.KANBAN_DATA_DIR
  ? path.resolve(process.env.KANBAN_DATA_DIR)
  : path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');
