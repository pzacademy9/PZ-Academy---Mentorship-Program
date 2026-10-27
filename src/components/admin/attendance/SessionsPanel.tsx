"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { checkinWindow, formatPkt, isoToPktInput, type WindowOverride } from "@/lib/attendance/rules";
import type { SessionRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";
import {
  addSession, emailUpdatedTime, markEveryonePresent, removeSession, saveSession, sendReminderNow, setOverride,
  type ActionResult, type SessionForm,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

const primaryBtn =
  "inline-flex items-center justify-center gap-2 px-3.5 py-2 max-md:min-h-11 rounded-lg font-headline text-xs font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const quietBtn =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 max-md:min-h-11 rounded-lg font-headline text-xs font-medium bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const fieldCls =
  "w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 max-md:min-h-11 text-sm text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/40";
const labelCls = "block text-xs font-headline font-bold text-pz-on-surface-variant mb-1";

const WINDOW_LABEL = { before: "Not open yet", open: "Open now", closed: "Closed" } as const;
const WINDOW_TONE = {
  before: "bg-pz-surface-container-high text-pz-on-surface-variant",
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  closed: "bg-pz-surface-container-high text-pz-on-surface-variant",
} as const;

function overrideNote(value: WindowOverride, state: keyof typeof WINDOW_LABEL): string {
  if (value === "open") return "Force open: students can check in at any time, until you change this.";
  if (value === "closed") return "Force closed: nobody can check in, until you change this.";
  const now = state === "open" ? "Right now it is open." : state === "before" ? "Right now it has not opened yet." : "Right now it is closed.";
  return `Automatic: opens 15 minutes before the start and closes 15 minutes after. ${now}`;
}

type FormState = {
  number: string; title: string; startsAtLocal: string; zoomUrl: string; kahootUrl: string;
  includeKahoot: boolean; includeAttendanceLink: boolean; emailEnabled: boolean; emailLeadMinutes: string;
};

function toForm(s?: SessionRow, nextNumber = 1): FormState {
  return s
    ? {
        number: String(s.number), title: s.title, startsAtLocal: isoToPktInput(s.starts_at), zoomUrl: s.zoom_url, kahootUrl: s.kahoot_url,
        includeKahoot: s.include_kahoot, includeAttendanceLink: s.include_attendance_link, emailEnabled: s.email_enabled,
        emailLeadMinutes: String(s.email_lead_minutes),
      }
    : {
        number: String(nextNumber), title: "", startsAtLocal: "", zoomUrl: "", kahootUrl: "",
        includeKahoot: false, includeAttendanceLink: true, emailEnabled: true, emailLeadMinutes: "60",
      };
}

function toPayload(f: FormState): SessionForm {
  return {
    number: Number(f.number), title: f.title, startsAtLocal: f.startsAtLocal, zoomUrl: f.zoomUrl, kahootUrl: f.kahootUrl,
    includeKahoot: f.includeKahoot, includeAttendanceLink: f.includeAttendanceLink, emailEnabled: f.emailEnabled,
    emailLeadMinutes: Number(f.emailLeadMinutes),
  };
}

function SessionFormFields({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial: FormState;
  submitLabel: string;
  onSubmit: (payload: SessionForm) => Promise<ActionResult>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const [busy, startTransition] = useTransition();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await onSubmit(toPayload(f));
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        if (!onCancel) setF(toForm(undefined, Number(f.number) + 1));
      } else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[6rem_1fr_14rem]">
        <div>
          <label className={labelCls}>Session number</label>
          <input type="number" min={1} className={fieldCls} value={f.number} onChange={(e) => set("number", e.target.value)} required />
        </div>
        <div>
          <label className={labelCls}>Title</label>
          <input className={fieldCls} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Day 1: Introduction" />
        </div>
        <div>
          <label className={labelCls}>Date and time (Pakistan time)</label>
          <input type="datetime-local" className={fieldCls} value={f.startsAtLocal} onChange={(e) => set("startsAtLocal", e.target.value)} required />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls}>Zoom link</label>
          <input className={fieldCls} value={f.zoomUrl} onChange={(e) => set("zoomUrl", e.target.value)} placeholder="https://zoom.us/j/..." />
        </div>
        <div>
          <label className={labelCls}>Kahoot link (optional)</label>
          <input className={fieldCls} value={f.kahootUrl} onChange={(e) => set("kahootUrl", e.target.value)} placeholder="https://kahoot.it/..." />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-pz-on-surface">
        <label className="inline-flex items-center gap-2 max-md:min-h-11">
          <input type="checkbox" checked={f.includeKahoot} onChange={(e) => set("includeKahoot", e.target.checked)} />
          Put the Kahoot link in the email
        </label>
        <label className="inline-flex items-center gap-2 max-md:min-h-11">
          <input type="checkbox" checked={f.includeAttendanceLink} onChange={(e) => set("includeAttendanceLink", e.target.checked)} />
          Put the attendance link in the email
        </label>
        <label className="inline-flex items-center gap-2 max-md:min-h-11">
          <input type="checkbox" checked={f.emailEnabled} onChange={(e) => set("emailEnabled", e.target.checked)} />
          Send a reminder email
        </label>
        <label className="inline-flex items-center gap-2 max-md:min-h-11">
          Send it
          <input
            type="number" min={5} max={10080} className={cn(fieldCls, "w-20")} value={f.emailLeadMinutes}
            onChange={(e) => set("emailLeadMinutes", e.target.value)} aria-label="Minutes before the session"
          />
          minutes before
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={primaryBtn} disabled={busy}>{busy ? "Saving..." : submitLabel}</button>
        {onCancel && <button type="button" className={quietBtn} onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <code className="truncate rounded bg-pz-surface-container-low px-2 py-1 text-xs text-pz-on-surface-variant">{url}</code>
      <button type="button" className={quietBtn} onClick={copy} aria-label="Copy the shared link">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function SessionCard({
  s, base, sends, missing, now,
}: {
  s: SessionRow; base: string; sends?: SessionSendState; missing: number; now: Date;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [stale, setStale] = useState(false);
  const [busy, startTransition] = useTransition();
  const override = s.window_override as WindowOverride;
  const state = checkinWindow(s.starts_at, override, now);

  function run(fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast.success(res.message);
        after?.(res);
      } else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete session ${s.number}?`,
      description: "Its attendance marks are deleted with it. This cannot be undone.",
      confirmLabel: "Delete session",
      destructive: true,
    });
    if (ok) run(() => removeSession(s.id));
  }

  async function onMarkAll() {
    const ok = await confirm({
      title: "Mark everyone present?",
      description:
        missing === 0
          ? "Every live student is already marked present for this session."
          : `${missing} ${missing === 1 ? "student" : "students"} will be marked present. Anyone already marked stays as they are.`,
      confirmLabel: "Mark everyone present",
    });
    if (ok) run(() => markEveryonePresent(s.id));
  }

  const reminderSent = !!sends?.reminderAt;
  const reminderLabel = reminderSent
    ? `Reminder sent${sends?.updateAt ? ", time change email sent" : ""}`
    : s.email_enabled ? "Reminder not sent yet" : "Reminder switched off";

  return (
    <li className="rounded-xl border border-pz-outline-variant/60 bg-pz-surface-container-lowest p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-headline text-sm font-bold text-pz-on-surface">
            Session {s.number}{s.title ? `: ${s.title}` : ""}
          </p>
          <p className="text-xs text-pz-on-surface-variant">{formatPkt(s.starts_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-headline font-bold", WINDOW_TONE[state])}>
            Check-in: {WINDOW_LABEL[state]}
          </span>
          <span className="text-xs text-pz-on-surface-variant">{reminderLabel}</span>
        </div>
      </div>

      <CopyLink url={`${base}/attend/${s.public_code}`} />

      <div>
        <p className={labelCls}>Check-in</p>
        <div role="group" aria-label="Check-in" className="inline-flex rounded-lg bg-pz-surface-container-low p-1">
          {([["auto", "Automatic"], ["open", "Force open"], ["closed", "Force closed"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              disabled={busy}
              aria-pressed={override === v}
              onClick={() => run(() => setOverride(s.id, v))}
              className={cn(
                "px-3 py-2 max-md:min-h-11 rounded-md font-headline text-xs font-bold transition-colors disabled:opacity-50",
                override === v ? "bg-pz-primary text-pz-on-primary" : "text-pz-on-surface-variant hover:text-pz-on-surface",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-pz-on-surface-variant">{overrideNote(override, state)}</p>
      </div>

      {stale && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          <p>Students were told the old time. Send them the new one?</p>
          <button
            type="button" className={cn(primaryBtn, "mt-2")} disabled={busy}
            onClick={() => run(() => emailUpdatedTime(s.id), () => setStale(false))}
          >
            Email updated time
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={quietBtn} disabled={busy} onClick={() => setEditing((v) => !v)}>
          {editing ? "Close editor" : "Edit time and details"}
        </button>
        <button type="button" className={quietBtn} disabled={busy} onClick={() => run(() => sendReminderNow(s.id))}>
          Send reminder now
        </button>
        {reminderSent && !stale && (
          <button type="button" className={quietBtn} disabled={busy} onClick={() => run(() => emailUpdatedTime(s.id))}>
            Email updated time
          </button>
        )}
        <button type="button" className={quietBtn} disabled={busy} onClick={onMarkAll}>
          Mark everyone present
        </button>
        <Link
          href={`/dashboard/admin/enrollments/registrations/campaign/${s.page_id}/sessions/${s.id}/quiz`}
          className={quietBtn}
        >
          Quiz results
        </Link>
        <button type="button" className={cn(quietBtn, "text-red-700 dark:text-red-300")} disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>

      {editing && (
        <div className="border-t border-pz-outline-variant/60 pt-3">
          <p className="mb-2 text-xs text-pz-on-surface-variant">You can change the time at any time, even after the session has started.</p>
          <SessionFormFields
            initial={toForm(s)}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (payload) => {
              const res = await saveSession(s.id, payload);
              if (res.ok) {
                setEditing(false);
                if (res.staleReminder) setStale(true);
              }
              return res;
            }}
          />
        </div>
      )}
    </li>
  );
}

export function SessionsPanel({
  pageId, base, sessions, sends, missingBySession, nowIso,
}: {
  pageId: string;
  base: string;
  sessions: SessionRow[];
  sends: Record<string, SessionSendState>;
  missingBySession: Record<string, number>;
  nowIso: string;
}) {
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const nextNumber = sessions.reduce((m, s) => Math.max(m, s.number), 0) + 1;

  return (
    <section className="space-y-4">
      <h2 className="font-headline text-lg font-bold text-pz-on-surface">Live sessions</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-pz-on-surface-variant">No sessions yet. Add the first one below.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} s={s} base={base} sends={sends[s.id]} missing={missingBySession[s.id] ?? 0} now={now} />
          ))}
        </ul>
      )}
      <div className="rounded-xl border border-pz-outline-variant/60 bg-pz-surface-container-lowest p-4">
        <h3 className="mb-3 font-headline text-sm font-bold text-pz-on-surface">Add a session</h3>
        <SessionFormFields
          key={nextNumber}
          initial={toForm(undefined, nextNumber)}
          submitLabel="Add session"
          onSubmit={(payload) => addSession(pageId, payload)}
        />
      </div>
    </section>
  );
}
