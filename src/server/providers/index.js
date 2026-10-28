/* ================================================================== *
 * 上游源出口
 *
 * 依赖方向约定：providers/ 可以 import db/ 与 domain/，反过来不行。
 * fredQuote 需要 readDailyCache 就是这条单向依赖的典型用例。
 * ================================================================== */

export {
  UA,
  SINA_REFERER,
  DEFAULT_FETCH_TIMEOUT_MS,
  toNum,
  setFetcher,
  fetchRaw,
  splitSina,
  splitSinaPipe,
} from './http.js';

export { parseSinaSpot, parseSinaGlobal, parseSinaSimpleIndex, parseSinaFutures } from './sina.js';

export {
  CBOE_MIN_ROWS,
  parseCboeCsv,
  parseCboeCsvOrThrow,
  cboeQuoteFromRows,
  cboeCache,
  cboeIndexRows,
  cboeIndex,
  fetchCboeIndexDetail,
  fetchCboeVix,
} from './cboe.js';

export {
  fetchEastmoneyDaily,
  fetchBinanceDaily,
  fetchSinaUsDaily,
  fetchYahooDaily,
  fetchTencentDaily,
  fetchFredDaily,
  fetchNasdaqDaily,
  fetchSinaFuturesDaily,
  fetchSinaForexDaily,
  fetchSinaInnerFuturesDaily,
  seedYahooOf,
  historySourcesFor,
} from './daily.js';

export { cnbcNum, parseCnbcQuotes, cnbcQuoteOf } from './cnbc.js';

export {
  FRED_MIN_ROWS,
  FRED_SIGNED_SERIES,
  fredValueDomain,
  parseFredCsv,
  parseFredCsvOrThrow,
  fredQuoteFromRows,
} from './fred.js';
