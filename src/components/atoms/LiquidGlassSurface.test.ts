import { describe, expect, it } from 'vitest';
import {
  buildConvexLensMapDataUrl,
  canUseSvgLiquidGlass,
  sanitizeSvgFilterId,
} from './LiquidGlassSurface';

describe('LiquidGlassSurface', () => {
  it('sanitizes React useId filter identifiers cleanly for CSS url(#...)', () => {
    expect(sanitizeSvgFilterId(':r1a:')).toBe('gk-lens-r1a');
    expect(sanitizeSvgFilterId('«r2»')).toBe('gk-lens-r2');
    expect(sanitizeSvgFilterId('_r_3_')).toBe('gk-lens-_r_3_');
  });

  it('safely returns false in non-DOM/Node SSR environments without throwing', () => {
    expect(canUseSvgLiquidGlass()).toBe(false);
    expect(buildConvexLensMapDataUrl(344, 60, 30)).toBe('');
  });
});
