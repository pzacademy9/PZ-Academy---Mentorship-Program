"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles, XCircle } from "lucide-react";
import type { QuizQuestion } from "@/lib/marketing/quick-quiz";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const POINTS = 100;

/**
 * A small playable quiz box: pick an answer, see right or wrong at once,
 * collect points, move on. Wraps back to the first question at the end.
 */
export function QuickQuiz({ questions }: { questions: QuizQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const current = questions[index];
  if (!current) return null;
  const answered = picked !== null;
  const right = answered && picked === current.answer;

  const pick = (i: number) => {
    if (answered) return;
    setPicked(i);
    if (i === current.answer) setScore((s) => s + POINTS);
  };
  const next = () => {
    setPicked(null);
    setIndex((i) => (i + 1) % questions.length);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-pz-web-surface-low p-5 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-muted">
          Question {index + 1} of {questions.length}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-pz-gold/15 px-3 py-1 font-poppins text-xs font-bold text-pz-gold">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {score} pts
        </span>
      </div>

      <p className="font-montserrat text-lg font-bold leading-snug text-pz-deep md:text-xl">{current.q}</p>

      <div className="flex flex-col gap-2.5 pt-1">
        {current.options.map((opt, i) => {
          const isAnswer = answered && i === current.answer;
          const isWrongPick = answered && i === picked && !right;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => pick(i)}
              disabled={answered}
              className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl p-3.5 text-left font-poppins text-[.95rem] shadow-sm transition-colors duration-200 ${
                isAnswer
                  ? "bg-pz-bright/40 font-bold text-pz-deep"
                  : isWrongPick
                    ? "bg-pz-solid-danger/10 font-semibold text-pz-deep"
                    : answered
                      ? "bg-pz-surface-container-lowest font-medium text-pz-muted"
                      : "bg-pz-surface-container-lowest font-medium text-pz-ink hover:bg-pz-web-surface-high"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${
                    isAnswer
                      ? "bg-pz-solid-mid text-white"
                      : isWrongPick
                        ? "bg-pz-solid-danger text-white"
                        : "bg-pz-web-surface-high text-pz-deep"
                  }`}
                >
                  {LETTERS[i]}
                </span>
                {opt}
              </span>
              {isAnswer && (
                <span aria-hidden="true" className="flex items-center gap-1 text-pz-mid">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase">Correct</span>
                </span>
              )}
              {isWrongPick && <XCircle aria-hidden="true" className="h-5 w-5 text-pz-solid-danger" />}
            </button>
          );
        })}
      </div>

      <div role="status" aria-live="polite" className="min-h-[1.25rem]">
        {answered && (
          <div className="animate-[popIn_.35s_ease-out]">
            <p className={`font-montserrat text-sm font-bold ${right ? "text-pz-mid" : "text-pz-deep"}`}>
              {right ? `Correct! +${POINTS} points` : `Not quite. The answer is ${current.options[current.answer]}.`}
            </p>
            <p className="mt-1 font-poppins text-sm leading-relaxed text-pz-muted">{current.why}</p>
          </div>
        )}
      </div>

      {answered && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={next}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-pz-solid-deep px-6 font-montserrat text-[15px] font-bold text-white transition-colors hover:bg-pz-solid-forest sm:w-auto sm:bg-transparent sm:px-2 sm:text-pz-deep sm:hover:bg-transparent sm:hover:text-pz-mid"
          >
            Next question <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
