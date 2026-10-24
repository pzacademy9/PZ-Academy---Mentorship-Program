"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenCheck, CheckCircle2, Clock, DatabaseZap, FolderX, LockOpen, Send, TriangleAlert, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import type { CloseBatchPreview, CloseBatchResult } from "@/lib/data/landing-close-batch";

type ModuleRow = { id: string; title: string; finishedAt: string | null; paidLive: number; opened: number };
type Overview = { courseTitle: string | null; modules: ModuleRow[]; recordedPaid: number };
type BatchResult = { modulesFinished: number; opened: number; emailed: number; alreadyOpen: number; waitingForAccount: number; failed: number };
type LinkResult = { sent: number; notOpenYet: number; waitingForAccount: number; failed: number };
type Audience = "live" | "recorded" | "both";

type Pending =
  | { kind: "module"; moduleId: string; title: string; paid: number; opened: number }
  | { kind: "course" }
  | { kind: "link" }
  | { kind: "crm"; pageId: string; preview: CloseBatchPreview };

const ERROR_TEXT = "Something went wrong. Please try again.";
const AUDIENCES: { key: Audience; label: string }[] = [
  { key: "live", label: "Live students" },
  { key: "recorded", label: "Recorded students" },
  { key: "both", label: "Both" },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function moduleConfirmText(paid: number, opened: number): string {
  if (paid === 0) return "No Live students have paid yet, so nobody will be emailed. Pressing only marks this module as finished.";
  if (opened >= paid) {
    return "Everyone already has this module open. Pressing again only sends the link to anyone who did not get it.";
  }
  return `${plural(paid, "Live student", "Live students")} paid and ${opened} already ${opened === 1 ? "has" : "have"} this module open. Pressing opens it for the rest and emails the portal link to those who have signed up.`;
}

const AUDIENCE_CONFIRM: Record<Audience, string> = {
  live: "Live students",
  recorded: "Recorded students",
  both: "Live and Recorded students",
};

function batchSentence(r: BatchResult): string {
  const parts = [`Opened for ${plural(r.opened, "student", "students")}.`, `Emailed ${r.emailed}.`];
  if (r.alreadyOpen > 0) parts.push(`${plural(r.alreadyOpen, "student already had", "students already had")} it open.`);
  if (r.failed > 0) parts.push(`${plural(r.failed, "email", "emails")} did not send (press again to retry).`);
  if (r.waitingForAccount > 0) parts.push(`${plural(r.waitingForAccount, "student still needs", "students still need")} to sign up.`);
  return parts.join(" ");
}

function linkSentence(r: LinkResult): { main: string; rest: string[] } {
  const rest: string[] = [];
  if (r.notOpenYet > 0) rest.push(`${plural(r.notOpenYet, "Live student is", "Live students are")} not open yet.`);
  if (r.failed > 0) rest.push(`${plural(r.failed, "email", "emails")} did not send (press again to retry).`);
  if (r.waitingForAccount > 0) rest.push(`${plural(r.waitingForAccount, "student still needs", "students still need")} to sign up.`);
  return { main: `Sent to ${r.sent}.`, rest };
}

function crmConfirmText(p: CloseBatchPreview): string {
  if (p.paid === 0 && p.interested === 0) return "There is nobody to copy yet.";
  const parts = [
    `This copies ${plural(p.paid, "paid person", "paid people")} and ${plural(p.interested, "interested person", "interested people")} into your CRM as new cohorts. Nothing is removed from Registrations.`,
  ];
  if (p.alreadyClosed) {
    parts.push(`This batch was saved before. Only ${plural(p.newPaid, "new paid person", "new paid people")} will be added; the interested list is refreshed.`);
  }
  if (p.skipped > 0) {
    parts.push(`${plural(p.skipped, "person", "people")} can't be copied (no contact details, test entries, or no permission to contact).`);
  }
  return parts.join(" ");
}

function crmSentence(r: CloseBatchResult, preview: CloseBatchPreview): string {
  if (preview.alreadyClosed) {
    const again = `Saved to your CRM again. ${plural(preview.newPaid, "new paid person", "new paid people")} added; the interested list was refreshed (${plural(r.interestedAdded, "person", "people")}).`;
    return r.skipped > 0 ? `${again} ${r.skipped} skipped.` : again;
  }
  const parts = [
    `Saved to your CRM: ${r.paidAdded} paid and ${r.interestedAdded} interested.`,
    `${r.contactsMerged} ${r.contactsMerged === 1 ? "was" : "were"} already in the CRM.`,
  ];
  if (r.skipped > 0) parts.push(`${r.skipped} skipped.`);
  return parts.join(" ");
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

const primaryBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function BatchAccessPanel({ pageOptions }: { pageOptions: { id: string; title: string }[] }) {
  const [pageId, setPageId] = useState(pageOptions[0]?.id ?? "");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(pageOptions.length > 0);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [audience, setAudience] = useState<Audience>("live");
  const [batchStrip, setBatchStrip] = useState<{ label: string; text: string } | null>(null);
  const [linkStrip, setLinkStrip] = useState<{ main: string; rest: string[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [crmStrip, setCrmStrip] = useState<string | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmSaving, setCrmSaving] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async (id: string, showSpinner: boolean) => {
    const ticket = ++latest.current;
    if (showSpinner) {
      setLoading(true);
      setOverview(null);
    }
    setLoadError(false);
    try {
      const res = await fetch(`/api/admin/landing/batch?pageId=${encodeURIComponent(id)}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as Overview;
      if (ticket === latest.current) setOverview(data);
    } catch {
      // A background refresh that fails keeps the numbers on screen and says nothing: it must not hide a press that worked.
      if (ticket === latest.current && showSpinner) setLoadError(true);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pageId) void load(pageId, true);
  }, [pageId, load]);

  const { run: runPreview, pending: previewing } = useAsyncAction(async () => {
    setCrmError(null);
    setCrmStrip(null);
    try {
      const res = await fetch(`/api/admin/landing/close-batch?pageId=${encodeURIComponent(pageId)}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("preview failed");
      const preview = (await res.json()) as CloseBatchPreview;
      setPending({ kind: "crm", pageId, preview });
    } catch {
      setCrmError(ERROR_TEXT);
    }
  });

  const { run, pending: running } = useAsyncAction(async (action: Pending) => {
    if (action.kind === "crm") {
      setCrmError(null);
      setCrmStrip(null);
      setCrmSaving(true);
      try {
        const res = await fetch("/api/admin/landing/close-batch", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId: action.pageId }),
        });
        if (!res.ok) throw new Error("request failed");
        setCrmStrip(crmSentence((await res.json()) as CloseBatchResult, action.preview));
      } catch {
        setCrmError(ERROR_TEXT);
      } finally {
        setCrmSaving(false);
      }
      return;
    }
    setActionError(null);
    setBatchStrip(null);
    setLinkStrip(null);
    const isLink = action.kind === "link";
    let pressFailed = false;
    try {
      const res = await fetch(isLink ? "/api/admin/landing/portal-links" : "/api/admin/landing/batch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isLink ? { pageId, audience } : { pageId, moduleId: action.kind === "module" ? action.moduleId : null },
        ),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      if (isLink) {
        setLinkStrip(linkSentence(data as LinkResult));
      } else {
        setBatchStrip({
          label: action.kind === "module" ? action.title : "Whole course",
          text: batchSentence(data as BatchResult),
        });
      }
    } catch {
      pressFailed = true;
      setActionError(ERROR_TEXT);
    }
    // After a press, good or failed (a partial run may have changed the numbers), show the current numbers.
    // Kept outside the try so a refresh problem can never turn a successful press into an error.
    if (!isLink) await load(pageId, false);
    return pressFailed;
  });

  function confirm() {
    if (!pending) return;
    const action = pending;
    setPending(null);
    void run(action);
  }

  const busy = running || previewing;
  const nothingToCopy = pending?.kind === "crm" && pending.preview.paid === 0 && pending.preview.interested === 0;
  const noCourse = !!overview && overview.courseTitle === null;
  const empty = !!overview && (noCourse || overview.modules.length === 0);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-5 space-y-2">
        <label htmlFor="batch-page" className="block font-label text-xs font-semibold text-pz-primary uppercase tracking-wide">
          Landing page
        </label>
        <select
          id="batch-page"
          value={pageId}
          disabled={running || previewing}
          onChange={(e) => {
            setPageId(e.target.value);
            setBatchStrip(null);
            setLinkStrip(null);
            setActionError(null);
            setCrmStrip(null);
            setCrmError(null);
          }}
          className="w-full max-w-xl rounded-lg bg-pz-surface-container-low px-3.5 py-2.5 font-headline font-bold text-sm max-md:text-base text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/40 disabled:opacity-60"
        >
          {pageOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {overview?.courseTitle && (
          <p className="font-body text-sm text-pz-on-surface-variant">
            Course: <strong className="font-headline text-pz-on-surface">{overview.courseTitle}</strong>
          </p>
        )}
      </div>

      {pageOptions.length === 0 && (
        <p className="font-body text-sm text-pz-on-surface-variant">There are no landing pages yet.</p>
      )}

      {loading && (
        <p role="status" className="font-body text-sm text-pz-on-surface-variant">
          Loading…
        </p>
      )}

      {pageId && (
        <section className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <h3 className="font-headline font-black text-lg text-pz-on-surface">Save batch to your CRM</h3>
              <p className="font-body text-sm text-pz-on-surface-variant mt-1 max-w-2xl">
                Copy this batch&apos;s paid and interested people into your CRM as new cohorts. Nothing is removed from Registrations.
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => void runPreview()} className={primaryBtn}>
              <DatabaseZap className="w-4 h-4" aria-hidden="true" />
              {crmSaving ? "Saving…" : "Save batch to CRM"}
            </button>
          </div>
          {crmError && (
            <p role="alert" className="font-body text-sm text-pz-danger">
              {crmError}
            </p>
          )}
          {crmStrip && (
            <p role="status" className="flex items-start gap-2.5 rounded-lg bg-pz-surface-container-low p-3.5 font-body text-sm text-pz-on-surface">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-pz-primary" aria-hidden="true" />
              <span>{crmStrip}</span>
            </p>
          )}
        </section>
      )}

      {loadError && !loading && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-pz-solid-danger/40 bg-pz-solid-danger/10 p-3">
          <TriangleAlert className="w-4 h-4 shrink-0 text-pz-danger" aria-hidden="true" />
          <span className="font-body text-sm text-pz-danger">{ERROR_TEXT}</span>
          <button
            type="button"
            onClick={() => void load(pageId, true)}
            className="ml-auto px-3 py-1.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface"
          >
            Try again
          </button>
        </div>
      )}

      {empty && (
        <div className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-pz-surface-container-low flex items-center justify-center text-pz-on-surface-variant mb-4">
            <FolderX className="w-8 h-8" aria-hidden="true" />
          </div>
          <h3 className="font-headline font-bold text-xl text-pz-on-surface mb-2">{noCourse ? "This page has no course yet." : "This course has no modules yet."}</h3>
          <p className="font-body text-sm text-pz-on-surface-variant max-w-md">
            {noCourse
              ? "Add a course to this page, or pick another page above, to open modules for students."
              : "Add modules to this course, or pick another page above, to open them for students."}
          </p>
        </div>
      )}

      {overview && !empty && (
        <>
          {actionError && (
            <p role="alert" className="font-body text-sm text-pz-danger">
              {actionError}
            </p>
          )}

          <section className="relative overflow-hidden rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-6">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-pz-primary" aria-hidden="true" />
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-pz-primary-container/40 flex items-center justify-center text-pz-on-primary-container shrink-0">
                  <BookOpenCheck className="w-7 h-7" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="font-headline font-black text-xl text-pz-on-surface">Whole course</h2>
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-headline font-bold bg-pz-secondary-fixed text-pz-on-secondary-fixed">
                      {plural(overview.modules.length, "module", "modules")}
                    </span>
                  </div>
                  <p className="font-body text-sm text-pz-on-surface-variant">
                    {overview.recordedPaid} Recorded students paid
                  </p>
                  <p className="font-label text-xs text-pz-on-surface-variant">
                    Opens every module at once for your Live students.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={running}
                onClick={() => setPending({ kind: "course" })}
                className={primaryBtn}
              >
                <LockOpen className="w-4 h-4" aria-hidden="true" />
                Batch finished for the whole course
              </button>
            </div>
          </section>

          {batchStrip && (
            <div className="relative overflow-hidden rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-4 pl-5 flex items-start justify-between gap-3">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-pz-secondary-container" aria-hidden="true" />
              <div>
                <p className="font-headline font-bold text-xs text-pz-on-surface">{batchStrip.label}</p>
                <p role="status" className="font-body text-sm text-pz-on-surface-variant mt-0.5">
                  {batchStrip.text}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setBatchStrip(null)}
                className="p-1 rounded text-pz-on-surface-variant hover:text-pz-on-surface"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          <section className="space-y-3">
            <h3 className="font-headline font-bold text-base text-pz-on-surface px-1">Modules</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {overview.modules.map((m) => {
                return (
                  <div
                    key={m.id}
                    className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-headline font-bold",
                          m.finishedAt
                            ? "bg-pz-primary-fixed text-pz-on-primary-fixed"
                            : "bg-pz-surface-container-high text-pz-on-surface-variant",
                        )}
                      >
                        {m.finishedAt ? (
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {m.finishedAt ? `Finished on ${formatDay(m.finishedAt)}` : "Not finished"}
                      </span>
                      <h4 className="font-headline font-bold text-base text-pz-on-surface leading-snug">{m.title}</h4>
                      <p className="rounded-lg bg-pz-surface-container-low p-2.5 text-xs font-headline font-semibold text-pz-on-surface-variant">
                        {m.paidLive} Live students paid, {m.opened} portal open
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => setPending({ kind: "module", moduleId: m.id, title: m.title, paid: m.paidLive, opened: m.opened })}
                        className={primaryBtn}
                      >
                        <LockOpen className="w-4 h-4" aria-hidden="true" />
                        Batch finished
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div>
                <h3 className="font-headline font-black text-lg text-pz-on-surface">Email portal link</h3>
                <p className="font-body text-sm text-pz-on-surface-variant mt-1 max-w-2xl">
                  Send students their portal link again without opening anything new. Useful for anyone who missed their first email.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div role="group" aria-label="Who to email" className="flex items-center p-1 bg-pz-surface-container-low rounded-lg">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      aria-pressed={audience === a.key}
                      disabled={running}
                      onClick={() => setAudience(a.key)}
                      className={cn(
                        "px-3.5 py-1.5 max-md:min-h-11 text-xs font-headline rounded-md transition-all disabled:opacity-60",
                        audience === a.key
                          ? "bg-pz-surface-container-lowest text-pz-primary font-bold shadow-sm"
                          : "text-pz-on-surface-variant font-medium hover:text-pz-on-surface",
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={running} onClick={() => setPending({ kind: "link" })} className={primaryBtn}>
                  <Send className="w-4 h-4" aria-hidden="true" />
                  Send link
                </button>
              </div>
            </div>
            {linkStrip && (
              <p role="status" className="flex items-start gap-2.5 rounded-lg bg-pz-surface-container-low p-3.5 font-body text-sm text-pz-on-surface">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-pz-primary" aria-hidden="true" />
                <span>
                  {linkStrip.main}
                  {linkStrip.rest.length > 0 && (
                    <>
                      {" "}
                      <strong className="font-headline font-bold text-pz-secondary">{linkStrip.rest.join(" ")}</strong>
                    </>
                  )}
                </span>
              </p>
            )}
          </section>
        </>
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">
              {pending?.kind === "link" ? "Confirm email" : pending?.kind === "crm" ? "Save batch to CRM" : "Confirm batch finished"}
            </DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">
              {pending?.kind === "module" &&
                `${pending.title}: ${moduleConfirmText(pending.paid, pending.opened)} Continue?`}
              {pending?.kind === "course" &&
                "Opens every module of this course for Live students who paid and emails the portal link to those who have signed up. Students who already have a module open are not emailed again for it. Continue?"}
              {pending?.kind === "link" &&
                `This emails the portal link to ${AUDIENCE_CONFIRM[audience]}. Continue?`}
              {pending?.kind === "crm" && crmConfirmText(pending.preview)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
            >
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={nothingToCopy} className={primaryBtn}>
              {pending?.kind === "link" ? "Yes, send it" : pending?.kind === "crm" ? "Yes, save it" : "Yes, open it"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
