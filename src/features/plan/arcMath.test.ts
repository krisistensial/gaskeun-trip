import { describe, expect, it } from 'vitest';
import { ARC_BASE_X, ARC_MAX_X, buildDottedArcPath, getArcX } from './arcMath';

describe('Fixed Dotted Circular Arc math (getArcX)', () => {
  it('reaches exact apex x at vertical center u = 0 and base x at edges u = ±1', () => {
    expect(getArcX(0)).toBeCloseTo(ARC_MAX_X, 5);
    expect(getArcX(-1)).toBeCloseTo(ARC_BASE_X, 5);
    expect(getArcX(1)).toBeCloseTo(ARC_BASE_X, 5);
  });

  it('is strictly symmetric and clamps out-of-range vertical coordinates cleanly', () => {
    expect(getArcX(-0.5)).toBeCloseTo(getArcX(0.5), 5);
    expect(getArcX(-0.5)).toBeGreaterThan(ARC_BASE_X);
    expect(getArcX(-0.5)).toBeLessThan(ARC_MAX_X);
    expect(getArcX(-2.5)).toBeCloseTo(ARC_BASE_X, 5);
    expect(getArcX(3.2)).toBeCloseTo(ARC_BASE_X, 5);
  });

  it('builds a valid SVG polyline path sampled from getArcX', () => {
    const d = buildDottedArcPath();
    expect(d.startsWith('M ')).toBe(true);
    expect(d.includes(' L ')).toBe(true);
  });
});
