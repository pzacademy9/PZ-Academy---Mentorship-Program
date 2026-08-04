/**
 * PZ Academy — Payment Screenshot upload bridge.
 *
 * Shares one Apps Script project with gas/sheets-sync/Code.gs — a project has
 * only one doPost, so that file's doPost is the actual entry point and
 * dispatches action "uploadPaymentScreenshot" here. If this ever needs to run
 * standalone again, rename handleUploadPaymentScreenshot_ back to doPost(e)
 * and restore the JSON.parse/action-check lines it currently delegates.
 *
 * One-time setup after pasting this file into script.google.com:
 *   1. Project Settings -> Script Properties -> add SHARED_SECRET = <a long random string>
 *   2. Deploy -> New deployment -> Web app -> Execute as "Me", access "Anyone"
 *   3. Copy the /exec URL into the Next.js app's .env.local as GAS_WEBAPP_URL
 *   4. Put the same random string in .env.local as GAS_SHARED_SECRET
 */

const ROOT_FOLDER_NAME = "PZ Academy";
const SCREENSHOTS_FOLDER_NAME = "Payment Screenshots";
const COURSE_IMAGES_FOLDER_NAME = "Course Images";
const LESSON_DOCUMENTS_FOLDER_NAME = "Lesson Documents";

function handleUploadPaymentScreenshot_(body) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }

  const { studentId, courseSlug, mimeType, base64, filename } = body;
  if (!studentId || !mimeType || !base64 || !filename) {
    return jsonResponse_({ ok: false, error: "Missing required fields" });
  }

  try {
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, filename);

    const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const screenshotsRoot = getOrCreateFolder_(root, SCREENSHOTS_FOLDER_NAME);
    const courseFolder = getOrCreateFolder_(screenshotsRoot, sanitizeFolderName_(courseSlug));

    const file = courseFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse_({ ok: true, url: file.getUrl() });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * Uploads a course-facing image (mentor avatar, thumbnail, banner — `kind`
 * just picks the filename prefix) to a PUBLIC Drive file. These are
 * marketing assets shown on public pages, not protected content — unlike the
 * lesson PDFs planned for Part F, ANYONE_WITH_LINK is the correct sharing
 * level here, same as payment screenshots.
 */
function handleUploadCourseImage_(body) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }

  const { courseSlug, kind, mimeType, base64, filename } = body;
  if (!courseSlug || !mimeType || !base64 || !filename) {
    return jsonResponse_({ ok: false, error: "Missing required fields" });
  }

  try {
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, filename);

    const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const imagesRoot = getOrCreateFolder_(root, COURSE_IMAGES_FOLDER_NAME);
    const courseFolder = getOrCreateFolder_(imagesRoot, sanitizeFolderName_(courseSlug));

    const file = courseFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // file.getUrl() is an HTML viewer page, not hotlinkable. The more common
    // "uc?export=view" direct-content URL LOOKS hotlinkable (curl fetches it
    // fine) but its final response carries "Cross-Origin-Resource-Policy:
    // same-site" — Chrome silently blocks it in an <img> tag from any other
    // origin, so it renders as a broken image on every public page. Drive's
    // thumbnail endpoint carries no such header and actually works cross-origin.
    const directUrl = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1600";

    return jsonResponse_({ ok: true, url: directUrl, fileId: file.getId(), kind: kind || null });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * Uploads a lesson PDF or Supporting Document to a PRIVATE Drive file —
 * deliberately never calls setSharing, unlike the two handlers above. The
 * file stays owned by the script account only; students never get a raw
 * Drive URL, they get streamed bytes through /api/lessons/[id]/pdf or
 * /api/lessons/[id]/documents/[fileId], both of which reuse the existing
 * "lessons: read if unlocked or admin" RLS policy as the access gate.
 */
function handleUploadPrivateDocument_(body) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }

  const { courseSlug, mimeType, base64, filename } = body;
  if (!courseSlug || !mimeType || !base64 || !filename) {
    return jsonResponse_({ ok: false, error: "Missing required fields" });
  }

  try {
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, filename);

    const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const documentsRoot = getOrCreateFolder_(root, LESSON_DOCUMENTS_FOLDER_NAME);
    const courseFolder = getOrCreateFolder_(documentsRoot, sanitizeFolderName_(courseSlug));

    const file = courseFolder.createFile(blob);

    return jsonResponse_({ ok: true, fileId: file.getId() });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * Server-to-server only — takes a fileId and returns its bytes as base64.
 * The shared secret never reaches a browser; Next.js's gated stream routes
 * call this after their own RLS-backed access check already passed.
 */
function handleFetchPrivateDocument_(body) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }

  const { fileId } = body;
  if (!fileId) {
    return jsonResponse_({ ok: false, error: "Missing fileId" });
  }

  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    return jsonResponse_({
      ok: true,
      mimeType: blob.getContentType(),
      filename: file.getName(),
      base64: Utilities.base64Encode(blob.getBytes()),
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * Moves a file to Drive's Trash rather than permanently deleting it — gives
 * a ~30-day recovery window inside Drive itself if an app-side delete (an
 * admin clearing/replacing an image, or deleting a lesson/course that owned
 * one) turns out to be a mistake. Treats "already gone" as success: the
 * caller only cares that the file is no longer live, not whether this
 * specific call was the one that removed it.
 */
function handleTrashFile_(body) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }

  const { fileId } = body;
  if (!fileId) {
    return jsonResponse_({ ok: false, error: "Missing fileId" });
  }

  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return jsonResponse_({ ok: true });
  } catch (err) {
    if (String(err).indexOf("not found") !== -1) {
      return jsonResponse_({ ok: true });
    }
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/** Finds a child folder by exact name, creating it if it doesn't exist yet. */
function getOrCreateFolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

function sanitizeFolderName_(courseSlug) {
  if (!courseSlug || typeof courseSlug !== "string") return "uncategorized";
  const cleaned = courseSlug.replace(/[^a-zA-Z0-9-_]/g, "");
  return cleaned || "uncategorized";
}

// jsonResponse_ lives in gas/sheets-sync/Code.gs — this project only has one
// doPost, so both files share that project's global scope.
