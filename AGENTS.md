# AGENTS.md

本文件给在本仓库工作的 AI 编码助手（Codex、Claude Code、Antigravity 等）提供项目上下文与硬性约束。
`CLAUDE.md` 通过引用加载本文件，**项目规则只在这里维护一份**。

---

## 项目概览

Tickerwall：自托管行情看板，单个 Node 进程（默认 `http://127.0.0.1:8787`）。

- 20+ 个全球标的的纵向行情列表、详情页（K 线 / 分时 / 关键指标 / 多源对照）
- 全球地图（晨昏线、事件冲击弧线）、事件中心（宏观日历 + 实时快讯 + LLM 复核分类）
- 关联分析（相关性矩阵、领先滞后、传导图谱与沙盘推演）、解释卡、隔夜复盘
- 附属工程：`src-tauri/`（Tauri v2 桌面壳）、`miniapp/`（微信小程序版，独立依赖与工具链）

`README.md` 是很长的工程日志，记录了大量「踩过的坑」和口径决策；改动某个模块前，先搜 README 里对应章节。
下一步工作方向见 `docs/handoff-next-session.md` 与 `docs/product-feature-roadmap.md`。

## 不可破坏的硬约束

1. **零安装秒开**：`node server.mjs` / 双击 `启动看板.command` 必须能直接打开页面。浏览器端构建产物 `public/vendor/*.js` **入库**，不要加进 `.gitignore`，也不要把整站改成必须先构建的 `dist/` 方案。
2. **离线可打开**：不引入需要 API Key 或境外瓦片的在线地图/前端服务。
3. **`dependencies` 只放运行时真的 `import` 的包**（目前仅 `ajv`、`ajv-formats`）。前端与构建期依赖一律放 `devDependencies`，经 Vite 打进 `public/vendor/`。新增依赖需维护活跃、提供 ESM、许可证兼容 MIT，并在相关设计文档写明用途。
4. **宁可标「过期」，不可静默给错数**：数据源全部失败时保留上次成功值并标注过期与原因，不清空、不伪造。新增数据源必须走降级链并透出实际命中的源。
5. **产品范围**：`docs/product-feature-roadmap.md` §4「暂缓增加的功能」是明确不做的清单，不要顺手实现。

## 常用命令

```bash
npm start              # node server.mjs，单进程单端口 8787
npm run dev            # node --watch server.mjs
npm run dev:web        # Vite 开发服务器（5180），/api 代理到 8787
npm run build          # 构建 public/vendor/{macro-flow,geo-kit,ui-kit}.js
npm test               # Vitest 全量
npm run test:cov       # 覆盖率门禁（分层阈值）
npm run typecheck      # tsc --noEmit
npm run verify:build   # 校验 vendor 产物与源码一致（防「改了源码忘了构建」）
npm run test:browser   # headless Chrome 真实浏览器回归
npm run doctor         # 环境预检
npm run pack           # 发布包冒烟
npm run build:desktop  # 桌面版前置构建，之后 npm run tauri:build
```

Node 版本见 `.nvmrc`（24.x）。CI 依次跑：`doctor → test → test:cov → verify:build → pack → test:browser`，环境为 `DISABLE_BACKGROUND=1`、`TZ=Asia/Shanghai`。

## 目录与架构

```
server.mjs            薄入口：读配置、装配、监听、信号处理（不放业务）
src/server/
  config.js paths.js  环境变量与仓库路径的唯一来源（数据目录认 KANBAN_DATA_DIR）
  app.js routes/      路由表
  providers/          上游源（新浪 / 东财 / CNBC / CBOE / FRED / Binance / LLM…），可注入 fetcher、支持录制回放
  db/                 SQLite、日线缓存、快照、事件归档、迁移
  domain/             纯逻辑：市场时段/新鲜度、分时护栏、告警、解释、价差…
  stats/              Pearson / Fisher CI / Newey-West / BH 校正
  services/           业务编排（*.service.js）
  jobs/ realtime/ observability/   后台任务、SSE、日志与健康检查
src/client/           浏览器原生 ES Module，零构建，由服务端直接映射 /src/client/**
  main.js router.js   启动与路由（视图 mount/unmount 生命周期）
  shared/             dom 引用、格式化与转义、store、bus、api、query-cache…
  views/              list / detail / events / map / macro / explanations …
  views/macro/        传导图谱（X6 + dagre），构建期子树 → public/vendor/macro-flow.js
  vendor/             geo-kit / ui-kit 构建入口
public/               index.html（含 import map 与样式加载顺序）、styles/、vendor/（产物）
src/contracts/        JSON Schema 契约（ajv 校验）
tests/                Vitest 用例与 fixtures（golden 金标准、录制快照）
tools/                doctor / pack / verify-build / browser-check / backup / layout-lab
```

### 分层纪律（已由 `tests/services.test.js`、`tests/db.test.js` 断言）

- 依赖方向：`services → domain / db / providers / stats`；`db/` 不得反向依赖上层，阈值等业务参数由调用方传入。
- 服务之间同层依赖保持单向无环，新增同层边先确认不会成环。
- 跨层用到的符号必须显式 import——漏 import 常表现为「静默 `ok:false`」而不是报错。

### 前端纪律（已由 `tests/client-modules.test.js`、`tests/html-template.test.js` 断言）

- `public/app.js` 只能是一行转发。
- 页面骨架元素只在 `shared/dom.js` 里 `getElementById`。
- 只有 `router.js` 监听 `hashchange`；每个视图实现 `mount()` / `unmount()`，`unmount` 必须停掉自己的定时器、释放画布/观察者。
- 跨视图共享的可变状态只挂在 `store` 上，不在视图模块里另起顶层 `let`。
- 浏览器侧第三方库只通过裸模块名 `geo-kit` / `ui-kit` 引入（浏览器靠 `index.html` 的 import map，Node/Vitest 靠 `vite.config.js` 的 alias）。d3 系必须从 `geo-kit` 转出，不在业务代码直接 import。
- 拼 HTML 用 `shared/format.js` 的 `html\`\`` 标签模板（默认转义）；需要原样插入时用 `raw()`，且受白名单与棘轮约束。链接用 `attrHref` / `safeHref`。
- 样式：设计变量集中在 `public/styles/tokens.css`；样式分片的加载顺序即级联顺序，调整顺序前先确认选择器不相交。主题与涨跌配色通过 `data-theme` / `data-color-scheme` 切换（默认红涨绿跌，另有国际惯例与色盲友好方案），不要在组件里写死涨跌颜色。

### 构建产物

修改以下任一源码后必须执行 `npm run build`，并把 `public/vendor/` 的变化一起提交：
`src/client/views/macro/**`、`src/client/vendor/geo-kit.js`、`src/client/vendor/ui-kit.js`。

## 金融与数据口径（易错点）

- 收益率用**对数收益率**；利率类（`kind === 'rate'`，如美债 10Y）用百分点差，与价格类同轴比较时按久期折算。
- 时间按**交易所本地时区**处理，新鲜度按市场开闭市分级（`gradeFreshness`），不要用统一阈值。
- 跨时区资产比较注意 T+0 / T+1 对齐；周频聚合用 ISO 周、标签取周一。
- 期货价不得污染现货分时（基差护栏）；快照写入有跳变护栏（`MOVE_SUSPECT_PCT`，两次确认才换挡）。
- 统计显著性必须经 BH 校正，不要只报朴素 p 值。
- 事件等级是字符串 `high|mid|low`，地图 `level: 1..3` 是另一套词汇，不要混用。

## 测试规范

- 测试**永远不碰仓库的 `data/`**：每个 worker 使用独立临时目录（`tests/setup-per-worker.mjs`）。新测试需要数据库时用 `:memory:` 或沿用该机制。
- 测试不访问真实网络：上游用注入 fetcher 或 `providers/replay` 录制回放；起服务的测试带 `DISABLE_BACKGROUND=1`。
- 覆盖率阈值在 `vite.config.js` 中**只许升不许降**。不要为凑分支覆盖率写「喂畸形 payload、只跑不断言」的测试。
- 期望值手算或来自权威来源，不抄引擎输出。
- jsdom 局限：没有 `scrollTo` / `scrollIntoView` / `getScreenCTM`，需在原型上打补丁；`shared/dom.js` 在加载时抓住元素引用，用例里只清 `innerHTML`，不要替换 body 节点。
- 很多 bug 只在真实浏览器出现：改动视图、样式或挂载逻辑后跑 `npm run test:browser`。
- 修 bug 先补能复现的失败用例，再改实现。

## 交付前检查

1. `npm test` 通过；涉及覆盖率范围的改动跑 `npm run test:cov`。
2. 改了构建入口相关源码：`npm run build` 后 `npm run verify:build`。
3. 改了 UI：`npm run test:browser`，并在 1920 / 1280 / 390 宽度下确认无横向溢出、控制台无错误。
4. 不提交运行时数据（`data/kanban.db*`、`data/history.json`、`data/events/*.jsonl` 等）与 `.env`。

## 提交规范

Conventional Commits：`type(scope): 描述`，描述中英文均可。常用 type：`feat` / `fix` / `test` / `docs` / `chore` / `refactor`。
示例：`fix(events): 跨天归档步进`、`feat(providers): A 股数据源`。

## 安全与配置

- 凭据只走环境变量（模板见 `.env.example`），不写进代码或文档。
- LLM 网关：`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 三项齐全才启用；缺失时优雅跳过。默认不读取宿主机私有配置（`LLM_CONFIG_SOURCE=env`）。
- 静态文件服务只开放 `public/` 与 `/src/client/**`，修改 `serveStatic` 时保持路径穿越防护。

---

## UI/UX Design Requirements

Before creating, modifying, or refactoring any UI:

1. Read and follow `UI_DESIGN_GUIDELINES.md`.
2. Apply Progressive Disclosure by default.
3. Keep the default interface clean and task-focused.
4. Do not add explanatory text, helper cards, banners,
   badges, or onboarding hints unless they provide
   measurable usability value.
5. Prefer improving layout, labels, defaults, and
   interaction patterns over adding more instructions.
6. Before delivery, perform a UI clutter audit and
   remove unnecessary visual and textual elements.

Important:
Do not assume users are beginners.
Do not over-explain the interface.
The UI should communicate through its design,
not through excessive instructions.

### 本项目的 UI 落地要点

- 这是面向专业用户的数据密集型终端：允许较高信息密度，用间距、对齐和等宽数字建立层级，而不是卡片与徽章。
- 颜色只承担语义：涨跌、新鲜度（fresh / normal / delayed / stale）、告警。全部引用 `tokens.css` 变量。
- 状态透出优先于说明文字：数据源、行情时间、过期原因在需要时出现（悬停或异常态），正常态不常驻。
- 遵守 `prefers-reduced-motion`；动效仅用于状态变化（新数据闪烁、展开收起、画布过渡）。
