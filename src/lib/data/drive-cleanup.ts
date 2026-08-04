import "server-only";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
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

/**
 * Runs trashDriveFile over every id in parallel. Returns null if the list
 * was empty or everything succeeded — the common case, meaning "nothing to
 * tell the admin." Returns a human-readable warning if anything failed, for
 * the caller to attach to its own result and surface as a toast.
 */
export async function trashDriveFiles(fileIds: string[]): Promise<string | null> {
  if (fileIds.length === 0) return null;
  const results = await Promise.all(fileIds.map((id) => trashDriveFile(id)));
  const failedCount = results.filter((r) => !r.ok).length;
  if (failedCount === 0) return null;
  return `Saved, but ${failedCount} of ${fileIds.length} old file${fileIds.length === 1 ? "" : "s"} couldn't be removed from Drive.`;
}
