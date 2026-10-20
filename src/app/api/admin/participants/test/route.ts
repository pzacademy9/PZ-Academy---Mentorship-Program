import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendTestToMe } from "@/lib/data/participant-sends";
import { testBodySchema } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

/** Sends a sample to the signed-in admin only. The address comes from the session, never the body. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const toEmail = auth.user.email;
  if (!toEmail) return NextResponse.json({ error: "Your account has no email address" }, { status: 400 });
  const parsed = testBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const result = await sendTestToMe({ pageId: parsed.data.pageId, subject: parsed.data.subject, body: parsed.data.body, toEmail });
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Test send failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
