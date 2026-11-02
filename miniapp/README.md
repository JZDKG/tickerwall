# 市场看板 · 微信小程序版

web 端看板（`/#/`）的移动版本：同一套深色终端配色、同一套「涨红跌绿 + 等宽数字」的信息层级，
UI 用 **TDesign 微信小程序组件库**，接口走 **云开发（云函数 + 定时预热）**。

```
miniapp/
├── project.config.json        开发者工具工程配置（appid / 云函数目录 / npm 构建规则）
├── package.json               tdesign-miniprogram 依赖（产物已内置到 miniprogram_npm）
├── miniprogram/               小程序代码
│   ├── app.js / app.json / app.wxss / config.js
│   ├── utils/                 api（行情三层通道）· cloud（云服务客户端）· sync（自选同步/远程配置）
│   │                          format · analysis（机制观测/复盘）· store · mock
│   ├── components/            quote-card（报价卡）· spark（迷你走势）· trend-chart（Canvas 折线）
│   │                          login-panel（邮箱验证码登录）
│   ├── custom-tab-bar/        底部导航
│   ├── pages/                 market · events · macro · watch · detail · recap
│   └── miniprogram_npm/       TDesign 组件产物（可直接运行，无需先「构建 npm」）
└── cloudfunctions/api/        云函数：quotes / detail / events
```

## 快速开始

1. **换 AppID**：`project.config.json` 里的 `appid` 当前是 `wx1d3d340126d06c18`（账号下的测试号），
   换成你自己的小程序 AppID。
2. **打开工程**：开发者工具 → 导入项目 → 选择 `miniapp/` 目录。
   `miniprogram_npm` 里的 TDesign 产物已随仓库提供，**不点「构建 npm」也能直接跑**；
   如果你改了 `package.json` 里的版本，再点一次「工具 → 构建 npm」。
3. **部署云函数**：右键 `cloudfunctions/api` → 「上传并部署：云端安装依赖」。
   云环境 ID 在 `miniprogram/config.js` 的 `envId` 里，默认 `tianfu-d4g8w3mb4380b4ae5`。
4. （可选）**保持缓存热**：给 `api` 加一个 1 分钟的定时触发器（云开发控制台 → 云函数 → 定时触发器），
   这样首屏不会每次都走冷启动去抓上游。

## 数据链路：三层，按可用性降级

| 层 | 触发条件 | 用途 |
| --- | --- | --- |
| `cloud` | 云函数可用 | 生产环境正路，`wx.cloud.callFunction({ name: 'api' })` |
| `local` | 本机跑着 web 版（`node server.mjs`） | 开发期省掉每次改后端都重新部署云函数 |
| `mock` | 前两层都不可达 | 内置快照，页面顶部显示 **「演示数据」**，不冒充实时 |

失败通道会记 60 秒冷却，避免每轮轮询都先撞一次必然失败的路。见 `utils/api.js`。

`quotes` 的返回契约与 web 端 `GET /api/quotes` **完全一致**（`items[].price / changePct /
marketStatus / freshness / extras / history`），所以同一份渲染代码可以吃三种数据源。

## 云函数接口

单函数多路由：`{ path, params }`，返回值恒为 `{ ok, ...data }`。

| path | params | 返回要点 |
| --- | --- | --- |
| `quotes` | `{ force? }` | 23 个标的：价格/涨跌/高低/行情时间/交易时段/新鲜度/卡内 chip/分时走势 |
| `detail` | `{ id }` | 日线（最近 250 根）+ 分时（≤240 点）+ 实时报价 |
| `events` | `{ limit? }` | 金十 / 新浪 7×24 / 华尔街见闻 聚合 + 主题打标 + 重要度分级 |

上游策略（`lib/sources.js`）：**批量优先** —— 新浪一次 `list=` 拿全部新浪源，东财 `ulist.np`
一次拿全部 secid，腾讯一次 `q=` 兜底；分时与日线才逐个取。单点失败不影响整块返回，
全源失败时用 30 分钟内的「上一次成功值」顶着并标 `stale`。

### 走势图为什么不能像 web 那样白拿

web 卡片右侧的小走势图是服务端内存里的**环形缓冲**：每次轮询往里记一笔，越跑越长，
不额外打上游。云函数是无状态容器，冷启动就是空的，只能去抓真分时 —— 而「N 个标的 =
N 个请求」既慢又容易被上游限流。所以这里是三层：

| 层 | 什么时候用 | 代价 |
| --- | --- | --- |
| 分时缓存 | 开市 3 分钟 / 收盘 24 小时内抓过 | 0 |
| 真分时（东财 trends2 → 腾讯分钟线） | 缓存过期，且轮到了 | 每次 1 个请求，≤1.8s |
| 自采环 | 前两者都没有 | 0，但只有最近的报价点 |

**贵的那部分只放在定时预热里**：`quotes` 每轮最多补 3 个、2.5 秒截止；定时触发器
（每分钟，`warm-quotes`）那一轮放宽到 23 个、25 秒，抓到的写进缓存，之后的用户请求直接命中。
轮转起点每次前移，避免排在末尾的标的永远轮不到。

日线同理走「东财 kline → 腾讯 K 线」；东财只认一部分 secid（A 股、商品、美债、标普/纳指
有，恒指和多数全球指数返回 `rc=102`），港股那块由腾讯补上。

已知取不到分时的标的：VIX（CBOE 只有日线）、离岸人民币、BTC（币安/OKX 在云出口不可达，
只有环）、NIFTY（东财无有效 secid）；其中 NIFTY 连报价都没有，卡片会显示取数失败。

> 实测坑位（代码里都有注释）：云函数出口必须 `family: 4` 锁 IPv4，否则部分行情域名
> 会「连上即被挂断」；东财 `push2.eastmoney.com` 在云出口常被 reset，`82.push2` / `48.push2`
> 却正常，所以入口列表有优先级并会记住上次成功的那个。

## 页面

| 页面 | 对应 web | 说明 |
| --- | --- | --- |
| 行情 `market` | 首屏列表 | 涨跌分布条 + 分类筛选（全部/核心/商品/股指/外汇/加密）+ 报价卡，15s 轮询 |
| 事件 `events` | `#/events` | 今日重点 3 条 + 时间轴事件流（重点已在顶部出现过的不再重复） |
| 关联 `macro` | `#/macro` | 9 条传导机制 + 当日观测（一致/相反/无法检验），点开看机制、条件、反例 |
| 自选 `watch` | 我的关注 | 本机存储 + 登录后云端同步，编辑态移除，底部面板搜索添加 |
| 详情 `detail` | `#/d/:id` | 分时/日线切换（Canvas 2D）+ 今日四价 + 区间表现 + 风险 + 同类标的 |
| 复盘 `recap` | 隔夜复盘 | 按市场分组的当日涨跌横向对比 |

**未移植**：全球地图（`#/map`）与传导图谱（X6 画布）。两者都依赖桌面级画布交互，
在手机上缩放/拖拽的体验不如重做信息架构，这一版先不硬搬。

## 设计一致性

配色与排版直接取自 web 的 `public/styles/tokens.css`，只把 px 换成 rpx（1px = 2rpx）：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--bg` | `#080b10` | 页面底色（含两团径向光） |
| `--panel` / `--panel-2` | `rgba(255,255,255,.028)` / `.05` | 卡片 / hover |
| `--line` | `rgba(255,255,255,.075)` | 分割线、卡片描边 |
| `--text` / `--muted` / `--muted-2` | `#e8edf5` / `#7c8899` / `#5a6474` | 三级文字 |
| `--up` / `--down` / `--flat` | `#f5455c` / `#0ecb81` / `#8b97a8` | **涨红跌绿**（中国市场约定，勿反） |

数字一律等宽（`--mono` + `tabular-nums`），涨跌幅用方向色的 14% 底做药丸 —— 与 web 的
`.row .pct` 同一套规则。

TDesign 的使用边界：结构性/交互性组件（按钮、搜索、弹窗、空态、Loading、图标）用 TDesign，
并用 CSS 变量把主色对齐到 `#6ea8fe`；数据密度最高的报价卡与走势图自己写 ——
组件库没有「终端风报价行」，硬套会既不像 web 也不像 TDesign。

## 云服务（WorkBuddy Cloud Service）

应用 `市场看板`（`wbapp_bCqtHLwCYTJNGfcRh5f4AZ`）已开通云服务，用于**用户数据与远程配置**；
行情数据仍走已有的 CloudBase 云函数（那是另一条取数链路，见上一节「云函数接口」）。

| 模块 | 用在哪 | 代码 |
| --- | --- | --- |
| 数据库 | 自选跨设备同步、页脚文案远程配置 | `utils/sync.js` |
| 认证 | 邮箱验证码登录/注册（只用于同步，不是使用门槛） | `components/login-panel/` |
| LLM | 事件页「AI 摘要」：把今日重点快讯压成一段话 | `utils/llm.js` + `pages/events/` |
| 存储 | 未接入（当前没有文件上传需求） | — |

### AI 摘要的行为

- **模型只做归纳，不参与选材**：喂进去的是「按重要度排序的前 6 条标题」，
  正文、链接、用户数据都不发。提示词明确禁止补数字、编因果、给买卖建议。
- **按天缓存**：事件流每 45 秒就变，跟着变会让模型一天被调几百次；摘要一天一份，
  右上角「重写」可按需重生成，结果覆盖当天缓存。
- **不经过云函数**：微信云开发给新函数的超时只有 3 秒，模型一次要 3~10 秒。
  这里直接用 SDK 的 `cloud.llm`（keyless，不需要用户自带 API Key），流式吐字，
  80ms 合并一次 `setData`。
- **模型只能走 SDK 调用（勿换成 HTTP 网关）**：`deepseek-v4.1-flash` 属于**小程序成长计划**，
  官方约束是只能经小程序 SDK / 云开发 SDK 调用。所以：
  - 不要改成 `https://<env>.api.tcloudbasegateway.com/v1/ai/...` + API Key 的直连 —— 该分组下
    不认这个模型名（会报模型不存在），而且 Key 是服务端凭据，打进包里等于公开泄露；
  - 也不要挪进云函数用 Node SDK 调 —— 3 秒超时先杀掉它。
  - 换模型时先 `cloud.llm.models.list()` 看清单，再改 `PREFERRED_MODELS`，不要凭记忆写 id。
- **失败不编造**：模型不可用/超额时只在卡片上显示「生成失败」和原因 + 重试，
  不会退回到模板文案冒充 AI 输出；快照（演示数据）模式下整块隐藏。
- **外文快讯翻译**（`utils/translate.js`）：三源里偶尔混进的英文条目
  （华尔街见闻 global channel、金十海外快讯）默认原样展示；列表里出现外文时，
  AI 摘要卡下方出现「N 条非中文快讯 · 译成中文」提示条，点一次**批量**翻译
  （≤20 条/次），卡片改为显示中文译文 + 灰色英文原文 + 「AI 译」角标。
  - 语种判定纯本地：至少 3 个小写英文单词且汉字占比 < 15%（`CPI GDP FOMC`、
    SHIBOR 数字句都不会误判）；
  - 译文按标题哈希缓存（`trans:v1`，上限 400 条），45 秒刷新、重进页面零调用；
  - 模型输出按索引对齐，条数对不上只取能对齐的前缀 —— 宁可少翻，不能把 A 的
    译文贴到 B 头上；原文永远保留，译文只是叠加上去。
- 模型：优先 `deepseek-v4.1-flash`（快、便宜），降级链为 `hy3` → `hy4-preview` → `auto` ——
  前三个都在成长计划免费额度内（官方文档 ai-inspire-plan-guide），别把额度外的模型
  （如 glm-5.3-flash）插进降级链，那会走套餐扣费。模型列表为空时明确报错而不是硬编码。
  - 候选链整条缓存在 `llm:models:v2`；遇到「模型不存在」或 429 限流（成长计划额度是
    账号级限流，换模型常能直接过）会自动换下一个模型重试一次，并把页面上已吐的
    半截文本清掉；两次都失败才报错，错误文案会翻译成「已达频率/额度上限」而不是裸的
    HTTP 429。旧缓存键 `llm:model:v1` 已废弃。

### 表结构（数据库 `public` schema）

```sql
-- 一行一个标的；owner_id 由 DEFAULT auth.uid() 填，前端从不发送
CREATE TABLE watchlist_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT auth.uid(),
  instrument_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, instrument_id)          -- 同一标的不会重复入表
);

-- 公共只读的文案配置：改免责声明不用重新发版
CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ);
```

RLS 都开着：`watchlist_items` 只有 3 条本人策略（SELECT/INSERT/DELETE 均带
`owner_id = auth.uid()`），`app_config` 只有 `FOR SELECT USING (true)` —— 客户端写不进去。

### 登录与同步的行为

- **不登录也能用**：自选写本机（`wx.storage`），行情/事件/关联全都不受影响。
- **登录后**：以云端为准（云端为空则把本地推上去），之后每次增删先改本地、再写云端；
  写失败会在自选页顶部状态条上如实显示「同步失败：…」并给重试，不假装已同步。
- **换设备 / 恢复**：进自选页下拉刷新即从云端拉回。两种例外不拉、改为重推，避免丢数据 ——
  上一次推送失败（本地还有没上云的改动）、云端为空但本地有货（新账号，拉会清空自选）。
- 退出登录后自选仍留在本机，只是不再同步。

### 云环境与超时（两个必查项）

**环境必须属于本小程序的 AppID**

`wx.cloud.callFunction` 只认「属于当前 AppID」的环境。当前对应关系：

| 项 | 值 |
| --- | --- |
| 小程序 AppID | `wx9db9849343b6e407`（程序猿哟） |
| 云环境 | `cloud1-d7g244bj346acc1ac`（别名 cloud1） |
| 云函数 | `api`（已部署，含 quotes / detail / events 三路由） |

换成别的 AppID 时，要么用该 AppID 在开发者工具「云开发」里新建环境并改
`miniprogram/config.js` 的 `envId`，要么在云开发控制台把 AppID 关联到现有环境。
弄错会报 `-501000 Environment not found`，小程序降到本机服务、再降到内置快照 ——
表现就是「有价格但没有分时」，顶部会标记「演示数据 · 云环境未绑定该 AppID」。

**云函数超时要改到 60 秒**

微信云开发给新函数的默认超时是 **3 秒**。这个函数要并发打三四个上游再组装 23 个标的，
3 秒只够跑完报价——分时只能在后续几轮里一点点补，冷启动还可能直接超时。

`cloudfunctions/api/config.json` 里已声明 `"timeout": 60`，但**通过 CLI/MCP 部署时不会
被应用**，需要在云开发控制台 → 云函数 → api → 配置 → 超时时间改成 60 秒（改一次即可，
之后重新部署不会再变回去）。

改完之后：定时预热那一轮（每分钟）能一次把 23 个标的的真分时抓满，用户请求直接命中缓存。

**请求域名白名单**

小程序真机不能请求白名单外域名：需要把 `https://mp-api.app.workbuddy.host` 加进
**开发管理 → 开发设置 → 服务器域名 → request 合法域名**（开发者工具里已关闭域名校验，
所以本地预览不受影响）。托管发布流程会处理这一步；如果你用自己的 AppID 手动上传，需要自己加。

## 已知限制

- 上游行情源在国内云出口会间歇性限流（东财/币安尤甚），失败时该行为「取数失败」或显示上一次
  成功值（带 `stale` 标记），不会静默造数。
- 未登录时自选只存在本机，换设备不同步（登录后可同步）。
- 事件正文的「原文」是复制链接（小程序不能直接打开任意外链）。
