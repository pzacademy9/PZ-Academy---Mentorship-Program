import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listFeedbackSessions, createFeedbackSession } from "@/lib/data/feedback-sessions";

const createSchema = z.object({
  name: z.string().min(1),
  speakerName: z.string().min(1),
  sessionDate: z.string().nullable().optional(),
  questions: z.array(z.object({ text: z.string().min(1), type: z.enum(["stars", "video"]) })).min(3).max(5),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ sessions: await listFeedbackSessions() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const result = await createFeedbackSession(parsed.data, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create session." }, { status: 400 });
  }
}
