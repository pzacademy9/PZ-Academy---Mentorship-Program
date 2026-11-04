"use client";

import { useState } from "react";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import type { QuizQuestion } from "@/lib/marketing/quick-quiz";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const POINTS = 100;

/**
 * A small playable quiz card: pick an answer, see right or wrong at once,
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
    <div className="relative rounded-[28px] border border-pz-border bg-pz-surface-container-lowest p-6 shadow-card-lg md:p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pz-bright/15 px-3 py-1 font-fredoka text-xs font-semibold text-pz-mid">
          Question {index + 1} of {questions.length}
        </span>
        <span className="inline-flex items-center gap-1.5 font-fredoka text-sm font-semibold text-pz-deep">
          <Sparkles className="h-4 w-4 text-pz-gold" aria-hidden="true" /> {score} pts
        </span>
      </div>

      <p className="mb-5 font-montserrat text-lg font-bold leading-snug text-pz-deep md:text-xl">{current.q}</p>

      <div className="grid gap-2.5">
        {current.options.map((opt, i) => {
          const isAnswer = answered && i === current.answer;
          const isWrongPick = answered && i === picked && !right;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => pick(i)}
              disabled={answered}
              className={`flex min-h-11 w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-2.5 text-left font-poppins text-[.95rem] font-medium transition-all duration-200 ${
                isAnswer
                  ? "border-pz-solid-mid bg-pz-bright/20 text-pz-deep"
                  : isWrongPick
                    ? "border-pz-solid-danger bg-pz-solid-danger/10 text-pz-deep"
                    : answered
                      ? "border-pz-border text-pz-muted opacity-70"
                      : "border-pz-border text-pz-ink hover:-translate-y-0.5 hover:border-pz-solid-mid hover:bg-pz-offwhite"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-fredoka text-xs font-bold ${
                  isAnswer ? "bg-pz-solid-mid text-white" : isWrongPick ? "bg-pz-solid-danger text-white" : "bg-pz-offwhite text-pz-mid"
                }`}
              >
                {isAnswer ? <Check className="h-4 w-4" /> : isWrongPick ? <X className="h-4 w-4" /> : LETTERS[i]}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      <div role="status" aria-live="polite" className="mt-5 min-h-[1.5rem]">
        {answered && (
          <div className="animate-[popIn_.35s_ease-out]">
            <p className={`font-montserrat font-bold ${right ? "text-pz-mid" : "text-pz-deep"}`}>
              {right ? `Correct! +${POINTS} points` : `Not quite. The answer is ${current.options[current.answer]}.`}
            </p>
            <p className="mt-1 font-poppins text-sm leading-relaxed text-pz-muted">{current.why}</p>
          </div>
        )}
      </div>

      {answered && (
        <button
          type="button"
          onClick={next}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-pz-solid-forest px-6 py-2.5 font-poppins text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-pz-solid-mid"
        >
          Next question <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
