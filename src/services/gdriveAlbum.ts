import type { AlbumPhoto } from '../types/trip';

export interface CompressedPhotoResult {
  blob: Blob;
  dataUrl: string;
  base64: string;
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
): Promise<AlbumPhoto[]> {
  if (!scriptUrl.trim() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return [];
  }
  try {
    const res = await fetch(scriptUrl.trim(), { method: 'GET' });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      photos?: Array<{
        id: string;
        dayId?: string;
        dayLabel?: string;
        caption?: string;
        uploaderName?: string;
        url: string;
        createdAt?: string;
      }>;
    };
    if (!Array.isArray(data.photos)) return [];
    return data.photos.map((p) => ({
      id: p.id,
      tripId,
      dayId: p.dayId || 'day-1',
      dayLabel: p.dayLabel || 'Trip',
      caption: p.caption || '',
      uploaderName: p.uploaderName || 'Crew',
      url: p.url,
      source: 'drive',
      createdAt: p.createdAt || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function uploadPhotoToDrive(params: {
  scriptUrl: string;
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
    const res = await fetch(params.scriptUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
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
    const json = (await res.json()) as { ok?: boolean; id?: string; url?: string };
    if (!json.ok || !json.url) return null;
    return {
      id: json.id || `drv-${Date.now().toString(36)}`,
      tripId: params.tripId,
      dayId: params.dayId,
      dayLabel: params.dayLabel,
      caption: params.caption,
      uploaderName: params.uploaderName,
      url: json.url,
      source: 'drive',
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
