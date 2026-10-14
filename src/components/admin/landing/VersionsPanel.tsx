"use client";

import { History } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { LandingVersion } from "@/lib/data/landing-pages";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi",
  });
}

/** Published versions, newest first. Restoring asks first because it replaces the live page and the draft. */
export function VersionsPanel({
  versions, onRestore, busy = false,
}: {
  versions: LandingVersion[];
  onRestore: (version: number) => void | Promise<void>;
  busy?: boolean;
}) {
  const confirm = useConfirm();

  async function restore(version: number) {
    const ok = await confirm({
      title: `Restore version ${version}?`,
      description: `Restore version ${version}? This replaces the live page and your draft.`,
      confirmLabel: "Restore",
      destructive: true,
    });
    if (ok) await onRestore(version);
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <History className="h-7 w-7 text-pz-on-surface-variant" aria-hidden="true" />
        <p className="font-body text-sm text-pz-on-surface-variant">No published versions yet. A version is saved each time you publish.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {versions.map((v) => (
        <li key={v.version} className="space-y-2 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3">
          <p className="font-body text-xs font-semibold text-pz-on-surface">
            Version {v.version} · {formatWhen(v.createdAt)}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-[10px] text-pz-on-surface-variant">Restoring replaces your draft and the live page</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void restore(v.version)}
              className="rounded-lg border border-pz-outline-variant px-2.5 py-1 font-body text-xs font-semibold text-pz-primary hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11"
            >
              Restore this version
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
