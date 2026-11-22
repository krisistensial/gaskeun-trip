import { describe, expect, it } from 'vitest';
import { extractDriveFolderId, normalizeDriveImageUrl } from './gdriveAlbum';

describe('Google Drive Album Bridge helpers', () => {
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
});
