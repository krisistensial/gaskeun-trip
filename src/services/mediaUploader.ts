import type { SharedTrip } from '../types/trip';
import { uploadPhotoToDrive } from './gdriveAlbum';

export type SharedMediaKind = 'album' | 'hero' | 'plan' | 'stay' | 'train' | 'avatar';

export interface UploadSharedImageOptions {
  kind: SharedMediaKind;
  trip: SharedTrip;
  caption?: string;
  dayId?: string;
  dayLabel?: string;
  uploaderName?: string;
  crewPin?: string;
  fileName?: string;
}

export interface UploadSharedImageResult {
  url: string;
  fullUrl: string;
  downloadUrl?: string;
  source: 'drive' | 'local';
  driveId?: string;
  error?: string;
}

/**
 * Unified Shared Media Uploader:
 * - If `trip.gdriveScriptUrl` is configured & device is online, uploads the photo
 *   (full-res Original passthrough or high-res cropped image) to the Google Drive Bridge
 *   (prefixing non-album assets with `[ASSET-<kind>]` so they stay out of the Album gallery)
 *   and returns the public `thumbnail?id=...&sz=w1200` + `w4096` + direct download URLs.
 * - Falls back seamlessly to the local `dataUrl` when offline or Drive is unreachable
 *   so Layer-1 SharedTrip (IndexedDB + Supabase sync) still shares it across the crew.
 */
export async function uploadSharedImage(
  cropped: { dataUrl: string; base64: string; mimeType?: string },
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
  } = options;

  const scriptUrl = trip.gdriveScriptUrl?.trim();
  const folderUrl = trip.gdriveFolderUrl || trip.albumUrl;
  const assetPrefix = kind === 'album' ? '' : `[ASSET-${kind}]`;

  if (scriptUrl && (typeof navigator === 'undefined' || navigator.onLine)) {
    const driveRes = await uploadPhotoToDrive({
      scriptUrl,
      folderUrl,
      assetPrefix,
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
