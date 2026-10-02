"use client";

import { useState } from "react";
import { HelpCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { QuizModal } from "./QuizModal";
import type { QuizQuestion } from "@/lib/data/lms";

interface Attempt {
  score: number;
  total: number;
  passed: boolean;
  attempt_number: number;
}

interface KnowledgeCheckCardProps {
  courseSlug: string;
  lessonId: string;
  questions: QuizQuestion[];
  attempts: Attempt[];
  completed: boolean;
}

export function KnowledgeCheckCard({
  courseSlug,
  lessonId,
  questions,
  attempts,
  completed,
}: KnowledgeCheckCardProps) {
  const [open, setOpen] = useState(false);
  if (questions.length === 0) return null;

  const attemptsLeft = Math.max(0, 3 - attempts.length);
  const best = attempts.reduce((m, a) => Math.max(m, a.score), 0);

  return (
    <>
      <div className="bg-white dark:bg-[#1c211e] rounded-2xl shadow-xl border border-pz-border dark:border-[#2a2f2c] p-6 hover:border-pz-solid-forest/40 dark:hover:border-pz-lime/30 transition-colors group">
        <span className="inline-flex w-10 h-10 rounded-full bg-pz-solid-forest/5 dark:bg-white/5 items-center justify-center mb-3 text-pz-forest dark:text-pz-lime group-hover:scale-110 transition-transform">
          <HelpCircle className="w-5 h-5" />
        </span>
        <h3 className="font-montserrat font-bold text-pz-forest dark:text-[#e0e3df] text-base mb-1">
          Knowledge Check
        </h3>
        <p className="text-sm text-pz-muted dark:text-[#c1c6d5] mb-4">
          {completed
            ? `Passed — best score ${best}/${questions.length}.`
            : `${questions.length} questions · ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`}
        </p>
        {completed ? (
          <span className="inline-flex items-center gap-1.5 text-pz-success text-sm font-bold">
            <CheckCircle2 className="w-4 h-4" /> COMPLETE
          </span>
        ) : attemptsLeft > 0 ? (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 text-pz-forest dark:text-pz-lime text-sm font-bold hover:underline"
          >
            START QUIZ <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-sm font-bold text-pz-danger">NO ATTEMPTS LEFT</span>
        )}
      </div>

      {open && (
        <QuizModal
          courseSlug={courseSlug}
          lessonId={lessonId}
          questions={questions}
          attemptsLeft={attemptsLeft}
          onClose={() => setOpen(false)}
          onPassed={() => setOpen(false)}
        />
      )}
    </>
  );
}
