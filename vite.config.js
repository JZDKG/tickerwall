/**
 * Vite 构建配置
 *
 * 现阶段（Phase 1）只把 `#/macro` 顶部的传导图谱打成一个 ES 模块，
 * 输出到 `public/vendor/macro-flow.js`，由 `public/app.js` 动态 import() 懒加载。
 *
 * 依赖策略（2026-10 起）：取消「运行时零依赖」约定，允许引入 npm 依赖；
 * 浏览器端依赖统一打进 public/vendor/ 并入库，详见 README「依赖策略」。
 *
 * 为什么不直接改成「整站 Vite、输出 dist/」：
 *   这个项目的一条硬约束是「双击 启动看板.command 就秒开，零安装」。
 *   整站切换意味着没有 node_modules 的机器、或忘了 npm run build 的机器，
 *   打开就是白屏。所以先只把重的那块（X6 + dagre，约 700KB）拆出来单独打包，
 *   其余 3500 行原生前端原样保留；等 Phase 2 把五大视图都搬进 src/client 之后，
 *   再把这里切成 `build.outDir: 'dist'` 的多页构建，服务端按 dist → public 的顺序回退。
 *
 * 产物入库（不写进 .gitignore）：保证 clone 下来不装依赖也能跑。
 * 改了 src/ 之后手动 `npm run build` 重新生成。
 */

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  // 产物直接写进 public/vendor，不能再让 Vite 把 public 当静态目录再拷一遍
  publicDir: false,
  build: {
    outDir: 'public/vendor',
    emptyOutDir: false,
    target: 'es2020',
    // minify 交给 Vite 8 默认的 oxc（vite 8 已切 rolldown，esbuild 不再是必装依赖）
    sourcemap: false,
    lib: {
      // 多入口：每个入口产出独立的单文件，浏览器按 import map 各取所需。
      //   macro-flow —— #/macro 顶部的传导图谱（X6 + dagre，约 700KB）
      //   geo-kit    —— 地图的 d3 地理/相机栈 + world-atlas 拓扑（约 200KB）
      // 两者没有共享依赖，所以不会拆出公共 chunk；万一将来有了，Vite 会生成
      // shared-*.js，届时 import map 要一并补上。
      entry: {
        'macro-flow': path.resolve(root, 'src/client/views/macro/index.js'),
        'geo-kit': path.resolve(root, 'src/client/vendor/geo-kit.js'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        // 产物名由上面 fileName 决定；资源统一用入口名，不用记 chunk 名
        assetFileNames: '[name].[ext]',
      },
    },
  },
  test: {
    /**
     * 覆盖率：分层门槛，不是全仓一刀切 95%。
     *
     * 理由：4000+ 行视图层是纯 DOM 渲染代码，在 Node 里根本不加载。给它
     * 硬刷行覆盖只会产出一堆「跑通不断言」的面子测试。所以按风险分层：
     *
     *   server / shared / geo   大脑与安全底线（行情、时区、统计、清洗）
     *                           → 爬到 90~95%
     *   views                   守关键契约 → 40~50%，其余靠两道防线：
     *                             · 静态：innerHTML 裸插值棘轮 + raw 白名单
     *                             · 动态：6 视口探针 + 卡片交互探针
     *   public/vendor           构建产物，已 exclude
     *
     * 下面每个数字都是**当前实测值**，只许升不许降；补完测试后顺手收紧。
     */
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/client/vendor/**'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        // 全站基线（当前实测 27.8 / 23.5 / 27.2 / 27.9）
        statements: 27,
        branches: 23,
        functions: 27,
        lines: 27,
        // 核心逻辑层（39.7 / 33.5 / 38.6 / 40.9）→ 目标 90+
        'src/server/**': { statements: 39, branches: 33, functions: 38, lines: 40 },
        // 客户端基础设施（49.7 / 44.6 / 48.6 / 53.6）→ 目标 95
        'src/client/shared/**': { statements: 49, branches: 44, functions: 48, lines: 53 },
        // 视图层（18.3 / 15.8 / 19.4 / 17.6；只有 events.js 有组合渲染测试）→ 目标 40~50
        'src/client/views/**': { statements: 18, branches: 15, functions: 19, lines: 17 },
      },
    },
  },

  // bare specifier 的解析：业务代码统一写 `import ... from 'geo-kit'`，
  // 浏览器侧靠 index.html 的 import map，Node/Vitest 侧靠这条 alias。
  // 目标是同一份源码两种环境都能解析，纯函数模块才能直接单测。
  resolve: {
    alias: {
      'geo-kit': path.resolve(root, 'src/client/vendor/geo-kit.js'),
    },
  },

  // 开发期：把 /api 代理到正在跑的 server.mjs，方便 `npm run dev:web` 单独调前端
  server: {
    port: 5180,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
});
