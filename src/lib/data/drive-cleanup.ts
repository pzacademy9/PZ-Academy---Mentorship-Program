import "server-only";

// GAS_WEBAPP_URL is reserved for the feedback system in production; the
// Drive-upload bridge (shared by payment-screenshots + sheets-sync per
// gas/sheets-sync/Code.gs) lives at GAS_SHEETS_SYNC_URL instead.
const GAS_URL = process.env.GAS_SHEETS_SYNC_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

/** Moves one Drive file to Trash via the GAS relay's trashFile action. Never throws — callers treat a failure as "couldn't clean up," not a reason to fail their own operation. */
export async function trashDriveFile(fileId: string): Promise<{ ok: boolean }> {
  if (!GAS_URL || !GAS_SHARED_SECRET) return { ok: false };
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trashFile", secret: GAS_SHARED_SECRET, fileId }),
    });
    if (!res.ok) return { ok: false };
    const json: { ok?: boolean } = await res.json().catch(() => ({}));
    return { ok: json.ok === true };
  } catch {
    return { ok: false };
  }
}

const TRASH_CONCURRENCY = 5;

/**
 * Runs trashDriveFile over every id, capped at TRASH_CONCURRENCY in flight at
 * once — this hits the same shared GAS deployment that live payment-
 * screenshot and course-image uploads use, so an unbounded Promise.all here
 * could starve real traffic on a course with many files. Returns null if the
 * list was empty or everything succeeded — the common case, meaning
 * "nothing to tell the admin." Returns a human-readable warning if anything
 * failed, for the caller to attach to its own result and surface as a toast.
 */
export async function trashDriveFiles(fileIds: string[]): Promise<string | null> {
  if (fileIds.length === 0) return null;
  const results: Array<{ ok: boolean }> = [];
  for (let i = 0; i < fileIds.length; i += TRASH_CONCURRENCY) {
    const batch = fileIds.slice(i, i + TRASH_CONCURRENCY);
    results.push(...(await Promise.all(batch.map((id) => trashDriveFile(id)))));
  }
  const failedCount = results.filter((r) => !r.ok).length;
  if (failedCount === 0) return null;
  return `${failedCount} of ${fileIds.length} old file${fileIds.length === 1 ? "" : "s"} couldn't be removed from Drive.`;
}
