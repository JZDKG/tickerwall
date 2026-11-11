// @vitest-environment jsdom
/* ================================================================== *
 * Phase 3 / P3-T3：分享卡按钮接线（事件委托 + 预览浮层）
 * ================================================================== */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  mountShareCard, modelFromClick, previewHTML, SHARE_PREVIEW_ID,
} from '../src/client/shared/share-card-ui.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('modelFromClick', () => {
  it('从解释卡容器读 asset id 与价格，凑出可渲染模型', () => {
    document.body.innerHTML = `<section class="explain-card" data-asset="gold-intl">
      <h3>国际金为什么这样走</h3><b>2745.2</b></section>`;
    const m = modelFromClick(document.querySelector('.explain-card'));
    expect(m.assetName).toBe('gold-intl');
    expect(m.snapshotId).toMatch(/^exp_/);
    expect(Array.isArray(m.facts)).toBe(true);
  });

  it('没有容器时用最小占位模型，不抛', () => {
    expect(() => modelFromClick(null)).not.toThrow();
    expect(modelFromClick(null).assetName).toBe('市场');
  });
});

describe('previewHTML', () => {
  it('含下载/关闭按钮，SVG 原样注入', () => {
    const html = previewHTML('<svg viewBox="0 0 1 1"></svg>');
    expect(html).toContain('<svg viewBox="0 0 1 1"></svg>');
    expect(html).toContain('data-action="share-download"');
    expect(html).toContain('data-share-dismiss="1"');
    expect(html).toContain('role="dialog"');
  });
});

describe('mountShareCard：委托监听', () => {
  it('点 [data-action="share-card"] 弹出预览浮层，Esc / 点背景关闭', () => {
    const unmount = mountShareCard();
    document.body.innerHTML = '<button data-action="share-card">生成分享卡</button>';
    document.querySelector('[data-action="share-card"]').click();
    const host = document.getElementById(SHARE_PREVIEW_ID);
    expect(host).toBeTruthy();
    expect(host.querySelector('svg')).toBeTruthy();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById(SHARE_PREVIEW_ID)).toBe(null);
    unmount();
  });

  it('解绑后按钮不再弹预览', () => {
    const unmount = mountShareCard();
    unmount();
    document.body.innerHTML = '<button data-action="share-card">生成分享卡</button>';
    document.querySelector('[data-action="share-card"]').click();
    expect(document.getElementById(SHARE_PREVIEW_ID)).toBe(null);
  });

  it('点下载按钮用当前模型触发 SVG 下载', () => {
    const calls = [];
    // 拦截 createElement 产生的 <a>，记录 download 属性
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        el.click = () => calls.push(el.getAttribute('download'));
      }
      return el;
    };
    const unmount = mountShareCard();
    document.body.innerHTML = '<button data-action="share-card">生成分享卡</button>';
    document.querySelector('[data-action="share-card"]').click();
    document.querySelector('[data-action="share-download"]').click();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^tickerwall-exp_.*\.svg$/);
    document.createElement = origCreate;
    unmount();
  });
});
