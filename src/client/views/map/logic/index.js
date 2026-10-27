/* ================================================================== *
 * 地图纯逻辑层
 *
 * 六滤镜、巡航队列与状态机、Sparkline、24h 分桶、48h 日历信标。
 * 全部零 DOM、零定时器：时间从参数传进来，于是「无交互 20 秒自动恢复」
 * 这种时序行为可以直接断言，不用等真时间。
 *
 * 单测见 tests/worldmap-logic.test.js。
 * ================================================================== */

export {
  TOPIC_FILTERS,
  FILTER_BY_KEY,
  topicKeysOf,
  matchFilter,
  filterMapEvents,
  dominantTopic,
} from './filters.js';

export { sparklinePath, sparklineChange } from './sparkline.js';

export {
  BUCKET_HOURS,
  LEVEL_COLOR,
  eventTimeMs,
  bucketEvents24h,
  eventsUpTo,
  normalizedHeights,
} from './timeline.js';

export {
  ALERT_ANCHOR,
  DEFAULT_WINDOW_HOURS,
  DEFAULT_MIN_IMPORTANCE,
  upcomingCalendarAlerts,
  formatCountdown,
  beijingHm,
  easternHm,
} from './calendar.js';

export {
  MODES,
  IDLE_RESUME_MS,
  QUEUE_HIGH_LIMIT,
  SAME_TOPIC_RUN,
  STEP_MS,
  createSpotlightState,
  buildSpotlightQueue,
  breakTopicRuns,
  spotlightReducer,
  currentSpotlightEvent,
  needsIdleTimer,
} from './spotlight.js';
