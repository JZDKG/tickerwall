# 交接：下一段工作从哪里开始

> 写于 2026-10-29，覆盖率专项收尾时。这份文件只讲「接下来做什么、为什么」，
> 不讲已完成的历史——历史在 `engineering-open-source-benchmark-and-roadmap.md`
> §13 与 git log 里。

## 一、当前实测状态（可复核）

```
npm test            → 100 文件 / 2306 用例全绿
npm run test:cov    → 92.77 语句 / 81.59 分支 / 91.86 函数 / 94.74 行
HEAD                → 1cbeb97
```

门槛（`vite.config.js` 里是 raise-only，只许往上改）已远越：

| 范围 | 门槛 | 实测 |
| --- | --- | --- |
| `src/server/**` | 92 / 80 / 93 / 94 | 已通过 |
| `src/client/shared/**` | 97 / 97 / 99 / 99 | 99.5 / 97.1 / 100 / 100 |
| `src/client/views/**` | 50 / 46 / 50 / 49 | 86.5 / 76.2 / 81.2 / 89.1 |

## 二、覆盖率：95% 这个目标该怎么理解

**可达成**：行 / 语句 / 函数 → 95。当前行 94.74，差 0.26 个点。

**不可达成（口径所致）**：分支 95。归因见
`engineering-open-source-benchmark-and-roadmap.md` §13.3，摘要：

```
未覆盖 1740 条分支
  if            456
  cond-expr     415
  default-arg     3   ← 以上 874 条可测，补齐约 90.7%
  binary-expr   866   ← a ?? b 的每个操作数各算一条分支；
                        默认侧要求「字段存在但值是 undefined」这类
                        业务上不存在的输入
```

**不要**为把分支从 90 推到 95 去写 400 条「喂畸形 payload」的测试。那只能
证明防御代码不崩，不证明行为正确，而且会让后来者误以为那些路径是真实契约。
如果上级明确要求，请逐条标 `// 仅用于覆盖防御性默认侧`，别混进行为测试里。

## 三、真正要紧的事：产品还有一半没做

`docs/product-feature-roadmap.md` §7 现状：

| 编号 | 内容 | 状态 |
| --- | --- | --- |
| 2.1 | 国内外金价对比与分解 | 已完成 |
| 2.2 | 解释变化记录（diff） | 已完成 |
| 2.5 | 原位术语（12 条） | 部分完成（有范围追问未做） |
| 2.3 | 关注问题简报 | **未开始** |
| 2.4 | 预期与实际 | **未开始** |
| 2.6 | 生活/行业连接 | **未开始** |
| §3 | 事件中心「今天重点三件」 | **未开始** |
| §3.2 | 导航收敛 | **未开始** |
| §3 | 首页问题优先 / 详情首屏 | 部分完成 |

**下一段优先做 §2.4「预期与实际」**，理由：它复用已有的日历（`cal.upcoming`）、
事件归档（`eventTimeMs` / `mergeHistoryRows`）和解释快照三条数据线，不需要新
上游；而且它是「预期落空」这件事唯一能被检验的地方——现在的产品只能看「发生了
什么」，不能看「原本以为会发生什么」。

## 四、不能碰的东西

`docs/product-feature-roadmap.md` §4「暂缓项」是**明确不做**的清单，
里面有产品判断（不只是技术成本），不要顺手做掉。

## 五、几个会反复踩的测试侧坑（都踩过）

1. `shared/dom.js` 在模块加载时抓住 `#rows` / `#map` / `#macro` 等元素：
   用例里只能清 `innerHTML`，**不要换 body 的节点**，否则断言对着游离节点。
2. jsdom 没有 `Element.prototype.scrollTo` / `scrollIntoView` /
   `svg.getScreenCTM`；而且 `renderMap` 这类函数会**整屏重建 DOM**，
   所以补丁要打在原型上，不能挂在具体节点。
3. `writeExplanation` 的签名是 `{ explanation }`（对象包一层）；
   `persistReferencedObservations` 返回的 `written` 是**条数不是数组**。
   搞错的表现都是「seed 静默失败 → 断言全 404 / NaN」。
4. 事件等级是字符串 `high|mid|low`；地图上的 `level: 1..3` 是另一套词汇，
   混用会让播报队列永远为空（`spotlightEvent()` 返回 null）。
5. 播报台 / 时间轴的夹具要按真实结构给（`playbookPanel` 需要
   `name/sub/steps/edges/breaks/note`，少一个直接抛）。
