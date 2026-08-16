import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getQuestionBank, saveQuestionBank } from "@/lib/data/feedback-question-bank";

const saveSchema = z.array(z.object({
  text: z.string().min(1),
  type: z.enum(["stars", "video"]),
  order: z.number().int(),
  isMentorshipDefault: z.boolean(),
}));

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ questions: await getQuestionBank() });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await saveQuestionBank(parsed.data, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save question bank." }, { status: 400 });
  }
}
