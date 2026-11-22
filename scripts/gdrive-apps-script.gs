/**
 * GASKEUN! — Google Drive Shared Album Bridge (Google Apps Script · 2026 Anti-403)
 *
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Supports multi-trip folders via `?folderId=...` (GET) and `body.folderId` (POST),
 * defaulting to the SOLO-27 pilot folder when omitted.
 */

const DEFAULT_FOLDER_ID = '19pwUotU9NdKh06HWaKkCvCUQS3WkSlVt';
const CREW_PIN = '1234'; // Must match your trip's 4-digit Crew Edit PIN

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function buildThumbnailUrl(fileId, width) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + width;
}

/**
 * GET — Returns JSON list of photos & stable Drive thumbnail URLs (w1200 grid / w2000 Lightbox).
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

      const fileId = file.getId();
      const rawName = file.getName().replace(/\.[^.]+$/, '');
      const parts = rawName.split('__');
      const dayId = parts[0] || 'day-1';
      const dayLabel = parts[1] || 'Trip';
      const uploaderName = parts[2] || 'Crew';
      const caption = parts.slice(3).join(' ') || rawName;

      photos.push({
        id: fileId,
        dayId: dayId,
        dayLabel: dayLabel,
        uploaderName: uploaderName,
        caption: caption,
        url: buildThumbnailUrl(fileId, 1200),
        fullUrl: buildThumbnailUrl(fileId, 2000),
        createdAt: file.getDateCreated().toISOString(),
      });
    }

    photos.sort(function (a, b) {
      return b.createdAt.localeCompare(a.createdAt);
    });

    return jsonResponse({ ok: true, photos: photos });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err), photos: [] });
  }
}

/**
 * POST — Validates Crew PIN and saves base64 JPEG into the shared Drive folder.
 * Reads `e.postData.contents` via JSON.parse so `Content-Type: text/plain;charset=utf-8`
 * bypasses browser CORS OPTIONS preflight cleanly.
 */
function doPost(e) {
  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(rawBody);
    if (String(body.crewPin || '').trim() !== CREW_PIN) {
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

    const fileName =
      [
        safe(body.dayId) || 'day-1',
        safe(body.dayLabel) || 'Trip',
        safe(body.uploaderName) || 'Crew',
        safe(body.caption) || 'Highlight',
      ].join('__') + '.jpg';

    const blob = Utilities.newBlob(bytes, body.mimeType || 'image/jpeg', fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();

    return jsonResponse({
      ok: true,
      id: fileId,
      url: buildThumbnailUrl(fileId, 1200),
      fullUrl: buildThumbnailUrl(fileId, 2000),
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}
