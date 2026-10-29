# 运行时自检（2026-10-29，第 61 轮）

服务器：`node server.mjs` → `127.0.0.1:8787`，真实上游数据，无 `KANBAN_NO_JOBS`。

## 一、新增接口的真实返回

| 接口 | 结果 | 关键字段 |
| --- | --- | --- |
| `/api/today-focus` | 200 | `day:"2026-10-29"`（北京）、`count:3`、`short:false`、`next.title:"美国非农就业报告"`、`eventsError:null`、`calendarError:null` |
| `/api/life-path?scenario=fuel-cost` | 200 | `ok:true`、五步链条、`headline:"国际原油价格本窗口下行"`、`needsLocalData:true` |
| `/api/expectations` | 200 | `total:12`、`pending:12`、`released:0`、`calendarCoverage.monthsFetched` 5 个月 |
| `/api/brief?assets=gold-intl&keys=gold-gap` | 200 | `hasWatch:true`、`sinceMs` 为默认回看窗口、`items[0].fingerprint` 已算 |

## 二、自检发现的一个线上 bug（已修）

`nextKeyRelease` **永远返回 null**，界面一直显示「日历里暂时没有」，而日历里其实有 16 条待发布。

原因：重要性有**两套词表** —— 日历服务给数字 `1..3`，`today-focus` 的 rank 表只认 `high/medium/low`。`rank[3]` 是 `undefined`，落到默认档 2，全部被门槛过滤。

单元测试没抓到，因为夹具是我自己按字符串档位编的。**这是「夹具跟着实现走」的典型后果。**

修法：`rankOf()` 同时接受数字与字符串；缺失或无法识别按低等级处理（不冒充重要）。
新增 5 条用例，其中三条直接用数字档位。

修后实测：`next` = 美国非农就业报告（206 小时后）。

## 三、静态资源与模块

| 路径 | 状态 |
| --- | --- |
| `/` | 200 |
| `/app.css` | 200 |
| `/app.js`（入口） | 200 |
| `/src/client/main.js` | 200 |
| `/src/client/views/today-focus.js` | 200 |
| `/src/client/shared/followups.js` | 200 |
| `/src/client/views/home-brief-wiring.js` | 200 |
| `/src/client/nav.js` | 200 |
| `/src/client/views/life-path.js` | 200 |

**注意**：客户端模块从 `/src/client/**` 提供，入口是 `public/app.js`，
而不是 `/client/**`。自检时按 `/client/main.js` 取会得到 404 —— 那不是故障，
是我一开始猜错了路径。这一条写在这里，免得下次又去查。

## 四、日志

`/tmp/k61b.log` 中 `error` 计数 0。

## 四之二、真实浏览器自检（Chrome 156 headless，`--dump-dom`）

用真实 Chrome 打开三个页面并 dump 最终 DOM。**这一步找到三个 bug，都是 jsdom 测试照不出来的**：

| # | 现象 | 原因 | 修法 |
| --- | --- | --- | --- |
| 1 | `#home-brief` 永远 `hidden=""` 且为空 | `refreshHomeBriefSafe()` 与 `scheduleHomeBrief()` **只定义了、没有任何人调用** | `main.js` 启动流程里补上调用，并加一条守卫测试（断言源码里有**调用**而不只是定义） |
| 2 | `#today-focus-slot` 一直空 | `hydrateTodayFocus()` 在 `loadEvents()` **之前**跑；后者重写 `eventsEl.innerHTML`，把刚填的槽位冲掉 | 改成 `loadEvents(true).then(() => hydrateTodayFocus())` |
| 3 | `#d-followups` 里显示成一串 `&lt;details…` 文本 | `followupsHTML` 返回**裸字符串**，嵌进 `html\`\`` 时被自动转义 | 改成用 `` html`` `` 拼、返回 SafeHtml；空面板返回空 SafeHtml |

修后复测：

| 页面 | 标记 | 结果 |
| --- | --- | --- |
| 首页 | `wb-card` / `exp-card` / `lp-card` | 各 1，`#home-brief` 无 `hidden` |
| 事件中心 | `tf-card` / `下一件关键发布` | 各 1，槽位有内容 |
| 详情 | `d-followups` / `fu-item` | 有内容，且不再是转义文本 |

**结论：这类「只定义没调用」「顺序被重建冲掉」「裸字符串被转义」的问题，
jsdom 单测结构上就抓不到 —— 必须开真浏览器。**

## 四之三、真实浏览器交互验证（部分完成）

用 Playwright 驱动 Chrome 点真实控件。**已完成**：

| 控件 | 结果 |
| --- | --- |
| 首页「选择关心的问题」`#wb-pick` | 点开后面板渲染出 **6 个真实问题**，标签文字正确（国内金为什么与国际金不同步 / 美元走强会影响我的换汇成本吗 / 油价会推高出行与物流成本吗 / 利率变化对金价意味着什么 / 现在是避险还是冒险 / 美股这波是普涨还是少数带动） |

这一条顺带证明了另外两件事：
- `refreshHomeBriefSafe` 启动时确实跑了（否则 `#wb-pick` 不会存在）；
- 选择面板不是静态占位，问题清单来自 `WATCH_QUESTIONS`。

**未完成**：详情页的渠道展开 / 变化记录、事件中心的分组折叠 / 版本面板，
在真实浏览器里的点击验证被两次超时打断（REA 场景工具在有多个 Chrome
实例时不稳定）。这几条目前只有 jsdom 覆盖。

> 这个缺口要说清楚：**jsdom 覆盖 ≠ 真实浏览器行为**。本轮前面的三个 bug 就是证据。

## 四之四、第五轮真实浏览器自检：一个已修 + 一个未修

用 Node 内置 WebSocket 直连 CDP（`--remote-debugging-port=9333`）驱动真实 Chrome，
逐页读取真实 DOM 与网络耗时。

### 已修：解释卡整块被转义成文本（**我自己引入的回归**）

`#d-explain` 的 innerHTML 是一串 `&lt;section class="d-block explain-card"…`。
原因：第 58 轮把 `host.innerHTML = renderExplainCard(...)` 改成了
`html\`${renderExplainCard(...)}…\`` —— 裸字符串被自动转义。
`detail.js` 本来就在 `raw()` 白名单里，已改为 `raw(String(renderExplainCard(...)))`。
修后复测：`#d-explain` 里是真实 `<section>` 节点。

**这是本轮最有价值的一条**：一个为了「安全」做的改动，把一个一直正常的功能
整块变成了不可读文本，而 38 条 jsdom 测试全绿。

### 未修（记录在案）：详情页解释卡停在 `data-phase="loading"`

复现：`/` 加载后 `location.hash = '#/d/gold-intl'`，等 14 秒。

| 观测 | 值 |
| --- | --- |
| `/api/explanations?asset=gold-intl&window=session` | 200，15.9 KB，2 ms，6 条机制 |
| 浏览器里该请求 | 成功（Performance 条目可见），且出现 **两次** |
| `#d-explain` 的 `data-phase` | 一直 `loading` |
| 页面异常 | 0 |

接口与网络都正常，所以是**写回状态的路径**没走通（`hydrateExplanation` 的
序号保护、或 `applyResponse` 之后的 `repaintExplainCard` 被后续重绘覆盖）。
我做过一次基于「序号被 double-invoke 撞掉」的修改，但新加的用例立刻证明
那个假设不成立（第二次调用返回 null 的原因不是序号），已**回滚**，不留猜测性改动。

#### 打点结果（临时 `__KANBAN_DEBUG` 日志，已移除）

```
[hydrate] start  curSeq 0            ← 状态是新建的（seq=0）
[hydrate] after-fetch  nextSeq 1, phase ready, hasExp true
[hydrate] applied  phase ready
[repaint] ready  17027               ← 卡片确实被画成 ready
[repaint] loading 3212               ← 又被画回 loading（3212 = 初始骨架长度）
[hydrate] start  curSeq 0            ← 状态**又被新建了一次**（seq 回到 0）
[unmount] / [mount] gold-intl
```

结论（已收敛到两个函数）：
1. **取数与写回都成功** —— `applied phase ready` 与 `repaint ready 17027` 都出现了；
2. 紧接着出现 `repaint loading 3212`，说明 `explainState` 在这之间被**重新创建**
   （phase 回 loading、seq 回 0）；
3. 整个仓库里只有两处能造出新状态：`ensureExplainState()`（`!explainState` 时）
   与 `mountDetail()` / `unmountDetail()` 里的 `explainState = null`。
   所以是**路由在这一页上发生了 mount/unmount 抖动**，每次抖动把状态清掉、
   再被 `renderDetail` 末尾的 `repaintExplainCard()` 画回骨架。

#### 第 68 轮追加：抓到一次真实 churn，但它不是唯一原因

打点（含 `new Error().stack` 取调用点）拿到的栈：

```
[unmount] at route (router.js:82)      ← route() 确实重复跑了一遍
[mount] gold-intl detailState  phase   ← 重挂，explainState 已是空
[ensure] gold-intl existing  phase     ← 新建状态
[repaint] ready                        ← 解释其实取到了
[repaint] loading                      ← 又画回骨架
```

第一件事据此修掉了：`route()` 现在带**幂等键**（name + arg），同视图同参数
不再重挂；`mounted` 从「只给测试看的变量」变成真正的幂等键。
新增 3 条用例（同 hash 不重挂 / 换资产要重挂 / 换页要 unmount），
并把一条**旧契约用例改向**：原来断言「同一路由再进也要重挂一次」，
那条契约正是本次故障的成因，改为断言不重挂。

第二件事没修掉：修完 `route()` 后真实浏览器里 `data-phase` 仍是 `loading`，
说明还有第二个来源在 `ready` 之后把卡片画回骨架（`loading` 的 repaint 里
有一次调用点取不到，栈深度不足）。这一条仍是**未修**。

结论：`route()` 幂等是一个独立的、正确的修复（重挂会丢视图状态，这对
map/events/macro 同样成立），但它不是这个 bug 的完整解。

#### 第 69 轮：**已修**。根因是「取历史」覆盖了「取解释」

把 repaint 的**完整栈**打出来，一行就定位了：

```
at repaintExplainCard (detail.js:1267)
at hydrateHistory     (detail.js:1225)
```

`hydrateHistory` 原来是：

```js
const next = await refreshHistory(explainState);   // next 来自 await 之前捕获的旧状态
explainState = { ...next, ... };                   // ← 把 loading 整体盖回来
```

`refreshHistory` 只是 `{...state, history}`，而它手里的 `state` 是
**await 之前**那个 phase=loading 的对象。于是并发的「取解释」刚写好的
ready 被这个次要动作覆盖回 loading。修法：只合并 `history` / `historyStatus`，
不整体替换状态。

修后真实浏览器复测（同一台 Chrome）：

| 观测 | 结果 |
| --- | --- |
| `data-phase` | **ready（2 秒内）** |
| 渠道按钮 | 6 个 |
| 分层标签 | `事实` / `本次候选解释` / `一般机制` ×6 |
| 渠道展开 | `aria-expanded` false → true，展开体可见 |
| 变化记录 | 点开 `open=1`；再点 `open=0` 且清空 |
| 追问展开 | `.fu-item` open=true |
| 页面异常 | 0 |

#### 第 79 轮：终验时又抓到一个（重绘把「今天重点」清空）

终验用 `--dump-dom` 看事件中心，`#today-focus-slot` 里是**空的**，而
`/api/today-focus` 明明返回 `count=3 / next=美国非农就业报告`。

原因和详情页那次同源：`renderEvents()` 整块重建 `innerHTML`，槽位跟着被清掉。
第一次渲染后 `hydrateTodayFocus()` 填过一次，但 30 秒定时刷新**或 LLM 重试**
再渲染一次就把顶部清空了。

修法：把最近一次 payload 缓存在模块里，重绘末尾 `paintTodayFocus()` 用缓存
补回来（没有缓存才发请求）。复验：槽位里 `data-state="ok" data-count="3"`。

#### 第 80 轮：审阅意见复核（4 条，全部成立，全部已修）

外部审阅指出四处与「已完成」声明冲突的事实，逐条复核后**全部成立**：

| # | 问题 | 我的原声明 | 事实 | 修法 |
| --- | --- | --- | --- | --- |
| 1 | `main.js:108` 行情首屏仍直连 `fetch`；另有 5 处 `fetchImpl ?? fetch` 的「伪消除」（events ×2、explanations/state ×2、history ×2） | 「`src/client` 里 `fetch(` 出现次数为 0」 | `grep 'fetch('` 搜不到，但它们**全部绕过** `shared/api.js`：行情、解释卡、版本比对、今天重点都没享受到超时/取消/去重 | 行情改走 `api.get`；5 处收进新的 `shared/fetch-json.js`（注入走 `fetchImpl`，生产走 `api.get`）。现在 `src/client` 除 `shared/api.js` 与 `fetch-json.js` 外无 `fetch(` |
| 2 | `history-backfill` **没有任何入队点** | 「队列接了第二条生产线」 | 全仓只有处理器 + 单测，`buildDefaultJobs()` 从不 enqueue 它 | 调度表新增 `history-backfill-schedule`（6 小时一轮、日频后触发、去重键 `history:资产:日期`）；用例改为真的 `claimNext()` 出任务 |
| 3 | 隔离审计两条正则太松 | 「`env: {...process.env}` 直接失败」「不带参数开库即失败」 | 正则只匹配单行空展开，而三个测试恰好是「先展开再覆盖」→ 全部漏判；`:memory:` 是**整篇文件**放行，一文件 20 个用例只要 1 个用内存库就全过 | 正则改跨行（`[\s\S]{0,400}?`）；改为**逐行**判定；三个测试改用白名单 `tests/helpers/child-env.js`（只留 PATH/HOME/TZ/LANG/TMPDIR），并新增两条审计：必须用 `childEnv()`、白名单不得含凭据键 |
| 4 | `tools/pack.mjs` 冒烟设的是 `DATA_DIR` | 冒烟通过 | `paths.js` 认的是 **`KANBAN_DATA_DIR`**；之前能过纯属 `cwd` 恰好是临时目录 | 改成 `KANBAN_DATA_DIR`，并确认工作区没有残留 `data-smoke/` |

审阅还纠正了我对分支覆盖的**一处错误说法**：我写「剩下的基本都是 binary-expr 默认侧」，
实测未覆盖里 `if` 378 + `cond-expr` 371 = **749 条真实条件流**（占 46%）。已改。

### 第 81 轮：真实浏览器截图走查 —— 5 个只有页面才会暴露的问题

用 CDP 取 DOM / 计算样式 / 几何坐标 + 截图，发现 5 处：

| # | 现象 | 根因 | 严重度 |
| --- | --- | --- | --- |
| 1 | 首屏三张问题卡**全是黄金的克隆**：跌幅都 0.14%，来源快照 id 都 `exp_gold-intl_session_…` | `fetch-json.js` 生产分支只用了 `params`，而调用方传的是 `query` → 请求退化成无参数的 `GET /api/explanations`，服务端回落 `gold-intl`，再叠加 api 的并发合并 | **严重（我自己在上一轮修的引入）** |
| 2 | 首屏有两个都在说「先看问题」的区块（`#questions` 447px + `#home-brief` 里又一份「今天先看这三个问题」） | 第 77 轮我把问题区加进 home-brief，与既有 `#questions` 重复 | 高（信息冗余） |
| 3 | 行情主列表在 Y≈1461，一屏看不到任何报价 | 上面两块叠加（nav 111 + questions 447 + home-brief 836） | 高（看板核心场景） |
| 4 | 任务导航「裸奔」：没有间距、没有胶囊背景、没有激活下划线 | `public/index.html` 引了 12 个样式分片，**唯独没引 `app.css`**，而 `.tasks/.task-group/.task-label` 全写在那里 | 高（导航不可读） |
| 5 | `<nav>` 用 `</div>` 闭合 | 手写标签笔误 | 中（浏览器会自行修复，但嵌套已错） |

修法与验证：

1. `fetch-json.js` 增加 `paramsOf(query, params)`，**`query` 参与生产路径**；补 3 条只在生产分支生效的用例。
   浏览器复验：原油 1.79% / 黄金 0.14% / 美元指数 0.09%，三个快照 id 各不相同。
2. 删掉 `home-brief` 里的问题清单（连同 `topQuestionsHTML` 与接线），问题区只保留 `#questions`（最多三张卡，`max: 3`）。
3. 首页顺序改为 **问题 → 行情 → 简报**：`#rows` 从 Y≈1461 提到 **Y≈322**，800px 视口能看到 4 行行情。
4. 补 `<link rel="stylesheet" href="./app.css">`；状态簇（更新于/倒计时/刷新）打包成 `.tasks-status`，`margin-left:auto` 靠右，窄屏整组换行而不是拆散。
5. `<nav>` 改为 `</nav>`。

新增三类静态守卫（不需要浏览器）：
`tests/index-html-integrity.test.js`（每个 `link[rel=stylesheet]` 的目标文件必须存在、`app.css` 必须被引且确实含 `.tasks`、`nav/div/section/main` 开闭数量一致、区块顺序）、
`tests/fetch-json.test.js`（`query` 在生产路径生效）、
`tests/explanation-params-production.test.js`（解释取数的生产 URL 必须带 asset/window，两个资产不能同 URL）。

### 第 82 轮：两处收尾（折叠态 + 浏览器回归进 CI）

一、`home-brief` 改折叠态，位置回到行情之前
   第 81 轮把它挪到行情之后（Y≈3438）是为了让行情进首屏，但那让 2.3 / 2.4 / 2.6
   三项功能实际上「沉底失效」。折中：`<details>` 摘要一行约 40px 常驻，
   完整内容点开才有。截图核对：收起条在 3 张问题卡下方，行情首行 Y≈380，
   800px 视口能看到 3 行报价。
   摘要文案规则：没选关注项时写「还没选关注项」，不写「暂无更新」——
   `NO_WATCH ≠ 暂无重要更新`（产品 §2.3 的约束）。

二、`tools/browser-check.mjs` 入库并接进 CI
   本项目修掉的 13 个 bug 里 9 个只在真实浏览器出现，而 CDP 脚本此前散在 `/tmp`
   —— 意味着改一次代码就可能无声回归。现在自闭环：隔离数据目录起 `server.mjs`
   → headless Chrome → Node 内置 WebSocket 跑 CDP → 14 条断言 → 清理。
   断言刻意对准「出过 bug 的点」：未捕获异常 / 快照不克隆 / 涨跌幅各异 /
   行情进首屏 / 导航样式生效（app.css）/ 今天重点非空 / 解释卡 ready / 四层标注。
   找不到 Chrome 时**显式失败**（不静默跳过）；另有 19 条静态守卫
   （`tests/browser-check-tool.test.js`）钉住这一点与「必须用隔离目录」。

三、修掉脚本自身的**时序竞态**（审阅压测发现）
   脚本原来用固定 `sleep(6000)` / `sleep(8000)` 等页面。干净数据目录要冷拉上游
   日历与指标，耗时随网络波动，偶尔踩在临界线上 —— 表现为「0 张卡 / 槽位为空」
   的假失败，再跑一次又全绿。这是典型的 Flaky：**在 CI 上比在本地更容易出现**。
   改成带超时的轮询器（默认 15s 上限、250ms 间隔，三处页面断言各自等自己的条件：
   行情行数 / 问题卡数 / 今天重点卡 / 解释卡 ready）。快的时候更快，慢的时候
   也只是多等一会，不会误判。连跑三次 14/14，且加了守卫禁止「6/8 秒魔法数字」
   回到脚本里。

小结：**「填一次」不够，凡是整块重建的容器，都要回答「重建之后谁负责补回来」**。

更重要的教训：**注入路径全绿 ≠ 生产路径正确**。这一轮第 1 条，所有单元测试都走 `fetchImpl`，参数丢失在生产分支，因此 2876 条测试一条都挡不住 —— 只有真实浏览器会暴露。
详情页（取历史覆盖取解释）、事件中心（重绘清槽位）是同一个模式的两个实例。

变化记录面板显示「变化记录暂时不可用」是**正确行为**：库里只有一版，
没有可比对象；接口本身有 `before`（说明有更早一版），面板文案按
「不可比」处理而不是留空白。

### 顺带确认的正常项

| 页面 | 结果 |
| --- | --- |
| 首页 `#home-brief` | `hidden=false`，3 个块 |
| 事件中心 | 170 条事件；顶部「今天重点 三件」含排序依据；渲染耗时约 5–7 秒（日历接口慢，不是坏） |

## 五、还没覆盖的

- 三个页面的浏览器端渲染**已用真实 Chrome 验证**（见上节），并据此修了三个 bug。
  仍未覆盖：交互路径（点击展开、切换窗口）在真实浏览器里的行为只有 jsdom 验证。
- 覆盖金币/原油的源当前滞后，接口会把状态标成 `stale`，这是预期行为而非故障。
