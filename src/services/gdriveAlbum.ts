import type { AlbumPhoto } from '../types/trip';

export interface CompressedPhotoResult {
  blob: Blob;
  dataUrl: string;
  base64: string;
}

export interface DriveFetchResult {
  ok: boolean;
  photos: AlbumPhoto[];
  error?: string;
}

export interface DriveUploadResult {
  ok: boolean;
  photo?: AlbumPhoto;
  error?: string;
}

/**
 * Returns true if a Drive filename represents a shared UI asset (hero, plan, stay,
 * train, avatar) that should be excluded from the Album gallery.
 */
export function isAssetFileName(name?: string): boolean {
  if (!name) return false;
  return name.trim().toUpperCase().startsWith('[ASSET-');
}

/**
 * Extracts a Google Drive folder ID from standard share links:
 * - `https://drive.google.com/drive/folders/19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt?usp=drive_link`
 * - `https://drive.google.com/drive/u/0/folders/19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt`
 * - `https://drive.google.com/open?id=19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt`
 */
export function extractDriveFolderId(folderUrl?: string): string {
  if (!folderUrl) return '';
  const trimmed = folderUrl.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idMatch?.[1]) return idMatch[1];
  return '';
}

/**
 * Normalizes Google Drive image links to the reliable `thumbnail?id=...&sz=w...`
 * endpoint so mobile browsers never hit 403 blocks from legacy `uc?export=view`.
 */
export function normalizeDriveImageUrl(url: string, width = 1200): string {
  if (!url) return '';
  const ucMatch = url.match(/drive\.google\.com\/uc\?[^#]*[?&]id=([a-zA-Z0-9_-]+)/);
  if (ucMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${ucMatch[1]}&sz=w${width}`;
  }
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w${width}`;
  }
  return url;
}

/**
 * Parses a raw Apps Script HTTP response body into a structured diagnostic result.
 * Detects Google HTML login redirects (un-authorized Web App) vs valid JSON.
 */
export function parseDriveScriptJson<T extends { ok?: boolean; error?: string }>(
  rawText: string,
): { ok: true; data: T } | { ok: false; error: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Empty response from Apps Script' };
  }
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
    return { ok: false, error: 'Script needs public access ("Anyone")' };
  }
  try {
    const parsed = JSON.parse(trimmed) as T;
    if (parsed.ok === false) {
      return { ok: false, error: parsed.error || 'Apps Script returned error' };
    }
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, error: 'Invalid response from Drive script' };
  }
}

/**
 * Compresses an uploaded album image client-side via Canvas
 * (max width 1600px, JPEG 80%) so Drive uploads & local IndexedDB stay fast.
 */
export async function compressAlbumPhoto(file: File): Promise<CompressedPhotoResult> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 1600;
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image compression failed'))),
      'image/jpeg',
      0.8,
    );
  });
  const base64 = dataUrl.split(',')[1] ?? '';

  return { blob, dataUrl, base64 };
}

/**
 * Fetches Drive Album photos with real connection diagnostics (never fakes "connected").
 */
export async function fetchDriveAlbumWithStatus(
  scriptUrl: string,
  tripId: string,
  folderUrl?: string,
): Promise<DriveFetchResult> {
  if (!scriptUrl.trim()) {
    return { ok: false, photos: [], error: 'Sync URL not set' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, photos: [], error: 'Device is offline' };
  }
  try {
    const folderId = extractDriveFolderId(folderUrl);
    const base = scriptUrl.trim();
    const requestUrl = folderId
      ? `${base}${base.includes('?') ? '&' : '?'}folderId=${encodeURIComponent(folderId)}`
      : base;

    const res = await fetch(requestUrl, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, photos: [], error: `HTTP ${res.status}` };
    }

    const parsed = parseDriveScriptJson<{
      ok?: boolean;
      error?: string;
      photos?: Array<{
        id: string;
        name?: string;
        dayId?: string;
        dayLabel?: string;
        caption?: string;
        uploaderName?: string;
        url: string;
        fullUrl?: string;
        createdAt?: string;
      }>;
    }>(text);

    if (!parsed.ok) {
      return { ok: false, photos: [], error: parsed.error };
    }

    if (!Array.isArray(parsed.data.photos)) {
      return { ok: false, photos: [], error: 'Unexpected Drive payload' };
    }

    const photos: AlbumPhoto[] = parsed.data.photos
      .filter((p) => !isAssetFileName(p.name) && !isAssetFileName(p.caption))
      .map((p) => {
        const gridUrl = normalizeDriveImageUrl(p.url, 1200);
        const hiResUrl = p.fullUrl
          ? normalizeDriveImageUrl(p.fullUrl, 2000)
          : normalizeDriveImageUrl(p.url, 2000);
        return {
          id: p.id,
          tripId,
          dayId: p.dayId || 'day-1',
          dayLabel: p.dayLabel || 'Trip',
          caption: p.caption || '',
          uploaderName: p.uploaderName || 'Crew',
          url: gridUrl,
          fullUrl: hiResUrl,
          source: 'drive',
          createdAt: p.createdAt || new Date().toISOString(),
        };
      });

    return { ok: true, photos };
  } catch {
    return { ok: false, photos: [], error: 'Network or CORS blocked' };
  }
}

export async function fetchDriveAlbum(
  scriptUrl: string,
  tripId: string,
  folderUrl?: string,
): Promise<AlbumPhoto[]> {
  const result = await fetchDriveAlbumWithStatus(scriptUrl, tripId, folderUrl);
  return result.photos;
}

export async function uploadPhotoToDrive(params: {
  scriptUrl: string;
  folderUrl?: string;
  assetPrefix?: string;
  crewPin?: string;
  tripId: string;
  dayId: string;
  dayLabel: string;
  caption: string;
  uploaderName: string;
  base64: string;
  fileName: string;
}): Promise<DriveUploadResult> {
  if (!params.scriptUrl.trim()) {
    return { ok: false, error: 'Sync URL not configured' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, error: 'Device is offline' };
  }
  try {
    const folderId = extractDriveFolderId(params.folderUrl);
    const res = await fetch(params.scriptUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        folderId: folderId || undefined,
        assetPrefix: params.assetPrefix || undefined,
        crewPin: params.crewPin || '',
        dayId: params.dayId,
        dayLabel: params.dayLabel,
        caption: params.caption,
        uploaderName: params.uploaderName,
        fileName: params.fileName,
        mimeType: 'image/jpeg',
        base64: params.base64,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const parsed = parseDriveScriptJson<{
      ok?: boolean;
      error?: string;
      id?: string;
      url?: string;
      fullUrl?: string;
    }>(text);

    if (!parsed.ok || !parsed.data.url) {
      return { ok: false, error: parsed.ok ? 'Missing Drive URL' : parsed.error };
    }

    return {
      ok: true,
      photo: {
        id: parsed.data.id || `drv-${Date.now().toString(36)}`,
        tripId: params.tripId,
        dayId: params.dayId,
        dayLabel: params.dayLabel,
        caption: params.caption,
        uploaderName: params.uploaderName,
        url: normalizeDriveImageUrl(parsed.data.url, 1200),
        fullUrl: parsed.data.fullUrl
          ? normalizeDriveImageUrl(parsed.data.fullUrl, 2000)
          : normalizeDriveImageUrl(parsed.data.url, 2000),
        source: 'drive',
        createdAt: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, error: 'Network or CORS error' };
  }
}
