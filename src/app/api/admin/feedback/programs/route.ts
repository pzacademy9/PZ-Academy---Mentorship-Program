import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listFeedbackPrograms, createFeedbackProgram } from "@/lib/data/feedback-programs";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["workshop", "course"]).optional(),
  questions: z.array(z.object({ text: z.string().min(1), type: z.enum(["stars", "video"]) })).min(3).max(5),
  sessions: z.array(z.object({ title: z.string().min(1), speaker: z.string().min(1), date: z.string().nullable().optional() })).min(2),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ programs: await listFeedbackPrograms() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const result = await createFeedbackProgram(parsed.data, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create program." }, { status: 400 });
  }
}
