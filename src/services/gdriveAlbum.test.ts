import { describe, expect, it } from 'vitest';
import {
  buildDriveDownloadUrl,
  buildDriveThumbnailUrl,
  extractDriveFileId,
  extractDriveFolderId,
  isAssetFileName,
  normalizeDriveImageUrl,
  parseDriveScriptJson,
  resolveDrivePhotoUrls,
} from './gdriveAlbum';

describe('Google Drive Album Bridge helpers & diagnostics', () => {
  it('extracts folderId cleanly from standard Drive share links', () => {
    expect(
      extractDriveFolderId(
        'https://drive.google.com/drive/folders/19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt?usp=drive_link',
      ),
    ).toBe('19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt');

    expect(
      extractDriveFolderId(
        'https://drive.google.com/drive/u/0/folders/19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt',
      ),
    ).toBe('19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt');

    expect(extractDriveFolderId('https://drive.google.com/')).toBe('');
  });

  it('normalizes legacy uc?export=view URLs to stable thumbnail endpoints', () => {
    expect(
      normalizeDriveImageUrl('https://drive.google.com/uc?export=view&id=abc123XYZ999', 1200),
    ).toBe('https://drive.google.com/thumbnail?id=abc123XYZ999&sz=w1200');

    expect(
      normalizeDriveImageUrl('https://drive.google.com/thumbnail?id=abc123XYZ999&sz=w2000', 2000),
    ).toBe('https://drive.google.com/thumbnail?id=abc123XYZ999&sz=w2000');
  });

  it('upgrades Drive photo URLs to sharp w4096 Lightbox + direct original downloadUrl on frontend', () => {
    expect(buildDriveThumbnailUrl('fileABC123', 4096)).toBe(
      'https://drive.google.com/thumbnail?id=fileABC123&sz=w4096',
    );
    expect(buildDriveDownloadUrl('fileABC123')).toBe(
      'https://drive.google.com/uc?export=download&id=fileABC123',
    );
    expect(
      extractDriveFileId('https://drive.google.com/thumbnail?id=fileABC123&sz=w1200'),
    ).toBe('fileABC123');

    const resolved = resolveDrivePhotoUrls({
      id: 'fileABC123',
      url: 'https://drive.google.com/thumbnail?id=fileABC123&sz=w1200',
      fullUrl: 'https://drive.google.com/thumbnail?id=fileABC123&sz=w2000',
    });
    expect(resolved).toEqual({
      url: 'https://drive.google.com/thumbnail?id=fileABC123&sz=w1200',
      fullUrl: 'https://drive.google.com/thumbnail?id=fileABC123&sz=w4096',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=fileABC123',
    });
  });

  it('identifies [ASSET- filenames so card/avatar/idea uploads never pollute Album', () => {
    expect(isAssetFileName('[ASSET-hero]__day-1__Trip__Kris__Cover.jpg')).toBe(true);
    expect(isAssetFileName('[ASSET-plan]__day-3__Sat__Kris__Ganjuran.jpg')).toBe(true);
    expect(isAssetFileName('[ASSET-idea]__asset__idea__Kris__Convoy.jpg')).toBe(true);
    expect(isAssetFileName('[asset-avatar]__Kris.jpg')).toBe(true);
    expect(isAssetFileName('day-3__Day 3__Kris__Goa Maria Ganjuran.jpg')).toBe(false);
  });

  it('diagnoses HTML login redirects vs valid JSON vs Apps Script error payloads', () => {
    const htmlRes = parseDriveScriptJson('<!DOCTYPE html><html><body>Sign in</body></html>');
    expect(htmlRes.ok).toBe(false);
    if (!htmlRes.ok) expect(htmlRes.error).toContain('public access');

    const errRes = parseDriveScriptJson(JSON.stringify({ ok: false, error: 'Folder not found' }));
    expect(errRes.ok).toBe(false);
    if (!errRes.ok) expect(errRes.error).toBe('Folder not found');

    const okRes = parseDriveScriptJson<{ ok: boolean; photos: unknown[] }>(
      JSON.stringify({ ok: true, photos: [] }),
    );
    expect(okRes.ok).toBe(true);
  });
});
