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

下一步该做的：在 `hydrateExplanation` 里临时打点（seq、phase、写入前后的
`#d-explain` 长度），定位是「没写回」还是「写回后被覆盖」。

### 顺带确认的正常项

| 页面 | 结果 |
| --- | --- |
| 首页 `#home-brief` | `hidden=false`，3 个块 |
| 事件中心 | 170 条事件；顶部「今天重点 三件」含排序依据；渲染耗时约 5–7 秒（日历接口慢，不是坏） |

## 五、还没覆盖的

- 三个页面的浏览器端渲染**已用真实 Chrome 验证**（见上节），并据此修了三个 bug。
  仍未覆盖：交互路径（点击展开、切换窗口）在真实浏览器里的行为只有 jsdom 验证。
- 覆盖金币/原油的源当前滞后，接口会把状态标成 `stale`，这是预期行为而非故障。
