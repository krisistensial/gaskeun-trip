import { describe, expect, it } from 'vitest';
import {
  ARC_BASE_X,
  ARC_MAX_X,
  buildDottedArcPath,
  findClosestArcRow,
  getArcX,
} from './arcMath';

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

  it('finds the closest row to viewport center and returns clamped magnetic settle scrollTop', () => {
    const rows = [
      { id: 'stop-1', centerY: 260 },
      { id: 'stop-2', centerY: 400 },
      { id: 'stop-3', centerY: 540 },
    ];
    // halfH = 240 -> viewportCenter at scrollTop=145 is 385 (closest to stop-2 at 400)
    const matchMid = findClosestArcRow(rows, 145, 240, 400);
    expect(matchMid).toEqual({
      id: 'stop-2',
      targetScrollTop: 160,
      distancePx: 15,
    });

    // Clamps cleanly at top & bottom bounds
    const matchTop = findClosestArcRow(rows, 0, 280, 400);
    expect(matchTop?.targetScrollTop).toBe(0);

    const matchBottom = findClosestArcRow(rows, 360, 240, 280);
    expect(matchBottom?.id).toBe('stop-3');
    expect(matchBottom?.targetScrollTop).toBe(280);

    expect(findClosestArcRow([], 0, 240, 200)).toBeNull();
  });
});
