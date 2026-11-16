import { describe, it, expect } from 'vitest';
import { ICON_PATHS, iconStr, iconHtml } from '../src/client/shared/icons.js';
import { SafeHtml, html } from '../src/client/shared/format.js';

describe('shared/icons.js', () => {
  it('renders valid SVG for every defined icon', () => {
    for (const key of Object.keys(ICON_PATHS)) {
      const svg = iconStr(key);
      expect(svg).toMatch(/^<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24"/);
      expect(svg).toContain('stroke-width="1.5"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain(ICON_PATHS[key]);
      expect(svg.endsWith('</svg>')).toBe(true);
    }
  });

  it('handles custom size, invalid size fallback, className escaping, and unknown name', () => {
    expect(iconStr('nonexistent-icon')).toBe('');
    expect(iconStr('bolt', 16, 'cal-ico')).toContain('class="ui-ico cal-ico" width="16" height="16"');
    expect(iconStr('bolt', 0)).toContain('width="14" height="14"');
    expect(iconStr('bolt', Number.NaN)).toContain('width="14" height="14"');
    expect(iconStr('star', 12, 'a"b')).toContain('class="ui-ico a&quot;b"');
  });

  it('returns SafeHtml from iconHtml that embeds unescaped inside html tagged templates', () => {
    const res = iconHtml('star-filled', 13, 'is-pin');
    expect(res).toBeInstanceOf(SafeHtml);
    const out = html`<button>${res}置顶</button>`.toString();
    expect(out).toContain('<svg class="ui-ico is-pin" width="13" height="13"');
    expect(out).toContain('置顶</button>');
  });
});
