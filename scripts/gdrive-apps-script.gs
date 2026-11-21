/**
 * GASKEUN! — Google Drive Shared Album Bridge (Google Apps Script)
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Replace FOLDER_ID and CREW_PIN below before deploying.
 */

const FOLDER_ID = 'REPLACE_WITH_YOUR_GOOGLE_DRIVE_FOLDER_ID';
const CREW_PIN = '1234'; // Must match your trip's 4-digit Crew Edit PIN

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * GET — Returns JSON list of photos & direct thumbnail URLs in the trip folder.
 */
function doGet() {
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const files = folder.getFiles();
    const photos = [];

    while (files.hasNext()) {
      const file = files.next();
      const mime = file.getMimeType();
      if (!mime || mime.indexOf('image/') !== 0) continue;

      const rawName = file.getName().replace(/\.[^.]+$/, '');
      const parts = rawName.split('__');
      const dayId = parts[0] || 'day-1';
      const dayLabel = parts[1] || 'Trip';
      const uploaderName = parts[2] || 'Crew';
      const caption = parts.slice(3).join(' ') || '';

      photos.push({
        id: file.getId(),
        dayId: dayId,
        dayLabel: dayLabel,
        uploaderName: uploaderName,
        caption: caption,
        url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200',
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
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (String(body.crewPin || '').trim() !== CREW_PIN) {
      return jsonResponse({ ok: false, error: 'Invalid Crew PIN' });
    }

    const folder = DriveApp.getFolderById(FOLDER_ID);
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

    return jsonResponse({
      ok: true,
      id: file.getId(),
      url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200',
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}
