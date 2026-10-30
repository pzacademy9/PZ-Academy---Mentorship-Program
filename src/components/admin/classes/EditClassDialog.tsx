"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { isoToPktInput } from "@/lib/attendance/rules";
import { audienceFromJson } from "@/lib/classes/audience";
import type { SessionRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";
import {
  addSession, saveSession, type ActionResult, type SessionForm,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { createMissingFeedbackAction } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions";
import { emailStatusLine } from "./email-status";
import { fieldCls, labelCls, primaryBtn, quietBtn } from "./styles";

const hhmm = (iso: string | null) => (iso ? isoToPktInput(iso).slice(11, 16) : "");
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = (n: number) => {
  const c = Math.max(0, Math.min(23 * 60 + 59, n));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

/**
 * Edit one class (pass `session`) or add a new one (pass `reference`, the class whose time and link
 * the new one starts from). A time or Zoom link that differs from where it started stops following the
 * batch defaults, so customTime / customZoom are sent explicitly together with a matching end time.
 * A new class inherits the reference's flags and turns custom when the admin changed the time or link;
 * with no reference to compare against, it is custom. The caller picks a reference that follows the
 * batch defaults whenever one exists, so inheriting is only the fallback when every class is customised.
 */
export function EditClassDialog({
  pageId, session, reference, nextNumber, sends, onClose,
}: {
  pageId: string;
  session?: SessionRow;
  reference?: SessionRow;
  nextNumber: number;
  sends?: SessionSendState;
  onClose: () => void;
}) {
  const base = session ?? reference;
  const adding = !session;
  const [date, setDate] = useState(session ? isoToPktInput(session.starts_at).slice(0, 10) : "");
  const [start, setStart] = useState(base ? hhmm(base.starts_at) : "19:00");
  const [end, setEnd] = useState(base ? hhmm(base.ends_at) : "21:00");
  const [endEdited, setEndEdited] = useState(false);
  const [zoom, setZoom] = useState(base?.zoom_url ?? "");
  const [topic, setTopic] = useState(session?.title ?? "");
  const [speaker, setSpeaker] = useState(session?.speaker ?? base?.speaker ?? "");
  const [kahoot, setKahoot] = useState(session?.kahoot_url ?? "");
  const [includeKahoot, setIncludeKahoot] = useState(session?.include_kahoot ?? false);
  const [includeAttendance, setIncludeAttendance] = useState(session?.include_attendance_link ?? true);
  // A class email needs an audience first, so the switch stays off until one is chosen.
  const hasAudience = audienceFromJson(session?.audience) !== null;
  const [remind, setRemind] = useState(hasAudience ? (session?.email_enabled ?? true) : false);
  const [minutes, setMinutes] = useState(String(session?.email_lead_minutes ?? base?.email_lead_minutes ?? 60));
  const [busy, startTransition] = useTransition();

  /** Moving the start moves the end by the same amount, so the class keeps its length, unless the end was typed in. */
  function changeStart(next: string) {
    if (!endEdited && start && next && end) setEnd(fromMinutes(toMinutes(end) + toMinutes(next) - toMinutes(start)));
    setStart(next);
  }

  function payload(): SessionForm {
    const timeChanged = !base || start !== hhmm(base.starts_at) || end !== hhmm(base.ends_at);
    const zoomChanged = !base || zoom.trim() !== base.zoom_url;
    const form: SessionForm = {
      number: session?.number ?? nextNumber,
      title: topic,
      startsAtLocal: `${date}T${start}`,
      zoomUrl: zoom,
      kahootUrl: kahoot,
      includeKahoot,
      includeAttendanceLink: includeAttendance,
      emailEnabled: remind,
      emailLeadMinutes: Number(minutes),
      speaker,
      customTime: (base?.custom_time ?? true) || timeChanged,
      customZoom: (base?.custom_zoom ?? true) || zoomChanged,
    };
    if (end.trim() !== "") form.endsAtLocal = `${date}T${end}`;
    else form.endsAt = null;
    return form;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (end.trim() !== "" && toMinutes(end) <= toMinutes(start)) {
      toast.error("The class must end after it starts");
      return;
    }
    startTransition(async () => {
      let res: ActionResult;
      if (session) res = await saveSession(session.id, payload());
      else {
        res = await addSession(pageId, payload());
        // A new class also needs its feedback link.
        if (res.ok) {
          const fb = await createMissingFeedbackAction(pageId);
          if (!fb.ok) toast.error(fb.message ?? "The feedback link could not be created. Use Create missing feedback links.");
        }
      }
      if (!res.ok) {
        toast.error(res.message ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success(res.message ?? "Saved");
      if (res.staleReminder) toast.message("Students were told the old time. Use Email updated time under More settings to send the new one.");
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:items-center md:p-4 md:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-class-title"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-pz-surface-container-lowest p-5 md:rounded-2xl"
      >
        <h2 id="edit-class-title" className="mb-4 font-headline text-xl font-bold text-pz-on-surface">
          {adding ? "Add a class" : "Edit this class"}
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="cls-date" className={labelCls}>Date</label>
            <input id="cls-date" type="date" className={fieldCls} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cls-start" className={labelCls}>Starts at</label>
              <input id="cls-start" type="time" className={fieldCls} value={start} onChange={(e) => changeStart(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="cls-end" className={labelCls}>Ends at</label>
              <input
                id="cls-end" type="time" className={fieldCls} value={end}
                onChange={(e) => { setEnd(e.target.value); setEndEdited(true); }}
              />
            </div>
          </div>
          <p className="text-base text-pz-on-surface-variant">Times are Pakistan time.</p>
          <div>
            <label htmlFor="cls-zoom" className={labelCls}>Zoom link</label>
            <input id="cls-zoom" className={fieldCls} value={zoom} onChange={(e) => setZoom(e.target.value)} placeholder="https://zoom.us/j/..." />
          </div>
          <div>
            <label htmlFor="cls-topic" className={labelCls}>Topic</label>
            <input id="cls-topic" className={fieldCls} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cls-speaker" className={labelCls}>Speaker</label>
            <input id="cls-speaker" className={fieldCls} value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cls-kahoot" className={labelCls}>Kahoot link (optional)</label>
            <input id="cls-kahoot" className={fieldCls} value={kahoot} onChange={(e) => setKahoot(e.target.value)} placeholder="https://kahoot.it/..." />
          </div>
          <label className="flex min-h-12 items-center gap-3 text-base text-pz-on-surface">
            <input type="checkbox" className="size-5" checked={includeKahoot} onChange={(e) => setIncludeKahoot(e.target.checked)} />
            Put the Kahoot link in the class email
          </label>
          <label className="flex min-h-12 items-center gap-3 text-base text-pz-on-surface">
            <input type="checkbox" className="size-5" checked={includeAttendance} onChange={(e) => setIncludeAttendance(e.target.checked)} />
            Put the attendance link in the class email
          </label>
          <label className="flex min-h-12 items-center gap-3 text-base text-pz-on-surface">
            <input type="checkbox" className="size-5" checked={remind} disabled={!hasAudience} onChange={(e) => setRemind(e.target.checked)} />
            Send a reminder email
          </label>
          {!hasAudience && <p className="text-base text-pz-on-surface-variant">Choose who gets this email first</p>}
          <div>
            <label htmlFor="cls-minutes" className={labelCls}>Send it this many minutes before the class</label>
            <input id="cls-minutes" type="number" min={5} max={10080} className={fieldCls} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
          {session && <p className="text-base text-pz-on-surface-variant">{emailStatusLine(session, sends)}</p>}
          <div className="flex flex-col gap-2 md:flex-row md:justify-end">
            <button type="button" className={`${quietBtn} max-md:w-full`} onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className={`${primaryBtn} max-md:w-full`} disabled={busy}>
              {busy ? "Saving..." : adding ? "Add class" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
