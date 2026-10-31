"use client";

import { cn } from "@/lib/utils";
import type { KahootRow } from "@/lib/quiz/kahoot-parse";
import type { Choices, PersonInfo, Review, ReviewBase, ReviewItem } from "@/lib/quiz/review";
import { cardCls, chipOn, fieldCls, labelCls, quietBtn, tagRecorded, tagRejoin } from "./styles";

type Props = {
  base: ReviewBase;
  review: Review;
  choices: Choices;
  onChoices: (next: Choices) => void;
};

const who = (p: PersonInfo) => `${p.name} (${p.pzId})`;

const personOfId = (base: ReviewBase, id: string): PersonInfo => base.people[id] ?? { personId: id, pzId: "", name: "Unknown person", mode: null };
const keyOf =(item: ReviewItem): string => (item.type === "unknown" ? String(item.row.line) : item.person.personId);
const bucketOf = (item: ReviewItem): "unknown" | "duplicate" | "notInBatch" => (item.type === "unknown" ? "unknown" : item.type === "duplicate" ? "duplicate" : "notInBatch");

/** The app answered this item itself (and the answer is still what it chose). */
export function isAuto(base: ReviewBase | undefined, item: ReviewItem): boolean {
  const mine = (base?.auto[bucketOf(item)] as Record<string, unknown> | undefined)?.[keyOf(item)];
  return mine !== undefined && JSON.stringify(mine) === JSON.stringify(item.choice);
}

/** The app has a best guess for this item (waiting for one click to accept). */
export function hasGuess(base: ReviewBase | undefined, item: ReviewItem): boolean {
  return (base?.likely[bucketOf(item)] as Record<string, unknown> | undefined)?.[keyOf(item)] !== undefined;
}

function RowLine({ r }: { r: KahootRow }) {
  return (
    <span className="text-sm text-pz-on-surface">
      <span className="font-bold">{r.player.trim() || "(empty)"}</span>
      <span className="text-pz-on-surface-variant">
        {" "}
        scored {r.score.toLocaleString("en-US")} ({r.correct} right, {r.incorrect} wrong)
      </span>
    </span>
  );
}

function Shell({ done, auto = false, guess = false, title, children }: { done: boolean; auto?: boolean; guess?: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className={cn(cardCls, "space-y-3", done && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-headline text-sm font-bold text-pz-on-surface">{title}</p>
        <span className={cn("text-xs font-headline font-bold", done ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
          {done ? (auto ? "Matched for you" : "Answered") : guess ? "Best guess ready" : "Waiting for you"}
        </span>
      </div>
      {children}
    </li>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn(quietBtn, on && chipOn, "text-left")}>
      {children}
    </button>
  );
}

export function QuizReview({ base, review, choices, onChoices }: Props) {
  const batchPeople = Object.values(base.people)
    .filter((p) => p.mode !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const setUnknown = (line: number, v: { personId: string } | "skip" | null) => {
    const next = { ...choices.unknown };
    if (v === null) delete next[String(line)];
    else next[String(line)] = v;
    onChoices({ ...choices, unknown: next });
  };
  const setDuplicate = (pid: string, v: "merge" | { keep: number }) => onChoices({ ...choices, duplicate: { ...choices.duplicate, [pid]: v } });
  const setBatch = (pid: string, v: "include" | "skip") => onChoices({ ...choices, notInBatch: { ...choices.notInBatch, [pid]: v } });

  function renderItem(item: ReviewItem) {
    const done = item.choice !== null;
    if (item.type === "duplicate") {
      const c = item.choice;
      return (
        <Shell key={item.id} done={done} auto={isAuto(base, item)} guess={hasGuess(base, item)} title={`Same student twice: ${item.person.name} (${item.person.pzId})`}>
          <ul className="space-y-1">
            {item.rows.map((r) => (
              <li key={r.line} className="flex flex-wrap items-center gap-2">
                <RowLine r={r} />
                <Toggle on={!!c && c !== "merge" && c.keep === r.line} onClick={() => setDuplicate(item.person.personId, { keep: r.line })}>
                  Keep this one
                </Toggle>
                {item.suggested?.keep === r.line && <span className="text-xs font-headline font-bold text-pz-primary">Suggested: the only row with points</span>}
                {c === null && base.likely.duplicate[item.person.personId] === "merge" && <span className="sr-only">Best guess is to add the scores together</span>}
              </li>
            ))}
          </ul>
          <Toggle on={c === "merge"} onClick={() => setDuplicate(item.person.personId, "merge")}>
            Add the scores together
          </Toggle>
          {c === null && base.likely.duplicate[item.person.personId] === "merge" && (
            <p className="text-xs font-headline font-bold text-pz-primary">Best guess: both rows scored, so add them together.</p>
          )}
        </Shell>
      );
    }
    if (item.type === "unknown") {
      const c = item.choice;
      const chosen = c && c !== "skip" ? base.people[c.personId] : null;
      return (
        <Shell key={item.id} done={done} auto={isAuto(base, item)} guess={hasGuess(base, item)} title="Unknown player">
          <RowLine r={item.row} />
          {item.row.hint && <p className="text-xs text-pz-on-surface-variant">Name typed in the second box: {item.row.hint}</p>}
          {c === "skip" && <p className="text-sm text-pz-on-surface">This row will be skipped.</p>}
          {chosen && <p className="text-sm text-pz-on-surface">Counted for {who(chosen)}.</p>}
          {c === null && base.likely.unknown[String(item.row.line)] && (
            <p className="text-xs font-headline font-bold text-pz-primary">
              Best guess: {who(personOfId(base, (base.likely.unknown[String(item.row.line)] as { personId: string }).personId))}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {item.suggestions.map((p) => (
              <Toggle key={p.personId} on={!!c && c !== "skip" && c.personId === p.personId} onClick={() => setUnknown(item.row.line, { personId: p.personId })}>
                {who(p)}
              </Toggle>
            ))}
            <Toggle on={c === "skip"} onClick={() => setUnknown(item.row.line, "skip")}>
              Skip this row
            </Toggle>
            {done && (
              <button type="button" className={quietBtn} onClick={() => setUnknown(item.row.line, null)}>
                Change my answer
              </button>
            )}
          </div>
          {item.suggestions.length === 0 && !done && <p className="text-xs text-pz-on-surface-variant">No close match found. Pick the student below, or skip.</p>}
          <div>
            <label className={labelCls} htmlFor={`pick-${item.row.line}`}>Pick any student of this batch</label>
            <select
              id={`pick-${item.row.line}`}
              className={fieldCls}
              value={chosen ? chosen.personId : ""}
              onChange={(e) => e.target.value && setUnknown(item.row.line, { personId: e.target.value })}
            >
              <option value="">Choose a student...</option>
              {batchPeople.map((p) => (
                <option key={p.personId} value={p.personId}>
                  {who(p)}
                </option>
              ))}
            </select>
          </div>
        </Shell>
      );
    }
    const c = item.choice;
    return (
      <Shell key={item.id} done={done} auto={isAuto(base, item)} guess={hasGuess(base, item)} title={`Not in this batch: ${item.person.name} (${item.person.pzId})`}>
        <p className="text-xs text-pz-on-surface-variant">This ID belongs to a student who is not enrolled here. Check the ID was typed correctly.</p>
        <ul className="space-y-1">
          {item.rows.map((r) => (
            <li key={r.line}>
              <RowLine r={r} />
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Toggle on={c === "include"} onClick={() => setBatch(item.person.personId, "include")}>Include</Toggle>
          <Toggle on={c === "skip"} onClick={() => setBatch(item.person.personId, "skip")}>Skip</Toggle>
        </div>
      </Shell>
    );
  }

  return (
    <div className="space-y-4">
      {review.items.length > 0 && <ul className="space-y-3">{review.items.map(renderItem)}</ul>}
      <details className={cardCls}>
        <summary className="cursor-pointer font-headline text-sm font-bold text-pz-on-surface">Fine rows ({review.clean.length})</summary>
        <ul className="mt-3 space-y-1">
          {review.clean.map((c) => (
            <li key={c.row.line} className="flex flex-wrap items-center gap-2 text-sm text-pz-on-surface">
              <span className="font-bold">{c.person.name}</span>
              <span className="text-pz-on-surface-variant">{c.person.pzId}</span>
              <span>{c.row.score.toLocaleString("en-US")}</span>
              {c.rejoin && <span className={tagRejoin}>Rejoined</span>}
              {c.person.mode === "recorded" && <span className={tagRecorded}>Recorded</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
