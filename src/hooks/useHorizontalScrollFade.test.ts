import { describe, expect, it } from 'vitest';
import { computeScrollFadeState } from './useHorizontalScrollFade';

describe('useHorizontalScrollFade math (computeScrollFadeState)', () => {
  it('returns "none" when all pills fit comfortably without overflow', () => {
    expect(computeScrollFadeState(0, 360, 340)).toEqual({
      fadeLeft: false,
      fadeRight: false,
      dataFade: 'none',
    });
    // Within 4px tolerance
    expect(computeScrollFadeState(0, 360, 363)).toEqual({
      fadeLeft: false,
      fadeRight: false,
      dataFade: 'none',
    });
  });

  it('returns "right" at the start of an overflowing horizontal strip', () => {
    expect(computeScrollFadeState(0, 360, 460)).toEqual({
      fadeLeft: false,
      fadeRight: true,
      dataFade: 'right',
    });
  });

  it('returns "both" when scrolled into the middle of an overflowing strip', () => {
    expect(computeScrollFadeState(48, 360, 500)).toEqual({
      fadeLeft: true,
      fadeRight: true,
      dataFade: 'both',
    });
  });

  it('returns "left" when scrolled all the way to the right edge', () => {
    expect(computeScrollFadeState(140, 360, 500)).toEqual({
      fadeLeft: true,
      fadeRight: false,
      dataFade: 'left',
    });
  });
});
