import type { AlbumPhoto } from '../types/trip';

export interface CompressedPhotoResult {
  blob: Blob;
  dataUrl: string;
  base64: string;
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

export async function fetchDriveAlbum(
  scriptUrl: string,
  tripId: string,
  folderUrl?: string,
): Promise<AlbumPhoto[]> {
  if (!scriptUrl.trim() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return [];
  }
  try {
    const folderId = extractDriveFolderId(folderUrl);
    const base = scriptUrl.trim();
    const requestUrl = folderId
      ? `${base}${base.includes('?') ? '&' : '?'}folderId=${encodeURIComponent(folderId)}`
      : base;

    const res = await fetch(requestUrl, { method: 'GET' });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      photos?: Array<{
        id: string;
        dayId?: string;
        dayLabel?: string;
        caption?: string;
        uploaderName?: string;
        url: string;
        fullUrl?: string;
        createdAt?: string;
      }>;
    };
    if (!Array.isArray(data.photos)) return [];
    return data.photos.map((p) => {
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
  } catch {
    return [];
  }
}

export async function uploadPhotoToDrive(params: {
  scriptUrl: string;
  folderUrl?: string;
  crewPin: string;
  tripId: string;
  dayId: string;
  dayLabel: string;
  caption: string;
  uploaderName: string;
  base64: string;
  fileName: string;
}): Promise<AlbumPhoto | null> {
  if (!params.scriptUrl.trim() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return null;
  }
  try {
    const folderId = extractDriveFolderId(params.folderUrl);
    const res = await fetch(params.scriptUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        folderId: folderId || undefined,
        crewPin: params.crewPin,
        dayId: params.dayId,
        dayLabel: params.dayLabel,
        caption: params.caption,
        uploaderName: params.uploaderName,
        fileName: params.fileName,
        mimeType: 'image/jpeg',
        base64: params.base64,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok?: boolean;
      id?: string;
      url?: string;
      fullUrl?: string;
    };
    if (!json.ok || !json.url) return null;
    return {
      id: json.id || `drv-${Date.now().toString(36)}`,
      tripId: params.tripId,
      dayId: params.dayId,
      dayLabel: params.dayLabel,
      caption: params.caption,
      uploaderName: params.uploaderName,
      url: normalizeDriveImageUrl(json.url, 1200),
      fullUrl: json.fullUrl
        ? normalizeDriveImageUrl(json.fullUrl, 2000)
        : normalizeDriveImageUrl(json.url, 2000),
      source: 'drive',
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
