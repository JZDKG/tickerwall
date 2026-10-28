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

## 五、还没覆盖的

- 三个页面的浏览器端渲染**已用真实 Chrome 验证**（见上节），并据此修了三个 bug。
  仍未覆盖：交互路径（点击展开、切换窗口）在真实浏览器里的行为只有 jsdom 验证。
- 覆盖金币/原油的源当前滞后，接口会把状态标成 `stale`，这是预期行为而非故障。
