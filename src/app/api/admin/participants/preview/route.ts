import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { previewSend } from "@/lib/data/participant-sends";
import { previewBodySchema } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = previewBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json(await previewSend(parsed.data));
  } catch (e) {
    console.error("participants preview failed", e);
    return NextResponse.json({ error: "Could not build the preview" }, { status: 500 });
  }
}
