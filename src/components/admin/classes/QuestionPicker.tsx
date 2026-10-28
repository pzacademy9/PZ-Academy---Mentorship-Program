"use client";

import { Star, Video, X } from "lucide-react";

export type Question = { text: string; type: "stars" | "video" };
export type BankEntry = { id: string; text: string; type: "stars" | "video" };

export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 5;

const TypeIcon = ({ type }: { type: Question["type"] }) =>
  type === "video" ? <Video className="h-4 w-4 shrink-0" aria-hidden /> : <Star className="h-4 w-4 shrink-0" aria-hidden />;
const typeWords = (t: Question["type"]) => (t === "video" ? "Video answer" : "Star rating");

export function QuestionPicker({
  bank, value, onChange,
}: {
  bank: BankEntry[] | null;
  value: Question[];
  onChange: (next: Question[]) => void;
}) {
  const has = (q: { text: string }) => value.some((v) => v.text === q.text);
  const toggle = (q: BankEntry) => {
    if (has(q)) onChange(value.filter((v) => v.text !== q.text));
    else if (value.length < MAX_QUESTIONS) onChange([...value, { text: q.text, type: q.type }]);
  };
  const full = value.length >= MAX_QUESTIONS;

  return (
    <div className="space-y-4">
      <p className="text-base text-pz-on-surface-variant" aria-live="polite">
        {value.length} of {MAX_QUESTIONS} chosen. Pick {MIN_QUESTIONS} to {MAX_QUESTIONS} questions.
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Chosen questions">
        {value.map((q) => (
          <li key={q.text} className="inline-flex max-w-full items-center gap-2 rounded-full bg-pz-primary/10 py-1 pl-3 pr-0 text-base text-pz-on-surface">
            <TypeIcon type={q.type} />
            <span className="min-w-0">{q.text}</span>
            <button type="button" aria-label={`Remove question: ${q.text}`} onClick={() => onChange(value.filter((v) => v.text !== q.text))}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full hover:bg-pz-surface-container-high">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div>
        <p className="mb-2 font-headline text-base font-bold text-pz-on-surface-variant">Question bank</p>
        {bank === null ? (
          <p className="text-base text-pz-on-surface-variant">Loading questions...</p>
        ) : bank.length === 0 ? (
          <p className="text-base text-pz-on-surface-variant">The question bank is empty.</p>
        ) : (
          <ul className="space-y-2">
            {bank.map((q) => {
              const on = has(q);
              return (
                <li key={q.id}>
                  <button type="button" aria-pressed={on} disabled={!on && full} onClick={() => toggle(q)}
                    className={`flex min-h-12 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-base ${
                      on ? "border-pz-primary bg-pz-primary/10 text-pz-on-surface" : "border-pz-outline-variant/60 text-pz-on-surface hover:bg-pz-surface-container-low"
                    } disabled:opacity-50`}>
                    <TypeIcon type={q.type} />
                    <span className="flex-1">{q.text}</span>
                    <span className="text-base text-pz-on-surface-variant">{typeWords(q.type)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
