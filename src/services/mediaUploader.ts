import type { SupabaseClient } from '@supabase/supabase-js';
import type { SharedTrip } from '../types/trip';
import { uploadPhotoToDrive } from './gdriveAlbum';
import { getSupabaseClient } from './supabaseSync';

export type UiAssetKind = 'hero' | 'plan' | 'stay' | 'train' | 'avatar' | 'idea';
export type SharedMediaKind = 'album' | UiAssetKind;

export const TRIP_ASSETS_BUCKET = 'trip-assets';
export const FALLBACK_AVATAR_MAX_BYTES = 40 * 1024; // ~40 KB
export const FALLBACK_COVER_MAX_BYTES = 120 * 1024; // ~120 KB

export interface UploadSharedImageOptions {
  kind: SharedMediaKind;
  trip: SharedTrip;
  caption?: string;
  dayId?: string;
  dayLabel?: string;
  uploaderName?: string;
  crewPin?: string;
  fileName?: string;
  /** Optional dependency injection for tests */
  supabaseClient?: SupabaseClient | null;
  /** Optional public URL accessibility check hook */
  verifyPublicUrl?: (url: string) => Promise<boolean>;
}

export interface UploadSharedImageResult {
  url: string;
  fullUrl: string;
  downloadUrl?: string;
  source: 'drive' | 'supabase' | 'local';
  driveId?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Builds the deterministic Supabase Storage object path inside `trip-assets`:
 * `{TRIP_CODE}/{kind}-{timestamp}.jpg`
 */
export function buildTripAssetPath(
  tripCode: string,
  kind: UiAssetKind,
  timestamp = Date.now(),
  mimeType = 'image/jpeg',
): string {
  const cleanCode =
    tripCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '') || 'TRIP';
  const ext =
    mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return `${cleanCode}/${kind}-${timestamp}.${ext}`;
}

export function getFallbackMaxBytes(kind: UiAssetKind): number {
  return kind === 'avatar' ? FALLBACK_AVATAR_MAX_BYTES : FALLBACK_COVER_MAX_BYTES;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Safely decodes a `data:image/...;base64,...` URL or raw base64 string into a
 * binary `Uint8Array` + `Blob` suitable for Supabase Storage upload on mobile PWAs.
 */
export function dataUrlToBytes(input: string): Uint8Array {
  const commaIdx = input.indexOf(',');
  const rawBase64 = (commaIdx >= 0 ? input.slice(commaIdx + 1) : input).replace(/\s+/g, '');
  if (!rawBase64) return new Uint8Array(0);

  if (typeof atob === 'function') {
    const binary = atob(rawBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Node fallback if atob were unavailable
  const bytes = new Uint8Array(rawBase64.length);
  for (let i = 0; i < rawBase64.length; i += 1) {
    bytes[i] = rawBase64.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function base64ToBlob(base64OrDataUrl: string, mimeType: string): Blob {
  const bytes = dataUrlToBytes(base64OrDataUrl);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: mimeType });
}

function isValidHttpUrl(url?: string | null): boolean {
  if (!url) return false;
  return /^https?:\/\/.+/i.test(url.trim());
}

/**
 * Verifies that a newly uploaded Supabase Storage public URL is actually readable
 * (catches private buckets or missing SELECT policies that return HTTP 400/403/404).
 */
async function defaultVerifyPublicUrl(url: string): Promise<boolean> {
  if (!isValidHttpUrl(url)) return false;
  if (typeof fetch !== 'function') return true;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      return false;
    }
    return true;
  } catch {
    // Opaque CORS/network edge case on HEAD: allow <img> to attempt load directly
    return true;
  }
}

/**
 * Compresses a fallback UI asset `dataUrl` so Layer-1 JSON stays quota-safe
 * (<= 40 KB for avatars, <= 120 KB for covers) when Supabase Storage is unavailable.
 */
export async function compactAssetDataUrl(
  dataUrl: string,
  maxBytes: number,
): Promise<string> {
  if (!dataUrl || estimateDataUrlBytes(dataUrl) <= maxBytes) {
    return dataUrl;
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return dataUrl;
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = dataUrl;
    });

    const natW = img.naturalWidth || 800;
    const natH = img.naturalHeight || 600;
    const steps: Array<{ maxDim: number; quality: number }> =
      maxBytes <= FALLBACK_AVATAR_MAX_BYTES
        ? [
            { maxDim: 220, quality: 0.72 },
            { maxDim: 180, quality: 0.62 },
            { maxDim: 144, quality: 0.52 },
          ]
        : [
            { maxDim: 960, quality: 0.74 },
            { maxDim: 760, quality: 0.64 },
            { maxDim: 600, quality: 0.54 },
            { maxDim: 480, quality: 0.46 },
          ];

    let best = dataUrl;
    for (const step of steps) {
      const scale = Math.min(1, step.maxDim / Math.max(natW, natH));
      const w = Math.max(1, Math.round(natW * scale));
      const h = Math.max(1, Math.round(natH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      const candidate = canvas.toDataURL('image/jpeg', step.quality);
      best = candidate;
      if (estimateDataUrlBytes(candidate) <= maxBytes) {
        return candidate;
      }
    }
    return best;
  } catch {
    return dataUrl;
  }
}

/**
 * Unified Shared Media Uploader (Strict Channel Isolation):
 * - `kind === 'album'` ONLY -> Google Drive Apps Script Bridge (`Album → Photos`),
 *   with local IndexedDB fallback when offline or Drive sync URL is unconfigured.
 * - UI assets (`'hero' | 'plan' | 'stay' | 'train' | 'avatar' | 'idea'`) NEVER touch
 *   Google Drive -> uploaded directly to Supabase Storage public bucket `trip-assets`
 *   (`{tripCode}/{kind}-{timestamp}.jpg`, `upsert: true`), falling back cleanly to a
 *   quota-safe compressed `dataUrl` (<= 120 KB cover / <= 40 KB avatar) whenever
 *   Supabase is unconfigured, offline, returns an error, or produces an unreadable URL.
 */
export async function uploadSharedImage(
  cropped: { dataUrl: string; base64: string; blob?: Blob; mimeType?: string },
  options: UploadSharedImageOptions,
): Promise<UploadSharedImageResult> {
  const {
    kind,
    trip,
    caption = kind,
    dayId = 'asset',
    dayLabel = kind,
    uploaderName = 'Crew',
    crewPin = '',
    fileName = `${kind}.jpg`,
    supabaseClient,
    verifyPublicUrl,
  } = options;

  const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

  // 1. Google Drive is EXCLUSIVELY for `Album → Photos`
  if (kind === 'album') {
    const scriptUrl = trip.gdriveScriptUrl?.trim();
    const folderUrl = trip.gdriveFolderUrl || trip.albumUrl;

    if (scriptUrl && isOnline) {
      const driveRes = await uploadPhotoToDrive({
        scriptUrl,
        folderUrl,
        assetPrefix: '',
        crewPin,
        tripId: trip.id,
        dayId,
        dayLabel,
        caption,
        uploaderName,
        base64: cropped.base64,
        fileName,
        mimeType: cropped.mimeType || 'image/jpeg',
      });

      if (driveRes.ok && driveRes.photo) {
        return {
          url: driveRes.photo.url,
          fullUrl: driveRes.photo.fullUrl || driveRes.photo.url,
          downloadUrl: driveRes.photo.downloadUrl,
          source: 'drive',
          driveId: driveRes.photo.id,
        };
      }

      return {
        url: cropped.dataUrl,
        fullUrl: cropped.dataUrl,
        downloadUrl: cropped.dataUrl,
        source: 'local',
        error: driveRes.error,
      };
    }

    return {
      url: cropped.dataUrl,
      fullUrl: cropped.dataUrl,
      downloadUrl: cropped.dataUrl,
      source: 'local',
    };
  }

  // 2. UI Assets (`hero`, `plan`, `stay`, `train`, `avatar`, `idea`) -> Supabase Storage `trip-assets`
  const client = supabaseClient !== undefined ? supabaseClient : getSupabaseClient();
  const mimeType = cropped.mimeType || 'image/jpeg';

  if (client && isOnline) {
    const objectPath = buildTripAssetPath(trip.code, kind, Date.now(), mimeType);
    const uploadBlob =
      cropped.blob && cropped.blob.size > 0
        ? cropped.blob
        : base64ToBlob(cropped.base64 || cropped.dataUrl, mimeType);

    try {
      const { error: uploadError } = await client.storage
        .from(TRIP_ASSETS_BUCKET)
        .upload(objectPath, uploadBlob, {
          contentType: mimeType,
          upsert: true,
        });

      if (!uploadError) {
        const { data: publicData } = client.storage
          .from(TRIP_ASSETS_BUCKET)
          .getPublicUrl(objectPath);

        const publicUrl = publicData?.publicUrl?.trim() ?? '';
        const checker =
          verifyPublicUrl ??
          (supabaseClient !== undefined ? async (u: string) => isValidHttpUrl(u) : defaultVerifyPublicUrl);

        if (isValidHttpUrl(publicUrl) && (await checker(publicUrl))) {
          return {
            url: publicUrl,
            fullUrl: publicUrl,
            source: 'supabase',
            storagePath: objectPath,
          };
        }

        const compactUrl = await compactAssetDataUrl(cropped.dataUrl, getFallbackMaxBytes(kind));
        return {
          url: compactUrl,
          fullUrl: compactUrl,
          source: 'local',
          error: 'Public asset URL unavailable — using compressed local copy',
        };
      }

      const compactUrl = await compactAssetDataUrl(cropped.dataUrl, getFallbackMaxBytes(kind));
      return {
        url: compactUrl,
        fullUrl: compactUrl,
        source: 'local',
        error: uploadError.message || 'Supabase Storage upload failed',
      };
    } catch (err) {
      const compactUrl = await compactAssetDataUrl(cropped.dataUrl, getFallbackMaxBytes(kind));
      return {
        url: compactUrl,
        fullUrl: compactUrl,
        source: 'local',
        error: err instanceof Error ? err.message : 'Supabase Storage upload failed',
      };
    }
  }

  // 3. Quota-safe local Data URL fallback (syncs safely via Layer-1 DB when online)
  const compactUrl = await compactAssetDataUrl(cropped.dataUrl, getFallbackMaxBytes(kind));
  return {
    url: compactUrl,
    fullUrl: compactUrl,
    source: 'local',
  };
}
