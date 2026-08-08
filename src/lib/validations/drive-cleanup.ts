/**
 * Pure Drive-fileId bookkeeping — no network calls, no server-only import,
 * so these stay unit-testable. The actual GAS trash call lives in
 * src/lib/data/drive-cleanup.ts.
 */

/**
 * Pulls the file id out of one of our own Drive thumbnail URLs
 * (`https://drive.google.com/thumbnail?id=<id>&sz=w1600`). Returns null for
 * anything else — a manually pasted external image URL, an empty/blank
 * value, a malformed string, or a well-formed thumbnail URL with an empty
 * `id` param. This filters out obviously-foreign URLs before a fileId ever
 * reaches the GAS relay, but it's necessary, not sufficient, on its own —
 * it can't stop a spoofed or reused thumbnail URL that happens to carry
 * someone else's real fileId. What actually closes that loop is the
 * `isUnderPzAcademyRoot_` folder-scope check in GAS's handleTrashFile_,
 * which is the last line of defense against trashing a file this app
 * didn't itself upload.
 */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com" || parsed.pathname !== "/thumbnail") return null;
  return parsed.searchParams.get("id") || null;
}

/**
 * Pulls the file id out of one of our own Drive "view" URLs
 * (`https://drive.google.com/file/d/<id>/view?usp=drivesdk`) — the shape
 * handleUploadMentorshipFile_ returns via file.getUrl() for payment
 * screenshots, CVs, and applicant photos. Distinct from the `/thumbnail?id=`
 * shape extractDriveFileId parses (course images) — kept as a separate
 * function rather than widening extractDriveFileId, so each stays a narrow
 * safety boundary for its own upload path. Returns null for anything else:
 * a manually pasted external URL, an empty/blank value, a malformed string,
 * a Drive URL that isn't this specific shape, or a well-formed URL with an
 * empty fileId segment.
 */
export function extractDriveFileIdFromViewUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com") return null;
  const prefix = "/file/d/";
  if (!parsed.pathname.startsWith(prefix)) return null;
  const fileId = parsed.pathname.slice(prefix.length).split("/")[0];
  return fileId || null;
}

export interface CourseImageUrls {
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  mentorAvatarUrl: string | null;
}

/** Given the course's old and new image field values, returns every old Drive fileId that got cleared or replaced. */
export function diffCourseImageFileIds(oldUrls: CourseImageUrls, newUrls: CourseImageUrls): string[] {
  const pairs: Array<[string | null, string | null]> = [
    [oldUrls.thumbnailUrl, newUrls.thumbnailUrl],
    [oldUrls.bannerUrl, newUrls.bannerUrl],
    [oldUrls.mentorAvatarUrl, newUrls.mentorAvatarUrl],
  ];
  const toTrash: string[] = [];
  for (const [oldUrl, newUrl] of pairs) {
    if (oldUrl === newUrl) continue;
    const fileId = extractDriveFileId(oldUrl);
    if (fileId) toTrash.push(fileId);
  }
  return toTrash;
}

export interface LessonFileState {
  pdfFileId: string | null;
  documents: Array<{ fileId: string }>;
}

export interface LessonFileUpdate {
  pdfFileId?: string | null;
  documents?: Array<{ fileId: string }>;
}

/**
 * `pdf_file_id` and each document's `fileId` are already raw Drive file ids
 * (not URLs) — no extraction step needed here, unlike the course-image
 * fields. Only diffs fields that were actually part of this update: a
 * lesson-title-only PATCH must never trash the pdf just because the caller
 * didn't mention it.
 */
export function diffLessonFileIds(old: LessonFileState, next: LessonFileUpdate): string[] {
  const toTrash: string[] = [];
  if (next.pdfFileId !== undefined && next.pdfFileId !== old.pdfFileId && old.pdfFileId) {
    toTrash.push(old.pdfFileId);
  }
  if (next.documents !== undefined) {
    const newIds = new Set(next.documents.map((d) => d.fileId));
    for (const doc of old.documents) {
      if (!newIds.has(doc.fileId)) toTrash.push(doc.fileId);
    }
  }
  return toTrash;
}

/** Every Drive fileId a set of lessons owns — used before a cascading module/course delete removes them from the DB. */
export function collectLessonFileIds(lessons: LessonFileState[]): string[] {
  const ids: string[] = [];
  for (const lesson of lessons) {
    if (lesson.pdfFileId) ids.push(lesson.pdfFileId);
    for (const doc of lesson.documents) ids.push(doc.fileId);
  }
  return ids;
}
