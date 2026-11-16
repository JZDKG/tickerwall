// @vitest-environment jsdom
/* ================================================================== *
 * AI 问财（Milestone 3）
 *
 * 三层各自可单测，不靠「起浏览器点点看」：
 *   · markdown.js —— 先转义再拼标签，任何输入都不能产生可执行 HTML；
 *   · ask-models.js —— 表单校验与弹窗动作（测试连接 / 保存 / 默认 / 删除）；
 *   · ask.js —— SSE 帧解析、流式渲染、取数轨迹折叠、IME 回车与中断。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { safeMarkdownHref, markdownToSafeHtml } from '../src/client/shared/markdown.js';
import { resolveGraphAssetId } from '../src/client/shared/ask-charts.js';
import {
  copyIconHtml,
  extractFollowups,
  resolveFollowups,
  formatAnswerForCopy,
  copyTextWithFeedback,
  clearCopyFeedbackTimers,
} from '../src/client/shared/ask-assist.js';

const asText = (v) => String(v);

document.body.innerHTML = '<section id="ask" hidden></section>';

describe('safeMarkdownHref：只放行 http(s) 与站内安全路由', () => {
  it('http / https 原样放行并规范化', () => {
    expect(safeMarkdownHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeMarkdownHref('http://example.com')).toBe('http://example.com/');
  });

  it('站内安全 hash 路由放行', () => {
    for (const href of ['#/d/gold-intl', '#/macro', '#/events', '#/map', '#/watch', '#/ask']) {
      expect(safeMarkdownHref(href)).toBe(href);
    }
  });

  it('javascript: / data: / 相对路径 / 未知路由一律返回空串', () => {
    for (const href of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/api/ai/models',
      'api/x',
      '#/nope',
      '#/d/',
      '#/d/a b',
      '#/ask?x=1',
      '',
      '   ',
      null,
      undefined,
    ]) {
      expect(safeMarkdownHref(href)).toBe('');
    }
  });
});

describe('markdownToSafeHtml：转义优先', () => {
  it('HTML 标签整体转义，不产生可执行节点', () => {
    const out = asText(markdownToSafeHtml('<script>alert(1)</script>'));
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('加粗与行内代码里的标签也只转义一次', () => {
    const out = asText(markdownToSafeHtml('**<img src=x onerror=alert(1)>** 和 `<b>x</b>`'));
    expect(out).toContain('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>');
    expect(out).toContain('<code>&lt;b&gt;x&lt;/b&gt;</code>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('&amp;lt;');
  });

  it('javascript: 链接不渲染成 <a>，只保留文字', () => {
    const out = asText(markdownToSafeHtml('[点我](javascript:alert(1))'));
    expect(out).not.toContain('<a');
    expect(out).toContain('点我');
  });

  it('表格单元格与链接文字都先转义', () => {
    const out = asText(markdownToSafeHtml('| 名称 |\n| --- |\n| <b>x</b> |'));
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(out).not.toContain('<b>x</b>');
  });

  it('空输入返回空串（不是 null / undefined）', () => {
    expect(asText(markdownToSafeHtml(''))).toBe('');
    expect(asText(markdownToSafeHtml(null))).toBe('');
    expect(asText(markdownToSafeHtml(undefined))).toBe('');
    expect(asText(markdownToSafeHtml('   \n\n  '))).toBe('');
  });
});

describe('markdownToSafeHtml：块级结构', () => {
  it('段落之间空行分段，段内换行变 <br>', () => {
    const out = asText(markdownToSafeHtml('第一段\n第二行\n\n第二段'));
    expect(out).toContain('<p>第一段<br>第二行</p>');
    expect(out).toContain('<p>第二段</p>');
  });

  it('h2 / h3 / h4 标题', () => {
    const out = asText(markdownToSafeHtml('## 二级\n### 三级\n#### 四级'));
    expect(out).toContain('<h2>二级</h2>');
    expect(out).toContain('<h3>三级</h3>');
    expect(out).toContain('<h4>四级</h4>');
  });

  it('无序列表与有序列表', () => {
    const ul = asText(markdownToSafeHtml('- 一\n* 二\n+ 三'));
    expect(ul).toBe('<ul><li>一</li><li>二</li><li>三</li></ul>');
    const ol = asText(markdownToSafeHtml('1. 一\n2) 二'));
    expect(ol).toBe('<ol><li>一</li><li>二</li></ol>');
  });

  it('引用块保留内部行内格式', () => {
    const out = asText(markdownToSafeHtml('> 引用 **重点**\n> 第二行'));
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<strong>重点</strong>');
    expect(out).toContain('第二行');
  });

  it('围栏代码块原样保留（内部 Markdown 不再解析）', () => {
    const out = asText(markdownToSafeHtml('```js\nconst x = "<b>";\n**不是加粗**\n```'));
    expect(out).toContain('<pre class="md-code"><code>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('**不是加粗**');
    expect(out).not.toContain('<strong>');
  });

  it('未闭合的围栏也渲染到文末，不吞掉内容', () => {
    const out = asText(markdownToSafeHtml('```\n没收尾'));
    expect(out).toContain('<pre class="md-code"><code>没收尾</code></pre>');
  });

  it('分隔线渲染为 <hr>', () => {
    expect(asText(markdownToSafeHtml('---'))).toContain('<hr>');
  });

  it('段落后面紧跟块级元素（没有空行）也能正确断开', () => {
    const out = asText(markdownToSafeHtml('前言\n## 标题\n正文\n> 引用\n后文\n- 列表\n尾\n1. 有序\n结尾\n---\n末'));
    for (const piece of ['<p>前言</p>', '<h2>标题</h2>', '<blockquote>', '<ul><li>列表</li></ul>', '<ol><li>有序</li></ol>', '<hr>', '<p>末</p>']) {
      expect(out).toContain(piece);
    }
    expect(asText(markdownToSafeHtml('文字\n```\ncode\n```'))).toContain('<pre class="md-code"><code>code</code></pre>');
  });

  it('列表遇到非列表行就收束，后面的文字仍是段落', () => {
    const out = asText(markdownToSafeHtml('- 一\n- 二\n普通段落'));
    expect(out).toContain('<ul><li>一</li><li>二</li></ul>');
    expect(out).toContain('<p>普通段落</p>');
  });
});

describe('markdownToSafeHtml：链接', () => {
  it('外链带 target 与 rel，href 只转义一次', () => {
    const out = asText(markdownToSafeHtml('[详情](https://example.com/x?a=1&b=2)'));
    expect(out).toContain('href="https://example.com/x?a=1&amp;b=2"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('站内 hash 链接不加 target（同一标签页内跳转）', () => {
    const out = asText(markdownToSafeHtml('[问问 AI](#/ask)'));
    expect(out).toContain('href="#/ask"');
    expect(out).not.toContain('target="_blank"');
  });

  it('链接文字里的加粗/代码仍然生效', () => {
    const out = asText(markdownToSafeHtml('[**重点** 与 `code`](https://example.com)'));
    expect(out).toContain('<strong>重点</strong>');
    expect(out).toContain('<code>code</code>');
  });
});

describe('markdownToSafeHtml：GFM 表格', () => {
  const table = [
    '| 指标 | 数值 | 变化 |',
    '| :--- | ---: | :---: |',
    '| 国际金价 | 2,400 | +1.2% |',
    '| 美元指数 | 104.2 | -0.3% |',
  ].join('\n');

  it('渲染表头与表体，数值列右对齐并等宽', () => {
    const out = asText(markdownToSafeHtml(table));
    expect(out).toContain('<div class="md-table-wrap"><table class="md-table">');
    expect(out).toContain('<th class="is-left">指标</th>');
    expect(out).toContain('<th class="is-right is-num">数值</th>');
    expect(out).toContain('<th class="is-center is-num">变化</th>');
    expect(out).toContain('<td class="is-right is-num">2,400</td>');
    expect(out).toContain('<td class="is-center is-num">+1.2%</td>');
  });

  it('缺失单元格补空，不把行拼错位', () => {
    const out = asText(markdownToSafeHtml('| a | b |\n| --- | --- |\n| 1 |'));
    expect(out).toContain('<td class="is-num">1</td>');
    expect(out).toContain('<td class=""></td>');
  });

  it('分隔行不合法时按普通段落处理（不误判表格）', () => {
    const out = asText(markdownToSafeHtml('| 不是表格\n| 普通文本'));
    expect(out).not.toContain('<table');
    expect(out).toContain('<p>');
  });

  it('表格可以不写首尾竖线；下一行没有竖线时不算表格', () => {
    const out = asText(markdownToSafeHtml('指标 | 数值\n--- | ---\n金价 | 2400'));
    expect(out).toContain('<table class="md-table">');
    expect(out).toContain('<td class="is-num">2400</td>');
    expect(asText(markdownToSafeHtml('a | b\n不是分隔行'))).not.toContain('<table');
  });

  it('表体比表头多一列时也能补出对齐类', () => {
    const out = asText(markdownToSafeHtml('| a | b |\n| --- | --- |\n| 1 | 2 | 3 |'));
    expect(out).toContain('<td class="is-num">3</td>');
  });

  it('段落后面直接接表格（无空行）仍识别为表格', () => {
    const out = asText(markdownToSafeHtml('说明\nA | B\n--- | ---\n1 | 2'));
    expect(out).toContain('<p>说明</p>');
    expect(out).toContain('<table class="md-table">');
  });
});

describe('markdownToSafeHtml：内嵌图表（K 线 / 关系图 / 条形图 / 折线图）', () => {
  it('K 线 JSON 块渲染蜡烛柱、影线、MA5 与涨跌幅', () => {
    const kline = JSON.stringify({
      type: 'kline',
      title: '国际金价近 6 日 K 线',
      unit: '美元',
      data: [
        { date: '11-09', open: 4100, high: 4150, low: 4080, close: 4140 },
        { date: '11-10', open: 4140, high: 4145, low: 4020, close: 4032 },
        { date: '11-11', open: 4032, high: 4050, low: 3970, close: 3987 },
        { date: '11-12', open: 3987, high: 4000, low: 3852, close: 3877 },
        { date: '11-13', open: 3877, high: 3895, low: 3860, close: 3880 },
        { date: '11-16', open: 3880, high: 3901, low: 3863, close: 3890 },
      ],
    });
    const out = asText(markdownToSafeHtml(`\`\`\`chart\n${kline}\n\`\`\``));
    expect(out).toContain('<figure class="md-chart md-chart-kline">');
    expect(out).toContain('国际金价近 6 日 K 线');
    expect(out).toContain('class="md-kline-wick is-up"');
    expect(out).toContain('class="md-kline-body is-down"');
    expect(out).toContain('class="md-kline-ma"');
    expect(out).toContain('11-16');
  });

  it('关系传导图（JSON 与简化 Mermaid，含成环保护）均渲染为矢量 DAG', () => {
    const graphJson = JSON.stringify({
      type: 'graph',
      title: '利率与金价传导链路',
      nodes: [
        { id: 'fed', label: '美联储鹰派', detail: '加息预期 95%', tone: 'warn' },
        { id: 'us10y', label: '美债 10Y 上行', detail: '5.14%', tone: 'up' },
        { id: 'gold', label: '国际金价承压', detail: '3876', tone: 'down' },
      ],
      edges: [
        { from: 'fed', to: 'us10y', label: '推升实际利率' },
        { from: 'us10y', to: 'gold', label: '机会成本上升' },
        { from: 'gold', to: 'fed', label: '反向校验成环' },
      ],
    });
    const out = asText(markdownToSafeHtml(`\`\`\`chart\n${graphJson}\n\`\`\``));
    expect(out).toContain('<figure class="md-chart md-chart-graph">');
    expect(out).toContain('tone-warn');
    expect(out).toContain('推升实际利率');
    expect(out).toContain('marker-end="url(#md-arrow-');

    const mermaid = '```mermaid\ngraph LR\n  A[央行购金] -->|储备需求| B[现货买盘] --> C[金价支撑]\n```';
    const mOut = asText(markdownToSafeHtml(mermaid));
    expect(mOut).toContain('<figure class="md-chart md-chart-graph">');
    expect(mOut).toContain('央行购金');
    expect(mOut).toContain('储备需求');
    expect(mOut).toContain('金价支撑');
  });

  it('柱状图与折线图渲染正常', () => {
    const bar = JSON.stringify({
      type: 'bar',
      title: '资金流向净额',
      unit: '亿元',
      data: [
        { label: '大单', value: 3.14 },
        { label: '超大单', value: -1.08 },
        { label: '占比参考', value: 0.4567, tone: 'accent' },
        { label: '零净额', value: 0 },
      ],
    });
    const line = JSON.stringify({
      type: 'line',
      title: '净值趋势',
      series: [
        { name: '黄金', data: [{ label: 'T-2', value: 100 }, { label: 'T-1', value: 102 }, { label: 'T', value: 104 }] },
        { name: '美元', data: [{ label: 'T-2', value: 100 }, { label: 'T-1', value: 99 }, { label: 'T', value: 98 }] },
      ],
    });
    const out = asText(markdownToSafeHtml(`\`\`\`chart\n${bar}\n\`\`\`\n\n\`\`\`chart\n${line}\n\`\`\``));
    expect(out).toContain('<figure class="md-chart md-chart-bar">');
    expect(out).toContain('md-bar-fill is-up');
    expect(out).toContain('md-bar-fill is-down');
    expect(out).toContain('md-bar-fill is-accent');
    expect(out).toContain('+3.14 亿元');
    expect(out).toContain('0.4567 亿元');
    expect(out).toContain('<figure class="md-chart md-chart-line">');
    expect(out).toContain('md-line-path series-0');
    expect(out).toContain('md-line-path series-1');
  });

  it('K 线、关系图、条形图与折线图的字段推断与边界分支完整', () => {
    // 1. 缺省 type 时自动推断：kline（2 根、flat span、open=0、无 MA5、中文超长标题截断）
    const kShort = JSON.stringify({
      data: [
        { date: '11-15', open: 0, high: 1200, low: 1200, close: 1200 },
        { date: '11-16', open: 1200, high: 1200, low: 1200, close: 1200 },
        null,
        { date: 'bad', open: 10, high: 5, low: 8, close: 9 },
      ],
    });
    const kOut = asText(markdownToSafeHtml(`\`\`\`kline\n${kShort}\n\`\`\``));
    expect(kOut).toContain('<figure class="md-chart md-chart-kline">');
    expect(kOut).toContain('0.00%');
    expect(kOut).not.toContain('MA5');

    // kline fence 省略 type 与 kline 数据
    const kInfer = asText(markdownToSafeHtml(`\`\`\`chart\n${JSON.stringify({
      data: [
        { date: 'D1', open: 2.5, high: 3.0, low: 2.4, close: 2.8 },
        { date: 'D2', open: 2.8, high: 2.9, low: 2.1, close: 2.2 },
      ],
    })}\n\`\`\``));
    expect(kInfer).toContain('<figure class="md-chart md-chart-kline">');
    expect(kInfer).toContain('-12.00%');

    // 2. Mermaid：RL 反向、注释/subgraph 跳过、分号多句、圆角/菱形标签、标签延迟覆盖、虚线/粗箭头与不完整回退
    const rlMermaid = [
      '```mermaid',
      'flowchart RL',
      '%% 注释应跳过',
      'subgraph macro',
      '  S[独立节点标签]; A --> B;',
      '  A(超长多字节节点名称超出宽度限制需要被优雅截断显示) -.->|虚线标签| C{菱形标签};',
      '  B ==>|粗箭头超过十二列被裁剪| D; A -- 传导机制标签超过十二列被裁 --> B; B --> B',
      'end',
      '```',
    ].join('\n');
    const mOut = asText(markdownToSafeHtml(rlMermaid));
    expect(mOut).toContain('<figure class="md-chart md-chart-graph">');
    expect(mOut).toContain('…');
    expect(mOut).toContain('虚线标签');

    const badMermaid = asText(markdownToSafeHtml('```mermaid\ngraph LR\n  OnlyOne[单节点]\n```'));
    expect(badMermaid).toContain('<pre class="md-code">');

    // 3. graph 自动补全未在 nodes 声明的 from/to 端点、4 列深链布局、无 title 无 detail 分支
    const gOut = asText(markdownToSafeHtml(`\`\`\`graph\n${JSON.stringify({
      nodes: [null, { id: 'n2', label: '节点二', tone: 'UNKNOWN' }],
      edges: [
        null,
        { from: '', to: 'n2' },
        { from: 'n1', to: 'n2', label: '短边' },
        { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4' },
      ],
    })}\n\`\`\``));
    expect(gOut).toContain('<figure class="md-chart md-chart-graph">');
    expect(gOut).toContain('n1');
    expect(gOut).toContain('n4');
    expect(gOut).not.toContain('<figcaption');

    // 4. bar 无单位 & 数据不足回退
    const bNoUnit = asText(markdownToSafeHtml(`\`\`\`chart\n${JSON.stringify({
      data: [null, { label: '单条', value: 5 }, { label: '', value: 9 }],
    })}\n\`\`\``));
    expect(bNoUnit).toContain('<figure class="md-chart md-chart-bar">');
    expect(bNoUnit).not.toContain('单位：');
    expect(asText(markdownToSafeHtml('```chart\n{"type":"bar","data":[]}\n```'))).toContain('<pre class="md-code">');

    // 5. line 单序列 spec.data + ≥6 点平直线 + 带单位 + 缺失 label/非数值过滤
    const lFlat = asText(markdownToSafeHtml(`\`\`\`chart\n${JSON.stringify({
      type: 'line',
      unit: '%',
      data: [
        null,
        { date: '1', value: 5 },
        { date: '2', value: 5 },
        { value: 'bad' },
        { value: 5 },
        { date: '3', value: 5 },
        { date: '4', value: 5 },
        { date: '5', value: 5 },
        { date: '6', value: 5 },
      ],
    })}\n\`\`\``));
    expect(lFlat).toContain('<figure class="md-chart md-chart-line">');
    expect(lFlat).toContain('单位：%');
    expect(lFlat).toContain('>3</text>');

    const lInferred = asText(markdownToSafeHtml(`\`\`\`chart\n${JSON.stringify({
      series: [null, { data: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] }],
    })}\n\`\`\``));
    expect(lInferred).toContain('<figure class="md-chart md-chart-line">');

    // 6. 空块、空对象、数组/原始 JSON、未知 type、纯文本图谱点数与缺失字段全部优雅回退
    for (const rawCase of [
      '```chart\n\n```',
      '```chart\n{}\n```',
      '```chart\n[1,2,3]\n```',
      '```chart\n{"type":"pie","data":[1,2]}\n```',
      '```chart\n{"type":"kline","data":[{"date":"1","open":1,"high":2,"low":1,"close":2}]}\n```',
      '```chart\n{"type":"bar"}\n```',
      '```chart\n{"type":"bar","data":[{"value":3}]}\n```',
      '```chart\n{"type":"line"}\n```',
      '```chart\n{"type":"line","data":[{"label":"1","value":1}]}\n```',
      '```chart\n{"type":"graph","nodes":[{"id":"a"}],"edges":[]}\n```',
      '```chart\n{"type":"graph","nodes":[],"edges":[{"from":"x"}]}\n```',
    ]) {
      expect(asText(markdownToSafeHtml(rawCase))).toContain('<pre class="md-code">');
    }
  });

  it('流式未闭合图表块显示占位提示，非法 JSON 回退为代码块且图表文案完整转义', () => {
    const pending = asText(markdownToSafeHtml('```chart\n{"type":"kline"'));
    expect(pending).toContain('正在绘制图表…');
    expect(pending).not.toContain('<svg');

    const invalid = asText(markdownToSafeHtml('```chart\n{not valid json}\n```'));
    expect(invalid).toContain('<pre class="md-code"><code>{not valid json}</code></pre>');

    const xssGraph = JSON.stringify({
      type: 'graph',
      title: '<script>alert(1)</script>',
      nodes: [
        { id: 'a', label: '<img src=x onerror=alert(1)>' },
        { id: 'b', label: '正常节点' },
      ],
      edges: [{ from: 'a', to: 'b', label: '<b>边</b>' }],
    });
    const xssOut = asText(markdownToSafeHtml(`\`\`\`chart\n${xssGraph}\n\`\`\``));
    expect(xssOut).not.toContain('<script>');
    expect(xssOut).not.toContain('<img');
    expect(xssOut).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

/* ------------------------------------------------------------------ *
 * ask-models.js —— 模型配置弹窗
 * ------------------------------------------------------------------ */

let askModels = null;
beforeAll(async () => {
  askModels = await import('../src/client/views/ask-models.js');
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeFakeApi(initialModels = []) {
  const state = { models: initialModels.slice(), envPreset: null };
  const calls = [];
  const api = {
    async get(path) {
      calls.push(['get', path]);
      return { data: { ok: true, models: state.models, envPreset: state.envPreset }, status: 200, fetchedAt: 0 };
    },
    async post(path, body) {
      calls.push(['post', path, body]);
      if (body.action === 'test') {
        return { data: { ok: true, result: { ok: true, latencyMs: 42, model: body.model, reply: 'pong' } }, status: 200, fetchedAt: 0 };
      }
      if (body.action === 'set_default') {
        state.models = state.models.map((m) => ({ ...m, isDefault: m.id === body.id }));
        return { data: { ok: true, updated: true }, status: 200, fetchedAt: 0 };
      }
      if (body.action === 'delete') {
        state.models = state.models.filter((m) => m.id !== body.id);
        return { data: { ok: true, deleted: true }, status: 200, fetchedAt: 0 };
      }
      const saved = { ...body, id: body.id || `m${state.models.length + 1}`, isDefault: false, hasApiKey: true, apiKeyMasked: 'sk-…' };
      state.models = body.id
        ? state.models.map((m) => (m.id === body.id ? { ...m, ...saved } : m))
        : [...state.models, saved];
      return { data: { ok: true, model: saved }, status: 200, fetchedAt: 0 };
    },
  };
  return { api, state, calls };
}

const MODEL_A = {
  id: 'm1', name: '主模型', protocol: 'openai', baseUrl: 'https://api.example.com/v1',
  model: 'gpt-test', supportsTools: true, temperature: 0.3, maxTokens: 1200,
  isDefault: true, hasApiKey: true, apiKeyMasked: 'sk-…abcd',
};

function openDialog(api, extra = {}) {
  return askModels.openModelsDialog({ api, currentModelId: 'm1', onChanged: extra.onChanged ?? (() => {}), document, ...extra });
}

async function fill(el, values) {
  for (const [name, value] of Object.entries(values)) {
    const input = el.querySelector(`[name="${name}"]`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

describe('modelsDialogHTML：只读列表与渐进披露表单', () => {
  it('列出已配置模型：协议中文名、脱敏密钥、默认标记与行操作', () => {
    const out = asText(askModels.modelsDialogHTML({ models: [MODEL_A], currentModelId: 'm1' }));
    expect(out).toContain('主模型');
    expect(out).toContain('OpenAI 兼容');
    expect(out).toContain('sk-…abcd');
    expect(out).toContain('默认');
    expect(out).toContain('data-model-act="edit"');
    expect(out).toContain('data-model-act="delete"');
    expect(out).not.toContain('data-model-act="default" data-id="m1"');
  });

  it('.env 预设是只读行，不能编辑或删除', () => {
    const out = asText(askModels.modelsDialogHTML({
      models: [], envPreset: { id: 'env:default', name: '环境变量默认 (.env)', protocol: 'openai', baseUrl: 'https://env.example.com', model: 'env-model', hasApiKey: true, apiKeyMasked: 'sk-…env', isDefault: true, readOnly: true },
    }));
    expect(out).toContain('环境变量默认 (.env)');
    expect(out).toContain('只读');
    expect(out).toContain('env-model');
    expect(out).not.toContain('data-model-act="delete" data-id="env:default"');
  });

  it('表单每个字段都有 label；API Key 是密码框且编辑时提示留空保留', () => {
    const out = asText(askModels.modelsDialogHTML({ models: [MODEL_A], editing: MODEL_A, draft: { ...MODEL_A, apiKey: '' } }));
    for (const label of ['名称', '协议', 'Base URL', 'API Key', '模型 ID']) expect(out).toContain(`>${label}</label>`);
    expect(out).toContain('type="password"');
    expect(out).toContain('留空保留原密钥');
  });

  it('高级参数默认折叠在 <details> 内', () => {
    const out = asText(askModels.modelsDialogHTML({ models: [], draft: { protocol: 'openai', supportsTools: true } }));
    expect(out).toContain('<details class="ask-advanced">');
    expect(out).not.toMatch(/<details class="ask-advanced"[^>]*\bopen\b/);
    expect(out).toContain('name="supportsTools"');
    expect(out).toContain('name="temperature"');
    expect(out).toContain('name="maxTokens"');
  });

  it('没有任何模型且没有 .env 预设时给出空状态', () => {
    const out = asText(askModels.modelsDialogHTML({ models: [], envPreset: null }));
    expect(out).toContain('尚未配置模型');
  });
});

describe('validateModelDraft：必填与数值边界', () => {
  it('合法草稿通过', () => {
    const r = askModels.validateModelDraft({ name: 'A', protocol: 'openai', baseUrl: 'https://x.test/v1', model: 'gpt', temperature: '0.7', maxTokens: '800' });
    expect(r.ok).toBe(true);
  });

  it('缺名称 / 缺 Base URL / 缺模型 ID 分别报错', () => {
    const r = askModels.validateModelDraft({ name: ' ', protocol: 'openai', baseUrl: '', model: '' });
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeTruthy();
    expect(r.errors.baseUrl).toBeTruthy();
    expect(r.errors.model).toBeTruthy();
  });

  it('Base URL 必须是 http(s)', () => {
    const r = askModels.validateModelDraft({ name: 'A', protocol: 'openai', baseUrl: 'api.example.com', model: 'gpt' });
    expect(r.errors.baseUrl).toContain('http');
  });

  it('temperature 限 0–2，maxTokens 必须正整数', () => {
    const r = askModels.validateModelDraft({ name: 'A', protocol: 'openai', baseUrl: 'https://x.test', model: 'gpt', temperature: '2.1', maxTokens: '1.5' });
    expect(r.errors.temperature).toBeTruthy();
    expect(r.errors.maxTokens).toBeTruthy();
  });
});

describe('openModelsDialog：动作与局部反馈', () => {
  let dialog = null;

  afterEach(() => {
    dialog?.remove();
    dialog = null;
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  });

  it('打开后拉取列表，关闭按钮移除弹窗', async () => {
    const { api } = makeFakeApi([MODEL_A]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('主模型');

    dialog.querySelector('[data-dialog-act="close"]').click();
    expect(document.querySelector('dialog.ask-models-dialog')).toBeNull();
  });

  it('Esc 或轻触取消引发原生 close 事件时也会从 DOM 摘除弹窗，避免残留死节点', async () => {
    const { api } = makeFakeApi([MODEL_A]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    expect(dialog).toBeTruthy();

    dialog.dispatchEvent(new Event('close'));
    await flush();
    expect(document.querySelector('dialog.ask-models-dialog')).toBeNull();
  });

  it('测试连接可直接用未保存草稿，成功延迟显示在弹窗内', async () => {
    const { api, calls } = makeFakeApi([]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    await fill(dialog, { baseUrl: 'https://draft.test/v1', model: 'draft-model', apiKey: 'sk-draft' });
    dialog.querySelector('[data-form-act="test"]').click();
    await flush();

    const test = calls.find((c) => c[1] === 'api/ai/models' && c[2]?.action === 'test');
    expect(test).toBeTruthy();
    expect(test[2]).toMatchObject({ baseUrl: 'https://draft.test/v1', model: 'draft-model', apiKey: 'sk-draft' });
    expect(dialog.textContent).toContain('连接成功');
    expect(dialog.textContent).toContain('42ms');
  });

  it('测试连接失败时显示具体错误原因', async () => {
    const { api } = makeFakeApi([]);
    api.post = async (path, body) => ({ data: { ok: true, result: { ok: false, latencyMs: 10, model: body.model, error: '401 未授权' } }, status: 200, fetchedAt: 0 });
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    await fill(dialog, { baseUrl: 'https://draft.test', model: 'bad' });
    dialog.querySelector('[data-form-act="test"]').click();
    await flush();
    expect(dialog.textContent).toContain('401 未授权');
  });

  it('保存新模型后刷新列表并回调 onChanged', async () => {
    const { api, calls, state } = makeFakeApi([]);
    const onChanged = vi.fn();
    openDialog(api, { onChanged });
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    await fill(dialog, { name: '新模型', baseUrl: 'https://new.test/v1', model: 'new-model', apiKey: 'sk-new' });
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const save = calls.find((c) => c[1] === 'api/ai/models' && c[2]?.name === '新模型');
    expect(save[2]).toMatchObject({ name: '新模型', baseUrl: 'https://new.test/v1', model: 'new-model', apiKey: 'sk-new' });
    expect(state.models.some((m) => m.name === '新模型')).toBe(true);
    expect(onChanged).toHaveBeenCalled();
    expect(dialog.textContent).toContain('新模型');
  });

  it('编辑已有模型时密钥留空则不提交 apiKey', async () => {
    const { api, calls } = makeFakeApi([MODEL_A]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    dialog.querySelector('[data-model-act="edit"]').click();
    await flush();
    expect(dialog.querySelector('[name="name"]').value).toBe('主模型');
    expect(dialog.querySelector('[name="apiKey"]').value).toBe('');
    await fill(dialog, { name: '主模型改名' });
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const save = calls.find((c) => c[1] === 'api/ai/models' && c[2]?.name === '主模型改名');
    expect(save[2].id).toBe('m1');
    expect('apiKey' in save[2]).toBe(false);
  });

  it('编辑已有模型并清空 temperature / maxTokens 时显式提交 null 清除旧值', async () => {
    const { api, calls } = makeFakeApi([MODEL_A]);
    openDialog(api, { currentModelId: 'm1' });
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    expect(dialog.querySelector('[data-row-id="m1"]')?.classList.contains('is-current')).toBe(true);

    dialog.querySelector('[data-model-act="edit"]').click();
    await flush();
    await fill(dialog, { temperature: '', maxTokens: '' });
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const save = calls.find((c) => c[1] === 'api/ai/models' && c[2]?.id === 'm1');
    expect(save[2].temperature).toBeNull();
    expect(save[2].maxTokens).toBeNull();
  });

  it('表单校验失败时在字段旁显示错误且不发请求', async () => {
    const { api, calls } = makeFakeApi([]);
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(dialog.textContent).toContain('请填写名称');
    expect(calls.some((c) => c[1] === 'api/ai/models' && c[0] === 'post')).toBe(false);
  });

  it('设为默认与两步确认删除都会回调 onChanged', async () => {
    const m2 = { ...MODEL_A, id: 'm2', name: '备用模型', isDefault: false };
    const { api, calls, state } = makeFakeApi([MODEL_A, m2]);
    const onChanged = vi.fn();
    openDialog(api, { onChanged });
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');

    dialog.querySelector('[data-model-act="default"][data-id="m2"]').click();
    await flush();
    expect(calls.find((c) => c[2]?.action === 'set_default')?.[2]).toMatchObject({ action: 'set_default', id: 'm2' });

    dialog.querySelector('[data-model-act="delete"][data-id="m2"]').click();
    await flush();
    const confirm = dialog.querySelector('[data-model-act="confirm-delete"][data-id="m2"]');
    expect(confirm).toBeTruthy();
    confirm.click();
    await flush();
    expect(calls.find((c) => c[2]?.action === 'delete')?.[2]).toMatchObject({ action: 'delete', id: 'm2' });
    expect(state.models.some((m) => m.id === 'm2')).toBe(false);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('列表加载失败显示可重试错误态', async () => {
    let fail = true;
    const { api } = makeFakeApi([MODEL_A]);
    api.get = async (path) => {
      if (fail) throw new Error('网络错误');
      return { data: { ok: true, models: [MODEL_A], envPreset: null }, status: 200, fetchedAt: 0 };
    };
    openDialog(api);
    await flush();
    dialog = document.querySelector('dialog.ask-models-dialog');
    expect(dialog.textContent).toContain('加载失败');

    fail = false;
    dialog.querySelector('[data-dialog-act="reload"]').click();
    await flush();
    expect(dialog.textContent).toContain('主模型');
  });
});

/* ------------------------------------------------------------------ *
 * ask.js —— 纯函数、SSE 解析与工作区生命周期
 * ------------------------------------------------------------------ */

let askView = null;
beforeAll(async () => {
  askView = await import('../src/client/views/ask.js');
});

describe('parseAskHashQuery / buildStarterPrompts', () => {
  it('解析 router 传进来的 query 串，兼容带 ? 与整段 hash', () => {
    expect(askView.parseAskHashQuery('asset=gold-intl&q=%E5%88%86%E6%9E%90')).toEqual({ assetId: 'gold-intl', question: '分析' });
    expect(askView.parseAskHashQuery('?q=a+b')).toEqual({ assetId: '', question: 'a b' });
    expect(askView.parseAskHashQuery('#/ask?asset=x&q=y')).toEqual({ assetId: 'x', question: 'y' });
    expect(askView.parseAskHashQuery(null)).toEqual({ assetId: '', question: '' });
    expect(askView.parseAskHashQuery('q=%20%20')).toEqual({ assetId: '', question: '' });
  });

  it('动态芯片取涨跌幅绝对值前二，再补静态场景，4–6 条且不重复', () => {
    const prompts = askView.buildStarterPrompts([
      { id: 'a', name: '国际金价', changePct: 2.4, ok: true },
      { id: 'b', name: '纳指', changePct: -1.8, ok: true },
      { id: 'c', name: '原油', changePct: 0.2, ok: true },
    ]);
    expect(prompts.length).toBeGreaterThanOrEqual(4);
    expect(prompts.length).toBeLessThanOrEqual(6);
    expect(prompts[0]).toContain('国际金价');
    expect(prompts[1]).toContain('纳指');
    expect(new Set(prompts).size).toBe(prompts.length);
    expect(askView.buildStarterPrompts([])).toHaveLength(4);
  });

  it('坏报价被跳过，不生成 undefined 芯片', () => {
    const prompts = askView.buildStarterPrompts([null, { id: 'x' }, { id: 'y', name: '黄金', changePct: 1, ok: false }]);
    expect(prompts.some((p) => p.includes('undefined'))).toBe(false);
    expect(prompts).toHaveLength(4);
  });
});

describe('SSE 帧解析', () => {
  it('兼容 CRLF、无 event 名与空帧；没有 data 的帧丢弃', () => {
    const { events } = askView.parseSSEFrames('\r\n\r\ndata: {"a":1}\r\n\r\nevent: delta\n\ndata: [1,2]\n\n');
    expect(events).toEqual([
      { type: 'message', data: { a: 1 } },
      { type: 'message', data: [1, 2] },
    ]);
    expect(askView.parseSSEFrames('').events).toEqual([]);
  });

  it('响应没有可读流时明确报错', async () => {
    await expect(askView.consumeAskResponse({}, () => {})).rejects.toThrow('响应不支持流式读取');
  });

  it('响应结束时把最后一条没有空行结尾的帧也消费掉', async () => {
    const enc = new TextEncoder();
    const response = {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(enc.encode('event: delta\ndata: {"text":"尾帧"}'));
          controller.close();
        },
      }),
    };
    const seen = [];
    await askView.consumeAskResponse(response, (ev) => seen.push(ev));
    expect(seen).toEqual([{ type: 'delta', data: { text: '尾帧' } }]);
  });

  it('解析多个完整帧，保留跨 chunk 的残帧', () => {
    const { events, rest } = askView.parseSSEFrames(
      'event: delta\ndata: {"text":"你"}\n\nevent: done\ndata: {"sessionId":"s1"}\n\nevent: delta\ndata: {"text":"半',
    );
    expect(events).toEqual([
      { type: 'delta', data: { text: '你' } },
      { type: 'done', data: { sessionId: 's1' } },
    ]);
    expect(rest).toContain('"半');
  });

  it('忽略坏 JSON 与空帧', () => {
    const { events } = askView.parseSSEFrames('\n\nevent: delta\ndata: not-json\n\nevent: delta\ndata: {"text":"ok"}\n\n');
    expect(events).toEqual([{ type: 'delta', data: { text: 'ok' } }]);
  });

  it('consumeAskResponse 处理一帧被拆到两个 chunk 的情况', async () => {
    const enc = new TextEncoder();
    const chunks = [
      enc.encode('event: delta\ndata: {"text":"你'),
      enc.encode('好"}\n\nevent: done\ndata: {"sessionId":"s1"}\n\n'),
    ];
    const response = {
      body: new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      }),
    };
    const seen = [];
    await askView.consumeAskResponse(response, (ev) => seen.push(ev));
    expect(seen).toEqual([
      { type: 'delta', data: { text: '你好' } },
      { type: 'done', data: { sessionId: 's1' } },
    ]);
  });
});

describe('renderAskAnswerHTML：正文与取数轨迹', () => {
  it('安全渲染 Markdown，并把轨迹折进 details（默认关闭）', () => {
    const out = asText(askView.renderAskAnswerHTML({
      content: '**结论**：金价走强',
      modelLabel: 'gpt-test',
      toolTrace: [
        { tool: 'get_a_share_quotes', args: { ids: ['600519'] }, ok: true, source: 'sina', asOf: '2026-11-16T10:00:00+08:00', stale: true, durationMs: 12, summary: '3 条' },
        { tool: 'search_news', ok: false, error: '上游超时' },
      ],
    }));
    expect(out).toContain('<strong>结论</strong>');
    expect(out).toContain('<details class="ask-trace">');
    expect(out).not.toMatch(/<details class="ask-trace"[^>]*\bopen\b/);
    expect(out).toContain('数据来源 · 2 次查询 · gpt-test · 含过期数据');
    expect(out).toContain('get_a_share_quotes');
    expect(out).toContain('sina');
    expect(out).toContain('2026-11-16T10:00:00+08:00');
    expect(out).toContain('过期');
    expect(out).toContain('上游超时');
  });

  it('工具名与参数里的 HTML 被转义', () => {
    const out = asText(askView.renderAskAnswerHTML({
      content: '',
      toolTrace: [{ tool: '<img src=x onerror=alert(1)>', args: { q: '<script>' }, ok: true }],
    }));
    expect(out).not.toContain('<img src=x');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;img');
  });

  it('参数支持字符串、空对象、超长截断与无法序列化', () => {
    const long = 'x'.repeat(120);
    const circular = {};
    circular.self = circular;
    const out = asText(askView.renderAskAnswerHTML({
      content: 'ok',
      toolTrace: [
        { tool: 'a', args: long, ok: true },
        { tool: 'b', args: {}, ok: true },
        { tool: 'c', args: circular, ok: true },
      ],
    }));
    expect(out).toContain('参数 xxx');
    expect(out).toContain('…');
    expect(out).toContain('[object Object]');
    expect(out).toContain('数据来源 · 3 次查询');
    expect(out).not.toContain('含过期数据');
  });

  it('错误、停止与空内容各有明确占位，不渲染空轨迹', () => {
    const failed = asText(askView.renderAskAnswerHTML({ content: '', error: '上游 500', stopped: true }));
    expect(failed).toContain('回答失败：上游 500');
    expect(failed).toContain('已停止生成');
    expect(failed).not.toContain('ask-trace');

    const streaming = asText(askView.renderAskAnswerHTML({ content: '', streaming: true }));
    expect(streaming).toContain('正在生成…');

    const empty = asText(askView.renderAskAnswerHTML({ content: '' }));
    expect(empty).toContain('没有返回内容');
    expect(empty).toContain('data-role="assistant"');
  });
});

function fakeAskApi({ models = [], sessions = [], sessionDetail = null, onAsk = null } = {}) {
  const calls = { get: [], post: [], ask: [] };
  const api = {
    async get(path) {
      calls.get.push(path);
      if (path === 'api/ai/models') return { data: { ok: true, models, envPreset: null }, status: 200, fetchedAt: 0 };
      if (path === 'api/ai/sessions') return { data: { ok: true, sessions }, status: 200, fetchedAt: 0 };
      if (path.startsWith('api/ai/sessions/')) return { data: { ok: true, session: sessionDetail }, status: 200, fetchedAt: 0 };
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path, body) {
      calls.post.push({ path, body });
      if (path === 'api/ai/sessions') return { data: { ok: true, deleted: true }, status: 200, fetchedAt: 0 };
      return { data: { ok: true }, status: 200, fetchedAt: 0 };
    },
    async postStream(path, body, opts = {}) {
      calls.ask.push({ path, body, opts });
      if (onAsk) return onAsk(body, opts);
      return sseResponse([
        { type: 'session', data: { session: { id: 's-new', title: body.question } } },
        { type: 'delta', data: { text: '**结论**' } },
        { type: 'done', data: { sessionId: 's-new', message: { role: 'assistant', content: '**结论**', toolTrace: [], modelLabel: 'gpt-test' } } },
      ]);
    },
  };
  return { api, calls };
}

function sseResponse(events) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(enc.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data ?? {})}\n\n`));
      }
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream };
}

function manualSSE() {
  const enc = new TextEncoder();
  let controller = null;
  const stream = new ReadableStream({ start(c) { controller = c; } });
  return {
    response: { ok: true, status: 200, body: stream },
    push(type, data) { controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)); },
    close() { controller.close(); },
  };
}

function abortAwareAsk() {
  return (body, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
}

const MODEL = {
  id: 'm1', name: '主模型', protocol: 'openai', baseUrl: 'https://api.example.com/v1',
  model: 'gpt-test', supportsTools: true, isDefault: true, hasApiKey: true, apiKeyMasked: 'sk-…',
};

async function waitFor(fn, timeout = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('waitFor timeout');
}

describe('mountAsk：工作区、流式渲染与生命周期', () => {
  const quotes = [
    { id: 'gold-intl', name: '国际金价', changePct: 2.4, ok: true },
    { id: 'nasdaq', name: '纳指', changePct: -1.8, ok: true },
  ];
  const getAsk = () => document.getElementById('ask');
  const $ = (sel) => getAsk().querySelector(sel);

  afterEach(() => {
    askView.unmountAsk();
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  });

  it('解析 URL 预填问题，并渲染模型下拉与动态芯片', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('asset=gold-intl&q=%E5%88%86%E6%9E%90%E9%BB%84%E9%87%91', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    expect(getAsk().hidden).toBe(false);
    expect($('#ask-input').value).toBe('分析黄金');
    expect($('#ask-model-select').value).toBe('m1');
    expect(getAsk().textContent).toContain('国际金价');
    expect($$('#ask-messages [data-starter]').length).toBeGreaterThanOrEqual(4);
  });

  it('报价广播到达后补上动态提问芯片，卸载后不再响应', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    const dynamicChip = () => $$('#ask-messages [data-starter]')
      .map((el) => el.dataset.starter)
      .find((text) => text.startsWith('分析 国际金价'));
    expect(dynamicChip()).toBeUndefined();

    const { emit } = await import('../src/client/shared/bus.js');
    emit('quotes', { items: quotes });
    await waitFor(() => dynamicChip());

    askView.unmountAsk();
    expect(() => emit('quotes', { items: [] })).not.toThrow();
    expect(dynamicChip()).toBeUndefined();
  });

  it('无模型时只给「配置接入模型」主按钮', async () => {
    const { api } = fakeAskApi({ models: [] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('[data-ask-act="configure"]'));
    expect($('#ask-model-select').disabled).toBe(true);
    expect($('[data-ask-act="configure"]').textContent).toContain('配置接入模型');
  });

  it('发送时带 asset 上下文；流式进度、正文与取数轨迹依次出现', async () => {
    const manual = manualSSE();
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('asset=gold-intl&q=%E5%88%86%E6%9E%90%E9%BB%84%E9%87%91', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);

    expect(calls.ask[0].body).toMatchObject({ question: '分析黄金', context: { assetId: 'gold-intl' }, modelId: 'm1' });
    expect($('#ask-send').textContent).toBe('停止');

    manual.push('tool_start', { round: 1, id: 't1', tool: 'get_a_share_quotes', args: { ids: ['600519'] } });
    await waitFor(() => $('.ask-progress')?.textContent.includes('正在查询 get_a_share_quotes'));

    manual.push('tool_result', { round: 1, id: 't1', tool: 'get_a_share_quotes', ok: true, source: 'sina', asOf: '2026-11-16T10:00:00+08:00', stale: true, durationMs: 8, summary: '3 条' });
    await waitFor(() => $('.ask-progress')?.textContent.includes('已完成 1 项系统查询'));

    manual.push('delta', { text: '**结论**：走强' });
    await waitFor(() => $('.ask-answer')?.innerHTML.includes('<strong>结论</strong>'));

    manual.push('done', {
      sessionId: 's-new',
      message: {
        role: 'assistant', content: '**结论**：走强', modelLabel: 'gpt-test',
        toolTrace: [{ tool: 'get_a_share_quotes', args: { ids: ['600519'] }, ok: true, source: 'sina', asOf: '2026-11-16T10:00:00+08:00', stale: true, durationMs: 8, summary: '3 条' }],
      },
    });
    manual.close();
    await waitFor(() => $('#ask-send').textContent === '发送');

    expect($('.ask-trace')).toBeTruthy();
    expect($('.ask-trace').open).toBe(false);
    expect($('.ask-trace summary').textContent).toContain('数据来源 · 1 次查询 · gpt-test · 含过期数据');
    expect($('.ask-trace').textContent).toContain('sina');
    expect($('.ask-answer').textContent).toContain('结论');
  });

  it('中文输入法 Enter 不发送；keyCode 229 也不发送；普通 Enter 发送', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    const input = $('#ask-input');
    input.value = '测试问题';

    const composing = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(composing, 'isComposing', { value: true });
    input.dispatchEvent(composing);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.ask).toHaveLength(0);

    const ime = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(ime, 'keyCode', { value: 229 });
    input.dispatchEvent(ime);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.ask).toHaveLength(0);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    expect(calls.ask[0].body.question).toBe('测试问题');
  });

  it('unmountAsk 立即中断进行中的 SSE 并清空视图', async () => {
    const manual = manualSSE();
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '写一半的问题';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);

    askView.unmountAsk();
    expect(calls.ask[0].opts.signal.aborted).toBe(true);
    expect(getAsk().hidden).toBe(true);
    expect(getAsk().childNodes.length).toBe(0);
  });

  it('模型列表加载失败显示重试，重试后恢复', async () => {
    let fail = true;
    const { api } = fakeAskApi({ models: [MODEL] });
    const originalGet = api.get;
    api.get = async (path) => {
      if (path === 'api/ai/models' && fail) throw new Error('网络错误');
      return originalGet(path);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('[data-ask-act="retry-load"]'));
    expect(getAsk().textContent).toContain('模型加载失败');

    fail = false;
    $('[data-ask-act="retry-load"]').click();
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    expect($('#ask-model-select').disabled).toBe(false);
  });

  it('历史会话常驻左侧，可恢复与一键删除', async () => {
    const session = {
      id: 's1', title: '黄金分析', updatedAt: Date.now(),
      messages: [
        { id: 'x1', role: 'user', content: '黄金怎么看？' },
        { id: 'x2', role: 'assistant', content: '**看多**', toolTrace: [], modelLabel: 'gpt-test' },
      ],
    };
    const { api, calls } = fakeAskApi({ models: [MODEL], sessions: [{ id: 's1', title: '黄金分析', updatedAt: Date.now() }], sessionDetail: session });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));

    expect($('#ask-history-btn')).toBeNull();
    expect($('#ask-history').hidden).toBe(false);
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('黄金怎么看？'));
    expect($('#ask-messages').innerHTML).toContain('<strong>看多</strong>');

    $('#ask-history [data-session-delete="s1"]').click();
    await waitFor(() => calls.post.length === 1);
    expect(calls.post[0]).toMatchObject({ path: 'api/ai/sessions', body: { action: 'delete', id: 's1' } });
  });

  it('历史会话 >=4 条才显示筛选框；筛选只重绘列表且输入不丢焦点', async () => {
    const four = [
      { id: 's1', title: '黄金分析', updatedAt: Date.now() },
      { id: 's2', title: '原油走势', updatedAt: Date.now() },
      { id: 's3', title: '美债利率', updatedAt: Date.now() },
      { id: 's4', title: 'GOLD outlook', updatedAt: Date.now() },
    ];
    const { api } = fakeAskApi({ models: [MODEL], sessions: four });
    askView.mountAsk('', { api, document, window, quotes });
    const search = await waitFor(() => ($('#ask-history-search')?.hidden === false ? $('#ask-history-search') : null));
    const filter = $('#ask-history-filter');
    expect(filter).toBeTruthy();
    expect(filter.type).toBe('search');
    expect(search.contains(filter)).toBe(true);

    filter.focus();
    filter.value = '黄金';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    const titles = () => [...document.querySelectorAll('#ask-history-list .ask-history-title')].map((n) => n.textContent);
    expect(titles()).toEqual(['黄金分析']);
    // 只重绘 ul：input 节点未被替换，焦点仍在
    expect(document.activeElement).toBe(filter);
    expect($('#ask-history-filter')).toBe(filter);

    // 大小写不敏感
    filter.value = 'gold';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expect(titles()).toEqual(['GOLD outlook']);

    // 无匹配提示带上筛选词
    filter.value = '不存在的关键字';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('#ask-history-list').textContent).toContain('没有匹配「不存在的关键字」的会话');

    // 清空筛选恢复全量
    filter.value = '';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expect(titles()).toHaveLength(4);

    // 新对话不清筛选，也不影响开新会话
    filter.value = '黄金';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    $('#ask-new-btn').click();
    expect($('#ask-history-filter').value).toBe('黄金');
    expect(titles()).toEqual(['黄金分析']);
  });

  it('历史会话 <4 条且无筛选词时隐藏筛选框；删到 <4 但筛选词非空仍显示', async () => {
    const four = [
      { id: 's1', title: '黄金分析', updatedAt: Date.now() },
      { id: 's2', title: '原油走势', updatedAt: Date.now() },
      { id: 's3', title: '美债利率', updatedAt: Date.now() },
      { id: 's4', title: '汇率观察', updatedAt: Date.now() },
    ];
    const { api, calls } = fakeAskApi({ models: [MODEL], sessions: four });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-history-search')?.hidden === false);
    const filter = $('#ask-history-filter');

    // 先删两条 → 只剩 2 条且无筛选词：隐藏
    $('#ask-history [data-session-delete="s2"]').click();
    await waitFor(() => calls.post.length === 1);
    $('#ask-history [data-session-delete="s3"]').click();
    await waitFor(() => calls.post.length === 2);
    expect($('#ask-history-search').hidden).toBe(true);

    // 筛选词非空时即使 <4 条也保持可见（OR 条件）
    filter.value = '黄金';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('#ask-history-search').hidden).toBe(false);

    // 清空筛选词 → <4 条立即隐藏
    filter.value = '';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('#ask-history-search').hidden).toBe(true);
  });

  it('少于 4 条会话时新用户看不到筛选框', async () => {
    const { api } = fakeAskApi({ models: [MODEL], sessions: [{ id: 's1', title: '黄金分析', updatedAt: Date.now() }] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-history-list .ask-history-item'));
    expect($('#ask-history-search')).toBeTruthy();
    expect($('#ask-history-search').hidden).toBe(true);
  });

  it('输入框按 scrollHeight 自动增高并夹在 56..140px；无高度环境安全降级', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    const input = $('#ask-input');

    // jsdom scrollHeight 恒 0：清掉内联高度，不抛错
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.style.height).toBe('');

    // 模拟真实浏览器高度：低于下限取 56，超上限取 140
    const setScroll = (h) => Object.defineProperty(input, 'scrollHeight', { configurable: true, get: () => h });
    setScroll(30);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.style.height).toBe('56px');
    setScroll(100);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.style.height).toBe('100px');
    setScroll(400);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.style.height).toBe('140px');

    // 发送清空后按空内容重量（模拟浏览器：空 textarea scrollHeight 30 → 夹到下限 56）
    setScroll(30);
    input.value = '多行\n问题';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    expect(input.value).toBe('');
    expect(input.style.height).toBe('56px');

    // 新对话同样复位
    setScroll(400);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setScroll(30);
    $('#ask-new-btn').click();
    expect(input.style.height).toBe('56px');
  });

  it('URL 预填问题后按内容调整输入框高度', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('q=%E5%88%86%E6%9E%90%E9%BB%84%E9%87%91', { api, document, window, quotes });
    const input = $('#ask-input');
    expect(input.value).toBe('分析黄金');
    // jsdom 无高度：降级为不设内联高度而不是报错
    expect(input.style.height).toBe('');
  });

  it('空输入按 ArrowUp 回填本会话上一条提问；有内容时不劫持光标', async () => {
    const session = {
      id: 's1', title: '黄金分析', updatedAt: Date.now(),
      messages: [
        { id: 'x1', role: 'user', content: '第一问' },
        { id: 'x2', role: 'assistant', content: '答一', toolTrace: [], modelLabel: 'gpt-test' },
        { id: 'x3', role: 'user', content: '第二问' },
        { id: 'x4', role: 'assistant', content: '答二', toolTrace: [], modelLabel: 'gpt-test' },
      ],
    };
    const { api } = fakeAskApi({ models: [MODEL], sessions: [{ id: 's1', title: '黄金分析', updatedAt: Date.now() }], sessionDetail: session });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('第二问'));

    const input = $('#ask-input');
    const arrowUp = () => new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    const ev = arrowUp();
    input.dispatchEvent(ev);
    expect(input.value).toBe('第二问');
    expect(ev.defaultPrevented).toBe(true);
    expect(input.selectionStart).toBe('第二问'.length);

    // 有内容时 ArrowUp 保持原生光标移动
    const ev2 = arrowUp();
    input.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
    expect(input.value).toBe('第二问');

    // 新会话没有历史提问：不报错也不改值
    $('#ask-new-btn').click();
    const ev3 = arrowUp();
    input.dispatchEvent(ev3);
    expect(input.value).toBe('');
    expect(ev3.defaultPrevented).toBe(false);
  });

  it('视图内按 / 聚焦输入框；输入控件/弹窗内不劫持；卸载后监听全部注销', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    const input = $('#ask-input');
    input.blur();

    const slash = () => new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    const ev = slash();
    document.body.dispatchEvent(ev);
    expect(document.activeElement).toBe(input);
    expect(ev.defaultPrevented).toBe(true);

    // 焦点在输入控件里：/ 是正常字符
    input.blur();
    const filter = $('#ask-history-filter');
    const evInFilter = slash();
    filter.dispatchEvent(evInFilter);
    expect(evInFilter.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);

    // 弹窗打开时不抢焦点
    $('#ask-models-btn').click();
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
    input.blur();
    const evDialog = slash();
    document.body.dispatchEvent(evDialog);
    expect(evDialog.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);
    document.querySelector('dialog.ask-models-dialog [data-dialog-act="close"]')?.click();
    input.blur();
    const evAfterDialog = slash();
    document.body.dispatchEvent(evAfterDialog);
    expect(evAfterDialog.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    input.blur();

    // 带修饰键不触发
    const evMeta = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true, metaKey: true });
    document.body.dispatchEvent(evMeta);
    expect(evMeta.defaultPrevented).toBe(false);

    // 卸载后 doc 监听全部清理
    askView.unmountAsk();
    input.blur?.();
    document.body.focus();
    const evAfter = slash();
    document.body.dispatchEvent(evAfter);
    expect(evAfter.defaultPrevented).toBe(false);
  });

  it('点击「模型配置」打开原生 dialog', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-models-btn').click();
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
    expect(document.querySelector('dialog.ask-models-dialog').textContent).toContain('模型配置');
    // 再点一次只保留一个弹窗（旧实例先关掉）
    $('#ask-models-btn').click();
    await waitFor(() => document.querySelectorAll('dialog.ask-models-dialog').length === 1);
  });

  it('只配置了 .env 预设时也能选中并发问', async () => {
    const envPreset = { id: 'env:default', name: '环境变量默认 (.env)', hasApiKey: true, isDefault: true, model: 'env-model' };
    const { api, calls } = fakeAskApi({ models: [] });
    const originalGet = api.get;
    api.get = async (path) => (path === 'api/ai/models'
      ? { data: { ok: true, models: [], envPreset }, status: 200, fetchedAt: 0 }
      : originalGet(path));
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="env:default"]'));
    expect($('#ask-model-select').value).toBe('env:default');

    $('#ask-input').value = '今天金价怎么看';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    expect(calls.ask[0].body.modelId).toBe('env:default');
  });

  it('切换模型下拉后，请求带上新模型', async () => {
    const second = { ...MODEL, id: 'm2', name: '备选模型', isDefault: false };
    const { api, calls } = fakeAskApi({ models: [MODEL, second] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m2"]'));
    const select = $('#ask-model-select');
    select.value = 'm2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    $('#ask-input').value = '对比两个模型';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    expect(calls.ask[0].body.modelId).toBe('m2');
  });

  it('没有任何模型时发送会直接打开模型配置', async () => {
    const { api, calls } = fakeAskApi({ models: [] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('[data-ask-act="configure"]'));
    $('#ask-input').value = '没有模型也要能发';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
    expect(calls.ask).toHaveLength(0);
  });

  it('点提问芯片直接发送该问题', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    const chip = $('[data-starter]');
    chip.click();
    await waitFor(() => calls.ask.length === 1);
    expect(calls.ask[0].body.question).toBe(chip.dataset.starter);
  });

  it('流式生成中再提交表单 = 停止，且信号被 abort', async () => {
    const manual = manualSSE();
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '查新闻';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    manual.push('tool_start', { id: 't1', tool: 'search_news' });
    await waitFor(() => $('.ask-progress')?.textContent.includes('正在查询 search_news'));
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(calls.ask[0].opts.signal.aborted).toBe(true);
  });

  it('error 帧在网络错误时都把原因显示在回答里', async () => {
    const withErrorFrame = fakeAskApi({
      models: [MODEL],
      onAsk: () => sseResponse([{ type: 'error', data: { error: '模型超时' } }]),
    });
    askView.mountAsk('', { api: withErrorFrame.api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '触发错误帧';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => $('.ask-error')?.textContent.includes('模型超时'));
    askView.unmountAsk();

    const networkFail = fakeAskApi({
      models: [MODEL],
      onAsk: async () => { throw Object.assign(new Error('网络断了'), { kind: 'network' }); },
    });
    askView.mountAsk('', { api: networkFail.api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '触发网络错误';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => $('.ask-error')?.textContent.includes('网络断了'));
  });

  it('历史会话常驻且加载失败可重试，空列表显示正常', async () => {
    const { api } = fakeAskApi({ models: [MODEL], sessions: [] });
    const originalGet = api.get;
    let fail = true;
    api.get = async (path) => {
      if (path === 'api/ai/sessions' && fail) throw new Error('会话网络错误');
      return originalGet(path);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    expect($('#ask-history').hidden).toBe(false);
    await waitFor(() => $('#ask-history [data-history-act="retry"]'));

    fail = false;
    $('#ask-history [data-history-act="retry"]').click();
    await waitFor(() => $('#ask-history-list')?.textContent.includes('暂无历史会话'));
    expect($('#ask-history').hidden).toBe(false);
  });

  it('恢复会话时过滤非对话角色、补默认字段并同步模型', async () => {
    const session = {
      id: 's1', title: '', modelId: 'm1', createdAt: Date.now(),
      messages: [
        { role: 'user', content: null },
        { role: 'system', content: '不该出现' },
        { role: 'assistant', content: '**回答**', toolTrace: null, modelLabel: null },
      ],
    };
    const { api } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 's1', title: '', createdAt: Date.now() }],
      sessionDetail: session,
    });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    expect($('#ask-history').textContent).toContain('未命名会话');
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('回答'));
    expect($('#ask-messages').textContent).not.toContain('不该出现');
    expect($('#ask-model-select').value).toBe('m1');
  });

  it('会话读取失败与删除失败都显示可重试错误，不崩溃', async () => {
    const { api } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 's1', title: '黄金分析' }],
      sessionDetail: { id: 's1', messages: [] },
    });
    const originalGet = api.get;
    const originalPost = api.post;
    api.get = async (path) => {
      if (path.startsWith('api/ai/sessions/')) throw new Error('会话读取失败');
      return originalGet(path);
    };
    api.post = async (path, body) => {
      if (path === 'api/ai/sessions' && body.action === 'delete') throw new Error('删除失败');
      return originalPost(path, body);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-history').textContent.includes('会话加载失败'));

    $('#ask-history [data-history-act="retry"]').click();
    await waitFor(() => $('#ask-history [data-session-delete="s1"]'));
    $('#ask-history [data-session-delete="s1"]').click();
    await waitFor(() => $('#ask-history').textContent.includes('会话加载失败'));
  });

  it('删除当前会话会清空消息区回到空状态', async () => {
    const session = {
      id: 's1', title: '黄金分析', messages: [{ role: 'user', content: '你好' }],
    };
    const { api, calls } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 's1', title: '黄金分析' }],
      sessionDetail: session,
    });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('你好'));
    $('#ask-history [data-session-delete="s1"]').click();
    await waitFor(() => $('#ask-messages [data-starter]'));
    expect(calls.post.at(-1).body).toEqual({ action: 'delete', id: 's1' });
  });

  it('新对话清空当前会话与消息，并取消历史侧栏高亮', async () => {
    const { api } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 's1', title: '黄金分析' }],
      sessionDetail: { id: 's1', messages: [{ role: 'user', content: '旧问题' }] },
    });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="s1"]'));
    $('#ask-history [data-session-id="s1"]').click();
    await waitFor(() => $('#ask-messages').textContent.includes('旧问题'));
    expect($('.ask-history-item.is-active')).not.toBeNull();
    $('#ask-new-btn').click();
    expect($('#ask-messages').textContent).not.toContain('旧问题');
    expect($$('#ask-messages [data-starter]').length).toBeGreaterThanOrEqual(4);
    expect($('.ask-history-item.is-active')).toBeNull();
    expect($('#ask-history').hidden).toBe(false);
  });

  it('模型配置保存后 onChanged 会重新拉取模型列表', async () => {
    let models = [MODEL];
    const { api } = fakeAskApi({ models: [MODEL] });
    const originalGet = api.get;
    api.get = async (path) => {
      if (path === 'api/ai/models') return { data: { ok: true, models, envPreset: null }, status: 200, fetchedAt: 0 };
      return originalGet(path);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-models-btn').click();
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
    const dialog = document.querySelector('dialog.ask-models-dialog');
    await waitFor(() => dialog.querySelector('[data-model-act="edit"]'));
    models = [MODEL, { ...MODEL, id: 'm9', name: '新模型', isDefault: false }];
    dialog.querySelector('[data-model-act="edit"]').click();
    dialog.querySelector('[name="name"]').value = '改名';
    dialog.querySelector('[data-model-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => $('#ask-model-select option[value="m9"]'));
  });

  it('卸载时清掉尚未触发的正文重绘定时器', async () => {
    const manual = manualSSE();
    const timers = [];
    const fakeWin = {
      setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
      clearTimeout: vi.fn(),
    };
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window: fakeWin, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '流式测试';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    manual.push('delta', { text: '流式中' });
    await waitFor(() => timers.length > 0);
    askView.unmountAsk();
    expect(fakeWin.clearTimeout).toHaveBeenCalled();
  });

  it('空输入、Shift+Enter 与生成中的 Enter 都不会发起请求', async () => {
    const manual = manualSSE();
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));

    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    $('#ask-input').dispatchEvent(Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter', shiftKey: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.ask).toHaveLength(0);

    $('#ask-input').value = '第一问';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    $('#ask-input').dispatchEvent(Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.ask).toHaveLength(1);
  });

  it('空状态主按钮打开模型配置弹窗', async () => {
    const { api } = fakeAskApi({ models: [] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('[data-ask-act="configure"]'));
    $('[data-ask-act="configure"]').click();
    await waitFor(() => document.querySelector('dialog.ask-models-dialog'));
  });

  it('停止后 onAsk 拒绝 AbortError，回答标记为已停止并可开新对话', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: abortAwareAsk() });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '慢慢答';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    await waitFor(() => $('#ask-send').textContent === '停止');
    $('#ask-send').click();
    await waitFor(() => $('#ask-messages').textContent.includes('已停止生成'));
    expect($('#ask-send').textContent).toBe('发送');

    $('#ask-new-btn').click();
    expect($('#ask-messages').textContent).not.toContain('已停止生成');
  });

  it('生成中开新对话会中止请求并回到空状态', async () => {
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: abortAwareAsk() });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '第一问';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    $('#ask-new-btn').click();
    await waitFor(() => $('#ask-send').textContent === '发送');
    expect($$('#ask-messages [data-starter]').length).toBeGreaterThanOrEqual(4);
  });

  it('会话详情缺失时在历史栏显示会话不存在', async () => {
    const { api } = fakeAskApi({
      models: [MODEL],
      sessions: [{ id: 'gone', title: '已删除' }],
      sessionDetail: null,
    });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    await waitFor(() => $('#ask-history [data-session-id="gone"]'));
    $('#ask-history [data-session-id="gone"]').click();
    await waitFor(() => $('#ask-history').textContent.includes('会话加载失败'));
  });

  it('生成结束后刷新历史失败会显示可重试提示', async () => {
    let sessionCalls = 0;
    const { api } = fakeAskApi({ models: [MODEL] });
    const originalGet = api.get;
    api.get = async (path) => {
      if (path === 'api/ai/sessions') {
        sessionCalls += 1;
        if (sessionCalls > 1) throw new Error('sessions down');
      }
      return originalGet(path);
    };
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '刷新历史';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => $('#ask-messages').textContent.includes('结论'));
    await waitFor(() => $('#ask-history').textContent.includes('会话加载失败'));
  });

  it('连续 delta 只排一次重绘，卸载时清掉定时器', async () => {
    const manual = manualSSE();
    const timers = [];
    const fakeWin = {
      setTimeout: (fn) => { timers.push(fn); return timers.length; },
      clearTimeout: vi.fn(),
    };
    const { api, calls } = fakeAskApi({ models: [MODEL], onAsk: () => manual.response });
    askView.mountAsk('', { api, document, window: fakeWin, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    $('#ask-input').value = '连发';
    $('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.ask.length === 1);
    manual.push('delta', { text: '一' });
    manual.push('delta', { text: '二' });
    await waitFor(() => timers.length > 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(timers).toHaveLength(1);
  });

  it('重复 mount 会先卸载上一份实例', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    askView.mountAsk('', { api, document, window, quotes });
    await waitFor(() => $('#ask-model-select option[value="m1"]'));
    expect($$('#ask-model-select')).toHaveLength(1);
  });
});

describe('ask-assist：延伸追问提取、兜底生成与复制辅助', () => {
  it('copyIconHtml 输出 24x24 1.5px 描边 copy 线性图标并支持尺寸与类名', () => {
    const def = asText(copyIconHtml());
    expect(def).toContain('viewBox="0 0 24 24"');
    expect(def).toContain('stroke-width="1.5"');
    expect(def).toContain('aria-hidden="true"');
    expect(def).toContain('<rect x="9" y="9" width="13" height="13" rx="2"');
    expect(def).toContain('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
    const custom = asText(copyIconHtml(16, 'ask-copy-ico'));
    expect(custom).toContain('width="16" height="16"');
    expect(custom).toContain('class="ui-ico ask-copy-ico"');
    const fallbackSize = asText(copyIconHtml(0));
    expect(fallbackSize).toContain('width="13" height="13"');
  });

  it('extractFollowups 识别并剥离闭合 JSON 数组，去重、过滤超长(>56)并限最多 3 条', () => {
    const longItem = '追'.repeat(57);
    const raw = [
      '## 结论',
      '黄金走强。',
      '',
      '```followups',
      JSON.stringify(['  对比内外盘金价价差  ', '对比内外盘金价价差', '', 123, longItem, '查美债10Y联动', '检索近24小时宏观快讯', '第四条被截断']),
      '```',
    ].join('\n');
    const res = extractFollowups(raw);
    expect(res.markdown).toBe('## 结论\n黄金走强。');
    expect(res.followups).toEqual([
      '对比内外盘金价价差',
      '查美债10Y联动',
      '检索近24小时宏观快讯',
    ]);
  });

  it('extractFollowups 兼容 Markdown 列表格式与空/非字符串输入，不误伤普通代码块', () => {
    const listText = [
      '正文内容',
      '```js',
      'const a = 1;',
      '```',
      '```followup',
      '- 查昨涨停今日溢价',
      '* 查主力资金流向',
      '1. "查看近期日K走势"',
      '```',
    ].join('\n');
    const res = extractFollowups(listText);
    expect(res.markdown).toContain('```js\nconst a = 1;\n```');
    expect(res.markdown).not.toContain('followup');
    expect(res.followups).toEqual(['查昨涨停今日溢价', '查主力资金流向', '查看近期日K走势']);

    expect(extractFollowups('')).toEqual({ markdown: '', followups: [] });
    expect(extractFollowups(null)).toEqual({ markdown: '', followups: [] });
    expect(extractFollowups('正文\n```followups\n   \n```')).toEqual({ markdown: '正文', followups: [] });
    expect(extractFollowups('正文\n```followups\n{"k":"v"}\n```')).toEqual({ markdown: '正文', followups: ['{"k":"v"}'] });
  });

  it('extractFollowups 与 markdownToSafeHtml 剥离流式未闭合的 ```followups 块防闪烁', () => {
    const streaming = '第一段结论\n\n```followups\n["半截追问';
    const res = extractFollowups(streaming);
    expect(res.markdown).toBe('第一段结论');
    expect(res.followups).toEqual([]);

    const htmlClosed = asText(markdownToSafeHtml('正文\n\n```followups\n["追问A"]\n```'));
    expect(htmlClosed).toBe('<p>正文</p>');
    const htmlStreaming = asText(markdownToSafeHtml(streaming));
    expect(htmlStreaming).toBe('<p>第一段结论</p>');
  });

  it('resolveFollowups 优先采用模型显式 followups，缺失时基于成功 toolTrace 生成兜底追问', () => {
    const explicit = resolveFollowups('结论\n```followups\n["自定义追问"]\n```', [
      { tool: 'get_global_quotes', ok: true },
    ]);
    expect(explicit).toEqual(['自定义追问']);

    expect(resolveFollowups('仅正文', [])).toEqual([]);
    expect(resolveFollowups('仅正文', null)).toEqual([]);
    expect(resolveFollowups('仅正文', [{ tool: 'get_global_quotes', ok: false }])).toEqual([]);

    expect(resolveFollowups('涨停分析', [{ tool: 'get_a_share_pool', args: { kind: 'zt' }, ok: true }])[0]).toContain('昨');
    expect(resolveFollowups('溢价分析', [{ tool: 'get_a_share_pool', args: { kind: 'yzt' }, ok: true }])[0]).toContain('涨停池');
    expect(resolveFollowups('K线分析', [{ tool: 'get_a_share_kline', args: { code: '600519' }, ok: true }])[0]).toContain('600519');
    expect(resolveFollowups('K线无参', [{ tool: 'get_a_share_kline', args: {}, ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('报价', [{ tool: 'get_a_share_quotes', args: { codes: ['000001'] }, ok: true }])[0]).toContain('000001');
    expect(resolveFollowups('报价无参', [{ tool: 'get_a_share_quotes', args: {}, ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('资金流个股', [{ tool: 'get_a_share_fund_flow', args: { code: '300750' }, ok: true }])[0]).toContain('300750');
    expect(resolveFollowups('资金流北向', [{ tool: 'get_a_share_fund_flow', args: {}, ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('搜股', [{ tool: 'search_a_share', args: { query: '茅台' }, ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('全球报价', [{ tool: 'get_global_quotes', ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('详情有id', [{ tool: 'get_asset_detail', args: { id: 'gold-intl' }, ok: true }])[0]).toContain('gold-intl');
    expect(resolveFollowups('详情无id', [{ tool: 'get_asset_detail', args: {}, ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('黄金对比', [{ tool: 'get_gold_comparison', ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('宏观相关', [{ tool: 'get_macro_correlations', ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('解释卡', [{ tool: 'get_asset_explanation', ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('快讯检索', [{ tool: 'search_events_and_news', ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('宏观日历', [{ tool: 'get_macro_calendar_and_study', ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('隔夜复盘', [{ tool: 'get_overnight_briefing_and_alerts', ok: true }]).length).toBeGreaterThanOrEqual(2);
    expect(resolveFollowups('未知工具', [{ tool: 'custom_readonly_tool', ok: true }]).length).toBeGreaterThanOrEqual(2);
  });

  it('formatAnswerForCopy 剥离 followups 并附加精简数据来源脚注', () => {
    expect(formatAnswerForCopy({ content: '   ' })).toBe('');
    expect(formatAnswerForCopy({ content: '纯文本结论', toolTrace: [] })).toBe('纯文本结论');
    expect(formatAnswerForCopy({ content: '无轨迹数组结论' })).toBe('无轨迹数组结论');
    const md = formatAnswerForCopy({
      content: '### 结论\n\n| 标的 | 现价 |\n| --- | --- |\n| 黄金 | 2650 |\n\n```followups\n["追问1"]\n```',
      toolTrace: [
        { tool: 'get_global_quotes', ok: true, source: 'sina', asOf: '2026-11-16T10:00:00+08:00' },
        { tool: 'get_global_quotes', ok: true, source: 'sina', asOf: '2026-11-16T10:00:00+08:00' },
        { tool: 'get_gold_comparison', ok: true, source: 'cnbc' },
        { tool: 'get_asset_explanation', ok: true },
        { tool: 'search_events_and_news', ok: false, error: 'timeout' },
      ],
    });
    expect(md).not.toContain('followups');
    expect(md).toContain('| 黄金 | 2650 |');
    expect(md).toContain('> 数据来源：get_global_quotes(sina · 2026-11-16T10:00:00+08:00)；get_gold_comparison(cnbc)；get_asset_explanation');
    expect(md).not.toContain('search_events_and_news');
  });

  it('copyTextWithFeedback 覆盖 Clipboard 成功、execCommand 降级、失败态、连续重播与定时器清理', async () => {
    const btn = document.createElement('button');
    const tip = document.createElement('span');
    tip.setAttribute('role', 'status');
    const timers = new Map();
    let seq = 0;
    const fakeWin = {
      setTimeout: vi.fn((fn) => {
        const id = ++seq;
        timers.set(id, fn);
        return id;
      }),
      clearTimeout: vi.fn((id) => {
        timers.delete(id);
      }),
    };
    const writeText = vi.fn().mockResolvedValue(undefined);

    // 1) Clipboard 成功 + 不禁用按钮
    const ok1 = await copyTextWithFeedback(btn, '内容1', {
      tipEl: tip,
      navigatorObj: { clipboard: { writeText } },
      doc: document,
      win: fakeWin,
    });
    expect(ok1).toBe(true);
    expect(writeText).toHaveBeenCalledWith('内容1');
    expect(btn.disabled).toBe(false);
    expect(btn.hasAttribute('data-copied')).toBe(true);
    expect(tip.textContent).toBe('已复制');

    // 2) 连续相同文案追加   触发屏幕阅读器重播，并清掉上一个定时器
    const ok2 = await copyTextWithFeedback(btn, '内容2', {
      tipEl: tip,
      navigatorObj: { clipboard: { writeText } },
      doc: document,
      win: fakeWin,
    });
    expect(ok2).toBe(true);
    expect(fakeWin.clearTimeout).toHaveBeenCalledTimes(1);
    expect(tip.textContent).toBe('已复制 ');

    // 触发 2000ms 定时器自动复位
    for (const fn of [...timers.values()]) fn();
    timers.clear();
    expect(btn.hasAttribute('data-copied')).toBe(false);
    expect(tip.textContent).toBe('');

    // 3) Clipboard 拒绝 → 降级 textarea + execCommand('copy') 成功
    const execMock = vi.fn(() => true);
    document.execCommand = execMock;
    const ok3 = await copyTextWithFeedback(btn, '降级文本', {
      tipEl: tip,
      navigatorObj: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } },
      doc: document,
      win: fakeWin,
    });
    expect(ok3).toBe(true);
    expect(execMock).toHaveBeenCalledWith('copy');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(btn.hasAttribute('data-copied')).toBe(true);

    // 4) 无 clipboard 且 execCommand 返回 false → data-failed 与 复制失败
    document.execCommand = vi.fn(() => false);
    const fail1 = await copyTextWithFeedback(btn, '失败文本', {
      tipEl: tip,
      navigatorObj: null,
      doc: document,
      win: fakeWin,
    });
    expect(fail1).toBe(false);
    expect(btn.hasAttribute('data-copied')).toBe(false);
    expect(btn.hasAttribute('data-failed')).toBe(true);
    expect(tip.textContent).toBe('复制失败');

    // 5) execCommand 抛异常 → 安全移除临时 textarea 并标记失败
    document.execCommand = vi.fn(() => { throw new Error('blocked'); });
    const fail2 = await copyTextWithFeedback(btn, '异常文本', {
      tipEl: tip,
      navigatorObj: {},
      doc: document,
      win: fakeWin,
    });
    expect(fail2).toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(tip.textContent).toBe('复制失败 ');

    // 6) 卸载清理所有挂起定时器
    expect(timers.size).toBeGreaterThan(0);
    clearCopyFeedbackTimers();
    expect(timers.size).toBe(0);
    delete document.execCommand;
  });
});

describe('ask-charts：可交互 K 线、折线切片与传导节点标的映射', () => {
  it('renderKline 输出十字准星、浮层容器与键盘可聚焦蜡烛热区（含开高低收涨幅）', () => {
    const out = asText(markdownToSafeHtml([
      '```chart',
      JSON.stringify({
        type: 'kline',
        title: '黄金日K',
        unit: 'USD',
        data: [
          { date: '11-14', open: 0, high: 10, low: 0, close: 0 },
          { date: '11-15', open: 2600, high: 2640, low: 2590, close: 2630 },
          { date: '11-16', open: 2630, high: 2665, low: 2620, close: 2656.3 },
        ],
      }),
      '```',
    ].join('\n')));
    const wrap = document.createElement('div');
    wrap.innerHTML = out;

    const svg = wrap.querySelector('svg.md-chart-svg');
    expect(svg.getAttribute('role')).toBe('group');
    expect(wrap.querySelector('line.md-chart-crosshair')?.hasAttribute('hidden')).toBe(true);
    expect(wrap.querySelector('.md-chart-tip')?.hasAttribute('hidden')).toBe(true);

    const hits = wrap.querySelectorAll('g.md-kline-hit');
    expect(hits).toHaveLength(3);
    expect(hits[0].getAttribute('tabindex')).toBe('0');
    expect(hits[0].dataset.chartTip).toBe('kline');
    expect(hits[0].dataset.tipRows).toContain('涨幅 0.00%');
    expect(hits[2].dataset.tipTitle).toBe('11-16');
    expect(hits[2].dataset.tipRows).toContain('开 2630 USD');
    expect(hits[2].dataset.tipRows).toContain('收 2656.3 USD');
    expect(hits[2].dataset.tipRows).toContain('涨幅 +1.00%');
    expect(Number(hits[2].dataset.tipX)).toBeGreaterThan(0);
  });

  it('renderLine 输出全高透明切片热区、十字准星与多序列数据行', () => {
    const out = asText(markdownToSafeHtml([
      '```chart',
      JSON.stringify({
        type: 'line',
        title: '利差对比',
        unit: '%',
        series: [
          { name: '美债10Y', data: [{ label: '11-14', value: 4.35 }, { label: '11-15', value: 4.42 }, { label: '11-16', value: 4.48 }] },
          { name: '美债2Y', data: [{ label: '11-14', value: 4.2 }, { label: '11-15', value: 4.25 }] },
        ],
      }),
      '```',
    ].join('\n')));
    const wrap = document.createElement('div');
    wrap.innerHTML = out;

    expect(wrap.querySelector('svg.md-chart-svg')?.getAttribute('role')).toBe('group');
    expect(wrap.querySelector('line.md-chart-crosshair')?.hasAttribute('hidden')).toBe(true);
    expect(wrap.querySelector('.md-chart-tip')?.hasAttribute('hidden')).toBe(true);

    const slices = wrap.querySelectorAll('rect.md-line-hit');
    expect(slices).toHaveLength(3);
    expect(slices[1].getAttribute('tabindex')).toBe('0');
    expect(slices[1].dataset.chartTip).toBe('line');
    expect(slices[1].dataset.tipTitle).toBe('11-15');
    expect(slices[1].dataset.tipRows).toBe('美债10Y 4.42 %|美债2Y 4.25 %');
    // 第二序列少一个点时安全回退到末点，不越界崩溃
    expect(slices[2].dataset.tipRows).toContain('美债10Y 4.48 %');
  });

  it('resolveGraphAssetId 与 renderGraph 映射站内标的 ID 并输出 role="button" 可交互节点', () => {
    expect(resolveGraphAssetId('国际金价')).toBe('gold-intl');
    expect(resolveGraphAssetId('国内金价（沪金）')).toBe('gold-cn');
    expect(resolveGraphAssetId('美债收益率')).toBe('us10y');
    expect(resolveGraphAssetId('布伦特原油')).toBe('brent');
    expect(resolveGraphAssetId('WTI原油')).toBe('oil');
    expect(resolveGraphAssetId('纳指波动率')).toBe('vxn');
    expect(resolveGraphAssetId('纳指100')).toBe('ndx100');
    expect(resolveGraphAssetId('sp500')).toBe('sp500');
    expect(resolveGraphAssetId('未知概念节点', 'gold-intl')).toBe('gold-intl');
    expect(resolveGraphAssetId('纯宏观叙事概念', 'n9')).toBe('');
    expect(resolveGraphAssetId('', '')).toBe('');

    const out = asText(markdownToSafeHtml([
      '```chart',
      JSON.stringify({
        type: 'graph',
        title: '传导图',
        nodes: [
          { id: 'n1', label: '美债收益率', detail: '+8bp 抬升', tone: 'warn' },
          { id: 'n2', label: '实际利率预期', detail: '贴现率上行', tone: 'neutral' },
          { id: 'n3', label: '国际金价', detail: '短线承压', tone: 'down' },
        ],
        edges: [
          { from: 'n1', to: 'n2', label: '推升' },
          { from: 'n2', to: 'n3', label: '压制' },
        ],
      }),
      '```',
    ].join('\n')));
    const wrap = document.createElement('div');
    wrap.innerHTML = out;

    const nodes = wrap.querySelectorAll('g.md-graph-node');
    expect(nodes).toHaveLength(3);
    expect(nodes[0].getAttribute('role')).toBe('button');
    expect(nodes[0].getAttribute('tabindex')).toBe('0');
    expect(nodes[0].dataset.graphNode).toBe('n1');
    expect(nodes[0].dataset.graphLabel).toBe('美债收益率');
    expect(nodes[0].dataset.graphDetail).toBe('+8bp 抬升');
    expect(nodes[0].dataset.assetId).toBe('us10y');
    expect(nodes[1].dataset.assetId).toBe('');
    expect(nodes[2].dataset.assetId).toBe('gold-intl');
  });
});

describe('Milestone A 工作区交互：复制、追问、图表十字线与节点 Popover', () => {
  let askEl;
  beforeEach(() => {
    askEl = document.getElementById('ask');
  });
  afterEach(() => {
    askView.unmountAsk();
  });
  it('renderAskAnswerHTML 仅在完成且非空时渲染复制栏，仅在最后一条正常完成消息渲染追问建议', () => {
    const streamingOut = asText(askView.renderAskAnswerHTML({
      content: '生成中正文',
      streaming: true,
    }, { isLast: true }));
    expect(streamingOut).not.toContain('ask-copy-btn');
    expect(streamingOut).not.toContain('ask-followups');

    const doneOut = asText(askView.renderAskAnswerHTML({
      content: '**结论**\n```followups\n["查国际金价日线", "查近期宏观事件"]\n```',
      toolTrace: [{ tool: 'get_global_quotes', ok: true, source: 'sina', asOf: '10:00' }],
    }, { isLast: true }));
    expect(doneOut).toContain('class="ask-msg-foot"');
    expect(doneOut).toContain('class="ask-copy-btn"');
    expect(doneOut).toContain('<svg');
    expect(doneOut).toContain('class="ask-copy-tip" role="status"');
    expect(doneOut).toContain('class="ask-followups"');
    expect(doneOut).toContain('data-followup="查国际金价日线"');
    expect(doneOut).not.toContain('followups\n');

    const nonLastOut = asText(askView.renderAskAnswerHTML({
      content: '**结论**\n```followups\n["查国际金价日线"]\n```',
    }, { isLast: false }));
    expect(nonLastOut).toContain('class="ask-copy-btn"');
    expect(nonLastOut).not.toContain('class="ask-followups"');

    const errOut = asText(askView.renderAskAnswerHTML({
      content: '部分内容',
      error: '网络中断',
    }, { isLast: true }));
    expect(errOut).not.toContain('class="ask-followups"');

    const stoppedOut = asText(askView.renderAskAnswerHTML({
      content: '部分内容',
      stopped: true,
    }, { isLast: true }));
    expect(stoppedOut).not.toContain('class="ask-followups"');
  });

  it('点击复制按钮写入带来源引用的干净 Markdown，点击追问建议发起多轮对话且保留上下文', async () => {
    const written = [];
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (txt) => {
          written.push(txt);
        },
      },
    });

    let round = 0;
    const { api, calls } = fakeAskApi({
      models: [{ id: 'm1', name: 'DeepSeek', isDefault: true }],
      onAsk: (body) => {
        round += 1;
        if (round === 1) {
          const content = '第一轮结论\n```followups\n["继续查美债10年期走势"]\n```';
          return sseResponse([
            { type: 'session', data: { session: { id: 's-multi', title: body.question } } },
            { type: 'tool_result', data: { id: 't1', tool: 'get_global_quotes', ok: true, source: 'sina', asOf: '10:30' } },
            { type: 'delta', data: { text: content } },
            {
              type: 'done',
              data: {
                sessionId: 's-multi',
                message: {
                  role: 'assistant',
                  content,
                  toolTrace: [{ tool: 'get_global_quotes', ok: true, source: 'sina', asOf: '10:30' }],
                  modelLabel: 'DeepSeek',
                },
              },
            },
          ]);
        }
        const content2 = '第二轮结论\n```followups\n["对比美元指数联动"]\n```';
        return sseResponse([
          { type: 'delta', data: { text: content2 } },
          {
            type: 'done',
            data: {
              sessionId: 's-multi',
              message: { role: 'assistant', content: content2, toolTrace: [], modelLabel: 'DeepSeek' },
            },
          },
        ]);
      },
    });

    askView.mountAsk('', { api, document, window, quotes: [] });
    await waitFor(() => askEl.querySelector('#ask-model-select option[value="m1"]'));

    const input = askEl.querySelector('#ask-input');
    input.value = '金价怎么看';
    askEl.querySelector('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => askEl.querySelector('.ask-copy-btn'));

    const copyBtn = askEl.querySelector('.ask-copy-btn');
    expect(copyBtn).toBeTruthy();
    copyBtn.click();
    await waitFor(() => copyBtn.hasAttribute('data-copied'));

    expect(written).toHaveLength(1);
    expect(written[0]).toContain('第一轮结论');
    expect(written[0]).not.toContain('followups');
    expect(written[0]).toContain('> 数据来源：get_global_quotes(sina · 10:30)');
    expect(copyBtn.hasAttribute('data-copied')).toBe(true);
    expect(copyBtn.disabled).toBe(false);
    expect(askEl.querySelector('.ask-copy-tip')?.textContent).toBe('已复制');

    const chip = askEl.querySelector('.ask-followup-chip');
    expect(chip?.dataset.followup).toBe('继续查美债10年期走势');
    chip.click();
    await waitFor(() => askEl.querySelectorAll('.ask-copy-btn').length === 2);

    expect(calls.ask).toHaveLength(2);
    expect(calls.ask[1].body.question).toBe('继续查美债10年期走势');
    const articles = askEl.querySelectorAll('.ask-msg');
    expect(articles).toHaveLength(4);
    expect(askEl.textContent).toContain('第一轮结论');
    expect(askEl.textContent).toContain('第二轮结论');
    const followupGroups = askEl.querySelectorAll('.ask-followups');
    expect(followupGroups).toHaveLength(1);
    expect(followupGroups[0].textContent).toContain('对比美元指数联动');
  });

  it('K 线/折线悬停与聚焦显示十字参考线与浮层，Esc 可关闭且不转移焦点；关系图节点支持点击/键盘菜单与追问闭环', async () => {
    const chartReply = [
      '综合图表分析：',
      '```kline',
      JSON.stringify({
        title: '沪金日线',
        unit: '元/克',
        data: [
          { date: '11-12', open: 600, high: 610, low: 598, close: 608 },
          { date: '11-13', open: 608, high: 615, low: 605, close: 612 },
          { date: '11-14', open: 612, high: 614, low: 602, close: 604 },
          { date: '11-15', open: 604, high: 618, low: 603, close: 616 },
        ],
      }),
      '```',
      '```chart',
      JSON.stringify({
        type: 'line',
        title: '溢价走势',
        unit: '%',
        series: [{ name: '沪金溢价', data: [{ date: '11-12', value: 1.1 }, { date: '11-13', value: 1.4 }, { date: '11-14', value: 0.9 }] }],
      }),
      '```',
      '```graph',
      JSON.stringify({
        title: '黄金传导链',
        nodes: [
          { id: 'n1', label: '国际金价', detail: '+1.5%', tone: 'up' },
          { id: 'n2', label: '实际利率预期', detail: '-8bp', tone: 'down' },
        ],
        edges: [{ from: 'n2', to: 'n1', label: '压制缓解' }],
      }),
      '```',
    ].join('\n');

    let askCount = 0;
    const { api, calls } = fakeAskApi({
      models: [{ id: 'm1', name: 'DeepSeek', isDefault: true }],
      onAsk: () => {
        askCount += 1;
        return sseResponse([
          { type: 'session', data: { session: { id: 's-chart', title: '图表测试' } } },
          {
            type: 'done',
            data: {
              sessionId: 's-chart',
              message: {
                role: 'assistant',
                content: askCount === 1 ? chartReply : '节点追问回复',
                toolTrace: [],
                modelLabel: 'DeepSeek',
              },
            },
          },
        ]);
      },
    });

    askView.mountAsk('', { api, document, window, quotes: [] });
    await waitFor(() => askEl.querySelector('#ask-model-select option[value="m1"]'));

    askEl.querySelector('#ask-input').value = '画图分析';
    askEl.querySelector('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => askEl.querySelector('.md-kline-hit'));

    const klineHits = askEl.querySelectorAll('.md-kline-hit');
    expect(klineHits.length).toBe(4);
    const klineFig = askEl.querySelector('.md-chart-kline');
    const klineTip = klineFig.querySelector('.md-chart-tip');
    const klineCross = klineFig.querySelector('.md-chart-crosshair');

    klineHits[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(klineTip.hidden).toBe(false);
    expect(klineCross.hasAttribute('hidden')).toBe(false);
    expect(klineTip.textContent).toContain('11-12');
    expect(klineTip.textContent).toContain('开 600 元/克');

    klineHits[3].focus();
    klineHits[3].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(klineTip.textContent).toContain('11-15');
    expect(document.activeElement).toBe(klineHits[3]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(klineTip.hidden).toBe(true);
    expect(klineCross.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(klineHits[3]);

    const lineHit = askEl.querySelector('.md-line-hit');
    const lineFig = askEl.querySelector('.md-chart-line');
    const lineTip = lineFig.querySelector('.md-chart-tip');
    lineHit.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(lineTip.hidden).toBe(false);
    expect(lineTip.textContent).toContain('沪金溢价 1.1 %');
    lineHit.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: askEl.querySelector('#ask-form') }));
    expect(lineTip.hidden).toBe(true);

    const nodes = askEl.querySelectorAll('.md-graph-node');
    expect(nodes.length).toBe(2);
    nodes[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const pop = askEl.querySelector('#ask-graph-popover');
    expect(pop).toBeTruthy();
    expect(pop.hidden).toBe(false);
    expect(pop.textContent).toContain('国际金价');
    expect(pop.textContent).toContain('+1.5%');
    const detailLink = pop.querySelector('.ask-graph-popover-link');
    expect(detailLink?.getAttribute('href')).toBe('#/d/gold-intl');

    nodes[1].focus();
    nodes[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(pop.hidden).toBe(false);
    expect(pop.textContent).toContain('实际利率预期');
    expect(pop.querySelector('.ask-graph-popover-link')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(pop.hidden).toBe(true);
    expect(document.activeElement).toBe(nodes[1]);

    nodes[1].focus();
    nodes[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(pop.hidden).toBe(false);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pop.hidden).toBe(true);

    nodes[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pop.hidden).toBe(false);
    const followupBtn = pop.querySelector('[data-graph-followup]');
    followupBtn.click();
    await waitFor(() => askEl.querySelectorAll('.ask-copy-btn').length === 2);
    expect(pop.hidden).toBe(true);
    expect(calls.ask).toHaveLength(2);
    expect(calls.ask[1].body.question).toContain('国际金价');
  });
});

function $$(sel) {
  return Array.from(document.querySelectorAll(sel));
}

/* ------------------------------------------------------------------ *
 * Milestone B —— A 股代码原位快览
 * ------------------------------------------------------------------ */

describe('markdownToSafeHtml：A 股代码原位识别', () => {
  const btn = (norm, raw) => `<button type="button" class="md-stock-ref" data-stock-code="${norm}">${raw}</button>`;

  it('独立出现的合法号段转快览按钮：主板/创业板/科创板/北交所', () => {
    const out = asText(markdownToSafeHtml('贵州茅台 600519，比亚迪 002148，宁德 300750，中芯 688981，万通 920001'));
    for (const code of ['600519', '002148', '300750', '688981', '920001']) {
      expect(out).toContain(btn(code, code));
    }
  });

  it('前缀与 .SH/.SZ/.BJ 后缀归一：显示原文，data-stock-code 是规范代码', () => {
    const out = asText(markdownToSafeHtml('600519.SH sh600519 SZ002148 002148.sz bj920001 920001.BJ'));
    expect(out).toContain(btn('600519', '600519.SH'));
    expect(out).toContain(btn('sh600519', 'sh600519'));
    expect(out).toContain(btn('sz002148', 'SZ002148'));
    expect(out).toContain(btn('002148', '002148.sz'));
    expect(out).toContain(btn('bj920001', 'bj920001'));
    expect(out).toContain(btn('920001', '920001.BJ'));
  });

  it('北交所老号段 43xxxx / 83xxxx / 87xxxx / 88xxxx 识别', () => {
    const out = asText(markdownToSafeHtml('430047 830799 873169 833171'));
    for (const code of ['430047', '830799', '873169', '833171']) {
      expect(out).toContain(btn(code, code));
    }
  });

  it('反误匹配：日期、时间、百分比、小数、更长数字串、非法号段都不转', () => {
    const out = asText(markdownToSafeHtml('日期 20261116 时间 15:00:03 涨幅 10.06% 小数 12.3456 长串 1600519 范围 600519-2026 编号A600519 废码 600219x 200519 900901 999999'));
    expect(out).not.toContain('md-stock-ref');
  });

  it('行内代码与链接里的代码保持原样，不二次转换', () => {
    const out = asText(markdownToSafeHtml('代码 `600519`，链接 [600519](https://example.com/x) 与 [看 600519 行情](#/d/gold-intl)'));
    expect(out).toContain('<code>600519</code>');
    expect(out).toContain('>600519</a>');
    expect(out).toContain('看 600519 行情</a>');
    expect(out).not.toContain('md-stock-ref');
  });

  it('加粗与表格单元格里的代码也能识别，且不破坏转义', () => {
    const bold = asText(markdownToSafeHtml('**重点 600519**'));
    expect(bold).toContain('<strong>');
    expect(bold).toContain(btn('600519', '600519'));

    const table = asText(markdownToSafeHtml('| 标的 | 代码 |\n| --- | --- |\n| 茅台 | 600519 |'));
    expect(table).toContain(btn('600519', '600519'));

    const evil = asText(markdownToSafeHtml('600519 <img src=x onerror=alert(1)>'));
    expect(evil).toContain('&lt;img');
    expect(evil).not.toContain('<img');
  });
});

let askStock = null;
beforeAll(async () => {
  askStock = await import('../src/client/views/ask-stock.js');
});

const STOCK_PREVIEW = {
  ok: true,
  code: 'sh600519',
  source: 'tencent',
  asOf: '2026-11-16T15:00:03+08:00',
  stale: false,
  staleReason: null,
  quote: {
    symbol: 'sh600519',
    name: '贵州茅台',
    price: 1520.5,
    prevClose: 1500,
    open: 1505,
    change: 20.5,
    changePct: 1.3667,
    high: 1530,
    low: 1501,
    turnoverPct: 0.31,
    peTtm: 22.4,
    pb: 8.1,
    mcapYi: 19099,
    sessionTime: '20261116150003',
  },
  bars: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-10-${String((i % 20) + 1).padStart(2, '0')}`,
    open: 1480 + i,
    high: 1500 + i,
    low: 1470 + i,
    close: 1490 + i,
    volume: 25000 + i,
  })),
  klineError: null,
};

function fakeStockApi(preview = STOCK_PREVIEW, { failTimes = 0 } = {}) {
  const calls = [];
  let failures = failTimes;
  const api = {
    async get(path) {
      calls.push(path);
      if (failures > 0) {
        failures -= 1;
        throw new Error('HTTP 502');
      }
      return { data: preview, status: 200, fetchedAt: 0 };
    },
  };
  return { api, calls };
}

describe('stockDialogHTML：Loading / Error / Ready 与诚实口径', () => {
  it('Loading 态只有进度说明', () => {
    const out = asText(askStock.stockDialogHTML({ code: '600519', loading: true }));
    expect(out).toContain('正在读取 600519 行情与日 K…');
    expect(out).toContain('role="status"');
    expect(out).not.toContain('ask-stock-metrics');
    expect(out).not.toContain('ask-stock-warn');
  });

  it('Error 态给原因与重试', () => {
    const out = asText(askStock.stockDialogHTML({ code: '600519', loading: false, loadError: 'HTTP 502' }));
    expect(out).toContain('加载失败：HTTP 502');
    expect(out).toContain('data-dialog-act="reload"');
  });

  it('Ready 态：名称/代码/涨跌配色/指标网格/30 日 K 线/追问主操作，正常态无警告行', () => {
    const out = asText(askStock.stockDialogHTML({ code: '600519', loading: false, data: STOCK_PREVIEW }));
    expect(out).toContain('贵州茅台');
    expect(out).toContain('sh600519');
    expect(out).toContain('1,520.50');
    expect(out).toContain('+1.37%');
    expect(out).toContain('is-up');
    expect(out).toContain('2026-11-16T15:00:03+08:00');
    expect(out).toContain('腾讯');
    for (const label of ['今开', '昨收', '最高', '最低', '换手率', 'PE(TTM)', 'PB', '总市值']) {
      expect(out).toContain(label);
    }
    expect(out).toContain('19,099 亿');
    expect(out).toContain('近 30 日 K 线（前复权）');
    expect(out).toContain('md-chart-kline');
    expect(out).toContain('追问 贵州茅台 主力资金流与近期走势');
    expect(out).not.toContain('ask-stock-warn');
  });

  it('下跌用 is-down，null 指标不渲染', () => {
    const data = {
      ...STOCK_PREVIEW,
      quote: { ...STOCK_PREVIEW.quote, changePct: -2.5, peTtm: null, pb: null, mcapYi: null },
    };
    const out = asText(askStock.stockDialogHTML({ code: '600519', loading: false, data }));
    expect(out).toContain('is-down');
    expect(out).not.toContain('PE(TTM)');
    expect(out).not.toContain('总市值');
    expect(out).toContain('换手率');
  });

  it('stale 与 klineError 只在真发生时出现警告行', () => {
    const staleData = {
      ...STOCK_PREVIEW,
      stale: true,
      staleReason: '成交量为 0（停牌 / 未开盘 / 废码），报价非当日真实成交',
    };
    const out = asText(askStock.stockDialogHTML({ code: '600519', loading: false, data: staleData }));
    expect(out).toContain('ask-stock-warn');
    expect(out).toContain('成交量为 0');

    const bjData = { ...STOCK_PREVIEW, quote: null, bars: [], klineError: '腾讯 K 线不支持北交所', staleReason: '未取到实时行情' };
    const bjOut = asText(askStock.stockDialogHTML({ code: 'bj920001', loading: false, data: bjData }));
    expect(bjOut).toContain('腾讯 K 线不支持北交所');
    expect(bjOut).toContain('未取到实时行情');
    expect(bjOut).not.toContain('md-chart-kline');
  });

  it('无日 K 且无 klineError 时给空态说明，不造数', () => {
    const data = { ...STOCK_PREVIEW, bars: [], klineError: null };
    const out = asText(askStock.stockDialogHTML({ code: '600519', loading: false, data }));
    expect(out).toContain('暂无日 K 数据');
    expect(out).not.toContain('md-chart-kline');
  });
});

describe('openStockPreviewDialog：加载、重试、追问与关闭清理', () => {
  afterEach(() => {
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  });

  it('打开即 Loading，随后 Ready 展示 30 根 K 线与指标', async () => {
    const { api, calls } = fakeStockApi();
    const close = askStock.openStockPreviewDialog({ code: '600519', api, document });
    const dialog = document.querySelector('dialog.ask-stock-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('正在读取 600519');
    await flush();
    expect(calls).toEqual(['api/ai/stock?code=600519']);
    expect(dialog.textContent).toContain('贵州茅台');
    expect(dialog.querySelectorAll('.md-kline-hit')).toHaveLength(30);
    close();
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();
  });

  it('失败显示原因，重试成功后恢复 Ready', async () => {
    const { api, calls } = fakeStockApi(STOCK_PREVIEW, { failTimes: 1 });
    askStock.openStockPreviewDialog({ code: 'sh600519', api, document });
    await flush();
    const dialog = document.querySelector('dialog.ask-stock-dialog');
    expect(dialog.textContent).toContain('加载失败：HTTP 502');
    dialog.querySelector('[data-dialog-act="reload"]').click();
    await flush();
    expect(calls).toHaveLength(2);
    expect(dialog.textContent).toContain('贵州茅台');
  });

  it('追问：先关弹窗再回调 prompt；关闭按钮同样摘除 DOM', async () => {
    const prompts = [];
    const { api } = fakeStockApi();
    askStock.openStockPreviewDialog({ code: '600519', api, document, onFollowup: (p) => prompts.push(p) });
    await flush();
    let dialog = document.querySelector('dialog.ask-stock-dialog');
    dialog.querySelector('[data-dialog-act="followup"]').click();
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();
    expect(prompts).toEqual(['贵州茅台 主力资金流与近期走势']);

    askStock.openStockPreviewDialog({ code: '600519', api, document });
    await flush();
    dialog = document.querySelector('dialog.ask-stock-dialog');
    dialog.querySelector('[data-dialog-act="close"]').click();
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();
  });

  it('原生 close 事件（Esc）摘除弹窗并把焦点归还给触发按钮', async () => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    document.body.appendChild(trigger);
    trigger.focus();
    const { api } = fakeStockApi();
    askStock.openStockPreviewDialog({ code: '600519', api, document, triggerEl: trigger });
    await flush();
    const dialog = document.querySelector('dialog.ask-stock-dialog');
    dialog.dispatchEvent(new Event('close'));
    await flush();
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('关闭后迟到的响应不再渲染；重复 close 幂等；非法入参返回空操作', async () => {
    let resolveGet = null;
    const api = { get: () => new Promise((r) => { resolveGet = r; }) };
    const close = askStock.openStockPreviewDialog({ code: '600519', api, document });
    close();
    close();
    resolveGet({ data: STOCK_PREVIEW, status: 200, fetchedAt: 0 });
    await flush();
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();

    const { api: okApi } = fakeStockApi();
    expect(askStock.openStockPreviewDialog({ code: '', api: okApi, document })).toBeTypeOf('function');
    expect(askStock.openStockPreviewDialog({ code: '600519', api: null, document })).toBeTypeOf('function');
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();
  });

  it('加载中重复点重试不会并发打上游', async () => {
    let resolveGet = null;
    const calls = [];
    const api = { get: (p) => { calls.push(p); return new Promise((r) => { resolveGet = r; }); } };
    askStock.openStockPreviewDialog({ code: '600519', api, document });
    const dialog = document.querySelector('dialog.ask-stock-dialog');
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls).toHaveLength(1);
    resolveGet({ data: { ...STOCK_PREVIEW, quote: null, bars: [], klineError: 'x' }, status: 200, fetchedAt: 0 });
    await flush();
    expect(dialog.textContent).toContain('x');
  });
});

describe('mountAsk：A 股原位快览完整链路', () => {
  afterEach(() => {
    askView.unmountAsk();
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  });

  function stockAwareApi({ onAsk = null } = {}) {
    const base = fakeAskApi({ models: [MODEL], onAsk });
    const stockCalls = [];
    const innerGet = base.api.get;
    base.api.get = async (path) => {
      if (path.startsWith('api/ai/stock')) {
        stockCalls.push(path);
        return { data: STOCK_PREVIEW, status: 200, fetchedAt: 0 };
      }
      return innerGet(path);
    };
    return { ...base, stockCalls };
  }

  const answerWithCode = () => sseResponse([
    { type: 'session', data: { session: { id: 's-b', title: '茅台' } } },
    { type: 'delta', data: { text: '贵州茅台 600519 基本面稳健。' } },
    { type: 'done', data: { sessionId: 's-b', message: { role: 'assistant', content: '贵州茅台 600519 基本面稳健。', toolTrace: [], modelLabel: 'gpt-test' } } },
  ]);

  async function mountWithAnswer(extra = {}) {
    const apiBundle = stockAwareApi({ onAsk: () => answerWithCode(), ...extra });
    askView.mountAsk('', { api: apiBundle.api, document, window, quotes: [] });
    const askEl = document.getElementById('ask');
    await waitFor(() => askEl.querySelector('#ask-model-select option[value="m1"]'));
    const input = askEl.querySelector('#ask-input');
    input.value = '茅台怎么样';
    askEl.querySelector('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const ref = await waitFor(() => askEl.querySelector('.md-stock-ref'));
    return { askEl, ref, ...apiBundle };
  }

  it('点击正文代码按钮打开快览弹窗，追问先关弹窗再发起新一轮请求', async () => {
    const { askEl, ref, stockCalls, calls } = await mountWithAnswer();
    expect(ref.dataset.stockCode).toBe('600519');
    ref.click();
    const dialog = await waitFor(() => document.querySelector('dialog.ask-stock-dialog'));
    await waitFor(() => dialog.textContent.includes('贵州茅台'));
    expect(stockCalls).toEqual(['api/ai/stock?code=600519']);
    expect(dialog.querySelectorAll('.md-kline-hit')).toHaveLength(30);

    dialog.querySelector('[data-dialog-act="followup"]').click();
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();
    await waitFor(() => calls.ask.length === 2);
    expect(calls.ask[1].body.question).toBe('贵州茅台 主力资金流与近期走势');
    expect(askEl.textContent).toContain('贵州茅台 主力资金流与近期走势');
  });

  it('重复点击不同代码只保留一个弹窗；发起新请求与 unmount 都会关掉它', async () => {
    const { askEl, ref } = await mountWithAnswer();
    ref.click();
    await waitFor(() => document.querySelector('dialog.ask-stock-dialog'));
    ref.click();
    expect(document.querySelectorAll('dialog.ask-stock-dialog')).toHaveLength(1);

    const input = askEl.querySelector('#ask-input');
    input.value = '再看看别的';
    askEl.querySelector('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();

    const ref2 = await waitFor(() => {
      const refs = askEl.querySelectorAll('.md-stock-ref');
      return refs.length >= 2 ? refs[refs.length - 1] : null;
    });
    ref2.click();
    await waitFor(() => document.querySelector('dialog.ask-stock-dialog'));
    askView.unmountAsk();
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();
  });

  it('打开模型配置会先关掉快览弹窗', async () => {
    const { askEl, ref } = await mountWithAnswer();
    ref.click();
    await waitFor(() => document.querySelector('dialog.ask-stock-dialog'));
    askEl.querySelector('#ask-models-btn').click();
    expect(document.querySelector('dialog.ask-stock-dialog')).toBeNull();
    expect(document.querySelector('dialog.ask-models-dialog')).toBeTruthy();
  });
});

describe('mountAsk：流式结束后 is-streaming 类同步摘除（真实浏览器回归发现的残留）', () => {
  afterEach(() => {
    askView.unmountAsk();
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  });

  it('done 事件后最后一条 assistant 不再带 is-streaming', async () => {
    const { api } = fakeAskApi({ models: [MODEL] });
    askView.mountAsk('', { api, document, window, quotes: [] });
    const askEl = document.getElementById('ask');
    await waitFor(() => askEl.querySelector('#ask-model-select option[value="m1"]'));
    const input = askEl.querySelector('#ask-input');
    input.value = '金价怎么看';
    askEl.querySelector('#ask-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => askEl.querySelector('.ask-copy-btn'));
    const article = askEl.querySelector('.ask-msg.is-assistant');
    expect(article.classList.contains('is-streaming')).toBe(false);
  });
});
