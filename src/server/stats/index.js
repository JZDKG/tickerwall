/* 统计层统一出口：server.mjs 一行 import 全部拿到 */
export { normalCdf, pFromT } from './distribution.js';
export { pearson, fisherCI, corrStats, alignSeries, pairwiseCorr } from './correlation.js';
export { olsNeoeyWest, nwCorrT } from './newey-west.js';
export { benjaminiHochberg } from './fdr.js';
