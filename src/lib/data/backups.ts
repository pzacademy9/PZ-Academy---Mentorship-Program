import { createAdminSupabase } from "@/lib/supabase/admin";
import { backupHealth, type BackupHealth } from "@/lib/backups/status";

const NOT_SET_UP: BackupHealth = {
  level: "not_set_up",
  headline: "Backup status is not set up yet.",
  lastAt: null,
  lastMode: null,
  lastSizeBytes: null,
  restoreText: "",
};

const UNKNOWN: BackupHealth = {
  level: "unknown",
  headline: "Could not read the backup status. Try again in a minute.",
  lastAt: null,
  lastMode: null,
  lastSizeBytes: null,
  restoreText: "",
};

// Read only. The backup job writes the rows; nothing here can change or restore data.
export async function getBackupHealth(now: Date = new Date()): Promise<BackupHealth> {
  try {
    const db = createAdminSupabase();
    const { data, error } = await db
      .from("backup_runs")
      .select("*")
      .order("taken_at", { ascending: false })
      .limit(30);
    if (error) {
      // Before the database change (0121) is pasted, the table does not exist.
      const missing = error.code === "42P01" || error.code === "PGRST205" || /backup_runs/.test(error.message ?? "");
      return missing ? NOT_SET_UP : UNKNOWN;
    }
    return backupHealth(data ?? [], now);
  } catch {
    return UNKNOWN;
  }
}
