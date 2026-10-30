"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Eye, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimePkt, relativeTime } from "@/lib/format";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { MirrorResult } from "@/lib/data/landing-mirror";

const SYNC_ROUTE = "/api/admin/landing-mirror/sync";
const ERROR_TEXT = "Something went wrong. Please try again.";
const MAX_PROBLEMS_SHOWN = 20;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const primaryBtn =
  "inline-flex items-center justify-center gap-2 px-3.5 py-2 max-md:min-h-11 rounded-lg font-headline text-xs font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const quietBtn =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 max-md:min-h-11 rounded-lg font-headline text-xs font-medium bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function MirrorPanel({
  pageId,
  lastRunAt,
  lastResult,
}: {
  pageId: string;
  lastRunAt: string | null;
  lastResult: MirrorResult | null;
}) {
  const router = useRouter();
  const [previewResult, setPreviewResult] = useState<MirrorResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "sync" | null>(null);

  const { run, pending } = useAsyncAction(async (preview: boolean) => {
    setMode(preview ? "preview" : "sync");
    setRunError(null);
    try {
      const res = await fetch(SYNC_ROUTE, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, preview }),
      });
      if (!res.ok) {
        setRunError(ERROR_TEXT);
        return;
      }
      const data = (await res.json()) as MirrorResult;
      if (preview) {
        setPreviewResult(data);
      } else {
        setPreviewResult(null);
        router.refresh();
      }
    } catch {
      setRunError(ERROR_TEXT);
    } finally {
      setMode(null);
    }
  });

  const failed = lastResult !== null && !lastResult.ok;
  const when = lastRunAt ?? lastResult?.ranAt ?? null;
  const problems = lastResult?.problems ?? [];
  const notes = lastResult?.notes ?? [];

  let summary: string;
  if (!lastResult || !when) {
    summary = "Not synced yet.";
  } else if (failed) {
    summary = "Could not read the sheet";
  } else {
    summary = `Synced from sheet ${relativeTime(when)}: ${lastResult.inserted} new, ${lastResult.changed} changed, ${plural(problems.length, "problem", "problems")}`;
  }

  return (
    <section className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-5 md:p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="font-headline font-black text-lg text-pz-on-surface tracking-tight">Synced from sheet</h2>
        <p className="text-sm font-body text-pz-on-surface-variant">
          Copies new sign-ups and status changes from the old sheet. It sends no emails.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <p
          className={cn(
            "inline-flex items-center gap-2 text-sm font-headline font-semibold",
            failed ? "text-pz-error" : "text-pz-on-surface",
          )}
          title={when ? `${formatDateTimePkt(when)} (Pakistan time)` : undefined}
        >
          {failed ? (
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : lastResult ? (
            <CheckCircle2 className="w-4 h-4 text-pz-primary shrink-0" aria-hidden="true" />
          ) : null}
          {summary}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void run(true)} disabled={pending} className={quietBtn}>
            <Eye className="w-4 h-4" aria-hidden="true" />
            {pending && mode === "preview" ? "Checking…" : "Preview (changes nothing)"}
          </button>
          <button type="button" onClick={() => void run(false)} disabled={pending} className={primaryBtn}>
            <RefreshCw className={cn("w-4 h-4", pending && mode === "sync" && "animate-spin")} aria-hidden="true" />
            {pending && mode === "sync" ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>

      {runError && (
        <p role="status" className="text-sm font-body text-pz-error">
          {runError}
        </p>
      )}

      {previewResult && (
        <p
          role="status"
          className={cn(
            "rounded-lg px-4 py-3 text-sm font-body",
            previewResult.ok
              ? "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed-variant"
              : "bg-pz-error-container text-pz-on-error-container",
          )}
        >
          {previewResult.ok
            ? `Preview only, nothing was changed. Would add ${previewResult.inserted}, change ${previewResult.changed}, ${plural(previewResult.problems.length, "problem", "problems")}.`
            : "Preview only, nothing was changed. Could not read the sheet."}
        </p>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 text-sm font-body text-pz-on-surface-variant">
          {problems.slice(0, MAX_PROBLEMS_SHOWN).map((p, i) => (
            <li key={`${p.rowNumber}-${i}`}>{`Row ${p.rowNumber}: ${p.reason}`}</li>
          ))}
          {problems.length > MAX_PROBLEMS_SHOWN && (
            <li className="text-pz-outline">{`and ${problems.length - MAX_PROBLEMS_SHOWN} more`}</li>
          )}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1 text-xs font-body text-pz-outline list-disc pl-4">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
