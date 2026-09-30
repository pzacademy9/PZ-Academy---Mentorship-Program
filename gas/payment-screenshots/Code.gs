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
 *   3. Copy the /exec URL into the Next.js app's .env.local as GAS_SHEETS_SYNC_URL
 *      (NOT GAS_WEBAPP_URL — that name is reserved for the separate feedback
 *      GAS project in production; reusing it here misroutes every upload
 *      route to the feedback script instead of this one)
 *   4. Put the same random string in .env.local as GAS_SHARED_SECRET
 */

const ROOT_FOLDER_NAME = "PZ Academy";
const SCREENSHOTS_FOLDER_NAME = "Payment Screenshots";
const COURSE_IMAGES_FOLDER_NAME = "Course Images";
const LESSON_DOCUMENTS_FOLDER_NAME = "Lesson Documents";
const MENTORSHIP_UPLOADS_FOLDER_NAME = "Mentorship Uploads";

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
 * Uploads a mentorship booking/application file (payment screenshot, CV,
 * applicant photo) to Drive. `folder` is "Bookings" or "Applications" — the
 * caller picks it, this handler doesn't infer it from mimeType. Public,
 * shareable link, same sharing level as payment screenshots and course
 * images — these are review artifacts an admin needs to view via a link, not
 * protected student content.
 */
function handleUploadMentorshipFile_(body) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }

  const { folder, mimeType, base64, filename } = body;
  if (!folder || !mimeType || !base64 || !filename) {
    return jsonResponse_({ ok: false, error: "Missing required fields" });
  }
  if (folder !== "Bookings" && folder !== "Applications") {
    return jsonResponse_({ ok: false, error: "Invalid folder" });
  }

  try {
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, filename);

    const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const uploadsRoot = getOrCreateFolder_(root, MENTORSHIP_UPLOADS_FOLDER_NAME);
    const targetFolder = getOrCreateFolder_(uploadsRoot, folder);

    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse_({ ok: true, url: file.getUrl() });
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
 * one) turns out to be a mistake. Scoped to the PZ Academy folder tree via
 * isUnderPzAcademyRoot_ so this action can never reach files it wasn't meant
 * to touch (e.g. payment screenshots) even though the caller supplies a bare
 * fileId. Idempotent for the one case that's genuinely equivalent to
 * success — the file is already gone (already trashed/deleted or a bad id) —
 * but every other failure (permission denied, quota, transient Drive error)
 * is reported back to the caller as `{ ok: false }` rather than swallowed, so
 * the app's warning-toast system actually has real failures to surface.
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
    const file = DriveApp.getFileById(fileId);
    if (!isUnderPzAcademyRoot_(file)) {
      return jsonResponse_({ ok: false, error: "File is outside the PZ Academy folder tree" });
    }
    file.setTrashed(true);
    return jsonResponse_({ ok: true });
  } catch (err) {
    const message = String(err);
    // "No item with the given ID could be found" is Drive's real exception
    // text for an already-deleted/never-existed file — that IS success from
    // the caller's perspective (idempotent retry). Anything else (permission
    // denied, quota, transient failure) is a real failure the caller needs
    // to know about, so it's logged and reported, not swallowed.
    if (message.indexOf("No item with the given ID could be found") !== -1) {
      return jsonResponse_({ ok: true });
    }
    console.error("handleTrashFile_ failed for fileId=" + fileId + ": " + message);
    return jsonResponse_({ ok: false, error: message });
  }
}

/**
 * True if `file` has the PZ Academy root folder anywhere in its parent chain
 * (walks up, not just immediate parent — files live in slug subfolders under
 * Course Images/Lesson Documents, i.e. two levels under root).
 */
function isUnderPzAcademyRoot_(file) {
  const root = DriveApp.getFolderById(getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME).getId());
  let parents = file.getParents();
  const visited = {};
  while (parents.hasNext()) {
    const parent = parents.next();
    const id = parent.getId();
    if (id === root.getId()) return true;
    if (visited[id]) continue; // guard against any cyclic/duplicate parent edge cases
    visited[id] = true;
    parents = combineIterators_(parents, parent.getParents());
  }
  return false;
}

/** Chains a remaining Drive FolderIterator with a new one so the walk-up loop can keep consuming a single `parents` variable. */
function combineIterators_(remaining, next) {
  const items = [];
  while (remaining.hasNext()) items.push(remaining.next());
  while (next.hasNext()) items.push(next.next());
  let i = 0;
  return {
    hasNext: function () { return i < items.length; },
    next: function () { return items[i++]; },
  };
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
