/* ================================================================== *
 * ui-kit —— Phase 2 现代前端运行时的统一出口（构建期入口）
 *
 * 业务代码保持零构建的原生 ES Module，浏览器不直接 import 这些裸模块名：
 * Vite 把这个入口打包成 public/vendor/ui-kit.js 并入库，import map 里声明
 * `ui-kit`。zustand/vanilla 提供框架无关的 store，其余能力预留给后续把视图
 * 逐步搬进 React 19 + TanStack Query + lightweight-charts 的迁移。
 *
 * 与 geo-kit 同样的纪律：只有这一处允许直接 import 浏览器侧裸依赖，
 * 业务模块一律从 vendor 产物或纯函数模块取，避免同一库出现两份实例。
 * ================================================================== */

export { createStore } from 'zustand/vanilla';
export {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
export {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
} from 'lightweight-charts';
export { createElement, useState, useEffect, useMemo } from 'react';
export { createRoot } from 'react-dom/client';
