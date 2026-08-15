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

  await admin.from("feedback_question_bank").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (clean.length > 0) {
    await admin.from("feedback_question_bank").insert(clean);
  }
  await logFeedbackAudit({ action: "saveQuestionBank", detail: `${clean.length} questions`, actorProfileId });
}
