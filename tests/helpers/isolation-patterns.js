/* ================================================================== *
 * 隔离审计用的模式判定（单独抽出来，才能自测「审计有效」）
 * ================================================================== */

/** 不带参数打开 → 落到默认数据目录；带 :memory: 或显式路径都不算 */
export function isDirtyOpen(line) {
  return /useDatabase\(\s*\)/.test(line) || /new DatabaseSync\(\s*\)/.test(line) || /openDb\(\s*\)/.test(line);
}

/** 显式给数据目录的写法（子进程环境变量或临时目录） */
export function isIsolatedSpawn(src) {
  return src.includes('KANBAN_DATA_DIR') || src.includes('mkdtempSync');
}
