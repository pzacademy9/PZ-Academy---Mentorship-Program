/**
 * PZ Academy — Native Feedback System Drive upload proxy.
 *
 * Brand-new, standalone Apps Script project — deliberately separate from the
 * old "PZ Academy Feedback System" GAS project so that one is never touched
 * by this build. Same shared-secret pattern as gas/payment-screenshots.
 *
 * Setup after pasting into script.google.com:
 *   1. Project Settings -> Script Properties -> SHARED_SECRET = <long random string>
 *   2. Deploy -> New deployment -> Web app -> Execute as "Me", access "Anyone"
 *   3. Copy the /exec URL into .env.local as FEEDBACK_UPLOAD_GAS_URL
 *   4. Same random string into .env.local as FEEDBACK_UPLOAD_GAS_SECRET
 *   5. Run authorizeDrive() once from the editor, signed in as the deploying account
 */

const ROOT_FOLDER_NAME = "PZ Academy Feedback (Native)";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }
  try {
    if (body.action === "uploadVideo") return jsonResponse_(uploadVideo_(body));
    if (body.action === "uploadCover") return jsonResponse_(uploadCover_(body));
    return jsonResponse_({ ok: false, error: "Unknown action" });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function uploadVideo_(body) {
  const { sessionId, sessionName, mimeType, base64, filename } = body;
  if (!base64) throw new Error("No video data received.");
  if (base64.length > 28 * 1024 * 1024) throw new Error("Video is too large. Please keep it under 20 MB.");
  if (!/^video\//i.test(mimeType || "")) throw new Error("Unsupported file type.");

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, filename || `feedback_${Date.now()}.webm`);

  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const sessionFolder = getOrCreateFolder_(root, sanitizeFolderName_(sessionName || sessionId));
  const file = sessionFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Embeddable player URL, NOT the /thumbnail?id= form used below for cover
  // images. /thumbnail?id= returns a static JPEG (proven by /api/cover's own
  // content-type check) — feeding that into the <iframe src> that renders
  // video answers produces a broken player end-to-end. /file/d/<id>/preview
  // is Drive's actual embeddable viewer.
  return { ok: true, url: "https://drive.google.com/file/d/" + file.getId() + "/preview" };
}

function uploadCover_(body) {
  const { sessionId, mimeType, base64, filename } = body;
  if (!base64) throw new Error("No image data received.");

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, filename || `cover_${Date.now()}.jpg`);

  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const coversFolder = getOrCreateFolder_(root, "Covers");
  const file = coversFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { ok: true, url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1600" };
}

function getOrCreateFolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

function sanitizeFolderName_(name) {
  const cleaned = String(name || "").replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  return cleaned || "uncategorized";
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor, signed in as the deploying account, to grant the Drive scope. */
function authorizeDrive() {
  const f = DriveApp.createFile(Utilities.newBlob("ok", "text/plain", "auth-check.txt"));
  f.setTrashed(true);
}
