// @vitest-environment jsdom
/* ================================================================== *
 * Phase 3 / P3-T3：分享战报卡 + ?embed=1 嵌入挂件模式
 *
 * 验收（规格书 §3.3）：
 *   · renderShareCardSVG 对 16:9 / 3:4 产出合法、转义安全的 SVG（防 XSS）；
 *   · 含暗黑渐变背景、标题、核心价格与涨跌幅、最多 3 条归因摘要、
 *     相反证据、时间戳、快照校验 ID exp_*、品牌水印；
 *   · 解释卡与隔夜复盘面板都有 [data-action="share-card"] 按钮；
 *   · embed=1（URL query 或 hash 参数）被剥离并设 dataset.embed = '1'；
 *   · buildEmbedCode 生成标准 iframe 代码。
 * ================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const {
  renderShareCardSVG,
  buildShareCardModel,
  SHARE_CARD_ASPECTS,
  buildEmbedCode,
  isEmbedMode,
  stripEmbedParam,
  applyEmbedMode,
  resetEmbedMode,
  createDownloadShareCard,
} = await import('../src/client/shared/share-card.js');

const MODEL = {
  title: '国际金为什么这样走',
  assetName: '国际金',
  price: 2745.2,
  changePct: 0.82,
  snapshotId: 'exp_20261111_ab12cd',
  asOf: '2026-11-11T08:30:00Z',
  facts: ['美元指数走弱', '实际收益率回落', '避险需求抬升'],
  contrary: '但 CFTC 持仓显示多头并未同步增加',
};

beforeEach(() => {
  document.documentElement.removeAttribute('data-embed');
  document.body.innerHTML = '';
});

afterEach(() => {
  document.documentElement.removeAttribute('data-embed');
});

describe('renderShareCardSVG：16:9 / 3:4', () => {
  it('两种比例都产出合法 SVG，尺寸正确', () => {
    for (const [aspect, w, h] of [['16:9', 1600, 900], ['3:4', 900, 1200]]) {
      const svg = renderShareCardSVG(MODEL, { aspect });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain(`viewBox="0 0 ${w} ${h}"`);
      expect(svg.trim().endsWith('</svg>')).toBe(true);
      expect(SHARE_CARD_ASPECTS).toHaveProperty(aspect);
    }
  });

  it('非法比例回退到 16:9', () => {
    expect(renderShareCardSVG(MODEL, { aspect: 'weird' })).toContain('viewBox="0 0 1600 900"');
  });

  it('包含渐变背景、品牌水印、时间戳与快照校验 ID exp_*', () => {
    const svg = renderShareCardSVG(MODEL);
    expect(svg).toMatch(/<linearGradient/);
    expect(svg).toContain('TickerWall · Explainable Cross-Asset Terminal');
    expect(svg).toContain('exp_20261111_ab12cd');
    expect(svg).toContain('2026-11-11');
  });

  it('最多渲染 3 条归因摘要 + 相反证据提示', () => {
    const svg = renderShareCardSVG({ ...MODEL, facts: ['a', 'b', 'c', 'd', 'e'] });
    expect(svg.match(/data-share-fact/g) ?? []).toHaveLength(3);
    expect(svg).toContain('相反证据');
    expect(svg).not.toContain('>e</text>');
  });

  it('核心价格与涨跌幅可见，方向用颜色区分', () => {
    const svg = renderShareCardSVG(MODEL);
    expect(svg).toContain('2745.2');
    expect(svg).toContain('+0.82%');
    const down = renderShareCardSVG({ ...MODEL, changePct: -1.25 });
    expect(down).toContain('-1.25%');
  });

  it('XSS 注入被转义：标题/事实/证据里的标签与实体都不还原为可执行节点', () => {
    const evil = {
      ...MODEL,
      title: '<script>alert(1)</script>',
      assetName: '" onload="alert(2)',
      facts: ['<image href=x onerror=alert(3)>', '&amp; <b>bold</b>'],
      contrary: '</text><script>alert(4)</script>',
      snapshotId: 'exp_<script>bad</script>',
    };
    const svg = renderShareCardSVG(evil);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<image ');
    expect(svg).not.toContain('onload="alert(2)"');
    expect(svg).toContain('&lt;script&gt;');
    // 输入里的实体 &amp; 也必须被再转义一层，不能还原成 < / >
    expect(svg).toContain('&amp;amp; &lt;b&gt;');
    // 用 DOMParser 真解析一遍：不该多出任何脚本/图片节点
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelectorAll('script, image, foreignObject')).toHaveLength(0);
    expect(doc.documentElement.tagName).toBe('svg');
  });

  it('空模型不抛，且仍带水印', () => {
    expect(() => renderShareCardSVG(null)).not.toThrow();
    expect(renderShareCardSVG({})).toContain('TickerWall');
  });
});

describe('buildShareCardModel：从解释/复盘快照造模型', () => {
  it('从解释快照取价格/涨跌幅/前三条机制/反向证据/ID', () => {
    const m = buildShareCardModel({
      assetName: '国际金',
      quote: { price: 2745.2, changePct: 0.82 },
      explanation: {
        id: 'exp_abc123',
        asOf: '2026-11-11T08:30:00Z',
        hypotheses: [
          { label: '美元走弱', status: 'consistent' },
          { label: '实际利率回落', status: 'consistent' },
          { label: '避险需求', status: 'mixed' },
          { label: '第四条', status: 'consistent' },
        ],
        unknowns: [{ text: '缺少持仓数据' }],
      },
    });
    expect(m.snapshotId).toBe('exp_abc123');
    expect(m.facts).toHaveLength(3);
    expect(m.contrary).toContain('缺少持仓数据');
  });

  it('从隔夜复盘 items 生成模型，缺 ID 时补 exp_ 前缀', () => {
    const m = buildShareCardModel({
      title: '隔夜复盘',
      items: [{ name: 'BTC', to: 91200, movePct: 2.1 }, { name: '原油', to: 71.4, movePct: -1.1 }],
    });
    expect(m.facts.length).toBeGreaterThan(0);
    expect(m.snapshotId).toMatch(/^exp_/);
  });
});

describe('download 与按钮接入', () => {
  it('createDownloadShareCard 触发 SVG 下载，文件名带快照 ID', () => {
    const clicks = [];
    const fakeDoc = {
      createElement: () => ({ setAttribute(k, v) { this[k] = v; }, click() { clicks.push(this); }, remove() {} }),
      body: { appendChild() {} },
    };
    createDownloadShareCard(MODEL, { document: fakeDoc, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toContain('exp_20261111_ab12cd');
    expect(clicks[0].download).toMatch(/\.svg$/);
    expect(clicks[0].href).toBe('blob:x');
  });

  it('解释卡与隔夜复盘源码里都挂了 [data-action="share-card"]', () => {
    expect(read('src/client/views/explanations/card.js')).toContain('data-action="share-card"');
    expect(read('src/client/views/briefing.js')).toContain('data-action="share-card"');
  });

  it('workspace.css 提供 [data-embed="1"] 与 [data-pip="1"] 样式', () => {
    const css = read('public/styles/workspace.css');
    expect(css).toMatch(/\[data-embed="1"\]/);
    expect(css).toMatch(/\[data-pip="1"\]/);
  });
});

/* ------------------------------ Embed ------------------------------ */

describe('embed=1 解析与剥离', () => {
  it('query 与 hash 两种位置都识别', () => {
    expect(isEmbedMode('http://x/?embed=1#/d/gold-intl')).toBe(true);
    expect(isEmbedMode('http://x/#/d/gold-intl?embed=1')).toBe(true);
    expect(isEmbedMode('http://x/?embed=0#/d/gold-intl')).toBe(false);
    expect(isEmbedMode('http://x/#/d/gold-intl')).toBe(false);
    expect(isEmbedMode('')).toBe(false);
  });

  it('stripEmbedParam 从 query / hash 里剥掉 embed 参数，不动其它参数', () => {
    expect(stripEmbedParam('http://x/?embed=1&foo=2#/d/gold-intl')).toBe('http://x/?foo=2#/d/gold-intl');
    expect(stripEmbedParam('http://x/#/d/gold-intl?embed=1&foo=2')).toBe('http://x/#/d/gold-intl?foo=2');
    expect(stripEmbedParam('http://x/#/d/gold-intl')).toBe('http://x/#/d/gold-intl');
  });

  it('applyEmbedMode 设置 dataset.embed = 1，且模式粘性（剥离参数后仍保持）', () => {
    applyEmbedMode(document.documentElement, 'http://x/?embed=1#/d/gold-intl');
    expect(document.documentElement.dataset.embed).toBe('1');
    // 参数已从地址栏剥掉，后续 hashchange 不该把挂件变回完整页面
    expect(applyEmbedMode(document.documentElement, 'http://x/#/d/gold-intl')).toBe(true);
    expect(document.documentElement.dataset.embed).toBe('1');
  });

  it('resetEmbedMode 显式退出嵌入模式', () => {
    applyEmbedMode(document.documentElement, 'http://x/?embed=1');
    resetEmbedMode(document.documentElement);
    expect(document.documentElement.dataset.embed).toBeUndefined();
    expect(applyEmbedMode(document.documentElement, 'http://x/')).toBe(false);
  });

  it('router.js 接入 embed 解析', async () => {
    // 直接读源码断言接线：router 在 jsdom 里已被其它用例 import，重复 import
    // 会共享模块状态。这里验证「解析函数被调用」而非再起一份路由实例。
    const src = read('src/client/router.js');
    expect(src).toContain('isEmbedMode');
    expect(src).toContain('stripEmbedParam');
    expect(src).toContain('applyEmbedMode');
  });
});

describe('buildEmbedCode：iframe 嵌入代码', () => {
  it('生成标准 <iframe>，带宽高/懒加载/无边框与 src', () => {
    const code = buildEmbedCode('http://x/?embed=1#/d/gold-intl', { width: 640, height: 480 });
    expect(code).toContain('<iframe ');
    expect(code).toContain('src="http://x/?embed=1#/d/gold-intl"');
    expect(code).toContain('width="640"');
    expect(code).toContain('height="480"');
    expect(code).toContain('loading="lazy"');
    expect(code).toContain('frameborder="0"');
  });

  it('src 里的引号被转义，且自动补 embed=1', () => {
    const code = buildEmbedCode('http://x/#/d/gold-intl');
    expect(code).toContain('embed=1');
    expect(buildEmbedCode('http://x/"onload="alert(1)')).not.toContain('"onload="');
    expect(code).toContain('title=');
  });

  it('默认宽高为 16:9 卡片尺寸', () => {
    expect(buildEmbedCode('http://x/')).toContain('width="800"');
    expect(buildEmbedCode('http://x/')).toContain('height="450"');
  });
});
