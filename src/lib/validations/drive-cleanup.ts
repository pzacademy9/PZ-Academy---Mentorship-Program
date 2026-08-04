/**
 * Pure Drive-fileId bookkeeping — no network calls, no server-only import,
 * so these stay unit-testable. The actual GAS trash call lives in
 * src/lib/data/drive-cleanup.ts.
 */

/**
 * Pulls the file id out of one of our own Drive thumbnail URLs
 * (`https://drive.google.com/thumbnail?id=<id>&sz=w1600`). Returns null for
 * anything else — a manually pasted external image URL, an empty/blank
 * value, or a malformed string — which is the safety boundary that keeps
 * the app from ever asking Drive to trash a file it didn't itself upload.
 */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "drive.google.com" || parsed.pathname !== "/thumbnail") return null;
  return parsed.searchParams.get("id");
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
