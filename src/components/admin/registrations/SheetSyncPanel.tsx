"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimePkt, relativeTime } from "@/lib/format";
import { REGISTRATION_STATUS_LABELS } from "@/components/admin/registrations/RegistrationStatusBadge";
import type { SheetSyncStatus } from "@/lib/data/landing-sheet-sync";

const SCAN_ROUTE = "/api/admin/landing-sheet-sync/scan";
const APPROVE_ROUTE = "/api/admin/landing-sheet-sync/approve";
const ERROR_TEXT = "Something went wrong. Please try again.";
/** The sheet is checked in the background; give it a moment before reloading the numbers. */
const REFRESH_AFTER_SCAN_MS = 5000;

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  amount: "Amount",
  name: "Name",
  email: "Email",
  whatsapp: "WhatsApp",
};

const PROBLEM_TITLES: Record<string, string> = {
  rejected: "Change not accepted",
  "unknown-row": "Row not recognised",
  "duplicate-row": "Same row twice",
};

const keyOf = (registrationId: string, field: string) => `${registrationId}|${field}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function showValue(field: string, v: string): string {
  if (v === "") return "Empty";
  if (field === "status") return REGISTRATION_STATUS_LABELS[v as keyof typeof REGISTRATION_STATUS_LABELS] ?? v;
  if (field === "amount" && /^\d+(\.\d+)?$/.test(v)) return `PKR ${Number(v).toLocaleString("en-GB")}`;
  return v;
}

async function readMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: unknown; error?: unknown };
    if (typeof data.error === "string" && !res.ok) return data.error;
    if (typeof data.message === "string") return data.message;
  } catch {
    /* fall through */
  }
  return fallback;
}

const primaryBtn =
  "inline-flex items-center justify-center gap-2 px-3.5 py-2 max-md:min-h-11 rounded-lg font-headline text-xs font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const quietBtn =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 max-md:min-h-11 rounded-lg font-headline text-xs font-medium bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function SheetSyncPanel({
  pageId,
  pageTitle,
  hasSheet,
  status,
}: {
  pageId: string;
  pageTitle: string;
  hasSheet: boolean;
  status: SheetSyncStatus | null;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set((status?.report ?? []).map((r) => keyOf(r.registrationId, r.field))),
  );
  const [approving, setApproving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<{ text: string; error: boolean } | null>(null);
  const [approveNote, setApproveNote] = useState<{ text: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const header = (
    <div>
      <Link
        href={`/dashboard/admin/enrollments/registrations/campaign/${pageId}`}
        className="inline-flex items-center gap-1.5 max-md:min-h-11 text-xs font-headline font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
        Back to registrations
      </Link>
      <div className="mt-3 space-y-1">
        <p className="text-xs font-headline font-bold uppercase tracking-wider text-pz-outline">Sheet sync</p>
        <h1 className="font-headline font-black text-2xl lg:text-3xl text-pz-on-surface tracking-tight">{pageTitle}</h1>
      </div>
    </div>
  );

  if (!hasSheet || !status) {
    return (
      <div className="space-y-6">
        {header}
        <p className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-6 text-sm font-body text-pz-on-surface-variant">
          This page has no sheet yet.
        </p>
      </div>
    );
  }

  const { report, problems } = status;
  const showReview = status.state === "report" && report.length > 0;
  const tickedCount = report.filter((r) => ticked.has(keyOf(r.registrationId, r.field))).length;

  function setRow(registrationId: string, field: string, on: boolean) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(keyOf(registrationId, field));
      else next.delete(keyOf(registrationId, field));
      return next;
    });
  }

  async function scan() {
    if (scanning) return;
    setScanning(true);
    setScanNote(null);
    try {
      const res = await fetch(SCAN_ROUTE, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      const text = await readMessage(res, res.ok ? "Scan requested. Results appear in a minute." : ERROR_TEXT);
      setScanNote({ text, error: !res.ok });
      if (res.ok) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), REFRESH_AFTER_SCAN_MS);
      }
    } catch {
      setScanNote({ text: ERROR_TEXT, error: true });
    } finally {
      setScanning(false);
    }
  }

  async function approve() {
    if (approving) return;
    setApproving(true);
    setApproveNote(null);
    try {
      const applyKeys = report
        .filter((r) => ticked.has(keyOf(r.registrationId, r.field)))
        .map((r) => ({ registrationId: r.registrationId, field: r.field }));
      const res = await fetch(APPROVE_ROUTE, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, applyKeys }),
      });
      if (!res.ok) {
        setApproveNote({ text: await readMessage(res, ERROR_TEXT), error: true });
        return;
      }
      const data = (await res.json()) as { applied?: number; keptApp?: number };
      setApproveNote({
        text: `Done. ${data.applied ?? 0} changes applied, ${data.keptApp ?? 0} kept as in the app.`,
        error: false,
      });
      router.refresh();
    } catch {
      setApproveNote({ text: ERROR_TEXT, error: true });
    } finally {
      setApproving(false);
    }
  }

  const checked = status.lastScannedAt
    ? `Sheet: checked ${relativeTime(status.lastScannedAt)}`
    : "Sheet: not checked yet";

  return (
    <div className="space-y-6">
      {header}

      {/* Status line */}
      <div className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-pz-surface-container-low text-xs font-headline font-semibold text-pz-on-surface"
            title={status.lastScannedAt ? `${formatDateTimePkt(status.lastScannedAt)} (Pakistan time)` : undefined}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-pz-primary" aria-hidden="true" />
            {checked}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-pz-secondary-container text-pz-on-secondary-container text-xs font-headline font-bold tracking-wide">
            <ClipboardList className="w-4 h-4" aria-hidden="true" />
            {`Waiting: ${status.waiting}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={scan} disabled={scanning} className={primaryBtn}>
            <RefreshCw className={cn("w-4 h-4", scanning && "animate-spin")} aria-hidden="true" />
            Scan now
          </button>
          <button type="button" onClick={scan} disabled={scanning} className={quietBtn}>
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
      {scanNote && (
        <p role="status" className={cn("text-sm font-body", scanNote.error ? "text-pz-error" : "text-pz-on-surface-variant")}>
          {scanNote.text}
        </p>
      )}

      {approveNote && (
        <p
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-body",
            approveNote.error ? "bg-pz-error-container text-pz-on-error-container" : "bg-pz-primary-fixed/30 text-pz-on-surface",
          )}
        >
          {!approveNote.error && <CheckCircle2 className="w-4 h-4 text-pz-primary shrink-0" aria-hidden="true" />}
          {approveNote.text}
        </p>
      )}

      {/* First-scan review */}
      {showReview && (
        <section className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 overflow-hidden">
          <div className="p-5 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-pz-surface-container-low/40">
            <div className="space-y-1.5 max-w-2xl">
              <h2 className="font-headline font-black text-xl md:text-2xl text-pz-on-surface tracking-tight">
                The sheet and the app are different in these rows
              </h2>
              <p className="text-sm font-body text-pz-on-surface-variant">
                Tick a row to use the sheet value. Leave it unticked to keep the app value.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-pz-tertiary-fixed text-pz-on-tertiary-fixed-variant text-xs font-headline font-semibold self-start lg:self-auto">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              Nothing changes until you approve.
            </span>
          </div>

          <ul className="px-3 md:px-8 py-2">
            {report.map((r) => {
              const on = ticked.has(keyOf(r.registrationId, r.field));
              const label = FIELD_LABELS[r.field] ?? r.field;
              return (
                <li
                  key={r.logId}
                  className={cn(
                    "my-1.5 rounded-lg bg-pz-surface-container-low/50 px-4 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-opacity",
                    !on && "opacity-70",
                  )}
                >
                  <label className="flex items-start gap-3.5 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setRow(r.registrationId, r.field, e.target.checked)}
                      aria-label={`Use sheet value for ${label} of ${r.name || "this person"}`}
                      className="mt-1 w-4 h-4 rounded border-pz-outline-variant cursor-pointer accent-pz-primary"
                    />
                    <span className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-headline font-bold text-sm text-pz-on-surface">{r.name || "Unnamed"}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-headline font-bold uppercase bg-pz-surface-container-highest text-pz-on-surface-variant">
                        {label}
                      </span>
                    </span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 lg:min-w-[440px]">
                    <div className="flex flex-col p-2.5 rounded-lg bg-pz-primary-container/20 min-w-0">
                      <span className="text-[10px] font-headline font-bold uppercase tracking-wider text-pz-on-primary-container dark:text-pz-primary-fixed mb-1">
                        Sheet value
                      </span>
                      <span className="font-headline font-semibold text-xs text-pz-on-surface break-words">{showValue(r.field, r.sheetValue)}</span>
                    </div>
                    <div className="flex flex-col p-2.5 rounded-lg bg-pz-surface-container-high/60 min-w-0">
                      <span className="text-[10px] font-headline font-bold uppercase tracking-wider text-pz-outline mb-1">App value</span>
                      <span className="font-headline text-xs text-pz-on-surface-variant break-words">{showValue(r.field, r.appValue)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-pz-surface-container p-1 rounded-lg self-end lg:self-auto shrink-0">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRow(r.registrationId, r.field, true)}
                      className={cn(
                        "px-3 py-1 max-md:min-h-9 text-xs rounded transition-all",
                        on ? "font-semibold bg-pz-primary-container text-pz-on-primary-container shadow-sm" : "font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-high",
                      )}
                    >
                      Use sheet value
                    </button>
                    <button
                      type="button"
                      aria-pressed={!on}
                      onClick={() => setRow(r.registrationId, r.field, false)}
                      className={cn(
                        "px-3 py-1 max-md:min-h-9 text-xs rounded transition-all",
                        !on ? "font-semibold bg-pz-surface-container-highest text-pz-on-surface shadow-sm" : "font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-high",
                      )}
                    >
                      Keep app value
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="px-5 md:px-8 py-5 flex flex-wrap items-center gap-4 border-t border-pz-outline-variant/30">
            <button type="button" onClick={approve} disabled={approving} className={cn(primaryBtn, "text-sm px-5 py-2.5")}>
              {approving ? "Approving…" : `Approve ${plural(tickedCount, "change", "changes")}`}
            </button>
            <span className="text-xs font-body text-pz-on-surface-variant">
              {report.length - tickedCount > 0
                ? `${plural(report.length - tickedCount, "row keeps", "rows keep")} the app value.`
                : "Every row will use the sheet value."}
            </span>
          </div>
        </section>
      )}

      {/* Nothing to do */}
      {status.state === "report" && report.length === 0 && problems.length === 0 && (
        <p className="flex items-center gap-3 rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-6 text-sm font-headline font-semibold text-pz-on-surface">
          <CheckCircle2 className="w-5 h-5 text-pz-primary shrink-0" aria-hidden="true" />
          Everything matches. Sheet and app agree.
        </p>
      )}
      {status.state === "live" && problems.length === 0 && (
        <p className="flex items-center gap-3 rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-6 text-sm font-headline font-semibold text-pz-on-surface">
          <CheckCircle2 className="w-5 h-5 text-pz-primary shrink-0" aria-hidden="true" />
          Everything matches. Sheet and app agree.
        </p>
      )}

      {/* Needs attention: information only */}
      {problems.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-headline font-black text-lg text-pz-on-surface tracking-tight inline-flex items-center gap-2">
              Needs attention
              <span className="px-2 py-0.5 rounded-full text-xs font-headline font-bold bg-pz-secondary-container text-pz-on-secondary-container tabular-nums">
                {problems.length}
              </span>
            </h2>
            <p className="text-sm font-body text-pz-on-surface-variant">
              These rows in the sheet were left alone. Fix them in the sheet or in the app, and they will clear on the next check.
            </p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {problems.map((p, i) => (
              <li
                key={`${p.rowNumber ?? "x"}-${p.refId}-${p.field}-${i}`}
                className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300 text-[11px] font-headline font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  {PROBLEM_TITLES[p.outcome] ?? "Needs a look"}
                </div>
                <div className="p-4 space-y-1.5">
                  <p className="text-xs font-headline font-bold text-pz-on-surface">
                    {p.rowNumber !== null ? `Row ${p.rowNumber}` : "Row unknown"}
                    {p.refId ? <span className="text-pz-outline font-medium">{` · ${p.refId}`}</span> : null}
                    {FIELD_LABELS[p.field] ? <span className="text-pz-outline font-medium">{` · ${FIELD_LABELS[p.field]}`}</span> : null}
                  </p>
                  <p className="text-sm font-body text-pz-on-surface-variant">{p.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
