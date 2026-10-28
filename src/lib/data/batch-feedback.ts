import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  createFeedbackSession,
  updateFeedbackSessionQuestions,
  setFeedbackSessionCover,
} from "@/lib/data/feedback-sessions";
import { setFeedbackProgramCover } from "@/lib/data/feedback-programs";
import { generateFeedbackShareToken } from "@/lib/data/feedback-share";
import { getFeedbackSessionDetail } from "@/lib/data/feedback-responses";
import { getQuestionBank } from "@/lib/data/feedback-question-bank";
import { isoToPktInput } from "@/lib/attendance/rules";

export type BatchFeedbackSetup = {
  type: "course" | "workshop" | "webinar";
  questions: { text: string; type: "stars" | "video" }[];
  coverUrl: string | null;
};

/**
 * Makes sure one class has its own feedback session (and, for a course or
 * workshop, that the batch has its one feedback program). Idempotent: a class
 * that already has a feedback session is returned untouched.
 */
export async function ensureClassFeedback(
  pageId: string,
  sessionId: string,
  setup: BatchFeedbackSetup,
  actorProfileId: string | null,
): Promise<{ feedbackSessionId: string; slug: string }> {
  const admin = createAdminSupabase();

  const { data: cls, error: clsError } = await admin
    .from("batch_sessions")
    .select("id, number, title, speaker, starts_at, feedback_session_id")
    .eq("id", sessionId)
    .eq("page_id", pageId)
    .maybeSingle();
  if (clsError || !cls) throw new Error(clsError?.message ?? "Class not found.");

  if (cls.feedback_session_id) {
    const { data: existing } = await admin
      .from("feedback_sessions")
      .select("slug")
      .eq("id", cls.feedback_session_id)
      .maybeSingle();
    return { feedbackSessionId: cls.feedback_session_id, slug: existing?.slug ?? "" };
  }

  const { data: page, error: pageError } = await admin
    .from("landing_pages")
    .select("id, title, feedback_program_id")
    .eq("id", pageId)
    .maybeSingle();
  if (pageError || !page) throw new Error(pageError?.message ?? "Batch not found.");

  let programId: string | null = page.feedback_program_id ?? null;
  if (setup.type !== "webinar" && !programId) {
    const { data: program, error } = await admin
      .from("feedback_programs")
      .insert({ name: page.title, type: setup.type })
      .select("id")
      .single();
    if (error || !program) throw new Error(error?.message ?? "Could not create feedback program.");
    programId = program.id;
    await generateFeedbackShareToken("program", program.id, actorProfileId);
    const { error: linkError } = await admin
      .from("landing_pages")
      .update({ feedback_program_id: program.id })
      .eq("id", pageId);
    if (linkError) throw new Error(linkError.message);
  }

  const topic = (cls.title ?? "").trim();
  const created = await createFeedbackSession(
    {
      name: `${page.title} - ${topic || `Day ${cls.number}`}`,
      speakerName: (cls.speaker ?? "").trim() || "PZ Academy",
      sessionDate: isoToPktInput(cls.starts_at).slice(0, 10),
      questions: setup.questions,
      programId,
      programOrder: cls.number,
      randomizeSlug: true,
    },
    actorProfileId,
  );
  if (setup.coverUrl) await setFeedbackSessionCover(created.id, setup.coverUrl, actorProfileId);

  const { error: writeError } = await admin
    .from("batch_sessions")
    .update({ feedback_session_id: created.id })
    .eq("id", sessionId);
  if (writeError) throw new Error(writeError.message);

  return { feedbackSessionId: created.id, slug: created.slug };
}

/** Feedback session ids of a batch's classes, in class order (classes without one are left out). */
async function batchFeedbackSessionIds(pageId: string): Promise<string[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("batch_sessions")
    .select("number, feedback_session_id")
    .eq("page_id", pageId)
    .order("number", { ascending: true });
  return (data ?? []).flatMap((r) => (r.feedback_session_id ? [r.feedback_session_id] : []));
}

/** Questions of the batch's first feedback session, so classes added later match the rest. */
export async function batchQuestionSet(pageId: string): Promise<BatchFeedbackSetup["questions"]> {
  const [first] = await batchFeedbackSessionIds(pageId);
  if (!first) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_questions")
    .select("text, type, question_order")
    .eq("feedback_session_id", first)
    .order("question_order", { ascending: true });
  return (data ?? []).map((q) => ({ text: q.text, type: q.type }));
}

/** Creates feedback for every class that has none, reusing the batch's questions (bank fallback if it has none). */
export async function createMissingFeedback(
  pageId: string,
  actorProfileId: string | null,
): Promise<{ created: number }> {
  const admin = createAdminSupabase();
  const { data: page } = await admin
    .from("landing_pages")
    .select("feedback_program_id, class_cover_url")
    .eq("id", pageId)
    .maybeSingle();
  if (!page) throw new Error("Batch not found.");

  const { data: classes } = await admin
    .from("batch_sessions")
    .select("id, number, feedback_session_id")
    .eq("page_id", pageId)
    .order("number", { ascending: true });
  const missing = (classes ?? []).filter((c) => !c.feedback_session_id);
  if (missing.length === 0) return { created: 0 };

  let questions = await batchQuestionSet(pageId);
  if (questions.length === 0) {
    const bank = await getQuestionBank();
    questions = bank.slice(0, 3).map((q) => ({ text: q.text, type: q.type }));
  }

  // The program's own type is the only record of the batch type (spec call 11);
  // a batch with no program is a webinar and keeps getting none.
  let type: BatchFeedbackSetup["type"] = "webinar";
  if (page.feedback_program_id) {
    const { data: program } = await admin
      .from("feedback_programs")
      .select("type")
      .eq("id", page.feedback_program_id)
      .maybeSingle();
    if (program) type = program.type;
  }

  let created = 0;
  for (const c of missing) {
    await ensureClassFeedback(pageId, c.id, { type, questions, coverUrl: page.class_cover_url ?? null }, actorProfileId);
    created++;
  }
  return { created };
}

/** Replaces the questions on every class of the batch, except classes that already have responses. */
export async function applyQuestionsToBatch(
  pageId: string,
  questions: BatchFeedbackSetup["questions"],
  actorProfileId: string | null,
): Promise<{ updated: number; skipped: number }> {
  const ids = await batchFeedbackSessionIds(pageId);
  const admin = createAdminSupabase();
  let updated = 0;
  let skipped = 0;
  for (const id of ids) {
    const detail = await getFeedbackSessionDetail(id);
    if (!detail || detail.session.responseCount > 0) {
      skipped++;
      continue;
    }
    // Existing question ids are reused in order so rows are updated, not churned.
    const { data: existing } = await admin
      .from("feedback_questions")
      .select("id, question_order")
      .eq("feedback_session_id", id)
      .order("question_order", { ascending: true });
    const existingIds = (existing ?? []).map((q) => q.id);
    await updateFeedbackSessionQuestions(
      id,
      questions.map((q, i) => ({ id: existingIds[i], text: q.text, type: q.type })),
      actorProfileId,
    );
    updated++;
  }
  return { updated, skipped };
}

/** Sets (or clears) the batch cover on the page, its feedback program and every class's feedback session. */
export async function setBatchCover(
  pageId: string,
  coverUrl: string | null,
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { data: page, error } = await admin
    .from("landing_pages")
    .update({ class_cover_url: coverUrl })
    .eq("id", pageId)
    .select("feedback_program_id")
    .single();
  if (error || !page) throw new Error(error?.message ?? "Batch not found.");
  if (page.feedback_program_id) await setFeedbackProgramCover(page.feedback_program_id, coverUrl, actorProfileId);
  for (const id of await batchFeedbackSessionIds(pageId)) {
    await setFeedbackSessionCover(id, coverUrl, actorProfileId);
  }
}
