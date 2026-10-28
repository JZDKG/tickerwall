// @vitest-environment jsdom
/* ================================================================== *
 * 预期台账卡（产品 2.4 界面）
 *
 * 这一屏最容易出的两类错：
 *   · 给一个「命中率」把哪几条反了藏起来；
 *   · 把「尚未公布」写成「无法判定」——前者是还没到点，后者是数据有问题。
 * ================================================================== */

import { describe, it, expect } from 'vitest';
import { expectationsCardHTML, releaseRowHTML, gapText } from '../src/client/views/expectations.js';

const mount = (s) => {
  const el = document.createElement('div');
  el.innerHTML = s;
  return el;
};

const item = (over = {}) => ({
  title: 'CPI 同比',
  releaseAt: '2026-10-27T12:00:00.000Z',
  unit: '%',
  verdict: 'above',
  label: '高于预期',
  gap: 0.3,
  ...over,
});

const ledger = (over = {}) => ({
  ok: true,
  status: 'ok',
  checkedAt: '2026-10-28T12:00:00.000Z',
  calendarFetchedAt: '2026-10-28T11:00:00.000Z',
  released: [item()],
  pending: [item({ verdict: 'pending', label: '尚未公布', gap: null, releaseAt: '2026-10-30T12:00:00.000Z' })],
  deviated: [item()],
  total: 2,
  ...over,
});

describe('差额文本', () => {
  it('带单位与符号', () => {
    expect(gapText(item())).toBe('+0.30%');
  });

  it('幅度很小给三位小数（读者不需要 2.3000001）', () => {
    expect(gapText(item({ gap: 0.012 }))).toBe('+0.012%');
  });

  it('缺失给破折号，不给 0', () => {
    expect(gapText({ gap: null })).toBe('—');
    expect(gapText({})).toBe('—');
  });
});

describe('行', () => {
  it('带 verdict 属性，界面与判定一一对应', () => {
    const el = mount(releaseRowHTML(item()));
    expect(el.querySelector('.exp-row').dataset.verdict).toBe('above');
    expect(el.textContent).toContain('高于预期');
  });

  it('涨跌用不同徽章类名', () => {
    expect(mount(releaseRowHTML(item({ verdict: 'above' }))).querySelector('.exp-badge').className).toContain('up');
    expect(mount(releaseRowHTML(item({ verdict: 'below' }))).querySelector('.exp-badge').className).toContain('down');
  });

  it('未知 verdict 不抛，落中性', () => {
    expect(() => releaseRowHTML({ verdict: 'weird' })).not.toThrow();
    expect(mount(releaseRowHTML({ verdict: 'weird' })).querySelector('.exp-badge').className).toContain('dim');
  });
});

describe('整卡', () => {
  it('有偏差的单独一屏在最前', () => {
    const el = mount(expectationsCardHTML(ledger()));
    const dev = el.querySelector('.exp-deviated');
    expect(dev).toBeTruthy();
    expect(dev.textContent).toContain('与预期有偏差');
  });

  it('全部符合时不说「有偏差」，说清几条在附近', () => {
    const el = mount(expectationsCardHTML(ledger({ deviated: [] })));
    expect(el.querySelector('.exp-deviated')).toBeNull();
    expect(el.textContent).toContain('都在预期附近');
  });

  it('「尚未公布」与「无法判定」是两个说法，不能互相顶替', () => {
    const el = mount(expectationsCardHTML(ledger()));
    const pending = el.querySelector('.exp-pending').textContent;
    expect(pending).toContain('尚未公布');
    expect(pending).not.toContain('无法判定');
  });

  it('没有命中率（一个百分比会把相反证据藏起来）', () => {
    const html = expectationsCardHTML(ledger());
    expect(html).not.toMatch(/命中率\s*\d/);
    expect(html).not.toContain('准确率');
  });

  it('页脚写清判定口径：只用方向与量级、不表示因果', () => {
    const el = mount(expectationsCardHTML(ledger()));
    expect(el.querySelector('.exp-foot').textContent).toContain('不表示因果');
  });

  it('检查时刻与日历抓取时刻都写出来（两者不是一回事）', () => {
    const el = mount(expectationsCardHTML(ledger()));
    const foot = el.querySelector('.exp-foot').textContent;
    expect(foot).toContain('检查于');
    expect(foot).toContain('日历抓取于');
  });
});

describe('空态与不可用', () => {
  it('取不到时说清原因', () => {
    const el = mount(expectationsCardHTML({ ok: false, status: 'unavailable', reason: 'upstream 502' }));
    expect(el.querySelector('.exp-card').dataset.state).toBe('unavailable');
    expect(el.textContent).toContain('502');
  });

  it('确实没有条目时说「没有」，不说「取不到」', () => {
    const el = mount(expectationsCardHTML({ ok: true, status: 'empty', total: 0, released: [], pending: [] }));
    expect(el.querySelector('.exp-card').dataset.state).toBe('empty');
    expect(el.textContent).toContain('没有');
    expect(el.textContent).not.toContain('取不到');
  });

  it('传 null 时也不抛', () => {
    expect(() => expectationsCardHTML(null)).not.toThrow();
  });
});
