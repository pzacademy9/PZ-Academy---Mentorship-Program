"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { saveLessonNote } from "@/lib/data/notes";

export interface MarkCompleteResult {
  ok: boolean;
  pct?: number;
  error?: string;
}

/**
 * Mark a lesson complete via the complete_lesson RPC.
 * The RPC enforces enrollment + that the lesson is currently unlocked, then
 * flips status to 'completed', which fires the drip trigger to unlock the next.
 */
export async function markLessonComplete(
  courseSlug: string,
  lessonId: string,
): Promise<MarkCompleteResult> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase.rpc("complete_lesson", {
    p_lesson_id: lessonId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/portal/${courseSlug}`);
  revalidatePath(`/portal/${courseSlug}/lessons/${lessonId}`);
  revalidatePath("/dashboard/courses");
  revalidatePath("/dashboard");

  return { ok: true, pct: data ?? undefined };
}

/**
 * Reveal the correct option for ONE question, called client-side right
 * after the student answers it (or times out) — cosmetic Kahoot-style
 * reveal only. The real score/pass decision is computed independently
 * server-side in submitQuizAttempt; a client tampering with this call
 * cannot affect the recorded attempt or grant lesson completion.
 */
export async function checkQuizAnswer(questionId: string): Promise<number | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("check_quiz_answer", {
    p_question_id: questionId,
  });
  if (error) return null;
  return data;
}

export interface QuizAttemptResult {
  ok: boolean;
  reason?: string;
  error?: string;
  score?: number;
  total?: number;
  passed?: boolean;
  attemptNumber?: number;
  attemptsLeft?: number;
  coursePct?: number;
}

/**
 * Submit answers for a lesson's quiz via the submit_quiz_attempt RPC.
 * Scoring happens server-side (correct_index never reaches the client).
 * On a pass, the RPC internally calls complete_lesson() to unlock the
 * next lesson via the same drip trigger as markLessonComplete.
 */
export async function submitQuizAttempt(
  courseSlug: string,
  lessonId: string,
  answers: number[],
): Promise<QuizAttemptResult> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase.rpc("submit_quiz_attempt", {
    p_lesson_id: lessonId,
    p_answers: answers,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    score?: number;
    total?: number;
    passed?: boolean;
    attempt_number?: number;
    attempts_left?: number;
    course_pct?: number;
  };

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  if (result.passed) {
    revalidatePath(`/portal/${courseSlug}`);
    revalidatePath(`/portal/${courseSlug}/lessons/${lessonId}`);
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
  }

  return {
    ok: true,
    score: result.score,
    total: result.total,
    passed: result.passed,
    attemptNumber: result.attempt_number,
    attemptsLeft: result.attempts_left,
    coursePct: result.course_pct,
  };
}

export interface SaveNoteResult {
  ok: boolean;
  error?: string;
}

/**
 * Upserts the caller's note for a lesson. Resolves the student id from the
 * authenticated session server-side — never trusts a client-supplied id.
 */
export async function saveNote(
  lessonId: string,
  courseId: string,
  html: string,
  text: string,
): Promise<SaveNoteResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  await saveLessonNote({ studentId: user.id, lessonId, courseId, html, text });
  return { ok: true };
}
