"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReportRound } from "@/lib/data/progress-reports";
import { describeReportAudience, matchesReportAudience, type ReportAudience } from "@/lib/progress/report-audience";

export type ReportStudentOption = { personId: string; label: string; hasEmail: boolean; labels: string[] };

type Fail = { ok: false; message: string };
export interface ReportActions {
  preview: (pageId: string, personId: string) => Promise<{ ok: true; subject: string; html: string } | Fail>;
  sendTest: (pageId: string, personId: string) => Promise<{ ok: true; to: string } | Fail>;
  start: (pageId: string, audience: ReportAudience) => Promise<{ ok: true; sendId: string; count: number } | Fail>;
  run: (sendId: string) => Promise<{ ok: true; sent: number; failed: number; pending: number } | Fail>;
  retry: (sendId: string) => Promise<{ ok: true; count: number } | Fail>;
}

interface Props {
  pageId: string;
  ready: boolean;
  summary: { students: number; withEmail: number; ranked: number; noQuiz: number; recorded: number; quizClasses: number };
  students: ReportStudentOption[];
  rounds: ReportRound[];
  actions: ReportActions;
}

const card = "rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-5";
const primaryBtn = "shrink-0 whitespace-nowrap rounded-lg bg-pz-primary px-4 py-2.5 text-sm font-bold text-pz-on-primary hover:opacity-90 disabled:opacity-60 max-md:min-h-11";
const ghostBtn = "shrink-0 whitespace-nowrap rounded-lg border border-pz-outline-variant px-4 py-2.5 text-sm font-semibold text-pz-on-surface hover:bg-pz-surface-container disabled:opacity-60 max-md:min-h-11";

const STATE_LABEL: Record<string, string> = { sent: "Sent", failed: "Failed", skipped: "Skipped", pending: "Waiting", claimed: "Sending" };

/** Reasons the team wrote itself. Email-service error text never reaches the screen. */
function reasonWords(state: string, reason: string): string {
  if (state === "sent" || state === "pending" || state === "claimed") return "";
  if (reason === "unsubscribed") return "unsubscribed";
  if (reason === "no_email") return "no email";
  if (reason === "No longer in this batch") return "no longer in this batch";
  if (reason.startsWith("May have been sent")) return "may have been sent, check before sending again";
  return state === "failed" ? "could not be sent" : "";
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
}

export function ReportsPanel({ pageId, ready, summary, students, rounds, actions }: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState(students[0]?.personId ?? "");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [group, setGroup] = useState<"all" | "full" | "modules">("all");
  const [modules, setModules] = useState<number[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const stopRef = useRef(false);

  useEffect(() => {
    if (!personId) return;
    let live = true;
    actions
      .preview(pageId, personId)
      .then((res) => {
        if (!live) return;
        if (res.ok) setPreview({ subject: res.subject, html: res.html });
        else setError(res.message);
      })
      .catch(() => live && setError("Could not build the preview. Please try again."));
    return () => {
      live = false;
    };
  }, [pageId, personId, actions]);

  // Stop the sending loop if the admin leaves the page (it can be continued later).
  useEffect(() => {
    stopRef.current = false;
    return () => {
      stopRef.current = true;
    };
  }, []);

  const audience: ReportAudience = group === "all" ? { kind: "all" } : group === "full" ? { kind: "full" } : { kind: "modules", modules: [...modules].sort((a, b) => a - b) };
  const countFor = (a: ReportAudience) =>
    a.kind === "all" ? summary.withEmail : students.filter((x) => x.hasEmail && matchesReportAudience(x.labels, a)).length;
  const noModules = group === "modules" && modules.length === 0;
  const sendCount = noModules ? 0 : countFor(audience);
  const people = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;
  const latest = rounds[0];
  const unfinished = latest && latest.counts.waiting > 0 ? latest : null;

  async function drive(sendId: string, total: number, alreadyDone: number) {
    setBusy(true);
    setError(null);
    setNotice(null);
    let done = alreadyDone;
    setProgress({ done, total });
    try {
      for (let guard = 0; guard < 500 && !stopRef.current; guard++) {
        const res = await actions.run(sendId);
        if (!res.ok) {
          setError(res.message);
          break;
        }
        done += res.sent + res.failed;
        setProgress({ done: Math.min(done, total), total });
        if (res.pending === 0) {
          setNotice("All reports are done. See the list below.");
          break;
        }
      }
    } catch {
      setError("Sending stopped. Press Continue sending to carry on.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function startAll() {
    setConfirming(false);
    startTransition(async () => {
      try {
        const res = await actions.start(pageId, audience);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        await drive(res.sendId, res.count, 0);
      } catch {
        setError("Could not start sending. Nothing was sent. Please try again.");
      }
    });
  }

  function sendTest() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await actions.sendTest(pageId, personId);
        if (res.ok) setNotice(`Test sent to ${res.to}.`);
        else setError(res.message);
      } catch {
        setError("The test email could not be sent.");
      }
    });
  }

  function retry(round: ReportRound) {
    startTransition(async () => {
      try {
        const res = await actions.retry(round.id);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        await drive(round.id, round.total, round.counts.sent + round.counts.skipped);
      } catch {
        setError("Could not retry. Please try again.");
      }
    });
  }

  const working = busy || pending;

  return (
    <div className="space-y-5">
      {!ready && (
        <p role="status" className="rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4 text-sm text-pz-on-surface">
          <strong>One step first:</strong> paste the SQL from the owner steps (migration 0105). Until then you can preview and send a test, but not send to everyone.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Students", value: summary.students },
          { label: "With an email", value: summary.withEmail },
          { label: "On the leaderboard", value: summary.ranked },
          { label: "No quiz yet", value: summary.noQuiz },
          { label: "Recorded", value: summary.recorded },
          { label: "Quizzes so far", value: summary.quizClasses },
        ].map((f) => (
          <div key={f.label} className="rounded-lg bg-pz-surface-container-low p-3">
            <dt className="text-xs text-pz-on-surface-variant">{f.label}</dt>
            <dd className="font-headline text-xl font-bold text-pz-on-surface">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div aria-live="polite" className="space-y-2">
        {error && <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>}
        {notice && <p className="text-sm font-semibold text-pz-primary">{notice}</p>}
      </div>

      {/* Send to everyone */}
      <section aria-labelledby="send-all-title" className={card}>
        <h2 id="send-all-title" className="font-headline text-lg font-bold text-pz-on-surface">Send to students</h2>
        <p className="mt-1 text-sm text-pz-on-surface-variant">
          Each student gets their own report with the latest numbers: rank, points, the top 10 and how to climb. Students who have not taken a quiz get the &quot;get started&quot; version. Unsubscribed students are skipped. Pressing again never sends twice in the same round.
        </p>
        <fieldset className="mt-4 space-y-2" disabled={working}>
          <legend className="text-sm font-semibold text-pz-on-surface">Who gets it</legend>
          {([
            ["all", `Everyone in the batch (${summary.withEmail})`],
            ["full", `Full course students only (${countFor({ kind: "full" })})`],
            ["modules", "Full course plus chosen modules"],
          ] as const).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-pz-outline-variant px-3 text-sm text-pz-on-surface">
              <input type="radio" name="report-group" checked={group === value} onChange={() => { setGroup(value); setConfirming(false); }} />
              {label}
            </label>
          ))}
          {noModules && <p className="text-sm text-pz-on-surface-variant">Tick at least one module.</p>}
          {group === "modules" && (
            <div className="flex flex-wrap gap-2 pt-1">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <label key={n} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-lg border border-pz-outline-variant px-3 text-sm text-pz-on-surface">
                  <input
                    type="checkbox"
                    aria-label={`Module ${n}`}
                    checked={modules.includes(n)}
                    onChange={(e) => { setModules(e.target.checked ? [...modules, n] : modules.filter((m) => m !== n)); setConfirming(false); }}
                  />
                  {n}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {progress && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-pz-on-surface">
              {busy ? "Sending" : "Done"}: {progress.done} of {progress.total}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-pz-surface-container-high" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <div className="h-full rounded-full bg-pz-primary transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!confirming ? (
            <button type="button" disabled={!ready || working || sendCount === 0} onClick={() => setConfirming(true)} className={primaryBtn}>
              {group === "all" ? `Send to all ${summary.withEmail} students` : `Send to ${people(sendCount)}`}
            </button>
          ) : (
            <div role="alertdialog" aria-label="Confirm sending" className="w-full rounded-lg border border-pz-primary bg-pz-surface-container-low p-4">
              <p className="text-sm text-pz-on-surface">{`Send the progress report to ${people(sendCount)} (${describeReportAudience(audience)}) now?`}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={startAll} disabled={working} className={primaryBtn}>Yes, send now</button>
                <button type="button" onClick={() => setConfirming(false)} className={ghostBtn}>Cancel</button>
              </div>
            </div>
          )}
          {unfinished && !busy && (
            <button
              type="button"
              disabled={working}
              onClick={() => void drive(unfinished.id, unfinished.total, unfinished.total - unfinished.counts.waiting)}
              className={ghostBtn}
            >
              Continue sending ({unfinished.counts.waiting} waiting)
            </button>
          )}
        </div>
      </section>

      {/* Preview */}
      <section aria-labelledby="preview-title" className={card}>
        <h2 id="preview-title" className="font-headline text-lg font-bold text-pz-on-surface">Preview one student&apos;s email</h2>
        {students.length === 0 ? (
          <p className="mt-2 text-sm text-pz-on-surface-variant">This batch has no students yet.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label htmlFor="report-student" className="sr-only">Student</label>
              <select
                id="report-student"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm text-pz-on-surface max-md:min-h-11"
              >
                {students.map((s) => (
                  <option key={s.personId} value={s.personId}>
                    {s.label}
                    {s.hasEmail ? "" : " (no email)"}
                  </option>
                ))}
              </select>
              <button type="button" disabled={working || !personId} onClick={sendTest} className={ghostBtn}>
                Send a test to me
              </button>
            </div>
            {preview && (
              <div className="mt-4">
                <p className="break-words text-sm text-pz-on-surface-variant">
                  Subject: <span className="font-semibold text-pz-on-surface">{preview.subject}</span>
                </p>
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  className="mt-2 h-[900px] w-full rounded-lg border border-pz-outline-variant bg-white"
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* Past rounds */}
      {rounds.length > 0 && (
        <section aria-labelledby="rounds-title" className={card}>
          <h2 id="rounds-title" className="font-headline text-lg font-bold text-pz-on-surface">Sent before</h2>
          <ul className="mt-3 space-y-3">
            {rounds.map((r) => (
              <li key={r.id} className="rounded-lg bg-pz-surface-container-low p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-pz-on-surface">{when(r.createdAt)}</p>
                  <p className="text-sm text-pz-on-surface-variant">
                    {r.counts.sent} sent · {r.counts.failed} failed · {r.counts.skipped} skipped · {r.counts.waiting} waiting
                  </p>
                </div>
                {r.counts.failed > 0 && !busy && (
                  <button type="button" disabled={working} onClick={() => retry(r)} className={`mt-2 ${ghostBtn}`}>
                    Try the {r.counts.failed} failed again
                  </button>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-pz-primary max-md:min-h-11">Show each student</summary>
                  <ul className="mt-2 space-y-1">
                    {r.recipients.map((x, i) => (
                      <li key={`${x.email}-${i}`} className="flex flex-wrap justify-between gap-2 text-sm">
                        <span className="min-w-0 break-words text-pz-on-surface">{x.name || x.email}</span>
                        <span className="text-pz-on-surface-variant">
                          {STATE_LABEL[x.state] ?? x.state}
                          {reasonWords(x.state, x.reason) ? ` · ${reasonWords(x.state, x.reason)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
