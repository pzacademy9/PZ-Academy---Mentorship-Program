import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { previewRecipients } from "@/lib/data/audience-preview";
import { recipientsBodySchema } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = recipientsBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json(await previewRecipients(parsed.data));
  } catch (e) {
    console.error("participants recipients failed", e);
    return NextResponse.json({ error: "Could not build the list of people" }, { status: 500 });
  }
}
