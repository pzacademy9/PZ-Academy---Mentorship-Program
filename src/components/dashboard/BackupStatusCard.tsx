import { formatPkt } from "@/lib/attendance/rules";
import { formatSize, type BackupHealth, type BackupLevel } from "@/lib/backups/status";

const DOT: Record<BackupLevel, string> = {
  ok: "bg-pz-bright",
  late: "bg-red-600",
  test_failed: "bg-red-600",
  none: "bg-pz-outline-variant",
  not_set_up: "bg-pz-outline-variant",
  unknown: "bg-pz-outline-variant",
};

const WORD: Record<BackupLevel, string> = {
  ok: "Healthy",
  late: "Late",
  test_failed: "Check needed",
  none: "Waiting",
  not_set_up: "Not set up",
  unknown: "Unknown",
};

// Read-only status. There is deliberately no restore button here: a restore overwrites live data.
export function BackupStatusCard({ health }: { health: BackupHealth }) {
  const bad = health.level === "late" || health.level === "test_failed";
  return (
    <section
      data-testid="backup-status"
      className="space-y-2 rounded-2xl border border-pz-outline-variant/40 bg-pz-surface-container p-4"
    >
      <h2 className="font-headline font-bold text-lg text-pz-secondary">Backups</h2>
      <p className="flex items-center gap-2 font-body text-sm text-pz-on-surface">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[health.level]}`} />
        <span className="font-semibold">{WORD[health.level]}</span>
        <span className={bad ? "text-red-700" : "text-pz-on-surface-variant"}>{health.headline}</span>
      </p>
      {health.lastAt ? (
        <ul className="space-y-1 font-body text-xs text-pz-on-surface-variant">
          <li>
            Last backup: {formatPkt(health.lastAt)} ({health.lastMode === "weekly" ? "full Sunday copy" : "nightly copy"}
            {health.lastSizeBytes != null ? `, ${formatSize(health.lastSizeBytes)}` : ""})
          </li>
          {health.restoreText ? <li>{health.restoreText}</li> : null}
        </ul>
      ) : null}
      {health.level === "late" || health.level === "test_failed" ? (
        <p className="font-body text-xs text-pz-on-surface-variant">Tell your developer. Nothing else is needed from you.</p>
      ) : null}
      <p className="font-body text-xs text-pz-on-surface-variant">
        Copies are taken every night at 2:00 am PKT. A restore is done with your developer, never from this page.
      </p>
      <details className="rounded-xl border border-pz-outline-variant/40 p-3 font-body text-xs text-pz-on-surface-variant">
        <summary className="min-h-6 cursor-pointer font-semibold text-pz-on-surface">How to restore if data is lost</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Stop changing things. Ask your team not to add or edit data until the restore is done.</li>
          <li>Do not delete or touch the current Supabase project. It stays as it is until you are sure.</li>
          <li>
            On GitHub, open your repo, then Actions, then &quot;Database backup&quot;. Pick the newest green run. Download the
            files named pz-backup. The Sunday run has everything. The nightly run is newer but skips the email and log tables.
          </li>
          <li>Find your backup passphrase in your password manager. Without it the files cannot be opened.</li>
          <li>Create a new, empty Supabase project.</li>
          <li>
            Give the downloaded files and the passphrase to your developer. They unlock the files, load them into the new
            project, restore the login accounts, and check the numbers.
          </li>
          <li>
            Only then switch the app to the new project (new keys in Vercel). Keep the old project for a few days in case
            something is missing.
          </li>
        </ol>
      </details>
    </section>
  );
}
