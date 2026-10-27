/**
 * Vite 构建配置
 *
 * 现阶段（Phase 1）只把 `#/macro` 顶部的传导图谱打成一个 ES 模块，
 * 输出到 `public/vendor/macro-flow.js`，由 `public/app.js` 动态 import() 懒加载。
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
      entry: path.resolve(root, 'src/client/views/macro/index.js'),
      formats: ['es'],
      fileName: () => 'macro-flow.js',
    },
    rollupOptions: {
      output: {
        // 单文件输出：app.js 只需要 import 一个 URL，不用记 chunk 名
        assetFileNames: 'macro-flow.[ext]',
      },
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
