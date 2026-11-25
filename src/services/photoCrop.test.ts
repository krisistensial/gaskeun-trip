import { describe, expect, it } from 'vitest';
import {
  ALBUM_HIGH_QUALITY,
  ALBUM_MAX_DIM,
  ORIGINAL_PASSTHROUGH_MAX_BYTES,
  clampPanOffset,
  computePanBounds,
  getCropOutputDimensions,
  getRotatedDimensions,
  isSupportedImageFile,
  shouldUseOriginalPassthrough,
} from './photoCrop';

describe('Universal Photo Cropper math & Full-Res Album Passthrough (photoCrop)', () => {
  it('returns exact preset output dimensions for hero, plan, stay, train, and avatar', () => {
    expect(getCropOutputDimensions('home-hero', 'original', 2000, 1500)).toMatchObject({
      width: 1080,
      height: 1440,
      ratioLabel: '3:4',
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

  it('preserves full native resolution for 2268x4032 album photos in Original mode (never shrinks to 900x1600)', () => {
    const dim = getCropOutputDimensions('album', 'original', 2268, 4032, 0);
    expect(dim.width).toBe(2268);
    expect(dim.height).toBe(4032);
    expect(dim.quality).toBe(ALBUM_HIGH_QUALITY);
    expect(dim.ratioLabel).toBe('Original');
  });

  it('respects 90deg rotation at native resolution and only caps above 4096px', () => {
    const rotated = getCropOutputDimensions('album', 'original', 3200, 2400, 90);
    expect(rotated.width).toBe(2400);
    expect(rotated.height).toBe(3200);
    expect(getRotatedDimensions(3200, 2400, 90)).toEqual({ effW: 2400, effH: 3200 });

    const huge = getCropOutputDimensions('album', 'original', 6000, 4000, 0);
    expect(huge.width).toBe(ALBUM_MAX_DIM);
    expect(huge.height).toBe(2731);
    expect(huge.quality).toBe(0.94);
  });

  it('matches native source resolution up to 4096px for cropped album ratios without upscaling', () => {
    // 2268x4032 cropped to 4:5 -> width 2268, height 2835 (no shrinking to 1280x1600)
    const portraitCrop = getCropOutputDimensions('album', '4:5', 2268, 4032, 0);
    expect(portraitCrop.width).toBe(2268);
    expect(portraitCrop.height).toBe(2835);
    expect(portraitCrop.quality).toBe(0.94);

    // Small 800x600 image cropped to 1:1 -> 600x600 (never upscales!)
    const smallCrop = getCropOutputDimensions('album', '1:1', 800, 600, 0);
    expect(smallCrop.width).toBe(600);
    expect(smallCrop.height).toBe(600);

    // 6000x4000 cropped to 16:9 -> capped at 4096x2304
    const wideCrop = getCropOutputDimensions('album', '16:9', 6000, 4000, 0);
    expect(wideCrop.width).toBe(4096);
    expect(wideCrop.height).toBe(2304);
  });

  it('enables Original File Passthrough only when untouched in album Original mode and <= 12 MB', () => {
    const base = {
      preset: 'album' as const,
      albumRatio: 'original' as const,
      zoom: 1,
      panX: 0,
      panY: 0,
      rotationDeg: 0,
      fileSizeBytes: 4.5 * 1024 * 1024,
    };

    expect(shouldUseOriginalPassthrough(base)).toBe(true);
    expect(shouldUseOriginalPassthrough({ ...base, fileSizeBytes: ORIGINAL_PASSTHROUGH_MAX_BYTES })).toBe(true);

    // Fallback to light 4096/0.94 compression when > 12 MB
    expect(
      shouldUseOriginalPassthrough({ ...base, fileSizeBytes: ORIGINAL_PASSTHROUGH_MAX_BYTES + 1 }),
    ).toBe(false);

    // Any zoom, pan, rotation, aspect change, or non-album preset uses Canvas crop
    expect(shouldUseOriginalPassthrough({ ...base, zoom: 1.2 })).toBe(false);
    expect(shouldUseOriginalPassthrough({ ...base, panX: 10 })).toBe(false);
    expect(shouldUseOriginalPassthrough({ ...base, panY: -8 })).toBe(false);
    expect(shouldUseOriginalPassthrough({ ...base, rotationDeg: 90 })).toBe(false);
    expect(shouldUseOriginalPassthrough({ ...base, albumRatio: '4:5' })).toBe(false);
    expect(shouldUseOriginalPassthrough({ ...base, preset: 'plan-cover' })).toBe(false);
  });

  it('clamps pan offsets cleanly so image never reveals empty frame edges', () => {
    const bounds = computePanBounds(1600, 900, 0, 320, 180, 1.5);
    expect(bounds.maxOffsetX).toBeCloseTo(80, 3);
    expect(bounds.maxOffsetY).toBeCloseTo(45, 3);
    const clamped = clampPanOffset(999, -999, bounds);
    expect(clamped.x).toBeCloseTo(80, 3);
    expect(clamped.y).toBeCloseTo(-45, 3);
  });

  it('validates image files chosen from unrestricted File Saya / OS file pickers', () => {
    expect(isSupportedImageFile({ type: 'image/jpeg', name: 'IMG_001.jpg' })).toBe(true);
    expect(isSupportedImageFile({ type: '', name: 'downloaded-photo.webp' })).toBe(true);
    expect(isSupportedImageFile({ type: '', name: 'iphone-shot.HEIC' })).toBe(true);
    expect(isSupportedImageFile({ type: 'application/pdf', name: 'ticket.pdf' })).toBe(false);
    expect(isSupportedImageFile({ type: 'text/plain', name: 'notes.txt' })).toBe(false);
  });
});
