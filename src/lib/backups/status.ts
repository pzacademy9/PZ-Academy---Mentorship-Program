// Backup status rules for the Settings page. Pure: no database, no clock of its own.

export type BackupRow = {
  taken_at: string;
  mode: string;
  size_bytes: number;
  restore_ok: boolean | null;
  restore_checked_at: string | null;
};

export type BackupLevel = "ok" | "late" | "test_failed" | "none" | "not_set_up" | "unknown";

export type BackupHealth = {
  level: BackupLevel;
  headline: string;
  lastAt: string | null;
  lastMode: "nightly" | "weekly" | null;
  lastSizeBytes: number | null;
  restoreText: string;
};

/** A good backup older than this means the nightly job is failing or stopped. */
export const LATE_AFTER_MS = 48 * 60 * 60 * 1000;

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function restoreLine(rows: BackupRow[]): { text: string; failed: boolean } {
  const lastWeekly = rows.find((r) => r.mode === "weekly");
  if (!lastWeekly) return { text: "No Sunday restore test yet.", failed: false };
  if (lastWeekly.restore_ok === true) return { text: "Last Sunday restore test passed.", failed: false };
  if (lastWeekly.restore_ok === false) return { text: "Last Sunday restore test failed.", failed: true };
  return { text: "Sunday restore test has not finished yet.", failed: false };
}

/** rows: any order. now: the current time. */
export function backupHealth(rows: BackupRow[], now: Date): BackupHealth {
  const sorted = [...rows].sort((a, b) => b.taken_at.localeCompare(a.taken_at));
  const last = sorted[0];
  if (!last) {
    return {
      level: "none",
      headline: "No backup recorded yet.",
      lastAt: null,
      lastMode: null,
      lastSizeBytes: null,
      restoreText: "No Sunday restore test yet.",
    };
  }
  const restore = restoreLine(sorted);
  const mode = last.mode === "weekly" ? "weekly" : "nightly";
  const base = { lastAt: last.taken_at, lastMode: mode, lastSizeBytes: last.size_bytes, restoreText: restore.text } as const;
  const age = now.getTime() - new Date(last.taken_at).getTime();
  if (!Number.isFinite(age) || age > LATE_AFTER_MS) {
    return { ...base, level: "late", headline: "The last good backup is more than 2 days old." };
  }
  if (restore.failed) {
    return { ...base, level: "test_failed", headline: "Backups run, but the last restore test failed." };
  }
  return { ...base, level: "ok", headline: "Backups are running." };
}
