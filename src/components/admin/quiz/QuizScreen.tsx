"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPkt } from "@/lib/attendance/rules";
import { acceptLikely, bulkSkipZero, computeReview, EMPTY_CHOICES, initialChoices, type Choices, type ReviewBase, type Summary } from "@/lib/quiz/review";
import type { LeaderRow, SessionQuizRow } from "@/lib/data/quiz-results";
import {
  markFromQuiz, saveReview, uploadKahootReport,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/quiz-actions";
import { BatchLeaderboard } from "./BatchLeaderboard";
import { QuizReview, hasGuess, isAuto } from "./QuizReview";
import { cardCls, fieldCls, labelCls, primaryBtn, quietBtn, tagRecorded } from "./styles";

type Props = {
  pageId: string;
  sessionId: string;
  sessionTitle: string;
  startsAt: string;
  saved: { maxScore: number | null; fileName: string | null; savedAt: string | null; rows: SessionQuizRow[] };
  noCheckin: { personId: string; pzId: string; name: string }[];
  leaderboard: { rows: LeaderRow[]; sessionCount: number };
};

type Draft = { base: ReviewBase; choices: Choices; fileName: string; skipped: number; sheetName: string };
type Done = { saved: number; summary: Summary; noCheckin: number; notes: string[] };

export function QuizScreen({ pageId, sessionId, sessionTitle, startsAt, saved, noCheckin, leaderboard }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [maxText, setMaxText] = useState("");
  const [maxEdited, setMaxEdited] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const review = useMemo(() => (draft ? computeReview(draft.base, draft.choices) : null), [draft]);
  const maxScore = maxEdited ? Number(maxText.replace(/,/g, "")) : review?.maxScoreDefault ?? 0;
  const maxOk = Number.isInteger(maxScore) && maxScore > 0 && (!review || maxScore >= highest(draft));

  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await uploadKahootReport(pageId, sessionId, fd);
      if (!res.ok) { setError(res.message); return; }
      setDraft({ base: res.base, choices: initialChoices(res.base), fileName: res.fileName, skipped: res.skipped, sheetName: res.sheetName });
      setMaxEdited(false);
      setMaxText("");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function onSave() {
    if (!draft || !review) return;
    setError(null);
    startTransition(async () => {
      const res = await saveReview(pageId, sessionId, { base: draft.base, choices: draft.choices, maxScore, fileName: draft.fileName });
      if (!res.ok) { setError(res.message); toast.error(res.message); return; }
      toast.success(`Saved ${res.saved} results`);
      setDone({ saved: res.saved, summary: res.summary, noCheckin: res.noCheckin, notes: res.notes });
      setDraft(null);
      router.refresh();
    });
  }

  function onMark(personId: string) {
    startTransition(async () => {
      const res = await markFromQuiz(pageId, sessionId, personId);
      if (res.ok) { toast.success("Marked present"); router.refresh(); } else toast.error(res.message ?? "Could not mark present");
    });
  }

  const total = draft?.base.rows.length ?? 0;
  const waiting = review?.undecided ?? 0;
  const matchedForYou = review?.items.filter((i) => i.choice !== null && isAuto(draft?.base, i)).length ?? 0;
  const guessesWaiting = review?.items.filter((i) => i.choice === null && hasGuess(draft?.base, i)).length ?? 0;

  return (
    <div className="space-y-6">
      <section className={cn(cardCls, "space-y-3")} aria-label="Upload">
        <div>
          <h2 className="font-headline text-base font-bold text-pz-on-surface">Upload the Kahoot report</h2>
          <p className="text-xs text-pz-on-surface-variant">
            {sessionTitle ? `${sessionTitle}, ` : ""}{formatPkt(startsAt)}. Saving again replaces this session&apos;s results.
          </p>
        </div>
        <form onSubmit={onUpload} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 grow">
            <label className={labelCls} htmlFor="kahoot-file">Kahoot report (.xlsx or .csv, up to 5 MB)</label>
            <input id="kahoot-file" ref={fileRef} name="file" type="file" accept=".xlsx,.csv" required className={fieldCls} />
          </div>
          <button type="submit" className={primaryBtn} disabled={busy}>{busy && !draft ? "Reading..." : "Check the file"}</button>
        </form>
        {saved.savedAt && (
          <p className="text-xs text-pz-on-surface-variant">
            Last saved {formatPkt(saved.savedAt)}{saved.fileName ? ` from ${saved.fileName}` : ""}. Out of {saved.maxScore?.toLocaleString("en-US") ?? "?"} points.
          </p>
        )}
        {error && <p role="alert" className="text-sm font-bold text-red-700 dark:text-red-300">{error}</p>}
      </section>

      {draft && review && (
        <section className="space-y-4" aria-label="Check the file">
          <div className={cn(cardCls, "space-y-2")}>
            <p className="font-headline text-sm font-bold text-pz-on-surface">
              {total} rows in the file. {total - countProblemRows(draft)} are fine. {waiting} {waiting === 1 ? "problem needs" : "problems need"} your answer.
            </p>
            <p className="text-xs text-pz-on-surface-variant">
              Tab used: {draft.sheetName}.{draft.skipped > 0 ? ` ${draft.skipped} empty or broken rows were left out.` : ""}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-pz-surface-container-high" aria-hidden>
              <div
                className="h-full bg-pz-primary transition-all"
                style={{ width: `${review.items.length === 0 ? 100 : Math.round(((review.items.length - waiting) / review.items.length) * 100)}%` }}
              />
            </div>
            {matchedForYou > 0 && (
              <p className="text-xs text-pz-on-surface-variant">{matchedForYou} {matchedForYou === 1 ? "row was" : "rows were"} matched for you. They are marked below, and you can change any of them.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {guessesWaiting > 0 && (
                <button type="button" className={primaryBtn} onClick={() => setDraft({ ...draft, choices: acceptLikely(draft.base, draft.choices) })}>
                  Accept all {guessesWaiting} best {guessesWaiting === 1 ? "guess" : "guesses"}
                </button>
              )}
              <button type="button" className={quietBtn} onClick={() => setDraft({ ...draft, choices: bulkSkipZero(draft.base, draft.choices) })}>
                Skip all unknown players with 0 points
              </button>
              <button type="button" className={quietBtn} onClick={() => setDraft(null)}>Start over</button>
            </div>
          </div>

          <QuizReview base={draft.base} review={review} choices={draft.choices} onChoices={(choices) => setDraft({ ...draft, choices })} />

          <div className={cn(cardCls, "space-y-3")}>
            <div className="max-w-xs">
              <label className={labelCls} htmlFor="quiz-max">Quiz maximum score</label>
              <input
                id="quiz-max"
                className={fieldCls}
                inputMode="numeric"
                value={maxEdited ? maxText : String(review.maxScoreDefault)}
                onChange={(e) => { setMaxEdited(true); setMaxText(e.target.value); }}
              />
              <p className="mt-1 text-xs text-pz-on-surface-variant">Usually number of questions x 1,000. Percentages are worked out from this.</p>
              {!maxOk && <p className="mt-1 text-xs font-bold text-red-700 dark:text-red-300">Use a whole number at least as big as the top score.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primaryBtn} disabled={busy || waiting > 0 || !maxOk} onClick={onSave}>
                {busy ? "Saving..." : "Save results"}
              </button>
              {waiting > 0 && <span className="text-sm text-pz-on-surface-variant">{waiting} {waiting === 1 ? "problem" : "problems"} still waiting</span>}
            </div>
          </div>
        </section>
      )}

      {done && (
        <section role="status" className={cn(cardCls, "space-y-1")}>
          <p className="font-headline text-sm font-bold text-pz-on-surface">
            Saved {done.summary.saved}. Added together {done.summary.merged}. Dropped {done.summary.dropped}. Skipped {done.summary.skipped}.
          </p>
          {done.notes.map((n) => (
            <p key={n} className="text-xs text-amber-800 dark:text-amber-200">{n}</p>
          ))}
        </section>
      )}

      <section className="space-y-2" aria-label="Took the quiz, no check-in">
        <h2 className="font-headline text-base font-bold text-pz-on-surface">Took the quiz, no check-in</h2>
        {noCheckin.length === 0 ? (
          <p className="rounded-xl border border-dashed border-pz-outline-variant p-4 text-sm text-pz-on-surface-variant">
            {saved.rows.length === 0 ? "Nothing saved yet." : "Everyone who played also checked in."}
          </p>
        ) : (
          <ul className="divide-y divide-pz-outline-variant/40 rounded-xl border border-pz-outline-variant/60">
            {noCheckin.map((p) => (
              <li key={p.personId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-pz-on-surface">
                <span><span className="font-bold">{p.name}</span> <span className="text-pz-on-surface-variant">{p.pzId}</span></span>
                <button type="button" className={quietBtn} disabled={busy} onClick={() => onMark(p.personId)}>Mark present</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-label="Saved results">
        <h2 className="font-headline text-base font-bold text-pz-on-surface">Saved results of this session</h2>
        {saved.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-pz-outline-variant p-4 text-sm text-pz-on-surface-variant">No results saved for this session yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-pz-outline-variant/60">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <thead className="bg-pz-surface-container-low text-xs font-headline font-bold text-pz-on-surface-variant">
                <tr>
                  <th className="px-3 py-2">#</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-right">Right</th><th className="px-3 py-2 text-right">Wrong</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant/40 text-pz-on-surface">
                {saved.rows.map((r, i) => (
                  <tr key={r.personId}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">{r.name} {r.mode === "recorded" && <span className={tagRecorded}>Recorded</span>}</td>
                    <td className="px-3 py-2 text-pz-on-surface-variant">{r.pzId}</td>
                    <td className="px-3 py-2 text-right font-bold">{r.score.toLocaleString("en-US")}</td>
                    <td className="px-3 py-2 text-right">{r.correct}</td>
                    <td className="px-3 py-2 text-right">{r.incorrect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BatchLeaderboard rows={leaderboard.rows} sessionCount={leaderboard.sessionCount} />
    </div>
  );
}

/** Highest single score in the file: the maximum can never be lower than this. */
function highest(draft: Draft | null): number {
  return draft ? Math.max(0, ...draft.base.rows.map((r) => r.row.score)) : 0;
}

function countProblemRows(draft: Draft): number {
  const r = computeReview(draft.base, EMPTY_CHOICES);
  return r.items.reduce((n, i) => n + (i.type === "unknown" ? 1 : i.rows.length), 0);
}
