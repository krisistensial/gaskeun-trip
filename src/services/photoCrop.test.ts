import { describe, expect, it } from 'vitest';
import {
  clampPanOffset,
  computePanBounds,
  getCropOutputDimensions,
  getRotatedDimensions,
} from './photoCrop';

describe('Universal Photo Cropper math (photoCrop)', () => {
  it('returns exact preset output dimensions for hero, plan, stay, train, and avatar', () => {
    expect(getCropOutputDimensions('home-hero', 'original', 2000, 1500)).toMatchObject({
      width: 1080,
      height: 1200,
      ratioLabel: '9:10',
    });
    expect(getCropOutputDimensions('plan-cover', 'original', 2000, 1500)).toMatchObject({
      width: 1200,
      height: 675,
      ratioLabel: '16:9',
    });
    expect(getCropOutputDimensions('train-photo', 'original', 2000, 1500)).toMatchObject({
      width: 960,
      height: 720,
      ratioLabel: '4:3',
    });
    expect(getCropOutputDimensions('avatar', 'original', 2000, 1500)).toMatchObject({
      width: 256,
      height: 256,
      circular: true,
    });
  });

  it('caps album Original output at max 1600px while respecting 90deg rotation', () => {
    const dim = getCropOutputDimensions('album', 'original', 3200, 2400, 90);
    expect(dim.width).toBe(1200);
    expect(dim.height).toBe(1600);
    expect(getRotatedDimensions(3200, 2400, 90)).toEqual({ effW: 2400, effH: 3200 });
  });

  it('clamps pan offsets cleanly so image never reveals empty frame edges', () => {
    const bounds = computePanBounds(1600, 900, 0, 320, 180, 1.5);
    expect(bounds.maxOffsetX).toBeCloseTo(80, 3);
    expect(bounds.maxOffsetY).toBeCloseTo(45, 3);
    const clamped = clampPanOffset(999, -999, bounds);
    expect(clamped.x).toBeCloseTo(80, 3);
    expect(clamped.y).toBeCloseTo(-45, 3);
  });
});
