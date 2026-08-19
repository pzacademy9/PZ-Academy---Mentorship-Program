import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  setFeedbackSessionStatus,
  setFeedbackSessionMentor,
  updateFeedbackSessionDetails,
  updateFeedbackSessionQuestions,
  deleteFeedbackSession,
} from "@/lib/data/feedback-sessions";
import { MAX_NAME_LEN, MAX_QUESTION_LEN } from "@/lib/validations/feedback";

const questionSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(MAX_QUESTION_LEN),
  type: z.enum(["stars", "video"]),
});

const patchSchema = z
  .object({
    status: z.enum(["active", "closed"]).optional(),
    mentorId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(MAX_NAME_LEN).optional(),
    speakerName: z.string().trim().min(1).max(MAX_NAME_LEN).optional(),
    sessionDate: z.string().nullable().optional(),
    questions: z.array(questionSchema).min(3).max(5).optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.mentorId !== undefined ||
      v.name !== undefined ||
      v.speakerName !== undefined ||
      v.sessionDate !== undefined ||
      v.questions !== undefined,
    { message: "No changes provided" },
  )
  .refine(
    (v) => {
      const any = v.name !== undefined || v.speakerName !== undefined || v.sessionDate !== undefined;
      const all = v.name !== undefined && v.speakerName !== undefined && v.sessionDate !== undefined;
      return !any || all;
    },
    { message: "name, speakerName, and sessionDate must be provided together" },
  );

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    // questions is the only branch that can reject (an answered question can't be
    // removed/retyped) — it must run first, or a rejection here would leave an
    // earlier branch's write already committed.
    if (parsed.data.questions !== undefined) {
      await updateFeedbackSessionQuestions(id, parsed.data.questions, auth.user.id);
    }
    if (parsed.data.status !== undefined) await setFeedbackSessionStatus(id, parsed.data.status, auth.user.id);
    if (parsed.data.mentorId !== undefined) await setFeedbackSessionMentor(id, parsed.data.mentorId, auth.user.id);
    if (parsed.data.name !== undefined) {
      await updateFeedbackSessionDetails(
        id,
        { name: parsed.data.name, speakerName: parsed.data.speakerName!, sessionDate: parsed.data.sessionDate ?? null },
        auth.user.id,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not update session." }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    await deleteFeedbackSession(id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete session." }, { status: 400 });
  }
}
