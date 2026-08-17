import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import { cleanText, MAX_NAME_LEN } from "@/lib/validations/feedback";
import { createFeedbackSession, type FeedbackQuestionType } from "@/lib/data/feedback-sessions";

export type FeedbackProgramType = Database["public"]["Enums"]["feedback_program_type"];

export interface FeedbackProgramRow {
  id: string;
  name: string;
  type: FeedbackProgramType;
  coverUrl: string | null;
  sessionCount: number;
}

export async function listFeedbackPrograms(): Promise<FeedbackProgramRow[]> {
  const admin = createAdminSupabase();
  const { data: programs } = await admin
    .from("feedback_programs")
    .select("id, name, type, cover_url")
    .order("created_at", { ascending: false });
  const { data: sessions } = await admin.from("feedback_sessions").select("program_id");
  const countByProgram = new Map<string, number>();
  for (const s of sessions ?? []) {
    if (s.program_id) countByProgram.set(s.program_id, (countByProgram.get(s.program_id) ?? 0) + 1);
  }
  return (programs ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    coverUrl: p.cover_url,
    sessionCount: countByProgram.get(p.id) ?? 0,
  }));
}

const PROGRAM_COURSE_MIN = 5;

export interface CreateFeedbackProgramInput {
  name: string;
  type?: FeedbackProgramType;
  questions: { text: string; type: FeedbackQuestionType }[];
  sessions: { title: string; speaker: string; date?: string | null }[];
}

/** Creates the program row, then its member sessions via createFeedbackSession — same question set, sequential program_order. */
export async function createFeedbackProgram(
  input: CreateFeedbackProgramInput,
  actorProfileId: string | null,
): Promise<{ id: string; sessions: { id: string; slug: string }[] }> {
  const admin = createAdminSupabase();
  const name = cleanText(input.name, MAX_NAME_LEN);
  if (!name) throw new Error("Program name is required.");
  const sessions = input.sessions.filter((s) => cleanText(s.title, MAX_NAME_LEN).length > 0);
  if (sessions.length < 2) throw new Error("A program needs at least 2 sessions.");

  const type: FeedbackProgramType = input.type ?? (sessions.length >= PROGRAM_COURSE_MIN ? "course" : "workshop");

  const { data: program, error } = await admin
    .from("feedback_programs")
    .insert({ name, type })
    .select("id")
    .single();
  if (error || !program) throw new Error(error?.message ?? "Could not create program.");

  const created: { id: string; slug: string }[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const result = await createFeedbackSession(
      {
        name: `${name} — ${s.title}`,
        speakerName: s.speaker,
        sessionDate: s.date ?? null,
        questions: input.questions,
        programId: program.id,
        programOrder: i + 1,
      },
      actorProfileId,
    );
    created.push(result);
  }

  await logFeedbackAudit({ action: "createFeedbackProgram", detail: `${program.id} · ${name} · ${sessions.length} sessions`, actorProfileId });
  return { id: program.id, sessions: created };
}

export async function setFeedbackProgramCover(id: string, coverUrl: string | null, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_programs").update({ cover_url: coverUrl }).eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: coverUrl ? "setCoverImage" : "removeCoverImage", detail: id, actorProfileId });
}

/** Deletes the program row; member sessions cascade-delete via feedback_sessions.program_id ON DELETE SET NULL — sessions survive as standalone, matching "deleting a booking never destroys history" convention. Explicit delete-with-sessions is a future admin action, not this task's scope. */
export async function deleteFeedbackProgram(id: string, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_programs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "deleteFeedbackProgram", detail: id, actorProfileId });
}
