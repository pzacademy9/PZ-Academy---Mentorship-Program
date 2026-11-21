import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { backupHealth, formatSize, type BackupRow } from "@/lib/backups/status";
import { BackupStatusCard } from "@/components/dashboard/BackupStatusCard";

const NOW = new Date("2026-11-22T10:00:00Z");

function row(over: Partial<BackupRow> = {}): BackupRow {
  return {
    taken_at: "2026-11-22T02:00:00Z",
    mode: "nightly",
    size_bytes: 4_200_000,
    restore_ok: null,
    restore_checked_at: null,
    ...over,
  };
}

describe("backupHealth", () => {
  it("says none when nothing is recorded", () => {
    expect(backupHealth([], NOW).level).toBe("none");
  });

  it("is ok for a fresh nightly copy", () => {
    const h = backupHealth([row()], NOW);
    expect(h.level).toBe("ok");
    expect(h.lastMode).toBe("nightly");
    expect(h.restoreText).toBe("No Sunday restore test yet.");
  });

  it("is late when the newest copy is older than 2 days", () => {
    const h = backupHealth([row({ taken_at: "2026-11-19T02:00:00Z" })], NOW);
    expect(h.level).toBe("late");
  });

  it("is ok at 47 hours and late at 49 hours", () => {
    expect(backupHealth([row({ taken_at: "2026-11-20T11:00:00Z" })], NOW).level).toBe("ok");
    expect(backupHealth([row({ taken_at: "2026-11-20T09:00:00Z" })], NOW).level).toBe("late");
  });

  it("flags a failed restore test on the newest Sunday copy", () => {
    const h = backupHealth([row(), row({ mode: "weekly", taken_at: "2026-11-21T21:00:00Z", restore_ok: false })], NOW);
    expect(h.level).toBe("test_failed");
    expect(h.restoreText).toBe("Last Sunday restore test failed.");
  });

  it("reports a passed test and picks the newest row whatever the order", () => {
    const h = backupHealth(
      [row({ mode: "weekly", taken_at: "2026-11-15T21:00:00Z", restore_ok: false }), row({ mode: "weekly", taken_at: "2026-11-21T21:00:00Z", restore_ok: true })],
      NOW,
    );
    expect(h.level).toBe("ok");
    expect(h.lastMode).toBe("weekly");
    expect(h.restoreText).toBe("Last Sunday restore test passed.");
  });

  it("treats a Sunday copy with no test result yet as waiting, not failed", () => {
    const h = backupHealth([row({ mode: "weekly", restore_ok: null })], NOW);
    expect(h.level).toBe("ok");
    expect(h.restoreText).toBe("Sunday restore test has not finished yet.");
  });

  it("is late for an invalid date", () => {
    expect(backupHealth([row({ taken_at: "not a date" })], NOW).level).toBe("late");
  });
});

describe("formatSize", () => {
  it("formats sizes", () => {
    expect(formatSize(0)).toBe("0 KB");
    expect(formatSize(500)).toBe("1 KB");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(4_200_000)).toBe("4.0 MB");
  });
});

describe("BackupStatusCard", () => {
  it("shows the status, the last copy and the restore steps with no button", () => {
    render(<BackupStatusCard health={backupHealth([row()], NOW)} />);
    expect(screen.getByText("Backups are running.")).toBeTruthy();
    expect(screen.getByText(/nightly copy, 4.0 MB/)).toBeTruthy();
    expect(screen.getByText("How to restore if data is lost")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("warns in red wording when late", () => {
    render(<BackupStatusCard health={backupHealth([row({ taken_at: "2026-11-18T02:00:00Z" })], NOW)} />);
    expect(screen.getByText("The last good backup is more than 2 days old.").className).toContain("text-red-700");
    expect(screen.getByText(/Tell your developer/)).toBeTruthy();
  });

  it("shows the not set up state without a last-backup line", () => {
    render(
      <BackupStatusCard
        health={{ level: "not_set_up", headline: "Backup status is not set up yet.", lastAt: null, lastMode: null, lastSizeBytes: null, restoreText: "" }}
      />,
    );
    expect(screen.getByText("Not set up")).toBeTruthy();
    expect(screen.queryByText(/Last backup:/)).toBeNull();
  });
});
