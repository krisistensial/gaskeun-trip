/**
 * GASKEUN! — Google Drive Shared Media & Album Bridge (Google Apps Script · 2026)
 *
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Features:
 * - Multi-trip folder support via `?folderId=...` (GET) & `body.folderId` (POST).
 * - Filters out `[ASSET-` files (hero covers, avatars, plan/stay/train photos) from
 *   the Album gallery `doGet` response while keeping them publicly viewable via URL.
 * - Optional PIN protection: only enforces `REQUIRED_PIN` if non-empty.
 * - Uses stable `thumbnail?id=...&sz=w1200` / `w4096` endpoints + direct original `downloadUrl`.
 */

const DEFAULT_FOLDER_ID = '19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt';
const REQUIRED_PIN = ''; // Optional: set e.g. '1234' to enforce PIN on uploads; empty allows seamless crew uploads

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function buildThumbnailUrl(fileId, width) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + width;
}

function buildDownloadUrl(fileId) {
  return 'https://drive.google.com/uc?export=download&id=' + fileId;
}

function extensionFromMime(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/heic' || m === 'image/heif') return '.heic';
  return '.jpg';
}

/**
 * GET — Returns JSON list of Album photos (excluding `[ASSET-` card/avatar files).
 * Optional query param: ?folderId=<DRIVE_FOLDER_ID>
 */
function doGet(e) {
  try {
    const requestedFolderId =
      e && e.parameter && e.parameter.folderId
        ? String(e.parameter.folderId).trim()
        : DEFAULT_FOLDER_ID;
    const folder = DriveApp.getFolderById(requestedFolderId || DEFAULT_FOLDER_ID);
    const files = folder.getFiles();
    const photos = [];

    while (files.hasNext()) {
      const file = files.next();
      const mime = file.getMimeType();
      if (!mime || mime.indexOf('image/') !== 0) continue;

      const fileName = file.getName();
      // Keep shared card assets (hero, plan, stay, train, avatar) out of the Album gallery
      if (fileName.indexOf('[ASSET-') === 0) continue;

      const fileId = file.getId();
      const rawName = fileName.replace(/\.[^.]+$/, '');
      const parts = rawName.split('__');
      const dayId = parts[0] || 'day-1';
      const dayLabel = parts[1] || 'Trip';
      const uploaderName = parts[2] || 'Crew';
      const caption = parts.slice(3).join(' ') || rawName;

      photos.push({
        id: fileId,
        name: fileName,
        dayId: dayId,
        dayLabel: dayLabel,
        uploaderName: uploaderName,
        caption: caption,
        url: buildThumbnailUrl(fileId, 1200),
        fullUrl: buildThumbnailUrl(fileId, 4096),
        downloadUrl: buildDownloadUrl(fileId),
        createdAt: file.getDateCreated().toISOString(),
      });
    }

    photos.sort(function (a, b) {
      return b.createdAt.localeCompare(a.createdAt);
    });

    return jsonResponse({ ok: true, photos: photos });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: (err && err.message) || String(err),
      photos: [],
    });
  }
}

/**
 * POST — Saves full-res base64 image into the shared Drive folder and sets public view sharing.
 * Reads `e.postData.contents` via JSON.parse so `Content-Type: text/plain;charset=utf-8`
 * bypasses browser CORS OPTIONS preflight cleanly.
 */
function doPost(e) {
  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(rawBody);

    if (REQUIRED_PIN && String(body.crewPin || '').trim() !== REQUIRED_PIN) {
      return jsonResponse({ ok: false, error: 'Invalid Crew PIN' });
    }

    const targetFolderId =
      body.folderId && String(body.folderId).trim()
        ? String(body.folderId).trim()
        : DEFAULT_FOLDER_ID;
    const folder = DriveApp.getFolderById(targetFolderId);
    const bytes = Utilities.base64Decode(body.base64 || '');
    const safe = function (s) {
      return String(s || '')
        .replace(/[^a-zA-Z0-9 -]/g, '')
        .trim()
        .slice(0, 40);
    };

    const rawPrefix = String(body.assetPrefix || '').trim();
    const prefix =
      rawPrefix && /^\[ASSET-[a-z0-9-]+\]$/i.test(rawPrefix) ? rawPrefix + '__' : '';

    const mimeType = body.mimeType || 'image/jpeg';
    const ext = extensionFromMime(mimeType);

    const fileName =
      prefix +
      [
        safe(body.dayId) || 'day-1',
        safe(body.dayLabel) || 'Trip',
        safe(body.uploaderName) || 'Crew',
        safe(body.caption) || 'Highlight',
      ].join('__') +
      ext;

    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();

    return jsonResponse({
      ok: true,
      id: fileId,
      name: fileName,
      url: buildThumbnailUrl(fileId, 1200),
      fullUrl: buildThumbnailUrl(fileId, 4096),
      downloadUrl: buildDownloadUrl(fileId),
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: (err && err.message) || String(err),
    });
  }
}
