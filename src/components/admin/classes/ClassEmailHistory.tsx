"use client";

import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { formatPkt } from "@/lib/attendance/rules";
import type { SessionEmailKind, SessionEmailRound } from "@/lib/data/session-emails";
import { loadClassEmailHistory } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

const KIND_LABEL: Record<SessionEmailKind, string> = {
  reminder: "Zoom link email",
  update: "Class details email",
  feedback: "Feedback email",
};
const STATE_LABEL: Record<string, string> = { sent: "Sent", failed: "Could not be sent", skipped: "Not sent", pending: "Waiting", claimed: "Sending" };
/** Reasons the team wrote itself. Provider error text never reaches the screen. */
const SKIP_WORDS: Record<string, string> = { unsubscribed: "Unsubscribed", no_email: "No email address" };
const KNOWN: Record<string, string> = { "No PZ ID yet": "No PZ ID yet", "Session was deleted": "Class was deleted" };

function personNote(state: string, reason: string): string {
  if (state === "skipped") return SKIP_WORDS[reason] ?? KNOWN[reason] ?? "";
  if (state === "failed") return KNOWN[reason] ?? (reason.startsWith("May have been sent") ? "May have been sent, check before sending again" : "");
  return "";
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rounds: SessionEmailRound[] };

/** Under a class card: every email sent for the class and what happened to each person. Loads when opened. */
export function ClassEmailHistory({
  sessionId,
  kinds,
  refreshKey,
}: {
  pageId: string;
  sessionId: string;
  kinds: SessionEmailKind[];
  refreshKey: number | string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!open) return;
    let live = true;
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    loadClassEmailHistory(sessionId)
      .then((res) => {
        if (!live) return;
        setState(res.ok ? { status: "ready", rounds: res.rounds } : { status: "error", message: res.message });
      })
      .catch(() => {
        if (live) setState({ status: "error", message: "Something went wrong. Please try again." });
      });
    return () => {
      live = false;
    };
  }, [open, sessionId, refreshKey]);

  const rounds = state.status === "ready" ? state.rounds.filter((r) => kinds.includes(r.kind)) : [];

  return (
    <details className="rounded-lg border border-pz-outline-variant/60" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-headline text-base font-bold text-pz-on-surface">
        <MailCheck className="size-5" aria-hidden />
        Who got the emails
      </summary>
      <div className="space-y-3 p-4">
        {state.status === "loading" && <p className="text-base text-pz-on-surface-variant">Loading...</p>}
        {state.status === "error" && <p className="text-base font-semibold text-pz-danger">{state.message}</p>}
        {state.status === "ready" && rounds.length === 0 && (
          <p className="text-base text-pz-on-surface-variant">No email has been sent for this class yet.</p>
        )}
        {rounds.map((r) => (
          <div key={r.id} className="rounded-lg bg-pz-surface-container-low p-3">
            <p className="font-headline text-base font-bold text-pz-on-surface">{KIND_LABEL[r.kind]}</p>
            {r.subject !== "" && <p className="break-words text-base text-pz-on-surface-variant">{r.subject}</p>}
            <p className="text-base text-pz-on-surface-variant">{formatPkt(r.createdAt)}</p>
            <p className="text-base text-pz-on-surface">
              {r.counts.sent} sent · {r.counts.failed} failed · {r.counts.skipped} skipped · {r.counts.waiting} waiting
            </p>
            <details className="mt-1">
              <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold text-pz-deep">Show each student</summary>
              <ul aria-label={`${KIND_LABEL[r.kind]} people`} className="space-y-1 pb-2">
                {r.recipients.map((x, i) => {
                  const note = personNote(x.state, x.reason);
                  return (
                    <li key={`${x.email}-${i}`} className="flex flex-wrap justify-between gap-2 text-base">
                      <span className="min-w-0 break-words text-pz-on-surface">{x.name || x.email}</span>
                      <span className="text-pz-on-surface-variant">
                        {STATE_LABEL[x.state] ?? x.state}
                        {note ? ` · ${note}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </details>
  );
}
