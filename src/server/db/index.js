/* ================================================================== *
 * 持久层出口
 *
 * 约定：db/ 之下不 import providers/ 或 services/，只依赖 node:sqlite 与 fs。
 * 这样 providers/fred.js 可以放心调 readDailyCache，永远不会成环。
 * ================================================================== */

export {
  REPO_ROOT,
  DEFAULT_DB_FILE,
  openDatabase,
  getDb,
  useDatabase,
  closeDb,
  currentDatabaseFile,
  schemaVersionOf,
  SCHEMA_VERSION,
  kvGet,
  kvSet,
  kvGetJson,
  kvSetJson,
} from './sqlite.js';

export { MIGRATIONS, migrateDatabase, currentSchemaVersion } from './migrations.js';

export {
  writeObservationRevisions,
  readObservationRevision,
  readObservationAsOf,
  countObservationRevisions,
  writeArticle,
  readArticle,
  latestArticleRevision,
  writeEventRevision,
  readEventRevision,
  readEventAsOf,
  listEventRevisions,
  validateReferences,
  writeExplanation,
  readExplanation,
  latestExplanation,
  explanationIdByFingerprint,
  listExplanationEvidence,
  pruneUnlinkedEvidence,
  countExplanations,
  recordCollectionSuccess,
  recordCollectionFailure,
  readCollectionState,
  listCollectionStates,
  explanationStorageStatus,
} from './explanations.js';

export { DAILY_FRESH_MS, numOrNull, readDailyCache, writeDailyCache, isDailyCacheFresh } from './daily-cache.js';

export {
  SNAPSHOT_READ_LIMIT,
  SNAPSHOT_ANCHOR_WINDOW,
  takeSnapshot,
  readSnapshots,
  snapshotCount,
  resetSnapshotGuard,
} from './snapshots.js';

export {
  writeJsonAtomic,
  readJson,
  appendJsonl,
  readJsonl,
  readJsonlField,
  writeHistoryFile,
  readHistoryFile,
} from './files.js';
