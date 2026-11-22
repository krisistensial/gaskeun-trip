import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { SharedTrip } from '../types/trip';
import * as gdriveAlbum from './gdriveAlbum';
import {
  FALLBACK_AVATAR_MAX_BYTES,
  FALLBACK_COVER_MAX_BYTES,
  TRIP_ASSETS_BUCKET,
  buildTripAssetPath,
  getFallbackMaxBytes,
  uploadSharedImage,
} from './mediaUploader';

const pilotTrip = seedData as unknown as SharedTrip;
const sampleCropped = {
  dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
  base64: '/9j/4AAQSkZJRgABAQAAAQABAAD/',
  mimeType: 'image/jpeg',
};

describe('Media Uploader strict routing (Google Drive Album-only vs Supabase trip-assets)', () => {
  it('builds clean {TRIPCODE}/{kind}-{timestamp}.jpg paths and quota limits', () => {
    expect(buildTripAssetPath('solo-27', 'hero', 1700000000000)).toBe(
      'SOLO-27/hero-1700000000000.jpg',
    );
    expect(buildTripAssetPath('SOLO-27', 'idea', 1700000000001, 'image/png')).toBe(
      'SOLO-27/idea-1700000000001.png',
    );
    expect(getFallbackMaxBytes('avatar')).toBe(FALLBACK_AVATAR_MAX_BYTES);
    expect(getFallbackMaxBytes('hero')).toBe(FALLBACK_COVER_MAX_BYTES);
    expect(getFallbackMaxBytes('idea')).toBe(FALLBACK_COVER_MAX_BYTES);
  });

  it('routes UI assets (hero, plan, stay, train, avatar, idea) to Supabase trip-assets and NEVER calls Google Drive', async () => {
    const driveSpy = vi.spyOn(gdriveAlbum, 'uploadPhotoToDrive');
    const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'SOLO-27/hero-1.jpg' }, error: null });
    const getPublicUrlMock = vi.fn().mockImplementation((path: string) => ({
      data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${TRIP_ASSETS_BUCKET}/${path}` },
    }));
    const fromMock = vi.fn().mockReturnValue({
      upload: uploadMock,
      getPublicUrl: getPublicUrlMock,
    });
    const fakeSupabase = { storage: { from: fromMock } } as unknown as SupabaseClient;

    for (const kind of ['hero', 'plan', 'stay', 'train', 'avatar', 'idea'] as const) {
      const res = await uploadSharedImage(sampleCropped, {
        kind,
        trip: pilotTrip,
        supabaseClient: fakeSupabase,
      });

      expect(res.source).toBe('supabase');
      expect(res.url).toContain(`/storage/v1/object/public/${TRIP_ASSETS_BUCKET}/SOLO-27/${kind}-`);
      expect(fromMock).toHaveBeenCalledWith(TRIP_ASSETS_BUCKET);
      expect(uploadMock).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^SOLO-27/${kind}-\\d+\\.jpg$`)),
        expect.any(Blob),
        { contentType: 'image/jpeg', upsert: true },
      );
    }

    // Google Drive Apps Script must NEVER be invoked for UI assets
    expect(driveSpy).not.toHaveBeenCalled();
    driveSpy.mockRestore();
  });

  it('falls back cleanly to local dataUrl when Supabase is unconfigured or upload fails (never touches Drive)', async () => {
    const driveSpy = vi.spyOn(gdriveAlbum, 'uploadPhotoToDrive');

    const resUnconfigured = await uploadSharedImage(sampleCropped, {
      kind: 'avatar',
      trip: pilotTrip,
      supabaseClient: null,
    });
    expect(resUnconfigured.source).toBe('local');
    expect(resUnconfigured.url).toBe(sampleCropped.dataUrl);

    const failingSupabase = {
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'Bucket missing' } }),
          getPublicUrl: vi.fn(),
        }),
      },
    } as unknown as SupabaseClient;

    const resError = await uploadSharedImage(sampleCropped, {
      kind: 'plan',
      trip: pilotTrip,
      supabaseClient: failingSupabase,
    });
    expect(resError.source).toBe('local');
    expect(resError.error).toBe('Bucket missing');
    expect(driveSpy).not.toHaveBeenCalled();

    driveSpy.mockRestore();
  });

  it('routes kind="album" exclusively to Google Drive Bridge', async () => {
    const driveSpy = vi.spyOn(gdriveAlbum, 'uploadPhotoToDrive').mockResolvedValue({
      ok: true,
      photo: {
        id: 'drv-123',
        tripId: pilotTrip.id,
        dayId: 'day-1',
        dayLabel: 'Day 1',
        caption: 'Solo Sunset',
        uploaderName: 'Kris',
        url: 'https://drive.google.com/thumbnail?id=drv-123&sz=w1200',
        fullUrl: 'https://drive.google.com/thumbnail?id=drv-123&sz=w4096',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=drv-123',
        source: 'drive',
        createdAt: '2026-11-23T00:00:00Z',
      },
    });

    const res = await uploadSharedImage(sampleCropped, {
      kind: 'album',
      trip: pilotTrip,
      dayId: 'day-1',
      dayLabel: 'Day 1',
      caption: 'Solo Sunset',
      uploaderName: 'Kris',
    });

    expect(driveSpy).toHaveBeenCalledTimes(1);
    expect(res.source).toBe('drive');
    expect(res.fullUrl).toContain('sz=w4096');
    expect(res.downloadUrl).toContain('export=download');
    driveSpy.mockRestore();
  });
});
