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
 * Extracts a Google Drive file ID from `thumbnail?id=...`, `uc?...id=...`, or `/file/d/...` URLs.
 */
export function extractDriveFileId(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  const thumbMatch = trimmed.match(/drive\.google\.com\/thumbnail\?[^#]*[?&]?id=([a-zA-Z0-9_-]+)/);
  if (thumbMatch?.[1]) return thumbMatch[1];
  const ucMatch = trimmed.match(/drive\.google\.com\/uc\?[^#]*[?&]id=([a-zA-Z0-9_-]+)/);
  if (ucMatch?.[1]) return ucMatch[1];
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) return fileMatch[1];
  return '';
}

/**
 * Builds the reliable Drive thumbnail URL at a specific width (`w1200` for grid, `w4096` for Lightbox).
 */
export function buildDriveThumbnailUrl(fileId: string, width = 4096): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
}

/**
 * Builds the direct original-file download URL for a Google Drive file ID.
 */
export function buildDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
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
 * (max side 4096px, JPEG 94%) when a fallback resize is needed.
 */
export async function compressAlbumPhoto(file: File): Promise<CompressedPhotoResult> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 4096;
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > maxSide ? maxSide / longest : 1;
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image compression failed'))),
      'image/jpeg',
      0.94,
    );
  });
  const base64 = dataUrl.split(',')[1] ?? '';

  return { blob, dataUrl, base64 };
}

/**
 * Builds sharp `url` (w1200), `fullUrl` (w4096), and `downloadUrl` directly on the
 * frontend whenever a Google Drive file ID is known (no Apps Script re-deploy needed).
 */
export function resolveDrivePhotoUrls(params: {
  id?: string;
  url: string;
  fullUrl?: string;
  downloadUrl?: string;
}): { url: string; fullUrl: string; downloadUrl?: string } {
  const driveId = params.id?.trim() || extractDriveFileId(params.fullUrl || params.url);
  if (driveId) {
    return {
      url: buildDriveThumbnailUrl(driveId, 1200),
      fullUrl: buildDriveThumbnailUrl(driveId, 4096),
      downloadUrl: params.downloadUrl?.trim() || buildDriveDownloadUrl(driveId),
    };
  }
  const gridUrl = normalizeDriveImageUrl(params.url, 1200);
  const hiResUrl = params.fullUrl
    ? normalizeDriveImageUrl(params.fullUrl, 4096)
    : normalizeDriveImageUrl(params.url, 4096);
  return {
    url: gridUrl,
    fullUrl: hiResUrl,
    downloadUrl: params.downloadUrl,
  };
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
        downloadUrl?: string;
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
        const urls = resolveDrivePhotoUrls({
          id: p.id,
          url: p.url,
          fullUrl: p.fullUrl,
          downloadUrl: p.downloadUrl,
        });
        return {
          id: p.id,
          tripId,
          dayId: p.dayId || 'day-1',
          dayLabel: p.dayLabel || 'Trip',
          caption: p.caption || '',
          uploaderName: p.uploaderName || 'Crew',
          url: urls.url,
          fullUrl: urls.fullUrl,
          downloadUrl: urls.downloadUrl,
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
  mimeType?: string;
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
        mimeType: params.mimeType || 'image/jpeg',
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
      downloadUrl?: string;
    }>(text);

    if (!parsed.ok || !parsed.data.url) {
      return { ok: false, error: parsed.ok ? 'Missing Drive URL' : parsed.error };
    }

    const urls = resolveDrivePhotoUrls({
      id: parsed.data.id,
      url: parsed.data.url,
      fullUrl: parsed.data.fullUrl,
      downloadUrl: parsed.data.downloadUrl,
    });

    return {
      ok: true,
      photo: {
        id: parsed.data.id || `drv-${Date.now().toString(36)}`,
        tripId: params.tripId,
        dayId: params.dayId,
        dayLabel: params.dayLabel,
        caption: params.caption,
        uploaderName: params.uploaderName,
        url: urls.url,
        fullUrl: urls.fullUrl,
        downloadUrl: urls.downloadUrl,
        source: 'drive',
        createdAt: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, error: 'Network or CORS error' };
  }
}
