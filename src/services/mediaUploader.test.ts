import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { SharedTrip } from '../types/trip';
import * as gdriveAlbum from './gdriveAlbum';
import {
  FALLBACK_AVATAR_MAX_BYTES,
  FALLBACK_COVER_MAX_BYTES,
  TRIP_ASSETS_BUCKET,
  base64ToBlob,
  buildTripAssetPath,
  dataUrlToBytes,
  formatStorageFallbackReason,
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
  it('builds unique {TRIPCODE}/{kind}-{timestamp}-{rand}.jpg paths and quota limits', () => {
    expect(buildTripAssetPath('solo-27', 'hero', 1700000000000, 'image/jpeg', 'ab12c')).toBe(
      'SOLO-27/hero-1700000000000-ab12c.jpg',
    );
    expect(buildTripAssetPath('SOLO-27', 'idea', 1700000000001, 'image/png', 'xy99z')).toBe(
      'SOLO-27/idea-1700000000001-xy99z.png',
    );
    expect(getFallbackMaxBytes('avatar')).toBe(FALLBACK_AVATAR_MAX_BYTES);
    expect(getFallbackMaxBytes('hero')).toBe(FALLBACK_COVER_MAX_BYTES);
    expect(getFallbackMaxBytes('idea')).toBe(FALLBACK_COVER_MAX_BYTES);
  });

  it('routes UI assets (hero, plan, stay, train, avatar, idea) to Supabase trip-assets with upsert:false and NEVER calls Google Drive', async () => {
    const driveSpy = vi.spyOn(gdriveAlbum, 'uploadPhotoToDrive');
    const uploadMock = vi
      .fn()
      .mockResolvedValue({ data: { path: 'SOLO-27/hero-1-abc.jpg' }, error: null });
    const getPublicUrlMock = vi.fn().mockImplementation((path: string) => ({
      data: {
        publicUrl: `https://example.supabase.co/storage/v1/object/public/${TRIP_ASSETS_BUCKET}/${path}`,
      },
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
      expect(res.reason).toBeUndefined();
      expect(res.url).toContain(`/storage/v1/object/public/${TRIP_ASSETS_BUCKET}/SOLO-27/${kind}-`);
      expect(fromMock).toHaveBeenCalledWith(TRIP_ASSETS_BUCKET);
      expect(uploadMock).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^SOLO-27/${kind}-\\d+-[a-z0-9]+\\.jpg$`)),
        expect.any(Blob),
        { contentType: 'image/jpeg', upsert: false },
      );
    }

    // Google Drive Apps Script must NEVER be invoked for UI assets
    expect(driveSpy).not.toHaveBeenCalled();
    driveSpy.mockRestore();
  });

  it('returns clear diagnostic reasons when falling back to local dataUrl (never touches Drive)', async () => {
    const driveSpy = vi.spyOn(gdriveAlbum, 'uploadPhotoToDrive');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 1. Supabase env not configured
    const resUnconfigured = await uploadSharedImage(sampleCropped, {
      kind: 'avatar',
      trip: pilotTrip,
      supabaseClient: null,
    });
    expect(resUnconfigured.source).toBe('local');
    expect(resUnconfigured.reason).toBe('Supabase not configured');
    expect(resUnconfigured.url).toBe(sampleCropped.dataUrl);

    // 2. Device offline
    const fakeOnlineClient = { storage: { from: vi.fn() } } as unknown as SupabaseClient;
    const resOffline = await uploadSharedImage(sampleCropped, {
      kind: 'hero',
      trip: pilotTrip,
      supabaseClient: fakeOnlineClient,
      isOnline: false,
    });
    expect(resOffline.source).toBe('local');
    expect(resOffline.reason).toBe('Offline');

    // 3. Bucket missing error
    const missingBucketSupabase = {
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'Bucket not found' } }),
          getPublicUrl: vi.fn(),
        }),
      },
    } as unknown as SupabaseClient;

    const resBucketErr = await uploadSharedImage(sampleCropped, {
      kind: 'plan',
      trip: pilotTrip,
      supabaseClient: missingBucketSupabase,
    });
    expect(resBucketErr.source).toBe('local');
    expect(resBucketErr.reason).toBe('Bucket not found');

    // 4. RLS policy blocked error
    const rlsSupabase = {
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'new row violates row-level security policy' },
          }),
          getPublicUrl: vi.fn(),
        }),
      },
    } as unknown as SupabaseClient;

    const resRlsErr = await uploadSharedImage(sampleCropped, {
      kind: 'plan',
      trip: pilotTrip,
      supabaseClient: rlsSupabase,
    });
    expect(resRlsErr.source).toBe('local');
    expect(resRlsErr.reason).toBe('RLS policy blocked');
    expect(formatStorageFallbackReason('new row violates row-level security policy')).toBe(
      'RLS policy blocked',
    );

    // 5. Private / unreadable public URL check falls back cleanly
    const privateBucketSupabase = {
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({ data: { path: 'SOLO-27/plan-1-abc.jpg' }, error: null }),
          getPublicUrl: () => ({
            data: {
              publicUrl:
                'https://example.supabase.co/storage/v1/object/public/trip-assets/SOLO-27/plan-1-abc.jpg',
            },
          }),
        }),
      },
    } as unknown as SupabaseClient;

    const resPrivate = await uploadSharedImage(sampleCropped, {
      kind: 'plan',
      trip: pilotTrip,
      supabaseClient: privateBucketSupabase,
      verifyPublicUrl: async () => false,
    });
    expect(resPrivate.source).toBe('local');
    expect(resPrivate.reason).toBe('Bucket not public');
    expect(resPrivate.url).toBe(sampleCropped.dataUrl);

    expect(driveSpy).not.toHaveBeenCalled();
    driveSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('safely converts dataUrl / base64 to pure binary Uint8Array and Blob synchronously', () => {
    const bytes = dataUrlToBytes('data:image/jpeg;base64,SGVsbG8=');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);

    const blob = base64ToBlob('data:image/jpeg;base64,SGVsbG8=', 'image/jpeg');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(5);
    expect(blob.type).toBe('image/jpeg');
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
