import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import { cleanText, MAX_QUESTION_LEN } from "@/lib/validations/feedback";

export type FeedbackQuestionType = Database["public"]["Enums"]["feedback_question_type"];

export interface QuestionBankEntry {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  order: number;
  isMentorshipDefault: boolean;
}

function toEntry(row: {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  default_order: number;
  is_mentorship_default: boolean;
}): QuestionBankEntry {
  return { id: row.id, text: row.text, type: row.type, order: row.default_order, isMentorshipDefault: row.is_mentorship_default };
}

export async function getQuestionBank(): Promise<QuestionBankEntry[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_question_bank")
    .select("id, text, type, default_order, is_mentorship_default")
    .order("default_order", { ascending: true });
  return (data ?? []).map(toEntry);
}

/** The default question set cloned onto a 1:1 mentorship session's auto-created feedback_sessions row. */
export async function getMentorshipDefaultQuestions(): Promise<QuestionBankEntry[]> {
  const all = await getQuestionBank();
  return all.filter((q) => q.isMentorshipDefault);
}

/** Full-replace: clears the bank and re-inserts. Matches the old system's saveQuestionBank semantics. */
export async function saveQuestionBank(
  entries: { text: string; type: FeedbackQuestionType; order: number; isMentorshipDefault: boolean }[],
  actorProfileId: string,
): Promise<void> {
  const admin = createAdminSupabase();
  const clean = entries
    .map((e) => ({
      text: cleanText(e.text, MAX_QUESTION_LEN),
      type: e.type,
      default_order: e.order,
      is_mentorship_default: e.isMentorshipDefault,
    }))
    .filter((e) => e.text.length > 0);

  // Insert-then-delete, not delete-then-insert: capture the currently-live
  // row ids up front, insert the new set, and only delete the old rows once
  // the insert has actually succeeded. If the insert throws partway (or the
  // request drops), the old rows are still there — the bank is never left
  // empty by a failed write. A wiped bank silently disables the mentorship
  // feedback tie-in (freezeMentorshipFeedbackSession skips freezing once
  // is_mentorship_default rows drop below 3), so leaving stale rows behind
  // on failure is strictly safer than a transient empty table.
  const { data: existingRows, error: existingError } = await admin.from("feedback_question_bank").select("id");
  if (existingError) throw new Error(existingError.message);
  const existingIds = (existingRows ?? []).map((r) => r.id);

  if (clean.length > 0) {
    const { error: insertError } = await admin.from("feedback_question_bank").insert(clean);
    if (insertError) throw new Error(insertError.message);
  }

  if (existingIds.length > 0) {
    const { error: deleteError } = await admin.from("feedback_question_bank").delete().in("id", existingIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  await logFeedbackAudit({ action: "saveQuestionBank", detail: `${clean.length} questions`, actorProfileId });
}
